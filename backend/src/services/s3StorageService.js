/**
 * S3 Storage Service
 * 
 * Provides S3-only storage operations for generated content and lineage data.
 * Designed for cloud deployment on AWS ECS with persistent S3 storage.
 * 
 * Features:
 * - Core CRUD operations (put, get, list, delete, exists)
 * - JSON convenience methods (putJSON, getJSON)
 * - Presigned URL generation for downloads
 * - Path helper methods for consistent key structure
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for fault tolerance
 * - Comprehensive error handling and logging
 * 
 * S3 "Key Structure":
 * - Content: jobs/{jobId}/content/narratives/{market}.{format}
 * - Pitches: jobs/{jobId}/content/pitches/{market}_pitch.{format}
 * - Lineage: jobs/{jobId}/lineage/{category}/{filename}
 * 
 * @module services/s3StorageService
 */

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * S3 Storage Service Class
 * Handles all S3 storage operations with retry logic and circuit breaker pattern
 */
class S3StorageService {
  constructor() {
    // Validate required configuration
    if (!process.env.S3_CONTENT_BUCKET) {
      throw new Error('S3_CONTENT_BUCKET environment variable is required');
    }

    // Configuration
    this.config = {
      bucket: process.env.S3_CONTENT_BUCKET,
      region: process.env.AWS_REGION || 'us-west-2',
      prefix: process.env.S3_KEY_PREFIX || 'jobs/',
      presignedUrlExpiration: parseInt(process.env.PRESIGNED_URL_EXPIRATION || '3600', 10)
    };

    // Initialize S3 client with AWS profile support
    const s3Config = {
      region: this.config.region
    };

    // Use AWS profile if specified (preferred for local dev)
    if (process.env.AWS_PROFILE) {
      s3Config.credentials = undefined; // Let SDK use profile from ~/.aws/credentials
      logger.info(`S3StorageService: Using AWS profile: ${process.env.AWS_PROFILE}`);
    }

    this.s3Client = new S3Client(s3Config);

    // Circuit breaker configuration
    this.circuitBreaker = {
      failureCount: 0,
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      lastFailureTime: null
    };

    // Retry configuration
    this.retryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2
    };

