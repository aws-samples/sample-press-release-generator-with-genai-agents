const { logger } = require('../utils/logger');

/**
 * AI-First Data Source Router
 * Implements intelligent routing between AI and traditional data sources
 * Part of the TIER 0 AI-first architecture implemented in Subtask 5
 */
class AIFirstDataSourceRouter {
  constructor() {
    this.version = '1.1.0'; // Version bump for Tavily integration
    this.routingStrategy = 'ai-first'; // ai-first, hybrid, traditional, tavily-first
    this.aiHealthThreshold = 0.8; // Minimum AI service health score
    this.fallbackEnabled = true;
    this.routingMetrics = {
      aiRequests: 0,
      traditionalRequests: 0,
      fallbackRequests: 0,
      tavilyRequests: 0, // New metric for Tavily requests
      totalRequests: 0
    };
    
    logger.info('AIFirstDataSourceRouter initialized with Tavily support', {
      version: this.version,
      strategy: this.routingStrategy,
      healthThreshold: this.aiHealthThreshold,
      fallbackEnabled: this.fallbackEnabled,
      tavilySupport: true
    });
  }

  /**
   * Route data request based on AI-first strategy
   * @param {string} requestType - Type of data request
   * @param {Object} context - Request context
   * @param {Object} services - Available services
   * @returns {Object} Routing decision
   */
  route(requestType, context = {}, services = {}) {
    try {
      this.routingMetrics.totalRequests++;
      
      const decision = this._makeRoutingDecision(requestType, context, services);
      
      logger.debug('AIFirstDataSourceRouter routing decision', {
        requestType,
        decision: decision.source,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        metrics: this.routingMetrics
      });

      return decision;

    } catch (error) {
      logger.error('AIFirstDataSourceRouter routing failed', {
        error: error.message,
        requestType,
        stack: error.stack
      });

      // Default to traditional sources on routing error
      return {
        source: 'traditional',
        reasoning: 'Routing error - defaulting to traditional sources',
        confidence: 0.5,
        fallback: true
      };
    }
  }

  /**
   * Make intelligent routing decision
   * @private
   */
  _makeRoutingDecision(requestType, context, services) {
    // Check AI service availability and health
    const aiHealth = this._assessAIHealth(services);
    
    // Tavily-first strategy: Prefer Tavily for unified search capabilities
    if (this.routingStrategy === 'tavily-first') {
      const tavilyHealth = this._assessTavilyHealth(services);
      if (tavilyHealth.score >= this.aiHealthThreshold) {
        this.routingMetrics.tavilyRequests++;
        return {
          source: 'tavily',
          service: 'tavily',
          reasoning: 'Tavily-first strategy with healthy Tavily service',
          confidence: tavilyHealth.score,
          fallback: this.fallbackEnabled,
          healthScore: tavilyHealth.score
        };
      } else if (aiHealth.score >= this.aiHealthThreshold) {
        this.routingMetrics.aiRequests++;
        return {
          source: 'ai',
          service: 'perplexity',
          reasoning: 'Tavily-first fallback to AI services',
          confidence: aiHealth.score,
          fallback: true,
          healthScore: aiHealth.score
        };
      } else if (this.fallbackEnabled) {
        this.routingMetrics.fallbackRequests++;
        return {
          source: 'traditional',
          reasoning: 'Tavily-first fallback to traditional sources',
          confidence: 0.7,
          fallback: true,
          healthScore: aiHealth.score
        };
      }
    }

    // AI-first strategy: Try AI unless health is poor
    if (this.routingStrategy === 'ai-first') {
      if (aiHealth.score >= this.aiHealthThreshold) {
        this.routingMetrics.aiRequests++;
        return {
          source: 'ai',
          service: 'perplexity',
          reasoning: 'AI-first strategy with healthy AI services',
          confidence: aiHealth.score,
          fallback: this.fallbackEnabled,
          healthScore: aiHealth.score
        };
      } else if (this.fallbackEnabled) {
        this.routingMetrics.fallbackRequests++;
        return {
          source: 'traditional',
          reasoning: `AI health below threshold (${aiHealth.score} < ${this.aiHealthThreshold})`,
          confidence: 0.7,
          fallback: true,
          healthScore: aiHealth.score
        };
      }
    }

    // Hybrid strategy: Balance based on request type and context
    if (this.routingStrategy === 'hybrid') {
      const hybridDecision = this._makeHybridDecision(requestType, context, aiHealth, services);
      if (hybridDecision.source === 'ai') {
        this.routingMetrics.aiRequests++;
      } else if (hybridDecision.source === 'tavily') {
        this.routingMetrics.tavilyRequests++;
      } else {
        this.routingMetrics.traditionalRequests++;
      }
      return hybridDecision;
    }

    // Traditional strategy: Always use traditional sources
    this.routingMetrics.traditionalRequests++;
    return {
      source: 'traditional',
      reasoning: 'Traditional-only strategy',
      confidence: 0.8,
      fallback: false
    };
  }

