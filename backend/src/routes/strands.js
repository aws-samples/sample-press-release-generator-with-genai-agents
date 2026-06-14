/**
 * Strands Framework API Routes
 * 
 * Phase 3: Production Integration Routes for Strands Framework
 * Provides Strands-enhanced content generation endpoints with advanced
 * orchestration patterns while maintaining backward compatibility.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { logger } = require('../utils/logger');
const { ValidationError, ExternalServiceError } = require('../utils/errorHandler');

const router = express.Router();

// Import the content generation controller for Strands integration
const contentGenerationController = require('../controllers/contentGeneration');

/**
 * Phase 3: Generate content with Strands orchestration
 * POST /api/v1/content/generate-strands
 */
router.post('/generate-strands', [
  body('markets').isArray().withMessage('Markets must be an array'),
  body('markets.*').isString().withMessage('Each market must be a string'),
  body('masterPR').isString().isLength({ min: 100 }).withMessage('Master PR content must be at least 100 characters'),
  body('orchestrationPattern').optional().isIn([
    'sequential_hybrid'
  ]).withMessage('Only sequential_hybrid orchestration pattern is supported'),
  body('performanceMode').optional().isIn(['fast', 'balanced', 'quality', 'comprehensive']).withMessage('Invalid performance mode'),
  body('dataSource').optional().isIn(['trusted', 'ai', 'hybrid', 'tavily']).withMessage('Data source must be trusted, ai, hybrid, or tavily'),
  body('options.formats').optional().isArray().withMessage('Formats must be an array'),
  body('swarmConfig.consensusThreshold').optional().isFloat({ min: 0, max: 1 }).withMessage('Consensus threshold must be between 0 and 1')
], async (req, res) => {
  const startTime = Date.now();
  const requestId = require('uuid').v4();

  try {
    logger.info('🚀 PHASE 3: Strands-enhanced content generation request received', {
      requestId,
      timestamp: new Date().toISOString(),
      orchestrationPattern: 'sequential_hybrid', // Only supported pattern
      performanceMode: req.body.performanceMode || 'balanced',
      marketCount: req.body.markets?.length || 0
    });

    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Strands content generation request validation failed', { 
        requestId, 
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
        requestId,
        strandsEnabled: true
      });
    }

    // Check if Strands is enabled
    if (!process.env.STRANDS_ENABLED) {
      return res.status(400).json({
        error: 'Strands framework not enabled',
        message: 'Set STRANDS_ENABLED=true to use Strands orchestration',
        suggestion: 'Use /api/v1/content/generate for standard generation',
        fallbackAvailable: true,
        requestId
      });
    }

    const {
      masterPR,
      markets,
      orchestrationPattern = 'sequential_hybrid', // Only supported pattern
      swarmConfig,
      performanceMode = 'balanced',
      dataSource = 'crawler',
      options = {}
    } = req.body;
    
    // [FORMATS-DEBUG] Log formats at route entry
    console.log('[FORMATS-DEBUG] Route-Entry:', {
      requestId,
      optionsFromBody: options,
      formatsFromBody: options?.formats
    });
    
    // [MARKET-TRACKING] Log markets received in Strands route
    console.log(`[MARKET-TRACKING] Strands-Route-Received: count=${markets.length}, first5=[${markets.slice(0,5).join(', ')}]`);

    // Enhanced request with Strands-specific parameters
    const strandsRequest = {
      body: {
        masterPR,
        markets,
        dataSource,
        options: {
          ...options,
          orchestrationPattern,
          swarmConfig,
          performanceMode,
          useStrands: true,
          requestId
        }
      }
    };

    // Create enhanced response object
    const strandsResponse = {
      status: (code) => ({
        json: (data) => {
          const duration = Date.now() - startTime;
          
          logger.info('✅ PHASE 3: Strands-enhanced generation completed', {
            requestId,
            duration,
            success: data.success,
            strandsEnabled: true
          });

          res.status(code).json({
            ...data,
            strandsEnabled: true,
            orchestrationPattern,
            performanceMode,
            metadata: {
              ...data.metadata,
              strandsEnhanced: true,
              duration,
              requestId
            },
            _links: {
              self: '/api/v1/strands/generate-strands',
              jobStatus: data.result?.jobId ? `/api/v1/content/jobs/${data.result.jobId}` : null,
              strandsStatus: '/api/v1/strands/status',
              traditionalGenerate: '/api/v1/content/generate'
            }
          });
        }
      })
    };

    // [MARKET-TRACKING] Log markets before orchestration call
    console.log(`[MARKET-TRACKING] Strands-Route-BeforeOrchestration: count=${markets.length}, first5=[${markets.slice(0,5).join(', ')}]`);
    
    // [FORMATS-DEBUG] Log formats before orchestrator call
    const optionsToPass = {
      ...options,
      orchestrationPattern,
      swarmConfig,
      performanceMode,
      dataSource,
      requestId
    };
    console.log('[FORMATS-DEBUG] Route-BeforeOrchestrator:', {
      requestId,
      optionsToPass,
      formatsInOptions: optionsToPass.formats
    });
    
    // Call the enhanced generation method through the orchestrator
    if (contentGenerationController.genaiOrchestrator.generateContentWithStrands) {
      // Use Strands-enhanced generation
      const result = await contentGenerationController.genaiOrchestrator.generateContentWithStrands(
        masterPR,
        markets,
        optionsToPass
      );

      strandsResponse.status(200).json({
        success: true,
        requestId,
        result
      });
    } else {
      // Fallback to traditional generation with Strands metadata
      logger.warn('🔄 PHASE 3: Strands method not available, using traditional with Strands metadata', {
        requestId
      });

      const fallbackResult = await contentGenerationController.genaiOrchestrator.generateContent({
        masterPR,
        markets,
        dataSource,
        options
      });

      strandsResponse.status(200).json({
        success: true,
        requestId,
        result: {
          ...fallbackResult,
          strandsEnabled: false,
          fallbackUsed: true,
          fallbackReason: 'Strands method not available'
        }
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('❌ PHASE 3: Strands-enhanced content generation failed', {
      requestId,
      duration,
      error: error.message,
      stack: error.stack
    });

    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.message,
        requestId,
        strandsEnabled: true,
        duration
      });
    }

    if (error instanceof ExternalServiceError) {
      return res.status(502).json({
        error: 'Service Error',
        message: error.message,
        service: error.service,
        requestId,
        strandsEnabled: true,
        duration
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Strands-enhanced content generation failed due to an internal error',
      requestId,
      strandsEnabled: true,
      duration
    });
  }
});

