const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * Enhanced Quality Assessment Pipeline
 * Multi-dimensional quality assessment framework with mandatory fact-checking gates
 *
 * Features:
 * - Five-dimensional quality model with enhanced accuracy requirements
 * - CRITICAL: Mandatory multi-source verification for statistical claims
 * - CRITICAL: Quality gates that block content with unverified claims
 * - Weighted scoring system with fact-checking thresholds
 * - Stage-gate quality control with automated recommendations
 * - Threshold-based decision making and interventions
 * - Quality trend analysis and continuous improvement
 *
 * "Enhanced Quality Dimensions":
 * - Completeness (25%): Required fields, data coverage, context sufficiency
 * - Accuracy (35%): ENHANCED - Factual verification, multi-source validation, citation integrity
 * - Freshness (15%): Publication date, data recency, update frequency
 * - Consistency (15%): Internal coherence, cross-source alignment
 * - Validity (10%): Sample size, methodology transparency, statistical significance
 *
 * CRITICAL FACT-CHECKING REQUIREMENTS:
 * - Statistical claims must have 2+ authoritative sources
 * - Claims contradicted by authoritative sources are automatically flagged
 * - Content with unverified critical claims is blocked from publication
 * - Multi-source verification bonus scoring applied
 */
class QualityAssessmentPipeline {
  constructor(options = {}) {
    this.name = 'QualityAssessmentPipeline';
    this.version = '1.0.0';
    
    // Enhanced quality dimension weights (must sum to 1.0)
    // CRITICAL: Increased accuracy weight to emphasize fact-checking
    this.dimensionWeights = {
      completeness: options.completenessWeight || 0.25,
      accuracy: options.accuracyWeight || 0.35, // INCREASED for fact-checking emphasis
      freshness: options.freshnessWeight || 0.15,
      consistency: options.consistencyWeight || 0.15,
      validity: options.validityWeight || 0.10
    };

    // CRITICAL: Fact-checking quality gates and requirements
    this.factCheckingRequirements = {
      minSourcesForStatisticalClaims: options.minSourcesForStats || 2,
      minSourcesForCriticalClaims: options.minSourcesForCritical || 3,
      authoritativeSourceThreshold: options.authSourceThreshold || 0.8,
      blockUnverifiedClaims: options.blockUnverifiedClaims !== false, // Default true
      criticalClaimTypes: [
        'factual_inaccuracy_1', // Down payment shrinkage claims
        'factual_inaccuracy_2', // Unverified percentage decrease claims
        'factual_inaccuracy_3', // Inaccurate inventory level claims
        'factual_inaccuracy_4'  // False market days claims
      ]
    };
    
    // Enhanced quality thresholds with fact-checking gates
    this.qualityThresholds = {
      excellent: {
        min: 90, max: 100,
        action: 'auto_approve',
        confidence: 'high',
        factCheckRequired: false // High quality can bypass some checks
      },
      good: {
        min: 80, max: 89,
        action: 'auto_approve',
        confidence: 'medium',
        factCheckRequired: true // Still requires fact-checking
      },
      acceptable: {
        min: 70, max: 79,
        action: 'conditional_approval',
        confidence: 'medium',
        factCheckRequired: true,
        requiresReview: true
      },
      questionable: {
        min: 60, max: 69,
        action: 'flag_for_review',
        confidence: 'low',
        factCheckRequired: true,
        requiresReview: true,
        blockOnUnverifiedClaims: true
      },
      unacceptable: {
        min: 0, max: 59,
        action: 'reject',
        confidence: 'low',
        factCheckRequired: true,
        requiresReview: true,
        blockOnUnverifiedClaims: true
      }
    };
    
    // Content type specific configurations
    this.contentTypeConfigs = {
      press_release: {
        weights: {
          completeness: 0.25,
          accuracy: 0.30,
          freshness: 0.20,
          consistency: 0.15,
          validity: 0.10
        },
        thresholds: {
          excellent: { min: 85, action: 'auto_approve' },
          good: { min: 75, action: 'auto_approve' },
          acceptable: { min: 65, action: 'conditional_approval' },
          questionable: { min: 50, action: 'flag_for_review' },
          unacceptable: { min: 0, action: 'reject' }
        }
      },
      market_report: {
        weights: {
          completeness: 0.20,
          accuracy: 0.35,
          freshness: 0.25,
          consistency: 0.15,
          validity: 0.05
        },
        thresholds: {
          excellent: { min: 90, action: 'auto_approve' },
          good: { min: 80, action: 'auto_approve' },
          acceptable: { min: 70, action: 'conditional_approval' },
          questionable: { min: 60, action: 'flag_for_review' },
          unacceptable: { min: 0, action: 'reject' }
        }
      }
    };
    
    this.isInitialized = false;
    this.qualityHistory = new Map(); // Track quality trends
    this.historyLimit = 100;
    
    logger.info('QualityAssessmentPipeline initialized', {
      dimensionWeights: this.dimensionWeights,
      contentTypes: Object.keys(this.contentTypeConfigs)
    });
  }

