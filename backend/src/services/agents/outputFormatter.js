const BaseAgent = require('./baseAgent');
const { logger, createAgentLoggers } = require('../../utils/logger');
const { ValidationError, ExternalServiceError } = require('../../utils/errorHandler');
const { config, isLocalStorage } = require('../../config');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const PitchEmailExtractor = require('./pitchEmailExtractor');
const legalDisclaimerService = require('../regulatory/legalDisclaimers');

// Phase 3: S3 Storage Migration - Import S3StorageService singleton
// Use centralized storage selector based on STORAGE_TYPE environment variable
const storage = require('../storageSelector');

/**
 * Output Formatter Agent
 * Handles multi-format output generation for press release content
 * 
 * Features:
 * - Multi-format output generation (DOCX, PDF, HTML, TXT, JSON)
 * - Template-based formatting with consistent styling
 * - Batch processing for 100 market variants
 * - File compression and ZIP creation for bulk downloads
 * - S3 integration for file storage and retrieval
 */
class OutputFormatter extends BaseAgent {
  constructor(name = 'OutputFormatter', options = null, lineageService = null) {
    // CRITICAL FIX: Handle null options parameter from ContentGenerationController
    const safeOptions = options || { dataSourceMode: 'crawler' };
    super(name, safeOptions, lineageService);
    
    // Initialize agent-specific logging
    this.agentLogger = createAgentLoggers('outputformatter');
    
    this.config = {
      supportedFormats: ['docx', 'pdf', 'html', 'txt', 'json', 'pitch', 'narrative'],
      maxBatchSize: 200, // ENTERPRISE SCALE FIX: Increased from 100 to 200 for 100+ market processing
      tempDir: isLocalStorage() ? path.join(config.storage.tempPath, 'pr-generation') : '/tmp/pr-generation',
      storageType: config.storage.type,
      localStoragePath: config.storage.generatedPath,
      s3Bucket: process.env.AWS_S3_BUCKET || 'Example Company-pr-content',
      s3KeyPrefix: 'generated-content/',
      compressionLevel: 6,
      fileRetentionDays: 30
    };

    // Template configurations
    this.templates = {
      html: {
        header: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <style>
        body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #c41e3a; margin-bottom: 10px; }
        .date { font-size: 14px; color: #666; }
        .title { font-size: 28px; font-weight: bold; margin: 30px 0 20px 0; text-align: center; }
        .subtitle { font-size: 18px; color: #666; text-align: center; margin-bottom: 30px; }
        .content { font-size: 16px; text-align: justify; }
        .section { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
        .section h2 { color: #c41e3a; font-size: 20px; margin-bottom: 15px; }
        .market-info { background: #f5f5f5; padding: 15px; margin: 20px 0; border-left: 4px solid #c41e3a; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 14px; color: #666; }
        .contact { margin-top: 20px; }
        p { margin-bottom: 15px; }
        .highlight { background-color: #fff3cd; padding: 2px 4px; }
        .quote { background-color: #f9f9f9; padding: 15px; border-left: 4px solid #c41e3a; font-style: italic; }
        blockquote { margin: 0; padding: 10px 20px; font-style: italic; }
        .metadata { background: #f5f5f5; padding: 15px; margin: 30px 0; border-left: 4px solid #333; font-size: 14px; }
    </style>
</head>
<body>`,
        footer: `
    <div class="footer">
        <div class="contact">
            <strong>Media Contact:</strong><br>
            Media Relations Team<br>
            Email: press@example.com<br>
            Phone: (555) 123-4567
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">
            Generated on {{generatedDate}} | Market: {{market}} | "Quality Score": {{qualityScore}}%
        </p>
    </div>
</body>
</html>`
      },
      docx: {
        styles: {
          title: { fontSize: 28, bold: true, alignment: 'center', spacing: { after: 400 } },
          subtitle: { fontSize: 18, color: '666666', alignment: 'center', spacing: { after: 600 } },
          heading: { fontSize: 16, bold: true, spacing: { before: 400, after: 200 } },
          body: { fontSize: 12, spacing: { after: 200 } },
          marketInfo: { fontSize: 11, color: '333333', shading: { fill: 'F5F5F5' } }
        }
      }
    };

    // Format-specific processors (will be initialized after dependencies are loaded)
    this.processors = {};
    
    logger.info('OutputFormatter agent created', {
      supportedFormats: this.config.supportedFormats,
      maxBatchSize: this.config.maxBatchSize
    });
  }

  /**
   * Initialize the agent and load format processors
   */
  async initialize() {
    try {
      this.agentLogger.actionStarted('initialization', {
        agentName: this.name,
        supportedFormats: this.config.supportedFormats,
        storageType: this.config.storageType,
        tempDir: this.config.tempDir
      });

      this.agentLogger.info('OUTPUT FORMATTER AGENT INITIALIZED SUCCESSFULLY');
      
      // Create temp directory if it doesn't exist
      this.agentLogger.debug('Creating temp directory', { tempDir: this.config.tempDir });
      await this._ensureTempDirectory();
      this.agentLogger.debug('Temp directory ready', { tempDir: this.config.tempDir });
      
      // Initialize format processors
      this.agentLogger.debug('Initializing format processors', {
        supportedFormats: this.config.supportedFormats
      });
      await this._initializeProcessors();
      this.agentLogger.debug('Format processors initialized successfully');
      
      // Test S3 connectivity
      if (!isLocalStorage()) {
        this.agentLogger.debug('Testing S3 connectivity', {
          bucket: this.config.s3Bucket,
          keyPrefix: this.config.s3KeyPrefix
        });
        await this._testS3Connection();
        this.agentLogger.debug('S3 connectivity confirmed');
      } else {
        this.agentLogger.debug('Using local storage, skipping S3 connectivity test');
      }
      
      logger.info('OutputFormatter agent initialized successfully', {
        supportedFormats: this.config.supportedFormats,
        tempDir: this.config.tempDir
      });

      this.agentLogger.actionCompleted('initialization', Date.now(), {
        status: 'success',
        supportedFormats: this.config.supportedFormats,
        storageType: this.config.storageType,
        s3Enabled: !isLocalStorage()
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize OutputFormatter agent', {
        error: error.message,
        stack: error.stack
      });

      this.agentLogger.actionFailed('initialization', error, {
        errorType: error.constructor.name,
        supportedFormats: this.config.supportedFormats,
        storageType: this.config.storageType
      });
      
      throw error;
    }
  }

  /**
   * Format content variants into multiple output formats
   * @param {Array} variants - Array of content variants
   * @param {Object} options - Formatting options
   * @returns {Object} Formatting results with file paths and metadata
   */
  async formatContent(variants, options = {}) {
    const startTime = Date.now();
    
    // 🔍 CRITICAL DEBUG: formatContent method entry point
    logger.info('🔍 FORMAT DEBUG: formatContent method called - ENTRY POINT', {
      jobId: options.jobId || 'unknown',
      methodName: 'formatContent',
      timestamp: new Date().toISOString(),
      callerInfo: 'OutputFormatter.formatContent',
      optionsKeys: Object.keys(options),
      formatValue: options.formats,
      isPitchRequest: options.formats?.includes('pitch'),
      isJsonRequest: options.formats?.includes('json')
    });

    // 🔧 CRITICAL FIX: Ensure processors are initialized before use
    if (!this.processors || Object.keys(this.processors).length === 0) {
      logger.warn('🔧 PROCESSOR FIX: Processors not initialized, initializing now', {
        jobId: options.jobId || 'unknown',
        processorsExists: !!this.processors,
        processorsKeys: this.processors ? Object.keys(this.processors) : 'UNDEFINED'
      });
      
      // CRITICAL FIX: Ensure processors are initialized before use
      if (!this.processors || Object.keys(this.processors).length === 0) {
        logger.warn('🔍 PROCESSORS NOT INITIALIZED: Calling initialize() automatically', {
          jobId: options.jobId || 'unknown',
          processorsExists: !!this.processors,
          processorsKeys: this.processors ? Object.keys(this.processors) : [],
          timestamp: new Date().toISOString()
        });
        await this.initialize();
        
        logger.info('🔍 PROCESSORS INITIALIZED: After automatic initialization', {
          jobId: options.jobId || 'unknown',
          processorsExists: !!this.processors,
          processorsKeys: this.processors ? Object.keys(this.processors) : [],
          processorsCount: this.processors ? Object.keys(this.processors).length : 0
        });
      }
      
      try {
        await this.initialize();
        logger.info('🔧 PROCESSOR FIX: Initialization completed successfully', {
          jobId: options.jobId || 'unknown',
          availableProcessors: Object.keys(this.processors)
        });
      } catch (error) {
        logger.error('🔧 PROCESSOR FIX: Initialization failed', {
          jobId: options.jobId || 'unknown',
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    }

    // DIAGNOSTIC LOGGING: Capture variants parameter state for debugging
    logger.error('DIAGNOSTIC: OutputFormatter.formatContent called with variants parameter', {
      variantsType: typeof variants,
      variantsIsArray: Array.isArray(variants),
      variantsIsNull: variants === null,
      variantsIsUndefined: variants === undefined,
      variantsLength: variants ? (variants.length || 'no length property') : 'variants is falsy',
      variantsKeys: variants ? Object.keys(variants) : 'variants is falsy',
      optionsJobId: options.jobId,
      optionsFormats: options.formats
    });
    
    // CRITICAL FIX: Ensure we use the provided jobId and don't generate a new UUID
    // The GenAI Orchestrator passes jobId in options, we must use it consistently
    if (!options.jobId) {
      logger.error('CRITICAL: No jobId provided to OutputFormatter - this will cause file mapping issues', {
        options,
        optionsKeys: Object.keys(options)
      });
      // Generate a fallback UUID but log the issue
      const fallbackJobId = uuidv4();
      logger.warn('Using fallback UUID for jobId', { fallbackJobId });
      options.jobId = fallbackJobId;
    }
    
    const jobId = options.jobId;
    
    // 🔍 DEBUG: Enhanced logging for dual output debugging
    logger.info('🔍 DEBUG: OutputFormatter formatContent called', {
      providedJobId: options.jobId,
      finalJobId: jobId,
      usingProvidedId: !!options.jobId,
      generatedNewId: false,
      requestedFormats: options.formats,
      variantsCount: variants?.length || 0,
      isPitchRequest: options.formats?.includes('pitch'),
      isJsonRequest: options.formats?.includes('json')
    });
    
    try {
      // DEFENSIVE PROGRAMMING: Handle undefined variants in logging
      const safeVariantCount = variants && typeof variants.length !== 'undefined' ? variants.length : 'undefined';
      
      this.agentLogger.actionStarted('content-formatting', {
        jobId,
        variantCount: safeVariantCount,
        variantsType: typeof variants,
        variantsIsArray: Array.isArray(variants),
        requestedFormats: options.formats || this.config.supportedFormats,
        storageType: this.config.storageType,
        uploadToS3: options.uploadToS3 !== false
      });

      logger.info('Starting content formatting', {
        jobId,
        variantCount: safeVariantCount,
        variantsType: typeof variants,
        variantsIsArray: Array.isArray(variants),
        formats: options.formats || this.config.supportedFormats,
        options
      });

      // CRITICAL INPUT VALIDATION: Handle undefined/invalid variants
      if (!variants) {
        const error = new Error('CRITICAL: variants parameter is undefined or null - cannot proceed with formatting');
        logger.error('OutputFormatter received undefined variants', {
          jobId,
          variantsType: typeof variants,
          variantsValue: variants,
          optionsFormats: options.formats,
          stackTrace: new Error().stack
        });
        throw error;
      }
      
      if (!Array.isArray(variants)) {
        const error = new Error('CRITICAL: variants parameter is not an array - expected array of content variants');
        logger.error('OutputFormatter received non-array variants', {
          jobId,
          variantsType: typeof variants,
          variantsIsArray: Array.isArray(variants),
          variantsKeys: Object.keys(variants),
          optionsFormats: options.formats
        });
        throw error;
      }
      
      if (variants.length === 0) {
        const error = new Error('CRITICAL: variants array is empty - no content to format');
        logger.error('OutputFormatter received empty variants array', {
          jobId,
          variantsLength: variants.length,
          optionsFormats: options.formats
        });
        throw error;
      }

      // Validate inputs
      this.agentLogger.debug('Validating format request inputs', { jobId });
      this._validateFormatRequest(variants, options);
      this.agentLogger.debug('Input validation completed successfully', { jobId });

      const formats = options.formats || this.config.supportedFormats;
      // CRITICAL: Extract actual data source from variants for accurate metadata tracking
      let actualDataSourceUsed = null;
      let dataSourceExecutionConfirmed = false;
      let dataSourceTimestamp = null;
      let perplexityApiCalls = 0;
      let perplexityResponseTime = null;
      
      // Check if variants contain actual data source information
      if (variants && Array.isArray(variants) && variants.length > 0) {
        // Look for data source information in the first variant's market data
        const firstVariant = variants[0];
        if (firstVariant && firstVariant.marketData) {
          // Check each market's data for actual data source tracking
          for (const [market, marketInfo] of Object.entries(firstVariant.marketData)) {
            if (marketInfo && marketInfo.actualDataSourceUsed) {
              actualDataSourceUsed = marketInfo.actualDataSourceUsed;
              dataSourceExecutionConfirmed = marketInfo.dataSourceExecutionConfirmed || false;
              dataSourceTimestamp = marketInfo.dataSourceTimestamp;
              
              // PERPLEXITY INTEGRATION: Extract Perplexity-specific metrics
              if (actualDataSourceUsed === 'perplexity' || actualDataSourceUsed === 'ai') {
                perplexityApiCalls = marketInfo.perplexityApiCalls || marketInfo.apiCalls || 0;
                perplexityResponseTime = marketInfo.perplexityResponseTime || marketInfo.responseTime || null;
                
                logger.info('🔍 PERPLEXITY METADATA EXTRACTION: Found Perplexity metrics in market data', {
                  jobId,
                  market,
                  actualDataSourceUsed,
                  dataSourceExecutionConfirmed,
                  dataSourceTimestamp,
                  perplexityApiCalls,
                  perplexityResponseTime
                });
              }
              
              break; // Use the first confirmed data source found
            }
          }
        }
        
        // PERPLEXITY INTEGRATION: Also check variant-level metadata for Perplexity tracking
        if (firstVariant && firstVariant.metadata) {
          const variantMetadata = firstVariant.metadata;
          if (variantMetadata.actualDataSourceUsed === 'perplexity' || variantMetadata.actualDataSourceUsed === 'ai') {
            actualDataSourceUsed = variantMetadata.actualDataSourceUsed;
            dataSourceExecutionConfirmed = variantMetadata.dataSourceExecutionConfirmed || false;
            dataSourceTimestamp = variantMetadata.dataSourceTimestamp;
            perplexityApiCalls = variantMetadata.perplexityApiCalls || variantMetadata.apiCalls || 0;
            perplexityResponseTime = variantMetadata.perplexityResponseTime || variantMetadata.responseTime || null;
            
            logger.info('🔍 PERPLEXITY METADATA EXTRACTION: Found Perplexity metrics in variant metadata', {
              jobId,
              actualDataSourceUsed,
              dataSourceExecutionConfirmed,
              dataSourceTimestamp,
              perplexityApiCalls,
              perplexityResponseTime
            });
          }
        }
      }

      const results = {
        jobId,
        status: 'processing',
        formats: {},
        files: [],
        metadata: {
          startTime,
          variantCount: safeVariantCount,
          requestedFormats: formats,
          // CRITICAL: Only include data source if it was actually executed and confirmed
          ...(actualDataSourceUsed && dataSourceExecutionConfirmed ? {
            actualDataSourceUsed: actualDataSourceUsed,
            dataSourceExecutionConfirmed: dataSourceExecutionConfirmed,
            dataSourceTimestamp: dataSourceTimestamp,
            // PERPLEXITY INTEGRATION: Include Perplexity-specific metrics when available
            ...(actualDataSourceUsed === 'perplexity' || actualDataSourceUsed === 'ai' ? {
              perplexityApiCalls: perplexityApiCalls,
              perplexityResponseTime: perplexityResponseTime,
              perplexityMetricsAvailable: true
            } : {})
          } : {})
        }
      };

      // Log data source tracking for debugging
      logger.info('🔍 DATA SOURCE TRACKING: OutputFormatter metadata assembly', {
        jobId,
        actualDataSourceUsed,
        dataSourceExecutionConfirmed,
        dataSourceTimestamp,
        metadataIncludesDataSource: !!(actualDataSourceUsed && dataSourceExecutionConfirmed),
        variantCount: safeVariantCount
      });

      this.agentLogger.debug('Starting format processing loop', {
        jobId,
        formatsToProcess: formats,
        formatCount: formats.length
      });

      // Process each format
      for (const format of formats) {
        try {
          this.agentLogger.debug(`Starting format processing: ${format}`, {
            jobId,
            format,
            variantCount: variants.length
          });
          
          logger.debug(`Processing format: ${format}`, { jobId });
          
          const formatResult = await this._processFormat(variants, format, options);
          results.formats[format] = formatResult;
          results.files.push(...formatResult.files);
          
          this.agentLogger.debug(`Format processing completed: ${format}`, {
            jobId,
            format,
            fileCount: formatResult.files.length,
            status: formatResult.status || 'success'
          });
          
          logger.debug(`Format ${format} processed successfully`, {
            jobId,
            fileCount: formatResult.files.length
          });
        } catch (error) {
          this.agentLogger.error(`Format processing failed: ${format}`, error, {
            jobId,
            format,
            errorType: error.constructor.name,
            variantCount: variants.length
          });
          
          logger.error(`Failed to process format: ${format}`, {
            jobId,
            format,
            error: error.message
          });
          
          results.formats[format] = {
            status: 'failed',
            error: error.message,
            files: []
          };
        }
      }

      // Create ZIP archive if multiple formats or variants
      if (formats.length > 1 || (variants && variants.length > 1)) {
        this.agentLogger.debug('Creating ZIP archive', {
          jobId,
          fileCount: results.files.length,
          formatCount: formats.length,
          variantCount: safeVariantCount
        });
        
        const zipResult = await this._createZipArchive(results.files, jobId, options);
        results.zipFile = zipResult;
        
        this.agentLogger.debug('ZIP archive created successfully', {
          jobId,
          zipFileSize: zipResult.size,
          zipFilePath: zipResult.path
        });
      } else {
        this.agentLogger.debug('Skipping ZIP creation - single format and variant', {
          jobId,
          formatCount: formats.length,
          variantCount: safeVariantCount
        });
      }

      // Copy files to permanent storage
      this.agentLogger.debug('Starting file copy to permanent storage', {
        jobId,
        fileCount: results.files.length,
        storageType: this.config.storageType
      });
      await this._copyToStorage(results, jobId);
      this.agentLogger.debug('File copy to permanent storage completed', { jobId });

      // Phase 3: S3 upload deprecated - files are now written directly to S3 in format writers
      if (options.uploadToS3 !== false) {
        this.agentLogger.debug('Phase 3: Skipping legacy S3 upload - files already in S3', {
          jobId,
          fileCount: results.files.length,
          reason: 'Files written directly to S3 in format writers'
        });
      }

      // Calculate final metrics
      const duration = Date.now() - startTime;
      results.status = 'completed';
      results.metadata.duration = duration;
      results.metadata.completedAt = new Date().toISOString();

      logger.info('Content formatting completed', {
        jobId,
        duration,
        totalFiles: results.files.length,
        formats: Object.keys(results.formats)
      });

      this.agentLogger.actionCompleted('content-formatting', duration, {
        jobId,
        status: 'success',
        metrics: {
          totalFiles: results.files.length,
          formatsProcessed: Object.keys(results.formats),
          successfulFormats: Object.keys(results.formats).filter(f => results.formats[f].status !== 'failed'),
          failedFormats: Object.keys(results.formats).filter(f => results.formats[f].status === 'failed'),
          processingTimeMs: duration,
          hasZipFile: !!results.zipFile,
          uploadedToS3: options.uploadToS3 !== false,
          storageType: this.config.storageType
        }
      });

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // DEFENSIVE PROGRAMMING: Handle undefined variants in error logging
      const safeVariantCount = variants && typeof variants.length !== 'undefined' ? variants.length : 'undefined';
      
      this.agentLogger.actionFailed('content-formatting', error, {
        jobId,
        errorType: error.constructor.name,
        processingTimeMs: duration,
        variantCount: safeVariantCount,
        variantsType: typeof variants,
        variantsIsArray: Array.isArray(variants),
        requestedFormats: options.formats || this.config.supportedFormats,
        storageType: this.config.storageType
      });
      logger.error('Content formatting failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        jobId,
        status: 'failed',
        error: error.message,
        metadata: {
          startTime,
          duration: Date.now() - startTime,
          failedAt: new Date().toISOString()
        }
      };
    }
  }

  /**
   * Get formatted content from storage (local or S3)
   * @param {string} jobId - Job identifier
   * @param {Object} options - Retrieval options
   * @returns {Object} Content retrieval results
   */
  async getFormattedContent(jobId, options = {}) {
    try {
      logger.debug('Retrieving formatted content', { jobId, options });

      if (isLocalStorage()) {
        return await this._getLocalFormattedContent(jobId, options);
      } else {
        return await this._getS3FormattedContent(jobId, options);
      }

    } catch (error) {
      logger.error('Failed to retrieve formatted content', {
        jobId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get formatted content from local storage
   * @private
   */
  async _getLocalFormattedContent(jobId, options = {}) {
    const jobDir = path.join(this.config.localStoragePath, jobId);
    
    try {
      const stats = await fs.stat(jobDir);
      if (!stats.isDirectory()) {
        throw new ValidationError(`No formatted content found for job: ${jobId}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new ValidationError(`No formatted content found for job: ${jobId}`);
      }
      throw error;
    }

    const files = [];
    const entries = await fs.readdir(jobDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(jobDir, entry.name);
        const stats = await fs.stat(filePath);
        files.push({
          key: entry.name,
          path: filePath,
          size: stats.size,
          lastModified: stats.mtime,
          url: `/api/v1/content/download/${jobId}/${entry.name}` // Local download URL
        });
      }
    }

    return {
      jobId,
      files,
      metadata: {
        retrievedAt: new Date().toISOString(),
        fileCount: files.length,
        storageType: 'local'
      }
    };
  }

  /**
   * Get formatted content from S3
   * @private
   */
  async _getS3FormattedContent(jobId, options = {}) {
    const s3Key = `${this.config.s3KeyPrefix}${jobId}/`;
    const objects = await storage.listObjects({
      Bucket: this.config.s3Bucket,
      Prefix: s3Key
    });

    if (!objects.Contents || objects.Contents.length === 0) {
      throw new ValidationError(`No formatted content found for job: ${jobId}`);
    }

    const files = objects.Contents.map(obj => ({
      key: obj.Key,
      size: obj.Size,
      lastModified: obj.LastModified,
      url: storage.getSignedUrl('getObject', {
        Bucket: this.config.s3Bucket,
        Key: obj.Key,
        Expires: 3600 // 1 hour
      })
    }));

    return {
      jobId,
      files,
      metadata: {
        retrievedAt: new Date().toISOString(),
        fileCount: files.length,
        storageType: 'cloud'
      }
    };
  }

  /**
   * Clean up temporary files and old S3 objects
   * @param {string} jobId - Optional specific job to clean
   */
  async cleanup(jobId = null) {
    try {
      logger.info('Starting cleanup', { jobId });

      // Clean local temp files
      if (jobId) {
        const jobTempDir = path.join(this.config.tempDir, jobId);
        await this._removeDirectory(jobTempDir);
      } else {
        // Clean old temp files
        await this._cleanOldTempFiles();
      }

      // Clean old S3 objects
      await this._cleanOldS3Objects();

      logger.info('Cleanup completed', { jobId });

    } catch (error) {
      logger.error('Cleanup failed', {
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Initialize format processors
   */
  async _initializeProcessors() {
    try {
      // Initialize processors for each format
      // Note: Some dependencies might not be available yet during development
      
      this.processors.json = this._processJSON.bind(this);
      this.processors.txt = this._processTXT.bind(this);
      this.processors.html = this._processHTML.bind(this);
      this.processors.pitch = this._processPitch.bind(this);
      this.processors.narrative = this._processNarrative.bind(this);
      
      // Try to initialize DOCX processor
      try {
        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
        this.processors.docx = this._processDOCX.bind(this);
        this.docxClasses = { Document, Packer, Paragraph, TextRun, HeadingLevel };
      } catch (error) {
        logger.warn('DOCX processor not available', { error: error.message });
      }

      // Try to initialize PDF processor
      try {
        const puppeteer = require('puppeteer');
        this.processors.pdf = this._processPDF.bind(this);
        this.puppeteer = puppeteer;
      } catch (error) {
        logger.warn('PDF processor not available', { error: error.message });
      }

      logger.info('Format processors initialized', {
        availableProcessors: Object.keys(this.processors)
      });

    } catch (error) {
      logger.error('Failed to initialize processors', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process format for all variants
   */
  async _processFormat(variants, format, options) {
    // 🔍 CRITICAL DEBUG: Processor availability check
    logger.info('🔍 FORMAT DEBUG: _processFormat called', {
      jobId: options.jobId || 'unknown',
      format,
      processorsExists: !!this.processors,
      processorsKeys: this.processors ? Object.keys(this.processors) : 'PROCESSORS_UNDEFINED',
      processorForFormat: this.processors ? this.processors[format] : 'PROCESSORS_UNDEFINED',
      processorType: this.processors && this.processors[format] ? typeof this.processors[format] : 'UNDEFINED',
      allProcessorsAvailable: this.processors ? Object.keys(this.processors) : []
    });

    if (!this.processors[format]) {
      logger.error('🔍 FORMAT DEBUG: CRITICAL ERROR - Processor not found', {
        jobId: options.jobId || 'unknown',
        format,
        requestedFormat: format,
        processorsObject: this.processors,
        processorsKeys: this.processors ? Object.keys(this.processors) : 'PROCESSORS_UNDEFINED',
        processorExists: !!this.processors,
        formatInProcessors: this.processors ? (format in this.processors) : false,
        processorValue: this.processors ? this.processors[format] : 'PROCESSORS_UNDEFINED'
      });
      throw new ValidationError(`Unsupported format: ${format}`);
    }

    const files = [];
    const errors = [];

    // Filter out failed variants before processing
    const validVariants = variants.filter(variant => variant.status !== 'failed');
    
    logger.debug(`Processing ${validVariants.length} valid variants out of ${variants.length} total`, {
      format,
      jobId: options.jobId
    });

    for (const variant of validVariants) {
      try {
        const file = await this.processors[format](variant, options);
        files.push(file);
      } catch (error) {
        logger.error(`Failed to process variant for format ${format}`, {
          market: variant.market,
          format,
          error: error.message
        });
        errors.push({
          market: variant.market,
          error: error.message
        });
      }
    }

    return {
      status: errors.length === 0 ? 'success' : 'partial',
      files,
      errors,
      metadata: {
        processedCount: files.length,
        errorCount: errors.length,
        skippedCount: variants.length - validVariants.length
      }
    };
  }

  /**
   * Process JSON format
   */
  async _processJSON(variant, options) {
    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // LEGAL DISCLAIMER INTEGRATION: Generate disclaimers for this market
    logger.debug('Generating legal disclaimers for market', {
      market: variant.market,
      jobId
    });
    
    const dataSourcesUsed = this._extractDataSources(variant);
    const disclaimers = legalDisclaimerService.generateDisclaimers(variant.market, dataSourcesUsed);
    
    logger.debug('Legal disclaimers generated', {
      market: variant.market,
      jobId,
      hasHeader: !!disclaimers.header,
      hasFooter: !!disclaimers.footer,
      hasAttributions: !!disclaimers.attributions,
      hasContact: !!disclaimers.contact
    });

    // PHASE 2 ENHANCEMENT: AP-style narrative-focused JSON processing
    logger.debug('Processing JSON format with Phase 2 narrative preservation and AP-style structure', {
      market: variant.market,
      jobId
    });
    
    // Extract complete content with enhanced processing
    let contentText = '';
    let rawContentObject = null;
    
    // Get the raw content object for JSON structure
    if (variant.content && typeof variant.content === 'object' && variant.content.rawContent) {
      rawContentObject = variant.content.rawContent;
    } else if (variant.rawContent) {
      rawContentObject = variant.rawContent;
    }
    
    // Extract the actual text content from the raw content
    if (rawContentObject && rawContentObject.content) {
      contentText = rawContentObject.content;
      logger.debug('Using direct raw content text', {
        contentLength: contentText.length,
        source: 'rawContent.content direct access'
      });
    } else {
      // Fallback to the string extraction method
      contentText = this._extractStringContent(variant.content);
      logger.debug('Fallback to string extraction', {
        contentLength: contentText.length,
        source: 'extractStringContent fallback'
      });
    }
    
    const masterPR = options.masterPR || variant.metadata?.masterPR || '';
    const qualityScore = variant.metadata?.qualityScore || 'N/A';
    const generatedDate = new Date().toISOString();
    
    // PHASE 2 CRITICAL: Extract content as flowing narrative, eliminating section structure
    logger.debug('Extracting AP-style narrative content with Phase 2 enhancements', {
      contentLength: contentText.length
    });
    
    // Extract compelling headline with local context
    const headline = this._extractCompellingHeadline(contentText, variant.market);
    
    // Extract lead paragraph with AP-style requirements
    const leadParagraph = this._extractAPStyleLeadParagraph(contentText, variant.market);
    
    // Extract flowing narrative paragraphs (no sections)
    const narrativeParagraphs = this._extractFlowingNarrativeParagraphs(contentText);
    
    // Extract enhanced expert quote with local context
    const expertQuote = this._extractLocalExpertQuote(contentText, variant.market);
    
    // Extract human interest elements
    const humanInterestElements = this._extractHumanInterestElements(contentText);
    
    // Extract local data points and neighborhood references
    const localDataPoints = this._extractLocalDataPoints(contentText, variant.market);
    const neighborhoodReferences = this._extractNeighborhoodReferences(contentText, variant.market);
    
    // Log Phase 2 extraction results
    logger.debug('Phase 2 narrative extraction results', {
      market: variant.market,
      headlineLength: headline?.length || 0,
      leadParagraphLength: leadParagraph?.length || 0,
      narrativeParagraphCount: narrativeParagraphs.length,
      expertQuoteLength: expertQuote?.length || 0,
      humanInterestCount: humanInterestElements.length,
      localDataPointsCount: localDataPoints.length,
      neighborhoodReferencesCount: neighborhoodReferences.length
    });

    // Create enhanced JSON content with AP-style structure AND legal disclaimers
    const jsonContent = {
      market: variant.market,
      headline: headline,
      // LEGAL DISCLAIMER: Add header disclaimers
      legalDisclaimers: {
        header: disclaimers.header,
        footer: disclaimers.footer,
        attributions: disclaimers.attributions,
        contact: disclaimers.contact
      },
      content: {
        // AP-style lead paragraph (most important information first)
        leadParagraph: leadParagraph,
        
        // Flowing narrative body (no section headers)
        narrativeBody: narrativeParagraphs.join('\n\n'),
        bodyParagraphs: narrativeParagraphs,
        
        // Enhanced expert quote with local context
        expertQuote: expertQuote,
        
        // Human interest elements for engagement
        humanInterest: humanInterestElements,
        
        // Local market context
        localDataPoints: localDataPoints,
        neighborhoodReferences: neighborhoodReferences,
        
        // Complete narrative flow
        fullNarrative: [leadParagraph, ...narrativeParagraphs].filter(p => p).join('\n\n'),
        
        // Preserve full content for compatibility
        fullContent: contentText
      },
      
      // Style and structure analysis
      styleAnalysis: {
        apStyleCompliance: this._assessAPStyleCompliance(contentText),
        narrativeFlow: this._assessNarrativeFlow(contentText),
        localAuthenticity: this._assessLocalAuthenticity(contentText, variant.market),
        humanInterestScore: humanInterestElements.length > 0 ? 85 : 45
      },
      
      rawContent: variant.content,
      metadata: {
        ...variant.metadata,
        format: 'json',
        generatedAt: generatedDate,
        qualityScore: qualityScore,
        masterPR: masterPR.substring(0, 100) + (masterPR.length > 100 ? '...' : ''),
        // LEGAL DISCLAIMER: Track disclaimer inclusion
        legalDisclaimersIncluded: true,
        disclaimerDataSources: dataSourcesUsed,
        
        // Phase 2 metadata enhancements
        narrativeStructure: true,
        apStyleFormatting: true,
        paragraphCount: narrativeParagraphs.length,
        hasCompellingLead: leadParagraph && leadParagraph.length > 100,
        hasLocalContext: neighborhoodReferences.length > 0,
        hasHumanInterest: humanInterestElements.length > 0,
        hasExpertQuote: expertQuote && expertQuote.length > 50
      }
    };

    // CRITICAL FIX: Validate content before writing to prevent empty files
    const fullNarrativeLength = jsonContent.content.fullNarrative?.length || 0;
    const fullContentLength = jsonContent.content.fullContent?.length || 0;
    
    if (!jsonContent.content.fullNarrative || fullNarrativeLength < 100) {
      logger.error('❌ CONTENT VALIDATION FAILED: Cannot write JSON file - content is empty or too short', {
        market: variant.market,
        jobId,
        fullNarrativeLength,
        fullContentLength,
        hasContent: !!jsonContent.content.fullNarrative,
        minRequired: 100
      });
      throw new Error(`Cannot write file for ${variant.market}: fullNarrative content is empty or invalid (length: ${fullNarrativeLength}, required: 100+)`);
    }
    
    if (!jsonContent.content.fullContent || fullContentLength < 100) {
      logger.error('❌ CONTENT VALIDATION FAILED: Cannot write JSON file - fullContent is empty or too short', {
        market: variant.market,
        jobId,
        fullContentLength,
        hasContent: !!jsonContent.content.fullContent,
        minRequired: 100
      });
      throw new Error(`Cannot write file for ${variant.market}: fullContent is empty or invalid (length: ${fullContentLength}, required: 100+)`);
    }
    
    logger.info('✅ CONTENT VALIDATION PASSED: Writing JSON file with valid content', {
      market: variant.market,
      jobId,
      fullNarrativeLength,
      fullContentLength,
      fileName,
      validationPassed: true
    });

    // Phase 3: S3 Storage Migration - Write directly to S3
    const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'json');
    
    logger.info('Phase 3: Writing JSON content to S3', {
      jobId,
      market: variant.market,
      s3Key,
      contentSize: JSON.stringify(jsonContent, null, 2).length
    });
    
    const s3Result = await storage.putJSON(s3Key, jsonContent);
    
    logger.info('Phase 3: JSON content written to S3 successfully', {
      jobId,
      market: variant.market,
      s3Key: s3Result.key,
      size: s3Result.size
    });

    return {
      format: 'json',
      fileName,
      filePath, // Keep for backward compatibility
      s3Key: s3Result.key,
      size: s3Result.size,
      market: variant.market
    };
  }

  /**
   * Extract string content from potentially nested objects
   * @private
   */
  _extractStringContent(obj, depth = 0) {
    if (depth > 5) return 'Content extraction failed - maximum depth exceeded'; // Prevent infinite recursion
    
    if (typeof obj === 'string') {
      return obj;
    }
    
    if (!obj || typeof obj !== 'object') {
      return String(obj || '');
    }
    
    // ENHANCED: Try common content property names in priority order
    const contentKeys = ['content', 'rawContent', 'text', 'body', 'message', 'data'];
    for (const key of contentKeys) {
      if (obj[key]) {
        const extracted = this._extractStringContent(obj[key], depth + 1);
        if (extracted && typeof extracted === 'string' && extracted.length > 10) {
          return extracted;
        }
      }
    }
    
    // ENHANCED: Special handling for the variant structure we see in the JSON
    // Check if this looks like a variant object with nested content structure
    if (obj.rawContent && obj.rawContent.content) {
      const extracted = this._extractStringContent(obj.rawContent.content, depth + 1);
      if (extracted && typeof extracted === 'string' && extracted.length > 10) {
        return extracted;
      }
    }
    
    // Check if this is the content object with rawContent field
    if (obj.content && obj.content.rawContent && obj.content.rawContent.content) {
      const extracted = this._extractStringContent(obj.content.rawContent.content, depth + 1);
      if (extracted && typeof extracted === 'string' && extracted.length > 10) {
        return extracted;
      }
    }
    
    // If no content found, return a safe default
    logger.debug('OutputFormatter: Failed to extract content from object', {
      objectKeys: Object.keys(obj),
      objectType: typeof obj,
      depth,
      hasRawContent: !!(obj.rawContent),
      hasContent: !!(obj.content),
      hasNestedContent: !!(obj.content && obj.content.rawContent)
    });
    return 'Content extraction failed - please check data structure';
  }

  /**
   * Process TXT format
   */
  async _processTXT(variant, options) {
    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // LEGAL DISCLAIMER INTEGRATION: Generate disclaimers for this market
    logger.debug('Generating legal disclaimers for TXT format', {
      market: variant.market,
      jobId
    });
    
    const dataSourcesUsed = this._extractDataSources(variant);
    const disclaimers = legalDisclaimerService.generateDisclaimers(variant.market, dataSourcesUsed);
    
    logger.debug('Legal disclaimers generated for TXT', {
      market: variant.market,
      jobId,
      hasHeader: !!disclaimers.header,
      hasFooter: !!disclaimers.footer
    });

    // CRITICAL FIX: Use the complete rawContent if available, otherwise extract from content
    let fullContent = '';
    let contentText = '';
    let rawContentObject = null;
    
    // First, try to get the complete content from rawContent (which contains the full press release)
    // Get the raw content object for TXT structure - same approach as JSON
    if (variant.content && typeof variant.content === 'object' && variant.content.rawContent) {
      rawContentObject = variant.content.rawContent;
    } else if (variant.rawContent) {
      rawContentObject = variant.rawContent;
    }
    
    // Extract the actual text content from the raw content
    if (rawContentObject && rawContentObject.content) {
      contentText = rawContentObject.content;
      logger.debug('Using direct raw content text for TXT format', {
        contentLength: contentText.length,
        source: 'rawContent.content direct access'
      });
    } else {
      // Fallback to the string extraction method
      contentText = this._extractStringContent(variant.content);
      logger.debug('Fallback to string extraction for TXT format', {
        contentLength: contentText.length,
        source: 'extractStringContent fallback'
      });
    }
    
    fullContent = contentText;
    
    // CRITICAL FIX: Check for Business Wire format from LocalizationEngine
    // LocalizationEngine applies "FOR IMMEDIATE RELEASE" not "PRESS RELEASE"
    const hasBusinessWireFormat = fullContent && fullContent.length > 500 &&
                                  fullContent.includes('FOR IMMEDIATE RELEASE');
    
    logger.info('[OutputFormatter._processTXT] Business Wire format detection', {
      jobId,
      market: variant.market,
      contentLength: fullContent?.length || 0,
      hasBusinessWireFormat,
      checkingFor: 'FOR IMMEDIATE RELEASE',
      foundInContent: fullContent?.includes('FOR IMMEDIATE RELEASE') || false
    });
    
    // If we have Business Wire formatted content from LocalizationEngine, preserve it
    if (hasBusinessWireFormat) {
      logger.info('[OutputFormatter._processTXT] ✅ PRESERVING Business Wire format from LocalizationEngine', {
        jobId,
        market: variant.market,
        contentLength: fullContent.length,
        preservedFormat: 'Business Wire Narrative',
        source: 'LocalizationEngine'
      });
      
      // Add metadata footer to the complete content
      const masterPR = options.masterPR || variant.metadata?.masterPR || '';
      const qualityScore = variant.metadata?.qualityScore || 'N/A';
      const generatedDate = new Date().toISOString();
      
      const txtContent = fullContent + '\n\n' + [
        '='.repeat(50),
        'METADATA',
        `-Market: ${variant.market}`,
        `-Quality Score: ${qualityScore}%`,
        `-Generated: ${generatedDate}`,
        `-Format: Business Wire Narrative (Preserved from LocalizationEngine)`,
        `-Master PR: ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}`
      ].join('\n');

      // Phase 3: S3 Storage Migration - Write directly to S3
      const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'txt');
      
      logger.info('Phase 3: Writing TXT content to S3', {
        jobId,
        market: variant.market,
        s3Key,
        contentSize: txtContent.length
      });
      
      const s3Result = await storage.put(s3Key, txtContent);
      
      logger.info('[OutputFormatter._processTXT] ✅ Business Wire format preserved and written to S3', {
        jobId,
        market: variant.market,
        fileName,
        s3Key: s3Result.key,
        finalContentLength: txtContent.length,
        size: s3Result.size
      });

      return {
        format: 'txt',
        fileName,
        filePath, // Keep for backward compatibility
        s3Key: s3Result.key,
        size: s3Result.size,
        market: variant.market,
        preservedBusinessWireFormat: true
      };
    }
    
    // If no Business Wire format found, log warning and create structured format
    logger.warn('[OutputFormatter._processTXT] ⚠️ No Business Wire format found - creating structured format', {
      jobId,
      market: variant.market,
      contentLength: fullContent?.length || 0,
      expectedFormat: 'FOR IMMEDIATE RELEASE',
      willCreateStructured: true
    });
    
    // Parse the content into sections using the same approach as JSON
    logger.debug('Extracting structured sections from content for TXT format', {
      contentLength: contentText.length
    });
    
    // Parse the content into sections
    const sections = this._parseContentIntoSections(contentText);
    
    const masterPR = options.masterPR || variant.metadata?.masterPR || '';
    const qualityScore = variant.metadata?.qualityScore || 'N/A';
    const generatedDate = new Date().toISOString();
    
    // Extract headline - either from the parsed sections or using the fallback method
    const headline = sections.headline || this._extractHeadline(contentText);
    
    // Extract summary - use the business wire paragraph or fallback
    let summary = '';
    
    // Direct extraction of the Business Wire paragraph from the raw content
    if (contentText.includes('BUSINESS WIRE')) {
      // Look for the complete paragraph after BUSINESS WIRE
      const businessWireMatch = contentText.match(/[A-Z]+--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\nKEY\s+LOCAL\s+HIGHLIGHTS|\n\n")/i);
      if (businessWireMatch && businessWireMatch[1] && businessWireMatch[1].trim().length > 20) {
        summary = businessWireMatch[1].trim();
        logger.debug('Found Business Wire summary paragraph for TXT', {
          length: summary.length,
          preview: summary.substring(0, 50) + (summary.length > 50 ? '...' : '')
        });
      } else {
        // Try alternative Business Wire pattern
        const altBusinessWireMatch = contentText.match(/--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\nKEY\s+LOCAL\s+HIGHLIGHTS|\n\n")/i);
        if (altBusinessWireMatch && altBusinessWireMatch[1] && altBusinessWireMatch[1].trim().length > 20) {
          summary = altBusinessWireMatch[1].trim();
          logger.debug('Found alternative Business Wire summary for TXT', {
            length: summary.length,
            preview: summary.substring(0, 50) + (summary.length > 50 ? '...' : '')
          });
        }
      }
    }
    
    // If no Business Wire paragraph found, use other methods
    if (!summary || summary.length < 20) {
      summary = sections.summary || this._extractSummary(contentText);
    }
    
    // DIRECT EXTRACTION of Market Details section
    let marketDetails = '';
    const marketDynamicsMatch = contentText.match(/MARKET\s+DYNAMICS:\s*\n([^]*?)(?=\n\nFINANCING\s+TRENDS)/i);
    if (marketDynamicsMatch && marketDynamicsMatch[1]) {
      marketDetails = marketDynamicsMatch[1].trim();
      logger.debug('Found Market Dynamics section for TXT', {
        length: marketDetails.length,
        preview: marketDetails.substring(0, 50) + (marketDetails.length > 50 ? '...' : '')
      });
    } else {
      marketDetails = sections.marketDynamics || '';
    }
    
    // DIRECT EXTRACTION of Local Highlights section
    let localHighlights = '';
    const localHighlightsMatch = contentText.match(/KEY\s+LOCAL\s+HIGHLIGHTS:\s*\n((?:[-•*][^\n]*\n)+)(?=\n\n)/i);
    if (localHighlightsMatch && localHighlightsMatch[1]) {
      localHighlights = localHighlightsMatch[1].trim();
      logger.debug('Found Local Highlights section for TXT', {
        length: localHighlights.length,
        preview: localHighlights.substring(0, 50) + (localHighlights.length > 50 ? '...' : '')
      });
    } else {
      localHighlights = sections.keyLocalHighlights || '';
    }
    
    // DIRECT EXTRACTION of Regional Context section
    let regionalContext = '';
    const regionalContextMatch = contentText.match(/REGIONAL\s+CONTEXT:\s*\n([^]*?)(?=\n\nAbout)/i);
    if (regionalContextMatch && regionalContextMatch[1]) {
      regionalContext = regionalContextMatch[1].trim();
      logger.debug('Found Regional Context section for TXT', {
        length: regionalContext.length,
        preview: regionalContext.substring(0, 50) + (regionalContext.length > 50 ? '...' : '')
      });
    } else {
      regionalContext = sections.regionalContext || '';
    }
    
    const quote = sections.quote || this._extractQuote(contentText);
    
    // Format standardized press release with consistent sections
    // LEGAL DISCLAIMER: Prepend header disclaimers and append footer disclaimers
    const txtContent = [
      // LEGAL DISCLAIMER: Header disclaimers
      disclaimers.header.join('\n'),
      '',
      `PRESS RELEASE - ${variant.market.toUpperCase()}`,
      '='.repeat(50),
      `Generated: ${generatedDate}`,
      '',
      // Headline section
      'HEADLINE',
      '-'.repeat(20),
      headline || 'Press Release',
      '',
      // Summary section
      'SUMMARY',
      '-'.repeat(20),
      summary || 'No summary available',
      '',
      // Main content with structured sections
      'MARKET DETAILS',
      '-'.repeat(20),
      marketDetails || 'No market details available',
      '',
      // Local highlights
      'LOCAL HIGHLIGHTS',
      '-'.repeat(20),
      localHighlights || 'No local highlights available',
      '',
      // Regional context
      'REGIONAL CONTEXT',
      '-'.repeat(20),
      regionalContext || 'No regional context available',
      '',
      // Quote section
      'EXPERT QUOTE',
      '-'.repeat(20),
      quote || 'No expert quote available',
      '',
      // LEGAL DISCLAIMER: Footer disclaimers
      '='.repeat(50),
      'LEGAL DISCLAIMERS',
      disclaimers.footer.join('\n'),
      '',
      disclaimers.attributions.join('\n'),
      '',
      disclaimers.contact.join('\n'),
      '',
      // Metadata footer
      '='.repeat(50),
      'METADATA',
      `-Market: ${variant.market}`,
      `-Quality Score: ${qualityScore}%`,
      `-Generated: ${generatedDate}`,
      `-Master PR: ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}`
    ].join('\n');

    // Phase 3: S3 Storage Migration - Write directly to S3
    const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'txt');
    
    logger.info('Phase 3: Writing structured TXT content to S3', {
      jobId,
      market: variant.market,
      s3Key,
      contentSize: txtContent.length
    });
    
    const s3Result = await storage.put(s3Key, txtContent);

    return {
      format: 'txt',
      fileName,
      filePath, // Keep for backward compatibility
      s3Key: s3Result.key,
      size: s3Result.size,
      market: variant.market
    };
  }
  /**
   * Process Narrative format - creates a flowing, story-like version of the press release
   */
  async _processNarrative(variant, options) {
    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}_narrative.txt`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // Extract content using same approach as TXT format
    let fullContent = '';
    let contentText = '';
    let rawContentObject = null;
    
    // Get the raw content object for narrative structure
    if (variant.content && typeof variant.content === 'object' && variant.content.rawContent) {
      rawContentObject = variant.content.rawContent;
    } else if (variant.rawContent) {
      rawContentObject = variant.rawContent;
    }
    
    // Extract the actual text content from the raw content
    if (rawContentObject && rawContentObject.content) {
      contentText = rawContentObject.content;
      logger.debug('Using direct raw content text for narrative format', {
        contentLength: contentText.length,
        source: 'rawContent.content direct access'
      });
    } else {
      // Fallback to the string extraction method
      contentText = this._extractStringContent(variant.content);
      logger.debug('Fallback to string extraction for narrative format', {
        contentLength: contentText.length,
        source: 'extractStringContent fallback'
      });
    }
    
    fullContent = contentText;
    
    // CRITICAL FIX: Check for Business Wire format (FOR IMMEDIATE RELEASE) from LocalizationEngine
    // LocalizationEngine applies Business Wire format which uses "FOR IMMEDIATE RELEASE"
    const hasBusinessWireFormat = fullContent && fullContent.length > 500 &&
                                  fullContent.includes('FOR IMMEDIATE RELEASE');
    
    logger.info('[OutputFormatter._processNarrative] Business Wire format detection', {
      jobId,
      market: variant.market,
      contentLength: fullContent?.length || 0,
      hasBusinessWireFormat,
      checkingFor: 'FOR IMMEDIATE RELEASE',
      foundInContent: fullContent?.includes('FOR IMMEDIATE RELEASE') || false
    });
    
    if (hasBusinessWireFormat) {
      // PRESERVE Business Wire format - don't transform it!
      logger.info('[OutputFormatter._processNarrative] ✅ PRESERVING Business Wire format from LocalizationEngine', {
        jobId,
        market: variant.market,
        contentLength: fullContent.length,
        preservedFormat: 'Business Wire Narrative',
        source: 'LocalizationEngine',
        action: 'Preserving complete format without transformation'
      });
      
      // Add metadata footer to the complete content WITHOUT transforming
      const masterPR = options.masterPR || variant.metadata?.masterPR || '';
      const qualityScore = variant.metadata?.qualityScore || 'N/A';
      const generatedDate = new Date().toISOString();
      
      const finalContent = fullContent + '\n\n' + [
        '='.repeat(50),
        'NARRATIVE METADATA',
        `-Market: ${variant.market}`,
        `-Quality Score: ${qualityScore}%`,
        `-Generated: ${generatedDate}`,
        `-Format: Business Wire Narrative (Preserved from LocalizationEngine)`,
        `-Master PR: ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}`
      ].join('\n');

      // Phase 3: S3 Storage Migration - Write directly to S3
      const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'txt');
      
      logger.info('Phase 3: Writing narrative content to S3', {
        jobId,
        market: variant.market,
        s3Key,
        contentSize: finalContent.length
      });
      
      const s3Result = await storage.put(s3Key, finalContent);
      
      logger.info('[OutputFormatter._processNarrative] ✅ Business Wire format preserved and written to S3', {
        jobId,
        market: variant.market,
        fileName,
        s3Key: s3Result.key,
        finalContentLength: finalContent.length,
        size: s3Result.size
      });
      
      return {
        format: 'narrative',
        fileName,
        filePath, // Keep for backward compatibility
        s3Key: s3Result.key,
        size: s3Result.size,
        market: variant.market
      };
    } else {
      // Fallback for incomplete content
      const fallbackContent = this._createNarrativeFallback(variant, options);
      
      // Phase 3: S3 Storage Migration - Write fallback to S3
      const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'txt');
      const s3Result = await storage.put(s3Key, fallbackContent);
      
      return {
        format: 'narrative',
        fileName,
        filePath, // Keep for backward compatibility
        s3Key: s3Result.key,
        size: s3Result.size,
        market: variant.market
      };
    }
  }

  /**
   * Transform press release content into narrative format
   * @private
   */
  _transformToNarrative(content, market) {
    try {
      // Extract key components
      const headline = this._extractHeadline(content);
      const businessWireMatch = content.match(/--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\nKEY\s+LOCAL\s+HIGHLIGHTS|\n\n")/i);
      const businessWireParagraph = businessWireMatch ? businessWireMatch[1].trim() : '';
      
      // Extract market dynamics
      const marketDynamicsMatch = content.match(/MARKET\s+DYNAMICS:\s*\n([^]*?)(?=\n\nFINANCING\s+TRENDS)/i);
      const marketDynamics = marketDynamicsMatch ? marketDynamicsMatch[1].trim() : '';
      
      // Extract local highlights
      const localHighlightsMatch = content.match(/KEY\s+LOCAL\s+HIGHLIGHTS:\s*\n((?:[-•*][^\n]*\n)+)(?=\n\n)/i);
      const localHighlights = localHighlightsMatch ? localHighlightsMatch[1].trim() : '';
      
      // Extract expert quote
      const quoteMatch = content.match(/"([^"]+)"/);
      const expertQuote = quoteMatch ? quoteMatch[1] : '';
      
      // Create narrative flow
      const narrativeParts = [];
      
      // Opening narrative
      if (headline) {
        narrativeParts.push(`The story of ${market}'s real estate market unfolds with significant developments that are reshaping the local housing landscape. ${headline.replace(/^[A-Z\s,]+--/, '').trim()}`);
      }
      
      // Main story paragraph
      if (businessWireParagraph) {
        narrativeParts.push(`\n${businessWireParagraph}`);
      }
      
      // Market dynamics narrative
      if (marketDynamics) {
        narrativeParts.push(`\nThe current market dynamics reveal important trends across the region. ${marketDynamics.replace(/[-•*]\s*/g, '').replace(/\n/g, ' ')}`);
      }
      
      // Local highlights as story elements
      if (localHighlights) {
        const highlights = localHighlights.split('\n').filter(h => h.trim()).map(h => h.replace(/[-•*]\s*/, '').trim());
        if (highlights.length > 0) {
          narrativeParts.push(`\nKey developments across the market include several noteworthy trends: ${highlights.join(', ')}.`);
        }
      }
      
      // Expert perspective
      if (expertQuote) {
        narrativeParts.push(`\nIndustry experts are taking note of these changes. As one market analyst observed: "${expertQuote}"`);
      }
      
      // Closing narrative
      narrativeParts.push(`\nThese developments in ${market} reflect broader patterns in real estate markets, where local conditions and economic factors continue to shape housing opportunities and investment decisions.`);
      
      return narrativeParts.join('\n');
      
    } catch (error) {
      logger.error('Error transforming content to narrative format', {
        error: error.message,
        market
      });
      return `A comprehensive analysis of ${market}'s real estate market reveals ongoing developments that continue to shape the local housing landscape.\n\n${content}`;
    }
  }

  /**
   * Create fallback narrative content
   * @private
   */
  _createNarrativeFallback(variant, options) {
    const masterPR = options.masterPR || variant.metadata?.masterPR || '';
    const qualityScore = variant.metadata?.qualityScore || 'N/A';
    const generatedDate = new Date().toISOString();
    
    const fallbackNarrative = [
      `The ${variant.market} Real Estate Market Story`,
      '='.repeat(50),
      '',
      `The real estate landscape in ${variant.market} continues to evolve, presenting both opportunities and challenges for buyers, sellers, and investors alike.`,
      '',
      'Market developments in this region reflect broader economic trends while maintaining unique local characteristics that define the area\'s housing dynamics.',
      '',
      'Industry professionals and market observers are closely monitoring these changes as they unfold, providing insights into future market directions.',
      '',
      '='.repeat(50),
      'NARRATIVE METADATA',
      `-Market: ${variant.market}`,
      `-Quality Score: ${qualityScore}%`,
      `-Generated: ${generatedDate}`,
      `-Format: Narrative Story Format (Fallback)`,
      `-Master PR: ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}`
    ].join('\n');
    
    return fallbackNarrative;
  }


  /**
   * Process HTML format
   */
  async _processHTML(variant, options) {
    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // LEGAL DISCLAIMER INTEGRATION: Generate disclaimers for this market
    logger.debug('Generating legal disclaimers for HTML format', {
      market: variant.market,
      jobId
    });
    
    const dataSourcesUsed = this._extractDataSources(variant);
    const disclaimers = legalDisclaimerService.generateDisclaimers(variant.market, dataSourcesUsed);
    
    logger.debug('Legal disclaimers generated for HTML', {
      market: variant.market,
      jobId,
      hasHeader: !!disclaimers.header,
      hasFooter: !!disclaimers.footer
    });

    const title = `Press Release - ${variant.market}`;
    
    // Extract content and parse structured sections
    const contentText = this._extractStringContent(variant.content);
    const masterPR = options.masterPR || variant.metadata?.masterPR || '';
    const qualityScore = variant.metadata?.qualityScore || 'N/A';
    const generatedDate = new Date().toISOString();
    
    // Extract sections for structured format
    const headline = this._extractSection(contentText, 'headline') || this._extractHeadline(contentText);
    const summary = this._extractSection(contentText, 'summary') || this._extractSummary(contentText);
    const marketDetails = this._extractSection(contentText, 'market details') || this._extractSection(contentText, 'market data');
    const localHighlights = this._extractSection(contentText, 'local highlights') || this._extractSection(contentText, 'key points');
    const regionalContext = this._extractSection(contentText, 'regional context') || this._extractSection(contentText, 'regional comparison');
    const quote = this._extractSection(contentText, 'quote') || this._extractQuote(contentText);
    
    const htmlContent = this.templates.html.header
      .replace('{{title}}', title)
      + `
    <!-- LEGAL DISCLAIMER: Header disclaimers -->
    <div class="legal-disclaimer" style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-left: 4px solid #333; font-size: 14px;">
        ${disclaimers.header.map(line => `<p style="margin: 5px 0;">${line}</p>`).join('')}
    </div>
    
    <div class="header">
        <div class="logo">Example Company</div>
        <div class="date">${new Date().toLocaleDateString()}</div>
    </div>
    <div class="title">${headline || title}</div>
    
    <div class="market-info">
        <strong>Market:</strong> ${variant.market}<br>
        <strong>Quality Score:</strong> ${qualityScore}%<br>
        <strong>Generated:</strong> ${generatedDate}
    </div>
    
    <div class="content">
        <!-- Summary Section -->
        <div class="section">
            <h2>Summary</h2>
            <p>${summary.replace(/\n/g, '</p><p>')}</p>
        </div>
        
        <!-- Market Details Section -->
        <div class="section">
            <h2>Market Details</h2>
            <p>${marketDetails.replace(/\n/g, '</p><p>')}</p>
        </div>
        
        <!-- Local Highlights Section -->
        <div class="section">
            <h2>Local Highlights</h2>
            <p>${localHighlights.replace(/\n/g, '</p><p>')}</p>
        </div>
        
        <!-- Regional Context Section -->
        <div class="section">
            <h2>Regional Context</h2>
            <p>${regionalContext.replace(/\n/g, '</p><p>')}</p>
        </div>
        
        <!-- Expert Quote Section -->
        <div class="section quote">
            <h2>Expert Quote</h2>
            <blockquote>${quote.replace(/\n/g, '</p><p>')}</blockquote>
        </div>
    </div>
    
    <!-- LEGAL DISCLAIMER: Footer disclaimers -->
    <div class="legal-disclaimer" style="background: #f9f9f9; padding: 20px; margin: 30px 0; border-left: 4px solid #333; font-size: 13px;">
        <h3 style="margin-top: 0; color: #333;">Legal Disclaimers</h3>
        ${disclaimers.footer.map(line => `<p style="margin: 8px 0;">${line}</p>`).join('')}
        <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
        <h4 style="margin: 10px 0; color: #333;">Data Sources</h4>
        ${disclaimers.attributions.map(line => `<p style="margin: 5px 0;">${line}</p>`).join('')}
        <hr style="margin: 15px 0; border: none; border-top: 1px solid #ddd;">
        <h4 style="margin: 10px 0; color: #333;">Contact Information</h4>
        ${disclaimers.contact.map(line => `<p style="margin: 5px 0;">${line}</p>`).join('')}
    </div>
    
    <div class="metadata">
        <h3>Metadata</h3>
        <p><strong>Master PR:</strong> ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}</p>
    </div>
    ` + this.templates.html.footer
      .replace('{{generatedDate}}', generatedDate)
      .replace('{{market}}', variant.market)
      .replace('{{qualityScore}}', qualityScore);

    // Phase 3: S3 Storage Migration - Write directly to S3
    const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'html');
    
    logger.info('Phase 3: Writing HTML content to S3', {
      jobId,
      market: variant.market,
      s3Key,
      contentSize: htmlContent.length
    });
    
    const s3Result = await storage.put(s3Key, htmlContent);

    return {
      format: 'html',
      fileName,
      filePath, // Keep for backward compatibility
      s3Key: s3Result.key,
      size: s3Result.size,
      market: variant.market
    };
  }

  /**
   * Process DOCX format (requires docx package)
   */
  async _processDOCX(variant, options) {
    if (!this.docxClasses) {
      throw new ExternalServiceError('DOCX processor not available', 'docx');
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = this.docxClasses;
    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // LEGAL DISCLAIMER INTEGRATION: Generate disclaimers for this market
    logger.debug('Generating legal disclaimers for DOCX format', {
      market: variant.market,
      jobId
    });
    
    const dataSourcesUsed = this._extractDataSources(variant);
    const disclaimers = legalDisclaimerService.generateDisclaimers(variant.market, dataSourcesUsed);
    
    logger.debug('Legal disclaimers generated for DOCX', {
      market: variant.market,
      jobId,
      hasHeader: !!disclaimers.header,
      hasFooter: !!disclaimers.footer
    });

    // Extract content and parse structured sections
    const contentText = this._extractStringContent(variant.content);
    const masterPR = options.masterPR || variant.metadata?.masterPR || '';
    const qualityScore = variant.metadata?.qualityScore || 'N/A';
    const generatedDate = new Date().toISOString();
    
    // Extract sections for structured format
    const headline = this._extractSection(contentText, 'headline') || this._extractHeadline(contentText);
    const summary = this._extractSection(contentText, 'summary') || this._extractSummary(contentText);
    const marketDetails = this._extractSection(contentText, 'market details') || this._extractSection(contentText, 'market data');
    const localHighlights = this._extractSection(contentText, 'local highlights') || this._extractSection(contentText, 'key points');
    const regionalContext = this._extractSection(contentText, 'regional context') || this._extractSection(contentText, 'regional comparison');
    const quote = this._extractSection(contentText, 'quote') || this._extractQuote(contentText);

    // Create document with structured sections
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // LEGAL DISCLAIMER: Header disclaimers
          ...disclaimers.header.map(line =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 20,
                  color: '333333'
                })
              ],
              spacing: { after: 100 }
            })
          ),
          new Paragraph({
            text: '',
            spacing: { after: 200 }
          }),
          
          // Title and header
          new Paragraph({
            text: headline || `Press Release - ${variant.market}`,
            heading: HeadingLevel.TITLE,
            alignment: 'center'
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Market: ${variant.market} | Generated: ${new Date().toLocaleDateString()}`,
                size: 20,
                color: '666666'
              })
            ],
            alignment: 'center',
            spacing: { after: 400 }
          }),
          
          // Summary section
          new Paragraph({
            text: 'Summary',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }),
          ...summary.split('\n').map(paragraph =>
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 24
                })
              ],
              spacing: { after: 200 }
            })
          ),
          
          // Market Details section
          new Paragraph({
            text: 'Market Details',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }),
          ...marketDetails.split('\n').map(paragraph =>
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 24
                })
              ],
              spacing: { after: 200 }
            })
          ),
          
          // Local Highlights section
          new Paragraph({
            text: 'Local Highlights',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }),
          ...localHighlights.split('\n').map(paragraph =>
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 24
                })
              ],
              spacing: { after: 200 }
            })
          ),
          
          // Regional Context section
          new Paragraph({
            text: 'Regional Context',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }),
          ...regionalContext.split('\n').map(paragraph =>
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 24
                })
              ],
              spacing: { after: 200 }
            })
          ),
          
          // Expert Quote section
          new Paragraph({
            text: 'Expert Quote',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 200 }
          }),
          ...quote.split('\n').map(paragraph =>
            new Paragraph({
              children: [
                new TextRun({
                  text: paragraph,
                  size: 24,
                  italics: true
                })
              ],
              spacing: { after: 200 }
            })
          ),
          
          // LEGAL DISCLAIMER: Footer disclaimers
          new Paragraph({
            text: 'Legal Disclaimers',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          ...disclaimers.footer.map(line =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 20,
                  color: '666666'
                })
              ],
              spacing: { after: 100 }
            })
          ),
          new Paragraph({
            text: 'Data Sources',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
          }),
          ...disclaimers.attributions.map(line =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 18,
                  color: '666666'
                })
              ],
              spacing: { after: 80 }
            })
          ),
          new Paragraph({
            text: 'Contact Information',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 }
          }),
          ...disclaimers.contact.map(line =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  size: 18,
                  color: '666666'
                })
              ],
              spacing: { after: 80 }
            })
          ),
          
          // Metadata footer
          new Paragraph({
            text: 'Metadata',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Quality Score: ${qualityScore}%`,
                size: 20,
                color: '999999'
              })
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated: ${generatedDate}`,
                size: 20,
                color: '999999'
              })
            ],
            spacing: { after: 100 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Master PR: ${masterPR.substring(0, 100)}${masterPR.length > 100 ? '...' : ''}`,
                size: 20,
                color: '999999'
              })
            ],
            spacing: { after: 100 }
          })
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    
    // Phase 3: S3 Storage Migration - Write directly to S3
    const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'docx');
    
    logger.info('Phase 3: Writing DOCX content to S3', {
      jobId,
      market: variant.market,
      s3Key,
      contentSize: buffer.length
    });
    
    const s3Result = await storage.put(s3Key, buffer);

    return {
      format: 'docx',
      fileName,
      filePath, // Keep for backward compatibility
      s3Key: s3Result.key,
      size: s3Result.size,
      market: variant.market
    };
  }

  /**
   * Process PDF format (requires puppeteer)
   */
  async _processPDF(variant, options) {
    if (!this.puppeteer) {
      throw new ExternalServiceError('PDF processor not available', 'puppeteer');
    }

    const jobId = options.jobId || 'unknown';
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);

    await this._ensureDirectory(path.dirname(filePath));

    // First create HTML content
    const htmlFile = await this._processHTML(variant, options);
    const htmlContent = await fs.readFile(htmlFile.filePath, 'utf8');

    // Convert HTML to PDF
    const browser = await this.puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '1in',
          right: '1in',
          bottom: '1in',
          left: '1in'
        }
      });

      // Phase 3: S3 Storage Migration - Write directly to S3
      const s3Key = storage.buildContentKey(jobId, 'narratives', variant.market, 'pdf');
      
      logger.info('Phase 3: Writing PDF content to S3', {
        jobId,
        market: variant.market,
        s3Key,
        contentSize: pdfBuffer.length
      });
      
      const s3Result = await storage.put(s3Key, pdfBuffer);

      return {
        format: 'pdf',
        fileName,
        filePath, // Keep for backward compatibility
        s3Key: s3Result.key,
        size: s3Result.size,
        market: variant.market
      };

    } finally {
      await browser.close();
    }
  }

  /**
   * Create ZIP archive of all files
   */
  async _createZipArchive(files, jobId, options) {
    const zipFileName = `${jobId}_press_releases.zip`;
    const zipFilePath = path.join(this.config.tempDir, jobId, zipFileName);

    await this._ensureDirectory(path.dirname(zipFilePath));

    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(zipFilePath);
      const archive = archiver('zip', {
        zlib: { level: this.config.compressionLevel }
      });

      output.on('close', async () => {
        try {
          const stats = await fs.stat(zipFilePath);
          resolve({
            fileName: zipFileName,
            filePath: zipFilePath,
            size: stats.size,
            fileCount: files.length
          });
        } catch (error) {
          reject(error);
        }
      });

      archive.on('error', reject);
      archive.pipe(output);

      // Add all files to archive
      for (const file of files) {
        archive.file(file.filePath, { 
          name: `${file.market}/${file.fileName}` 
        });
      }

      archive.finalize();
    });
  }

  /**
   * Upload results to S3
   * @deprecated Phase 3: This method is deprecated - content is now written directly to S3 in format writers
   * Kept for backward compatibility but should not be called in Phase 3+ workflows
   */
  async _uploadToS3(results, jobId) {
    logger.warn('Phase 3: _uploadToS3 called - this method is deprecated, content should be written directly to S3', {
      jobId,
      fileCount: results.files?.length || 0
    });
    
    // Phase 3: Skip upload since files are already in S3
    return;
    
    /* DEPRECATED CODE - Kept for reference
    try {
      const s3KeyPrefix = `${this.config.s3KeyPrefix}${jobId}/`;

      // Upload individual files
      for (const file of results.files) {
        const s3Key = `${s3KeyPrefix}${file.format}/${file.fileName}`;
        const fileBuffer = await fs.readFile(file.filePath);

        if (s3Storage) {
          await storage.upload({
            Bucket: this.config.s3Bucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: this._getContentType(file.format),
            Metadata: {
              jobId,
              market: file.market,
              format: file.format,
              generatedAt: new Date().toISOString()
            }
          });

          file.s3Key = s3Key;
          file.s3Url = storage.getSignedUrl('getObject', {
            Bucket: this.config.s3Bucket,
            Key: s3Key,
            Expires: 3600
          });
        }
      }

      // Upload ZIP file if exists
      if (results.zipFile) {
        const zipS3Key = `${s3KeyPrefix}${results.zipFile.fileName}`;
        const zipBuffer = await fs.readFile(results.zipFile.filePath);

        if (s3Storage) {
          await storage.upload({
            Bucket: this.config.s3Bucket,
            Key: zipS3Key,
            Body: zipBuffer,
            ContentType: 'application/zip',
            Metadata: {
              jobId,
              fileCount: results.zipFile.fileCount.toString(),
              generatedAt: new Date().toISOString()
            }
          });

          results.zipFile.s3Key = zipS3Key;
          results.zipFile.s3Url = storage.getSignedUrl('getObject', {
            Bucket: this.config.s3Bucket,
            Key: zipS3Key,
            Expires: 3600
          });
        }
      }

      logger.info('Files uploaded to S3 successfully', {
        jobId,
        fileCount: results.files.length,
        hasZip: !!results.zipFile
      });

    } catch (error) {
      logger.error('Failed to upload to S3', {
        jobId,
        error: error.message
      });
      throw error;
    }
    */
  }

  /**
   * Copy files from temp directory to permanent storage
   */
  async _copyToStorage(results, jobId) {
    try {
      if (!isLocalStorage()) {
        // Skip local storage copy if using cloud storage
        logger.debug('Skipping local storage copy (using cloud storage)', { jobId });
        return;
      }

      const storageDir = path.join(this.config.localStoragePath, jobId);
      await this._ensureDirectory(storageDir);

      logger.info('Copying files to permanent storage', {
        jobId,
        storageDir,
        fileCount: results.files.length
      });

      // Copy all generated files to permanent storage
      for (const file of results.files) {
        const destPath = path.join(storageDir, file.fileName);
        
        try {
          // Copy file from temp to permanent storage
          await fs.copyFile(file.filePath, destPath);
          
          // Update file path to point to permanent storage
          file.storagePath = destPath;
          file.storageUrl = `/api/v1/content/download/${jobId}/${file.fileName}`;
          
          logger.debug('File copied to storage', {
            jobId,
            fileName: file.fileName,
            tempPath: file.filePath,
            storagePath: destPath
          });
          
        } catch (error) {
          logger.error('Failed to copy file to storage', {
            jobId,
            fileName: file.fileName,
            error: error.message
          });
          throw error;
        }
      }

      // Copy ZIP file if it exists
      if (results.zipFile) {
        const zipDestPath = path.join(storageDir, results.zipFile.fileName);
        
        try {
          await fs.copyFile(results.zipFile.filePath, zipDestPath);
          results.zipFile.storagePath = zipDestPath;
          results.zipFile.storageUrl = `/api/v1/content/download/${jobId}/${results.zipFile.fileName}`;
          
          logger.debug('ZIP file copied to storage', {
            jobId,
            fileName: results.zipFile.fileName,
            storagePath: zipDestPath
          });
          
        } catch (error) {
          logger.error('Failed to copy ZIP file to storage', {
            jobId,
            fileName: results.zipFile.fileName,
            error: error.message
          });
          // Don't throw error for ZIP file copy failure
        }
      }

      logger.info('Files successfully copied to permanent storage', {
        jobId,
        storageDir,
        copiedFiles: results.files.length,
        hasZip: !!results.zipFile
      });

    } catch (error) {
      logger.error('Failed to copy files to permanent storage', {
        jobId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Utility methods
   */
  async _ensureTempDirectory() {
    try {
      await fs.mkdir(this.config.tempDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async _ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  async _removeDirectory(dirPath) {
    try {
      await fs.rmdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to remove directory', {
          dirPath,
          error: error.message
        });
      }
    }
  }

  async _testS3Connection() {
    try {
      await storage.headBucket({ Bucket: this.config.s3Bucket });
    } catch (error) {
      logger.warn('S3 bucket not accessible', {
        bucket: this.config.s3Bucket,
        error: error.message
      });
    }
  }

  async _cleanOldTempFiles() {
    try {
      const entries = await fs.readdir(this.config.tempDir, { withFileTypes: true });
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(this.config.tempDir, entry.name);
          const stats = await fs.stat(dirPath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await this._removeDirectory(dirPath);
            logger.debug('Removed old temp directory', { dirPath });
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to clean old temp files', {
        error: error.message
      });
    }
  }

  async _cleanOldS3Objects() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.fileRetentionDays);

      const objects = await storage.listObjects({
        Bucket: this.config.s3Bucket,
        Prefix: this.config.s3KeyPrefix
      });

      if (objects.Contents) {
        const oldObjects = objects.Contents.filter(obj => 
          obj.LastModified < cutoffDate
        );

        if (oldObjects.length > 0) {
          await storage.deleteObjects({
            Bucket: this.config.s3Bucket,
            Delete: {
              Objects: oldObjects.map(obj => ({ Key: obj.Key }))
            }
          });

          logger.info('Cleaned old S3 objects', {
            deletedCount: oldObjects.length
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to clean old S3 objects', {
        error: error.message
      });
    }
  }

  _validateFormatRequest(variants, options) {
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new ValidationError('Variants array is required and cannot be empty');
    }

    if (variants.length > this.config.maxBatchSize) {
      throw new ValidationError(`Batch size exceeds maximum of ${this.config.maxBatchSize}`);
    }

    for (const variant of variants) {
      // Debug logging to see the actual structure
      logger.debug('DEBUG: Variant structure for validation', {
        keys: Object.keys(variant),
        hasMarket: !!variant.market,
        hasContent: !!variant.content,
        hasStatus: !!variant.status,
        market: variant.market,
        status: variant.status,
        contentType: typeof variant.content,
        contentLength: variant.content ? variant.content.length : 0
      });
      
      // Check for market property - handle different variant structures
      if (!variant.market) {
        logger.warn('DEBUG: Variant missing market property, attempting to infer', {
          variantKeys: Object.keys(variant),
          variantType: typeof variant,
          hasContent: !!variant.content,
          hasStatus: !!variant.status
        });
        
        // Try to infer market from variant structure or skip if it's malformed
        if (variant.status === 'failed' && !variant.market) {
          logger.warn('DEBUG: Skipping malformed failed variant without market property');
          continue;
        }
        
        // For other cases, this is still an error but provide more context
        logger.error('DEBUG: Critical validation error - variant structure mismatch', {
          variantKeys: Object.keys(variant),
          variantSample: JSON.stringify(variant, null, 2).substring(0, 500)
        });
        throw new ValidationError(`Variant validation failed: missing market property. Variant keys: ${Object.keys(variant).join(', ')}`);
      }
      
      // Skip failed variants - they won't have content
      if (variant.status === 'failed') {
        logger.debug('DEBUG: Skipping failed variant', { market: variant.market });
        continue;
      }
      
      // Skip variants with error property - indicates generation failure
      if (variant.error) {
        logger.debug('DEBUG: Skipping variant with error', {
          market: variant.market,
          error: variant.error
        });
        continue;
      }
      
      // Check for content property - handle different possible structures
      let actualContent = null;
      
      if (variant.content) {
        // Direct content property
        actualContent = variant.content;
      } else if (variant.metadata && variant.metadata.content) {
        // Content in metadata
        actualContent = variant.metadata.content;
      } else if (variant.validation && variant.validation.content) {
        // Content in validation object
        actualContent = variant.validation.content;
      } else if (typeof variant === 'string') {
        // Variant is just a string (the content itself)
        actualContent = variant;
      }
      
      if (!actualContent) {
        logger.error('DEBUG: Missing content property', {
          variantKeys: Object.keys(variant),
          contentChecks: {
            direct: !!variant.content,
            metadata: !!(variant.metadata && variant.metadata.content),
            validation: !!(variant.validation && variant.validation.content),
            isString: typeof variant === 'string'
          },
          variantStatus: variant.status,
          hasError: !!variant.error
        });
        throw new ValidationError(`Variant for market ${variant.market} must have content property`);
      }
      
      // Store the actual content back to the variant for processing
      if (!variant.content && actualContent) {
        variant.content = actualContent;
      }
    }

    if (options.formats) {
      const invalidFormats = options.formats.filter(f =>
        !this.config.supportedFormats.includes(f)
      );
      
      if (invalidFormats.length > 0) {
        throw new ValidationError(`Unsupported formats: ${invalidFormats.join(', ')}`);
      }
    }
  }

  _getContentType(format) {
    const contentTypes = {
      json: 'application/json',
      txt: 'text/plain',
      html: 'text/html',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pdf: 'application/pdf',
      pitch: 'application/json',
      narrative: 'text/plain'
    };
    
    return contentTypes[format] || 'application/octet-stream';
  }

  /**
   * Extract a specific section from content text
   * @private
   */
  /**
   * Extract a specific section from content text
   * Improved to handle complete section extraction without truncation
   * @private
   */
  _extractSection(content, sectionName) {
    if (!content) return '';
    
    // Use proper logger instead of console.log
    logger.debug(`Extracting section: ${sectionName}`, { contentLength: content.length });
    
    // Define improved section patterns with better boundary detection
    // The key improvement is using section headers as boundaries rather than just newlines
    const patterns = {
      'headline': [
        /HEADLINE:?\s*\n?([^\n]+)/i,
        /^#*\s*([^\n]+)$/m, // Markdown-style headline
        /^([^\n]{10,})$/m // First substantial line as fallback
      ],
      'summary': [
        // Match the business wire intro paragraph which serves as summary - IMPROVED to capture complete paragraph
        /BOSTON--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\s*KEY\s+LOCAL\s+HIGHLIGHTS|\n\s*MARKET\s+DYNAMICS|\n\s*"[^"]*"|\n\s*COMPANY\s+INFORMATION|$)/i,
        /[A-Z]+--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\s*KEY\s+LOCAL\s+HIGHLIGHTS|\n\s*MARKET\s+DYNAMICS|\n\s*"[^"]*"|\n\s*COMPANY\s+INFORMATION|$)/i,
        // Match content after headline until the next section - more flexible boundaries
        /HEADLINE:.*?\n\n([^]*?)(?=\n\s*KEY\s+LOCAL\s+HIGHLIGHTS|\n\s*MARKET\s+DYNAMICS|\n\s*"[^"]*"|$)/i,
        // Match any dedicated summary section with flexible boundaries
        /(?:SUMMARY|OVERVIEW):?\s*\n([^]*?)(?=\n\s*KEY\s+LOCAL\s+HIGHLIGHTS|\n\s*MARKET\s+DYNAMICS|\n\s*"[^"]*"|$)/i,
        // Fallback to first substantial paragraph after the header with better boundaries
        /===+\n[^\n]+\n===+\n\n\s*HEADLINE:.*?\n\n([^]*?)(?=\n\s*KEY\s+LOCAL\s+HIGHLIGHTS|\n\s*MARKET\s+DYNAMICS|$)/i
      ],
      'market details': [
        // Direct extraction of MARKET DYNAMICS section
        /MARKET\s+DYNAMICS:?\s*\n([^]*?)(?=\n\s*FINANCING\s+TRENDS:?)/i,
        // Alternative pattern with different section headers
        /(?:MARKET\s+(?:DETAILS|DATA|DYNAMICS|ANALYSIS)):?\s*\n([^]*?)(?=\n\s*FINANCING\s+TRENDS:?)/i,
        // Pattern to match content between quotes and FINANCING TRENDS
        /"[^"]+"\s*(?:says|according to)[^\.]+\.\s*\n\n([^]*?)(?=\n\s*FINANCING\s+TRENDS:?)/i,
        // Last resort pattern to capture any content between KEY LOCAL HIGHLIGHTS and FINANCING TRENDS
        /KEY\s+LOCAL\s+HIGHLIGHTS:.*?\n\n.*?\n\n([^]*?)(?=\n\s*FINANCING\s+TRENDS:?)/i
      ],
      'local highlights': [
        // Direct extraction of bullet points with complete content
        /KEY\s+LOCAL\s+HIGHLIGHTS:?\s*\n((?:\s*[-•*][^\n]*\n)+)(?=\"|MARKET\s+DYNAMICS:?)/i,
        // Alternative pattern with different headers
        /(?:LOCAL\s+HIGHLIGHTS|KEY\s+(?:LOCAL\s+)?HIGHLIGHTS|KEY\s+POINTS):?\s*\n((?:\s*[-•*][^\n]*\n)+)(?=\"|MARKET\s+DYNAMICS:?)/i,
        // Pattern to match all bullet points together
        /KEY\s+LOCAL\s+HIGHLIGHTS:?\s*\n([-•*][^\n]*(?:\n[-•*][^\n]*)*)/i,
        // Fallback to any bullet points in the content
        /\n((?:[-•*][^\n]*\n){2,})/i
      ],
      'regional context': [
        // Direct extraction of REGIONAL CONTEXT section
        /REGIONAL\s+CONTEXT:?\s*\n([^]*?)(?=\n\s*About\s+exampleCompany)/i,
        // Alternative pattern with different headers
        /(?:REGIONAL\s+(?:CONTEXT|COMPARISON|TRENDS|ANALYSIS)):?\s*\n([^]*?)(?=\n\s*About\s+exampleCompany)/i,
        // Pattern to match content between LOCAL MARKET IMPLICATIONS and About Example Company
        /LOCAL\s+MARKET\s+IMPLICATIONS:.*?\n\n.*?\n\n([^]*?)(?=\n\s*About\s+exampleCompany)/i,
        // Fallback to any paragraph mentioning regional comparisons
        /\n([^\n]*(?:compared to|regional|nationwide|metropolitan)[^\n]*(?:\n[^\n]+){0,5})(?=\n\s*About\s+exampleCompany)/i
      ],
      'quote': [
        // Match complete quotes with attribution
        /"([^"]{20,})"(?:\s*(?:said|according to|notes)\s+([^,\.]+))?/gi,
        // Alternative quote pattern
        /[""]([^""]{20,})[""](?:\s*(?:said|according to|notes)\s+([^,\.]+))?/gi,
        // Fallback to any quoted text
        /"([^"]+)"/g
      ]
    };
    
    // Get patterns for this section
    const sectionPatterns = patterns[sectionName.toLowerCase()] || [];
    
    // Try each pattern
    for (const pattern of sectionPatterns) {
      if (pattern.global) {
        // Handle global patterns (like quotes)
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          // For quotes, take the longest match as it's likely the most complete
          if (sectionName.toLowerCase() === 'quote') {
            let bestMatch = matches[0];
            for (const match of matches) {
              if (match[1].length > bestMatch[1].length) {
                bestMatch = match;
              }
            }
            const result = bestMatch[1].trim();
            logger.debug(`Found ${sectionName} using global pattern`, {
              length: result.length,
              preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
            });
            return result;
          }
          
          // For other global patterns, join all matches
          const result = matches.map(match => match[1]).join('\n\n');
          logger.debug(`Found ${sectionName} using global pattern`, {
            length: result.length,
            preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
          });
          return result.trim();
        }
      } else {
        const match = content.match(pattern);
        if (match && match[1]) {
          const result = match[1].trim();
          logger.debug(`Found ${sectionName} using pattern`, {
            length: result.length,
            preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
          });
          return result;
        }
      }
    }
    
    // Enhanced fallback: try to find section by common section headers
    // This looks for the section name followed by any content until the next section header
    const sectionHeaders = ['HEADLINE', 'SUMMARY', 'MARKET DETAILS', 'MARKET DATA', 'LOCAL HIGHLIGHTS',
                           'KEY POINTS', 'REGIONAL CONTEXT', 'REGIONAL COMPARISON', 'QUOTE', 'ABOUT'];
    
    // Create a pattern that matches from this section name to the next section header
    const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerPattern = new RegExp(
      `(?:${escapedName})\\s*:?\\s*\\n?([^]*?)(?=\\n\\s*(?:${sectionHeaders.join('|')})|$)`,
      'i'
    );
    
    const headerMatch = content.match(headerPattern);
    if (headerMatch && headerMatch[1]) {
      const result = headerMatch[1].trim();
      logger.debug(`Found ${sectionName} using header pattern`, {
        length: result.length,
        preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
      });
      return result;
    }
    
    // Last resort fallback: try to find any paragraph that might contain relevant content
    // based on keywords related to the section
    const keywordMap = {
      'headline': ['market', 'housing', 'prices', 'inventory', 'cooling', 'heating'],
      'summary': ['market', 'report', 'analysis', 'overview'],
      'market details': ['price', 'inventory', 'sale', 'median', 'average', 'percent', 'decrease', 'increase'],
      'local highlights': ['local', 'neighborhood', 'area', 'community', 'highlight'],
      'regional context': ['region', 'compared', 'nationwide', 'national', 'metropolitan'],
      'quote': ['expert', 'economist', 'analyst', 'specialist', 'professional']
    };
    
    const keywords = keywordMap[sectionName.toLowerCase()] || [];
    if (keywords.length > 0) {
      const keywordPattern = new RegExp(`\\b(?:${keywords.join('|')})\\b.*?\\n([^\\n]{20,})`, 'i');
      const keywordMatch = content.match(keywordPattern);
      if (keywordMatch && keywordMatch[1]) {
        const result = keywordMatch[1].trim();
        logger.debug(`Found ${sectionName} using keyword fallback`, {
          length: result.length,
          preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
        });
        return result;
      }
    }
    
    logger.debug(`No match found for section: ${sectionName}`);
    return '';
  }
  
  /**
   * Parse content into structured sections
   * @private
   */
  _parseContentIntoSections(content) {
    if (!content) return {};
    
    logger.debug('Parsing content into sections', { contentLength: content.length });
    
    const sections = {};
    
    // Split content by section headers
    const lines = content.split('\n');
    let currentSection = null;
    let currentContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check for section headers
      if (line === 'HEADLINE:') {
        currentSection = 'headline';
        currentContent = [];
      } else if (line.match(/^BOSTON--\(BUSINESS WIRE\)--/i) || line.match(/^[A-Z]+--\(BUSINESS WIRE\)--/i)) {
        currentSection = 'summary';
        currentContent = [line];
      } else if (line === 'KEY LOCAL HIGHLIGHTS:') {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'keyLocalHighlights';
        currentContent = [];
      } else if (line === 'MARKET DYNAMICS:') {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'marketDynamics';
        currentContent = [];
      } else if (line === 'FINANCING TRENDS:') {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'financingTrends';
        currentContent = [];
      } else if (line === 'LOCAL MARKET IMPLICATIONS:') {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'localMarketImplications';
        currentContent = [];
      } else if (line === 'REGIONAL CONTEXT:') {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'regionalContext';
        currentContent = [];
      } else if (line.startsWith('COMPANY INFORMATION')) {
        if (currentSection && currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = 'about';
        currentContent = [];
      } else if (line.match(/^".*"$/)) {
        // This might be a standalone quote
        sections.quote = line;
      } else if (currentSection) {
        // Add line to current section
        currentContent.push(line);
      }
    }
    
    // Add the last section
    if (currentSection && currentContent.length > 0) {
      sections[currentSection] = currentContent.join('\n');
    }
    
    // Extract quote from content if not found as a standalone section
    if (!sections.quote) {
      const quoteMatch = content.match(/"([^"]{20,})"/);
      if (quoteMatch && quoteMatch[1]) {
        sections.quote = `"${quoteMatch[1]}"`;
      }
    }
    
    logger.debug('Parsed sections', {
      sectionCount: Object.keys(sections).length,
      sectionNames: Object.keys(sections).join(', ')
    });
    
    return sections;
  }
  
  /**
   * Extract headline from content
   * @private
   */
  _extractHeadline(content) {
    if (!content) return 'Press Release';
    
    // Try to find the first line that looks like a headline
    const lines = content.split('\n');
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 10 && !trimmed.startsWith('#') && !trimmed.includes(':')) {
        return trimmed;
      }
    }
    
    // If no good headline found, use the first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    
    return 'Press Release';
  }
  
  /**
   * Extract summary from content
   * @private
   */
  /**
   * Extract summary from content with improved extraction capabilities
   * @private
   */
  _extractSummary(content) {
    if (!content) return '';
    
    logger.debug('Extracting summary from content', { contentLength: content.length });
    
    // Try to find a dedicated summary section first
    const summarySectionMatch = content.match(/(?:SUMMARY|OVERVIEW):\s*\n([^]*?)(?=\n\s*(?:MARKET|LOCAL|REGIONAL|KEY|HIGHLIGHTS|DETAILS|QUOTE|$))/i);
    if (summarySectionMatch && summarySectionMatch[1] && summarySectionMatch[1].trim().length > 50) {
      const result = summarySectionMatch[1].trim();
      logger.debug('Found summary in dedicated section', {
        length: result.length,
        preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
      });
      return result;
    }
    
    // Try to find the business wire format summary (improved pattern)
    const businessWirePatterns = [
      /--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\s*(?:MARKET|LOCAL|REGIONAL|KEY|HIGHLIGHTS|DETAILS|QUOTE|$))/i,
      /BOSTON--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\s*(?:MARKET|LOCAL|REGIONAL|KEY|HIGHLIGHTS|DETAILS|QUOTE|$))/i,
      /[A-Z]+--\(BUSINESS WIRE\)--\s*([^]*?)(?=\n\s*(?:MARKET|LOCAL|REGIONAL|KEY|HIGHLIGHTS|DETAILS|QUOTE|$))/i
    ];
    
    for (const pattern of businessWirePatterns) {
      const match = content.match(pattern);
      if (match && match[1] && match[1].trim().length > 30) {
        const result = match[1].trim();
        logger.debug('Found summary in business wire format', {
          length: result.length,
          preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
        });
        return result;
      }
    }
    
    // Try to find the first substantial paragraph after the headline
    const lines = content.split('\n');
    let foundHeadline = false;
    let summaryLines = [];
    let collectingSummary = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (collectingSummary && summaryLines.length > 0) {
          // End of summary paragraph
          break;
        }
        continue;
      }
      
      // Skip header sections
      if (trimmed.includes('===') || trimmed.match(/^PRESS RELEASE/i)) continue;
      
      // Mark when we find headline section
      if (trimmed.match(/^HEADLINE:?/i)) {
        foundHeadline = true;
        continue;
      }
      
      // Skip the headline itself if we just found the headline marker
      if (foundHeadline && !trimmed.includes('--') && !trimmed.includes('BUSINESS WIRE')) {
        foundHeadline = false; // Reset for next section
        continue;
      }
      
      // Look for the start of summary paragraph
      if (trimmed.includes('BUSINESS WIRE') ||
          (trimmed.length > 40 && !trimmed.includes(':') && !trimmed.match(/^[A-Z\s]+$/))) {
        collectingSummary = true;
        // Clean up business wire prefix if present
        const cleaned = trimmed.replace(/.*--\(BUSINESS WIRE\)--\s*/, '').trim();
        if (cleaned) {
          summaryLines.push(cleaned);
        }
        continue;
      }
      
      // Collect additional summary lines
      if (collectingSummary) {
        // Stop if we hit a new section
        if (trimmed.match(/^[A-Z\s]{5,}:/) || trimmed.match(/^#+\s+/)) {
          break;
        }
        summaryLines.push(trimmed);
      }
    }
    
    if (summaryLines.length > 0) {
      const result = summaryLines.join(' ').trim();
      logger.debug('Found summary after headline', {
        length: result.length,
        preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
      });
      return result;
    }
    
    // Fallback: find first substantial paragraph
    const paragraphs = content.split('\n\n');
    for (const paragraph of paragraphs.slice(0, 5)) {
      const trimmed = paragraph.trim();
      if (trimmed && trimmed.length > 50 &&
          !trimmed.includes('===') &&
          !trimmed.match(/^HEADLINE:?/i) &&
          !trimmed.match(/^PRESS RELEASE/i)) {
        const result = trimmed;
        logger.debug('Found summary in first substantial paragraph', {
          length: result.length,
          preview: result.substring(0, 50) + (result.length > 50 ? '...' : '')
        });
        return result;
      }
    }
    
    // Last resort: use first 300 characters (increased from 200)
    const result = content.trim().substring(0, 300) + (content.length > 300 ? '...' : '');
    logger.debug('Using first 300 chars as summary (last resort)', {
      length: result.length
    });
    return result;
  }
  
  /**
   * Extract quote from content
   * @private
   */
  _extractQuote(content) {
    if (!content) return '';
    
    // Try to find text in quotes
    const quoteRegex = /"([^"]{20,})"/;
    const match = content.match(quoteRegex);
    
    if (match && match[1]) {
      return `"${match[1]}"`;
    }
    
    return '';
  }

  /**
   * Extract narrative paragraphs from content text for JSON format processing
   * This method extracts the main narrative content as flowing paragraphs
   * @param {string} contentText - The generated press release content
   * @returns {Array} Array of narrative paragraph strings
   * @private
   */
  _extractNarrativeParagraphs(contentText) {
    if (!contentText) return [];
    
    logger.debug('Extracting narrative paragraphs from content', {
      contentLength: contentText.length
    });
    
    // Split content into paragraphs and filter for narrative content
    const paragraphs = contentText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    const narrativeParagraphs = [];
    
    for (const paragraph of paragraphs) {
      // Skip section headers and metadata
      if (paragraph.match(/^[A-Z\s]+:$/)) continue;
      if (paragraph.includes('===')) continue;
      if (paragraph.match(/^PRESS RELEASE/i)) continue;
      if (paragraph.match(/^COMPANY INFORMATION/i)) continue;
      if (paragraph.match(/^Media Contact/i)) continue;
      
      // Skip bullet points (they're handled separately)
      if (paragraph.match(/^\s*[-•*]/)) continue;
      
      // Include substantial narrative paragraphs
      if (paragraph.length > 50 && !paragraph.match(/^[A-Z\s]+$/)) {
        // Clean up any remaining section markers
        const cleaned = paragraph
          .replace(/^HEADLINE:\s*/i, '')
          .replace(/^SUMMARY:\s*/i, '')
          .replace(/^MARKET DYNAMICS:\s*/i, '')
          .replace(/^REGIONAL CONTEXT:\s*/i, '')
          .trim();
        
        if (cleaned.length > 30) {
          narrativeParagraphs.push(cleaned);
        }
      }
    }
    
    logger.debug('Extracted narrative paragraphs', {
      totalParagraphs: paragraphs.length,
      narrativeParagraphs: narrativeParagraphs.length,
      averageLength: narrativeParagraphs.length > 0 ?
        Math.round(narrativeParagraphs.reduce((sum, p) => sum + p.length, 0) / narrativeParagraphs.length) : 0
    });
    
    return narrativeParagraphs;
  }

  /**
   * Extract expert quote with context from content text
   * @param {string} contentText - The generated press release content
   * @returns {string} Expert quote with attribution
   * @private
   */
  _extractExpertQuoteWithContext(contentText) {
    if (!contentText) return '';
    
    logger.debug('Extracting expert quote with context', {
      contentLength: contentText.length
    });
    
    // Try to find quotes with attribution
    const quotePatterns = [
      // Quote with attribution
      /"([^"]{30,})"[,\s]*(?:said|according to|notes?)\s+([^,\.]+(?:economist|analyst|expert|specialist)[^,\.]*)/gi,
      // Quote with attribution (alternative format)
      /"([^"]{30,})"[,\s]*([^,\.]+(?:economist|analyst|expert|specialist)[^,\.]*)\s+(?:said|noted|explained)/gi,
      // Simple quote with context
      /"([^"]{30,})"/g
    ];
    
    for (const pattern of quotePatterns) {
      const matches = [...contentText.matchAll(pattern)];
      if (matches.length > 0) {
        // Take the longest quote as it's likely the most complete
        let bestMatch = matches[0];
        for (const match of matches) {
          if (match[1].length > bestMatch[1].length) {
            bestMatch = match;
          }
        }
        
        const quote = bestMatch[1].trim();
        const attribution = bestMatch[2] ? bestMatch[2].trim() : '';
        
        const result = attribution ? `"${quote}" - ${attribution}` : `"${quote}"`;
        
        logger.debug('Found expert quote with context', {
          quoteLength: quote.length,
          hasAttribution: !!attribution,
          preview: result.substring(0, 100) + (result.length > 100 ? '...' : '')
        });
        
        return result;
      }
    }
    
    logger.debug('No expert quote found');
    return '';
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      ...super.getStatus(),
      config: {
        supportedFormats: this.config.supportedFormats,
        maxBatchSize: this.config.maxBatchSize,
        s3Bucket: this.config.s3Bucket
      },
      processors: {
        available: Object.keys(this.processors),
        total: this.config.supportedFormats.length
      }
    };
  }

  /**
   * Extract compelling headline with local context
   * PHASE 2 ENHANCEMENT: AP-style headline generation
   */
  _extractCompellingHeadline(content, market) {
    // Try to find existing headline first
    let headline = this._extractHeadline(content);
    
    // If headline lacks local context, enhance it
    if (headline && !headline.toLowerCase().includes(market.toLowerCase())) {
      // Add market context if missing
      const marketName = market.split(',')[0]; // Get city name without state
      if (!headline.toLowerCase().includes(marketName.toLowerCase())) {
        headline = `${headline} in ${marketName}`;
      }
    }
    
    return headline || `${market} Housing Market Update`;
  }

  /**
   * Extract AP-style lead paragraph
   * PHASE 2 ENHANCEMENT: Compelling lead paragraph generation
   */
  _extractAPStyleLeadParagraph(content, market) {
    // Look for Business Wire format lead
    const businessWireMatch = content.match(/[A-Z]+--\(BUSINESS WIRE\)--[^]*?(?=\n\s*\n)/i);
    if (businessWireMatch) {
      let lead = businessWireMatch[0].replace(/.*--\(BUSINESS WIRE\)--\s*/, '').trim();
      
      // Ensure it includes market context
      if (!lead.toLowerCase().includes(market.toLowerCase())) {
        const marketName = market.split(',')[0];
        lead = lead.replace(/^/, `${marketName} area `);
      }
      
      return lead;
    }
    
    // Fallback to first substantial paragraph
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 100);
    return paragraphs[0] || '';
  }

  /**
   * Extract flowing narrative paragraphs (no section headers)
   * PHASE 2 CRITICAL: Remove sectioned structure
   */
  _extractFlowingNarrativeParagraphs(content) {
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
    const narrativeParagraphs = [];
    
    for (const paragraph of paragraphs) {
      // Skip section headers (all caps with colon)
      if (paragraph.match(/^[A-Z\s]+:$/)) continue;
      
      // Skip metadata sections
      if (paragraph.includes('===') || paragraph.match(/^Generated:|^Market:|^Quality Score:/)) continue;
      
      // Skip About Example Company section
      if (paragraph.match(/^COMPANY INFORMATION/i)) continue;
      
      // Skip bullet points (they should be integrated into narrative)
      if (paragraph.match(/^\s*[-•*]/)) continue;
      
      // Clean up any remaining section markers
      const cleaned = paragraph
        .replace(/^HEADLINE:\s*/i, '')
        .replace(/^SUMMARY:\s*/i, '')
        .replace(/^MARKET DYNAMICS:\s*/i, '')
        .replace(/^REGIONAL CONTEXT:\s*/i, '')
        .trim();
      
      if (cleaned.length > 50 && !cleaned.match(/^[A-Z\s]+$/)) {
        narrativeParagraphs.push(cleaned);
      }
    }
    
    return narrativeParagraphs;
  }

  /**
   * Extract local expert quote with enhanced context
   * PHASE 2 ENHANCEMENT: Authentic local expert quotes
   */
  _extractLocalExpertQuote(content, market) {
    // Look for quotes with attribution
    const quotePatterns = [
      /"([^"]{50,})"[,\s]*(?:said|according to|notes?)\s+([^,\.]+)/gi,
      /"([^"]{30,})"/g
    ];
    
    for (const pattern of quotePatterns) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        // Take the longest quote as it's likely the most complete
        let bestMatch = matches[0];
        for (const match of matches) {
          if (match[1].length > bestMatch[1].length) {
            bestMatch = match;
          }
        }
        
        const quote = bestMatch[1].trim();
        const attribution = bestMatch[2] ? bestMatch[2].trim() : '';
        
        return attribution ? `"${quote}" - ${attribution}` : `"${quote}"`;
      }
    }
    
    return '';
  }

  /**
   * Extract human interest elements
   * PHASE 2 ENHANCEMENT: Human interest integration
   */
  _extractHumanInterestElements(content) {
    const elements = [];
    
    // Look for human interest indicators
    const humanInterestPatterns = [
      { pattern: /family|families|couple|couples/gi, type: 'family_focus' },
      { pattern: /first-time buyer|first-time home/gi, type: 'first_time_buyer' },
      { pattern: /young professional|millennials?/gi, type: 'demographics' },
      { pattern: /empty nest|downsizing|retirement/gi, type: 'life_transitions' },
      { pattern: /school district|schools|education/gi, type: 'community_amenities' },
      { pattern: /commute|transportation|walkable/gi, type: 'lifestyle_factors' }
    ];
    
    for (const { pattern, type } of humanInterestPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        elements.push({
          type,
          count: matches.length,
          examples: matches.slice(0, 2) // Limit examples
        });
      }
    }
    
    return elements;
  }

  /**
   * Extract local data points
   * LOCAL DATA ACCURACY ENHANCEMENT: Enhanced concrete local metrics integration
   */
  _extractLocalDataPoints(content, market) {
    const dataPoints = [];
    
    // Extract percentage changes
    const percentageMatches = content.match(/\d+(?:\.\d+)?%\s*(?:increase|decrease|growth|decline|change)/gi) || [];
    dataPoints.push(...percentageMatches.map(match => ({ type: 'percentage_change', value: match })));
    
    // Extract dollar amounts
    const dollarMatches = content.match(/\$[\d,]+(?:\.\d{2})?\s*(?:median|average|typical)/gi) || [];
    dataPoints.push(...dollarMatches.map(match => ({ type: 'price_point', value: match })));
    
    // ENHANCED: Extract inventory metrics with more patterns
    const inventoryPatterns = [
      /\d+(?:,\d{3})*\s+active\s+listings/gi,
      /\d+(?:\.\d+)?\s*(?:months?|days?)\s*(?:of inventory|on market|to sell)/gi,
      /\d+(?:\.\d+)?\s+months?\s+of\s+supply/gi,
      /inventory\s+(?:expanded|contracted|increased|decreased)\s+\d+(?:\.\d+)?%/gi
    ];
    
    for (const pattern of inventoryPatterns) {
      const matches = content.match(pattern) || [];
      dataPoints.push(...matches.map(match => ({ type: 'inventory_metric', value: match })));
    }
    
    // ENHANCED: Extract market velocity metrics
    const velocityPatterns = [
      /\d+\s+days?\s+(?:on\s+market|average\s+time)/gi,
      /selling\s+in\s+(?:just\s+)?\d+\s+days/gi,
      /market\s+velocity/gi,
      /sales?\s+pace/gi
    ];
    
    for (const pattern of velocityPatterns) {
      const matches = content.match(pattern) || [];
      dataPoints.push(...matches.map(match => ({ type: 'velocity_metric', value: match })));
    }
    
    // ENHANCED: Extract supply/demand indicators
    const supplyDemandPatterns = [
      /(?:seller's|buyer's)\s+market/gi,
      /supply\s+shortage/gi,
      /ample\s+(?:supply|inventory)/gi,
      /balanced\s+(?:market\s+)?conditions/gi,
      /bidding\s+war/gi
    ];
    
    for (const pattern of supplyDemandPatterns) {
      const matches = content.match(pattern) || [];
      dataPoints.push(...matches.map(match => ({ type: 'supply_demand', value: match })));
    }
    
    return dataPoints;
  }

  /**
   * Extract neighborhood references
   * PHASE 2 ENHANCEMENT: Neighborhood-specific data integration
   */
  _extractNeighborhoodReferences(content, market) {
    const references = [];
    const contentLower = content.toLowerCase();
    
    // Market-specific neighborhoods
    const marketSpecificAreas = this._getMarketSpecificAreas(market);
    
    // Look for neighborhood references
    for (const area of marketSpecificAreas) {
      if (contentLower.includes(area.toLowerCase())) {
        references.push({
          name: area,
          type: 'specific_area',
          context: this._extractContextAroundTerm(content, area)
        });
      }
    }
    
    return references;
  }

  /**
   * Get market-specific area names
   */
  _getMarketSpecificAreas(market) {
    const marketLower = market.toLowerCase();
    
    if (marketLower.includes('boston')) {
      return ['Back Bay', 'Cambridge', 'South End', 'Somerville', 'Brookline', 'Newton'];
    } else if (marketLower.includes('new york')) {
      return ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Long Island City'];
    } else if (marketLower.includes('los angeles')) {
      return ['Santa Monica', 'Beverly Hills', 'Venice', 'Pasadena', 'Hollywood', 'West Hollywood'];
    } else if (marketLower.includes('chicago')) {
      return ['Lincoln Park', 'Wicker Park', 'River North', 'Oak Park', 'Evanston', 'Naperville'];
    }
    
    return ['downtown', 'suburbs', 'historic district'];
  }

  /**
   * Extract context around a specific term
   */
  _extractContextAroundTerm(content, term) {
    const sentences = content.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(term.toLowerCase())) {
        return sentence.trim().substring(0, 100) + (sentence.length > 100 ? '...' : '');
      }
    }
    return '';
  }

  /**
   * Format Business Wire dateline
   * Generates proper Business Wire dateline format: CITY, State -- Month Day, Year --
   * @param {string} marketName - Full market name (e.g., "Chicago-Naperville-Elgin, IL-IN-WI")
   * @returns {string} Formatted dateline
   * @private
   */
  _formatBusinessWireDateline(marketName) {
    try {
      // Parse market name to extract city and state
      const parts = marketName.split(',');
      let city = 'Unknown City';
      let state = 'XX';
      
      if (parts.length >= 2) {
        // Extract primary city (first part before any hyphens)
        const cityPart = parts[0].trim();
        const cities = cityPart.split('-');
        city = cities[0].trim(); // Use first city in metro area
        
        // Extract state abbreviation (second part, first 2 letters)
        const statePart = parts[1].trim();
        state = statePart.substring(0, 2).toUpperCase();
      }
      
      // Format date
      const date = new Date();
      const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      
      // Business Wire format: CITY, State -- Month Day, Year --
      const dateline = `${city.toUpperCase()}, ${state} -- ${month} ${day}, ${year} --`;
      
      logger.debug('Business Wire dateline formatted', {
        marketName,
        city,
        state,
        dateline
      });
      
      return dateline;
    } catch (error) {
      logger.error('Failed to format Business Wire dateline', {
        marketName,
        error: error.message
      });
      // Fallback to generic format
      const date = new Date();
      return `PRESS RELEASE -- ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} --`;
    }
  }

  /**
   * Format Business Wire contact block
   * Generates proper Business Wire contact information block
   * @returns {string} Formatted contact block with triple ### end marker
   * @private
   */
  _formatBusinessWireContactBlock() {
    const contactBlock = `

Contact:
100 Market Press Release Generator
Media Relations
press@100market.com
(555) 100-MRKT

###`;
    
    logger.debug('Business Wire contact block formatted');
    
    return contactBlock;
  }

  /**
   * Assess AP Style compliance
   * LOCAL DATA ACCURACY ENHANCEMENT: Enhanced AP-style validation with local data priority
   */
  _assessAPStyleCompliance(content) {
    let score = 100;
    const issues = [];
    
    // Check for section headers (should be eliminated)
    const sectionHeaders = content.match(/^[A-Z\s]+:$/gm) || [];
    if (sectionHeaders.length > 0) {
      score -= sectionHeaders.length * 15;
      issues.push(`${sectionHeaders.length} section headers found - should use flowing narrative`);
    }
    
    // Check for bullet points (should be integrated)
    const bulletPoints = content.match(/^\s*[-•*]/gm) || [];
    if (bulletPoints.length > 0) {
      score -= bulletPoints.length * 10;
      issues.push(`${bulletPoints.length} bullet points found - should integrate into paragraphs`);
    }
    
    // Check for proper lead paragraph
    const hasBusinessWire = /--\(BUSINESS WIRE\)--/.test(content);
    if (!hasBusinessWire) {
      score -= 20;
      issues.push('Missing proper Business Wire lead format');
    }
    
    // LOCAL DATA ACCURACY: Check for national framing overuse
    const nationalFramingPatterns = [
      /nationally/gi,
      /across the country/gi,
      /nationwide/gi,
      /in the united states/gi,
      /american housing market/gi
    ];
    
    let nationalFramingCount = 0;
    for (const pattern of nationalFramingPatterns) {
      const matches = content.match(pattern) || [];
      nationalFramingCount += matches.length;
    }
    
    if (nationalFramingCount > 3) {
      score -= (nationalFramingCount - 3) * 8;
      issues.push(`Excessive national framing (${nationalFramingCount} instances) - should prioritize local data`);
    }
    
    // LOCAL DATA ACCURACY: Check for local data priority
    const localDataPatterns = [
      /\d+(?:\.\d+)?\s*days?\s+on\s+market/gi,
      /\d+(?:,\d{3})*\s+active\s+listings/gi,
      /\d+(?:\.\d+)?\s+months?\s+of\s+(?:inventory|supply)/gi,
      /local\s+median/gi,
      /in\s+\w+\s+(?:area|market|neighborhood)/gi
    ];
    
    let localDataCount = 0;
    for (const pattern of localDataPatterns) {
      const matches = content.match(pattern) || [];
      localDataCount += matches.length;
    }
    
    if (localDataCount < 2) {
      score -= 15;
      issues.push('Insufficient local data integration - should include specific inventory and velocity metrics');
    } else if (localDataCount >= 4) {
      score += 5; // Bonus for strong local data integration
    }
    
    return {
      score: Math.max(0, score),
      issues,
      hasProperLead: hasBusinessWire,
      sectionHeaderCount: sectionHeaders.length,
      bulletPointCount: bulletPoints.length,
      nationalFramingCount,
      localDataCount
    };
  }

  /**
   * Assess narrative flow
   * PHASE 2 CRITICAL: Narrative flow assessment
   */
  _assessNarrativeFlow(content) {
    let score = 100;
    const issues = [];
    
    // Check paragraph count and length
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length < 4) {
      score -= 20;
      issues.push('Insufficient paragraph development for narrative flow');
    }
    
    // Check for transition words/phrases
    const transitionWords = [
      'however', 'meanwhile', 'additionally', 'furthermore', 'in contrast',
      'as a result', 'consequently', 'therefore', 'moreover', 'similarly'
    ];
    
    let transitionCount = 0;
    for (const word of transitionWords) {
      if (content.toLowerCase().includes(word)) {
        transitionCount++;
      }
    }
    
    if (transitionCount < 2) {
      score -= 15;
      issues.push('Limited use of transition words for paragraph flow');
    }
    
    return {
      score: Math.max(0, score),
      issues,
      paragraphCount: paragraphs.length,
      transitionWordCount: transitionCount
    };
  }

  /**
   * Assess local authenticity
   * PHASE 2 ENHANCEMENT: Local authenticity validation
   */
  _assessLocalAuthenticity(content, market) {
    let score = 100;
    const issues = [];
    const contentLower = content.toLowerCase();
    const marketLower = market.toLowerCase();
    
    // Check for market name presence
    if (!contentLower.includes(marketLower)) {
      score -= 30;
      issues.push('Market name not found in content');
    }
    
    // Check for local area references
    const marketAreas = this._getMarketSpecificAreas(market);
    let areaReferences = 0;
    for (const area of marketAreas) {
      if (contentLower.includes(area.toLowerCase())) {
        areaReferences++;
      }
    }
    
    if (areaReferences === 0) {
      score -= 25;
      issues.push('No specific local area references found');
    } else if (areaReferences >= 2) {
      score += 10; // Bonus for multiple area references
    }
    
    return {
      score: Math.max(0, score),
      issues,
      hasMarketName: contentLower.includes(marketLower),
      areaReferences
    };
  }

  /**
   * Process PITCH format - generates structured pitch email data
   */
  async _processPitch(variant, options) {
    const jobId = options.jobId || 'unknown';
    const startTime = Date.now();
    
    // 🚀 SCALE ENHANCEMENT: Entry point logging with scale context
    logger.info('🚀 SCALE PITCH: _processPitch method called with scale enhancements', {
      jobId,
      market: variant.market,
      methodName: '_processPitch',
      timestamp: new Date().toISOString(),
      callerInfo: 'OutputFormatter._processPitch',
      scaleEnhanced: true,
      processId: process.pid,
      memoryUsage: process.memoryUsage().heapUsed
    });
    
    // CRITICAL FIX: Use _pitch suffix to avoid overwriting PR variant files
    const fileName = `${variant.market.replace(/[^a-zA-Z0-9]/g, '_')}_pitch.json`;
    const filePath = path.join(this.config.tempDir, jobId, fileName);
    
    // 🚀 SCALE ENHANCEMENT: Enhanced file path logging with scale context
    logger.info('🚀 SCALE PITCH: File path construction with scale tracking', {
      jobId,
      market: variant.market,
      fileName,
      filePath,
      scaleContext: {
        concurrentProcessing: true,
        isolatedInstance: true,
        errorRecovery: 'enhanced'
      }
    });

    await this._ensureDirectory(path.dirname(filePath));

    // 🚀 SCALE ENHANCEMENT: Create isolated PitchEmailExtractor instance for scale
    let pitchExtractor = null;
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second base delay

    try {
      // 🚀 CRITICAL SCALE FIX: Use isolated instance instead of shared instance
      logger.info('🚀 SCALE PITCH: Creating isolated PitchEmailExtractor instance', {
        jobId,
        market: variant.market,
        reason: 'Scale enhancement - avoid shared instance race conditions',
        isolatedInstance: true
      });
      
      pitchExtractor = new PitchEmailExtractor();
      
      logger.info('🚀 SCALE PITCH: Isolated PitchEmailExtractor created successfully', {
        jobId,
        market: variant.market,
        extractorCreated: !!pitchExtractor,
        instanceType: 'isolated',
        scaleOptimized: true
      });

      // 🚀 SCALE ENHANCEMENT: Retry logic for pitch email extraction with exponential backoff
      while (retryCount <= maxRetries) {
        try {
          // Extract content text from variant with enhanced error handling
          let contentText = '';
          logger.info('🚀 SCALE PITCH: Content extraction with scale resilience', {
            jobId,
            market: variant.market,
            attempt: retryCount + 1,
            maxRetries: maxRetries + 1,
            variantStructure: {
              hasContent: !!variant.content,
              contentType: typeof variant.content,
              hasRawContent: !!variant.rawContent,
              rawContentType: typeof variant.rawContent
            }
          });

          if (variant.content && typeof variant.content === 'object' && variant.content.rawContent) {
            contentText = variant.content.rawContent.content || '';
            logger.info('🚀 SCALE PITCH: Content extracted from variant.content.rawContent.content', {
              jobId,
              market: variant.market,
              contentLength: contentText.length,
              extractionMethod: 'primary'
            });
          } else if (variant.rawContent && variant.rawContent.content) {
            contentText = variant.rawContent.content;
            logger.info('🚀 SCALE PITCH: Content extracted from variant.rawContent.content', {
              jobId,
              market: variant.market,
              contentLength: contentText.length,
              extractionMethod: 'secondary'
            });
          } else {
            logger.info('🚀 SCALE PITCH: Using _extractStringContent fallback', {
              jobId,
              market: variant.market,
              extractionMethod: 'fallback'
            });
            contentText = this._extractStringContent(variant.content);
          }

          if (!contentText) {
            throw new Error(`No content available for pitch email extraction - Market: ${variant.market}`);
          }

          // 🚀 SCALE ENHANCEMENT: Add processing delay for concurrent load management
          if (retryCount > 0) {
            const delay = retryDelay * Math.pow(2, retryCount - 1); // Exponential backoff
            logger.info('🚀 SCALE PITCH: Applying retry delay for load management', {
              jobId,
              market: variant.market,
              retryCount,
              delayMs: delay
            });
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          logger.info('🚀 SCALE PITCH: Calling isolated PitchEmailExtractor.extractPitchData', {
            jobId,
            market: variant.market,
            attempt: retryCount + 1,
            extractorExists: !!pitchExtractor,
            contentLength: contentText.length,
            isolatedInstance: true,
            scaleOptimized: true
          });

          // 🚀 CRITICAL SCALE FIX: Use isolated instance with timeout protection
          const extractionTimeout = 30000; // 30 second timeout per extraction
          const pitchData = await Promise.race([
            pitchExtractor.extractPitchData(contentText, {
              market: variant.market,
              masterPR: options.masterPR || '',
              metadata: variant.metadata || {}
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Pitch extraction timeout for market: ${variant.market}`)), extractionTimeout)
            )
          ]);

          logger.info('🚀 SCALE PITCH: PitchEmailExtractor.extractPitchData completed successfully', {
            jobId,
            market: variant.market,
            attempt: retryCount + 1,
            processingTime: Date.now() - startTime,
            pitchDataReceived: !!pitchData,
            pitchDataKeys: pitchData ? Object.keys(pitchData) : [],
            confidence: pitchData ? pitchData.confidence : 'undefined',
            scaleOptimized: true
          });

          // Create the pitch JSON structure with DUAL OUTPUT support
          const pitchJson = {
            market: variant.market,
            generatedAt: new Date().toISOString(),
            content: contentText, // DUAL OUTPUT: Include original press release content
            pitchEmail: {
              hook: pitchData.hook,
              bullets: pitchData.bullets,
              interviewOffer: pitchData.interviewOffer,
              email: pitchData.email,
              validation: pitchData.validation
            },
            metadata: {
              extractionConfidence: pitchData.confidence,
              sourceContentLength: contentText.length,
              validationResults: pitchData.validationResults,
              jobId: jobId,
              processingTime: Date.now() - startTime,
              scaleEnhanced: true,
              retryCount: retryCount
            }
          };

          // 🚀 SCALE ENHANCEMENT: Atomic file write with error recovery
          logger.info('🚀 SCALE PITCH: Writing pitch JSON file with atomic operation', {
            jobId,
            market: variant.market,
            filePath,
            jsonSize: JSON.stringify(pitchJson, null, 2).length,
            atomicWrite: true
          });

          // Phase 3: S3 Storage Migration - Write pitch directly to S3
          const s3Key = storage.buildContentKey(jobId, 'pitch', variant.market, 'json');
          
          logger.info('🚀 SCALE PITCH: Writing pitch JSON to S3 with atomic operation', {
            jobId,
            market: variant.market,
            s3Key,
            jsonSize: JSON.stringify(pitchJson, null, 2).length,
            atomicWrite: true
          });
          
          const s3Result = await storage.putJSON(s3Key, pitchJson);
          
          logger.info('🚀 SCALE PITCH: Pitch email data written to S3 successfully', {
            jobId,
            market: variant.market,
            s3Key: s3Result.key,
            fileSize: s3Result.size,
            confidence: pitchData.confidence,
            processingTime: Date.now() - startTime,
            retryCount: retryCount,
            scaleOptimized: true
          });

          // 🚀 SCALE ENHANCEMENT: Enhanced return object with S3 metadata
          const returnObject = {
            format: 'pitch',
            fileName,
            filePath, // Keep for backward compatibility
            s3Key: s3Result.key,
            size: s3Result.size,
            market: variant.market,
            confidence: pitchData.confidence,
            processingTime: Date.now() - startTime,
            retryCount: retryCount,
            scaleEnhanced: true
          };

          return returnObject;

        } catch (attemptError) {
          retryCount++;
          
          logger.warn('🚀 SCALE PITCH: Pitch processing attempt failed, evaluating retry', {
            jobId,
            market: variant.market,
            attempt: retryCount,
            maxRetries: maxRetries + 1,
            error: attemptError.message,
            willRetry: retryCount <= maxRetries
          });

          if (retryCount > maxRetries) {
            throw attemptError;
          }

          // Add exponential backoff delay before retry
          const delay = retryDelay * Math.pow(2, retryCount - 1);
          logger.info('🚀 SCALE PITCH: Applying exponential backoff before retry', {
            jobId,
            market: variant.market,
            retryCount,
            delayMs: delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

    } catch (error) {
      logger.error('🚀 SCALE PITCH: Failed to process pitch format after all retries', {
        jobId,
        market: variant.market,
        error: error.message,
        stack: error.stack,
        retryCount: retryCount,
        processingTime: Date.now() - startTime,
        scaleEnhanced: true
      });
      throw error;
    } finally {
      // 🚀 SCALE ENHANCEMENT: Cleanup isolated instance
      if (pitchExtractor) {
        logger.info('🚀 SCALE PITCH: Cleaning up isolated PitchEmailExtractor instance', {
          jobId,
          market: variant.market,
          instanceCleaned: true
        });
        pitchExtractor = null;
        }
      }
    }
  
    /**
     * Extract data sources used from variant metadata
     * Helper method for legal disclaimer generation
     * @private
     */
    _extractDataSources(variant) {
      const sources = [];
      
      // Check variant metadata for data source information
      if (variant.metadata) {
        if (variant.metadata.dataSource) {
          sources.push(variant.metadata.dataSource);
        }
        if (variant.metadata.actualDataSourceUsed) {
          sources.push(variant.metadata.actualDataSourceUsed);
        }
      }
      
      // Check market data for source information
      if (variant.marketData) {
        for (const [market, data] of Object.entries(variant.marketData)) {
          if (data.source) {
            sources.push(data.source);
          }
        }
      }
      
      // Default to common sources if none found
      if (sources.length === 0) {
        sources.push('Example Company', 'Competitor One', 'competitor2.com');
      }
      
      // Remove duplicates
      return [...new Set(sources)];
    }
  }
  
  module.exports = OutputFormatter;