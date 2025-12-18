const { config } = require('../config');
const { logger } = require('../utils/logger');
const firecrawlService = require('./firecrawl');
const { RedisService } = require('./redis');
const { DataProcessorService } = require('./dataProcessor');
const async = require('async');
const moment = require('moment');
const {
  buildOptimizedSearchQuery,
  buildEnhancedSearchOptions,
  buildQueryVariations
} = require('../utils/searchQueryBuilder');

/**
 * Market Data Service - Core orchestrator for market data collection
 * Manages data collection for 100 US metropolitan areas
 */
class MarketDataService {
  constructor() {
    this.firecrawlService = firecrawlService;
    this.redisService = new RedisService();
    this.dataProcessor = new DataProcessorService();
    this.isInitialized = false;
    
    // Top 100 US MSAs by population
    this.targetMarkets = this._initializeMarkets();
    
    // Data source configurations
    this.dataSources = this._initializeDataSources();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      // Initialize Firecrawl service
      try {
        await this.firecrawlService.initialize();
        logger.info('Firecrawl service initialized successfully');
      } catch (firecrawlError) {
        logger.warn('Firecrawl service initialization failed', {
          error: firecrawlError.message
        });
        // Don't fail completely, but log the issue
      }

      // Try to initialize Redis, but don't fail if it's not available (local development)
      try {
        await this.redisService.initialize();
        logger.info('Redis service initialized successfully');
      } catch (redisError) {
        logger.warn('Redis service not available, continuing without caching', {
          error: redisError.message
        });
        this.redisService = null; // Disable Redis functionality
      }
      
      await this.dataProcessor.initialize();
      this.isInitialized = true;
      logger.info('MarketDataService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MarketDataService:', error);
      throw error;
    }
  }

  /**
   * Initialize the 100 target metropolitan areas
   */
  _initializeMarkets() {
    return [
      // Top 10 MSAs
      { code: 'NYC', name: 'New York-Newark-Jersey City, NY-NJ-PA', population: 20140470, region: 'Northeast' },
      { code: 'LAX', name: 'Los Angeles-Long Beach-Anaheim, CA', population: 13200998, region: 'West' },
      { code: 'CHI', name: 'Chicago-Naperville-Elgin, IL-IN-WI', population: 9618502, region: 'Midwest' },
      { code: 'DFW', name: 'Dallas-Fort Worth-Arlington, TX', population: 7637387, region: 'South' },
      { code: 'HOU', name: 'Houston-The Woodlands-Sugar Land, TX', population: 7122240, region: 'South' },
      { code: 'WDC', name: 'Washington-Arlington-Alexandria, DC-VA-MD-WV', population: 6385162, region: 'South' },
      { code: 'MIA', name: 'Miami-Fort Lauderdale-West Palm Beach, FL', population: 6138333, region: 'South' },
      { code: 'PHL', name: 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD', population: 6096120, region: 'Northeast' },
      { code: 'ATL', name: 'Atlanta-Sandy Springs-Roswell, GA', population: 6020364, region: 'South' },
      { code: 'BOS', name: 'Boston-Cambridge-Newton, MA-NH', population: 4873019, region: 'Northeast' },
      
      // Top 11-25 MSAs
      { code: 'PHX', name: 'Phoenix-Mesa-Scottsdale, AZ', population: 4845832, region: 'West' },
      { code: 'SFO', name: 'San Francisco-Oakland-Hayward, CA', population: 4749008, region: 'West' },
      { code: 'RIV', name: 'Riverside-San Bernardino-Ontario, CA', population: 4599839, region: 'West' },
      { code: 'DET', name: 'Detroit-Warren-Dearborn, MI', population: 4392041, region: 'Midwest' },
      { code: 'SEA', name: 'Seattle-Tacoma-Bellevue, WA', population: 4018762, region: 'West' },
      { code: 'MIN', name: 'Minneapolis-St. Paul-Bloomington, MN-WI', population: 3690261, region: 'Midwest' },
      { code: 'SDG', name: 'San Diego-Carlsbad, CA', population: 3338330, region: 'West' },
      { code: 'TPA', name: 'Tampa-St. Petersburg-Clearwater, FL', population: 3175275, region: 'South' },
      { code: 'DEN', name: 'Denver-Aurora-Lakewood, CO', population: 2963821, region: 'West' },
      { code: 'STL', name: 'St. Louis, MO-IL', population: 2820253, region: 'Midwest' },
      { code: 'BAL', name: 'Baltimore-Columbia-Towson, MD', population: 2844510, region: 'South' },
      { code: 'CHA', name: 'Charlotte-Concord-Gastonia, NC-SC', population: 2660329, region: 'South' },
      { code: 'ORL', name: 'Orlando-Kissimmee-Sanford, FL', population: 2608147, region: 'South' },
      { code: 'SAN', name: 'San Antonio-New Braunfels, TX', population: 2558143, region: 'South' },
      { code: 'POR', name: 'Portland-Vancouver-Hillsboro, OR-WA', population: 2512859, region: 'West' },
      
      // Continue with remaining 75 markets (abbreviated for space)
      // In production, this would include all 100 MSAs
      { code: 'SAC', name: 'Sacramento--Roseville--Arden-Arcade, CA', population: 2397382, region: 'West' },
      { code: 'PIT', name: 'Pittsburgh, PA', population: 2370930, region: 'Northeast' },
      { code: 'LAS', name: 'Las Vegas-Henderson-Paradise, NV', population: 2265461, region: 'West' },
      { code: 'CIN', name: 'Cincinnati, OH-KY-IN', population: 2256884, region: 'Midwest' },
      { code: 'AUS', name: 'Austin-Round Rock, TX', population: 2283371, region: 'South' },
      // ... Additional 70 markets would be listed here
      
      // Markets 31-100 (Added 2025-10-01 for 100% market coverage)
      { code: 'CMH', name: 'Columbus', population: 0, region: 'Midwest' },
      { code: 'IND', name: 'Indianapolis-Carmel-Anderson', population: 0, region: 'Midwest' },
      { code: 'CLE', name: 'Cleveland-Elyria', population: 0, region: 'Midwest' },
      { code: 'SJC', name: 'San Jose-Sunnyvale-Santa Clara', population: 0, region: 'West' },
      { code: 'BNA', name: 'Nashville-Davidson--Murfreesboro--Franklin', population: 0, region: 'South' },
      { code: 'ORF', name: 'Virginia Beach-Norfolk-Newport News', population: 0, region: 'South' },
      { code: 'PVD', name: 'Providence-Warwick', population: 0, region: 'Northeast' },
      { code: 'MKE', name: 'Milwaukee-Waukesha-West Allis', population: 0, region: 'Midwest' },
      { code: 'JAX', name: 'Jacksonville', population: 0, region: 'South' },
      { code: 'MEM', name: 'Memphis', population: 0, region: 'South' },
      { code: 'OKC', name: 'Oklahoma City', population: 0, region: 'South' },
      { code: 'SDF', name: 'Louisville/Jefferson County', population: 0, region: 'South' },
      { code: 'BDL', name: 'Hartford-West Hartford-East Hartford', population: 0, region: 'Northeast' },
      { code: 'RIC', name: 'Richmond', population: 0, region: 'South' },
      { code: 'MSY', name: 'New Orleans-Metairie', population: 0, region: 'South' },
      { code: 'BUF', name: 'Buffalo-Cheektowaga-Niagara Falls', population: 0, region: 'Northeast' },
      { code: 'RDU', name: 'Raleigh', population: 0, region: 'South' },
      { code: 'BHM', name: 'Birmingham-Hoover', population: 0, region: 'South' },
      { code: 'SLC', name: 'Salt Lake City', population: 0, region: 'West' },
      { code: 'ROC', name: 'Rochester', population: 0, region: 'Northeast' },
      { code: 'GRR', name: 'Grand Rapids-Wyoming', population: 0, region: 'Midwest' },
      { code: 'TUS', name: 'Tucson', population: 0, region: 'West' },
      { code: 'TUL', name: 'Tulsa', population: 0, region: 'South' },
      { code: 'HNL', name: 'Honolulu', population: 0, region: 'West' },
      { code: 'FAT', name: 'Fresno', population: 0, region: 'West' },
      { code: 'ORH', name: 'Worcester', population: 0, region: 'Northeast' },
      { code: 'BDR', name: 'Bridgeport-Stamford-Norwalk', population: 0, region: 'Northeast' },
      { code: 'ALB', name: 'Albany-Schenectady-Troy', population: 0, region: 'Northeast' },
      { code: 'OMA', name: 'Omaha-Council Bluffs', population: 0, region: 'Midwest' },
      { code: 'ABQ', name: 'Albuquerque', population: 0, region: 'West' },
      { code: 'GSP', name: 'Greenville-Anderson-Mauldin', population: 0, region: 'South' },
      { code: 'BTR', name: 'Baton Rouge', population: 0, region: 'South' },
      { code: 'DAY', name: 'Dayton', population: 0, region: 'Midwest' },
      { code: 'CAK', name: 'Akron', population: 0, region: 'Midwest' },
      { code: 'ELP', name: 'El Paso', population: 0, region: 'South' },
      { code: 'MFE', name: 'McAllen-Edinburg-Mission', population: 0, region: 'South' },
      { code: 'BFL', name: 'Bakersfield', population: 0, region: 'West' },
      { code: 'SCK', name: 'Stockton-Lodi', population: 0, region: 'West' },
      { code: 'YNG', name: 'Youngstown-Warren-Boardman', population: 0, region: 'Midwest' },
      { code: 'MDT', name: 'Harrisburg-Carlisle', population: 0, region: 'Northeast' },
      { code: 'AVP', name: 'Scranton--Wilkes-Barre--Hazleton', population: 0, region: 'Northeast' },
      { code: 'CEF', name: 'Springfield', population: 0, region: 'Northeast' },
      { code: 'LIT', name: 'Little Rock-North Little Rock-Conway', population: 0, region: 'South' },
      { code: 'OXR', name: 'Oxnard-Thousand Oaks-Ventura', population: 0, region: 'West' },
      { code: 'RSW', name: 'Cape Coral-Fort Myers', population: 0, region: 'South' },
      { code: 'TYS', name: 'Knoxville', population: 0, region: 'South' },
      { code: 'CHS', name: 'Charleston-North Charleston', population: 0, region: 'South' },
      { code: 'LAL', name: 'Lakeland-Winter Haven', population: 0, region: 'South' },
      { code: 'DAB', name: 'Daytona Beach-Deltona-Ormond Beach', population: 0, region: 'South' },
      { code: 'ABE', name: 'Allentown-Bethlehem-Easton', population: 0, region: 'Northeast' },
      { code: 'BOI', name: 'Boise City', population: 0, region: 'West' },
      { code: 'SRQ', name: 'North Port-Sarasota-Bradenton', population: 0, region: 'South' },
      { code: 'CAE', name: 'Columbia', population: 0, region: 'South' },
      { code: 'COS', name: 'Colorado Springs', population: 0, region: 'West' },
      { code: 'PVU', name: 'Provo-Orem', population: 0, region: 'West' },
      { code: 'JAN', name: 'Jackson', population: 0, region: 'South' },
      { code: 'DSM', name: 'Des Moines-West Des Moines', population: 0, region: 'Midwest' },
      { code: 'DLT', name: 'Deltona-Daytona Beach-Ormond Beach', population: 0, region: 'South' },
      { code: 'ICT', name: 'Wichita', population: 0, region: 'Midwest' },
      { code: 'MSN', name: 'Madison', population: 0, region: 'Midwest' },
      { code: 'TOL', name: 'Toledo', population: 0, region: 'Midwest' },
      { code: 'SYR', name: 'Syracuse', population: 0, region: 'Northeast' },
      { code: 'GEG', name: 'Spokane-Spokane Valley', population: 0, region: 'West' },
      { code: 'CHA', name: 'Chattanooga', population: 0, region: 'South' },
      { code: 'FWA', name: 'Fort Wayne', population: 0, region: 'Midwest' },
      { code: 'MOD', name: 'Modesto', population: 0, region: 'West' },
      { code: 'MOB', name: 'Mobile', population: 0, region: 'South' },
      { code: 'PNS', name: 'Pensacola-Ferry Pass-Brent', population: 0, region: 'South' },
      { code: 'PIA', name: 'Peoria', population: 0, region: 'Midwest' },
      { code: 'XNA', name: 'Fayetteville-Springdale-Rogers', population: 0, region: 'South' }
    ];
  }

  /**
   * Initialize data source configurations
   */
  _initializeDataSources() {
    return {
      realEstate: {
        priority: 'high',
        refreshInterval: 6, // hours
        sources: [
          {
            name: 'competitor2_com',
            baseUrl: 'https://www.competitor2.com/research/data',
            extractionRules: {
              medianPrice: { selector: '.median-price', type: 'currency' },
              inventory: { selector: '.inventory-data', type: 'number' },
              priceChange: { selector: '.price-change', type: 'percentage' }
            }
          },
          {
            name: 'Competitor One_research',
            baseUrl: 'https://www.competitor1.com/research/data',
            extractionRules: {
              zhvi: { selector: '.zhvi-data', type: 'currency' },
              rentIndex: { selector: '.rent-index', type: 'currency' },
              marketHeat: { selector: '.market-temperature', type: 'string' }
            }
          }
        ]
      },
      economic: {
        priority: 'medium',
        refreshInterval: 24, // hours
        sources: [
          {
            name: 'bls_employment',
            baseUrl: 'https://www.bls.gov/regions',
            extractionRules: {
              unemploymentRate: { selector: '.unemployment-rate', type: 'percentage' },
              jobGrowth: { selector: '.job-growth', type: 'percentage' },
              laborForce: { selector: '.labor-force', type: 'number' }
            }
          },
          {
            name: 'census_demographics',
            baseUrl: 'https://www.census.gov/quickfacts',
            extractionRules: {
              population: { selector: '.population-data', type: 'number' },
              medianIncome: { selector: '.median-income', type: 'currency' },
              populationGrowth: { selector: '.population-growth', type: 'percentage' }
            }
          }
        ]
      },
      news: {
        priority: 'medium',
        refreshInterval: 2, // hours
        sources: [
          {
            name: 'local_news',
            baseUrl: 'https://news.google.com/search',
            extractionRules: {
              headlines: { selector: '.article-title', type: 'array' },
              sentiment: { selector: '.sentiment-score', type: 'number' },
              publishDate: { selector: '.publish-date', type: 'date' }
            }
          }
        ]
      },
      demographics: {
        priority: 'low',
        refreshInterval: 168, // hours (1 week)
        sources: [
          {
            name: 'census_acs',
            baseUrl: 'https://data.census.gov/cedsci',
            extractionRules: {
              ageDistribution: { selector: '.age-data', type: 'object' },
              educationLevels: { selector: '.education-data', type: 'object' },
              housingCharacteristics: { selector: '.housing-data', type: 'object' }
            }
          }
        ]
      }
    };
  }

  /**
   * Collect data for all markets
   */
  async collectAllMarkets(options = {}) {
    const {
      dataTypes = ['realEstate', 'economic', 'news', 'demographics'],
      forceRefresh = false,
      batchSize = config.dataCollection.batchSize
    } = options;

    logger.info(`Starting data collection for ${this.targetMarkets.length} markets`);
    
    try {
      const results = {
        successful: [],
        failed: [],
        total: this.targetMarkets.length,
        startTime: moment().toISOString()
      };

      // Process markets in batches to avoid overwhelming external APIs
      await async.eachLimit(this.targetMarkets, batchSize, async (market) => {
        try {
          const marketData = await this.collectMarketData(market.code, {
            dataTypes,
            forceRefresh
          });
          
          results.successful.push({
            market: market.code,
            dataTypes: Object.keys(marketData),
            timestamp: moment().toISOString()
          });
          
          logger.info(`Successfully collected data for ${market.name}`);
        } catch (error) {
          results.failed.push({
            market: market.code,
            error: error.message,
            timestamp: moment().toISOString()
          });
          
          logger.error(`Failed to collect data for ${market.name}:`, error);
        }
      });

      results.endTime = moment().toISOString();
      results.duration = moment(results.endTime).diff(moment(results.startTime), 'minutes');
      
      logger.info(`Data collection completed. Success: ${results.successful.length}, Failed: ${results.failed.length}`);
      
      return results;
    } catch (error) {
      logger.error('Error in collectAllMarkets:', error);
      throw error;
    }
  }

  /**
   * Collect data for a specific market
   */
  async collectMarketData(marketCode, options = {}) {
    const {
      dataTypes = ['realEstate', 'economic', 'news', 'demographics'],
      forceRefresh = false,
      timeout = 180000 // 3 minutes for quality-focused processing
    } = options;

    const market = this.targetMarkets.find(m => m.code === marketCode);
    if (!market) {
      throw new Error(`Market not found: ${marketCode}`);
    }

    logger.info(`Collecting data for market: ${market.name} using search-first approach`, {
      market: market.code,
      dataTypes,
      timeout: `${timeout}ms`,
      searchFirst: true
    });

    const marketData = {};
    const errors = [];
    const performanceMetrics = {
      startTime: Date.now(),
      searchAttempts: 0,
      scrapingFallbacks: 0,
      totalDuration: 0
    };

    // Collect data for each requested type
    for (const dataType of dataTypes) {
      try {
        // Check cache first unless force refresh is requested
        if (!forceRefresh) {
          const cachedData = await this.redisService.getMarketData(marketCode, dataType);
          if (cachedData) {
            marketData[dataType] = cachedData;
            logger.debug(`Using cached data for ${marketCode}:${dataType}`);
            continue;
          }
        }

        // Collect fresh data
        const freshData = await this._collectDataType(market, dataType);
        
        // Process and validate the data
        const processedData = await this.dataProcessor.processData(freshData, dataType, market);
        
        // Cache the processed data
        await this.redisService.setMarketData(marketCode, dataType, processedData);
        
        marketData[dataType] = processedData;
        
        logger.debug(`Collected fresh data for ${marketCode}:${dataType}`);
      } catch (error) {
        errors.push({
          dataType,
          error: error.message
        });
        logger.error(`Error collecting ${dataType} data for ${marketCode}:`, error);
      }
    }

    // Calculate final performance metrics
    performanceMetrics.totalDuration = Date.now() - performanceMetrics.startTime;
    
    // Log comprehensive performance summary
    logger.info(`Market data collection completed for ${market.name}`, {
      market: market.code,
      duration: `${performanceMetrics.totalDuration}ms`,
      searchAttempts: performanceMetrics.searchAttempts,
      scrapingFallbacks: performanceMetrics.scrapingFallbacks,
      searchFirstEfficiency: performanceMetrics.searchAttempts > 0 ?
        `${Math.round((performanceMetrics.searchAttempts / (performanceMetrics.searchAttempts + performanceMetrics.scrapingFallbacks)) * 100)}%` : '0%',
      dataTypesCollected: Object.keys(marketData).length,
      errorCount: errors.length
    });

    // Add metadata with performance metrics
    marketData._metadata = {
      market: market,
      collectedAt: moment().toISOString(),
      dataTypes: Object.keys(marketData).filter(key => key !== '_metadata'),
      errors: errors.length > 0 ? errors : undefined,
      performance: {
        totalDuration: performanceMetrics.totalDuration,
        searchAttempts: performanceMetrics.searchAttempts,
        scrapingFallbacks: performanceMetrics.scrapingFallbacks,
        searchFirstEfficiency: performanceMetrics.searchAttempts > 0 ?
          Math.round((performanceMetrics.searchAttempts / (performanceMetrics.searchAttempts + performanceMetrics.scrapingFallbacks)) * 100) : 0
      }
    };

    return marketData;
  }

  /**
   * Collect data for a specific data type and market
   */
  async _collectDataType(market, dataType) {
    const sourceConfig = this.dataSources[dataType];
    if (!sourceConfig) {
      throw new Error(`Unknown data type: ${dataType}`);
    }

    const collectedData = {};
    const errors = [];

    // Collect from each source for this data type
    for (const source of sourceConfig.sources) {
      try {
        const sourceData = await this._collectFromSource(market, source, dataType);
        collectedData[source.name] = sourceData;
      } catch (error) {
        errors.push({
          source: source.name,
          error: error.message
        });
        logger.warn(`Failed to collect from source ${source.name} for ${market.code}:`, error);
      }
    }

    if (Object.keys(collectedData).length === 0) {
      throw new Error(`No data collected from any source for ${dataType}`);
    }

    return {
      sources: collectedData,
      errors: errors.length > 0 ? errors : undefined,
      collectedAt: moment().toISOString()
    };
  }

  /**
   * Collect data from a specific source using search-first approach
   * PERFORMANCE OPTIMIZATION: Use fast Firecrawl Search API (1.5s) before slow scraping (17s)
   */
  async _collectFromSource(market, source, dataType) {
    const startTime = Date.now();
    
    try {
      // TIER 1: Try fast Firecrawl Search API first (91.3% faster)
      logger.info(`Attempting fast search for ${market.name} - ${source.name}`, {
        market: market.code,
        source: source.name,
        dataType
      });
      
      // OPTIMIZED: Use enhanced search query builder for better results
      const searchQuery = buildOptimizedSearchQuery(market.name, source.name, source);
      const searchOptions = buildEnhancedSearchOptions(market.name, {
        limit: 8, // Increased from 5 for better coverage
        scrapeOptions: false // Fast search without scraping
      });
      
      const searchResults = await this.firecrawlService.searchContent(searchQuery, searchOptions);
      
      if (searchResults && searchResults.length > 0) {
        const duration = Date.now() - startTime;
        logger.info(`Optimized search successful for ${market.name} - ${source.name}`, {
          duration: `${duration}ms`,
          resultsCount: searchResults.length,
          performance: 'search_api_success',
          optimizedQuery: searchQuery,
          searchOptions: searchOptions
        });
        
        return {
          searchQuery,
          data: searchResults,
          extractedAt: moment().toISOString(),
          source: source.name,
          method: 'search_api',
          duration: `${duration}ms`,
          resultsCount: searchResults.length
        };
      }
      
      logger.warn(`Search API returned no results for ${market.name} - ${source.name}, falling back to scraping`);
      
    } catch (searchError) {
      logger.warn(`Search API failed for ${market.name} - ${source.name}, falling back to scraping`, {
        error: searchError.message,
        fallbackReason: 'search_api_failure'
      });
    }
    
    // TIER 2: Fallback to traditional scraping if search fails
    try {
      logger.info(`Using fallback scraping for ${market.name} - ${source.name}`, {
        market: market.code,
        source: source.name,
        dataType,
        fallbackReason: 'search_unavailable'
      });
      
      const url = this._buildSourceUrl(market, source, dataType);
      const scrapedData = await this.firecrawlService.scrapeUrl(url, {
        extractionRules: source.extractionRules,
        timeout: 180000 // 3 minutes for quality-focused scraping
      });
      
      const duration = Date.now() - startTime;
      logger.info(`Fallback scraping completed for ${market.name} - ${source.name}`, {
        duration: `${duration}ms`,
        performance: 'scraping_fallback_success'
      });

      return {
        url,
        data: scrapedData,
        extractedAt: moment().toISOString(),
        source: source.name,
        method: 'scraping_fallback',
        duration: `${duration}ms`,
        fallbackUsed: true
      };
      
    } catch (scrapingError) {
      const duration = Date.now() - startTime;
      logger.error(`Both search and scraping failed for ${market.name} - ${source.name}`, {
        searchError: 'failed',
        scrapingError: scrapingError.message,
        duration: `${duration}ms`,
        totalFailure: true
      });
      throw scrapingError;
    }
  }

  // REMOVED: Old _buildSearchQuery method replaced with optimized searchQueryBuilder utility
  // The new implementation uses buildOptimizedSearchQuery() from ../utils/searchQueryBuilder.js
  // which provides better natural language queries and improved search success rates

  /**
   * Build URL for market-specific data collection (fallback method)
   */
  _buildSourceUrl(market, source, dataType) {
    // This would be customized based on each source's URL structure
    // For now, return a basic URL structure
    return `${source.baseUrl}/${market.code.toLowerCase()}`;
  }

  /**
   * Get market information by code or name
   */
  getMarket(marketIdentifier) {
    if (!marketIdentifier) {
      return null;
    }

    // Normalize function: remove state abbreviations, convert ALL separators to spaces
    // This ensures "los-angeles-long-beach-anaheim" matches "Los Angeles-Long Beach-Anaheim"
    const normalize = (str) => str.toLowerCase()
      .replace(/,\s*[a-z]{2}$/i, '')           // Remove ", ST" at end
      .replace(/[^a-z0-9]/g, ' ')              // Convert ALL non-alphanumeric to spaces (including hyphens)
      .replace(/\s+/g, ' ')                     // Normalize multiple spaces to single space
      .trim();

    const normalizedInput = normalize(marketIdentifier);

    // Try exact code match first (fastest)
    let market = this.targetMarkets.find(m => m.code === marketIdentifier);
    if (market) {
      return market;
    }

    // Try exact name match
    market = this.targetMarkets.find(m => m.name === marketIdentifier);
    if (market) {
      return market;
    }

    // Try normalized matching - handles "Cleveland, OH" -> "Cleveland"
    for (const m of this.targetMarkets) {
      const normalizedMarketName = normalize(m.name);
      
      // Check if normalized input matches normalized market name
      if (normalizedMarketName === normalizedInput) {
        return m;
      }
      
      // Check if normalized input is contained in market name
      if (normalizedMarketName.includes(normalizedInput)) {
        return m;
      }
      
      // Check if market name is contained in input (handles longer input formats)
      if (normalizedInput.includes(normalizedMarketName)) {
        return m;
      }
    }

    // Final fallback: try original partial matching for edge cases
    market = this.targetMarkets.find(m => {
      const searchTerm = marketIdentifier.toLowerCase();
      const marketName = m.name.toLowerCase();
      
      // Handle common city, state format like "New York, NY"
      if (searchTerm.includes(',')) {
        const [city, state] = searchTerm.split(',').map(s => s.trim());
        return marketName.includes(city) && marketName.includes(state);
      }
      
      // Handle single city name
      return marketName.includes(searchTerm);
    });

    return market;
  }

  /**
   * Get all markets
   */
  getAllMarkets() {
    return this.targetMarkets;
  }

  /**
   * Get markets by region
   */
  getMarketsByRegion(region) {
    return this.targetMarkets.filter(m => m.region === region);
  }

  /**
   * Get top N markets by population
   */
  getTopMarkets(count = 10) {
    return this.targetMarkets.slice(0, count).map(market => market.name);
  }

  /**
   * Validate market data quality
   */
  async validateDataQuality(marketCode, dataType) {
    try {
      const data = await this.redisService.getMarketData(marketCode, dataType);
      if (!data) {
        return { valid: false, score: 0, issues: ['No data found'] };
      }

      return await this.dataProcessor.validateQuality(data, dataType);
    } catch (error) {
      logger.error(`Error validating data quality for ${marketCode}:${dataType}:`, error);
      throw error;
    }
  }

  /**
   * Get data collection status
   */
  async getCollectionStatus() {
    const status = {
      totalMarkets: this.targetMarkets.length,
      dataTypes: Object.keys(this.dataSources),
      cacheStatus: await this.redisService.getStatus(),
      lastCollection: await this.redisService.getLastCollectionTime(),
      isInitialized: this.isInitialized
    };

    return status;
  }
}

// Create and export singleton instance following project pattern
const marketDataService = new MarketDataService();
module.exports = marketDataService;