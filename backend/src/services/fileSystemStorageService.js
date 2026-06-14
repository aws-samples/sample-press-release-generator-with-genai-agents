/**
 * FileSystem Storage Service
 * 
 * Provides local filesystem storage operations for generated content and lineage data.
 * Designed for local development and Docker environments without S3 access.
 * Implements the same interface as S3StorageService for drop-in replacement.
 * 
 * Features:
 * - Core CRUD operations (put, get, list, delete, exists)
 * - JSON convenience methods (putJSON, getJSON)
 * - Presigned URL generation (returns local file paths)
 * - Path helper methods for consistent directory structure
 * - Automatic directory creation
 * - Comprehensive error handling and logging
 * 
 * "Directory Structure":
 * - Content: storage/generated/job_{jobId}/content/narratives/{market}.{format}
 * - Pitches: storage/generated/job_{jobId}/content/pitches/{market}_pitch.{format}
 * - Lineage: storage/generated/job_{jobId}/lineage/{category}/{filename}
 * 
 * @module services/fileSystemStorageService
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { resolveWithinBase, isWithinBase } = require('../utils/safePath');

/**
 * FileSystem Storage Service Class
 * Handles all local filesystem storage operations with same interface as S3StorageService
 */
class FileSystemStorageService {
  constructor() {
    // Configuration from environment variables
    this.config = {
      basePath: path.resolve(process.cwd(), config.storage.localPath || './storage'),
      generatedPath: path.resolve(process.cwd(), config.storage.generatedPath || './storage/generated'),
      presignedUrlExpiration: 3600 // Not used for local files, but kept for interface compatibility
    };

    // Circuit breaker configuration (for interface compatibility)
    this.circuitBreaker = {
      failureCount: 0,
      failureThreshold: 5,
      resetTimeout: 60000,
      state: 'CLOSED',
      lastFailureTime: null
    };

    // Ensure base directories exist
    this._ensureDirectoryExists(this.config.basePath);
    this._ensureDirectoryExists(this.config.generatedPath);

    logger.info('FileSystemStorageService initialized', {
      basePath: this.config.basePath,
      generatedPath: this.config.generatedPath
    });
  }

  /**
   * Put object to filesystem
   * @param {string} key - File path (relative to storage root)
   * @param {Buffer|string} content - Content to store
   * @param {Object} metadata - Optional metadata (stored as .meta.json)
   * @returns {Promise<Object>} Upload result
   */
  async put(key, content, metadata = {}) {
    try {
      const filePath = this._keyToPath(key);
      const dirPath = path.dirname(filePath);

      // Ensure directory exists
      await this._ensureDirectoryExists(dirPath);

      // Convert content to buffer if needed
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

      // Write file
      await fs.writeFile(filePath, buffer);

      // Write metadata if provided
      if (Object.keys(metadata).length > 0) {
        const metaPath = `${filePath}.meta.json`;
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
      }

      this._recordSuccess();

      logger.debug('FileSystem put successful', { key, path: filePath, size: buffer.length });

      return {
        success: true,
        key,
        path: filePath,
        size: buffer.length
      };
    } catch (error) {
      this._recordFailure();
      logger.error('FileSystem put failed', { key, error: error.message });
      throw this._enhanceError(error, 'put', key);
    }
  }

