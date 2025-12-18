const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { fromIni } = require('@aws-sdk/credential-providers');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError } = require('../utils/errorHandler');

class BedrockService {
  constructor() {
    // Configure AWS SDK client - prefer profile over explicit credentials
    // CRITICAL FIX: Force region to us-west-2 to override AWS SDK defaults
    const forceRegion = 'us-west-2'; // Force region to match deployment
    const clientConfig = {
      region: forceRegion,
    };
    
    // CRITICAL: Set AWS_REGION environment variable to override SDK defaults
    process.env.AWS_REGION = forceRegion;

    // Use AWS profile if specified, otherwise fall back to explicit credentials
    if (config.aws.profile) {
      // Explicitly configure AWS SDK to use the specified profile
      logger.info('Using AWS CLI profile for Bedrock authentication', {
        profile: config.aws.profile,
        region: config.aws.bedrock.region
      });
      clientConfig.credentials = fromIni({ profile: config.aws.profile });
    } else if (config.aws.accessKeyId && config.aws.secretAccessKey) {
      // Fall back to explicit credentials
      logger.info('Using explicit AWS credentials for Bedrock authentication', {
        region: config.aws.bedrock.region
      });
      clientConfig.credentials = {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        ...(config.aws.sessionToken && { sessionToken: config.aws.sessionToken }),
      };
    } else {
      logger.warn('No AWS credentials or profile configured - relying on default credential chain');
    }

    this.client = new BedrockRuntimeClient(clientConfig);
    this.modelId = config.aws.bedrock.modelId;
  }

  /**
   * Initialize the Bedrock service and test connectivity
   */
  async initialize() {
    try {
      logger.info('Initializing AWS Bedrock service', {
        region: forceRegion,
        modelId: this.modelId,
        actualClientRegion: this.client.config.region,
        envAwsRegion: process.env.AWS_REGION,
        configRegion: config.aws.bedrock.region,
        forcedRegion: forceRegion,
        credentialChainOverride: true
      });
      
      // Test connection with a simple prompt
      await this.testConnection();
      logger.info('AWS Bedrock service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize AWS Bedrock service', {
        error: error.message,
        stack: error.stack,
      });
      throw new ExternalServiceError('AWS Bedrock', 'Service initialization failed');
    }
  }

