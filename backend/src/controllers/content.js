/**
 * Content Controller
 * Phase 2: S3 Storage Migration - Content Retrieval API
 * 
 * Handles content retrieval operations from S3 storage for:
 * - PR narrative variants
 * - Pitch email variants
 * - All job content
 * - Presigned download URLs
 * 
 * @module controllers/content
 */

const S3StorageService = require('../services/s3StorageService');
const JobManager = require('../services/jobManager');
const FileRetrievalService = require('../services/shared/fileRetrievalService');
const logger = require('../utils/logger');

/**
 * Content Controller Class
 * Manages content retrieval from S3 storage with comprehensive error handling
 */
class ContentController {
  constructor(s3Storage = null, customLogger = null) {
    // Use provided S3 storage or create singleton instance
    this.storage = s3Storage || S3StorageService.instance;
    // SHARED SERVICE: File retrieval service for unified file operations
    this.fileRetrieval = new FileRetrievalService();
    this.logger = customLogger || logger;
  }

  /**
   * Get PR narrative for a specific market
   * GET /api/v1/content/narrative/:jobId/:market
   */
  async getNarrative(req, res) {
    const startTime = Date.now();
    const { jobId, market } = req.params;
    const format = req.query.format || 'json';

    try {
      // Validate required parameters
      if (!jobId || !market) {
        this.logger.warn('Missing required parameters for narrative retrieval', { jobId, market });
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          message: 'Both jobId and market are required',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Narrative retrieval request', { jobId, market, format });

      // Build S3 key using storage service helper
      const s3Key = this.storage.buildContentKey(jobId, 'narrative', market, format);
      
      // Retrieve content from S3
      const content = await this.storage.getJSON(s3Key);
      
      // Get metadata
      const objects = await this.storage.list(`jobs/${jobId}/content/narratives/`);
      const fileMetadata = objects.find(obj => obj.key === s3Key);

      const duration = Date.now() - startTime;
      
      this.logger.info('Narrative retrieved successfully', {
        jobId,
        market,
        format,
        duration,
        size: fileMetadata?.size
      });

      return res.status(200).json({
        success: true,
        jobId,
        market,
        type: 'narrative',
        format,
        content,
        metadata: {
          size: fileMetadata?.size,
          lastModified: fileMetadata?.lastModified
        },
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, res, 'narrative', { jobId, market, format }, startTime);
    }
  }

  /**
   * Get pitch email for a specific market
   * GET /api/v1/content/email/:jobId/:market
   */
  async getPitchEmail(req, res) {
    const startTime = Date.now();
    const { jobId, market } = req.params;
    const format = req.query.format || 'json';

    try {
      // Validate required parameters
      if (!jobId || !market) {
        this.logger.warn('Missing required parameters for pitch email retrieval', { jobId, market });
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          message: 'Both jobId and market are required',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Pitch email retrieval request', { jobId, market, format });

      // SHARED SERVICE: Use FileRetrievalService for pitch email retrieval
      const content = await this.fileRetrieval.getPitchEmail(jobId, market, format);

      const duration = Date.now() - startTime;
      
      this.logger.info('Pitch email retrieved successfully', {
        jobId,
        market,
        format,
        duration
      });

      return res.status(200).json({
        success: true,
        jobId,
        market,
        type: 'pitch',
        format,
        content,
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, res, 'pitch email', { jobId, market, format }, startTime);
    }
  }

  /**
   * Get all content for a job (all markets, both narratives and pitches)
   * GET /api/v1/content/job/:jobId/all
   */
  async getAllJobContent(req, res) {
    const startTime = Date.now();
    const { jobId } = req.params;

    try {
      // Validate required parameters
      if (!jobId) {
        this.logger.warn('Missing required parameter for job content retrieval', { jobId });
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter',
          message: 'jobId is required',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('All job content retrieval request', { jobId });

      // List all content under job
      const allObjects = await this.storage.list(`jobs/${jobId}/content/`);
      
      // Organize by market
      const marketMap = new Map();
      
      for (const obj of allObjects) {
        // Parse key to extract market and type
        // Format: jobs/{jobId}/content/{narratives|pitches}/{market}[_pitch].{format}
        const keyParts = obj.key.split('/');
        const filename = keyParts[keyParts.length - 1];
        const folder = keyParts[keyParts.length - 2]; // 'narratives' or 'pitches'
        
        // Extract market name and format
        const isPitch = filename.includes('_pitch');
        const marketName = filename
          .replace('_pitch', '')
          .replace(/\.[^.]+$/, '') // Remove extension
          .replace(/_/g, ' '); // Convert underscores back to spaces
        
        const format = filename.split('.').pop();
        
        // Initialize market entry if needed
        if (!marketMap.has(marketName)) {
          marketMap.set(marketName, {
            market: marketName,
            narrative: { formats: [], keys: {} },
            pitch: { formats: [], keys: {} }
          });
        }
        
        const marketData = marketMap.get(marketName);
        const contentType = isPitch ? 'pitch' : 'narrative';
        
        if (!marketData[contentType].formats.includes(format)) {
          marketData[contentType].formats.push(format);
        }
        marketData[contentType].keys[format] = obj.key;
      }

      const markets = Array.from(marketMap.values());
      const duration = Date.now() - startTime;
      
      this.logger.info('All job content retrieved successfully', {
        jobId,
        marketCount: markets.length,
        totalFiles: allObjects.length,
        duration
      });

      return res.status(200).json({
        success: true,
        jobId,
        markets,
        totalFiles: allObjects.length,
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, res, 'all job content', { jobId }, startTime);
    }
  }

  /**
   * Generate presigned download URL
   * GET /api/v1/content/download/:jobId/:market/:type
   */
  async getDownloadUrl(req, res) {
    const startTime = Date.now();
    const { jobId, market, type } = req.params;
    const format = req.query.format || 'json';
    const expiresIn = parseInt(req.query.expiresIn) || 3600;

    try {
      // Validate required parameters
      if (!jobId || !market || !type) {
        this.logger.warn('Missing required parameters for download URL', { jobId, market, type });
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters',
          message: 'jobId, market, and type are required',
          timestamp: new Date().toISOString()
        });
      }

      // Validate content type
      if (!['narrative', 'pitch'].includes(type)) {
        this.logger.warn('Invalid content type for download URL', { jobId, market, type });
        return res.status(400).json({
          success: false,
          error: 'Invalid content type',
          message: 'Type must be either "narrative" or "pitch"',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Download URL generation request', { jobId, market, type, format, expiresIn });

      // Build S3 key
      const s3Key = this.storage.buildContentKey(jobId, type, market, format);
      
      // Check if content exists
      const exists = await this.storage.exists(s3Key);
      if (!exists) {
        this.logger.warn('Content not found for download URL', { jobId, market, type, s3Key });
        return res.status(404).json({
          success: false,
          error: 'Content not found',
          message: `No ${type} content found for job ${jobId} and market ${market}`,
          jobId,
          market,
          type,
          timestamp: new Date().toISOString()
        });
      }
      
      // Generate presigned URL
      const downloadUrl = await this.storage.generatePresignedUrl(s3Key, expiresIn);

      const duration = Date.now() - startTime;
      
      this.logger.info('Download URL generated successfully', {
        jobId,
        market,
        type,
        format,
        expiresIn,
        duration
      });

      return res.status(200).json({
        success: true,
        jobId,
        market,
        type,
        format,
        downloadUrl,
        expiresIn,
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, res, 'download URL', { jobId, market, type, format }, startTime);
    }
  }

  /**
   * Get job status
   * GET /api/v1/content/jobs/:jobId
   * 
   * Returns job processing status including:
   * - status: pending, processing, completed, failed
   * - progress: percentage complete
   * - markets: list of markets being processed
   * - timestamps: created, updated, completed
   */
  async getJobStatus(req, res) {
    const startTime = Date.now();
    const { jobId } = req.params;

    try {
      // Validate required parameters
      if (!jobId) {
        this.logger.warn('Missing required parameter for job status', { jobId });
        return res.status(400).json({
          success: false,
          error: 'Missing required parameter',
          message: 'jobId is required',
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Job status request', { jobId });

      // CRITICAL FIX: Retrieve job from S3 Storage where genaiOrchestrator actually saves it
      // Jobs are stored at metadata/jobs/${jobId}.json, NOT in Redis/DynamoDB
      // CRITICAL FIX: S3Storage already applies 'jobs/' prefix, only need jobId
      // This matches _saveJobToStorage() in genaiOrchestrator.js
      const s3Key = `${jobId}.json`;
      
      let job;
      try {
        job = await this.storage.getJSON(s3Key);
      } catch (error) {
        if (error.name === 'NotFound' || error.message.includes('not found') || error.message.includes('ENOENT')) {
          this.logger.warn('Job not found in storage', { jobId, s3Key });
          return res.status(404).json({
            success: false,
            error: 'Job not found',
            message: `No job found with ID: ${jobId}`,
            jobId,
            timestamp: new Date().toISOString()
          });
        }
        throw error;
      }

      const duration = Date.now() - startTime;
      
      this.logger.info('Job status retrieved successfully', {
        jobId,
        status: job.status,
        duration
      });

      return res.status(200).json({
        success: true,
        jobId,
        status: job.status,
        progress: job.progress || 0,
        markets: job.markets || [],
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        error: job.error,
        duration,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return this._handleError(error, res, 'job status', { jobId }, startTime);
    }
  }

  /**
   * Handle errors with appropriate HTTP status codes
   * @private
   */
  _handleError(error, res, operation, context, startTime) {
    const duration = Date.now() - startTime;
    
    // Handle NotFound errors (404)
    if (error.name === 'NotFound' || error.message.includes('not found')) {
      this.logger.warn(`Content not found for ${operation}`, { ...context, error: error.message });
      return res.status(404).json({
        success: false,
        error: 'Content not found',
        message: `No content found for the specified ${operation}`,
        ...context,
        duration,
        timestamp: new Date().toISOString()
      });
    }
    
    // Handle Circuit Breaker errors (503)
    if (error.name === 'CircuitBreakerOpen' || error.message.includes('Circuit breaker')) {
      this.logger.error(`Circuit breaker open for ${operation}`, { ...context, error: error.message });
      return res.status(503).json({
        success: false,
        error: 'Service temporarily unavailable',
        message: 'Storage service is temporarily unavailable. Please try again later.',
        ...context,
        duration,
        timestamp: new Date().toISOString()
      });
    }
    
    // Handle all other errors (500)
    this.logger.error(`${operation} retrieval failed`, {
      ...context,
      error: error.message,
      stack: error.stack,
      duration
    });

    return res.status(500).json({
      success: false,
      error: 'Storage service error',
      message: `Failed to retrieve ${operation}`,
      ...context,
      duration,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton instance for production use
module.exports = new ContentController();
// Also export class for testing
module.exports.ContentController = ContentController;