/**
 * Phase 3: Get Strands orchestration status and metrics
 * GET /api/v1/strands/status
 */
router.get('/status', async (req, res) => {
  try {
    const strandsStatus = {
      service: 'Strands-Enhanced Content Generation',
      enabled: process.env.STRANDS_ENABLED === 'true',
      available: contentGenerationController.genaiOrchestrator.strandsService?.isStrandsAvailable() || false,
      timestamp: new Date().toISOString(),
      orchestrator: {
        strandsIntegration: !!contentGenerationController.genaiOrchestrator.strandsService,
        patternManager: !!contentGenerationController.genaiOrchestrator.strandsPatternManager,
        metricsCollector: !!contentGenerationController.genaiOrchestrator.strandsMetricsCollector
      },
      patterns: {
        available: [
          'conditional', 'swarm', 'nested', 'hybrid',
          // Phase 4: Specific hybrid patterns
          'adaptive_hybrid', 'parallel_hybrid', 'sequential_hybrid'
        ],
        autoSelection: true,
        patternCombination: true
      },
      metrics: contentGenerationController.genaiOrchestrator.getMetrics().strands || {
        enabled: false,
        message: 'Strands metrics not available'
      },
      endpoints: {
        generateStrands: '/api/v1/strands/generate-strands',
        strandsStatus: '/api/v1/strands/status',
        strandsHealth: '/api/v1/strands/health',
        traditionalGenerate: '/api/v1/content/generate'
      }
    };

    res.status(200).json(strandsStatus);

  } catch (error) {
    logger.error('Failed to get Strands status', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve Strands status',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Phase 3: Get Strands health check
 * GET /api/v1/strands/health
 */
router.get('/health', async (req, res) => {
  try {
    if (!process.env.STRANDS_ENABLED) {
      return res.status(200).json({
        enabled: false,
        available: false,
        message: 'Strands framework is disabled',
        health: 'disabled',
        timestamp: new Date().toISOString()
      });
    }

    const healthCheck = {
      enabled: true,
      available: contentGenerationController.genaiOrchestrator.strandsService?.isStrandsAvailable() || false,
      timestamp: new Date().toISOString(),
      components: {
        strandsService: !!contentGenerationController.genaiOrchestrator.strandsService,
        patternManager: !!contentGenerationController.genaiOrchestrator.strandsPatternManager,
        metricsCollector: !!contentGenerationController.genaiOrchestrator.strandsMetricsCollector
      },
      health: 'unknown'
    };

    // Perform actual health check if Strands service is available
    if (contentGenerationController.genaiOrchestrator.strandsService) {
      try {
        const detailedHealth = await contentGenerationController.genaiOrchestrator.strandsService.performHealthCheck();
        healthCheck.health = detailedHealth.success ? 'healthy' : 'unhealthy';
        healthCheck.details = detailedHealth;
      } catch (healthError) {
        healthCheck.health = 'error';
        healthCheck.error = healthError.message;
      }
    } else {
      healthCheck.health = 'not_available';
      healthCheck.message = 'Strands service not initialized';
    }

    const statusCode = healthCheck.health === 'healthy' ? 200 : 
                      healthCheck.health === 'disabled' ? 200 : 503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    logger.error('Strands health check failed', {
      error: error.message
    });

    res.status(500).json({
      enabled: process.env.STRANDS_ENABLED === 'true',
      available: false,
      health: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Phase 3: Get Strands orchestration patterns
 * GET /api/v1/strands/patterns
 */
router.get('/patterns', async (req, res) => {
  try {
    if (!process.env.STRANDS_ENABLED) {
      return res.status(400).json({
        error: 'Strands framework not enabled',
        message: 'Set STRANDS_ENABLED=true to access orchestration patterns'
      });
    }

    const patterns = {
      available: [
        {
          name: 'conditional',
          description: 'Execute agents based on conditions and results',
          useCase: 'Simple decision trees and branching logic',
          complexity: 'low'
        },
        {
          name: 'swarm',
          description: 'Multiple agents collaborating with consensus mechanisms',
          useCase: 'Quality assurance and collaborative decision making',
          complexity: 'medium'
        },
        {
          name: 'nested',
          description: 'Multi-layer orchestration with complex dependencies',
          useCase: 'Complex hierarchical workflows',
          complexity: 'high'
        },
        {
          name: 'hybrid',
          description: 'Combining different patterns for optimal results',
          useCase: 'Complex multi-phase tasks requiring multiple coordination types',
          complexity: 'very_high'
        }
      ],
      autoSelection: {
        enabled: true,
        description: 'Automatically select optimal pattern based on task characteristics'
      },
      patternCombination: {
        enabled: true,
        description: 'Combine multiple patterns in sequence for complex workflows'
      },
      timestamp: new Date().toISOString()
    };

    res.status(200).json(patterns);

  } catch (error) {
    logger.error('Failed to get orchestration patterns', {
      error: error.message
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve orchestration patterns'
    });
  }
});

module.exports = router;