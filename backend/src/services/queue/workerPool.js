/**
 * Worker Pool Management System
 * Manages isolated worker processes for concurrent market processing
 * 
 * Features:
 * - 4 isolated worker pools (25 markets each)
 * - Concurrent batch processing (5 markets per batch, 5 concurrent batches)
 * - Memory management and garbage collection
 * - Circuit breaker pattern for fault tolerance
 * - Progress monitoring and status tracking
 * 
 * Architecture:
 * - Pool 1: Markets 1-25   (worker:pool-1)
 * - Pool 2: Markets 26-50  (worker:pool-2) 
 * - Pool 3: Markets 51-75  (worker:pool-3)
 * - Pool 4: Markets 76-100 (worker:pool-4)
 */

const { Worker } = require('worker_threads');
const path = require('path');
const { logger } = require('../../utils/logger');
const RedisQueueManager = require('./redisQueueManager');

class WorkerPool {
  constructor(options = {}) {
    this.name = 'WorkerPool';
    this.version = '1.0.0';
    
    // Configuration
    this.config = {
      poolCount: options.poolCount || 4,
      marketsPerPool: options.marketsPerPool || 25,
      batchSize: options.batchSize || 5,
      concurrentBatches: options.concurrentBatches || 5,
      workerTimeout: options.workerTimeout || 600000, // 10 minutes
      maxRetries: options.maxRetries || 3,
      memoryThreshold: options.memoryThreshold || 1024 * 1024 * 1024, // 1GB
      ...options
    };
    
    // State management
    this.pools = new Map(); // poolId -> { workers: [], status: 'idle|busy|error' }
    this.activeJobs = new Map(); // jobId -> { poolId, workerId, startTime, markets }
    this.metrics = {
      poolsCreated: 0,
      workersSpawned: 0,
      jobsProcessed: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      totalProcessingTime: 0,
      memoryUsage: 0
    };
    
    // Redis Queue Manager integration
    this.queueManager = new RedisQueueManager();
    
    // Worker script path
    this.workerScript = path.join(__dirname, 'marketWorker.js');
    
    logger.info('WorkerPool initialized', {
      version: this.version,
      config: this.config,
      workerScript: this.workerScript
    });
  }
  
