const axios = require('axios');
const { logger } = require('../utils/logger');
const { config } = require('../config');

/**
 * Perplexity AI Service - Enhanced with comprehensive error handling and resilience
 * Provides AI-powered search and research capabilities
 * Part of the AI-first data source architecture (TIER 0)
 *
 * REVERTED: Back to direct environment variable access as config system works properly
 */
class PerplexityService {
  constructor() {
    // Use centralized config system for consistency and proper model name
    this.baseUrl = config.perplexity.baseUrl;
    this.model = config.perplexity.model; // Now uses correct model: llama-3.1-sonar-small-128k-online
    this.apiKey = config.perplexity.apiKey;
    this.rateLimit = config.perplexity.rateLimit;
    this.timeout = config.perplexity.timeout;
    this.version = '1.2.0'; // Version bump for critical model fix
    this.name = 'PerplexityService';
    
    // Enhanced request tracking with circuit breaker
    this.requestCount = 0;
    this.lastResetTime = Date.now();
    this.consecutiveFailures = 0;
    this.circuitBreakerThreshold = 5;
    this.circuitBreakerTimeout = 60000; // 1 minute
    this.lastFailureTime = null;
    this.isCircuitOpen = false;
    this.lastError = null; // Initialize lastError property for test compatibility
    
    // Performance tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastSuccessTime: null,
      lastFailureTime: null
    };
    
    // Circuit breaker object interface (for test compatibility)
    this.circuitBreaker = {
      failureThreshold: this.circuitBreakerThreshold,
      timeout: this.circuitBreakerTimeout,
      consecutiveFailures: 0,
      state: 'CLOSED',
      isOpen: false,
      canRetry: true,
      timeSinceLastFailure: null,
      
      recordFailure: (error) => {
        this.consecutiveFailures++;
        this.circuitBreaker.consecutiveFailures = this.consecutiveFailures;
        this.lastFailureTime = Date.now();
        this.circuitBreaker.timeSinceLastFailure = 0;
        
        if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
          this.isCircuitOpen = true;
          this.circuitBreaker.state = 'OPEN';
          this.circuitBreaker.isOpen = true;
          this.circuitBreaker.canRetry = false;
          
          logger.error('⚡ Circuit breaker OPENED due to consecutive failures', {
            version: this.version,
            consecutiveFailures: this.consecutiveFailures,
            threshold: this.circuitBreakerThreshold,
            error: error.message
          });
        }
      },
      
