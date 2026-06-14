const BaseAgent = require('./baseAgent');
const marketDataService = require('../marketData');
const { redisService } = require('../redis'); // Import singleton instance instead of class
const { DataProcessorService } = require('../dataProcessor');
const { logger, createAgentLoggers } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');
const { getMarketProfile, getMarketProfiles } = require('../../data/marketProfiles');

// CRITICAL FIX: Add AI service imports for AI-first data source architecture
const PerplexityService = require('../perplexityService');
const AIFirstDataSourceRouter = require('../aiFirstDataSourceRouter');

// PHASE 1 Example Company INTEGRATION: Import Example Company services for market-specific quotes and anecdotes
// Removed: exampleCompanyQuoteDatabase - replaced by marketExpertInsights service
// Removed: VoicePatternEngine and QuoteSelectionEngine - replaced by marketExpertInsights service

/**
 * Market Researcher Agent
 * Integrates with Phase 2 market data services for content generation
 * 
 * Features:
 * - Integration with Phase 2 market data services
 * - Market-specific data retrieval and aggregation
 * - Data relevance scoring and filtering
 * - Market context preparation for localization
 * - Caching integration for performance optimization
 */
class MarketResearcherAgent extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Market Researcher', {
      maxRetries: 3,
      retryDelay: 2000,
      timeout: 180000, // 3 minutes - increased from 45 seconds for 10-market processing
      cacheTimeout: 3600000, // 1 hour
      ...options
    }, lineageService);

    // Phase 2 service integrations
    this.marketDataService = null;
    this.redisService = null;
    this.dataProcessor = null;
    
    // CRITICAL FIX: Add AI service integrations for AI-first data source architecture
    this.perplexityService = null;
    this.aiDataSourceRouter = null;
    
    // PHASE 1 Example Company INTEGRATION: Initialize Example Company service properties
    // Removed: exampleCompanyQuoteDatabase - no longer needed with marketExpertInsights
    // Removed: voicePatternEngine and quoteSelectionEngine - replaced by marketExpertInsights
    this.exampleCompanyIntegrationEnabled = true; // Enable Example Company integration for Phase 1
    this.exampleCompanyQuoteCache = new Map(); // Performance optimization for quote caching
    
    // Initialize dedicated agent logger
    this.agentLogger = createAgentLoggers('MarketResearcher');

    // Research configuration
    this.config = {
      maxMarketsPerBatch: 20,
      dataFreshnessThreshold: 86400000, // 24 hours
      relevanceScoreThreshold: 70,
      requiredDataPoints: ['population', 'medianIncome', 'housingData'],
      optionalDataPoints: ['demographics', 'economicIndicators', 'marketTrends']
    };

    // Market data schema
    this.schema = {
      markets: {
        required: true,
        type: 'array'
      }
    };
  }

  /**
   * Initialize the Market Researcher Agent
   */
  async initialize() {
    const startTime = Date.now();
    
    this.agentLogger.actionStarted('market-researcher-initialization', {
      agentName: 'Market Researcher',
      maxMarketsPerBatch: this.config.maxMarketsPerBatch,
      dataFreshnessThreshold: this.config.dataFreshnessThreshold,
      relevanceScoreThreshold: this.config.relevanceScoreThreshold,
      requiredDataPoints: this.config.requiredDataPoints,
      optionalDataPoints: this.config.optionalDataPoints
    });

    try {
      this.agentLogger.debug('Starting Market Researcher initialization', {
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        cacheTimeout: this.config.cacheTimeout
      });
      this.log('info', 'Market Researcher initialization started');

      // Initialize Phase 2 services
      this.agentLogger.debug('Initializing Phase 2 market data services');
      this.marketDataService = marketDataService; // Use singleton instance
      this.redisService = redisService; // Use singleton instance
      this.dataProcessor = new DataProcessorService();
      
      // CRITICAL FIX: Initialize AI services for AI-first data source architecture
      this.perplexityService = new PerplexityService();
      this.aiDataSourceRouter = new AIFirstDataSourceRouter();
      this.agentLogger.debug('Phase 2 services and AI services instantiated');
      
      // PHASE 1 Example Company INTEGRATION: Initialize Example Company services (now using marketExpertInsights)
      this.agentLogger.debug('Example Company integration services replaced by marketExpertInsights service');
      // Removed: voicePatternEngine and quoteSelectionEngine instantiation - replaced by marketExpertInsights
      this.agentLogger.debug('Using marketExpertInsights for expert commentary and analysis');

      // Initialize services if they have initialization methods
      let marketDataReady = false;
      let redisReady = false;
      let dataProcessorReady = false;

      try {
        this.agentLogger.debug('Initializing MarketDataService');
        if (typeof this.marketDataService.initialize === 'function') {
          await this.marketDataService.initialize();
          this.log('info', 'MarketDataService initialized');
          this.agentLogger.debug('MarketDataService initialization successful');
          marketDataReady = true;
        } else {
          this.agentLogger.debug('MarketDataService has no initialize method, assuming ready');
          marketDataReady = true;
        }
      } catch (error) {
        this.log('warn', 'MarketDataService initialization failed, will attempt graceful degradation', {
          error: error.message
        });
        this.agentLogger.warn('MarketDataService initialization failed', {
          error: error.message,
          willDegrade: true
        });
      }

      try {
        this.agentLogger.debug('Initializing RedisService for caching');
        if (typeof this.redisService.initialize === 'function') {
          await this.redisService.initialize();
          this.log('info', 'RedisService initialized');
          this.agentLogger.debug('RedisService initialization successful');
          redisReady = true;
        } else {
          this.agentLogger.debug('RedisService has no initialize method, checking if ready');
          redisReady = this.redisService.isReady();
        }
      } catch (error) {
        this.log('warn', 'RedisService initialization failed, caching disabled', {
          error: error.message
        });
        this.agentLogger.warn('RedisService initialization failed', {
          error: error.message,
          cachingDisabled: true
        });
      }

      try {
        this.agentLogger.debug('Initializing DataProcessorService');
        if (typeof this.dataProcessor.initialize === 'function') {
          await this.dataProcessor.initialize();
          this.log('info', 'DataProcessorService initialized');
          this.agentLogger.debug('DataProcessorService initialization successful');
          dataProcessorReady = true;
        } else {
          this.agentLogger.debug('DataProcessorService has no initialize method, assuming ready');
          dataProcessorReady = true;
        }
      } catch (error) {
        this.log('warn', 'DataProcessorService initialization failed, processing limited', {
          error: error.message
        });
        this.agentLogger.warn('DataProcessorService initialization failed', {
          error: error.message,
          processingLimited: true
        });
      }

      // Initialize Example Company services if enabled
      let exampleCompanyServicesReady = false;
      if (this.exampleCompanyIntegrationEnabled) {
        try {
          this.agentLogger.debug('Initializing Example Company services for quote integration');
          
          // Initialize Example Company Quote Database
          if (this.exampleCompanyQuoteDatabase && typeof this.exampleCompanyQuoteDatabase.initialize === 'function') {
            await this.exampleCompanyQuoteDatabase.initialize();
            this.log('info', 'Example Company Quote Database initialized');
            this.agentLogger.debug('Example Company Quote Database initialization successful');
          }
          
          // Removed: Voice Pattern Engine and Quote Selection Engine initialization
          // These services have been replaced by marketExpertInsights service
          
          exampleCompanyServicesReady = true;
          this.log('info', 'Example Company services initialized successfully');
          this.agentLogger.debug('All Example Company services initialization completed');
          
        } catch (error) {
          this.log('warn', 'Example Company services initialization failed, quote enhancement disabled', {
            error: error.message
          });
          this.agentLogger.warn('Example Company services initialization failed', {
            error: error.message,
            quoteEnhancementDisabled: true
          });
          // Continue without Example Company services - graceful degradation
        }
      } else {
        this.agentLogger.debug('Example Company integration disabled via configuration');
      }

      const duration = Date.now() - startTime;
      this.log('info', 'Market Researcher Agent initialized successfully');
      
      this.agentLogger.actionCompleted('market-researcher-initialization', duration, {
        status: 'success',
        initializationTimeMs: duration,
        marketDataReady,
        redisReady,
        dataProcessorReady,
        servicesInitialized: [marketDataReady, redisReady, dataProcessorReady, exampleCompanyServicesReady].filter(Boolean).length,
        totalServices: 4,
        cachingEnabled: redisReady,
        dataProcessingEnabled: dataProcessorReady,
        exampleCompanyIntegrationEnabled: this.exampleCompanyIntegrationEnabled,
        exampleCompanyServicesReady
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.log('error', 'Failed to initialize Market Researcher Agent', {
        error: error.message,
        stack: error.stack
      });
      
      this.agentLogger.actionFailed('market-researcher-initialization', error, {
        initializationTimeMs: duration,
        errorType: error.constructor.name,
        errorMessage: error.message,
        marketDataReady: false,
        redisReady: false,
        dataProcessorReady: false
      });
      
      throw error;
    }
  }

  /**
   * Research market data for content generation
   * Main entry point for market research
   */
  async research(markets, options = {}) {
    // [MARKET-TRACKING] Log markets at entry to research method
    console.log(`[MARKET-TRACKING] MarketResearcher-Entry: count=${markets.length}, first5=[${markets.slice(0,5).map(m => m.name || m).join(', ')}]`);
    return this.execute(this._performResearch.bind(this), markets, options);
  }

  /**
   * Internal method to perform market research
   */
  async _performResearch(markets, options = {}) {
    try {
      // Validate and normalize input
      const normalizedMarkets = this._normalizeMarketInput(markets);
      
      // Use dedicated agent logger
      this.agentLogger.actionStarted('market-research', {
        marketCount: normalizedMarkets.length,
        markets: normalizedMarkets,
        jobId: options.jobId
      });
      
      this.log('info', 'Starting market research', {
        marketCount: normalizedMarkets.length,
        jobId: options.jobId
      });

      // Step 1: Check cache for existing data
      const cachedData = await this._getCachedMarketData(normalizedMarkets, options);
      const uncachedMarkets = normalizedMarkets.filter(market => !cachedData[market]);

      this.log('debug', 'Cache check completed', {
        cachedMarkets: Object.keys(cachedData).length,
        uncachedMarkets: uncachedMarkets.length,
        jobId: options.jobId
      });

      // Step 2: Fetch fresh data for uncached markets
      let freshData = {};
      if (uncachedMarkets.length > 0) {
        freshData = await this._fetchMarketData(uncachedMarkets, options);
        
        // Cache fresh data
        await this._cacheMarketData(freshData, options);
      }

      // Step 3: Combine cached and fresh data
      const allMarketData = { ...cachedData, ...freshData };

      // Step 4: Enrich and contextualize data
      const enrichedData = await this._enrichMarketData(allMarketData, options);

      // Step 5: Score data relevance and quality
      const scoredData = this._scoreDataRelevance(enrichedData, options);

      // Step 6: Filter and prepare final dataset
      const finalData = this._prepareMarketContext(scoredData, options);

      // Step 7: Enhance with Example Company quotes and anecdotes (Phase 1 Integration)
      const enhancedFinalData = await this._enhanceWithExampleCompanyQuotes(finalData, normalizedMarkets);

      this.log('info', 'Market research completed', {
        marketsResearched: Object.keys(enhancedFinalData).length,
        averageRelevanceScore: this._calculateAverageScore(enhancedFinalData),
        exampleCompanyEnhanced: enhancedFinalData.exampleCompanyMetadata ? enhancedFinalData.exampleCompanyMetadata.marketsEnhanced : 0,
        jobId: options.jobId
      });

      // Log successful completion to agent logger
      this.agentLogger.actionCompleted('market-research', Date.now() - (options.startTime || Date.now()), {
        marketsResearched: Object.keys(finalData).length,
        averageRelevanceScore: this._calculateAverageScore(finalData),
        jobId: options.jobId
      });

      return enhancedFinalData;

    } catch (error) {
      this.log('error', 'Market research failed', {
        error: error.message,
        jobId: options.jobId
      });
      
      // Log failure to agent logger
      this.agentLogger.actionFailed('market-research', error, {
        jobId: options.jobId,
        markets: markets
      });
      
      throw error;
    }
  }

  /**
   * Normalize market input to consistent format
   */
  _normalizeMarketInput(markets) {
    if (Array.isArray(markets)) {
      return markets.map(market => typeof market === 'string' ? market : market.code || market.name);
    }
    
    if (typeof markets === 'object') {
      return Object.keys(markets);
    }
    
    if (typeof markets === 'string') {
      return [markets];
    }
    
    throw new ValidationError('Markets must be an array, object, or string');
  }

  /**
   * Get cached market data
   */
  async _getCachedMarketData(markets, options = {}) {
    const cachedData = {};
    
    if (!this.redisService) {
      this.log('debug', 'Redis not available, skipping cache check');
      return cachedData;
    }

    try {
      for (const market of markets) {
        // Use Redis service's getMarketData method with proper parameters
        const cached = await this.redisService.getMarketData(market, 'research_data');
        
        if (cached) {
          // Check data freshness
          if (this._isDataFresh(cached)) {
            cachedData[market] = cached;
            this.log('debug', 'Using cached data for market', { market, jobId: options.jobId });
          }
        }
      }
    } catch (error) {
      this.log('warn', 'Cache retrieval failed', {
        error: error.message,
        jobId: options.jobId
      });
    }

    return cachedData;
  }

  /**
   * Fetch fresh market data from Phase 2 services
   */
  async _fetchMarketData(markets, options = {}) {
    const marketData = {};
    
    if (!this.marketDataService) {
      this.log('error', 'MarketDataService not available - system configuration error');
      throw new Error('MarketDataService is required for market data retrieval. System must be properly configured.');
    }

    try {
      // Process markets in batches
      const batches = this._createBatches(markets, this.config.maxMarketsPerBatch);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        this.log('debug', 'Fetching market data batch', {
          batchIndex: i + 1,
          batchSize: batch.length,
          jobId: options.jobId
        });

        // Fetch data for batch
        const batchPromises = batch.map(market => this._fetchSingleMarketData(market, options));
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process batch results
        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const market = batch[j];
          
          if (result.status === 'fulfilled' && result.value) {
            marketData[market] = result.value;
          } else {
            this.log('error', 'Failed to fetch data for market', {
              market,
              error: result.reason?.message,
              jobId: options.jobId
            });
            
            // CRITICAL FIX: Proper error handling without system failure
            throw new Error(`Failed to fetch market data for ${market}: ${result.reason?.message || 'Unknown error'}. Check system configuration and external service availability.`);
          }
        }
      }

    } catch (error) {
      this.log('error', 'Market data fetching failed', {
        error: error.message,
        jobId: options.jobId
      });
      throw error;
    }

    return marketData;
  }

  /**
   * Fetch data for a single market with emergency fallback
   * CRITICAL FIX: TIER 0 (AI-first) architecture implementation
   */
  async _fetchSingleMarketData(market, options = {}) {
    try {
      // CRITICAL FIX: Check dataSource to determine filtering behavior
      const dataSource = options.dataSource || 'trusted';
      const isTavilyOrAI = dataSource === 'tavily' || dataSource === 'ai';
      
      // Log mode for debugging
      if (isTavilyOrAI) {
        this.log('info', 'Tavily/AI mode: Processing market without profile validation', { market, dataSource });
      }
      
      // TIER 0: AI-first data source (CRITICAL FIX for quality improvement)
      if (this.aiDataSourceRouter || this.perplexityService) {
        try {
          const aiData = await this._fetchMarketDataFromAI(market);
          if (aiData && aiData.data) {
            this.log('info', 'AI market data retrieved successfully', {
              market,
              source: aiData.source,
              confidence: aiData.confidence
            });
            return {
              ...aiData.data,
              sources: [aiData.source.toLowerCase(), 'ai_primary'],
              retrievedAt: new Date(),
              aiEnhanced: true,
              confidence: aiData.confidence
            };
          }
        } catch (aiError) {
          this.log('warn', 'AI market data service failed, falling back to external services', {
            market,
            error: aiError.message
          });
        }
      }

      // TIER 1: Try external market data service as fallback
      // CRITICAL FIX: Only validate market profile in trusted mode
      if (this.marketDataService) {
        try {
          // In Tavily/AI mode, skip profile validation and process all markets
          const marketInfo = isTavilyOrAI ? { code: market, name: market } : this.marketDataService.getMarket(market);
          
          if (marketInfo) {
            if (!isTavilyOrAI) {
              this.log('debug', 'Market resolved via external service', {
                input: market,
                resolved: marketInfo.code,
                name: marketInfo.name
              });
            }

            // Use MarketDataService collectMarketData method with the market code
            if (typeof this.marketDataService.collectMarketData === 'function') {
              const externalData = await this.marketDataService.collectMarketData(marketInfo.code, options);
              if (externalData && Object.keys(externalData).length > 0) {
                this.log('info', 'External market data retrieved successfully', { market });
                return externalData;
              }
            }
          } else if (!isTavilyOrAI) {
            // In trusted mode, log warning if market profile not found
            this.log('warn', 'Market profile not found in trusted mode', { market });
          }
        } catch (externalError) {
          this.log('warn', 'External market data service failed, falling back to static data', {
            market,
            error: externalError.message
          });
        }
      }

      // TIER 2: Use static market profiles as emergency fallback
      this.log('info', 'Using static market profile fallback', { market });
      const staticProfile = getMarketProfile(market);
      
      if (staticProfile) {
        this.log('info', 'Static market profile found', {
          market,
          profileName: staticProfile.name,
          dataQuality: staticProfile.dataQuality
        });
        
        // Return static profile in the expected format
        return {
          ...staticProfile,
          sources: [...(staticProfile.sources || []), 'static_fallback'],
          retrievedAt: new Date(),
          fallbackUsed: true,
          fallbackReason: 'External market data service unavailable'
        };
      }

      // TIER 3: If no static profile exists, create minimal fallback
      this.log('warn', 'No static profile found, creating minimal fallback', { market });
      return this._createMinimalFallback(market);

    } catch (error) {
      this.log('error', 'All market data retrieval methods failed', {
        market,
        error: error.message
      });
      
      // Last resort: create minimal fallback to prevent system failure
      return this._createMinimalFallback(market);
    }
  }

  /**
   * Cache market data for future use
   */
  async _cacheMarketData(marketData, options = {}) {
    if (!this.redisService) {
      return;
    }

    try {
      const cachePromises = Object.entries(marketData).map(async ([market, data]) => {
        const cacheData = {
          ...data,
          cachedAt: new Date(),
          cacheVersion: this._getCacheVersion()
        };
        
        // Use Redis service's setMarketData method
        await this.redisService.setMarketData(market, 'research_data', cacheData, this.options.cacheTimeout / 1000);
      });

      await Promise.allSettled(cachePromises);
      
      this.log('debug', 'Market data cached', {
        marketCount: Object.keys(marketData).length,
        jobId: options.jobId
      });

    } catch (error) {
      this.log('warn', 'Market data caching failed', {
        error: error.message,
        jobId: options.jobId
      });
    }
  }

  /**
   * Enrich market data with additional context
   */
  async _enrichMarketData(marketData, options = {}) {
    const enrichedData = {};

    try {
      for (const [market, data] of Object.entries(marketData)) {
        enrichedData[market] = {
          ...data,
          enrichment: {
            dataCompleteness: this._calculateDataCompleteness(data),
            marketTier: this._classifyMarketTier(data),
            economicContext: this._generateEconomicContext(data),
            demographicSummary: this._generateDemographicSummary(data),
            enrichedAt: new Date()
          }
        };
      }

      this.log('debug', 'Market data enrichment completed', {
        marketCount: Object.keys(enrichedData).length,
        jobId: options.jobId
      });

    } catch (error) {
      this.log('warn', 'Market data enrichment failed', {
        error: error.message,
        jobId: options.jobId
      });
      return marketData; // Return original data if enrichment fails
    }

    return enrichedData;
  }

  /**
   * Score data relevance and quality
   */
  _scoreDataRelevance(marketData, options = {}) {
    const scoredData = {};

    for (const [market, data] of Object.entries(marketData)) {
      const relevanceScore = this._calculateRelevanceScore(data);
      const qualityScore = this._calculateQualityScore(data);
      
      scoredData[market] = {
        ...data,
        scoring: {
          relevanceScore,
          qualityScore,
          overallScore: Math.round((relevanceScore + qualityScore) / 2),
          scoredAt: new Date()
        }
      };
    }

    return scoredData;
  }

  /**
   * Prepare market context for localization
   * PHASE 1 CRITICAL FIX: Never return empty data - always provide market context
   * PHASE 3 ENHANCEMENT: Provide richer market data with actual insights
   */
  _prepareMarketContext(marketData, options = {}) {
    const contextData = {};
    
    // DIAGNOSTIC LOGGING: Log exactly what marketData is being passed
    this.log('debug', 'DIAGNOSTIC: _prepareMarketContext called with parameters', {
      marketDataType: typeof marketData,
      marketDataKeys: Object.keys(marketData || {}),
      marketDataLength: Object.keys(marketData || {}).length,
      marketDataContent: marketData,
      optionsContent: options,
      jobId: options.jobId
    });
    
    this.log('debug', 'Preparing market context with enhanced data flow', {
      marketCount: Object.keys(marketData).length,
      jobId: options.jobId
    });

    for (const [market, data] of Object.entries(marketData)) {
      // CRITICAL FIX: Always include market data, but log quality issues
      if (data.scoring && data.scoring.overallScore < this.config.relevanceScoreThreshold) {
        this.log('warn', 'Including low-quality market data to prevent system failure', {
          market,
          score: data.scoring.overallScore,
          threshold: this.config.relevanceScoreThreshold
        });
      }

      // Extract market trends from data or generate them
      const keyTrends = this._extractKeyMarketTrends(data);
      
      // Generate market-specific demographic profile
      const demographicProfile = this._generateDemographicProfile(data);
      
      // Extract or generate market statistics
      const marketStats = this._extractMarketStatistics(data);

      contextData[market] = {
        basic: {
          name: data.name || market,
          code: data.code || market,
          population: data.population || 500000,
          region: data.region || 'Unknown'
        },
        economic: {
          medianIncome: data.medianIncome || 55000,
          unemploymentRate: data.unemploymentRate || 5.0,
          costOfLiving: data.costOfLiving || 100,
          // Enhanced economic data
          gdpGrowth: data.gdpGrowth || marketStats.gdpGrowth,
          majorIndustries: data.majorIndustries || marketStats.majorIndustries,
          economicOutlook: data.economicOutlook || this._determineEconomicOutlook(data)
        },
        housing: {
          medianHomePrice: data.medianHomePrice || 350000,
          medianPriceYoY: data.medianPriceYoY || marketStats.medianPriceYoY,
          medianDaysOnMarket: data.medianDaysOnMarket || marketStats.medianDaysOnMarket,
          averageDownPayment: data.averageDownPayment || this._calculateAverageDownPayment(data),
          rentPrices: data.rentPrices || {
            studio: 1200,
            oneBedroom: 1500,
            twoBedroom: 1900,
            threeBedroom: 2500
          },
          housingSupply: data.housingSupply || {
            totalUnits: 200000,
            vacancyRate: 8.0,
            ownerOccupied: 45.0,
            renterOccupied: 55.0,
            // Enhanced supply data
            monthsOfInventory: data.monthsOfInventory || marketStats.monthsOfInventory,
            newConstructionRate: data.newConstructionRate || marketStats.newConstructionRate
          }
        },
        demographics: {
          ageDistribution: data.ageDistribution || {
            under25: 25.0,
            age25to44: 35.0,
            age45to64: 25.0,
            over65: 15.0
          },
          educationLevel: data.educationLevel || {
            highSchool: 85.0,
            bachelors: 30.0,
            graduate: 12.0
          },
          householdComposition: data.householdComposition || {
            families: 0.50,
            singlePerson: 0.30,
            nonFamily: 0.20
          },
          // Enhanced demographic data
          medianAge: data.medianAge || demographicProfile.medianAge,
          dominantAgeGroup: data.dominantAgeGroup || demographicProfile.dominantAgeGroup,
          incomeDistribution: data.incomeDistribution || demographicProfile.incomeDistribution,
          populationGrowth: data.populationGrowth || demographicProfile.populationGrowth
        },
        context: {
          marketTier: data.enrichment?.marketTier || this._classifyMarketTier(data),
          economicContext: data.enrichment?.economicContext || this._generateEconomicContext(data),
          keyInsights: this._generateKeyInsights(data),
          // Enhanced with actual key trends
          keyTrends: keyTrends,
          localizationHints: this._generateLocalizationHints(data),
          personality: data.personality || {
            traits: ['Balanced', 'Moderate', 'Stable'],
            terminology: ['local market', 'neighborhood', 'community'],
            tone: 'Balanced, community-oriented',
            demographics: demographicProfile.description || 'Mixed demographics',
            context: 'Balanced market'
          }
        },
        metadata: {
          dataQuality: data.scoring?.qualityScore || data.dataQuality || 75,
          relevance: data.scoring?.relevanceScore || 75,
          qualityScore: data.scoring?.overallScore || 75, // Standardized quality score
          lastUpdated: data.lastUpdated || new Date(),
          sources: data.sources || ['fallback'],
          fallbackUsed: data.fallbackUsed || false,
          dataEnhanced: true // Flag indicating enhanced data
        }
      };
      
      this.log('debug', 'Market context prepared with enhanced data', {
        market,
        keyTrendsCount: keyTrends.length,
        demographicProfile: demographicProfile.description,
        dataQuality: contextData[market].metadata.qualityScore
      });
    }

    // CRITICAL: Ensure we never return empty data
    if (Object.keys(contextData).length === 0) {
      this.log('error', 'No market context data prepared - this should never happen');
      throw new Error('Market context preparation failed - no data available');
    }

    return contextData;
  }

  // Helper methods
  _createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  _getCacheVersion() {
    return 'v1.0';
  }

  _isDataFresh(data) {
    if (!data.cachedAt) return false;
    const age = Date.now() - new Date(data.cachedAt).getTime();
    return age < this.config.dataFreshnessThreshold;
  }

  _calculateDataCompleteness(data) {
    const required = this.config.requiredDataPoints;
    const optional = this.config.optionalDataPoints;
    
    let score = 0;
    let maxScore = required.length * 2 + optional.length;
    
    // Required fields worth 2 points each
    for (const field of required) {
      if (data[field]) score += 2;
    }
    
    // Optional fields worth 1 point each
    for (const field of optional) {
      if (data[field]) score += 1;
    }
    
    return Math.round((score / maxScore) * 100);
  }

  _classifyMarketTier(data) {
    const population = data.population || 0;
    
    if (population > 5000000) return 'tier1';
    if (population > 2000000) return 'tier2';
    if (population > 1000000) return 'tier3';
    return 'tier4';
  }

  _generateEconomicContext(data) {
    const income = data.medianIncome || 0;
    const unemployment = data.unemploymentRate || 0;
    
    if (income > 80000 && unemployment < 4) return 'strong';
    if (income > 60000 && unemployment < 6) return 'stable';
    if (income > 40000 && unemployment < 8) return 'moderate';
    return 'challenging';
  }

  _generateDemographicSummary(data) {
    return {
      primaryAgeGroup: this._getPrimaryAgeGroup(data.ageDistribution),
      educationLevel: this._getEducationLevel(data.educationLevel),
      householdType: this._getHouseholdType(data.householdComposition)
    };
  }

  _calculateRelevanceScore(data) {
    let score = 100;
    
    // Deduct points for missing critical data
    if (!data.population) score -= 20;
    if (!data.medianIncome) score -= 15;
    if (!data.medianHomePrice) score -= 15;
    
    // Bonus points for rich data
    if (data.demographics) score += 5;
    if (data.economicIndicators) score += 5;
    if (data.marketTrends) score += 5;
    
    return Math.max(0, Math.min(100, score));
  }

  _calculateQualityScore(data) {
    let score = 100;
    
    // Check data recency
    if (data.lastUpdated) {
      const age = Date.now() - new Date(data.lastUpdated).getTime();
      const daysOld = age / (1000 * 60 * 60 * 24);
      
      if (daysOld > 365) score -= 30;
      else if (daysOld > 180) score -= 15;
      else if (daysOld > 90) score -= 5;
    }
    
    // Check data sources
    if (!data.sources || data.sources.length === 0) score -= 20;
    if (data.sources && data.sources.includes('fallback')) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate key insights from market data
   * PHASE 3 ENHANCEMENT: More comprehensive insights generation
   */
  _generateKeyInsights(data) {
    const insights = [];
    
    // Population-based insights
    if (data.population > 1000000) {
      insights.push('Major metropolitan area');
    } else if (data.population > 500000) {
      insights.push('Mid-sized metropolitan area');
    } else if (data.population > 100000) {
      insights.push('Small metropolitan area');
    } else {
      insights.push('Suburban/rural market');
    }
    
    // Income-based insights
    if (data.medianIncome > 100000) {
      insights.push('Affluent market with high purchasing power');
    } else if (data.medianIncome > 70000) {
      insights.push('High-income market');
    } else if (data.medianIncome > 50000) {
      insights.push('Middle-income market');
    } else {
      insights.push('Value-conscious market');
    }
    
    // Housing price insights
    if (data.medianHomePrice > 750000) {
      insights.push('Luxury housing market');
    } else if (data.medianHomePrice > 500000) {
      insights.push('Premium housing market');
    } else if (data.medianHomePrice > 350000) {
      insights.push('Mid-tier housing market');
    } else {
      insights.push('Affordable housing market');
    }
    
    // Market dynamics insights
    if (data.marketTrends?.priceGrowthYoY > 10) {
      insights.push('Rapidly appreciating market');
    } else if (data.marketTrends?.priceGrowthYoY < 0) {
      insights.push('Price correction underway');
    }
    
    if (data.marketTrends?.inventoryChange > 15) {
      insights.push('Expanding inventory levels');
    } else if (data.marketTrends?.inventoryChange < -15) {
      insights.push('Contracting inventory levels');
    }
    
    if (data.marketTrends?.daysOnMarket < 30) {
      insights.push('Fast-moving seller\'s market');
    } else if (data.marketTrends?.daysOnMarket > 60) {
      insights.push('Slower-paced buyer\'s market');
    }
    
    return insights;
  }

  /**
   * Generate localization hints for content generation
   * PHASE 3 ENHANCEMENT: More detailed localization guidance
   */
  _generateLocalizationHints(data) {
    return {
      emphasizeAffordability: data.medianHomePrice > 400000,
      highlightGrowth: data.populationGrowth > 2,
      focusOnFamilies: this._isFamilyOriented(data),
      mentionEconomy: data.unemploymentRate < 5,
      // Enhanced localization hints
      highlightInventory: data.marketTrends?.inventoryChange > 10 || data.housingSupply?.monthsOfInventory > 6,
      emphasizeCompetition: data.marketTrends?.daysOnMarket < 20,
      mentionPriceChanges: Math.abs(data.marketTrends?.priceGrowthYoY || 0) > 5,
      focusOnDownPayment: data.averageDownPayment > 80000 || (data.medianHomePrice * 0.2) > 80000,
      highlightRentalMarket: data.rentPrices?.twoBedroom > 2000 || data.housingSupply?.renterOccupied > 60,
      mentionLocalEconomy: data.economicIndicators?.majorIndustries?.length > 0,
      emphasizeEducation: data.educationLevel?.bachelors > 40 || data.educationLevel?.graduate > 15
    };
  }

  /**
   * Create minimal fallback data to prevent system failure
   * PHASE 1 CRITICAL FIX: Last resort fallback to maintain system operation
   */
  _createMinimalFallback(market) {
    this.log('warn', 'Creating minimal fallback data as last resort', { market });
    
    return {
      code: market.replace(/[^A-Z]/g, '').substring(0, 3) || 'UNK',
      name: market,
      region: 'Unknown',
      population: 500000,
      medianIncome: 55000,
      medianHomePrice: 350000,
      unemploymentRate: 5.0,
      costOfLiving: 100,
      rentPrices: {
        studio: 1200,
        oneBedroom: 1500,
        twoBedroom: 1900,
        threeBedroom: 2500
      },
      housingSupply: {
        totalUnits: 200000,
        vacancyRate: 8.0,
        ownerOccupied: 45.0,
        renterOccupied: 55.0
      },
      ageDistribution: {
        under25: 25.0,
        age25to44: 35.0,
        age45to64: 25.0,
        over65: 15.0
      },
      educationLevel: {
        highSchool: 85.0,
        bachelors: 30.0,
        graduate: 12.0
      },
      householdComposition: {
        families: 0.50,
        singlePerson: 0.30,
        nonFamily: 0.20
      },
      economicIndicators: {
        gdpPerCapita: 55000,
        majorIndustries: ['Services', 'Manufacturing', 'Retail'],
        employmentGrowth: 1.5
      },
      marketTrends: {
        priceGrowthYoY: 5.0,
        inventoryChange: 0.0,
        daysOnMarket: 45,
        salesVolume: 10000
      },
      personality: {
        traits: ['Balanced', 'Moderate', 'Stable', 'Community-focused'],
        terminology: ['local market', 'neighborhood', 'community', 'residents'],
        tone: 'Balanced, community-oriented, practical',
        demographics: 'Mixed demographics, families and professionals',
        context: 'Balanced market with moderate growth and stability'
      },
      sources: ['minimal_fallback'],
      lastUpdated: new Date(),
      dataQuality: 50,
      fallbackUsed: true,
      fallbackReason: 'No market data available from any source - minimal fallback created'
    };
  }

  /**
   * Calculate average score across market data
   * PHASE 3 ENHANCEMENT: More consistent scoring
   */
  _calculateAverageScore(marketData) {
    const scores = Object.values(marketData)
      .map(data => data.metadata?.qualityScore || data.scoring?.overallScore || data.metadata?.dataQuality || 75);
    
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  /**
   * Extract key market trends from data with enhanced specificity
   * PHASE 3 ENHANCEMENT: Enhanced method to extract specific, concrete market trends with MLS-style data
   * LOCAL DATA ACCURACY ENHANCEMENT: Prioritize local inventory & velocity metrics
   */
  _extractKeyMarketTrends(data) {
    const trends = [];
    
    // CRITICAL ENHANCEMENT: Prioritize local inventory metrics first
    const localInventoryMetrics = this._extractLocalInventoryMetrics(data);
    trends.push(...localInventoryMetrics);
    
    // Enhanced price trends with specific metrics (now includes local context)
    if (data.marketTrends?.priceGrowthYoY !== undefined) {
      const priceChange = data.marketTrends.priceGrowthYoY;
      const medianPrice = data.medianHomePrice || 350000;
      const localContext = this._getLocalPriceContext(data);
      
      if (priceChange > 0) {
        trends.push(`Local median home prices rose ${priceChange.toFixed(1)}% year-over-year to $${medianPrice.toLocaleString()}${localContext}`);
      } else if (priceChange < 0) {
        trends.push(`Local median home prices declined ${Math.abs(priceChange).toFixed(1)}% year-over-year to $${medianPrice.toLocaleString()}${localContext}`);
      } else {
        trends.push(`Local median home prices remained stable at $${medianPrice.toLocaleString()}${localContext}`);
      }
    }
    
    // ENHANCED: Local inventory trends with supply/demand context
    if (data.marketTrends?.inventoryChange !== undefined) {
      const inventoryChange = data.marketTrends.inventoryChange;
      const monthsOfInventory = data.housingSupply?.monthsOfInventory || 3.2;
      const activeListings = this._calculateActiveListings(data);
      
      if (inventoryChange > 0) {
        trends.push(`Local housing inventory expanded ${inventoryChange.toFixed(1)}% with ${activeListings.toLocaleString()} active listings and ${monthsOfInventory.toFixed(1)} months of supply available`);
      } else if (inventoryChange < 0) {
        trends.push(`Local housing inventory contracted ${Math.abs(inventoryChange).toFixed(1)}% with only ${activeListings.toLocaleString()} active listings and ${monthsOfInventory.toFixed(1)} months of supply`);
      }
    }
    
    // ENHANCED: Local market velocity with specific days on market data
    if (data.marketTrends?.daysOnMarket) {
      const dom = Math.round(data.marketTrends.daysOnMarket);
      const velocityContext = this._getMarketVelocityContext(data, dom);
      
      if (dom < 20) {
        trends.push(`Fast-moving local seller's market with homes selling in just ${dom} days on average${velocityContext}`);
      } else if (dom < 45) {
        trends.push(`Balanced local market conditions with homes averaging ${dom} days on market${velocityContext}`);
      } else {
        trends.push(`Buyer-favorable local conditions with homes spending ${dom} days on market on average${velocityContext}`);
      }
    }
    
    // ENHANCED: Local sales volume with market activity context
    if (data.marketTrends?.salesVolume) {
      const volume = data.marketTrends.salesVolume;
      const monthlyVolume = Math.round(volume / 12);
      const salesVelocity = this._calculateSalesVelocity(data);
      trends.push(`Local market activity of ${volume.toLocaleString()} annual home sales (approximately ${monthlyVolume.toLocaleString()} per month)${salesVelocity}`);
    }
    
    // Enhanced affordability analysis with specific ratios and context
    const medianPrice = data.medianHomePrice || 350000;
    const medianIncome = data.medianIncome || 55000;
    const affordabilityRatio = medianPrice / medianIncome;
    const downPaymentAmount = Math.round(medianPrice * 0.2);
    
    if (affordabilityRatio > 8) {
      trends.push(`Severely constrained affordability: median home price of $${medianPrice.toLocaleString()} requires ${affordabilityRatio.toFixed(1)}x median income, with typical down payments of $${downPaymentAmount.toLocaleString()}`);
    } else if (affordabilityRatio > 5) {
      trends.push(`Challenged affordability: home prices at ${affordabilityRatio.toFixed(1)}x median income with down payments averaging $${downPaymentAmount.toLocaleString()}`);
    } else if (affordabilityRatio > 3) {
      trends.push(`Moderate affordability: home prices at ${affordabilityRatio.toFixed(1)}x median income with typical down payments of $${downPaymentAmount.toLocaleString()}`);
    } else {
      trends.push(`Strong affordability: home prices at just ${affordabilityRatio.toFixed(1)}x median income with down payments of $${downPaymentAmount.toLocaleString()}`);
    }
    
    // Enhanced rental market analysis with specific rent-to-income ratios
    if (data.rentPrices) {
      const avgRent = Math.round((data.rentPrices.oneBedroom + data.rentPrices.twoBedroom) / 2);
      const rentToIncomeRatio = (avgRent * 12) / medianIncome;
      const rentBurdenPercentage = Math.round(rentToIncomeRatio * 100);
      
      if (rentToIncomeRatio > 0.4) {
        trends.push(`Rent-burdened market: average rent of $${avgRent.toLocaleString()}/month consumes ${rentBurdenPercentage}% of median income`);
      } else if (rentToIncomeRatio > 0.3) {
        trends.push(`Moderately expensive rentals: $${avgRent.toLocaleString()}/month average rent represents ${rentBurdenPercentage}% of median income`);
      } else {
        trends.push(`Affordable rental market: $${avgRent.toLocaleString()}/month average rent is just ${rentBurdenPercentage}% of median income`);
      }
    }
    
    // Enhanced employment and economic context with specific metrics
    if (data.unemploymentRate !== undefined) {
      const unemployment = data.unemploymentRate;
      const jobGrowth = data.economicIndicators?.employmentGrowth || 0;
      if (unemployment < 4 && jobGrowth > 2) {
        trends.push(`Robust job market: ${unemployment}% unemployment with ${jobGrowth.toFixed(1)}% employment growth`);
      } else if (unemployment < 5) {
        trends.push(`Healthy employment: ${unemployment}% unemployment rate supporting housing demand`);
      } else if (unemployment > 6) {
        trends.push(`Employment challenges: ${unemployment}% unemployment rate constraining buyer activity`);
      }
    }
    
    // Enhanced population and demographic trends with growth context
    if (data.populationGrowth !== undefined) {
      const popGrowth = data.populationGrowth;
      const population = data.population || 500000;
      if (popGrowth > 2) {
        trends.push(`Strong population growth of ${popGrowth.toFixed(1)}% annually in metro area of ${population.toLocaleString()} residents`);
      } else if (popGrowth < 0) {
        trends.push(`Population decline of ${Math.abs(popGrowth).toFixed(1)}% affecting housing demand in metro area of ${population.toLocaleString()}`);
      } else if (popGrowth > 0) {
        trends.push(`Steady population growth of ${popGrowth.toFixed(1)}% supporting housing market stability`);
      }
    }
    
    // Add neighborhood-specific context when available
    if (data.neighborhoodData && Array.isArray(data.neighborhoodData)) {
      const topNeighborhood = data.neighborhoodData[0];
      if (topNeighborhood) {
        trends.push(`Premium neighborhoods like ${topNeighborhood.name} showing ${topNeighborhood.priceChange > 0 ? 'appreciation' : 'adjustment'} of ${Math.abs(topNeighborhood.priceChange).toFixed(1)}%`);
      }
    }
    
    // Ensure we have substantial, specific trends
    if (trends.length < 3) {
      // Add fallback trends with specific context
      if (data.costOfLiving) {
        const col = data.costOfLiving;
        if (col > 120) {
          trends.push(`High cost of living index of ${col} affecting housing affordability and buyer decisions`);
        } else if (col < 90) {
          trends.push(`Below-average cost of living index of ${col} supporting housing market accessibility`);
        }
      }
      
      // Add market tier context
      const marketTier = this._classifyMarketTier(data);
      if (marketTier === 'tier1') {
        trends.push(`Major metropolitan market dynamics with diverse housing options and strong institutional investment`);
      } else if (marketTier === 'tier2') {
        trends.push(`Mid-tier metropolitan market showing balanced supply-demand fundamentals`);
      }
    }
    
    return trends.slice(0, 8); // Return up to 8 specific trends
  }

  /**
   * Generate market-specific demographic profile
   * PHASE 3 ENHANCEMENT: New method for detailed demographic profiles
   */
  _generateDemographicProfile(data) {
    const profile = {
      description: 'General population',
      medianAge: 38,
      dominantAgeGroup: 'working_age',
      incomeDistribution: {
        lowIncome: 0.2,
        middleIncome: 0.5,
        highIncome: 0.3
      },
      populationGrowth: 1.2
    };
    
    // Determine dominant age group
    if (data.ageDistribution) {
      const ageGroups = {
        under25: data.ageDistribution.under25 || 25,
        age25to44: data.ageDistribution.age25to44 || 35,
        age45to64: data.ageDistribution.age45to64 || 25,
        over65: data.ageDistribution.over65 || 15
      };
      
      const maxAgeGroup = Object.entries(ageGroups).reduce((max, [group, value]) =>
        value > max.value ? {group, value} : max, {group: '', value: 0});
      
      if (maxAgeGroup.group === 'under25') {
        profile.dominantAgeGroup = 'young';
        profile.medianAge = 22;
      } else if (maxAgeGroup.group === 'age25to44') {
        profile.dominantAgeGroup = 'young_professionals';
        profile.medianAge = 34;
      } else if (maxAgeGroup.group === 'age45to64') {
        profile.dominantAgeGroup = 'established_professionals';
        profile.medianAge = 52;
      } else if (maxAgeGroup.group === 'over65') {
        profile.dominantAgeGroup = 'retirees';
        profile.medianAge = 70;
      }
    }
    
    // Generate description based on demographics
    let descriptions = [];
    
    // Age-based description
    if (profile.dominantAgeGroup === 'young') {
      descriptions.push('younger population');
    } else if (profile.dominantAgeGroup === 'young_professionals') {
      descriptions.push('young professional-dominated');
    } else if (profile.dominantAgeGroup === 'established_professionals') {
      descriptions.push('established professional-dominated');
    } else if (profile.dominantAgeGroup === 'retirees') {
      descriptions.push('retirement-oriented');
    }
    
    // Education-based description
    if (data.educationLevel) {
      if (data.educationLevel.graduate > 20) {
        descriptions.push('highly educated');
      } else if (data.educationLevel.bachelors > 35) {
        descriptions.push('college-educated');
      } else if (data.educationLevel.highSchool > 90) {
        descriptions.push('high school educated');
      }
    }
    
    // Income-based description
    if (data.medianIncome > 100000) {
      descriptions.push('affluent');
    } else if (data.medianIncome > 70000) {
      descriptions.push('upper-middle income');
    } else if (data.medianIncome > 50000) {
      descriptions.push('middle income');
    } else {
      descriptions.push('moderate income');
    }
    
    // Household composition description
    if (data.householdComposition) {
      if (data.householdComposition.families > 0.6) {
        descriptions.push('family-oriented');
      } else if (data.householdComposition.singlePerson > 0.4) {
        descriptions.push('single-resident');
      }
    }
    
    // Combine descriptions
    if (descriptions.length > 0) {
      profile.description = descriptions.join(', ') + ' demographic';
    }
    
    return profile;
  }

  /**
   * Extract or generate market statistics
   * PHASE 3 ENHANCEMENT: New method for detailed market statistics
   */
  _extractMarketStatistics(data) {
    const stats = {
      gdpGrowth: 2.1,
      majorIndustries: ['Services', 'Healthcare', 'Retail'],
      medianPriceYoY: 5.2,
      medianDaysOnMarket: 45,
      monthsOfInventory: 3.2,
      newConstructionRate: 1.8
    };
    
    // Use actual data when available
    if (data.economicIndicators?.gdpPerCapita) {
      stats.gdpGrowth = data.economicIndicators.employmentGrowth || stats.gdpGrowth;
    }
    
    if (data.economicIndicators?.majorIndustries) {
      stats.majorIndustries = data.economicIndicators.majorIndustries;
    }
    
    if (data.marketTrends?.priceGrowthYoY !== undefined) {
      stats.medianPriceYoY = data.marketTrends.priceGrowthYoY;
    }
    
    if (data.marketTrends?.daysOnMarket) {
      stats.medianDaysOnMarket = data.marketTrends.daysOnMarket;
    }
    
    // Calculate months of inventory if we have sales volume
    if (data.marketTrends?.salesVolume && data.housingSupply?.totalUnits) {
      const monthlyVolume = data.marketTrends.salesVolume / 12;
      stats.monthsOfInventory = data.housingSupply.totalUnits * (data.housingSupply.vacancyRate / 100) / monthlyVolume;
    }
    
    return stats;
  }

  /**
   * Determine economic outlook based on available data
   * PHASE 3 ENHANCEMENT: New method for economic context
   */
  _determineEconomicOutlook(data) {
    if (data.unemploymentRate < 4 && (data.economicIndicators?.employmentGrowth || 0) > 2) {
      return 'Strong growth with robust job market';
    } else if (data.unemploymentRate < 5) {
      return 'Stable growth with healthy job market';
    } else if (data.unemploymentRate < 6) {
      return 'Moderate growth with adequate job market';
    } else {
      return 'Challenging conditions with potential job market concerns';
    }
  }

  /**
   * Calculate average down payment percentage for the market
   * PHASE 3 ENHANCEMENT: New method for financing statistics
   */
  _calculateAverageDownPayment(data) {
    // Base calculation on median home price
    const medianPrice = data.medianHomePrice || 350000;
    
    // Adjust down payment percentage based on market characteristics
    let downPaymentPercentage = 0.2; // Default 20%
    
    if (medianPrice > 750000) {
      downPaymentPercentage = 0.25; // 25% for luxury markets
    } else if (medianPrice < 250000) {
      downPaymentPercentage = 0.15; // 15% for affordable markets
    }
    
    // Further adjust based on economic context
    if (data.medianIncome > 100000) {
      downPaymentPercentage += 0.03; // +3% for high income areas
    } else if (data.medianIncome < 50000) {
      downPaymentPercentage -= 0.03; // -3% for lower income areas
    }
    
    return Math.round(medianPrice * downPaymentPercentage);
  }

  _getPrimaryAgeGroup(ageDistribution) {
    if (!ageDistribution) return 'mixed';
    
    // Enhanced logic to determine primary age group
    const ageGroups = {
      under25: ageDistribution.under25 || 25,
      age25to44: ageDistribution.age25to44 || 35,
      age45to64: ageDistribution.age45to64 || 25,
      over65: ageDistribution.over65 || 15
    };
    
    const maxAgeGroup = Object.entries(ageGroups).reduce((max, [group, value]) =>
      value > max.value ? {group, value} : max, {group: '', value: 0});
    
    if (maxAgeGroup.group === 'under25') return 'young';
    if (maxAgeGroup.group === 'age25to44') return 'young_professionals';
    if (maxAgeGroup.group === 'age45to64') return 'established_professionals';
    if (maxAgeGroup.group === 'over65') return 'retirees';
    
    return 'mixed';
  }

  _getEducationLevel(educationLevel) {
    if (!educationLevel) return 'mixed';
    
    // Enhanced logic to determine education level
    if (educationLevel.graduate > 20) return 'highly_educated';
    if (educationLevel.bachelors > 35) return 'college_educated';
    if (educationLevel.highSchool > 90) return 'high_school_educated';
    
    return 'mixed_education';
  }

  _getHouseholdType(householdComposition) {
    if (!householdComposition) return 'mixed';
    
    // Enhanced logic to determine household type
    if (householdComposition.families > 0.6) return 'family_dominated';
    if (householdComposition.singlePerson > 0.4) return 'single_resident';
    if (householdComposition.nonFamily > 0.3) return 'non_traditional';
    
    return 'mixed_households';
  }

  _isFamilyOriented(data) {
    return data.householdComposition &&
           data.householdComposition.families > 0.5;
  }

  /**
   * Extract local inventory metrics with supply/demand context
   * LOCAL DATA ACCURACY ENHANCEMENT: New method for Issue #6
   */
  _extractLocalInventoryMetrics(data) {
    const metrics = [];
    
    // Calculate active listings
    const activeListings = this._calculateActiveListings(data);
    if (activeListings > 0) {
      metrics.push(`${activeListings.toLocaleString()} active listings currently available in the local market`);
    }
    
    // Supply/demand ratio analysis
    const supplyDemandRatio = this._calculateSupplyDemandRatio(data);
    if (supplyDemandRatio) {
      metrics.push(supplyDemandRatio);
    }
    
    // Market velocity indicators
    const velocityIndicators = this._getMarketVelocityIndicators(data);
    metrics.push(...velocityIndicators);
    
    return metrics;
  }

  /**
   * Calculate active listings from market data
   * LOCAL DATA ACCURACY ENHANCEMENT: Active listings calculation
   */
  _calculateActiveListings(data) {
    // Try to get from direct data first
    if (data.housingSupply?.activeListings) {
      return data.housingSupply.activeListings;
    }
    
    // Calculate from total units and vacancy rate
    if (data.housingSupply?.totalUnits && data.housingSupply?.vacancyRate) {
      const totalUnits = data.housingSupply.totalUnits;
      const vacancyRate = data.housingSupply.vacancyRate / 100;
      const estimatedActiveListings = Math.round(totalUnits * vacancyRate * 0.6); // Assume 60% of vacant units are actively listed
      return estimatedActiveListings;
    }
    
    // Fallback calculation based on population
    const population = data.population || 500000;
    const estimatedHouseholds = Math.round(population / 2.5); // Average household size
    const estimatedActiveListings = Math.round(estimatedHouseholds * 0.015); // Assume 1.5% turnover rate
    
    return estimatedActiveListings;
  }

  /**
   * Calculate supply/demand ratio with context
   * LOCAL DATA ACCURACY ENHANCEMENT: Supply/demand analysis
   */
  _calculateSupplyDemandRatio(data) {
    const monthsOfInventory = data.housingSupply?.monthsOfInventory ||
                             (data.marketTrends?.daysOnMarket ? data.marketTrends.daysOnMarket / 30 : 3.2);
    
    if (monthsOfInventory < 2) {
      return `Severe supply shortage with only ${monthsOfInventory.toFixed(1)} months of inventory, indicating strong seller's market conditions`;
    } else if (monthsOfInventory < 4) {
      return `Limited supply with ${monthsOfInventory.toFixed(1)} months of inventory, favoring sellers in most price ranges`;
    } else if (monthsOfInventory < 6) {
      return `Balanced supply-demand dynamics with ${monthsOfInventory.toFixed(1)} months of inventory`;
    } else if (monthsOfInventory < 8) {
      return `Ample supply with ${monthsOfInventory.toFixed(1)} months of inventory, providing buyers with more options`;
    } else {
      return `Oversupply conditions with ${monthsOfInventory.toFixed(1)} months of inventory, strongly favoring buyers`;
    }
  }

  /**
   * Get market velocity indicators
   * LOCAL DATA ACCURACY ENHANCEMENT: Market velocity analysis
   */
  _getMarketVelocityIndicators(data) {
    const indicators = [];
    
    // Days on market analysis
    const dom = data.marketTrends?.daysOnMarket || 45;
    if (dom < 15) {
      indicators.push(`Ultra-fast market velocity with homes selling in under ${dom} days, indicating bidding war conditions`);
    } else if (dom < 30) {
      indicators.push(`High market velocity with ${dom} days average time to sale, showing strong buyer demand`);
    } else if (dom < 60) {
      indicators.push(`Moderate market velocity with ${dom} days on market, reflecting balanced conditions`);
    } else {
      indicators.push(`Slower market velocity with ${dom} days on market, giving buyers time to negotiate`);
    }
    
    // Sales velocity if available
    if (data.marketTrends?.salesVolume) {
      const monthlyVolume = Math.round(data.marketTrends.salesVolume / 12);
      const weeklyVolume = Math.round(monthlyVolume / 4.33);
      indicators.push(`Local sales pace of approximately ${weeklyVolume.toLocaleString()} homes per week`);
    }
    
    return indicators;
  }

  /**
   * Get local price context for enhanced trends
   * LOCAL DATA ACCURACY ENHANCEMENT: Local price context
   */
  _getLocalPriceContext(data) {
    const medianIncome = data.medianIncome || 55000;
    const medianPrice = data.medianHomePrice || 350000;
    const affordabilityRatio = medianPrice / medianIncome;
    
    if (affordabilityRatio > 8) {
      return `, making homeownership challenging for median-income households`;
    } else if (affordabilityRatio > 5) {
      return `, requiring significant financial planning for typical local buyers`;
    } else if (affordabilityRatio > 3) {
      return `, maintaining moderate affordability for local residents`;
    } else {
      return `, offering strong affordability for local buyers`;
    }
  }

  /**
   * Get market velocity context
   * LOCAL DATA ACCURACY ENHANCEMENT: Velocity context analysis
   */
  _getMarketVelocityContext(data, daysOnMarket) {
    const context = [];
    
    // Compare to seasonal patterns if available
    if (data.seasonalPatterns?.averageDaysOnMarket) {
      const seasonalAverage = data.seasonalPatterns.averageDaysOnMarket;
      const difference = daysOnMarket - seasonalAverage;
      if (Math.abs(difference) > 5) {
        const direction = difference > 0 ? 'slower' : 'faster';
        context.push(`, ${Math.abs(difference)} days ${direction} than seasonal average`);
      }
    }
    
    // Add inventory pressure context
    const monthsOfInventory = data.housingSupply?.monthsOfInventory || 3.2;
    if (monthsOfInventory < 2 && daysOnMarket < 20) {
      context.push(`, driven by severe inventory shortage`);
    } else if (monthsOfInventory > 6 && daysOnMarket > 60) {
      context.push(`, reflecting abundant inventory choices`);
    }
    
    return context.join('');
  }

  /**
   * Calculate sales velocity metrics
   * LOCAL DATA ACCURACY ENHANCEMENT: Sales velocity calculation
   */
  _calculateSalesVelocity(data) {
    const activeListings = this._calculateActiveListings(data);
    const monthlyVolume = data.marketTrends?.salesVolume ?
                         Math.round(data.marketTrends.salesVolume / 12) :
                         Math.round(activeListings * 0.15); // Assume 15% monthly turnover
    
    if (activeListings > 0) {
      const turnoverRate = (monthlyVolume / activeListings) * 100;
      if (turnoverRate > 20) {
        return `, indicating rapid inventory turnover of ${turnoverRate.toFixed(1)}% monthly`;
      } else if (turnoverRate > 10) {
        return `, showing healthy inventory turnover of ${turnoverRate.toFixed(1)}% monthly`;
      } else {
        return `, reflecting slower inventory turnover of ${turnoverRate.toFixed(1)}% monthly`;
      }
    }
    
    return '';
  }

  /**
   * CRITICAL FIX: Fetch market data from AI services (TIER 0 - AI-first architecture)
   * @param {string} market - Market name
   * @returns {Promise<Object>} AI-sourced market data
   */
  async _fetchMarketDataFromAI(market) {
    this.agentLogger.debug('Fetching market data from AI services', { market });
    
    try {
      // Use AI Data Source Router for intelligent data fetching
      const aiQuery = `Provide comprehensive real estate market data for ${market} including:
        - Current median home prices and recent trends
        - Market inventory levels and days on market
        - Price appreciation rates and forecasts
        - Key market indicators and statistics
        - Notable market developments and news`;

      const aiResponse = await this.aiDataSourceRouter.fetchData({
        query: aiQuery,
        market: market,
        dataType: 'market_research',
        priority: 'high'
      });

      if (aiResponse && aiResponse.data) {
        this.agentLogger.debug('AI market data retrieved successfully', {
          market,
          dataSize: JSON.stringify(aiResponse.data).length
        });
        
        return {
          source: 'AI',
          market: market,
          data: aiResponse.data,
          timestamp: new Date().toISOString(),
          confidence: aiResponse.confidence || 0.8
        };
      }

      // Fallback to Perplexity if router fails
      this.agentLogger.warn('AI router failed, falling back to Perplexity', { market });
      const perplexityResponse = await this.perplexityService.search(aiQuery);
      
      return {
        source: 'Perplexity',
        market: market,
        data: perplexityResponse,
        timestamp: new Date().toISOString(),
        confidence: 0.7
      };

    } catch (error) {
      this.agentLogger.error('AI market data fetch failed', {
        market,
        error: error.message
      });
      
      // Return null to trigger fallback to traditional sources
      return null;
    }
  }

  /**
   * Enhance research data with Example Company quotes and anecdotes
   * @param {Object} researchData - The research data to enhance
   * @param {Array} markets - Array of market names
   * @returns {Object} Enhanced research data with Example Company quotes
   */
  async _enhanceWithExampleCompanyQuotes(researchData, markets) {
    if (!this.exampleCompanyIntegrationEnabled || !this.exampleCompanyServicesReady) {
      this.agentLogger.info('Example Company integration not available, skipping quote enhancement', {
        enabled: this.exampleCompanyIntegrationEnabled,
        servicesReady: this.exampleCompanyServicesReady
      });
      return researchData;
    }

    try {
      const startTime = Date.now();
      this.agentLogger.info('Starting Example Company quote enhancement', {
        markets: markets.length,
        hasResearchData: !!researchData
      });

      // Analyze voice requirements from research data
      const voiceRequirements = await this._analyzeVoiceRequirements(researchData, markets);
      
      // Select appropriate quotes for each market
      const enhancedData = { ...researchData };
      const exampleCompanyEnhancements = {};

      for (const market of markets) {
        try {
          // Get market-specific context
          const marketContext = {
            market: market,
            contentTheme: this._extractContentTheme(researchData, market),
            marketData: this._extractMarketData(researchData, market)
          };

          // Removed: quoteSelectionEngine.selectQuotes - replaced by marketExpertInsights service
          // This functionality is now handled by the marketExpertInsights service
          const quoteResult = null;

          if (quoteResult && quoteResult.selectedQuote) {
            exampleCompanyEnhancements[market] = {
              primaryQuote: quoteResult.selectedQuote,
              alternativeQuotes: quoteResult.alternativeQuotes || [],
              voiceProfile: quoteResult.voiceProfile,
              selectionScore: quoteResult.score,
              timestamp: new Date().toISOString()
            };

            this.agentLogger.info('Example Company quotes selected for market', {
              market,
              primaryQuoteId: quoteResult.selectedQuote.id,
              score: quoteResult.score,
              alternativeCount: (quoteResult.alternativeQuotes || []).length
            });
          }
        } catch (marketError) {
          this.agentLogger.warn('Failed to enhance market with Example Company quotes', {
            market,
            error: marketError.message
          });
        }
      }

      // Add Example Company enhancements to research data
      enhancedData.exampleCompanyEnhancements = exampleCompanyEnhancements;
      enhancedData.exampleCompanyMetadata = {
        enhancementTimestamp: new Date().toISOString(),
        voiceRequirements,
        marketsEnhanced: Object.keys(exampleCompanyEnhancements).length,
        totalQuotesSelected: Object.values(exampleCompanyEnhancements).length,
        processingTimeMs: Date.now() - startTime
      };

      this.agentLogger.info('Example Company quote enhancement completed', {
        marketsProcessed: markets.length,
        marketsEnhanced: Object.keys(exampleCompanyEnhancements).length,
        totalQuotes: Object.values(exampleCompanyEnhancements).length,
        processingTimeMs: Date.now() - startTime
      });

      return enhancedData;

    } catch (error) {
      this.agentLogger.error('Example Company quote enhancement failed', {
        error: error.message,
        stack: error.stack,
        markets: markets.length
      });

      // Return original data on error - graceful degradation
      return researchData;
    }
  }

  /**
   * Analyze voice requirements from research data and market context
   * @param {Object} researchData - The research data to analyze
   * @param {Array} markets - Array of market names
   * @returns {Object} Voice requirements for quote selection
   */
  async _analyzeVoiceRequirements(researchData, markets) {
    try {
      this.agentLogger.info('Analyzing voice requirements', {
        markets: markets.length,
        hasResearchData: !!researchData
      });

      // Extract content themes and market characteristics
      const contentAnalysis = this._analyzeContentForVoice(researchData);
      const marketCharacteristics = this._analyzeMarketCharacteristics(markets);

      // Removed: voicePatternEngine.analyzeRequiredVoice - replaced by marketExpertInsights service
      // Using default voice analysis for graceful degradation
      const voiceAnalysis = {
        recommendedTone: 'professional',
        complexityLevel: 'moderate',
        personalityTraits: ['authoritative', 'trustworthy'],
        communicationStyle: 'informative'
      };

      const voiceRequirements = {
        preferredTone: voiceAnalysis.recommendedTone || 'professional',
        complexityLevel: voiceAnalysis.complexityLevel || 'moderate',
        personalityTraits: voiceAnalysis.personalityTraits || ['authoritative', 'trustworthy'],
        communicationStyle: voiceAnalysis.communicationStyle || 'informative',
        marketFocus: marketCharacteristics.primaryFocus,
        contentContext: contentAnalysis.primaryContext,
        analysisTimestamp: new Date().toISOString()
      };

      this.agentLogger.info('Voice requirements analyzed', {
        tone: voiceRequirements.preferredTone,
        complexity: voiceRequirements.complexityLevel,
        traits: voiceRequirements.personalityTraits.length,
        style: voiceRequirements.communicationStyle
      });

      return voiceRequirements;

    } catch (error) {
      this.agentLogger.warn('Voice requirements analysis failed, using defaults', {
        error: error.message
      });

      // Return default voice requirements on error
      return {
        preferredTone: 'professional',
        complexityLevel: 'moderate',
        personalityTraits: ['authoritative', 'trustworthy'],
        communicationStyle: 'informative',
        marketFocus: 'general',
        contentContext: 'market_analysis',
        analysisTimestamp: new Date().toISOString(),
        fallback: true
      };
    }
  }

  /**
   * Extract content theme from research data for a specific market
   * @param {Object} researchData - The research data
   * @param {string} market - Market name
   * @returns {string} Content theme
   */
  _extractContentTheme(researchData, market) {
    try {
      // Look for market-specific data
      if (researchData.marketData && researchData.marketData[market]) {
        const marketData = researchData.marketData[market];
        
        // Analyze content for themes
        if (marketData.trends && marketData.trends.length > 0) {
          return 'market_trends';
        }
        if (marketData.priceData) {
          return 'pricing_analysis';
        }
        if (marketData.demographics) {
          return 'demographic_insights';
        }
      }

      // Default theme
      return 'market_analysis';
    } catch (error) {
      this.agentLogger.warn('Failed to extract content theme', {
        market,
        error: error.message
      });
      return 'market_analysis';
    }
  }

  /**
   * Extract market data for a specific market
   * @param {Object} researchData - The research data
   * @param {string} market - Market name
   * @returns {Object} Market data
   */
  _extractMarketData(researchData, market) {
    try {
      if (researchData.marketData && researchData.marketData[market]) {
        return researchData.marketData[market];
      }
      
      // Return minimal market data structure
      return {
        market: market,
        dataAvailable: false,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      this.agentLogger.warn('Failed to extract market data', {
        market,
        error: error.message
      });
      return { market: market, dataAvailable: false };
    }
  }

  /**
   * Analyze content for voice characteristics
   * @param {Object} researchData - The research data to analyze
   * @returns {Object} Content analysis results
   */
  _analyzeContentForVoice(researchData) {
    try {
      const analysis = {
        themes: [],
        audienceProfile: 'general',
        goals: [],
        primaryContext: 'market_analysis'
      };

      // Analyze research data structure
      if (researchData.marketData) {
        analysis.themes.push('market_data');
        analysis.goals.push('inform');
      }

      if (researchData.trends) {
        analysis.themes.push('trend_analysis');
        analysis.goals.push('educate');
      }

      if (researchData.insights) {
        analysis.themes.push('market_insights');
        analysis.goals.push('persuade');
      }

      // Determine audience profile
      if (analysis.themes.includes('market_data') || analysis.themes.includes('trend_analysis')) {
        analysis.audienceProfile = 'professional';
      }

      // Set primary context
      if (analysis.themes.length > 0) {
        analysis.primaryContext = analysis.themes[0];
      }

      return analysis;
    } catch (error) {
      this.agentLogger.warn('Content voice analysis failed', {
        error: error.message
      });
      
      return {
        themes: ['market_analysis'],
        audienceProfile: 'general',
        goals: ['inform'],
        primaryContext: 'market_analysis'
      };
    }
  }

  /**
   * Analyze market characteristics for voice selection
   * @param {Array} markets - Array of market names
   * @returns {Object} Market characteristics analysis
   */
  _analyzeMarketCharacteristics(markets) {
    try {
      const characteristics = {
        types: [],
        primaryFocus: 'general',
        marketCount: markets.length
      };

      // Analyze market names for characteristics
      markets.forEach(market => {
        const marketLower = market.toLowerCase();
        
        if (marketLower.includes('los angeles') || marketLower.includes('new york') ||
            marketLower.includes('san francisco') || marketLower.includes('chicago')) {
          characteristics.types.push('major_metro');
        } else if (marketLower.includes('county') || marketLower.includes('suburban')) {
          characteristics.types.push('suburban');
        } else {
          characteristics.types.push('regional');
        }
      });

      // Determine primary focus
      if (characteristics.types.includes('major_metro')) {
        characteristics.primaryFocus = 'urban';
      } else if (characteristics.types.includes('suburban')) {
        characteristics.primaryFocus = 'suburban';
      } else {
        characteristics.primaryFocus = 'regional';
      }

      return characteristics;
    } catch (error) {
      this.agentLogger.warn('Market characteristics analysis failed', {
        error: error.message
      });
      
      return {
        types: ['general'],
        primaryFocus: 'general',
        marketCount: markets.length
      };
    }
  }
}

module.exports = MarketResearcherAgent;