const { redisService } = require('./redis');
const dynamoService = require('./dynamo');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const EventEmitter = require('events');

/**
 * Job Management Service - Handles background job processing and tracking
 * Manages job creation, tracking, status updates, and progress monitoring
 */
class JobManagerService extends EventEmitter {
  constructor() {
    super();
    this.redisService = redisService;
    this.dynamoService = dynamoService;
    this.isInitialized = false;
    
    // Job queue configuration
    this.jobQueue = [];
    this.activeJobs = new Map();
    this.maxConcurrentJobs = 3;
    this.jobProcessingInterval = null;
    
    // Job status definitions
    this.jobStatuses = {
      QUEUED: 'queued',
      RUNNING: 'running',
      COMPLETED: 'completed',
      FAILED: 'failed',
      CANCELLED: 'cancelled',
      PAUSED: 'paused'
    };

    // Job types
    this.jobTypes = {
      MARKET_DATA_COLLECTION: 'market_data_collection',
      FULL_MARKET_REFRESH: 'full_market_refresh',
      SINGLE_MARKET_UPDATE: 'single_market_update',
      DATA_QUALITY_CHECK: 'data_quality_check',
      CACHE_REFRESH: 'cache_refresh'
    };

    // Job priorities
    this.jobPriorities = {
      HIGH: 1,
      NORMAL: 2,
      LOW: 3
    };
  }

  /**
   * Initialize the job manager service
   */
  async initialize() {
    try {
      await this.redisService.initialize();
      // Skip DynamoDB initialization - using local file storage instead
      logger.info('JobManagerService using local file storage (DynamoDB disabled)');
      
      // Start job processing loop
      this._startJobProcessor();
      
      // Set up cleanup interval
      this._startCleanupProcess();
      
      this.isInitialized = true;
      logger.info('JobManagerService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize JobManagerService:', error);
      throw error;
    }
  }

