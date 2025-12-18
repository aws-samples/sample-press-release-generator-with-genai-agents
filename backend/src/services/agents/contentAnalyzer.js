const BaseAgent = require('./baseAgent');
const bedrockService = require('../bedrock');
const { logger, createAgentLoggers } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');
const { getMarketProfile } = require('../../data/marketProfiles');
const { SchemaValidators, SchemaDefaults } = require('../../schemas/prFrameworkSchema');
const FrameworkExtractor = require('./frameworkExtractor');
const { calculateBedrockCost } = require('../../utils/costCalculator');

/**
 * Content Analyzer Agent
 * Analyzes master PR template structure and extracts key elements
 * 
 * Features:
 * - Master PR template parsing and structure extraction
 * - Key element identification (headline, body, quotes, data points)
 * - Content categorization and tagging
 * - Template validation and error detection
 * - Integration with existing Bedrock service
 */
class ContentAnalyzerAgent extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Content Analyzer', {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 180000, // 3 minutes for complex AI operations
      ...options
    }, lineageService);

    this.bedrockService = bedrockService;
    
    // Initialize dedicated agent logger
    this.agentLogger = createAgentLoggers('ContentAnalyzer');
    
    // Initialize FrameworkExtractor with logger
    this.frameworkExtractor = new FrameworkExtractor(this.agentLogger);
    
    // Analysis patterns and rules
    this.patterns = {
      headline: /^(.+?)(?:\n|$)/,
      subheadline: /^.+?\n(.+?)(?:\n|$)/,
      quotes: /"([^"]+)"/g,
      statistics: /\b\d+(?:,\d{3})*(?:\.\d+)?(?:%|\s*percent|\s*million|\s*billion|\s*thousand)?\b/g,
      marketReferences: /\b(?:market|city|metro|area|region|neighborhood|district)\b/gi,
      dataPoints: /\b(?:\d+(?:,\d{3})*(?:\.\d+)?(?:%|\s*percent|\s*million|\s*billion|\s*thousand)?|\$\d+(?:,\d{3})*(?:\.\d+)?[KMB]?)\b/g
    };

    // Content structure schema
    this.schema = {
      masterPR: {
        required: true,
        type: 'string',
        minLength: 100,
        maxLength: 50000
      }
    };
  }

  /**
   * Initialize the Content Analyzer Agent
   */
  async initialize() {
    try {
      this.log('info', 'Content Analyzer initialization started');
      
      // Test Bedrock connectivity (skip in development if credentials not available)
      if (this.bedrockService && typeof this.bedrockService.testConnection === 'function') {
        try {
          await this.bedrockService.testConnection();
          this.log('info', 'Bedrock service connection verified');
        } catch (error) {
          if ((!process.env.NODE_ENV || process.env.NODE_ENV === 'development') &&
              (error.message.includes('credential') || error.message.includes('Resolved credential object is not valid'))) {
            this.log('warn', 'Skipping Bedrock connectivity test in development mode - credentials not configured', {
              error: error.message
            });
          } else {
            throw error; // Re-throw if it's not a credential issue or not in development
          }
        }
      }

      this.log('info', 'Content Analyzer Agent initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize Content Analyzer Agent', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Analyze master PR content structure
   * Main entry point for content analysis
   */
  async analyze(masterPR, options = {}) {
    return this.execute(this._performAnalysis.bind(this), masterPR, options);
  }

  /**
   * Internal method to perform content analysis
   */
  async _performAnalysis(masterPR, options = {}) {
    try {
      // Validate input
      this.validateInput({ masterPR }, this.schema);

      this.log('info', 'Starting content analysis', {
        contentLength: masterPR.length,
        jobId: options.jobId
      });

      // Step 1: Basic structural analysis
      const basicAnalysis = this._performBasicAnalysis(masterPR);

      // Step 2: AI-powered deep analysis
      const deepAnalysis = await this._performDeepAnalysis(masterPR, basicAnalysis, options);

      // Step 3: Combine and validate results
      const combinedAnalysis = this._combineAnalysis(basicAnalysis, deepAnalysis);

      // Step 4: Calculate confidence score
      const confidence = this._calculateAnalysisConfidence(combinedAnalysis, masterPR);

      const result = {
        ...combinedAnalysis,
        confidence,
        metadata: {
          analyzedAt: new Date(),
          contentLength: masterPR.length,
          analysisVersion: '1.0',
          jobId: options.jobId
        },
        cost: deepAnalysis._costTracking ? {
          provider: 'bedrock',
          model: 'claude-3-7-sonnet',
          operation: 'content_analysis',
          inputTokens: deepAnalysis._costTracking.inputTokens,
          outputTokens: deepAnalysis._costTracking.outputTokens,
          totalTokens: deepAnalysis._costTracking.totalTokens,
          inputCost: deepAnalysis._costTracking.inputCost,
          outputCost: deepAnalysis._costTracking.outputCost,
          totalCost: deepAnalysis._costTracking.totalCost,
          currency: 'USD'
        } : null
      };

      this.log('info', 'Content analysis completed', {
        confidence,
        elementsFound: Object.keys(result).length - 2, // Exclude confidence and metadata
        jobId: options.jobId
      });

      return result;

    } catch (error) {
      this.log('error', 'Content analysis failed', {
        error: error.message,
        jobId: options.jobId
      });
      throw error;
    }
  }

  /**
   * Perform basic structural analysis using regex patterns
   */
  _performBasicAnalysis(masterPR) {
    const lines = masterPR.split('\n').filter(line => line.trim());
    const paragraphs = masterPR.split('\n\n').filter(p => p.trim());

    // Extract basic elements
    const headline = this._extractHeadline(lines);
    const subheadline = this._extractSubheadline(lines);
    const quotes = this._extractQuotes(masterPR);
    const statistics = this._extractStatistics(masterPR);
    const dataPoints = this._extractDataPoints(masterPR);
    const marketReferences = this._extractMarketReferences(masterPR);

    // Identify structural components
    const structure = this._identifyStructure(paragraphs);

    return {
      headline,
      subheadline,
      quotes,
      statistics,
      dataPoints,
      marketReferences,
      structure,
      basicMetrics: {
        lineCount: lines.length,
        paragraphCount: paragraphs.length,
        wordCount: masterPR.split(/\s+/).length,
        characterCount: masterPR.length
      }
    };
  }

  /**
   * Perform AI-powered deep analysis using Bedrock
   */
  async _performDeepAnalysis(masterPR, basicAnalysis, options = {}) {
    try {
      if (!this.bedrockService) {
        this.agentLogger.warn('Bedrock service not available, skipping deep analysis', {
          jobId: options.jobId
        });
        return {};
      }

      const prompt = this._buildAnalysisPrompt(masterPR, basicAnalysis);
      
      this.agentLogger.actionStarted('AI Deep Analysis', {
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + '...',
        jobId: options.jobId,
        masterPRLength: masterPR.length,
        basicAnalysisKeys: Object.keys(basicAnalysis)
      });

      const startTime = Date.now();
      const bedrockResponse = await this.bedrockService.invokeModel(prompt, {
        maxTokens: 2000,
        temperature: 0.1, // Low temperature for consistent analysis
        topP: 0.9
      });
      const duration = Date.now() - startTime;

      // Extract response content and usage data
      const response = bedrockResponse.content || bedrockResponse;
      const usage = bedrockResponse.usage || {};
      
      // Calculate API cost
      const costData = calculateBedrockCost(usage.inputTokens, usage.outputTokens);

      this.agentLogger.externalCall('Bedrock', 'invokeModel', duration, true, {
        responseLength: response.length,
        responsePreview: response.substring(0, 200) + '...',
        jobId: options.jobId,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens
        },
        cost: costData
      });

      // Parse AI response with detailed logging
      const deepAnalysis = this._parseAIResponseWithLogging(response, options.jobId);
      
      // Add cost tracking to deep analysis
      deepAnalysis._costTracking = costData;

      this.agentLogger.actionCompleted('AI Deep Analysis', duration, {
        responseLength: response.length,
        elementsExtracted: Object.keys(deepAnalysis).length,
        parseSuccess: !deepAnalysis.parseError,
        jobId: options.jobId
      });

      return deepAnalysis;

    } catch (error) {
      this.agentLogger.actionFailed('AI Deep Analysis', error, {
        jobId: options.jobId,
        masterPRLength: masterPR.length
      });
      return {};
    }
  }

  /**
   * Build analysis prompt for AI
   */
  _buildAnalysisPrompt(masterPR, basicAnalysis) {
    return `You are an expert press release analyst specializing in real estate market communications. Your role is to perform comprehensive structural analysis that enables precise market localization.

CONTENT TO ANALYZE:
${masterPR}

PRELIMINARY ANALYSIS CONTEXT:
- Headlines detected: ${basicAnalysis.headline ? 1 : 0}
- Quotes identified: ${basicAnalysis.quotes.length}
- Statistical references: ${basicAnalysis.statistics.length}
- Structural paragraphs: ${basicAnalysis.basicMetrics.paragraphCount}
- Word count: ${basicAnalysis.basicMetrics.wordCount}

COMPREHENSIVE ANALYSIS OBJECTIVES:
1. STRUCTURAL DECOMPOSITION: Break down headline, subheadlines, body sections, and conclusion
2. MESSAGE EXTRACTION: Identify core value propositions and key market insights
3. DATA POINT CATALOGING: Extract all numerical data, statistics, and market metrics
4. QUOTE ANALYSIS: Capture all quotes with precise attribution and context
5. LOCALIZATION MAPPING: Identify every element that can be market-customized
6. AUDIENCE PROFILING: Determine target demographics and communication style
7. QUALITY ASSESSMENT: Evaluate content completeness and professional standards
8. MARKET ADAPTABILITY: Assess how content can be tailored for different regions

LOCALIZATION FOCUS AREAS:
- Geographic references (cities, regions, neighborhoods)
- Market-specific terminology and language patterns
- Statistical data that varies by market
- Regional economic indicators and trends
- Local regulatory or industry context
- Demographic-specific messaging
- Cultural and lifestyle references

STRICT OUTPUT REQUIREMENTS:
- Return ONLY valid JSON - no additional text or formatting
- Use exact text from source material - no paraphrasing
- Preserve all numerical precision and context
- Identify ALL localizable elements, not just obvious ones
- Assess content against professional PR standards

REQUIRED JSON STRUCTURE:
{
  "keyMessages": ["primary messages that drive the narrative"],
  "valuePropositions": ["specific value statements for audiences"],
  "quotesWithAttribution": [{"text": "exact quote", "attribution": "speaker name", "title": "speaker title/role", "context": "surrounding context"}],
  "numericalData": [{"value": "exact number/statistic", "context": "what it measures", "type": "statistic|percentage|currency|count", "localizationPotential": "high|medium|low"}],
  "boilerplate": "company/brand standard text",
  "localizableElements": ["comprehensive list of market-customizable elements"],
  "marketReferences": ["any geographic or market-specific mentions"],
  "targetAudience": "detailed audience description",
  "tone": "precise tone assessment",
  "contentQuality": "professional quality evaluation",
  "structuralIntegrity": "organization and flow assessment",
  "localizationReadiness": "assessment of how well content can be adapted",
  "dataIntegrity": "assessment of factual accuracy and source reliability"
}`;
  }

  /**
   * Parse AI response into structured data with comprehensive logging
   */
  _parseAIResponseWithLogging(response, jobId) {
    const startTime = Date.now();
    
    this.agentLogger.actionStarted('JSON Response Parsing', {
      responseLength: response.length,
      jobId: jobId,
      responseType: typeof response,
      responsePreview: response.substring(0, 500) + '...'
    });

    // Declare jsonString outside try block so it's accessible in catch block
    let jsonString = '';

    try {
      // Clean response and extract JSON with enhanced error handling
      const cleanResponse = response.trim();
      
      this.agentLogger.debug('Response cleaning completed', {
        originalLength: response.length,
        cleanedLength: cleanResponse.length,
        trimmedChars: response.length - cleanResponse.length,
        jobId: jobId
      });

      let jsonStart = cleanResponse.indexOf('{');
      let jsonEnd = cleanResponse.lastIndexOf('}') + 1;
      
      this.agentLogger.debug('JSON boundary detection', {
        jsonStart: jsonStart,
        jsonEnd: jsonEnd,
        hasValidBoundaries: jsonStart !== -1 && jsonEnd > 0,
        jobId: jobId
      });
      
      if (jsonStart === -1 || jsonEnd === 0) {
        this.agentLogger.error('No JSON boundaries found in response', null, {
          responseLength: cleanResponse.length,
          responseStart: cleanResponse.substring(0, 200),
          responseEnd: cleanResponse.substring(-200),
          jobId: jobId
        });
        throw new Error('No JSON found in response');
      }

      jsonString = cleanResponse.substring(jsonStart, jsonEnd);
      
      // ENHANCED: Attempt to fix common JSON syntax errors before parsing
      jsonString = this._attemptJSONRepair(jsonString, jobId);
      
      this.agentLogger.debug('JSON string extracted and repaired', {
        jsonLength: jsonString.length,
        jsonStart: jsonStart,
        jsonEnd: jsonEnd,
        jsonPreview: jsonString.substring(0, 300) + '...',
        jsonSuffix: jsonString.substring(-100),
        jobId: jobId
      });

      // Log the exact JSON that's about to be parsed
      this.agentLogger.info('Attempting JSON parse', {
        jsonString: jsonString,
        jsonLength: jsonString.length,
        jobId: jobId
      });

      const parsed = JSON.parse(jsonString);

      this.agentLogger.info('JSON parsing successful', {
        parsedKeys: Object.keys(parsed),
        parsedStructure: this._analyzeJSONStructure(parsed),
        jobId: jobId
      });

      // Validate required fields
      const required = ['keyMessages', 'quotesWithAttribution', 'localizableElements'];
      const validationResults = {};
      
      for (const field of required) {
        const exists = !!parsed[field];
        const isArray = Array.isArray(parsed[field]);
        validationResults[field] = { exists, isArray, length: isArray ? parsed[field].length : 0 };
        
        if (!parsed[field]) {
          parsed[field] = [];
        }
      }

      this.agentLogger.actionCompleted('JSON Response Parsing', Date.now() - startTime, {
        parseSuccess: true,
        validationResults: validationResults,
        finalKeys: Object.keys(parsed),
        jobId: jobId
      });

      return parsed;

    } catch (error) {
      // ENHANCED: Provide detailed error metadata for circuit breaker intelligence
      const errorMetadata = {
        responseLength: response.length,
        errorPosition: this._extractJSONErrorPosition(error.message),
        responseAroundError: this._getResponseAroundError(response, error.message),
        jobId: jobId,
        errorType: 'json_parsing', // Explicit error type for circuit breaker
        error: error.message,
        isRecoverable: this._isRecoverableJSONError(error.message),
        repairAttempted: jsonString && response !== jsonString // Indicates if repair was attempted
      };
      
      this.agentLogger.actionFailed('JSON Response Parsing', error, errorMetadata);
      
      return {
        keyMessages: [],
        quotesWithAttribution: [],
        localizableElements: [],
        parseError: error.message,
        errorMetadata: errorMetadata // Pass metadata for upstream error handling
      };
    }
  }

  /**
   * Attempt to repair common JSON syntax errors
   * This addresses the frequent "Expected ',' or ']' after array element" errors
   */
  _attemptJSONRepair(jsonString, jobId) {
    let repairedJson = jsonString;
    let repairAttempts = [];

    try {
      // 1. Fix missing commas in arrays - common pattern from AI responses
      const missingCommaPattern = /("(?:[^"\\]|\\.)*")\s*\n\s*("(?:[^"\\]|\\.)*")/g;
      const beforeCommaFix = repairedJson;
      repairedJson = repairedJson.replace(missingCommaPattern, '$1,$2');
      if (repairedJson !== beforeCommaFix) {
        repairAttempts.push('Added missing commas in arrays');
      }

      // 2. Fix trailing commas that break JSON parsing
      const trailingCommaPattern = /,(\s*[}\]])/g;
      const beforeTrailingFix = repairedJson;
      repairedJson = repairedJson.replace(trailingCommaPattern, '$1');
      if (repairedJson !== beforeTrailingFix) {
        repairAttempts.push('Removed trailing commas');
      }

      // 3. Fix unescaped quotes in strings
      const unescapedQuotePattern = /("(?:[^"\\]|\\.)*[^\\])"([^,\]\}:\s])/g;
      const beforeQuoteFix = repairedJson;
      repairedJson = repairedJson.replace(unescapedQuotePattern, '$1\\"$2');
      if (repairedJson !== beforeQuoteFix) {
        repairAttempts.push('Escaped unescaped quotes');
      }

      // 4. Fix missing quotes around property names
      const unquotedPropertyPattern = /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
      const beforePropertyFix = repairedJson;
      repairedJson = repairedJson.replace(unquotedPropertyPattern, '$1"$2":');
      if (repairedJson !== beforePropertyFix) {
        repairAttempts.push('Added quotes around property names');
      }

      if (repairAttempts.length > 0) {
        this.agentLogger.info('JSON repair attempted', {
          jobId: jobId,
          repairAttempts: repairAttempts,
          originalLength: jsonString.length,
          repairedLength: repairedJson.length
        });
      }

    } catch (repairError) {
      this.agentLogger.warn('JSON repair failed', {
        jobId: jobId,
        repairError: repairError.message,
        repairAttempts: repairAttempts
      });
      // Return original if repair fails
      return jsonString;
    }

    return repairedJson;
  }

  /**
   * Determine if a JSON parsing error is potentially recoverable
   */
  _isRecoverableJSONError(errorMessage) {
    const recoverablePatterns = [
      /Expected ',' or '\]' after array element/,
      /Expected ',' or '\}' after property value/,
      /Trailing comma/,
      /Unexpected token/,
      /Unterminated string/,
      /Missing quotes/
    ];
    
    return recoverablePatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Legacy method for backward compatibility
   */
  _parseAIResponse(response) {
    return this._parseAIResponseWithLogging(response, 'legacy');
  }

  /**
   * Analyze JSON structure for logging
   */
  _analyzeJSONStructure(obj, depth = 0) {
    if (depth > 3) return '[max depth reached]';
    
    const analysis = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        analysis[key] = `Array[${value.length}]`;
      } else if (typeof value === 'object' && value !== null) {
        analysis[key] = this._analyzeJSONStructure(value, depth + 1);
      } else {
        analysis[key] = typeof value;
      }
    }
    return analysis;
  }

  /**
   * Extract error position from JSON parse error message
   */
  _extractJSONErrorPosition(errorMessage) {
    const positionMatch = errorMessage.match(/position (\d+)/);
    return positionMatch ? parseInt(positionMatch[1]) : null;
  }

  /**
   * Get response content around error position
   */
  _getResponseAroundError(response, errorMessage) {
    const position = this._extractJSONErrorPosition(errorMessage);
    if (!position) return null;
    
    const start = Math.max(0, position - 100);
    const end = Math.min(response.length, position + 100);
    
    return {
      position: position,
      contextBefore: response.substring(start, position),
      contextAfter: response.substring(position, end),
      charAtPosition: response.charAt(position)
    };
  }

  /**
   * Combine basic and deep analysis results
   */
  _combineAnalysis(basicAnalysis, deepAnalysis) {
    return {
      // Core structural elements
      headline: basicAnalysis.headline || '',
      subheadline: basicAnalysis.subheadline || '',
      
      // Content elements (prefer deep analysis, fallback to basic)
      keyMessages: deepAnalysis.keyMessages || this._extractKeyMessages(basicAnalysis),
      quotes: this._combineQuotes(basicAnalysis.quotes, deepAnalysis.quotesWithAttribution),
      dataPoints: this._combineDataPoints(basicAnalysis.dataPoints, deepAnalysis.numericalData),
      
      // Localization elements
      localizableElements: deepAnalysis.localizableElements || this._identifyLocalizableElements(basicAnalysis),
      marketReferences: basicAnalysis.marketReferences || [],
      
      // Content metadata
      boilerplate: deepAnalysis.boilerplate || this._extractBoilerplate(basicAnalysis),
      targetAudience: deepAnalysis.targetAudience || 'general',
      tone: deepAnalysis.tone || 'professional',
      
      // Structure information
      structure: basicAnalysis.structure,
      metrics: basicAnalysis.basicMetrics,
      
      // Quality assessment
      contentQuality: deepAnalysis.contentQuality || 'standard',
      structuralIntegrity: deepAnalysis.structuralIntegrity || 'good'
    };
  }

  /**
   * Calculate confidence score for analysis
   */
  _calculateAnalysisConfidence(analysis, originalContent) {
    let confidence = 100;
    const factors = [];

    // Headline presence (20 points)
    if (!analysis.headline || analysis.headline.length < 10) {
      confidence -= 20;
      factors.push('weak_headline');
    }

    // Key messages (15 points)
    if (!analysis.keyMessages || analysis.keyMessages.length === 0) {
      confidence -= 15;
      factors.push('no_key_messages');
    }

    // Data points (15 points)
    if (!analysis.dataPoints || analysis.dataPoints.length === 0) {
      confidence -= 15;
      factors.push('no_data_points');
    }

    // Localizable elements (10 points)
    if (!analysis.localizableElements || analysis.localizableElements.length === 0) {
      confidence -= 10;
      factors.push('no_localizable_elements');
    }

    // Content length (10 points)
    if (originalContent.length < 500) {
      confidence -= 10;
      factors.push('content_too_short');
    }

    // Structure integrity (10 points)
    if (analysis.structure && analysis.structure.paragraphs < 3) {
      confidence -= 10;
      factors.push('poor_structure');
    }

    // AI parsing success (10 points)
    if (analysis.parseError) {
      confidence -= 10;
      factors.push('ai_parse_error');
    }

    // Boilerplate presence (5 points)
    if (!analysis.boilerplate) {
      confidence -= 5;
      factors.push('no_boilerplate');
    }

    // Quotes presence (5 points)
    if (!analysis.quotes || analysis.quotes.length === 0) {
      confidence -= 5;
      factors.push('no_quotes');
    }

    return Math.max(0, Math.min(100, confidence));
  }

  // Helper extraction methods
  _extractHeadline(lines) {
    return lines[0] || '';
  }

  _extractSubheadline(lines) {
    if (lines.length > 1 && lines[1].length > 10 && lines[1].length < 200) {
      return lines[1];
    }
    return '';
  }

  _extractQuotes(content) {
    const quotes = [];
    const matches = content.matchAll(this.patterns.quotes);
    
    for (const match of matches) {
      if (match[1].length > 10) { // Filter out short quotes
        quotes.push({
          text: match[1],
          attribution: this._findAttribution(content, match.index)
        });
      }
    }
    
    return quotes;
  }

  _extractStatistics(content) {
    const stats = [];
    const matches = content.matchAll(this.patterns.statistics);
    
    for (const match of matches) {
      stats.push({
        value: match[0],
        context: this._getContext(content, match.index, 50)
      });
    }
    
    return stats;
  }

  _extractDataPoints(content) {
    const dataPoints = [];
    const matches = content.matchAll(this.patterns.dataPoints);
    
    for (const match of matches) {
      dataPoints.push({
        value: match[0],
        type: this._classifyDataPoint(match[0]),
        context: this._getContext(content, match.index, 30)
      });
    }
    
    return dataPoints;
  }

  _extractMarketReferences(content) {
    const references = [];
    const matches = content.matchAll(this.patterns.marketReferences);
    
    for (const match of matches) {
      references.push({
        term: match[0],
        context: this._getContext(content, match.index, 20)
      });
    }
    
    return references;
  }

  _identifyStructure(paragraphs) {
    return {
      paragraphs: paragraphs.length,
      averageParagraphLength: paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length,
      hasIntroduction: paragraphs.length > 0,
      hasBody: paragraphs.length > 2,
      hasConclusion: paragraphs.length > 1
    };
  }

  _findAttribution(content, quoteIndex) {
    // Look for attribution patterns after the quote
    const afterQuote = content.substring(quoteIndex + 1, quoteIndex + 200);
    const attributionPattern = /(?:said|according to|stated)\s+([^,.]+)/i;
    const match = afterQuote.match(attributionPattern);
    return match ? match[1].trim() : 'unknown';
  }

  _getContext(content, index, length) {
    const start = Math.max(0, index - length);
    const end = Math.min(content.length, index + length);
    return content.substring(start, end).trim();
  }

  _classifyDataPoint(value) {
    if (value.includes('%') || value.includes('percent')) return 'percentage';
    if (value.includes('$')) return 'currency';
    if (value.includes('million') || value.includes('billion')) return 'large_number';
    return 'statistic';
  }

  _extractKeyMessages(basicAnalysis) {
    // Fallback key message extraction from structure
    if (basicAnalysis.structure && basicAnalysis.structure.paragraphs > 1) {
      return ['Market analysis', 'Data insights', 'Company information'];
    }
    return [];
  }

  _combineQuotes(basicQuotes, deepQuotes) {
    const combined = [...basicQuotes];
    
    if (deepQuotes && Array.isArray(deepQuotes)) {
      for (const deepQuote of deepQuotes) {
        if (!combined.find(q => q.text === deepQuote.text)) {
          combined.push(deepQuote);
        }
      }
    }
    
    return combined;
  }

  _combineDataPoints(basicData, deepData) {
    const combined = [...basicData];
    
    if (deepData && Array.isArray(deepData)) {
      for (const deepPoint of deepData) {
        if (!combined.find(d => d.value === deepPoint.value)) {
          combined.push(deepPoint);
        }
      }
    }
    
    return combined;
  }

  _identifyLocalizableElements(basicAnalysis) {
    const elements = [];
    
    if (basicAnalysis.headline) elements.push('headline');
    if (basicAnalysis.statistics.length > 0) elements.push('statistics');
    if (basicAnalysis.marketReferences.length > 0) elements.push('market_references');
    if (basicAnalysis.dataPoints.length > 0) elements.push('data_points');
    
    return elements;
  }

  _extractBoilerplate(basicAnalysis) {
    // Simple heuristic: last paragraph is often boilerplate
    if (basicAnalysis.structure && basicAnalysis.structure.paragraphs > 2) {
      return 'Company boilerplate text identified';
    }
    return '';
  }

  /**
   * Validate pipeline content to prevent empty outputs
   * PHASE 2 ENHANCEMENT: Pipeline validation and content structure validation
   */
  validatePipelineContent(content, marketData, options = {}) {
    const validation = {
      isValid: true,
      issues: [],
      warnings: [],
      score: 100,
      marketSpecificElements: []
    };

    try {
      // Check for empty or minimal content
      if (!content || typeof content !== 'string' || content.trim().length < 50) {
        validation.isValid = false;
        validation.issues.push('Content is empty or too short');
        validation.score -= 50;
      }

      // Check for placeholder text
      const placeholderPatterns = [
        /\[placeholder\]/gi,
        /\[insert.*?\]/gi,
        /\{.*?\}/g,
        /lorem ipsum/gi,
        /sample text/gi,
        /example content/gi
      ];

      for (const pattern of placeholderPatterns) {
        if (pattern.test(content)) {
          validation.isValid = false;
          validation.issues.push('Content contains placeholder text');
          validation.score -= 30;
          break;
        }
      }

      // Check for market-specific elements
      if (marketData && marketData.basic) {
        const marketName = marketData.basic.name;
        const marketRegion = marketData.basic.region;
        
        // Check for market name reference
        if (marketName && content.toLowerCase().includes(marketName.toLowerCase())) {
          validation.marketSpecificElements.push('Market name referenced');
          validation.score += 10;
        } else {
          validation.warnings.push('Market name not referenced in content');
          validation.score -= 10;
        }

        // Check for regional context
        if (marketRegion && content.toLowerCase().includes(marketRegion.toLowerCase())) {
          validation.marketSpecificElements.push('Regional context included');
          validation.score += 5;
        }

        // Check for market personality elements
        if (marketData.context && marketData.context.personality) {
          const personality = marketData.context.personality;
          
          // Check for personality-specific terminology
          if (personality.terminology) {
            let terminologyFound = 0;
            for (const term of personality.terminology) {
              if (content.toLowerCase().includes(term.toLowerCase())) {
                terminologyFound++;
              }
            }
            
            if (terminologyFound > 0) {
              validation.marketSpecificElements.push(`Market terminology used (${terminologyFound} terms)`);
              validation.score += Math.min(terminologyFound * 5, 20);
            } else {
              validation.warnings.push('No market-specific terminology found');
              validation.score -= 15;
            }
          }
        }
      }

      // Check content structure
      const structureValidation = this._validateContentStructure(content);
      validation.issues.push(...structureValidation.issues);
      validation.warnings.push(...structureValidation.warnings);
      validation.score += structureValidation.scoreAdjustment;

      // Ensure minimum score
      validation.score = Math.max(0, Math.min(100, validation.score));

      // Final validation check
      if (validation.issues.length > 0) {
        validation.isValid = false;
      }

      this.log('debug', 'Pipeline content validation completed', {
        isValid: validation.isValid,
        score: validation.score,
        issues: validation.issues.length,
        warnings: validation.warnings.length,
        marketElements: validation.marketSpecificElements.length,
        jobId: options.jobId
      });

      return validation;

    } catch (error) {
      this.log('error', 'Pipeline content validation failed', {
        error: error.message,
        jobId: options.jobId
      });
      
      return {
        isValid: false,
        issues: ['Validation process failed'],
        warnings: [],
        score: 0,
        marketSpecificElements: []
      };
    }
  }

  /**
   * Validate content structure for press release standards
   */
  _validateContentStructure(content) {
    const validation = {
      issues: [],
      warnings: [],
      scoreAdjustment: 0
    };

    // Check for basic press release structure
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 3) {
      validation.issues.push('Content lacks proper structure (too few paragraphs)');
      validation.scoreAdjustment -= 20;
    }

    // Check for headline (first line should be substantial)
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length < 20) {
        validation.warnings.push('Headline appears too short');
        validation.scoreAdjustment -= 5;
      } else if (firstLine.length > 150) {
        validation.warnings.push('Headline appears too long');
        validation.scoreAdjustment -= 3;
      } else {
        validation.scoreAdjustment += 5;
      }
    }

    // Check for quotes (professional press releases should have quotes)
    const quotePattern = /"([^"]+)"/g;
    const quotes = content.match(quotePattern);
    
    if (!quotes || quotes.length === 0) {
      validation.warnings.push('No quotes found - press releases typically include quotes');
      validation.scoreAdjustment -= 10;
    } else {
      validation.scoreAdjustment += 10;
    }

    // Check for data/statistics
    const numberPattern = /\b\d+(?:,\d{3})*(?:\.\d+)?(?:%|\s*percent|\s*million|\s*billion)\b/g;
    const numbers = content.match(numberPattern);
    
    if (!numbers || numbers.length === 0) {
      validation.warnings.push('No statistics or data points found');
      validation.scoreAdjustment -= 5;
    } else {
      validation.scoreAdjustment += 5;
    }

    return validation;
  }

  /**
   * Analyze content for market-specific quality elements
   * PHASE 2 ENHANCEMENT: Market-specific quality scoring
   */
  analyzeMarketSpecificQuality(content, marketData, options = {}) {
    const analysis = {
      marketPersonalityScore: 0,
      terminologyScore: 0,
      localizationScore: 0,
      overallMarketScore: 0,
      recommendations: []
    };

    try {
      if (!marketData || !marketData.context) {
        analysis.recommendations.push('No market data available for quality analysis');
        return analysis;
      }

      const personality = marketData.context.personality;
      if (!personality) {
        analysis.recommendations.push('No market personality data available');
        return analysis;
      }

      // Analyze market personality adoption
      if (personality.traits) {
        let personalityMatches = 0;
        const contentLower = content.toLowerCase();
        
        for (const trait of personality.traits) {
          // Check for trait-related language patterns
          if (trait.toLowerCase().includes('direct') && this._hasDirectLanguage(content)) {
            personalityMatches++;
          } else if (trait.toLowerCase().includes('luxury') && this._hasLuxuryLanguage(content)) {
            personalityMatches++;
          } else if (trait.toLowerCase().includes('family') && this._hasFamilyLanguage(content)) {
            personalityMatches++;
          } else if (trait.toLowerCase().includes('business') && this._hasBusinessLanguage(content)) {
            personalityMatches++;
          }
        }
        
        analysis.marketPersonalityScore = Math.min(100, (personalityMatches / personality.traits.length) * 100);
      }

      // Analyze terminology usage
      if (personality.terminology) {
        let terminologyMatches = 0;
        const contentLower = content.toLowerCase();
        
        for (const term of personality.terminology) {
          if (contentLower.includes(term.toLowerCase())) {
            terminologyMatches++;
          }
        }
        
        analysis.terminologyScore = Math.min(100, (terminologyMatches / personality.terminology.length) * 100);
      }

      // Analyze localization elements
      const localizationElements = [
        marketData.basic?.name,
        marketData.basic?.region,
        ...(personality.terminology || [])
      ].filter(Boolean);

      let localizationMatches = 0;
      const contentLower = content.toLowerCase();
      
      for (const element of localizationElements) {
        if (contentLower.includes(element.toLowerCase())) {
          localizationMatches++;
        }
      }
      
      analysis.localizationScore = localizationElements.length > 0
        ? Math.min(100, (localizationMatches / localizationElements.length) * 100)
        : 0;

      // Calculate overall market score
      analysis.overallMarketScore = Math.round(
        (analysis.marketPersonalityScore * 0.4 +
         analysis.terminologyScore * 0.4 +
         analysis.localizationScore * 0.2)
      );

      // Generate recommendations
      if (analysis.marketPersonalityScore < 50) {
        analysis.recommendations.push('Content should better reflect market personality traits');
      }
      
      if (analysis.terminologyScore < 50) {
        analysis.recommendations.push('Use more market-specific terminology');
      }
      
      if (analysis.localizationScore < 50) {
        analysis.recommendations.push('Include more local market references');
      }

      this.log('debug', 'Market-specific quality analysis completed', {
        overallScore: analysis.overallMarketScore,
        personalityScore: analysis.marketPersonalityScore,
        terminologyScore: analysis.terminologyScore,
        localizationScore: analysis.localizationScore,
        jobId: options.jobId
      });

      return analysis;

    } catch (error) {
      this.log('error', 'Market-specific quality analysis failed', {
        error: error.message,
        jobId: options.jobId
      });
      
      analysis.recommendations.push('Quality analysis failed - using default scoring');
      return analysis;
    }
  }

  // Helper methods for personality analysis
  _hasDirectLanguage(content) {
    const directPatterns = [/\bdirect(ly)?\b/i, /\bstraight\b/i, /\bimmediately\b/i, /\bnow\b/i];
    return directPatterns.some(pattern => pattern.test(content));
  }

  _hasLuxuryLanguage(content) {
    const luxuryPatterns = [/\bluxury\b/i, /\bpremium\b/i, /\bexclusive\b/i, /\bupscale\b/i, /\bhigh-end\b/i];
    return luxuryPatterns.some(pattern => pattern.test(content));
  }

  _hasFamilyLanguage(content) {
    const familyPatterns = [/\bfamily\b/i, /\bschool\b/i, /\bchildren\b/i, /\bcommunity\b/i, /\bneighborhood\b/i];
    return familyPatterns.some(pattern => pattern.test(content));
  }

  _hasBusinessLanguage(content) {
    const businessPatterns = [/\bbusiness\b/i, /\bcommercial\b/i, /\binvestment\b/i, /\beconomic\b/i, /\bgrowth\b/i];
    return businessPatterns.some(pattern => pattern.test(content));
  }

  /**
   * FRAMEWORK EXTRACTION METHODS
   * Enhanced Structural Framework Preservation Implementation
   */

  /**
   * Extract PR Framework from master press release
   * Main entry point for framework extraction with comprehensive analysis
   */
  async extractPRFramework(masterPR, options = {}) {
    const startTime = Date.now();
    const jobId = options.jobId || `framework-${Date.now()}`;
    
    this.agentLogger.actionStarted('PR Framework Extraction', {
      contentLength: masterPR.length,
      jobId: jobId,
      extractionMode: 'comprehensive'
    });

    try {
      // Use FrameworkExtractor for comprehensive analysis
      const framework = await this.frameworkExtractor.extractFramework(masterPR, {
        ...options,
        jobId: jobId
      });

      this.agentLogger.actionCompleted('PR Framework Extraction', Date.now() - startTime, {
        success: true,
        frameworkElements: Object.keys(framework),
        paragraphCount: framework.paragraphs?.length || 0,
        themeCount: framework.themes?.length || 0,
        dataPointCount: framework.dataPoints?.length || 0,
        jobId: jobId
      });

      return framework;

    } catch (error) {
      this.agentLogger.error('Framework extraction failed', error, {
        contentLength: masterPR.length,
        jobId: jobId,
        processingTime: Date.now() - startTime
      });

      // Return fallback framework structure
      return this._createFallbackFramework(masterPR, jobId);
    }
  }

  /**
   * Detect contradictions between master PR and local market data
   */
  async detectNarrativeContradictions(framework, localMarketData, options = {}) {
    const jobId = options.jobId || `contradiction-${Date.now()}`;
    
    this.agentLogger.actionStarted('Contradiction Detection', {
      frameworkDataPoints: framework.dataPoints?.length || 0,
      localDataAvailable: !!localMarketData,
      jobId: jobId
    });

    try {
      const contradictions = await this.frameworkExtractor.detectContradictions(
        framework,
        localMarketData,
        { ...options, jobId: jobId }
      );

      this.agentLogger.actionCompleted('Contradiction Detection', 0, {
        contradictionsFound: contradictions.length,
        contradictionTypes: contradictions.map(c => c.type),
        jobId: jobId
      });

      return contradictions;

    } catch (error) {
      this.agentLogger.error('Contradiction detection failed', error, {
        jobId: jobId
      });
      return [];
    }
  }

  /**
   * Analyze framework for adaptation requirements
   */
  analyzeFrameworkAdaptation(framework, contradictions, options = {}) {
    const jobId = options.jobId || `adaptation-${Date.now()}`;
    
    this.agentLogger.actionStarted('Framework Adaptation Analysis', {
      contradictionCount: contradictions.length,
      frameworkParagraphs: framework.paragraphs?.length || 0,
      jobId: jobId
    });

    const adaptationPlan = {
      requiresAdaptation: contradictions.length > 0,
      adaptationLevel: this._determineAdaptationLevel(contradictions),
      paragraphsToAdapt: [],
      preservedElements: [],
      adaptationStrategies: []
    };

    // Identify paragraphs requiring adaptation
    for (const contradiction of contradictions) {
      if (contradiction.paragraphIndex !== undefined) {
        adaptationPlan.paragraphsToAdapt.push({
          index: contradiction.paragraphIndex,
          reason: contradiction.type,
          severity: contradiction.severity,
          originalClaim: contradiction.masterClaim,
          localData: contradiction.localData
        });
      }
    }

    // Identify elements to preserve
    adaptationPlan.preservedElements = framework.paragraphs
      .filter((_, index) => !adaptationPlan.paragraphsToAdapt.find(p => p.index === index))
      .map((para, index) => ({
        index: index,
        purpose: para.purpose,
        preservationReason: 'No contradictions detected'
      }));

    // Define adaptation strategies based on contradiction types
    const contradictionTypes = [...new Set(contradictions.map(c => c.type))];
    adaptationPlan.adaptationStrategies = this._defineAdaptationStrategies(contradictionTypes);

    this.agentLogger.actionCompleted('Framework Adaptation Analysis', 0, {
      requiresAdaptation: adaptationPlan.requiresAdaptation,
      adaptationLevel: adaptationPlan.adaptationLevel,
      paragraphsToAdapt: adaptationPlan.paragraphsToAdapt.length,
      preservedElements: adaptationPlan.preservedElements.length,
      strategies: adaptationPlan.adaptationStrategies.length,
      jobId: jobId
    });

    return adaptationPlan;
  }

  /**
   * Create fallback framework when extraction fails
   */
  _createFallbackFramework(masterPR, jobId) {
    this.agentLogger.info('Creating fallback framework structure', {
      contentLength: masterPR.length,
      jobId: jobId
    });

    const paragraphs = masterPR.split('\n\n').filter(p => p.trim().length > 0);
    
    return {
      metadata: {
        extractionMethod: 'fallback',
        timestamp: new Date().toISOString(),
        contentLength: masterPR.length,
        paragraphCount: paragraphs.length
      },
      structure: {
        totalParagraphs: paragraphs.length,
        hasHeadline: paragraphs.length > 0,
        hasBody: paragraphs.length > 1,
        hasConclusion: paragraphs.length > 2
      },
      paragraphs: paragraphs.map((para, index) => ({
        index: index,
        content: para.trim(),
        purpose: this._inferParagraphPurpose(para, index, paragraphs.length),
        claims: [],
        dataPoints: [],
        adaptable: true
      })),
      themes: ['market_analysis', 'company_information'],
      dataPoints: [],
      adaptationRules: {
        preserveStructure: true,
        allowParagraphModification: true,
        maintainTone: true
      }
    };
  }

  /**
   * Infer paragraph purpose for fallback framework
   */
  _inferParagraphPurpose(paragraph, index, totalParagraphs) {
    if (index === 0) return 'headline';
    if (index === 1 && totalParagraphs > 2) return 'introduction';
    if (index === totalParagraphs - 1 && totalParagraphs > 2) return 'conclusion';
    return 'body';
  }

  /**
   * Determine adaptation level based on contradictions
   */
  _determineAdaptationLevel(contradictions) {
    if (contradictions.length === 0) return 'none';
    
    const severityLevels = contradictions.map(c => c.severity || 'medium');
    const highSeverity = severityLevels.filter(s => s === 'high').length;
    const mediumSeverity = severityLevels.filter(s => s === 'medium').length;
    
    if (highSeverity > 0) return 'major';
    if (mediumSeverity > 2) return 'moderate';
    return 'minor';
  }

  /**
   * Define adaptation strategies based on contradiction types
   */
  _defineAdaptationStrategies(contradictionTypes) {
    const strategies = [];
    
    if (contradictionTypes.includes('trend_direction')) {
      strategies.push({
        type: 'trend_reversal',
        description: 'Adapt trend direction to match local market data',
        technique: 'Conflicting Evidence Resolution'
      });
    }
    
    if (contradictionTypes.includes('market_performance')) {
      strategies.push({
        type: 'performance_adjustment',
        description: 'Adjust performance metrics to local market reality',
        technique: 'Multi-Factor Trend Analysis'
      });
    }
    
    if (contradictionTypes.includes('statistical_variance')) {
      strategies.push({
        type: 'statistical_localization',
        description: 'Replace national statistics with local equivalents',
        technique: 'Cross-Domain Knowledge Translation'
      });
    }
    
    return strategies;
  }
}

module.exports = ContentAnalyzerAgent;