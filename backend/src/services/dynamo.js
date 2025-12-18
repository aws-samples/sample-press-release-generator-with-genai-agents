const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError, NotFoundError } = require('../utils/errorHandler');

class DynamoService {
  constructor() {
    const client = new DynamoDBClient({
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      },
    });
    
    this.docClient = DynamoDBDocumentClient.from(client);
    this.jobsTable = config.aws.dynamodb.jobsTable;
    this.contentTable = config.aws.dynamodb.contentTable;
  }

  /**
   * Initialize the DynamoDB service and test connectivity
   */
  async initialize() {
    try {
      logger.info('Initializing AWS DynamoDB service', {
        region: config.aws.region,
        jobsTable: this.jobsTable,
        contentTable: this.contentTable,
      });
      
      // Test connection by attempting a simple operation
      await this.testConnection();
      logger.info('AWS DynamoDB service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AWS DynamoDB service', {
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', 'Service initialization failed');
    }
  }

  /**
   * Test DynamoDB connectivity
   */
  async testConnection() {
    try {
      // Test by attempting to scan the jobs table with a limit
      const command = new ScanCommand({
        TableName: this.jobsTable,
        Limit: 1,
      });
      
      await this.docClient.send(command);
      return true;
    } catch (error) {
      logger.error('DynamoDB connectivity test failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Create a new job record
   * This is a placeholder implementation - will be expanded in Phase 2
   */
  async createJob(jobData) {
    try {
      const job = {
        jobId: jobData.jobId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...jobData,
      };

      const command = new PutCommand({
        TableName: this.jobsTable,
        Item: job,
        ConditionExpression: 'attribute_not_exists(jobId)',
      });

      const startTime = Date.now();
      await this.docClient.send(command);
      const duration = Date.now() - startTime;

      logger.info('Job created successfully', {
        jobId: job.jobId,
        table: this.jobsTable,
        duration: `${duration}ms`,
      });

      return job;
    } catch (error) {
      logger.error('Failed to create job', {
        jobId: jobData.jobId,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', `Job creation failed: ${error.message}`);
    }
  }

  /**
   * Get job by ID
   */
  async getJob(jobId) {
    try {
      const command = new GetCommand({
        TableName: this.jobsTable,
        Key: { jobId },
      });

      const startTime = Date.now();
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;

      if (!result.Item) {
        throw new NotFoundError(`Job with ID ${jobId}`);
      }

      logger.info('Job retrieved successfully', {
        jobId,
        table: this.jobsTable,
        duration: `${duration}ms`,
      });

      return result.Item;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to get job', {
        jobId,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', `Job retrieval failed: ${error.message}`);
    }
  }

  /**
   * Update job status and data
   */
  async updateJob(jobId, updates) {
    try {
      const updateExpression = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      // Build update expression dynamically
      Object.keys(updates).forEach((key, index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        
        updateExpression.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = updates[key];
      });

      // Always update the updatedAt timestamp
      updateExpression.push('#updatedAt = :updatedAt');
      expressionAttributeNames['#updatedAt'] = 'updatedAt';
      expressionAttributeValues[':updatedAt'] = new Date().toISOString();

      const command = new UpdateCommand({
        TableName: this.jobsTable,
        Key: { jobId },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      });

      const startTime = Date.now();
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;

      logger.info('Job updated successfully', {
        jobId,
        table: this.jobsTable,
        duration: `${duration}ms`,
        updatedFields: Object.keys(updates),
      });

      return result.Attributes;
    } catch (error) {
      logger.error('Failed to update job', {
        jobId,
        updates,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', `Job update failed: ${error.message}`);
    }
  }

  /**
   * Delete job
   */
  async deleteJob(jobId) {
    try {
      const command = new DeleteCommand({
        TableName: this.jobsTable,
        Key: { jobId },
        ReturnValues: 'ALL_OLD',
      });

      const startTime = Date.now();
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;

      if (!result.Attributes) {
        throw new NotFoundError(`Job with ID ${jobId}`);
      }

      logger.info('Job deleted successfully', {
        jobId,
        table: this.jobsTable,
        duration: `${duration}ms`,
      });

      return result.Attributes;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      logger.error('Failed to delete job', {
        jobId,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', `Job deletion failed: ${error.message}`);
    }
  }

  /**
   * List jobs with optional filtering
   */
  async listJobs(options = {}) {
    try {
      const {
        limit = 50,
        lastEvaluatedKey = null,
        status = null,
      } = options;

      let command;

      if (status) {
        // Use GSI for status-based queries (would need to be created)
        command = new QueryCommand({
          TableName: this.jobsTable,
          IndexName: 'status-index', // This would need to be created
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          Limit: limit,
          ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
        });
      } else {
        // Scan all jobs
        command = new ScanCommand({
          TableName: this.jobsTable,
          Limit: limit,
          ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
        });
      }

      const startTime = Date.now();
      const result = await this.docClient.send(command);
      const duration = Date.now() - startTime;

      logger.info('Jobs listed successfully', {
        table: this.jobsTable,
        count: result.Items.length,
        duration: `${duration}ms`,
        hasMore: !!result.LastEvaluatedKey,
      });

      return {
        jobs: result.Items,
        lastEvaluatedKey: result.LastEvaluatedKey,
        count: result.Items.length,
      };
    } catch (error) {
      logger.error('Failed to list jobs', {
        options,
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS DynamoDB', `Job listing failed: ${error.message}`);
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      service: 'AWS DynamoDB',
      region: config.aws.region,
      jobsTable: this.jobsTable,
      contentTable: this.contentTable,
      configured: !!(config.aws.accessKeyId && config.aws.secretAccessKey),
    };
  }
}

// Create singleton instance
const dynamoService = new DynamoService();

module.exports = dynamoService;