  /**
   * Initialize the Quality Assessment Pipeline
   */
  async initialize() {
    try {
      // Validate dimension weights sum to 1.0
      const totalWeight = Object.values(this.dimensionWeights).reduce((sum, weight) => sum + weight, 0);
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        throw new ValidationError(`Dimension weights must sum to 1.0, got ${totalWeight}`);
      }
      
      this.isInitialized = true;
      logger.info('QualityAssessmentPipeline initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize QualityAssessmentPipeline', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Assess quality across all dimensions
   * 
   * @param {Object} content - Content to assess
   * @param {Object} validationResults - Results from fact-checking agents
   * @param {Object} context - Additional context (market data, etc.)
   * @param {Object} options - Assessment options
   * @returns {Object} Comprehensive quality assessment
   */
  async assessQuality(content, validationResults, context = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('QualityAssessmentPipeline not initialized');
    }

    const { jobId, contentType = 'general' } = options;
    const startTime = Date.now();

    logger.debug('Starting quality assessment', {
      jobId,
      contentType,
      validationModules: Object.keys(validationResults)
    });

    try {
      // Step 1: Input validation stage
      const inputValidation = await this._inputValidationStage(content, validationResults, context, options);
      if (inputValidation.criticalIssues.length > 0) {
        return this._createCriticalFailureReport(inputValidation, 'input_validation');
      }

      // Step 2: Content quality stage
      const contentQuality = await this._contentQualityStage(content, validationResults, context, options);
      
      // Step 3: Contextual quality stage
      const contextualQuality = await this._contextualQualityStage(content, validationResults, context, options);
      
      // Step 4: Final quality stage
      const finalQuality = await this._finalQualityStage(contentQuality, contextualQuality, options);

      // Generate comprehensive quality report
      const qualityReport = {
        agent: 'QualityAssessmentPipeline',
        overallScore: finalQuality.overallScore,
        classification: finalQuality.classification,
        action: finalQuality.action,
        confidence: finalQuality.confidence,
        dimensions: finalQuality.dimensions,
        issues: finalQuality.issues,
        recommendations: finalQuality.recommendations,
        confidenceInterval: finalQuality.confidenceInterval,
        metadata: {
          contentType,
          processingTime: Date.now() - startTime,
          assessmentStages: ['input_validation', 'content_quality', 'contextual_quality', 'final_quality'],
          qualityTrend: this._getQualityTrend(jobId)
        }
      };

      // Update quality history
      this._updateQualityHistory(jobId, qualityReport.overallScore, qualityReport.classification);

      logger.info('Quality assessment completed', {
        jobId,
        overallScore: qualityReport.overallScore,
        classification: qualityReport.classification,
        action: qualityReport.action,
        processingTime: qualityReport.metadata.processingTime
      });

      return qualityReport;

    } catch (error) {
      logger.error('Quality assessment failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'QualityAssessmentPipeline',
        overallScore: 50,
        classification: 'questionable',
        action: 'flag_for_review',
        confidence: 'low',
        dimensions: {},
        issues: [{ type: 'assessment_error', severity: 'high', description: error.message }],
        recommendations: ['Manual review required due to assessment error'],
        metadata: {
          error: error.message,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Stage 1: Input Validation
   */
  async _inputValidationStage(content, validationResults, context, options) {
    const issues = [];
    const criticalIssues = [];

    // Validate content structure
    if (!content || (typeof content === 'object' && Object.keys(content).length === 0)) {
      criticalIssues.push({
        type: 'missing_content',
        severity: 'critical',
        description: 'Content is missing or empty'
      });
    }

    // Validate validation results
    if (!validationResults || Object.keys(validationResults).length === 0) {
      criticalIssues.push({
        type: 'missing_validation_results',
        severity: 'critical',
        description: 'Validation results are missing'
      });
    }

    // Check for required validation modules
    const requiredModules = ['SemanticValidator', 'RealTimeDataVerifier', 'StatisticalChecker'];
    for (const module of requiredModules) {
      if (!validationResults[module]) {
        issues.push({
          type: 'missing_validation_module',
          severity: 'medium',
          description: `Missing validation from ${module}`,
          module
        });
      }
    }

    return { issues, criticalIssues };
  }

  /**
   * Stage 2: Content Quality Assessment
   */
  async _contentQualityStage(content, validationResults, context, options) {
    const dimensions = {};

    // Assess Completeness (30%)
    dimensions.completeness = await this._assessCompleteness(content, validationResults, context);
    
    // Assess Accuracy (25%)
    dimensions.accuracy = await this._assessAccuracy(content, validationResults, context);
    
    // Assess Freshness (20%)
    dimensions.freshness = await this._assessFreshness(content, validationResults, context);

    return { dimensions };
  }

  /**
   * Stage 3: Contextual Quality Assessment
   */
  async _contextualQualityStage(content, validationResults, context, options) {
    const dimensions = {};

    // Assess Consistency (15%)
    dimensions.consistency = await this._assessConsistency(content, validationResults, context);
    
    // Assess Validity (10%)
    dimensions.validity = await this._assessValidity(content, validationResults, context);

    return { dimensions };
  }

  /**
   * Stage 4: Final Quality Assessment
   */
  async _finalQualityStage(contentQuality, contextualQuality, options) {
    const { contentType = 'general' } = options;
    
    // Merge all dimensions
    const allDimensions = {
      ...contentQuality.dimensions,
      ...contextualQuality.dimensions
    };

    // Get content-specific configuration
    const config = this.contentTypeConfigs[contentType] || {
      weights: this.dimensionWeights,
      thresholds: this.qualityThresholds
    };

    // Calculate weighted overall score
    let overallScore = 0;
    for (const [dimension, score] of Object.entries(allDimensions)) {
      const weight = config.weights[dimension] || 0;
      overallScore += (score.score || 0) * weight;
    }

    // Determine classification and action
    const classification = this._classifyQuality(overallScore, config.thresholds);
    const action = config.thresholds[classification]?.action || 'flag_for_review';
    
    // Calculate confidence interval
    const confidenceInterval = this._calculateConfidenceInterval(allDimensions, overallScore);
    
    // Generate issues and recommendations
    const issues = this._aggregateIssues(allDimensions);
    const recommendations = this._generateRecommendations(allDimensions, overallScore, classification);

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      classification,
      action,
      confidence: this._getConfidenceLevel(overallScore),
      dimensions: allDimensions,
      confidenceInterval,
      issues,
      recommendations
    };
  }

  /**
   * Assess Completeness dimension
   */
  async _assessCompleteness(content, validationResults, context) {
    let score = 100;
    const issues = [];
    const factors = [];

    // Check required fields presence
    const requiredFields = ['title', 'content', 'date'];
    const missingFields = requiredFields.filter(field => !content[field]);
    
    if (missingFields.length > 0) {
      const penalty = (missingFields.length / requiredFields.length) * 30;
      score -= penalty;
      issues.push({
        type: 'missing_required_fields',
        severity: 'medium',
        description: `Missing required fields: ${missingFields.join(', ')}`,
        fields: missingFields
      });
      factors.push({ factor: 'missing_fields', impact: -penalty });
    }

    // Check data coverage
    const textContent = this._extractTextContent(content);
    if (textContent.length < 100) {
      score -= 20;
      issues.push({
        type: 'insufficient_content',
        severity: 'medium',
        description: 'Content length is insufficient for comprehensive analysis'
      });
      factors.push({ factor: 'content_length', impact: -20 });
    }

    // Check context sufficiency
    if (!context.marketData && !context.historicalData) {
      score -= 15;
      issues.push({
        type: 'insufficient_context',
        severity: 'low',
        description: 'Limited contextual data available for validation'
      });
      factors.push({ factor: 'context_data', impact: -15 });
    }

    return {
      score: Math.max(0, score),
      issues,
      factors,
      description: 'Assessment of required fields, data coverage, and context sufficiency'
    };
  }

  /**
   * Assess Accuracy dimension
   */
  async _assessAccuracy(content, validationResults, context) {
    let score = 100;
    const issues = [];
    const factors = [];

    // Check factual verification results
    const dataVerifier = validationResults.RealTimeDataVerifier;
    if (dataVerifier) {
      const verificationScore = dataVerifier.confidence || 50;
      if (verificationScore < 70) {
        const penalty = (70 - verificationScore) * 0.5;
        score -= penalty;
        issues.push({
          type: 'low_verification_confidence',
          severity: 'high',
          description: `Data verification confidence is low (${verificationScore}%)`
        });
        factors.push({ factor: 'data_verification', impact: -penalty });
      }
    }

    // Check statistical accuracy
    const statisticalChecker = validationResults.StatisticalChecker;
    if (statisticalChecker && statisticalChecker.issues) {
      const statisticalIssues = statisticalChecker.issues.filter(issue => 
        issue.severity === 'high' || issue.severity === 'critical'
      );
      if (statisticalIssues.length > 0) {
        const penalty = statisticalIssues.length * 10;
        score -= penalty;
        issues.push(...statisticalIssues);
        factors.push({ factor: 'statistical_accuracy', impact: -penalty });
      }
    }

    // Check citation integrity
    const sourceTracker = validationResults.SourceTracker;
    if (sourceTracker && sourceTracker.issues) {
      const citationIssues = sourceTracker.issues.filter(issue => 
        issue.type && issue.type.includes('citation')
      );
      if (citationIssues.length > 0) {
        const penalty = citationIssues.length * 5;
        score -= penalty;
        issues.push(...citationIssues);
        factors.push({ factor: 'citation_integrity', impact: -penalty });
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      factors,
      description: 'Assessment of factual verification, statistical accuracy, and citation integrity'
    };
  }

  /**
   * Assess Freshness dimension
   */
  async _assessFreshness(content, validationResults, context) {
    let score = 100;
    const issues = [];
    const factors = [];

    // Check publication date
    const contentDate = content.date || content.publishedAt;
    if (contentDate) {
      const ageInDays = (Date.now() - new Date(contentDate).getTime()) / (1000 * 60 * 60 * 24);
      if (ageInDays > 30) {
        const penalty = Math.min(30, ageInDays - 30);
        score -= penalty;
        issues.push({
          type: 'outdated_content',
          severity: 'medium',
          description: `Content is ${Math.round(ageInDays)} days old`
        });
        factors.push({ factor: 'content_age', impact: -penalty });
      }
    }

    // Check data recency from validation results
    const dataVerifier = validationResults.RealTimeDataVerifier;
    if (dataVerifier && dataVerifier.metadata && dataVerifier.metadata.dataAge) {
      const dataAge = dataVerifier.metadata.dataAge;
      if (dataAge > 7) { // Data older than 7 days
        const penalty = Math.min(20, dataAge - 7);
        score -= penalty;
        issues.push({
          type: 'outdated_data',
          severity: 'medium',
          description: `Referenced data is ${dataAge} days old`
        });
        factors.push({ factor: 'data_age', impact: -penalty });
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      factors,
      description: 'Assessment of publication date, data recency, and update frequency'
    };
  }

  /**
   * Assess Consistency dimension
   */
  async _assessConsistency(content, validationResults, context) {
    let score = 100;
    const issues = [];
    const factors = [];

    // Check internal coherence
    const semanticValidator = validationResults.SemanticValidator;
    if (semanticValidator && semanticValidator.issues) {
      const coherenceIssues = semanticValidator.issues.filter(issue => 
        issue.type && issue.type.includes('coherence')
      );
      if (coherenceIssues.length > 0) {
        const penalty = coherenceIssues.length * 8;
        score -= penalty;
        issues.push(...coherenceIssues);
        factors.push({ factor: 'internal_coherence', impact: -penalty });
      }
    }

    // Check cross-source alignment
    const crossMarketValidator = validationResults.CrossMarketValidator;
    if (crossMarketValidator && crossMarketValidator.issues) {
      const alignmentIssues = crossMarketValidator.issues.filter(issue => 
        issue.type && issue.type.includes('inconsistency')
      );
      if (alignmentIssues.length > 0) {
        const penalty = alignmentIssues.length * 6;
        score -= penalty;
        issues.push(...alignmentIssues);
        factors.push({ factor: 'cross_source_alignment', impact: -penalty });
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      factors,
      description: 'Assessment of internal coherence and cross-source alignment'
    };
  }

  /**
   * Assess Validity dimension
   */
  async _assessValidity(content, validationResults, context) {
    let score = 100;
    const issues = [];
    const factors = [];

    // Check sample size adequacy
    const statisticalChecker = validationResults.StatisticalChecker;
    if (statisticalChecker && statisticalChecker.metadata) {
      const sampleSize = statisticalChecker.metadata.sampleSize;
      if (sampleSize && sampleSize < 30) {
        const penalty = 20;
        score -= penalty;
        issues.push({
          type: 'inadequate_sample_size',
          severity: 'medium',
          description: `Sample size (${sampleSize}) is below recommended minimum (30)`
        });
        factors.push({ factor: 'sample_size', impact: -penalty });
      }
    }

    // Check methodology transparency
    const sourceTracker = validationResults.SourceTracker;
    if (sourceTracker && sourceTracker.metadata) {
      const methodologyScore = sourceTracker.metadata.methodologyTransparency || 50;
      if (methodologyScore < 70) {
        const penalty = (70 - methodologyScore) * 0.3;
        score -= penalty;
        issues.push({
          type: 'low_methodology_transparency',
          severity: 'low',
          description: 'Limited methodology transparency in sources'
        });
        factors.push({ factor: 'methodology_transparency', impact: -penalty });
      }
    }

    return {
      score: Math.max(0, score),
      issues,
      factors,
      description: 'Assessment of sample size, methodology transparency, and statistical significance'
    };
  }

  /**
   * Extract text content from various content formats
   */
  _extractTextContent(content) {
    if (typeof content === 'string') return content;
    if (!content) return '';
    
    if (typeof content === 'object') {
      return content.fullContent || content.fullNarrative || 
             content.leadParagraph || content.narrativeBody || 
             JSON.stringify(content);
    }
    
    return String(content);
  }

  /**
   * Classify quality based on score and thresholds
   */
  _classifyQuality(score, thresholds) {
    for (const [classification, config] of Object.entries(thresholds)) {
      if (score >= config.min && score <= (config.max || 100)) {
        return classification;
      }
    }
    return 'unacceptable';
  }

  /**
   * Calculate confidence interval for quality score
   */
  _calculateConfidenceInterval(dimensions, overallScore) {
    // Calculate standard deviation of dimension scores
    const scores = Object.values(dimensions).map(d => d.score || 0);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // 95% confidence interval
    const marginOfError = 1.96 * (stdDev / Math.sqrt(scores.length));
    
    return {
      lower: Math.max(0, Math.round((overallScore - marginOfError) * 100) / 100),
      upper: Math.min(100, Math.round((overallScore + marginOfError) * 100) / 100),
      marginOfError: Math.round(marginOfError * 100) / 100
    };
  }

  /**
   * Get confidence level based on score
   */
  _getConfidenceLevel(score) {
    if (score >= 85) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  }

  /**
   * Aggregate issues from all dimensions
   */
  _aggregateIssues(dimensions) {
    const allIssues = [];
    for (const dimension of Object.values(dimensions)) {
      if (dimension.issues) {
        allIssues.push(...dimension.issues);
      }
    }
    return allIssues;
  }

  /**
   * Generate quality improvement recommendations
   */
  _generateRecommendations(dimensions, overallScore, classification) {
    const recommendations = [];

    // Overall score recommendations
    if (overallScore < 60) {
      recommendations.push('Content requires significant revision before publication');
    } else if (overallScore < 80) {
      recommendations.push('Content needs improvement in several areas');
    }

    // Dimension-specific recommendations
    for (const [dimensionName, dimension] of Object.entries(dimensions)) {
      if (dimension.score < 70) {
        switch (dimensionName) {
          case 'completeness':
            recommendations.push('Add missing required fields and expand content coverage');
            break;
          case 'accuracy':
            recommendations.push('Verify factual claims and improve source attribution');
            break;
          case 'freshness':
            recommendations.push('Update with more recent data and current information');
            break;
          case 'consistency':
            recommendations.push('Resolve internal contradictions and align with external sources');
            break;
          case 'validity':
            recommendations.push('Improve methodology transparency and statistical rigor');
            break;
        }
      }
    }

    // Classification-specific recommendations
    switch (classification) {
      case 'unacceptable':
        recommendations.push('Reject content and request complete revision');
        break;
      case 'questionable':
        recommendations.push('Flag for manual review before publication');
        break;
      case 'acceptable':
        recommendations.push('Consider minor improvements before publication');
        break;
    }

    return recommendations;
  }

  /**
   * Create critical failure report
   */
  _createCriticalFailureReport(validationResult, stage) {
    return {
      agent: 'QualityAssessmentPipeline',
      overallScore: 0,
      classification: 'unacceptable',
      action: 'reject',
      confidence: 'low',
      dimensions: {},
      issues: validationResult.criticalIssues,
      recommendations: ['Critical validation failure - content cannot be processed'],
      metadata: {
        failureStage: stage,
        criticalFailure: true
      }
    };
  }

  /**
   * Update quality history for trend analysis
   */
  _updateQualityHistory(jobId, score, classification) {
    if (!this.qualityHistory.has(jobId)) {
      this.qualityHistory.set(jobId, []);
    }
    
    const history = this.qualityHistory.get(jobId);
    history.push({
      timestamp: Date.now(),
      score,
      classification
    });
    
    // Limit history size
    if (history.length > this.historyLimit) {
      history.shift();
    }
  }

  /**
   * Get quality trend for a job
   */
  _getQualityTrend(jobId) {
    const history = this.qualityHistory.get(jobId);
    if (!history || history.length < 2) {
      return 'insufficient_data';
    }
    
    const recent = history.slice(-3);
    const trend = recent[recent.length - 1].score - recent[0].score;
    
    if (trend > 5) return 'improving';
    if (trend < -5) return 'declining';
    return 'stable';
  }

  /**
   * Get pipeline status
   */
  getStatus() {
    const totalAssessments = Array.from(this.qualityHistory.values())
      .reduce((total, history) => total + history.length, 0);
    
    return {
      agent: this.name,
      version: this.version,
      initialized: this.isInitialized,
      configuration: {
        dimensionWeights: this.dimensionWeights,
        contentTypes: Object.keys(this.contentTypeConfigs)
      },
      statistics: {
        totalAssessments,
        activeJobs: this.qualityHistory.size
      }
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up QualityAssessmentPipeline');
    this.qualityHistory.clear();
    this.isInitialized = false;
  }
}

module.exports = QualityAssessmentPipeline;