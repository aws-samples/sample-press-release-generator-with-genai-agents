const { asyncHandler } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');
const { config } = require('../config');
const { bedrockService, firecrawlService, s3Service, dynamoService, perplexityService, tavilyService } = require('../services');

/**
 * API status endpoint
 * GET /api/v1/status
 */
const getApiStatus = asyncHandler(async (req, res) => {
  logger.info('=== STATUS CONTROLLER DEBUG START ===');
  
  // Helper function to safely get service status (handles both sync and async)
  const safeGetStatus = async (service, serviceName) => {
    logger.info(`[STATUS DEBUG] Testing ${serviceName} service`, {
      serviceExists: !!service,
      hasGetStatus: typeof service?.getStatus,
      serviceType: typeof service,
      serviceConstructor: service?.constructor?.name
    });
    
    try {
      if (!service) {
        logger.error(`[STATUS DEBUG] ${serviceName} service is null/undefined`);
        return false;
      }
      
      if (typeof service.getStatus !== 'function') {
        logger.error(`[STATUS DEBUG] ${serviceName} service missing getStatus method`, {
          availableMethods: Object.getOwnPropertyNames(service),
          prototype: Object.getOwnPropertyNames(Object.getPrototypeOf(service))
        });
        return false;
      }
      
      const status = await service.getStatus();
      logger.info(`[STATUS DEBUG] ${serviceName} status success`, {
        configured: status.configured,
        statusKeys: Object.keys(status),
        fullStatus: status
      });
      return status.configured;
    } catch (error) {
      logger.error(`[STATUS DEBUG] CRITICAL ERROR - Failed to get ${serviceName} status`, {
        error: error.message,
        service: serviceName,
        stack: error.stack,
        errorType: error.constructor.name,
        serviceExists: !!service,
        hasGetStatus: typeof service?.getStatus
      });
      return false;
    }
  };

  logger.info('[STATUS DEBUG] Starting Promise.all for service statuses');
  
  // Get all service statuses concurrently
  const [bedrockStatus, s3Status, dynamoStatus, firecrawlStatus, perplexityStatus, tavilyStatus] = await Promise.all([
    safeGetStatus(bedrockService, 'bedrock'),
    safeGetStatus(s3Service, 's3'),
    safeGetStatus(dynamoService, 'dynamodb'),
    safeGetStatus(firecrawlService, 'firecrawl'),
    safeGetStatus(perplexityService, 'perplexity'),
    safeGetStatus(tavilyService, 'tavily'),
  ]);

  logger.info('[STATUS DEBUG] Promise.all completed', {
    bedrockStatus,
    s3Status,
    dynamoStatus,
    firecrawlStatus,
    perplexityStatus,
    tavilyStatus
  });

  const statusData = {
    message: 'Press Release Generation API is running',
    version: config.server.apiVersion,
    timestamp: new Date().toISOString(),
    environment: config.server.nodeEnv,
    services: {
      aws: {
        region: config.aws.region,
        bedrock: {
          model: config.aws.bedrock.modelId,
          region: config.aws.bedrock.region,
          configured: bedrockStatus,
        },
        s3: {
          bucket: config.aws.s3.bucketName,
          region: config.aws.s3.region,
          configured: s3Status,
        },
        dynamodb: {
          region: config.aws.region,
          jobsTable: config.aws.dynamodb.jobsTable,
          contentTable: config.aws.dynamodb.contentTable,
          configured: dynamoStatus,
        },
      },
      firecrawl: {
        baseUrl: config.firecrawl.baseUrl,
        configured: firecrawlStatus,
      },
      perplexity: {
        baseUrl: config.perplexity?.baseUrl || 'https://api.perplexity.ai',
        model: config.perplexity?.model || 'sonar-pro',
        configured: perplexityStatus,
        timeout: config.perplexity?.timeout || 30000,
      },
      tavily: {
        baseUrl: config.tavily?.baseUrl || 'https://api.tavily.com',
        model: config.tavily?.model || 'tavily-search-v1',
        configured: tavilyStatus,
        timeout: config.tavily?.timeout || 30000,
        searchDepth: config.tavily?.searchDepth || 'basic',
      },
    },
    features: {
      prGeneration: 'planned', // Will be 'available' in Phase 3
      marketDataCollection: 'planned', // Will be 'available' in Phase 2
      bulkDownload: 'planned', // Will be 'available' in Phase 4
      realTimeProgress: 'planned', // Will be 'available' in Phase 4
    },
    limits: {
      maxFileSize: config.upload.maxFileSize,
      supportedFileTypes: config.upload.supportedTypes,
      maxConcurrentGenerations: config.generation.maxConcurrent,
      generationTimeout: config.generation.timeoutMs,
    },
  };

  logger.info('API status requested', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(200).json(statusData);
});

/**
 * Service configuration status
 * GET /api/v1/status/config
 */
const getConfigStatus = asyncHandler(async (req, res) => {
  const configStatus = {
    timestamp: new Date().toISOString(),
    configuration: {
      server: {
        port: config.server.port,
        environment: config.server.nodeEnv,
        apiVersion: config.server.apiVersion,
      },
      aws: {
        region: config.aws.region,
        credentialsConfigured: !!(config.aws.accessKeyId && config.aws.secretAccessKey),
        services: {
          bedrock: {
            modelId: config.aws.bedrock.modelId,
            region: config.aws.bedrock.region,
          },
          s3: {
            bucketName: config.aws.s3.bucketName,
            region: config.aws.s3.region,
          },
          dynamodb: {
            jobsTable: config.aws.dynamodb.jobsTable,
            contentTable: config.aws.dynamodb.contentTable,
          },
        },
      },
      externalServices: {
        firecrawl: {
          baseUrl: config.firecrawl.baseUrl,
          configured: !!config.firecrawl.apiKey,
        },
        perplexity: {
          baseUrl: config.perplexity?.baseUrl || 'https://api.perplexity.ai',
          model: config.perplexity?.model || 'sonar-pro',
          configured: !!config.perplexity?.apiKey,
          timeout: config.perplexity?.timeout || 30000,
        },
        tavily: {
          baseUrl: config.tavily?.baseUrl || 'https://api.tavily.com',
          model: config.tavily?.model || 'tavily-search-v1',
          configured: !!config.tavily?.apiKey,
          timeout: config.tavily?.timeout || 30000,
          searchDepth: config.tavily?.searchDepth || 'basic',
        },
      },
      features: {
        rateLimiting: {
          windowMs: config.rateLimit.windowMs,
          maxRequests: config.rateLimit.maxRequests,
        },
        cors: {
          origin: config.cors.origin,
        },
        logging: {
          level: config.logging.level,
          file: config.logging.file,
        },
      },
    },
    validation: {
      requiredEnvVars: {
        AWS_ACCESS_KEY_ID: !!config.aws.accessKeyId,
        AWS_SECRET_ACCESS_KEY: !!config.aws.secretAccessKey,
        FIRECRAWL_API_KEY: !!config.firecrawl.apiKey,
        PERPLEXITY_API_KEY: !!config.perplexity.apiKey,
        TAVILY_API_KEY: !!config.tavily?.apiKey,
      },
      allConfigured: !!(
        config.aws.accessKeyId &&
        config.aws.secretAccessKey &&
        config.firecrawl.apiKey &&
        config.perplexity.apiKey &&
        config.tavily?.apiKey
      ),
    },
  };

  logger.info('Configuration status requested', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(200).json(configStatus);
});

module.exports = {
  getApiStatus,
  getConfigStatus,
};