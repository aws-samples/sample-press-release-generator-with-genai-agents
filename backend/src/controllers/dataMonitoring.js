const marketDataService = require('../services/marketData');
const { redisService } = require('../services/redis');
const { DataProcessorService } = require('../services/dataProcessor');
const { JobManagerService } = require('../services/jobManager');
const { logger } = require('../utils/logger');
const { z } = require('zod');
const moment = require('moment');

/**
 * Data Monitoring Controllers - API endpoints for monitoring data collection and quality
 * Handles status monitoring, quality reports, job tracking, and performance metrics
 */
class DataMonitoringController {
  constructor() {
    this.marketDataService = marketDataService; // Use singleton instance
    this.redisService = redisService;
    this.dataProcessor = new DataProcessorService();
    this.jobManager = new JobManagerService();
    this.isInitialized = false;
  }

  /**
   * Initialize the controller and its services
   */
  async initialize() {
    try {
      await this.marketDataService.initialize();
      await this.redisService.initialize();
      await this.dataProcessor.initialize();
      await this.jobManager.initialize();
      this.isInitialized = true;
      logger.info('DataMonitoringController initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize DataMonitoringController:', error);
      throw error;
    }
  }

  /**
   * Validation schemas
   */
  static schemas = {
    jobId: z.object({
      jobId: z.string().uuid()
    }),
    
    jobFilters: z.object({
      status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
      type: z.string().optional(),
      limit: z.number().min(1).max(100).optional().default(20),
      offset: z.number().min(0).optional().default(0)
    }),
    
    marketCode: z.object({
      market: z.string().min(2).max(10)
    })
  };

