const { logger } = require('../utils/logger');
const { ValidationError, ExternalServiceError } = require('../utils/errorHandler');
const GenAIOrchestrator = require('../services/genaiOrchestrator');
const ContentAnalyzerAgent = require('../services/agents/contentAnalyzer');
const LocalizationEngine = require('../services/agents/localizationEngine');
const MarketResearcherAgent = require('../services/agents/marketResearcher');
const QualityValidator = require('../services/agents/qualityValidator');
const FactChecker = require('../services/factChecker');
const OutputFormatter = require('../services/agents/outputFormatter');
const PitchEmailExtractor = require('../services/agents/pitchEmailExtractor');
const ComprehensiveDataExtractor = require('../services/agents/comprehensiveDataExtractor');
const FileRetrievalService = require('../services/shared/fileRetrievalService');

// Quality Assurance Agents - ONLY EXISTING AGENTS (1 of 8)
const ConsistencyChecker = require('../services/agents/consistencyChecker');

// Market Intelligence Agents - ONLY EXISTING AGENTS (0 of 6 - all missing)
// NOTE: All 6 market intelligence agents are missing from filesystem

// Compliance & Regulatory Agents - ONLY EXISTING AGENTS (1 of 5)
const RegulatoryComplianceChecker = require('../services/agents/regulatoryComplianceChecker');

// Source Validation Agents - ONLY EXISTING AGENTS (1 of 4)
const RecencyValidator = require('../services/agents/recencyValidator');

// Fact-Checking Agents - ONLY EXISTING AGENTS (6 of 7)
const ConfidenceScorer = require('../services/factChecking/agents/ConfidenceScorer');
const CrossMarketValidator = require('../services/factChecking/agents/CrossMarketValidator');
const RealTimeDataVerifier = require('../services/factChecking/agents/RealTimeDataVerifier');
const SemanticValidator = require('../services/factChecking/agents/SemanticValidator');
const SourceTracker = require('../services/factChecking/agents/SourceTracker');
const StatisticalChecker = require('../services/factChecking/agents/StatisticalChecker');
// NOTE: Using RealTimeDataVerifier.js (not RealTimeDataVerifier-FIXED.js)
const { EmailComposer } = require('../services/emailComposer'); // Import EmailComposer
const marketDataService = require('../services/marketData');
const trustedDataService = require('../services/trustedData');
const firecrawlService = require('../services/firecrawl');
const perplexityService = require('../services/perplexityService'); // CRITICAL FIX: Add missing Perplexity service import
const DataLineageService = require('../services/dataLineageService'); // CRITICAL FIX: Correct import for default export

/**
 * Content Generation Controller
 * Handles API endpoints for the content generation workflow
 * 
 * Features:
 * - POST /api/v1/content/generate - Generate localized PR variants
 * - GET /api/v1/content/jobs/:jobId - Get generation job status
 * - POST /api/v1/content/validate - Validate generated content
 * - Integration with GenAI Orchestrator from Phase 3A
 */
class ContentGenerationController {
  constructor() {
    this.name = 'Content Generation Controller';
    this.genaiOrchestrator = new GenAIOrchestrator();
    
    // Initialize DataLineageService first so it can be injected into agents
    this.dataLineageService = new DataLineageService(); // CRITICAL FIX: Create DataLineageService instance
    
    // Initialize agents with lineage service injection
    this.contentAnalyzer = new ContentAnalyzerAgent(null, null, this.dataLineageService);
    this.localizationEngine = new LocalizationEngine(null, null, this.dataLineageService);
    this.marketResearcher = new MarketResearcherAgent(null, null, this.dataLineageService);
    this.qualityValidator = new QualityValidator(null, null, this.dataLineageService);
    this.factChecker = new FactChecker(this.dataLineageService); // CRITICAL: Inject lineage service for comprehensive tracking
    this.outputFormatter = new OutputFormatter(null, null, this.dataLineageService);
    this.pitchEmailExtractor = new PitchEmailExtractor(null, null, this.dataLineageService);
    this.comprehensiveDataExtractor = new ComprehensiveDataExtractor(null, null, this.dataLineageService);

    // Quality Assurance Agents - ONLY EXISTING AGENTS (1 of 8)
    this.consistencyChecker = new ConsistencyChecker(null, null, this.dataLineageService);

    // Market Intelligence Agents - ONLY EXISTING AGENTS (0 of 6)
    // NOTE: All 6 market intelligence agents are missing from filesystem

    // Compliance & Regulatory Agents - ONLY EXISTING AGENTS (1 of 5)
    this.regulatoryComplianceChecker = new RegulatoryComplianceChecker({
      enableFairHousingValidation: true,
      enableDisclosureValidation: true,
      enableComplianceChecking: true
    }, null, this.dataLineageService);

    // Source Validation Agents - ONLY EXISTING AGENTS (1 of 4)
    this.recencyValidator = new RecencyValidator(null, null, this.dataLineageService);

    // Fact-Checking Agents - ONLY EXISTING AGENTS (6 of 7)
    this.confidenceScorer = new ConfidenceScorer({
      baseConfidence: 0.5,
      enableWeightedScoring: true,
      enableMultiFactorAnalysis: true
    }, null, this.dataLineageService);
    this.crossMarketValidator = new CrossMarketValidator({
      enableCrossValidation: true,
      minimumMarkets: 2
    }, null, this.dataLineageService);
    this.realTimeDataVerifier = new RealTimeDataVerifier({
      enableRealTimeValidation: true,
      timeout: 30000
    }, null, this.dataLineageService);
    this.semanticValidator = new SemanticValidator({
      enableSemanticAnalysis: true,
      confidenceThreshold: 0.7
    }, null, this.dataLineageService);
    this.sourceTracker = new SourceTracker({
      enableSourceTracking: true,
      maxSources: 10
    }, null, this.dataLineageService);
    this.statisticalChecker = new StatisticalChecker({
      enableStatisticalValidation: true,
      confidenceLevel: 0.95
    }, null, this.dataLineageService);
    this.emailComposer = new EmailComposer(); // Create EmailComposer instance
    this.fileRetrieval = new FileRetrievalService(); // SHARED: File retrieval service
    this.marketDataService = marketDataService; // Use singleton instance
    this.trustedDataService = trustedDataService;
    this.firecrawlService = firecrawlService;
    this.perplexityService = perplexityService; // CRITICAL FIX: Add Perplexity service instantiation
    this.isInitialized = false;

    // Controller configuration
    this.config = {
      maxContentLength: 50000,
      maxMarkets: 100,
      defaultTimeout: 600000, // 10 minutes
      supportedFormats: ['json', 'txt', 'html', 'docx', 'pdf', 'pitch', 'narrative'],
      validationModes: ['strict', 'standard', 'lenient'],
      supportedDataSources: ['trusted', 'crawler', 'ai'] // Updated data source options: crawler=Firecrawl, ai=Perplexity
    };

    // Job storage for tracking active jobs
    this.activeJobs = new Map();

    logger.info('Content Generation Controller created', {
      supportedFormats: this.config.supportedFormats,
      validationModes: this.config.validationModes
    });
  }

