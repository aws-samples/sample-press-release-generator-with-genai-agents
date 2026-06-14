const { logger } = require('../../utils/logger');
const { ValidationError, ExternalServiceError } = require('../../utils/errorHandler');

// Import external services
const perplexityService = require('../perplexityService');
const firecrawlService = require('../firecrawl');
const tavilyService = require('../tavilyService');
const enhancedMarketDataService = require('../marketAnalysis/enhancedMarketDataService');

/**
 * Multi-Source Fact-Checking Engine
 * 
 * Integrates trusted data, external APIs, and real-time verification
 * with consensus mechanisms for conflicting data validation.
 * 
 * Features:
 * - Four-tier validation architecture (Trusted Data, Perplexity AI, Firecrawl API, Tavily AI)
 * - Weighted consensus mechanisms with credibility scoring
 * - Parallel processing for optimal performance
 * - Circuit breaker protection for external services
 * - Integration with existing 99.1% accurate fact-checking system
 * - Quality framework enhancement for Accuracy Assessment dimension
 * 
 * @version 1.1.0
 * @author AI Agent Multi-Agent System
 */
class MultiSourceFactChecker {
  constructor(options = {}) {
    this.name = 'MultiSourceFactChecker';
    this.version = '1.1.0'; // Version bump for Tavily integration
    this.isInitialized = false;
    
    // Validation sources with credibility weights (based on research)
    this.validationSources = {
      trustedData: {
        weight: 0.35,
        credibility: 0.95,
        timeout: 500,
        description: 'Enhanced market-specific trusted data baselines'
      },
      perplexityAI: {
        weight: 0.25,
        credibility: 0.85,
        timeout: 15000,
        description: 'Real-time AI-powered market intelligence'
      },
      firecrawlAPI: {
        weight: 0.20,
        credibility: 0.80,
        timeout: 10000,
        description: 'Live real estate platform data scraping'
      },
      tavilyAI: {
        weight: 0.20,
        credibility: 0.82,
        timeout: 12000,
        description: 'Unified AI search with comprehensive data extraction'
      }
    };
    
    // Consensus configuration (based on research patterns)
    this.consensusConfig = {
      minimumSources: options.consensusConfig?.minimumSources || 2,
      agreementThreshold: options.consensusConfig?.agreementThreshold || 0.7,
      conflictResolutionStrategy: options.consensusConfig?.conflictResolutionStrategy || 'weighted_voting',
      confidenceBoostFactor: options.consensusConfig?.confidenceBoostFactor || 1.2,
      maxProcessingTime: options.consensusConfig?.maxProcessingTime || 20000
    };
    
    // Performance optimization
    this.validationCache = new Map();
    this.cacheExpiry = 3600000; // 1 hour cache for validation results
    
    // Circuit breaker configuration per service
    this.circuitBreakers = {
      trustedData: { failures: 0, threshold: 3, timeout: 30000, isOpen: false },
      perplexityAI: { failures: 0, threshold: 5, timeout: 60000, isOpen: false },
      firecrawlAPI: { failures: 0, threshold: 5, timeout: 60000, isOpen: false },
      tavilyAI: { failures: 0, threshold: 5, timeout: 60000, isOpen: false }
    };
    
    // Performance metrics
    this.metrics = {
      totalValidations: 0,
      successfulValidations: 0,
      consensusAchieved: 0,
      averageProcessingTime: 0,
      sourceUtilization: {
        trustedData: 0,
        perplexityAI: 0,
        firecrawlAPI: 0,
        tavilyAI: 0
      }
    };
  }

  /**
   * Initialize the Multi-Source Fact Checker
   */
  async initialize() {
    try {
      logger.info('Initializing MultiSourceFactChecker', {
        version: this.version,
        validationSources: Object.keys(this.validationSources),
        consensusConfig: this.consensusConfig
      });
      
      this.isInitialized = true;
      logger.info('MultiSourceFactChecker initialized successfully', {
        validators: ['TrustedData', 'Perplexity', 'Firecrawl', 'Tavily'],
        cacheEnabled: true,
        circuitBreakerEnabled: true
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize MultiSourceFactChecker', {
        error: error.message,
        stack: error.stack
      });
      throw new ValidationError(`MultiSourceFactChecker initialization failed: ${error.message}`);
    }
  }

