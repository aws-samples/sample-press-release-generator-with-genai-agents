const { logger } = require('../../../utils/logger');
const { ValidationError } = require('../../../utils/errorHandler');

/**
 * Source Tracker Agent
 * Ensures proper source attribution and tracks data lineage
 * 
 * Features:
 * - Mandatory source attribution tracking
 * - Data lineage validation
 * - Source reliability scoring
 * - Attribution pattern recognition
 * - Missing source detection
 * - Source quality assessment
 */
class SourceTracker {
  constructor(options = {}) {
    this.name = 'SourceTracker';
    this.version = '1.0.0';
    
    this.config = {
      confidenceThreshold: options.confidenceThreshold || 0.8,
      minSourcesRequired: options.minSourcesRequired || 1,
      highPriorityMinSources: options.highPriorityMinSources || 2,
      sourceReliabilityThreshold: options.sourceReliabilityThreshold || 0.7,
      timeout: options.timeout || 15000
    };
    
    this.isInitialized = false;
    
    // Source attribution patterns
    this.attributionPatterns = [
      { pattern: /according to\s+([^,\.]+)/gi, type: 'direct_attribution' },
      { pattern: /data (?:from|shows?|indicates?)\s+([^,\.]+)/gi, type: 'data_source' },
      { pattern: /reports?\s+(?:from|by)\s+([^,\.]+)/gi, type: 'report_source' },
      { pattern: /analysis (?:from|by|reveals?)\s+([^,\.]+)/gi, type: 'analysis_source' },
      { pattern: /study (?:from|by|finds?)\s+([^,\.]+)/gi, type: 'study_source' },
      { pattern: /research (?:from|by|shows?)\s+([^,\.]+)/gi, type: 'research_source' },
      { pattern: /survey (?:from|by|indicates?)\s+([^,\.]+)/gi, type: 'survey_source' }
    ];
    
    // Reliable source patterns and scoring
    this.sourceReliability = {
      'government': {
        patterns: [/census|bureau|federal|government|\.gov/i],
        score: 0.95,
        category: 'official'
      },
      'industry_association': {
        patterns: [/association|institute|council|board/i],
        score: 0.85,
        category: 'industry'
      },
      'research_institution': {
        patterns: [/university|college|research|institute/i],
        score: 0.90,
        category: 'academic'
      },
      'real_estate_platform': {
        patterns: [/Example Company|Competitor One|competitor2\.com|mls/i],
        score: 0.80,
        category: 'platform'
      },
      'financial_institution': {
        patterns: [/bank|mortgage|lending|financial/i],
        score: 0.85,
        category: 'financial'
      },
      'news_media': {
        patterns: [/news|times|post|journal|reuters|bloomberg/i],
        score: 0.70,
        category: 'media'
      }
    };
    
    // Claims that require mandatory source attribution
    this.mandatorySourceClaims = [
      /\d+%.*(?:increase|decrease|change)/i,
      /\$[\d,]+.*(?:median|average|typical)/i,
      /\d+.*(?:homes?|listings?|properties)/i,
      /\d+.*days?\s+on\s+market/i,
      /(?:fha|va|conventional).*\d+%/i
    ];
    
    // Source tracking cache
    this.sourceCache = new Map();
    this.cacheExpiry = 1800000; // 30 minutes
  }

