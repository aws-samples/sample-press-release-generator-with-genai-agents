const { logger } = require('../../utils/logger');
const bedrockService = require('../bedrock');

/**
 * Claim Extraction Engine
 * Extracts verifiable claims from generated content using pattern matching and AI
 * 
 * Features:
 * - Pattern-based claim extraction (statistical, market, temporal, comparative)
 * - AI-powered semantic claim extraction
 * - Claim deduplication and classification
 * - Context extraction for verification
 */
class ClaimExtractor {
  constructor(options = {}, lineageService = null) {
    this.name = 'Claim Extractor';
    this.bedrockService = bedrockService;
    this.lineageService = lineageService; // CRITICAL: Add lineage service for tracking claim extraction
    
    // Claim type patterns and configurations - ENHANCED for Critical Issue Detection
    this.claimTypes = {
      statistical: {
        patterns: [
          /\d+(\.\d+)?%\s*(increase|decrease|growth|decline|change)/gi,
          /\$[\d,]+(\.\d+)?\s*(median|average|typical)/gi,
          /\d+(\.\d+)?\s*(million|thousand|billion)\s*(homes?|properties|sales?)/gi,
          /\d+\s*(homes?|properties|sales?)\s*(sold|listed|available)/gi,
          /\d+\s*days?\s*on\s*market/gi,
          /inventory\s*(levels?|shortage|surplus)\s*of\s*\d+/gi,
          // CRITICAL ENHANCEMENT: Down payment percentage patterns
          /down\s*payment.*?\d+(\.\d+)?%/gi,
          /\d+(\.\d+)?%.*?down\s*payment/gi,
          // CRITICAL ENHANCEMENT: Local vs national percentage patterns
          /local.*?\d+(\.\d+)?%/gi,
          /metro.*?\d+(\.\d+)?%/gi,
          /\d+(\.\d+)?%.*?(local|metro|area)/gi,
          // CRITICAL: Specific patterns for the 4 identified errors
          /down\s*payment\s*requirements?\s*(shrink|shrinking|decrease|declining)/gi,
          /average\s*down\s*payment\s*(decreased|decline)\s*by\s*\d+%/gi,
          /inventory\s*levels?\s*(increased|increase)\s*by\s*\d+%/gi,
          /homes?\s*staying\s*on\s*market\s*\d+\s*days?/gi
        ],
        weight: 0.4,
        priority: 'critical',
        requiresMultiSource: true,
        minSources: 2
      },
      market: {
        patterns: [
          /market\s+(growth|decline|increase|decrease|expansion|contraction)/gi,
          /(rising|falling|increasing|decreasing)\s+(prices|values|costs)/gi,
          /inventory\s+(levels?|shortage|surplus)/gi,
          /(buyer|seller)\s+market\s+conditions/gi,
          /market\s+(trends|patterns|dynamics)/gi,
          /(hot|cold|cooling|heating)\s+market/gi,
          // CRITICAL ENHANCEMENT: Trend direction patterns for headlines
          /(shrink|shrinking|decline|declining|decrease|decreasing)/gi,
          /(grow|growing|increase|increasing|rising|surge|surging)/gi,
          /(stable|unchanged|flat|steady|consistent)/gi
        ],
        weight: 0.3,
        priority: 'high'
      },
      // CRITICAL ENHANCEMENT: New loan type category
      loanType: {
        patterns: [
          /FHA\s+(loan|loans|lending|share|percentage|uptick|increase|growth|trend)/gi,
          /VA\s+(loan|loans|lending|share|percentage|uptick|increase|growth|trend)/gi,
          /conventional\s+(loan|loans|lending|share|percentage|trend)/gi,
          /\d+(\.\d+)?%.*?(FHA|VA|conventional)/gi,
          /(FHA|VA|conventional).*?\d+(\.\d+)?%/gi,
          // Local vs national loan comparisons
          /local.*?(FHA|VA|conventional)/gi,
          /national.*?(FHA|VA|conventional)/gi,
          /(FHA|VA|conventional).*?(local|national|metro)/gi
        ],
        weight: 0.35,
        priority: 'critical'
      },
      temporal: {
        patterns: [
          /\b(19|20)\d{2}\b/g,
          /(last|past|previous)\s+(year|month|quarter|week)/gi,
          /(this|current)\s+(year|month|quarter|week)/gi,
          /(first|second|third|fourth)\s+quarter/gi,
          /year[- ]over[- ]year/gi,
          /month[- ]over[- ]month/gi
        ],
        weight: 0.2,
        priority: 'medium'
      },
      comparative: {
        patterns: [
          /(higher|lower|more|less)\s+than/gi,
          /(compared\s+to|versus|vs\.?)/gi,
          /(above|below)\s+(average|median|national)/gi,
          /outperform(ed|ing)?/gi,
          /underperform(ed|ing)?/gi,
          /(leading|trailing)\s+(the\s+)?(market|nation|region)/gi,
          // CRITICAL ENHANCEMENT: Local vs national comparison patterns
          /local\s+(vs\.?|versus|compared\s+to)\s+national/gi,
          /national\s+(vs\.?|versus|compared\s+to)\s+local/gi,
          /metro\s+(vs\.?|versus|compared\s+to)\s+national/gi
        ],
        weight: 0.1,
        priority: 'medium'
      },
      // CRITICAL ENHANCEMENT: New inventory metrics category
      inventoryMetrics: {
        patterns: [
          /\d+\s+(active\s+)?listings?/gi,
          /\d+\s+days?\s+on\s+market/gi,
          /inventory\s+levels?\s*:?\s*\d+/gi,
          /supply\s+(and\s+)?demand/gi,
          /\d+\s+(homes?|properties)\s+(available|for\s+sale)/gi,
          /market\s+supply.*?\d+/gi,
          /housing\s+inventory.*?\d+/gi
        ],
        weight: 0.25,
        priority: 'high'
      }
    };
    
    // Hallucination indicators - ENHANCED for Critical Issue Detection
    this.hallucinationIndicators = [
      {
        name: 'Overly Precise Statistics',
        pattern: /\d+\.\d{2,}%/g,
        severity: 'high',
        description: 'Statistics with excessive precision may indicate fabrication'
      },
      {
        name: 'Invented Studies',
        pattern: /(according to our|our latest study|our research shows)/gi,
        severity: 'critical',
        description: 'References to non-existent internal studies'
      },
      {
        name: 'Impossible Numbers',
        pattern: /\d{3,}%\s+(increase|decrease|growth)/gi,
        severity: 'critical',
        description: 'Mathematically impossible percentage changes'
      },
      {
        name: 'Future Predictions',
        pattern: /(will increase|will decrease|expected to|projected to)\s+\d+%/gi,
        severity: 'high',
        description: 'Specific future predictions without basis'
      },
      {
        name: 'Placeholder Text',
        pattern: /\[object Object\]|\{\{[^}]+\}\}|\$\{[^}]+\}|\[PLACEHOLDER\]/gi,
        severity: 'critical',
        description: 'Unresolved placeholder text'
      },
      // CRITICAL ENHANCEMENT: Specific patterns for the 4 ChatGPT-identified errors
      {
        name: 'False Down Payment Shrinkage Claims',
        pattern: /down\s*payment\s*requirements?\s*(shrink|shrinking|decrease|declining).*?(first\s*time|nearly\s*two\s*years)/gi,
        severity: 'critical',
        description: 'FALSE: Claims down payment requirements shrinking when LA not among metros with decreasing down payments',
        errorType: 'factual_inaccuracy_1',
        requiresVerification: true,
        mandatorySourceCheck: true
      },
      {
        name: 'Unverified Down Payment Decrease Claims',
        pattern: /average\s*down\s*payment\s*(decreased|decline)\s*by\s*\d+%.*?(since|early)\s*202[23]/gi,
        severity: 'critical',
        description: 'UNVERIFIED: Claims average down payment decreased by 5% since early 2023 - no public data supports this',
        errorType: 'factual_inaccuracy_2',
        requiresVerification: true,
        mandatorySourceCheck: true
      },
      {
        name: 'Inaccurate Inventory Level Claims',
        pattern: /inventory\s*levels?\s*(increased|increase)\s*by\s*1[0-9]%/gi,
        severity: 'critical',
        description: 'INACCURATE: Claims 15% inventory increase when actual national was 30.6%, LA County was 39%',
        errorType: 'factual_inaccuracy_3',
        requiresVerification: true,
        mandatorySourceCheck: true
      },
      {
        name: 'False Market Days Claims',
        pattern: /homes?\s*staying\s*on\s*market\s*3[0-9]\s*days?.*?up\s*from\s*1[0-9]\s*days?/gi,
        severity: 'critical',
        description: 'FALSE: Claims homes staying on market 38 days up from 12 days - LA average ~33 days, no 12-day baseline exists',
        errorType: 'factual_inaccuracy_4',
        requiresVerification: true,
        mandatorySourceCheck: true
      },
      // Original patterns maintained for backward compatibility
      {
        name: 'Contradictory Trend Claims',
        pattern: /(shrink|decline|decrease).*?(unchanged|stable|flat)|headline.*?(decline|shrink).*?20%\s+unchanged/gi,
        severity: 'critical',
        description: 'Headlines claiming decline when data shows stability (Issue #1: Title Overstates Local Shrinkage)'
      },
      {
        name: 'Incorrect Local Percentages',
        pattern: /(LA|Los Angeles).*?15%.*?down\s*payment|down\s*payment.*?15%.*?(LA|Los Angeles)/gi,
        severity: 'critical',
        description: 'Claims 15% down payment for LA when actual is 20% (Issue #2: Incorrect Local Down-Payment Percentage)'
      },
      {
        name: 'Unverified FHA Claims',
        pattern: /FHA.*?(uptick|increase|growth).*?(LA|Los Angeles|local)|local.*?FHA.*?(uptick|increase|growth)/gi,
        severity: 'high',
        description: 'Claims FHA loan uptick without verification (Issue #3: Unverified FHA-Loan Claims)'
      },
      {
        name: 'Misplaced VA Loan Claims',
        pattern: /VA.*?(growth|increase|uptick).*?(LA|Los Angeles|local)|local.*?VA.*?(growth|increase|uptick)/gi,
        severity: 'high',
        description: 'Claims VA loan growth when data shows low share (Issue #4: Misplaced VA-Loan Commentary)'
      },
      {
        name: 'Missing Inventory Context',
        pattern: /\d+%.*?(without|lacking|missing).*(listing|inventory|supply|demand)|percentage.*?no\s+(context|data|source)/gi,
        severity: 'medium',
        description: 'Percentage claims without inventory context (Issue #5: Missing Local Inventory Metrics)'
      },
      {
        name: 'Unsupported Local Claims',
        pattern: /(local|metro|area).*?\d+%.*?(no\s+source|unverified|unsupported)|claims?\s+\d+%.*?local.*?(without|lacking)\s+(data|source)/gi,
        severity: 'high',
        description: 'Local percentage claims without supporting data'
      },
      {
        name: 'Generic National Data Misuse',
        pattern: /national.*?\d+%.*?(applied|used|assumed).*?local|local.*?based\s+on.*?national.*?\d+%/gi,
        severity: 'medium',
        description: 'Using national averages for local claims without verification'
      },
      {
        name: 'Trend Without Supporting Data',
        pattern: /(growing|increasing|rising|declining|falling|shrinking).*?(trend|pattern).*?(no\s+data|unverified|unsupported)/gi,
        severity: 'high',
        description: 'Trend assertions without supporting data'
      }
    ];
    
    logger.info('Claim Extractor initialized', {
      claimTypes: Object.keys(this.claimTypes),
      hallucinationIndicators: this.hallucinationIndicators.length
    });
  }

  /**
   * Extract all claims from content
   */
  async extractClaims(content, options = {}) {
    const { jobId, includeAI = true } = options;
    
    // CRITICAL FIX: Extract text content from complex objects
    const textContent = this._extractTextContent(content);
    
    logger.debug('Starting claim extraction', {
      originalContentType: typeof content,
      extractedContentLength: textContent?.length || 0,
      jobId,
      includeAI
    });
    
    try {
      const claims = [];
      
      // 1. Pattern-based extraction
      const patternClaims = this._extractPatternClaims(textContent);
      claims.push(...patternClaims);
      
      // 2. Hallucination indicator detection
      const hallucinationClaims = this._extractHallucinationIndicators(textContent);
      claims.push(...hallucinationClaims);
      
      // 3. AI-powered extraction (if enabled)
      if (includeAI) {
        try {
          const aiClaims = await this._extractAIClaims(textContent);
          claims.push(...aiClaims);
        } catch (error) {
          logger.warn('AI claim extraction failed, continuing with pattern-based claims', {
            error: error.message,
            jobId
          });
        }
      }
      
      // 4. Deduplicate and classify claims
      const uniqueClaims = this._deduplicateClaims(claims);
      const classifiedClaims = this._enhancedClassifyClaims(this._classifyClaims(uniqueClaims));
      
      // 5. CRITICAL: Track lineage for each extracted claim
      if (this.lineageService && jobId) {
        for (let i = 0; i < classifiedClaims.length; i++) {
          const claim = classifiedClaims[i];
          const claimId = `claim_${jobId}_${i + 1}`;
          
          try {
            await this.lineageService.trackDataExtraction(jobId, claimId, {
              sourceType: 'claim_extraction',
              extractionMethod: claim.extractionMethod || 'pattern_based',
              claimType: claim.type,
              claimText: claim.text,
              confidence: claim.confidence,
              sourceLocation: claim.sourceLocation || 'master_pr_content',
              dataSource: claim.dataSource || 'content_analysis',
              metadata: {
                priority: claim.priority,
                requiresMultiSource: claim.requiresMultiSource,
                weight: claim.weight,
                extractionTimestamp: new Date().toISOString()
              }
            });
          } catch (error) {
            logger.warn('Failed to track lineage for claim', {
              claimId,
              error: error.message,
              jobId
            });
          }
        }
        
        logger.info('Lineage tracking completed for extracted claims', {
          totalClaims: classifiedClaims.length,
          jobId
        });
      }
      
      logger.info('Claim extraction completed', {
        totalClaims: classifiedClaims.length,
        byType: this._groupClaimsByType(classifiedClaims),
        jobId
      });
      
      return classifiedClaims;
      
    } catch (error) {
      logger.error('Claim extraction failed', {
        error: error.message,
        stack: error.stack,
        jobId
      });
      throw error;
    }
  }

  /**
   * CRITICAL FIX: Extract text content from complex content objects
   * Handles both string content and complex objects with multiple content fields
   */
  _extractTextContent(content) {
    // If content is already a string, return as-is
    if (typeof content === 'string') {
      return content;
    }
    
    // If content is null or undefined, return empty string
    if (!content) {
      logger.warn('Content is null or undefined, returning empty string');
      return '';
    }
    
    // If content is not an object, convert to string
    if (typeof content !== 'object') {
      logger.warn('Content is not string or object, converting to string', {
        contentType: typeof content
      });
      return String(content);
    }
    
    // Handle complex content objects - prioritize fullContent, fallback to fullNarrative
    let extractedText = '';
    
    if (content.fullContent && typeof content.fullContent === 'string') {
      extractedText = content.fullContent;
      logger.debug('Extracted text from fullContent field', {
        length: extractedText.length
      });
    } else if (content.fullNarrative && typeof content.fullNarrative === 'string') {
      extractedText = content.fullNarrative;
      logger.debug('Extracted text from fullNarrative field', {
        length: extractedText.length
      });
    } else {
      // Fallback: concatenate all string fields
      const textFields = [];
      
      // Common content fields to extract
      const fieldPriority = [
        'leadParagraph',
        'narrativeBody',
        'bodyParagraphs',
        'expertQuote',
        'humanInterest',
        'localDataPoints'
      ];
      
      for (const field of fieldPriority) {
        if (content[field] && typeof content[field] === 'string') {
          textFields.push(content[field]);
        }
      }
      
      extractedText = textFields.join('\n\n');
      
      logger.debug('Extracted text by concatenating fields', {
        fieldsUsed: fieldPriority.filter(field => content[field] && typeof content[field] === 'string'),
        totalLength: extractedText.length
      });
    }
    
    // Final validation
    if (!extractedText || extractedText.trim().length === 0) {
      logger.warn('No valid text content found in object, attempting JSON stringify fallback', {
        contentKeys: Object.keys(content)
      });
      
      // Last resort: stringify the object and extract meaningful text
      try {
        const stringified = JSON.stringify(content, null, 2);
        // Remove JSON formatting and extract readable text
        extractedText = stringified
          .replace(/[{}"\[\],]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch (error) {
        logger.error('Failed to stringify content object', {
          error: error.message
        });
        extractedText = 'Content extraction failed';
      }
    }
    
    return extractedText;
  }

  /**
   * Extract claims using pattern matching
   */
  _extractPatternClaims(content) {
    const claims = [];
    
    for (const [claimType, config] of Object.entries(this.claimTypes)) {
      for (const pattern of config.patterns) {
        const matches = content.match(pattern);
        if (matches) {
          for (const match of matches) {
            claims.push({
              type: claimType,
              text: match.trim(),
              context: this._extractContext(content, match),
              weight: config.weight,
              priority: config.priority,
              needsVerification: true,
              source: 'pattern_matching',
              confidence: 0.8, // Pattern matching has good confidence
              confidenceInterval: this._calculateConfidenceInterval(0.8, 'pattern_matching'),
              uncertaintyLevel: this._quantifyUncertainty(match, claimType, 'pattern_matching')
            });
          }
        }
      }
    }
    
    return claims;
  }

  /**
   * Extract hallucination indicators
   */
  _extractHallucinationIndicators(content) {
    const claims = [];
    
    for (const indicator of this.hallucinationIndicators) {
      const matches = content.match(indicator.pattern);
      if (matches) {
        for (const match of matches) {
          claims.push({
            type: 'hallucination',
            subtype: indicator.name,
            text: match.trim(),
            context: this._extractContext(content, match),
            weight: 1.0, // Hallucinations are critical
            priority: 'critical',
            needsVerification: true,
            source: 'hallucination_detection',
            severity: indicator.severity,
            description: indicator.description,
            confidence: 0.9, // High confidence in pattern detection
            confidenceInterval: this._calculateConfidenceInterval(0.9, 'hallucination_detection'),
            uncertaintyLevel: this._quantifyUncertainty(match, 'hallucination', 'hallucination_detection')
          });
        }
      }
    }
    
    return claims;
  }

  /**
   * Extract claims using AI analysis
   */
  async _extractAIClaims(content) {
    const prompt = `Analyze the following press release content and extract factual claims that need verification. Focus on:

1. Statistical claims (percentages, dollar amounts, quantities)
2. Market trend assertions
3. Comparative statements
4. Time-specific claims
5. Claims that could be fact-checked against external data

Content to analyze:
${content}

Return a JSON array of claims with the following structure:
[
  {
    "type": "statistical|market|temporal|comparative|other",
    "text": "exact claim text from content",
    "category": "specific category like price_trend, inventory_level, etc",
    "verifiable": true|false,
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation of why this claim needs verification"
  }
]

Only return the JSON array, no additional text.`;

    try {
      const response = await this.bedrockService.invokeModelWithRetry(prompt, {
        maxTokens: 1500,
        temperature: 0.1,
        topP: 0.9
      });

      const aiClaims = this._parseAIClaimsResponse(response);
      
      return aiClaims.map(claim => ({
        ...claim,
        context: this._extractContext(content, claim.text),
        weight: this._getClaimWeight(claim.type),
        priority: this._getClaimPriority(claim.type, claim.confidence),
        needsVerification: claim.verifiable,
        source: 'ai_extraction'
      }));

    } catch (error) {
      logger.warn('AI claim extraction failed', { 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Parse AI response for claims
   */
  _parseAIClaimsResponse(response) {
    try {
      // Clean response and extract JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (error) {
      logger.warn('Failed to parse AI claims response', { 
        error: error.message,
        response: response.substring(0, 200)
      });
      return [];
    }
  }

  /**
   * Extract context around a claim
   */
  _extractContext(content, claimText) {
    const index = content.toLowerCase().indexOf(claimText.toLowerCase());
    if (index === -1) return claimText;
    
    const contextRadius = 100; // characters before and after
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(content.length, index + claimText.length + contextRadius);
    
    return content.substring(start, end).trim();
  }

  /**
   * Deduplicate claims based on text similarity
   */
  _deduplicateClaims(claims) {
    const seen = new Set();
    const unique = [];
    
    for (const claim of claims) {
      // Create a normalized key for deduplication
      const normalizedText = claim.text.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s%$]/g, '')
        .trim();
      
      const key = `${claim.type}:${normalizedText}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(claim);
      } else {
        // If duplicate found, merge confidence scores
        const existing = unique.find(c => 
          c.type === claim.type && 
          c.text.toLowerCase().includes(normalizedText.substring(0, 20))
        );
        if (existing && claim.confidence > existing.confidence) {
          existing.confidence = Math.max(existing.confidence, claim.confidence);
          existing.source = `${existing.source},${claim.source}`;
        }
      }
    }
    
    return unique;
  }

  /**
   * Classify claims by importance and verification needs
   */
  _classifyClaims(claims) {
    return claims.map(claim => ({
      ...claim,
      id: this._generateClaimId(claim),
      extractedAt: new Date().toISOString(),
      verificationStatus: 'pending',
      issues: [],
      metadata: {
        contextLength: claim.context?.length || 0,
        extractionMethod: claim.source,
        requiresExternalData: this._requiresExternalData(claim)
      }
    })).sort((a, b) => {
      // Sort by priority and confidence
      const priorityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
      const aPriority = priorityOrder[a.priority] || 0;
      const bPriority = priorityOrder[b.priority] || 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return (b.confidence || 0) - (a.confidence || 0);
    });
  }

  /**
   * Generate unique ID for a claim
   */
  _generateClaimId(claim) {
    const hash = require('crypto')
      .createHash('md5')
      .update(`${claim.type}:${claim.text}`)
      .digest('hex');
    return `claim_${hash.substring(0, 8)}`;
  }

  /**
   * Check if claim requires external data for verification
   */
  _requiresExternalData(claim) {
    const externalDataTypes = ['statistical', 'market', 'comparative'];
    return externalDataTypes.includes(claim.type) || 
           claim.text.match(/\d+%|\$[\d,]+|market\s+(growth|decline)/i);
  }

  /**
   * Get claim weight based on type
   */
  _getClaimWeight(type) {
    return this.claimTypes[type]?.weight || 0.1;
  }

  /**
   * Get claim priority based on type and confidence
   */
  _getClaimPriority(type, confidence) {
    if (type === 'hallucination') return 'critical';
    if (confidence > 0.8) return 'high';
    if (confidence > 0.6) return 'medium';
    return 'low';
  }

  /**
   * Group claims by type for reporting
   */
  _groupClaimsByType(claims) {
    return claims.reduce((acc, claim) => {
      acc[claim.type] = (acc[claim.type] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Calculate confidence interval for a claim
   * Based on extraction method and claim characteristics
   */
  _calculateConfidenceInterval(baseConfidence, extractionMethod) {
    // Method-specific confidence adjustments
    const methodAdjustments = {
      'pattern_matching': { variance: 0.05, reliability: 0.9 },
      'hallucination_detection': { variance: 0.03, reliability: 0.95 },
      'ai_extraction': { variance: 0.08, reliability: 0.85 }
    };
    
    const adjustment = methodAdjustments[extractionMethod] || { variance: 0.1, reliability: 0.8 };
    
    // Calculate margin of error (95% confidence interval)
    const marginOfError = 1.96 * Math.sqrt(adjustment.variance);
    const adjustedConfidence = baseConfidence * adjustment.reliability;
    
    return {
      lower: Math.max(0, Math.round((adjustedConfidence - marginOfError) * 100) / 100),
      upper: Math.min(1, Math.round((adjustedConfidence + marginOfError) * 100) / 100),
      marginOfError: Math.round(marginOfError * 100) / 100,
      reliability: adjustment.reliability
    };
  }

  /**
   * Quantify uncertainty level for extracted claims
   * Returns uncertainty classification and factors
   */
  _quantifyUncertainty(claimText, claimType, extractionMethod) {
    let uncertaintyScore = 0;
    const uncertaintyFactors = [];

    // Text-based uncertainty indicators
    const uncertaintyPatterns = [
      { pattern: /approximately|roughly|about|around/gi, weight: 0.1, description: 'Approximate language' },
      { pattern: /may|might|could|possibly|potentially/gi, weight: 0.15, description: 'Conditional language' },
      { pattern: /estimated|projected|expected/gi, weight: 0.12, description: 'Predictive language' },
      { pattern: /\d+\.\d{3,}/g, weight: 0.08, description: 'Overly precise numbers' },
      { pattern: /unclear|uncertain|unknown/gi, weight: 0.2, description: 'Explicit uncertainty' }
    ];

    for (const indicator of uncertaintyPatterns) {
      const matches = claimText.match(indicator.pattern);
      if (matches) {
        uncertaintyScore += indicator.weight * matches.length;
        uncertaintyFactors.push({
          factor: indicator.description,
          matches: matches.length,
          impact: indicator.weight * matches.length
        });
      }
    }

    // Claim type specific uncertainty
    const typeUncertainty = {
      'statistical': 0.05,
      'market': 0.08,
      'temporal': 0.06,
      'comparative': 0.1,
      'hallucination': 0.3,
      'loanType': 0.07,
      'inventoryMetrics': 0.09
    };

    const typeWeight = typeUncertainty[claimType] || 0.1;
    uncertaintyScore += typeWeight;
    uncertaintyFactors.push({
      factor: `Claim type: ${claimType}`,
      impact: typeWeight
    });

    // Extraction method uncertainty
    const methodUncertainty = {
      'pattern_matching': 0.05,
      'hallucination_detection': 0.02,
      'ai_extraction': 0.12
    };

    const methodWeight = methodUncertainty[extractionMethod] || 0.1;
    uncertaintyScore += methodWeight;
    uncertaintyFactors.push({
      factor: `Extraction method: ${extractionMethod}`,
      impact: methodWeight
    });

    // Classify uncertainty level
    let uncertaintyLevel;
    if (uncertaintyScore <= 0.1) {
      uncertaintyLevel = 'low';
    } else if (uncertaintyScore <= 0.25) {
      uncertaintyLevel = 'medium';
    } else if (uncertaintyScore <= 0.4) {
      uncertaintyLevel = 'high';
    } else {
      uncertaintyLevel = 'critical';
    }

    return {
      level: uncertaintyLevel,
      score: Math.round(uncertaintyScore * 100) / 100,
      factors: uncertaintyFactors,
      recommendation: this._getUncertaintyRecommendation(uncertaintyLevel)
    };
  }

  /**
   * Get recommendation based on uncertainty level
   */
  _getUncertaintyRecommendation(uncertaintyLevel) {
    const recommendations = {
      'low': 'Claim has low uncertainty - proceed with standard validation',
      'medium': 'Moderate uncertainty detected - additional verification recommended',
      'high': 'High uncertainty level - thorough fact-checking required',
      'critical': 'Critical uncertainty - manual review and source verification mandatory'
    };
    
    return recommendations[uncertaintyLevel] || 'Review uncertainty factors and adjust validation approach';
  }

  /**
   * Enhanced claim classification with uncertainty and confidence intervals
   */
  _enhancedClassifyClaims(claims) {
    return claims.map(claim => {
      // Calculate evidence strength based on confidence and uncertainty
      const evidenceStrength = this._calculateEvidenceStrength(claim);
      
      // Determine validation priority based on uncertainty and importance
      const validationPriority = this._determineValidationPriority(claim);
      
      // Add threshold-based actions
      const thresholdAction = this._getThresholdBasedAction(claim);

      return {
        ...claim,
        evidenceStrength,
        validationPriority,
        thresholdAction,
        enhancedMetadata: {
          ...claim.metadata,
          uncertaintyAnalysis: claim.uncertaintyLevel,
          confidenceAnalysis: claim.confidenceInterval,
          recommendedValidationDepth: this._getRecommendedValidationDepth(claim)
        }
      };
    });
  }

  /**
   * Calculate evidence strength for a claim
   */
  _calculateEvidenceStrength(claim) {
    const baseStrength = claim.confidence || 0.5;
    const uncertaintyPenalty = (claim.uncertaintyLevel?.score || 0.1) * 0.5;
    const confidenceBonus = (claim.confidenceInterval?.reliability || 0.8) * 0.2;
    
    const strength = Math.max(0, Math.min(1, baseStrength - uncertaintyPenalty + confidenceBonus));
    
    let classification;
    if (strength >= 0.8) classification = 'strong';
    else if (strength >= 0.6) classification = 'moderate';
    else if (strength >= 0.4) classification = 'weak';
    else classification = 'insufficient';
    
    return {
      score: Math.round(strength * 100) / 100,
      classification,
      factors: {
        baseConfidence: baseStrength,
        uncertaintyPenalty,
        confidenceBonus
      }
    };
  }

  /**
   * Determine validation priority based on claim characteristics
   */
  _determineValidationPriority(claim) {
    let priorityScore = 0;
    
    // Base priority from claim type
    const typePriorities = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.6,
      'low': 0.4
    };
    priorityScore += typePriorities[claim.priority] || 0.5;
    
    // Uncertainty adjustment
    const uncertaintyAdjustments = {
      'critical': 0.3,
      'high': 0.2,
      'medium': 0.1,
      'low': 0.0
    };
    priorityScore += uncertaintyAdjustments[claim.uncertaintyLevel?.level] || 0.1;
    
    // Evidence strength adjustment
    if (claim.evidenceStrength?.classification === 'insufficient') {
      priorityScore += 0.2;
    } else if (claim.evidenceStrength?.classification === 'weak') {
      priorityScore += 0.1;
    }
    
    // Classify final priority
    let finalPriority;
    if (priorityScore >= 0.9) finalPriority = 'critical';
    else if (priorityScore >= 0.7) finalPriority = 'high';
    else if (priorityScore >= 0.5) finalPriority = 'medium';
    else finalPriority = 'low';
    
    return {
      level: finalPriority,
      score: Math.round(priorityScore * 100) / 100,
      reasoning: this._generatePriorityReasoning(claim, priorityScore)
    };
  }

  /**
   * Get threshold-based action for a claim
   */
  _getThresholdBasedAction(claim) {
    const confidence = claim.confidence || 0.5;
    const uncertaintyLevel = claim.uncertaintyLevel?.level || 'medium';
    
    // High confidence thresholds (85-100%)
    if (confidence >= 0.85 && uncertaintyLevel === 'low') {
      return {
        action: 'auto_approve',
        reasoning: 'High confidence with low uncertainty',
        requiresReview: false
      };
    }
    
    // Medium confidence thresholds (60-84%)
    if (confidence >= 0.60 && confidence < 0.85) {
      return {
        action: 'standard_validation',
        reasoning: 'Medium confidence requires standard validation',
        requiresReview: uncertaintyLevel === 'high' || uncertaintyLevel === 'critical'
      };
    }
    
    // Low confidence thresholds (40-59%)
    if (confidence >= 0.40 && confidence < 0.60) {
      return {
        action: 'enhanced_validation',
        reasoning: 'Low confidence requires enhanced validation',
        requiresReview: true
      };
    }
    
    // Very low confidence (below 40%)
    return {
      action: 'manual_review',
      reasoning: 'Very low confidence requires manual review',
      requiresReview: true,
      escalate: true
    };
  }

  /**
   * Get recommended validation depth based on claim characteristics
   */
  _getRecommendedValidationDepth(claim) {
    const confidence = claim.confidence || 0.5;
    const uncertaintyLevel = claim.uncertaintyLevel?.level || 'medium';
    const evidenceStrength = claim.evidenceStrength?.classification || 'moderate';
    
    if (confidence >= 0.85 && uncertaintyLevel === 'low' && evidenceStrength === 'strong') {
      return 'minimal';
    } else if (confidence >= 0.70 && uncertaintyLevel !== 'critical') {
      return 'standard';
    } else if (confidence >= 0.50 || uncertaintyLevel === 'high') {
      return 'thorough';
    } else {
      return 'comprehensive';
    }
  }

  /**
   * Generate priority reasoning explanation
   */
  _generatePriorityReasoning(claim, priorityScore) {
    const reasons = [];
    
    if (claim.priority === 'critical') {
      reasons.push('Critical claim type');
    }
    
    if (claim.uncertaintyLevel?.level === 'critical' || claim.uncertaintyLevel?.level === 'high') {
      reasons.push(`${claim.uncertaintyLevel.level} uncertainty level`);
    }
    
    if (claim.evidenceStrength?.classification === 'insufficient' || claim.evidenceStrength?.classification === 'weak') {
      reasons.push(`${claim.evidenceStrength.classification} evidence strength`);
    }
    
    if (claim.type === 'hallucination') {
      reasons.push('Potential hallucination detected');
    }
    
    return reasons.length > 0 ? reasons.join('; ') : 'Standard priority assessment';
  }

  /**
   * Get extractor status with enhanced capabilities
   */
  getStatus() {
    return {
      service: 'Claim Extractor',
      capabilities: {
        patternMatching: true,
        aiExtraction: true,
        hallucinationDetection: true,
        claimDeduplication: true,
        confidenceIntervals: true,
        uncertaintyQuantification: true,
        evidenceStrengthAssessment: true,
        thresholdBasedActions: true
      },
      configuration: {
        claimTypes: Object.keys(this.claimTypes),
        hallucinationIndicators: this.hallucinationIndicators.length,
        aiEnabled: !!this.bedrockService,
        confidenceThresholds: {
          high: '85-100%',
          medium: '60-84%',
          low: '40-59%',
          critical: 'below 40%'
        }
      }
    };
  }
}

module.exports = ClaimExtractor;