      recordSuccess: () => {
        this.consecutiveFailures = 0;
        this.circuitBreaker.consecutiveFailures = 0;
        this.isCircuitOpen = false;
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.canRetry = true;
        this.circuitBreaker.timeSinceLastFailure = null;
        
        logger.info('✅ Circuit breaker CLOSED after successful request', {
          version: this.version,
          timestamp: new Date().toISOString()
        });
      }
    };
    
    // Rate limiting properties
    this.requestInterval = Math.ceil(60000 / this.rateLimit); // ms between requests
    this.lastRequestTime = 0;
    
    // Validate configuration on initialization
    this._validateConfiguration();
    
    logger.info('🔧 PerplexityService initialized with enhanced error handling', {
      version: this.version,
      model: this.model,
      baseUrl: this.baseUrl,
      rateLimit: this.rateLimit,
      configured: this.isConfigured(),
      circuitBreakerEnabled: true,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Validate service configuration
   * @private
   */
  _validateConfiguration() {
    const issues = [];
    
    if (!this.apiKey) {
      issues.push('PERPLEXITY_API_KEY is missing');
    } else if (this.apiKey.length < 20) {
      issues.push('PERPLEXITY_API_KEY appears to be invalid (too short)');
    }
    
    if (!this.baseUrl || !this.baseUrl.startsWith('https://')) {
      issues.push('PERPLEXITY_BASE_URL is invalid');
    }
    
    if (!this.model) {
      issues.push('PERPLEXITY_MODEL is missing');
    }
    
    const isValid = issues.length === 0;
    
    if (!isValid) {
      logger.error('❌ PerplexityService configuration issues detected', {
        version: this.version,
        issues,
        configured: false
      });
    } else {
      logger.info('✅ PerplexityService configuration validated successfully', {
        version: this.version,
        configured: true
      });
    }
    
    // Return validation result for tests
    return {
      isValid,
      issues
    };
  }

  /**
   * Check if API key is configured with enhanced validation
   */
  isConfigured() {
    return !!(this.apiKey && this.apiKey.length > 20);
  }

  /**
   * Check rate limit with enhanced tracking
   */
  checkRateLimit() {
    const now = Date.now();
    
    // Check if enough time has passed since last request
    if (now - this.lastRequestTime < this.requestInterval) {
      return false;
    }
    
    this.lastRequestTime = now;
    return true;
  }

  /**
   * Internal rate limit check for async operations
   * @private
   */
  async _checkRateLimit() {
    return new Promise((resolve) => {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.requestInterval) {
        const delay = this.requestInterval - timeSinceLastRequest;
        setTimeout(() => {
          this.lastRequestTime = Date.now();
          resolve(true);
        }, delay);
      } else {
        this.lastRequestTime = now;
        resolve(true);
      }
    });
  }

  /**
   * Enhanced rate limit check with proper async handling
   */
  async _enhancedCheckRateLimit() {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;
    
    // Reset counter every minute
    if (timeSinceReset >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    const withinLimit = this.requestCount < this.rateLimit;
    
    if (!withinLimit) {
      logger.warn('⚠️ Perplexity rate limit exceeded', {
        requestCount: this.requestCount,
        rateLimit: this.rateLimit,
        timeSinceReset,
        timestamp: new Date().toISOString()
      });
    }
    
    return withinLimit;
  }

  /**
   * Check circuit breaker status
   * @private
   */
  _checkCircuitBreaker() {
    if (!this.isCircuitOpen) {
      return true;
    }
    
    const now = Date.now();
    const timeSinceLastFailure = now - this.lastFailureTime;
    
    if (timeSinceLastFailure >= this.circuitBreakerTimeout) {
      logger.info('🔄 Circuit breaker timeout reached, attempting to close circuit', {
        timeSinceLastFailure,
        circuitBreakerTimeout: this.circuitBreakerTimeout,
        timestamp: new Date().toISOString()
      });
      this.isCircuitOpen = false;
      this.consecutiveFailures = 0;
      return true;
    }
    
    logger.warn('⚡ Circuit breaker is OPEN - blocking request', {
      consecutiveFailures: this.consecutiveFailures,
      timeSinceLastFailure,
      timeUntilRetry: this.circuitBreakerTimeout - timeSinceLastFailure,
      timestamp: new Date().toISOString()
    });
    
    return false;
  }

  /**
   * Record successful request
   * @private
   */
  _recordSuccess(responseTime) {
    this.consecutiveFailures = 0;
    this.isCircuitOpen = false;
    this.metrics.successfulRequests++;
    this.metrics.lastSuccessTime = Date.now();
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.successfulRequests - 1) + responseTime;
    this.metrics.averageResponseTime = totalTime / this.metrics.successfulRequests;
    
    logger.debug('✅ Perplexity request successful', {
      responseTime,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      successfulRequests: this.metrics.successfulRequests,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Record failed request and update circuit breaker
   * @private
   */
  _recordFailure(error) {
    this.consecutiveFailures++;
    this.metrics.failedRequests++;
    this.metrics.lastFailureTime = Date.now();
    this.lastFailureTime = Date.now();
    
    if (this.consecutiveFailures >= this.circuitBreakerThreshold) {
      this.isCircuitOpen = true;
      logger.error('⚡ Circuit breaker OPENED due to consecutive failures', {
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.warn('❌ Perplexity request failed', {
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Retry logic with exponential backoff
   * @private
   */
  async _retryWithBackoff(requestFn, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await requestFn();
        if (attempt > 1) {
          logger.info('✅ Perplexity request succeeded on retry', {
            attempt,
            maxRetries,
            timestamp: new Date().toISOString()
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          logger.error('💥 Perplexity request failed after all retries', {
            attempt,
            maxRetries,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          break;
        }
        
        // Calculate backoff delay (exponential with jitter)
        const baseDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        const jitter = Math.random() * 1000; // 0-1s random jitter
        const delay = baseDelay + jitter;
        
        logger.warn(`🔄 Perplexity request failed, retrying in ${Math.round(delay)}ms`, {
          attempt,
          maxRetries,
          error: error.message,
          delay: Math.round(delay),
          timestamp: new Date().toISOString()
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Search for market information using Perplexity AI - Enhanced with circuit breaker and retry logic
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    // CRITICAL TYPE VALIDATION: Ensure query is a string before processing
    // This prevents "query.substring is not a function" errors
    if (typeof query !== 'string') {
      logger.error('❌ PERPLEXITY TYPE ERROR: query parameter must be a string', {
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
        logger.warn('⚠️ PERPLEXITY TYPE FIX: Extracting string query from object parameter', {
          originalQuery: query,
          extractedQuery: query.query
        });
        query = query.query;
      } else if (query !== null && query !== undefined) {
        // Try to convert to string as last resort
        logger.warn('⚠️ PERPLEXITY TYPE FIX: Converting non-string query to string', {
          originalType: typeof query,
          originalValue: query
        });
        query = String(query);
      } else {
        throw new Error(`Perplexity search requires a non-empty string query, received: ${typeof query}`);
      }
    }
    
    // Ensure query is trimmed and not empty
    query = query.trim();
    if (!query) {
      throw new Error('Perplexity search requires a non-empty query string');
    }
    
    logger.info('🔍 Starting Perplexity search with enhanced error handling', {
      query: query.substring(0, 100) + '...',
      requestId: `req_${Date.now()}`,
      circuitOpen: this.isCircuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      timestamp: new Date().toISOString()
    });

    try {
      // Pre-flight checks
      if (!this.isConfigured()) {
        const error = 'API key not configured or invalid';
        logger.error('❌ Perplexity configuration check failed', {
          error,
          apiKeyLength: this.apiKey ? this.apiKey.length : 0,
          timestamp: new Date().toISOString()
        });
        this._recordFailure(new Error(error));
        return {
          success: false,
          error,
          data: null
        };
      }

      // Circuit breaker check
      if (!this._checkCircuitBreaker()) {
        const error = 'Circuit breaker is open - service temporarily unavailable';
        logger.warn('⚡ Circuit breaker blocking request', {
          error,
          consecutiveFailures: this.consecutiveFailures,
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          error,
          data: null
        };
      }

      // Rate limit check
      if (!this.checkRateLimit()) {
        const error = 'Rate limit exceeded';
        logger.warn('⚠️ Rate limit check failed', {
          error,
          requestCount: this.requestCount,
          rateLimit: this.rateLimit,
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          error,
          data: null
        };
      }

      // Execute request with retry logic
      const result = await this._retryWithBackoff(async () => {
        return await this._executeSearchRequest(query, options);
      }, 3);

      // Record success
      const responseTime = Date.now() - startTime;
      this._recordSuccess(responseTime);

      logger.info('✅ Perplexity search completed successfully', {
        responseTime,
        contentLength: result.data.content.length,
        citationCount: result.data.citations.length,
        tokensUsed: result.data.usage.total_tokens || 0,
        timestamp: new Date().toISOString()
      });

      return result;

    } catch (error) {
      // Record failure
      this._recordFailure(error);
      
      const responseTime = Date.now() - startTime;
      logger.error('💥 Perplexity search failed after all retries', {
        error: error.message,
        responseTime,
        query: query.substring(0, 100) + '...',
        consecutiveFailures: this.consecutiveFailures,
        circuitOpen: this.isCircuitOpen,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Execute the actual search request
   * @private
   */
  async _executeSearchRequest(query, options = {}) {
    const requestData = {
      model: options.model || this.model,
      messages: [
        {
          role: 'user',
          content: query
        }
      ],
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.1,
      top_p: options.topP || 0.9,
      search_domain_filter: options.searchDomains || ['example.com', 'competitor1.com', 'competitor2.com'],
      return_citations: true,
      return_images: false
    };

    logger.debug('🌐 Executing Perplexity API request', {
      model: requestData.model,
      maxTokens: requestData.max_tokens,
      searchDomains: requestData.search_domain_filter,
      timestamp: new Date().toISOString()
    });

    const response = await axios.post(`${this.baseUrl}/chat/completions`, requestData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: options.timeout || 30000
    });

    // Increment request counter after successful request
    this.requestCount++;

    // Validate response structure
    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response structure from Perplexity API');
    }

    const result = {
      success: true,
      data: {
        content: response.data.choices[0]?.message?.content || '',
        citations: response.data.citations || [],
        usage: response.data.usage || {},
        model: response.data.model || options.model || this.model
      },
      source: 'perplexity',
      error: null
    };

    logger.debug('📊 Perplexity API response processed', {
      contentLength: result.data.content.length,
      citationCount: result.data.citations.length,
      hasUsage: !!result.data.usage.total_tokens,
      timestamp: new Date().toISOString()
    });

    return result;
  }

  /**
   * Research market trends and data - Enhanced with logging
   * @param {string} market - Market name
   * @param {Object} options - Research options
   * @returns {Promise<Object>} Research results
   */
  async researchMarket(market, options = {}) {
    logger.info('🏠 Starting market research with Perplexity', {
      market,
      service: 'PerplexityService',
      version: this.version,
      timestamp: new Date().toISOString()
    });

    const query = `Current real estate market trends and data for ${market} including home prices, inventory levels, days on market, and market conditions. Focus on recent data from reliable sources like exampleCompany, Competitor One, and competitor2.com.`;
    
    const result = await this.search(query, {
      ...options,
      searchDomains: ['example.com', 'competitor1.com', 'competitor2.com', 'nar.competitor2'],
      maxTokens: 1500
    });

    logger.info('🏠 Market research completed', {
      market,
      success: result.success,
      contentLength: result.data?.content?.length || 0,
      citationCount: result.data?.citations?.length || 0,
      timestamp: new Date().toISOString()
    });

    return result;
  }

  /**
   * Get comprehensive service status including circuit breaker and metrics
   * @returns {Object} Enhanced service status
   */
  getStatus() {
    const now = Date.now();
    const timeSinceLastFailure = this.lastFailureTime ? now - this.lastFailureTime : null;
    const timeSinceLastSuccess = this.metrics.lastSuccessTime ? now - this.metrics.lastSuccessTime : null;
    const isConfigured = this.isConfigured();
    const isHealthy = isConfigured && !this.isCircuitOpen;
    const circuitState = this.isCircuitOpen ? 'OPEN' :
                        (this.circuitBreaker && this.circuitBreaker.state === 'HALF_OPEN') ? 'HALF_OPEN' : 'CLOSED';
    
    return {
      service: 'PerplexityService',
      version: this.version,
      configured: isConfigured,
      healthy: isHealthy,
      operational: isHealthy,
      circuitBreakerState: circuitState,
      lastError: this.lastError || null, // Add missing lastError property expected by tests
      
      // Rate limiting status
      rateLimit: {
        limit: this.rateLimit,
        used: this.requestCount,
        remaining: Math.max(0, this.rateLimit - this.requestCount),
        resetTime: this.lastResetTime + 60000,
        withinLimit: this.checkRateLimit()
      },
      
      // Circuit breaker status
      circuitBreaker: {
        isOpen: this.isCircuitOpen,
        consecutiveFailures: this.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
        timeoutMs: this.circuitBreakerTimeout,
        timeSinceLastFailure,
        canRetry: !this.isCircuitOpen || (timeSinceLastFailure && timeSinceLastFailure >= this.circuitBreakerTimeout)
      },
      
      // Performance metrics
      metrics: {
        totalRequests: this.metrics.totalRequests,
        successfulRequests: this.metrics.successfulRequests,
        failedRequests: this.metrics.failedRequests,
        successRate: this.metrics.totalRequests > 0 ?
          Math.round((this.metrics.successfulRequests / this.metrics.totalRequests) * 100) : 0,
        averageResponseTime: Math.round(this.metrics.averageResponseTime),
        timeSinceLastSuccess,
        lastSuccessTime: this.metrics.lastSuccessTime,
        lastFailureTime: this.metrics.lastFailureTime
      },
      
      // Configuration
      config: {
        model: this.model,
        baseUrl: this.baseUrl,
        apiKeyConfigured: !!this.apiKey,
        apiKeyLength: this.apiKey ? this.apiKey.length : 0
      },
      
      // Health assessment
      health: this._assessHealth(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Assess overall service health
   * @private
   */
  _assessHealth() {
    if (!this.isConfigured()) {
      return {
        status: 'unhealthy',
        reason: 'Service not configured - missing API key',
        severity: 'critical'
      };
    }

    if (this.isCircuitOpen) {
      return {
        status: 'degraded',
        reason: 'Circuit breaker is open due to consecutive failures',
        severity: 'warning'
      };
    }

    if (!this.checkRateLimit()) {
      return {
        status: 'throttled',
        reason: 'Rate limit exceeded',
        severity: 'warning'
      };
    }

    const successRate = this.metrics.totalRequests > 0 ?
      (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 : 100;

    if (successRate < 50) {
      return {
        status: 'unhealthy',
        reason: `Low success rate: ${Math.round(successRate)}%`,
        severity: 'critical'
      };
    }

    if (successRate < 80) {
      return {
        status: 'degraded',
        reason: `Moderate success rate: ${Math.round(successRate)}%`,
        severity: 'warning'
      };
    }

    return {
      status: 'healthy',
      reason: 'All systems operational',
      severity: 'info'
    };
  }
}

module.exports = PerplexityService;