const { logger } = require('../../../utils/logger');
const { ValidationError } = require('../../../utils/errorHandler');
const bedrockService = require('../../bedrock');

/**
 * Semantic Validator Agent
 * Validates logical consistency and semantic coherence of claims
 * 
 * Features:
 * - Logical consistency checking using transformer-based analysis
 * - Semantic coherence validation
 * - Contradiction detection between claims
 * - Context-aware claim validation
 * - Confidence scoring for semantic accuracy
 */
class SemanticValidator {
  constructor(options = {}) {
    this.name = 'SemanticValidator';
    this.version = '1.0.0';
    
    this.config = {
      confidenceThreshold: options.confidenceThreshold || 0.7,
      maxClaimsPerBatch: options.maxClaimsPerBatch || 10,
      semanticSimilarityThreshold: options.semanticSimilarityThreshold || 0.8,
      contradictionThreshold: options.contradictionThreshold || 0.6,
      timeout: options.timeout || 30000
    };
    
    this.bedrockService = bedrockService;
    this.isInitialized = false;
  }

  /**
   * Initialize the Semantic Validator
   */
  async initialize() {
    try {
      logger.info('Initializing SemanticValidator', {
        config: this.config
      });
      
      // Test Bedrock connection for semantic analysis
      if (this.bedrockService) {
        await this.bedrockService.testConnection();
      }
      
      this.isInitialized = true;
      logger.info('SemanticValidator initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SemanticValidator', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate semantic consistency of claims
   */
  async validateClaims(claims, content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SemanticValidator not initialized');
    }

    const { jobId } = options;
    const startTime = Date.now();

    logger.debug('Starting semantic validation', {
      jobId,
      claimsCount: claims.length,
      market: marketContext.market
    });

    try {
      const result = {
        agent: 'SemanticValidator',
        confidence: 100,
        issues: [],
        corrections: [],
        metadata: {
          claimsAnalyzed: claims.length,
          processingTime: 0,
          semanticChecks: []
        }
      };

      // Step 1: Analyze logical consistency
      const logicalConsistency = await this._analyzeLogicalConsistency(claims, content, jobId);
      result.confidence -= logicalConsistency.penalty;
      result.issues.push(...logicalConsistency.issues);
      result.metadata.semanticChecks.push('logical_consistency');

      // Step 2: Detect contradictions
      const contradictions = await this._detectContradictions(claims, content, jobId);
      result.confidence -= contradictions.penalty;
      result.issues.push(...contradictions.issues);
      result.corrections.push(...contradictions.corrections);
      result.metadata.semanticChecks.push('contradiction_detection');

      // Step 3: Validate semantic coherence
      const coherence = await this._validateSemanticCoherence(claims, content, marketContext, jobId);
      result.confidence -= coherence.penalty;
      result.issues.push(...coherence.issues);
      result.metadata.semanticChecks.push('semantic_coherence');

      // Step 4: Context-aware validation
      const contextValidation = await this._validateContextualConsistency(claims, content, marketContext, jobId);
      result.confidence -= contextValidation.penalty;
      result.issues.push(...contextValidation.issues);
      result.metadata.semanticChecks.push('contextual_consistency');

      result.metadata.processingTime = Date.now() - startTime;
      result.confidence = Math.max(0, Math.min(100, result.confidence));

      logger.debug('Semantic validation completed', {
        jobId,
        confidence: result.confidence,
        issuesFound: result.issues.length,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Semantic validation failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'SemanticValidator',
        confidence: 50,
        issues: [{
          type: 'semantic_validation_error',
          issue: 'Semantic validation encountered an error',
          details: error.message,
          severity: 'medium'
        }],
        corrections: [],
        metadata: {
          error: error.message,
          processingTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Analyze logical consistency of claims
   */
  async _analyzeLogicalConsistency(claims, content, jobId) {
    const result = { penalty: 0, issues: [] };

    try {
      // Group claims by type for consistency analysis
      const claimGroups = this._groupClaimsByType(claims);
      
      for (const [type, typeClaims] of Object.entries(claimGroups)) {
        if (typeClaims.length < 2) continue;

        // Analyze consistency within claim type
        const consistencyAnalysis = await this._analyzeClaimTypeConsistency(typeClaims, type, jobId);
        
        if (!consistencyAnalysis.consistent) {
          result.penalty += 15;
          result.issues.push({
            type: 'logical_inconsistency',
            claimType: type,
            issue: consistencyAnalysis.issue,
            affectedClaims: consistencyAnalysis.conflictingClaims,
            severity: 'high'
          });
        }
      }

      // Check for temporal logic issues
      const temporalIssues = this._detectTemporalLogicIssues(claims);
      result.penalty += temporalIssues.penalty;
      result.issues.push(...temporalIssues.issues);

    } catch (error) {
      logger.warn('Logical consistency analysis failed', {
        jobId,
        error: error.message
      });
      result.penalty += 10;
      result.issues.push({
        type: 'logical_analysis_error',
        issue: 'Failed to analyze logical consistency',
        severity: 'medium'
      });
    }

    return result;
  }

  /**
   * Detect contradictions between claims
   */
  async _detectContradictions(claims, content, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      // Use advanced semantic analysis to detect contradictions
      const contradictionPrompt = this._buildContradictionAnalysisPrompt(claims, content);
      
      if (this.bedrockService) {
        try {
          // Fixed: Use correct Bedrock service method
          const analysis = await this.bedrockService.invokeModel(contradictionPrompt, {
            maxTokens: 1000,
            temperature: 0.1
          });

        const contradictions = this._parseContradictionAnalysis(analysis);
        
        for (const contradiction of contradictions) {
          result.penalty += 20;
          result.issues.push({
            type: 'semantic_contradiction',
            claim1: contradiction.claim1,
            claim2: contradiction.claim2,
            issue: contradiction.explanation,
            confidence: contradiction.confidence,
            severity: contradiction.severity
          });

          result.corrections.push({
            type: 'contradiction_resolution',
            target: 'content_revision',
            action: 'Resolve contradictory statements',
            details: contradiction.resolution
          });
        }
        } catch (error) {
          this.logger.error('[SemanticValidator] Bedrock service error during contradiction detection:', {
            error: error.message,
            jobId,
            claimCount: claims.length
          });
          
          // Add penalty for failed contradiction detection but don't fail completely
          result.penalty += 5;
          result.issues.push({
            type: 'analysis_error',
            severity: 'medium',
            description: 'Unable to perform advanced contradiction detection',
            error: error.message
          });
        }
      } else {
        this.logger.warn('[SemanticValidator] Bedrock service not available for contradiction detection', { jobId });
        
        // Add minor penalty when Bedrock service is unavailable
        result.penalty += 2;
        result.issues.push({
          type: 'service_unavailable',
          severity: 'low',
          description: 'Advanced contradiction detection unavailable - Bedrock service not initialized'
        });
      }

      // Fallback: Basic pattern-based contradiction detection
      const basicContradictions = this._detectBasicContradictions(claims);
      result.penalty += basicContradictions.penalty;
      result.issues.push(...basicContradictions.issues);

    } catch (error) {
      logger.warn('Contradiction detection failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate semantic coherence
   */
  async _validateSemanticCoherence(claims, content, marketContext, jobId) {
    const result = { penalty: 0, issues: [] };

    try {
      // Analyze overall narrative coherence
      const coherenceScore = await this._calculateCoherenceScore(content, claims, marketContext);
      
      if (coherenceScore < this.config.semanticSimilarityThreshold) {
        const penalty = Math.round((this.config.semanticSimilarityThreshold - coherenceScore) * 30);
        result.penalty += penalty;
        result.issues.push({
          type: 'semantic_incoherence',
          issue: 'Content lacks semantic coherence',
          coherenceScore,
          threshold: this.config.semanticSimilarityThreshold,
          severity: coherenceScore < 0.5 ? 'high' : 'medium'
        });
      }

      // Check claim-to-content alignment
      const alignmentIssues = await this._checkClaimContentAlignment(claims, content, jobId);
      result.penalty += alignmentIssues.penalty;
      result.issues.push(...alignmentIssues.issues);

    } catch (error) {
      logger.warn('Semantic coherence validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate contextual consistency
   */
  async _validateContextualConsistency(claims, content, marketContext, jobId) {
    const result = { penalty: 0, issues: [] };

    try {
      // Check market context consistency
      if (marketContext.market) {
        const contextIssues = this._validateMarketContextConsistency(claims, marketContext);
        result.penalty += contextIssues.penalty;
        result.issues.push(...contextIssues.issues);
      }

      // Check temporal context consistency
      const temporalIssues = this._validateTemporalContext(claims, content);
      result.penalty += temporalIssues.penalty;
      result.issues.push(...temporalIssues.issues);

      // Check domain-specific context
      const domainIssues = this._validateDomainContext(claims, content);
      result.penalty += domainIssues.penalty;
      result.issues.push(...domainIssues.issues);

    } catch (error) {
      logger.warn('Contextual consistency validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  // Helper methods

  /**
   * Group claims by type for analysis
   */
  _groupClaimsByType(claims) {
    return claims.reduce((groups, claim) => {
      const type = claim.type || 'general';
      if (!groups[type]) groups[type] = [];
      groups[type].push(claim);
      return groups;
    }, {});
  }

  /**
   * Analyze consistency within a claim type
   */
  async _analyzeClaimTypeConsistency(claims, type, jobId) {
    // Look for conflicting claims of the same type
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const claim1 = claims[i];
        const claim2 = claims[j];
        
        // Check for opposing directional claims
        if (this._areClaimsContradictory(claim1.text, claim2.text)) {
          return {
            consistent: false,
            issue: `Contradictory ${type} claims detected`,
            conflictingClaims: [claim1.text, claim2.text]
          };
        }
      }
    }

    return { consistent: true };
  }

  /**
   * Detect temporal logic issues
   */
  _detectTemporalLogicIssues(claims) {
    const result = { penalty: 0, issues: [] };
    
    // Look for temporal inconsistencies
    const temporalClaims = claims.filter(claim => 
      /\b(before|after|during|since|until|by|from|to)\b/i.test(claim.text) ||
      /\b(year|month|quarter|week|day)\b/i.test(claim.text)
    );

    // Basic temporal logic validation
    for (const claim of temporalClaims) {
      if (this._hasTemporalLogicError(claim.text)) {
        result.penalty += 10;
        result.issues.push({
          type: 'temporal_logic_error',
          claim: claim.text,
          issue: 'Temporal logic inconsistency detected',
          severity: 'medium'
        });
      }
    }

    return result;
  }

  /**
   * Build contradiction analysis prompt for LLM
   */
  _buildContradictionAnalysisPrompt(claims, content) {
    const claimTexts = claims.map(c => c.text).join('\n- ');
    
    return `Analyze the following claims for semantic contradictions:

Claims:
- ${claimTexts}

Context: ${content.substring(0, 500)}...

Identify any contradictory statements and provide:
1. The contradictory claims
2. Explanation of the contradiction
3. Confidence level (0-1)
4. Severity (low/medium/high)
5. Suggested resolution

Format as JSON array of contradiction objects.`;
  }

  /**
   * Parse contradiction analysis from LLM response
   */
  _parseContradictionAnalysis(analysis) {
    try {
      // Extract JSON from response
      const jsonMatch = analysis.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      logger.warn('Failed to parse contradiction analysis', { error: error.message });
      return [];
    }
  }

  /**
   * Detect basic contradictions using pattern matching
   */
  _detectBasicContradictions(claims) {
    const result = { penalty: 0, issues: [] };
    
    const contradictoryPatterns = [
      { positive: /\b(increase|rising|growth|up|higher)\b/i, negative: /\b(decrease|declining|falling|down|lower)\b/i },
      { positive: /\b(strong|robust|healthy)\b/i, negative: /\b(weak|poor|struggling)\b/i },
      { positive: /\b(expanding|growing)\b/i, negative: /\b(shrinking|contracting)\b/i }
    ];

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const claim1 = claims[i].text;
        const claim2 = claims[j].text;
        
        for (const pattern of contradictoryPatterns) {
          if ((pattern.positive.test(claim1) && pattern.negative.test(claim2)) ||
              (pattern.negative.test(claim1) && pattern.positive.test(claim2))) {
            result.penalty += 15;
            result.issues.push({
              type: 'pattern_contradiction',
              claim1,
              claim2,
              issue: 'Contradictory directional claims detected',
              severity: 'high'
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Calculate semantic coherence score
   */
  async _calculateCoherenceScore(content, claims, marketContext) {
    // Simplified coherence scoring based on semantic patterns
    let coherenceScore = 1.0;
    
    // Check for topic consistency
    const topics = this._extractTopics(content);
    const claimTopics = claims.map(c => this._extractTopics(c.text)).flat();
    
    const topicOverlap = this._calculateTopicOverlap(topics, claimTopics);
    coherenceScore *= topicOverlap;
    
    // Check for narrative flow
    const flowScore = this._assessNarrativeFlow(content);
    coherenceScore *= flowScore;
    
    return Math.max(0, Math.min(1, coherenceScore));
  }

  /**
   * Check claim-to-content alignment
   */
  async _checkClaimContentAlignment(claims, content, jobId) {
    const result = { penalty: 0, issues: [] };
    
    for (const claim of claims) {
      const alignment = this._calculateClaimAlignment(claim.text, content);
      if (alignment < 0.5) {
        result.penalty += 10;
        result.issues.push({
          type: 'claim_content_misalignment',
          claim: claim.text,
          alignmentScore: alignment,
          issue: 'Claim not well supported by content context',
          severity: 'medium'
        });
      }
    }
    
    return result;
  }

  /**
   * Validate market context consistency
   */
  _validateMarketContextConsistency(claims, marketContext) {
    const result = { penalty: 0, issues: [] };
    
    const marketName = marketContext.market;
    if (!marketName) return result;
    
    // Check if claims reference the correct market
    for (const claim of claims) {
      if (this._isMarketSpecificClaim(claim.text) && !this._referencesMarket(claim.text, marketName)) {
        result.penalty += 15;
        result.issues.push({
          type: 'market_context_mismatch',
          claim: claim.text,
          expectedMarket: marketName,
          issue: 'Market-specific claim does not reference correct market',
          severity: 'high'
        });
      }
    }
    
    return result;
  }

  /**
   * Validate temporal context
   */
  _validateTemporalContext(claims, content) {
    const result = { penalty: 0, issues: [] };
    
    // Extract temporal references
    const contentDates = this._extractTemporalReferences(content);
    
    for (const claim of claims) {
      const claimDates = this._extractTemporalReferences(claim.text);
      if (claimDates.length > 0 && contentDates.length > 0) {
        const temporalConsistency = this._checkTemporalConsistency(claimDates, contentDates);
        if (!temporalConsistency.consistent) {
          result.penalty += 10;
          result.issues.push({
            type: 'temporal_inconsistency',
            claim: claim.text,
            issue: temporalConsistency.issue,
            severity: 'medium'
          });
        }
      }
    }
    
    return result;
  }

  /**
   * Validate domain-specific context
   */
  _validateDomainContext(claims, content) {
    const result = { penalty: 0, issues: [] };
    
    // Check real estate domain consistency
    const realEstateDomain = this._isRealEstateDomain(content);
    
    for (const claim of claims) {
      if (realEstateDomain && this._hasNonRealEstateTerms(claim.text)) {
        result.penalty += 5;
        result.issues.push({
          type: 'domain_context_mismatch',
          claim: claim.text,
          issue: 'Claim contains terms inconsistent with real estate domain',
          severity: 'low'
        });
      }
    }
    
    return result;
  }

  // Utility methods for semantic analysis

  _areClaimsContradictory(claim1, claim2) {
    const contradictoryPairs = [
      ['increase', 'decrease'],
      ['rising', 'falling'],
      ['growth', 'decline'],
      ['strong', 'weak'],
      ['up', 'down']
    ];
    
    const claim1Lower = claim1.toLowerCase();
    const claim2Lower = claim2.toLowerCase();
    
    return contradictoryPairs.some(([pos, neg]) =>
      (claim1Lower.includes(pos) && claim2Lower.includes(neg)) ||
      (claim1Lower.includes(neg) && claim2Lower.includes(pos))
    );
  }

  _hasTemporalLogicError(text) {
    // Check for impossible temporal relationships
    const impossiblePatterns = [
      /before.*after.*same/i,
      /future.*past.*simultaneously/i,
      /2025.*before.*2024/i
    ];
    
    return impossiblePatterns.some(pattern => pattern.test(text));
  }

  _extractTopics(text) {
    const realEstateTopics = [
      'housing', 'market', 'price', 'inventory', 'sales', 'mortgage',
      'loan', 'property', 'home', 'buyer', 'seller', 'listing'
    ];
    
    return realEstateTopics.filter(topic => 
      new RegExp(`\\b${topic}\\b`, 'i').test(text)
    );
  }

  _calculateTopicOverlap(topics1, topics2) {
    if (topics1.length === 0 || topics2.length === 0) return 0.5;
    
    const intersection = topics1.filter(t => topics2.includes(t));
    const union = [...new Set([...topics1, ...topics2])];
    
    return intersection.length / union.length;
  }

  _assessNarrativeFlow(content) {
    // Simple narrative flow assessment
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length < 2) return 1.0;
    
    // Check for transition words and logical connectors
    const transitionWords = ['however', 'therefore', 'meanwhile', 'additionally', 'furthermore'];
    const transitionCount = transitionWords.reduce((count, word) => 
      count + (content.toLowerCase().includes(word) ? 1 : 0), 0
    );
    
    return Math.min(1.0, 0.5 + (transitionCount / sentences.length));
  }

  _calculateClaimAlignment(claim, content) {
    // Simple alignment calculation based on keyword overlap
    const claimWords = claim.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const contentWords = content.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    
    const overlap = claimWords.filter(word => contentWords.includes(word));
    return overlap.length / Math.max(claimWords.length, 1);
  }

  _isMarketSpecificClaim(text) {
    const marketIndicators = ['local', 'metro', 'area', 'region', 'city', 'county'];
    return marketIndicators.some(indicator => 
      new RegExp(`\\b${indicator}\\b`, 'i').test(text)
    );
  }

  _referencesMarket(text, marketName) {
    return new RegExp(`\\b${marketName}\\b`, 'i').test(text);
  }

  _extractTemporalReferences(text) {
    const temporalPattern = /\b(20\d{2}|Q[1-4]|\d{1,2}\/\d{1,2}\/\d{2,4}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;
    return text.match(temporalPattern) || [];
  }

  _checkTemporalConsistency(claimDates, contentDates) {
    // Basic temporal consistency check
    const currentYear = new Date().getFullYear();
    
    for (const date of claimDates) {
      if (date.includes('20') && parseInt(date) > currentYear + 1) {
        return {
          consistent: false,
          issue: 'Claim references future date beyond reasonable projection'
        };
      }
    }
    
    return { consistent: true };
  }

  _isRealEstateDomain(content) {
    const realEstateKeywords = ['housing', 'real estate', 'property', 'mortgage', 'home sales'];
    return realEstateKeywords.some(keyword => 
      new RegExp(`\\b${keyword}\\b`, 'i').test(content)
    );
  }

  _hasNonRealEstateTerms(text) {
    const nonRealEstateTerms = ['cryptocurrency', 'blockchain', 'software', 'technology'];
    return nonRealEstateTerms.some(term => 
      new RegExp(`\\b${term}\\b`, 'i').test(text)
    );
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agent: this.name,
      version: this.version,
      initialized: this.isInitialized,
      config: this.config
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up SemanticValidator');
    this.isInitialized = false;
  }
}

module.exports = SemanticValidator;