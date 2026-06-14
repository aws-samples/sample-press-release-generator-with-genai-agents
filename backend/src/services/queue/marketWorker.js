/**
 * Market Worker Thread
 * Handles market processing in isolated worker threads
 * 
 * Features:
 * - Isolated processing environment for concurrent market processing
 * - Integration with GenAI Orchestrator for content generation
 * - Memory management and garbage collection
 * - Error handling and recovery
 * - Progress reporting to main thread
 * 
 * "Worker Data":
 * - workerId: Unique worker identifier
 * - poolId: Pool identifier (pool-1, pool-2, etc.)
 * - config: Worker configuration
 */

const { parentPort, workerData } = require('worker_threads');
const { logger } = require('../../utils/logger');
const GenAIOrchestrator = require('../genaiOrchestrator');

class MarketWorker {
  constructor(workerData) {
    this.workerId = workerData.workerId;
    this.poolId = workerData.poolId;
    this.config = workerData.config;
    this.name = `MarketWorker-${this.workerId}`;
    this.version = '1.0.0';
    
    // Initialize GenAI Orchestrator
    this.genaiOrchestrator = new GenAIOrchestrator();
    
    // Worker state
    this.currentJob = null;
    this.processedJobs = 0;
    this.startTime = Date.now();
    
    logger.info('Market worker initialized', {
      workerId: this.workerId,
      poolId: this.poolId,
      version: this.version,
      config: this.config
    });
  }
  
