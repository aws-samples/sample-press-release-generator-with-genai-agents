const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from root directory
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1',
  },

  // Storage Configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'local', // 'local' or 'cloud'
    localPath: process.env.LOCAL_STORAGE_PATH || './storage',
    generatedPath: path.join(process.env.LOCAL_STORAGE_PATH || './storage', 'generated'),
    tempPath: path.join(process.env.LOCAL_STORAGE_PATH || './storage', 'temp'),
  },

  // AWS Configuration (supports both credentials and profiles)
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    // Profile-based authentication (preferred)
    profile: process.env.AWS_PROFILE,
    // Fallback to explicit credentials if no profile
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    
    // Bedrock Configuration - Claude Sonnet 4.5
    // "Max Input": 1M tokens | "Max Output": 64K tokens
    // CRITICAL: Can only specify ONE of temperature OR top_p
    bedrock: {
      modelId: process.env.AWS_BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
      region: process.env.AWS_BEDROCK_REGION || process.env.BEDROCK_REGION || 'us-west-2',
      maxInputTokens: parseInt(process.env.AWS_BEDROCK_MAX_INPUT_TOKENS || '1000000', 10),
      maxOutputTokens: parseInt(process.env.AWS_BEDROCK_MAX_OUTPUT_TOKENS || '64000', 10),
      temperature: parseFloat(process.env.AWS_BEDROCK_TEMPERATURE || '0.7'),
      timeout: parseInt(process.env.AWS_BEDROCK_API_TIMEOUT || '600000', 10), // 10 minutes
    },

    // S3 Configuration
    s3: {
      bucketName: process.env.S3_BUCKET_NAME || 'Example Company-pr-generated-content',
      region: process.env.S3_REGION || 'us-west-2',
    },
    
    // S3 Content Storage Configuration (for s3StorageService)
    s3Storage: {
      bucket: process.env.S3_CONTENT_BUCKET || `100market-content-${process.env.NODE_ENV || 'development'}`,
      region: process.env.AWS_REGION || 'us-west-2',
      prefix: process.env.S3_KEY_PREFIX || 'jobs/',
      presignedUrlExpiration: parseInt(process.env.PRESIGNED_URL_EXPIRATION || '3600', 10)
    },

    // DynamoDB Configuration
    dynamodb: {
      tablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'Example Company-pr-',
      jobsTable: process.env.DYNAMODB_JOBS_TABLE || 'Example Company-pr-jobs',
      contentTable: process.env.DYNAMODB_CONTENT_TABLE || 'Example Company-pr-content',
    },
  },

  // External APIs
  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY,
    baseUrl: process.env.FIRECRAWL_BASE_URL || 'https://api.firecrawl.dev',
  },

  // Perplexity AI Search Configuration
  perplexity: {
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseUrl: process.env.PERPLEXITY_BASE_URL || 'https://api.perplexity.ai',
    model: process.env.PERPLEXITY_MODEL || 'llama-3.1-sonar-small-128k-online',
    rateLimit: parseInt(process.env.PERPLEXITY_RATE_LIMIT || '10', 10),
    timeout: 30000, // 30 seconds timeout for AI search
  },

  // Tavily AI Search Configuration
  tavily: {
    apiKey: process.env.TAVILY_API_KEY,
    baseUrl: process.env.TAVILY_BASE_URL || 'https://api.tavily.com',
    rateLimit: parseInt(process.env.TAVILY_RATE_LIMIT || '100', 10),
    timeout: 30000, // 30 seconds timeout for unified search
    defaultMaxResults: parseInt(process.env.TAVILY_MAX_RESULTS || '5', 10),
    searchDepth: process.env.TAVILY_SEARCH_DEPTH || 'advanced',
  },

  // API Cost Tracking Configuration
  apiCosts: {
    // AWS Bedrock Pricing (Claude 3.7 Sonnet)
    bedrock: {
      'claude-3-7-sonnet': {
        inputCostPer1M: 3.00,    // $3.00 per 1M input tokens
        outputCostPer1M: 15.00,  // $15.00 per 1M output tokens
      },
      'global.anthropic.claude-sonnet-4-5-20250929-v1:0': {
        inputCostPer1M: 3.00,    // $3.00 per 1M input tokens
        outputCostPer1M: 15.00,  // $15.00 per 1M output tokens
      },
    },
    
    // Tavily API Pricing (Pay-as-you-go)
    tavily: {
      creditCost: 0.008,  // $0.008 per credit
      operations: {
        basicSearch: 1,              // 1 credit per basic search
        advancedSearch: 2,           // 2 credits per advanced search
        basicExtract: 0.2,           // 0.2 credits per URL (5 URLs = 1 credit)
        advancedExtract: 0.4,        // 0.4 credits per URL (5 URLs = 2 credits)
        regularMapping: 0.1,         // 0.1 credits per page (10 pages = 1 credit)
        mappingWithInstructions: 0.2 // 0.2 credits per page (10 pages = 2 credits)
      },
    },
    
    // Cost tracking settings
    tracking: {
      enabled: process.env.COST_TRACKING_ENABLED !== 'false',
      precision: 6,  // Decimal places for cost calculations
      currency: 'USD',
    },
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: {
      realEstate: parseInt(process.env.REDIS_TTL_REAL_ESTATE || '21600', 10), // 6 hours
      economic: parseInt(process.env.REDIS_TTL_ECONOMIC || '86400', 10), // 24 hours
      news: parseInt(process.env.REDIS_TTL_NEWS || '7200', 10), // 2 hours
      demographics: parseInt(process.env.REDIS_TTL_DEMOGRAPHICS || '604800', 10), // 7 days
      default: parseInt(process.env.REDIS_TTL || '3600', 10), // 1 hour
    },
  },

  // Data Collection Configuration
  dataCollection: {
    refreshInterval: parseInt(process.env.DATA_REFRESH_INTERVAL || '6', 10), // hours
    maxConcurrentCollections: parseInt(process.env.MAX_CONCURRENT_COLLECTIONS || '10', 10),
    dataQualityThreshold: parseInt(process.env.DATA_QUALITY_THRESHOLD || '80', 10),
    retryAttempts: parseInt(process.env.DATA_RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.DATA_RETRY_DELAY_MS || '5000', 10),
    batchSize: parseInt(process.env.DATA_BATCH_SIZE || '5', 10),
  },

  // External API Keys
  externalApis: {
    censusApiKey: process.env.CENSUS_API_KEY,
    blsApiKey: process.env.BLS_API_KEY,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(','),
    domainPattern: process.env.CORS_DOMAIN_PATTERN,
    credentials: process.env.CORS_CREDENTIALS !== 'false',
    maxAge: parseInt(process.env.CORS_MAX_AGE || '86400', 10), // 24 hours
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
    supportedTypes: (process.env.SUPPORTED_FILE_TYPES || '.txt,.docx,.pdf').split(','),
  },

  // Generation Configuration
  generation: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_GENERATIONS || '5', 10),
    timeoutMs: parseInt(process.env.GENERATION_TIMEOUT_MS || '600000', 10), // 10 minutes
  },

  // Data Lineage Configuration
  dataLineage: {
    enabled: process.env.DATA_LINEAGE_ENABLED !== 'false',
    logLevel: process.env.DATA_LINEAGE_LOG_LEVEL || 'info',
    maxLogFiles: parseInt(process.env.DATA_LINEAGE_MAX_LOG_FILES || '10', 10),
    maxLogSize: parseInt(process.env.DATA_LINEAGE_MAX_LOG_SIZE || '50000000', 10), // 50MB
    persistEvents: process.env.DATA_LINEAGE_PERSIST_EVENTS !== 'false',
    retentionDays: parseInt(process.env.DATA_LINEAGE_RETENTION_DAYS || '30', 10),
    errorThreshold: parseInt(process.env.DATA_LINEAGE_ERROR_THRESHOLD || '100', 10),
    cleanupInterval: parseInt(process.env.DATA_LINEAGE_CLEANUP_INTERVAL || '24', 10), // hours
  },
};

// Validation function
function validateConfig() {
  const requiredEnvVars = ['FIRECRAWL_API_KEY', 'PERPLEXITY_API_KEY'];
  
  // Only require AWS credentials if using cloud storage
  if (config.storage.type === 'cloud') {
    requiredEnvVars.push('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY');
  }

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn(`Warning: Missing required environment variables: ${missingVars.join(', ')}`);
    console.warn('Please check your .env file or environment configuration.');
  }

  return missingVars.length === 0;
}

// Helper function to check if we're using local storage
function isLocalStorage() {
  return config.storage.type === 'local';
}

// Helper function to check if we're using cloud storage
function isCloudStorage() {
  return config.storage.type === 'cloud';
}

// Validate configuration on load
const isValid = validateConfig();

module.exports = {
  config,
  isValid,
  validateConfig,
  isLocalStorage,
  isCloudStorage,
};