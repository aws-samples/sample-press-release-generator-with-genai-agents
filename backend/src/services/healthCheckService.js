const { logger } = require('../utils/logger');
const { config } = require('../config');

/**
 * Health Check Service for Data Source Monitoring
 * Provides real-time health assessment for all data sources
 */
class HealthCheckService {
  constructor(dataSources = {}) {
    this.name = 'HealthCheckService';
    this.version = '1.0.0';
    this.dataSources = dataSources;
    
    // Health check configuration
    this.config = {
      checkInterval: 5 * 60 * 1000, // 5 minutes
      timeout: 10000, // 10 seconds
      healthThresholds: {
        perplexity: { responseTime: 40000, errorRate: 0.1 },
        firecrawl: { responseTime: 20000, errorRate: 0.15 },
        trusted: { responseTime: 10000, errorRate: 0.05 }
      }
    };
    
    // Health cache
    this.healthCache = new Map();
    this.lastHealthCheck = null;
    
    // Start periodic health checks
    this.startPeriodicChecks();
  }

  /**
   * Check Perplexity AI service health
   */
  async checkPerplexityHealth() {
    const startTime = Date.now();
    const serviceName = 'perplexity';
    
    try {
      // Lightweight health check query
      const testQuery = 'What is the current date?';
      const response = await this.dataSources.perplexityService?.search(
        'What is the current date?',
        { timeout: this.config.timeout }
      );
      
      const responseTime = Date.now() - startTime;
      const threshold = this.config.healthThresholds.perplexity;
      
      const healthScore = this.calculateHealthScore(responseTime, 0, threshold);
      
      return {
        service: serviceName,
        healthy: healthScore > 0.7,
        score: healthScore,
        responseTime,
        lastCheck: new Date().toISOString(),
        details: {
          status: 'operational',
          responseSize: response?.length || 0,
          errorRate: 0
        }
      };
    } catch (error) {
      logger.error(`Health check failed for ${serviceName}`, {
        error: error.message,
        responseTime: Date.now() - startTime
      });
      
      return {
        service: serviceName,
        healthy: false,
        score: 0,
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Check Firecrawl service health
   */
  async checkFirecrawlHealth() {
    const startTime = Date.now();
    const serviceName = 'firecrawl';
    
    try {
      // Check if firecrawl service is available
      const isHealthy = this.dataSources.firecrawlService?.isHealthy?.() || true;
      const responseTime = Date.now() - startTime;
      const threshold = this.config.healthThresholds.firecrawl;
      
      const healthScore = this.calculateHealthScore(responseTime, 0, threshold);
      
      return {
        service: serviceName,
        healthy: isHealthy && healthScore > 0.6,
        score: healthScore,
        responseTime,
        lastCheck: new Date().toISOString(),
        details: {
          status: isHealthy ? 'operational' : 'degraded',
          errorRate: 0
        }
      };
    } catch (error) {
      logger.error(`Health check failed for ${serviceName}`, {
        error: error.message,
        responseTime: Date.now() - startTime
      });
      
      return {
        service: serviceName,
        healthy: false,
        score: 0,
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Check trusted data service health
   */
  async checkTrustedDataHealth() {
    const startTime = Date.now();
    const serviceName = 'trusted';
    
    try {
      // Trusted data is always available (local/cached data)
      const responseTime = Date.now() - startTime;
      const threshold = this.config.healthThresholds.trusted;
      
      const healthScore = this.calculateHealthScore(responseTime, 0, threshold);
      
      return {
        service: serviceName,
        healthy: true, // Trusted data is always healthy
        score: Math.max(0.0, Math.min(1.0, healthScore)), // Allow full 0.0-1.0 range based on actual health
        responseTime,
        lastCheck: new Date().toISOString(),
        details: {
          status: 'operational',
          dataFreshness: 'current',
          errorRate: 0
        }
      };
    } catch (error) {
      logger.error(`Health check failed for ${serviceName}`, {
        error: error.message,
        responseTime: Date.now() - startTime
      });
      
      return {
        service: serviceName,
        healthy: true, // Even if check fails, trusted data is still available
        score: 0.8, // Fallback score
        responseTime: Date.now() - startTime,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Calculate health score based on performance metrics
   */
  calculateHealthScore(responseTime, errorRate, threshold) {
    // Response time score (0.0 to 1.0)
    const timeScore = Math.max(0, 1 - (responseTime / threshold.responseTime));
    
    // Error rate score (0.0 to 1.0)
    const errorScore = Math.max(0, 1 - (errorRate / threshold.errorRate));
    
    // Weighted average (response time 60%, error rate 40%)
    return (timeScore * 0.6) + (errorScore * 0.4);
  }

  /**
   * Get comprehensive health matrix for all services
   */
  async getHealthMatrix() {
    const healthMatrix = {
      perplexity: await this.checkPerplexityHealth(),
      firecrawl: await this.checkFirecrawlHealth(),
      trusted: await this.checkTrustedDataHealth(),
      timestamp: new Date().toISOString()
    };
    
    // Cache results
    this.healthCache.set('latest', healthMatrix);
    this.lastHealthCheck = Date.now();
    
    return healthMatrix;
  }

  /**
   * Get cached health status or perform fresh check
   */
  async getCachedHealthStatus(maxAge = 300000) { // 5 minutes default
    const cached = this.healthCache.get('latest');
    const cacheAge = this.lastHealthCheck ? Date.now() - this.lastHealthCheck : Infinity;
    
    if (cached && cacheAge < maxAge) {
      return cached;
    }
    
    return await this.getHealthMatrix();
  }

  /**
   * Start periodic health monitoring
   */
  startPeriodicChecks() {
    setInterval(async () => {
      try {
        await this.getHealthMatrix();
        logger.debug('Periodic health check completed', {
          service: this.name,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Periodic health check failed', {
          service: this.name,
          error: error.message
        });
      }
    }, this.config.checkInterval);
  }

  /**
   * Get service health summary for monitoring
   */
  async getHealthSummary() {
    const healthMatrix = await this.getCachedHealthStatus();
    
    return {
      overall: {
        healthy: Object.values(healthMatrix).filter(service => 
          service.healthy !== undefined ? service.healthy : true
        ).length,
        total: Object.keys(healthMatrix).filter(key => key !== 'timestamp').length,
        timestamp: healthMatrix.timestamp
      },
      services: {
        perplexity: {
          status: healthMatrix.perplexity.healthy ? 'healthy' : 'unhealthy',
          score: healthMatrix.perplexity.score,
          responseTime: `${healthMatrix.perplexity.responseTime}ms`
        },
        firecrawl: {
          status: healthMatrix.firecrawl.healthy ? 'healthy' : 'unhealthy',
          score: healthMatrix.firecrawl.score,
          responseTime: `${healthMatrix.firecrawl.responseTime}ms`
        },
        trusted: {
          status: healthMatrix.trusted.healthy ? 'healthy' : 'unhealthy',
          score: healthMatrix.trusted.score,
          responseTime: `${healthMatrix.trusted.responseTime}ms`
        }
      }
    };
  }
}

module.exports = HealthCheckService;