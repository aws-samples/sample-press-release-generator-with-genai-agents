const { logger } = require('../../utils/logger');

/**
 * Circuit Breaker for Fact-Checking Service
 * Provides fault tolerance and prevents cascading failures
 * Features:
 * - Job-specific retry tracking
 * - Exponential backoff delays
 * - Configurable thresholds and windows
 * - State management (closed, open, half-open)
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = 'Circuit Breaker';
    
    // Configuration with defaults - ENHANCED: More lenient thresholds for quality focus
    this.config = {
      maxRetries: options.maxRetries || 5, // Increased from 3 to 5
      timeWindow: options.timeWindow || 300000, // 5 minutes
      halfOpenRetryDelay: options.halfOpenRetryDelay || 30000, // 30 seconds
      baseDelay: options.baseDelay || 1000, // 1 second
      maxDelay: options.maxDelay || 30000, // 30 seconds
      jitterFactor: options.jitterFactor || 0.1,
      
      // Quality-focused thresholds
      failureThreshold: options.failureThreshold || 0.7, // 70% failure rate
      minRequestsForEvaluation: options.minRequestsForEvaluation || 3,
      
      // Recovery settings
      successThreshold: options.successThreshold || 2, // Consecutive successes needed
      degradationThreshold: options.degradationThreshold || 0.5 // 50% for degraded mode
    };
    
    // State tracking
    this.jobStates = new Map(); // jobId -> state info
    this.globalStats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastReset: Date.now()
    };
    
    logger.info('Circuit Breaker initialized', {
      version: '1.0.0',
      config: this.config
    });
  }

  /**
   * Check if a retry should be allowed for a specific job
   */
  shouldAllowRetry(jobId) {
    const jobState = this.getJobState(jobId);
    const now = Date.now();
    
    // Check if we've exceeded max retries
    if (jobState.attempts >= this.config.maxRetries) {
      return {
        allowed: false,
        reason: 'max_retries_exceeded',
        nextRetryAt: null,
        attempts: jobState.attempts,
        maxRetries: this.config.maxRetries
      };
    }
    
    // Check if we're in a backoff period
    if (jobState.nextRetryTime && now < jobState.nextRetryTime) {
      return {
        allowed: false,
        reason: 'backoff_period',
        nextRetryAt: jobState.nextRetryTime,
        remainingMs: jobState.nextRetryTime - now
      };
    }
    
    // Check circuit state
    const circuitState = this.getCircuitState(jobId);
    if (circuitState === 'open') {
      return {
        allowed: false,
        reason: 'circuit_open',
        nextRetryAt: jobState.nextRetryTime,
        circuitState
      };
    }
    
    return {
      allowed: true,
      reason: 'retry_allowed',
      attempts: jobState.attempts,
      circuitState
    };
  }

  /**
   * Record a failure for a specific job
   */
  recordFailure(jobId, error = null) {
    const jobState = this.getJobState(jobId);
    const now = Date.now();
    
    jobState.attempts += 1;
    jobState.failures += 1;
    jobState.lastFailure = now;
    jobState.consecutiveFailures += 1;
    jobState.consecutiveSuccesses = 0;
    
    // Add error details
    if (error) {
      jobState.lastError = {
        message: error.message,
        type: error.constructor.name,
        timestamp: now
      };
      
      // Track specific error types
      if (error.message && error.message.includes('JSON')) {
        jobState.jsonParsingFailures += 1;
      }
    }
    
    // Calculate next retry time with exponential backoff
    const backoffDelay = this._getBackoffDelay(jobState.attempts);
    jobState.nextRetryTime = now + backoffDelay;
    
    // Update global stats
    this.globalStats.totalRequests += 1;
    this.globalStats.totalFailures += 1;
    
    // Check if circuit should open
    this._evaluateCircuitState(jobId);
    
    logger.warn('Circuit breaker recorded failure', {
      jobId,
      attempts: jobState.attempts,
      maxRetries: this.config.maxRetries,
      nextRetryIn: backoffDelay,
      circuitState: this.getCircuitState(jobId),
      error: error ? error.message : 'Unknown error'
    });
    
    return {
      attempts: jobState.attempts,
      nextRetryTime: jobState.nextRetryTime,
      circuitState: this.getCircuitState(jobId)
    };
  }

  /**
   * Record a success for a specific job
   */
  recordSuccess(jobId) {
    const jobState = this.getJobState(jobId);
    const now = Date.now();
    
    jobState.successes += 1;
    jobState.lastSuccess = now;
    jobState.consecutiveSuccesses += 1;
    jobState.consecutiveFailures = 0;
    
    // Update global stats
    this.globalStats.totalRequests += 1;
    this.globalStats.totalSuccesses += 1;
    
    // Check if circuit should close
    this._evaluateCircuitState(jobId);
    
    logger.info('Circuit breaker recorded success', {
      jobId,
      consecutiveSuccesses: jobState.consecutiveSuccesses,
      circuitState: this.getCircuitState(jobId)
    });
    
    return {
      consecutiveSuccesses: jobState.consecutiveSuccesses,
      circuitState: this.getCircuitState(jobId)
    };
  }

  /**
   * Record an attempt for a specific job with success/failure status
   * This method is called by external services to track operation attempts
   */
  recordAttempt(jobId, success, metadata = {}) {
    const now = Date.now();
    
    if (success) {
      return this.recordSuccess(jobId);
    } else {
      // Create error object from metadata if provided
      const error = metadata.error || new Error(metadata.message || 'Operation failed');
      return this.recordFailure(jobId, error);
    }
  }

  /**
   * Get the current state of a job
   */
  getJobState(jobId) {
    if (!this.jobStates.has(jobId)) {
      this.jobStates.set(jobId, {
        attempts: 0,
        failures: 0,
        successes: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        jsonParsingFailures: 0,
        lastFailure: null,
        lastSuccess: null,
        lastError: null,
        nextRetryTime: null,
        circuitState: 'closed',
        createdAt: Date.now()
      });
    }
    return this.jobStates.get(jobId);
  }

  /**
   * Get the circuit state for a job
   */
  getCircuitState(jobId) {
    const jobState = this.getJobState(jobId);
    return jobState.circuitState;
  }

  /**
   * Reset circuit breaker state for a job
   */
  reset(jobId) {
    if (jobId) {
      // Reset specific job
      this.jobStates.delete(jobId);
      logger.info('Circuit breaker reset for job', { jobId });
      return 1;
    } else {
      // Reset all jobs
      const resetCount = this.jobStates.size;
      this.jobStates.clear();
      this.globalStats = {
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        lastReset: Date.now()
      };
      logger.info('Circuit breaker reset for all jobs', { resetCount });
      return resetCount;
    }
  }

  /**
   * EMERGENCY: Allow bypass for critical pipeline operations
   * This should only be used when the pipeline is completely stalled
   */
  allowEmergencyBypass(jobId, reason = 'pipeline_recovery') {
    logger.warn('EMERGENCY BYPASS: Circuit breaker bypassed for critical operation', {
      jobId,
      reason,
      previousState: this.getCircuitState(jobId)
    });
    
    // Reset the job state to allow immediate retry
    const jobState = this.getJobState(jobId);
    jobState.attempts = 0;
    jobState.consecutiveFailures = 0;
    jobState.nextRetryTime = null;
    jobState.circuitState = 'closed';
    
    return {
      allowed: true,
      bypassReason: reason,
      resetState: 'closed'
    };
  }

  /**
   * Get health status of the circuit breaker
   */
  getHealthStatus() {
    const now = Date.now();
    const activeJobs = Array.from(this.jobStates.entries()).map(([jobId, state]) => ({
      jobId,
      attempts: state.attempts,
      circuitState: state.circuitState,
      lastActivity: Math.max(state.lastFailure || 0, state.lastSuccess || 0)
    }));
    
    return {
      globalStats: this.globalStats,
      activeJobs: activeJobs.length,
      openCircuits: activeJobs.filter(job => job.circuitState === 'open').length,
      halfOpenCircuits: activeJobs.filter(job => job.circuitState === 'half-open').length,
      timestamp: now
    };
  }

  /**
   * Get job attempts count
   */
  getJobAttempts(jobId) {
    const jobState = this.getJobState(jobId);
    return {
      attempts: jobState.attempts,
      maxRetries: this.config.maxRetries,
      remaining: Math.max(0, this.config.maxRetries - jobState.attempts)
    };
  }

  /**
   * Get overall status
   */
  getStatus() {
    const health = this.getHealthStatus();
    const failureRate = health.globalStats.totalRequests > 0 
      ? health.globalStats.totalFailures / health.globalStats.totalRequests 
      : 0;
    
    return {
      name: this.name,
      config: this.config,
      health,
      failureRate: Math.round(failureRate * 100) / 100,
      uptime: Date.now() - health.globalStats.lastReset
    };
  }

  /**
   * Private: Evaluate if circuit state should change
   */
  _evaluateCircuitState(jobId) {
    const jobState = this.getJobState(jobId);
    const currentState = jobState.circuitState;
    
    if (currentState === 'closed') {
      // Check if we should open the circuit
      if (jobState.consecutiveFailures >= this.config.maxRetries) {
        this._openCircuit(jobId, 'max_consecutive_failures');
      }
    } else if (currentState === 'half-open') {
      // Check if we should close or open the circuit
      if (jobState.consecutiveSuccesses >= this.config.successThreshold) {
        this._closeCircuit(jobId);
      } else if (jobState.consecutiveFailures > 0) {
        this._openCircuit(jobId, 'half_open_failure');
      }
    } else if (currentState === 'open') {
      // Check if we can transition to half-open
      if (this._canTransitionToHalfOpen(jobId)) {
        jobState.circuitState = 'half-open';
        logger.info('Circuit transitioned to half-open', { jobId });
      }
    }
  }

  /**
   * Private: Open the circuit
   */
  _openCircuit(jobId, reason) {
    const jobState = this.getJobState(jobId);
    jobState.circuitState = 'open';
    jobState.nextRetryTime = Date.now() + this.config.halfOpenRetryDelay;
    
    logger.warn('Circuit opened', { jobId, reason });
  }

  /**
   * Private: Close the circuit
   */
  _closeCircuit(jobId) {
    const jobState = this.getJobState(jobId);
    jobState.circuitState = 'closed';
    jobState.nextRetryTime = null;
    
    logger.info('Circuit closed', { jobId });
  }

  /**
   * Private: Check if circuit can transition to half-open
   */
  _canTransitionToHalfOpen(jobId) {
    const jobState = this.getJobState(jobId);
    const now = Date.now();
    
    return jobState.nextRetryTime && now >= jobState.nextRetryTime;
  }

  /**
   * Private: Calculate backoff delay with jitter
   */
  _getBackoffDelay(attemptNumber) {
    const exponentialDelay = Math.min(
      this.config.baseDelay * Math.pow(2, attemptNumber - 1),
      this.config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    
    return Math.floor(exponentialDelay + jitter);
  }

  /**
   * Cleanup old job states
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [jobId, state] of this.jobStates.entries()) {
      const lastActivity = Math.max(state.lastFailure || 0, state.lastSuccess || 0, state.createdAt);
      if (now - lastActivity > maxAge) {
        this.jobStates.delete(jobId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info('Circuit breaker cleanup completed', { cleanedCount });
    }
    
    return cleanedCount;
  }
}

module.exports = CircuitBreaker;