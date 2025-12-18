const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError } = require('../utils/errorHandler');

class S3Service {
  constructor() {
    this.client = new S3Client({
      region: config.aws.s3.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    this.bucketName = config.aws.s3.bucketName;
  }

  /**
   * Initialize the S3 service and test connectivity
   */
  async initialize() {
    try {
      logger.info('Initializing AWS S3 service', {
        region: config.aws.s3.region,
        bucketName: this.bucketName,
      });
      
      // Test connection by checking bucket access
      await this.testConnection();
      logger.info('AWS S3 service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AWS S3 service', {
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS S3', 'Service initialization failed');
    }
  }

  /**
   * Test S3 connectivity
   */
  async testConnection() {
    try {
      // Test by attempting to put a small test object
      const testKey = `test/connectivity-test-${Date.now()}.txt`;
      const testContent = 'S3 connectivity test';
      
      await this.uploadFile(testKey, testContent, 'text/plain');
      await this.deleteFile(testKey);
      
      return true;
    } catch (error) {
      logger.error('S3 connectivity test failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Upload file to S3
   * This is a placeholder implementation - will be expanded in Phase 4
   */
  async uploadFile(key, content, contentType = 'application/octet-stream', metadata = {}) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      });

      const startTime = Date.now();
      const result = await this.client.send(command);
      const duration = Date.now() - startTime;

      logger.info('File uploaded to S3 successfully', {
        bucket: this.bucketName,
        key,
        contentType,
        duration: `${duration}ms`,
        etag: result.ETag,
      });

      return {
        success: true,
        key,
        etag: result.ETag,
        location: `s3://${this.bucketName}/${key}`,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to upload file to S3', {
        bucket: this.bucketName,
        key,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS S3', `File upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const startTime = Date.now();
      const result = await this.client.send(command);
      const duration = Date.now() - startTime;

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);

      logger.info('File downloaded from S3 successfully', {
        bucket: this.bucketName,
        key,
        duration: `${duration}ms`,
        contentLength: content.length,
      });

      return {
        success: true,
        content,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        metadata: result.Metadata,
      };
    } catch (error) {
      logger.error('Failed to download file from S3', {
        bucket: this.bucketName,
        key,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS S3', `File download failed: ${error.message}`);
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const startTime = Date.now();
      await this.client.send(command);
      const duration = Date.now() - startTime;

      logger.info('File deleted from S3 successfully', {
        bucket: this.bucketName,
        key,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        key,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to delete file from S3', {
        bucket: this.bucketName,
        key,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS S3', `File deletion failed: ${error.message}`);
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      service: 'AWS S3',
      bucketName: this.bucketName,
      region: config.aws.s3.region,
      configured: !!(config.aws.accessKeyId && config.aws.secretAccessKey),
    };
  }
}

// Create singleton instance
const s3Service = new S3Service();

module.exports = s3Service;