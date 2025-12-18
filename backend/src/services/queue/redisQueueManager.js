const Redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

/**
 * Redis Queue Manager for 100-Market Concurrent Processing
 * 
 * Manages job distribution across worker pools, status tracking,
 * and provides intelligent queue management for scaling to 100 markets.
 * 
 * Architecture:
 * - 4 Worker Pools (25 markets each)
 * - Redis-based job queues
 * - Comprehensive status tracking
 * - Memory management and cleanup
 */
class RedisQueueManager {
  constructor(config = {}) {
    this.config = {
      // Redis Configuration
      redis: {
        host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
        port: config.redis?.port || process.env.REDIS_PORT || 6379,
        db: config.redis?.db || process.env.REDIS_DB || 0,
        password: config.redis?.password || process.env.REDIS_PASSWORD,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      },
      
      // Queue Configuration
      queue: {
        workerPools: config.queue?.workerPools || 4,
        marketsPerPool: config.queue?.marketsPerPool || 25,
        concurrentBatchSize: config.queue?.concurrentBatchSize || 5,
        maxConcurrentBatches: config.queue?.maxConcurrentBatches || 5,
        jobTimeout: config.queue?.jobTimeout || 360000, // 6 minutes
        retryAttempts: config.queue?.retryAttempts || 3,
        retryDelayMs: config.queue?.retryDelayMs || 5000,
        jobTTL: config.queue?.jobTTL || 86400 // 24 hours
      }
    };

    this.redis = null;
    this.connected = false;
    
    // Performance metrics
    this.metrics = {
      jobsDistributed: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0
    };

    logger.info('RedisQueueManager initialized', {
      workerPools: this.config.queue.workerPools,
      marketsPerPool: this.config.queue.marketsPerPool,
      redisHost: this.config.redis.host,
      redisPort: this.config.redis.port
    });
  }

  /**
   * Connect to Redis server
   */
  async connect() {
    try {
      if (this.connected) {
        return;
      }

      this.redis = Redis.createClient(this.config.redis);
      
      this.redis.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected successfully');
      });

      this.redis.on('ready', () => {
        logger.info('Redis ready for operations');
        this.connected = true;
      });

      await this.redis.connect();
      
