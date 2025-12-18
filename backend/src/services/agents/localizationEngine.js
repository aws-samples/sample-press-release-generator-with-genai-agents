const BaseAgent = require('./baseAgent');
const bedrockService = require('../bedrock');
const marketDataService = require('../marketData');
const marketCodeMappingService = require('../marketCodeMapping');
const { logger, createAgentLoggers } = require('../../utils/logger');
const { ValidationError, ExternalServiceError } = require('../../utils/errorHandler');
const { getMarketProfile } = require('../../data/marketProfiles');
const MarketExpertInsights = require('../marketExpertInsights');
const { calculateBedrockCost } = require('../../utils/costCalculator');
const OutputFormatter = require('./outputFormatter');

/**
 * Localization Engine Agent
 * Specializes in generating market-specific press release content
 * 
 * Features:
 * - Claude 4 integration for content generation
 * - Market-specific content adaptation using Phase 2 data
 * - Structured prompt engineering with anti-hallucination constraints
 * - Regional language patterns and local terminology
 * - Content personalization based on market demographics
 */
class LocalizationEngine extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Localization Engine', {
      maxRetries: 3,
      retryDelay: 2000,
      timeout: 120000, // 2 minutes - increased from 45 seconds for 10-market processing
      enableMetrics: true,
      ...options
    }, lineageService);

    this.bedrockService = bedrockService;
    this.marketDataService = marketDataService; // Use singleton instance
    
    // Initialize Market Expert Insights service
    this.marketExpertInsights = new MarketExpertInsights({
      tavilyService: require('../tavilyService'),
      bedrockService: this.bedrockService,
      logger: createAgentLoggers('LocalizationEngine-ExpertInsights')
    });
    
    // Initialize agent-specific logging
    this.agentLogger = createAgentLoggers('localizationengine');
    
    // Initialize quote database
    this._initializeQuoteSystem();
    
    // Localization configuration
    this.config = {
      maxContentLength: 8000,
      minContentLength: 500,
      confidenceThreshold: 80,
      temperatureSettings: {
        creative: 0.7,
        balanced: 0.3,
        conservative: 0.1
      },
      regionalPatterns: this._initializeRegionalPatterns(),
      antiHallucinationConstraints: this._initializeAntiHallucinationConstraints()
    };

    this.log('info', 'Localization Engine created', { config: this.config });
    this.agentLogger.info('Localization Engine agent initialized', {
      agentName: this.name,
      config: {
        maxContentLength: this.config.maxContentLength,
        minContentLength: this.config.minContentLength,
        confidenceThreshold: this.config.confidenceThreshold,
        temperatureSettings: this.config.temperatureSettings
      }
    });
  }

  /**
   * Initialize the localization engine
   */
  async initialize() {
    try {
      this.agentLogger.actionStarted('initialization', {
        agentName: this.name,
        dependencies: ['marketDataService', 'bedrockService', 'quoteSystem']
      });

      this.log('info', 'Localization Engine initialization started');
      
      // Initialize dependencies
      if (!this.marketDataService.isInitialized) {
        this.agentLogger.debug('Initializing MarketDataService dependency');
        await this.marketDataService.initialize();
        this.agentLogger.debug('MarketDataService initialized successfully');
      }

      // Initialize quote system
      this.agentLogger.debug('Initializing quote system');
      await this._initializeQuoteSystem();
      this.agentLogger.debug('Quote system initialized successfully');

      // Test Bedrock connectivity
      this.agentLogger.debug('Testing Bedrock service connectivity');
      await this.bedrockService.testConnection();
      this.agentLogger.debug('Bedrock service connectivity confirmed');
      
      this.log('info', 'Localization Engine initialized successfully');
      this.agentLogger.actionCompleted('initialization', Date.now(), {
        status: 'success',
        dependencies: {
          marketDataService: this.marketDataService.isInitialized,
          bedrockService: 'connected',
          quoteSystem: 'initialized'
        }
      });
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize Localization Engine', {
        error: error.message,
        stack: error.stack
      });
      this.agentLogger.actionFailed('initialization', error, {
        errorType: error.constructor.name,
        dependencies: {
          marketDataService: this.marketDataService?.isInitialized || false,
          bedrockService: 'unknown',
          quoteSystem: 'failed'
        }
      });
      throw error;
    }
  }

  /**
   * Initialize quote system components
   * @private
   */
  async _initializeQuoteSystem() {
    try {
      // Load quotes from database
      await this.marketExpertInsights.loadQuotes();
      
      this.log('info', 'Quote system initialized', {
        quotesLoaded: this.marketExpertInsights.quotes?.length || 0,
        marketExpertInsights: 'ready'
      });
      
      return true;
    } catch (error) {
      this.log('warn', 'Quote system initialization failed, continuing without quotes', {
        error: error.message
      });
      
      // Don't throw error - continue without quote system
      this.marketExpertInsights = null;
      this.marketExpertInsights = null;
      return false;
    }
  }

  /**
   * Select and integrate quote for market-specific content
   * @param {Object} marketContext - Market context data
   * @param {Object} prVariant - Generated PR variant
   * @param {Object} contentTheme - Content theme for quote selection
   * @returns {Object|null} Selected quote or null if none available
   */
  async selectMarketQuote(marketContext, prVariant, contentTheme = {}) {
    try {
      if (!this.marketExpertInsights) {
        this.log('debug', 'Quote selection engine not available');
        return null;
      }

      // Prepare market context for quote selection
      const quoteMarketContext = {
        market: marketContext.market?.name || marketContext.market,
        location: {
          city: marketContext.market?.name,
          state: marketContext.market?.region,
          region: marketContext.market?.region
        }
      };

      // Prepare content theme
      const quoteContentTheme = {
        primaryTheme: contentTheme.primaryTheme || 'market_trends',
        secondaryThemes: contentTheme.secondaryThemes || ['buyer_behavior', 'inventory_trends'],
        tone: contentTheme.tone || marketContext.personality?.tone || 'professional',
        complexity: contentTheme.complexity || 'moderate',
        personality: marketContext.personality?.traits || ['professional']
      };

      // Select optimal quote with proper market context
      const selectedQuote = await this.marketExpertInsights.selectOptimalQuote(
        quoteMarketContext,
        {
          ...quoteContentTheme,
          market: quoteMarketContext.market  // Add market to contentTheme for location matching
        },
        {
          market: quoteMarketContext.market,  // Add market to marketData for location matching
          ...marketContext.keyInsights
        },
        prVariant
      );

      if (selectedQuote) {
        this.log('info', 'Quote selected for market', {
          market: quoteMarketContext.market,
          quoteId: selectedQuote.id,
          source: selectedQuote.source || 'existing',
          confidence: selectedQuote.confidence,
          relevanceScore: selectedQuote.relevanceScore
        });
      } else {
        this.log('debug', 'No suitable quote found for market', {
          market: quoteMarketContext.market
        });
      }

      return selectedQuote;

    } catch (error) {
      this.log('error', 'Quote selection failed', {
        market: marketContext.market?.name,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Generate localized PR variant for a specific market
   */
  async generateVariant(input) {
    // [MARKET-TRACKING] Log market data at entry to generateVariant
    const marketDataKeys = input.marketData ? Object.keys(input.marketData) : [];
    console.log(`[MARKET-TRACKING] LocalizationEngine-Entry: marketDataKeys=${marketDataKeys.length}, markets=[${marketDataKeys.slice(0,5).join(', ')}]`);
    
    return this.execute(this._generateVariant.bind(this), input);
  }

  /**
   * Internal method to generate variant
   */
  async _generateVariant(input) {
    const startTime = Date.now();
    
    // Validate input
    this.validateInput(input, {
      prStructure: { required: true, type: 'object' },
      marketData: { required: true, type: 'object' },
      market: { required: true, type: 'string' },
      jobId: { required: false, type: 'string' }
    });

    const { prStructure, marketData, market, jobId } = input;

    this.log('info', 'Starting variant generation', {
      market,
      jobId,
      hasMarketData: !!marketData,
      prElements: Object.keys(prStructure)
    });

    this.agentLogger.actionStarted('variant-generation', {
      market,
      jobId,
      inputValidation: {
        prStructureKeys: Object.keys(prStructure),
        marketDataPresent: !!marketData,
        marketDataKeys: marketData ? Object.keys(marketData) : []
      }
    });

    try {
      // Step 1: Analyze market context
      this.agentLogger.debug('Starting market context analysis', { market, jobId });
      const marketContext = await this._analyzeMarketContext(marketData, market);
      this.agentLogger.debug('Market context analysis completed', {
        market,
        jobId,
        contextSummary: marketContext.summary,
        dataQuality: marketContext.dataQuality
      });
      
      // Step 2: Generate localized content
      this.agentLogger.debug('Starting localized content generation', { market, jobId });
      const contentResult = await this._generateLocalizedContent(
        prStructure,
        marketContext,
        market
      );
      const localizedContent = contentResult.content;
      const costData = contentResult.costData;
      this.agentLogger.debug('Localized content generation completed', {
        market,
        jobId,
        contentLength: localizedContent?.length || 0,
        contentPreview: localizedContent?.substring(0, 100) + '...',
        costData: costData ? 'present' : 'missing'
      });
      
      // Step 3: Apply regional patterns and terminology
      this.agentLogger.debug('Starting regional patterns application', { market, jobId });
      const regionalizedContent = await this._applyRegionalPatterns(
        localizedContent,
        marketContext
      );
      this.agentLogger.debug('Regional patterns application completed', {
        market,
        jobId,
        contentLength: regionalizedContent?.length || 0
      });
      
      // Step 3.5: Verify market data integration
      this.agentLogger.debug('Starting market data integration verification', { market, jobId });
      const verifiedContent = await this._verifyMarketDataIntegration(
        regionalizedContent,
        marketContext
      );
      this.agentLogger.debug('Market data integration verification completed', {
        market,
        jobId,
        verificationPassed: !!verifiedContent
      });
      
      // Step 4: Validate and score the generated content
      this.agentLogger.debug('Starting content validation and scoring', { market, jobId });
      const validatedContent = await this._validateGeneratedContent(
        verifiedContent,
        marketContext
      );
      this.agentLogger.debug('Content validation and scoring completed', {
        market,
        jobId,
        qualityScore: validatedContent.qualityScore,
        localizationElements: validatedContent.localizationElements?.length || 0
      });

      // Step 4.5: Apply Business Wire format wrapping
      console.log('🚨 [LocalizationEngine] BEFORE Business Wire format application', {
        market,
        jobId,
        contentLength: validatedContent.content.length,
        timestamp: new Date().toISOString()
      });
      
      this.agentLogger.debug('Applying Business Wire format', { market, jobId });
      this.log('info', '[LocalizationEngine] Applying Business Wire format', {
        market,
        jobId,
        contentLength: validatedContent.content.length
      });
      
      const businessWireContent = this._applyBusinessWireFormat(
        validatedContent.content,
        market
      );
      
      console.log('🚨 [LocalizationEngine] AFTER Business Wire format application', {
        market,
        jobId,
        originalLength: validatedContent.content.length,
        formattedLength: businessWireContent.length,
        hasDateline: businessWireContent.includes('FOR IMMEDIATE RELEASE'),
        hasContactBlock: businessWireContent.includes('###'),
        timestamp: new Date().toISOString()
      });
      
      this.agentLogger.debug('Business Wire format applied', {
        market,
        jobId,
        originalLength: validatedContent.content.length,
        formattedLength: businessWireContent.length
      });
      
      this.log('info', '[LocalizationEngine] Business Wire format applied successfully', {
        market,
        jobId,
        originalLength: validatedContent.content.length,
        formattedLength: businessWireContent.length,
        hasDateline: businessWireContent.includes('FOR IMMEDIATE RELEASE'),
        hasContactBlock: businessWireContent.includes('###')
      });

      // Step 5: Calculate confidence score
      const confidence = this.calculateConfidence({
        dataQuality: marketContext.dataQuality || 85,
        processingSuccess: 100,
        validationScore: validatedContent.qualityScore || 85,
        sourceReliability: marketContext.sourceReliability || 90
      });

      const result = {
        market,
        content: businessWireContent,
        metadata: {
          generatedAt: new Date().toISOString(),
          confidence,
          marketContext: marketContext.summary,
          qualityScore: validatedContent.qualityScore,
          wordCount: validatedContent.content.split(' ').length,
          localizationElements: validatedContent.localizationElements,
          jobId
        },
        cost: {
          provider: 'bedrock',
          model: 'claude-3-7-sonnet',
          inputTokens: costData.inputTokens,
          outputTokens: costData.outputTokens,
          totalTokens: costData.totalTokens,
          inputCost: costData.inputCost,
          outputCost: costData.outputCost,
          totalCost: costData.totalCost,
          currency: 'USD'
        }
      };
      // ✅ CRITICAL BUG FIX (Oct 2, 2025): PROPER UTILIZATION TRACKING
      // Track data utilization AFTER content is successfully generated and integrated
      // This fixes the 0% utilization bug where tracking happened during collection, not after actual use
      if (this.lineageService && jobId && marketData) {
        try {
          // Determine source type from marketData
          const sourceType = marketData.dataSource || marketData.actualDataSourceUsed || 'unknown';
          
          // Only track for Tavily/Perplexity data sources
          if (sourceType === 'tavily' || sourceType === 'ai' || sourceType === 'perplexity') {
            // Generate data object ID from market data if available
            const dataObjectId = marketData.dataObjectId || 
                                `${sourceType}_${market.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await this.lineageService.trackDataObjectUtilization(jobId, {
              dataObjectId,
              sourceType,
              usedInNarrative: true,  // Correct field name for dashboard compatibility
              utilizationContext: 'narrative_generation',
              narrativeSection: 'localized_content',
              confidenceScore: confidence,
              market,
              contentLength: validatedContent.content.length,
              integrationTimestamp: new Date().toISOString()
            });
            
            this.log('info', '✅ UTILIZATION TRACKED: Data successfully integrated into narrative', {
              jobId,
              market,
              sourceType,
              dataObjectId,
              confidence,
              trackingLocation: 'LocalizationEngine._generateVariant (after content generation)'
            });
          }
        } catch (lineageError) {
          this.log('warn', '⚠️ Failed to track data utilization (non-critical)', {
            jobId,
            market,
            error: lineageError.message
          });
          // Continue - lineage tracking is non-critical
        }
      }


      this.log('info', 'Variant generation completed', {
        market,
        jobId,
        confidence,
        qualityScore: validatedContent.qualityScore,
        wordCount: result.metadata.wordCount
      });

      this.agentLogger.actionCompleted('variant-generation', Date.now() - startTime, {
        market,
        jobId,
        success: true,
        metrics: {
          confidence,
          qualityScore: validatedContent.qualityScore,
          wordCount: result.metadata.wordCount,
          processingTimeMs: Date.now() - startTime
        }
      });

      return result;

    } catch (error) {
      this.log('error', 'Variant generation failed', {
        market,
        jobId,
        error: error.message,
        stack: error.stack
      });

      this.agentLogger.actionFailed('variant-generation', error, {
        market,
        jobId,
        errorType: error.constructor.name,
        processingTimeMs: Date.now() - startTime,
        failureStage: 'unknown' // Could be enhanced to track which step failed
      });

      throw error;
    }
  }

  /**
   * Analyze market context for localization
   * PHASE 2 ENHANCEMENT: Data-independent operation with market personalities
   * MARKET CODE MAPPING FIX: Handle airport codes and map to supported markets
   */
  async _analyzeMarketContext(marketData, market) {
    try {
      // MARKET CODE MAPPING FIX: Check if this is an airport code that needs mapping
      let resolvedMarket = market;
      let marketInfo = null;
      
      // Step 1: Try direct market lookup first (now with enhanced fuzzy matching)
      try {
        if (this.marketDataService) {
          marketInfo = this.marketDataService.getMarket(market);
          if (marketInfo) {
            this.log('debug', 'Market found via direct lookup', {
              market,
              marketName: marketInfo.name,
              matchMethod: 'marketDataService'
            });
          }
        }
      } catch (error) {
        this.log('debug', 'Direct market lookup failed, trying mapping', {
          market,
          error: error.message
        });
      }
      
      // Step 2: If direct lookup failed, try airport code mapping (optional fallback)
      if (!marketInfo) {
        try {
          const mappedMarket = marketCodeMappingService.getMarketForAirportCode(market);
          if (mappedMarket) {
            resolvedMarket = mappedMarket.code;
            marketInfo = mappedMarket;
            this.log('info', 'Successfully mapped airport code to market', {
              originalCode: market,
              mappedMarket: resolvedMarket,
              marketName: mappedMarket.name
            });
          }
        } catch (mappingError) {
          this.log('debug', 'Airport code mapping not available, continuing with original market', {
            market,
            error: mappingError.message
          });
        }
      }
      
      // Step 3: If still no market info, throw error
      if (!marketInfo) {
        this.log('error', 'Market not found after all lookup attempts', {
          market,
          attemptedMethods: ['marketDataService', 'marketCodeMapping']
        });
        throw new ValidationError(`Market not found in any data source: ${market}`);
      }

      // TIER 2: Use static market profile as primary source
      // CRITICAL FIX: staticProfile is now OPTIONAL for all modes
      // System can process markets using top-100-markets.json data alone
      const staticProfile = getMarketProfile(resolvedMarket);
      const dataSource = marketData?.dataSource || 'trusted';
      
      // Log profile availability but DO NOT block processing
      if (!staticProfile) {
        this.log('info', 'Processing market without static profile - using top-100-markets.json data', {
          market,
          dataSource,
          hasMarketInfo: !!marketInfo
        });
      }
      
      // REMOVED: No longer throw error for missing staticProfile
      // Markets can be processed with top-100-markets.json data + Tavily enrichment

      // Combine external and static data, prioritizing static profiles for personality
      const combinedMarketInfo = {
        ...(marketInfo || {}),
        ...(staticProfile || {}),
        // Always use static profile personality if available
        personality: staticProfile?.personality || {
          traits: ['Balanced', 'Moderate'],
          terminology: ['local market', 'community'],
          tone: 'Professional, community-focused',
          demographics: 'Mixed demographics',
          context: 'Balanced market'
        }
      };

      // Extract key market insights with enhanced personality integration
      const context = {
        market: combinedMarketInfo,
        region: combinedMarketInfo.region,
        population: combinedMarketInfo.population,
        dataQuality: staticProfile?.dataQuality || 85,
        sourceReliability: staticProfile ? 95 : 75, // Higher reliability for static profiles
        keyInsights: {},
        summary: {},
        personality: combinedMarketInfo.personality,
        marketPersonality: this._buildMarketPersonality(combinedMarketInfo)
      };

      // Analyze real estate data (from external or static)
      const realEstateData = marketData?.realEstate || combinedMarketInfo?.marketTrends || combinedMarketInfo?.housingSupply;
      if (realEstateData) {
        context.keyInsights.realEstate = this._extractRealEstateInsights(realEstateData);
        context.dataQuality += 5;
      }

      // Analyze economic data (from external or static)
      const economicData = marketData?.economic || combinedMarketInfo?.economicIndicators;
      if (economicData) {
        context.keyInsights.economic = this._extractEconomicInsights(economicData);
        context.dataQuality += 5;
      }

      // Analyze demographic data (from external or static)
      const demographicData = marketData?.demographics || combinedMarketInfo?.ageDistribution;
      if (marketData.demographics) {
        context.keyInsights.demographics = this._extractDemographicInsights(marketData.demographics);
        context.dataQuality += 3;
      }

      // Analyze news sentiment
      if (marketData.news) {
        context.keyInsights.news = this._extractNewsInsights(marketData.news);
        context.dataQuality += 2;
      }

      // Create summary for prompt context with enhanced data validation
      context.summary = {
        marketName: marketInfo.name,
        region: marketInfo.region,
        population: marketInfo.population,
        keyTrends: this._identifyKeyTrends(context.keyInsights),
        localTerminology: this._getLocalTerminology(marketInfo.region),
        demographicProfile: context.keyInsights.demographics?.profile ||
                           (marketInfo.personality?.demographics || 'General population')
      };
      
      // Validate key trends and ensure we have at least some data
      if (!context.summary.keyTrends || context.summary.keyTrends.length === 0) {
        this.log('warn', 'No key trends found, generating fallback trends', { market });
        context.summary.keyTrends = this._generateFallbackTrends(marketInfo);
      }
      
      // Ensure we have local terminology
      if (!context.summary.localTerminology || context.summary.localTerminology.length === 0) {
        this.log('warn', 'No local terminology found, using fallback terminology', { market });
        context.summary.localTerminology = ['local market', 'neighborhood', 'community', 'housing market'];
      }
      
      // Log the market context data quality
      this.log('debug', 'Market context summary prepared', {
        market,
        keyTrendsCount: context.summary.keyTrends.length,
        terminologyCount: context.summary.localTerminology.length,
        demographicProfile: context.summary.demographicProfile
      });

      this.log('debug', 'Market context analyzed', {
        market,
        dataQuality: context.dataQuality,
        insightCategories: Object.keys(context.keyInsights)
      });

      return context;

    } catch (error) {
      this.log('error', 'Market context analysis failed', {
        market,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate localized content using Claude 4
   */
  async _generateLocalizedContent(prStructure, marketContext, market) {
    try {
      // Step 1: Select appropriate quote for this market
      let selectedQuote = null;
      console.log('🔍 QUOTE DEBUG: Starting quote selection for market:', market);
      console.log('🔍 QUOTE DEBUG: Quote selection engine available:', !!this.marketExpertInsights);
      
      if (this.marketExpertInsights) {
        try {
          console.log('🔍 QUOTE DEBUG: Attempting to select quote for market:', market);
          this.log('info', 'Attempting to select quote for market', { market });
          
          selectedQuote = await this.selectMarketQuote(
            marketContext,
            prStructure, // Use PR structure as variant data
            {
              primaryTheme: 'market_trends',
              secondaryThemes: ['buyer_behavior', 'inventory_trends'],
              tone: marketContext.personality?.tone || 'professional'
            }
          );
          
          console.log('🔍 QUOTE DEBUG: Quote selection result:', selectedQuote ? 'FOUND' : 'NULL');
          if (selectedQuote) {
            console.log('🔍 QUOTE DEBUG: Selected quote details:', {
              id: selectedQuote.id,
              agent: selectedQuote.agent,
              content: selectedQuote.content?.substring(0, 50) + '...',
              source: selectedQuote.source || 'existing'
            });
            this.log('info', 'Quote selected successfully', {
              market,
              quoteId: selectedQuote.id,
              agent: selectedQuote.agent,
              source: selectedQuote.source || 'existing'
            });
          } else {
            console.log('🔍 QUOTE DEBUG: No quote selected for market:', market);
            this.log('warn', 'No quote selected for market', { market });
          }
        } catch (quoteError) {
          console.log('🔍 QUOTE DEBUG: Quote selection ERROR:', quoteError.message);
          console.log('🔍 QUOTE DEBUG: Quote selection ERROR stack:', quoteError.stack);
          this.log('error', 'Quote selection failed, continuing without quote', {
            market,
            error: quoteError.message,
            stack: quoteError.stack
          });
        }
      } else {
        console.log('🔍 QUOTE DEBUG: Quote selection engine NOT AVAILABLE');
        this.log('warn', 'Quote selection engine not available', { market });
      }

      // Step 2: Build prompt with quote integration
      const prompt = this._buildLocalizationPrompt(prStructure, marketContext, selectedQuote);
      
      this.log('debug', 'Generating localized content', {
        market,
        promptLength: prompt.length,
        temperature: this.config.temperatureSettings.balanced,
        hasQuote: !!selectedQuote,
        quoteSource: selectedQuote?.source || 'none'
      });

      const bedrockResponse = await this.bedrockService.invokeModelWithRetry(prompt, {
        maxTokens: 4000,
        temperature: this.config.temperatureSettings.balanced,
        topP: 0.9,
        stopSequences: ['</CONTENT>', '[END]']
      });

      // 🔍 PRICING DEBUG: Log Bedrock response structure received by LocalizationEngine
      this.log('info', '🔍 PRICING DEBUG: Bedrock response received', {
        market,
        responseType: typeof bedrockResponse,
        isString: typeof bedrockResponse === 'string',
        isObject: typeof bedrockResponse === 'object',
        hasContent: !!bedrockResponse?.content,
        hasUsage: !!bedrockResponse?.usage,
        usageKeys: bedrockResponse?.usage ? Object.keys(bedrockResponse.usage) : [],
        inputTokens: bedrockResponse?.usage?.inputTokens,
        outputTokens: bedrockResponse?.usage?.outputTokens
      });

      // Extract response content and usage data
      const response = bedrockResponse.content || bedrockResponse;
      const usage = bedrockResponse.usage || {};
      
      // 🔍 PRICING DEBUG: Log extracted usage data
      this.log('info', '🔍 PRICING DEBUG: Extracted usage data', {
        market,
        usageObject: usage,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        hasInputTokens: usage.inputTokens !== undefined,
        hasOutputTokens: usage.outputTokens !== undefined
      });
      
      // Calculate API cost
      const costData = calculateBedrockCost(usage.inputTokens, usage.outputTokens);
      
      // 🔍 PRICING DEBUG: Log calculated cost data
      this.log('info', '🔍 PRICING DEBUG: Calculated cost data', {
        market,
        costData,
        inputCost: costData.inputCost,
        outputCost: costData.outputCost,
        totalCost: costData.totalCost
      });

      if (!response || response.length < this.config.minContentLength) {
        throw new ExternalServiceError('Claude 4', 'Generated content too short or empty');
      }

      if (response.length > this.config.maxContentLength) {
        this.log('warn', 'Generated content exceeds maximum length, truncating', {
          market,
          originalLength: response.length,
          maxLength: this.config.maxContentLength
        });
      }

      let finalContent = response.substring(0, this.config.maxContentLength);

      // Step 3: POST-PROCESSING - Ensure authentic quotes are properly integrated
      if (selectedQuote) {
        finalContent = await this._ensureQuoteIntegration(finalContent, selectedQuote, marketContext);
      }

      // Return both content and cost data
      return {
        content: finalContent,
        costData
      };

    } catch (error) {
      this.log('error', 'Content generation failed', {
        market,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Post-processing step to ensure authentic quotes are properly integrated
   * This addresses the issue where Claude ignores quote instructions
   * @param {string} content - Generated content from Claude
   * @param {Object} selectedQuote - The authentic quote that should be used
   * @param {Object} marketContext - Market context for proper integration
   * @returns {string} Content with authentic quote properly integrated
   * @private
   */
  async _ensureQuoteIntegration(content, selectedQuote, marketContext) {
    try {
      this.log('info', 'Post-processing: Ensuring authentic quote integration', {
        market: marketContext.market?.name,
        agent: selectedQuote.agent,
        quoteSource: selectedQuote.source || 'existing'
      });

      // Check if the authentic quote is already properly integrated
      const hasAuthenticQuote = content.includes(selectedQuote.agent) && 
                               content.includes(selectedQuote.content.substring(0, 50));

      if (hasAuthenticQuote) {
        this.log('info', 'Authentic quote already properly integrated', {
          agent: selectedQuote.agent
        });
        return content;
      }

      // Find and replace generic quotes with authentic quote
      const authenticQuoteText = `"${selectedQuote.content}," said ${selectedQuote.agent}, a Example Company Premier agent in ${selectedQuote.location || marketContext.market?.name}.`;

      // Pattern to match generic Example Company quotes
      const genericQuotePatterns = [
        /"[^"]+",?\s*said\s+a\s+local\s+market\s+(specialist|expert)\s+at\s+Example Company/gi,
        /"[^"]+",?\s*said\s+[^,]+,\s*a\s+local\s+market\s+(specialist|expert)\s+at\s+Example Company/gi,
        /"[^"]+"\s*-\s*a\s+local\s+market\s+(specialist|expert)\s+at\s+Example Company/gi,
        /"[^"]+"\s*-\s*[^,]+,\s*a\s+local\s+market\s+(specialist|expert)\s+at\s+Example Company/gi
      ];

      let updatedContent = content;
      let replacementMade = false;

      // Try to replace generic quotes with authentic quote
      for (const pattern of genericQuotePatterns) {
        const matches = updatedContent.match(pattern);
        if (matches && matches.length > 0) {
          // Replace the first generic quote with authentic quote
          updatedContent = updatedContent.replace(pattern, authenticQuoteText);
          replacementMade = true;
          this.log('info', 'Replaced generic quote with authentic quote', {
            agent: selectedQuote.agent,
            pattern: pattern.toString(),
            replacementMade: true
          });
          break;
        }
      }

      // If no generic quote found to replace, insert authentic quote strategically
      if (!replacementMade) {
        updatedContent = this._insertAuthenticQuote(updatedContent, authenticQuoteText, marketContext);
        this.log('info', 'Inserted authentic quote into content', {
          agent: selectedQuote.agent,
          insertionMethod: 'strategic_placement'
        });
      }

      // Verify the integration was successful
      const verificationSuccess = updatedContent.includes(selectedQuote.agent) && 
                                 updatedContent.includes(selectedQuote.content.substring(0, 30));

      this.log('info', 'Quote integration post-processing completed', {
        agent: selectedQuote.agent,
        replacementMade,
        verificationSuccess,
        contentLength: updatedContent.length
      });

      return updatedContent;

    } catch (error) {
      this.log('error', 'Quote integration post-processing failed', {
        error: error.message,
        agent: selectedQuote?.agent
      });
      // Return original content if post-processing fails
      return content;
    }
  }

  /**
   * Insert authentic quote strategically into content
   * @param {string} content - Original content
   * @param {string} authenticQuoteText - Formatted authentic quote
   * @param {Object} marketContext - Market context
   * @returns {string} Content with authentic quote inserted
   * @private
   */
  _insertAuthenticQuote(content, authenticQuoteText, marketContext) {
    try {
      // Find a good insertion point - typically after the second paragraph
      const paragraphs = content.split('\n\n');
      
      if (paragraphs.length >= 3) {
        // Insert after second paragraph (index 1)
        const beforeQuote = paragraphs.slice(0, 2);
        const afterQuote = paragraphs.slice(2);
        
        // Create a connecting paragraph with the authentic quote
        const quoteIntroduction = `Market dynamics in ${marketContext.market?.name} reflect broader regional trends, according to local real estate professionals. ${authenticQuoteText}`;
        
        return [...beforeQuote, quoteIntroduction, ...afterQuote].join('\n\n');
      } else {
        // If content structure is different, append to the end
        return content + `\n\n${authenticQuoteText}`;
      }
    } catch (error) {
      this.log('warn', 'Strategic quote insertion failed, appending to end', {
        error: error.message
      });
      return content + `\n\n${authenticQuoteText}`;
    }
  }

  /**
   * Build structured prompt for localization with enhanced market-specific tailoring
   * PHASE 3 ENHANCEMENT: Improved market data integration and validation
   * QUOTE INTEGRATION: Include selected quote in prompt for authentic local expert voice
   */
  _buildLocalizationPrompt(prStructure, marketContext, selectedQuote = null) {
    const { summary } = marketContext;
    const constraints = this.config.antiHallucinationConstraints;
    
    // Determine market personality based on region and market characteristics
    const marketPersonality = this._getMarketPersonality(summary.marketName, summary.region);

    // Extract master PR content for reference
    const masterPRContent = prStructure.body || '';
    const masterHeadline = prStructure.headline || '';
    
    // Extract key data points from master PR for fact-checking
    const keyDataPoints = this._extractKeyDataPoints(masterPRContent);
    const keyDataPointsText = keyDataPoints.length > 0
      ? keyDataPoints.map(point => `• ${point}`).join('\n')
      : '• No specific data points extracted';
      
    // Extract market-specific data points for integration
    const marketDataPoints = this._extractMarketDataPoints(marketContext);
    const marketDataPointsText = marketDataPoints.length > 0
      ? marketDataPoints.map(point => `• ${point}`).join('\n')
      : '• Limited market-specific data available';
      
    // Extract key trends with validation
    const keyTrends = Array.isArray(summary.keyTrends) && summary.keyTrends.length > 0
      ? summary.keyTrends
      : ['Market data trends limited'];

    // Generate neighborhood-specific context for hyper-localization
    const neighborhoodContext = this._generateNeighborhoodContext(summary.marketName, summary.region);
    
    // Generate human interest hooks for authentic storytelling
    const humanInterestHooks = this._generateHumanInterestHooks(summary.marketName, marketPersonality);
    
    // Generate compelling lead paragraph suggestions
    const leadParagraphGuidance = this._generateLeadParagraphGuidance(masterPRContent, summary.marketName);
    
    // LOCAL DATA ACCURACY ENHANCEMENT: Generate data-rich expert quote guidance
    const expertQuoteGuidance = this._generateDataRichExpertQuoteGuidance(marketContext, summary.marketName);
    
    // LOCAL DATA ACCURACY ENHANCEMENT: Extract local inventory metrics for quotes
    const localInventoryMetrics = this._extractLocalInventoryMetricsForQuotes(marketContext);

    // QUOTE INTEGRATION: Prepare quote information for prompt
    let quoteSection = '';
    if (selectedQuote) {
      quoteSection = `
🚨🚨🚨 CRITICAL MANDATORY REQUIREMENT - ABSOLUTE COMPLIANCE REQUIRED 🚨🚨🚨

THIS IS THE MOST IMPORTANT INSTRUCTION IN THIS ENTIRE PROMPT:

YOU MUST USE THIS EXACT QUOTE WORD-FOR-WORD - NO EXCEPTIONS, NO MODIFICATIONS, NO ALTERNATIVES:

EXACT QUOTE TO USE (COPY EXACTLY):
"${selectedQuote.content}"

EXACT AGENT NAME TO USE (COPY EXACTLY):
${selectedQuote.agent}

EXACT ATTRIBUTION FORMAT (USE EXACTLY):
"${selectedQuote.content}," said ${selectedQuote.agent}, a Example Company Premier agent in ${selectedQuote.location || summary.marketName}.

🚨 ABSOLUTE REQUIREMENTS - FAILURE = COMPLETE REJECTION:
1. Use the EXACT quote text above - every single word must match
2. Use the EXACT agent name: ${selectedQuote.agent} - not "local market expert" or any other generic term
3. Include the exact attribution format shown above
4. Do NOT create any other quotes from any other agents
5. Do NOT modify, paraphrase, or change any part of the quote
6. Do NOT use phrases like "local market specialist" or "market expert"
7. This quote MUST appear in your press release content

VERIFICATION: After writing your response, check that "${selectedQuote.agent}" appears in your text and that the exact quote "${selectedQuote.content.substring(0, 50)}..." is included word-for-word.

SOURCE: ${selectedQuote.source === 'generated' ? 'AI-generated based on market data' : 'Authentic Example Company agent quote from published news reports'}

🚨 THIS QUOTE USAGE IS MANDATORY - NOT OPTIONAL - NOT NEGOTIABLE 🚨`;
    } else {
      quoteSection = `
NO SPECIFIC AUTHENTIC QUOTE AVAILABLE:

EXPERT QUOTE GENERATION REQUIREMENTS:
✅ Create ONE authentic-sounding expert quote that demonstrates deep local market knowledge
✅ Use a realistic agent name appropriate for ${summary.marketName} (not generic names)
✅ Reference as "[Agent Name], a Example Company Premier agent in ${summary.marketName}"
✅ Include specific local data, neighborhood references, and market observations
✅ Ensure quote contains concrete market metrics and local insights
✅ DO NOT use generic "local market expert at Example Company" language
✅ Make the quote sound like a real estate professional with genuine market expertise

QUOTE CONTENT GUIDANCE: Include specific observations about ${summary.marketName} market conditions, inventory levels, buyer behavior, or neighborhood trends.`;
    }
      
    // Log the market data being used
    this.log('debug', 'Building enhanced localization prompt with Phase 2 improvements', {
      market: summary.marketName,
      keyTrendsCount: keyTrends.length,
      marketDataPointsCount: marketDataPoints.length,
      demographicProfile: summary.demographicProfile,
      neighborhoodContextCount: neighborhoodContext.neighborhoods.length,
      humanInterestHooksCount: humanInterestHooks.length,
      hasSelectedQuote: !!selectedQuote,
      quoteSource: selectedQuote?.source || 'none'
    });

    return `You are an expert real estate journalist and communications specialist with deep knowledge of local markets. Your mission is to transform this press release into compelling, locally-authentic content that flows like a professionally written news article and engages ${summary.marketName} residents with genuine local insight and human interest.

MARKET INTELLIGENCE & HYPER-LOCALIZATION DATA:
- "Target Market": ${summary.marketName}
- Region: ${summary.region}
- Population: ${summary.population.toLocaleString()}
- "Market Personality": ${marketPersonality.tone}
- "Key Local Trends": ${keyTrends.join(', ')}
- "Regional Language": ${summary.localTerminology.join(', ')}
- "Audience Profile": ${summary.demographicProfile}

${quoteSection}

NEIGHBORHOOD-SPECIFIC CONTEXT (MUST INTEGRATE):
${neighborhoodContext.neighborhoods.map(n => `• ${n.name}: ${n.characteristics}`).join('\n')}
- "Local Economic Drivers": ${neighborhoodContext.economicDrivers.join(', ')}
- "Transportation Hubs": ${neighborhoodContext.transportationHubs.join(', ')}
- "Notable Landmarks": ${neighborhoodContext.landmarks.join(', ')}

MARKET-SPECIFIC DATA POINTS (SEAMLESSLY INTEGRATE):
${marketDataPointsText}

HUMAN INTEREST STORY HOOKS (INCORPORATE NATURALLY):
${humanInterestHooks.map(hook => `• ${hook}`).join('\n')}

ORIGINAL CONTENT FOUNDATION:
Headline: ${masterHeadline}
"Key Messages": ${prStructure.keyMessages?.join('\n- ') || 'Not provided'}
"Body Content": ${masterPRContent.substring(0, 500)}... (truncated)

FACTUAL DATA POINTS (PRESERVE ACCURACY):
${keyDataPointsText}

COMPELLING LEAD PARAGRAPH GUIDANCE:
${leadParagraphGuidance}

LOCALIZATION STRATEGY - ${marketPersonality.approach}:
${marketPersonality.guidelines.map(guideline => `• ${guideline}`).join('\n')}

ENHANCED AP-STYLE NEWS FORMAT (CRITICAL - NO SECTION HEADERS):
================================================================

[Compelling, Data-Rich Headline with ${summary.marketName} Context - LEAD WITH LOCAL DATA]

${summary.marketName.toUpperCase()}—(BUSINESS WIRE)—(NASDAQ: RDFN) — [LEAD PARAGRAPH: CRITICAL - START WITH LOCAL STATISTICS FIRST. Open with specific ${summary.marketName} data points like active listings, days on market, and local price trends. Include concrete local statistics and neighborhood-specific context. Only reference national data for comparison context, never as the primary focus. This should demonstrate deep local market knowledge.]

[SECOND PARAGRAPH: PRIORITIZE LOCAL INVENTORY & VELOCITY METRICS. Lead with ${summary.marketName}-specific supply/demand data, active listings count, and market velocity indicators. Include neighborhood-level analysis and local buyer behavior patterns. Use national data only to provide context for local trends, not as the main narrative.]

"[EXPERT QUOTE with vivid, data-rich commentary: Must reference specific ${summary.marketName} neighborhoods, include concrete market observations, and demonstrate authentic local expertise. ${expertQuoteGuidance} Include specific area names, local market conditions, and buyer/seller anecdotes with hard numbers like: '${localInventoryMetrics.join("', '")}']," said [Local Expert Name], [Title with regional focus] at exampleCompany.

[THIRD PARAGRAPH: Dive deeper into financing trends and affordability dynamics specific to ${summary.marketName}. Compare local down payment patterns to regional averages, discuss FHA/VA loan usage, and analyze how local economic conditions affect buyer purchasing power.]

[FOURTH PARAGRAPH: Explore neighborhood-specific variations within ${summary.marketName}. Compare different districts, submarkets, or price tiers. Include anecdotal evidence of buyer preferences and seller strategies in different areas.]

[FIFTH PARAGRAPH: Provide forward-looking analysis of what these trends mean for different buyer segments in ${summary.marketName}. Include implications for first-time buyers, move-up buyers, and investors. Reference local economic outlook and seasonal patterns.]

[SIXTH PARAGRAPH: Place ${summary.marketName} in broader regional context while maintaining local focus. Compare to similar markets, discuss regional economic factors, and analyze how ${summary.marketName} fits into larger housing market trends.]

About Example Company
[Enhanced boilerplate with local market presence if applicable]

================================================================

CRITICAL NARRATIVE FLOW REQUIREMENTS (LOCAL DATA ACCURACY PRIORITY):
1. ABSOLUTELY NO SECTION HEADERS - Write as continuous flowing narrative
2. NO bullet points or lists - All information must be woven into natural prose
3. Each paragraph flows seamlessly into the next with smooth transitions
4. Use ${marketPersonality.tone} that authentically reflects ${summary.marketName}
5. Integrate ${summary.region} terminology and local references throughout
6. EVERY paragraph must contain specific local data or neighborhood references
7. Include at least 3 specific neighborhood/district names naturally
8. Quotes must sound like real local experts with genuine market knowledge
9. Maintain journalistic credibility with professional news writing style
10. Create compelling human interest without sacrificing data integrity
11. CRITICAL: LEAD WITH LOCAL DATA - Never start paragraphs with national statistics
12. CRITICAL: Use national data only for comparison context, not primary narrative
13. CRITICAL: Include specific inventory metrics (active listings, days on market)
14. CRITICAL: Expert quotes must contain hard numbers and neighborhood specifics

HYPER-LOCALIZATION REQUIREMENTS (PHASE 2 ENHANCEMENT):
- Reference specific neighborhoods, districts, or submarkets by name
- Include local economic drivers, employers, or industry context
- Mention transportation, infrastructure, or geographic features when relevant
- Use authentic local terminology and market-specific language
- Incorporate inventory levels, sales velocity, and price trends by area
- Add seasonal patterns or timing factors specific to ${summary.marketName}
- Include buyer demographics and preferences unique to the market
- Reference local amenities, schools, or lifestyle factors affecting housing demand

EXPERT QUOTE AUTHENTICITY (CRITICAL IMPROVEMENT):
- Quotes must demonstrate deep local market knowledge with specific examples
- Include concrete observations: "In [specific neighborhood], we're seeing..."
- Reference actual market conditions: inventory levels, price points, buyer behavior
- Use local terminology and market-specific language naturally
- Avoid generic corporate speak - sound like genuine local real estate professionals
- Include anecdotal evidence or specific examples from recent transactions
- Demonstrate understanding of local buyer motivations and market dynamics

HUMAN INTEREST INTEGRATION (NEW REQUIREMENT):
- Weave in relatable buyer/seller stories without using names
- Include lifestyle factors that drive housing decisions in ${summary.marketName}
- Reference community aspects, local culture, or regional characteristics
- Add emotional context that helps readers connect with market trends
- Include implications for families, professionals, or specific demographic groups
- Balance human elements with data-driven reporting

STRICT QUALITY STANDARDS:
${constraints.map(constraint => `• ${constraint}`).join('\n')}
• Content must read like professional journalism, not corporate communications
• Eliminate ALL structural elements (headers, bullets, sections) in favor of narrative flow
• Use active voice and engaging, news-style language throughout
• Include specific local references woven naturally into every paragraph
• Maintain Example Company's authoritative yet accessible brand voice
• Ensure smooth paragraph transitions with connecting phrases
• Create authentic expert quotes that demonstrate genuine local market expertise
• Validate that all market-specific data integrates naturally into the narrative
• NEVER use placeholder text, template variables, or generic market references

Generate a localized press release that reads like a compelling news article written by an experienced real estate journalist who has deep knowledge of ${summary.marketName}'s unique market dynamics, neighborhood characteristics, and local buyer behavior. The content should flow as seamlessly as the master PR while incorporating rich local context and human interest elements.

<CONTENT>`;
  }
  
  /**
   * Extract key data points from master PR for fact-checking
   * @private
   */
  _extractKeyDataPoints(masterPRContent) {
    if (!masterPRContent || typeof masterPRContent !== 'string') {
      return [];
    }
    
    const dataPoints = [];
    const sentences = masterPRContent.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10) {
        // Look for sentences with data points
        if (/\d+%|\$([\d,]+)|increased|decreased|growth|decline|rose|fell/i.test(trimmed)) {
          dataPoints.push(trimmed);
        }
      }
    }
    
    return dataPoints.slice(0, 5); // Limit to top 5 data points
  }

  /**
   * Apply regional patterns and terminology
   */
  async _applyRegionalPatterns(content, marketContext) {
    try {
      const { region } = marketContext.market;
      const patterns = this.config.regionalPatterns[region] || this.config.regionalPatterns.default;

      let regionalizedContent = content;

      // Apply terminology replacements
      for (const [generic, regional] of Object.entries(patterns.terminology)) {
        const regex = new RegExp(`\\b${generic}\\b`, 'gi');
        regionalizedContent = regionalizedContent.replace(regex, regional);
      }

      // Apply regional phrases
      if (patterns.phrases && patterns.phrases.length > 0) {
        // Insert regional phrases naturally into the content
        const sentences = regionalizedContent.split('. ');
        if (sentences.length > 2) {
          const insertIndex = Math.floor(sentences.length / 2);
          const regionalPhrase = patterns.phrases[Math.floor(Math.random() * patterns.phrases.length)];
          sentences[insertIndex] += `, ${regionalPhrase}`;
          regionalizedContent = sentences.join('. ');
        }
      }

      this.log('debug', 'Regional patterns applied', {
        region,
        patternsApplied: Object.keys(patterns.terminology).length
      });

      return regionalizedContent;

    } catch (error) {
      this.log('warn', 'Failed to apply regional patterns, using original content', {
        error: error.message
      });
      return content;
    }
  }

  /**
   * Validate generated content with enhanced structure validation
   * PHASE 3 ENHANCEMENT: Improved validation with market data integration check
   */
  async _validateGeneratedContent(content, marketContext) {
    try {
      const validation = {
        content,
        qualityScore: 0,
        localizationElements: [],
        issues: [],
        marketSpecificScore: 0,
        structureScore: 0,
        contentQualityScore: 0,
        formatCompliance: 0,
        dataIntegrationScore: 0 // New score for market data integration
      };

      // Check content length
      const wordCount = content.split(' ').length;
      if (wordCount < 200) {
        validation.issues.push('Content too short');
        validation.qualityScore -= 20;
      } else if (wordCount > 1500) {
        validation.issues.push('Content too long');
        validation.qualityScore -= 10;
      } else {
        validation.qualityScore += 20;
        validation.contentQualityScore += 20;
      }

      // Check for market-specific references
      const marketName = marketContext.market.name;
      const marketCode = marketContext.market.code;
      
      if (content.toLowerCase().includes(marketName.toLowerCase()) ||
          content.toLowerCase().includes(marketCode.toLowerCase())) {
        validation.localizationElements.push('Market-specific references');
        validation.qualityScore += 25;
        validation.marketSpecificScore += 25;
      } else {
        validation.issues.push('Missing market-specific references');
        validation.qualityScore -= 15;
      }

      // Check for regional terminology
      const region = marketContext.market.region;
      const regionalTerms = this.config.regionalPatterns[region]?.terminology || {};
      
      let regionalTermsFound = 0;
      for (const term of Object.values(regionalTerms)) {
        if (content.toLowerCase().includes(term.toLowerCase())) {
          regionalTermsFound++;
        }
      }
      
      if (regionalTermsFound > 0) {
        validation.localizationElements.push('Regional terminology');
        validation.qualityScore += 15;
        validation.marketSpecificScore += 15;
      }

      // Check for professional tone
      const professionalIndicators = [
        'according to', 'data shows', 'market analysis', 'industry experts',
        'research indicates', 'statistics reveal', 'report finds', 'data indicates',
        'market trends', 'economic indicators', 'housing metrics'
      ];
      
      let professionalScore = 0;
      for (const indicator of professionalIndicators) {
        if (content.toLowerCase().includes(indicator)) {
          professionalScore += 5;
        }
      }
      
      validation.qualityScore += Math.min(professionalScore, 20);
      validation.contentQualityScore += Math.min(professionalScore, 20);

      // Check for required press release format sections
      const requiredSections = [
        { pattern: /PRESS RELEASE\s*-\s*[A-Z\s,-]+/i, section: 'Press Release Header', weight: 10 },
        { pattern: /HEADLINE:/i, section: 'Headline Section', weight: 15 },
        { pattern: /KEY LOCAL HIGHLIGHTS:/i, section: 'Key Local Highlights Section', weight: 15 },
        { pattern: /["'].*["'].*says/i, section: 'Local Quote', weight: 10 },
        { pattern: /MARKET DYNAMICS:/i, section: 'Market Dynamics Section', weight: 15 },
        { pattern: /FINANCING TRENDS:/i, section: 'Financing Trends Section', weight: 15 },
        { pattern: /LOCAL MARKET IMPLICATIONS:/i, section: 'Local Market Implications Section', weight: 15 },
        { pattern: /REGIONAL CONTEXT:/i, section: 'Regional Context Section', weight: 15 },
        { pattern: /Generated:.*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i, section: 'Timestamp', weight: 5 },
        { pattern: /Market:.*\b/i, section: 'Market Name', weight: 5 },
        { pattern: /Quality Score:.*\d+%/i, section: 'Quality Score', weight: 5 }
      ];
      
      let sectionsFound = 0;
      let sectionWeight = 0;
      const missingSections = [];
      
      for (const { pattern, section, weight } of requiredSections) {
        if (pattern.test(content)) {
          sectionsFound++;
          validation.localizationElements.push(section);
          sectionWeight += weight;
        } else {
          missingSections.push(section);
        }
      }
      
      // Calculate format compliance score
      const totalWeight = requiredSections.reduce((sum, section) => sum + section.weight, 0);
      validation.formatCompliance = Math.round((sectionWeight / totalWeight) * 100);
      
      // Add score based on format compliance
      validation.qualityScore += validation.formatCompliance - 50; // Baseline adjustment
      validation.structureScore += validation.formatCompliance;
      
      if (missingSections.length > 0) {
        validation.issues.push(`Missing required sections: ${missingSections.join(', ')}`);
      }
      
      // Check for neighborhood/district references
      const neighborhoodPattern = /neighborhood|district|borough|area|community|suburb/i;
      if (neighborhoodPattern.test(content)) {
        validation.localizationElements.push('Neighborhood references');
        validation.qualityScore += 10;
        validation.marketSpecificScore += 10;
      }
      
      // Check for data points
      const dataPointPatterns = [
        /\d+%\s*(increase|decrease|growth|decline)/i,
        /\$([\d,]+)\s*(median|average|typical)/i,
        /\b(increased|decreased|grew|declined|rose|fell)\b.*\b(by|to)\b.*\d+%/i
      ];
      
      let dataPointsFound = 0;
      for (const pattern of dataPointPatterns) {
        if (pattern.test(content)) {
          dataPointsFound++;
        }
      }
      
      if (dataPointsFound >= 3) {
        validation.localizationElements.push('Multiple data points');
        validation.qualityScore += 15;
        validation.contentQualityScore += 15;
      } else if (dataPointsFound === 0) {
        validation.issues.push('No data points found');
        validation.qualityScore -= 15;
      }
      
      // Check for market-specific data integration
      const marketDataPoints = this._extractMarketDataPoints(marketContext);
      let marketDataIntegrated = 0;
      const contentLower = content.toLowerCase();
      
      // Check for specific market data points in content
      for (const dataPoint of marketDataPoints) {
        // Extract key numbers and terms from data points
        const numbers = dataPoint.match(/\$[\d,]+|\d+%|\d+\.\d+%|\d+/g) || [];
        const keyTerms = dataPoint.split(' ')
          .filter(word => word.length > 5)
          .map(word => word.toLowerCase().replace(/[^a-z]/g, ''));
        
        // Check if any numbers from the data point appear in the content
        for (const number of numbers) {
          if (contentLower.includes(number)) {
            marketDataIntegrated++;
            break;
          }
        }
        
        // Check if key terms from the data point appear in the content
        let termsFound = 0;
        for (const term of keyTerms) {
          if (term.length > 5 && contentLower.includes(term)) {
            termsFound++;
          }
        }
        
        if (termsFound >= 2) {
          marketDataIntegrated++;
        }
      }
      
      // Calculate data integration score
      validation.dataIntegrationScore = Math.min(100, Math.round((marketDataIntegrated / Math.max(1, Math.min(marketDataPoints.length, 5))) * 100));
      
      // Add to quality score based on data integration
      if (validation.dataIntegrationScore >= 80) {
        validation.qualityScore += 20;
        validation.localizationElements.push('Excellent market data integration');
      } else if (validation.dataIntegrationScore >= 60) {
        validation.qualityScore += 10;
        validation.localizationElements.push('Good market data integration');
      } else if (validation.dataIntegrationScore < 40 && marketDataPoints.length >= 3) {
        validation.qualityScore -= 15;
        validation.issues.push('Poor market data integration');
      }

      // Calculate final scores
      validation.marketSpecificScore = Math.min(100, Math.max(0, validation.marketSpecificScore));
      validation.structureScore = Math.min(100, Math.max(0, validation.structureScore));
      validation.contentQualityScore = Math.min(100, Math.max(0, validation.contentQualityScore));
      validation.dataIntegrationScore = Math.min(100, Math.max(0, validation.dataIntegrationScore));
      
      // Weighted overall score with format compliance and data integration
      validation.qualityScore = Math.round(
        (validation.marketSpecificScore * 0.35) +
        (validation.structureScore * 0.25) +
        (validation.contentQualityScore * 0.15) +
        (validation.dataIntegrationScore * 0.15) +
        (validation.formatCompliance * 0.1)
      );
      
      // Ensure quality score is within valid range - honest measurement without artificial floors
      validation.qualityScore = Math.max(0, Math.min(100, validation.qualityScore));

      this.log('debug', 'Content validation completed', {
        qualityScore: validation.qualityScore,
        marketSpecificScore: validation.marketSpecificScore,
        structureScore: validation.structureScore,
        contentQualityScore: validation.contentQualityScore,
        dataIntegrationScore: validation.dataIntegrationScore,
        formatCompliance: validation.formatCompliance,
        localizationElements: validation.localizationElements,
        issues: validation.issues
      });

      return validation;

    } catch (error) {
      this.log('error', 'Content validation failed', {
        error: error.message
      });
      
      return {
        content,
        qualityScore: 70, // Default score
        marketSpecificScore: 70,
        structureScore: 70,
        contentQualityScore: 70,
        formatCompliance: 70,
        localizationElements: [],
        issues: ['Validation failed']
      };
    }
  }

  /**
   * Extract real estate insights from market data
   */
  _extractRealEstateInsights(realEstateData) {
    const insights = {
      trends: [],
      keyMetrics: {}
    };

    try {
      // Extract insights from different sources
      if (realEstateData.sources) {
        for (const [source, data] of Object.entries(realEstateData.sources)) {
          if (data.data) {
            if (data.data.medianPrice) {
              insights.keyMetrics.medianPrice = data.data.medianPrice;
              insights.trends.push('median price data available');
            }
            if (data.data.inventory) {
              insights.keyMetrics.inventory = data.data.inventory;
              insights.trends.push('inventory levels tracked');
            }
            if (data.data.priceChange) {
              insights.keyMetrics.priceChange = data.data.priceChange;
              insights.trends.push('price change analysis');
            }
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to extract real estate insights', { error: error.message });
    }

    return insights;
  }

  /**
   * Extract economic insights from market data
   */
  _extractEconomicInsights(economicData) {
    const insights = {
      trends: [],
      keyMetrics: {}
    };

    try {
      if (economicData.sources) {
        for (const [source, data] of Object.entries(economicData.sources)) {
          if (data.data) {
            if (data.data.unemploymentRate) {
              insights.keyMetrics.unemploymentRate = data.data.unemploymentRate;
              insights.trends.push('employment data');
            }
            if (data.data.jobGrowth) {
              insights.keyMetrics.jobGrowth = data.data.jobGrowth;
              insights.trends.push('job growth tracking');
            }
            if (data.data.medianIncome) {
              insights.keyMetrics.medianIncome = data.data.medianIncome;
              insights.trends.push('income analysis');
            }
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to extract economic insights', { error: error.message });
    }

    return insights;
  }

  /**
   * Extract demographic insights from market data
   */
  _extractDemographicInsights(demographicData) {
    const insights = {
      profile: 'General population',
      characteristics: []
    };

    try {
      if (demographicData.sources) {
        for (const [source, data] of Object.entries(demographicData.sources)) {
          if (data.data) {
            if (data.data.ageDistribution) {
              insights.characteristics.push('age distribution');
            }
            if (data.data.educationLevels) {
              insights.characteristics.push('education levels');
            }
            if (data.data.housingCharacteristics) {
              insights.characteristics.push('housing characteristics');
            }
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to extract demographic insights', { error: error.message });
    }

    return insights;
  }

  /**
   * Extract news insights from market data
   */
  _extractNewsInsights(newsData) {
    const insights = {
      sentiment: 'neutral',
      topics: []
    };

    try {
      if (newsData.sources) {
        for (const [source, data] of Object.entries(newsData.sources)) {
          if (data.data) {
            if (data.data.headlines) {
              insights.topics.push('recent headlines');
            }
            if (data.data.sentiment) {
              insights.sentiment = data.data.sentiment > 0 ? 'positive' : 
                                 data.data.sentiment < 0 ? 'negative' : 'neutral';
            }
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Failed to extract news insights', { error: error.message });
    }

    return insights;
  }

  /**
   * Extract market-specific data points for content integration
   * PHASE 3 ENHANCEMENT: New method to extract market data points
   * ERROR-03 FIX: Updated to work with actual market profile structure
   * @private
   */
  _extractMarketDataPoints(marketContext) {
    const dataPoints = [];
    
    try {
      // ERROR-03 FIX: Extract from actual market profile structure
      const marketInfo = marketContext.market || {};
      
      // Extract basic market information
      if (marketInfo.name) {
        if (marketInfo.population) {
          dataPoints.push(`${marketInfo.name} has a population of approximately ${marketInfo.population.toLocaleString()}`);
        }
        if (marketInfo.region) {
          dataPoints.push(`Located in the ${marketInfo.region} region`);
        }
      }
      
      // Extract economic data from market profile
      if (marketInfo.medianIncome) {
        dataPoints.push(`Median household income of $${marketInfo.medianIncome.toLocaleString()}`);
      }
      if (marketInfo.unemploymentRate) {
        dataPoints.push(`Unemployment rate of ${marketInfo.unemploymentRate}%`);
      }
      if (marketInfo.economicIndicators) {
        const ei = marketInfo.economicIndicators;
        if (ei.gdpPerCapita) {
          dataPoints.push(`GDP per capita of $${ei.gdpPerCapita.toLocaleString()}`);
        }
        if (ei.employmentGrowth !== undefined) {
          const direction = ei.employmentGrowth >= 0 ? 'growth' : 'decline';
          dataPoints.push(`Employment ${direction} rate of ${Math.abs(ei.employmentGrowth).toFixed(1)}%`);
        }
        if (ei.majorIndustries && ei.majorIndustries.length > 0) {
          dataPoints.push(`Major industries include: ${ei.majorIndustries.slice(0, 4).join(', ')}`);
        }
      }
      
      // Extract housing data from market profile
      if (marketInfo.medianHomePrice) {
        dataPoints.push(`Median home price of $${marketInfo.medianHomePrice.toLocaleString()}`);
      }
      if (marketInfo.marketTrends) {
        const mt = marketInfo.marketTrends;
        if (mt.priceGrowthYoY !== undefined) {
          const direction = mt.priceGrowthYoY >= 0 ? 'increased' : 'decreased';
          dataPoints.push(`Median home prices ${direction} by ${Math.abs(mt.priceGrowthYoY).toFixed(1)}% year-over-year`);
        }
        if (mt.daysOnMarket) {
          dataPoints.push(`Median days on market: ${mt.daysOnMarket}`);
        }
        if (mt.inventoryChange !== undefined) {
          const direction = mt.inventoryChange >= 0 ? 'increased' : 'decreased';
          dataPoints.push(`Housing inventory ${direction} by ${Math.abs(mt.inventoryChange).toFixed(1)}%`);
        }
        if (mt.salesVolume) {
          dataPoints.push(`Annual sales volume of ${mt.salesVolume.toLocaleString()} homes`);
        }
      }
      
      // Extract housing supply data
      if (marketInfo.housingSupply) {
        const hs = marketInfo.housingSupply;
        if (hs.vacancyRate) {
          dataPoints.push(`Housing vacancy rate of ${hs.vacancyRate}%`);
        }
        if (hs.ownerOccupied) {
          dataPoints.push(`Homeownership rate of ${hs.ownerOccupied}%`);
        }
        if (hs.totalUnits) {
          dataPoints.push(`Total housing units: ${hs.totalUnits.toLocaleString()}`);
        }
      }
      
      // Extract demographic data from market profile
      if (marketInfo.ageDistribution) {
        const ad = marketInfo.ageDistribution;
        const dominantGroup = this._getDominantAgeGroup(ad);
        if (dominantGroup) {
          dataPoints.push(`Dominant age group: ${dominantGroup}`);
        }
      }
      
      // Extract cost of living data
      if (marketInfo.costOfLiving) {
        dataPoints.push(`Cost of living index: ${marketInfo.costOfLiving}`);
      }
      
      // Extract rent price data
      if (marketInfo.rentPrices) {
        const rp = marketInfo.rentPrices;
        if (rp.oneBedroom) {
          dataPoints.push(`Average one-bedroom rent: $${rp.oneBedroom.toLocaleString()}`);
        }
        if (rp.twoBedroom) {
          dataPoints.push(`Average two-bedroom rent: $${rp.twoBedroom.toLocaleString()}`);
        }
      }
      
      // Extract education level data
      if (marketInfo.educationLevel) {
        const el = marketInfo.educationLevel;
        if (el.bachelors) {
          dataPoints.push(`${el.bachelors}% have bachelor's degrees`);
        }
      }
      
      // LEGACY SUPPORT: Extract from old structure if present
      if (marketContext.basic) {
        if (marketContext.basic.population && !marketInfo.population) {
          dataPoints.push(`${marketContext.basic.name} has a population of approximately ${marketContext.basic.population.toLocaleString()}`);
        }
      }
      
      if (marketContext.economic) {
        if (marketContext.economic.medianIncome && !marketInfo.medianIncome) {
          dataPoints.push(`Median household income of $${marketContext.economic.medianIncome.toLocaleString()}`);
        }
      }
      
      if (marketContext.housing) {
        if (marketContext.housing.medianHomePrice && !marketInfo.medianHomePrice) {
          dataPoints.push(`Median home price of $${marketContext.housing.medianHomePrice.toLocaleString()}`);
        }
      }
      
      // Extract key trends from summary
      if (marketContext.summary?.keyTrends && Array.isArray(marketContext.summary.keyTrends)) {
        marketContext.summary.keyTrends.forEach(trend => {
          if (typeof trend === 'string' && trend.length > 0) {
            dataPoints.push(trend);
          }
        });
      }
      
      this.log('debug', 'Extracted market data points with ERROR-03 fix', {
        count: dataPoints.length,
        categories: {
          marketInfo: marketInfo ? 'present' : 'missing',
          marketInfoKeys: Object.keys(marketInfo),
          economicIndicators: marketInfo.economicIndicators ? 'present' : 'missing',
          marketTrends: marketInfo.marketTrends ? 'present' : 'missing',
          housingSupply: marketInfo.housingSupply ? 'present' : 'missing',
          demographics: marketInfo.ageDistribution ? 'present' : 'missing',
          keyTrends: marketContext.summary?.keyTrends ? marketContext.summary.keyTrends.length : 0,
          // Legacy support
          basic: marketContext.basic ? 'present' : 'missing',
          economic: marketContext.economic ? 'present' : 'missing',
          housing: marketContext.housing ? 'present' : 'missing'
        },
        sampleDataPoints: dataPoints.slice(0, 3) // Show first 3 for debugging
      });
      
    } catch (error) {
      this.log('warn', 'Error extracting market data points', {
        error: error.message,
        stack: error.stack
      });
    }
    
    return dataPoints;
  }
  
  /**
   * Get dominant age group from age distribution data
   * ERROR-03 FIX: Helper method for demographic analysis
   * @private
   */
  _getDominantAgeGroup(ageDistribution) {
    if (!ageDistribution) return null;
    
    let maxPercentage = 0;
    let dominantGroup = null;
    
    const groups = {
      'under25': 'Young adults (under 25)',
      'age25to44': 'Young professionals (25-44)',
      'age45to64': 'Established professionals (45-64)',
      'over65': 'Retirees (65+)'
    };
    
    for (const [key, label] of Object.entries(groups)) {
      if (ageDistribution[key] && ageDistribution[key] > maxPercentage) {
        maxPercentage = ageDistribution[key];
        dominantGroup = label;
      }
    }
    
    return dominantGroup;
  }
  
  /**
   * Format age group for human-readable output
   * @private
   */
  _formatAgeGroup(ageGroup) {
    switch (ageGroup) {
      case 'young': return 'Young adults (under 25)';
      case 'young_professionals': return 'Young professionals (25-44)';
      case 'established_professionals': return 'Established professionals (45-64)';
      case 'retirees': return 'Retirees (65+)';
      default: return 'Mixed age groups';
    }
  }
  
  /**
   * Verify market data integration in generated content
   * PHASE 3 ENHANCEMENT: New method to ensure market data is used
   */
  async _verifyMarketDataIntegration(content, marketContext) {
    try {
      // Extract market-specific data points
      const marketDataPoints = this._extractMarketDataPoints(marketContext);
      
      if (marketDataPoints.length === 0) {
        this.log('warn', 'No market data points available for verification', {
          market: marketContext.market.name
        });
        return content;
      }
      
      // Check if content includes market-specific data
      let dataPointsFound = 0;
      let contentLower = content.toLowerCase();
      
      // Check for market name
      const marketNameLower = marketContext.market.name.toLowerCase();
      if (contentLower.includes(marketNameLower)) {
        dataPointsFound++;
      }
      
      // Check for specific data points
      for (const dataPoint of marketDataPoints) {
        // Extract key numbers and terms from data points
        const numbers = dataPoint.match(/\$[\d,]+|\d+%|\d+\.\d+%|\d+/g) || [];
        const keyTerms = dataPoint.split(' ')
          .filter(word => word.length > 5)
          .map(word => word.toLowerCase().replace(/[^a-z]/g, ''));
        
        // Check if any numbers from the data point appear in the content
        for (const number of numbers) {
          if (contentLower.includes(number)) {
            dataPointsFound++;
            break;
          }
        }
        
        // Check if key terms from the data point appear in the content
        let termsFound = 0;
        for (const term of keyTerms) {
          if (term.length > 5 && contentLower.includes(term)) {
            termsFound++;
          }
        }
        
        if (termsFound >= 2) {
          dataPointsFound++;
        }
      }
      
      this.log('debug', 'Market data integration verification', {
        market: marketContext.market.name,
        dataPointsAvailable: marketDataPoints.length,
        dataPointsFound,
        integrationScore: Math.min(100, Math.round((dataPointsFound / Math.min(marketDataPoints.length, 5)) * 100))
      });
      
      // If insufficient data points found, add a note to the content
      if (dataPointsFound < 3 && marketDataPoints.length >= 3) {
        this.log('warn', 'Insufficient market data integration detected', {
          market: marketContext.market.name,
          dataPointsFound,
          dataPointsAvailable: marketDataPoints.length
        });
        
        // We don't modify the content here, but the validation step will catch this issue
      }
      
      return content;
      
    } catch (error) {
      this.log('warn', 'Failed to verify market data integration', {
        error: error.message,
        market: marketContext.market?.name
      });
      return content;
    }
  }
  
  /**
   * Identify key trends from market insights
   * PHASE 3 ENHANCEMENT: More robust trend identification with validation
   * ERROR-03 FIX: Updated to work with actual market profile structure
   */
  _identifyKeyTrends(insights) {
    const trends = [];

    // Extract trends from different categories (original structure)
    if (insights.realEstate?.trends) {
      trends.push(...insights.realEstate.trends);
    }
    if (insights.economic?.trends) {
      trends.push(...insights.economic.trends);
    }
    if (insights.demographics?.characteristics) {
      trends.push(...insights.demographics.characteristics);
    }
    
    // If we have metrics, convert them to trends (original structure)
    if (insights.realEstate?.keyMetrics) {
      const metrics = insights.realEstate.keyMetrics;
      
      if (metrics.medianPrice) {
        trends.push(`median home price of $${metrics.medianPrice.toLocaleString()}`);
      }
      
      if (metrics.inventory) {
        trends.push(`current inventory of ${metrics.inventory.toLocaleString()} homes`);
      }
      
      if (metrics.priceChange) {
        const direction = metrics.priceChange > 0 ? 'increase' : 'decrease';
        trends.push(`${Math.abs(metrics.priceChange).toFixed(1)}% ${direction} in home prices`);
      }
    }
    
    // Add economic metrics as trends (original structure)
    if (insights.economic?.keyMetrics) {
      const metrics = insights.economic.keyMetrics;
      
      if (metrics.unemploymentRate) {
        trends.push(`unemployment rate of ${metrics.unemploymentRate}%`);
      }
      
      if (metrics.jobGrowth) {
        const direction = metrics.jobGrowth > 0 ? 'growth' : 'decline';
        trends.push(`job ${direction} of ${Math.abs(metrics.jobGrowth).toFixed(1)}%`);
      }
      
      if (metrics.medianIncome) {
        trends.push(`median household income of $${metrics.medianIncome.toLocaleString()}`);
      }
    }

    // ERROR-03 FIX: Extract trends from market context structure
    // This handles the actual market profile data structure from marketProfiles.js
    const marketInfo = insights.market || {};
    
    // Extract from market trends
    if (marketInfo.marketTrends) {
      const mt = marketInfo.marketTrends;
      
      if (mt.priceGrowthYoY !== undefined) {
        const direction = mt.priceGrowthYoY >= 0 ? 'increase' : 'decrease';
        trends.push(`${Math.abs(mt.priceGrowthYoY).toFixed(1)}% year-over-year price ${direction}`);
      }
      
      if (mt.daysOnMarket) {
        trends.push(`${mt.daysOnMarket} days average time on market`);
      }
      
      if (mt.inventoryChange !== undefined) {
        const direction = mt.inventoryChange >= 0 ? 'increase' : 'decrease';
        trends.push(`${Math.abs(mt.inventoryChange).toFixed(1)}% inventory ${direction}`);
      }
      
      if (mt.salesVolume) {
        trends.push(`${mt.salesVolume.toLocaleString()} annual sales volume`);
      }
    }
    
    // Extract from economic indicators
    if (marketInfo.economicIndicators) {
      const ei = marketInfo.economicIndicators;
      
      if (ei.employmentGrowth !== undefined) {
        const direction = ei.employmentGrowth >= 0 ? 'growth' : 'decline';
        trends.push(`${Math.abs(ei.employmentGrowth).toFixed(1)}% employment ${direction}`);
      }
      
      if (ei.majorIndustries && ei.majorIndustries.length > 0) {
        trends.push(`major industries: ${ei.majorIndustries.slice(0, 3).join(', ')}`);
      }
      
      if (ei.gdpPerCapita) {
        trends.push(`$${ei.gdpPerCapita.toLocaleString()} GDP per capita`);
      }
    }
    
    // Extract from basic market info
    if (marketInfo.medianHomePrice) {
      trends.push(`$${marketInfo.medianHomePrice.toLocaleString()} median home price`);
    }
    
    if (marketInfo.medianIncome) {
      trends.push(`$${marketInfo.medianIncome.toLocaleString()} median household income`);
    }
    
    return trends.slice(0, 10); // Limit to top 10 trends for relevance
  }

  /**
   * Calculate confidence score for localization
   * Based on data quality, processing success, validation score, and source reliability
   */
  calculateConfidence({ dataQuality, processingSuccess, validationScore, sourceReliability }) {
    try {
      // Validate input parameters
      const dq = Math.max(0, Math.min(100, dataQuality || 85));
      const ps = Math.max(0, Math.min(100, processingSuccess || 100));
      const vs = Math.max(0, Math.min(100, validationScore || 85));
      const sr = Math.max(0, Math.min(100, sourceReliability || 90));

      // Calculate weighted confidence score
      // Data quality: 30% weight
      // Processing success: 25% weight  
      // Validation score: 25% weight
      // Source reliability: 20% weight
      const confidence = (
        (dq * 0.30) +
        (ps * 0.25) +
        (vs * 0.25) +
        (sr * 0.20)
      );

      // Ensure confidence is within valid range - honest measurement without artificial floors
      const finalConfidence = Math.max(0, Math.min(100, Math.round(confidence)));

      this.agentLogger.debug('Calculated confidence score', {
        dataQuality: dq,
        processingSuccess: ps,
        validationScore: vs,
        sourceReliability: sr,
        confidence: finalConfidence
      });

      return finalConfidence;
    } catch (error) {
      this.agentLogger.error('Error calculating confidence score', { error: error.message });
      // Return default confidence score on error
      return 75;
    }
  }

  /**
   * Apply Business Wire format wrapping to generated content
   * Integrates with OutputFormatter helper methods for professional press release format
   * 
   * @param {string} content - The generated narrative content
   * @param {string} market - Market name for dateline generation
   * @returns {string} Content wrapped in Business Wire format
   */
  _applyBusinessWireFormat(content, market) {
    try {
      // Generate Business Wire dateline directly
      const cityName = market.split('-')[0].trim();
      const stateAbbr = this._getStateAbbreviation(market);
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const dateline = `${cityName.toUpperCase()}, ${stateAbbr} -- ${currentDate} --`;
      
      // Generate Business Wire contact block directly with end marker
      const contactBlock = `Contact:
Example Company Media Relations
press@example.com
(206) 588-6863`;
      
      // CRITICAL FIX: Add ### end marker at the very end per Business Wire format requirements
      const endMarker = '\n\n###';
      
      // Construct Business Wire formatted content
      const businessWireContent = `FOR IMMEDIATE RELEASE

${dateline}

${content}

${contactBlock}${endMarker}`;

      this.log('info', 'Business Wire format applied successfully', {
        market,
        originalLength: content.length,
        formattedLength: businessWireContent.length,
        hasDateline: businessWireContent.includes('FOR IMMEDIATE RELEASE'),
        hasContactBlock: businessWireContent.includes('###'),
        dateline,
        cityName,
        stateAbbr
      });

      return businessWireContent;
      
    } catch (error) {
      this.log('error', 'Failed to apply Business Wire format', {
        market,
        error: error.message,
        stack: error.stack
      });
      
      // Fallback: return original content if formatting fails
      return content;
    }
  }
  
  /**
   * Get state abbreviation from market name
   * @private
   */
  _getStateAbbreviation(marketName) {
    const marketLower = marketName.toLowerCase();
    
    // State mapping based on market names
    if (marketLower.includes('chicago') || marketLower.includes('naperville') || marketLower.includes('elgin')) return 'IL';
    if (marketLower.includes('new york') || marketLower.includes('manhattan') || marketLower.includes('brooklyn')) return 'NY';
    if (marketLower.includes('los angeles') || marketLower.includes('long beach') || marketLower.includes('anaheim')) return 'CA';
    if (marketLower.includes('philadelphia') || marketLower.includes('camden')) return 'PA';
    if (marketLower.includes('boston') || marketLower.includes('cambridge')) return 'MA';
    if (marketLower.includes('miami') || marketLower.includes('fort lauderdale')) return 'FL';
    if (marketLower.includes('dallas') || marketLower.includes('fort worth')) return 'TX';
    if (marketLower.includes('houston')) return 'TX';
    if (marketLower.includes('washington')) return 'DC';
    if (marketLower.includes('atlanta')) return 'GA';
    if (marketLower.includes('phoenix')) return 'AZ';
    if (marketLower.includes('seattle')) return 'WA';
    if (marketLower.includes('san francisco') || marketLower.includes('oakland')) return 'CA';
    if (marketLower.includes('detroit')) return 'MI';
    if (marketLower.includes('minneapolis')) return 'MN';
    if (marketLower.includes('denver')) return 'CO';
    if (marketLower.includes('portland')) return 'OR';
    if (marketLower.includes('las vegas')) return 'NV';
    if (marketLower.includes('austin')) return 'TX';
    
    // Default fallback
    return 'US';
  }
  
  /**
   * Generate fallback trends when no trends are available
   * PHASE 3 ENHANCEMENT: New method to ensure we always have market trends
   * ERROR-03 FIX: Enhanced fallback quality with market-specific data
   */
  _generateFallbackTrends(marketInfo) {
    const fallbackTrends = [];
    
    // Generate trends based on market name and region
    if (marketInfo.name) {
      fallbackTrends.push(`${marketInfo.name} real estate market analysis`);
      
      if (marketInfo.region) {
        fallbackTrends.push(`${marketInfo.region} regional housing patterns`);
      }
      
      // Market-specific fallback trends based on known characteristics
      const marketLower = marketInfo.name.toLowerCase();
      
      if (marketLower.includes('los angeles-long beach-anaheim') || marketLower.includes('lax')) {
        fallbackTrends.push('diverse metropolitan area housing dynamics');
        fallbackTrends.push('multi-county market variations');
        fallbackTrends.push('entertainment and tech industry influence');
        fallbackTrends.push('coastal versus inland pricing patterns');
        fallbackTrends.push('international buyer activity');
      } else if (marketLower.includes('los angeles')) {
        fallbackTrends.push('entertainment industry market influence');
        fallbackTrends.push('luxury coastal property trends');
        fallbackTrends.push('lifestyle-driven buyer preferences');
        fallbackTrends.push('tech sector employment impact');
      } else if (marketLower.includes('new york')) {
        fallbackTrends.push('high-density urban housing dynamics');
        fallbackTrends.push('co-op and condo market trends');
        fallbackTrends.push('borough-specific price variations');
        fallbackTrends.push('international investment activity');
      } else if (marketLower.includes('chicago')) {
        fallbackTrends.push('neighborhood-focused market dynamics');
        fallbackTrends.push('value-conscious buyer trends');
        fallbackTrends.push('architectural heritage considerations');
        fallbackTrends.push('lakefront versus inland variations');
      } else if (marketLower.includes('boston')) {
        fallbackTrends.push('education sector housing demand');
        fallbackTrends.push('historic preservation market factors');
        fallbackTrends.push('tech corridor employment influence');
        fallbackTrends.push('student housing market dynamics');
      } else if (marketLower.includes('philadelphia')) {
        fallbackTrends.push('historic district market characteristics');
        fallbackTrends.push('tri-state area commuter patterns');
        fallbackTrends.push('neighborhood revitalization trends');
        fallbackTrends.push('value market opportunities');
      } else if (marketLower.includes('miami')) {
        fallbackTrends.push('international buyer market influence');
        fallbackTrends.push('luxury waterfront property trends');
        fallbackTrends.push('seasonal market fluctuations');
        fallbackTrends.push('investment property demand');
      } else if (marketLower.includes('dallas') || marketLower.includes('houston')) {
        fallbackTrends.push('corporate relocation market impact');
        fallbackTrends.push('new construction availability');
        fallbackTrends.push('master-planned community growth');
        fallbackTrends.push('energy sector employment influence');
      } else if (marketLower.includes('washington')) {
        fallbackTrends.push('government employment market stability');
        fallbackTrends.push('policy professional housing demand');
        fallbackTrends.push('metro accessibility considerations');
        fallbackTrends.push('security clearance buyer patterns');
      } else if (marketLower.includes('atlanta')) {
        fallbackTrends.push('business relocation market growth');
        fallbackTrends.push('suburban expansion patterns');
        fallbackTrends.push('transportation corridor development');
        fallbackTrends.push('corporate headquarters influence');
      } else {
        // Generic but market-relevant fallback trends
        fallbackTrends.push('local employment market influence');
        fallbackTrends.push('regional economic development patterns');
        fallbackTrends.push('demographic shift housing impact');
        fallbackTrends.push('infrastructure development effects');
      }
    }
    
    // Add generic but useful trends if we don't have enough
    if (fallbackTrends.length < 4) {
      fallbackTrends.push('local housing market conditions');
      fallbackTrends.push('buyer and seller dynamics');
      fallbackTrends.push('neighborhood-specific considerations');
      fallbackTrends.push('seasonal market patterns');
      fallbackTrends.push('financing trend impacts');
    }
    
    // Log fallback trend generation
    this.log('info', 'Generated enhanced fallback trends', {
      market: marketInfo.name,
      region: marketInfo.region,
      trendsGenerated: fallbackTrends.length,
      marketSpecific: fallbackTrends.length > 3,
      trends: fallbackTrends.slice(0, 3) // Show first 3 for debugging
    });
    
    return fallbackTrends.slice(0, 6); // Return up to 6 quality trends
  }

  /**
   * Get local terminology for region
   */
  _getLocalTerminology(region) {
    const patterns = this.config.regionalPatterns[region] || this.config.regionalPatterns.default;
    return Object.values(patterns.terminology || {});
  }

  /**
   * Initialize regional patterns for localization
   */
  _initializeRegionalPatterns() {
    return {
      Northeast: {
        terminology: {
          'neighborhood': 'neighborhood',
          'downtown': 'downtown',
          'suburb': 'suburb',
          'metro area': 'tri-state area',
          'apartment': 'co-op or condo',
          'housing market': 'real estate market',
          'home prices': 'property values',
          'buyers': 'purchasers',
          'rental market': 'rental market',
          'affordable housing': 'rent-stabilized units'
        },
        phrases: [
          'in the heart of the Northeast corridor',
          'reflecting the region\'s strong economic fundamentals',
          'consistent with Northeast market trends',
          'across the five boroughs',
          'in Manhattan\'s competitive market',
          'throughout the tri-state region',
          'given NYC\'s inventory constraints',
          'with strong transit connectivity'
        ]
      },
      South: {
        terminology: {
          'neighborhood': 'community',
          'downtown': 'city center',
          'suburb': 'suburban community',
          'metro area': 'metropolitan region'
        },
        phrases: [
          'in the growing Southern market',
          'reflecting the region\'s economic expansion',
          'aligned with Southern growth patterns'
        ]
      },
      Midwest: {
        terminology: {
          'neighborhood': 'neighborhood',
          'downtown': 'downtown core',
          'suburb': 'suburban area',
          'metro area': 'metro region'
        },
        phrases: [
          'in the stable Midwest market',
          'reflecting the region\'s steady growth',
          'consistent with Midwest market fundamentals'
        ]
      },
      West: {
        terminology: {
          'neighborhood': 'district',
          'downtown': 'urban core',
          'suburb': 'suburban enclave',
          'metro area': 'metropolitan area'
        },
        phrases: [
          'in the dynamic Western market',
          'reflecting the region\'s innovation economy',
          'aligned with West Coast market dynamics'
        ]
      },
      default: {
        terminology: {
          'neighborhood': 'area',
          'downtown': 'city center',
          'suburb': 'suburban area',
          'metro area': 'metropolitan area'
        },
        phrases: [
          'in the local market',
          'reflecting regional trends',
          'consistent with market fundamentals'
        ]
      }
    };
  }

  /**
   * Initialize anti-hallucination constraints
   */
  _initializeAntiHallucinationConstraints() {
    return [
      'Only use market data and statistics that have been explicitly provided',
      'Do not invent specific numbers, percentages, or statistics',
      'Reference only the market name and region that have been specified',
      'Avoid making predictions about future market performance',
      'Use general industry language when specific data is not available',
      'Maintain factual accuracy and avoid speculative statements',
      'If uncertain about a fact, use qualifying language like "according to recent data"',
      'Do not reference specific dates unless provided in the market data',
      'Avoid naming specific competitors or other real estate companies',
      'Focus on market trends rather than specific property details'
    ];
  }

  /**
   * Get agent status with localization-specific metrics
   */
  getStatus() {
    const baseStatus = super.getStatus();
    
    return {
      ...baseStatus,
      capabilities: {
        contentGeneration: true,
        marketLocalization: true,
        regionalPatterns: Object.keys(this.config.regionalPatterns).length,
        antiHallucinationConstraints: this.config.antiHallucinationConstraints.length
      },
      configuration: {
        maxContentLength: this.config.maxContentLength,
        minContentLength: this.config.minContentLength,
        confidenceThreshold: this.config.confidenceThreshold
      }
    };
  }

  /**
   * Build comprehensive market personality from static profiles
   * PHASE 2 ENHANCEMENT: Market-specific personalities for all top 10 markets
   */
  _buildMarketPersonality(marketInfo) {
    const personality = marketInfo.personality || {};
    
    return {
      traits: personality.traits || ['Balanced', 'Professional'],
      terminology: personality.terminology || ['local market', 'community'],
      tone: personality.tone || 'Professional, community-focused',
      demographics: personality.demographics || 'Mixed demographics',
      context: personality.context || 'Balanced market',
      
      // Enhanced personality elements for content generation
      communicationStyle: {
        directness: this._getDirectnessLevel(personality.traits),
        formality: this._getFormalityLevel(personality.tone),
        urgency: this._getUrgencyLevel(personality.traits),
        dataFocus: this._getDataFocusLevel(personality.traits)
      },
      
      // Market-specific content guidelines
      contentGuidelines: this._generateContentGuidelines(personality),
      
      // Terminology preferences
      preferredTerms: this._buildPreferredTerminology(personality.terminology),
      
      // Tone modifiers for different content types
      toneModifiers: {
        headlines: this._getHeadlineTone(personality.tone),
        body: this._getBodyTone(personality.tone),
        quotes: this._getQuoteTone(personality.tone)
      }
    };
  }

  /**
   * Generate content guidelines based on market personality
   */
  _generateContentGuidelines(personality) {
    const guidelines = [];
    
    if (personality.traits?.includes('Direct')) {
      guidelines.push('Use direct, efficient language that gets straight to the point');
      guidelines.push('Lead with hard data and concrete market metrics');
    }
    
    if (personality.traits?.includes('Fast-paced')) {
      guidelines.push('Emphasize market velocity and timing');
      guidelines.push('Use active voice and dynamic language');
    }
    
    if (personality.traits?.includes('Luxury-focused')) {
      guidelines.push('Emphasize premium market segments and high-end properties');
      guidelines.push('Use sophisticated, aspirational language');
    }
    
    if (personality.traits?.includes('Value-conscious')) {
      guidelines.push('Highlight affordability and value propositions');
      guidelines.push('Focus on practical benefits and cost considerations');
    }
    
    if (personality.traits?.includes('Family-focused')) {
      guidelines.push('Emphasize family-friendly amenities and community aspects');
      guidelines.push('Reference schools, safety, and neighborhood character');
    }
    
    // Default guidelines
    if (guidelines.length === 0) {
      guidelines.push('Use professional, informative tone');
      guidelines.push('Balance data with market context');
      guidelines.push('Focus on relevant market trends');
    }
    
    return guidelines;
  }

  /**
   * Build preferred terminology from market personality
   */
  _buildPreferredTerminology(terminology) {
    if (!terminology || !Array.isArray(terminology)) {
      return ['local market', 'community', 'residents', 'neighborhood'];
    }
    
    return terminology;
  }

  /**
   * Get directness level for communication style
   */
  _getDirectnessLevel(traits) {
    if (traits?.includes('Direct') || traits?.includes('No-nonsense')) return 'high';
    if (traits?.includes('Diplomatic') || traits?.includes('Subtle')) return 'low';
    return 'medium';
  }

  /**
   * Get formality level for communication style
   */
  _getFormalityLevel(tone) {
    if (tone?.includes('sophisticated') || tone?.includes('professional')) return 'high';
    if (tone?.includes('casual') || tone?.includes('friendly')) return 'low';
    return 'medium';
  }

  /**
   * Get urgency level for communication style
   */
  _getUrgencyLevel(traits) {
    if (traits?.includes('Fast-paced') || traits?.includes('Urgent')) return 'high';
    if (traits?.includes('Relaxed') || traits?.includes('Steady')) return 'low';
    return 'medium';
  }

  /**
   * Get data focus level for communication style
   */
  _getDataFocusLevel(traits) {
    if (traits?.includes('Results-oriented') || traits?.includes('Data-driven')) return 'high';
    if (traits?.includes('Emotional') || traits?.includes('Story-focused')) return 'low';
    return 'medium';
  }

  /**
   * Get headline tone based on market personality
   */
  _getHeadlineTone(tone) {
    if (tone?.includes('urgent') || tone?.includes('competitive')) return 'dynamic';
    if (tone?.includes('sophisticated') || tone?.includes('luxury')) return 'elegant';
    if (tone?.includes('practical') || tone?.includes('value')) return 'straightforward';
    return 'professional';
  }

  /**
   * Get body tone based on market personality
   */
  _getBodyTone(tone) {
    if (tone?.includes('direct') || tone?.includes('efficient')) return 'concise';
    if (tone?.includes('aspirational') || tone?.includes('lifestyle')) return 'engaging';
    if (tone?.includes('community') || tone?.includes('family')) return 'warm';
    return 'informative';
  }

  /**
   * Get quote tone based on market personality
   */
  _getQuoteTone(tone) {
    if (tone?.includes('authoritative') || tone?.includes('expert')) return 'confident';
    if (tone?.includes('approachable') || tone?.includes('friendly')) return 'conversational';
    if (tone?.includes('sophisticated') || tone?.includes('premium')) return 'polished';
    return 'professional';
  }

  /**
   * Get market-specific personality and communication style
   */
  _getMarketPersonality(marketName, region) {
    // Philadelphia/Tri-State Area - Enhanced profile based on Philadelphia example
    if (marketName.toLowerCase().includes('philadelphia') || marketName.toLowerCase().includes('camden') || marketName.toLowerCase().includes('wilmington')) {
      return {
        tone: 'direct, practical, and community-focused',
        approach: 'PHILADELPHIA TRI-STATE APPROACH - Balanced, community-oriented with regional expertise',
        guidelines: [
          'Use "tri-state area" terminology when referring to the broader Philadelphia-Camden-Wilmington region',
          'Reference specific neighborhoods and their distinct characteristics across the metro area',
          'Emphasize the diverse submarkets across state lines (PA, NJ, DE, MD)',
          'Include references to regional economic drivers: healthcare, education, manufacturing, and services',
          'Highlight the balance of urban, suburban, and semi-rural communities in the metro area',
          'Use straightforward, practical language that resonates with the region\'s sensibility',
          'Reference transportation infrastructure: regional rail, highways, bridges connecting the tri-state area',
          'Acknowledge the distinct state-specific regulations and market conditions',
          'Include references to the region\'s historical context and established communities',
          'Balance Philadelphia-centric focus with appropriate mentions of Camden, Wilmington, and suburban areas',
          'Use "purchasers" instead of "buyers" to maintain the formal yet approachable tone'
        ]
      };
    }
    
    // NYC/Northeast - Enhanced Direct, fast-paced, data-driven with NYC-specific market expertise
    if (marketName.toLowerCase().includes('new york') || marketName.toLowerCase().includes('manhattan') || marketName.toLowerCase().includes('brooklyn') || marketName.toLowerCase().includes('queens') || marketName.toLowerCase().includes('bronx') || marketName.toLowerCase().includes('staten island') || region === 'Northeast') {
      return {
        tone: 'direct, data-driven, and market-savvy',
        approach: 'NYC MARKET APPROACH - Fast-paced, no-nonsense, numbers-focused with NYC real estate expertise',
        guidelines: [
          'Use direct, efficient language that gets straight to the point - New Yorkers value time',
          'Lead with hard data and concrete market metrics - numbers drive NYC decisions',
          'Use NYC-specific real estate terminology: co-ops, condos, rent-stabilized units, board packages, maintenance fees',
          'Reference specific boroughs with local market dynamics: Manhattan luxury, Brooklyn gentrification, Queens diversity, Bronx affordability',
          'Emphasize transit accessibility: subway lines, commuter rail, walkability scores, neighborhood connectivity',
          'Include NYC market velocity indicators: days on market, bidding wars, cash offers, above-asking sales',
          'Reference local economic drivers: Wall Street, tech sector, media industry, tourism, real estate investment',
          'Use confident, authoritative tone that reflects NYC\'s competitive and sophisticated market',
          'Include tri-state area context: commuter patterns from NJ/CT, regional market dynamics',
          'Reference NYC-specific challenges: inventory constraints, zoning regulations, co-op board approvals',
          'Emphasize investment potential and market resilience typical of NYC real estate'
        ]
      };
    }
    
    // Los Angeles-Long Beach-Anaheim MSA - Diverse, aspirational, multi-sector economy
    if (marketName.toLowerCase().includes('los angeles-long beach-anaheim') || marketName.toLowerCase().includes('lax') || (marketName.toLowerCase().includes('los angeles') && marketName.toLowerCase().includes('long beach'))) {
      return {
        tone: 'diverse, aspirational, and economically dynamic',
        approach: 'LA-LONG BEACH-ANAHEIM MSA APPROACH - Multi-sector economy, diverse communities, lifestyle-focused',
        guidelines: [
          'Emphasize the diverse economic base spanning entertainment, technology, aerospace, and international trade',
          'Reference the geographic diversity from urban cores to coastal communities across multiple counties',
          'Highlight transportation networks connecting LA, Long Beach, and Anaheim areas',
          'Include major employment centers across all three metropolitan areas',
          'Mention specific neighborhoods across the MSA: Downtown LA, Santa Monica, Long Beach, Anaheim, Pasadena',
          'Address varied housing markets from luxury coastal to affordable inland communities',
          'Reference cultural diversity and varied lifestyle preferences across the region',
          'Include port activity, entertainment industry, and tourism economic drivers',
          'Balance urban amenities with suburban family-friendly communities',
          'Use terminology that resonates with the diverse MSA population',
          'Reference the MSA\'s role as a major economic hub for Southern California'
        ]
      };
    }
    // LA/West Coast - Lifestyle-focused, aspirational, trend-aware (broader LA area)
    else if (marketName.toLowerCase().includes('los angeles') || marketName.toLowerCase().includes('california') || region === 'West') {
      return {
        tone: 'lifestyle-focused and aspirational',
        approach: 'LA MARKET APPROACH - Lifestyle-oriented, trend-conscious, aspirational',
        guidelines: [
          'Emphasize lifestyle benefits and quality of life aspects',
          'Reference entertainment industry, tech sector, or innovation economy',
          'Use aspirational language that connects to dreams and lifestyle goals',
          'Mention specific areas, beaches, or lifestyle amenities when relevant',
          'Include references to outdoor living, climate, or cultural attractions',
          'Balance optimism with market realism',
          'Use aspirational, forward-looking language that resonates with LA\'s innovative spirit',
          'Reference specific neighborhoods and their unique characteristics',
          'Include lifestyle-oriented metrics and trends that matter to LA residents'
        ]
      };
    }
    
    // Boston/New England - Academic, historical, established
    if (marketName.toLowerCase().includes('boston') || marketName.toLowerCase().includes('cambridge') || marketName.toLowerCase().includes('newton')) {
      return {
        tone: 'intellectual, established, and historically-aware',
        approach: 'BOSTON MARKET APPROACH - Educated, historically-grounded with regional context',
        guidelines: [
          'Use sophisticated, educated language that resonates with Boston\'s academic culture',
          'Reference the area\'s historical context and established communities',
          'Emphasize education, healthcare, and innovation sectors',
          'Include references to specific neighborhoods and their unique characteristics',
          'Acknowledge the balance between historic preservation and modern development',
          'Reference transportation infrastructure and accessibility to key institutions',
          'Include metrics on education, healthcare, and innovation that matter to Boston residents',
          'Balance focus on urban core with appropriate mentions of surrounding communities'
        ]
      };
    }
    
    // Chicago/Midwest - Practical, value-focused, straightforward
    if (marketName.toLowerCase().includes('chicago') || region === 'Midwest') {
      return {
        tone: 'practical and value-focused',
        approach: 'CHICAGO MARKET APPROACH - Practical, value-conscious, straightforward',
        guidelines: [
          'Emphasize value, affordability, and practical benefits',
          'Use straightforward, honest language without excessive marketing speak',
          'Reference neighborhoods, transportation, or economic stability',
          'Focus on long-term value and community aspects',
          'Include references to local industries, education, or family-friendly features',
          'Maintain Midwestern sensibility - practical but optimistic'
        ]
      };
    }
    
    // Default approach for other markets
    return {
      tone: 'professional and locally-aware',
      approach: 'REGIONAL MARKET APPROACH - Locally-informed, professionally engaging',
      guidelines: [
        'Use professional yet conversational tone appropriate for the region',
        'Reference local economic drivers and market characteristics',
        'Adapt language to reflect regional communication preferences',
        'Include relevant local context and market dynamics',
        'Balance authority with accessibility',
        'Focus on market-specific value propositions',
        'Ensure factual accuracy with master press release data points'
      ]
    };
  }

  /**
   * Generate neighborhood-specific context for hyper-localization
   * PHASE 2 ENHANCEMENT: Micro-market analysis capabilities
   */
  _generateNeighborhoodContext(marketName, region) {
    const marketLower = marketName.toLowerCase();
    
    // Market-specific neighborhood data
    const neighborhoodData = {
      neighborhoods: [],
      economicDrivers: [],
      transportationHubs: [],
      landmarks: []
    };

    // Boston/Cambridge area
    if (marketLower.includes('boston') || marketLower.includes('cambridge')) {
      neighborhoodData.neighborhoods = [
        { name: 'Back Bay', characteristics: 'Victorian architecture, high-end condos, walkable to downtown' },
        { name: 'Cambridge', characteristics: 'University area, tech professionals, diverse housing stock' },
        { name: 'South End', characteristics: 'Historic brownstones, young professionals, restaurant scene' },
        { name: 'Somerville', characteristics: 'Affordable alternative, artists and families, transit-accessible' }
      ];
      neighborhoodData.economicDrivers = ['Healthcare', 'Education', 'Technology', 'Biotech'];
      neighborhoodData.transportationHubs = ['MBTA Red Line', 'Green Line', 'Orange Line', 'Logan Airport'];
      neighborhoodData.landmarks = ['Harvard University', 'MIT', 'Boston Common', 'Fenway Park'];
    }
    // NYC/Manhattan area
    else if (marketLower.includes('new york') || marketLower.includes('manhattan')) {
      neighborhoodData.neighborhoods = [
        { name: 'Upper East Side', characteristics: 'Luxury co-ops, established families, museum district' },
        { name: 'Brooklyn Heights', characteristics: 'Historic charm, young professionals, Manhattan views' },
        { name: 'Long Island City', characteristics: 'New development, tech workers, waterfront living' },
        { name: 'Williamsburg', characteristics: 'Creative community, converted warehouses, trendy dining' }
      ];
      neighborhoodData.economicDrivers = ['Finance', 'Technology', 'Media', 'Real Estate'];
      neighborhoodData.transportationHubs = ['Subway system', 'Penn Station', 'Grand Central', 'JFK Airport'];
      neighborhoodData.landmarks = ['Central Park', 'Brooklyn Bridge', 'Times Square', 'Wall Street'];
    }
    // Los Angeles-Long Beach-Anaheim MSA - Diverse metropolitan area spanning multiple counties
    else if (marketLower.includes('los angeles-long beach-anaheim') || marketLower.includes('lax') || (marketLower.includes('los angeles') && marketLower.includes('long beach'))) {
      neighborhoodData.neighborhoods = [
        { name: 'Downtown LA', characteristics: 'Urban core, high-rise living, arts district, diverse dining scene' },
        { name: 'Santa Monica', characteristics: 'Beach proximity, tech companies, high-end rentals, walkable lifestyle' },
        { name: 'Long Beach', characteristics: 'Port city, diverse communities, affordable coastal living, university area' },
        { name: 'Anaheim', characteristics: 'Family-oriented, entertainment district, suburban communities, good schools' },
        { name: 'Pasadena', characteristics: 'Historic charm, cultural attractions, established neighborhoods, professional families' },
        { name: 'Irvine', characteristics: 'Master-planned communities, tech corridor, excellent schools, newer construction' }
      ];
      neighborhoodData.economicDrivers = ['Entertainment', 'Technology', 'International Trade', 'Aerospace', 'Tourism', 'Manufacturing'];
      neighborhoodData.transportationHubs = ['LAX Airport', 'Long Beach Airport', 'Port of Long Beach', 'Metro Rail System', 'I-5/I-405/I-10 Freeways'];
      neighborhoodData.landmarks = ['Hollywood Sign', 'Santa Monica Pier', 'Disneyland', 'Getty Center', 'Long Beach Convention Center', 'Rose Bowl'];
    }
    // Los Angeles area (broader LA, not airport-specific)
    else if (marketLower.includes('los angeles') || marketLower.includes('la ')) {
      neighborhoodData.neighborhoods = [
        { name: 'Santa Monica', characteristics: 'Beach proximity, tech companies, high-end rentals' },
        { name: 'Beverly Hills', characteristics: 'Luxury estates, entertainment industry, prestigious schools' },
        { name: 'Venice', characteristics: 'Creative community, beachfront condos, startup culture' },
        { name: 'Pasadena', characteristics: 'Family-oriented, historic homes, suburban feel' }
      ];
      neighborhoodData.economicDrivers = ['Entertainment', 'Technology', 'Aerospace', 'Tourism'];
      neighborhoodData.transportationHubs = ['LAX Airport', 'Metro Rail', 'Freeway system', 'Port of LA'];
      neighborhoodData.landmarks = ['Hollywood Sign', 'Santa Monica Pier', 'Griffith Observatory', 'Getty Center'];
    }
    // Chicago area
    else if (marketLower.includes('chicago')) {
      neighborhoodData.neighborhoods = [
        { name: 'Lincoln Park', characteristics: 'Young professionals, lakefront access, dining scene' },
        { name: 'Wicker Park', characteristics: 'Artists and creatives, vintage housing, nightlife' },
        { name: 'River North', characteristics: 'High-rise condos, business district, urban lifestyle' },
        { name: 'Oak Park', characteristics: 'Suburban families, Frank Lloyd Wright homes, good schools' }
      ];
      neighborhoodData.economicDrivers = ['Finance', 'Manufacturing', 'Transportation', 'Healthcare'];
      neighborhoodData.transportationHubs = ['L Train system', 'Union Station', 'O\'Hare Airport', 'Metra'];
      neighborhoodData.landmarks = ['Millennium Park', 'Navy Pier', 'Willis Tower', 'Wrigley Field'];
    }
    // Default/Generic market
    else {
      neighborhoodData.neighborhoods = [
        { name: 'Downtown', characteristics: 'Urban core, high-rise living, business district' },
        { name: 'Suburbs', characteristics: 'Family-oriented, single-family homes, good schools' },
        { name: 'Historic District', characteristics: 'Established community, character homes, walkable' }
      ];
      neighborhoodData.economicDrivers = ['Local business', 'Regional employers', 'Service sector'];
      neighborhoodData.transportationHubs = ['Public transit', 'Major highways', 'Regional airport'];
      neighborhoodData.landmarks = ['City center', 'Local parks', 'Cultural district'];
    }

    return neighborhoodData;
  }

  /**
   * Generate human interest hooks for authentic storytelling
   * PHASE 2 ENHANCEMENT: Anecdotal content generation
   */
  _generateHumanInterestHooks(marketName, marketPersonality) {
    const hooks = [];
    const marketLower = marketName.toLowerCase();

    // Market-specific human interest angles
    if (marketLower.includes('boston') || marketLower.includes('cambridge')) {
      hooks.push('Young professionals balancing student loan payments with homeownership goals');
      hooks.push('Families choosing between urban condos and suburban single-family homes');
      hooks.push('Tech workers leveraging stock options for down payments');
      hooks.push('Empty nesters downsizing from suburban homes to city condos');
    } else if (marketLower.includes('new york')) {
      hooks.push('First-time buyers navigating co-op board approval processes');
      hooks.push('Young couples choosing between Manhattan studios and Brooklyn one-bedrooms');
      hooks.push('Families weighing private school costs against housing budgets');
      hooks.push('International buyers adapting to local market dynamics');
    } else if (marketLower.includes('los angeles-long beach-anaheim') || marketLower.includes('lax') || (marketLower.includes('los angeles') && marketLower.includes('long beach'))) {
      hooks.push('Entertainment industry professionals balancing project cycles with homeownership decisions');
      hooks.push('Tech workers choosing between coastal living and inland affordability');
      hooks.push('International professionals drawn to the diverse cultural communities');
      hooks.push('Families weighing beach proximity against school district quality');
      hooks.push('Young professionals navigating the varied submarkets across LA, Long Beach, and Orange County');
      hooks.push('Empty nesters exploring downsizing options from suburban homes to urban condos');
    } else if (marketLower.includes('los angeles')) {
      hooks.push('Entertainment industry professionals timing purchases with project cycles');
      hooks.push('Tech workers commuting from affordable inland areas to coastal offices');
      hooks.push('Families prioritizing school districts in home search decisions');
      hooks.push('Investors capitalizing on rental demand near major employers');
    } else {
      // Generic hooks that work for most markets
      hooks.push('First-time buyers taking advantage of changing market conditions');
      hooks.push('Families upgrading to larger homes as remote work continues');
      hooks.push('Empty nesters exploring downsizing opportunities');
      hooks.push('Local professionals balancing commute times with housing costs');
    }

    // Add personality-driven hooks
    if (marketPersonality.traits?.includes('Fast-paced')) {
      hooks.push('Buyers making quick decisions in competitive market conditions');
    }
    if (marketPersonality.traits?.includes('Value-conscious')) {
      hooks.push('Savvy buyers finding opportunities in shifting market dynamics');
    }
    if (marketPersonality.traits?.includes('Family-focused')) {
      hooks.push('Growing families prioritizing space and community amenities');
    }

    return hooks.slice(0, 4); // Limit to top 4 hooks
  }

  /**
   * Generate compelling lead paragraph guidance
   * PHASE 2 ENHANCEMENT: AP-style lead paragraph generation
   */
  _generateLeadParagraphGuidance(masterPRContent, marketName) {
    // Extract key trend from master PR
    const trendMatch = masterPRContent.match(/(increasing|decreasing|rising|falling|growing|declining|cooling|heating)/i);
    const trend = trendMatch ? trendMatch[1].toLowerCase() : 'changing';
    
    // Extract key statistic if available
    const statMatch = masterPRContent.match(/(\d+%|\$[\d,]+)/);
    const keyStat = statMatch ? statMatch[1] : 'recent data shows';

    return `Create a compelling lead that immediately establishes the ${trend} trend in ${marketName}'s housing market.
Open with the most newsworthy angle - incorporate ${keyStat} and explain what this means for local buyers and sellers.
The lead should be complete enough to stand alone as a story summary while drawing readers into the full article.
Use active voice and include specific ${marketName} context that demonstrates local market knowledge.`;
  }

  /**
   * Generate data-rich expert quote guidance
   * LOCAL DATA ACCURACY ENHANCEMENT: Issue #7 - Generic Quotes, No Local Data
   */
  _generateDataRichExpertQuoteGuidance(marketContext, marketName) {
    const guidance = [];
    
    // Add specific inventory metrics guidance
    if (marketContext.housing?.medianDaysOnMarket) {
      const dom = marketContext.housing.medianDaysOnMarket;
      guidance.push(`Reference the ${dom} days average time on market`);
    }
    
    // Add price trend guidance with specific numbers
    if (marketContext.housing?.medianHomePrice && marketContext.housing?.medianPriceYoY !== undefined) {
      const price = marketContext.housing.medianHomePrice;
      const change = marketContext.housing.medianPriceYoY;
      const direction = change >= 0 ? 'increased' : 'decreased';
      guidance.push(`Mention that median prices ${direction} ${Math.abs(change).toFixed(1)}% to $${price.toLocaleString()}`);
    }
    
    // Add supply/demand context
    if (marketContext.housing?.housingSupply?.monthsOfInventory) {
      const months = marketContext.housing.housingSupply.monthsOfInventory;
      const condition = months < 3 ? 'tight supply' : months > 6 ? 'ample inventory' : 'balanced conditions';
      guidance.push(`Reference ${condition} with ${months.toFixed(1)} months of inventory`);
    }
    
    // Add neighborhood-specific guidance
    const neighborhoods = this._getMarketSpecificAreas(marketName);
    if (neighborhoods.length > 0) {
      guidance.push(`Specifically mention neighborhoods like ${neighborhoods.slice(0, 2).join(' or ')}`);
    }
    
    return guidance.length > 0 ?
      `Example: 'In ${marketName}, we're seeing ${guidance.join(', ')}.` :
      `Example: 'In ${marketName}, we're seeing specific local market conditions that demonstrate our expertise.'`;
  }

  /**
   * Extract local inventory metrics for expert quotes
   * LOCAL DATA ACCURACY ENHANCEMENT: Issue #6 - Missing Local Inventory & Velocity Metrics
   */
  _extractLocalInventoryMetricsForQuotes(marketContext) {
    const metrics = [];
    
    // Active listings count
    if (marketContext.housing?.housingSupply?.totalUnits && marketContext.housing?.housingSupply?.vacancyRate) {
      const totalUnits = marketContext.housing.housingSupply.totalUnits;
      const vacancyRate = marketContext.housing.housingSupply.vacancyRate;
      const activeListings = Math.round(totalUnits * (vacancyRate / 100) * 0.6);
      metrics.push(`${activeListings.toLocaleString()} active listings`);
    }
    
    // Days on market
    if (marketContext.housing?.medianDaysOnMarket) {
      metrics.push(`${marketContext.housing.medianDaysOnMarket} days average time on market`);
    }
    
    // Months of inventory
    if (marketContext.housing?.housingSupply?.monthsOfInventory) {
      metrics.push(`${marketContext.housing.housingSupply.monthsOfInventory.toFixed(1)} months of inventory`);
    }
    
    // Price per square foot if available
    if (marketContext.housing?.medianHomePrice) {
      const pricePerSqFt = Math.round(marketContext.housing.medianHomePrice / 2000); // Assume 2000 sq ft average
      metrics.push(`approximately $${pricePerSqFt}/sq ft`);
    }
    
    // Down payment amounts
    if (marketContext.housing?.averageDownPayment) {
      metrics.push(`$${marketContext.housing.averageDownPayment.toLocaleString()} average down payment`);
    }
    
    // Fallback metrics if none available
    if (metrics.length === 0) {
      metrics.push('specific local market conditions', 'neighborhood-level data', 'current inventory levels');
    }
    
    return metrics;
  }

  /**
   * Get market-specific areas for quote guidance
   * LOCAL DATA ACCURACY ENHANCEMENT: Neighborhood-specific data integration
   */
  _getMarketSpecificAreas(marketName) {
    const marketLower = marketName.toLowerCase();
    
    if (marketLower.includes('boston')) {
      return ['Back Bay', 'Cambridge', 'South End', 'Somerville'];
    } else if (marketLower.includes('new york')) {
      return ['Manhattan', 'Brooklyn', 'Queens', 'Long Island City'];
    } else if (marketLower.includes('los angeles-long beach-anaheim') || marketLower.includes('lax') || (marketLower.includes('los angeles') && marketLower.includes('long beach'))) {
      return ['Downtown LA', 'Santa Monica', 'Long Beach', 'Anaheim', 'Pasadena', 'Irvine'];
    } else if (marketLower.includes('los angeles')) {
      return ['Santa Monica', 'Beverly Hills', 'Venice', 'Pasadena'];
    } else if (marketLower.includes('chicago')) {
      return ['Lincoln Park', 'Wicker Park', 'River North', 'Oak Park'];
    } else if (marketLower.includes('philadelphia')) {
      return ['Center City', 'Northern Liberties', 'Fishtown', 'University City'];
    }
    
    return ['downtown', 'suburban areas', 'historic districts'];
  }
}

module.exports = LocalizationEngine;
