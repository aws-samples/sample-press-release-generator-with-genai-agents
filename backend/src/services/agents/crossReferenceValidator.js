const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * CrossReferenceValidator Agent
 * Source triangulation and cross-reference validation
 * 
 * Features:
 * - Source triangulation validation
 * - Multi-source consistency checking
 * - Authority-weighted cross-reference scoring
 * - Reference quality assessment
 * - Performance target: <3 seconds processing time
 */
class CrossReferenceValidator extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Cross Reference Validator', {
      maxProcessingTime: 3000, // 3 seconds
      validationThreshold: 0.7,
      triangulationMinSources: 2,
      authorityWeightThreshold: 0.6,
      ...options
    }, lineageService);

    // Source authority weights and patterns
    this.sourceAuthority = null;
    this.referencePatterns = null;
    
    // Authority levels for different source types
    this.authorityLevels = {
      government: { weight: 0.95, reliability: 'highest', examples: ['census.gov', 'bls.gov', 'hud.gov'] },
      industry: { weight: 0.85, reliability: 'high', examples: ['nar.competitor2', 'mls', 'competitor1.com'] },
      academic: { weight: 0.80, reliability: 'high', examples: ['universities', 'research institutions'] },
      news: { weight: 0.70, reliability: 'medium', examples: ['reuters', 'wsj', 'bloomberg'] },
      trade: { weight: 0.75, reliability: 'medium-high', examples: ['trade publications', 'industry reports'] },
      blog: { weight: 0.40, reliability: 'low', examples: ['personal blogs', 'opinion sites'] },
      social: { weight: 0.20, reliability: 'very-low', examples: ['social media', 'forums'] }
    };

    // Cross-reference validation patterns
    this.validationPatterns = {
      numerical: {
        tolerance: 0.1, // 10% tolerance for numerical consistency
        strictTolerance: 0.05 // 5% for critical metrics
      },
      categorical: {
        exactMatch: true, // Categories must match exactly
        synonyms: { // Acceptable synonyms
          'increase': ['rise', 'growth', 'upturn'],
          'decrease': ['fall', 'decline', 'drop'],
          'stable': ['steady', 'unchanged', 'flat']
        }
      },
      temporal: {
        tolerance: 30, // 30 days tolerance for date consistency
        strictTolerance: 7 // 7 days for recent events
      }
    };
  }

  /**
   * Initialize the CrossReferenceValidator
   */
  async initialize() {
    await super.initialize();

    try {
      this.log('info', 'Initializing cross-reference validation parameters');
      
      // Initialize source authority and reference patterns
      this.sourceAuthority = this._initializeSourceAuthority();
      this.referencePatterns = this._initializeReferencePatterns();
      
      this.log('info', 'Cross reference validator initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize cross reference validator', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate cross-references and source triangulation
   * @param {Array} claims - Claims to validate for cross-reference consistency
   * @param {Array} sources - Available sources for triangulation
   * @param {Object} context - Validation context
   * @returns {Object} Cross-reference validation results
   */
  async validateCrossReferences(claims, sourcesOrContext = [], context = {}) {
    // Handle different parameter patterns
    let sources = [];
    let actualContext = context;
    
    // If second parameter is an object with availableSources, extract them
    if (sourcesOrContext && typeof sourcesOrContext === 'object' && !Array.isArray(sourcesOrContext)) {
      if (sourcesOrContext.availableSources && Array.isArray(sourcesOrContext.availableSources)) {
        sources = sourcesOrContext.availableSources;
        actualContext = { ...sourcesOrContext };
        delete actualContext.availableSources;
      } else {
        // Treat as context, sources will be empty array
        actualContext = sourcesOrContext;
      }
    } else if (Array.isArray(sourcesOrContext)) {
      // Traditional array of sources
      sources = sourcesOrContext;
    }
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting cross-reference validation', {
        claimsCount: claims.length,
        sourcesCount: sources.length,
        contextKeys: Object.keys(actualContext)
      });

      // Handle empty claims or sources
      if (!claims || claims.length === 0) {
        return this._createEmptyResult();
      }

      // Validate and filter inputs
      const validClaims = this._validateClaims(claims);
      const validSources = this._validateSources(sources);
      
      // Perform cross-reference validation
      const results = {
        sourceTriangulation: await this._performSourceTriangulation(validClaims, validSources, actualContext),
        consistencyChecking: await this._performConsistencyChecking(validClaims, validSources, actualContext),
        authorityWeighting: await this._performAuthorityWeighting(validClaims, validSources, actualContext),
        qualityAssessment: await this._performQualityAssessment(validClaims, validSources, actualContext),
        conflictResolution: await this._performConflictResolution(validClaims, validSources, actualContext)
      };

      // Calculate overall cross-reference score
      const overallCrossReferenceScore = this._calculateOverallScore(results);
      
      // Identify flagged cross-reference issues
      const flaggedCrossReferenceIssues = this._compileFlaggedCrossReferenceIssues(results);
      
      // Calculate confidence
      const confidence = this._calculateConfidence(results, validClaims.length, validSources.length);

      const processingTime = Date.now() - startTime;
      
      // Check processing time requirement
      if (processingTime >= this.options.maxProcessingTime) {
        this.log('warn', 'Cross-reference validation exceeded time limit', { processingTime });
      }

      const result = {
        overallCrossReferenceScore,
        results,
        flaggedCrossReferenceIssues,
        confidence,
        processingTime
      };

      this.log('info', 'Cross-reference validation completed', {
        overallScore: overallCrossReferenceScore,
        triangulatedClaims: results.sourceTriangulation.filter(r => r.isTriangulated).length,
        conflicts: results.conflictResolution.length,
        flaggedIssues: flaggedCrossReferenceIssues.length,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log('error', 'Cross-reference validation failed', {
        error: error.message,
        processingTime
      });
      throw error;
    }
  }

  /**
   * Perform source triangulation
   * @private
   */
  async _performSourceTriangulation(claims, sources, context) {
    const results = [];

    for (const claim of claims) {
      try {
        const triangulationResult = await this._triangulateSingleClaim(claim, sources, context);
        results.push(triangulationResult);
      } catch (error) {
        this.log('warn', 'Failed to triangulate claim', {
          claim: claim.text,
          error: error.message
        });
        
        results.push({
          claim,
          isTriangulated: false,
          triangulationScore: 0,
          supportingSources: [],
          issues: [`Triangulation failed: ${error.message}`]
        });
      }
    }

    return results;
  }

  /**
   * Triangulate a single claim across sources
   * @private
   */
  async _triangulateSingleClaim(claim, sources, context) {
    const supportingSources = [];
    const conflictingSources = [];
    const issues = [];

    // Find sources that support or conflict with the claim
    for (const source of sources) {
      const support = this._evaluateSourceSupport(claim, source, context);
      
      if (support.isSupporting) {
        supportingSources.push({
          source,
          supportLevel: support.level,
          confidence: support.confidence,
          authority: this._calculateSourceAuthority(source)
        });
      } else if (support.isConflicting) {
        conflictingSources.push({
          source,
          conflictLevel: support.level,
          confidence: support.confidence,
          authority: this._calculateSourceAuthority(source)
        });
      }
    }

    // Calculate triangulation score
    const triangulationScore = this._calculateTriangulationScore(
      supportingSources, 
      conflictingSources, 
      claim
    );

    // Check if claim meets triangulation threshold
    const isTriangulated = supportingSources.length >= this.options.triangulationMinSources &&
                          triangulationScore >= this.options.validationThreshold;

    // Identify issues
    if (supportingSources.length < this.options.triangulationMinSources) {
      issues.push(`Insufficient supporting sources: ${supportingSources.length} < ${this.options.triangulationMinSources}`);
    }

    if (conflictingSources.length > supportingSources.length) {
      issues.push('More conflicting sources than supporting sources');
    }

    return {
      claim,
      isTriangulated,
      triangulationScore,
      supportingSources,
      conflictingSources,
      issues
    };
  }

  /**
   * Perform consistency checking across sources
   * @private
   */
  async _performConsistencyChecking(claims, sources, context) {
    const results = [];

    // Group claims by topic/type for consistency checking
    const claimGroups = this._groupClaimsByTopic(claims);

    for (const [topic, topicClaims] of Object.entries(claimGroups)) {
      const consistencyResult = this._checkTopicConsistency(topicClaims, sources, context);
      results.push(...consistencyResult);
    }

    return results;
  }

  /**
   * Check consistency within a topic group
   * @private
   */
  _checkTopicConsistency(claims, sources, context) {
    const results = [];

    // Compare claims within the same topic
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const consistencyResult = this._checkClaimPairConsistency(
          claims[i], 
          claims[j], 
          sources, 
          context
        );
        
        if (consistencyResult) {
          results.push(consistencyResult);
        }
      }
    }

    return results;
  }

  /**
   * Check consistency between two claims
   * @private
   */
  _checkClaimPairConsistency(claim1, claim2, sources, context) {
    // Extract comparable data from both claims
    const data1 = this._extractComparableData(claim1);
    const data2 = this._extractComparableData(claim2);

    if (!data1 || !data2) {
      return null; // Claims not comparable
    }

    // Check numerical consistency
    const numericalConsistency = this._checkNumericalConsistency(data1, data2);
    
    // Check categorical consistency
    const categoricalConsistency = this._checkCategoricalConsistency(data1, data2);
    
    // Check temporal consistency
    const temporalConsistency = this._checkTemporalConsistency(data1, data2);

    // Calculate overall consistency
    const overallConsistency = this._calculatePairConsistency(
      numericalConsistency,
      categoricalConsistency,
      temporalConsistency
    );

    if (overallConsistency.isConsistent) {
      return null; // No issues
    }

    return {
      type: 'consistency_issue',
      claim1,
      claim2,
      consistencyScore: overallConsistency.score,
      issues: overallConsistency.issues,
      severity: overallConsistency.severity
    };
  }

  /**
   * Perform authority weighting
   * @private
   */
  async _performAuthorityWeighting(claims, sources, context) {
    const results = [];

    for (const claim of claims) {
      const authorityResult = this._calculateClaimAuthorityWeight(claim, sources, context);
      results.push(authorityResult);
    }

    return results;
  }

  /**
   * Calculate authority weight for a claim
   * @private
   */
  _calculateClaimAuthorityWeight(claim, sources, context) {
    let totalWeight = 0;
    let weightedScore = 0;
    const sourceWeights = [];

    // Find sources that reference this claim
    const referencingSources = sources.filter(source => 
      this._sourceReferencesClaimContent(source, claim)
    );

    for (const source of referencingSources) {
      const authority = this._calculateSourceAuthority(source);
      const relevance = this._calculateSourceRelevance(source, claim, context);
      const weight = authority * relevance;
      
      totalWeight += weight;
      weightedScore += weight;
      
      sourceWeights.push({
        source,
        authority,
        relevance,
        weight
      });
    }

    const averageWeight = totalWeight > 0 ? weightedScore / referencingSources.length : 0;
    const meetsThreshold = averageWeight >= this.options.authorityWeightThreshold;

    return {
      claim,
      authorityWeight: averageWeight,
      meetsThreshold,
      sourceWeights,
      referencingSourcesCount: referencingSources.length
    };
  }

  /**
   * Perform quality assessment
   * @private
   */
  async _performQualityAssessment(claims, sources, context) {
    const results = [];

    for (const source of sources) {
      const qualityResult = this._assessSourceQuality(source, claims, context);
      results.push(qualityResult);
    }

    return results;
  }

  /**
   * Assess quality of a single source
   * @private
   */
  _assessSourceQuality(source, claims, context) {
    const qualityFactors = {
      authority: this._calculateSourceAuthority(source),
      recency: this._calculateSourceRecency(source, context),
      relevance: this._calculateAverageSourceRelevance(source, claims, context),
      completeness: this._calculateSourceCompleteness(source),
      consistency: this._calculateSourceInternalConsistency(source)
    };

    // Calculate overall quality score
    const qualityScore = this._calculateOverallQualityScore(qualityFactors);
    
    // Identify quality issues
    const qualityIssues = this._identifyQualityIssues(qualityFactors, source);

    return {
      source,
      qualityScore,
      qualityFactors,
      qualityIssues,
      isHighQuality: qualityScore >= 0.7
    };
  }

  /**
   * Perform conflict resolution
   * @private
   */
  async _performConflictResolution(claims, sources, context) {
    const conflicts = [];

    // Identify conflicts between sources
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const conflict = this._identifySourceConflict(sources[i], sources[j], claims, context);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    // Resolve conflicts using authority weighting
    const resolvedConflicts = conflicts.map(conflict => 
      this._resolveConflict(conflict, context)
    );

    return resolvedConflicts;
  }

  /**
   * Identify conflict between two sources
   * @private
   */
  _identifySourceConflict(source1, source2, claims, context) {
    // Extract claims from both sources
    const claims1 = this._extractClaimsFromSource(source1, claims);
    const claims2 = this._extractClaimsFromSource(source2, claims);

    // Find conflicting claims
    const conflicts = [];
    
    for (const claim1 of claims1) {
      for (const claim2 of claims2) {
        if (this._areClaimsConflicting(claim1, claim2)) {
          conflicts.push({ claim1, claim2 });
        }
      }
    }

    if (conflicts.length === 0) {
      return null;
    }

    return {
      source1,
      source2,
      conflicts,
      conflictCount: conflicts.length,
      severity: this._calculateConflictSeverity(conflicts)
    };
  }

  /**
   * Resolve a conflict using authority weighting
   * @private
   */
  _resolveConflict(conflict, context) {
    const authority1 = this._calculateSourceAuthority(conflict.source1);
    const authority2 = this._calculateSourceAuthority(conflict.source2);

    const resolution = {
      conflict,
      resolution: authority1 > authority2 ? 'source1_preferred' : 
                 authority2 > authority1 ? 'source2_preferred' : 'unresolved',
      confidence: Math.abs(authority1 - authority2),
      recommendedAction: this._getRecommendedAction(conflict, authority1, authority2)
    };

    return resolution;
  }

  /**
   * Evaluate source support for a claim
   * @private
   */
  _evaluateSourceSupport(claim, source, context) {
    // Extract relevant content from source
    const sourceContent = this._extractRelevantContent(source, claim);
    
    if (!sourceContent) {
      return { isSupporting: false, isConflicting: false, level: 0, confidence: 0 };
    }

    // Compare claim with source content
    const comparison = this._compareClaimWithContent(claim, sourceContent);
    
    return {
      isSupporting: comparison.similarity > 0.7,
      isConflicting: comparison.similarity < 0.3 && comparison.hasConflict,
      level: comparison.similarity,
      confidence: comparison.confidence
    };
  }

  /**
   * Calculate source authority
   * @private
   */
  _calculateSourceAuthority(source) {
    // Determine source type
    const sourceType = this._determineSourceType(source);
    const baseAuthority = this.authorityLevels[sourceType]?.weight || 0.5;

    // Apply modifiers based on source characteristics
    let authority = baseAuthority;

    // Domain reputation modifier
    if (source.domain) {
      const domainModifier = this._getDomainAuthorityModifier(source.domain);
      authority *= domainModifier;
    }

    // Publication date modifier (newer sources get slight boost)
    if (source.publishDate) {
      const recencyModifier = this._getRecencyModifier(source.publishDate);
      authority *= recencyModifier;
    }

    // Citation count modifier (if available)
    if (source.citationCount) {
      const citationModifier = this._getCitationModifier(source.citationCount);
      authority *= citationModifier;
    }

    return Math.min(authority, 1.0);
  }

  /**
   * Calculate source relevance to claim
   * @private
   */
  _calculateSourceRelevance(source, claim, context) {
    let relevance = 0;

    // Topic relevance
    const topicRelevance = this._calculateTopicRelevance(source, claim);
    relevance += topicRelevance * 0.4;

    // Geographic relevance
    const geoRelevance = this._calculateGeographicRelevance(source, claim, context);
    relevance += geoRelevance * 0.3;

    // Temporal relevance
    const temporalRelevance = this._calculateTemporalRelevance(source, claim, context);
    relevance += temporalRelevance * 0.3;

    return Math.min(relevance, 1.0);
  }

  /**
   * Calculate triangulation score
   * @private
   */
  _calculateTriangulationScore(supportingSources, conflictingSources, claim) {
    if (supportingSources.length === 0) {
      return 0;
    }

    // Weight by authority and confidence
    const supportScore = supportingSources.reduce((sum, support) => {
      return sum + (support.authority * support.confidence * support.supportLevel);
    }, 0) / supportingSources.length;

    // Penalty for conflicting sources
    const conflictPenalty = conflictingSources.reduce((sum, conflict) => {
      return sum + (conflict.authority * conflict.confidence * conflict.conflictLevel);
    }, 0) / Math.max(conflictingSources.length, 1);

    const triangulationScore = Math.max(0, supportScore - (conflictPenalty * 0.5));
    
    return Math.min(triangulationScore, 1.0);
  }

  /**
   * Group claims by topic
   * @private
   */
  _groupClaimsByTopic(claims) {
    const groups = {};

    for (const claim of claims) {
      const topic = this._determineClaimTopic(claim);
      if (!groups[topic]) {
        groups[topic] = [];
      }
      groups[topic].push(claim);
    }

    return groups;
  }

  /**
   * Determine claim topic
   * @private
   */
  _determineClaimTopic(claim) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    if (text.includes('price') || text.includes('value')) return 'pricing';
    if (text.includes('inventory') || text.includes('supply')) return 'inventory';
    if (text.includes('demand') || text.includes('buyer')) return 'demand';
    if (text.includes('rate') || text.includes('interest')) return 'rates';
    if (text.includes('sales') || text.includes('volume')) return 'sales';
    
    return 'general';
  }

  /**
   * Extract comparable data from claim
   * @private
   */
  _extractComparableData(claim) {
    const data = {
      numerical: [],
      categorical: [],
      temporal: []
    };

    const text = claim.text || '';

    // Extract numerical data
    const numbers = text.match(/(\d+(?:\.\d+)?)\s*%?/g);
    if (numbers) {
      data.numerical = numbers.map(num => parseFloat(num.replace('%', '')));
    }

    // Extract categorical data
    const categories = this._extractCategories(text);
    data.categorical = categories;

    // Extract temporal data
    const temporal = this._extractTemporalData(text);
    data.temporal = temporal;

    return data.numerical.length > 0 || data.categorical.length > 0 || data.temporal.length > 0 ? data : null;
  }

  /**
   * Extract categories from text
   * @private
   */
  _extractCategories(text) {
    const categories = [];
    const lowerText = text.toLowerCase();

    // Direction categories
    if (lowerText.includes('increase') || lowerText.includes('rise')) categories.push('increase');
    if (lowerText.includes('decrease') || lowerText.includes('fall')) categories.push('decrease');
    if (lowerText.includes('stable') || lowerText.includes('steady')) categories.push('stable');

    // Magnitude categories
    if (lowerText.includes('high') || lowerText.includes('strong')) categories.push('high');
    if (lowerText.includes('low') || lowerText.includes('weak')) categories.push('low');
    if (lowerText.includes('moderate') || lowerText.includes('medium')) categories.push('moderate');

    return categories;
  }

  /**
   * Extract temporal data from text
   * @private
   */
  _extractTemporalData(text) {
    const temporal = [];
    
    // Extract years
    const years = text.match(/\b(19|20)\d{2}\b/g);
    if (years) {
      temporal.push(...years.map(year => ({ type: 'year', value: parseInt(year) })));
    }

    // Extract months
    const months = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi);
    if (months) {
      temporal.push(...months.map(month => ({ type: 'month', value: month.toLowerCase() })));
    }

    return temporal;
  }

  /**
   * Check numerical consistency
   * @private
   */
  _checkNumericalConsistency(data1, data2) {
    if (data1.numerical.length === 0 || data2.numerical.length === 0) {
      return { isConsistent: true, issues: [] };
    }

    const issues = [];
    const tolerance = this.validationPatterns.numerical.tolerance;

    // Compare numerical values
    for (const num1 of data1.numerical) {
      for (const num2 of data2.numerical) {
        const difference = Math.abs(num1 - num2) / Math.max(num1, num2);
        if (difference > tolerance) {
          issues.push(`Numerical inconsistency: ${num1} vs ${num2} (${(difference * 100).toFixed(1)}% difference)`);
        }
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues
    };
  }

  /**
   * Check categorical consistency
   * @private
   */
  _checkCategoricalConsistency(data1, data2) {
    if (data1.categorical.length === 0 || data2.categorical.length === 0) {
      return { isConsistent: true, issues: [] };
    }

    const issues = [];
    const synonyms = this.validationPatterns.categorical.synonyms;

    // Check for conflicting categories
    for (const cat1 of data1.categorical) {
      for (const cat2 of data2.categorical) {
        if (this._areCategoriesConflicting(cat1, cat2, synonyms)) {
          issues.push(`Categorical conflict: ${cat1} vs ${cat2}`);
        }
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues
    };
  }

  /**
   * Check temporal consistency
   * @private
   */
  _checkTemporalConsistency(data1, data2) {
    if (data1.temporal.length === 0 || data2.temporal.length === 0) {
      return { isConsistent: true, issues: [] };
    }

    const issues = [];

    // Compare temporal references
    for (const temp1 of data1.temporal) {
      for (const temp2 of data2.temporal) {
        if (temp1.type === temp2.type && temp1.value !== temp2.value) {
          issues.push(`Temporal inconsistency: ${temp1.value} vs ${temp2.value}`);
        }
      }
    }

    return {
      isConsistent: issues.length === 0,
      issues
    };
  }

  /**
   * Calculate pair consistency
   * @private
   */
  _calculatePairConsistency(numerical, categorical, temporal) {
    const allIssues = [...numerical.issues, ...categorical.issues, ...temporal.issues];
    const isConsistent = allIssues.length === 0;
    
    let severity = 'low';
    if (allIssues.length > 3) severity = 'high';
    else if (allIssues.length > 1) severity = 'medium';

    const score = Math.max(0, 1 - (allIssues.length * 0.2));

    return {
      isConsistent,
      score,
      issues: allIssues,
      severity
    };
  }

  /**
   * Determine source type
   * @private
   */
  _determineSourceType(source) {
    const url = source.url || source.domain || '';
    const title = source.title || '';
    const lowerUrl = url.toLowerCase();
    const lowerTitle = title.toLowerCase();

    // Government sources
    if (lowerUrl.includes('.gov') || lowerTitle.includes('census') || lowerTitle.includes('bureau')) {
      return 'government';
    }

    // Industry sources
    if (lowerUrl.includes('nar.competitor2') || lowerUrl.includes('mls') || lowerTitle.includes('competitor2')) {
      return 'industry';
    }

    // Academic sources
    if (lowerUrl.includes('.edu') || lowerTitle.includes('university') || lowerTitle.includes('research')) {
      return 'academic';
    }

    // News sources
    if (lowerUrl.includes('reuters') || lowerUrl.includes('wsj') || lowerUrl.includes('bloomberg')) {
      return 'news';
    }

    // Trade publications
    if (lowerTitle.includes('report') || lowerTitle.includes('journal') || lowerTitle.includes('magazine')) {
      return 'trade';
    }

    // Social media
    if (lowerUrl.includes('twitter') || lowerUrl.includes('facebook') || lowerUrl.includes('reddit')) {
      return 'social';
    }

    // Default to blog/other
    return 'blog';
  }

  /**
   * Get domain authority modifier
   * @private
   */
  _getDomainAuthorityModifier(domain) {
    const highAuthorityDomains = [
      'census.gov', 'bls.gov', 'hud.gov', 'nar.competitor2', 
      'reuters.com', 'wsj.com', 'bloomberg.com'
    ];
    
    const lowAuthorityDomains = [
      'blogspot.com', 'wordpress.com', 'medium.com'
    ];

    if (highAuthorityDomains.some(d => domain.includes(d))) {
      return 1.1;
    }
    
    if (lowAuthorityDomains.some(d => domain.includes(d))) {
      return 0.8;
    }

    return 1.0;
  }

  /**
   * Get recency modifier
   * @private
   */
  _getRecencyModifier(publishDate) {
    const now = new Date();
    const pubDate = new Date(publishDate);
    const daysDiff = (now - pubDate) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 30) return 1.1; // Recent boost
    if (daysDiff <= 365) return 1.0; // Normal
    if (daysDiff <= 1825) return 0.95; // Slight penalty for older content
    return 0.9; // Older content penalty
  }

  /**
   * Get citation modifier
   * @private
   */
  _getCitationModifier(citationCount) {
    if (citationCount >= 100) return 1.2;
    if (citationCount >= 50) return 1.1;
    if (citationCount >= 10) return 1.05;
    return 1.0;
  }

  /**
   * Calculate topic relevance
   * @private
   */
  _calculateTopicRelevance(source, claim) {
    const sourceText = (source.title + ' ' + (source.content || '')).toLowerCase();
    const claimText = claim.text.toLowerCase();

    // Extract key terms from claim
    const claimTerms = this._extractKeyTerms(claimText);
    
    // Count matching terms in source
    let matchCount = 0;
    for (const term of claimTerms) {
      if (sourceText.includes(term)) {
        matchCount++;
      }
    }

    return claimTerms.length > 0 ? matchCount / claimTerms.length : 0;
  }

  /**
   * Calculate geographic relevance
   * @private
   */
  _calculateGeographicRelevance(source, claim, context) {
    // Extract geographic references
    const sourceGeo = this._extractGeographicReferences(source);
    const claimGeo = this._extractGeographicReferences(claim);

    if (!sourceGeo.length || !claimGeo.length) {
      return 0.5; // Neutral relevance if no geographic data
    }

    // Check for geographic overlap
    let maxRelevance = 0;
    for (const sGeo of sourceGeo) {
      for (const cGeo of claimGeo) {
        const relevance = this._calculateGeoOverlap(sGeo, cGeo);
        maxRelevance = Math.max(maxRelevance, relevance);
      }
    }

    return maxRelevance;
  }

  /**
   * Calculate temporal relevance
   * @private
   */
  _calculateTemporalRelevance(source, claim, context) {
    const sourceDate = source.publishDate ? new Date(source.publishDate) : null;
    const claimDate = this._extractClaimDate(claim);
    const contextDate = context.currentDate ? new Date(context.currentDate) : new Date();

    if (!sourceDate) {
      return 0.5; // Neutral if no source date
    }

    // Calculate recency score
    const daysSincePublish = (contextDate - sourceDate) / (1000 * 60 * 60 * 24);
    let recencyScore = 1.0;
    
    if (daysSincePublish > 365) {
      recencyScore = Math.max(0.3, 1 - (daysSincePublish - 365) / 1825); // Decay over 5 years
    }

    // If claim has specific date, check alignment
    if (claimDate) {
      const daysDiff = Math.abs(sourceDate - claimDate) / (1000 * 60 * 60 * 24);
      const alignmentScore = daysDiff <= 30 ? 1.0 : Math.max(0.1, 1 - daysDiff / 365);
      return (recencyScore + alignmentScore) / 2;
    }

    return recencyScore;
  }

  /**
   * Calculate source recency
   * @private
   */
  _calculateSourceRecency(source, context) {
    if (!source.publishDate) {
      return 0.5; // Neutral if no date
    }

    const sourceDate = new Date(source.publishDate);
    const currentDate = context.currentDate ? new Date(context.currentDate) : new Date();
    const daysDiff = (currentDate - sourceDate) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 30) return 1.0; // Very recent
    if (daysDiff <= 90) return 0.9; // Recent
    if (daysDiff <= 365) return 0.7; // Within a year
    if (daysDiff <= 1825) return 0.5; // Within 5 years
    return 0.3; // Older
  }

  /**
   * Calculate average source relevance
   * @private
   */
  _calculateAverageSourceRelevance(source, claims, context) {
    if (claims.length === 0) return 0;

    const relevanceScores = claims.map(claim =>
      this._calculateSourceRelevance(source, claim, context)
    );

    return relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;
  }

  /**
   * Calculate source completeness
   * @private
   */
  _calculateSourceCompleteness(source) {
    let completeness = 0;
    let maxScore = 0;

    // Check for essential fields
    if (source.title) { completeness += 0.2; maxScore += 0.2; }
    if (source.content) { completeness += 0.3; maxScore += 0.3; }
    if (source.publishDate) { completeness += 0.15; maxScore += 0.15; }
    if (source.author) { completeness += 0.1; maxScore += 0.1; }
    if (source.url || source.domain) { completeness += 0.15; maxScore += 0.15; }
    if (source.citations) { completeness += 0.1; maxScore += 0.1; }

    return maxScore > 0 ? completeness / maxScore : 0;
  }

  /**
   * Calculate source internal consistency
   * @private
   */
  _calculateSourceInternalConsistency(source) {
    // Simple heuristic for internal consistency
    let consistencyScore = 1.0;

    // Check title-content alignment
    if (source.title && source.content) {
      const titleTerms = this._extractKeyTerms(source.title.toLowerCase());
      const contentText = source.content.toLowerCase();
      
      let matchCount = 0;
      for (const term of titleTerms) {
        if (contentText.includes(term)) {
          matchCount++;
        }
      }
      
      const alignment = titleTerms.length > 0 ? matchCount / titleTerms.length : 1;
      if (alignment < 0.3) {
        consistencyScore -= 0.3; // Penalty for poor title-content alignment
      }
    }

    return Math.max(consistencyScore, 0);
  }

  /**
   * Calculate overall quality score
   * @private
   */
  _calculateOverallQualityScore(qualityFactors) {
    const weights = {
      authority: 0.3,
      recency: 0.2,
      relevance: 0.2,
      completeness: 0.15,
      consistency: 0.15
    };

    let totalScore = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      totalScore += (qualityFactors[factor] || 0) * weight;
    }

    return totalScore;
  }

  /**
   * Identify quality issues
   * @private
   */
  _identifyQualityIssues(qualityFactors, source) {
    const issues = [];

    if (qualityFactors.authority < 0.5) {
      issues.push('Low source authority');
    }
    if (qualityFactors.recency < 0.3) {
      issues.push('Outdated source');
    }
    if (qualityFactors.relevance < 0.4) {
      issues.push('Low relevance to claims');
    }
    if (qualityFactors.completeness < 0.6) {
      issues.push('Incomplete source information');
    }
    if (qualityFactors.consistency < 0.7) {
      issues.push('Internal consistency issues');
    }

    return issues;
  }

  /**
   * Extract claims from source
   * @private
   */
  _extractClaimsFromSource(source, allClaims) {
    // Find claims that are referenced by this source
    return allClaims.filter(claim =>
      this._sourceReferencesClaimContent(source, claim)
    );
  }

  /**
   * Check if source references claim content
   * @private
   */
  _sourceReferencesClaimContent(source, claim) {
    const sourceText = (source.title + ' ' + (source.content || '')).toLowerCase();
    const claimText = claim.text.toLowerCase();
    
    // Extract key terms from claim
    const claimTerms = this._extractKeyTerms(claimText);
    
    // Check if significant portion of claim terms appear in source
    let matchCount = 0;
    for (const term of claimTerms) {
      if (sourceText.includes(term)) {
        matchCount++;
      }
    }
    
    return claimTerms.length > 0 && (matchCount / claimTerms.length) >= 0.5;
  }

  /**
   * Check if claims are conflicting
   * @private
   */
  _areClaimsConflicting(claim1, claim2) {
    // Extract comparable data
    const data1 = this._extractComparableData(claim1);
    const data2 = this._extractComparableData(claim2);
    
    if (!data1 || !data2) return false;
    
    // Check for numerical conflicts
    if (data1.numerical.length > 0 && data2.numerical.length > 0) {
      for (const num1 of data1.numerical) {
        for (const num2 of data2.numerical) {
          const difference = Math.abs(num1 - num2) / Math.max(num1, num2);
          if (difference > 0.5) { // 50% difference threshold for conflict
            return true;
          }
        }
      }
    }
    
    // Check for categorical conflicts
    if (data1.categorical.length > 0 && data2.categorical.length > 0) {
      for (const cat1 of data1.categorical) {
        for (const cat2 of data2.categorical) {
          if (this._areCategoriesConflicting(cat1, cat2, this.validationPatterns.categorical.synonyms)) {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Calculate conflict severity
   * @private
   */
  _calculateConflictSeverity(conflicts) {
    if (conflicts.length === 0) return 'none';
    if (conflicts.length === 1) return 'low';
    if (conflicts.length <= 3) return 'medium';
    return 'high';
  }

  /**
   * Get recommended action for conflict resolution
   * @private
   */
  _getRecommendedAction(conflict, authority1, authority2) {
    const authorityDiff = Math.abs(authority1 - authority2);
    
    if (authorityDiff > 0.3) {
      return 'Accept higher authority source';
    } else if (authorityDiff > 0.1) {
      return 'Seek additional sources for verification';
    } else {
      return 'Manual review required - authorities are similar';
    }
  }

  /**
   * Extract relevant content from source
   * @private
   */
  _extractRelevantContent(source, claim) {
    const sourceContent = source.content || source.title || '';
    const claimTerms = this._extractKeyTerms(claim.text.toLowerCase());
    
    if (claimTerms.length === 0) return null;
    
    // Find sentences containing claim terms
    const sentences = sourceContent.split(/[.!?]+/);
    const relevantSentences = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      return claimTerms.some(term => lowerSentence.includes(term));
    });
    
    return relevantSentences.length > 0 ? relevantSentences.join('. ') : null;
  }

  /**
   * Compare claim with content
   * @private
   */
  _compareClaimWithContent(claim, content) {
    const claimTerms = this._extractKeyTerms(claim.text.toLowerCase());
    const contentTerms = this._extractKeyTerms(content.toLowerCase());
    
    if (claimTerms.length === 0 || contentTerms.length === 0) {
      return { similarity: 0, confidence: 0, hasConflict: false };
    }
    
    // Calculate term overlap
    let matchCount = 0;
    for (const claimTerm of claimTerms) {
      if (contentTerms.includes(claimTerm)) {
        matchCount++;
      }
    }
    
    const similarity = matchCount / claimTerms.length;
    
    // Check for conflicting terms
    const hasConflict = this._hasConflictingTerms(claimTerms, contentTerms);
    
    return {
      similarity,
      confidence: similarity > 0.5 ? 0.8 : 0.4,
      hasConflict
    };
  }

  /**
   * Check for conflicting terms
   * @private
   */
  _hasConflictingTerms(terms1, terms2) {
    const conflicts = [
      ['increase', 'decrease'], ['rise', 'fall'], ['up', 'down'],
      ['high', 'low'], ['more', 'less'], ['above', 'below']
    ];
    
    for (const [term1, term2] of conflicts) {
      if ((terms1.includes(term1) && terms2.includes(term2)) ||
          (terms1.includes(term2) && terms2.includes(term1))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract key terms from text
   * @private
   */
  _extractKeyTerms(text) {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should']);
    
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Extract geographic references
   * @private
   */
  _extractGeographicReferences(item) {
    const text = item.text || item.title || item.content || '';
    const geoReferences = [];
    
    // Common geographic patterns
    const geoPatterns = [
      /\b(los angeles|la|california|ca)\b/gi,
      /\b(new york|ny|manhattan|brooklyn)\b/gi,
      /\b(chicago|illinois|il)\b/gi,
      /\b(miami|florida|fl)\b/gi,
      /\b(seattle|washington|wa)\b/gi
    ];
    
    for (const pattern of geoPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        geoReferences.push(...matches.map(match => match.toLowerCase()));
      }
    }
    
    return [...new Set(geoReferences)]; // Remove duplicates
  }

  /**
   * Calculate geographic overlap
   * @private
   */
  _calculateGeoOverlap(geo1, geo2) {
    // Normalize geographic references
    const normalizedGeo1 = this._normalizeGeoReference(geo1);
    const normalizedGeo2 = this._normalizeGeoReference(geo2);
    
    if (normalizedGeo1 === normalizedGeo2) {
      return 1.0; // Exact match
    }
    
    // Check for related geographic areas
    const geoRelations = {
      'los angeles': ['la', 'california', 'ca'],
      'new york': ['ny', 'manhattan', 'brooklyn'],
      'chicago': ['illinois', 'il'],
      'miami': ['florida', 'fl'],
      'seattle': ['washington', 'wa']
    };
    
    for (const [primary, related] of Object.entries(geoRelations)) {
      if ((normalizedGeo1 === primary && related.includes(normalizedGeo2)) ||
          (normalizedGeo2 === primary && related.includes(normalizedGeo1))) {
        return 0.8; // Related area match
      }
    }
    
    return 0; // No overlap
  }

  /**
   * Normalize geographic reference
   * @private
   */
  _normalizeGeoReference(geoRef) {
    const normalizations = {
      'la': 'los angeles',
      'ca': 'california',
      'ny': 'new york',
      'il': 'illinois',
      'fl': 'florida',
      'wa': 'washington'
    };
    
    return normalizations[geoRef.toLowerCase()] || geoRef.toLowerCase();
  }

  /**
   * Extract claim date
   * @private
   */
  _extractClaimDate(claim) {
    const text = claim.text || '';
    
    // Look for date patterns
    const datePatterns = [
      /\b(19|20)\d{2}\b/, // Year
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b/i // Month Year
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return new Date(match[0]);
      }
    }
    
    return null;
  }

  /**
   * Check if categories are conflicting
   * @private
   */
  _areCategoriesConflicting(cat1, cat2, synonyms) {
    // Direct opposites
    const opposites = [
      ['increase', 'decrease'], ['rise', 'fall'], ['up', 'down'],
      ['high', 'low'], ['strong', 'weak'], ['more', 'less']
    ];
    
    for (const [opp1, opp2] of opposites) {
      if ((cat1 === opp1 && cat2 === opp2) || (cat1 === opp2 && cat2 === opp1)) {
        return true;
      }
    }
    
    // Check synonyms to avoid false conflicts
    for (const [term, syns] of Object.entries(synonyms)) {
      if ((cat1 === term && syns.includes(cat2)) || (cat2 === term && syns.includes(cat1))) {
        return false; // Not conflicting, they're synonyms
      }
    }
    
    return false;
  }

  /**
   * Calculate overall cross-reference score
   * @private
   */
  _calculateOverallScore(results) {
    const weights = {
      triangulation: 0.3,
      consistency: 0.25,
      authority: 0.2,
      quality: 0.15,
      conflicts: 0.1
    };

    let totalScore = 0;

    // Triangulation score
    if (results.sourceTriangulation.length > 0) {
      const triangulationScore = results.sourceTriangulation.reduce((sum, result) =>
        sum + result.triangulationScore, 0) / results.sourceTriangulation.length;
      totalScore += triangulationScore * weights.triangulation * 100;
    }

    // Consistency score (inverse of consistency issues)
    const consistencyScore = results.consistencyChecking.length === 0 ? 1.0 :
      Math.max(0, 1 - (results.consistencyChecking.length * 0.1));
    totalScore += consistencyScore * weights.consistency * 100;

    // Authority score
    if (results.authorityWeighting.length > 0) {
      const authorityScore = results.authorityWeighting.reduce((sum, result) =>
        sum + result.authorityWeight, 0) / results.authorityWeighting.length;
      totalScore += authorityScore * weights.authority * 100;
    }

    // Quality score
    if (results.qualityAssessment.length > 0) {
      const qualityScore = results.qualityAssessment.reduce((sum, result) =>
        sum + result.qualityScore, 0) / results.qualityAssessment.length;
      totalScore += qualityScore * weights.quality * 100;
    }

    // Conflict resolution score (inverse of unresolved conflicts)
    const unresolvedConflicts = results.conflictResolution.filter(r => r.resolution === 'unresolved').length;
    const conflictScore = results.conflictResolution.length === 0 ? 1.0 :
      Math.max(0, 1 - (unresolvedConflicts / results.conflictResolution.length));
    totalScore += conflictScore * weights.conflicts * 100;

    return Math.round(totalScore);
  }

  /**
   * Compile flagged cross-reference issues
   * @private
   */
  _compileFlaggedCrossReferenceIssues(results) {
    const flagged = [];

    // Add triangulation issues
    results.sourceTriangulation.forEach(result => {
      if (!result.isTriangulated) {
        flagged.push({
          type: 'triangulation_failure',
          severity: 'high',
          description: `Triangulation issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add consistency issues
    results.consistencyChecking.forEach(issue => {
      flagged.push({
        type: 'consistency_issue',
        severity: issue.severity,
        description: `Consistency issues: ${issue.issues.join(', ')}`,
        affectedClaims: [issue.claim1, issue.claim2]
      });
    });

    // Add authority issues
    results.authorityWeighting.forEach(result => {
      if (!result.meetsThreshold) {
        flagged.push({
          type: 'low_authority',
          severity: 'medium',
          description: `Low authority weight: ${result.authorityWeight.toFixed(2)}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add quality issues
    results.qualityAssessment.forEach(result => {
      if (!result.isHighQuality) {
        flagged.push({
          type: 'quality_issue',
          severity: 'medium',
          description: `Quality issues: ${result.qualityIssues.join(', ')}`,
          affectedSources: [result.source]
        });
      }
    });

    // Add unresolved conflicts
    results.conflictResolution.forEach(resolution => {
      if (resolution.resolution === 'unresolved') {
        flagged.push({
          type: 'unresolved_conflict',
          severity: 'high',
          description: `Unresolved conflict between sources`,
          affectedSources: [resolution.conflict.source1, resolution.conflict.source2]
        });
      }
    });

    return flagged;
  }

  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(results, claimsCount, sourcesCount) {
    if (claimsCount === 0) return 1.0;

    const triangulatedClaims = results.sourceTriangulation.filter(r => r.isTriangulated).length;
    const highQualitySources = results.qualityAssessment.filter(r => r.isHighQuality).length;
    const unresolvedConflicts = results.conflictResolution.filter(r => r.resolution === 'unresolved').length;

    // Base confidence on triangulation success rate
    let confidence = claimsCount > 0 ? triangulatedClaims / claimsCount : 0;

    // Boost for high-quality sources
    if (sourcesCount > 0) {
      const qualityBoost = (highQualitySources / sourcesCount) * 0.2;
      confidence += qualityBoost;
    }

    // Penalty for unresolved conflicts
    if (results.conflictResolution.length > 0) {
      const conflictPenalty = (unresolvedConflicts / results.conflictResolution.length) * 0.3;
      confidence -= conflictPenalty;
    }

    return Math.max(0.1, Math.min(confidence, 1.0));
  }

  /**
   * Initialize source authority patterns
   * @private
   */
  _initializeSourceAuthority() {
    return {
      domainPatterns: {
        government: /\.(gov|mil)$/,
        academic: /\.edu$/,
        organization: /\.org$/,
        commercial: /\.(com|net|biz)$/
      },
      authorityKeywords: {
        high: ['official', 'bureau', 'department', 'agency', 'institute'],
        medium: ['association', 'society', 'council', 'board'],
        low: ['blog', 'personal', 'opinion', 'editorial']
      }
    };
  }

  /**
   * Initialize reference patterns
   * @private
   */
  _initializeReferencePatterns() {
    return {
      citationPatterns: {
        academic: /\(\d{4}\)|et al\.|doi:|arxiv:/i,
        news: /reuters|ap news|bloomberg|wsj/i,
        government: /\.gov|census|bureau|department/i
      },
      qualityIndicators: {
        positive: ['peer-reviewed', 'official', 'verified', 'confirmed'],
        negative: ['unverified', 'alleged', 'rumored', 'speculation']
      }
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
   * Validate sources input
   * @private
   */
  _validateSources(sources) {
    return sources.filter(source => {
      return source &&
             typeof source === 'object' &&
             (source.title || source.content || source.url);
    });
  }

  /**
   * Create empty result for no claims/sources
   * @private
   */
  _createEmptyResult() {
    return {
      overallCrossReferenceScore: 100, // No claims = no cross-reference issues
      results: {
        sourceTriangulation: [],
        consistencyChecking: [],
        authorityWeighting: [],
        qualityAssessment: [],
        conflictResolution: []
      },
      flaggedCrossReferenceIssues: [],
      confidence: 1.0,
      processingTime: 0
    };
  }
}

module.exports = CrossReferenceValidator;