  /**
   * Initialize worker pools
   * Creates 4 isolated worker pools for concurrent processing
   */
  async initialize() {
    try {
      logger.info('Initializing worker pools', {
        poolCount: this.config.poolCount
      });
      
      // Create worker pools
      for (let i = 1; i <= this.config.poolCount; i++) {
        const poolId = `pool-${i}`;
        await this.createPool(poolId);
      }
      
      // Initialize Redis Queue Manager
      await this.queueManager.initialize();
      
      logger.info('Worker pools initialized successfully', {
        poolsCreated: this.pools.size,
        totalWorkers: Array.from(this.pools.values()).reduce((sum, pool) => sum + pool.workers.length, 0)
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize worker pools', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Create a worker pool
   * @param {string} poolId - Pool identifier
   */
  async createPool(poolId) {
    try {
      logger.debug('Creating worker pool', { poolId });
      
      const pool = {
        id: poolId,
        workers: [],
        status: 'idle',
        createdAt: Date.now(),
        processedJobs: 0,
        failedJobs: 0,
        lastActivity: Date.now()
      };
      
      // Create workers for concurrent batches
      for (let i = 0; i < this.config.concurrentBatches; i++) {
        const workerId = `${poolId}-worker-${i + 1}`;
        const worker = await this.createWorker(workerId, poolId);
        pool.workers.push(worker);
      }
      
      this.pools.set(poolId, pool);
      this.metrics.poolsCreated++;
      
      logger.debug('Worker pool created', {
        poolId,
        workerCount: pool.workers.length,
        status: pool.status
      });
      
      return pool;
    } catch (error) {
      logger.error('Failed to create worker pool', {
        poolId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Create a worker thread
   * @param {string} workerId - Worker identifier
   * @param {string} poolId - Pool identifier
   */
  async createWorker(workerId, poolId) {
    try {
      const worker = new Worker(this.workerScript, {
        workerData: {
          workerId,
          poolId,
          config: this.config
        }
      });
      
      // Worker event handlers
      worker.on('message', (message) => {
        this.handleWorkerMessage(workerId, poolId, message);
      });
      
      worker.on('error', (error) => {
        this.handleWorkerError(workerId, poolId, error);
      });
      
      worker.on('exit', (code) => {
        this.handleWorkerExit(workerId, poolId, code);
      });
      
      const workerInfo = {
        id: workerId,
        poolId,
        worker,
        status: 'idle',
        createdAt: Date.now(),
        processedJobs: 0,
        currentJob: null,
        lastActivity: Date.now()
      };
      
      this.metrics.workersSpawned++;
      
      logger.debug('Worker created', {
        workerId,
        poolId,
        threadId: worker.threadId
      });
      
      return workerInfo;
    } catch (error) {
      logger.error('Failed to create worker', {
        workerId,
        poolId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Process markets using worker pools
   * @param {string} jobId - Job identifier
   * @param {Array} markets - Markets to process
   * @param {Object} jobData - Job configuration and data
   */
  async processMarkets(jobId, markets, jobData) {
    try {
      logger.info('Starting market processing', {
        jobId,
        marketCount: markets.length,
        poolCount: this.config.poolCount
      });
      
      // Distribute markets to Redis queues
      const distributionResult = await this.queueManager.distributeJob(jobId, markets, jobData);
      
      logger.info('Markets distributed to queues', {
        jobId,
        distributionResult
      });
      
      // Start processing on all pools
      const processingPromises = [];
      for (const [poolId, pool] of this.pools) {
        const promise = this.processPoolQueue(poolId, jobId);
        processingPromises.push(promise);
      }
      
      // Wait for all pools to complete
      const results = await Promise.allSettled(processingPromises);
      
      // Aggregate results
      const aggregatedResult = this.aggregateResults(jobId, results);
      
      logger.info('Market processing completed', {
        jobId,
        aggregatedResult
      });
      
      return aggregatedResult;
    } catch (error) {
      logger.error('Failed to process markets', {
        jobId,
        marketCount: markets.length,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Process queue for a specific pool
   * @param {string} poolId - Pool identifier
   * @param {string} jobId - Job identifier
   */
  async processPoolQueue(poolId, jobId) {
    try {
      const pool = this.pools.get(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      
      logger.debug('Starting pool queue processing', { poolId, jobId });
      
      pool.status = 'busy';
      pool.lastActivity = Date.now();
      
      // Process jobs from Redis queue
      const queueName = `worker:${poolId}`;
      let processedCount = 0;
      let completedCount = 0;
      let failedCount = 0;
      
      while (true) {
        // Get next job from queue
        const job = await this.queueManager.getNextJob(queueName);
        if (!job) {
          logger.debug('No more jobs in queue', { poolId, queueName });
          break;
        }
        
        // Find available worker
        const availableWorker = pool.workers.find(w => w.status === 'idle');
        if (!availableWorker) {
          // All workers busy, wait and retry
          await this.sleep(1000);
          continue;
        }
        
        // Assign job to worker
        const result = await this.assignJobToWorker(availableWorker, job);
        processedCount++;
        
        if (result.success) {
          completedCount++;
        } else {
          failedCount++;
        }
        
        // Update pool metrics
        pool.processedJobs++;
        pool.lastActivity = Date.now();
        
        // Memory management
        await this.checkMemoryUsage();
      }
      
      pool.status = 'idle';
      
      const result = {
        poolId,
        processedCount,
        completedCount,
        failedCount,
        duration: Date.now() - pool.lastActivity
      };
      
      logger.debug('Pool queue processing completed', result);
      
      return result;
    } catch (error) {
      const pool = this.pools.get(poolId);
      if (pool) {
        pool.status = 'error';
      }
      
      logger.error('Failed to process pool queue', {
        poolId,
        jobId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Assign job to worker
   * @param {Object} worker - Worker information
   * @param {Object} job - Job data
   */
  async assignJobToWorker(worker, job) {
    try {
      worker.status = 'busy';
      worker.currentJob = job;
      worker.lastActivity = Date.now();
      
      // Send job to worker
      const message = {
        type: 'process_markets',
        jobId: job.jobId,
        markets: job.markets,
        jobData: job.jobData,
        timestamp: Date.now()
      };
      
      worker.worker.postMessage(message);
      
      // Wait for worker completion (with timeout)
      const result = await this.waitForWorkerCompletion(worker, this.config.workerTimeout);
      
      worker.status = 'idle';
      worker.currentJob = null;
      worker.processedJobs++;
      worker.lastActivity = Date.now();
      
      this.metrics.jobsProcessed++;
      if (result.success) {
        this.metrics.jobsCompleted++;
      } else {
        this.metrics.jobsFailed++;
      }
      
      return result;
    } catch (error) {
      worker.status = 'error';
      worker.currentJob = null;
      
      logger.error('Failed to assign job to worker', {
        workerId: worker.id,
        jobId: job.jobId,
        error: error.message
      });
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Wait for worker completion
   * @param {Object} worker - Worker information
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForWorkerCompletion(worker, timeout) {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: 'Worker timeout' });
      }, timeout);
      
      const messageHandler = (message) => {
        if (message.type === 'job_completed' || message.type === 'job_failed') {
          clearTimeout(timeoutId);
          worker.worker.off('message', messageHandler);
          resolve({
            success: message.type === 'job_completed',
            result: message.result,
            error: message.error
          });
        }
      };
      
      worker.worker.on('message', messageHandler);
    });
  }
  
  /**
   * Handle worker message
   * @param {string} workerId - Worker identifier
   * @param {string} poolId - Pool identifier
   * @param {Object} message - Message from worker
   */
  handleWorkerMessage(workerId, poolId, message) {
    logger.debug('Worker message received', {
      workerId,
      poolId,
      messageType: message.type
    });
    
    // Update job status in Redis
    if (message.jobId) {
      this.queueManager.updateJobStatus(message.jobId, {
        status: message.type === 'job_completed' ? 'completed' : 
                message.type === 'job_failed' ? 'failed' : 'processing',
        progress: message.progress || 0,
        result: message.result,
        error: message.error,
        updatedAt: Date.now()
      });
    }
  }
  
  /**
   * Handle worker error
   * @param {string} workerId - Worker identifier
   * @param {string} poolId - Pool identifier
   * @param {Error} error - Worker error
   */
  handleWorkerError(workerId, poolId, error) {
    logger.error('Worker error', {
      workerId,
      poolId,
      error: error.message,
      stack: error.stack
    });
    
    // Mark worker as failed and restart if necessary
    const pool = this.pools.get(poolId);
    if (pool) {
      const worker = pool.workers.find(w => w.id === workerId);
      if (worker) {
        worker.status = 'error';
        // Restart worker logic could be added here
      }
    }
  }
  
  /**
   * Handle worker exit
   * @param {string} workerId - Worker identifier
   * @param {string} poolId - Pool identifier
   * @param {number} code - Exit code
   */
  handleWorkerExit(workerId, poolId, code) {
    logger.info('Worker exited', {
      workerId,
      poolId,
      exitCode: code
    });
    
    // Clean up worker references
    const pool = this.pools.get(poolId);
    if (pool) {
      pool.workers = pool.workers.filter(w => w.id !== workerId);
    }
  }
  
  /**
   * Aggregate results from all pools
   * @param {string} jobId - Job identifier
   * @param {Array} results - Results from all pools
   */
  aggregateResults(jobId, results) {
    const aggregated = {
      jobId,
      totalPools: results.length,
      successfulPools: 0,
      failedPools: 0,
      totalProcessed: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalDuration: 0,
      poolResults: []
    };
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        aggregated.successfulPools++;
        aggregated.totalProcessed += result.value.processedCount || 0;
        aggregated.totalCompleted += result.value.completedCount || 0;
        aggregated.totalFailed += result.value.failedCount || 0;
        aggregated.totalDuration = Math.max(aggregated.totalDuration, result.value.duration || 0);
        aggregated.poolResults.push(result.value);
      } else {
        aggregated.failedPools++;
        aggregated.poolResults.push({
          poolId: `pool-${index + 1}`,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });
    
    return aggregated;
  }
  
  /**
   * Check memory usage and trigger garbage collection if needed
   */
  async checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = memUsage.heapUsed;
    
    if (memUsage.heapUsed > this.config.memoryThreshold) {
      logger.warn('High memory usage detected, triggering garbage collection', {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        threshold: Math.round(this.config.memoryThreshold / 1024 / 1024) + 'MB'
      });
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  /**
   * Get worker pool status
   */
  getStatus() {
    const status = {
      pools: {},
      metrics: this.metrics,
      config: this.config
    };
    
    for (const [poolId, pool] of this.pools) {
      status.pools[poolId] = {
        id: pool.id,
        status: pool.status,
        workerCount: pool.workers.length,
        processedJobs: pool.processedJobs,
        failedJobs: pool.failedJobs,
        lastActivity: pool.lastActivity,
        workers: pool.workers.map(w => ({
          id: w.id,
          status: w.status,
          processedJobs: w.processedJobs,
          currentJob: w.currentJob?.jobId || null,
          lastActivity: w.lastActivity
        }))
      };
    }
    
    return status;
  }
  
  /**
   * Shutdown worker pools
   */
  async shutdown() {
    try {
      logger.info('Shutting down worker pools');
      
      // Terminate all workers
      for (const [poolId, pool] of this.pools) {
        for (const worker of pool.workers) {
          await worker.worker.terminate();
        }
      }
      
      // Clear pools
      this.pools.clear();
      
      // Shutdown queue manager
      await this.queueManager.shutdown();
      
      logger.info('Worker pools shutdown completed');
    } catch (error) {
      logger.error('Error during worker pool shutdown', {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Utility method to sleep
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = WorkerPool;