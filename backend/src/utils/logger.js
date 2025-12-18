const winston = require('winston');
const path = require('path');
const { config } = require('../config');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'Example Company-pr-backend',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // Write all logs to single file (no rotation)
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 10485760, // 10MB
      maxFiles: 1, // Keep only one file, no numbered backups
    }),
    
    // Write errors to separate single file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 1, // Keep only one file, no numbered backups
    })
  ],
});

// Add console transport for development
if (config.server.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
      })
    )
  }));
}

// Create request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
    };
    
    if (res.statusCode >= 400) {
      logger.warn('HTTP Request', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });
  
  next();
};

// Helper functions for structured logging
const loggers = {
  // API request/response logging
  apiRequest: (method, endpoint, data = {}) => {
    logger.info('API Request', {
      type: 'api_request',
      method,
      endpoint,
      ...data
    });
  },

  apiResponse: (method, endpoint, statusCode, duration, data = {}) => {
    logger.info('API Response', {
      type: 'api_response',
      method,
      endpoint,
      statusCode,
      duration,
      ...data
    });
  },

  // Business logic logging
  jobStarted: (jobId, type, metadata = {}) => {
    logger.info('Job Started', {
      type: 'job_started',
      jobId,
      jobType: type,
      ...metadata
    });
  },

  jobCompleted: (jobId, duration, results = {}) => {
    logger.info('Job Completed', {
      type: 'job_completed',
      jobId,
      duration,
      ...results
    });
  },

  jobFailed: (jobId, error, metadata = {}) => {
    logger.error('Job Failed', {
      type: 'job_failed',
      jobId,
      error: error.message,
      stack: error.stack,
      ...metadata
    });
  },

  // External service logging
  externalApiCall: (service, endpoint, method, duration, statusCode) => {
    logger.info('External API Call', {
      type: 'external_api',
      service,
      endpoint,
      method,
      duration,
      statusCode
    });
  },

  externalApiError: (service, endpoint, error) => {
    logger.error('External API Error', {
      type: 'external_api_error',
      service,
      endpoint,
      error: error.message,
      stack: error.stack
    });
  },

  // Security logging
  rateLimitExceeded: (ip, endpoint) => {
    logger.warn('Rate Limit Exceeded', {
      type: 'rate_limit_exceeded',
      ip,
      endpoint,
      timestamp: new Date().toISOString()
    });
  },

  suspiciousActivity: (ip, activity, metadata = {}) => {
    logger.warn('Suspicious Activity', {
      type: 'suspicious_activity',
      ip,
      activity,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }
};

// Create dedicated agent loggers
const createAgentLogger = (agentName) => {
  const agentLogPath = path.join(logsDir, `agent-${agentName.toLowerCase()}.log`);
  
  return winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: {
      service: 'Example Company-pr-backend',
      agent: agentName,
      version: process.env.npm_package_version || '1.0.0'
    },
    transports: [
      // Write agent logs to dedicated single file
      new winston.transports.File({
        filename: agentLogPath,
        maxsize: 10485760, // 10MB
        maxFiles: 1, // Keep only one file, no numbered backups
      }),
      
      // Also write to main log file
      new winston.transports.File({
        filename: config.logging.file,
        maxsize: 10485760, // 10MB
        maxFiles: 1, // Keep only one file, no numbered backups
      }),
      
      // Write errors to error log
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 1, // Keep only one file, no numbered backups
      })
    ],
  });
};

// Agent-specific logging helpers
const createAgentLoggers = (agentName) => {
  const agentLogger = createAgentLogger(agentName);
  
  return {
    info: (message, metadata = {}) => {
      agentLogger.info(message, {
        type: 'agent_info',
        agent: agentName,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    },
    
    warn: (message, metadata = {}) => {
      agentLogger.warn(message, {
        type: 'agent_warning',
        agent: agentName,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    },
    
    error: (message, error = null, metadata = {}) => {
      agentLogger.error(message, {
        type: 'agent_error',
        agent: agentName,
        error: error ? error.message : null,
        stack: error ? error.stack : null,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    },
    
    debug: (message, metadata = {}) => {
      agentLogger.debug(message, {
        type: 'agent_debug',
        agent: agentName,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    },
    
    // Agent-specific action logging
    actionStarted: (action, context = {}) => {
      agentLogger.info(`${agentName} "Action Started": ${action}`, {
        type: 'agent_action_started',
        agent: agentName,
        action,
        timestamp: new Date().toISOString(),
        ...context
      });
    },
    
    actionCompleted: (action, duration, results = {}) => {
      agentLogger.info(`${agentName} "Action Completed": ${action}`, {
        type: 'agent_action_completed',
        agent: agentName,
        action,
        duration,
        timestamp: new Date().toISOString(),
        ...results
      });
    },
    
    actionFailed: (action, error, context = {}) => {
      agentLogger.error(`${agentName} "Action Failed": ${action}`, {
        type: 'agent_action_failed',
        agent: agentName,
        action,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        ...context
      });
    },
    
    // External service calls from agents
    externalCall: (service, operation, duration, success, metadata = {}) => {
      const level = success ? 'info' : 'warn';
      agentLogger[level](`${agentName} "External Call": ${service}.${operation}`, {
        type: 'agent_external_call',
        agent: agentName,
        service,
        operation,
        duration,
        success,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    },
    
    // Progress tracking
    progress: (stage, percentage, details = {}) => {
      agentLogger.info(`${agentName} Progress: ${stage} (${percentage}%)`, {
        type: 'agent_progress',
        agent: agentName,
        stage,
        percentage,
        timestamp: new Date().toISOString(),
        ...details
      });
    }
  };
};

module.exports = {
  logger,
  requestLogger,
  loggers,
  createAgentLogger,
  createAgentLoggers
};