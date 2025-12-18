/**
 * Error handling for data lineage tracking
 * Ensures lineage tracking failures don't break main workflow
 * 
 * CRITICAL: Lineage tracking is supplementary - it must NEVER break the main system
 */
class LineageErrorHandler {
  constructor() {
    this.winston = require('winston');
    this.errorLogger = this.winston.createLogger({
      level: 'error',
      format: this.winston.format.combine(
        this.winston.format.timestamp(),
        this.winston.format.json()
      ),
      transports: [
        new this.winston.transports.File({ 
          filename: 'backend/logs/lineage-errors.log',
          maxsize: 10000000, // 10MB
          maxFiles: 5
        }),
        // Console transport for development debugging
        new this.winston.transports.Console({
          level: 'warn',
          format: this.winston.format.combine(
            this.winston.format.colorize(),
            this.winston.format.simple()
          )
        })
      ]
    });

    // Track error patterns for analysis
    this.errorPatterns = new Map();
    this.errorCounts = {
      validation: 0,
      persistence: 0,
      schema: 0,
      filesystem: 0,
      unknown: 0
    };
  }

  /**
   * Handle lineage tracking errors gracefully
   * CRITICAL: This method must NEVER throw exceptions
   * 
   * @param {Error} error - The error that occurred
   * @param {Object} context - Context information about the error
   * @param {string} operation - The operation that failed
   */
  handleLineageError(error, context = {}, operation = 'unknown') {
    try {
      const errorInfo = {
        error: error.message,
        stack: error.stack,
        operation,
        context,
        timestamp: new Date().toISOString(),
        errorType: this.classifyError(error),
        jobId: context.jobId || 'unknown',
        dataId: context.dataId || 'unknown'
      };

      // Log the error
      this.errorLogger.error('LINEAGE_TRACKING_ERROR', errorInfo);

      // Track error patterns
      this.trackErrorPattern(errorInfo);

      // Update error counts
      this.updateErrorCounts(errorInfo.errorType);

      // Console warning for development
      console.warn(`[LINEAGE] Non-fatal error in ${operation}:`, error.message);

      // Return error info for optional handling by caller
      return errorInfo;
    } catch (handlingError) {
      // Even error handling must not break the system
      console.error('[LINEAGE] Critical error in error handler:', handlingError.message);
      return {
        error: 'Error handler failure',
        originalError: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Classify error type for pattern analysis
   * @param {Error} error - Error to classify
   * @returns {string} Error classification
   * @private
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('validation') || message.includes('schema') || message.includes('required field')) {
      return 'validation';
    }
    
    if (message.includes('enoent') || message.includes('file') || message.includes('directory')) {
      return 'filesystem';
    }
    
    if (message.includes('json') || message.includes('parse') || message.includes('stringify')) {
      return 'persistence';
    }
    
    if (message.includes('schema') || message.includes('unknown lineage event')) {
      return 'schema';
    }
    
    return 'unknown';
  }

  /**
   * Track error patterns for analysis
   * @param {Object} errorInfo - Error information
   * @private
   */
  trackErrorPattern(errorInfo) {
    try {
      const pattern = `${errorInfo.operation}:${errorInfo.errorType}`;
      const count = this.errorPatterns.get(pattern) || 0;
      this.errorPatterns.set(pattern, count + 1);

      // Log frequent error patterns
      if ((count + 1) % 5 === 0) {
        this.errorLogger.warn('FREQUENT_LINEAGE_ERROR_PATTERN', {
          pattern,
          count: count + 1,
          timestamp: new Date().toISOString()
        });
      }
    } catch (trackingError) {
      // Ignore tracking errors - they're not critical
    }
  }

  /**
   * Update error counts
   * @param {string} errorType - Type of error
   * @private
   */
  updateErrorCounts(errorType) {
    try {
      if (this.errorCounts.hasOwnProperty(errorType)) {
        this.errorCounts[errorType]++;
      } else {
        this.errorCounts.unknown++;
      }
    } catch (countingError) {
      // Ignore counting errors - they're not critical
    }
  }

  /**
   * Validate lineage event before tracking
   * Uses schema validation to prevent invalid events
   * 
   * @param {string} eventType - Type of lineage event
   * @param {Object} event - Event data to validate
   * @returns {Object} Validation result
   */
  validateLineageEvent(eventType, event) {
    try {
      const { validateLineageEvent } = require('../schemas/lineageEventSchemas');
      return validateLineageEvent(eventType, event);
    } catch (error) {
      this.handleLineageError(error, { eventType, event }, 'validation');
      
      // Return safe validation result
      return {
        isValid: false,
        errors: [`Validation failed: ${error.message}`],
        eventType,
        schema: 'unknown'
      };
    }
  }

  /**
   * Safe wrapper for lineage operations
   * Executes operation with error handling
   * 
   * @param {Function} operation - Operation to execute
   * @param {Object} context - Context for error reporting
   * @param {string} operationName - Name of operation for logging
   * @returns {*} Operation result or null if error
   */
  safeExecute(operation, context = {}, operationName = 'unknown') {
    try {
      return operation();
    } catch (error) {
      this.handleLineageError(error, context, operationName);
      return null;
    }
  }

  /**
   * Safe async wrapper for lineage operations
   * Executes async operation with error handling
   * 
   * @param {Function} operation - Async operation to execute
   * @param {Object} context - Context for error reporting
   * @param {string} operationName - Name of operation for logging
   * @returns {Promise<*>} Operation result or null if error
   */
  async safeExecuteAsync(operation, context = {}, operationName = 'unknown') {
    try {
      return await operation();
    } catch (error) {
      this.handleLineageError(error, context, operationName);
      return null;
    }
  }

  /**
   * Get error statistics for monitoring
   * @returns {Object} Error statistics
   */
  getErrorStatistics() {
    try {
      return {
        totalErrors: Object.values(this.errorCounts).reduce((sum, count) => sum + count, 0),
        errorCounts: { ...this.errorCounts },
        errorPatterns: Object.fromEntries(this.errorPatterns),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        totalErrors: 0,
        errorCounts: {},
        errorPatterns: {},
        error: 'Failed to get statistics',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Reset error statistics
   * Useful for testing or periodic cleanup
   */
  resetStatistics() {
    try {
      this.errorPatterns.clear();
      Object.keys(this.errorCounts).forEach(key => {
        this.errorCounts[key] = 0;
      });
      
      this.errorLogger.info('LINEAGE_ERROR_STATISTICS_RESET', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Ignore reset errors
      console.warn('[LINEAGE] Failed to reset error statistics:', error.message);
    }
  }

  /**
   * Check if lineage tracking should be disabled due to excessive errors
   * @param {number} threshold - Error threshold (default: 100 errors)
   * @returns {boolean} True if lineage should be disabled
   */
  shouldDisableLineage(threshold = 100) {
    try {
      const totalErrors = Object.values(this.errorCounts).reduce((sum, count) => sum + count, 0);
      
      if (totalErrors >= threshold) {
        this.errorLogger.error('LINEAGE_TRACKING_DISABLED', {
          totalErrors,
          threshold,
          timestamp: new Date().toISOString(),
          reason: 'Excessive error count'
        });
        return true;
      }
      
      return false;
    } catch (error) {
      // If we can't determine, err on the side of caution
      return false;
    }
  }

  /**
   * Create safe lineage event with error handling
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @returns {Object|null} Safe event object or null if invalid
   */
  createSafeEvent(eventType, eventData) {
    return this.safeExecute(() => {
      const validation = this.validateLineageEvent(eventType, eventData);
      
      if (!validation.isValid) {
        throw new Error(`Invalid lineage event: ${validation.errors.join(', ')}`);
      }
      
      return {
        ...eventData,
        eventType,
        timestamp: eventData.timestamp || new Date().toISOString(),
        validated: true
      };
    }, { eventType, eventData }, 'createSafeEvent');
  }

  /**
   * Log lineage operation success for monitoring
   * @param {string} operation - Operation that succeeded
   * @param {Object} context - Context information
   */
  logSuccess(operation, context = {}) {
    try {
      // Only log success at debug level to avoid noise
      this.errorLogger.debug('LINEAGE_OPERATION_SUCCESS', {
        operation,
        context,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Ignore logging errors
    }
  }
}

module.exports = LineageErrorHandler;