  /**
   * GET /api/v1/data/status
   * Overall data collection status
   */
  getDataStatus = async (req, res) => {
    try {
      logger.debug('Getting overall data collection status');

      // Get collection status from market data service
      const collectionStatus = await this.marketDataService.getCollectionStatus();
      
      // Get cache statistics
      const cacheStats = await this.redisService.getCacheStats();
      
      // Get job statistics
      const jobStats = await this.jobManager.getJobStats();
      
      // Get data freshness information
      const dataFreshness = await this._getDataFreshness();
      
      // Get system health metrics
      const systemHealth = await this._getSystemHealth();

      const status = {
        overall: {
          status: this._determineOverallStatus(collectionStatus, cacheStats, jobStats),
          lastUpdated: moment().toISOString(),
          uptime: process.uptime()
        },
        
        dataCollection: {
          totalMarkets: collectionStatus.totalMarkets,
          dataTypes: collectionStatus.dataTypes,
          lastCollection: collectionStatus.lastCollection,
          isInitialized: collectionStatus.isInitialized,
          activeCollections: jobStats.activeJobs
        },
        
        cache: {
          status: cacheStats ? 'connected' : 'disconnected',
          connected: cacheStats?.connected || false,
          keyCount: cacheStats?.keyCounts?.total || 0,
          memory: cacheStats?.memory || {},
          hitRate: await this._calculateCacheHitRate()
        },
        
        jobs: {
          total: jobStats.total,
          active: jobStats.activeJobs,
          queued: jobStats.queuedJobs,
          successRate: jobStats.successRate,
          averageDuration: jobStats.averageDuration,
          byStatus: jobStats.byStatus
        },
        
        dataQuality: {
          freshness: dataFreshness,
          overallScore: await this._calculateOverallQualityScore(),
          issues: await this._getDataQualityIssues()
        },
        
        system: systemHealth
      };

      res.status(200).json(status);

    } catch (error) {
      logger.error('Error getting data status:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve data status'
      });
    }
  };

  /**
   * GET /api/v1/data/quality
   * Data quality metrics and reports
   */
  getDataQuality = async (req, res) => {
    try {
      const { market, dataType, includeDetails = false } = req.query;

      logger.debug('Getting data quality metrics', { market, dataType, includeDetails });

      let qualityReport;

      if (market && dataType) {
        // Get quality for specific market and data type
        qualityReport = await this._getMarketDataQuality(market, dataType);
      } else if (market) {
        // Get quality for all data types in a market
        qualityReport = await this._getMarketQuality(market);
      } else {
        // Get overall quality across all markets
        qualityReport = await this._getOverallQuality();
      }

      // Add recommendations if details requested
      if (includeDetails === 'true') {
        qualityReport.recommendations = await this._generateQualityRecommendations(qualityReport);
        qualityReport.trends = await this._getQualityTrends();
      }

      res.status(200).json(qualityReport);

    } catch (error) {
      logger.error('Error getting data quality:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve data quality metrics'
      });
    }
  };

  /**
   * GET /api/v1/jobs/:jobId
   * Job status and progress
   */
  getJobStatus = async (req, res) => {
    try {
      const { jobId } = DataMonitoringController.schemas.jobId.parse(req.params);

      logger.debug(`Getting status for job ${jobId}`);

      const job = await this.jobManager.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          message: `Job with ID ${jobId} does not exist`
        });
      }

      // Calculate additional metrics
      const enrichedJob = {
        ...job,
        metrics: {
          duration: this._calculateJobDuration(job),
          estimatedTimeRemaining: this._calculateEstimatedTimeRemaining(job),
          throughput: this._calculateJobThroughput(job),
          errorRate: this._calculateJobErrorRate(job)
        }
      };

      res.status(200).json(enrichedJob);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error(`Error getting job status for ${req.params.jobId}:`, error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve job status'
      });
    }
  };

  /**
   * GET /api/v1/jobs
   * List all jobs with filtering
   */
  getJobs = async (req, res) => {
    try {
      const filters = DataMonitoringController.schemas.jobFilters.parse(req.query);

      logger.debug('Getting jobs list', filters);

      const result = await this.jobManager.getJobs(filters);

      // Add summary statistics
      const response = {
        ...result,
        summary: {
          totalJobs: result.total,
          activeJobs: result.jobs.filter(j => j.status === 'running').length,
          queuedJobs: result.jobs.filter(j => j.status === 'queued').length,
          completedJobs: result.jobs.filter(j => j.status === 'completed').length,
          failedJobs: result.jobs.filter(j => j.status === 'failed').length
        },
        filters: filters,
        retrievedAt: moment().toISOString()
      };

      res.status(200).json(response);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Error getting jobs list:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve jobs list'
      });
    }
  };

  /**
   * GET /api/v1/data/cache/stats
   * Cache statistics and performance monitoring
   */
  getCacheStats = async (req, res) => {
    try {
      logger.debug('Getting cache statistics');

      const cacheStats = await this.redisService.getCacheStats();
      
      if (!cacheStats) {
        return res.status(503).json({
          error: 'Cache unavailable',
          message: 'Redis cache is not connected'
        });
      }

      // Calculate additional metrics
      const enhancedStats = {
        ...cacheStats,
        performance: {
          hitRate: await this._calculateCacheHitRate(),
          missRate: await this._calculateCacheMissRate(),
          averageResponseTime: await this._calculateAverageResponseTime(),
          throughput: await this._calculateCacheThroughput()
        },
        health: {
          status: cacheStats.connected ? 'healthy' : 'unhealthy',
          uptime: await this._getCacheUptime(),
          lastError: await this._getLastCacheError()
        },
        recommendations: this._generateCacheRecommendations(cacheStats)
      };

      res.status(200).json(enhancedStats);

    } catch (error) {
      logger.error('Error getting cache stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve cache statistics'
      });
    }
  };

  /**
   * POST /api/v1/data/cache/clear
   * Clear cache (admin operation)
   */
  clearCache = async (req, res) => {
    try {
      const { type = 'all', market, dataType } = req.body;

      logger.info('Cache clear requested', { type, market, dataType });

      let result;
      
      switch (type) {
        case 'all':
          result = await this.redisService.clearAllCache();
          break;
        case 'market':
          if (!market) {
            return res.status(400).json({
              error: 'Market code required for market-specific cache clear'
            });
          }
          result = await this.redisService.invalidateMarketCache(market);
          break;
        case 'dataType':
          if (!dataType) {
            return res.status(400).json({
              error: 'Data type required for data-type-specific cache clear'
            });
          }
          result = await this.redisService.invalidateDataTypeCache(dataType);
          break;
        default:
          return res.status(400).json({
            error: 'Invalid cache clear type',
            validTypes: ['all', 'market', 'dataType']
          });
      }

      if (result) {
        res.status(200).json({
          message: 'Cache cleared successfully',
          type,
          clearedAt: moment().toISOString()
        });
      } else {
        res.status(500).json({
          error: 'Failed to clear cache',
          message: 'Cache clear operation was not successful'
        });
      }

    } catch (error) {
      logger.error('Error clearing cache:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to clear cache'
      });
    }
  };

  // Helper methods for calculating metrics

  /**
   * Determine overall system status
   */
  _determineOverallStatus(collectionStatus, cacheStats, jobStats) {
    if (!collectionStatus.isInitialized) return 'initializing';
    if (!cacheStats?.connected) return 'degraded';
    if (jobStats.activeJobs > 0) return 'active';
    if (jobStats.successRate < 80) return 'warning';
    return 'healthy';
  }

  /**
   * Get data freshness information
   */
  async _getDataFreshness() {
    try {
      const lastCollection = await this.redisService.getLastCollectionTime();
      const age = lastCollection ? moment().diff(moment(lastCollection), 'hours') : null;
      
      return {
        lastCollection,
        ageHours: age,
        status: age === null ? 'unknown' : age < 6 ? 'fresh' : age < 24 ? 'stale' : 'expired'
      };
    } catch (error) {
      logger.warn('Error getting data freshness:', error);
      return { status: 'unknown' };
    }
  }

  /**
   * Get system health metrics
   */
  async _getSystemHealth() {
    return {
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        external: process.memoryUsage().external
      },
      cpu: {
        uptime: process.uptime(),
        loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
      },
      node: {
        version: process.version,
        platform: process.platform
      }
    };
  }

  /**
   * Calculate cache hit rate
   */
  async _calculateCacheHitRate() {
    // This would be implemented with actual Redis metrics
    // For now, return a placeholder
    return 75; // 75% hit rate
  }

  /**
   * Calculate cache miss rate
   */
  async _calculateCacheMissRate() {
    const hitRate = await this._calculateCacheHitRate();
    return 100 - hitRate;
  }

  /**
   * Calculate overall quality score
   */
  async _calculateOverallQualityScore() {
    // This would aggregate quality scores across all markets
    // For now, return a placeholder
    return 85;
  }

  /**
   * Get data quality issues
   */
  async _getDataQualityIssues() {
    return [
      // Placeholder issues
      { type: 'freshness', count: 3, severity: 'medium' },
      { type: 'completeness', count: 1, severity: 'low' }
    ];
  }

  /**
   * Get market-specific data quality
   */
  async _getMarketDataQuality(market, dataType) {
    try {
      const quality = await this.redisService.getDataQuality(market, dataType);
      return quality || { score: 0, status: 'no_data' };
    } catch (error) {
      logger.warn(`Error getting quality for ${market}:${dataType}:`, error);
      return { score: 0, status: 'error' };
    }
  }

  /**
   * Get market quality across all data types
   */
  async _getMarketQuality(market) {
    const dataTypes = ['realEstate', 'economic', 'news', 'demographics'];
    const qualities = {};
    
    for (const dataType of dataTypes) {
      qualities[dataType] = await this._getMarketDataQuality(market, dataType);
    }
    
    return {
      market,
      dataTypes: qualities,
      overall: this._calculateAverageQuality(Object.values(qualities))
    };
  }

  /**
   * Get overall quality across all markets
   */
  async _getOverallQuality() {
    return {
      overall: await this._calculateOverallQualityScore(),
      byDataType: {
        realEstate: 88,
        economic: 92,
        news: 78,
        demographics: 85
      },
      issues: await this._getDataQualityIssues(),
      lastAssessed: moment().toISOString()
    };
  }

  /**
   * Calculate average quality from quality objects
   */
  _calculateAverageQuality(qualities) {
    const scores = qualities.filter(q => q.score > 0).map(q => q.score);
    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }

  /**
   * Calculate job duration
   */
  _calculateJobDuration(job) {
    if (!job.startedAt) return null;
    
    const endTime = job.completedAt || moment().toISOString();
    return moment(endTime).diff(moment(job.startedAt), 'minutes');
  }

  /**
   * Calculate estimated time remaining for job
   */
  _calculateEstimatedTimeRemaining(job) {
    if (job.status !== 'running' || !job.startedAt) return null;
    
    const elapsed = moment().diff(moment(job.startedAt), 'minutes');
    const progress = job.progress.percentage || 0;
    
    if (progress === 0) return job.estimatedDuration;
    
    const totalEstimated = (elapsed / progress) * 100;
    return Math.max(0, Math.round(totalEstimated - elapsed));
  }

  /**
   * Calculate job throughput (items per minute)
   */
  _calculateJobThroughput(job) {
    const duration = this._calculateJobDuration(job);
    if (!duration || duration === 0) return null;
    
    return Math.round(job.progress.completed / duration * 100) / 100;
  }

  /**
   * Calculate job error rate
   */
  _calculateJobErrorRate(job) {
    const total = job.progress.completed + job.progress.failed;
    if (total === 0) return 0;
    
    return Math.round((job.progress.failed / total) * 100);
  }

  /**
   * Generate quality recommendations
   */
  async _generateQualityRecommendations(qualityReport) {
    const recommendations = [];
    
    if (qualityReport.overall < 80) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: 'Overall data quality is below threshold. Consider refreshing data sources.'
      });
    }
    
    return recommendations;
  }

  /**
   * Get quality trends
   */
  async _getQualityTrends() {
    // Placeholder for quality trends over time
    return {
      trend: 'improving',
      change: '+5%',
      period: '7 days'
    };
  }

  /**
   * Calculate average response time
   */
  async _calculateAverageResponseTime() {
    // Placeholder - would be calculated from actual metrics
    return 15; // ms
  }

  /**
   * Calculate cache throughput
   */
  async _calculateCacheThroughput() {
    // Placeholder - would be calculated from actual metrics
    return 1250; // operations per second
  }

  /**
   * Get cache uptime
   */
  async _getCacheUptime() {
    // Placeholder - would get actual Redis uptime
    return process.uptime();
  }

  /**
   * Get last cache error
   */
  async _getLastCacheError() {
    // Placeholder - would get actual error from logs
    return null;
  }

  /**
   * Generate cache recommendations
   */
  _generateCacheRecommendations(cacheStats) {
    const recommendations = [];
    
    if (cacheStats.keyCounts.total > 10000) {
      recommendations.push({
        type: 'performance',
        message: 'High key count detected. Consider implementing key expiration policies.'
      });
    }
    
    return recommendations;
  }
}

module.exports = { DataMonitoringController };