  /**
   * Assess AI service health
   * @private
   */
  _assessAIHealth(services) {
    const health = {
      score: 0.5,
      factors: {},
      available: false
    };

    try {
      // Check Perplexity service
      if (services.perplexity) {
        const perplexityStatus = services.perplexity.getStatus();
        health.factors.perplexity = {
          configured: perplexityStatus.configured,
          rateLimit: perplexityStatus.rateLimit.remaining / perplexityStatus.rateLimit.limit
        };
        
        if (perplexityStatus.configured) {
          health.score += 0.3; // Reduced weight to accommodate Tavily
          health.available = true;
        }
        
        // Factor in rate limit availability
        health.score += (health.factors.perplexity.rateLimit * 0.05);
      }

      // Check other AI services (Bedrock, etc.)
      if (services.bedrock) {
        health.factors.bedrock = { available: true };
        health.score += 0.2; // Reduced weight to accommodate Tavily
      }

      // Ensure score is within bounds
      health.score = Math.min(1.0, Math.max(0.0, health.score));

    } catch (error) {
      logger.warn('AIFirstDataSourceRouter health assessment failed', {
        error: error.message
      });
      health.score = 0.3; // Low but not zero
    }

    return health;
  }

  /**
   * Assess Tavily service health
   * @private
   */
  _assessTavilyHealth(services) {
    const health = {
      score: 0.5,
      factors: {},
      available: false
    };

    try {
      // Check Tavily service
      if (services.tavily) {
        const tavilyStatus = services.tavily.getStatus();
        health.factors.tavily = {
          configured: tavilyStatus.configured,
          initialized: tavilyStatus.initialized,
          circuitBreakerOpen: tavilyStatus.circuitBreaker?.isOpen || false
        };
        
        if (tavilyStatus.configured && tavilyStatus.initialized) {
          health.score += 0.4;
          health.available = true;
        }
        
        // Reduce score if circuit breaker is open
        if (tavilyStatus.circuitBreaker?.isOpen) {
          health.score -= 0.2;
        }
        
        // Factor in success rate if available
        if (tavilyStatus.metrics?.successRate) {
          const successRateNum = parseFloat(tavilyStatus.metrics.successRate.replace('%', ''));
          health.score += (successRateNum / 100) * 0.2;
        }
      }

      // Ensure score is within bounds
      health.score = Math.min(1.0, Math.max(0.0, health.score));

    } catch (error) {
      logger.warn('AIFirstDataSourceRouter Tavily health assessment failed', {
        error: error.message
      });
      health.score = 0.3; // Low but not zero
    }

    return health;
  }

