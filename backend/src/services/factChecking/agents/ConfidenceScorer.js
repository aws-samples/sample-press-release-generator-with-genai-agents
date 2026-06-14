const { logger } = require('../../../utils/logger');
const { ValidationError } = require('../../../utils/errorHandler');

/**
 * Enhanced Confidence Scorer Agent
 * Provides 0-100 confidence scoring with multi-source verification requirements
 *
 * Features:
 * - Multi-dimensional confidence scoring with source credibility weighting
 * - CRITICAL: Penalty system for unverified statistical claims
 * - CRITICAL: Bonus scoring for claims verified by multiple authoritative sources
 * - Risk level assessment (low/medium/high/critical)
 * - Weighted scoring based on validation results
 * - Threshold-based intervention recommendations with multi-source requirements
 * - Confidence trend analysis
 * - Custom scoring models for different content types
 */
class ConfidenceScorer {
  constructor(options = {}) {
    this.name = 'ConfidenceScorer';
    this.version = '1.0.0';
    
    this.config = {
      baseConfidence: options.baseConfidence || 100,
      thresholds: {
        critical: options.criticalThreshold || 30,
        high: options.highThreshold || 50,
        medium: options.mediumThreshold || 70,
        low: options.lowThreshold || 85
      },
      weights: {
        semanticValidation: options.semanticWeight || 0.15, // Reduced to make room for multi-source
        dataVerification: options.dataWeight || 0.30, // Increased importance
        crossMarketConsistency: options.crossMarketWeight || 0.15,
        statisticalPlausibility: options.statisticalWeight || 0.15,
        sourceAttribution: options.sourceWeight || 0.25 // Increased importance
      },
      // CRITICAL: Enhanced penalty system for unverified claims
      penaltyMultipliers: {
        critical: 3.0, // Increased penalty for critical issues
        high: 2.0,     // Increased penalty for high issues
        medium: 1.5,   // Increased penalty for medium issues
        low: 0.8       // Slight penalty for low issues
      },
      // CRITICAL: New multi-source verification parameters
      multiSourceRequirements: {
        minSourcesForStatisticalClaims: options.minSourcesForStats || 2,
        minSourcesForCriticalClaims: options.minSourcesForCritical || 3,
        unverifiedStatisticalPenalty: options.unverifiedStatsPenalty || 40, // 40 point penalty
        multiSourceBonus: options.multiSourceBonus || 15, // 15 point bonus
        authoritativeSourceBonus: options.authSourceBonus || 10, // 10 point bonus per authoritative source
        sourceCredibilityThreshold: options.sourceCredThreshold || 0.8
      },
      timeout: options.timeout || 10000
    };
    
    this.isInitialized = false;
    
    // Scoring models for different content types
    this.scoringModels = {
      'press_release': {
        weights: {
          semanticValidation: 0.15,
          dataVerification: 0.30,
          crossMarketConsistency: 0.20,
          statisticalPlausibility: 0.20,
          sourceAttribution: 0.15
        },
        thresholds: {
          critical: 40,
          high: 60,
          medium: 75,
          low: 85
        }
      },
      'market_report': {
        weights: {
          semanticValidation: 0.10,
          dataVerification: 0.35,
          crossMarketConsistency: 0.25,
          statisticalPlausibility: 0.25,
          sourceAttribution: 0.05
        },
        thresholds: {
          critical: 30,
          high: 50,
          medium: 70,
          low: 85
        }
      },
      'general': {
        weights: this.config.weights,
        thresholds: this.config.thresholds
      }
    };
    
    // Risk assessment criteria
    this.riskCriteria = {
      critical: {
        conditions: [
          { type: 'confidence', operator: '<=', value: 30 },
          { type: 'critical_issues', operator: '>=', value: 3 },
          { type: 'data_verification_failure', operator: '>=', value: 2 }
        ],
        interventions: [
          'immediate_manual_review',
          'content_regeneration',
          'additional_fact_checking'
        ]
      },
      high: {
        conditions: [
          { type: 'confidence', operator: '<=', value: 50 },
          { type: 'high_issues', operator: '>=', value: 2 },
          { type: 'source_attribution_missing', operator: '>=', value: 1 }
        ],
        interventions: [
          'manual_review_recommended',
          'source_verification',
          'cross_reference_check'
        ]
      },
      medium: {
        conditions: [
          { type: 'confidence', operator: '<=', value: 70 },
          { type: 'medium_issues', operator: '>=', value: 3 }
        ],
        interventions: [
          'automated_correction',
          'additional_validation'
        ]
      },
      low: {
        conditions: [
          { type: 'confidence', operator: '<=', value: 85 },
          { type: 'low_issues', operator: '>=', value: 5 }
        ],
        interventions: [
          'minor_adjustments',
          'quality_monitoring'
        ]
      }
    };
    
    // Confidence history for trend analysis
    this.confidenceHistory = new Map();
    this.historyLimit = 100;
  }