    logger.info('S3StorageService initialized', {
      bucket: this.config.bucket,
      region: this.config.region,
      prefix: this.config.prefix
    });
  }

  /**
   * Put object to S3
   * @param {string} key - S3 key (path)
   * @param {Buffer|string} content - Content to store
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result
   */
  async put(key, content, metadata = {}) {
    this._checkCircuitBreaker();

    const contentType = this._getContentType(key);
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata
    });

    try {
      await this._executeWithRetry(() => this.s3Client.send(command));
      
      this._recordSuccess();
      
      logger.debug('S3 put successful', { key, size: body.length, contentType });
      
      return {
        success: true,
        key,
        bucket: this.config.bucket,
        size: body.length
      };
    } catch (error) {
      this._recordFailure();
      logger.error('S3 put failed', { key, error: error.message });
      throw this._enhanceError(error, 'put', key);
    }
  }

  /**
   * Get object from S3
   * @param {string} key - S3 key (path)
   * @returns {Promise<string>} Object content as string
   */
  async get(key) {
    this._checkCircuitBreaker();

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });

    try {
      const response = await this._executeWithRetry(() => this.s3Client.send(command));
      const content = await response.Body.transformToString();
      
      this._recordSuccess();
      
      logger.debug('S3 get successful', { key, size: content.length });
      
      return content;
    } catch (error) {
      this._recordFailure();
      
      if (error.name === 'NoSuchKey') {
        const notFoundError = new Error(`Object not found: ${key}`);
        notFoundError.name = 'NotFound';
        throw notFoundError;
      }
      
      logger.error('S3 get failed', { key, error: error.message });
      throw this._enhanceError(error, 'get', key);
    }
  }

  /**
   * Check if object exists in S3
   * @param {string} key - S3 key (path)
   * @returns {Promise<boolean>} True if exists
   */
  async exists(key) {
    const command = new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
        return false;
      }
      logger.error('S3 exists check failed', { key, error: error.message });
      throw this._enhanceError(error, 'exists', key);
    }
  }

  /**
   * List objects under prefix
   * @param {string} prefix - S3 prefix (directory path)
   * @returns {Promise<Array>} List of objects with metadata
   */
  async list(prefix) {
    this._checkCircuitBreaker();

    const objects = [];
    let continuationToken = null;

    try {
      do {
        const command = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        });

        const response = await this._executeWithRetry(() => this.s3Client.send(command));
        
        if (response.Contents) {
          objects.push(...response.Contents.map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified
          })));
        }

        continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
      } while (continuationToken);

      this._recordSuccess();
      
      logger.debug('S3 list successful', { prefix, count: objects.length });
      
      return objects;
    } catch (error) {
      this._recordFailure();
      logger.error('S3 list failed', { prefix, error: error.message });
      throw this._enhanceError(error, 'list', prefix);
    }
  }

  /**
   * Delete object from S3
   * @param {string} key - S3 key (path)
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(key) {
    this._checkCircuitBreaker();

    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });

    try {
      await this._executeWithRetry(() => this.s3Client.send(command));
      
      this._recordSuccess();
      
      logger.debug('S3 delete successful', { key });
      
      return true;
    } catch (error) {
      // S3 delete is idempotent - NoSuchKey is not an error
      if (error.name === 'NoSuchKey') {
        logger.debug('S3 delete: object already deleted', { key });
        return true;
      }
      
      this._recordFailure();
      logger.error('S3 delete failed', { key, error: error.message });
      throw this._enhanceError(error, 'delete', key);
    }
  }

  /**
   * Put JSON object to S3 (convenience method)
   * @param {string} key - S3 key (path)
   * @param {Object} jsonData - JSON object to store
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result
   */
  async putJSON(key, jsonData, metadata = {}) {
    const content = JSON.stringify(jsonData, null, 2);
    return this.put(key, content, metadata);
  }

  /**
   * Get JSON object from S3 (convenience method)
   * @param {string} key - S3 key (path)
   * @returns {Promise<Object>} Parsed JSON object
   */
  async getJSON(key) {
    const content = await this.get(key);
    
    try {
      return JSON.parse(content);
    } catch (error) {
      const parseError = new Error(`Invalid JSON in S3 object: ${key}`);
      parseError.cause = error;
      throw parseError;
    }
  }

  /**
   * Generate presigned URL for download
   * @param {string} key - S3 key (path)
   * @param {number} expiresIn - Expiration time in seconds (default: 3600)
   * @returns {Promise<string>} Presigned URL
   */
  async generatePresignedUrl(key, expiresIn = null) {
    const expiration = expiresIn || this.config.presignedUrlExpiration;

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, expiration);
      
      logger.debug('Presigned URL generated', { key, expiresIn: expiration });
      
      return url;
    } catch (error) {
      logger.error('Presigned URL generation failed', { key, error: error.message });
      throw this._enhanceError(error, 'generatePresignedUrl', key);
    }
  }

  /**
   * List objects in S3 with a given prefix
   * @param {string} prefix - S3 key prefix to list objects under
   * @param {Object} options - Optional parameters
   * @param {number} options.maxKeys - Maximum number of keys to return (default: 1000)
   * @param {boolean} options.recursive - Whether to list recursively (default: true)
   * @returns {Promise<Array>} Array of S3 objects {Key, LastModified, Size}
   */
  async listObjects(prefix, options = {}) {
    try {
      const { maxKeys = 1000, recursive = true } = options;
      
      const params = {
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      };
      
      // If not recursive, set delimiter to only get immediate children
      if (!recursive) {
        params.Delimiter = '/';
      }
      
      const command = new ListObjectsV2Command(params);
      const response = await this.s3Client.send(command);
      
      return response.Contents || [];
    } catch (error) {
      this.logger.error('Failed to list objects from S3', {
        prefix,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Build content key for narratives or pitches
   * @param {string} jobId - Job ID
   * @param {string} type - Content type ('narrative' or 'pitch')
   * @param {string} market - Market name
   * @param {string} format - File format (json, txt, html, docx, pdf)
   * @returns {string} S3 key
   */
  buildContentKey(jobId, type, market, format) {
    // Sanitize market name for S3 key (replace spaces and special chars)
    const sanitizedMarket = market
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    const folder = type === 'pitch' ? 'pitches' : 'narratives';
    const suffix = type === 'pitch' ? '_pitch' : '';
    
    return `jobs/${jobId}/content/${folder}/${sanitizedMarket}${suffix}.${format}`;
  }

  /**
   * Build lineage key
   * @param {string} jobId - Job ID
   * @param {string} category - Lineage category (events, summary, costs)
   * @param {string} filename - File name
   * @returns {string} S3 key
   */
  buildLineageKey(jobId, category, filename) {
    return `jobs/${jobId}/lineage/${category}/${filename}`;
  }
  /**
   * Build lineage event key with specific event type handling
   * @param {string} jobId - Job ID
   * @param {string} eventType - Event type (job_start, job_complete, workflow_stage, etc.)
   * @param {string} identifier - Optional identifier (stage name, data type, object ID, etc.)
   * @returns {string} S3 key for lineage event
   */
  buildLineageEventKey(jobId, eventType, identifier = null) {
    const timestamp = Date.now();
    const base = `jobs/${jobId}/lineage/events`;
    
    // Handle empty eventType (used for listing all events - returns base path as prefix)
    if (!eventType || eventType === '') {
      return base;
    }
    
    switch(eventType) {
      case 'job_start':
        return `${base}/job_started_${timestamp}.json`;
      case 'job_complete':
        return `${base}/job_completed_${timestamp}.json`;
      case 'job_failure':
        return `${base}/job_failed_${timestamp}.json`;
      case 'workflow_stage':
        if (!identifier) throw new Error('workflow_stage requires stage name identifier');
        return `${base}/workflow_${identifier}_${timestamp}.json`;
      case 'data_extraction':
        if (!identifier) throw new Error('data_extraction requires data type identifier');
        return `${base}/extraction_${identifier}_${timestamp}.json`;
      case 'perplexity_request':
        if (!identifier) throw new Error('perplexity_request requires object ID identifier');
        return `${base}/perplexity_req_${identifier}.json`;
      case 'perplexity_response':
        if (!identifier) throw new Error('perplexity_response requires object ID identifier');
        return `${base}/perplexity_resp_${identifier}.json`;
      case 'tavily_request':
        if (!identifier) throw new Error('tavily_request requires object ID identifier');
        return `${base}/tavily_req_${identifier}.json`;
      case 'tavily_response':
        if (!identifier) throw new Error('tavily_response requires object ID identifier');
        return `${base}/tavily_resp_${identifier}.json`;
      case 'utilization':
        if (!identifier) throw new Error('utilization requires data object ID identifier');
        return `${base}/utilization_${identifier}.json`;
      default:
        throw new Error(`Unknown lineage event type: ${eventType}`);
    }
  }

  /**
   * Build lineage cost tracking key
   * @param {string} jobId - Job ID
   * @returns {string} S3 key for cost tracking event
   */
  buildLineageCostKey(jobId) {
    const timestamp = Date.now();
    return `jobs/${jobId}/lineage/costs/cost_tracking_${timestamp}.json`;
  }

  /**
   * Build lineage alert key
   * @param {string} alertId - Alert ID
   * @returns {string} S3 key for alert storage
   */
  buildLineageAlertKey(alertId) {
    return `alerts/alert_${alertId}.json`;
  }

  /**
   * Build lineage summary key
   * @param {string} jobId - Job ID
   * @returns {string} S3 key for lineage summary
   */
  buildLineageSummaryKey(jobId) {
    return `jobs/${jobId}/lineage/summary.json`;
  }


  /**
   * Execute operation with retry logic
   * @private
   */
  async _executeWithRetry(operation) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this._isNonRetryableError(error)) {
          throw error;
        }
        
        // Don't retry if we've exhausted attempts
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
          this.retryConfig.maxDelayMs
        );
        
        logger.warn(`S3 operation failed, retrying in ${delay}ms`, {
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          error: error.message
        });
        
        await this._sleep(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Check if error is non-retryable
   * @private
   */
  _isNonRetryableError(error) {
    const nonRetryableErrors = [
      'NoSuchBucket',
      'AccessDenied',
      'InvalidAccessKeyId',
      'SignatureDoesNotMatch',
      'NoSuchKey'
    ];
    
    return nonRetryableErrors.includes(error.name);
  }

  /**
   * Check circuit breaker state
   * @private
   */
  _checkCircuitBreaker() {
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      
      if (timeSinceFailure >= this.circuitBreaker.resetTimeout) {
        // Try to close circuit
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info('Circuit breaker entering HALF_OPEN state');
      } else {
        const error = new Error('Circuit breaker is OPEN - S3 operations temporarily disabled');
        error.name = 'CircuitBreakerOpen';
        throw error;
      }
    }
  }

  /**
   * Record successful operation
   * @private
   */
  _recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failureCount = 0;
      logger.info('Circuit breaker CLOSED after successful operation');
    } else if (this.circuitBreaker.state === 'CLOSED') {
      // Reset failure count on success
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record failed operation
   * @private
   */
  _recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      logger.error('Circuit breaker OPENED after consecutive failures', {
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.circuitBreaker.failureThreshold
      });
    }
  }

  /**
   * Get content type from file extension
   * @private
   */
  _getContentType(key) {
    const ext = key.split('.').pop().toLowerCase();
    
    const contentTypes = {
      'json': 'application/json',
      'txt': 'text/plain',
      'html': 'text/html',
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'zip': 'application/zip'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Enhance error with context
   * @private
   */
  _enhanceError(error, operation, key) {
    error.context = {
      operation,
      key,
      bucket: this.config.bucket,
      timestamp: new Date().toISOString()
    };
    return error;
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export class for testing, singleton for production use
module.exports = S3StorageService;
module.exports.instance = new S3StorageService();