  /**
   * Start worker message listener
   */
  start() {
    if (!parentPort) {
      throw new Error('Worker must be run in worker thread');
    }
    
    parentPort.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error('Worker message handling error', {
          workerId: this.workerId,
          error: error.message,
          stack: error.stack
        });
        
        this.sendMessage({
          type: 'job_failed',
          jobId: message.jobId,
          error: error.message,
          workerId: this.workerId
        });
      }
    });
    
    // Send ready signal
    this.sendMessage({
      type: 'worker_ready',
      workerId: this.workerId,
      poolId: this.poolId
    });
    
    logger.info('Market worker started and ready', {
      workerId: this.workerId,
      poolId: this.poolId
    });
  }
  
  /**
   * Handle message from main thread
   * @param {Object} message - Message from main thread
   */
  async handleMessage(message) {
    logger.debug('Worker received message', {
      workerId: this.workerId,
      messageType: message.type,
      jobId: message.jobId
    });
    
    switch (message.type) {
      case 'process_markets':
        await this.processMarkets(message);
        break;
        
      case 'health_check':
        this.sendHealthCheck();
        break;
        
      case 'shutdown':
        await this.shutdown();
        break;
        
      default:
        logger.warn('Unknown message type', {
          workerId: this.workerId,
          messageType: message.type
        });
    }
  }
  
  /**
   * Process markets for a job
   * @param {Object} message - Job message
   */
  async processMarkets(message) {
    const { jobId, markets, jobData } = message;
    
    try {
      logger.info('Starting market processing', {
        workerId: this.workerId,
        jobId,
        marketCount: markets.length
      });
      
      this.currentJob = {
        jobId,
        markets,
        startTime: Date.now(),
        progress: 0
      };
      
      // Send job started message
      this.sendMessage({
        type: 'job_started',
        jobId,
        workerId: this.workerId,
        marketCount: markets.length
      });
      
      // Process markets in batches
      const batchSize = this.config.batchSize || 5;
      const results = [];
      
      for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        
        logger.debug('Processing market batch', {
          workerId: this.workerId,
          jobId,
          batchIndex: Math.floor(i / batchSize) + 1,
          batchSize: batch.length,
          markets: batch
        });
        
        // Process batch
        const batchResults = await this.processBatch(jobId, batch, jobData);
        results.push(...batchResults);
        
        // Update progress
        const progress = Math.round(((i + batch.length) / markets.length) * 100);
        this.currentJob.progress = progress;
        
        // Send progress update
        this.sendMessage({
          type: 'job_progress',
          jobId,
          workerId: this.workerId,
          progress,
          processedCount: i + batch.length,
          totalCount: markets.length
        });
        
        // Memory management
        await this.checkMemoryUsage();
      }
      
      // Job completed
      const jobStartTime = this.currentJob.startTime;
      this.currentJob = null;
      this.processedJobs++;
      
      const result = {
        jobId,
        workerId: this.workerId,
        processedMarkets: results.length,
        successfulMarkets: results.filter(r => r.success).length,
        failedMarkets: results.filter(r => !r.success).length,
        duration: Date.now() - jobStartTime,
        results
      };
      
      logger.info('Market processing completed', result);
      
      this.sendMessage({
        type: 'job_completed',
        jobId,
        workerId: this.workerId,
        result
      });
      
    } catch (error) {
      logger.error('Market processing failed', {
        workerId: this.workerId,
        jobId,
        error: error.message,
        stack: error.stack
      });
      
      this.currentJob = null;
      
      this.sendMessage({
        type: 'job_failed',
        jobId,
        workerId: this.workerId,
        error: error.message
      });
    }
  }
  
  /**
   * Process a batch of markets
   * @param {string} jobId - Job identifier
   * @param {Array} markets - Markets to process
   * @param {Object} jobData - Job configuration and data
   */
  async processBatch(jobId, markets, jobData) {
    const results = [];
    
    // Process markets concurrently within batch
    const promises = markets.map(async (market) => {
      const marketStartTime = Date.now();
      
      try {
        logger.debug('Processing market', {
          workerId: this.workerId,
          jobId,
          market
        });
        
        // Create market-specific job data
        const marketJobData = {
          ...jobData,
          markets: [market], // Single market for this worker
          jobId: `${jobId}_${market.replace(/[^a-zA-Z0-9]/g, '_')}`
        };
        
        // Process market using GenAI Orchestrator
        const result = await this.genaiOrchestrator.generateContent(marketJobData);
        
        logger.debug('Market processing completed', {
          workerId: this.workerId,
          jobId,
          market,
          success: true,
          duration: Date.now() - marketStartTime
        });
        
        return {
          market,
          success: true,
          result,
          duration: Date.now() - marketStartTime
        };
        
      } catch (error) {
        logger.error('Market processing failed', {
          workerId: this.workerId,
          jobId,
          market,
          error: error.message,
          duration: Date.now() - marketStartTime
        });
        
        return {
          market,
          success: false,
          error: error.message,
          duration: Date.now() - marketStartTime
        };
      }
    });
    
    // Wait for all markets in batch to complete
    const batchResults = await Promise.allSettled(promises);
    
    // Process results
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          market: markets[index],
          success: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });
    
    return results;
  }
  
  /**
   * Send health check response
   */
  sendHealthCheck() {
    const healthData = {
      type: 'health_response',
      workerId: this.workerId,
      poolId: this.poolId,
      status: 'healthy',
      uptime: Date.now() - this.startTime,
      processedJobs: this.processedJobs,
      currentJob: this.currentJob ? {
        jobId: this.currentJob.jobId,
        progress: this.currentJob.progress,
        duration: Date.now() - this.currentJob.startTime
      } : null,
      memoryUsage: process.memoryUsage()
    };
    
    this.sendMessage(healthData);
  }
  
  /**
   * Check memory usage and trigger garbage collection if needed
   */
  async checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const threshold = this.config.memoryThreshold || 512 * 1024 * 1024; // 512MB default for worker
    
    if (memUsage.heapUsed > threshold) {
      logger.warn('Worker high memory usage detected', {
        workerId: this.workerId,
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        threshold: Math.round(threshold / 1024 / 1024) + 'MB'
      });
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
        logger.debug('Garbage collection triggered', {
          workerId: this.workerId
        });
      }
    }
  }
  
  /**
   * Send message to main thread
   * @param {Object} message - Message to send
   */
  sendMessage(message) {
    if (parentPort) {
      parentPort.postMessage({
        ...message,
        timestamp: Date.now(),
        workerId: this.workerId
      });
    }
  }
  
  /**
   * Shutdown worker
   */
  async shutdown() {
    try {
      logger.info('Worker shutting down', {
        workerId: this.workerId,
        processedJobs: this.processedJobs,
        uptime: Date.now() - this.startTime
      });
      
      // Cancel current job if any
      if (this.currentJob) {
        this.sendMessage({
          type: 'job_cancelled',
          jobId: this.currentJob.jobId,
          workerId: this.workerId,
          reason: 'Worker shutdown'
        });
      }
      
      // Send shutdown complete
      this.sendMessage({
        type: 'worker_shutdown',
        workerId: this.workerId
      });
      
      // Exit process
      process.exit(0);
      
    } catch (error) {
      logger.error('Worker shutdown error', {
        workerId: this.workerId,
        error: error.message
      });
      process.exit(1);
    }
  }
}

// Initialize and start worker if running in worker thread
if (workerData) {
  const worker = new MarketWorker(workerData);
  worker.start();
} else {
  // Export for testing
  module.exports = MarketWorker;
}