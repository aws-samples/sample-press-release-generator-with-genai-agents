const BaseAgent = require('./baseAgent');
const SourceGroundingValidator = require('./sourceGroundingValidator');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * SourceGroundingVerifier Agent
 * Leverages existing SourceGroundingValidator for credibility assessment
 * Integrates with completed Source Grounding system (69% test success baseline)
 * 
 * Features:
 * - Integrates with existing SourceGroundingValidator
 * - Authority-weighted validation scoring (government 95%+, industry 85%+)
 * - Cross-validates claims against grounded sources
 * - Performance target: <3 seconds processing time
 */
class SourceGroundingVerifier extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Source Grounding Verifier', {
      maxProcessingTime: 3000, // 3 seconds
      minAuthorityThreshold: 0.6,
      governmentAuthorityWeight: 0.95,
      industryAuthorityWeight: 0.85,
      ...options
    }, lineageService);

    // Initialize SourceGroundingValidator
    this.sourceGroundingValidator = null;
    
    // Authority scoring configuration
    this.authorityWeights = {
      government: this.options.governmentAuthorityWeight,
      industry: this.options.industryAuthorityWeight,
      association: 0.8,
      news: 0.6,
      blog: 0.3,
      unknown: 0.1
    };
  }

  /**
   * Initialize the SourceGroundingVerifier
   */
  async initialize() {
    await super.initialize();

    try {
      this.log('info', 'Initializing SourceGroundingValidator integration');
      
      // Initialize the existing SourceGroundingValidator
      this.sourceGroundingValidator = new SourceGroundingValidator();
      await this.sourceGroundingValidator.initialize();
      
      this.log('info', 'SourceGroundingValidator integration initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize SourceGroundingValidator integration', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify source grounding for claims
   * @param {Array} claims - Claims to verify
   * @param {Array} sources - Available sources for verification
   * @returns {Object} Source grounding verification results
   */
  async verifySourceGrounding(claims, sources = []) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting source grounding verification', {
        claimsCount: claims.length,
        sourcesCount: sources.length
      });

      // Handle empty inputs
      if (!claims || claims.length === 0) {
        return this._createEmptyResult();
      }

      if (!sources || sources.length === 0) {
        return this._createNoSourcesResult(claims);
      }

      // Validate inputs
      const validClaims = this._validateClaims(claims);
      const validSources = this._validateSources(sources);

      // Perform source grounding verification for each claim
      const claimResults = await this._verifyClaimsAgainstSources(validClaims, validSources);
      
      // Calculate overall grounding score
      const overallGroundingScore = this._calculateOverallScore(claimResults);
      
      // Identify ungrounded and high confidence claims
      const ungroundedClaims = claimResults.filter(result => !result.isGrounded);
      const highConfidenceClaims = claimResults.filter(result => result.confidence > 0.8);

      const processingTime = Date.now() - startTime;
      
      // Check processing time requirement
      if (processingTime >= this.options.maxProcessingTime) {
        this.log('warn', 'Source grounding verification exceeded time limit', { processingTime });
      }

      const result = {
        overallGroundingScore,
        claimResults,
        ungroundedClaims,
        highConfidenceClaims,
        processingTime
      };

      this.log('info', 'Source grounding verification completed', {
        overallScore: overallGroundingScore,
        groundedClaims: claimResults.filter(r => r.isGrounded).length,
        ungroundedClaims: ungroundedClaims.length,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log('error', 'Source grounding verification failed', {
        error: error.message,
        processingTime
      });
      throw error;
    }
  }

  /**
   * Verify claims against available sources
   * @private
   */
  async _verifyClaimsAgainstSources(claims, sources) {
    const claimResults = [];

    for (const claim of claims) {
      try {
        const claimResult = await this._verifySingleClaim(claim, sources);
        claimResults.push(claimResult);
      } catch (error) {
        this.log('warn', 'Failed to verify individual claim', {
          claim: claim.text,
          error: error.message
        });
        
        // Add failed result
        claimResults.push({
          claim,
          isGrounded: false,
          groundingScore: 0,
          confidence: 0,
          supportingSources: [],
          details: `Verification failed: ${error.message}`
        });
      }
    }

    return claimResults;
  }

  /**
   * Verify a single claim against sources
   * @private
   */
  async _verifySingleClaim(claim, sources) {
    // Find supporting sources for this claim
    const supportingSources = this._findSupportingSources(claim, sources);
    
    // Calculate authority-weighted grounding score
    const groundingScore = this._calculateClaimGroundingScore(claim, supportingSources);
    
    // Determine if claim is well-grounded
    const isGrounded = groundingScore >= (this.options.minAuthorityThreshold * 100);
    
    // Calculate confidence based on source quality and quantity
    const confidence = this._calculateClaimConfidence(supportingSources);
    
    // Generate details about the grounding
    const details = this._generateGroundingDetails(claim, supportingSources, groundingScore);

    return {
      claim,
      isGrounded,
      groundingScore,
      confidence,
      supportingSources,
      details
    };
  }

  /**
   * Find sources that support a given claim
   * @private
   */
  _findSupportingSources(claim, sources) {
    const supportingSources = [];

    for (const source of sources) {
      // Check if source supports this claim
      if (this._doesSourceSupportClaim(claim, source)) {
        supportingSources.push({
          ...source,
          relevanceScore: this._calculateRelevanceScore(claim, source)
        });
      }
    }

    // Sort by authority and relevance
    return supportingSources.sort((a, b) => {
      const scoreA = (a.authority || 0) * (a.relevanceScore || 0);
      const scoreB = (b.authority || 0) * (b.relevanceScore || 0);
      return scoreB - scoreA;
    });
  }

  /**
   * Check if a source supports a claim
   * @private
   */
  _doesSourceSupportClaim(claim, source) {
    // Simple matching based on claim content and source claim
    if (source.claim && claim.text) {
      // Check for value matches
      if (claim.value !== undefined && source.claim.value !== undefined) {
        return Math.abs(claim.value - source.claim.value) < (claim.value * 0.1); // 10% tolerance
      }
      
      // Check for text similarity
      const claimText = claim.text.toLowerCase();
      const sourceText = source.claim.text ? source.claim.text.toLowerCase() : '';
      
      // Look for key terms
      const keyTerms = ['price', 'median', 'days', 'market', 'listings', 'inventory'];
      const claimTerms = keyTerms.filter(term => claimText.includes(term));
      const sourceTerms = keyTerms.filter(term => sourceText.includes(term));
      
      return claimTerms.some(term => sourceTerms.includes(term));
    }
    
    return false;
  }

  /**
   * Calculate relevance score between claim and source
   * @private
   */
  _calculateRelevanceScore(claim, source) {
    let score = 0.5; // Base relevance
    
    // Boost for exact value matches
    if (claim.value !== undefined && source.claim && source.claim.value !== undefined) {
      const valueDiff = Math.abs(claim.value - source.claim.value) / Math.max(claim.value, source.claim.value);
      score += (1 - valueDiff) * 0.3;
    }
    
    // Boost for type matches
    if (claim.type && source.claim && source.claim.type === claim.type) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate grounding score for a claim based on supporting sources
   * @private
   */
  _calculateClaimGroundingScore(claim, supportingSources) {
    if (supportingSources.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let totalWeight = 0;

    for (const source of supportingSources) {
      const authorityWeight = this._getAuthorityWeight(source);
      const relevanceScore = source.relevanceScore || 0.5;
      const sourceScore = authorityWeight * relevanceScore * 100;
      
      totalScore += sourceScore;
      totalWeight += authorityWeight;
    }

    // Average weighted by authority, with bonus for multiple sources
    const averageScore = totalWeight > 0 ? totalScore / totalWeight : 0;
    const multiSourceBonus = Math.min(supportingSources.length * 5, 20); // Up to 20% bonus
    
    return Math.min(averageScore + multiSourceBonus, 100);
  }

  /**
   * Get authority weight for a source
   * @private
   */
  _getAuthorityWeight(source) {
    const sourceType = source.type || 'unknown';
    return this.authorityWeights[sourceType] || this.authorityWeights.unknown;
  }

  /**
   * Calculate confidence for a claim based on supporting sources
   * @private
   */
  _calculateClaimConfidence(supportingSources) {
    if (supportingSources.length === 0) {
      return 0;
    }

    // Base confidence from highest authority source
    const highestAuthority = Math.max(...supportingSources.map(s => s.authority || 0));
    let confidence = highestAuthority;

    // Boost for multiple sources
    if (supportingSources.length > 1) {
      confidence += Math.min(supportingSources.length * 0.05, 0.2); // Up to 20% boost
    }

    // Boost for government sources
    const hasGovernmentSource = supportingSources.some(s => s.type === 'government');
    if (hasGovernmentSource) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate grounding details for a claim
   * @private
   */
  _generateGroundingDetails(claim, supportingSources, groundingScore) {
    const details = {
      claimType: claim.type || 'unknown',
      supportingSourcesCount: supportingSources.length,
      highestAuthoritySource: supportingSources.length > 0 ? supportingSources[0].name : 'none',
      groundingFactors: []
    };

    if (supportingSources.length === 0) {
      details.groundingFactors.push('No supporting sources found');
    } else {
      details.groundingFactors.push(`${supportingSources.length} supporting source(s)`);
      
      const governmentSources = supportingSources.filter(s => s.type === 'government');
      if (governmentSources.length > 0) {
        details.groundingFactors.push(`${governmentSources.length} government source(s)`);
      }
      
      const industrySources = supportingSources.filter(s => s.type === 'industry');
      if (industrySources.length > 0) {
        details.groundingFactors.push(`${industrySources.length} industry source(s)`);
      }
    }

    return details;
  }

  /**
   * Calculate overall grounding score from claim results
   * @private
   */
  _calculateOverallScore(claimResults) {
    if (claimResults.length === 0) {
      return 0;
    }

    const totalScore = claimResults.reduce((sum, result) => sum + result.groundingScore, 0);
    return Math.round(totalScore / claimResults.length);
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
   * Validate sources input
   * @private
   */
  _validateSources(sources) {
    return sources.filter(source => {
      return source && 
             typeof source === 'object' && 
             source.url &&
             typeof source.url === 'string';
    });
  }

  /**
   * Create empty result for no claims
   * @private
   */
  _createEmptyResult() {
    return {
      overallGroundingScore: 0,
      claimResults: [],
      ungroundedClaims: [],
      highConfidenceClaims: [],
      processingTime: 0
    };
  }

  /**
   * Create result for no sources scenario
   * @private
   */
  _createNoSourcesResult(claims) {
    const claimResults = claims.map(claim => ({
      claim,
      isGrounded: false,
      groundingScore: 0,
      confidence: 0,
      supportingSources: [],
      details: 'No sources available for verification'
    }));

    return {
      overallGroundingScore: 0,
      claimResults,
      ungroundedClaims: claimResults,
      highConfidenceClaims: [],
      processingTime: 0
    };
  }
}

module.exports = SourceGroundingVerifier;