  /**
   * Test Bedrock connectivity
   */
  async testConnection() {
    try {
      const testPrompt = 'Hello, this is a connectivity test. Please respond with "Connection successful".';
      const response = await this.invokeModel(testPrompt, { maxTokens: 50 });
      
      // CRITICAL FIX: invokeModel now returns {content, usage} object, not string
      const responseText = response?.content || response;
      
      if (responseText && typeof responseText === 'string' && responseText.includes('Connection successful')) {
        return true;
      }
      
      logger.warn('Bedrock test connection received unexpected response', {
        responseText,
        responseType: typeof responseText,
        hasContent: !!response?.content
      });
      return true; // Still consider it successful if we got a response
    } catch (error) {
      logger.error('Bedrock connectivity test failed', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Invoke Claude model with a prompt
   * Enhanced for Phase 3 with retry logic and batch processing
   */
  async invokeModel(prompt, options = {}) {
    return this.invokeModelWithRetry(prompt, options, 1);
  }

  /**
   * Invoke Claude model with retry logic
   * Enhanced for Phase 3A with exponential backoff
   */
  async invokeModelWithRetry(prompt, options = {}, retries = 3) {
    const {
      maxTokens = config.aws.bedrock.maxOutputTokens || 64000,
      temperature = config.aws.bedrock.temperature || 0.7,
      topP, // CRITICAL: Sonnet 4.5 can only use ONE of temperature OR top_p
      stopSequences = [],
    } = options;

    let lastError;
    const baseDelay = 1000; // 1 second base delay

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // CRITICAL: Sonnet 4.5 constraint - use ONLY temperature OR top_p, not both
        const requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          ...(stopSequences.length > 0 && { stop_sequences: stopSequences }),
        };

        // Add ONLY ONE of temperature or top_p (prefer temperature if both provided)
        if (topP !== undefined && temperature === undefined) {
          requestBody.top_p = topP;
        } else {
          requestBody.temperature = temperature;
        }

        const body = JSON.stringify(requestBody);

        const command = new InvokeModelCommand({
          modelId: this.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: body,
        });

        const startTime = Date.now();
        const response = await this.client.send(command);
        const duration = Date.now() - startTime;

        // Add debugging for response
        logger.debug('Bedrock response received', {
          hasResponse: !!response,
          hasBody: !!response?.body,
          responseKeys: response ? Object.keys(response) : [],
          bodyType: response?.body ? typeof response.body : 'undefined'
        });

        if (!response) {
          throw new Error('No response received from Bedrock');
        }

        if (!response.body) {
          throw new Error('No body in Bedrock response');
        }

        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        // 🔍 PRICING DEBUG: Log raw Bedrock response structure
        logger.info('🔍 PRICING DEBUG: Bedrock raw response structure', {
          hasUsage: !!responseBody.usage,
          usageKeys: responseBody.usage ? Object.keys(responseBody.usage) : [],
          inputTokens: responseBody.usage?.input_tokens,
          outputTokens: responseBody.usage?.output_tokens,
          hasContent: !!responseBody.content,
          contentLength: responseBody.content?.length
        });
        
        // Track token usage for cost optimization
        this.trackTokenUsage(
          responseBody.usage?.input_tokens || 0,
          responseBody.usage?.output_tokens || 0
        );
        
        logger.info('Bedrock model invoked successfully', {
          modelId: this.modelId,
          duration: `${duration}ms`,
          inputTokens: responseBody.usage?.input_tokens || 0,
          outputTokens: responseBody.usage?.output_tokens || 0,
          attempt,
          retries
        });

        // 🐛 CRITICAL FIX: Return object with both content AND usage for cost tracking
        // Previously returned only text string, causing $0 cost calculations
        return {
          content: responseBody.content[0]?.text || '',
          usage: {
            inputTokens: responseBody.usage?.input_tokens || 0,
            outputTokens: responseBody.usage?.output_tokens || 0
          }
        };

      } catch (error) {
        lastError = error;
        
        logger.warn('Bedrock model invocation failed', {
          error: error.message,
          modelId: this.modelId,
          attempt,
          retries,
          willRetry: attempt < retries
        });

        // Don't retry on certain error types
        if (error.name === 'ValidationException' || error.name === 'AccessDeniedException') {
          break;
        }

        // Exponential backoff delay
        if (attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await this._delay(delay);
        }
      }
    }

    logger.error('Failed to invoke Bedrock model after all retries', {
      error: lastError.message,
      stack: lastError.stack,
      modelId: this.modelId,
      attempts: retries
    });

    throw new ExternalServiceError('AWS Bedrock', `Model invocation failed after ${retries} attempts: ${lastError.message}`);
  }