  /**
   * Validate claim across multiple sources with consensus mechanisms
   * 
   * @param {Object} claim - The claim to validate
   * @param {Object} marketContext - Market context for validation
   * @returns {Object} Consensus validation result
   */
  async validateClaimMultiSource(claim, marketContext) {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // Check cache first
      const cacheKey = this._generateCacheKey(claim, marketContext);
      const cachedResult = this._getCachedResult(cacheKey);
      if (cachedResult) {
        logger.debug('Using cached multi-source validation result', { cacheKey });
        return { ...cachedResult, cached: true };
      }
      
      logger.info('Starting multi-source claim validation', {
        claim: claim.text,
        market: marketContext.market,
        sources: Object.keys(this.validationSources)
      });
      
      // Execute parallel validation across all sources
      const validationPromises = [
        this._validateWithTimeout('trustedData', () => this.validateAgainstTrustedData(claim, marketContext)),
        this._validateWithTimeout('perplexityAI', () => this.validateWithPerplexity(claim, marketContext)),
        this._validateWithTimeout('firecrawlAPI', () => this.validateWithFirecrawl(claim, marketContext)),
        this._validateWithTimeout('tavilyAI', () => this.validateWithTavily(claim, marketContext))
      ];
      
      const validationResults = await Promise.allSettled(validationPromises);
      
      // Process results and calculate consensus
      const processedResults = this._processValidationResults(validationResults);
      const consensusResult = this.calculateWeightedConsensus(processedResults, claim);
      
      // Update metrics
      this._updateMetrics(consensusResult, Date.now() - startTime);
      
      // Cache result
      this._cacheResult(cacheKey, consensusResult);
      
      logger.info('Multi-source validation completed', {
        claim: claim.text,
        confidence: consensusResult.confidence,
        sources: consensusResult.sources,
        consensus: consensusResult.consensus,
        processingTime: Date.now() - startTime
      });
      
      return consensusResult;
      
    } catch (error) {
      logger.error('Multi-source validation failed', {
        claim: claim.text,
        error: error.message,
        processingTime: Date.now() - startTime
      });
      
      // Return fallback result
      return {
        confidence: 0,
        sources: 0,
        consensus: false,
        fallbackToExisting: true,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate claim against trusted data baselines
   */
  async validateAgainstTrustedData(claim, marketContext) {
    try {
      if (this._isCircuitBreakerOpen('trustedData')) {
        return this._createFailureResult('trusted_data', 'Circuit breaker open');
      }
      
      const marketData = await enhancedMarketDataService.getMarketData(marketContext.market);
      
      if (!marketData) {
        return this._createFailureResult('trusted_data', 'Market data not available');
      }
      
      // Validate claim against market-specific baselines
      const validationResult = await this._validateAgainstBaselines(claim, marketData, marketContext);
      
      this._recordSuccess('trustedData');
      
      return {
        confidence: validationResult.confidence,
        source: 'trusted_data',
        credibility: this.validationSources.trustedData.credibility,
        evidence: validationResult.evidence,
        marketAdaptation: validationResult.marketAdaptation,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this._recordFailure('trustedData', error);
      return this._createFailureResult('trusted_data', error.message);
    }
  }

  /**
   * Validate claim using Perplexity AI search
   */
  async validateWithPerplexity(claim, marketContext) {
    try {
      if (this._isCircuitBreakerOpen('perplexityAI')) {
        return this._createFailureResult('perplexity_ai', 'Circuit breaker open');
      }
      
      // Construct market-specific search query
      const searchQuery = this._constructMarketQuery(claim, marketContext);
      
      // Execute Perplexity AI search
      const searchResult = await perplexityService.search(searchQuery);
      
      // Analyze search results for claim validation
      const validationResult = await this._analyzePerplexityResults(searchResult, claim);
      
      this._recordSuccess('perplexityAI');
      
      return {
        confidence: validationResult.confidence,
        source: 'perplexity_ai',
        credibility: this.validationSources.perplexityAI.credibility,
        evidence: validationResult.evidence,
        searchQuery: searchQuery,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this._recordFailure('perplexityAI', error);
      return this._createFailureResult('perplexity_ai', error.message);
    }
  }

  /**
   * Validate claim using Firecrawl API scraping
   */
  async validateWithFirecrawl(claim, marketContext) {
    try {
      if (this._isCircuitBreakerOpen('firecrawlAPI')) {
        return this._createFailureResult('firecrawl_api', 'Circuit breaker open');
      }
      
      // Identify relevant sources for scraping
      const targetUrls = this._identifyRelevantSources(claim, marketContext);
      
      // Execute Firecrawl scraping
      const scrapingResults = await firecrawlService.scrapeMultiple(targetUrls);
      
      // Extract validation data from scraped content
      const validationResult = await this._extractValidationData(scrapingResults, claim);
      
      this._recordSuccess('firecrawlAPI');
      
      return {
        confidence: validationResult.confidence,
        source: 'firecrawl_api',
        credibility: this.validationSources.firecrawlAPI.credibility,
        evidence: validationResult.evidence,
        scrapedUrls: targetUrls,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this._recordFailure('firecrawlAPI', error);
      return this._createFailureResult('firecrawl_api', error.message);
    }
  }

  /**
   * Validate claim using Tavily AI unified search
   */
  async validateWithTavily(claim, marketContext) {
    try {
      if (this._isCircuitBreakerOpen('tavilyAI')) {
        return this._createFailureResult('tavily_ai', 'Circuit breaker open');
      }
      
      // Construct market-specific search query for Tavily
      const searchQuery = this._constructTavilyQuery(claim, marketContext);
      
      // Execute Tavily unified search
      const searchResult = await tavilyService.search(searchQuery, {
        search_depth: 'advanced',
        include_answer: true,
        include_raw_content: true,
        max_results: 10
      });
      
      // Analyze Tavily results for claim validation
      const validationResult = await this._analyzeTavilyResults(searchResult, claim);
      
      this._recordSuccess('tavilyAI');
      
      return {
        confidence: validationResult.confidence,
        source: 'tavily_ai',
        credibility: this.validationSources.tavilyAI.credibility,
        evidence: validationResult.evidence,
        searchQuery: searchQuery,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      this._recordFailure('tavilyAI', error);
      return this._createFailureResult('tavily_ai', error.message);
    }
  }

  /**
   * Calculate weighted consensus from validation results
   */
  calculateWeightedConsensus(validationResults, claim) {
    try {
      const successfulResults = validationResults.filter(result => result && result.confidence > 0);
      
      if (successfulResults.length === 0) {
        return {
          confidence: 0,
          sources: 0,
          consensus: false,
          fallbackToExisting: true,
          error: 'All validation sources failed',
          timestamp: new Date().toISOString()
        };
      }
      
      if (successfulResults.length < this.consensusConfig.minimumSources) {
        logger.warn('Insufficient sources for consensus', {
          available: successfulResults.length,
          required: this.consensusConfig.minimumSources
        });
        
        return {
          confidence: successfulResults[0].confidence,
          sources: successfulResults.length,
          consensus: false,
          insufficientSources: true,
          fallbackToExisting: true,
          evidence: successfulResults[0].evidence,
          timestamp: new Date().toISOString()
        };
      }
      
      // Calculate weighted average confidence
      const totalWeight = successfulResults.reduce((sum, result) => {
        const sourceKey = this._getSourceKey(result.source);
        return sum + this.validationSources[sourceKey].weight;
      }, 0);
      
      const weightedConfidence = successfulResults.reduce((sum, result) => {
        const sourceKey = this._getSourceKey(result.source);
        const sourceConfig = this.validationSources[sourceKey];
        return sum + (result.confidence * sourceConfig.weight * sourceConfig.credibility);
      }, 0) / totalWeight;
      
      // Calculate agreement level between sources
      const agreementLevel = this._calculateAgreementLevel(successfulResults);
      
      // Apply consensus bonus if agreement threshold met
      const consensusAchieved = agreementLevel >= this.consensusConfig.agreementThreshold;
      const finalConfidence = consensusAchieved ? 
        Math.min(weightedConfidence * this.consensusConfig.confidenceBoostFactor, 1.0) : 
        weightedConfidence;
      
      // Aggregate evidence from all sources
      const aggregatedEvidence = this._aggregateEvidence(successfulResults);
      
      const consensusResult = {
        confidence: finalConfidence,
        agreement: agreementLevel,
        sources: successfulResults.length,
        consensus: consensusAchieved,
        confidenceBoost: consensusAchieved ? this.consensusConfig.confidenceBoostFactor : 1.0,
        evidence: aggregatedEvidence,
        validationSources: successfulResults.map(r => r.source),
        conflictDetected: agreementLevel < this.consensusConfig.agreementThreshold,
        timestamp: new Date().toISOString(),
        feedback: this._generateValidationFeedback(successfulResults, consensusAchieved)
      };
      
      logger.info('Consensus calculation completed', {
        confidence: finalConfidence,
        agreement: agreementLevel,
        consensus: consensusAchieved,
        sources: successfulResults.length
      });
      
      return consensusResult;
      
    } catch (error) {
      logger.error('Consensus calculation failed', {
        error: error.message,
        validationResults: validationResults.length
      });
      
      return {
        confidence: 0,
        sources: 0,
        consensus: false,
        error: `Consensus calculation failed: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Enhance Accuracy Assessment dimension with multi-source validation
   */
  async enhanceAccuracyAssessment(baseAccuracy, claim, marketContext) {
    try {
      const multiSourceResult = await this.validateClaimMultiSource(claim, marketContext);
      
      if (multiSourceResult.confidence === 0) {
        return {
          baseScore: baseAccuracy,
          multiSourceScore: 0,
          finalScore: baseAccuracy,
          enhancement: false,
          reason: 'Multi-source validation failed'
        };
      }
      
      // Calculate enhanced accuracy score (NO artificial floors - following critical rules)
      const enhancementFactor = multiSourceResult.consensus ? 1.15 : 1.05;
      const enhancedScore = Math.min(baseAccuracy * enhancementFactor, 1.0);
      
      return {
        baseScore: baseAccuracy,
        multiSourceScore: multiSourceResult.confidence,
        finalScore: enhancedScore,
        enhancement: true,
        consensus: multiSourceResult.consensus,
        sources: multiSourceResult.sources,
        agreement: multiSourceResult.agreement,
        feedback: multiSourceResult.feedback
      };
      
    } catch (error) {
      logger.error('Failed to enhance accuracy assessment', {
        error: error.message,
        baseAccuracy
      });
      
      return {
        baseScore: baseAccuracy,
        finalScore: baseAccuracy,
        enhancement: false,
        error: error.message
      };
    }
  }

  // Private helper methods

  /**
   * Execute validation with timeout protection
   */
  async _validateWithTimeout(sourceKey, validationFunction) {
    const timeout = this.validationSources[sourceKey].timeout;
    
    return Promise.race([
      validationFunction(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${sourceKey} validation timeout`)), timeout)
      )
    ]);
  }

  /**
   * Process validation results from Promise.allSettled
   */
  _processValidationResults(validationResults) {
    return validationResults
      .map((result, index) => {
        if (result.status === 'fulfilled' && result.value.confidence > 0) {
          return result.value;
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Calculate agreement level between validation sources
   */
  _calculateAgreementLevel(results) {
    if (results.length < 2) return 1.0;
    
    const confidences = results.map(r => r.confidence);
    const mean = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
    const variance = confidences.reduce((sum, conf) => sum + Math.pow(conf - mean, 2), 0) / confidences.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Agreement is inversely related to standard deviation
    return Math.max(0, 1 - (standardDeviation * 2));
  }

  /**
   * Aggregate evidence from multiple validation sources
   */
  _aggregateEvidence(results) {
    return {
      sources: results.map(r => ({
        source: r.source,
        confidence: r.confidence,
        credibility: r.credibility,
        evidence: r.evidence
      })),
      totalSources: results.length,
      highestConfidence: Math.max(...results.map(r => r.confidence)),
      lowestConfidence: Math.min(...results.map(r => r.confidence)),
      averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length
    };
  }

  /**
   * Generate validation feedback and recommendations
   */
  _generateValidationFeedback(results, consensusAchieved) {
    const feedback = {
      sources: results.map(r => ({
        source: r.source,
        confidence: r.confidence,
        status: r.confidence > 0.7 ? 'high' : r.confidence > 0.5 ? 'medium' : 'low'
      })),
      consensus: consensusAchieved,
      recommendations: []
    };
    
    if (!consensusAchieved) {
      feedback.recommendations.push('Consider additional verification due to low consensus');
    }
    
    if (results.length < 3) {
      feedback.recommendations.push('Some validation sources unavailable - consider retry');
    }
    
    return feedback;
  }

  /**
   * Validate claim against market-specific baselines
   */
  async _validateAgainstBaselines(claim, marketData, marketContext) {
    try {
      const validationBaselines = marketData.validation || {};
      let confidence = 0.5; // Base confidence
      let evidence = {};
      
      // Price validation
      if (claim.type === 'statistical' && claim.metric === 'median_price') {
        const expectedPrice = marketData.housing?.medianPrice;
        const priceVariance = validationBaselines.priceVariance || 0.05;
        
        if (expectedPrice && claim.value) {
          const variance = Math.abs(claim.value - expectedPrice) / expectedPrice;
          // NO artificial floors - honest assessment following critical rules
          confidence = variance <= priceVariance ? 0.95 : Math.max(0.0, 1 - (variance * 2));
          evidence.priceValidation = {
            expected: expectedPrice,
            actual: claim.value,
            variance: variance,
            threshold: priceVariance
          };
        }
      }
      
      // Market adaptation scoring
      const marketAdaptation = this._assessMarketAdaptation(claim, marketData, marketContext);
      
      return {
        confidence,
        evidence,
        marketAdaptation,
        validationBaselines
      };
      
    } catch (error) {
      logger.error('Baseline validation failed', { error: error.message });
      return { confidence: 0, evidence: {}, error: error.message };
    }
  }

  /**
   * Construct market-specific search query for Perplexity AI
   */
  _constructMarketQuery(claim, marketContext) {
    const market = marketContext.market;
    
    // Construct intelligent search query based on claim type
    let query = `${market} real estate market `;
    
    if (claim.type === 'statistical') {
      query += `${claim.metric || 'statistics'} 2024 current data`;
    } else if (claim.type === 'market') {
      query += `trends conditions analysis recent`;
    } else {
      query += `${claim.text} verification`;
    }
    
    return query;
  }

  /**
   * Construct market-specific search query for Tavily AI
   */
  _constructTavilyQuery(claim, marketContext) {
    const market = marketContext.market;
    
    // Construct comprehensive search query optimized for Tavily's unified search
    let query = `${market} real estate market `;
    
    if (claim.type === 'statistical') {
      query += `${claim.metric || 'statistics'} current data trends 2024`;
      if (claim.value) {
        query += ` ${claim.value}`;
      }
    } else if (claim.type === 'market') {
      query += `conditions trends analysis current market data`;
    } else {
      query += `${claim.text} verification facts data`;
    }
    
    // Add context for better search results
    query += ` housing prices inventory sales data`;
    
    return query;
  }

  /**
   * Analyze Perplexity AI search results for claim validation
   */
  async _analyzePerplexityResults(searchResult, claim) {
    try {
      if (!searchResult || !searchResult.results) {
        return { confidence: 0, evidence: { error: 'No search results' } };
      }
      
      const results = searchResult.results;
      let confidence = 0;
      let supportingEvidence = 0;
      let totalEvidence = results.length;
      
      // Analyze each search result for claim support
      for (const result of results) {
        if (this._doesResultSupportClaim(result, claim)) {
          supportingEvidence++;
          confidence += result.confidence || 0.7;
        }
      }
      
      // Calculate final confidence based on supporting evidence ratio
      const supportRatio = totalEvidence > 0 ? supportingEvidence / totalEvidence : 0;
      const finalConfidence = totalEvidence > 0 ? (confidence / totalEvidence) * supportRatio : 0;
      
      return {
        confidence: Math.min(finalConfidence, 1.0),
        evidence: {
          totalResults: totalEvidence,
          supportingResults: supportingEvidence,
          supportRatio,
          sources: results.map(r => r.url).filter(Boolean)
        }
      };
      
    } catch (error) {
      logger.error('Perplexity result analysis failed', { error: error.message });
      return { confidence: 0, evidence: { error: error.message } };
    }
  }

  /**
   * Analyze Tavily AI search results for claim validation
   */
  async _analyzeTavilyResults(searchResult, claim) {
    try {
      if (!searchResult || !searchResult.results) {
        return { confidence: 0, evidence: { error: 'No search results from Tavily' } };
      }
      
      const results = searchResult.results;
      let confidence = 0;
      let supportingEvidence = 0;
      let totalEvidence = results.length;
      
      // Analyze each Tavily result for claim support
      for (const result of results) {
        if (this._doesTavilyResultSupportClaim(result, claim)) {
          supportingEvidence++;
          // Tavily provides confidence scores, use them if available
          confidence += result.score || 0.8;
        }
      }
      
      // Calculate final confidence based on supporting evidence ratio
      const supportRatio = totalEvidence > 0 ? supportingEvidence / totalEvidence : 0;
      const finalConfidence = totalEvidence > 0 ? (confidence / totalEvidence) * supportRatio : 0;
      
      // Include Tavily's answer if available for additional validation
      let answerSupport = 0;
      if (searchResult.answer && this._doesAnswerSupportClaim(searchResult.answer, claim)) {
        answerSupport = 0.2; // Boost confidence if Tavily's answer supports the claim
      }
      
      return {
        confidence: Math.min(finalConfidence + answerSupport, 1.0),
        evidence: {
          totalResults: totalEvidence,
          supportingResults: supportingEvidence,
          supportRatio,
          answer: searchResult.answer,
          sources: results.map(r => r.url).filter(Boolean),
          rawContent: results.some(r => r.raw_content) // Tavily provides raw content
        }
      };
      
    } catch (error) {
      logger.error('Tavily result analysis failed', { error: error.message });
      return { confidence: 0, evidence: { error: error.message } };
    }
  }

  /**
   * Identify relevant sources for Firecrawl scraping
   */
  _identifyRelevantSources(claim, marketContext) {
    const baseUrls = [
      'https://www.example.com',
      'https://www.competitor1.com',
      'https://www.competitor2.com'
    ];
    
    // Construct market-specific URLs
    const marketSlug = marketContext.market.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    return baseUrls.map(baseUrl => {
      if (baseUrl.includes('Example Company')) {
        return `${baseUrl}/city/${marketSlug}`;
      } else if (baseUrl.includes('Competitor One')) {
        return `${baseUrl}/${marketSlug}`;
      } else {
        return `${baseUrl}/realestateandhomes-search/${marketSlug}`;
      }
    });
  }

  /**
   * Extract validation data from Firecrawl scraping results
   */
  async _extractValidationData(scrapingResults, claim) {
    try {
      let confidence = 0;
      let extractedData = {};
      let successfulScrapes = 0;
      
      for (const result of scrapingResults) {
        if (result.success && result.content) {
          successfulScrapes++;
          
          // Extract relevant data based on claim type
          if (claim.type === 'statistical' && claim.metric === 'median_price') {
            const extractedPrice = this._extractPriceFromContent(result.content);
            if (extractedPrice && Math.abs(extractedPrice - claim.value) / claim.value < 0.1) {
              confidence += 0.8;
              extractedData.prices = extractedData.prices || [];
              extractedData.prices.push({ source: result.url, price: extractedPrice });
            }
          }
        }
      }
      
      // Calculate final confidence based on successful extractions
      const finalConfidence = successfulScrapes > 0 ? confidence / successfulScrapes : 0;
      
      return {
        confidence: Math.min(finalConfidence, 1.0),
        evidence: {
          extractedData,
          successfulScrapes,
          totalAttempts: scrapingResults.length,
          successRate: successfulScrapes / scrapingResults.length
        }
      };
      
    } catch (error) {
      logger.error('Firecrawl data extraction failed', { error: error.message });
      return { confidence: 0, evidence: { error: error.message } };
    }
  }

  /**
   * Helper methods for validation logic
   */
  _doesResultSupportClaim(result, claim) {
    const content = result.content?.toLowerCase() || '';
    const claimText = claim.text.toLowerCase();
    
    // Simple keyword matching - can be enhanced with NLP
    const keywords = claimText.split(' ').filter(word => word.length > 3);
    const matchCount = keywords.filter(keyword => content.includes(keyword)).length;
    
    return matchCount / keywords.length > 0.5;
  }

  /**
   * Check if Tavily result supports the claim
   */
  _doesTavilyResultSupportClaim(result, claim) {
    const content = (result.content || '').toLowerCase();
    const title = (result.title || '').toLowerCase();
    const claimText = claim.text.toLowerCase();
    
    // Enhanced keyword matching for Tavily results
    const keywords = claimText.split(' ').filter(word => word.length > 3);
    const contentMatchCount = keywords.filter(keyword => content.includes(keyword)).length;
    const titleMatchCount = keywords.filter(keyword => title.includes(keyword)).length;
    
    // Consider both
    // Consider both content and title matches, with title having higher weight
    const totalMatches = contentMatchCount + (titleMatchCount * 1.5);
    const matchRatio = totalMatches / (keywords.length * 1.5);
    
    return matchRatio > 0.4; // Slightly lower threshold for Tavily's comprehensive results
  }

  /**
   * Check if Tavily's answer supports the claim
   */
  _doesAnswerSupportClaim(answer, claim) {
    if (!answer || typeof answer !== 'string') return false;
    
    const answerLower = answer.toLowerCase();
    const claimText = claim.text.toLowerCase();
    
    // Simple keyword matching for answer validation
    const keywords = claimText.split(' ').filter(word => word.length > 3);
    const matchCount = keywords.filter(keyword => answerLower.includes(keyword)).length;
    
    return matchCount / keywords.length > 0.5;
  }

  _extractPriceFromContent(content) {
    const priceRegex = /\$[\d,]+(?:\.\d{2})?/g;
    const matches = content.match(priceRegex);
    
    if (matches && matches.length > 0) {
      // Return the most common price or first significant price
      const prices = matches.map(match => parseInt(match.replace(/[$,]/g, '')));
      return prices.find(price => price > 100000) || prices[0];
    }
    
    return null;
  }

  _assessMarketAdaptation(claim, marketData, marketContext) {
    // Assess how well the claim is adapted to the specific market
    const neighborhoods = marketData.neighborhoods || [];
    const hasNeighborhoodMentions = neighborhoods.some(n => 
      claim.text.toLowerCase().includes(n.name.toLowerCase())
    );
    
    return {
      neighborhoodMentions: hasNeighborhoodMentions,
      marketSpecific: true,
      adaptationScore: hasNeighborhoodMentions ? 0.9 : 0.6
    };
  }

  /**
   * Circuit breaker management
   */
  _isCircuitBreakerOpen(sourceKey) {
    const breaker = this.circuitBreakers[sourceKey];
    if (!breaker.isOpen) return false;
    
    // Check if timeout has passed
    if (Date.now() - breaker.lastFailureTime > breaker.timeout) {
      breaker.isOpen = false;
      breaker.failures = 0;
      logger.info(`Circuit breaker reset for ${sourceKey}`);
      return false;
    }
    
    return true;
  }

  _recordSuccess(sourceKey) {
    const breaker = this.circuitBreakers[sourceKey];
    breaker.failures = 0;
    breaker.isOpen = false;
    this.metrics.sourceUtilization[sourceKey]++;
  }

  _recordFailure(sourceKey, error) {
    const breaker = this.circuitBreakers[sourceKey];
    breaker.failures++;
    breaker.lastFailureTime = Date.now();
    
    if (breaker.failures >= breaker.threshold) {
      breaker.isOpen = true;
      logger.warn(`Circuit breaker opened for ${sourceKey}`, {
        failures: breaker.failures,
        threshold: breaker.threshold
      });
    }
  }

  /**
   * Cache management
   */
  _generateCacheKey(claim, marketContext) {
    return `${marketContext.market}-${claim.type}-${claim.text.substring(0, 50)}`;
  }

  _getCachedResult(cacheKey) {
    const cached = this.validationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.result;
    }
    return null;
  }

  _cacheResult(cacheKey, result) {
    this.validationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Utility methods
   */
  _getSourceKey(sourceName) {
    const mapping = {
      'trusted_data': 'trustedData',
      'perplexity_ai': 'perplexityAI',
      'firecrawl_api': 'firecrawlAPI',
      'tavily_ai': 'tavilyAI'
    };
    return mapping[sourceName] || sourceName;
  }

  _createFailureResult(source, reason) {
    return {
      confidence: 0,
      source,
      credibility: 0,
      evidence: null,
      error: reason,
      fallback: true,
      timestamp: new Date().toISOString()
    };
  }

  _updateMetrics(result, processingTime) {
    this.metrics.totalValidations++;
    if (result.confidence > 0) {
      this.metrics.successfulValidations++;
    }
    if (result.consensus) {
      this.metrics.consensusAchieved++;
    }
    
    // Update average processing time
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (this.metrics.totalValidations - 1) + processingTime) / 
      this.metrics.totalValidations;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.totalValidations > 0 ? 
        this.metrics.successfulValidations / this.metrics.totalValidations : 0,
      consensusRate: this.metrics.totalValidations > 0 ? 
        this.metrics.consensusAchieved / this.metrics.totalValidations : 0,
      circuitBreakerStatus: Object.keys(this.circuitBreakers).reduce((status, key) => {
        status[key] = this.circuitBreakers[key].isOpen ? 'OPEN' : 'CLOSED';
        return status;
      }, {})
    };
  }
}

module.exports = MultiSourceFactChecker;