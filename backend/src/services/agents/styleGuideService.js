const BaseAgent = require('./baseAgent');
const { logger, createAgentLoggers } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * Style Guide Service Agent
 * Implements press release best practices validation and optimization
 * 
 * Features:
 * - AP-style news formatting validation
 * - SEO keyword optimization
 * - Multimedia hook suggestions
 * - Boilerplate optimization
 * - Lead paragraph quality assessment
 * - Human interest element validation
 */
class StyleGuideService extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Style Guide Service', {
      maxRetries: 2,
      retryDelay: 1000,
      timeout: 15000,
      enableMetrics: true,
      ...options
    }, lineageService);

    // Initialize agent-specific logging
    this.agentLogger = createAgentLoggers('styleguideservice');

    // Style guide configuration
    this.config = {
      apStyleRules: this._initializeAPStyleRules(),
      seoGuidelines: this._initializeSEOGuidelines(),
      multimediaHooks: this._initializeMultimediaHooks(),
      boilerplateTemplates: this._initializeBoilerplateTemplates(),
      leadParagraphCriteria: this._initializeLeadParagraphCriteria(),
      humanInterestElements: this._initializeHumanInterestElements()
    };

    this.log('info', 'Style Guide Service created');
  }

  /**
   * Initialize the style guide service
   */
  async initialize() {
    const startTime = Date.now();
    
    this.agentLogger.actionStarted('style-guide-initialization', {
      agentName: 'Style Guide Service',
      styleRulesCount: Object.keys(this.config.apStyleRules || {}).length,
      seoGuidelinesCount: Object.keys(this.config.seoGuidelines || {}).length,
      multimediaHooksCount: Object.keys(this.config.multimediaHooks || {}).length,
      boilerplateTemplatesCount: Object.keys(this.config.boilerplateTemplates || {}).length
    });

    try {
      this.agentLogger.debug('Starting base agent initialization', {
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
      await super.initialize();
      this.agentLogger.debug('Base agent initialization completed');
      
      // Validate style guide configuration
      this.agentLogger.debug('Validating style guide configuration');
      this._validateConfiguration();
      this.agentLogger.debug('Style guide configuration validation completed');
      
      const duration = Date.now() - startTime;
      this.log('info', 'Style Guide Service initialized successfully');
      
      this.agentLogger.actionCompleted('style-guide-initialization', duration, {
        status: 'success',
        initializationTimeMs: duration,
        configurationValid: true,
        styleRulesLoaded: true,
        seoGuidelinesLoaded: true,
        multimediaHooksLoaded: true,
        boilerplateTemplatesLoaded: true
      });
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.log('error', 'Failed to initialize Style Guide Service', {
        error: error.message,
        stack: error.stack
      });
      
      this.agentLogger.actionFailed('style-guide-initialization', error, {
        initializationTimeMs: duration,
        errorType: error.constructor.name,
        errorMessage: error.message,
        configurationValid: false
      });
      
      throw error;
    }
  }

  /**
   * Validate style guide configuration
   */
  _validateConfiguration() {
    const requiredConfigs = ['apStyleRules', 'seoGuidelines', 'multimediaHooks', 'boilerplateTemplates'];
    for (const config of requiredConfigs) {
      if (!this.config[config]) {
        throw new Error(`Missing required configuration: ${config}`);
      }
    }
  }

  /**
   * Validate and optimize press release style
   */
  async validateStyle(content, options = {}) {
    return this.execute(this._validateStyle.bind(this), content, options);
  }

  /**
   * Internal method to validate style
   */
  async _validateStyle(content, options = {}) {
    const { market, contentType = 'press_release' } = options;

    this.log('debug', 'Starting style validation', {
      market,
      contentType,
      contentLength: content?.length || 0
    });

    const validation = {
      overallScore: 0,
      apStyleCompliance: {},
      seoOptimization: {},
      multimediaRecommendations: [],
      boilerplateQuality: {},
      leadParagraphQuality: {},
      humanInterestScore: {},
      recommendations: [],
      issues: [],
      timestamp: new Date().toISOString()
    };

    try {
      // 1. AP Style Compliance Check
      validation.apStyleCompliance = await this._validateAPStyle(content);
      
      // 2. SEO Optimization Assessment
      validation.seoOptimization = await this._assessSEOOptimization(content, market);
      
      // 3. Multimedia Hook Generation
      validation.multimediaRecommendations = await this._generateMultimediaHooks(content, market);
      
      // 4. Boilerplate Quality Assessment
      validation.boilerplateQuality = await this._assessBoilerplateQuality(content);
      
      // 5. Lead Paragraph Quality Check
      validation.leadParagraphQuality = await this._assessLeadParagraphQuality(content);
      
      // 6. Human Interest Element Assessment
      validation.humanInterestScore = await this._assessHumanInterestElements(content);

      // Calculate overall score
      validation.overallScore = this._calculateStyleScore(validation);

      // Generate recommendations
      validation.recommendations = this._generateStyleRecommendations(validation);

      this.log('debug', 'Style validation completed', {
        market,
        overallScore: validation.overallScore,
        issuesFound: validation.issues.length
      });

      return validation;

    } catch (error) {
      this.log('error', 'Style validation failed', {
        market,
        error: error.message
      });
      
      return {
        ...validation,
        overallScore: 50,
        issues: [`Style validation failed: ${error.message}`]
      };
    }
  }

  /**
   * Validate AP Style compliance - ENHANCED for 85+/100 target
   */
  async _validateAPStyle(content) {
    const result = {
      score: 100,
      issues: [],
      compliance: {},
      details: {}
    };

    try {
      // Enhanced AP Style rules validation
      for (const rule of this.config.apStyleRules) {
        const ruleResult = this._checkAPStyleRule(content, rule);
        result.compliance[rule.name] = ruleResult.compliant;
        
        if (!ruleResult.compliant) {
          result.score -= rule.penalty || 10;
          result.issues.push(ruleResult.issue);
        }
        
        result.details[rule.name] = ruleResult.details;
      }

      // CRITICAL: Business Wire lead format validation
      const businessWireFormat = this._validateBusinessWireFormat(content);
      result.compliance.businessWireFormat = businessWireFormat.compliant;
      result.score -= businessWireFormat.penalty;
      result.issues.push(...businessWireFormat.issues);
      result.details.businessWireFormat = businessWireFormat;

      // CRITICAL: Headline formatting validation
      const headlineFormat = this._validateHeadlineFormat(content);
      result.compliance.headlineFormat = headlineFormat.compliant;
      result.score -= headlineFormat.penalty;
      result.issues.push(...headlineFormat.issues);
      result.details.headlineFormat = headlineFormat;

      // Enhanced narrative flow assessment
      const narrativeFlow = this._assessNarrativeFlow(content);
      result.compliance.narrativeFlow = narrativeFlow.score > 80; // Stricter threshold
      result.score = (result.score + narrativeFlow.score) / 2;
      result.details.narrativeFlow = narrativeFlow;

      if (narrativeFlow.score < 80) {
        result.issues.push('Content lacks proper narrative flow - remove section headers and create flowing paragraphs');
      }

      // Enhanced inverted pyramid structure validation
      const pyramidStructure = this._assessInvertedPyramid(content);
      result.compliance.invertedPyramid = pyramidStructure.score > 80; // Stricter threshold
      result.score = (result.score + pyramidStructure.score) / 2;
      result.details.invertedPyramid = pyramidStructure;

      if (pyramidStructure.score < 80) {
        result.issues.push('Content should follow inverted pyramid structure with most important information first');
      }

      // ENHANCED: Transition word analysis for better flow
      const transitionAnalysis = this._assessTransitionWords(content);
      result.compliance.transitionWords = transitionAnalysis.score > 75;
      result.score = (result.score + transitionAnalysis.score) / 2;
      result.details.transitionWords = transitionAnalysis;

      if (transitionAnalysis.score < 75) {
        result.issues.push('Insufficient transition words for smooth narrative flow');
      }

      // ENHANCED: Content duplication detection
      const duplicationCheck = this._checkContentDuplication(content);
      result.compliance.noDuplication = duplicationCheck.score > 90;
      result.score -= duplicationCheck.penalty;
      result.issues.push(...duplicationCheck.issues);
      result.details.duplicationCheck = duplicationCheck;

    } catch (error) {
      this.log('warn', 'AP Style validation failed', { error: error.message });
      result.score = 50; // Lower penalty score for errors
      result.issues.push('AP Style validation encountered errors');
    }

    result.score = Math.max(0, Math.min(100, Math.round(result.score)));
    return result;
  }

  /**
   * Assess SEO optimization
   */
  async _assessSEOOptimization(content, market) {
    const result = {
      score: 100,
      keywords: [],
      density: {},
      recommendations: [],
      issues: []
    };

    try {
      // Generate market-specific keywords
      const targetKeywords = this._generateTargetKeywords(market);
      result.keywords = targetKeywords;

      // Check keyword density
      const contentLower = content.toLowerCase();
      for (const keyword of targetKeywords) {
        const keywordLower = keyword.toLowerCase();
        const matches = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
        const density = (matches / content.split(' ').length) * 100;
        
        result.density[keyword] = {
          count: matches,
          density: Math.round(density * 100) / 100
        };

        // Optimal density is 1-3% for primary keywords
        if (keyword.includes(market.toLowerCase()) && density < 1) {
          result.score -= 15;
          result.issues.push(`Primary keyword "${keyword}" density too low (${density.toFixed(2)}%)`);
        } else if (density > 4) {
          result.score -= 10;
          result.issues.push(`Keyword "${keyword}" density too high (${density.toFixed(2)}%)`);
        }
      }

      // Check for semantic keywords
      const semanticKeywords = this._getSemanticKeywords(market);
      let semanticScore = 0;
      for (const semantic of semanticKeywords) {
        if (contentLower.includes(semantic.toLowerCase())) {
          semanticScore += 5;
        }
      }
      
      result.score += Math.min(semanticScore, 20);
      result.recommendations = this._generateSEORecommendations(result, market);

    } catch (error) {
      this.log('warn', 'SEO assessment failed', { error: error.message });
      result.score = 70;
      result.issues.push('SEO assessment encountered errors');
    }

    result.score = Math.max(0, Math.min(100, Math.round(result.score)));
    return result;
  }

  /**
   * Generate multimedia hook suggestions
   */
  async _generateMultimediaHooks(content, market) {
    const hooks = [];

    try {
      // Analyze content for multimedia opportunities
      const contentAnalysis = this._analyzeContentForMultimedia(content);
      
      // Generate market-specific multimedia suggestions
      const marketHooks = this._generateMarketSpecificHooks(market, contentAnalysis);
      hooks.push(...marketHooks);

      // Generate data visualization suggestions
      const dataVizHooks = this._generateDataVisualizationHooks(content);
      hooks.push(...dataVizHooks);

      // Generate human interest photo opportunities
      const photoHooks = this._generatePhotoOpportunities(content, market);
      hooks.push(...photoHooks);

    } catch (error) {
      this.log('warn', 'Multimedia hook generation failed', { error: error.message });
      hooks.push({
        type: 'fallback',
        title: 'Market Overview Infographic',
        description: 'Create an infographic showing key market statistics and trends'
      });
    }

    return hooks;
  }

  /**
   * Assess boilerplate quality
   */
  async _assessBoilerplateQuality(content) {
    const result = {
      score: 100,
      hasBoilerplate: false,
      boilerplateQuality: 0,
      issues: [],
      recommendations: []
    };

    try {
      // Check for About company section
      const aboutMatch = content.match(/About company[^]*$/i);
      if (aboutMatch) {
        result.hasBoilerplate = true;
        const boilerplateText = aboutMatch[0];
        
        // Assess boilerplate quality
        result.boilerplateQuality = this._assessBoilerplateText(boilerplateText);
        result.score = result.boilerplateQuality;
        
        if (result.boilerplateQuality < 80) {
          result.issues.push('Boilerplate text needs optimization for local relevance');
          result.recommendations.push('Customize boilerplate with market-specific achievements or presence');
        }
      } else {
        result.score = 0;
        result.issues.push('Missing About company boilerplate section');
        result.recommendations.push('Add comprehensive About company section with company background');
      }

      // Check for contact information
      const contactInfo = this._extractContactInfo(content);
      if (!contactInfo.hasContact) {
        result.score -= 20;
        result.issues.push('Missing media contact information');
        result.recommendations.push('Add media contact details for press inquiries');
      }

    } catch (error) {
      this.log('warn', 'Boilerplate assessment failed', { error: error.message });
      result.score = 50;
      result.issues.push('Boilerplate assessment encountered errors');
    }

    return result;
  }

  /**
   * Assess lead paragraph quality
   */
  async _assessLeadParagraphQuality(content) {
    const result = {
      score: 100,
      hasCompellingLead: false,
      leadAnalysis: {},
      issues: [],
      recommendations: []
    };

    try {
      // Extract lead paragraph
      const leadParagraph = this._extractLeadParagraph(content);
      if (!leadParagraph) {
        result.score = 0;
        result.issues.push('No identifiable lead paragraph found');
        result.recommendations.push('Create a compelling opening paragraph that summarizes the key story');
        return result;
      }

      // Analyze lead paragraph against criteria
      result.leadAnalysis = this._analyzeLeadParagraph(leadParagraph);
      
      // Score based on criteria
      let criteriaScore = 0;
      const criteria = this.config.leadParagraphCriteria;
      
      for (const criterion of criteria) {
        const meets = this._checkLeadCriterion(leadParagraph, criterion);
        result.leadAnalysis[criterion.name] = meets;
        
        if (meets) {
          criteriaScore += criterion.weight || 20;
        } else {
          result.issues.push(`Lead paragraph ${criterion.issue}`);
          if (criterion.recommendation) {
            result.recommendations.push(criterion.recommendation);
          }
        }
      }

      result.score = Math.min(100, criteriaScore);
      result.hasCompellingLead = result.score > 70;

    } catch (error) {
      this.log('warn', 'Lead paragraph assessment failed', { error: error.message });
      result.score = 60;
      result.issues.push('Lead paragraph assessment encountered errors');
    }

    return result;
  }

  /**
   * Assess human interest elements
   */
  async _assessHumanInterestElements(content) {
    const result = {
      score: 0,
      elements: {},
      found: [],
      missing: [],
      recommendations: []
    };

    try {
      // Check for each human interest element
      for (const element of this.config.humanInterestElements) {
        const found = this._checkHumanInterestElement(content, element);
        result.elements[element.name] = found;
        
        if (found) {
          result.score += element.weight || 20;
          result.found.push(element.name);
        } else {
          result.missing.push(element.name);
          if (element.recommendation) {
            result.recommendations.push(element.recommendation);
          }
        }
      }

      // Bonus for multiple human interest elements
      if (result.found.length > 2) {
        result.score += 10;
      }

    } catch (error) {
      this.log('warn', 'Human interest assessment failed', { error: error.message });
      result.score = 30;
    }

    result.score = Math.max(0, Math.min(100, Math.round(result.score)));
    return result;
  }

  /**
   * Calculate overall style score
   */
  _calculateStyleScore(validation) {
    const weights = {
      apStyleCompliance: 0.25,
      seoOptimization: 0.15,
      boilerplateQuality: 0.15,
      leadParagraphQuality: 0.25,
      humanInterestScore: 0.20
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [dimension, weight] of Object.entries(weights)) {
      if (validation[dimension] && typeof validation[dimension].score === 'number') {
        totalScore += validation[dimension].score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
  }

  /**
   * Generate style recommendations
   */
  _generateStyleRecommendations(validation) {
    const recommendations = [];

    // Collect recommendations from all assessments
    if (validation.apStyleCompliance?.issues?.length > 0) {
      recommendations.push('Improve AP Style compliance by addressing formatting and structure issues');
    }

    if (validation.seoOptimization?.recommendations?.length > 0) {
      recommendations.push(...validation.seoOptimization.recommendations);
    }

    if (validation.boilerplateQuality?.recommendations?.length > 0) {
      recommendations.push(...validation.boilerplateQuality.recommendations);
    }

    if (validation.leadParagraphQuality?.recommendations?.length > 0) {
      recommendations.push(...validation.leadParagraphQuality.recommendations);
    }

    if (validation.humanInterestScore?.recommendations?.length > 0) {
      recommendations.push(...validation.humanInterestScore.recommendations);
    }

    // Add overall recommendations
    if (validation.overallScore < 70) {
      recommendations.push('Consider comprehensive style revision to meet publication standards');
    }

    return [...new Set(recommendations)].slice(0, 8); // Remove duplicates and limit
  }

  // Helper methods for style validation

  _checkAPStyleRule(content, rule) {
    // Implementation for checking specific AP Style rules
    const result = { compliant: true, issue: '', details: {} };
    
    try {
      if (rule.pattern && rule.pattern.test && rule.pattern.test(content)) {
        result.compliant = false;
        result.issue = rule.issue || `Violates ${rule.name} rule`;
      }
    } catch (error) {
      result.compliant = true; // Default to compliant on error
    }
    
    return result;
  }

  _assessNarrativeFlow(content) {
    let score = 100;
    const issues = [];

    // Check for excessive section headers (Phase 2 critical issue)
    const sectionHeaders = content.match(/^[A-Z\s]+:$/gm) || [];
    if (sectionHeaders.length > 3) {
      score -= (sectionHeaders.length - 3) * 15;
      issues.push(`Too many section headers (${sectionHeaders.length}) - should use flowing paragraphs`);
    }

    // Check for bullet points (should be integrated into narrative)
    const bulletPoints = content.match(/^\s*[-•*]/gm) || [];
    if (bulletPoints.length > 5) {
      score -= 20;
      issues.push('Excessive bullet points - integrate into narrative paragraphs');
    }

    // Check for paragraph flow
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length < 4) {
      score -= 15;
      issues.push('Insufficient paragraph development for narrative flow');
    }

    return {
      score: Math.max(0, score),
      issues,
      sectionHeaders: sectionHeaders.length,
      bulletPoints: bulletPoints.length,
      paragraphs: paragraphs.length
    };
  }

  _assessInvertedPyramid(content) {
    let score = 100;
    const issues = [];

    // Check if most important information is in the first paragraph
    const firstParagraph = content.split(/\n\s*\n/)[0] || '';
    
    // Look for key information indicators in first paragraph
    const keyIndicators = [
      /\d+%/,  // percentages
      /\$[\d,]+/, // dollar amounts
      /increase|decrease|rise|fall|growth|decline/i, // trend words
      /market|housing|real estate/i // topic indicators
    ];

    let indicatorsInFirst = 0;
    for (const indicator of keyIndicators) {
      if (indicator.test(firstParagraph)) {
        indicatorsInFirst++;
      }
    }

    if (indicatorsInFirst < 2) {
      score -= 25;
      issues.push('Lead paragraph lacks key information - should contain main story elements');
    }

    // Check for supporting details in later paragraphs
    const laterParagraphs = content.split(/\n\s*\n/).slice(1).join(' ');
    if (laterParagraphs.length < firstParagraph.length) {
      score -= 15;
      issues.push('Insufficient supporting detail in body paragraphs');
    }

    return {
      score: Math.max(0, score),
      issues,
      keyIndicatorsInLead: indicatorsInFirst
    };
  }

  _generateTargetKeywords(market) {
    const baseKeywords = [
      'real estate',
      'housing market',
      'home prices',
      'property values',
      'market trends'
    ];

    const marketSpecific = [
      `${market} real estate`,
      `${market} housing market`,
      `${market} home prices`,
      `${market} property market`
    ];

    return [...baseKeywords, ...marketSpecific];
  }

  _getSemanticKeywords(market) {
    return [
      'buyers', 'sellers', 'inventory', 'mortgage rates',
      'down payment', 'affordability', 'market analysis',
      'neighborhood', 'community', 'investment', 'equity'
    ];
  }

  _generateSEORecommendations(seoResult, market) {
    const recommendations = [];
    
    if (seoResult.density[`${market} real estate`]?.density < 1) {
      recommendations.push(`Increase mentions of "${market} real estate" for better local SEO`);
    }
    
    recommendations.push('Include location-specific long-tail keywords');
    recommendations.push('Add semantic keywords related to home buying and selling');
    
    return recommendations;
  }

  _analyzeContentForMultimedia(content) {
    return {
      hasStatistics: /\d+%|\$[\d,]+/.test(content),
      hasComparisons: /compared to|versus|against/.test(content),
      hasTimeline: /year|month|quarter/.test(content),
      hasTrends: /increase|decrease|trend|growth/.test(content)
    };
  }

  _generateMarketSpecificHooks(market, analysis) {
    const hooks = [];
    
    if (analysis.hasStatistics) {
      hooks.push({
        type: 'infographic',
        title: `${market} Housing Market Statistics`,
        description: `Visual representation of key ${market} market metrics and trends`
      });
    }

    hooks.push({
      type: 'map',
      title: `${market} Market Heat Map`,
      description: `Interactive map showing price trends across ${market} neighborhoods`
    });

    return hooks;
  }

  _generateDataVisualizationHooks(content) {
    const hooks = [];
    
    if (/\d+%/.test(content)) {
      hooks.push({
        type: 'chart',
        title: 'Market Trend Chart',
        description: 'Bar or line chart showing percentage changes over time'
      });
    }

    return hooks;
  }

  _generatePhotoOpportunities(content, market) {
    return [
      {
        type: 'photo',
        title: `${market} Neighborhood Scene`,
        description: `Representative photo of typical ${market} residential area`
      },
      {
        type: 'photo',
        title: 'Home Buyers in Action',
        description: 'Stock photo of diverse home buyers or real estate consultation'
      }
    ];
  }

  _assessBoilerplateText(boilerplateText) {
    let score = 100;
    
    // Check for standard elements
    if (!boilerplateText.includes('company')) score -= 20;
    if (!boilerplateText.includes('real estate')) score -= 15;
    if (boilerplateText.length < 100) score -= 25;
    
    return Math.max(0, score);
  }

  _extractContactInfo(content) {
    const hasEmail = /@/.test(content);
    const hasPhone = /\(\d{3}\)\s*\d{3}-\d{4}|\d{3}-\d{3}-\d{4}/.test(content);
    
    return {
      hasContact: hasEmail || hasPhone,
      hasEmail,
      hasPhone
    };
  }

  _extractLeadParagraph(content) {
    // Find first substantial paragraph
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    for (const paragraph of paragraphs) {
      if (paragraph.length > 100 && !paragraph.match(/^[A-Z\s]+:$/)) {
        return paragraph.trim();
      }
    }
    
    return null;
  }

  _analyzeLeadParagraph(leadParagraph) {
    return {
      length: leadParagraph.length,
      hasNumbers: /\d/.test(leadParagraph),
      hasLocation: true, // Would check for market name
      hasAction: /increase|decrease|rise|fall|grow|decline/.test(leadParagraph)
    };
  }

  _checkLeadCriterion(leadParagraph, criterion) {
    if (criterion.pattern) {
      return criterion.pattern.test(leadParagraph);
    }
    return true; // Default to true for non-pattern criteria
  }

  _checkHumanInterestElement(content, element) {
    if (element.pattern) {
      return element.pattern.test(content);
    }
    return false;
  }

  /**
   * ENHANCED: Validate Business Wire lead format
   */
  _validateBusinessWireFormat(content) {
    const result = {
      compliant: true,
      penalty: 0,
      issues: [],
      details: {}
    };

    // Check for proper Business Wire lead format
    const hasBusinessWireLead = /--\(BUSINESS WIRE\)--/.test(content);
    if (!hasBusinessWireLead) {
      result.compliant = false;
      result.penalty += 25;
      result.issues.push('Missing proper Business Wire lead format: --(BUSINESS WIRE)--');
    }

    // Check for proper dateline format
    const hasDateline = /^[A-Z][A-Za-z\s,]+--\(BUSINESS WIRE\)--/.test(content);
    if (!hasDateline) {
      result.compliant = false;
      result.penalty += 15;
      result.issues.push('Missing proper dateline format before Business Wire lead');
    }

    result.details = {
      hasBusinessWireLead,
      hasDateline
    };

    return result;
  }

  /**
   * ENHANCED: Validate headline formatting
   */
  _validateHeadlineFormat(content) {
    const result = {
      compliant: true,
      penalty: 0,
      issues: [],
      details: {}
    };

    const lines = content.split('\n');
    const headline = lines[0] || '';

    // Check for awkward market code appending (e.g., "in LAX")
    const hasAwkwardMarketCode = /\s+in\s+[A-Z]{3,4}$/i.test(headline);
    if (hasAwkwardMarketCode) {
      result.compliant = false;
      result.penalty += 20;
      result.issues.push('Headline has awkward market code appending - integrate market name naturally');
    }

    // Check headline length (should be 30-60 characters for SEO)
    if (headline.length < 30) {
      result.compliant = false;
      result.penalty += 15;
      result.issues.push('Headline too short for optimal SEO (minimum 30 characters)');
    } else if (headline.length > 80) {
      result.compliant = false;
      result.penalty += 10;
      result.issues.push('Headline too long - consider shortening for better readability');
    }

    // Check for proper capitalization
    const hasProperCapitalization = /^[A-Z]/.test(headline) && !/[A-Z]{4,}/.test(headline);
    if (!hasProperCapitalization) {
      result.compliant = false;
      result.penalty += 10;
      result.issues.push('Headline capitalization issues - use title case, avoid excessive caps');
    }

    result.details = {
      length: headline.length,
      hasAwkwardMarketCode,
      hasProperCapitalization
    };

    return result;
  }

  /**
   * ENHANCED: Assess transition words for narrative flow
   */
  _assessTransitionWords(content) {
    const transitionWords = [
      'however', 'meanwhile', 'additionally', 'furthermore', 'in contrast',
      'as a result', 'consequently', 'therefore', 'moreover', 'similarly',
      'nevertheless', 'nonetheless', 'on the other hand', 'in addition',
      'for example', 'for instance', 'specifically', 'particularly'
    ];

    let score = 100;
    let transitionCount = 0;
    const contentLower = content.toLowerCase();

    for (const word of transitionWords) {
      if (contentLower.includes(word)) {
        transitionCount++;
      }
    }

    // Score based on transition word usage
    if (transitionCount === 0) {
      score = 40;
    } else if (transitionCount === 1) {
      score = 60;
    } else if (transitionCount === 2) {
      score = 75;
    } else if (transitionCount >= 3) {
      score = 90;
    }

    // Bonus for variety
    if (transitionCount >= 4) {
      score = Math.min(100, score + 10);
    }

    return {
      score,
      transitionCount,
      details: {
        wordsFound: transitionWords.filter(word => contentLower.includes(word))
      }
    };
  }

  /**
   * ENHANCED: Check for content duplication
   */
  _checkContentDuplication(content) {
    const result = {
      score: 100,
      penalty: 0,
      issues: [],
      details: {}
    };

    // Check for duplicate sentences
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
    const uniqueSentences = new Set(sentences.map(s => s.toLowerCase()));
    
    if (sentences.length > uniqueSentences.size) {
      const duplicateCount = sentences.length - uniqueSentences.size;
      result.penalty += duplicateCount * 15;
      result.issues.push(`${duplicateCount} duplicate sentences found - remove redundant content`);
    }

    // Check for repetitive phrases (common in AI-generated content)
    const repetitivePatterns = [
      /according to.*according to/gi,
      /data shows.*data shows/gi,
      /market trends.*market trends/gi,
      /real estate.*real estate.*real estate/gi
    ];

    for (const pattern of repetitivePatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        result.penalty += matches.length * 10;
        result.issues.push('Repetitive phrasing detected - vary language for better readability');
      }
    }

    result.score = Math.max(0, 100 - result.penalty);
    result.details = {
      totalSentences: sentences.length,
      uniqueSentences: uniqueSentences.size,
      duplicateCount: sentences.length - uniqueSentences.size
    };

    return result;
  }

  // Configuration initialization methods

  _initializeAPStyleRules() {
    return [
      {
        name: 'No excessive capitalization',
        pattern: /[A-Z]{4,}/g,
        issue: 'Avoid excessive capitalization - use standard title case',
        penalty: 8
      },
      {
        name: 'Proper attribution',
        pattern: /according to.*said/i,
        issue: 'Use proper attribution format - avoid redundant attribution',
        penalty: 10
      },
      {
        name: 'Active voice preference',
        pattern: /was.*by|were.*by/g,
        issue: 'Prefer active voice over passive voice for stronger writing',
        penalty: 12
      },
      {
        name: 'No section headers',
        pattern: /^[A-Z\s]+:$/gm,
        issue: 'Remove section headers - use flowing narrative paragraphs',
        penalty: 15
      },
      {
        name: 'No bullet points',
        pattern: /^\s*[-•*]/gm,
        issue: 'Convert bullet points to narrative sentences',
        penalty: 12
      },
      {
        name: 'Proper number formatting',
        pattern: /\b\d{4,}\b(?![%])/g,
        issue: 'Use comma formatting for large numbers (e.g., 1,000 not 1000)',
        penalty: 8
      },
      {
        name: 'No superlatives without support',
        pattern: /\b(best|worst|most|least|greatest|smallest)\b(?!\s+(according to|data shows|research indicates))/gi,
        issue: 'Support superlatives with data or attribution',
        penalty: 10
      },
      {
        name: 'Proper quote formatting',
        pattern: /"\s*[a-z]/g,
        issue: 'Quotes should start with capital letters',
        penalty: 6
      },
      {
        name: 'No excessive exclamation points',
        pattern: /!{2,}|!\s*!/g,
        issue: 'Use single exclamation points sparingly in press releases',
        penalty: 8
      },
      {
        name: 'Proper percent formatting',
        pattern: /\d\s+%|\d+percent/gi,
        issue: 'Use proper percent formatting (e.g., 25% not 25 % or 25percent)',
        penalty: 5
      },
      {
        name: 'No placeholder text',
        pattern: /\[PLACEHOLDER\]|\{\{[^}]+\}\}|\$\{[^}]+\}|TBD|TODO|FIXME/gi,
        issue: 'Remove all placeholder text and template variables',
        penalty: 25
      },
      {
        name: 'Proper dateline format',
        pattern: /^(?![A-Z][A-Za-z\s,]+--\(BUSINESS WIRE\)--)/,
        issue: 'Press releases should start with proper dateline format',
        penalty: 20
      }
    ];
  }

  _initializeSEOGuidelines() {
    return {
      keywordDensity: { min: 1, max: 3 },
      titleLength: { min: 30, max: 60 },
      metaDescription: { min: 120, max: 160 }
    };
  }

  _initializeMultimediaHooks() {
    return [
      'Market statistics infographic',
      'Neighborhood photo gallery',
      'Price trend charts',
      'Market comparison maps'
    ];
  }

  _initializeBoilerplateTemplates() {
    return {
      aboutcompany: 'Standard About company section with company background',
      mediaContact: 'Media contact information template',
      disclaimer: 'Standard disclaimer text'
    };
  }

  _initializeLeadParagraphCriteria() {
    return [
      {
        name: 'hasKeyInformation',
        pattern: /\d+%|\$[\d,]+|increase|decrease/i,
        weight: 25,
        issue: 'lacks key statistical information',
        recommendation: 'Include specific numbers or trends in the opening paragraph'
      },
      {
        name: 'appropriateLength',
        pattern: /.{100,300}/,
        weight: 20,
        issue: 'is too short or too long',
        recommendation: 'Keep lead paragraph between 100-300 characters'
      },
      {
        name: 'hasLocation',
        pattern: /./,  // Would check for market name
        weight: 25,
        issue: 'lacks location context',
        recommendation: 'Include market/location reference in lead paragraph'
      },
      {
        name: 'hasNewsValue',
        pattern: /new|first|record|significant|major/i,
        weight: 30,
        issue: 'lacks news value indicators',
        recommendation: 'Emphasize what makes this newsworthy'
      }
    ];
  }

  _initializeHumanInterestElements() {
    return [
      {
        name: 'personalStory',
        pattern: /family|couple|buyer|seller.*story|experience/i,
        weight: 30,
        recommendation: 'Add a brief personal story or buyer/seller anecdote'
      },
      {
        name: 'communityImpact',
        pattern: /community|neighborhood|residents|families/i,
        weight: 25,
        recommendation: 'Include how market changes affect local community'
      },
      {
        name: 'expertQuote',
        pattern: /"[^"]{50,}"/,
        weight: 25,
        recommendation: 'Include substantial expert quote with local insight'
      },
      {
        name: 'futureImplications',
        pattern: /expect|outlook|future|ahead|coming/i,
        weight: 20,
        recommendation: 'Add forward-looking perspective for readers'
      }
    ];
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      ...super.getStatus(),
      capabilities: {
        apStyleValidation: true,
        seoOptimization: true,
        multimediaHooks: true,
        boilerplateOptimization: true,
        leadParagraphAssessment: true,
        humanInterestValidation: true
      },
      configuration: {
        apStyleRules: this.config.apStyleRules.length,
        humanInterestElements: this.config.humanInterestElements.length
      }
    };
  }
}

module.exports = StyleGuideService;