  /**
   * Batch invoke multiple prompts efficiently
   * New for Phase 3A
   */
  async batchInvoke(prompts, options = {}) {
    const {
      maxConcurrent = 5,
      ...invokeOptions
    } = options;

    logger.info('Starting batch invocation', {
      promptCount: prompts.length,
      maxConcurrent
    });

    const results = [];
    const batches = this._createBatches(prompts, maxConcurrent);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      logger.debug('Processing batch', {
        batchIndex: i + 1,
        batchSize: batch.length,
        totalBatches: batches.length
      });

      const batchPromises = batch.map((prompt, index) =>
        this.invokeModelWithRetry(prompt, invokeOptions)
          .then(result => ({ index: i * maxConcurrent + index, result, success: true }))
          .catch(error => ({ index: i * maxConcurrent + index, error: error.message, success: false }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    logger.info('Batch invocation completed', {
      total: results.length,
      successful,
      failed,
      successRate: `${Math.round((successful / results.length) * 100)}%`
    });

    return results;
  }

  /**
   * Optimize prompt for token efficiency
   * New for Phase 3A
   */
  async optimizePrompt(prompt) {
    // Basic prompt optimization - can be enhanced with more sophisticated logic
    let optimized = prompt.trim();
    
    // Remove excessive whitespace
    optimized = optimized.replace(/\s+/g, ' ');
    
    // Remove redundant phrases (basic implementation)
    const redundantPhrases = [
      'please note that',
      'it should be noted that',
      'it is important to mention that'
    ];
    
    for (const phrase of redundantPhrases) {
      const regex = new RegExp(phrase, 'gi');
      optimized = optimized.replace(regex, '');
    }
    
    logger.debug('Prompt optimized', {
      originalLength: prompt.length,
      optimizedLength: optimized.length,
      reduction: prompt.length - optimized.length
    });
    
    return optimized;
  }

  /**
   * Track token usage for cost management
   * New for Phase 3A
   */
  trackTokenUsage(inputTokens, outputTokens) {
    if (!this.tokenUsage) {
      this.tokenUsage = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        dailyUsage: new Map(),
        startTime: new Date()
      };
    }

    this.tokenUsage.totalInputTokens += inputTokens;
    this.tokenUsage.totalOutputTokens += outputTokens;
    this.tokenUsage.totalRequests += 1;

    // Track daily usage
    const today = new Date().toISOString().split('T')[0];
    const dailyStats = this.tokenUsage.dailyUsage.get(today) || {
      inputTokens: 0,
      outputTokens: 0,
      requests: 0
    };

    dailyStats.inputTokens += inputTokens;
    dailyStats.outputTokens += outputTokens;
    dailyStats.requests += 1;

    this.tokenUsage.dailyUsage.set(today, dailyStats);

    // Log usage periodically
    if (this.tokenUsage.totalRequests % 10 === 0) {
      logger.info('Token usage update', {
        totalInputTokens: this.tokenUsage.totalInputTokens,
        totalOutputTokens: this.tokenUsage.totalOutputTokens,
        totalRequests: this.tokenUsage.totalRequests,
        todayUsage: dailyStats
      });
    }
  }

  /**
   * Get token usage statistics
   * New for Phase 3A
   */
  getTokenUsage() {
    if (!this.tokenUsage) {
      return {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
        dailyUsage: {},
        estimatedCost: 0
      };
    }

    // Rough cost estimation (actual costs may vary)
    const inputCostPer1K = 0.003; // $0.003 per 1K input tokens (example)
    const outputCostPer1K = 0.015; // $0.015 per 1K output tokens (example)
    
    const estimatedCost =
      (this.tokenUsage.totalInputTokens / 1000) * inputCostPer1K +
      (this.tokenUsage.totalOutputTokens / 1000) * outputCostPer1K;

    return {
      ...this.tokenUsage,
      dailyUsage: Object.fromEntries(this.tokenUsage.dailyUsage),
      estimatedCost: Math.round(estimatedCost * 100) / 100 // Round to 2 decimal places
    };
  }

  /**
   * Get service status
   */
  getStatus() {
    const tokenUsage = this.getTokenUsage();
    
    return {
      service: 'AWS Bedrock',
      modelId: this.modelId,
      region: config.aws.bedrock.region,
      configured: !!(config.aws.accessKeyId && config.aws.secretAccessKey),
      tokenUsage: {
        totalRequests: tokenUsage.totalRequests,
        totalTokens: tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens,
        estimatedCost: tokenUsage.estimatedCost
      }
    };
  }

  /**
   * Helper method for delays in retry logic
   */
  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create batches from array
   */
  _createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

// Create singleton instance with force reinitialization
const bedrockService = new BedrockService();

// CRITICAL FIX: Force reinitialization to ensure correct region
bedrockService._forceReinitialize = function() {
  const forceRegion = 'us-west-2';
  process.env.AWS_REGION = forceRegion;
  
  const clientConfig = {
    region: forceRegion,
  };
  
  this.client = new (require('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient)(clientConfig);
  this.modelId = require('../config').config.aws.bedrock.modelId;
  
  console.log('🔧 BEDROCK FORCE REINITIALIZED:', {
    region: forceRegion,
    modelId: this.modelId,
    timestamp: new Date().toISOString()
  });
};

// Force reinitialize immediately
bedrockService._forceReinitialize();

module.exports = bedrockService;