/**
 * Main Express Application for Press Release Generation System
 * Integrates AI-first data sources, multi-agent processing, and quality scoring
 * 
 * "Key Features":
 * - PerplexityService (AI search)
 * - AIFirstDataSourceRouter (intelligent routing)
 * - MarketResearcher Agent (AI-enabled)
 * - OutputFormatter Agent (with Perplexity metrics)
 * - Circuit breaker pattern for fault tolerance
 * - Quality score calculation (72% → 92% improvement expected)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const winston = require('winston');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pr-backend', version: '1.0.0' },
  transports: [
    new winston.transports.File({ filename: 'logs/application/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/application/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, file:// protocol, or server-to-server requests)
    if (!origin) return callback(null, true);
    
    // Get CORS configuration from config
    const config = require('./config/index.js').config;
    
    // Development mode - allow any origin
    if (process.env.NODE_ENV !== 'production') {
      logger.info('CORS: Development mode - allowing origin', { origin });
      return callback(null, true);
    }
    
    // Production mode - use pattern-based matching
    const allowedOrigins = [
      // Explicit origins from environment
      process.env.FRONTEND_URL,
      config.cors.origin,
      // Development fallbacks
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ].filter(Boolean); // Remove undefined values
    
    // Pattern-based origins for production deployments
    const allowedPatterns = [
      // CloudFront distributions
      /^https:\/\/[a-z0-9]+\.cloudfront\.net$/,
      // ECS/ALB deployments
      /^https:\/\/[a-z0-9-]+\.elb\.[a-z0-9-]+\.amazonaws\.com$/,
      // API Gateway custom domains
      /^https:\/\/[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/,
      // Custom domains (if CORS_DOMAIN_PATTERN is set)
      ...(process.env.CORS_DOMAIN_PATTERN ? [new RegExp(process.env.CORS_DOMAIN_PATTERN)] : [])
    ];
    
    // Check exact matches first
    if (allowedOrigins.includes(origin)) {
      logger.info('CORS: Exact match allowed', { origin });
      return callback(null, true);
    }
    
    // Check pattern matches for production
    for (const pattern of allowedPatterns) {
      if (pattern.test(origin)) {
        logger.info('CORS: Pattern match allowed', { origin, pattern: pattern.toString() });
        return callback(null, true);
      }
    }
    
    // Log rejected origins for debugging
    logger.warn('CORS: Origin rejected', {
      origin,
      allowedOrigins,
      allowedPatterns: allowedPatterns.map(p => p.toString()),
      nodeEnv: process.env.NODE_ENV
    });
    
    return callback(new Error(`CORS policy violation: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-API-Key',
    'Cache-Control'
  ],
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
  maxAge: 86400 // Cache preflight requests for 24 hours
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Authentication middleware (Cognito user context extraction)
if (process.env.ENABLE_AUTHENTICATION === 'true' && process.env.AUTH_MODE === 'cognito') {
  const { extractCognitoUser } = require('./middleware/cognitoAuth');
  app.use(extractCognitoUser);
  logger.info('🔒 Cognito authentication middleware enabled', {
    authMode: process.env.AUTH_MODE,
    mfaEnabled: process.env.ENABLE_MFA === 'true'
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      express: 'running',
      port: PORT
    }
  });
});

// Status endpoint with service integration check
app.get('/api/v1/status', async (req, res) => {
  try {
    // Check service configuration - mark firecrawl, perplexity, and tavily as optional
    const services = {
      express: 'running',
      bedrock: { configured: !!process.env.AWS_REGION },
      firecrawl: { configured: !!process.env.FIRECRAWL_API_KEY, optional: true },
      perplexity: { configured: !!process.env.PERPLEXITY_API_KEY, optional: true },
      tavily: { configured: !!process.env.TAVILY_API_KEY, optional: true }
    };
    
    // Determine overall status: operational if all required services are configured
    // Optional services don't affect overall status
    const requiredServices = Object.entries(services).filter(([name, info]) =>
      typeof info === 'object' && !info.optional
    );
    const allRequiredConfigured = requiredServices.every(([name, info]) =>
      info.configured || name === 'express'
    );
    
    // Detect environment - check for actual AWS/ECS indicators, not just AWS_REGION
    // AWS_REGION can be set locally for Bedrock access, so it's not a reliable indicator
    const environment = process.env.AWS_EXECUTION_ENV ? 'AWS' :
                       process.env.ECS_CONTAINER_METADATA_URI ? 'AWS ECS' : 'Local';
    
    const status = {
      status: allRequiredConfigured ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
environment: environment,
      services: services,
      agents: {
        marketResearcher: 'available',
        outputFormatter: 'available',
        contentAnalyzer: 'available',
        comprehensiveDataExtractor: 'available'
      },
      features: {
        aiFirstDataSource: 'enabled',
        circuitBreaker: 'enabled',
        qualityScoring: 'enabled',
        strandsFramework: process.env.STRANDS_ENABLED === 'true' ? 'enabled' : 'disabled',
        authentication: process.env.ENABLE_AUTHENTICATION === 'true' ? 'enabled' : 'disabled'
      },
      strands: {
        enabled: process.env.STRANDS_ENABLED === 'true',
        phase: 'Phase 3 - Production Integration',
        endpoints: {
          generateStrands: '/api/v1/content/generate-strands',
          strandsStatus: '/api/v1/content/strands/status',
          strandsHealth: '/api/v1/content/strands/health'
        }
      },
      authentication: {
        enabled: process.env.ENABLE_AUTHENTICATION === 'true',
        mode: process.env.AUTH_MODE || 'none',
        mfaEnabled: process.env.ENABLE_MFA === 'true',
        user: req.user ? {
          authenticated: true,
          email: req.user.email,
          tier: req.user.tier,
          isAdmin: req.user.isAdmin
        } : {
          authenticated: false
        }
      }
    };

    logger.info('Status check completed', { status });
    res.status(200).json(status);
  } catch (error) {
    logger.error('Status check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Service status check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Content generation endpoint with comprehensive validation
app.post('/api/v1/content/generate', [
  body('markets').isArray().withMessage('Markets must be an array'),
  body('markets.*').isString().withMessage('Each market must be a string'),
  body('masterPR').isString().isLength({ min: 100 }).withMessage('Master PR content must be at least 100 characters'),
  body('dataSource').isIn(['trusted', 'ai', 'hybrid', 'tavily']).withMessage('Data source must be trusted, ai, hybrid, or tavily'),
  body('options.formats').optional().isArray().withMessage('Formats must be an array'),
  body('options.validationMode').optional().isIn(['standard', 'strict', 'relaxed']).withMessage('Invalid validation mode'),
  body('options.batchSize').optional().isInt({ min: 1, max: 10 }).withMessage('Batch size must be between 1 and 10'),
  body('options.timeout').optional().isInt({ min: 30, max: 7200 }).withMessage('Timeout must be between 30 and 7200 seconds (2 hours)')
], async (req, res) => {
  const startTime = Date.now();
  const requestId = require('uuid').v4();
  
  // 🚨 CRITICAL DEBUG: Log ALL incoming request details
  console.log('🚨 API REQUEST RECEIVED:', {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    url: req.url,
    headers: req.headers,
    bodyKeys: Object.keys(req.body || {}),
    bodySize: JSON.stringify(req.body || {}).length,
    markets: req.body?.markets,
    dataSource: req.body?.dataSource,
    masterPRLength: req.body?.masterPR?.length,
    options: req.body?.options
  });
  
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 🚨 CRITICAL DEBUG: Enhanced validation error logging
      console.log('🚨 VALIDATION FAILED:', {
        requestId, 
        errors: errors.array(),
        body: req.body,
        detailedErrors: errors.array().map(err => ({
          field: err.param,
          value: err.value,
          message: err.msg,
          location: err.location
        }))
      });
      
      logger.warn('Content generation request validation failed', { 
        requestId, 
        errors: errors.array(),
        body: req.body 
      });
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        requestId
      });
    }

    const { markets, masterPR, dataSource, options = {} } = req.body;
    
    logger.info('Content generation request received', {
      requestId,
      marketCount: markets.length,
      masterPRLength: masterPR.length,
      dataSource,
      options,
      timestamp: new Date().toISOString()
    });

    // Import services and agents dynamically to avoid circular dependencies
    const { default: GenAIOrchestrator } = await import('./services/genaiOrchestrator.js');
    
    // Import required agents from services/agents directory
    const { default: ContentAnalyzer } = await import('./services/agents/contentAnalyzer.js');
    const { default: LocalizationEngine } = await import('./services/agents/localizationEngine.js');
    const { default: MarketResearcher } = await import('./services/agents/marketResearcher.js');
    const { default: QualityValidator } = await import('./services/agents/qualityValidator.js');
    const { default: OutputFormatter } = await import('./services/agents/outputFormatter.js');
    const { default: PitchEmailExtractor } = await import('./services/agents/pitchEmailExtractor.js');
    const { default: ComprehensiveDataExtractor } = await import('./services/agents/comprehensiveDataExtractor.js');
    
    // Import required services
    const { default: TrustedDataService } = await import('./services/trustedData.js');
    const { default: FirecrawlService } = await import('./services/firecrawl.js');
    const marketDataService = await import('./services/marketData.js');
    const { default: PerplexityService } = await import('./services/perplexityService.js');
    const { default: DataLineageService } = await import('./services/dataLineageService.js');
    
    // Initialize orchestrator with comprehensive logging
    const orchestrator = new GenAIOrchestrator({
      logger,
      requestId,
      enableCircuitBreaker: true,
      enableQualityScoring: true,
      aiFirstDataSource: dataSource === 'ai' || dataSource === 'hybrid'
    });

    // Initialize agents with data source constraints for trusted data enforcement
    logger.info('🤖 Initializing agents with data source constraints...', { dataSource });
    const agentOptions = {
      logger,
      dataSourceMode: dataSource // CRITICAL: Pass dataSource for trusted data enforcement
    };
    
    const contentAnalyzer = new ContentAnalyzer(agentOptions);
    const localizationEngine = new LocalizationEngine(agentOptions);
    const marketResearcher = new MarketResearcher(agentOptions);
    const qualityValidator = new QualityValidator(agentOptions);
    const outputFormatter = new OutputFormatter(agentOptions);
    const pitchEmailExtractor = new PitchEmailExtractor(agentOptions);
    const comprehensiveDataExtractor = new ComprehensiveDataExtractor(agentOptions);
    
    logger.info('🔒 TRUSTED DATA ENFORCEMENT: Agents initialized with dataSourceMode', {
      dataSource,
      agentsCount: 7,
      enforcementActive: dataSource === 'trusted'
    });

    // Initialize services
    logger.info('🔧 Initializing services...');
    const trustedDataService = TrustedDataService; // Singleton instance, not constructor
    const firecrawlService = FirecrawlService; // Singleton instance, not constructor
    const marketDataServiceInstance = marketDataService.default || marketDataService; // Singleton instance, not constructor
    const perplexityService = new PerplexityService({ logger });
    const dataLineageService = new DataLineageService({ logger });

    // Initialize orchestrator with agents and data sources
    try {
      logger.info('🎯 Initializing GenAI Orchestrator...');
      await orchestrator.initialize({
        contentAnalyzer,
        localizationEngine,
        marketResearcher,
        qualityValidator,
        outputFormatter,
        pitchEmailExtractor,
        comprehensiveDataExtractor
      }, {
        trustedDataService,
        firecrawlService,
        marketDataService,
        perplexityService,
        dataLineageService
      });
      logger.info('✅ GenAI Orchestrator initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize GenAI Orchestrator', {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`GenAI Orchestrator initialization failed: ${error.message}`);
    }

    // Process content generation
    const result = await orchestrator.generateContent({
      markets,
      masterPR,
      dataSource,
      options: {
        formats: options.formats || ['json'],
        validationMode: options.validationMode || 'standard',
        batchSize: options.batchSize || 1,
        timeout: (options.timeout || 60) * 1000 // Convert to milliseconds
      }
    });

    const duration = Date.now() - startTime;
    
    logger.info('Content generation completed successfully', {
      requestId,
      duration,
      resultCount: result.variants?.length || 0,
      qualityScore: result.qualityMetrics?.overallScore,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      requestId,
      duration,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Content generation failed', {
      requestId,
      duration,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Content generation failed',
      message: error.message,
      requestId,
      duration,
      timestamp: new Date().toISOString()
    });
  }
});

// Job status endpoint for content generation
const { contentGenerationController } = require('./controllers');
app.get('/api/v1/content/jobs/:jobId', contentGenerationController.getJobStatus.bind(contentGenerationController));

// Phase 3: Strands Framework Integration - Import and register Strands routes
const strandsRoutes = require('./routes/strands');
app.use('/api/v1/strands', strandsRoutes);

// Pitch email endpoint - MIGRATED TO USE FileRetrievalService
app.get('/api/v1/content/email/:jobId/:market', async (req, res) => {
  const startTime = Date.now();
  const { jobId, market } = req.params;
  
  try {
    logger.info('Pitch email request received', {
      jobId,
      market,
      timestamp: new Date().toISOString()
    });

    // Validate parameters
    if (!jobId || !market) {
      logger.warn('Invalid pitch email request parameters', { jobId, market });
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Both jobId and market are required',
        timestamp: new Date().toISOString()
      });
    }

    // SHARED SERVICE: Use FileRetrievalService for unified file access
    const FileRetrievalService = require('./services/shared/fileRetrievalService');
    const fileRetrieval = new FileRetrievalService();
    
    try {
      const pitchData = await fileRetrieval.getPitchEmail(jobId, market);
      
      logger.info('Pitch email file read successfully', {
        jobId,
        market,
        hasEmail: !!pitchData.pitchEmail?.email
      });

      // Extract email data from the pitch file
      const emailData = pitchData.pitchEmail?.email;
      if (!emailData) {
        logger.warn('No email data found in pitch file', { jobId, market });
        return res.status(404).json({
          error: 'Email data not found',
          message: 'Pitch email data is not available for this job and market',
          jobId,
          market,
          timestamp: new Date().toISOString()
        });
      }

      const duration = Date.now() - startTime;
      
      logger.info('Pitch email retrieved successfully', {
        jobId,
        market,
        duration,
        emailSubject: emailData.subject,
        timestamp: new Date().toISOString()
      });

      // Return structured email data
      res.status(200).json({
        success: true,
        jobId,
        market,
        email: {
          subject: emailData.subject,
          body: emailData.body,
          html: emailData.html,
          plainText: emailData.plainText,
          metadata: emailData.metadata
        },
        pitchData: {
          hook: pitchData.pitchEmail?.hook,
          bullets: pitchData.pitchEmail?.bullets,
          interviewOffer: pitchData.pitchEmail?.interviewOffer
        },
        generatedAt: pitchData.generatedAt,
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (fileError) {
      if (fileError.message && fileError.message.includes('ENOENT')) {
        logger.warn('Pitch email file not found', {
          jobId,
          market,
          error: fileError.message
        });
        return res.status(404).json({
          error: 'Pitch email not found',
          message: `No pitch email found for job ${jobId} and market ${market}`,
          jobId,
          market,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('Error reading pitch email file', {
          jobId,
          market,
          error: fileError.message,
          stack: fileError.stack
        });
        throw fileError; // Re-throw to be caught by outer catch block
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Pitch email retrieval failed', {
      jobId,
      market,
      duration,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Failed to retrieve pitch email',
      message: error.message,
      jobId,
      market,
      duration,
      timestamp: new Date().toISOString()
    });
  }
});

// Download endpoint for job results
app.get('/api/v1/content/download/:jobId', async (req, res) => {
  const startTime = Date.now();
  const { jobId } = req.params;
  
  try {
    logger.info('Download request received', {
      jobId,
      timestamp: new Date().toISOString()
    });

    // Validate parameters
    if (!jobId) {
      logger.warn('Invalid download request - missing jobId', { jobId });
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'jobId is required',
        timestamp: new Date().toISOString()
      });
    }

    // Construct file paths
    const fs = require('fs').promises;
    const path = require('path');
    const jobDirectory = path.join(__dirname, '../storage/generated', jobId);
    const zipFilePath = path.join(jobDirectory, `${jobId}_press_releases.zip`);
    
    logger.info('Attempting to serve download file', {
      jobId,
      zipFilePath,
      jobDirectory
    });

    // Check if ZIP file exists
    try {
      await fs.access(zipFilePath);
      
      // Get file stats for headers
      const stats = await fs.stat(zipFilePath);
      
      logger.info('Download file found, serving ZIP archive', {
        jobId,
        fileSize: stats.size,
        filePath: zipFilePath
      });

      // Set appropriate headers for file download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${jobId}_press_releases.zip"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'no-cache');

      // Stream the file
      const fileStream = require('fs').createReadStream(zipFilePath);
      
      fileStream.on('error', (streamError) => {
        logger.error('Error streaming download file', {
          jobId,
          error: streamError.message,
          filePath: zipFilePath
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: 'File streaming failed',
            message: 'Unable to stream download file',
            jobId,
            timestamp: new Date().toISOString()
          });
        }
      });

      fileStream.on('end', () => {
        const duration = Date.now() - startTime;
        logger.info('Download completed successfully', {
          jobId,
          duration,
          fileSize: stats.size,
          timestamp: new Date().toISOString()
        });
      });

      // Pipe the file to response
      fileStream.pipe(res);

    } catch (fileError) {
      if (fileError.code === 'ENOENT') {
        logger.warn('Download file not found', {
          jobId,
          zipFilePath,
          error: fileError.message
        });
        return res.status(404).json({
          error: 'Download file not found',
          message: `No download file available for job ${jobId}. The job may still be processing or may have failed.`,
          jobId,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('Error accessing download file', {
          jobId,
          zipFilePath,
          error: fileError.message,
          stack: fileError.stack
        });
        throw fileError; // Re-throw to be caught by outer catch block
      }
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Download request failed', {
      jobId,
      duration,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      error: 'Download failed',
      message: error.message,
      jobId,
      duration,
      timestamp: new Date().toISOString()
    });
  }
});

// Import and register lineage dashboard routes
const lineageDashboardRoutes = require('./routes/lineageDashboard');
app.use('/api/v1/lineage', lineageDashboardRoutes);

// Import and register markets routes
const marketsRoutes = require('./routes/markets');
app.use('/api/v1/markets', marketsRoutes);

// Import and register content retrieval routes (Phase 2: S3 Migration)
const contentRoutes = require('./routes/content');
app.use('/api/v1/content', contentRoutes);

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  res.status(404).json({
    error: 'Route not found',
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server with controller initialization
if (require.main === module) {
  const startServer = async () => {
    try {
      // Initialize content generation controller
      logger.info('🔄 Initializing content generation controller...');
      await contentGenerationController.initialize();
      logger.info('✅ Content generation controller initialized successfully');
      
      // Start the server
      app.listen(PORT, () => {
        logger.info(`Press Release Generation Backend started`, {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          features: {
            aiFirstDataSource: 'enabled',
            circuitBreaker: 'enabled',
            qualityScoring: 'enabled',
            perplexityIntegration: !!process.env.PERPLEXITY_API_KEY,
            firecrawlIntegration: !!process.env.FIRECRAWL_API_KEY,
            bedrockIntegration: !!process.env.AWS_REGION
          }
        });
        logger.info('🎯 Content generation service ready and initialized');
      });
    } catch (error) {
      logger.error('❌ Failed to initialize content generation controller:', error);
      logger.error('Server startup aborted due to initialization failure');
      process.exit(1);
    }
  };
  
  startServer();
}

module.exports = app;