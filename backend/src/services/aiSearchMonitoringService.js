const { logger } = require('../utils/logger');
const { config } = require('../config');

/**
 * AI Search Monitoring Service
 * Tracks AI utilization, performance metrics, and provides analytics
 */
class AISearchMonitoringService {
  constructor() {
    this.name = 'AISearchMonitoringService';
    this.version = '1.0.0';
    
    // Metrics storage
    this.metrics = {
      requests: new Map(),
      performance: new Map(),
      utilization: new Map(),
      errors: new Map()
    };
    
    // Configuration
    this.config = {
      retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      aggregationInterval: 60 * 1000, // 1 minute
      performanceThresholds: {
        responseTime: 40000, // 40 seconds
        successRate: 0.95, // 95%
        utilizationTarget: 0.70 // 70%
      }
    };
    
    // Start periodic cleanup and aggregation
    this.startPeriodicTasks();
  }

  /**
   * Record AI search request
   */
  recordAIRequest(requestId, metadata = {}) {
    const timestamp = Date.now();
    const request = {
      id: requestId,
      timestamp,
      startTime: timestamp,
      market: metadata.market,
      query: metadata.query,
      source: 'perplexity',
      status: 'started',
      ...metadata
    };
    
    this.metrics.requests.set(requestId, request);
    
    logger.debug('AI request recorded', {
      service: this.name,
      requestId,
      market: metadata.market
    });
  }

  /**
   * Record AI search completion
   */
  recordAICompletion(requestId, result = {}) {
    const request = this.metrics.requests.get(requestId);
    if (!request) {
      logger.warn('AI completion recorded for unknown request', {
        service: this.name,
        requestId
      });
      return;
    }
    
    const endTime = Date.now();
    const responseTime = endTime - request.startTime;
    
    // Update request record
    request.endTime = endTime;
    request.responseTime = responseTime;
    request.status = result.success ? 'completed' : 'failed';
    request.contentSize = result.contentSize || 0;
    request.error = result.error;
    
    // Record performance metrics
    this.recordPerformanceMetric(requestId, {
      responseTime,
      success: result.success,
      contentSize: result.contentSize || 0,
      market: request.market
    });
    
    logger.debug('AI completion recorded', {
      service: this.name,
      requestId,
      responseTime,
      success: result.success
    });
  }

  /**
   * Record performance metric
   */
  recordPerformanceMetric(requestId, metric) {
    const timestamp = Date.now();
    const performanceRecord = {
      requestId,
      timestamp,
      ...metric
    };
    
    this.metrics.performance.set(`${requestId}_${timestamp}`, performanceRecord);
  }

  /**
   * Record data source utilization
   */
  recordDataSourceUtilization(source, market, success = true) {
    const timestamp = Date.now();
    const key = `${source}_${Math.floor(timestamp / this.config.aggregationInterval)}`;
    
    const existing = this.metrics.utilization.get(key) || {
      source,
      market,
      timestamp: Math.floor(timestamp / this.config.aggregationInterval) * this.config.aggregationInterval,
      total: 0,
      successful: 0,
      failed: 0
    };
    
    existing.total++;
    if (success) {
      existing.successful++;
    } else {
      existing.failed++;
    }
    
    this.metrics.utilization.set(key, existing);
  }

  /**
   * Record error
   */
  recordError(requestId, error, context = {}) {
    const timestamp = Date.now();
    const errorRecord = {
      requestId,
      timestamp,
      error: error.message || error,
      stack: error.stack,
      context,
      type: this.classifyError(error)
    };
    
    this.metrics.errors.set(`${requestId}_${timestamp}`, errorRecord);
    
    logger.error('AI search error recorded', {
      service: this.name,
      requestId,
      error: error.message,
      type: errorRecord.type
    });
  }

  /**
   * Classify error type
   */
  classifyError(error) {
    const message = error.message || error.toString();
    
    if (message.includes('timeout')) return 'timeout';
    if (message.includes('rate limit')) return 'rate_limit';
    if (message.includes('network')) return 'network';
    if (message.includes('authentication')) return 'auth';
    if (message.includes('quota')) return 'quota';
    
    return 'unknown';
  }

