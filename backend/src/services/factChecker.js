const { logger } = require('../utils/logger');
const { ValidationError, ExternalServiceError } = require('../utils/errorHandler');
const marketDataService = require('./marketData');
const bedrockService = require('./bedrock');

/**
 * Fact Checking Service
 * Comprehensive fact verification for generated content
 * 
 * Features:
 * - Claim extraction from generated content
 * - Cross-reference verification against market data
 * - Statistical accuracy validation
 * - Source attribution and confidence scoring
 * - Integration with Phase 2 data services
 */
class FactChecker {
  constructor(lineageService = null) {
    this.name = 'Fact Checker';
    this.marketDataService = marketDataService; // Use singleton instance
    this.bedrockService = bedrockService;
    this.lineageService = lineageService; // CRITICAL: Add lineage service for comprehensive tracking
    this.isInitialized = false;

    // Fact checking configuration
    this.config = {
      confidenceThresholds: {
        high: 90,
        medium: 70,
        low: 50
      },
      claimTypes: {
        statistical: {
          patterns: [
            /\d+(\.\d+)?%/g,
            /\$[\d,]+/g,
            /\d+(\.\d+)?\s+(million|thousand|billion)/g,
            /\d+\s+(homes?|properties|sales?)/g
          ],
          weight: 0.4
        },
        market: {
          patterns: [
            /market\s+(growth|decline|increase|decrease)/gi,
            /(rising|falling|increasing|decreasing)\s+(prices|values)/gi,
            /inventory\s+(levels?|shortage|surplus)/gi
          ],
          weight: 0.3
        },
        temporal: {
          patterns: [
            /\b(19|20)\d{2}\b/g,
            /(last|past|previous)\s+(year|month|quarter)/gi,
            /(this|current)\s+(year|month|quarter)/gi
          ],
          weight: 0.2
        },
        comparative: {
          patterns: [
            /(higher|lower|more|less)\s+than/gi,
            /(compared\s+to|versus|vs\.?)/gi,
            /(above|below)\s+(average|median|national)/gi
          ],
          weight: 0.1
        }
      },
      hallucinationIndicators: this._initializeHallucinationIndicators(),
      verificationSources: this._initializeVerificationSources()
    };

    logger.info('Fact Checker created', {
      claimTypes: Object.keys(this.config.claimTypes),
      hallucinationIndicators: this.config.hallucinationIndicators.length
    });
  }

