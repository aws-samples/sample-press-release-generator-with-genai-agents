/**
 * File Retrieval Service
 * Single source of truth for file operations across ALL APIs
 * 
 * Eliminates duplication between Traditional and Strands APIs by providing
 * centralized file retrieval logic with storage abstraction.
 * 
 * @module services/shared/fileRetrievalService
 */

const { getStorageService } = require('../storageSelector');
const { logger } = require('../../utils/logger');

/**
 * FileRetrievalService Class
 * Provides unified file retrieval operations for all content types
 */
class FileRetrievalService {
  constructor(storageService = null) {
    // Use provided storage service or get from selector
    this.storage = storageService || getStorageService();
    this.logger = logger;
  }

  /**
   * Retrieve narrative JSON file
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name (will be normalized)
   * @param {string} format - File format (default: 'json')
   * @returns {Promise<Object>} Parsed file content
   */
  async getNarrative(jobId, market, format = 'json') {
    try {
      const path = this._resolveNarrativePath(jobId, market, format);
      this.logger.info('Retrieving narrative', { jobId, market, format, path });
      
      const content = await this.storage.getJSON(path);
      
      this.logger.info('Narrative retrieved successfully', { jobId, market, format });
      return content;
    } catch (error) {
      this.logger.error('Failed to retrieve narrative', {
        jobId,
        market,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve pitch email JSON file
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name (will be normalized)
   * @param {string} format - File format (default: 'json')
   * @returns {Promise<Object>} Parsed file content
   */
  async getPitchEmail(jobId, market, format = 'json') {
    try {
      const path = this._resolvePitchPath(jobId, market, format);
      this.logger.info('Retrieving pitch email', { jobId, market, format, path });
      
      const content = await this.storage.getJSON(path);
      
      this.logger.info('Pitch email retrieved successfully', { jobId, market, format });
      return content;
    } catch (error) {
      this.logger.error('Failed to retrieve pitch email', {
        jobId,
        market,
        format,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Retrieve lineage JSON file
   * @param {string} jobId - Job identifier  
   * @param {string} market - Market name (will be normalized)
   * @returns {Promise<Object>} Parsed lineage data
   */
  async getLineage(jobId, market) {
    try {
      const path = this._resolveLineagePath(jobId, market);
      this.logger.info('Retrieving lineage', { jobId, market, path });
      
      const content = await this.storage.getJSON(path);
      
      this.logger.info('Lineage retrieved successfully', { jobId, market });
      return content;
    } catch (error) {
      this.logger.error('Failed to retrieve lineage', {
        jobId,
        market,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if file exists
   * @param {string} jobId - Job identifier
   * @param {string} fileType - 'narrative', 'pitch', or 'lineage'
   * @param {string} market - Market name
   * @param {string} format - File format
   * @returns {Promise<boolean>}
   */
  async fileExists(jobId, fileType, market, format = 'json') {
    try {
      const path = this._resolvePath(jobId, fileType, market, format);
      const exists = await this.storage.exists(path);
      
      this.logger.debug('File existence check', { jobId, fileType, market, format, exists, path });
      return exists;
    } catch (error) {
      this.logger.warn('File existence check failed', {
        jobId,
        fileType,
        market,
        format,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Normalize market name for filesystem compatibility
   * SINGLE SOURCE OF TRUTH for market name normalization
   * @param {string} market - Original market name
   * @returns {string} Normalized market name
   */
  normalizeMarketName(market) {
    // Replace non-alphanumeric characters with underscores
    return market.replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * PRIVATE: Resolve narrative file path
   * Storage service adds base path, so return relative path only
   * @private
   */
  _resolveNarrativePath(jobId, market, format) {
    const normalized = this.normalizeMarketName(market);
    return `${jobId}/content/narratives/${normalized}.${format}`;
  }

  /**
   * PRIVATE: Resolve pitch file path
   * Storage service adds base path, so return relative path only
   * @private
   */
  _resolvePitchPath(jobId, market, format) {
    const normalized = this.normalizeMarketName(market);
    return `${jobId}/content/pitches/${normalized}_pitch.${format}`;
  }

  /**
   * PRIVATE: Resolve lineage file path
   * Storage service adds base path, so return relative path only
   * @private
   */
  _resolveLineagePath(jobId, market) {
    const normalized = this.normalizeMarketName(market);
    return `${jobId}/lineage/${normalized}_lineage.json`;
  }

  /**
   * PRIVATE: Generic path resolver
   * @private
   */
  _resolvePath(jobId, fileType, market, format) {
    switch (fileType) {
      case 'narrative':
        return this._resolveNarrativePath(jobId, market, format);
      case 'pitch':
        return this._resolvePitchPath(jobId, market, format);
      case 'lineage':
        return this._resolveLineagePath(jobId, market);
      default:
        throw new Error(`Unknown file type: ${fileType}`);
    }
  }
}

module.exports = FileRetrievalService;