  /**
   * Make hybrid routing decision
   * @private
   */
  _makeHybridDecision(requestType, context, aiHealth, services) {
    // Request type preferences
    const tavilyPreferredTypes = [
      'unified-search',
      'comprehensive-research',
      'multi-source-validation',
      'site-analysis'
    ];

    const aiPreferredTypes = [
      'market-research',
      'trend-analysis',
      'comparative-analysis',
      'real-time-data'
    ];

    const traditionalPreferredTypes = [
      'historical-data',
      'structured-data',
      'regulatory-data'
    ];

    // Check Tavily health for hybrid decisions
    const tavilyHealth = this._assessTavilyHealth(services);

    // Base decision on request type - Tavily gets priority for unified search types
    if (tavilyPreferredTypes.includes(requestType) && tavilyHealth.score > 0.6) {
      return {
        source: 'tavily',
        service: 'tavily',
        reasoning: `Hybrid strategy: Tavily preferred for ${requestType}`,
        confidence: tavilyHealth.score,
        fallback: true,
        healthScore: tavilyHealth.score
      };
    }

    if (aiPreferredTypes.includes(requestType) && aiHealth.score > 0.6) {
      return {
        source: 'ai',
        service: 'perplexity',
        reasoning: `Hybrid strategy: AI preferred for ${requestType}`,
        confidence: aiHealth.score,
        fallback: true,
        healthScore: aiHealth.score
      };
    }

    if (traditionalPreferredTypes.includes(requestType)) {
      return {
        source: 'traditional',
        reasoning: `Hybrid strategy: Traditional preferred for ${requestType}`,
        confidence: 0.8,
        fallback: false
      };
    }

    // Default hybrid decision based on service health - prefer Tavily if available
    if (tavilyHealth.score > 0.7) {
      return {
        source: 'tavily',
        service: 'tavily',
        reasoning: 'Hybrid strategy: High Tavily health score',
        confidence: tavilyHealth.score,
        fallback: true,
        healthScore: tavilyHealth.score
      };
    }

    if (aiHealth.score > 0.7) {
      return {
        source: 'ai',
        service: 'perplexity',
        reasoning: 'Hybrid strategy: High AI health score',
        confidence: aiHealth.score,
        fallback: true,
        healthScore: aiHealth.score
      };
    }

    return {
      source: 'traditional',
      reasoning: 'Hybrid strategy: Low AI health, using traditional',
      confidence: 0.7,
      fallback: false
    };
  }

  /**
   * Update routing strategy
   * @param {string} strategy - New routing strategy
   */
  setRoutingStrategy(strategy) {
    const validStrategies = ['ai-first', 'hybrid', 'traditional', 'tavily-first'];
    if (validStrategies.includes(strategy)) {
      this.routingStrategy = strategy;
      logger.info('AIFirstDataSourceRouter strategy updated', {
        newStrategy: strategy,
        tavilySupport: strategy.includes('tavily')
      });
    } else {
      logger.warn('Invalid routing strategy', {
        attempted: strategy,
        valid: validStrategies
      });
    }
  }