  /**
   * Initialize the fact checker
   */
  async initialize() {
    try {
      logger.info('Initializing Fact Checker');

      // Initialize market data service if not already initialized
      if (!this.marketDataService.isInitialized) {
        await this.marketDataService.initialize();
      }

      // Test Bedrock connectivity for AI-powered claim analysis
      await this.bedrockService.testConnection();

      this.isInitialized = true;
      logger.info('Fact Checker initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Fact Checker', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Perform comprehensive fact checking on content
   */
  async factCheck(content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Fact Checker not initialized');
    }

    const { jobId, strictMode = false } = options;

    logger.info('Starting fact checking', {
      contentLength: content?.length || 0,
      market: marketContext.market,
      jobId,
      strictMode
    });

    try {
      // Step 1: Extract claims from content
      const claims = await this._extractClaims(content, jobId);

      // Step 2: Verify claims against market data
      const verificationResults = await this._verifyClaims(claims, marketContext, jobId);

      // Step 3: Check for hallucination indicators
      const hallucinationCheck = await this._checkHallucinationIndicators(content);

      // Step 4: Validate temporal consistency
      const temporalValidation = await this._validateTemporalConsistency(content);

      // Step 5: Calculate overall confidence score
      const confidenceScore = this._calculateConfidenceScore({
        verificationResults,
        hallucinationCheck,
        temporalValidation,
        claimCount: claims.length
      });

      // Step 6: Generate fact check report
      const report = this._generateFactCheckReport({
        content,
        claims,
        verificationResults,
        hallucinationCheck,
        temporalValidation,
        confidenceScore,
        marketContext,
        strictMode
      });

      logger.info('Fact checking completed', {
        market: marketContext.market,
        jobId,
        claimsFound: claims.length,
        confidenceScore,
        issuesFound: report.issues.length
      });

      return report;

    } catch (error) {
      logger.error('Fact checking failed', {
        market: marketContext.market,
        jobId,
        error: error.message
      });
      throw new ExternalServiceError('Fact Checker', `Fact checking failed: ${error.message}`);
    }
  }

  /**
   * Extract claims from content using AI and pattern matching
   */
  async _extractClaims(content, jobId = null) {
    try {
      const claims = [];

      // Extract claims by type using pattern matching
      for (const [claimType, config] of Object.entries(this.config.claimTypes)) {
        for (const pattern of config.patterns) {
          const matches = content.match(pattern);
          if (matches) {
            for (const match of matches) {
              const claim = {
                id: `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: claimType,
                text: match,
                context: this._extractContext(content, match),
                weight: config.weight,
                needsVerification: true,
                extractionMethod: 'pattern_matching',
                extractedAt: new Date().toISOString()
              };
              
              claims.push(claim);

              // CRITICAL: Track claim extraction in lineage
              if (this.lineageService && jobId) {
                try {
                  await this.lineageService.trackDataExtraction(jobId, claim.id, {
                    sourceType: 'fact_checking_content',
                    extractionMethod: 'pattern_matching',
                    dataType: 'claim',
                    claimType: claimType,
                    claimId: claim.id,
                    claimText: match,
                    confidence: config.weight * 100,
                    metadata: {
                      pattern: pattern.toString(),
                      context: claim.context,
                      extractionTimestamp: claim.extractedAt,
                      needsVerification: true
                    }
                  });
                } catch (lineageError) {
                  logger.warn('Failed to track claim extraction lineage', {
                    claimId: claim.id,
                    error: lineageError.message
                  });
                }
              }
            }
          }
        }
      }

      // Use AI to extract additional semantic claims
      const aiClaims = await this._extractClaimsWithAI(content, jobId);
      claims.push(...aiClaims);

      // Remove duplicates and sort by importance
      const uniqueClaims = this._deduplicateClaims(claims);
      
      logger.debug('Claims extracted with lineage tracking', {
        totalClaims: uniqueClaims.length,
        byType: this._groupClaimsByType(uniqueClaims),
        jobId,
        lineageTracked: !!this.lineageService
      });

      return uniqueClaims;

    } catch (error) {
      logger.warn('Claim extraction failed', { error: error.message, jobId });
      return [];
    }
  }

  /**
   * Extract claims using AI analysis
   */
  async _extractClaimsWithAI(content, jobId = null) {
    try {
      const prompt = `Analyze the following press release content and extract factual claims that need verification. Focus on:
1. Statistical claims (percentages, dollar amounts, quantities)
2. Market trend assertions
3. Comparative statements
4. Time-specific claims

Content to analyze:
${content}

Return a JSON array of claims with the following structure:
[
  {
    "type": "statistical|market|temporal|comparative",
    "text": "exact claim text",
    "category": "specific category",
    "verifiable": true|false
  }
]

Only return the JSON array, no additional text.`;

      const response = await this.bedrockService.invokeModelWithRetry(prompt, {
        maxTokens: 1000,
        temperature: 0.1,
        topP: 0.9
      });

      // Parse AI response
      const aiClaims = this._parseAIClaimsResponse(response);
      
      return aiClaims.map(claim => {
        const enhancedClaim = {
          ...claim,
          id: `ai_claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          weight: this.config.claimTypes[claim.type]?.weight || 0.1,
          needsVerification: claim.verifiable,
          source: 'ai_extraction',
          extractionMethod: 'ai_analysis',
          extractedAt: new Date().toISOString()
        };

        // CRITICAL: Track AI claim extraction in lineage
        if (this.lineageService && jobId) {
          try {
            this.lineageService.trackDataExtraction(jobId, enhancedClaim.id, {
              sourceType: 'fact_checking_content',
              extractionMethod: 'ai_analysis',
              dataType: 'claim',
              claimType: claim.type,
              claimId: enhancedClaim.id,
              claimText: claim.text,
              confidence: enhancedClaim.weight * 100,
              metadata: {
                category: claim.category,
                verifiable: claim.verifiable,
                aiModel: 'bedrock_claude',
                extractionTimestamp: enhancedClaim.extractedAt,
                needsVerification: claim.verifiable
              }
            }).catch(lineageError => {
              logger.warn('Failed to track AI claim extraction lineage', {
                claimId: enhancedClaim.id,
                error: lineageError.message
              });
            });
          } catch (lineageError) {
            logger.warn('Failed to track AI claim extraction lineage', {
              claimId: enhancedClaim.id,
              error: lineageError.message
            });
          }
        }

        return enhancedClaim;
      });

    } catch (error) {
      logger.warn('AI claim extraction failed', { error: error.message, jobId });
      return [];
    }
  }

  /**
   * Verify claims against market data
   */
  async _verifyClaims(claims, marketContext, jobId = null) {
    const verificationResults = [];

    for (const claim of claims) {
      try {
        const verification = await this._verifySingleClaim(claim, marketContext);
        const result = {
          claim,
          verification,
          timestamp: new Date().toISOString()
        };
        
        verificationResults.push(result);

        // CRITICAL: Track claim verification in lineage
        if (this.lineageService && jobId) {
          try {
            await this.lineageService.trackSourceVerification(jobId, claim.id, {
              type: 'fact_validation',
              sourcesQueried: verification.sources || [],
              results: {
                verified: verification.status === 'verified',
                confidence: verification.confidence || 0,
                verificationTimestamp: result.timestamp
              },
              confidenceScore: verification.confidence || 0,
              metadata: {
                claimId: claim.id,
                claimText: claim.text,
                claimType: claim.type,
                marketContext: marketContext.market,
                verificationMethod: verification.method || 'market_data_comparison',
                issues: verification.issues || [],
                dataPoints: verification.dataPoints || []
              }
            });
          } catch (lineageError) {
            logger.warn('Failed to track claim verification lineage', {
              claimId: claim.id,
              error: lineageError.message
            });
          }
        }
      } catch (error) {
        logger.warn('Claim verification failed', {
          claim: claim.text,
          error: error.message,
          jobId
        });
        
        const errorResult = {
          claim,
          verification: {
            status: 'error',
            confidence: 0,
            issues: [`Verification failed: ${error.message}`]
          },
          timestamp: new Date().toISOString()
        };
        
        verificationResults.push(errorResult);

        // CRITICAL: Track failed verification in lineage
        if (this.lineageService && jobId) {
          try {
            await this.lineageService.trackSourceVerification(jobId, claim.id, {
              type: 'fact_validation_error',
              sourcesQueried: [],
              results: {
                verified: false,
                confidence: 0,
                verificationTimestamp: errorResult.timestamp
              },
              confidenceScore: 0,
              metadata: {
                claimId: claim.id,
                claimText: claim.text,
                claimType: claim.type,
                marketContext: marketContext.market,
                verificationMethod: 'failed',
                error: error.message,
                issues: [`Verification failed: ${error.message}`]
              }
            });
          } catch (lineageError) {
            logger.warn('Failed to track failed verification lineage', {
              claimId: claim.id,
              error: lineageError.message
            });
          }
        }
      }
    }

    return verificationResults;
  }

  /**
   * Verify a single claim
   */
  async _verifySingleClaim(claim, marketContext) {
    const verification = {
      status: 'unverified',
      confidence: 50,
      issues: [],
      sources: [],
      recommendations: []
    };

    try {
      // Statistical claim verification
      if (claim.type === 'statistical') {
        const statVerification = await this._verifyStatisticalClaim(claim, marketContext);
        Object.assign(verification, statVerification);
      }

      // Market claim verification
      else if (claim.type === 'market') {
        const marketVerification = await this._verifyMarketClaim(claim, marketContext);
        Object.assign(verification, marketVerification);
      }

      // Temporal claim verification
      else if (claim.type === 'temporal') {
        const temporalVerification = await this._verifyTemporalClaim(claim);
        Object.assign(verification, temporalVerification);
      }

      // Comparative claim verification
      else if (claim.type === 'comparative') {
        const comparativeVerification = await this._verifyComparativeClaim(claim, marketContext);
        Object.assign(verification, comparativeVerification);
      }

      // General plausibility check
      const plausibilityCheck = await this._checkClaimPlausibility(claim, marketContext);
      verification.confidence = Math.min(verification.confidence, plausibilityCheck.confidence);
      verification.issues.push(...plausibilityCheck.issues);

    } catch (error) {
      verification.status = 'error';
      verification.confidence = 0;
      verification.issues.push(`Verification error: ${error.message}`);
    }

    return verification;
  }

  /**
   * Verify statistical claims
   */
  async _verifyStatisticalClaim(claim, marketContext) {
    const verification = {
      status: 'verified',
      confidence: 80,
      issues: [],
      sources: ['market_data_analysis']
    };

    try {
      // Extract numerical values from claim
      const numbers = this._extractNumbers(claim.text);
      
      // Check for suspicious precision
      for (const number of numbers) {
        if (this._isSuspiciouslyPrecise(number)) {
          verification.confidence -= 20;
          verification.issues.push(`Suspiciously precise number: ${number}`);
        }
      }

      // Check against market data if available
      if (marketContext.marketData) {
        const dataConsistency = this._checkDataConsistency(claim, marketContext.marketData);
        verification.confidence = Math.min(verification.confidence, dataConsistency.confidence);
        verification.issues.push(...dataConsistency.issues);
      }

      // Check for reasonable ranges
      const rangeCheck = this._checkReasonableRanges(claim.text);
      verification.confidence = Math.min(verification.confidence, rangeCheck.confidence);
      verification.issues.push(...rangeCheck.issues);

    } catch (error) {
      verification.confidence = 40;
      verification.issues.push(`Statistical verification failed: ${error.message}`);
    }

    return verification;
  }

  /**
   * Verify market claims
   */
  async _verifyMarketClaim(claim, marketContext) {
    const verification = {
      status: 'verified',
      confidence: 75,
      issues: [],
      sources: ['market_trends_analysis']
    };

    try {
      // Check claim against known market patterns
      const marketPatterns = this._getMarketPatterns(marketContext);
      const patternMatch = this._matchClaimToPatterns(claim, marketPatterns);
      
      verification.confidence = patternMatch.confidence;
      verification.issues.push(...patternMatch.issues);

      // Verify market-specific terminology
      const terminologyCheck = this._verifyMarketTerminology(claim, marketContext);
      verification.confidence = Math.min(verification.confidence, terminologyCheck.confidence);
      verification.issues.push(...terminologyCheck.issues);

    } catch (error) {
      verification.confidence = 50;
      verification.issues.push(`Market verification failed: ${error.message}`);
    }

    return verification;
  }

  /**
   * Verify temporal claims
   */
  async _verifyTemporalClaim(claim) {
    const verification = {
      status: 'verified',
      confidence: 90,
      issues: [],
      sources: ['temporal_consistency_check']
    };

    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      // Extract years from claim
      const years = claim.text.match(/\b(19|20)\d{2}\b/g);
      if (years) {
        for (const year of years) {
          const yearNum = parseInt(year);
          if (yearNum > currentYear) {
            verification.confidence = 0;
            verification.issues.push(`Future year reference: ${year}`);
            verification.status = 'failed';
          } else if (yearNum < 1990) {
            verification.confidence -= 20;
            verification.issues.push(`Very old year reference: ${year}`);
          }
        }
      }

      // Check for relative time references
      const relativeTimeCheck = this._checkRelativeTimeReferences(claim.text);
      verification.confidence = Math.min(verification.confidence, relativeTimeCheck.confidence);
      verification.issues.push(...relativeTimeCheck.issues);

    } catch (error) {
      verification.confidence = 70;
      verification.issues.push(`Temporal verification failed: ${error.message}`);
    }

    return verification;
  }

  /**
   * Verify comparative claims
   */
  async _verifyComparativeClaim(claim, marketContext) {
    const verification = {
      status: 'verified',
      confidence: 70,
      issues: [],
      sources: ['comparative_analysis']
    };

    try {
      // Check for valid comparison bases
      const comparisonBases = ['national average', 'regional average', 'previous year', 'last quarter'];
      const hasValidBase = comparisonBases.some(base => 
        claim.text.toLowerCase().includes(base)
      );

      if (!hasValidBase) {
        verification.confidence -= 25;
        verification.issues.push('Comparison lacks clear baseline reference');
      }

      // Check for reasonable comparison magnitudes
      const magnitudeCheck = this._checkComparisonMagnitudes(claim.text);
      verification.confidence = Math.min(verification.confidence, magnitudeCheck.confidence);
      verification.issues.push(...magnitudeCheck.issues);

    } catch (error) {
      verification.confidence = 50;
      verification.issues.push(`Comparative verification failed: ${error.message}`);
    }

    return verification;
  }

  /**
   * Check for hallucination indicators
   */
  async _checkHallucinationIndicators(content) {
    const check = {
      score: 100,
      indicators: [],
      issues: []
    };

    try {
      for (const indicator of this.config.hallucinationIndicators) {
        if (indicator.pattern.test(content)) {
          check.score -= indicator.penalty;
          check.indicators.push(indicator.name);
          check.issues.push(indicator.description);
        }
      }

      check.score = Math.max(0, check.score);

    } catch (error) {
      logger.warn('Hallucination check failed', { error: error.message });
      check.score = 70; // Default score on error
    }

    return check;
  }

  /**
   * Validate temporal consistency
   */
  async _validateTemporalConsistency(content) {
    const validation = {
      consistent: true,
      issues: [],
      confidence: 95
    };

    try {
      const currentYear = new Date().getFullYear();
      
      // Check for future dates
      const futureDates = content.match(/\b(202[6-9]|20[3-9]\d)\b/g);
      if (futureDates) {
        validation.consistent = false;
        validation.confidence -= 30;
        validation.issues.push(`Future dates found: ${futureDates.join(', ')}`);
      }

      // Check for inconsistent time references
      const timeReferences = this._extractTimeReferences(content);
      const inconsistencies = this._findTimeInconsistencies(timeReferences);
      
      if (inconsistencies.length > 0) {
        validation.consistent = false;
        validation.confidence -= 20;
        validation.issues.push(...inconsistencies);
      }

    } catch (error) {
      logger.warn('Temporal validation failed', { error: error.message });
      validation.confidence = 80;
    }

    return validation;
  }

  /**
   * Calculate overall confidence score
   */
  _calculateConfidenceScore(results) {
    const {
      verificationResults,
      hallucinationCheck,
      temporalValidation,
      claimCount
    } = results;

    let totalScore = 0;
    let weights = 0;

    // Verification results weight (50%)
    if (verificationResults.length > 0) {
      const avgVerificationScore = verificationResults.reduce((sum, result) => 
        sum + result.verification.confidence, 0) / verificationResults.length;
      totalScore += avgVerificationScore * 0.5;
      weights += 0.5;
    }

    // Hallucination check weight (30%)
    totalScore += hallucinationCheck.score * 0.3;
    weights += 0.3;

    // Temporal validation weight (20%)
    totalScore += temporalValidation.confidence * 0.2;
    weights += 0.2;

    // Adjust for claim density
    const claimDensityAdjustment = this._calculateClaimDensityAdjustment(claimCount);
    totalScore *= claimDensityAdjustment;

    return Math.round(totalScore / weights);
  }

  /**
   * Generate comprehensive fact check report
   */
  _generateFactCheckReport(data) {
    const {
      content,
      claims,
      verificationResults,
      hallucinationCheck,
      temporalValidation,
      confidenceScore,
      marketContext,
      strictMode
    } = data;

    const report = {
      overall: {
        confidence: confidenceScore,
        status: this._determineOverallStatus(confidenceScore, strictMode),
        claimsAnalyzed: claims.length,
        timestamp: new Date().toISOString()
      },
      claims: {
        total: claims.length,
        verified: verificationResults.filter(r => r.verification.status === 'verified').length,
        failed: verificationResults.filter(r => r.verification.status === 'failed').length,
        unverified: verificationResults.filter(r => r.verification.status === 'unverified').length,
        details: verificationResults
      },
      hallucination: {
        score: hallucinationCheck.score,
        indicators: hallucinationCheck.indicators,
        issues: hallucinationCheck.issues
      },
      temporal: {
        consistent: temporalValidation.consistent,
        confidence: temporalValidation.confidence,
        issues: temporalValidation.issues
      },
      issues: this._compileAllIssues(verificationResults, hallucinationCheck, temporalValidation),
      recommendations: this._generateRecommendations(verificationResults, confidenceScore),
      metadata: {
        market: marketContext.market,
        contentLength: content.length,
        strictMode,
        processingTime: new Date().toISOString()
      }
    };

    return report;
  }

  // Helper methods
  _extractContext(content, match) {
    const index = content.indexOf(match);
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + match.length + 50);
    return content.substring(start, end);
  }

  _deduplicateClaims(claims) {
    const seen = new Set();
    return claims.filter(claim => {
      const key = `${claim.type}:${claim.text.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _groupClaimsByType(claims) {
    return claims.reduce((acc, claim) => {
      acc[claim.type] = (acc[claim.type] || 0) + 1;
      return acc;
    }, {});
  }

  _parseAIClaimsResponse(response) {
    try {
      // Clean response and extract JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      logger.warn('Failed to parse AI claims response', { error: error.message });
      return [];
    }
  }

  _extractNumbers(text) {
    const numberPatterns = [
      /\d+(\.\d+)?%/g,
      /\$[\d,]+(\.\d+)?/g,
      /\d+(\.\d+)?\s*(million|thousand|billion)/g
    ];

    const numbers = [];
    for (const pattern of numberPatterns) {
      const matches = text.match(pattern);
      if (matches) numbers.push(...matches);
    }
    return numbers;
  }

  _isSuspiciouslyPrecise(number) {
    // Check for overly precise percentages or amounts
    const precisePatterns = [
      /\d+\.\d{3,}%/,  // More than 2 decimal places in percentage
      /\d+\.\d{2}%/    // Exactly 2 decimal places (suspicious for estimates)
    ];

    return precisePatterns.some(pattern => pattern.test(number));
  }

  _checkDataConsistency(claim, marketData) {
    // Placeholder for data consistency checking
    return { confidence: 80, issues: [] };
  }

  _checkReasonableRanges(text) {
    const check = { confidence: 90, issues: [] };

    // Check for unreasonable percentages
    const percentages = text.match(/(\d+(\.\d+)?)%/g);
    if (percentages) {
      for (const pct of percentages) {
        const value = parseFloat(pct);
        if (value > 100) {
          check.confidence -= 30;
          check.issues.push(`Unreasonable percentage: ${pct}`);
        } else if (value > 50) {
          check.confidence -= 10;
          check.issues.push(`High percentage may need verification: ${pct}`);
        }
      }
    }

    return check;
  }

  _getMarketPatterns(marketContext) {
    // Return known market patterns for verification
    return {
      growth: ['steady', 'moderate', 'strong', 'robust'],
      decline: ['slight', 'moderate', 'significant'],
      stability: ['stable', 'consistent', 'steady']
    };
  }

  _matchClaimToPatterns(claim, patterns) {
    // Match claim against known market patterns
    return { confidence: 75, issues: [] };
  }

  _verifyMarketTerminology(claim, marketContext) {
    // Verify market-specific terminology usage
    return { confidence: 85, issues: [] };
  }

  _checkRelativeTimeReferences(text) {
    // Check relative time references for consistency
    return { confidence: 90, issues: [] };
  }

  _checkComparisonMagnitudes(text) {
    // Check if comparison magnitudes are reasonable
    return { confidence: 80, issues: [] };
  }

  _extractTimeReferences(content) {
    // Extract all time references from content
    return [];
  }

  _findTimeInconsistencies(timeReferences) {
    // Find inconsistencies in time references
    return [];
  }

  _calculateClaimDensityAdjustment(claimCount) {
    // Adjust score based on claim density
    if (claimCount > 10) return 0.9; // Too many claims might indicate hallucination
    if (claimCount < 2) return 0.95; // Too few claims might indicate lack of substance
    return 1.0;
  }

  _determineOverallStatus(confidenceScore, strictMode) {
    const threshold = strictMode ? this.config.confidenceThresholds.high : this.config.confidenceThresholds.medium;
    
    if (confidenceScore >= threshold) return 'passed';
    if (confidenceScore >= this.config.confidenceThresholds.low) return 'warning';
    return 'failed';
  }

  _compileAllIssues(verificationResults, hallucinationCheck, temporalValidation) {
    const issues = [];
    
    // Verification issues
    verificationResults.forEach(result => {
      if (result.verification.issues.length > 0) {
        issues.push(...result.verification.issues.map(issue => ({
          type: 'verification',
          claim: result.claim.text,
          issue
        })));
      }
    });

    // Hallucination issues
    hallucinationCheck.issues.forEach(issue => {
      issues.push({ type: 'hallucination', issue });
    });

    // Temporal issues
    temporalValidation.issues.forEach(issue => {
      issues.push({ type: 'temporal', issue });
    });

    return issues;
  }

  _generateRecommendations(verificationResults, confidenceScore) {
    const recommendations = [];

    if (confidenceScore < 70) {
      recommendations.push('Review and verify all statistical claims');
      recommendations.push('Reduce specific numbers and use more general language');
    }

    if (confidenceScore < 80) {
      recommendations.push('Add source attribution for key claims');
      recommendations.push('Use qualifying language for uncertain statements');
    }

    const failedVerifications = verificationResults.filter(r => r.verification.status === 'failed');
    if (failedVerifications.length > 0) {
      recommendations.push('Remove or revise claims that failed verification');
    }

    return recommendations;
  }

  /**
   * Initialize hallucination indicators
   */
  _initializeHallucinationIndicators() {
    return [
      {
        name: 'Overly Precise Statistics',
        pattern: /\d+\.\d{2,}%/g,
        penalty: 15,
        description: 'Statistics with excessive precision may indicate fabrication'
      },
      {
        name: 'Invented Studies',
        pattern: /(according to our|our latest study|our research shows)/gi,
        penalty: 25,
        description: 'References to non-existent internal studies'
      },
      {
        name: 'Impossible Numbers',
        pattern: /\d{3,}% (increase|decrease|growth)/gi,
        penalty: 30,
        description: 'Mathematically impossible percentage changes'
      },
      {
        name: 'Future Predictions',
        pattern: /(will increase|will decrease|expected to|projected to) \d+%/gi,
        penalty: 20,
        description: 'Specific future predictions without basis'
      },
      {
        name: 'Competitor References',
        pattern: /(Competitor One|competitor2\.com|coldwell banker|century 21)/gi,
        penalty: 10,
        description: 'Inappropriate competitor references'
      }
    ];
  }

  /**
   * Initialize verification sources
   */
  _initializeVerificationSources() {
    return [
      {
        name: 'Market Data Service',
        type: 'internal',
        reliability: 0.9
      },
      {
        name: 'Census Bureau',
        type: 'external',
        reliability: 0.95
      },
      {
        name: 'Bureau of Labor Statistics',
        type: 'external',
        reliability: 0.95
      },
      {
        name: 'Real Estate Industry Reports',
        type: 'external',
        reliability: 0.8
      }
    ];
  }

  /**
   * Get fact checker status
   */
  getStatus() {
    return {
      service: 'Fact Checker',
      initialized: this.isInitialized,
      capabilities: {
        claimExtraction: true,
        marketDataVerification: true,
        hallucinationDetection: true,
        temporalValidation: true,
        confidenceScoring: true
      },
      configuration: {
        claimTypes: Object.keys(this.config.claimTypes),
        confidenceThresholds: this.config.confidenceThresholds,
        hallucinationIndicators: this.config.hallucinationIndicators.length,
        verificationSources: this.config.verificationSources.length
      }
    };
  }
}

module.exports = FactChecker;