  /**
   * Initialize the Confidence Scorer
   */
  async initialize() {
    try {
      logger.info('Initializing ConfidenceScorer', {
        config: this.config,
        scoringModels: Object.keys(this.scoringModels),
        riskLevels: Object.keys(this.riskCriteria)
      });
      
      this.isInitialized = true;
      logger.info('ConfidenceScorer initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize ConfidenceScorer', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Calculate comprehensive confidence score
   */
  async calculateConfidence(validationResults, content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('ConfidenceScorer not initialized');
    }

    const { jobId, contentType = 'general' } = options;
    const startTime = Date.now();

    logger.debug('Starting confidence scoring', {
      jobId,
      contentType,
      validationModules: Object.keys(validationResults)
    });

    try {
      const result = {
        agent: 'ConfidenceScorer',
        confidence: this.config.baseConfidence,
        riskLevel: 'low',
        riskScore: 0,
        interventions: [],
        breakdown: {},
        confidenceInterval: null,
        uncertaintyQuantification: null,
        evidenceWeighting: null,
        metadata: {
          contentType,
          scoringModel: contentType,
          processingTime: 0,
          confidenceFactors: []
        }
      };

      // Step 1: Select appropriate scoring model
      const scoringModel = this._selectScoringModel(contentType);
      result.metadata.scoringModel = scoringModel;

      // Step 2: Calculate weighted confidence score
      const weightedScore = await this._calculateWeightedScore(validationResults, scoringModel, jobId);
      result.confidence = weightedScore.confidence;
      result.breakdown = weightedScore.breakdown;
      result.metadata.confidenceFactors = weightedScore.factors;

      // Step 3: Apply penalty adjustments
      const penaltyAdjustments = await this._applyPenaltyAdjustments(validationResults, result.confidence, jobId);
      result.confidence = penaltyAdjustments.adjustedConfidence;
      result.metadata.penaltyAdjustments = penaltyAdjustments.adjustments;

      // Step 4: Calculate confidence interval
      const confidenceInterval = await this._calculateConfidenceInterval(result.confidence, result.breakdown, validationResults, jobId);
      result.confidenceInterval = confidenceInterval;

      // Step 5: Quantify uncertainty
      const uncertaintyQuantification = await this._quantifyUncertainty(result.confidence, validationResults, content, jobId);
      result.uncertaintyQuantification = uncertaintyQuantification;

      // Step 6: Calculate evidence weighting
      const evidenceWeighting = await this._calculateEvidenceWeighting(validationResults, result.breakdown, jobId);
      result.evidenceWeighting = evidenceWeighting;

      // Step 7: Assess risk level
      const riskAssessment = await this._assessRiskLevel(result.confidence, validationResults, scoringModel, jobId);
      result.riskLevel = riskAssessment.level;
      result.riskScore = riskAssessment.score;
      result.interventions = riskAssessment.interventions;

      // Step 8: Generate confidence insights
      const insights = await this._generateConfidenceInsights(result, validationResults, jobId);
      result.insights = insights;

      // Step 6: Update confidence history
      this._updateConfidenceHistory(jobId, result.confidence, result.riskLevel);

      result.metadata.processingTime = Date.now() - startTime;
      result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence)));

      logger.debug('Confidence scoring completed', {
        jobId,
        confidence: result.confidence,
        riskLevel: result.riskLevel,
        interventions: result.interventions.length,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Confidence scoring failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'ConfidenceScorer',
        confidence: 50,
        riskLevel: 'high',
        riskScore: 0.8,
        interventions: ['manual_review_required'],
        breakdown: {},
        insights: ['Confidence scoring encountered an error'],
        metadata: {
          error: error.message,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Select appropriate scoring model based on content type
   */
  _selectScoringModel(contentType) {
    const model = this.scoringModels[contentType] || this.scoringModels['general'];
    
    logger.debug('Selected scoring model', {
      contentType,
      weights: model.weights,
      thresholds: model.thresholds
    });
    
    return model;
  }

  /**
   * Calculate weighted confidence score
   */
  async _calculateWeightedScore(validationResults, scoringModel, jobId) {
    try {
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const breakdown = {};
      const factors = [];

      // Calculate weighted scores for each validation module
      for (const [module, weight] of Object.entries(scoringModel.weights)) {
        const moduleResult = validationResults[module];
        
        if (moduleResult && typeof moduleResult.confidence === 'number') {
          const moduleScore = moduleResult.confidence * weight;
          totalWeightedScore += moduleScore;
          totalWeight += weight;
          
          breakdown[module] = {
            confidence: moduleResult.confidence,
            weight: weight,
            weightedScore: moduleScore,
            issues: moduleResult.issues ? moduleResult.issues.length : 0
          };
          
          factors.push({
            module,
            confidence: moduleResult.confidence,
            impact: weight,
            issues: moduleResult.issues ? moduleResult.issues.length : 0
          });
        } else {
          logger.warn('Missing or invalid validation result', {
            jobId,
            module,
            result: moduleResult
          });
          
          // Use penalty for missing modules
          const penaltyScore = 50 * weight; // Assume 50% confidence for missing modules
          totalWeightedScore += penaltyScore;
          totalWeight += weight;
          
          breakdown[module] = {
            confidence: 50,
            weight: weight,
            weightedScore: penaltyScore,
            issues: 0,
            status: 'missing_result'
          };
        }
      }

      const finalConfidence = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

      return {
        confidence: finalConfidence,
        breakdown,
        factors
      };

    } catch (error) {
      logger.warn('Weighted score calculation failed', {
        jobId,
        error: error.message
      });
      
      return {
        confidence: 50,
        breakdown: {},
        factors: []
      };
    }
  }

  /**
   * Apply penalty adjustments based on issue severity
   */
  async _applyPenaltyAdjustments(validationResults, baseConfidence, jobId) {
    try {
      let adjustedConfidence = baseConfidence;
      const adjustments = [];

      // Count issues by severity across all modules
      const issueCounts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };

      for (const moduleResult of Object.values(validationResults)) {
        if (moduleResult.issues) {
          for (const issue of moduleResult.issues) {
            const severity = issue.severity || 'medium';
            if (issueCounts[severity] !== undefined) {
              issueCounts[severity]++;
            }
          }
        }
      }

      // Apply severity-based penalties
      for (const [severity, count] of Object.entries(issueCounts)) {
        if (count > 0) {
          const multiplier = this.config.penaltyMultipliers[severity] || 1.0;
          const penalty = count * 5 * multiplier; // Base penalty of 5 points per issue
          adjustedConfidence -= penalty;
          
          adjustments.push({
            severity,
            count,
            penalty,
            multiplier
          });
        }
      }

      // Additional penalties for specific patterns
      const patternPenalties = this._calculatePatternPenalties(validationResults);
      adjustedConfidence -= patternPenalties.totalPenalty;
      adjustments.push(...patternPenalties.adjustments);

      return {
        adjustedConfidence: Math.max(0, adjustedConfidence),
        adjustments
      };

    } catch (error) {
      logger.warn('Penalty adjustment calculation failed', {
        jobId,
        error: error.message
      });
      
      return {
        adjustedConfidence: baseConfidence * 0.8, // Conservative adjustment
        adjustments: [{ type: 'error_penalty', penalty: baseConfidence * 0.2 }]
      };
    }
  }

  /**
   * Calculate pattern-based penalties
   */
  _calculatePatternPenalties(validationResults) {
    const adjustments = [];
    let totalPenalty = 0;

    // Multiple data verification failures
    const dataVerificationResult = validationResults.dataVerification || validationResults.RealTimeDataVerifier;
    if (dataVerificationResult && dataVerificationResult.issues) {
      const dataFailures = dataVerificationResult.issues.filter(issue => 
        issue.type && issue.type.includes('verification_failed')
      ).length;
      
      if (dataFailures >= 2) {
        const penalty = dataFailures * 10;
        totalPenalty += penalty;
        adjustments.push({
          type: 'multiple_data_failures',
          count: dataFailures,
          penalty
        });
      }
    }

    // Missing source attribution for statistical claims
    const sourceResult = validationResults.sourceAttribution || validationResults.SourceTracker;
    if (sourceResult && sourceResult.issues) {
      const sourceIssues = sourceResult.issues.filter(issue => 
        issue.type && issue.type.includes('missing') && issue.type.includes('source')
      ).length;
      
      if (sourceIssues >= 1) {
        const penalty = sourceIssues * 15;
        totalPenalty += penalty;
        adjustments.push({
          type: 'missing_source_attribution',
          count: sourceIssues,
          penalty
        });
      }
    }

    // Cross-market inconsistencies
    const crossMarketResult = validationResults.crossMarketConsistency || validationResults.CrossMarketValidator;
    if (crossMarketResult && crossMarketResult.issues) {
      const inconsistencies = crossMarketResult.issues.filter(issue => 
        issue.type && issue.type.includes('inconsistency')
      ).length;
      
      if (inconsistencies >= 2) {
        const penalty = inconsistencies * 8;
        totalPenalty += penalty;
        adjustments.push({
          type: 'cross_market_inconsistencies',
          count: inconsistencies,
          penalty
        });
      }
    }

    return { totalPenalty, adjustments };
  }

  /**
   * Assess risk level based on confidence and validation results
   */
  async _assessRiskLevel(confidence, validationResults, scoringModel, jobId) {
    try {
      // Count issues by severity
      const issueCounts = this._countIssuesBySeverity(validationResults);
      
      // Evaluate risk criteria
      for (const [level, criteria] of Object.entries(this.riskCriteria)) {
        if (this._evaluateRiskCriteria(confidence, issueCounts, criteria.conditions, scoringModel)) {
          const riskScore = this._calculateRiskScore(level, confidence, issueCounts);
          
          return {
            level,
            score: riskScore,
            interventions: criteria.interventions,
            reasoning: this._generateRiskReasoning(level, confidence, issueCounts)
          };
        }
      }

      // Default to low risk
      return {
        level: 'low',
        score: 0.1,
        interventions: [],
        reasoning: 'All validation criteria met with acceptable confidence level'
      };

    } catch (error) {
      logger.warn('Risk assessment failed', {
        jobId,
        error: error.message
      });
      
      return {
        level: 'medium',
        score: 0.5,
        interventions: ['manual_review_recommended'],
        reasoning: 'Risk assessment encountered an error'
      };
    }
  }

  /**
   * Count issues by severity across all validation results
   */
  _countIssuesBySeverity(validationResults) {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      total: 0
    };

    for (const moduleResult of Object.values(validationResults)) {
      if (moduleResult.issues) {
        for (const issue of moduleResult.issues) {
          const severity = issue.severity || 'medium';
          if (counts[severity] !== undefined) {
            counts[severity]++;
          }
          counts.total++;
        }
      }
    }

    return counts;
  }

  /**
   * Evaluate risk criteria conditions
   */
  _evaluateRiskCriteria(confidence, issueCounts, conditions, scoringModel) {
    for (const condition of conditions) {
      let value;
      
      switch (condition.type) {
        case 'confidence':
          value = confidence;
          break;
        case 'critical_issues':
          value = issueCounts.critical;
          break;
        case 'high_issues':
          value = issueCounts.high;
          break;
        case 'medium_issues':
          value = issueCounts.medium;
          break;
        case 'low_issues':
          value = issueCounts.low;
          break;
        case 'total_issues':
          value = issueCounts.total;
          break;
        case 'data_verification_failure':
          // This would need to be calculated based on specific validation results
          value = 0;
          break;
        case 'source_attribution_missing':
          // This would need to be calculated based on specific validation results
          value = 0;
          break;
        default:
          continue;
      }

      if (!this._evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  _evaluateCondition(value, operator, threshold) {
    switch (operator) {
      case '<=': return value <= threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '>': return value > threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  /**
   * Calculate risk score (0-1 scale)
   */
  _calculateRiskScore(level, confidence, issueCounts) {
    const baseScores = {
      critical: 0.9,
      high: 0.7,
      medium: 0.5,
      low: 0.2
    };

    let score = baseScores[level] || 0.5;
    
    // Adjust based on confidence
    const confidenceAdjustment = (100 - confidence) / 200; // 0-0.5 range
    score = Math.min(1, score + confidenceAdjustment);
    
    // Adjust based on issue severity
    const severityAdjustment = (issueCounts.critical * 0.1 + issueCounts.high * 0.05) / 10;
    score = Math.min(1, score + severityAdjustment);
    
    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate risk reasoning explanation
   */
  _generateRiskReasoning(level, confidence, issueCounts) {
    const reasons = [];
    
    if (confidence <= 30) {
      reasons.push('Very low confidence score');
    } else if (confidence <= 50) {
      reasons.push('Low confidence score');
    } else if (confidence <= 70) {
      reasons.push('Moderate confidence score');
    }
    
    if (issueCounts.critical > 0) {
      reasons.push(`${issueCounts.critical} critical issue(s) found`);
    }
    
    if (issueCounts.high > 0) {
      reasons.push(`${issueCounts.high} high-severity issue(s) found`);
    }
    
    if (issueCounts.total > 5) {
      reasons.push(`High total issue count (${issueCounts.total})`);
    }
    
    return reasons.length > 0 ? reasons.join('; ') : 'Standard risk assessment criteria applied';
  }

  /**
   * Generate confidence insights
   */
  async _generateConfidenceInsights(result, validationResults, jobId) {
    const insights = [];
    
    // Confidence level insights
    if (result.confidence >= 90) {
      insights.push('Excellent confidence level - content meets high quality standards');
    } else if (result.confidence >= 80) {
      insights.push('Good confidence level - minor improvements may be beneficial');
    } else if (result.confidence >= 70) {
      insights.push('Moderate confidence level - several areas need attention');
    } else if (result.confidence >= 50) {
      insights.push('Low confidence level - significant improvements required');
    } else {
      insights.push('Very low confidence level - content requires major revision');
    }
    
    // Module-specific insights
    for (const [module, breakdown] of Object.entries(result.breakdown)) {
      if (breakdown.confidence < 60) {
        insights.push(`${module} validation shows concerning results (${breakdown.confidence.toFixed(1)}%)`);
      }
    }
    
    // Risk-specific insights
    if (result.riskLevel === 'critical') {
      insights.push('Critical risk level requires immediate attention and manual review');
    } else if (result.riskLevel === 'high') {
      insights.push('High risk level suggests thorough review before publication');
    }
    
    // Trend insights (if history available)
    const trendInsight = this._generateTrendInsight(jobId);
    if (trendInsight) {
      insights.push(trendInsight);
    }
    
    return insights;
  }

  /**
   * Generate trend insight from confidence history
   */
  _generateTrendInsight(jobId) {
    const history = this.confidenceHistory.get(jobId);
    if (!history || history.length < 3) {
      return null;
    }
    
    const recent = history.slice(-3);
    const trend = recent[2].confidence - recent[0].confidence;
    
    if (trend > 10) {
      return 'Confidence trend is improving across recent validations';
    } else if (trend < -10) {
      return 'Confidence trend is declining - investigate systematic issues';
    }
    
    return 'Confidence levels are stable across recent validations';
  }

  /**
   * Update confidence history for trend analysis
   */
  _updateConfidenceHistory(jobId, confidence, riskLevel) {
    if (!this.confidenceHistory.has(jobId)) {
      this.confidenceHistory.set(jobId, []);
    }
    
    const history = this.confidenceHistory.get(jobId);
    history.push({
      timestamp: Date.now(),
      confidence,
      riskLevel
    });
    
    // Limit history size
    if (history.length > this.historyLimit) {
      history.shift();
    }
  }

  /**
   * Get confidence statistics
   */
  getConfidenceStatistics() {
    const allHistory = Array.from(this.confidenceHistory.values()).flat();
    
    if (allHistory.length === 0) {
      return {
        totalValidations: 0,
        averageConfidence: 0,
        riskDistribution: {}
      };
    }
    
    const totalValidations = allHistory.length;
    const averageConfidence = allHistory.reduce((sum, h) => sum + h.confidence, 0) / totalValidations;
    
    const riskDistribution = allHistory.reduce((dist, h) => {
      dist[h.riskLevel] = (dist[h.riskLevel] || 0) + 1;
      return dist;
    }, {});
    
    return {
      totalValidations,
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      riskDistribution
    };
  }

  /**
   * Get agent status
   */
  getStatus() {
    const stats = this.getConfidenceStatistics();
    
    return {
      agent: this.name,
      version: this.version,
      initialized: this.isInitialized,
      config: this.config,
      scoringModels: Object.keys(this.scoringModels),
      statistics: stats
    };
  }

  /**
   * Calculate confidence interval for the overall confidence score
   * Uses validation result variance and sample size considerations
   */
  async _calculateConfidenceInterval(confidence, breakdown, validationResults, jobId) {
    try {
      // Extract confidence scores from breakdown
      const moduleConfidences = Object.values(breakdown)
        .map(module => module.confidence)
        .filter(conf => typeof conf === 'number');

      if (moduleConfidences.length === 0) {
        return {
          lower: Math.max(0, confidence - 10),
          upper: Math.min(100, confidence + 10),
          marginOfError: 10,
          reliability: 'low',
          sampleSize: 0
        };
      }

      // Calculate sample statistics
      const n = moduleConfidences.length;
      const mean = moduleConfidences.reduce((sum, conf) => sum + conf, 0) / n;
      const variance = moduleConfidences.reduce((sum, conf) => sum + Math.pow(conf - mean, 2), 0) / (n - 1);
      const standardError = Math.sqrt(variance / n);

      // Determine confidence level based on validation quality
      let confidenceLevel = 0.95; // 95% default
      let tValue = 1.96; // Z-score for 95% confidence

      // Adjust for small sample sizes (use t-distribution)
      if (n < 30) {
        const tValues = {
          1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
          6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228
        };
        tValue = tValues[Math.min(n, 10)] || 2.0;
      }

      // Calculate margin of error
      const marginOfError = tValue * standardError;

      // Determine reliability based on sample size and variance
      let reliability;
      if (n >= 5 && variance < 100) reliability = 'high';
      else if (n >= 3 && variance < 200) reliability = 'medium';
      else reliability = 'low';

      return {
        lower: Math.max(0, Math.round((confidence - marginOfError) * 100) / 100),
        upper: Math.min(100, Math.round((confidence + marginOfError) * 100) / 100),
        marginOfError: Math.round(marginOfError * 100) / 100,
        reliability,
        sampleSize: n,
        standardError: Math.round(standardError * 100) / 100,
        confidenceLevel: confidenceLevel * 100
      };

    } catch (error) {
      logger.warn('Confidence interval calculation failed', {
        jobId,
        error: error.message
      });

      return {
        lower: Math.max(0, confidence - 15),
        upper: Math.min(100, confidence + 15),
        marginOfError: 15,
        reliability: 'low',
        error: 'Calculation failed'
      };
    }
  }

  /**
   * Quantify uncertainty in the confidence assessment
   * Analyzes sources of uncertainty and their impact
   */
  async _quantifyUncertainty(confidence, validationResults, content, jobId) {
    try {
      let uncertaintyScore = 0;
      const uncertaintyFactors = [];

      // 1. Data availability uncertainty
      const missingModules = ['SemanticValidator', 'RealTimeDataVerifier', 'StatisticalChecker', 'CrossMarketValidator']
        .filter(module => !validationResults[module]);
      
      if (missingModules.length > 0) {
        const dataUncertainty = (missingModules.length / 4) * 0.2;
        uncertaintyScore += dataUncertainty;
        uncertaintyFactors.push({
          source: 'missing_validation_data',
          impact: dataUncertainty,
          description: `Missing validation from ${missingModules.length} modules`,
          modules: missingModules
        });
      }

      // 2. Validation result inconsistency
      const moduleConfidences = Object.values(validationResults)
        .map(result => result.confidence)
        .filter(conf => typeof conf === 'number');

      if (moduleConfidences.length > 1) {
        const mean = moduleConfidences.reduce((sum, conf) => sum + conf, 0) / moduleConfidences.length;
        const variance = moduleConfidences.reduce((sum, conf) => sum + Math.pow(conf - mean, 2), 0) / moduleConfidences.length;
        const coefficientOfVariation = Math.sqrt(variance) / mean;

        if (coefficientOfVariation > 0.3) {
          const inconsistencyUncertainty = Math.min(0.25, coefficientOfVariation * 0.5);
          uncertaintyScore += inconsistencyUncertainty;
          uncertaintyFactors.push({
            source: 'validation_inconsistency',
            impact: inconsistencyUncertainty,
            description: 'High variance in validation module results',
            coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100
          });
        }
      }

      // 3. Content complexity uncertainty
      const contentText = this._extractContentText(content);
      const complexityFactors = this._analyzeContentComplexity(contentText);
      
      if (complexityFactors.uncertainty > 0) {
        uncertaintyScore += complexityFactors.uncertainty;
        uncertaintyFactors.push({
          source: 'content_complexity',
          impact: complexityFactors.uncertainty,
          description: 'Content complexity introduces validation uncertainty',
          factors: complexityFactors.factors
        });
      }

      // 4. Temporal uncertainty (data freshness)
      const temporalUncertainty = this._assessTemporalUncertainty(validationResults);
      if (temporalUncertainty > 0) {
        uncertaintyScore += temporalUncertainty;
        uncertaintyFactors.push({
          source: 'temporal_uncertainty',
          impact: temporalUncertainty,
          description: 'Uncertainty due to data age and temporal factors'
        });
      }

      // 5. Source reliability uncertainty
      const sourceUncertainty = this._assessSourceUncertainty(validationResults);
      if (sourceUncertainty > 0) {
        uncertaintyScore += sourceUncertainty;
        uncertaintyFactors.push({
          source: 'source_reliability',
          impact: sourceUncertainty,
          description: 'Uncertainty in source reliability and credibility'
        });
      }

      // Classify uncertainty level
      let uncertaintyLevel;
      if (uncertaintyScore <= 0.1) uncertaintyLevel = 'low';
      else if (uncertaintyScore <= 0.25) uncertaintyLevel = 'medium';
      else if (uncertaintyScore <= 0.4) uncertaintyLevel = 'high';
      else uncertaintyLevel = 'critical';

      return {
        level: uncertaintyLevel,
        score: Math.round(uncertaintyScore * 100) / 100,
        factors: uncertaintyFactors,
        totalImpact: Math.round(uncertaintyScore * confidence * 100) / 100,
        recommendation: this._getUncertaintyRecommendation(uncertaintyLevel, uncertaintyScore)
      };

    } catch (error) {
      logger.warn('Uncertainty quantification failed', {
        jobId,
        error: error.message
      });

      return {
        level: 'medium',
        score: 0.2,
        factors: [{ source: 'calculation_error', impact: 0.2, description: error.message }],
        error: 'Quantification failed'
      };
    }
  }

  /**
   * Calculate evidence weighting for validation results
   * Assigns weights based on source reliability and validation strength
   */
  async _calculateEvidenceWeighting(validationResults, breakdown, jobId) {
    try {
      const evidenceWeights = {};
      const weightingFactors = [];

      for (const [module, result] of Object.entries(validationResults)) {
        if (!result || typeof result.confidence !== 'number') continue;

        let baseWeight = 1.0;
        const factors = [];

        // 1. Confidence-based weighting
        const confidenceWeight = result.confidence / 100;
        baseWeight *= confidenceWeight;
        factors.push({ factor: 'confidence', multiplier: confidenceWeight });

        // 2. Issue severity weighting
        if (result.issues && result.issues.length > 0) {
          const severityPenalty = this._calculateSeverityPenalty(result.issues);
          baseWeight *= (1 - severityPenalty);
          factors.push({ factor: 'issue_severity', multiplier: 1 - severityPenalty });
        }

        // 3. Module-specific reliability weighting
        const moduleReliability = this._getModuleReliability(module);
        baseWeight *= moduleReliability;
        factors.push({ factor: 'module_reliability', multiplier: moduleReliability });

        // 4. Data freshness weighting
        if (result.metadata && result.metadata.dataAge) {
          const freshnessWeight = this._calculateFreshnessWeight(result.metadata.dataAge);
          baseWeight *= freshnessWeight;
          factors.push({ factor: 'data_freshness', multiplier: freshnessWeight });
        }

        // 5. Source credibility weighting (for data verification modules)
        if (module.includes('DataVerifier') && result.metadata && result.metadata.sourceCredibility) {
          const credibilityWeight = result.metadata.sourceCredibility / 100;
          baseWeight *= credibilityWeight;
          factors.push({ factor: 'source_credibility', multiplier: credibilityWeight });
        }

        evidenceWeights[module] = {
          weight: Math.round(baseWeight * 100) / 100,
          factors,
          originalConfidence: result.confidence,
          adjustedConfidence: Math.round(result.confidence * baseWeight * 100) / 100
        };

        weightingFactors.push({
          module,
          weight: evidenceWeights[module].weight,
          impact: Math.abs(baseWeight - 1.0)
        });
      }

      // Normalize weights to sum to 1.0
      const totalWeight = Object.values(evidenceWeights).reduce((sum, ew) => sum + ew.weight, 0);
      if (totalWeight > 0) {
        for (const module of Object.keys(evidenceWeights)) {
          evidenceWeights[module].normalizedWeight = evidenceWeights[module].weight / totalWeight;
        }
      }

      return {
        weights: evidenceWeights,
        factors: weightingFactors,
        totalModules: Object.keys(evidenceWeights).length,
        averageWeight: totalWeight / Object.keys(evidenceWeights).length,
        weightingStrategy: 'confidence_severity_reliability_freshness'
      };

    } catch (error) {
      logger.warn('Evidence weighting calculation failed', {
        jobId,
        error: error.message
      });

      return {
        weights: {},
        factors: [],
        error: 'Weighting calculation failed'
      };
    }
  }

  /**
   * Extract text content for analysis
   */
  _extractContentText(content) {
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
   * Analyze content complexity factors
   */
  _analyzeContentComplexity(text) {
    let uncertainty = 0;
    const factors = [];

    // Technical jargon density
    const technicalTerms = (text.match(/\b(statistical|methodology|correlation|regression|variance|deviation|coefficient)\b/gi) || []).length;
    const jargonDensity = technicalTerms / (text.split(' ').length / 100);
    
    if (jargonDensity > 2) {
      const jargonUncertainty = Math.min(0.1, jargonDensity * 0.02);
      uncertainty += jargonUncertainty;
      factors.push({ type: 'technical_jargon', impact: jargonUncertainty });
    }

    // Numerical complexity
    const numbers = (text.match(/\d+(\.\d+)?%?/g) || []).length;
    const numberDensity = numbers / (text.split(' ').length / 100);
    
    if (numberDensity > 5) {
      const numericalUncertainty = Math.min(0.08, numberDensity * 0.01);
      uncertainty += numericalUncertainty;
      factors.push({ type: 'numerical_complexity', impact: numericalUncertainty });
    }

    // Conditional language
    const conditionalWords = (text.match(/\b(may|might|could|possibly|potentially|likely|unlikely)\b/gi) || []).length;
    if (conditionalWords > 3) {
      const conditionalUncertainty = Math.min(0.12, conditionalWords * 0.02);
      uncertainty += conditionalUncertainty;
      factors.push({ type: 'conditional_language', impact: conditionalUncertainty });
    }

    return { uncertainty: Math.min(0.25, uncertainty), factors };
  }

  /**
   * Assess temporal uncertainty based on data age
   */
  _assessTemporalUncertainty(validationResults) {
    let maxAge = 0;
    
    for (const result of Object.values(validationResults)) {
      if (result.metadata && result.metadata.dataAge) {
        maxAge = Math.max(maxAge, result.metadata.dataAge);
      }
    }

    // Uncertainty increases with data age
    if (maxAge > 30) return Math.min(0.15, (maxAge - 30) * 0.005);
    if (maxAge > 7) return Math.min(0.08, (maxAge - 7) * 0.003);
    
    return 0;
  }

  /**
   * Assess source reliability uncertainty
   */
  _assessSourceUncertainty(validationResults) {
    const sourceTracker = validationResults.SourceTracker;
    if (!sourceTracker || !sourceTracker.metadata) return 0.05;

    const reliability = sourceTracker.metadata.averageReliability || 70;
    if (reliability < 60) return 0.15;
    if (reliability < 80) return 0.08;
    
    return 0;
  }

  /**
   * Calculate severity penalty for issues
   */
  _calculateSeverityPenalty(issues) {
    let penalty = 0;
    
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': penalty += 0.3; break;
        case 'high': penalty += 0.2; break;
        case 'medium': penalty += 0.1; break;
        case 'low': penalty += 0.05; break;
      }
    }
    
    return Math.min(0.8, penalty); // Cap at 80% penalty
  }

  /**
   * Get module reliability multiplier
   */
  _getModuleReliability(module) {
    const reliabilityScores = {
      'RealTimeDataVerifier': 0.95,
      'StatisticalChecker': 0.90,
      'SemanticValidator': 0.85,
      'CrossMarketValidator': 0.88,
      'SourceTracker': 0.92,
      'ConfidenceScorer': 0.87
    };
    
    return reliabilityScores[module] || 0.80;
  }

  /**
   * Calculate freshness weight based on data age
   */
  _calculateFreshnessWeight(dataAge) {
    if (dataAge <= 1) return 1.0;
    if (dataAge <= 7) return 0.95;
    if (dataAge <= 30) return 0.85;
    if (dataAge <= 90) return 0.70;
    return 0.50;
  }

  /**
   * Get uncertainty recommendation
   */
  _getUncertaintyRecommendation(level, score) {
    const recommendations = {
      'low': 'Uncertainty is within acceptable limits - proceed with standard validation',
      'medium': 'Moderate uncertainty detected - consider additional validation steps',
      'high': 'High uncertainty level - thorough review and additional data sources recommended',
      'critical': 'Critical uncertainty - manual expert review required before proceeding'
    };
    
    return recommendations[level] || 'Review uncertainty factors and adjust validation approach';
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up ConfidenceScorer');
    this.confidenceHistory.clear();
    this.isInitialized = false;
  }
}

module.exports = ConfidenceScorer;