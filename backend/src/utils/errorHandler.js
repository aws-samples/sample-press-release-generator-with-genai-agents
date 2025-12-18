const { logger } = require('./logger');
const { config } = require('../config');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message = 'External service error') {
    super(`${service}: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

class TimeoutError extends AppError {
  constructor(operation = 'Operation') {
    super(`${operation} timed out`, 408, 'TIMEOUT');
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  };

  // Handle different types of errors
  if (err.name === 'CastError') {
    const message = 'Invalid resource ID';
    error = new ValidationError(message);
  }

  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ConflictError(message);
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message
    }));
    error = new ValidationError('Validation failed', errors);
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new UnauthorizedError(message);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new UnauthorizedError(message);
  }

  // AWS SDK errors
  if (err.name === 'AccessDenied') {
    error = new UnauthorizedError('AWS access denied');
  }

  if (err.name === 'ThrottlingException') {
    error = new RateLimitError('AWS service throttling');
  }

  if (err.name === 'ServiceUnavailableException') {
    error = new ExternalServiceError('AWS', 'Service unavailable');
  }

  // Firecrawl API errors
  if (err.response && err.response.status) {
    if (err.response.status === 401) {
      error = new UnauthorizedError('Firecrawl API authentication failed');
    } else if (err.response.status === 429) {
      error = new RateLimitError('Firecrawl API rate limit exceeded');
    } else if (err.response.status >= 500) {
      error = new ExternalServiceError('Firecrawl', 'Service error');
    }
  }

  // Default to 500 server error
  if (!error.statusCode) {
    error.statusCode = 500;
    error.status = 'error';
    error.code = 'INTERNAL_SERVER_ERROR';
  }

  // Log the error
  if (error.statusCode >= 500) {
    logger.error('Server Error', {
      ...errorContext,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode
      }
    });
  } else {
    logger.warn('Client Error', {
      ...errorContext,
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      }
    });
  }

  // Send error response
  const errorResponse = {
    status: error.status || 'error',
    error: {
      message: error.message,
      code: error.code,
      ...(error.errors && { details: error.errors }),
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };

  // Include stack trace in development
  if (config.server.nodeEnv === 'development') {
    errorResponse.stack = error.stack;
  }

  // Include request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  res.status(error.statusCode).json(errorResponse);
};

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection', {
    error: err.message,
    stack: err.stack,
    promise: promise
  });
  
  // Close server & exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack
  });
  
  // Close server & exit process
  process.exit(1);
});

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  TimeoutError,
};