      // Test connection
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      logger.info('Redis Queue Manager connected and ready');
      
    } catch (error) {
      logger.error('Failed to connect to Redis', { error: error.message });
      throw error;
    }
  }

  /**
   * Disconnect from Redis server
   */
  async disconnect() {
    try {
      if (this.redis && this.connected) {
        await this.redis.disconnect();
        this.connected = false;
        logger.info('Redis Queue Manager disconnected');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error: error.message });
    }
  }

  /**
   * Distribute job across worker pools
   * 
   * @param {string} jobId - Unique job identifier
   * @param {Array} markets - Array of market names to process
   * @returns {Array} Array of worker job objects
   */
  async distributeJob(jobId, markets) {
    try {
      // Validate parameters
      if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
        throw new Error('Invalid job parameters: jobId is required');
      }
      
      if (!Array.isArray(markets) || markets.length === 0) {
        throw new Error('No markets provided');
      }

      logger.info('Distributing job across worker pools', {
        jobId,
        totalMarkets: markets.length,
        workerPools: this.config.queue.workerPools
      });

      // Create worker jobs by distributing markets
      const workerJobs = this._createWorkerJobs(jobId, markets);
      
      // Initialize job status
      await this.initializeJobStatus(jobId, markets.length);
      
      // Push jobs to Redis queues
      const pushPromises = workerJobs.map(async (workerJob) => {
        const queueKey = `worker:${workerJob.poolId}`;
        const jobData = JSON.stringify(workerJob);
        
        await this.redis.lpush(queueKey, jobData);
        
        logger.debug('Worker job queued', {
          jobId,
          poolId: workerJob.poolId,
          marketCount: workerJob.markets.length
        });
      });

      await Promise.all(pushPromises);
      
      // Update metrics
      this.metrics.jobsDistributed++;
      
      logger.info('Job distribution completed', {
        jobId,
        workerJobsCreated: workerJobs.length,
        totalMarkets: markets.length
      });

      return workerJobs.map(job => job.poolId);
      
    } catch (error) {
      logger.error('Failed to distribute job', {
        jobId,
        error: error.message,
        marketCount: markets?.length || 0
      });
      throw error;
    }
  }

  /**
   * Create worker jobs by distributing markets across pools
   * 
   * @private
   * @param {string} jobId - Job identifier
   * @param {Array} markets - Markets to distribute
   * @returns {Array} Worker job objects
   */
  _createWorkerJobs(jobId, markets) {
    const workerJobs = [];
    const marketsPerPool = Math.ceil(markets.length / this.config.queue.workerPools);
    
    for (let i = 0; i < this.config.queue.workerPools; i++) {
      const startIndex = i * marketsPerPool;
      const endIndex = Math.min(startIndex + marketsPerPool, markets.length);
      const poolMarkets = markets.slice(startIndex, endIndex);
      
      if (poolMarkets.length > 0) {
        workerJobs.push({
          jobId,
          poolId: `pool-${i}`,
          markets: poolMarkets,
          createdAt: new Date(),
          status: 'pending',
          retryCount: 0,
          timeout: this.config.queue.jobTimeout
        });
      }
    }
    
    return workerJobs;
  }

  /**
   * Initialize job status tracking
   * 
   * @param {string} jobId - Job identifier
   * @param {number} totalMarkets - Total number of markets
   */
  async initializeJobStatus(jobId, totalMarkets) {
    try {
      const statusKey = `job:${jobId}:status`;
      const statusData = {
        total: totalMarkets.toString(),
        completed: '0',
        failed: '0',
        status: 'running',
        createdAt: new Date().toISOString(),
        startTime: Date.now().toString()
      };

      await this.redis.hset(statusKey, statusData);
      
      // Set TTL for automatic cleanup
      await this.redis.expire(statusKey, this.config.queue.jobTTL);
      
      logger.debug('Job status initialized', {
        jobId,
        totalMarkets,
        statusKey
      });
      
    } catch (error) {
      logger.error('Failed to initialize job status', {
        jobId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update job progress
   * 
   * @param {string} jobId - Job identifier
   * @param {string} field - Field to update (completed, failed)
   * @param {number} value - New value
   */
  async updateJobProgress(jobId, field, value) {
    try {
      const statusKey = `job:${jobId}:status`;
      await this.redis.hset(statusKey, field, value.toString());
      
      logger.debug('Job progress updated', {
        jobId,
        field,
        value
      });
      
    } catch (error) {
      logger.error('Failed to update job progress', {
        jobId,
        field,
        value,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get job status
   * 
   * @param {string} jobId - Job identifier
   * @returns {Object} Job status object
   */
  async getJobStatus(jobId) {
    try {
      const statusKey = `job:${jobId}:status`;
      const status = await this.redis.hgetall(statusKey);
      
      if (!status || Object.keys(status).length === 0) {
        return null;
      }
      
      const total = parseInt(status.total || '0', 10);
      const completed = parseInt(status.completed || '0', 10);
      const failed = parseInt(status.failed || '0', 10);
      
      return {
        total,
        completed,
        failed,
        status: status.status || 'unknown',
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        createdAt: status.createdAt,
        startTime: status.startTime ? parseInt(status.startTime, 10) : null,
        completedAt: status.completedAt,
        error: status.error
      };
      
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get next job from worker pool queue
   * 
   * @param {string} poolId - Worker pool identifier
   * @returns {Object|null} Next job or null if queue is empty
   */
  async getNextJob(poolId) {
    try {
      const queueKey = `worker:${poolId}`;
      const jobData = await this.redis.rpop(queueKey);
      
      if (!jobData) {
        return null;
      }
      
      const job = JSON.parse(jobData);
      
      logger.debug('Job retrieved from queue', {
        poolId,
        jobId: job.jobId,
        marketCount: job.markets?.length || 0
      });
      
      return job;
      
    } catch (error) {
      logger.error('Failed to get next job', {
        poolId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get queue length for a worker pool
   * 
   * @param {string} poolId - Worker pool identifier
   * @returns {number} Queue length
   */
  async getQueueLength(poolId) {
    try {
      const queueKey = `worker:${poolId}`;
      return await this.redis.llen(queueKey);
    } catch (error) {
      logger.error('Failed to get queue length', {
        poolId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all queue lengths
   * 
   * @returns {Object} Object with pool IDs as keys and lengths as values
   */
  async getAllQueueLengths() {
    try {
      const lengths = {};
      
      for (let i = 0; i < this.config.queue.workerPools; i++) {
        const poolId = `pool-${i}`;
        lengths[poolId] = await this.getQueueLength(poolId);
      }
      
      return lengths;
      
    } catch (error) {
      logger.error('Failed to get all queue lengths', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark job as completed
   * 
   * @param {string} jobId - Job identifier
   */
  async completeJob(jobId) {
    try {
      const statusKey = `job:${jobId}:status`;
      const completionData = {
        status: 'completed',
        completedAt: new Date().toISOString(),
        endTime: Date.now().toString()
      };

      await this.redis.hset(statusKey, completionData);
      
      // Update metrics
      this.metrics.jobsCompleted++;
      
      logger.info('Job marked as completed', { jobId });
      
    } catch (error) {
      logger.error('Failed to complete job', {
        jobId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark job as failed
   * 
   * @param {string} jobId - Job identifier
   * @param {Error} error - Error that caused the failure
   */
  async failJob(jobId, error) {
    try {
      const statusKey = `job:${jobId}:status`;
      const failureData = {
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString(),
        endTime: Date.now().toString()
      };

      await this.redis.hset(statusKey, failureData);
      
      // Update metrics
      this.metrics.jobsFailed++;
      
      logger.error('Job marked as failed', {
        jobId,
        error: error.message
      });
      
    } catch (redisError) {
      logger.error('Failed to mark job as failed', {
        jobId,
        originalError: error.message,
        redisError: redisError.message
      });
      throw redisError;
    }
  }

  /**
   * Cleanup job data
   * 
   * @param {string} jobId - Job identifier
   */
  async cleanupJob(jobId) {
    try {
      const pattern = `job:${jobId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(keys);
        logger.debug('Job data cleaned up', {
          jobId,
          keysDeleted: keys.length
        });
      }
      
    } catch (error) {
      logger.error('Failed to cleanup job', {
        jobId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get system health metrics
   * 
   * @returns {Object} System health information
   */
  async getSystemHealth() {
    try {
      const queueLengths = await this.getAllQueueLengths();
      const totalQueuedJobs = Object.values(queueLengths).reduce((sum, length) => sum + length, 0);
      const averageQueueLength = totalQueuedJobs / this.config.queue.workerPools;
      
      return {
        status: this.connected ? 'healthy' : 'disconnected',
        connected: this.connected,
        totalQueuedJobs,
        workerPools: this.config.queue.workerPools,
        averageQueueLength,
        queueLengths,
        metrics: this.metrics,
        config: {
          workerPools: this.config.queue.workerPools,
          marketsPerPool: this.config.queue.marketsPerPool,
          concurrentBatchSize: this.config.queue.concurrentBatchSize
        }
      };
      
    } catch (error) {
      logger.error('Failed to get system health', {
        error: error.message
      });
      
      return {
        status: 'error',
        connected: this.connected,
        error: error.message
      };
    }
  }

  /**
   * Cleanup expired jobs
   * 
   * @returns {number} Number of jobs cleaned up
   */
  async cleanupExpiredJobs() {
    try {
      const pattern = 'job:*:status';
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;
      
      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // No TTL set, check if expired manually
          const status = await this.redis.hgetall(key);
          const createdAt = new Date(status.createdAt);
          const now = new Date();
          const ageHours = (now - createdAt) / (1000 * 60 * 60);
          
          if (ageHours > 24) { // Older than 24 hours
            const jobId = key.split(':')[1];
            await this.cleanupJob(jobId);
            cleanedCount++;
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info('Expired jobs cleaned up', { cleanedCount });
      }
      
      return cleanedCount;
      
    } catch (error) {
      logger.error('Failed to cleanup expired jobs', {
        error: error.message
      });
      return 0;
    }
  }

  /**
   * Get performance metrics
   * 
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.jobsDistributed > 0 
        ? ((this.metrics.jobsCompleted / this.metrics.jobsDistributed) * 100).toFixed(2)
        : 0,
      failureRate: this.metrics.jobsDistributed > 0
        ? ((this.metrics.jobsFailed / this.metrics.jobsDistributed) * 100).toFixed(2)
        : 0
    };
  }
}

module.exports = RedisQueueManager;