  /**
   * Initialize the controller and its dependencies
   */
  async initialize() {
    console.log('=== INITIALIZATION CALLED ===');
    console.log('Current time:', new Date().toISOString());
    
    // Add defensive programming to handle logger issues
    let loggerAvailable = true;
    try {
      console.log('About to call logger.info...');
      logger.info('🔄 Starting Content Generation Controller initialization...');
    } catch (loggerError) {
      console.error('Logger initialization failed:', loggerError.message);
      loggerAvailable = false;
    }

    const log = (level, message, data = {}) => {
      if (loggerAvailable) {
        try {
          logger[level](message, data);
        } catch (e) {
          console.log(`[${level.toUpperCase()}] ${message}`, data);
        }
      } else {
        console.log(`[${level.toUpperCase()}] ${message}`, data);
      }
    };

    try {
      // Initialize market data service with error handling
      try {
        log('info', '📊 Initializing Market Data Service...');
        if (this.marketDataService && typeof this.marketDataService.initialize === 'function') {
          await this.marketDataService.initialize();
          log('info', '✅ Market Data Service initialized successfully');
        } else {
          log('warn', '⚠️ Market Data Service not available or missing initialize method');
        }
      } catch (error) {
        log('warn', '⚠️ Market Data Service initialization failed - will operate with limited functionality', {
          error: error.message
        });
        // Don't throw error - continue with degraded functionality
      }

      // Initialize trusted data service with error handling
      try {
        log('info', '📊 Initializing Trusted Data Service...');
        if (this.trustedDataService && typeof this.trustedDataService.initialize === 'function') {
          await this.trustedDataService.initialize();
          log('info', '✅ Trusted Data Service initialized successfully');
        } else {
          log('warn', '⚠️ Trusted Data Service not available or missing initialize method');
        }
      } catch (error) {
        log('warn', '⚠️ Trusted Data Service initialization failed - will operate without trusted data', {
          error: error.message
        });
        // Don't throw error - trusted data is optional
      }

      // Initialize firecrawl service with error handling
      try {
        log('info', '🔥 Initializing Firecrawl Service...');
        if (this.firecrawlService && typeof this.firecrawlService.initialize === 'function') {
          await this.firecrawlService.initialize();
          log('info', '✅ Firecrawl Service initialized successfully');
        } else {
          log('warn', '⚠️ Firecrawl Service not available or missing initialize method');
        }
      } catch (error) {
        log('warn', '⚠️ Firecrawl Service initialization failed - will operate without web scraping', {
          error: error.message
        });
        // Don't throw error - firecrawl is optional
      }

      // Initialize data lineage service with error handling
      try {
        log('info', '📊 Initializing Data Lineage Service...');
        if (this.dataLineageService && typeof this.dataLineageService.initialize === 'function') {
          await this.dataLineageService.initialize();
          log('info', '✅ Data Lineage Service initialized successfully');
        } else {
          log('warn', '⚠️ Data Lineage Service not available or missing initialize method');
        }
      } catch (error) {
        log('warn', '⚠️ Data Lineage Service initialization failed - will operate without lineage tracking', {
          error: error.message
        });
        // Don't throw error - lineage tracking is optional
      }

      // Initialize agents one by one with detailed logging and error handling
      const agents = [
        { name: 'Content Analyzer', instance: this.contentAnalyzer },
        { name: 'Localization Engine', instance: this.localizationEngine },
        { name: 'Market Researcher', instance: this.marketResearcher },
        { name: 'Quality Validator', instance: this.qualityValidator },
        { name: 'Fact Checker', instance: this.factChecker },
        { name: 'Output Formatter', instance: this.outputFormatter },
        { name: 'Pitch Email Extractor', instance: this.pitchEmailExtractor },
        { name: 'Comprehensive Data Extractor', instance: this.comprehensiveDataExtractor }
      ];

      let successfulAgents = 0;
      for (const agent of agents) {
        try {
          log('info', `🤖 Initializing ${agent.name}...`);
          if (agent.instance && typeof agent.instance.initialize === 'function') {
            await agent.instance.initialize();
            log('info', `✅ ${agent.name} initialized successfully`);
            successfulAgents++;
          } else {
            log('warn', `⚠️ ${agent.name} not available or missing initialize method`);
          }
        } catch (error) {
          log('warn', `⚠️ Failed to initialize ${agent.name} - will operate with reduced functionality`, {
            agentName: agent.name,
            error: error.message
          });
          // Don't throw error - continue with other agents
        }
      }

      log('info', `🤖 Agent initialization completed: ${successfulAgents}/${agents.length} agents initialized`);

      // Initialize orchestrator with agents and data sources
      try {
        log('info', '🎯 Initializing GenAI Orchestrator...');
        if (this.genaiOrchestrator && typeof this.genaiOrchestrator.initialize === 'function') {
          await this.genaiOrchestrator.initialize({
            contentAnalyzer: this.contentAnalyzer,
            localizationEngine: this.localizationEngine,
            marketResearcher: this.marketResearcher,
            qualityValidator: this.qualityValidator,
            outputFormatter: this.outputFormatter,
            pitchEmailExtractor: this.pitchEmailExtractor,
            comprehensiveDataExtractor: this.comprehensiveDataExtractor,

            // Quality Assurance Agents - ONLY EXISTING AGENTS (1 of 8)
            consistencyChecker: this.consistencyChecker,

            // Market Intelligence Agents - ONLY EXISTING AGENTS (0 of 6)
            // NOTE: All 6 market intelligence agents are missing from filesystem

            // Compliance & Regulatory Agents - ONLY EXISTING AGENTS (1 of 5)
            regulatoryComplianceChecker: this.regulatoryComplianceChecker,

            // Source Validation Agents - ONLY EXISTING AGENTS (1 of 4)
            recencyValidator: this.recencyValidator,

            // Fact-Checking Agents - ONLY EXISTING AGENTS (6 of 7)
            confidenceScorer: this.confidenceScorer,
            crossMarketValidator: this.crossMarketValidator,
            realTimeDataVerifier: this.realTimeDataVerifier,
            semanticValidator: this.semanticValidator,
            sourceTracker: this.sourceTracker,
            statisticalChecker: this.statisticalChecker
          }, {
            trustedDataService: this.trustedDataService,
            firecrawlService: this.firecrawlService,
            marketDataService: this.marketDataService,
            perplexityService: this.perplexityService,
            dataLineageService: this.dataLineageService
          });
          log('info', '✅ GenAI Orchestrator initialized successfully');
        } else {
          log('error', '❌ GenAI Orchestrator not available or missing initialize method');
          throw new Error('GenAI Orchestrator is required but not available');
        }
      } catch (error) {
        log('error', '❌ Failed to initialize GenAI Orchestrator', {
          error: error.message,
          stack: error.stack
        });
        throw new Error(`GenAI Orchestrator initialization failed: ${error.message}`);
      }

      this.isInitialized = true;
      log('info', '🎉 Content Generation Controller initialized successfully - All systems ready!');
      console.log('=== INITIALIZATION COMPLETED SUCCESSFULLY ===');
      return true;
    } catch (error) {
      const errorMessage = `Content Generation Controller initialization failed: ${error.message}`;
      log('error', '💥 CRITICAL: Content Generation Controller initialization failed', {
        error: error.message,
        stack: error.stack,
        isInitialized: this.isInitialized
      });
      console.error('=== INITIALIZATION FAILED ===', error);
      
      // Reset initialization state on failure
      this.isInitialized = false;
      throw new Error(errorMessage);
    }
  }

