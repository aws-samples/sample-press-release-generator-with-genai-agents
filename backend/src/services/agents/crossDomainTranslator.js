/**
 * CrossDomainTranslator Agent
 * Translates national claims to local market context
 * Part of the Narrative Contradiction Resolution System
 */

const BaseAgent = require('./baseAgent');
const { SchemaValidators } = require('../../schemas/prFrameworkSchema');

class CrossDomainTranslator extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('CrossDomainTranslator', {
      maxProcessingTime: 5000,
      confidenceThreshold: 0.7,
      ...options
    }, lineageService);
    
    this.translationStrategies = [
      'CONTRAST_WITH_NATIONAL',
      'LOCALIZED_CONTEXT',
      'MULTI_FACTOR_ANALYSIS',
      'COMPARATIVE_NARRATIVE'
    ];
  }

  /**
   * Initialize the CrossDomainTranslator
   */
  async initialize() {
    await super.initialize();
    this.agentLogger.info('CrossDomainTranslator initialized', {
      strategies: this.translationStrategies.length
    });
    return true;
  }

  /**
   * Main translation method - translates national claims to local market context
   */
  async translateNationalToLocal(nationalClaim, localData, marketName) {
    try {
      // Validate inputs
      if (!nationalClaim) {
        throw new Error('Invalid national claim provided');
      }
      if (!localData || typeof localData !== 'object') {
        throw new Error('Insufficient local data for translation');
      }
      if (!marketName || marketName.trim() === '') {
        throw new Error('Market name is required');
      }

      this.agentLogger.info('Starting national to local translation', {
        claimType: nationalClaim.type,
        marketName
      });

      // Select appropriate translation strategy
      const strategy = await this.selectTranslationStrategy(nationalClaim, localData);
      
      // Generate translated content based on strategy
      let translatedClaim;
      let localFactors = [];
      
      switch (strategy) {
        case 'CONTRAST_WITH_NATIONAL':
          translatedClaim = await this.createContrastClaim(nationalClaim, localData, marketName);
          localFactors = localData.localFactors || [];
          break;
        case 'LOCALIZED_CONTEXT':
          translatedClaim = await this.generateLocalizedContext(nationalClaim, localData, marketName);
          localFactors = localData.localFactors || [];
          break;
        case 'MULTI_FACTOR_ANALYSIS':
          const analysis = await this.analyzeMultipleFactors(nationalClaim, localData, marketName);
          translatedClaim = analysis.explanation;
          localFactors = analysis.factors;
          break;
        case 'COMPARATIVE_NARRATIVE':
          translatedClaim = await this.createComparativeNarrative(nationalClaim, localData, marketName);
          localFactors = localData.localFactors || [];
          break;
        default:
          translatedClaim = await this.generateLocalizedContext(nationalClaim, localData, marketName);
          localFactors = localData.localFactors || [];
      }

      // Calculate confidence score
      const confidence = this.calculateTranslationConfidence(nationalClaim, localData, strategy);

      const result = {
        translationStrategy: strategy,
        translatedClaim,
        confidence,
        localFactors,
        originalClaim: nationalClaim,
        marketName
      };

      this.agentLogger.info('Translation completed', {
        strategy,
        confidence,
        factorCount: localFactors.length
      });

      return result;
    } catch (error) {
      this.agentLogger.error('Translation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Select the most appropriate translation strategy
   */
  async selectTranslationStrategy(nationalClaim, localData) {
    try {
      // Check for opposite trends (contrast strategy)
      if (this.hasOppositeTrends(nationalClaim, localData)) {
        return 'CONTRAST_WITH_NATIONAL';
      }

      // Check for complex market conditions (multi-factor analysis)
      if (nationalClaim.direction === 'mixed' || localData.marketCondition === 'mixed') {
        return 'MULTI_FACTOR_ANALYSIS';
      }

      // Check for similar trends with local factors (localized context)
      if (this.hasSimilarTrends(nationalClaim, localData)) {
        return 'LOCALIZED_CONTEXT';
      }

      // Default to comparative narrative
      return 'COMPARATIVE_NARRATIVE';
    } catch (error) {
      this.agentLogger.error('Strategy selection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create contrast claim highlighting differences with national trends
   */
  async createContrastClaim(nationalClaim, localData, marketName) {
    try {
      const nationalValue = nationalClaim.magnitude || nationalClaim.value || 0;
      const localValue = this.extractLocalValue(localData, nationalClaim.type);
      
      let contrastText = `While nationally ${nationalClaim.text.toLowerCase()}, `;
      contrastText += `${marketName} shows ${this.formatLocalTrend(localValue, nationalClaim.type)} `;
      
      // Add explanatory factors
      if (localData.localFactors && localData.localFactors.length > 0) {
        const primaryFactors = localData.localFactors.slice(0, 2).map(factor => 
          factor.replace(/_/g, ' ')
        ).join(' and ');
        contrastText += `due to ${primaryFactors}`;
      }

      return contrastText;
    } catch (error) {
      this.agentLogger.error('Contrast claim creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate localized context for similar trends
   */
  async generateLocalizedContext(nationalClaim, localData, marketName) {
    try {
      const localValue = this.extractLocalValue(localData, nationalClaim.type);
      
      let contextText = `In ${marketName}, `;
      contextText += `${this.formatLocalTrend(localValue, nationalClaim.type)} `;
      contextText += `reflects ${this.getLocalContext(localData)} `;
      contextText += `with ${this.formatSupportingData(localData)}`;

      return contextText;
    } catch (error) {
      this.agentLogger.error('Localized context generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze multiple factors contributing to market differences
   */
  async analyzeMultipleFactors(nationalClaim, localData, marketName) {
    try {
      const factors = localData.localFactors || [];
      
      let explanation = `${marketName} experiences ${this.formatLocalCondition(localData)} `;
      explanation += `influenced by multiple factors including `;
      
      if (factors.length > 0) {
        const formattedFactors = factors.map(factor => 
          factor.replace(/_/g, ' ')
        ).join(', ');
        explanation += formattedFactors;
      } else {
        explanation += 'local market dynamics';
      }

      // Add specific data points
      if (localData.aboveListPriceShare) {
        explanation += `. With ${localData.aboveListPriceShare}% of homes selling above list price, `;
        explanation += `the market remains highly competitive`;
      }

      return {
        factors,
        explanation
      };
    } catch (error) {
      this.agentLogger.error('Multi-factor analysis failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create comparative narrative with direct comparisons
   */
  async createComparativeNarrative(nationalClaim, localData, marketName) {
    try {
      const nationalValue = nationalClaim.magnitude || nationalClaim.value;
      const localValue = this.extractLocalValue(localData, nationalClaim.type);
      
      let narrative = `Compared to the national ${this.formatNationalMetric(nationalClaim)}, `;
      narrative += `${marketName} shows ${this.formatLocalMetric(localValue, nationalClaim.type)}, `;
      narrative += `highlighting ${this.identifyKeyDifferences(nationalClaim, localData)}`;

      return narrative;
    } catch (error) {
      this.agentLogger.error('Comparative narrative creation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Helper methods for data extraction and formatting
   */
  hasOppositeTrends(nationalClaim, localData) {
    if (nationalClaim.direction === 'slow_growth' && localData.priceChange > 2) {
      return true;
    }
    if (nationalClaim.direction === 'down' && localData.priceChange > 0) {
      return true;
    }
    return false;
  }

  hasSimilarTrends(nationalClaim, localData) {
    if (nationalClaim.type === 'inventory_trend' && localData.activeListingsChange) {
      const nationalMag = nationalClaim.magnitude || 0;
      const localMag = localData.activeListingsChange || 0;
      return Math.abs(nationalMag - localMag) < 5; // Within 5% is similar
    }
    return false;
  }

  extractLocalValue(localData, claimType) {
    switch (claimType) {
      case 'price_trend':
        return localData.priceChange || 0;
      case 'inventory_trend':
        return localData.activeListingsChange || 0;
      case 'market_speed':
        return localData.daysOnMarket || 0;
      case 'sales_trend':
        return localData.homesSoldChange || 0;
      default:
        return 0;
    }
  }

  formatLocalTrend(value, type) {
    switch (type) {
      case 'price_trend':
        return `${value}% price appreciation`;
      case 'inventory_trend':
        return `${value}% inventory change`;
      case 'market_speed':
        return `${value} days on market`;
      case 'sales_trend':
        return `${value}% sales change`;
      default:
        return `${value}% change`;
    }
  }

  getLocalContext(localData) {
    if (localData.marketCondition === 'mixed') {
      return 'complex market dynamics';
    }
    return 'local market conditions';
  }

  formatSupportingData(localData) {
    const data = [];
    if (localData.aboveListPriceShare) {
      data.push(`${localData.aboveListPriceShare}% selling above list price`);
    }
    if (localData.daysOnMarket) {
      data.push(`${localData.daysOnMarket} days average market time`);
    }
    return data.join(' and ') || 'supporting market data';
  }

  formatLocalCondition(localData) {
    if (localData.priceChange > 2) {
      return 'strong price growth';
    } else if (localData.priceChange < 0) {
      return 'price decline';
    }
    return 'market variation';
  }

  formatNationalMetric(nationalClaim) {
    return `${nationalClaim.magnitude || nationalClaim.value}% ${nationalClaim.type.replace('_', ' ')}`;
  }

  formatLocalMetric(value, type) {
    return `${value}% ${type.replace('_', ' ')}`;
  }

  identifyKeyDifferences(nationalClaim, localData) {
    const differences = [];
    
    if (localData.localFactors && localData.localFactors.includes('tech_industry_resilience')) {
      differences.push('tech sector strength');
    }
    if (localData.localFactors && localData.localFactors.includes('housing_supply_constraints')) {
      differences.push('supply limitations');
    }
    
    return differences.join(' and ') || 'local market dynamics';
  }

  /**
   * Calculate confidence score for translation
   */
  calculateTranslationConfidence(nationalClaim, localData, strategy) {
    let confidence = 70; // Base confidence

    // Boost confidence for data quality
    if (localData.priceChange !== undefined) confidence += 10;
    if (localData.localFactors && localData.localFactors.length > 0) confidence += 10;
    if (localData.marketCondition) confidence += 5;

    // Strategy-specific adjustments
    switch (strategy) {
      case 'CONTRAST_WITH_NATIONAL':
        confidence += 15; // High confidence for clear contrasts
        break;
      case 'MULTI_FACTOR_ANALYSIS':
        confidence += 10; // Good confidence for complex analysis
        break;
      case 'LOCALIZED_CONTEXT':
        confidence += 8; // Moderate confidence for localization
        break;
      default:
        confidence += 5;
    }

    return Math.min(100, Math.max(50, confidence)) / 100; // Return as decimal
  }
}

module.exports = CrossDomainTranslator;