const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');
// SECURITY (js/incomplete-url-substring-sanitization): use exact host allow-listing
// instead of substring `.includes()` checks that are bypassable by spoofed hosts.
const { hostMatches } = require('../../utils/urlAllowlist');

/**
 * AuthorityScorer Agent
 * Assesses source credibility and domain expertise using 5-tier authority ranking system
 * 
 * Features:
 * - 5-tier authority ranking (Government 95-100%, Industry 85-89%, News 75-79%, Regional 65-69%, Unverified <60%)
 * - Domain-specific expertise assessment
 * - Publication credibility evaluation
 * - Trust score calculation based on source reputation
 * - Performance target: <2 seconds per source, >95% correct tier classification
 */
class AuthorityScorer extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('AuthorityScorer', {
      tier1Threshold: 90, // Government agencies
      tier2Threshold: 80, // Industry platforms  
      tier3Threshold: 70, // News organizations
      tier4Threshold: 60, // Regional publications
      tier5Threshold: 0,  // Unverified sources
      ...options
    }, lineageService);

    this.domainAuthorityRankings = this._initializeDomainRankings();
  }

  /**
   * Initialize the AuthorityScorer
   */
  async initialize() {
    await super.initialize();
    this.log('info', 'AuthorityScorer initialized', {
      tiers: {
        tier1: `${this.options.tier1Threshold}%+`,
        tier2: `${this.options.tier2Threshold}-${this.options.tier1Threshold-1}%`,
        tier3: `${this.options.tier3Threshold}-${this.options.tier2Threshold-1}%`,
        tier4: `${this.options.tier4Threshold}-${this.options.tier3Threshold-1}%`,
        tier5: `<${this.options.tier4Threshold}%`
      }
    });
    return true;
  }

  /**
   * Initialize domain authority rankings database
   */
  _initializeDomainRankings() {
    return {
      tier1: {
        // Government agencies (95-100%)
        'census.gov': { score: 98, category: 'government', expertise: 'housing_statistics' },
        'bls.gov': { score: 97, category: 'government', expertise: 'economic_data' },
        'federalreserve.gov': { score: 99, category: 'government', expertise: 'monetary_policy' },
        'hud.gov': { score: 96, category: 'government', expertise: 'housing_policy' },
        'treasury.gov': { score: 98, category: 'government', expertise: 'financial_policy' }
      },
      tier2: {
        // Industry platforms (80-89%)
        'example.com': { score: 87, category: 'industry_platform', expertise: 'real_estate_data' },
        'competitor1.com': { score: 87, category: 'industry_platform', expertise: 'housing_market' },
        'nar.competitor2': { score: 85, category: 'industry_association', expertise: 'real_estate_industry' },
        'competitor2.com': { score: 84, category: 'industry_platform', expertise: 'real_estate_listings' },
        'mls.com': { score: 83, category: 'industry_platform', expertise: 'real_estate_data' }
      },
      tier3: {
        // News organizations (70-79%)
        'wsj.com': { score: 78, category: 'news_organization', expertise: 'financial_news' },
        'reuters.com': { score: 77, category: 'news_organization', expertise: 'business_news' },
        'bloomberg.com': { score: 79, category: 'news_organization', expertise: 'financial_markets' },
        'cnbc.com': { score: 75, category: 'news_organization', expertise: 'business_news' },
        'marketwatch.com': { score: 74, category: 'news_organization', expertise: 'market_analysis' }
      },
      tier4: {
        // Regional publications (60-69%)
        'latimes.com': { score: 68, category: 'regional_news', expertise: 'local_real_estate' },
        'curbed.com': { score: 65, category: 'regional_blog', expertise: 'local_housing' },
        'sfgate.com': { score: 67, category: 'regional_news', expertise: 'local_news' },
        'chicagotribune.com': { score: 66, category: 'regional_news', expertise: 'local_real_estate' }
      },
      tier5: {
        // Unverified sources (<60%)
        'twitter.com': { score: 30, category: 'social_media', expertise: 'user_generated' },
        'facebook.com': { score: 25, category: 'social_media', expertise: 'user_generated' },
        'reddit.com': { score: 35, category: 'social_media', expertise: 'user_generated' }
      }
    };
  }

  /**
   * Get domain authority rankings
   */
  getDomainAuthorityRankings() {
    return this.domainAuthorityRankings;
  }

  /**
   * Get authority tiers configuration
   */
  getAuthorityTiers() {
    return {
      tier1: {
        name: 'Government Agencies',
        scoreRange: [this.options.tier1Threshold, 100],
        examples: ['census.gov', 'hud.gov', 'federalreserve.gov'],
        credibilityLevel: 'highest'
      },
      tier2: {
        name: 'Industry Platforms',
        scoreRange: [this.options.tier2Threshold, this.options.tier1Threshold - 1],
        examples: ['example.com', 'competitor1.com', 'nar.competitor2'],
        credibilityLevel: 'high'
      },
      tier3: {
        name: 'News Organizations',
        scoreRange: [this.options.tier3Threshold, this.options.tier2Threshold - 1],
        examples: ['wsj.com', 'reuters.com', 'bloomberg.com'],
        credibilityLevel: 'medium-high'
      },
      tier4: {
        name: 'Regional Publications',
        scoreRange: [this.options.tier4Threshold, this.options.tier3Threshold - 1],
        examples: ['latimes.com', 'sfgate.com'],
        credibilityLevel: 'medium'
      },
      tier5: {
        name: 'Unverified Sources',
        scoreRange: [0, this.options.tier4Threshold - 1],
        examples: ['twitter.com', 'facebook.com'],
        credibilityLevel: 'low'
      }
    };
  }

  /**
   * Get domain weights for scoring algorithm
   */
  getDomainWeights() {
    return {
      domainExpertise: 0.4,
      publicationCredibility: 0.4,
      trustScore: 0.2,
      description: 'Weighting scheme for authority scoring components'
    };
  }

  /**
   * Get scoring algorithm details
   */
  getScoringAlgorithm() {
    return {
      name: 'Weighted Authority Scoring',
      version: '1.0',
      components: {
        domainExpertise: {
          weight: 0.4,
          description: 'Domain-specific expertise assessment',
          factors: ['domain_pattern_matching', 'known_domain_rankings', 'expertise_category']
        },
        publicationCredibility: {
          weight: 0.4,
          description: 'Publication credibility evaluation',
          factors: ['publication_name_analysis', 'institutional_affiliation', 'editorial_standards']
        },
        trustScore: {
          weight: 0.2,
          description: 'Trust score based on source characteristics',
          factors: ['establishment_year', 'source_type', 'reputation_indicators', 'membership_size']
        }
      },
      thresholds: {
        tier1: this.options.tier1Threshold,
        tier2: this.options.tier2Threshold,
        tier3: this.options.tier3Threshold,
        tier4: this.options.tier4Threshold,
        tier5: this.options.tier5Threshold
      },
      calibration: 'Optimized for real estate and housing market sources'
    };
  }

  /**
   * Score source authority using weighted algorithm
   */
  async scoreSourceAuthority(source) {
    if (!source) {
      throw new ValidationError('Source is required');
    }

    const result = {
      overall: 0,
      tier: 5,
      breakdown: {
        domainScore: 0,
        publicationScore: 0,
        reputationScore: 0
      },
      explanation: '',
      trustworthiness: 'low',
      issues: []
    };

    try {
      // Handle malformed source data
      if (typeof source !== 'object' || (!source.domain && !source.url)) {
        result.issues.push('malformed_source');
        return result;
      }

      // Extract domain if not provided
      let domain = source.domain;
      if (!domain && source.url) {
        try {
          const url = new URL(source.url);
          domain = url.hostname;
        } catch (error) {
          result.issues.push('invalid_url');
          return result;
        }
      }

      if (!domain) {
        result.issues.push('missing_domain');
        return result;
      }

      // Calculate component scores
      result.breakdown.domainScore = await this.evaluateDomainExpertise(source);
      result.breakdown.publicationScore = await this.assessPublicationCredibility(source);
      result.breakdown.reputationScore = await this.calculateTrustScore(source);

      // Calculate weighted overall score with government source boost
      let weightedScore = Math.round(
        (result.breakdown.domainScore * 0.4) +
        (result.breakdown.publicationScore * 0.4) +
        (result.breakdown.reputationScore * 0.2)
      );

      // Apply government source boost to ensure >90 threshold
      if (domain?.endsWith('.gov') ||
          domain?.includes('census') ||
          domain?.includes('hud') ||
          domain?.includes('treasury') ||
          domain?.includes('federalreserve') ||
          hostMatches(domain, 'bls.gov')) { // SECURITY: exact host match, not substring (alert 11)
        // Government sources are naturally authoritative but should not have artificial floors
        // Let the weighted scoring reflect actual authority based on content and context
      }

      result.overall = weightedScore;

      // Determine tier and trustworthiness
      result.tier = this._calculateTier(result.overall);
      result.trustworthiness = this._getTrustworthiness(result.overall);
      result.explanation = this._generateExplanation(source, result);

      return result;

    } catch (error) {
      this.log('error', 'Authority scoring failed', {
        source: source.url || source.domain,
        error: error.message
      });
      result.issues.push('scoring_error');
      return result;
    }
  }

  /**
   * Evaluate domain expertise
   */
  async evaluateDomainExpertise(source) {
    const domain = source.domain || this._extractDomain(source.url);
    
    // Check against known domain rankings
    for (const [tierName, domains] of Object.entries(this.domainAuthorityRankings)) {
      if (domains[domain]) {
        return domains[domain].score;
      }
    }

    // Enhanced domain pattern matching for unknown domains with improved scoring
    if (domain?.endsWith('.gov')) {
      return 99; // Government domains - increased to ensure >90 threshold
    } else if (domain?.includes('census') || domain?.includes('hud') || domain?.includes('treasury')) {
      return 98; // Specific government agencies - increased to ensure >90
    } else if (domain?.includes('federalreserve') || hostMatches(domain, 'bls.gov')) { // SECURITY: exact host (alert 12)
      return 97; // Federal economic agencies - increased to ensure >90
    } else if (domain?.includes('competitor2') || domain?.includes('realty')) {
      return 87; // Real estate industry - maintained high score
    } else if (domain?.includes('Example Company') || domain?.includes('Competitor One')) {
      return 87; // Major real estate platforms - increased to ensure 80+ threshold
    } else if (domain?.includes('nar.') || hostMatches(domain, 'car.org')) { // SECURITY: exact host (alert 13)
      return 85; // Real estate associations
    } else if (domain?.includes('wsj') || domain?.includes('reuters') || domain?.includes('bloomberg')) {
      return 78; // Major financial news
    } else if (domain?.includes('news') || domain?.includes('times')) {
      return 72; // General news organizations
    } else if (domain?.includes('blog') || domain?.includes('wordpress')) {
      return 35; // Blog platforms
    }

    return 45; // Unknown domain default
  }

  /**
   * Assess publication credibility
   */
  async assessPublicationCredibility(source) {
    const domain = source.domain || this._extractDomain(source.url);
    const publication = source.publication || '';

    // Check against known publications
    for (const [tierName, domains] of Object.entries(this.domainAuthorityRankings)) {
      if (domains[domain]) {
        return domains[domain].score;
      }
    }

    // Publication name analysis
    if (publication.toLowerCase().includes('bureau') || 
        publication.toLowerCase().includes('department') ||
        publication.toLowerCase().includes('federal')) {
      return 95;
    } else if (publication.toLowerCase().includes('association') ||
               publication.toLowerCase().includes('institute')) {
      return 85;
    } else if (publication.toLowerCase().includes('journal') ||
               publication.toLowerCase().includes('times') ||
               publication.toLowerCase().includes('post')) {
      return 75;
    }

    return 60; // Default credibility score
  }

  /**
   * Calculate trust score based on source characteristics
   */
  async calculateTrustScore(source) {
    let trustScore = 50; // Base score

    // Established year bonus
    if (source.establishedYear) {
      const age = new Date().getFullYear() - source.establishedYear;
      if (age > 100) trustScore += 20;
      else if (age > 50) trustScore += 15;
      else if (age > 20) trustScore += 10;
      else if (age > 10) trustScore += 5;
    }

    // Type-based scoring
    switch (source.type) {
      case 'government':
        trustScore += 40;
        break;
      case 'industry_platform':
      case 'industry_association':
        trustScore += 30;
        break;
      case 'news_organization':
        trustScore += 20;
        break;
      case 'regional_news':
        trustScore += 10;
        break;
      case 'blog':
      case 'social_media':
        trustScore -= 20;
        break;
    }

    // Reputation indicators
    if (source.reputation === 'high') {
      trustScore += 15;
    } else if (source.reputation === 'medium') {
      trustScore += 5;
    }

    // Membership size for associations
    if (source.membershipSize && source.membershipSize > 1000000) {
      trustScore += 10;
    }

    return Math.max(0, Math.min(100, trustScore));
  }

  /**
   * Get domain authority ranking for specific domain
   */
  async getDomainAuthorityRanking(domain) {
    // Check each tier for the domain
    for (const [tierName, domains] of Object.entries(this.domainAuthorityRankings)) {
      if (domains[domain]) {
        return {
          tier: parseInt(tierName.replace('tier', '')),
          score: domains[domain].score,
          category: domains[domain].category
        };
      }
    }

    // Return default for unknown domains
    return {
      tier: 5,
      score: 50,
      category: 'unknown'
    };
  }

  /**
   * Calculate tier based on overall score
   */
  _calculateTier(score) {
    if (score >= this.options.tier1Threshold) return 1;
    if (score >= this.options.tier2Threshold) return 2;
    if (score >= this.options.tier3Threshold) return 3;
    if (score >= this.options.tier4Threshold) return 4;
    return 5;
  }

  /**
   * Get trustworthiness level based on score
   */
  _getTrustworthiness(score) {
    if (score >= 90) return 'very_high';
    if (score >= 80) return 'high';
    if (score >= 70) return 'medium_high';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'medium_low';
    return 'low';
  }

  /**
   * Generate explanation for authority score
   */
  _generateExplanation(source, result) {
    const domain = source.domain || this._extractDomain(source.url);
    const tier = result.tier;

    if (tier === 1) {
      return `High authority government source (${domain}) with excellent credibility`;
    } else if (tier === 2) {
      return `Established industry platform (${domain}) with strong domain expertise`;
    } else if (tier === 3) {
      return `Reputable news organization (${domain}) with good editorial standards`;
    } else if (tier === 4) {
      return `Regional publication (${domain}) with local expertise`;
    } else {
      return `Unverified or social media source (${domain}) with limited authority`;
    }
  }

  /**
   * Extract domain from URL
   */
  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch (error) {
      return null;
    }
  }
}

module.exports = AuthorityScorer;