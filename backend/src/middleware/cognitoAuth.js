/**
 * Cognito Authentication Middleware
 * Extracts user information from ALB headers after Cognito authentication
 * 
 * When ALB authenticates users via Cognito, it adds headers containing user information:
 * - x-amzn-oidc-accesstoken: Access token
 * - x-amzn-oidc-identity: User identity
 * - x-amzn-oidc-data: JWT with user claims (base64 encoded)
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Extract Cognito user information from ALB headers
 * ALB adds these headers after successful Cognito authentication
 */
function extractCognitoUser(req, res, next) {
  // Skip if authentication is disabled
  if (process.env.ENABLE_AUTHENTICATION !== 'true') {
    return next();
  }

  // Skip if auth mode is not Cognito
  if (process.env.AUTH_MODE !== 'cognito') {
    return next();
  }

  try {
    // ALB adds user info in x-amzn-oidc-data header after authentication
    const userDataHeader = req.headers['x-amzn-oidc-data'];
    const accessToken = req.headers['x-amzn-oidc-accesstoken'];
    const identity = req.headers['x-amzn-oidc-identity'];
    
    if (userDataHeader) {
      // Decode JWT payload (ALB already verified the signature)
      // Format: header.payload.signature
      const parts = userDataHeader.split('.');
      
      if (parts.length !== 3) {
        logger.warn('Invalid OIDC data format', {
          headerLength: userDataHeader.length,
          parts: parts.length
        });
        return next();
      }
      
      // Decode the payload (middle part)
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf8')
      );
      
      // Extract user information from JWT claims
      req.user = {
        // Standard OIDC claims
        sub: payload.sub,                    // Unique user ID
        email: payload.email,                // User email
        email_verified: payload.email_verified === 'true',
        name: payload.name,                  // User full name
        
        // Cognito-specific claims
        username: payload['cognito:username'],
        groups: payload['cognito:groups'] || [],
        
        // Custom attributes
        tier: payload['custom:tier'] || 'free',
        organization: payload['custom:organization'] || '',
        
        // Token information
        iss: payload.iss,                    // Issuer (Cognito User Pool)
        aud: payload.aud,                    // Audience (Client ID)
        exp: payload.exp,                    // Expiration timestamp
        iat: payload.iat,                    // Issued at timestamp
        
        // Authentication metadata
        authenticated: true,
        authMethod: 'cognito',
        authTime: new Date(payload.auth_time * 1000).toISOString(),
        
        // ALB-specific data
        accessToken: accessToken,
        identity: identity
      };
      
      // Check if user is admin
      req.user.isAdmin = req.user.groups.includes('Admins');
      req.user.isEnterprise = req.user.groups.includes('Enterprise') || req.user.tier === 'enterprise';
      
      // Add to request context for logging
      req.requestContext = {
        ...req.requestContext,
        userId: req.user.sub,
        userEmail: req.user.email,
        userTier: req.user.tier,
        isAdmin: req.user.isAdmin
      };
      
      logger.info('User authenticated via Cognito', {
        userId: req.user.sub,
        email: req.user.email,
        tier: req.user.tier,
        groups: req.user.groups,
        isAdmin: req.user.isAdmin,
        path: req.path,
        method: req.method
      });
    } else {
      // No user data header - user not authenticated
      // This should not happen if ALB authentication is properly configured
      logger.warn('No Cognito user data in request headers', {
        path: req.path,
        method: req.method,
        headers: Object.keys(req.headers)
      });
    }
    
    next();
  } catch (error) {
    logger.error('Error extracting Cognito user context', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
    
    // Continue without user context (ALB already authenticated the request)
    next();
  }
}

/**
 * Require authentication middleware
 * Use this to protect specific routes that require authentication
 */
function requireAuth(req, res, next) {
  // Skip if authentication is disabled
  if (process.env.ENABLE_AUTHENTICATION !== 'true') {
    return next();
  }

  if (!req.user || !req.user.authenticated) {
    logger.warn('Unauthenticated request to protected route', {
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource',
      loginUrl: process.env.COGNITO_LOGIN_URL || '/login'
    });
  }
  
  next();
}

/**
 * Require admin role middleware
 * Use this to protect admin-only routes
 */
function requireAdmin(req, res, next) {
  // Skip if authentication is disabled
  if (process.env.ENABLE_AUTHENTICATION !== 'true') {
    return next();
  }

  if (!req.user || !req.user.authenticated) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource'
    });
  }
  
  if (!req.user.isAdmin) {
    logger.warn('Unauthorized admin access attempt', {
      userId: req.user.sub,
      email: req.user.email,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
      requiredRole: 'Admin'
    });
  }
  
  next();
}

/**
 * Require specific tier middleware
 * Use this to protect tier-specific features
 */
function requireTier(minTier) {
  const tierHierarchy = {
    'free': 0,
    'paid': 1,
    'enterprise': 2
  };
  
  return function(req, res, next) {
    // Skip if authentication is disabled
    if (process.env.ENABLE_AUTHENTICATION !== 'true') {
      return next();
    }

    if (!req.user || !req.user.authenticated) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource'
      });
    }
    
    const userTierLevel = tierHierarchy[req.user.tier] || 0;
    const requiredTierLevel = tierHierarchy[minTier] || 0;
    
    if (userTierLevel < requiredTierLevel) {
      logger.warn('Insufficient tier for resource access', {
        userId: req.user.sub,
        email: req.user.email,
        userTier: req.user.tier,
        requiredTier: minTier,
        path: req.path,
        method: req.method
      });
      
      return res.status(403).json({
        error: 'Insufficient tier',
        message: `This feature requires ${minTier} tier or higher`,
        currentTier: req.user.tier,
        requiredTier: minTier,
        upgradeUrl: '/upgrade'
      });
    }
    
    next();
  };
}

/**
 * Rate limiting based on user tier
 */
function getTierRateLimit(tier) {
  const rateLimits = {
    'free': {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10 // 10 requests per 15 minutes
    },
    'paid': {
      windowMs: 15 * 60 * 1000,
      max: 100 // 100 requests per 15 minutes
    },
    'enterprise': {
      windowMs: 15 * 60 * 1000,
      max: 1000 // 1000 requests per 15 minutes
    }
  };
  
  return rateLimits[tier] || rateLimits['free'];
}

/**
 * Tier-based rate limiting middleware
 */
function tierBasedRateLimit(req, res, next) {
  // Skip if authentication is disabled
  if (process.env.ENABLE_AUTHENTICATION !== 'true') {
    return next();
  }

  if (!req.user || !req.user.authenticated) {
    // Apply strictest rate limit for unauthenticated requests
    const limit = getTierRateLimit('free');
    // Implement rate limiting logic here
    // For now, just continue
    return next();
  }
  
  // Get rate limit for user's tier
  const limit = getTierRateLimit(req.user.tier);
  
  // Add rate limit info to response headers
  res.setHeader('X-RateLimit-Limit', limit.max);
  res.setHeader('X-RateLimit-Window', `${limit.windowMs / 1000}s`);
  res.setHeader('X-User-Tier', req.user.tier);
  
  // Implement actual rate limiting logic here
  // For now, just continue
  next();
}

module.exports = {
  extractCognitoUser,
  requireAuth,
  requireAdmin,
  requireTier,
  tierBasedRateLimit,
  getTierRateLimit
};