  /**
   * Get object from filesystem
   * @param {string} key - File path (relative to storage root)
   * @returns {Promise<string>} File content as string
   */
  async get(key) {
    try {
      if (typeof key !== 'string') {
        throw new TypeError('Storage key must be a string');
      }
      // Reject poison null bytes inline before resolving (classic truncation defense).
      if (key.indexOf('\0') !== -1) {
        throw new Error('Unsafe storage key: null byte detected');
      }
      // SECURITY (CodeQL js/path-injection — alerts 41,42): INLINE containment
      // barrier. Resolve the user-controlled key against the storage base IN THIS
      // FUNCTION and reject any result that escapes it, so the value reaching
      // fsSync.existsSync()/fs.readFile() below is the sanitized `filePath` — not
      // the raw key. CodeQL recognizes the `path.resolve(base, input)` +
      // `startsWith(base + path.sep)` check as a sanitizer barrier ON `filePath`;
      // the equivalent check inside the `_keyToPath` helper is NOT propagated
      // across the function boundary (which is why these alerts re-opened).
      const baseDir = path.resolve(this.config.generatedPath);
      const filePath = path.resolve(baseDir, key.replace(/^\/+/, ''));
      if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
        throw new Error('Unsafe storage key: resolved path escapes base directory');
      }

      // Check if file exists
      if (!fsSync.existsSync(filePath)) {
        const notFoundError = new Error(`Object not found: ${key}`);
        notFoundError.name = 'NotFound';
        throw notFoundError;
      }

      // Read file
      const content = await fs.readFile(filePath, 'utf-8');

      this._recordSuccess();

      logger.debug('FileSystem get successful', { key, path: filePath, size: content.length });

      return content;
    } catch (error) {
      this._recordFailure();

      if (error.name === 'NotFound') {
        throw error;
      }

      logger.error('FileSystem get failed', { key, error: error.message });
      throw this._enhanceError(error, 'get', key);
    }
  }

  /**
   * Check if object exists in filesystem
   * @param {string} key - File path (relative to storage root)
   * @returns {Promise<boolean>} True if exists
   */
  async exists(key) {
    try {
      const filePath = this._keyToPath(key);
      return fsSync.existsSync(filePath);
    } catch (error) {
      logger.error('FileSystem exists check failed', { key, error: error.message });
      throw this._enhanceError(error, 'exists', key);
    }
  }

  /**
   * List objects under prefix
   * @param {string} prefix - Directory path (relative to storage root)
   * @returns {Promise<Array>} List of files with metadata
   */
  async list(prefix) {
    try {
      const dirPath = this._keyToPath(prefix);

      // Check if directory exists
      if (!fsSync.existsSync(dirPath)) {
        return [];
      }

      const files = [];
      await this._listFilesRecursive(dirPath, files, prefix);

      this._recordSuccess();

      logger.debug('FileSystem list successful', { prefix, count: files.length });

      return files;
    } catch (error) {
      this._recordFailure();
      logger.error('FileSystem list failed', { prefix, error: error.message });
      throw this._enhanceError(error, 'list', prefix);
    }
  }

  /**
   * Delete object from filesystem
   * @param {string} key - File path (relative to storage root)
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(key) {
    try {
      const filePath = this._keyToPath(key);

      // Check if file exists
      if (!fsSync.existsSync(filePath)) {
        logger.debug('FileSystem delete: file already deleted', { key });
        return true;
      }

      // Delete file
      await fs.unlink(filePath);

      // Delete metadata file if exists
      const metaPath = `${filePath}.meta.json`;
      if (fsSync.existsSync(metaPath)) {
        await fs.unlink(metaPath);
      }

      this._recordSuccess();

      logger.debug('FileSystem delete successful', { key, path: filePath });

      return true;
    } catch (error) {
      this._recordFailure();
      logger.error('FileSystem delete failed', { key, error: error.message });
      throw this._enhanceError(error, 'delete', key);
    }
  }

  /**
   * Put JSON object to filesystem (convenience method)
   * @param {string} key - File path (relative to storage root)
   * @param {Object} jsonData - JSON object to store
   * @param {Object} metadata - Optional metadata
   * @returns {Promise<Object>} Upload result
   */
  async putJSON(key, jsonData, metadata = {}) {
    const content = JSON.stringify(jsonData, null, 2);
    return this.put(key, content, metadata);
  }

  /**
   * Get JSON object from filesystem (convenience method)
   * @param {string} key - File path (relative to storage root)
   * @returns {Promise<Object>} Parsed JSON object
   */
  async getJSON(key) {
    const content = await this.get(key);

    try {
      return JSON.parse(content);
    } catch (error) {
      const parseError = new Error(`Invalid JSON in file: ${key}`);
      parseError.cause = error;
      throw parseError;
    }
  }

  /**
   * Generate presigned URL for download (returns local file path for filesystem)
   * @param {string} key - File path (relative to storage root)
   * @param {number} expiresIn - Expiration time (not used for local files)
   * @returns {Promise<string>} Local file path
   */
  async generatePresignedUrl(key, expiresIn = null) {
    try {
      const filePath = this._keyToPath(key);

      // Check if file exists
      if (!fsSync.existsSync(filePath)) {
        throw new Error(`File not found: ${key}`);
      }

      // For local filesystem, return the file path
      // In a real implementation, this could return a local HTTP URL
      logger.debug('Presigned URL generated (local path)', { key, path: filePath });

      return `file://${filePath}`;
    } catch (error) {
      logger.error('Presigned URL generation failed', { key, error: error.message });
      throw this._enhanceError(error, 'generatePresignedUrl', key);
    }
  }

  /**
   * List objects in filesystem with a given prefix
   * @param {string} prefix - Directory path to list objects under
   * @param {Object} options - Optional parameters
   * @param {number} options.maxKeys - Maximum number of keys to return (default: 1000)
   * @param {boolean} options.recursive - Whether to list recursively (default: true)
   * @returns {Promise<Array>} Array of file objects {Key, LastModified, Size}
   */
  async listObjects(prefix, options = {}) {
    try {
      const { maxKeys = 1000, recursive = true } = options;
      if (typeof prefix !== 'string') {
        throw new TypeError('Storage prefix must be a string');
      }
      // Reject poison null bytes inline before resolving (classic truncation defense).
      if (prefix.indexOf('\0') !== -1) {
        throw new Error('Unsafe storage prefix: null byte detected');
      }
      // SECURITY (CodeQL js/path-injection — alerts 43,44): INLINE containment
      // barrier. Resolve the user-controlled prefix against the storage base IN
      // THIS FUNCTION so the sanitized `dirPath` is what reaches
      // fsSync.existsSync()/fs.readdir() below. The `path.resolve(base, input)` +
      // `startsWith(base + path.sep)` check is a CodeQL-recognized sanitizer
      // barrier on `dirPath`; the same check inside `_keyToPath` is NOT propagated
      // across the helper boundary (cause of the re-opened alerts).
      const baseDir = path.resolve(this.config.generatedPath);
      const dirPath = path.resolve(baseDir, prefix.replace(/^\/+/, ''));
      if (dirPath !== baseDir && !dirPath.startsWith(baseDir + path.sep)) {
        throw new Error('Unsafe storage prefix: resolved path escapes base directory');
      }

      if (!fsSync.existsSync(dirPath)) {
        return [];
      }

      const files = [];
      
      if (recursive) {
        await this._listFilesRecursive(dirPath, files, prefix);
      } else {
        // Non-recursive: only immediate children
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            // SECURITY (CodeQL js/path-injection — alerts 44,45): re-validate the
            // joined child path stays within the storage base before stat'ing it.
            // INLINE the resolve+containment check so the sanitized `filePath` is
            // what reaches fs.stat() (helper-returned values are not recognized).
            const childBase = path.resolve(this.config.generatedPath);
            const filePath = path.resolve(childBase, path.join(dirPath, entry.name));
            if (filePath !== childBase && !filePath.startsWith(childBase + path.sep)) {
              continue; // skip anything that would escape the base
            }
            const stats = await fs.stat(filePath);
            const relativeKey = path.relative(this.config.generatedPath, filePath).replace(/\\/g, '/');
            
            files.push({
              Key: relativeKey,
              LastModified: stats.mtime,
              Size: stats.size
            });
          }
        }
      }

      // Limit results if maxKeys specified
      return files.slice(0, maxKeys);
    } catch (error) {
      logger.error('Failed to list objects from filesystem', {
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
   * @returns {string} File key
   */
  buildContentKey(jobId, type, market, format) {
    // Sanitize market name for filesystem (replace spaces and special chars)
    const sanitizedMarket = market
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    const folder = type === 'pitch' ? 'pitches' : 'narratives';
    const suffix = type === 'pitch' ? '_pitch' : '';

    return `${jobId}/content/${folder}/${sanitizedMarket}${suffix}.${format}`;
  }

  /**
   * Build lineage key
   * @param {string} jobId - Job ID
   * @param {string} category - Lineage category (events, summary, costs)
   * @param {string} filename - File name
   * @returns {string} File key
   */
  buildLineageKey(jobId, category, filename) {
    return `${jobId}/lineage/${category}/${filename}`;
  }

  /**
   * Build lineage event key with specific event type handling
   * @param {string} jobId - Job ID
   * @param {string} eventType - Event type (job_start, job_complete, workflow_stage, etc.)
   * @param {string} identifier - Optional identifier (stage name, data type, object ID, etc.)
   * @returns {string} File key for lineage event
   */
  buildLineageEventKey(jobId, eventType, identifier = null) {
    const timestamp = Date.now();
    const base = `${jobId}/lineage/events`;

    // Handle empty eventType (used for listing all events - returns base path as prefix)
    if (!eventType || eventType === '') {
      return base;
    }

    switch (eventType) {
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
   * @returns {string} File key for cost tracking event
   */
  buildLineageCostKey(jobId) {
    const timestamp = Date.now();
    return `${jobId}/lineage/costs/cost_tracking_${timestamp}.json`;
  }

  /**
   * Build lineage alert key
   * @param {string} alertId - Alert ID
   * @returns {string} File key for alert storage
   */
  buildLineageAlertKey(alertId) {
    return `alerts/alert_${alertId}.json`;
  }

  /**
   * Build lineage summary key
   * @param {string} jobId - Job ID
   * @returns {string} File key for lineage summary
   */
  buildLineageSummaryKey(jobId) {
    return `${jobId}/lineage/summary.json`;
  }

  /**
   * Convert storage key to filesystem path.
   *
   * SECURITY (CodeQL js/path-injection — alerts 41,42,43,44,45): the storage
   * `key` can be user/external-controlled. Resolving it against the generated
   * base dir and rejecting any result that escapes that base prevents
   * `../../etc/passwd`-style directory traversal. `resolveWithinBase` also
   * rejects absolute paths and null bytes.
   *
   * @private
   * @param {string} key - Storage key (relative to the generated storage root)
   * @returns {string} Absolute, contained filesystem path
   * @throws {Error} when the key escapes the storage base directory
   */
  _keyToPath(key) {
    if (typeof key !== 'string') {
      throw new TypeError('Storage key must be a string');
    }
    // Remove any leading slashes so the key is treated as relative to the base.
    const cleanKey = key.replace(/^\/+/, '');
    return resolveWithinBase(this.config.generatedPath, cleanKey);
  }

  /**
   * Ensure directory exists, create if needed
   * @private
   * @param {string} dirPath - Directory path
   */
  _ensureDirectoryExists(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
      logger.debug('Created directory', { path: dirPath });
    }
  }

  /**
   * Recursively list files in directory
   * @private
   * @param {string} dirPath - Directory path
   * @param {Array} files - Array to accumulate results
   * @param {string} basePrefix - Base prefix for relative keys
   */
  async _listFilesRecursive(dirPath, files, basePrefix) {
    // SECURITY (CodeQL js/path-injection — alerts 46,47): ensure the directory
    // we are about to read is itself contained within the storage base before
    // calling fs.readdir, and re-validate every joined child path before
    // stat'ing it. Anything that would escape the base is skipped.
    let safeDirPath;
    try {
      safeDirPath = resolveWithinBase(this.config.generatedPath, dirPath);
    } catch (_) {
      return; // refuse to traverse outside the storage base
    }

    const entries = await fs.readdir(safeDirPath, { withFileTypes: true });

    for (const entry of entries) {
      let fullPath;
      try {
        fullPath = resolveWithinBase(this.config.generatedPath, path.join(safeDirPath, entry.name));
      } catch (_) {
        continue; // skip entries that would escape the base
      }

      if (entry.isDirectory()) {
        await this._listFilesRecursive(fullPath, files, basePrefix);
      } else if (entry.isFile() && !entry.name.endsWith('.meta.json')) {
        // Skip metadata files
        const stats = await fs.stat(fullPath);
        const relativeKey = path.relative(this.config.generatedPath, fullPath).replace(/\\/g, '/');

        files.push({
          key: relativeKey,
          size: stats.size,
          lastModified: stats.mtime
        });
      }
    }
  }

  /**
   * Check circuit breaker state (for interface compatibility)
   * @private
   */
  _checkCircuitBreaker() {
    // Filesystem operations don't need circuit breaker, but kept for interface compatibility
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;

      if (timeSinceFailure >= this.circuitBreaker.resetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info('Circuit breaker entering HALF_OPEN state');
      } else {
        const error = new Error('Circuit breaker is OPEN - FileSystem operations temporarily disabled');
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
   * Enhance error with context
   * @private
   */
  _enhanceError(error, operation, key) {
    error.context = {
      operation,
      key,
      basePath: this.config.basePath,
      timestamp: new Date().toISOString()
    };
    return error;
  }
}

// Export class for testing, singleton for production use
module.exports = FileSystemStorageService;
module.exports.instance = new FileSystemStorageService();