const { logger } = require('../utils/logger');
const { ValidationError, ExternalServiceError } = require('../utils/errorHandler');
const firecrawlService = require('./firecrawl');
const tavilyService = require('./tavilyService');

/**
 * Market Data Service
 * Provides real-time market data validation and cross-reference capabilities
 * Integrates with authoritative sources for accurate market statistics
 * Enhanced with Tavily AI unified search as alternative to Firecrawl
 */
class MarketValidationService {
  constructor() {
    this.config = {
      dataSources: {
        exampleCompany: {
          baseUrl: 'https://www.example.com',
          searchPath: '/city/{city}/filter/property-type=house',
          timeout: 10000
        },
        competitor2: {
          baseUrl: 'https://www.competitor2.com',
          searchPath: '/realestateandhomes-search/{city}',
          timeout: 10000
        },
        "Competitor One": {
          baseUrl: 'https://www.competitor1.com',
          searchPath: '/homes/{city}_rb/',
          timeout: 10000
        }
      },
      cacheTimeout: 300000, // 5 minutes
      retryAttempts: 3,
      confidenceThresholds: {
        high: 85,
        medium: 70,
        low: 50
      }
    };
    
    this.cache = new Map();
    this.lastUpdated = new Map();
  }

  /**
   * Get real-time market data for validation
   * @param {Object} params - Market data parameters
   * @param {string} params.market - Market/city name
   * @param {string} params.dataType - Type of data (prices, inventory, trends)
   * @param {Array} params.claimsToVerify - Specific claims to verify
   * @param {string} params.dataSource - Data source mode ('trusted', 'ai', 'hybrid', 'tavily')
   * @returns {Promise<Object>} Validated market data
   */
  async getRealtimeMarketData(params) {
    const { market, dataType = 'general', claimsToVerify = [], dataSource = 'hybrid' } = params;
    
    try {
      logger.info('🏠 MARKET DATA REQUEST', {
        market,
        dataType,
        dataSource,
        claimsCount: claimsToVerify.length,
        timestamp: new Date().toISOString()
      });

      // Check cache first
      const cacheKey = `${market}-${dataType}-${dataSource}`;
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        logger.info('📋 USING CACHED MARKET DATA', { market, dataType, dataSource });
        return cachedData;
      }

      // OPTIMIZATION: Skip scraping for trusted data source
      let dataResults = [];
      if (dataSource === 'trusted') {
        logger.info('⚡ TRUSTED DATA SOURCE - Skipping web scraping for performance', {
          market,
          dataType,
          optimization: 'scraping_bypassed'
        });
        
        // Return mock successful results to maintain data structure
        dataResults = [
          { status: 'fulfilled', value: { source: 'Example Company', success: true, data: {}, rawData: '', timestamp: new Date().toISOString(), skipped: true } },
          { status: 'fulfilled', value: { source: 'competitor2', success: true, data: {}, rawData: '', timestamp: new Date().toISOString(), skipped: true } },
          { status: 'fulfilled', value: { source: 'Competitor One', success: true, data: {}, rawData: '', timestamp: new Date().toISOString(), skipped: true } }
        ];
      } else if (dataSource === 'tavily') {
        // Use Tavily AI unified search instead of Firecrawl scraping
        logger.info('🔍 TAVILY AI MODE - Using unified search for market data', {
          market,
          dataType,
          optimization: 'tavily_unified_search'
        });
        
        dataResults = await Promise.allSettled([
          this._getTavilyMarketData(market, dataType, 'Example Company'),
          this._getTavilyMarketData(market, dataType, 'competitor2'),
          this._getTavilyMarketData(market, dataType, 'Competitor One')
        ]);
      } else {
        // Use Tavily AI unified search for AI and hybrid modes
        logger.info('🔍 TAVILY AI MODE - Using unified search for market data', {
          market,
          dataType,
          dataSource,
          optimization: 'tavily_unified_search'
        });
        
        dataResults = await Promise.allSettled([
          this._getTavilyMarketData(market, dataType, 'general')
        ]);
      }

      // Process and validate results
      const validatedData = this._processMarketDataResults(dataResults, market, dataType);
      
      // Verify specific claims if provided
      if (claimsToVerify.length > 0) {
        validatedData.claimVerification = await this._verifyClaims(claimsToVerify, validatedData);
      }

      // Cache the results
      this._cacheData(cacheKey, validatedData);

      logger.info('✅ MARKET DATA RETRIEVED', {
        market,
        dataType,
        dataSource,
        sourcesUsed: validatedData.sourcesUsed,
        confidence: validatedData.confidence,
        claimsVerified: claimsToVerify.length,
        optimization: dataSource === 'trusted' ? 'scraping_bypassed' : 
                     dataSource === 'tavily' ? 'tavily_unified_search' : 'full_scraping'
      });

      return validatedData;

    } catch (error) {
      logger.error('❌ MARKET DATA ERROR', {
        market,
        dataType,
        error: error.message,
        stack: error.stack
      });
      throw new ExternalServiceError(`Failed to retrieve market data for ${market}: ${error.message}`);
    }
  }


  /**
   * Get market data using Tavily AI unified search
   */
  async _getTavilyMarketData(market, dataType, targetSource) {
    try {
      // Construct market-specific search query for Tavily
      const searchQuery = this._constructTavilyMarketQuery(market, dataType, targetSource);
      
      // Execute Tavily unified search
      const searchResult = await tavilyService.search(searchQuery, {
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: true,
        max_results: 5,
        include_domains: this._getTavilyDomainFilter(targetSource)
      });

      // Parse Tavily results into market data format
      const parsedData = this._parseTavilyMarketData(searchResult, targetSource);

      return {
        source: targetSource,
        success: true,
        data: parsedData,
        rawData: JSON.stringify(searchResult, null, 2),
        searchQuery: searchQuery,
        method: 'tavily_search',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.warn(`⚠️ TAVILY ${targetSource.toUpperCase()} DATA FAILED`, { 
        market, 
        targetSource,
        error: error.message 
      });
      return {
        source: targetSource,
        success: false,
        error: error.message,
        method: 'tavily_search',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Construct Tavily search query for specific market and source
   */
  _constructTavilyMarketQuery(market, dataType, targetSource) {
    let baseQuery = `${market} real estate market data `;
    
    // Add source-specific context
    switch (targetSource) {
      case 'Example Company':
        baseQuery += 'Example Company median prices inventory trends days on market ';
        break;
      case 'competitor2':
        baseQuery += 'competitor2.com home prices market statistics trends ';
        break;
      case 'Competitor One':
        baseQuery += 'Competitor One zestimate home values market insights ';
        break;
    }
    
    // Add data type specific terms
    switch (dataType) {
      case 'prices':
        baseQuery += 'median home prices average sale prices ';
        break;
      case 'inventory':
        baseQuery += 'housing inventory active listings supply ';
        break;
      case 'trends':
        baseQuery += 'market trends price changes growth rates ';
        break;
      default:
        baseQuery += 'housing market statistics trends prices inventory ';
    }
    
    baseQuery += '2024 current data';
    
    return baseQuery;
  }

  /**
   * Get domain filter for Tavily search based on target source
   */
  _getTavilyDomainFilter(targetSource) {
    const domainMap = {
      'Example Company': ['example.com'],
      'competitor2': ['competitor2.com'],
      'Competitor One': ['competitor1.com']
    };
    
    return domainMap[targetSource] || [];
  }

  /**
   * Parse Tavily search results into market data format
   */
  _parseTavilyMarketData(searchResult, targetSource) {
    const data = { prices: [], trends: [], inventory: [], statistics: [] };
    
    if (!searchResult || !searchResult.results) {
      return data;
    }
    
    // Process search results
    searchResult.results.forEach(result => {
      const content = result.content || '';
      const title = result.title || '';
      const combinedText = `${title} ${content}`;
      
      // Extract price information
      const priceMatches = combinedText.match(/\$[\d,]+(?:\.\d+)?[KMB]?/g) || [];
      priceMatches.forEach(price => {
        let numericValue = price.replace(/[$,]/g, '');
        
        // Handle K, M, B suffixes
        if (price.includes('K')) numericValue = parseFloat(numericValue) * 1000;
        else if (price.includes('M')) numericValue = parseFloat(numericValue) * 1000000;
        else if (price.includes('B')) numericValue = parseFloat(numericValue) * 1000000000;
        
        data.prices.push({
          value: numericValue.toString(),
          source: targetSource,
          type: this._getPriceType(targetSource),
          url: result.url
        });
      });
      
      // Extract trend information
      const trendKeywords = ['increase', 'decrease', 'up', 'down', 'higher', 'lower', 'rise', 'fall', 'growth', 'decline'];
      const sentences = combinedText.split(/[.!?]+/);
      sentences.forEach(sentence => {
        if (trendKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          data.trends.push({
            description: sentence.trim(),
            source: targetSource,
            url: result.url
          });
        }
      });
      
      // Extract inventory information
      const inventoryKeywords = ['inventory', 'listings', 'supply', 'available', 'for sale'];
      sentences.forEach(sentence => {
        if (inventoryKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          data.inventory.push({
            description: sentence.trim(),
            source: targetSource,
            url: result.url
          });
        }
      });
    });
    
    // Include Tavily's answer if available
    if (searchResult.answer) {
      data.statistics.push({
        description: searchResult.answer,
        source: `${targetSource}_tavily_answer`,
        type: 'ai_summary'
      });
    }
    
    return data;
  }

  /**
   * Get price type based on source
   */
  _getPriceType(targetSource) {
    const typeMap = {
      'Example Company': 'listing_price',
      'competitor2': 'market_price', 
      'Competitor One': 'zestimate'
    };
    
    return typeMap[targetSource] || 'market_price';
  }

  /**
   * Process and validate market data results from multiple sources
   */
  _processMarketDataResults(dataResults, market, dataType) {
    const successfulSources = [];
    const failedSources = [];
    const aggregatedData = {
      prices: [],
      trends: [],
      inventory: [],
      statistics: []
    };

    // Process each source result
    dataResults.forEach((result, index) => {
      const sources = ['Example Company', 'competitor2', 'Competitor One'];
      const sourceName = sources[index];

      if (result.status === 'fulfilled' && result.value.success) {
        successfulSources.push(sourceName);
        const sourceData = result.value.data;
        
        // Aggregate data by type
        if (sourceData.prices) aggregatedData.prices.push(...sourceData.prices);
        if (sourceData.trends) aggregatedData.trends.push(...sourceData.trends);
        if (sourceData.inventory) aggregatedData.inventory.push(...sourceData.inventory);
        if (sourceData.statistics) aggregatedData.statistics.push(...sourceData.statistics);
      } else {
        failedSources.push({
          source: sourceName,
          error: result.status === 'fulfilled' ? result.value.error : result.reason.message
        });
      }
    });

    // Calculate confidence based on source agreement
    const confidence = this._calculateDataConfidence(successfulSources.length, aggregatedData);

    return {
      market,
      dataType,
      data: aggregatedData,
      sourcesUsed: successfulSources,
      sourcesFailed: failedSources,
      confidence,
      confidenceLevel: this._getConfidenceLevel(confidence),
      timestamp: new Date().toISOString(),
      isReliable: confidence >= this.config.confidenceThresholds.medium
    };
  }

  /**
   * Verify specific claims against market data
   */
  async _verifyClaims(claims, marketData) {
    const verificationResults = [];

    for (const claim of claims) {
      try {
        const verification = await this._verifySingleClaim(claim, marketData);
        verificationResults.push(verification);
      } catch (error) {
        verificationResults.push({
          claim,
          verified: false,
          confidence: 0,
          reason: `Verification failed: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    return verificationResults;
  }

  /**
   * Verify a single claim against market data
   */
  async _verifySingleClaim(claim, marketData) {
    // Extract numerical values and market references from claim
    const numbers = claim.match(/[\d,]+\.?\d*/g) || [];
    const percentages = claim.match(/\d+\.?\d*%/g) || [];
    
    // Check against aggregated data
    let matchingDataPoints = 0;
    let totalDataPoints = 0;
    let supportingEvidence = [];

    // Check price data
    if (numbers.length > 0 && marketData.data.prices.length > 0) {
      const claimNumbers = numbers.map(n => parseFloat(n.replace(/,/g, '')));
      marketData.data.prices.forEach(priceData => {
        totalDataPoints++;
        const priceValue = parseFloat(priceData.value || priceData.price || 0);
        const isWithinRange = claimNumbers.some(claimNum => 
          Math.abs(priceValue - claimNum) / claimNum < 0.15 // 15% tolerance
        );
        if (isWithinRange) {
          matchingDataPoints++;
          supportingEvidence.push(`Price data: ${priceValue} matches claim range`);
        }
      });
    }

    // Check trend data
    if (marketData.data.trends.length > 0) {
      marketData.data.trends.forEach(trend => {
        totalDataPoints++;
        if (this._claimMatchesTrend(claim, trend)) {
          matchingDataPoints++;
          supportingEvidence.push(`Trend data: ${trend.description || trend.trend} supports claim`);
        }
      });
    }

    const confidence = totalDataPoints > 0 ? (matchingDataPoints / totalDataPoints) * 100 : 0;

    return {
      claim,
      verified: confidence >= this.config.confidenceThresholds.medium,
      confidence: Math.round(confidence),
      matchingDataPoints,
      totalDataPoints,
      supportingEvidence,
      timestamp: new Date().toISOString()
    };
  }


  /**
   * Calculate data confidence based on source agreement
   */
  _calculateDataConfidence(sourceCount, aggregatedData) {
    let baseConfidence = (sourceCount / 3) * 100; // Based on number of successful sources
    
    // Adjust based on data consistency
    const dataPoints = [
      ...aggregatedData.prices,
      ...aggregatedData.trends,
      ...aggregatedData.inventory,
      ...aggregatedData.statistics
    ];
    
    if (dataPoints.length > 5) baseConfidence += 10; // Bonus for rich data
    if (sourceCount >= 2) baseConfidence += 15; // Bonus for multiple sources
    
    return Math.min(baseConfidence, 100);
  }

  /**
   * Get confidence level description
   */
  _getConfidenceLevel(confidence) {
    if (confidence >= this.config.confidenceThresholds.high) return 'high';
    if (confidence >= this.config.confidenceThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Check if claim matches trend data
   */
  _claimMatchesTrend(claim, trend) {
    const claimLower = claim.toLowerCase();
    const trendLower = (trend.description || trend.trend || '').toLowerCase();
    
    // Simple keyword matching - can be enhanced with NLP
    const positiveKeywords = ['increase', 'rise', 'up', 'higher', 'growth'];
    const negativeKeywords = ['decrease', 'fall', 'down', 'lower', 'decline'];
    
    const claimIsPositive = positiveKeywords.some(keyword => claimLower.includes(keyword));
    const claimIsNegative = negativeKeywords.some(keyword => claimLower.includes(keyword));
    const trendIsPositive = positiveKeywords.some(keyword => trendLower.includes(keyword));
    const trendIsNegative = negativeKeywords.some(keyword => trendLower.includes(keyword));
    
    return (claimIsPositive && trendIsPositive) || (claimIsNegative && trendIsNegative);
  }

  /**
   * Get cached data if still valid
   */
  _getCachedData(cacheKey) {
    const cached = this.cache.get(cacheKey);
    const lastUpdate = this.lastUpdated.get(cacheKey);
    
    if (cached && lastUpdate && (Date.now() - lastUpdate) < this.config.cacheTimeout) {
      return cached;
    }
    
    return null;
  }

  /**
   * Cache data with timestamp
   */
  _cacheData(cacheKey, data) {
    this.cache.set(cacheKey, data);
    this.lastUpdated.set(cacheKey, Date.now());
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.lastUpdated.clear();
    logger.info('🗑️ MARKET DATA CACHE CLEARED');
  }
}

module.exports = new MarketValidationService();