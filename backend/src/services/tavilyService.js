const { tavily } = require('@tavily/core');
const { logger } = require('../utils/logger');
const { config } = require('../config');
const { ExternalServiceError, RateLimitError } = require('../utils/errorHandler');
const { calculateTavilyCost } = require('../utils/costCalculator');

/**
 * Tavily AI Service - Unified search, extraction, crawling, and mapping
 * Provides AI-powered search and web crawling capabilities in a single service
 * Designed to complement/replace Perplexity and Firecrawl services
 */
class TavilyService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.version = '1.0.0';
    this.name = 'TavilyService';
    
    // Configuration properties for test compatibility
    this.apiKey = config.tavily?.apiKey;
    this.baseUrl = config.tavily?.baseUrl || 'https://api.tavily.com';
    this.timeout = config.tavily?.timeout || 30000;
    this.searchDepth = config.tavily?.searchDepth || 'basic';
    
    // Rate limiting configuration
    this.rateLimiter = {
      requestsPerMinute: config.tavily?.rateLimit || 100,
      requestQueue: [],
      lastRequestTime: 0,
      isProcessing: false,
      backoffMultiplier: 2,
      maxBackoffTime: 60000, // 1 minute max backoff
      currentBackoffTime: 1000 // Start with 1 second
    };
    
    // Response caching to prevent redundant requests
    this.responseCache = new Map();
    this.cacheExpiry = 1800000; // 30 minutes
    
    // Circuit breaker for failed requests
    this.circuitBreaker = {
      failureCount: 0,
      failureThreshold: 5,
      timeout: 60000, // 1 minute for test compatibility
      resetTimeout: 300000, // 5 minutes
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      lastFailureTime: 0,
      isOpen: false,
      canRetry: true,
      consecutiveFailures: 0
    };
    
    // Performance tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastSuccessTime: null,
      lastFailureTime: null,
      methodUsage: {
        search: 0,
        extract: 0,
        crawl: 0,
        map: 0
      }
    };
    
    // Last error for test compatibility
    this.lastError = null;
  }

  /**
   * Initialize the Tavily service
   */
  async initialize() {
    try {
      if (!config.tavily?.apiKey) {
        logger.warn('TAVILY_API_KEY not configured - service will operate in degraded mode');
        this.initialized = false;
        return false;
      }

      // Don't reinitialize if already initialized
      if (this.initialized && this.client) {
        return true;
      }

      this.client = tavily({
        apiKey: config.tavily.apiKey
      });

      logger.info('Initializing Tavily service', {
        configured: !!config.tavily.apiKey,
        version: this.version
      });

      // Test the connection
      const connectionTest = await this.testConnectionWithRetry();
      if (connectionTest) {
        this.initialized = true;
        logger.info('Tavily service initialized successfully');
        return true;
      } else {
        logger.warn('Tavily service connection test failed - service will operate in degraded mode');
        this.initialized = false;
        return false;
      }
    } catch (error) {
      logger.warn('Failed to initialize Tavily service - continuing in degraded mode', {
        error: error.message,
        stack: error.stack,
      });
      this.initialized = false;
      this.lastError = error;
      return false;
    }
  }

  /**
   * Test Tavily connectivity with retry logic
   */
  async testConnectionWithRetry(maxRetries = 3, retryDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.client) {
          throw new Error('Tavily client not created - check API key configuration');
        }

        logger.debug('Testing Tavily connection', { attempt, maxRetries });
        
        // Simple connection test with a basic search
        const testResult = await this.client.search('test connection', {
          max_results: 1,
          include_answer: false
        });
        
        if (testResult && testResult.results) {
          logger.debug('Tavily connection test successful', {
            attempt,
            resultsCount: testResult.results.length
          });
          return true;
        }
        
        throw new Error('Invalid response from Tavily API');
      } catch (error) {
        logger.warn('Tavily connection test failed', {
          attempt,
          maxRetries,
          error: error.message
        });
        
        this.lastError = error;
        
        if (attempt === maxRetries) {
          return false;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    return false;
  }

  /**
   * Unified search method - replaces/enhances Perplexity functionality
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.methodUsage.search++;
    
    try {
      if (!this.initialized || !this.client) {
        throw new ExternalServiceError('Tavily service not initialized');
      }

      if (this.circuitBreaker.isOpen) {
        throw new ExternalServiceError('Tavily circuit breaker is open');
      }

      // CRITICAL TYPE VALIDATION: Ensure query is a string before processing
      // This prevents "query.substring is not a function" errors when Tavily SDK processes the query
      if (typeof query !== 'string') {
        logger.error('❌ TAVILY TYPE ERROR: query parameter must be a string', {
          queryType: typeof query,
          queryValue: query,
          queryConstructor: query?.constructor?.name,
          isObject: query !== null && typeof query === 'object',
          isNull: query === null,
          isUndefined: query === undefined,
          stack: new Error().stack.split('\n').slice(1, 4).join('\n')
        });
        
        // If query is an object with a query property (common mistake), extract it
        if (query !== null && typeof query === 'object' && 'query' in query && typeof query.query === 'string') {
          logger.warn('⚠️ TAVILY TYPE FIX: Extracting string query from object parameter', {
            originalQuery: query,
            extractedQuery: query.query
          });
          query = query.query;
        } else if (query !== null && query !== undefined) {
          // Try to convert to string as last resort
          logger.warn('⚠️ TAVILY TYPE FIX: Converting non-string query to string', {
            originalType: typeof query,
            originalValue: query
          });
          query = String(query);
        } else {
          throw new Error(`Tavily search requires a non-empty string query, received: ${typeof query}`);
        }
      }
      
      // Additional validation: ensure query is not empty
      if (!query || query.trim().length === 0) {
        throw new Error('Tavily search requires a non-empty query string');
      }
      
      logger.debug('✅ TAVILY TYPE VALIDATION: Query parameter validated successfully', {
        queryType: typeof query,
        queryLength: query.length,
        queryPreview: query.substring(0, 100) + (query.length > 100 ? '...' : '')
      });

      // Check cache first
      const cacheKey = `search:${query}:${JSON.stringify(options)}`;
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('Returning cached Tavily search result', { query, cacheKey });
        return cachedResult;
      }

      // Apply rate limiting
      await this._applyRateLimit();

      // Prepare search options
      const searchOptions = {
        max_results: options.maxResults || 5,
        search_depth: options.searchDepth || 'advanced',
        include_answer: options.includeAnswer !== false,
        include_raw_content: options.includeRawContent || false,
        include_images: options.includeImages || false,
        ...options
      };

      logger.debug('Executing Tavily search', {
        query,
        options: searchOptions,
        method: 'search'
      });

      const result = await this.client.search(query, searchOptions);
      
      const responseTime = Date.now() - startTime;
      this._updateMetrics(true, responseTime);
      
      // Calculate cost based on search depth
      const searchType = searchOptions.search_depth === 'advanced' ? 'advancedSearch' : 'basicSearch';
      const costData = calculateTavilyCost(searchType, 1);
      
      // Cache the result
      this._cacheResult(cacheKey, result);
      
      logger.info('Tavily search completed successfully', {
        query,
        resultsCount: result.results?.length || 0,
        responseTime,
        hasAnswer: !!result.answer,
        cost: costData.totalCost
      });

      return {
        ...result,
        source: 'tavily_search',
        responseTime,
        timestamp: new Date().toISOString(),
        _costTracking: costData
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this._updateMetrics(false, responseTime);
      this._handleError(error, 'search', { query, options });
      throw error;
    }
  }

  /**
   * Content extraction method - replaces/enhances Firecrawl scraping
   * @param {Array<string>} urls - URLs to extract content from
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extracted content
   */
  async extract(urls, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.methodUsage.extract++;
    
    try {
      if (!this.initialized || !this.client) {
        throw new ExternalServiceError('Tavily service not initialized');
      }

      if (this.circuitBreaker.isOpen) {
        throw new ExternalServiceError('Tavily circuit breaker is open');
      }

      // Validate URLs array
      if (!Array.isArray(urls) || urls.length === 0) {
        throw new Error('URLs must be a non-empty array');
      }

      if (urls.length > 20) {
        logger.warn('Tavily extract supports max 20 URLs, truncating', {
          provided: urls.length,
          using: 20
        });
        urls = urls.slice(0, 20);
      }

      // Check cache first
      const cacheKey = `extract:${urls.join(',')}:${JSON.stringify(options)}`;
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('Returning cached Tavily extract result', { urlCount: urls.length, cacheKey });
        return cachedResult;
      }

      // Apply rate limiting
      await this._applyRateLimit();

      logger.debug('Executing Tavily extract', {
        urls,
        urlCount: urls.length,
        options,
        method: 'extract'
      });

      const result = await this.client.extract(urls);
      
      const responseTime = Date.now() - startTime;
      this._updateMetrics(true, responseTime);
      
      // Calculate cost - extract uses 0.2 credits per URL (basic) or 0.4 (advanced)
      const extractType = options.advanced ? 'advancedExtract' : 'basicExtract';
      const costData = calculateTavilyCost(extractType, urls.length);
      
      // Cache the result
      this._cacheResult(cacheKey, result);
      
      logger.info('Tavily extract completed successfully', {
        urlCount: urls.length,
        successfulExtractions: result.results?.length || 0,
        failedExtractions: result.failedResults?.length || 0,
        responseTime,
        cost: costData.totalCost
      });

      return {
        ...result,
        source: 'tavily_extract',
        responseTime,
        timestamp: new Date().toISOString(),
        _costTracking: costData
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this._updateMetrics(false, responseTime);
      this._handleError(error, 'extract', { urls, options });
      throw error;
    }
  }

  /**
   * Intelligent crawling method - enhanced web crawling with AI guidance
   * @param {string} startUrl - Starting URL for crawling
   * @param {Object} options - Crawling options
   * @returns {Promise<Object>} Crawled content
   */
  async crawl(startUrl, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.methodUsage.crawl++;
    
    try {
      if (!this.initialized || !this.client) {
        throw new ExternalServiceError('Tavily service not initialized');
      }

      if (this.circuitBreaker.isOpen) {
        throw new ExternalServiceError('Tavily circuit breaker is open');
      }

      // Check cache first
      const cacheKey = `crawl:${startUrl}:${JSON.stringify(options)}`;
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('Returning cached Tavily crawl result', { startUrl, cacheKey });
        return cachedResult;
      }

      // Apply rate limiting
      await this._applyRateLimit();

      // Prepare crawl options
      const crawlOptions = {
        max_depth: options.maxDepth || 3,
        limit: options.limit || 50,
        instructions: options.instructions || 'Find relevant content',
        ...options
      };

      logger.debug('Executing Tavily crawl', {
        startUrl,
        options: crawlOptions,
        method: 'crawl'
      });

      const result = await this.client.crawl(startUrl, crawlOptions);
      
      const responseTime = Date.now() - startTime;
      this._updateMetrics(true, responseTime);
      
      // Calculate cost - crawl is similar to advanced search (2 credits per operation)
      const costData = calculateTavilyCost('advancedSearch', 1);
      
      // Cache the result
      this._cacheResult(cacheKey, result);
      
      logger.info('Tavily crawl completed successfully', {
        startUrl,
        resultsCount: result.results?.length || 0,
        maxDepth: crawlOptions.max_depth,
        responseTime,
        cost: costData.totalCost
      });

      return {
        ...result,
        source: 'tavily_crawl',
        responseTime,
        timestamp: new Date().toISOString(),
        _costTracking: costData
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this._updateMetrics(false, responseTime);
      this._handleError(error, 'crawl', { startUrl, options });
      throw error;
    }
  }

  /**
   * Site mapping method - discover website structure
   * @param {string} startUrl - Starting URL for mapping
   * @param {Object} options - Mapping options
   * @returns {Promise<Object>} Site structure map
   */
  async map(startUrl, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.methodUsage.map++;
    
    try {
      if (!this.initialized || !this.client) {
        throw new ExternalServiceError('Tavily service not initialized');
      }

      if (this.circuitBreaker.isOpen) {
        throw new ExternalServiceError('Tavily circuit breaker is open');
      }

      // Check cache first
      const cacheKey = `map:${startUrl}:${JSON.stringify(options)}`;
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('Returning cached Tavily map result', { startUrl, cacheKey });
        return cachedResult;
      }

      // Apply rate limiting
      await this._applyRateLimit();

      // Prepare map options
      const mapOptions = {
        max_depth: options.maxDepth || 3,
        limit: options.limit || 50,
        instructions: options.instructions || 'Map site structure',
        ...options
      };

      logger.debug('Executing Tavily map', {
        startUrl,
        options: mapOptions,
        method: 'map'
      });

      const result = await this.client.map(startUrl, mapOptions);
      
      const responseTime = Date.now() - startTime;
      this._updateMetrics(true, responseTime);
      
      // Calculate cost - mapping uses 0.1 credits per page (regular) or 0.2 (with instructions)
      const mappingType = mapOptions.instructions ? 'mappingWithInstructions' : 'regularMapping';
      const pageCount = result.results?.length || 10; // Estimate pages from results
      const costData = calculateTavilyCost(mappingType, pageCount);
      
      // Cache the result
      this._cacheResult(cacheKey, result);
      
      logger.info('Tavily map completed successfully', {
        startUrl,
        urlsFound: result.results?.length || 0,
        maxDepth: mapOptions.max_depth,
        responseTime,
        cost: costData.totalCost
      });

      return {
        ...result,
        source: 'tavily_map',
        responseTime,
        timestamp: new Date().toISOString(),
        _costTracking: costData
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this._updateMetrics(false, responseTime);
      this._handleError(error, 'map', { startUrl, options });
      throw error;
    }
  }

  /**
   * Unified validation method for fact-checking integration
   * @param {string} claim - Claim to validate
   * @param {Object} marketContext - Market context for validation
   * @param {string} method - Tavily method to use ('auto', 'search', 'extract', 'crawl')
   * @returns {Promise<Object>} Validation result
   */
  async validateClaim(claim, marketContext, method = 'auto') {
    try {
      // CRITICAL TYPE VALIDATION: Ensure claim is a string before processing
      // This prevents "claim.substring is not a function" errors
      if (typeof claim !== 'string') {
        logger.error('❌ TAVILY TYPE ERROR: claim parameter must be a string', {
          claimType: typeof claim,
          claimValue: claim,
          claimConstructor: claim?.constructor?.name,
          isObject: claim !== null && typeof claim === 'object',
          isNull: claim === null,
          isUndefined: claim === undefined,
          marketContext,
          method,
          stack: new Error().stack.split('\n').slice(1, 4).join('\n')
        });
        
        // If claim is an object with a claim property (common mistake), extract it
        if (claim !== null && typeof claim === 'object' && 'claim' in claim && typeof claim.claim === 'string') {
          logger.warn('⚠️ TAVILY TYPE FIX: Extracting string claim from object parameter', {
            originalClaim: claim,
            extractedClaim: claim.claim
          });
          claim = claim.claim;
        } else if (claim !== null && claim !== undefined) {
          // Try to convert to string as last resort
          logger.warn('⚠️ TAVILY TYPE FIX: Converting non-string claim to string', {
            originalType: typeof claim,
            originalValue: claim
          });
          claim = String(claim);
        } else {
          throw new Error(`Tavily validateClaim requires a non-empty string claim, received: ${typeof claim}`);
        }
      }
      
      // Additional validation: ensure claim is not empty
      if (!claim || claim.trim().length === 0) {
        throw new Error('Tavily validateClaim requires a non-empty claim string');
      }
      
      logger.debug('✅ TAVILY TYPE VALIDATION: Claim parameter validated successfully', {
        claimType: typeof claim,
        claimLength: claim.length,
        claimPreview: claim.substring(0, 100) + (claim.length > 100 ? '...' : '')
      });
      
      logger.debug('Tavily claim validation started', {
        claim: claim.substring(0, 100) + (claim.length > 100 ? '...' : ''),
        market: marketContext.market,
        method
      });

      let result;
      const searchQuery = this._constructMarketQuery(claim, marketContext);

      switch (method) {
        case 'search':
          result = await this.search(searchQuery, {
            max_results: 3,
            include_answer: true,
            include_raw_content: true
          });
          break;
          
        case 'extract':
          // Use relevant URLs for extraction
          const targetUrls = this._identifyRelevantSources(claim, marketContext);
          result = await this.extract(targetUrls);
          break;
          
        case 'crawl':
          // Use market-specific starting URL for crawling
          const startUrl = this._getMarketStartUrl(marketContext);
          result = await this.crawl(startUrl, {
            instructions: `Find information about: ${claim}`,
            max_depth: 2,
            limit: 10
          });
          break;
          
        case 'auto':
        default:
          // Intelligent method selection based on claim type
          result = await this.search(searchQuery, {
            max_results: 5,
            include_answer: true,
            include_raw_content: true
          });
          break;
      }

      // Analyze results for claim validation
      const validationResult = await this._analyzeValidationResults(result, claim);
      
      return {
        confidence: validationResult.confidence,
        source: 'tavily_validation',
        credibility: 0.85, // High credibility for Tavily
        evidence: validationResult.evidence,
        method: method,
        searchQuery: method === 'search' ? searchQuery : undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      // Safe logging with type check
      const claimPreview = typeof claim === 'string'
        ? claim.substring(0, 100) + (claim.length > 100 ? '...' : '')
        : String(claim);
        
      logger.error('Tavily claim validation failed', {
        claim: claimPreview,
        market: marketContext?.market || 'unknown',
        method,
        error: error.message
      });
      
      return {
        confidence: 0,
        source: 'tavily_validation',
        credibility: 0,
        evidence: [],
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Apply rate limiting
   * @private
   */
  async _applyRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
    const minInterval = 60000 / this.rateLimiter.requestsPerMinute; // ms between requests
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      logger.debug('Applying Tavily rate limit', { waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.rateLimiter.lastRequestTime = Date.now();
  }

  /**
   * Get cached result if available and not expired
   * @private
   */
  _getCachedResult(cacheKey) {
    const cached = this.responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }
    if (cached) {
      this.responseCache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Cache result with timestamp
   * @private
   */
  _cacheResult(cacheKey, data) {
    this.responseCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    // Clean up old cache entries periodically
    if (this.responseCache.size > 100) {
      const oldestKeys = Array.from(this.responseCache.keys()).slice(0, 20);
      oldestKeys.forEach(key => this.responseCache.delete(key));
    }
  }

  /**
   * Update performance metrics
   * @private
   */
  _updateMetrics(success, responseTime) {
    if (success) {
      this.metrics.successfulRequests++;
      this.metrics.lastSuccessTime = new Date().toISOString();
      this.circuitBreaker.consecutiveFailures = 0;
      this.circuitBreaker.isOpen = false;
    } else {
      this.metrics.failedRequests++;
      this.metrics.lastFailureTime = new Date().toISOString();
      this.circuitBreaker.consecutiveFailures++;
      
      // Open circuit breaker if threshold reached
      if (this.circuitBreaker.consecutiveFailures >= this.circuitBreaker.failureThreshold) {
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.lastFailureTime = Date.now();
        logger.warn('Tavily circuit breaker opened', {
          consecutiveFailures: this.circuitBreaker.consecutiveFailures,
          threshold: this.circuitBreaker.failureThreshold
        });
      }
    }
    
    // Update average response time
    const totalResponseTime = (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1)) + responseTime;
    this.metrics.averageResponseTime = Math.round(totalResponseTime / this.metrics.totalRequests);
  }

  /**
   * Handle errors with logging and circuit breaker logic
   * @private
   */
  _handleError(error, method, context) {
    this.lastError = error;
    
    logger.error('Tavily service error', {
      method,
      error: error.message,
      context,
      circuitBreakerState: this.circuitBreaker.state,
      consecutiveFailures: this.circuitBreaker.consecutiveFailures
    });

    // Check if this is a rate limit error
    if (error.message.includes('rate limit') || error.status === 429) {
      throw new RateLimitError(`Tavily rate limit exceeded: ${error.message}`);
    }

    throw new ExternalServiceError(`Tavily ${method} failed: ${error.message}`);
  }

  /**
   * Construct market-specific search query
   * @private
   */
  _constructMarketQuery(claim, marketContext) {
    const market = marketContext.market || 'general market';
    return `${claim} ${market} real estate market data`;
  }

  /**
   * Identify relevant sources for extraction
   * @private
   */
  _identifyRelevantSources(claim, marketContext) {
    const market = marketContext.market || 'general';
    const marketSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Return relevant real estate sources for the market
    return [
      `https://www.example.com/city/${marketSlug}`,
      `https://www.competitor1.com/${marketSlug}`,
      `https://www.competitor2.com/${marketSlug}`
    ];
  }

  /**
   * Get market-specific starting URL for crawling
   * @private
   */
  _getMarketStartUrl(marketContext) {
    const market = marketContext.market || 'general';
    const marketSlug = market.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `https://www.example.com/city/${marketSlug}`;
  }

  /**
   * Analyze validation results from Tavily response
   * @private
   */
  async _analyzeValidationResults(result, claim) {
    try {
      // CRITICAL TYPE VALIDATION: Ensure claim is a string before processing
      if (typeof claim !== 'string') {
        logger.error('❌ TAVILY TYPE ERROR: claim parameter in _analyzeValidationResults must be a string', {
          claimType: typeof claim,
          claimValue: claim
        });
        
        // Try to convert to string
        if (claim !== null && claim !== undefined) {
          claim = String(claim);
        } else {
          throw new Error('Claim parameter cannot be null or undefined in _analyzeValidationResults');
        }
      }
      
      // Extract evidence from Tavily results
      const evidence = [];
      let confidence = 0.5; // Base confidence
      
      if (result.results && result.results.length > 0) {
        confidence += 0.2; // Boost for having results
        
        result.results.forEach(item => {
          // Safe string operations with type checks
          const itemContent = typeof item.content === 'string' ? item.content : String(item.content || '');
          const claimLower = claim.toLowerCase();
          const claimSubstr = claimLower.substring(0, Math.min(50, claimLower.length));
          
          if (itemContent && itemContent.toLowerCase().includes(claimSubstr)) {
            evidence.push({
              source: item.url,
              content: itemContent.substring(0, Math.min(200, itemContent.length)),
              title: item.title,
              relevance: 'high'
            });
            confidence += 0.1; // Boost for relevant content
          }
        });
      }
      
      if (result.answer) {
        evidence.push({
          source: 'tavily_ai_answer',
          content: result.answer,
          relevance: 'direct_answer'
        });
        confidence += 0.2; // Boost for direct answer
      }
      
      // Cap confidence at 1.0
      confidence = Math.min(confidence, 1.0);
      
      return {
        confidence,
        evidence,
        analysisMethod: 'tavily_unified'
      };
      
    } catch (error) {
      logger.error('Failed to analyze Tavily validation results', {
        error: error.message,
        resultKeys: Object.keys(result || {})
      });
      
      return {
        confidence: 0.3, // Low confidence due to analysis failure
        evidence: [],
        analysisMethod: 'tavily_unified',
        error: error.message
      };
    }
  }

  /**
   * Get service status
   * @returns {Object} Service status information
   */
  getStatus() {
    // Check if circuit breaker should be reset
    if (this.circuitBreaker.isOpen && 
        (Date.now() - this.circuitBreaker.lastFailureTime) > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.consecutiveFailures = 0;
      logger.info('Tavily circuit breaker reset');
    }

    return {
      service: 'Tavily',
      version: this.version,
      initialized: this.initialized,
      configured: !!config.tavily?.apiKey,
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        consecutiveFailures: this.circuitBreaker.consecutiveFailures,
        state: this.circuitBreaker.isOpen ? 'OPEN' : 'CLOSED'
      },
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalRequests > 0 
          ? ((this.metrics.successfulRequests / this.metrics.totalRequests) * 100).toFixed(1) + '%'
          : '0%'
      },
      rateLimit: {
        limit: this.rateLimiter.requestsPerMinute,
        remaining: this.rateLimiter.requestsPerMinute // Simplified - Tavily handles rate limiting internally
      },
      lastError: this.lastError ? {
        message: this.lastError.message,
        timestamp: this.metrics.lastFailureTime
      } : null
    };
  }

  /**
   * Test connection to Tavily service
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      if (!this.initialized) {
        return false;
      }
      
      const testResult = await this.search('connection test', {
        max_results: 1,
        include_answer: false
      });
      
      return !!(testResult && testResult.results);
    } catch (error) {
      logger.error('Tavily connection test failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check if service is healthy
   * @returns {boolean} Health status
   */
  isHealthy() {
    return this.initialized && !this.circuitBreaker.isOpen;
  }

  /**
   * Reset metrics and circuit breaker
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastSuccessTime: null,
      lastFailureTime: null,
      methodUsage: {
        search: 0,
        extract: 0,
        crawl: 0,
        map: 0
      }
    };
    
    this.circuitBreaker.consecutiveFailures = 0;
    this.circuitBreaker.isOpen = false;
    this.responseCache.clear();
    this.lastError = null;
    
    logger.info('Tavily service metrics and circuit breaker reset');
  }
}

// Create singleton instance
const tavilyService = new TavilyService();

module.exports = tavilyService;