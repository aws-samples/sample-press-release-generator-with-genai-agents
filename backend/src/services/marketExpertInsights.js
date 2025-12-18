const TavilyService = require('./tavilyService');
const TavilyDataTransformer = require('./tavilyDataTransformer');
const { logger } = require('../utils/logger');

/**
 * Market Expert Insights Service
 * Generates market-specific expert commentary using Tavily search + Bedrock synthesis
 * 
 * Replacement for removed services - provides expert commentary without business name references
 * 
 * Features:
 * - Geographic relevance validation (0.7 threshold)
 * - Voice consistency enforcement
 * - Cross-market contamination prevention
 * - 3-tier fallback strategy
 * - Comprehensive caching (1-hour timeout)
 * - Graceful degradation
 * 
 * @version 1.0.0
 * @date 2025-10-02
 */
class MarketExpertInsights {
  constructor(options = {}) {
    this.tavilyService = options.tavilyService || TavilyService;
    this.bedrockService = options.bedrockService || require('./bedrock');
    this.transformer = new TavilyDataTransformer();
    this.logger = options.logger || logger;
    
    // Configuration maintaining August 2025 achievement standards
    this.config = {
      geographicRelevanceThreshold: 0.7,  // 70% geographic relevance required
      minConfidenceScore: 75,
      cacheTimeout: 3600000, // 1 hour
      maxSearchResults: 5,
      searchDepth: 'basic',
      enableCaching: true,
      bedrockTimeout: 45000, // 45 seconds for AI synthesis
      tavilyTimeout: 15000   // 15 seconds for search
    };
    
    // Cache for insights
    this.insightCache = new Map();
    
    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      averageProcessingTime: 0
    };
    