  /**
   * Initialize the Source Tracker
   */
  async initialize() {
    try {
      logger.info('Initializing SourceTracker', {
        config: this.config,
        attributionPatterns: this.attributionPatterns.length,
        sourceTypes: Object.keys(this.sourceReliability)
      });
      
      this.isInitialized = true;
      logger.info('SourceTracker initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize SourceTracker', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate source attribution for claims
   */
  async validateClaims(claims, content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SourceTracker not initialized');
    }

    const { jobId } = options;
    const startTime = Date.now();

    logger.debug('Starting source attribution validation', {
      jobId,
      claimsCount: claims.length,
      market: marketContext.market
    });

    try {
      const result = {
        agent: 'SourceTracker',
        confidence: 100,
        issues: [],
        corrections: [],
        metadata: {
          sourcesFound: 0,
          attributionCoverage: 0,
          sourceReliabilityScore: 0,
          trackingChecks: [],
          processingTime: 0
        }
      };

      // Step 1: Extract and analyze source attributions
      const sourceAnalysis = await this._analyzeSourceAttributions(content, jobId);
      result.metadata.sourcesFound = sourceAnalysis.sources.length;
      result.metadata.sourceReliabilityScore = sourceAnalysis.averageReliability;
      result.metadata.trackingChecks.push('source_extraction');

      // Step 2: Validate mandatory source requirements
      const mandatoryValidation = await this._validateMandatorySources(claims, content, sourceAnalysis, jobId);
      result.confidence -= mandatoryValidation.penalty;
      result.issues.push(...mandatoryValidation.issues);
      result.corrections.push(...mandatoryValidation.corrections);
      result.metadata.trackingChecks.push('mandatory_sources');

      // Step 3: Validate source attribution coverage
      const coverageValidation = await this._validateAttributionCoverage(claims, content, sourceAnalysis, jobId);
      result.confidence -= coverageValidation.penalty;
      result.issues.push(...coverageValidation.issues);
      result.corrections.push(...coverageValidation.corrections);
      result.metadata.attributionCoverage = coverageValidation.coverage;
      result.metadata.trackingChecks.push('attribution_coverage');

      // Step 4: Validate source quality and reliability
      const qualityValidation = await this._validateSourceQuality(sourceAnalysis, jobId);
      result.confidence -= qualityValidation.penalty;
      result.issues.push(...qualityValidation.issues);
      result.corrections.push(...qualityValidation.corrections);
      result.metadata.trackingChecks.push('source_quality');

      // Step 5: Validate data lineage consistency
      const lineageValidation = await this._validateDataLineage(claims, content, sourceAnalysis, jobId);
      result.confidence -= lineageValidation.penalty;
      result.issues.push(...lineageValidation.issues);
      result.corrections.push(...lineageValidation.corrections);
      result.metadata.trackingChecks.push('data_lineage');

      // Step 6: Check for source attribution best practices
      const bestPracticesValidation = await this._validateAttributionBestPractices(content, sourceAnalysis, jobId);
      result.confidence -= bestPracticesValidation.penalty;
      result.issues.push(...bestPracticesValidation.issues);
      result.corrections.push(...bestPracticesValidation.corrections);
      result.metadata.trackingChecks.push('best_practices');

      result.metadata.processingTime = Date.now() - startTime;
      result.confidence = Math.max(0, Math.min(100, result.confidence));

      logger.debug('Source attribution validation completed', {
        jobId,
        confidence: result.confidence,
        sourcesFound: result.metadata.sourcesFound,
        issuesFound: result.issues.length,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Source attribution validation failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'SourceTracker',
        confidence: 50,
        issues: [{
          type: 'source_tracking_error',
          issue: 'Source attribution validation encountered an error',
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
   * Analyze source attributions in content
   */
  async _analyzeSourceAttributions(content, jobId) {
    try {
      const sources = [];
      const attributions = [];

      // Extract source attributions using patterns
      for (const { pattern, type } of this.attributionPatterns) {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        
        while ((match = regex.exec(content)) !== null) {
          const sourceText = match[1].trim();
          const reliability = this._calculateSourceReliability(sourceText);
          
          const source = {
            text: sourceText,
            type,
            position: match.index,
            context: this._extractContext(content, match[0], match.index),
            reliability: reliability.score,
            category: reliability.category,
            fullMatch: match[0]
          };
          
          sources.push(source);
          attributions.push({
            pattern: type,
            source: sourceText,
            position: match.index
          });
        }
      }

      // Calculate average reliability
      const averageReliability = sources.length > 0 
        ? sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length 
        : 0;

      // Remove duplicates
      const uniqueSources = this._deduplicateSources(sources);

      logger.debug('Source attribution analysis completed', {
        jobId,
        totalSources: sources.length,
        uniqueSources: uniqueSources.length,
        averageReliability: averageReliability.toFixed(2)
      });

      return {
        sources: uniqueSources,
        attributions,
        averageReliability,
        sourceTypes: this._groupSourcesByType(uniqueSources)
      };

    } catch (error) {
      logger.warn('Source attribution analysis failed', {
        jobId,
        error: error.message
      });
      
      return {
        sources: [],
        attributions: [],
        averageReliability: 0,
        sourceTypes: {}
      };
    }
  }

  /**
   * Validate mandatory source requirements
   */
  async _validateMandatorySources(claims, content, sourceAnalysis, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const mandatoryClaims = this._identifyMandatoryClaims(claims);
      
      if (mandatoryClaims.length === 0) {
        return result;
      }

      logger.debug('Validating mandatory sources', {
        jobId,
        mandatoryClaims: mandatoryClaims.length,
        sourcesAvailable: sourceAnalysis.sources.length
      });

      // Check if we have sufficient sources for mandatory claims
      const requiredSources = mandatoryClaims.length >= 3 ? this.config.highPriorityMinSources : this.config.minSourcesRequired;
      
      if (sourceAnalysis.sources.length < requiredSources) {
        result.penalty += 30;
        result.issues.push({
          type: 'insufficient_mandatory_sources',
          issue: `Content has ${mandatoryClaims.length} claims requiring source attribution but only ${sourceAnalysis.sources.length} sources found`,
          requiredSources,
          foundSources: sourceAnalysis.sources.length,
          mandatoryClaims: mandatoryClaims.map(c => c.text),
          severity: 'critical'
        });

        result.corrections.push({
          type: 'add_source_attribution',
          target: 'content_generator',
          action: 'Add source attribution for statistical and factual claims',
          requiredSources: requiredSources - sourceAnalysis.sources.length
        });
      }

      // Check specific mandatory claims for nearby source attribution
      for (const claim of mandatoryClaims) {
        const hasNearbySource = this._hasNearbySourceAttribution(claim, content, sourceAnalysis);
        
        if (!hasNearbySource) {
          result.penalty += 15;
          result.issues.push({
            type: 'missing_claim_source',
            claim: claim.text,
            issue: 'Mandatory claim lacks nearby source attribution',
            severity: 'high'
          });

          result.corrections.push({
            type: 'add_claim_source',
            target: 'content_generator',
            action: 'Add source attribution for specific claim',
            claim: claim.text
          });
        }
      }

    } catch (error) {
      logger.warn('Mandatory source validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 10;
    }

    return result;
  }

  /**
   * Validate attribution coverage
   */
  async _validateAttributionCoverage(claims, content, sourceAnalysis, jobId) {
    const result = { penalty: 0, issues: [], corrections: [], coverage: 0 };

    try {
      const statisticalClaims = claims.filter(claim => 
        claim.type === 'statistical' || 
        /\d+%|\$[\d,]+|\d+\.\d+%/.test(claim.text)
      );

      if (statisticalClaims.length === 0) {
        result.coverage = 1.0;
        return result;
      }

      let coveredClaims = 0;
      
      for (const claim of statisticalClaims) {
        if (this._hasSourceAttribution(claim, content, sourceAnalysis)) {
          coveredClaims++;
        }
      }

      result.coverage = statisticalClaims.length > 0 ? coveredClaims / statisticalClaims.length : 1.0;

      logger.debug('Attribution coverage analysis', {
        jobId,
        statisticalClaims: statisticalClaims.length,
        coveredClaims,
        coverage: result.coverage
      });

      if (result.coverage < 0.8) {
        const penalty = Math.round((0.8 - result.coverage) * 40);
        result.penalty += penalty;
        
        result.issues.push({
          type: 'low_attribution_coverage',
          issue: `Only ${(result.coverage * 100).toFixed(1)}% of statistical claims have source attribution`,
          coverage: result.coverage,
          statisticalClaims: statisticalClaims.length,
          coveredClaims,
          severity: result.coverage < 0.5 ? 'critical' : 'high'
        });

        result.corrections.push({
          type: 'improve_attribution_coverage',
          target: 'content_generator',
          action: 'Add source attribution for uncovered statistical claims',
          targetCoverage: '80%'
        });
      }

    } catch (error) {
      logger.warn('Attribution coverage validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate source quality and reliability
   */
  async _validateSourceQuality(sourceAnalysis, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      if (sourceAnalysis.sources.length === 0) {
        return result;
      }

      logger.debug('Validating source quality', {
        jobId,
        sources: sourceAnalysis.sources.length,
        averageReliability: sourceAnalysis.averageReliability
      });

      // Check overall source reliability
      if (sourceAnalysis.averageReliability < this.config.sourceReliabilityThreshold) {
        result.penalty += 20;
        result.issues.push({
          type: 'low_source_reliability',
          issue: `Average source reliability score ${sourceAnalysis.averageReliability.toFixed(2)} below threshold ${this.config.sourceReliabilityThreshold}`,
          averageReliability: sourceAnalysis.averageReliability,
          threshold: this.config.sourceReliabilityThreshold,
          severity: 'medium'
        });

        result.corrections.push({
          type: 'improve_source_quality',
          target: 'market_researcher',
          action: 'Use more reliable and authoritative sources',
          suggestedSources: 'Government agencies, industry associations, research institutions'
        });
      }

      // Check for low-reliability sources
      const lowReliabilitySources = sourceAnalysis.sources.filter(s => s.reliability < 0.6);
      
      if (lowReliabilitySources.length > 0) {
        result.penalty += lowReliabilitySources.length * 5;
        result.issues.push({
          type: 'unreliable_sources',
          issue: `${lowReliabilitySources.length} sources have low reliability scores`,
          unreliableSources: lowReliabilitySources.map(s => ({
            text: s.text,
            reliability: s.reliability,
            category: s.category
          })),
          severity: 'medium'
        });
      }

      // Check source diversity
      const sourceCategories = new Set(sourceAnalysis.sources.map(s => s.category));
      if (sourceCategories.size === 1 && sourceAnalysis.sources.length > 1) {
        result.penalty += 10;
        result.issues.push({
          type: 'low_source_diversity',
          issue: 'All sources are from the same category',
          category: Array.from(sourceCategories)[0],
          severity: 'low'
        });

        result.corrections.push({
          type: 'diversify_sources',
          target: 'market_researcher',
          action: 'Include sources from different categories for better validation'
        });
      }

    } catch (error) {
      logger.warn('Source quality validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate data lineage consistency
   */
  async _validateDataLineage(claims, content, sourceAnalysis, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      // Check if sources are appropriate for the claims they support
      for (const source of sourceAnalysis.sources) {
        const lineageCheck = this._validateSourceLineage(source, claims, content);
        
        if (!lineageCheck.valid) {
          result.penalty += lineageCheck.penalty;
          result.issues.push({
            type: 'data_lineage_mismatch',
            source: source.text,
            issue: lineageCheck.issue,
            severity: lineageCheck.severity
          });

          if (lineageCheck.severity === 'high') {
            result.corrections.push({
              type: 'fix_data_lineage',
              target: 'market_researcher',
              action: 'Ensure source appropriateness for supported claims',
              source: source.text
            });
          }
        }
      }

      // Check for temporal consistency in sources
      const temporalIssues = this._checkTemporalConsistency(sourceAnalysis.sources, content);
      result.penalty += temporalIssues.penalty;
      result.issues.push(...temporalIssues.issues);

    } catch (error) {
      logger.warn('Data lineage validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate attribution best practices
   */
  async _validateAttributionBestPractices(content, sourceAnalysis, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      // Check for vague attributions
      const vagueSources = sourceAnalysis.sources.filter(s => this._isVagueAttribution(s.text));
      
      if (vagueSources.length > 0) {
        result.penalty += vagueSources.length * 5;
        result.issues.push({
          type: 'vague_source_attribution',
          issue: `${vagueSources.length} sources use vague attribution language`,
          vagueSources: vagueSources.map(s => s.text),
          severity: 'low'
        });

        result.corrections.push({
          type: 'improve_attribution_specificity',
          target: 'content_generator',
          action: 'Use more specific source attribution language',
          examples: 'Instead of "data shows", use "according to [specific source]"'
        });
      }

      // Check for proper citation format
      const citationIssues = this._checkCitationFormat(sourceAnalysis.sources);
      result.penalty += citationIssues.penalty;
      result.issues.push(...citationIssues.issues);
      result.corrections.push(...citationIssues.corrections);

      // Check source placement and context
      const placementIssues = this._checkSourcePlacement(sourceAnalysis.sources, content);
      result.penalty += placementIssues.penalty;
      result.issues.push(...placementIssues.issues);

    } catch (error) {
      logger.warn('Attribution best practices validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  // Helper methods

  /**
   * Calculate source reliability score
   */
  _calculateSourceReliability(sourceText) {
    const textLower = sourceText.toLowerCase();
    
    for (const [type, config] of Object.entries(this.sourceReliability)) {
      for (const pattern of config.patterns) {
        if (pattern.test(textLower)) {
          return {
            score: config.score,
            category: config.category,
            type
          };
        }
      }
    }
    
    // Default reliability for unrecognized sources
    return {
      score: 0.5,
      category: 'unknown',
      type: 'unrecognized'
    };
  }

  /**
   * Identify claims that require mandatory source attribution
   */
  _identifyMandatoryClaims(claims) {
    return claims.filter(claim => {
      return this.mandatorySourceClaims.some(pattern => pattern.test(claim.text)) ||
             claim.priority === 'high' ||
             claim.priority === 'critical';
    });
  }

  /**
   * Check if claim has nearby source attribution
   */
  _hasNearbySourceAttribution(claim, content, sourceAnalysis) {
    const claimIndex = content.toLowerCase().indexOf(claim.text.toLowerCase());
    if (claimIndex === -1) return false;
    
    const searchRadius = 200; // characters
    const searchStart = Math.max(0, claimIndex - searchRadius);
    const searchEnd = Math.min(content.length, claimIndex + claim.text.length + searchRadius);
    
    return sourceAnalysis.sources.some(source => 
      source.position >= searchStart && source.position <= searchEnd
    );
  }

  /**
   * Check if claim has source attribution
   */
  _hasSourceAttribution(claim, content, sourceAnalysis) {
    // Check for nearby attribution (within 300 characters)
    return this._hasNearbySourceAttribution(claim, content, sourceAnalysis);
  }

  /**
   * Deduplicate sources based on text similarity
   */
  _deduplicateSources(sources) {
    const unique = [];
    
    for (const source of sources) {
      const isDuplicate = unique.some(existing => 
        this._calculateTextSimilarity(source.text, existing.text) > 0.8
      );
      
      if (!isDuplicate) {
        unique.push(source);
      }
    }
    
    return unique;
  }

  /**
   * Group sources by type
   */
  _groupSourcesByType(sources) {
    return sources.reduce((groups, source) => {
      if (!groups[source.type]) groups[source.type] = [];
      groups[source.type].push(source);
      return groups;
    }, {});
  }

  /**
   * Validate source lineage appropriateness
   */
  _validateSourceLineage(source, claims, content) {
    // Check if source type matches claim requirements
    const sourceContext = source.context.toLowerCase();
    
    // Real estate sources should support real estate claims
    if (/real estate|housing|property/.test(sourceContext)) {
      if (source.category !== 'platform' && source.category !== 'industry' && source.category !== 'official') {
        return {
          valid: false,
          penalty: 10,
          issue: 'Real estate claim supported by non-real estate source',
          severity: 'medium'
        };
      }
    }
    
    // Statistical claims should have authoritative sources
    if (/\d+%|\$[\d,]+/.test(sourceContext)) {
      if (source.reliability < 0.7) {
        return {
          valid: false,
          penalty: 15,
          issue: 'Statistical claim supported by low-reliability source',
          severity: 'high'
        };
      }
    }
    
    return { valid: true };
  }

  /**
   * Check temporal consistency of sources
   */
  _checkTemporalConsistency(sources, content) {
    const result = { penalty: 0, issues: [] };
    
    // Extract years from content and sources
    const contentYears = this._extractYears(content);
    const currentYear = new Date().getFullYear();
    
    for (const source of sources) {
      const sourceYears = this._extractYears(source.text + ' ' + source.context);
      
      // Check if source years are reasonable
      for (const year of sourceYears) {
        if (year > currentYear + 1) {
          result.penalty += 10;
          result.issues.push({
            type: 'future_source_date',
            source: source.text,
            year,
            issue: 'Source references future date',
            severity: 'medium'
          });
        }
        
        if (year < currentYear - 5 && contentYears.includes(currentYear)) {
          result.penalty += 5;
          result.issues.push({
            type: 'outdated_source',
            source: source.text,
            year,
            issue: 'Source data may be outdated for current claims',
            severity: 'low'
          });
        }
      }
    }
    
    return result;
  }

  /**
   * Check if attribution is vague
   */
  _isVagueAttribution(sourceText) {
    const vaguePatterns = [
      /^data$/i,
      /^reports?$/i,
      /^studies?$/i,
      /^research$/i,
      /^analysis$/i,
      /^experts?$/i,
      /^sources?$/i
    ];
    
    return vaguePatterns.some(pattern => pattern.test(sourceText.trim()));
  }

  /**
   * Check citation format
   */
  _checkCitationFormat(sources) {
    const result = { penalty: 0, issues: [], corrections: [] };
    
    for (const source of sources) {
      // Check for proper capitalization
      if (source.text === source.text.toLowerCase() && source.text.length > 5) {
        result.penalty += 2;
        result.issues.push({
          type: 'improper_source_capitalization',
          source: source.text,
          issue: 'Source name lacks proper capitalization',
          severity: 'low'
        });
      }
      
      // Check for incomplete organization names
      if (source.text.length < 3) {
        result.penalty += 5;
        result.issues.push({
          type: 'incomplete_source_name',
          source: source.text,
          issue: 'Source name appears incomplete',
          severity: 'medium'
        });
      }
    }
    
    if (result.issues.length > 0) {
      result.corrections.push({
        type: 'improve_citation_format',
        target: 'content_generator',
        action: 'Improve source citation formatting and completeness'
      });
    }
    
    return result;
  }

  /**
   * Check source placement in content
   */
  _checkSourcePlacement(sources, content) {
    const result = { penalty: 0, issues: [] };
    
    // Check if sources are clustered (bad practice)
    const positions = sources.map(s => s.position).sort((a, b) => a - b);
    
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] - positions[i-1] < 50) { // Too close together
        result.penalty += 3;
        result.issues.push({
          type: 'clustered_source_attribution',
          issue: 'Source attributions are clustered together',
          severity: 'low'
        });
        break; // Only report once
      }
    }
    
    return result;
  }

  // Utility methods

  _extractContext(content, match, position) {
    const contextRadius = 150;
    const start = Math.max(0, position - contextRadius);
    const end = Math.min(content.length, position + match.length + contextRadius);
    
    return content.substring(start, end).trim();
  }

  _calculateTextSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\W+/);
    const words2 = text2.toLowerCase().split(/\W+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  _extractYears(text) {
    const yearPattern = /\b(20\d{2})\b/g;
    const years = [];
    let match;
    
    while ((match = yearPattern.exec(text)) !== null) {
      years.push(parseInt(match[1]));
    }
    
    return years;
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agent: this.name,
      version: this.version,
      initialized: this.isInitialized,
      config: this.config,
      attributionPatterns: this.attributionPatterns.length,
      sourceTypes: Object.keys(this.sourceReliability),
      cacheSize: this.sourceCache.size
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up SourceTracker');
    this.sourceCache.clear();
    this.isInitialized = false;
  }
}

module.exports = SourceTracker;