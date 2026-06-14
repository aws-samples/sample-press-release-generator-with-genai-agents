/**
 * Attribution Middleware Service
 * 
 * Provides standardized data source attribution tracking
 * across all services and integration points.
 * 
 * Created: 2025-07-07
 * Purpose: Fix actualDataSourceUsed: null issue
 */

const winston = require('winston');

class AttributionMiddleware {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/attribution.log' })
      ]
    });
  }

  /**
   * Initialize attribution tracking for a request
   * @param {Object} inputParams - Request parameters
   * @returns {Object} Attribution context
   */
  initializeAttribution(inputParams) {
    const attribution = {
      requestId: this._generateRequestId(),
      inputDataSource: inputParams.dataSource || 'unknown',
      actualDataSourceUsed: null,
      dataSourceExecutionConfirmed: false,
      dataSourceMetadata: {
        service: null,
        model: null,
        timestamp: new Date().toISOString(),
        responseTime: null,
        tokenUsage: null,
        error: null
      },
      serviceChain: [],
      startTime: Date.now()
    };

    this.logger.info('Attribution initialized', {
      requestId: attribution.requestId,
      inputDataSource: attribution.inputDataSource
    });

    return attribution;
  }

  /**
   * Track service call in attribution chain
   * @param {Object} attribution - Attribution context
   * @param {string} serviceName - Name of the service being called
   * @param {Object} serviceParams - Parameters passed to service
   * @returns {Object} Updated attribution context
   */
  trackServiceCall(attribution, serviceName, serviceParams = {}) {
    const serviceCall = {
      service: serviceName,
      timestamp: new Date().toISOString(),
      parameters: serviceParams,
      startTime: Date.now()
    };

    attribution.serviceChain.push(serviceCall);

    this.logger.info('Service call tracked', {
      requestId: attribution.requestId,
      service: serviceName,
      chainLength: attribution.serviceChain.length
    });

    return attribution;
  }

  /**
   * Record service response and update attribution
   * @param {Object} attribution - Attribution context
   * @param {string} serviceName - Name of the service that responded
   * @param {Object} response - Service response
   * @param {boolean} success - Whether the service call was successful
   * @returns {Object} Updated attribution context
   */
  recordServiceResponse(attribution, serviceName, response, success = true) {
    // Find the most recent service call for this service
    const serviceCallIndex = attribution.serviceChain.findLastIndex(
      call => call.service === serviceName
    );

    if (serviceCallIndex !== -1) {
      const serviceCall = attribution.serviceChain[serviceCallIndex];
      serviceCall.endTime = Date.now();
      serviceCall.responseTime = serviceCall.endTime - serviceCall.startTime;
      serviceCall.success = success;
      serviceCall.response = response;
    }

    // Update main attribution if this is an AI service
    if (this._isAIService(serviceName) && success) {
      attribution.actualDataSourceUsed = serviceName;
      attribution.dataSourceExecutionConfirmed = true;
      
      if (response && response.metadata) {
        attribution.dataSourceMetadata = {
          ...attribution.dataSourceMetadata,
          service: serviceName,
          model: response.metadata.model || null,
          responseTime: response.metadata.responseTime || null,
          tokenUsage: response.metadata.tokenUsage || null
        };
      }
    }

    this.logger.info('Service response recorded', {
      requestId: attribution.requestId,
      service: serviceName,
      success,
      actualDataSourceUsed: attribution.actualDataSourceUsed
    });

    return attribution;
  }

  /**
   * Handle service error and update attribution
   * @param {Object} attribution - Attribution context
   * @param {string} serviceName - Name of the service that failed
   * @param {Error} error - Error object
   * @returns {Object} Updated attribution context
   */
  recordServiceError(attribution, serviceName, error) {
    // Find the most recent service call for this service
    const serviceCallIndex = attribution.serviceChain.findLastIndex(
      call => call.service === serviceName
    );

    if (serviceCallIndex !== -1) {
      const serviceCall = attribution.serviceChain[serviceCallIndex];
      serviceCall.endTime = Date.now();
      serviceCall.responseTime = serviceCall.endTime - serviceCall.startTime;
      serviceCall.success = false;
      serviceCall.error = error.message || error.toString();
    }

    // Update main attribution error info
    if (this._isAIService(serviceName)) {
      attribution.dataSourceMetadata.error = error.message || error.toString();
      attribution.dataSourceExecutionConfirmed = false;
    }

    this.logger.error('Service error recorded', {
      requestId: attribution.requestId,
      service: serviceName,
      error: error.message,
      actualDataSourceUsed: attribution.actualDataSourceUsed
    });

    return attribution;
  }

  /**
   * Finalize attribution for output
   * @param {Object} attribution - Attribution context
   * @returns {Object} Final attribution metadata
   */
  finalizeAttribution(attribution) {
    const totalTime = Date.now() - attribution.startTime;
    
    const finalAttribution = {
      actualDataSourceUsed: attribution.actualDataSourceUsed,
      dataSourceExecutionConfirmed: attribution.dataSourceExecutionConfirmed,
      dataSourceMetadata: {
        ...attribution.dataSourceMetadata,
        totalProcessingTime: totalTime,
        serviceChainLength: attribution.serviceChain.length
      }
    };

    // Handle fallback scenarios
    if (!attribution.actualDataSourceUsed) {
      finalAttribution.actualDataSourceUsed = this._determineFallbackDataSource(attribution);
      finalAttribution.dataSourceExecutionConfirmed = false;
      finalAttribution.dataSourceMetadata.fallbackReason = 'Primary data source unavailable';
    }

    this.logger.info('Attribution finalized', {
      requestId: attribution.requestId,
      actualDataSourceUsed: finalAttribution.actualDataSourceUsed,
      dataSourceExecutionConfirmed: finalAttribution.dataSourceExecutionConfirmed,
      totalProcessingTime: totalTime
    });

    return finalAttribution;
  }

  /**
   * Create attribution context from existing data (for backward compatibility)
   * @param {Object} existingData - Existing attribution data
   * @returns {Object} Attribution context
   */
  fromExistingData(existingData) {
    const attribution = {
      requestId: this._generateRequestId(),
      inputDataSource: existingData.dataSource || 'unknown',
      actualDataSourceUsed: existingData.actualDataSourceUsed || null,
      dataSourceExecutionConfirmed: existingData.dataSourceExecutionConfirmed || false,
      dataSourceMetadata: existingData.dataSourceMetadata || {
        service: null,
        model: null,
        timestamp: new Date().toISOString(),
        responseTime: null,
        tokenUsage: null,
        error: null
      },
      serviceChain: existingData.serviceChain || [],
      startTime: Date.now()
    };

    this.logger.info('Attribution created from existing data', {
      requestId: attribution.requestId,
      actualDataSourceUsed: attribution.actualDataSourceUsed
    });

    return attribution;
  }

  /**
   * Validate attribution data structure
   * @param {Object} attribution - Attribution data to validate
   * @returns {boolean} Whether attribution is valid
   */
  validateAttribution(attribution) {
    const required = ['actualDataSourceUsed', 'dataSourceExecutionConfirmed'];
    const hasRequired = required.every(field => attribution.hasOwnProperty(field));
    
    if (!hasRequired) {
      this.logger.warn('Attribution validation failed: missing required fields', {
        attribution,
        required
      });
      return false;
    }

    return true;
  }

  /**
   * Generate unique request ID
   * @returns {string} Unique request ID
   * @private
   */
  _generateRequestId() {
    return `attr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if service is an AI service
   * @param {string} serviceName - Name of the service
   * @returns {boolean} Whether service is AI service
   * @private
   */
  _isAIService(serviceName) {
    const aiServices = ['perplexity', 'bedrock', 'openai', 'claude', 'gpt'];
    return aiServices.some(ai => serviceName.toLowerCase().includes(ai));
  }

  /**
   * Determine fallback data source
   * @param {Object} attribution - Attribution context
   * @returns {string} Fallback data source
   * @private
   */
  _determineFallbackDataSource(attribution) {
    // Check if any services succeeded
    const successfulServices = attribution.serviceChain.filter(call => call.success);
    
    if (successfulServices.length > 0) {
      return successfulServices[successfulServices.length - 1].service;
    }

    // Default fallback based on input
    switch (attribution.inputDataSource) {
      case 'ai':
        return 'trusted'; // Fallback to trusted data
      case 'trusted':
        return 'trusted';
      case 'crawler':
        return 'crawler';
      default:
        return 'unknown';
    }
  }
}

module.exports = AttributionMiddleware;