  /**
   * Get routing metrics
   * @returns {Object} Current routing metrics
   */
  getMetrics() {
    return {
      ...this.routingMetrics,
      aiPercentage: this.routingMetrics.totalRequests > 0 
        ? (this.routingMetrics.aiRequests / this.routingMetrics.totalRequests * 100).toFixed(1)
        : 0,
      traditionalPercentage: this.routingMetrics.totalRequests > 0
        ? (this.routingMetrics.traditionalRequests / this.routingMetrics.totalRequests * 100).toFixed(1)
        : 0,
      tavilyPercentage: this.routingMetrics.totalRequests > 0
        ? (this.routingMetrics.tavilyRequests / this.routingMetrics.totalRequests * 100).toFixed(1)
        : 0,
      fallbackPercentage: this.routingMetrics.totalRequests > 0
        ? (this.routingMetrics.fallbackRequests / this.routingMetrics.totalRequests * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      service: 'AIFirstDataSourceRouter',
      version: this.version,
      strategy: this.routingStrategy,
      healthThreshold: this.aiHealthThreshold,
      fallbackEnabled: this.fallbackEnabled,
      metrics: this.getMetrics()
    };
  }

  /**
   * Reset routing metrics
   */
  resetMetrics() {
    this.routingMetrics = {
      aiRequests: 0,
      traditionalRequests: 0,
      fallbackRequests: 0,
      tavilyRequests: 0,
      totalRequests: 0
    };
    
    logger.info('AIFirstDataSourceRouter metrics reset');
  }

  /**
   * Update circuit breaker state for a specific service
   * @param {string} service - Service name ('ai', 'crawler', etc.)
   * @param {boolean} success - Whether the operation was successful
   * @param {Error} error - Error object if operation failed
   */
  updateCircuitBreaker(service, success, error = null) {
    try {
      // Initialize circuit breaker state if not exists
      if (!this.circuitBreakerState) {
        this.circuitBreakerState = {};
      }

      if (!this.circuitBreakerState[service]) {
        this.circuitBreakerState[service] = {
          failures: 0,
          successes: 0,
          lastFailure: null,
          lastSuccess: null,
          state: 'closed', // closed, open, half-open
          openedAt: null
        };
      }

      const breaker = this.circuitBreakerState[service];

      if (success) {
        breaker.successes++;
        breaker.lastSuccess = new Date();
        
        // Reset failure count on success
        if (breaker.failures > 0) {
          breaker.failures = 0;
        }
        
        // Close circuit if it was open and we have a success
        if (breaker.state === 'open' || breaker.state === 'half-open') {
          breaker.state = 'closed';
          breaker.openedAt = null;
          
          logger.info('Circuit breaker closed for service', {
            service,
            successes: breaker.successes,
            previousState: breaker.state
          });
        }
      } else {
        breaker.failures++;
        breaker.lastFailure = new Date();
        
        // Open circuit if failure threshold is reached
        const failureThreshold = 3; // Open after 3 consecutive failures
        if (breaker.failures >= failureThreshold && breaker.state === 'closed') {
          breaker.state = 'open';
          breaker.openedAt = new Date();
          
          logger.warn('Circuit breaker opened for service', {
            service,
            failures: breaker.failures,
            error: error ? error.message : 'Unknown error',
            threshold: failureThreshold
          });
        }
      }

      logger.debug('Circuit breaker state updated', {
        service,
        success,
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes
      });

    } catch (updateError) {
      logger.error('Failed to update circuit breaker state', {
        service,
        success,
        error: updateError.message,
        stack: updateError.stack
      });
    }
  }

  /**
   * Check if circuit breaker allows requests for a service
   * @param {string} service - Service name
   * @returns {boolean} Whether requests are allowed
   */
  isCircuitBreakerOpen(service) {
    if (!this.circuitBreakerState || !this.circuitBreakerState[service]) {
      return false; // Default to closed (allow requests)
    }

    const breaker = this.circuitBreakerState[service];
    
    // If circuit is closed, allow requests
    if (breaker.state === 'closed') {
      return false;
    }
    
    // If circuit is open, check if enough time has passed to try again
    if (breaker.state === 'open') {
      const timeoutMs = 60000; // 1 minute timeout
      const timeSinceOpened = Date.now() - breaker.openedAt.getTime();
      
      if (timeSinceOpened > timeoutMs) {
        // Move to half-open state to allow one test request
        breaker.state = 'half-open';
        logger.info('Circuit breaker moved to half-open', {
          service,
          timeoutMs,
          timeSinceOpened
        });
        return false; // Allow the test request
      }
      
      return true; // Circuit is open, block requests
    }
    
    // Half-open state allows requests
    return false;
  }

  /**
   * Get circuit breaker status for all services
   * @returns {Object} Circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      circuitBreakers: this.circuitBreakerState || {},
      summary: this._getCircuitBreakerSummary()
    };
  }

  /**
   * Get circuit breaker summary
   * @private
   */
  _getCircuitBreakerSummary() {
    if (!this.circuitBreakerState) {
      return { totalServices: 0, openCircuits: 0, closedCircuits: 0 };
    }

    const services = Object.keys(this.circuitBreakerState);
    const openCircuits = services.filter(service =>
      this.circuitBreakerState[service].state === 'open'
    ).length;
    
    return {
      totalServices: services.length,
      openCircuits,
      closedCircuits: services.length - openCircuits,
      services: services.reduce((acc, service) => {
        acc[service] = this.circuitBreakerState[service].state;
        return acc;
      }, {})
    };
  }
}

module.exports = AIFirstDataSourceRouter;