  /**
   * Generate localized PR variants
   * POST /api/v1/content/generate
   */
  async generateContent(req, res) {
    try {
      // CRITICAL DEBUG: Test if this method is being called at all
      console.log('=== GENERATECONTENT METHOD CALLED ===');
      console.log('Request body keys:', Object.keys(req.body));
      console.log('Request body formats:', req.body.formats);
      
      // 🔍 PERPLEXITY PARAMETER TRACING: Log original request parameters
      logger.info('🔍 PERPLEXITY PARAMETER TRACING: Original request received', {
        timestamp: new Date().toISOString(),
        originalDataSource: req.body.dataSource,
        originalDataSourceType: typeof req.body.dataSource,
        originalDataSourceExists: 'dataSource' in req.body,
        allBodyKeys: Object.keys(req.body),
        bodyDataSourceValue: req.body.dataSource,
        requestBodyStringified: JSON.stringify(req.body, null, 2)
      });
      
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      // Validate request
      const validationResult = this._validateGenerationRequest(req.body);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Invalid request',
          message: validationResult.message,
          details: validationResult.errors
        });
      }

      // DEBUG: Log the entire request body first
      logger.info('PITCH DEBUG: Full request body analysis', {
        bodyKeys: Object.keys(req.body),
        bodyFormats: req.body.formats,
        bodyFormatsType: typeof req.body.formats,
        bodyFormatsIsArray: Array.isArray(req.body.formats),
        fullBody: JSON.stringify(req.body, null, 2)
      });

      // 🔍 PERPLEXITY PARAMETER TRACING: Log BEFORE destructuring
      logger.info('🔍 PERPLEXITY PARAMETER TRACING: Before destructuring', {
        timestamp: new Date().toISOString(),
        beforeDestructuringDataSource: req.body.dataSource,
        beforeDestructuringDataSourceType: typeof req.body.dataSource
      });

      const {
        masterPR,
        markets = [],
        options = {},
        formats,
        dataSource // FIXED: No default value - preserve original parameter
      } = req.body;

      // 🔧 PERPLEXITY FIX: Respect the provided dataSource parameter, only default if not provided
      const finalDataSource = dataSource !== undefined ? dataSource : 'crawler';

      // 🔍 PERPLEXITY PARAMETER TRACING: Log AFTER destructuring and fix
      logger.info('🔍 PERPLEXITY PARAMETER TRACING: After destructuring and fix', {
        timestamp: new Date().toISOString(),
        afterDestructuringDataSource: dataSource,
        afterDestructuringDataSourceType: typeof dataSource,
        finalDataSource: finalDataSource,
        finalDataSourceType: typeof finalDataSource,
        originalRequestDataSource: req.body.dataSource,
        wasDataSourceOverridden: req.body.dataSource !== dataSource,
        wasDataSourceFixed: dataSource !== finalDataSource,
        destructuringResult: {
          masterPR: masterPR ? `${masterPR.length} characters` : 'undefined',
          marketsCount: markets.length,
          optionsKeys: Object.keys(options),
          formats: formats,
          originalDataSource: dataSource,
          finalDataSource: finalDataSource
        }
      });

      // 🚨 CRITICAL BUG DETECTION: Alert if dataSource was overridden
      if (req.body.dataSource && req.body.dataSource !== dataSource) {
        logger.error('🚨 CRITICAL BUG DETECTED: dataSource parameter was overridden during destructuring!', {
          timestamp: new Date().toISOString(),
          originalDataSource: req.body.dataSource,
          overriddenDataSource: dataSource,
          bugLocation: 'contentGeneration.js:generateContent destructuring',
          impact: 'Perplexity AI will not be used even when requested'
        });
      }

      // 🔧 PERPLEXITY FIX CONFIRMATION: Log the fix applied
      logger.info('🔧 PERPLEXITY FIX CONFIRMATION: Parameter routing fixed', {
        timestamp: new Date().toISOString(),
        originalRequestDataSource: req.body.dataSource,
        destructuredDataSource: dataSource,
        finalDataSourceUsed: finalDataSource,
        fixApplied: dataSource !== finalDataSource,
        perplexityWillBeUsed: finalDataSource === 'ai'
      });

      // DEBUG: Log destructuring results
      logger.info('PITCH DEBUG: Destructuring results', {
        extractedFormats: formats,
        extractedFormatsType: typeof formats,
        extractedFormatsIsArray: Array.isArray(formats),
        extractedOptions: options,
        extractedOptionsType: typeof options
      });

      // Include formats in options if provided at top level
      if (formats && Array.isArray(formats)) {
        options.formats = formats;
        logger.info('PITCH DEBUG: Added formats to options', {
          addedFormats: formats,
          updatedOptions: options
        });
      } else {
        logger.info('PITCH DEBUG: Formats not added to options', {
          formatsValue: formats,
          formatsExists: !!formats,
          formatsIsArray: Array.isArray(formats),
          reason: !formats ? 'formats is falsy' : !Array.isArray(formats) ? 'formats is not array' : 'unknown'
        });
      }

      // DEBUG: Log the final options object
      logger.info('PITCH DEBUG: Final options object', {
        finalOptions: options,
        finalOptionsFormats: options.formats,
        finalOptionsKeys: Object.keys(options)
      });

      // Process markets - handle both array and string formats
      const processedMarkets = await this._processMarkets(markets);

      const requestId = this._generateRequestId();
      
      // CRITICAL FIX: Set up agent lineage tracking context
      logger.info('🔗 Setting up agent lineage tracking context', {
        requestId,
        agentCount: 6,
        lineageServiceAvailable: !!this.dataLineageService
      });
      
      // Set job context for all agents to enable lineage tracking
      const agents = [
        this.contentAnalyzer,
        this.localizationEngine,
        this.marketResearcher,
        this.qualityValidator,
        this.outputFormatter,
        this.pitchEmailExtractor
      ];
      
      for (const agent of agents) {
        if (agent && typeof agent.setJobContext === 'function') {
          agent.setJobContext(requestId, `data_${requestId}`);
          logger.info(`🔗 Job context set for ${agent.name || agent.constructor.name}`, {
            requestId,
            agentName: agent.name || agent.constructor.name
          });
        } else {
          logger.warn(`⚠️ Agent missing setJobContext method: ${agent?.name || agent?.constructor?.name || 'unknown'}`);
        }
      }
      
      logger.info('Content generation request received', {
        requestId,
        masterPRLength: masterPR.length,
        marketCount: processedMarkets.length,
        originalMarkets: markets,
        processedMarkets,
        options,
        dataSource: finalDataSource // FIXED: Use finalDataSource instead of dataSource
      });

      // Start generation process with data source specification
      // CRITICAL FIX: Spread options first, then override dataSource to ensure it's not lost
      const generationResult = await this.genaiOrchestrator.generatePRVariants(masterPR, {
        ...options,  // Spread options first
        markets: processedMarkets,  // Then add/override with explicit values
        requestId,
        dataSource: finalDataSource // CRITICAL: This must come AFTER options spread to override any nested dataSource
      });

      // Log successful generation
      logger.info('Content generation completed', {
        requestId,
        jobId: generationResult.jobId,
        variantsGenerated: generationResult.metadata?.variantsGenerated || 0,
        duration: generationResult.metadata?.duration || 0
      });

      // CRITICAL FIX: Since job processing is asynchronous, we need to wait for completion
      // or return the job ID for status polling
      let variants = [];
      let jobStatus = generationResult.status;
      
      // If job is processing asynchronously, wait a moment and check status
      if (generationResult.status === 'processing') {
        logger.info('Job is processing asynchronously, checking for quick completion', {
          jobId: generationResult.jobId,
          requestId
        });
        
        // Wait a short time to see if job completes quickly
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const updatedStatus = await this.genaiOrchestrator.getJobStatus(generationResult.jobId);
          if (updatedStatus && updatedStatus.status === 'completed' && updatedStatus.results) {
            jobStatus = 'completed';
            variants = await this._extractVariantDataFromResults(generationResult.jobId, updatedStatus.results);
            logger.info('Job completed quickly, including variants in response', {
              jobId: generationResult.jobId,
              variantCount: variants?.length || 0
            });
          }
        } catch (statusError) {
          logger.warn('Could not check updated job status', {
            jobId: generationResult.jobId,
            error: statusError.message
          });
        }
      } else if (generationResult.status === 'completed' && generationResult.results) {
        variants = await this._extractVariantDataFromResults(generationResult.jobId, generationResult.results);
      }

      // CRITICAL: Job ID Response Diagnostic Logging
      console.log(`🔍 JOB_ID_TRACE: Sending job ID to frontend: ${generationResult.jobId}`, {
        generationResultJobId: generationResult.jobId,
        status: jobStatus,
        requestId,
        timestamp: new Date().toISOString()
      });

      // Return response with actual variant data if available
      res.status(200).json({
        success: true,
        requestId,
        duration: Date.now() - Date.now(), // Will be updated by actual duration
        result: {
          jobId: generationResult.jobId,
          status: jobStatus,
          success: true,
          variants: variants, // Include actual variant data with validation scores
          metadata: {
            processedAt: new Date().toISOString(),
            marketCount: (markets || []).length,
            dataSource: finalDataSource,
            originalJobId: generationResult.jobId
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Content generation failed', {
        error: error.message,
        stack: error.stack,
        requestBody: req.body
      });

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message
        });
      }

      if (error instanceof ExternalServiceError) {
        return res.status(502).json({
          error: 'Service Error',
          message: error.message,
          service: error.service
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Content generation failed due to an internal error'
      });
    }
  }

  /**
   * Get generation job status
   * GET /api/v1/content/jobs/:jobId
   */
  async getJobStatus(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json({
          error: 'Missing job ID',
          message: 'Job ID is required'
        });
      }

      logger.debug('Job status request', { jobId });

      // Get job status from orchestrator
      const jobStatus = await this.genaiOrchestrator.getJobStatus(jobId);

      // DIAGNOSTIC LOGGING: Job status analysis
      logger.info('🔍 DIAGNOSTIC: Job status retrieved from orchestrator', {
        jobId,
        hasJobStatus: !!jobStatus,
        jobStatusType: typeof jobStatus,
        jobStatusKeys: jobStatus ? Object.keys(jobStatus) : null,
        status: jobStatus?.status,
        hasResults: !!(jobStatus && jobStatus.results),
        resultsType: jobStatus?.results ? typeof jobStatus.results : null,
        resultsKeys: jobStatus?.results ? Object.keys(jobStatus.results) : null,
        jobStatusStructure: jobStatus ? JSON.stringify(jobStatus, null, 2) : 'null'
      });

      // Extract variant data with validation results if job is completed
      let variants = null;
      if (jobStatus.status === 'completed' && jobStatus.results) {
        logger.info('🔍 DIAGNOSTIC: Job completed, attempting variant extraction', {
          jobId,
          status: jobStatus.status,
          hasResults: !!jobStatus.results,
          resultsStructure: jobStatus.results
        });
        variants = await this._extractVariantDataFromResults(jobId, jobStatus.results);
      } else {
        logger.warn('🚨 DIAGNOSTIC: Job not completed or no results', {
          jobId,
          status: jobStatus?.status,
          hasResults: !!(jobStatus && jobStatus.results),
          reason: !jobStatus ? 'No job status' :
                  jobStatus.status !== 'completed' ? `Status is ${jobStatus.status}` :
                  'No results in job status'
        });
      }

      // Enhance status with additional metadata
      const enhancedStatus = {
        ...jobStatus,
        metadata: {
          ...jobStatus.metadata,
          retrievedAt: new Date().toISOString(),
          elapsedTime: jobStatus.startTime
            ? Date.now() - jobStatus.startTime
            : null
        },
        variants: variants, // Include actual variant data with validation scores
        _links: {
          self: `/api/v1/content/jobs/${jobId}`,
          generate: `/api/v1/content/generate`,
          validate: `/api/v1/content/validate`
        }
      };

      res.status(200).json(enhancedStatus);

    } catch (error) {
      logger.error('Failed to get job status', {
        jobId: req.params.jobId,
        error: error.message
      });

      if (error instanceof ValidationError) {
        return res.status(404).json({
          error: 'Job Not Found',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve job status'
      });
    }
  }

  /**
   * Validate generated content
   * POST /api/v1/content/validate
   */
  async validateContent(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      // Validate request
      const validationResult = this._validateValidationRequest(req.body);
      if (!validationResult.valid) {
        return res.status(400).json({
          error: 'Invalid request',
          message: validationResult.message,
          details: validationResult.errors
        });
      }

      const {
        content,
        market,
        validationMode = 'standard',
        includeFactCheck = true,
        options = {}
      } = req.body;

      const requestId = this._generateRequestId();

      logger.info('Content validation request received', {
        requestId,
        market,
        validationMode,
        includeFactCheck,
        contentLength: content?.length || 0
      });

      // Prepare validation input
      const variants = [{
        market,
        content,
        metadata: {
          validationRequestId: requestId,
          submittedAt: new Date().toISOString()
        }
      }];

      // Perform quality validation
      const qualityValidation = await this.qualityValidator.validate(variants, {
        strictMode: validationMode === 'strict',
        requestId
      });

      let factCheckResult = null;
      if (includeFactCheck) {
        // Perform fact checking
        factCheckResult = await this.factChecker.factCheck(content, {
          market
        }, {
          strictMode: validationMode === 'strict',
          requestId
        });
      }

      // Compile validation report
      const validationReport = this._compileValidationReport({
        qualityValidation,
        factCheckResult,
        validationMode,
        requestId,
        market
      });

      logger.info('Content validation completed', {
        requestId,
        market,
        overallScore: validationReport.overall.score,
        status: validationReport.overall.status
      });

      res.status(200).json({
        success: true,
        validation: validationReport,
        metadata: {
          requestId,
          market,
          validationMode,
          includeFactCheck,
          processedAt: new Date().toISOString()
        },
        _links: {
          self: `/api/v1/content/validate`,
          generate: `/api/v1/content/generate`
        }
      });

    } catch (error) {
      logger.error('Content validation failed', {
        error: error.message,
        stack: error.stack,
        requestBody: req.body
      });

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Content validation failed due to an internal error'
      });
    }
  }

  /**
   * Get controller status and health
   * GET /api/v1/content/status
   */
  async getStatus(req, res) {
    try {
      const status = {
        service: 'Content Generation Controller',
        initialized: this.isInitialized,
        timestamp: new Date().toISOString(),
        configuration: {
          maxContentLength: this.config.maxContentLength,
          maxMarkets: this.config.maxMarkets,
          supportedFormats: this.config.supportedFormats,
          validationModes: this.config.validationModes,
          supportedDataSources: this.config.supportedDataSources
        },
        agents: {
          orchestrator: this.genaiOrchestrator.getMetrics(),
          localizationEngine: this.localizationEngine.getStatus(),
          marketResearcher: this.marketResearcher.getStatus(),
          qualityValidator: this.qualityValidator.getStatus(),
          factChecker: this.factChecker.getStatus(),
          outputFormatter: this.outputFormatter.getStatus()
        },
        endpoints: {
          generate: '/api/v1/content/generate',
          jobStatus: '/api/v1/content/jobs/:jobId',
          validate: '/api/v1/content/validate',
          download: '/api/v1/content/download/:jobId',
          preview: '/api/v1/content/preview/:jobId/:market',
          regenerate: '/api/v1/content/regenerate',
          status: '/api/v1/content/status'
        }
      };

      res.status(200).json(status);

    } catch (error) {
      logger.error('Failed to get controller status', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve controller status'
      });
    }
  }

  /**
   * Cancel active generation job
   * DELETE /api/v1/content/jobs/:jobId
   */
  async cancelJob(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      const { jobId } = req.params;

      if (!jobId) {
        return res.status(400).json({
          error: 'Missing job ID',
          message: 'Job ID is required'
        });
      }

      logger.info('Job cancellation request', { jobId });

      // Cancel job through orchestrator
      const cancelled = await this.genaiOrchestrator.cancelJob(jobId);

      if (cancelled) {
        logger.info('Job cancelled successfully', { jobId });
        res.status(200).json({
          success: true,
          message: 'Job cancelled successfully',
          jobId,
          cancelledAt: new Date().toISOString()
        });
      } else {
        res.status(404).json({
          error: 'Job not found',
          message: 'Active job not found or already completed'
        });
      }

    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId: req.params.jobId,
        error: error.message
      });

      if (error instanceof ValidationError) {
        return res.status(404).json({
          error: 'Job Not Found',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to cancel job'
      });
    }
  }

  /**
   * Download generated content files
   * GET /api/v1/content/download/:jobId/:fileName?
   */
  async downloadContent(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      const { jobId, fileName } = req.params;

      if (!jobId) {
        return res.status(400).json({
          error: 'Missing job ID',
          message: 'Job ID is required'
        });
      }

      logger.info('Content download request', { jobId, fileName });

      // Use local storage path for file serving
      const path = require('path');
      const fs = require('fs').promises;
      const { safeFilename, resolveWithinBase } = require('../utils/safePath');

      // SECURITY (CodeQL js/path-injection, same class as alerts 39/40):
      // `jobId` and the optional `fileName` are user-controlled. Validate them as
      // strict flat filenames and resolve within a fixed base directory so
      // traversal sequences cannot escape the storage root.
      const generatedRoot = path.resolve(__dirname, '../../../storage/generated');
      let storageDir;
      try {
        const safeJobId = safeFilename(jobId);
        storageDir = resolveWithinBase(generatedRoot, safeJobId);
        if (fileName) {
          safeFilename(fileName); // throws on traversal / invalid characters
        }
      } catch (validationError) {
        logger.warn('Rejected content download - invalid jobId/fileName', {
          jobId,
          fileName,
          reason: validationError.message
        });
        return res.status(400).json({
          error: 'Invalid request',
          message: 'jobId or fileName contains invalid characters'
        });
      }

      try {
        // Check if job directory exists
        await fs.access(storageDir);
      } catch (error) {
        return res.status(404).json({
          error: 'Content not found',
          message: 'No generated content found for this job ID'
        });
      }

      // If specific file requested, serve it directly
      if (fileName) {
        // fileName was validated above; resolve within the job dir for safety.
        const filePath = resolveWithinBase(storageDir, fileName);
        
        try {
          await fs.access(filePath);
          
          // Set appropriate headers
          const ext = path.extname(fileName).toLowerCase();
          let contentType = 'application/octet-stream';
          
          switch (ext) {
            case '.json':
              contentType = 'application/json';
              break;
            case '.txt':
              contentType = 'text/plain';
              break;
            case '.html':
              contentType = 'text/html';
              break;
            case '.zip':
              contentType = 'application/zip';
              break;
            case '.pdf':
              contentType = 'application/pdf';
              break;
            case '.docx':
              contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
              break;
          }
          
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
          
          // Stream the file
          const fileStream = require('fs').createReadStream(filePath);
          fileStream.pipe(res);
          
          logger.info('File served successfully', { jobId, fileName });
          return;
          
        } catch (error) {
          return res.status(404).json({
            error: 'File not found',
            message: `File ${fileName} not found for job ${jobId}`
          });
        }
      }

      // If no specific file requested, automatically serve the zip file
      try {
        const files = await fs.readdir(storageDir);
        
        // Look for zip file first
        const zipFile = files.find(file => file.endsWith('.zip'));
        
        if (zipFile) {
          // Serve the zip file directly
          const zipPath = path.join(storageDir, zipFile);
          
          try {
            await fs.access(zipPath);
            
            // Set proper headers for zip download
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipFile}"`);
            
            // Stream the zip file
            const fileStream = require('fs').createReadStream(zipPath);
            fileStream.pipe(res);
            
            logger.info('Zip file served successfully', { jobId, fileName: zipFile });
            return;
            
          } catch (error) {
            logger.warn('Zip file not accessible, falling back to file list', { jobId, zipFile });
          }
        }
        
        // Fallback: If no zip file found, list available files
        const fileDetails = [];
        
        for (const file of files) {
          const filePath = path.join(storageDir, file);
          const stats = await fs.stat(filePath);
          
          fileDetails.push({
            fileName: file,
            size: stats.size,
            downloadUrl: `/api/v1/content/download/${jobId}/${file}`,
            lastModified: stats.mtime.toISOString()
          });
        }
        
        res.status(200).json({
          success: true,
          jobId,
          files: fileDetails,
          totalFiles: fileDetails.length,
          message: 'No zip file available, listing individual files'
        });
        
      } catch (error) {
        return res.status(500).json({
          error: 'Failed to access files',
          message: 'Could not read job directory'
        });
      }

    } catch (error) {
      logger.error('Content download failed', {
        jobId: req.params.jobId,
        fileName: req.params.fileName,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to download content'
      });
    }
  }

  /**
   * Preview specific market variant
   * GET /api/v1/content/preview/:jobId/:market
   */
  async previewContent(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      const { jobId, market } = req.params;
      const { format = 'html' } = req.query;

      if (!jobId || !market) {
        return res.status(400).json({
          error: 'Missing parameters',
          message: 'Job ID and market are required'
        });
      }

      logger.debug('Content preview request', { jobId, market, format });

      // Get job status to find the specific variant
      const jobStatus = this.genaiOrchestrator.getJobStatus(jobId);
      
      if (!jobStatus || !jobStatus.results) {
        return res.status(404).json({
          error: 'Job not found',
          message: 'No job found with the specified ID'
        });
      }

      // Find the specific market variant
      const variant = jobStatus.results.find(r =>
        r.market && r.market.toLowerCase() === market.toLowerCase()
      );

      if (!variant) {
        return res.status(404).json({
          error: 'Market variant not found',
          message: `No variant found for market: ${market}`
        });
      }

      // Format the content for preview
      if (format === 'html') {
        const htmlContent = await this._generatePreviewHTML(variant);
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlContent);
      }

      // Return JSON format
      res.status(200).json({
        success: true,
        jobId,
        market: variant.market,
        content: variant.content,
        metadata: {
          ...variant.metadata,
          previewedAt: new Date().toISOString(),
          format
        }
      });

    } catch (error) {
      logger.error('Content preview failed', {
        jobId: req.params.jobId,
        market: req.params.market,
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to preview content'
      });
    }
  }

  /**
   * Regenerate specific market variants
   * POST /api/v1/content/regenerate
   */
  async regenerateContent(req, res) {
    try {
      if (!this.isInitialized) {
        return res.status(503).json({
          error: 'Service not initialized',
          message: 'Content generation service is not ready'
        });
      }

      const { jobId, markets, options = {} } = req.body;

      if (!jobId || !markets || !Array.isArray(markets)) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Job ID and markets array are required'
        });
      }

      const requestId = this._generateRequestId();

      logger.info('Content regeneration request', {
        requestId,
        jobId,
        markets,
        options
      });

      // Get original job to extract master PR
      const originalJob = this.genaiOrchestrator.getJobStatus(jobId);
      
      if (!originalJob) {
        return res.status(404).json({
          error: 'Original job not found',
          message: 'Cannot regenerate content for non-existent job'
        });
      }

      // Start regeneration process
      const regenerationResult = await this.genaiOrchestrator.generatePRVariants(
        originalJob.masterPR || 'Regeneration request',
        {
          markets,
          ...options,
          requestId,
          regeneration: true,
          originalJobId: jobId
        }
      );

      logger.info('Content regeneration completed', {
        requestId,
        originalJobId: jobId,
        newJobId: regenerationResult.jobId,
        marketsRegenerated: markets.length
      });

      res.status(200).json({
        success: true,
        originalJobId: jobId,
        newJobId: regenerationResult.jobId,
        status: regenerationResult.status,
        metadata: {
          requestId,
          originalJobId: jobId,
          marketsRegenerated: markets.length,
          regeneratedAt: new Date().toISOString()
        },
        results: regenerationResult.results,
        _links: {
          self: `/api/v1/content/regenerate`,
          newJobStatus: `/api/v1/content/jobs/${regenerationResult.jobId}`,
          originalJob: `/api/v1/content/jobs/${jobId}`
        }
      });

    } catch (error) {
      logger.error('Content regeneration failed', {
        error: error.message,
        stack: error.stack,
        requestBody: req.body
      });

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Content regeneration failed due to an internal error'
      });
    }
  }

  /**
   * Generate preview HTML for a variant
   */
  async _generatePreviewHTML(variant) {
    const title = `Press Release - ${variant.market}`;
    const content = variant.content.replace(/\n/g, '</p><p>');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #c41e3a; margin-bottom: 10px; }
        .date { font-size: 14px; color: #666; }
        .title { font-size: 28px; font-weight: bold; margin: 30px 0 20px 0; text-align: center; }
        .market-info { background: #f5f5f5; padding: 15px; margin: 20px 0; border-left: 4px solid #c41e3a; }
        .content { font-size: 16px; text-align: justify; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 14px; color: #666; }
        p { margin-bottom: 15px; }
        .preview-banner { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 20px; text-align: center; font-weight: bold; }
    </style>
</head>
<body>
    <div class="preview-banner">PREVIEW MODE - Generated Content</div>
    <div class="header">
        <div class="logo">Example Company</div>
        <div class="date">${new Date().toLocaleDateString()}</div>
    </div>
    <div class="title">${title}</div>
    <div class="market-info">
        <strong>Market:</strong> ${variant.market}<br>
        <strong>Quality Score:</strong> ${variant.metadata?.qualityScore || 'N/A'}%<br>
        <strong>Generated:</strong> ${variant.metadata?.generatedAt || new Date().toISOString()}
    </div>
    <div class="content">
        <p>${content}</p>
    </div>
    <div class="footer">
        <div>
            <strong>Media Contact:</strong><br>
            Press Team<br>
            Email: press@example.com<br>
            Phone: (555) 123-4567
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
            Preview generated on ${new Date().toISOString()} | Market: ${variant.market}
        </p>
    </div>
</body>
</html>`;
  }

  /**
   * Validate generation request
   */
  _validateGenerationRequest(body) {
    const errors = [];

    // Check required fields
    if (!body.masterPR) {
      errors.push('masterPR is required');
    } else if (typeof body.masterPR !== 'string') {
      errors.push('masterPR must be a string');
    } else if (body.masterPR.length === 0) {
      errors.push('masterPR cannot be empty');
    } else if (body.masterPR.length > this.config.maxContentLength) {
      errors.push(`masterPR exceeds maximum length of ${this.config.maxContentLength} characters`);
    }

    // Validate markets - accept both array and string formats
    if (body.markets) {
      if (typeof body.markets === 'string') {
        // Allow special string values like "top10"
        const validStringValues = ['top10', 'top25', 'top50'];
        if (!validStringValues.includes(body.markets)) {
          errors.push(`Invalid markets string value. Supported values: ${validStringValues.join(', ')}`);
        }
      } else if (Array.isArray(body.markets)) {
        if (body.markets.length > this.config.maxMarkets) {
          errors.push(`markets exceeds maximum of ${this.config.maxMarkets} markets`);
        }
      } else {
        errors.push('markets must be an array or a valid string value (e.g., "top10")');
      }
    }

    // Validate dataSource parameter
    if (body.dataSource) {
      if (typeof body.dataSource !== 'string') {
        errors.push('dataSource must be a string');
      } else if (!this.config.supportedDataSources.includes(body.dataSource)) {
        errors.push(`Invalid dataSource: ${body.dataSource}. Supported values: ${this.config.supportedDataSources.join(', ')}`);
      }
    }

    // Validate top-level formats parameter
    if (body.formats) {
      if (!Array.isArray(body.formats)) {
        errors.push('formats must be an array');
      } else {
        const invalidFormats = body.formats.filter(format => !this.config.supportedFormats.includes(format));
        if (invalidFormats.length > 0) {
          errors.push(`Unsupported formats: ${invalidFormats.join(', ')}`);
        }
      }
    }

    // Validate options
    if (body.options) {
      if (typeof body.options !== 'object') {
        errors.push('options must be an object');
      } else {
        // Validate specific options
        if (body.options.format && !this.config.supportedFormats.includes(body.options.format)) {
          errors.push(`Unsupported format: ${body.options.format}`);
        }
        if (body.options.formats && !Array.isArray(body.options.formats)) {
          errors.push('options.formats must be an array');
        } else if (body.options.formats) {
          const invalidFormats = body.options.formats.filter(format => !this.config.supportedFormats.includes(format));
          if (invalidFormats.length > 0) {
            errors.push(`Unsupported formats in options: ${invalidFormats.join(', ')}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      message: errors.length > 0 ? errors[0] : null
    };
  }

  /**
   * Process markets - convert string values to arrays
   * @param {string|Array} markets - Markets input
   * @returns {Array} Processed markets array
   */
  async _processMarkets(markets) {
    if (Array.isArray(markets)) {
      return markets;
    }

    if (typeof markets === 'string') {
      switch (markets.toLowerCase()) {
        case 'top10':
          return this.marketDataService.getTopMarkets(10);
        case 'top25':
          return this.marketDataService.getTopMarkets(25);
        case 'top50':
          return this.marketDataService.getTopMarkets(50);
        default:
          throw new Error(`Unsupported markets string value: ${markets}`);
      }
    }

    return markets;
  }

  /**
   * Validate validation request
   */
  _validateValidationRequest(body) {
    const errors = [];

    // Check required fields
    if (!body.content) {
      errors.push('content is required');
    } else if (typeof body.content !== 'string') {
      errors.push('content must be a string');
    } else if (body.content.length === 0) {
      errors.push('content cannot be empty');
    }

    if (!body.market) {
      errors.push('market is required');
    } else if (typeof body.market !== 'string') {
      errors.push('market must be a string');
    }

    // Validate validation mode
    if (body.validationMode && !this.config.validationModes.includes(body.validationMode)) {
      errors.push(`Invalid validation mode: ${body.validationMode}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      message: errors.length > 0 ? errors[0] : null
    };
  }

  /**
   * Compile comprehensive validation report
   */
  _compileValidationReport(data) {
    const {
      qualityValidation,
      factCheckResult,
      validationMode,
      requestId,
      market
    } = data;

    // Extract quality scores
    const qualityScore = qualityValidation.variants[0]?.validation?.overallScore || 0;
    const factCheckScore = factCheckResult?.overall?.confidence || 100;

    // Calculate overall score (weighted average)
    const overallScore = Math.round((qualityScore * 0.6) + (factCheckScore * 0.4));

    // Determine overall status
    let overallStatus = 'passed';
    if (validationMode === 'strict' && overallScore < 85) {
      overallStatus = 'failed';
    } else if (validationMode === 'standard' && overallScore < 75) {
      overallStatus = 'failed';
    } else if (validationMode === 'lenient' && overallScore < 65) {
      overallStatus = 'failed';
    } else if (overallScore < 80) {
      overallStatus = 'warning';
    }

    // Compile all issues
    const allIssues = [];
    
    if (qualityValidation.variants[0]?.validation?.issues) {
      allIssues.push(...qualityValidation.variants[0].validation.issues.map(issue => ({
        type: 'quality',
        severity: 'medium',
        message: issue
      })));
    }

    if (factCheckResult?.issues) {
      allIssues.push(...factCheckResult.issues.map(issue => ({
        type: issue.type || 'fact_check',
        severity: 'high',
        message: issue.issue || issue.message || issue
      })));
    }

    // Compile recommendations
    const recommendations = [];
    
    if (qualityValidation.variants[0]?.validation?.recommendations) {
      recommendations.push(...qualityValidation.variants[0].validation.recommendations);
    }

    if (factCheckResult?.recommendations) {
      recommendations.push(...factCheckResult.recommendations);
    }

    return {
      overall: {
        score: overallScore,
        status: overallStatus,
        validationMode,
        timestamp: new Date().toISOString()
      },
      quality: {
        score: qualityScore,
        details: qualityValidation.variants[0]?.validation || {},
        summary: qualityValidation.summary || {}
      },
      factCheck: factCheckResult ? {
        score: factCheckScore,
        status: factCheckResult.overall?.status || 'unknown',
        claims: factCheckResult.claims || {},
        hallucination: factCheckResult.hallucination || {},
        temporal: factCheckResult.temporal || {}
      } : null,
      issues: allIssues,
      recommendations,
      metadata: {
        requestId,
        market,
        validationMode,
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Extract variant data with validation results from generated files
   */
  async _extractVariantDataFromResults(jobId, results) {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      const { safeFilename, resolveWithinBase, isSafeFilename } = require('../utils/safePath');

      // SECURITY (CodeQL js/path-injection — alerts 39,40): `jobId` (and the
      // per-file `fileName` below) are user/external-controlled and are used to
      // build filesystem paths. Validate `jobId` as a strict flat filename up
      // front and resolve everything within a fixed base dir so traversal
      // sequences like `../../etc/passwd` cannot escape the storage root.
      const generatedRoot = path.resolve(__dirname, '../../../storage/generated');
      let safeJobId;
      try {
        safeJobId = safeFilename(jobId);
      } catch (validationError) {
        logger.warn('Rejected variant extraction - invalid jobId', {
          jobId,
          reason: validationError.message
        });
        return null;
      }

      // DIAGNOSTIC LOGGING: Comprehensive results structure analysis
      logger.info('🔍 DIAGNOSTIC: Starting variant data extraction', {
        jobId,
        timestamp: new Date().toISOString(),
        extractionAttempt: true
      });
      
      logger.info('🔍 DIAGNOSTIC: Job results structure analysis', {
        jobId,
        hasResults: !!results,
        resultsType: typeof results,
        resultsKeys: results ? Object.keys(results) : null,
        hasVariants: !!(results && results.variants),
        variantsCount: results && results.variants ? results.variants.length : 0,
        variantsType: results && results.variants ? typeof results.variants : null,
        hasFiles: !!(results && results.files),
        filesCount: results && results.files ? results.files.length : 0,
        resultsStructure: results ? JSON.stringify(results, null, 2) : 'null'
      });
      
      // PRIORITY 1: Check if results contain variants array (NEW APPROACH)
      if (results && results.variants && Array.isArray(results.variants) && results.variants.length > 0) {
        logger.info('✅ SUCCESS: Found variants in results.variants array', {
          jobId,
          variantCount: results.variants.length,
          variantKeys: results.variants[0] ? Object.keys(results.variants[0]) : null
        });
        
        // Process and validate the variants from the results array
        const processedVariants = results.variants.map((variant, index) => {
          // ENHANCED LOGGING: Trace exact data structure for debugging
          logger.info(`🔍 DIAGNOSTIC: Processing variant ${index}`, {
            jobId,
            variantIndex: index,
            variantKeys: Object.keys(variant),
            hasContent: !!variant.content,
            contentType: typeof variant.content,
            contentKeys: variant.content ? Object.keys(variant.content) : null,
            hasNestedContent: !!(variant.content && variant.content.content),
            nestedContentLength: variant.content?.content ? variant.content.content.length : 0,
            hasMetadata: !!variant.metadata,
            hasValidation: !!variant.validation,
            variantStructure: JSON.stringify(variant, null, 2).substring(0, 500) + '...'
          });
          
          // Extract confidence and quality scores from metadata
          const confidence = variant.metadata?.confidence || variant.validation?.scores?.factChecking?.confidence || 85;
          const qualityScore = variant.metadata?.qualityScore || variant.validation?.scores?.quality?.score || 75;
          
          // FIXED: Handle nested content structure - content is at variant.content.content
          const extractedContent = variant.content?.content || variant.content || variant.narrativeBody || '';
          const extractedHeadline = variant.content?.headline || variant.headline || '';
          const extractedMarket = variant.content?.market || variant.market || 'Unknown Market';
          
          logger.info(`🔍 DIAGNOSTIC: Content extraction results`, {
            jobId,
            variantIndex: index,
            extractedContentLength: extractedContent.length,
            extractedHeadline: extractedHeadline.substring(0, 100),
            extractedMarket,
            extractionPath: variant.content?.content ? 'variant.content.content' :
                           variant.content ? 'variant.content' :
                           variant.narrativeBody ? 'variant.narrativeBody' : 'empty'
          });
          
          // Ensure proper structure with validation scores
          return {
            market: extractedMarket,
            content: extractedContent,
            headline: extractedHeadline,
            format: variant.format || 'narrative',
            metadata: {
              generatedAt: variant.metadata?.generatedAt || new Date().toISOString(),
              confidence: confidence,
              qualityScore: qualityScore,
              wordCount: variant.metadata?.wordCount || (variant.content ? variant.content.length : 0),
              jobId: jobId,
              ...variant.metadata
            },
            validation: variant.validation || {
              scores: {
                factChecking: {
                  confidence: confidence,
                  status: confidence >= 80 ? 'passed' : confidence >= 60 ? 'warning' : 'failed'
                },
                quality: {
                  score: qualityScore,
                  status: qualityScore >= 75 ? 'passed' : qualityScore >= 50 ? 'warning' : 'failed'
                },
                overall: {
                  score: Math.round((confidence + qualityScore) / 2),
                  status: Math.round((confidence + qualityScore) / 2) >= 75 ? 'passed' : 'warning'
                }
              },
              timestamp: new Date().toISOString(),
              validationMode: 'standard'
            }
          };
        });
        
        // ENHANCED LOGGING: Final processing results with content validation
        const validVariants = processedVariants.filter(v => v.content && v.content.length > 0);
        
        logger.info('✅ SUCCESS: Processed variants from results.variants array', {
          jobId,
          totalProcessed: processedVariants.length,
          validVariants: validVariants.length,
          hasValidation: processedVariants.every(v => v.validation),
          sampleConfidence: processedVariants.length > 0 ? processedVariants[0].validation?.scores?.factChecking?.confidence : null,
          sampleContentLength: validVariants.length > 0 ? validVariants[0].content.length : 0,
          allVariantsHaveContent: processedVariants.every(v => v.content && v.content.length > 0)
        });
        
        // Return only variants with actual content
        if (validVariants.length === 0) {
          logger.error('🚨 CRITICAL: All processed variants have empty content!', {
            jobId,
            processedCount: processedVariants.length,
            diagnosis: 'Content extraction failed - check data structure'
          });
          return null;
        }
        
        return validVariants;
      }
      
      // FALLBACK: Check if results contain file paths (BACKWARD COMPATIBILITY)
      if (!results || !results.files) {
        logger.warn('🚨 DIAGNOSTIC: No variants array or files found in results - investigating alternatives', {
          jobId,
          hasResults: !!results,
          resultsKeys: results ? Object.keys(results) : null,
          resultsContent: results
        });
        
        // DIAGNOSTIC: Check if files exist in storage despite missing results.files
        // SECURITY (CodeQL js/path-injection — alert 39): resolve within the
        // fixed base using the validated jobId; reject anything that escapes.
        const storageDir = resolveWithinBase(generatedRoot, safeJobId);
        try {
          const storageFiles = await fs.readdir(storageDir);
          logger.info('🔍 DIAGNOSTIC: Storage directory contents', {
            jobId,
            storageDir,
            filesFound: storageFiles,
            fileCount: storageFiles.length,
            hasStorageFiles: storageFiles.length > 0
          });
          
          if (storageFiles.length > 0) {
            logger.error('🚨 CRITICAL DIAGNOSTIC: Files exist in storage but results.variants and results.files are missing!', {
              jobId,
              storageFiles,
              resultsStructure: results,
              diagnosis: 'Job completion did not properly store results structure'
            });
          }
        } catch (storageError) {
          logger.warn('🔍 DIAGNOSTIC: Could not check storage directory', {
            jobId,
            storageDir,
            error: storageError.message
          });
        }
        
        return null;
      }
      
      // FALLBACK: Process files from disk (BACKWARD COMPATIBILITY)
      logger.info('🔄 FALLBACK: Processing variants from file system', {
        jobId,
        fileCount: results.files.length
      });
      
      const variants = [];
      
      // Look for JSON files that contain variant data
      for (const file of results.files) {
        if (file.fileName && file.fileName.endsWith('.json')) {
          try {
            // SECURITY (CodeQL js/path-injection — alert 40): `file.fileName` is
            // external-controlled. Require it to be a strict flat filename, then
            // resolve within the validated job directory; skip anything unsafe.
            if (!isSafeFilename(file.fileName)) {
              logger.warn('Skipped variant file - unsafe fileName', {
                jobId,
                fileName: file.fileName
              });
              continue;
            }
            const jobDir = resolveWithinBase(generatedRoot, safeJobId);
            const filePath = resolveWithinBase(jobDir, file.fileName);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            // Transform the data structure to include validation scores
            if (data.market && data.content) {
              // Extract confidence and quality scores from metadata
              const confidence = data.rawContent?.metadata?.confidence || data.metadata?.confidence || 85;
              const qualityScore = data.rawContent?.metadata?.qualityScore || data.metadata?.qualityScore || 75;
              
              // Create the expected validation structure
              const variant = {
                market: data.market,
                content: data.content?.narrativeBody || data.rawContent?.content || data.content,
                headline: data.headline,
                metadata: {
                  generatedAt: data.metadata?.generatedAt || new Date().toISOString(),
                  confidence: confidence,
                  qualityScore: qualityScore,
                  wordCount: data.metadata?.wordCount || 0,
                  jobId: jobId
                },
                validation: {
                  scores: {
                    factChecking: {
                      confidence: confidence,
                      status: confidence >= 80 ? 'passed' : confidence >= 60 ? 'warning' : 'failed'
                    },
                    quality: {
                      score: qualityScore,
                      status: qualityScore >= 75 ? 'passed' : qualityScore >= 50 ? 'warning' : 'failed'
                    },
                    overall: {
                      score: Math.round((confidence + qualityScore) / 2),
                      status: Math.round((confidence + qualityScore) / 2) >= 75 ? 'passed' : 'warning'
                    }
                  },
                  timestamp: new Date().toISOString(),
                  validationMode: 'standard'
                }
              };
              
              variants.push(variant);
            } else if (data.variants && Array.isArray(data.variants)) {
              // Handle array of variants
              variants.push(...data.variants);
            }
          } catch (error) {
            logger.warn('Failed to read variant file', {
              jobId,
              fileName: file.fileName,
              error: error.message
            });
          }
        }
      }
      
      logger.info('Extracted variant data with validation scores (fallback method)', {
        jobId,
        variantCount: variants.length,
        hasValidation: variants.every(v => v.validation),
        sampleConfidence: variants.length > 0 ? variants[0].validation?.scores?.factChecking?.confidence : null
      });
      
      return variants.length > 0 ? variants : null;
      
    } catch (error) {
      logger.error('Failed to extract variant data', {
        jobId,
        error: error.message,
        stack: error.stack
      });
      return null;
    }
  }

  /**
   * Generate unique request ID
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get controller health status
   */
  getHealth() {
    return {
      healthy: this.isInitialized,
      agents: {
        orchestrator: this.genaiOrchestrator.isInitialized,
        localizationEngine: this.localizationEngine.isInitialized,
        marketResearcher: this.marketResearcher.isInitialized,
        qualityValidator: this.qualityValidator.isInitialized,
        factChecker: this.factChecker.isInitialized,
        outputFormatter: this.outputFormatter.isInitialized
      },
      dataSources: {
        trustedData: this.trustedDataService.getServiceStatus(),
        firecrawl: this.firecrawlService.getServiceStatus(),
        marketData: this.marketDataService.getStatus ? this.marketDataService.getStatus() : { initialized: true }
      },
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Get email composition for a specific job and market
   * GET /api/v1/content/email/:jobId/:market
   */
  async getEmailComposition(req, res) {
    try {
      const { jobId, market } = req.params;
      const { recipient, senderName } = req.query;

      logger.info(`Getting email composition for job ${jobId}, market: ${market}`);

      // Validate parameters
      if (!jobId) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Job ID is required'
        });
      }

      if (!market) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Market is required'
        });
      }

      // SHARED SERVICE: Use FileRetrievalService for pitch email retrieval
      const pitchData = await this.fileRetrieval.getPitchEmail(jobId, market);
      
      // Validate pitch data structure
      try {
        this.emailComposer.validatePitchData(pitchData);
      } catch (validationError) {
        logger.error(`Invalid pitch data structure: ${validationError.message}`);
        return res.status(400).json({
          error: 'Invalid Data',
          message: `Pitch data is invalid: ${validationError.message}`
        });
      }

      // Compose the email
      const emailOptions = {
        recipient: recipient || '[Recipient Name]',
        senderName: senderName || undefined
      };

      const composedEmail = this.emailComposer.composeEmail(pitchData, emailOptions);

      logger.info(`Email composition successful for ${market}`);

      // Return the composed email
      res.status(200).json({
        success: true,
        jobId,
        market,
        email: composedEmail,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`Email composition failed: ${error.message}`, error);

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message
        });
      }

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Email composition failed due to an internal error'
      });
    }
  }
}

// Create singleton instance
const contentGenerationController = new ContentGenerationController();

module.exports = contentGenerationController;