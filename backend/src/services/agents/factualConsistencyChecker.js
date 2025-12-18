const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * FactualConsistencyChecker Agent
 * Internal consistency validation within content
 * 
 * Features:
 * - Cross-reference validation between claims
 * - Logical consistency assessment
 * - Contradiction detection enhancement
 * - Mathematical relationship verification
 * - Performance target: <3 seconds processing time
 */
class FactualConsistencyChecker extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Factual Consistency Checker', {
      maxProcessingTime: 3000, // 3 seconds
      consistencyThreshold: 0.7,
      contradictionSensitivity: 0.8,
      ...options
    }, lineageService);

    // Initialize consistency patterns
    this.consistencyPatterns = null;
    
    // Contradiction detection patterns
    this.contradictionPatterns = [
      {
        type: 'directional_contradiction',
        pattern: /\b(up|increase|rise|growth)\b.*\b(down|decrease|fall|decline)\b/gi,
        severity: 'high'
      },
      {
        type: 'magnitude_contradiction',
        pattern: /\b(rapid|fast|quick)\b.*\b(slow|gradual)\b/gi,
        severity: 'medium'
      },
      {
        type: 'temporal_contradiction',
        pattern: /\b(before|earlier)\b.*\b(after|later)\b/gi,
        severity: 'medium'
      }
    ];

    // Mathematical consistency patterns
    this.mathPatterns = {
      percentage: /(\d+(?:\.\d+)?)\s*%/g,
      currency: /\$(\d+(?:,\d{3})*(?:\.\d+)?)/g,
      numbers: /\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/g
    };
  }

  /**
   * Initialize the FactualConsistencyChecker
   */
  async initialize() {
    await super.initialize();

    try {
      this.log('info', 'Initializing consistency patterns');
      
      // Initialize consistency patterns
      this.consistencyPatterns = this._initializeConsistencyPatterns();
      
      this.log('info', 'Factual consistency checker initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize factual consistency checker', { error: error.message });
      throw error;
    }
  }

  /**
   * Check consistency of claims
   * @param {Array} claims - Claims to check for consistency
   * @param {Object} context - Market and temporal context
   * @returns {Object} Consistency check results
   */
  async checkConsistency(claims, context = {}) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting factual consistency check', {
        claimsCount: claims.length,
        contextKeys: Object.keys(context)
      });

      // Handle empty claims
      if (!claims || claims.length === 0) {
        return this._createEmptyResult();
      }

      // Validate and filter claims
      const validClaims = this._validateClaims(claims);
      
      // Perform consistency checks
      const results = {
        internalConsistency: await this._checkInternalConsistency(validClaims),
        contextualConsistency: await this._checkContextualConsistency(validClaims, context),
        logicalConsistency: await this._checkLogicalConsistency(validClaims),
        contradictions: await this._detectContradictions(validClaims)
      };

      // Calculate overall consistency score
      const overallConsistencyScore = this._calculateOverallScore(results);
      
      // Identify flagged inconsistencies
      const flaggedInconsistencies = this._compileFlaggedInconsistencies(results);
      
      // Calculate confidence
      const confidence = this._calculateConfidence(results, validClaims.length);

      const processingTime = Date.now() - startTime;
      
      // Check processing time requirement
      if (processingTime >= this.options.maxProcessingTime) {
        this.log('warn', 'Consistency check exceeded time limit', { processingTime });
      }

      const result = {
        overallConsistencyScore,
        results,
        flaggedInconsistencies,
        confidence,
        processingTime
      };

      this.log('info', 'Factual consistency check completed', {
        overallScore: overallConsistencyScore,
        contradictions: results.contradictions.length,
        flaggedIssues: flaggedInconsistencies.length,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log('error', 'Factual consistency check failed', {
        error: error.message,
        processingTime
      });
      throw error;
    }
  }

  /**
   * Check internal consistency of claims
   * @private
   */
  async _checkInternalConsistency(claims) {
    const results = [];

    for (const claim of claims) {
      try {
        const consistencyResult = await this._analyzeSingleClaimConsistency(claim);
        results.push(consistencyResult);
      } catch (error) {
        this.log('warn', 'Failed to check internal consistency for claim', {
          claim: claim.text,
          error: error.message
        });
        
        results.push({
          claim,
          isConsistent: false,
          consistencyScore: 0,
          issues: [`Analysis failed: ${error.message}`]
        });
      }
    }

    return results;
  }

  /**
   * Analyze consistency of a single claim
   * @private
   */
  async _analyzeSingleClaimConsistency(claim) {
    const issues = [];
    let consistencyScore = 1.0;

    // Check for internal logical consistency
    if (claim.text) {
      // Check for self-contradictory statements
      const selfContradictions = this._findSelfContradictions(claim.text);
      if (selfContradictions.length > 0) {
        issues.push(...selfContradictions);
        consistencyScore -= 0.3;
      }

      // Check for mathematical consistency
      const mathIssues = this._checkMathematicalConsistency(claim);
      if (mathIssues.length > 0) {
        issues.push(...mathIssues);
        consistencyScore -= 0.2;
      }

      // Check for logical flow
      const logicalIssues = this._checkLogicalFlow(claim.text);
      if (logicalIssues.length > 0) {
        issues.push(...logicalIssues);
        consistencyScore -= 0.1;
      }
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isConsistent: consistencyScore >= this.options.consistencyThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Check contextual consistency against provided context
   * @private
   */
  async _checkContextualConsistency(claims, context) {
    const results = [];

    for (const claim of claims) {
      const contextualResult = this._checkClaimAgainstContext(claim, context);
      results.push(contextualResult);
    }

    return results;
  }

  /**
   * Check a claim against context
   * @private
   */
  _checkClaimAgainstContext(claim, context) {
    const issues = [];
    let consistencyScore = 1.0;

    // Check against market context
    if (context.priceChange !== undefined && claim.type === 'price_trend') {
      const claimDirection = this._extractDirection(claim);
      const contextDirection = context.priceChange > 0 ? 'up' : context.priceChange < 0 ? 'down' : 'stable';
      
      if (claimDirection && claimDirection !== contextDirection && contextDirection !== 'stable') {
        issues.push(`Claim direction (${claimDirection}) inconsistent with context (${contextDirection})`);
        consistencyScore -= 0.4;
      }
    }

    // Check temporal consistency
    if (context.timeframe && claim.timeframe) {
      if (!this._areTimeframesConsistent(claim.timeframe, context.timeframe)) {
        issues.push('Timeframe inconsistent with context');
        consistencyScore -= 0.3;
      }
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isContextuallyConsistent: consistencyScore >= this.options.consistencyThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Check logical consistency across claims
   * @private
   */
  async _checkLogicalConsistency(claims) {
    const results = [];
    
    // Check for logical relationships between claims
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const logicalResult = this._checkLogicalRelationship(claims[i], claims[j]);
        if (logicalResult) {
          results.push(logicalResult);
        }
      }
    }

    return results;
  }

  /**
   * Check logical relationship between two claims
   * @private
   */
  _checkLogicalRelationship(claim1, claim2) {
    // Check for cause-effect relationships
    if (this._isCauseEffectRelationship(claim1, claim2)) {
      const isLogical = this._validateCauseEffect(claim1, claim2);
      if (!isLogical) {
        return {
          type: 'cause_effect_violation',
          claim1,
          claim2,
          issue: 'Illogical cause-effect relationship detected'
        };
      }
    }

    // Check for mathematical relationships
    if (this._isMathematicalRelationship(claim1, claim2)) {
      const isMathematicallyConsistent = this._validateMathematicalRelationship(claim1, claim2);
      if (!isMathematicallyConsistent) {
        return {
          type: 'mathematical_inconsistency',
          claim1,
          claim2,
          issue: 'Mathematical relationship is inconsistent'
        };
      }
    }

    return null;
  }

  /**
   * Detect contradictions between claims
   * @private
   */
  async _detectContradictions(claims) {
    const contradictions = [];

    // Check for direct contradictions
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const contradiction = this._findContradiction(claims[i], claims[j]);
        if (contradiction) {
          contradictions.push(contradiction);
        }
      }
    }

    return contradictions;
  }

  /**
   * Find contradiction between two claims
   * @private
   */
  _findContradiction(claim1, claim2) {
    // Check for value contradictions
    if (claim1.type === claim2.type && claim1.value !== undefined && claim2.value !== undefined) {
      // For directional claims
      if (claim1.direction && claim2.direction && claim1.direction !== claim2.direction) {
        return {
          isContradictory: true,
          type: 'directional_contradiction',
          severity: 'high',
          confidence: 0.9,
          claim1,
          claim2
        };
      }

      // For magnitude claims
      if (claim1.magnitude && claim2.magnitude) {
        const contradiction = this._checkMagnitudeContradiction(claim1, claim2);
        if (contradiction) {
          return {
            isContradictory: true,
            type: 'magnitude_contradiction',
            severity: 'medium',
            confidence: 0.7,
            claim1,
            claim2
          };
        }
      }
    }

    // Check for semantic contradictions
    const semanticContradiction = this._checkSemanticContradiction(claim1, claim2);
    if (semanticContradiction) {
      return semanticContradiction;
    }

    return null;
  }

  /**
   * Check for semantic contradictions
   * @private
   */
  _checkSemanticContradiction(claim1, claim2) {
    const text1 = claim1.text ? claim1.text.toLowerCase() : '';
    const text2 = claim2.text ? claim2.text.toLowerCase() : '';

    // Check for opposite terms
    const opposites = [
      ['increase', 'decrease'], ['rise', 'fall'], ['up', 'down'],
      ['growth', 'decline'], ['high', 'low'], ['fast', 'slow'],
      ['more', 'less'], ['above', 'below']
    ];

    for (const [term1, term2] of opposites) {
      if ((text1.includes(term1) && text2.includes(term2)) ||
          (text1.includes(term2) && text2.includes(term1))) {
        return {
          isContradictory: true,
          type: 'semantic_contradiction',
          severity: 'medium',
          confidence: 0.6,
          claim1,
          claim2
        };
      }
    }

    return null;
  }

  /**
   * Find self-contradictions within a single claim
   * @private
   */
  _findSelfContradictions(text) {
    const issues = [];
    const lowerText = text.toLowerCase();

    // Check for contradictory patterns within the same text
    for (const pattern of this.contradictionPatterns) {
      if (pattern.pattern.test(lowerText)) {
        issues.push(`Self-contradiction detected: ${pattern.type}`);
      }
    }

    return issues;
  }

  /**
   * Check mathematical consistency
   * @private
   */
  _checkMathematicalConsistency(claim) {
    const issues = [];

    // Check for impossible percentages
    if (claim.value !== undefined && claim.type && claim.type.includes('percentage')) {
      if (claim.value > 100 && !claim.text.includes('over 100')) {
        issues.push('Percentage value over 100% without clarification');
      }
      if (claim.value < 0 && !claim.text.includes('negative')) {
        issues.push('Negative percentage without clarification');
      }
    }

    // Check for impossible durations
    if (claim.type === 'duration' && claim.value !== undefined) {
      if (claim.value < 0) {
        issues.push('Negative duration is impossible');
      }
    }

    return issues;
  }

  /**
   * Check logical flow of text
   * @private
   */
  _checkLogicalFlow(text) {
    const issues = [];
    
    // Simple logical flow checks
    if (text.includes('but') || text.includes('however')) {
      // Check if the contrast makes sense
      const parts = text.split(/\b(but|however)\b/i);
      if (parts.length >= 3) {
        const beforeContrast = parts[0].toLowerCase();
        const afterContrast = parts[2].toLowerCase();
        
        // Look for logical inconsistencies
        if (beforeContrast.includes('increase') && afterContrast.includes('increase')) {
          issues.push('Illogical contrast: both parts indicate same direction');
        }
      }
    }

    return issues;
  }

  /**
   * Extract direction from claim
   * @private
   */
  _extractDirection(claim) {
    if (claim.direction) return claim.direction;
    
    const text = claim.text ? claim.text.toLowerCase() : '';
    if (text.includes('increase') || text.includes('rise') || text.includes('up') || text.includes('growth')) {
      return 'up';
    }
    if (text.includes('decrease') || text.includes('fall') || text.includes('down') || text.includes('decline')) {
      return 'down';
    }
    return 'stable';
  }

  /**
   * Check if timeframes are consistent
   * @private
   */
  _areTimeframesConsistent(timeframe1, timeframe2) {
    // Simple timeframe consistency check
    return timeframe1 === timeframe2 || 
           (timeframe1.includes('2025') && timeframe2.includes('2025'));
  }

  /**
   * Check if claims have cause-effect relationship
   * @private
   */
  _isCauseEffectRelationship(claim1, claim2) {
    // Simple heuristic for cause-effect relationships
    const causeTerms = ['rate', 'mortgage', 'interest'];
    const effectTerms = ['demand', 'sales', 'activity'];
    
    const text1 = claim1.text ? claim1.text.toLowerCase() : '';
    const text2 = claim2.text ? claim2.text.toLowerCase() : '';
    
    return (causeTerms.some(term => text1.includes(term)) && 
            effectTerms.some(term => text2.includes(term))) ||
           (causeTerms.some(term => text2.includes(term)) && 
            effectTerms.some(term => text1.includes(term)));
  }

  /**
   * Validate cause-effect relationship
   * @private
   */
  _validateCauseEffect(claim1, claim2) {
    // Simple validation: higher rates typically reduce demand
    const text1 = claim1.text ? claim1.text.toLowerCase() : '';
    const text2 = claim2.text ? claim2.text.toLowerCase() : '';
    
    if (text1.includes('rate') && text1.includes('increase') && 
        text2.includes('demand') && text2.includes('increase')) {
      return false; // Typically illogical
    }
    
    return true; // Default to consistent
  }

  /**
   * Check if claims have mathematical relationship
   * @private
   */
  _isMathematicalRelationship(claim1, claim2) {
    return claim1.value !== undefined && claim2.value !== undefined &&
           claim1.type === claim2.type;
  }

  /**
   * Validate mathematical relationship
   * @private
   */
  _validateMathematicalRelationship(claim1, claim2) {
    // Check for reasonable value differences
    if (claim1.value !== undefined && claim2.value !== undefined) {
      const diff = Math.abs(claim1.value - claim2.value);
      const avg = (claim1.value + claim2.value) / 2;
      const percentDiff = avg > 0 ? (diff / avg) * 100 : 0;
      
      // Flag if difference is extreme (>500%)
      return percentDiff <= 500;
    }
    
    return true;
  }

  /**
   * Check magnitude contradiction
   * @private
   */
  _checkMagnitudeContradiction(claim1, claim2) {
    const magnitudeOrder = { low: 1, medium: 2, high: 3, extreme: 4 };
    const mag1 = magnitudeOrder[claim1.magnitude] || 2;
    const mag2 = magnitudeOrder[claim2.magnitude] || 2;
    
    return Math.abs(mag1 - mag2) >= 2; // Significant magnitude difference
  }

  /**
   * Calculate overall consistency score
   * @private
   */
  _calculateOverallScore(results) {
    const weights = {
      internal: 0.3,
      contextual: 0.25,
      logical: 0.25,
      contradictions: 0.2
    };

    let totalScore = 0;

    // Internal consistency score
    if (results.internalConsistency.length > 0) {
      const internalScore = results.internalConsistency.reduce((sum, result) => 
        sum + result.consistencyScore, 0) / results.internalConsistency.length;
      totalScore += internalScore * weights.internal * 100;
    }

    // Contextual consistency score
    if (results.contextualConsistency.length > 0) {
      const contextualScore = results.contextualConsistency.reduce((sum, result) => 
        sum + result.consistencyScore, 0) / results.contextualConsistency.length;
      totalScore += contextualScore * weights.contextual * 100;
    }

    // Logical consistency score (inverse of issues)
    const logicalScore = results.logicalConsistency.length === 0 ? 1.0 : 
      Math.max(0, 1 - (results.logicalConsistency.length * 0.1));
    totalScore += logicalScore * weights.logical * 100;

    // Contradiction penalty
    const contradictionPenalty = results.contradictions.length * 10;
    totalScore = Math.max(0, totalScore - contradictionPenalty);

    return Math.round(totalScore);
  }

  /**
   * Compile flagged inconsistencies
   * @private
   */
  _compileFlaggedInconsistencies(results) {
    const flagged = [];

    // Add internal consistency issues
    results.internalConsistency.forEach(result => {
      if (!result.isConsistent) {
        flagged.push({
          type: 'internal_inconsistency',
          severity: 'medium',
          description: `Internal consistency issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add contextual consistency issues
    results.contextualConsistency.forEach(result => {
      if (!result.isContextuallyConsistent) {
        flagged.push({
          type: 'contextual_inconsistency',
          severity: 'medium',
          description: `Contextual consistency issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add logical consistency issues
    results.logicalConsistency.forEach(issue => {
      flagged.push({
        type: 'logical_inconsistency',
        severity: 'high',
        description: issue.issue,
        affectedClaims: [issue.claim1, issue.claim2]
      });
    });

    // Add contradictions
    results.contradictions.forEach(contradiction => {
      flagged.push({
        type: 'contradiction',
        severity: contradiction.severity,
        description: `Contradiction detected: ${contradiction.type}`,
        affectedClaims: [contradiction.claim1, contradiction.claim2]
      });
    });

    return flagged;
  }

  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(results, claimsCount) {
    if (claimsCount === 0) return 1.0;

    const issueCount = results.contradictions.length + 
                     results.logicalConsistency.length +
                     results.internalConsistency.filter(r => !r.isConsistent).length;

    const confidence = Math.max(0.1, 1 - (issueCount / claimsCount));
    return Math.min(confidence, 1.0);
  }

  /**
   * Initialize consistency patterns
   * @private
   */
  _initializeConsistencyPatterns() {
    return {
      directionalConsistency: [
        { pattern: /\b(increase|rise|up|growth)\b/gi, direction: 'positive' },
        { pattern: /\b(decrease|fall|down|decline)\b/gi, direction: 'negative' },
        { pattern: /\b(stable|unchanged|flat)\b/gi, direction: 'neutral' }
      ],
      magnitudeConsistency: [
        { pattern: /\b(rapid|fast|quick|sharp)\b/gi, magnitude: 'high' },
        { pattern: /\b(slow|gradual|modest)\b/gi, magnitude: 'low' },
        { pattern: /\b(moderate|steady)\b/gi, magnitude: 'medium' }
      ]
    };
  }

  /**
   * Validate claims input
   * @private
   */
  _validateClaims(claims) {
    return claims.filter(claim => {
      return claim && 
             typeof claim === 'object' && 
             claim.text && 
             typeof claim.text === 'string' &&
             claim.text.trim().length > 0;
    });
  }

  /**
   * Create empty result for no claims
   * @private
   */
  _createEmptyResult() {
    return {
      overallConsistencyScore: 100, // No claims = no inconsistencies
      results: {
        internalConsistency: [],
        contextualConsistency: [],
        logicalConsistency: [],
        contradictions: []
      },
      flaggedInconsistencies: [],
      confidence: 1.0,
      processingTime: 0
    };
  }
}

module.exports = FactualConsistencyChecker;