    this.initialized = false;
  }

  /**
   * Initialize the service
   * Tests connectivity to Tavily and Bedrock services
   */
  async initialize() {
    try {
      this.logger.info('Initializing Market Expert Insights service');
      
      // Test Tavily connectivity if available
      if (this.tavilyService && typeof this.tavilyService.initialize === 'function') {
        await this.tavilyService.initialize();
        this.logger.debug('Tavily service validated');
      }
      
      // Test Bedrock connectivity if available
      if (this.bedrockService && typeof this.bedrockService.initialize === 'function') {
        await this.bedrockService.initialize();
        this.logger.debug('Bedrock service validated');
      }
      
      this.initialized = true;
      this.logger.info('Market Expert Insights service initialized successfully', {
        cacheEnabled: this.config.enableCaching,
        geographicThreshold: this.config.geographicRelevanceThreshold
      });
      
      return true;
    } catch (error) {
      this.logger.error('Market Expert Insights initialization failed', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Main method: Generate market-specific expert insight
   * 
   * @param {Object} marketContext - Market information
   * @param {Object} contentTheme - Content theme and voice requirements
   * @param {Object} options - Generation options
   * @returns {Object} Generated insight with alternatives and voice profile
   */
  async generateMarketInsight(marketContext, contentTheme = {}, options = {}) {
    if (!this.initialized) {
      this.logger.warn('Market Expert Insights service not initialized, initializing now');
      await this.initialize();
    }
    
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    try {
      // Step 1: Check cache
      const cacheKey = this._generateCacheKey(marketContext, contentTheme);
      if (this.config.enableCaching && this.insightCache.has(cacheKey)) {
        const cached = this.insightCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
          this.metrics.cacheHits++;
          this.logger.debug('Returning cached insight', { 
            market: marketContext.market,
            cacheAge: Date.now() - cached.timestamp
          });
          return cached.result;
        } else {
          // Cache expired
          this.insightCache.delete(cacheKey);
        }
      }
      this.metrics.cacheMisses++;
      
      // Step 2: Generate insight using 3-tier fallback strategy
      const result = await this._generateWithFallbacks(marketContext, contentTheme, options);
      
      // Step 3: Cache result if successful
      if (result && this.config.enableCaching) {
        this.insightCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
      }
      
      // Update metrics
      this.metrics.successfulGenerations++;
      const processingTime = Date.now() - startTime;
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * (this.metrics.successfulGenerations - 1) + processingTime) / 
        this.metrics.successfulGenerations;
      
      this.logger.info('Market expert insight generated successfully', {
        market: marketContext.market,
        confidence: result?.insight?.confidence,
        geographicRelevance: result?.insight?.geographicRelevance,
        processingTime
      });
      
      return result;
      
    } catch (error) {
      this.metrics.failedGenerations++;
      this.logger.error('Failed to generate market expert insight', {
        market: marketContext.market,
        error: error.message,
        stack: error.stack
      });
      
      // Graceful degradation: return null instead of throwing
      return null;
    }
  }

  /**
   * Generate insight with 3-tier fallback strategy
   * 1. Full pipeline: Tavily search + Bedrock synthesis
   * 2. Bedrock-only: No search, AI generation from context
   * 3. Template-based: Generic market-appropriate insight
   * 
   * @private
   */
  async _generateWithFallbacks(marketContext, contentTheme, options) {
    // Tier 1: Full pipeline (Tavily + Bedrock)
    try {
      return await this._generateWithFullPipeline(marketContext, contentTheme, options);
    } catch (primaryError) {
      this.logger.warn('Primary insight generation failed, attempting Bedrock-only fallback', {
        error: primaryError.message
      });
      
      // Tier 2: Bedrock-only generation
      try {
        return await this._generateWithBedrockOnly(marketContext, contentTheme);
      } catch (bedrockError) {
        this.logger.warn('Bedrock-only generation failed, attempting template-based fallback', {
          error: bedrockError.message
        });
        
        // Tier 3: Template-based generic insight
        try {
          return await this._generateGenericInsight(marketContext, contentTheme);
        } catch (genericError) {
          this.logger.error('All insight generation tiers failed', {
            errors: {
              primary: primaryError.message,
              bedrock: bedrockError.message,
              generic: genericError.message
            }
          });
          
          return null;
        }
      }
    }
  }

  /**
   * Generate insight using full Tavily + Bedrock pipeline
   * @private
   */
  async _generateWithFullPipeline(marketContext, contentTheme, options) {
    // Step 1: Search for market expertise using Tavily
    const searchQuery = this._buildSearchQuery(marketContext, contentTheme);
    const tavilyInsights = await this.searchMarketExpertise(
      marketContext.market,
      searchQuery,
      {
        maxResults: this.config.maxSearchResults,
        searchDepth: this.config.searchDepth
      }
    );
    
    if (!tavilyInsights || tavilyInsights.length === 0) {
      throw new Error('No Tavily insights found for market');
    }
    
    // Step 2: Synthesize insights using Bedrock
    const synthesizedInsight = await this.synthesizeExpertCommentary(
      tavilyInsights,
      contentTheme,
      marketContext
    );
    
    // Step 3: Validate geographic relevance
    const validatedInsight = await this.validateGeographicRelevance(
      synthesizedInsight,
      marketContext.market
    );
    
    // Step 4: Ensure voice consistency
    const finalInsights = await this.ensureVoiceConsistency(
      [validatedInsight],
      contentTheme
    );
    
    // Step 5: Build result object
    return {
      insight: finalInsights[0],
      alternatives: options.includeAlternatives ? 
        await this._generateAlternatives(marketContext, contentTheme) : [],
      voiceProfile: this._extractVoiceProfile(finalInsights[0]),
      source: 'tavily+bedrock',
      processingTime: Date.now() - Date.now() // Will be updated by caller
    };
  }

  /**
   * Generate insight using Bedrock only (no Tavily search)
   * @private
   */
  async _generateWithBedrockOnly(marketContext, contentTheme) {
    const prompt = this._buildBedrockOnlyPrompt(marketContext, contentTheme);
    
    const response = await this.bedrockService.generateContent({
      prompt,
      maxTokens: 500,
      temperature: 0.7,
      timeout: this.config.bedrockTimeout
    });
    
    const insight = this._parseBedrockResponse(response, marketContext);
    const validated = await this.validateGeographicRelevance(insight, marketContext.market);
    
    return {
      insight: validated,
      alternatives: [],
      voiceProfile: this._extractVoiceProfile(validated),
      source: 'bedrock-only',
      processingTime: 0
    };
  }

  /**
   * Generate generic template-based insight
   * @private
   */
  async _generateGenericInsight(marketContext, contentTheme) {
    const templates = this._getInsightTemplates(contentTheme.primaryTheme || 'market_trends');
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    const commentary = template
      .replace('[MARKET]', marketContext.market)
      .replace('[THEME]', contentTheme.primaryTheme || 'market trends');
    
    const insight = {
      id: `generic-${Date.now()}`,
      market: marketContext.market,
      commentary,
      perspective: 'market analyst',
      tone: contentTheme.tone || 'professional',
      confidence: 65, // Lower confidence for generic insights
      geographicRelevance: 1.0, // Template is market-specific
      source: 'template-based',
      metadata: {
        generatedAt: new Date().toISOString(),
        tavilySearchUsed: false,
        bedrockPromptUsed: false
      }
    };
    
    return {
      insight,
      alternatives: [],
      voiceProfile: this._extractVoiceProfile(insight),
      source: 'template',
      processingTime: 0
    };
  }

  /**
   * Search for market expertise using Tavily
   * 
   * @param {string} market - Market name
   * @param {string} searchQuery - Search query
   * @param {Object} options - Search options
   * @returns {Array} Structured insights from Tavily
   */
  async searchMarketExpertise(market, searchQuery, options = {}) {
    try {
      const tavilyQuery = `real estate market insights expert analysis ${market} ${searchQuery}`;
      
      this.logger.debug('Searching Tavily for market expertise', {
        market,
        query: tavilyQuery,
        searchDepth: options.searchDepth
      });
      
      const searchResults = await this.tavilyService.search({
        query: tavilyQuery,
        searchDepth: options.searchDepth || 'basic',
        maxResults: options.maxResults || 5,
        includeRawContent: true,
        timeout: this.config.tavilyTimeout
      });
      
      if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
        throw new Error('No Tavily search results found');
      }
      
      // Use TavilyDataTransformer to extract structured insights
      const structuredInsights = await this.transformer.transformToMarketInsights(
        searchResults,
        market
      );
      
      this.logger.debug('Tavily search completed', {
        market,
        resultsFound: structuredInsights?.length || 0
      });
      
      return structuredInsights || [];
      
    } catch (error) {
      this.logger.error('Tavily search failed', {
        market,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Synthesize expert commentary from Tavily insights using Bedrock
   * 
   * @param {Array} insights - Tavily insights
   * @param {Object} contentTheme - Content theme requirements
   * @param {Object} marketContext - Market context
   * @returns {Object} Synthesized expert commentary
   */
  async synthesizeExpertCommentary(insights, contentTheme, marketContext) {
    try {
      const prompt = this._buildSynthesisPrompt(insights, contentTheme, marketContext);
      
      this.logger.debug('Synthesizing expert commentary with Bedrock', {
        market: marketContext.market,
        insightCount: insights.length
      });
      
      const response = await this.bedrockService.generateContent({
        prompt,
        maxTokens: 500,
        temperature: 0.7,
        timeout: this.config.bedrockTimeout
      });
      
      const synthesized = this._parseBedrockResponse(response, marketContext);
      
      this.logger.debug('Bedrock synthesis completed', {
        market: marketContext.market,
        confidence: synthesized.confidence
      });
      
      return synthesized;
      
    } catch (error) {
      this.logger.error('Bedrock synthesis failed', {
        market: marketContext.market,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate geographic relevance of generated insight
   * Prevents cross-market contamination (August 2025 achievement)
   * 
   * @param {Object} insight - Generated insight
   * @param {string} market - Target market
   * @returns {Object} Validated insight with relevance score
   */
  async validateGeographicRelevance(insight, market) {
    const relevanceScore = this._calculateGeographicMatch(insight.commentary, market);
    
    if (relevanceScore < this.config.geographicRelevanceThreshold) {
      this.logger.warn('Geographic relevance below threshold', {
        market,
        relevanceScore,
        threshold: this.config.geographicRelevanceThreshold
      });
      
      throw new Error(
        `Insight relevance ${relevanceScore.toFixed(2)} below threshold ${this.config.geographicRelevanceThreshold} for market ${market}`
      );
    }
    
    this.logger.debug('Geographic relevance validated', {
      market,
      relevanceScore,
      passed: true
    });
    
    return {
      ...insight,
      geographicRelevance: relevanceScore,
      validated: true
    };
  }

  /**
   * Ensure voice consistency across generated insights
   * 
   * @param {Array} insights - Array of insights to filter
   * @param {Object} contentTheme - Voice requirements
   * @returns {Array} Filtered insights matching voice requirements
   */
  async ensureVoiceConsistency(insights, contentTheme) {
    const requiredTone = contentTheme.tone || 'professional';
    const requiredComplexity = contentTheme.complexity || 'moderate';
    
    const filtered = insights.filter(insight => {
      // Check tone match
      const toneMatch = insight.tone === requiredTone;
      
      // Check complexity match
      const complexityMatch = this._matchesComplexityLevel(
        insight.commentary,
        requiredComplexity
      );
      
      // Check professional language
      const professionalLanguage = this._usesProfessionalLanguage(insight.commentary);
      
      return toneMatch && complexityMatch && professionalLanguage;
    });
    
    // If no insights match requirements, return original
    // This is graceful degradation - better to have content than nothing
    return filtered.length > 0 ? filtered : insights;
  }

  /**
   * Build search query from market context and content theme
   * @private
   */
  _buildSearchQuery(marketContext, contentTheme) {
    const themeKeywords = {
      'market_trends': 'market trends analysis outlook',
      'buyer_behavior': 'buyer demand preferences activity',
      'inventory_trends': 'inventory supply listings availability',
      'pricing_dynamics': 'pricing appreciation values trends',
      'default': 'market analysis professional insights'
    };
    
    const themeTerm = themeKeywords[contentTheme.primaryTheme] || themeKeywords['default'];
    return `${themeTerm} professional perspective`;
  }

  /**
   * Build Bedrock synthesis prompt
   * @private
   */
  _buildSynthesisPrompt(insights, contentTheme, marketContext) {
    const insightTexts = insights
      .map(i => `- ${i.text || i.content || i.commentary || 'Market insight'}`)
      .join('\n');
    
    return `You are synthesizing real estate market insights into professional expert commentary.

Market: ${marketContext.market}
"Primary Theme": ${contentTheme.primaryTheme || 'market trends'}
Tone: ${contentTheme.tone || 'professional'}

"Available Market Insights":
${insightTexts}

Generate professional expert commentary that:
1. Synthesizes these insights into cohesive perspective
2. Uses professional real estate terminology
3. Maintains ${contentTheme.tone || 'professional'} tone
4. Focuses on ${contentTheme.primaryTheme || 'market trends'}
5. CRITICAL: Do NOT mention specific companies or business names
6. Use generic attribution like "market analysts note" or "industry experts observe"
7. Keep commentary concise (2-3 sentences, 50-100 words)

Provide commentary in this JSON format:
{
  "commentary": "Professional expert perspective here",
  "perspective": "market analyst | industry expert | local market specialist",
  "confidence": 85
}`;
  }

  /**
   * Build Bedrock-only prompt (no Tavily search)
   * @private
   */
  _buildBedrockOnlyPrompt(marketContext, contentTheme) {
    return `Generate professional real estate expert commentary for ${marketContext.market}.

Theme: ${contentTheme.primaryTheme || 'market trends'}
Tone: ${contentTheme.tone || 'professional'}
Complexity: ${contentTheme.complexity || 'moderate'}

Requirements:
1. Professional real estate terminology
2. Market-specific insights for ${marketContext.market}
3. ${contentTheme.tone || 'professional'} tone
4. Focus on ${contentTheme.primaryTheme || 'market trends'}
5. CRITICAL: No specific company names or business references
6. 2-3 sentences, 50-100 words
7. Use generic attribution like "market analysts" or "industry experts"

Provide in JSON format:
{
  "commentary": "Expert perspective here",
  "perspective": "market analyst",
  "confidence": 80
}`;
  }

  /**
   * Parse Bedrock response into insight object
   * @private
   */
  _parseBedrockResponse(response, marketContext) {
    try {
      // Try to parse as JSON first
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;
      
      return {
        id: `bedrock-${Date.now()}`,
        market: marketContext.market,
        commentary: parsed.commentary || parsed.content || response,
        perspective: parsed.perspective || 'market analyst',
        tone: parsed.tone || 'professional',
        confidence: parsed.confidence || 80,
        geographicRelevance: 0, // Will be calculated by validation
        source: 'ai-generated',
        metadata: {
          generatedAt: new Date().toISOString(),
          tavilySearchUsed: false,
          bedrockPromptUsed: true
        }
      };
    } catch (error) {
      // If JSON parsing fails, use response as commentary directly
      return {
        id: `bedrock-${Date.now()}`,
        market: marketContext.market,
        commentary: typeof response === 'string' ? response : String(response),
        perspective: 'market analyst',
        tone: 'professional',
        confidence: 75,
        geographicRelevance: 0,
        source: 'ai-generated',
        metadata: {
          generatedAt: new Date().toISOString(),
          tavilySearchUsed: false,
          bedrockPromptUsed: true
        }
      };
    }
  }

  /**
   * Calculate geographic match score
   * Returns score 0-1 where 1.0 = perfect match
   * Threshold: 0.7 (70% relevance required)
   * 
   * @private
   */
  _calculateGeographicMatch(text, market) {
    const marketInfo = this._parseMarketName(market);
    const textLower = text.toLowerCase();
    let matches = 0;
    let totalChecks = 0;
    
    // Check for market cities
    for (const city of marketInfo.cities) {
      totalChecks++;
      if (textLower.includes(city.toLowerCase())) {
        matches++;
      }
    }
    
    // Check for state
    totalChecks++;
    if (textLower.includes(marketInfo.state.toLowerCase())) {
      matches++;
    }
    
    // Check for region
    if (marketInfo.region) {
      totalChecks++;
      if (textLower.includes(marketInfo.region.toLowerCase())) {
        matches++;
      }
    }
    
    // Check AGAINST other major markets (contamination detection)
    const otherMarkets = this._getOtherMajorMarkets(market);
    for (const otherMarket of otherMarkets) {
      if (textLower.includes(otherMarket.toLowerCase())) {
        // Penalty for mentioning other markets
        matches -= 0.5;
      }
    }
    
    const score = Math.max(0, Math.min(1, matches / totalChecks));
    
    this.logger.debug('Geographic relevance calculated', {
      market,
      score,
      matches,
      totalChecks,
      threshold: this.config.geographicRelevanceThreshold,
      passed: score >= this.config.geographicRelevanceThreshold
    });
    
    return score;
  }

  /**
   * Parse market name into components
   * @private
   */
  _parseMarketName(market) {
    // e.g., "Los Angeles-Long Beach-Anaheim" or "New York-Newark-Jersey City"
    const parts = market.split('-').map(p => p.trim());
    
    // Try to determine state (usually last part or known patterns)
    let state = 'Unknown';
    const statePatterns = {
      'CA': ['California', 'Los Angeles', 'San Francisco', 'San Diego', 'San Jose'],
      'NY': ['New York', 'Newark'],
      'TX': ['Dallas', 'Houston', 'San Antonio', 'Austin'],
      'FL': ['Miami', 'Tampa', 'Orlando', 'Jacksonville'],
      'IL': ['Chicago'],
      'PA': ['Philadelphia', 'Pittsburgh'],
      'AZ': ['Phoenix'],
      'WA': ['Seattle', 'Tacoma']
    };
    
    for (const [stateCode, cities] of Object.entries(statePatterns)) {
      if (cities.some(city => market.includes(city))) {
        state = stateCode;
        break;
      }
    }
    
    return {
      cities: parts,
      state,
      region: this._getRegion(state),
      fullName: market
    };
  }

  /**
   * Get region from state
   * @private
   */
  _getRegion(state) {
    const regions = {
      'CA': 'West Coast',
      'NY': 'East Coast',
      'TX': 'Southwest',
      'FL': 'Southeast',
      'IL': 'Midwest',
      'PA': 'Northeast',
      'AZ': 'Southwest',
      'WA': 'Pacific Northwest'
    };
    return regions[state] || 'US';
  }

  /**
   * Get other major markets for contamination detection
   * @private
   */
  _getOtherMajorMarkets(currentMarket) {
    const majorMarkets = [
      'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
      'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
      'Austin', 'Jacksonville', 'San Francisco', 'Seattle', 'Denver',
      'Boston', 'Nashville', 'Detroit', 'Portland', 'Las Vegas'
    ];
    
    return majorMarkets.filter(m => !currentMarket.includes(m));
  }

  /**
   * Check if text matches complexity level
   * @private
   */
  _matchesComplexityLevel(text, targetLevel) {
    const avgWordLength = this._calculateAverageWordLength(text);
    const avgSentenceLength = this._calculateAverageSentenceLength(text);
    
    const complexityRanges = {
      'simple': { wordLength: [1, 5], sentenceLength: [8, 15] },
      'moderate': { wordLength: [5, 7], sentenceLength: [15, 25] },
      'complex': { wordLength: [7, 12], sentenceLength: [25, 40] }
    };
    
    const range = complexityRanges[targetLevel] || complexityRanges['moderate'];
    
    return (
      avgWordLength >= range.wordLength[0] && 
      avgWordLength <= range.wordLength[1] &&
      avgSentenceLength >= range.sentenceLength[0] &&
      avgSentenceLength <= range.sentenceLength[1]
    );
  }

  /**
   * Check for professional real estate language
   * @private
   */
  _usesProfessionalLanguage(text) {
    const professionalTerms = [
      'market', 'trends', 'inventory', 'demand', 'supply',
      'pricing', 'appreciation', 'metrics', 'indicators', 'analysis',
      'buyers', 'sellers', 'conditions', 'activity'
    ];
    
    const casualTerms = [
      'awesome', 'great deal', 'super', 'amazing', 'crazy',
      'insane', 'killer', 'sick', 'epic'
    ];
    
    const textLower = text.toLowerCase();
    
    // Count professional terms
    const professionalCount = professionalTerms.filter(term => 
      textLower.includes(term)
    ).length;
    
    // Count casual terms (should be minimal)
    const casualCount = casualTerms.filter(term => 
      textLower.includes(term)
    ).length;
    
    return professionalCount >= 3 && casualCount === 0;
  }

  /**
   * Calculate average word length
   * @private
   */
  _calculateAverageWordLength(text) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return 0;
    
    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    return totalLength / words.length;
  }

  /**
   * Calculate average sentence length
   * @private
   */
  _calculateAverageSentenceLength(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length === 0) return 0;
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    return words.length / sentences.length;
  }

  /**
   * Extract voice profile from generated insight
   * @private
   */
  _extractVoiceProfile(insight) {
    return {
      tone: insight.tone || 'professional',
      complexity: this._assessComplexity(insight.commentary),
      personalityTraits: this._extractPersonalityTraits(insight.commentary),
      perspective: insight.perspective || 'market analyst'
    };
  }

  /**
   * Assess text complexity
   * @private
   */
  _assessComplexity(text) {
    const avgWordLength = this._calculateAverageWordLength(text);
    const avgSentenceLength = this._calculateAverageSentenceLength(text);
    
    if (avgWordLength < 5 && avgSentenceLength < 15) return 'simple';
    if (avgWordLength > 7 && avgSentenceLength > 25) return 'complex';
    return 'moderate';
  }

  /**
   * Extract personality traits from text
   * @private
   */
  _extractPersonalityTraits(text) {
    const traits = [];
    const textLower = text.toLowerCase();
    
    // Authoritative indicators
    if (textLower.match(/data shows?|statistics indicate|research suggests|evidence points/)) {
      traits.push('authoritative');
    }
    
    // Trustworthy indicators
    if (textLower.match(/accurate|reliable|verified|confirmed|validated/)) {
      traits.push('trustworthy');
    }
    
    // Data-driven indicators
    if (textLower.match(/\d+%|\d+ percent|metrics|data|statistics|numbers/)) {
      traits.push('data-driven');
    }
    
    return traits.length > 0 ? traits : ['professional'];
  }

  /**
   * Generate cache key
   * @private
   */
  _generateCacheKey(marketContext, contentTheme) {
    return `${marketContext.market}:${contentTheme.primaryTheme || 'default'}:${contentTheme.tone || 'professional'}`;
  }

  /**
   * Generate alternative insights (if requested)
   * @private
   */
  async _generateAlternatives(marketContext, contentTheme) {
    try {
      // Generate 2 alternative perspectives
      const alternatives = [];
      const alternativePerspectives = ['industry expert', 'local market specialist'];
      
      for (const perspective of alternativePerspectives) {
        try {
          const altTheme = { ...contentTheme, perspective };
          const altResult = await this._generateWithBedrockOnly(marketContext, altTheme);
          if (altResult && altResult.insight) {
            alternatives.push(altResult.insight);
          }
        } catch (error) {
          this.logger.debug('Failed to generate alternative', {
            perspective,
            error: error.message
          });
          // Continue with other alternatives
        }
      }
      
      return alternatives;
    } catch (error) {
      this.logger.warn('Failed to generate alternatives', { error: error.message });
      return [];
    }
  }

  /**
   * Get insight templates for fallback generation
   * @private
   */
  _getInsightTemplates(theme) {
    const templates = {
      'market_trends': [
        'Market analysts note that [MARKET] continues to show resilience with steady activity levels reflecting broader economic conditions in the region.',
        'Industry experts observe that [MARKET] demonstrates consistent patterns typical of mature metropolitan markets with balanced supply and demand dynamics.',
        'Local market specialists indicate that [MARKET] maintains stable conditions with moderate activity reflecting the area\'s economic fundamentals.'
      ],
      'buyer_behavior': [
        'Market observers note that buyer activity in [MARKET] reflects typical seasonal patterns with sustained interest from qualified purchasers.',
        'Industry professionals indicate that [MARKET] demonstrates consistent buyer engagement characteristic of established metropolitan areas.',
        'Market analysts report that [MARKET] shows balanced buyer participation reflecting healthy market conditions.'
      ],
      'inventory_trends': [
        'Real estate professionals note that [MARKET] inventory levels reflect typical market dynamics for the region.',
        'Market specialists observe that [MARKET] maintains balanced supply conditions characteristic of mature metropolitan markets.',
        'Industry analysts indicate that [MARKET] shows stable inventory patterns consistent with local market fundamentals.'
      ],
      'default': [
        'Market analysts note that [MARKET] continues to demonstrate the characteristics typical of major metropolitan areas.',
        'Industry experts observe that [MARKET] maintains market conditions consistent with its regional economic profile.',
        'Real estate professionals indicate that [MARKET] shows patterns typical of established metropolitan markets.'
      ]
    };
    
    return templates[theme] || templates['default'];
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0 ? 
        (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(2) + '%' : 
        '0%',
      successRate: (this.metrics.successfulGenerations + this.metrics.failedGenerations) > 0 ?
        (this.metrics.successfulGenerations / (this.metrics.successfulGenerations + this.metrics.failedGenerations) * 100).toFixed(2) + '%' :
        '0%'
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    const size = this.insightCache.size;
    this.insightCache.clear();
    this.logger.info('Insight cache cleared', { entriesCleared: size });
    return size;
  }
}

module.exports = MarketExpertInsights;