  /**
   * Create a new job
   */
  async createJob(jobData) {
    try {
      const jobId = uuidv4();
      const now = moment().toISOString();
      
      const job = {
        jobId,
        type: jobData.type || this.jobTypes.MARKET_DATA_COLLECTION,
        status: this.jobStatuses.QUEUED,
        priority: jobData.priority || this.jobPriorities.NORMAL,
        
        // Job configuration
        config: {
          markets: jobData.markets || [],
          dataTypes: jobData.dataTypes || ['realEstate'],
          options: jobData.options || {},
          retryCount: 0,
          maxRetries: jobData.maxRetries || 3
        },
        
        // Progress tracking
        progress: {
          total: jobData.markets ? jobData.markets.length : 0,
          completed: 0,
          failed: 0,
          currentTask: null,
          percentage: 0
        },
        
        // Results tracking
        results: {
          successful: [],
          failed: [],
          warnings: [],
          summary: null
        },
        
        // Metadata
        metadata: {
          createdBy: jobData.createdBy || 'system',
          source: jobData.source || 'api',
          tags: jobData.tags || []
        },
        
        // Timestamps
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        
        // Estimated duration
        estimatedDuration: this._calculateEstimatedDuration(jobData),
        
        // TTL for cleanup (30 days)
        ttl: moment().add(30, 'days').unix()
      };

      // Store job in DynamoDB for persistence
      await this._persistJob(job);
      
      // Cache job status in Redis for quick access
      await this.redisService.setJobStatus(jobId, job);
      
      // Add to processing queue
      this.jobQueue.push(job);
      this._sortJobQueue();
      
      logger.info(`Created job ${jobId} of type ${job.type}`);
      
      // Emit job created event
      this.emit('jobCreated', job);
      
      return job;
      
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Get job status and details
   */
  async getJob(jobId) {
    try {
      // Try Redis cache first
      let job = await this.redisService.getJobStatus(jobId);
      
      if (!job) {
        // Fallback to DynamoDB
        job = await this._getJobFromDynamoDB(jobId);
        
        if (job) {
          // Update Redis cache
          await this.redisService.setJobStatus(jobId, job);
        }
      }
      
      return job;
    } catch (error) {
      logger.error(`Error getting job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Update job status and progress
   */
  async updateJob(jobId, updates) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Apply updates
      const updatedJob = {
        ...job,
        ...updates,
        updatedAt: moment().toISOString()
      };

      // Update progress percentage
      if (updatedJob.progress.total > 0) {
        updatedJob.progress.percentage = Math.round(
          (updatedJob.progress.completed / updatedJob.progress.total) * 100
        );
      }

      // Store updates
      await this._persistJob(updatedJob);
      await this.redisService.setJobStatus(jobId, updatedJob);
      
      // Emit job updated event
      this.emit('jobUpdated', updatedJob);
      
      return updatedJob;
    } catch (error) {
      logger.error(`Error updating job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId, reason = 'User requested cancellation') {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      if (job.status === this.jobStatuses.COMPLETED || job.status === this.jobStatuses.FAILED) {
        throw new Error(`Cannot cancel job in ${job.status} status`);
      }

      // Update job status
      const updatedJob = await this.updateJob(jobId, {
        status: this.jobStatuses.CANCELLED,
        results: {
          ...job.results,
          cancellationReason: reason
        },
        completedAt: moment().toISOString()
      });

      // Remove from active jobs if running
      if (this.activeJobs.has(jobId)) {
        this.activeJobs.delete(jobId);
      }

      // Remove from queue if queued
      this.jobQueue = this.jobQueue.filter(j => j.jobId !== jobId);

      logger.info(`Cancelled job ${jobId}: ${reason}`);
      
      // Emit job cancelled event
      this.emit('jobCancelled', updatedJob);
      
      return updatedJob;
    } catch (error) {
      logger.error(`Error cancelling job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Get all jobs with optional filtering
   */
  async getJobs(filters = {}) {
    try {
      const {
        status,
        type,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Diagnostic logging before Redis operation
      logger.info('getJobs method - Redis client validation:', {
        redisServiceExists: !!this.redisService,
        redisClientExists: !!this.redisService?.client,
        redisIsConnected: this.redisService?.isConnected,
        redisClientStatus: this.redisService?.client?.status || 'unknown',
        clientType: typeof this.redisService?.client
      });

      // Check if Redis client is available before attempting to use it
      if (!this.redisService || !this.redisService.client) {
        logger.error('Redis client is null or undefined in getJobs method', {
          redisService: !!this.redisService,
          redisClient: !!this.redisService?.client
        });
        
        // Return empty result instead of throwing error to prevent cleanup crashes
        return {
          jobs: [],
          total: 0,
          page: Math.floor(offset / limit) + 1,
          totalPages: 0,
          hasMore: false
        };
      }

      // Additional connection state validation
      if (!this.redisService.isConnected) {
        logger.warn('Redis client exists but is not connected - attempting to reconnect');
        try {
          await this.redisService.initialize();
          logger.info('Redis reconnection successful');
        } catch (reconnectError) {
          logger.error('Redis reconnection failed:', reconnectError);
          return {
            jobs: [],
            total: 0,
            page: Math.floor(offset / limit) + 1,
            totalPages: 0,
            hasMore: false
          };
        }
      }

      // For now, get from Redis cache (in production, would query DynamoDB with proper pagination)
      // Additional null check right before Redis operation to prevent race conditions
      if (!this.redisService || !this.redisService.client) {
        logger.error('Redis client became null after initial validation in getJobs method');
        return {
          jobs: [],
          total: 0,
          page: Math.floor(offset / limit) + 1,
          totalPages: 0,
          hasMore: false
        };
      }
      
      let allJobKeys = [];
      try {
        allJobKeys = await this.redisService.client.keys('job:*:status');
      } catch (error) {
        logger.error('Error getting job keys from Redis:', error);
        return {
          jobs: [],
          total: 0,
          page: Math.floor(offset / limit) + 1,
          totalPages: 0,
          hasMore: false
        };
      }
      
      const jobs = [];

      for (const key of allJobKeys.slice(offset, offset + limit)) {
        try {
          // Additional null check before each Redis operation
          if (!this.redisService || !this.redisService.client) {
            logger.warn('Redis client became unavailable during job retrieval - stopping');
            break;
          }
          
          const jobData = await this.redisService.client.get(key);
          if (jobData) {
            const job = JSON.parse(jobData);
            
            // Apply filters
            if (status && job.status !== status) continue;
            if (type && job.type !== type) continue;
            
            jobs.push(job);
          }
        } catch (error) {
          logger.warn(`Error parsing job data from key ${key}:`, error);
        }
      }

      // Sort jobs
      jobs.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (sortOrder === 'desc') {
          return bValue > aValue ? 1 : -1;
        } else {
          return aValue > bValue ? 1 : -1;
        }
      });

      return {
        jobs,
        total: allJobKeys.length,
        limit,
        offset,
        hasMore: offset + limit < allJobKeys.length
      };
    } catch (error) {
      logger.error('Error getting jobs:', error);
      throw error;
    }
  }

  /**
   * Get job statistics
   */
  async getJobStats() {
    try {
      const stats = {
        total: 0,
        byStatus: {},
        byType: {},
        activeJobs: this.activeJobs.size,
        queuedJobs: this.jobQueue.length,
        averageDuration: 0,
        successRate: 0
      };

      // Get recent jobs for statistics
      const recentJobs = await this.getJobs({ limit: 1000 });
      stats.total = recentJobs.total;

      let totalDuration = 0;
      let completedJobs = 0;
      let successfulJobs = 0;

      for (const job of recentJobs.jobs) {
        // Count by status
        stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;
        
        // Count by type
        stats.byType[job.type] = (stats.byType[job.type] || 0) + 1;
        
        // Calculate duration and success rate
        if (job.status === this.jobStatuses.COMPLETED || job.status === this.jobStatuses.FAILED) {
          completedJobs++;
          
          if (job.startedAt && job.completedAt) {
            const duration = moment(job.completedAt).diff(moment(job.startedAt), 'minutes');
            totalDuration += duration;
          }
          
          if (job.status === this.jobStatuses.COMPLETED) {
            successfulJobs++;
          }
        }
      }

      // Calculate averages
      if (completedJobs > 0) {
        stats.averageDuration = Math.round(totalDuration / completedJobs);
        stats.successRate = Math.round((successfulJobs / completedJobs) * 100);
      }

      return stats;
    } catch (error) {
      logger.error('Error getting job stats:', error);
      throw error;
    }
  }

  /**
   * Start the job processing loop
   */
  _startJobProcessor() {
    this.jobProcessingInterval = setInterval(async () => {
      try {
        await this._processJobQueue();
      } catch (error) {
        logger.error('Error in job processor:', error);
      }
    }, 5000); // Process every 5 seconds

    logger.info('Job processor started');
  }

  /**
   * Process the job queue
   */
  async _processJobQueue() {
    // Check if we can process more jobs
    if (this.activeJobs.size >= this.maxConcurrentJobs || this.jobQueue.length === 0) {
      return;
    }

    // Get next job from queue
    const job = this.jobQueue.shift();
    if (!job) return;

    try {
      // Mark job as running
      job.status = this.jobStatuses.RUNNING;
      job.startedAt = moment().toISOString();
      job.updatedAt = moment().toISOString();
      
      // Add to active jobs
      this.activeJobs.set(job.jobId, job);
      
      // Update job status
      await this.updateJob(job.jobId, job);
      
      logger.info(`Started processing job ${job.jobId} of type ${job.type}`);
      
      // Emit job started event
      this.emit('jobStarted', job);
      
      // Process job asynchronously
      this._executeJob(job).catch(error => {
        logger.error(`Error executing job ${job.jobId}:`, error);
      });
      
    } catch (error) {
      logger.error(`Error starting job ${job.jobId}:`, error);
      
      // Mark job as failed
      await this.updateJob(job.jobId, {
        status: this.jobStatuses.FAILED,
        results: {
          ...job.results,
          error: error.message
        },
        completedAt: moment().toISOString()
      });
      
      // Remove from active jobs
      this.activeJobs.delete(job.jobId);
    }
  }

  /**
   * Execute a job
   */
  async _executeJob(job) {
    try {
      // This would be implemented based on job type
      // For now, emit an event that the MarketDataController can listen to
      this.emit('executeJob', job);
      
    } catch (error) {
      logger.error(`Error executing job ${job.jobId}:`, error);
      
      // Mark job as failed
      await this.updateJob(job.jobId, {
        status: this.jobStatuses.FAILED,
        results: {
          ...job.results,
          error: error.message
        },
        completedAt: moment().toISOString()
      });
      
      // Remove from active jobs
      this.activeJobs.delete(job.jobId);
      
      // Emit job failed event
      this.emit('jobFailed', job);
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, results = {}) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      const updatedJob = await this.updateJob(jobId, {
        status: this.jobStatuses.COMPLETED,
        results: {
          ...job.results,
          ...results
        },
        completedAt: moment().toISOString()
      });

      // Remove from active jobs
      this.activeJobs.delete(jobId);
      
      logger.info(`Completed job ${jobId}`);
      
      // Emit job completed event
      this.emit('jobCompleted', updatedJob);
      
      return updatedJob;
    } catch (error) {
      logger.error(`Error completing job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, error, shouldRetry = true) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error(`Job ${jobId} not found`);
      }

      // Check if we should retry
      if (shouldRetry && job.config.retryCount < job.config.maxRetries) {
        job.config.retryCount++;
        job.status = this.jobStatuses.QUEUED;
        job.updatedAt = moment().toISOString();
        
        // Add back to queue
        this.jobQueue.push(job);
        this._sortJobQueue();
        
        await this.updateJob(jobId, job);
        
        logger.info(`Retrying job ${jobId} (attempt ${job.config.retryCount}/${job.config.maxRetries})`);
        
        return job;
      }

      // Mark as permanently failed
      const updatedJob = await this.updateJob(jobId, {
        status: this.jobStatuses.FAILED,
        results: {
          ...job.results,
          error: error.message || error,
          finalRetryCount: job.config.retryCount
        },
        completedAt: moment().toISOString()
      });

      // Remove from active jobs
      this.activeJobs.delete(jobId);
      
      logger.error(`Failed job ${jobId} after ${job.config.retryCount} retries: ${error.message || error}`);
      
      // Emit job failed event
      this.emit('jobFailed', updatedJob);
      
      return updatedJob;
    } catch (err) {
      logger.error(`Error failing job ${jobId}:`, err);
      throw err;
    }
  }

  /**
   * Sort job queue by priority and creation time
   */
  _sortJobQueue() {
    this.jobQueue.sort((a, b) => {
      // First sort by priority (lower number = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      
      // Then sort by creation time (older first)
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  /**
   * Calculate estimated duration for a job
   */
  _calculateEstimatedDuration(jobData) {
    const baseTimePerMarket = 30; // seconds
    const marketCount = jobData.markets ? jobData.markets.length : 1;
    const dataTypeMultiplier = jobData.dataTypes ? jobData.dataTypes.length : 1;
    
    return Math.ceil((marketCount * baseTimePerMarket * dataTypeMultiplier) / 60); // minutes
  }

  /**
   * Persist job to DynamoDB
   */
  async _persistJob(job) {
    try {
      await this.dynamoService.putItem('DataCollectionJobs', {
        PK: `JOB#${job.jobId}`,
        SK: 'METADATA',
        ...job
      });
    } catch (error) {
      logger.error(`Error persisting job ${job.jobId} to DynamoDB:`, error);
      // Don't throw - Redis cache can handle temporary storage
    }
  }

  /**
   * Get job from DynamoDB
   */
  async _getJobFromDynamoDB(jobId) {
    try {
      const result = await this.dynamoService.getItem('DataCollectionJobs', {
        PK: `JOB#${jobId}`,
        SK: 'METADATA'
      });
      
      return result ? result.Item : null;
    } catch (error) {
      logger.error(`Error getting job ${jobId} from DynamoDB:`, error);
      return null;
    }
  }

  /**
   * Start cleanup process for old jobs
   */
  _startCleanupProcess() {
    // Run cleanup every hour
    setInterval(async () => {
      try {
        await this._cleanupOldJobs();
      } catch (error) {
        logger.error('Error in job cleanup process:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    logger.info('Job cleanup process started');
  }

  /**
   * Clean up old completed/failed jobs
   */
  async _cleanupOldJobs() {
    try {
      logger.info('Job cleanup process starting - validating Redis connection');
      
      // Diagnostic logging to validate Redis client state
      logger.info('Redis service state:', {
        redisServiceExists: !!this.redisService,
        redisClientExists: !!this.redisService?.client,
        redisIsConnected: this.redisService?.isConnected,
        redisClientStatus: this.redisService?.client?.status || 'unknown'
      });

      // Check Redis availability before proceeding
      if (!this.redisService || !this.redisService.client || !this.redisService.isConnected) {
        logger.warn('Redis client unavailable during cleanup - skipping job cleanup', {
          redisService: !!this.redisService,
          redisClient: !!this.redisService?.client,
          isConnected: this.redisService?.isConnected
        });
        return;
      }
      
      const cutoffDate = moment().subtract(7, 'days').toISOString();
      
      let jobs;
      try {
        jobs = await this.getJobs({ limit: 1000 });
      } catch (error) {
        logger.error('Error getting jobs during cleanup - aborting cleanup process:', error);
        return;
      }
      
      // Additional validation that jobs were retrieved successfully
      if (!jobs || !jobs.jobs || !Array.isArray(jobs.jobs)) {
        logger.warn('Invalid jobs data returned during cleanup - aborting cleanup process');
        return;
      }
      
      let cleanedCount = 0;
      
      for (const job of jobs.jobs) {
        if (
          (job.status === this.jobStatuses.COMPLETED || job.status === this.jobStatuses.FAILED) &&
          job.completedAt &&
          job.completedAt < cutoffDate
        ) {
          try {
            // Validate Redis client before cleanup operations
            if (!this.redisService || !this.redisService.client) {
              logger.warn('Redis client became unavailable during cleanup - stopping cleanup process');
              break;
            }
            
            // Remove from Redis
            await this.redisService.client.del(`job:${job.jobId}:status`);
            cleanedCount++;
            logger.debug(`Successfully cleaned up job ${job.jobId}`);
          } catch (error) {
            logger.warn(`Error cleaning up job ${job.jobId}:`, error);
            // Continue with next job even if this one fails
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} old jobs`);
      }
    } catch (error) {
      logger.error('Error in job cleanup process:', error);
      
      // Additional error context for debugging
      logger.error('Cleanup error context:', {
        redisServiceExists: !!this.redisService,
        redisClientExists: !!this.redisService?.client,
        redisIsConnected: this.redisService?.isConnected,
        errorMessage: error.message,
        errorStack: error.stack
      });
    }
  }

  /**
   * Shutdown the job manager
   */
  async shutdown() {
    try {
      // Stop job processor
      if (this.jobProcessingInterval) {
        clearInterval(this.jobProcessingInterval);
      }
      
      // Wait for active jobs to complete (with timeout)
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.activeJobs.size > 0 && (Date.now() - startTime) < timeout) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Cancel remaining active jobs
      for (const [jobId] of this.activeJobs) {
        await this.cancelJob(jobId, 'System shutdown');
      }
      
      logger.info('JobManagerService shutdown completed');
    } catch (error) {
      logger.error('Error during JobManagerService shutdown:', error);
    }
  }
}

module.exports = { JobManagerService };