  /**
   * Get AI utilization statistics
   */
  getUtilizationStats(timeWindow = 3600000) { // 1 hour default
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const stats = {
      ai: { total: 0, successful: 0, failed: 0 },
      crawler: { total: 0, successful: 0, failed: 0 },
      trusted: { total: 0, successful: 0, failed: 0 },
      total: { total: 0, successful: 0, failed: 0 }
    };
    
    // Aggregate utilization data
    for (const [key, record] of this.metrics.utilization.entries()) {
      if (record.timestamp >= cutoff) {
        const source = record.source === 'perplexity' ? 'ai' : record.source;
        if (stats[source]) {
          stats[source].total += record.total;
          stats[source].successful += record.successful;
          stats[source].failed += record.failed;
        }
        
        stats.total.total += record.total;
        stats.total.successful += record.successful;
        stats.total.failed += record.failed;
      }
    }
    
    // Calculate percentages
    const result = {};
    for (const [source, data] of Object.entries(stats)) {
      result[source] = {
        ...data,
        successRate: data.total > 0 ? data.successful / data.total : 0,
        utilization: stats.total.total > 0 ? data.total / stats.total.total : 0
      };
    }
    
    return result;
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics(timeWindow = 3600000) { // 1 hour default
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const metrics = [];
    for (const [key, record] of this.metrics.performance.entries()) {
      if (record.timestamp >= cutoff) {
        metrics.push(record);
      }
    }
    
    if (metrics.length === 0) {
      return {
        count: 0,
        averageResponseTime: 0,
        successRate: 0,
        contentSize: { average: 0, total: 0 }
      };
    }
    
    const successful = metrics.filter(m => m.success);
    const totalResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0);
    const totalContentSize = metrics.reduce((sum, m) => sum + m.contentSize, 0);
    
    return {
      count: metrics.length,
      averageResponseTime: totalResponseTime / metrics.length,
      successRate: successful.length / metrics.length,
      contentSize: {
        average: totalContentSize / metrics.length,
        total: totalContentSize
      },
      thresholdCompliance: {
        responseTime: (totalResponseTime / metrics.length) <= this.config.performanceThresholds.responseTime,
        successRate: (successful.length / metrics.length) >= this.config.performanceThresholds.successRate
      }
    };
  }

  /**
   * Get error analytics
   */
  getErrorAnalytics(timeWindow = 3600000) { // 1 hour default
    const now = Date.now();
    const cutoff = now - timeWindow;
    
    const errors = [];
    for (const [key, record] of this.metrics.errors.entries()) {
      if (record.timestamp >= cutoff) {
        errors.push(record);
      }
    }
    
    // Group by error type
    const errorTypes = {};
    errors.forEach(error => {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
    });
    
    return {
      total: errors.length,
      types: errorTypes,
      recent: errors.slice(-5).map(e => ({
        timestamp: e.timestamp,
        type: e.type,
        message: e.error
      }))
    };
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport(timeWindow = 3600000) {
    const utilization = this.getUtilizationStats(timeWindow);
    const performance = this.getPerformanceAnalytics(timeWindow);
    const errors = this.getErrorAnalytics(timeWindow);
    
    return {
      timestamp: new Date().toISOString(),
      timeWindow: timeWindow / 1000 / 60, // minutes
      utilization,
      performance,
      errors,
      compliance: {
        aiUtilizationTarget: utilization.ai.utilization >= this.config.performanceThresholds.utilizationTarget,
        performanceTarget: performance.thresholdCompliance?.responseTime && performance.thresholdCompliance?.successRate,
        overallHealth: utilization.total.successRate >= this.config.performanceThresholds.successRate
      }
    };
  }

  /**
   * Start periodic cleanup and aggregation tasks
   */
  startPeriodicTasks() {
    // Cleanup old data every 5 minutes
    setInterval(() => {
      this.cleanupOldData();
    }, 5 * 60 * 1000);
    
    // Log utilization summary every 15 minutes
    setInterval(() => {
      const report = this.getMonitoringReport(15 * 60 * 1000); // 15 minutes
      logger.info('AI utilization summary', {
        service: this.name,
        aiUtilization: `${(report.utilization.ai.utilization * 100).toFixed(1)}%`,
        successRate: `${(report.performance.successRate * 100).toFixed(1)}%`,
        avgResponseTime: `${report.performance.averageResponseTime}ms`,
        errors: report.errors.total
      });
    }, 15 * 60 * 1000);
  }

  /**
   * Clean up old data beyond retention period
   */
  cleanupOldData() {
    const cutoff = Date.now() - this.config.retentionPeriod;
    let cleaned = 0;
    
    // Clean requests
    for (const [key, record] of this.metrics.requests.entries()) {
      if (record.timestamp < cutoff) {
        this.metrics.requests.delete(key);
        cleaned++;
      }
    }
    
    // Clean performance metrics
    for (const [key, record] of this.metrics.performance.entries()) {
      if (record.timestamp < cutoff) {
        this.metrics.performance.delete(key);
        cleaned++;
      }
    }
    
    // Clean utilization data
    for (const [key, record] of this.metrics.utilization.entries()) {
      if (record.timestamp < cutoff) {
        this.metrics.utilization.delete(key);
        cleaned++;
      }
    }
    
    // Clean errors
    for (const [key, record] of this.metrics.errors.entries()) {
      if (record.timestamp < cutoff) {
        this.metrics.errors.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Cleaned up old monitoring data', {
        service: this.name,
        recordsCleaned: cleaned
      });
    }
  }
}

module.exports = AISearchMonitoringService;