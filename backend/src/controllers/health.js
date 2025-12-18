const { asyncHandler } = require('../utils/errorHandler');
const { logger } = require('../utils/logger');
const { bedrockService, firecrawlService, s3Service, dynamoService } = require('../services');

/**
 * Health check endpoint
 * GET /health
 */
const healthCheck = asyncHandler(async (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      bedrock: bedrockService.getStatus(),
      firecrawl: firecrawlService.getStatus(),
      s3: s3Service.getStatus(),
      dynamodb: dynamoService.getStatus(),
    },
  };

  logger.info('Health check requested', {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(200).json(healthData);
});

/**
 * Detailed health check with service connectivity tests
 * GET /health/detailed
 */
const detailedHealthCheck = asyncHandler(async (req, res) => {
  const startTime = Date.now();
  const serviceTests = {};

  // Test each service connectivity
  try {
    await bedrockService.testConnection();
    serviceTests.bedrock = { status: 'healthy', error: null };
  } catch (error) {
    serviceTests.bedrock = { status: 'unhealthy', error: error.message };
  }

  try {
    await firecrawlService.testConnection();
    serviceTests.firecrawl = { status: 'healthy', error: null };
  } catch (error) {
    serviceTests.firecrawl = { status: 'unhealthy', error: error.message };
  }

  try {
    await s3Service.testConnection();
    serviceTests.s3 = { status: 'healthy', error: null };
  } catch (error) {
    serviceTests.s3 = { status: 'unhealthy', error: error.message };
  }

  try {
    await dynamoService.testConnection();
    serviceTests.dynamodb = { status: 'healthy', error: null };
  } catch (error) {
    serviceTests.dynamodb = { status: 'unhealthy', error: error.message };
  }

  const duration = Date.now() - startTime;
  const allHealthy = Object.values(serviceTests).every(test => test.status === 'healthy');

  const healthData = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    testDuration: `${duration}ms`,
    services: serviceTests,
  };

  logger.info('Detailed health check completed', {
    status: healthData.status,
    duration: `${duration}ms`,
    ip: req.ip,
  });

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(healthData);
});

module.exports = {
  healthCheck,
  detailedHealthCheck,
};