/**
 * MultiFacetTrendAnalyzer Agent
 * Analyzes multiple factors contributing to market trend differences
 * Part of the Narrative Contradiction Resolution System
 */

const BaseAgent = require('./baseAgent');
const { SchemaValidators } = require('../../schemas/prFrameworkSchema');

class MultiFacetTrendAnalyzer extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('MultiFacetTrendAnalyzer', {
      maxProcessingTime: 8000,
      confidenceThreshold: 0.75,
      ...options
    }, lineageService);
    
    this.factorCategories = [
      'economic_conditions',
      'housing_supply',
      'population_growth',
      'market_dynamics',
      'regulatory_environment'
    ];
  }

  /**
   * Initialize the MultiFacetTrendAnalyzer
   */
  async initialize() {
    await super.initialize();
    this.agentLogger.info('MultiFacetTrendAnalyzer initialized', {
      factorCategories: this.factorCategories.length
    });
    return true;
  }

  /**
   * Analyze a specific factor's impact on market trends
   */
  async analyzeFactor(factorType, nationalTrend, localData, marketName) {
    try {
      // Validate inputs
      if (!this.factorCategories.includes(factorType)) {
        throw new Error('Invalid factor type');
      }
      if (!nationalTrend || !localData) {
        return {
          significance: 0,
          description: 'insufficient data',
          impact: 'unknown',
          factorWeight: 0
        };
      }

      this.agentLogger.info('Analyzing factor', {
        factorType,
        marketName,
        nationalDirection: nationalTrend.direction
      });

      let analysis;
      
      switch (factorType) {
        case 'economic_conditions':
          analysis = this.analyzeEconomicConditions(nationalTrend, localData, marketName);
          break;
        case 'housing_supply':
          analysis = this.analyzeHousingSupply(nationalTrend, localData, marketName);
          break;
        case 'population_growth':
          analysis = this.analyzePopulationGrowth(nationalTrend, localData, marketName);
          break;
        case 'market_dynamics':
          analysis = this.analyzeMarketDynamics(nationalTrend, localData, marketName);
          break;
        case 'regulatory_environment':
          analysis = this.analyzeRegulatoryEnvironment(nationalTrend, localData, marketName);
          break;
        default:
          analysis = {
            significance: 0.5,
            description: 'general market factor',
            impact: 'neutral',
            factorWeight: 0.3
          };
      }

      this.agentLogger.info('Factor analysis completed', {
        factorType,
        significance: analysis.significance,
        impact: analysis.impact
      });

      return analysis;
    } catch (error) {
      this.agentLogger.error('Factor analysis failed', { 
        factorType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Identify key factors driving market divergence
   */
  async identifyKeyFactors(nationalTrend, localData, marketName) {
    try {
      this.agentLogger.info('Identifying key factors', {
        marketName,
        nationalDirection: nationalTrend.direction
      });

      const factors = [];
      
      // Analyze each factor category
      for (const factorType of this.factorCategories) {
        const analysis = await this.analyzeFactor(factorType, nationalTrend, localData, marketName);
        if (analysis.significance > 0.5) {
          factors.push({
            category: factorType,
            ...analysis
          });
        }
      }

      // Sort by significance (highest first)
      factors.sort((a, b) => b.significance - a.significance);

      this.agentLogger.info('Key factors identified', {
        factorCount: factors.length,
        topFactor: factors[0]?.category
      });

      return factors;
    } catch (error) {
      this.agentLogger.error('Key factor identification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate factor weights for trend explanation
   */
  async calculateFactorWeights(factors, marketConditions) {
    try {
      const weights = {};
      let totalSignificance = 0;

      // Calculate total significance
      factors.forEach(factor => {
        totalSignificance += factor.significance;
      });

      // Calculate normalized weights
      factors.forEach(factor => {
        const baseWeight = factor.significance / totalSignificance;
        
        // Adjust based on market conditions
        let adjustedWeight = baseWeight;
        
        if (marketConditions.priceGrowth > 2 && factor.category === 'housing_supply') {
          adjustedWeight *= 1.2; // Boost supply factors in high growth markets
        }
        
        if (marketConditions.salesChange < -5 && factor.category === 'economic_conditions') {
          adjustedWeight *= 1.15; // Boost economic factors in declining sales
        }

        weights[factor.category] = Math.round(adjustedWeight * 100) / 100;
      });

      // Normalize to sum to 1.0
      const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
      Object.keys(weights).forEach(key => {
        weights[key] = Math.round((weights[key] / totalWeight) * 100) / 100;
      });

      this.agentLogger.info('Factor weights calculated', {
        factorCount: Object.keys(weights).length,
        totalWeight: Object.values(weights).reduce((sum, w) => sum + w, 0)
      });

      return weights;
    } catch (error) {
      this.agentLogger.error('Factor weight calculation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate comprehensive trend explanation
   */
  async generateTrendExplanation(nationalTrend, localTrend, factors, marketName) {
    try {
      this.agentLogger.info('Generating trend explanation', {
        marketName,
        factorCount: Object.keys(factors).length
      });

      let explanation = `${marketName} demonstrates ${localTrend.description} `;
      explanation += `compared to ${nationalTrend.description} nationally. `;

      // Sort factors by weight (highest first)
      const sortedFactors = Object.entries(factors)
        .sort(([,a], [,b]) => b.weight - a.weight);

      explanation += `This divergence is primarily driven by `;

      // Add top factors in order of importance
      const factorDescriptions = sortedFactors.map(([category, factor]) => {
        return factor.description;
      });

      if (factorDescriptions.length > 1) {
        const lastFactor = factorDescriptions.pop();
        explanation += factorDescriptions.join(', ') + ` and ${lastFactor}`;
      } else {
        explanation += factorDescriptions[0] || 'local market dynamics';
      }

      explanation += `. `;

      // Add specific data points
      if (nationalTrend.magnitude !== undefined && localTrend.magnitude !== undefined) {
        explanation += `While national trends show ${nationalTrend.magnitude}% change, `;
        explanation += `${marketName} experiences ${localTrend.magnitude}% change, `;
        explanation += `reflecting the significant impact of these local factors.`;
      }

      this.agentLogger.info('Trend explanation generated', {
        explanationLength: explanation.length
      });

      return explanation;
    } catch (error) {
      this.agentLogger.error('Trend explanation generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze complete market divergence
   */
  async analyzeMarketDivergence(nationalData, localData, marketName) {
    try {
      this.agentLogger.info('Analyzing market divergence', {
        marketName
      });

      // Calculate divergence score
      const divergenceScore = this.calculateDivergenceScore(nationalData, localData);
      
      // Identify key differences
      const keyDifferences = this.identifyKeyDifferences(nationalData, localData);
      
      // Get factors analysis
      const nationalTrend = { direction: nationalData.marketCondition, magnitude: nationalData.priceGrowth };
      const factors = await this.identifyKeyFactors(nationalTrend, localData, marketName);
      
      // Generate explanation
      const localTrend = { direction: localData.marketCondition, magnitude: localData.priceGrowth };
      const factorWeights = await this.calculateFactorWeights(factors, localData);
      const explanation = await this.generateTrendExplanation(
        nationalTrend, 
        localTrend, 
        factorWeights, 
        marketName
      );

      // Calculate confidence
      const confidence = this.calculateAnalysisConfidence(divergenceScore, factors.length);

      const analysis = {
        divergenceScore,
        keyDifferences,
        explanation,
        factors,
        confidence,
        marketName
      };

      this.agentLogger.info('Market divergence analysis completed', {
        divergenceScore,
        confidence,
        factorCount: factors.length
      });

      return analysis;
    } catch (error) {
      this.agentLogger.error('Market divergence analysis failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Factor-specific analysis methods
   */
  analyzeEconomicConditions(nationalTrend, localData, marketName) {
    let significance = 0.8; // Base significance for economic factors
    let impact = 'positive';
    let description = 'Strong tech sector driving high-paying job growth';

    // Check for tech industry presence
    if (localData.economicFactors?.techIndustryGrowth) {
      significance = localData.economicFactors.techIndustryGrowth.significance;
      impact = localData.economicFactors.techIndustryGrowth.impact;
      description = localData.economicFactors.techIndustryGrowth.description;
    } else if (localData.localFactors?.includes('tech_industry_resilience')) {
      significance = 0.9;
      description = 'tech industry resilience supporting market strength';
    }

    return {
      significance,
      description,
      impact,
      factorWeight: Math.min(0.9, significance),
      explanation: `Economic conditions in ${marketName} show ${description}`
    };
  }

  analyzeHousingSupply(nationalTrend, localData, marketName) {
    let significance = 0.95; // High significance for supply constraints
    let impact = 'positive_for_prices';
    let description = 'Severe housing shortage driving competition';

    // Check for supply factors
    if (localData.supplyFactors?.housingSupplyConstraints) {
      significance = localData.supplyFactors.housingSupplyConstraints.significance;
      impact = localData.supplyFactors.housingSupplyConstraints.impact;
      description = localData.supplyFactors.housingSupplyConstraints.description;
    } else if (localData.localFactors?.includes('housing_supply_constraints')) {
      significance = 0.95;
      description = 'housing supply constraints limiting availability';
    }

    return {
      significance,
      description,
      impact,
      factorWeight: Math.min(0.95, significance),
      explanation: `Housing supply in ${marketName} characterized by ${description}`
    };
  }

  analyzePopulationGrowth(nationalTrend, localData, marketName) {
    let significance = 0.8;
    let impact = 'positive';
    let description = 'Continued migration from other states';

    // Check for demand factors
    if (localData.demandFactors?.populationInflux) {
      significance = localData.demandFactors.populationInflux.significance;
      impact = localData.demandFactors.populationInflux.impact;
      description = localData.demandFactors.populationInflux.description;
    }

    return {
      significance,
      description,
      impact,
      factorWeight: Math.min(0.8, significance)
    };
  }

  analyzeMarketDynamics(nationalTrend, localData, marketName) {
    let significance = 0.85;
    let impact = 'mixed';
    let description = '43.4% of homes sell above list price';

    // Check for market dynamics
    if (localData.marketDynamics?.competitiveMarket) {
      significance = localData.marketDynamics.competitiveMarket.significance;
      impact = localData.marketDynamics.competitiveMarket.impact;
      description = localData.marketDynamics.competitiveMarket.description;
    } else if (localData.aboveListPriceShare) {
      description = `${localData.aboveListPriceShare}% of homes sell above list price`;
    }

    return {
      significance,
      description,
      impact,
      factorWeight: Math.min(0.85, significance)
    };
  }

  analyzeRegulatoryEnvironment(nationalTrend, localData, marketName) {
    return {
      significance: 0.6,
      description: 'regulatory environment impact',
      impact: 'neutral',
      factorWeight: 0.6
    };
  }

  /**
   * Helper methods
   */
  calculateDivergenceScore(nationalData, localData) {
    let score = 0;
    let factors = 0;

    // Compare price growth
    if (nationalData.priceGrowth !== undefined && localData.priceGrowth !== undefined) {
      const priceDiff = Math.abs(nationalData.priceGrowth - localData.priceGrowth);
      score += Math.min(priceDiff / 5, 1); // Normalize to 0-1
      factors++;
    }

    // Compare sales changes
    if (nationalData.salesChange !== undefined && localData.salesChange !== undefined) {
      const salesDiff = Math.abs(nationalData.salesChange - localData.salesChange);
      score += Math.min(salesDiff / 10, 1);
      factors++;
    }

    return factors > 0 ? Math.round((score / factors) * 100) / 100 : 0.5;
  }

  identifyKeyDifferences(nationalData, localData) {
    const differences = [];

    if (nationalData.priceGrowth !== undefined && localData.priceGrowth !== undefined) {
      const diff = localData.priceGrowth - nationalData.priceGrowth;
      if (Math.abs(diff) > 1) {
        differences.push({
          category: 'price_growth',
          national: nationalData.priceGrowth,
          local: localData.priceGrowth,
          difference: diff
        });
      }
    }

    if (nationalData.daysOnMarket !== undefined && localData.daysOnMarket !== undefined) {
      const diff = localData.daysOnMarket - nationalData.daysOnMarket;
      if (Math.abs(diff) > 3) {
        differences.push({
          category: 'market_speed',
          national: nationalData.daysOnMarket,
          local: localData.daysOnMarket,
          difference: diff
        });
      }
    }

    return differences;
  }

  calculateAnalysisConfidence(divergenceScore, factorCount) {
    let confidence = 0.7; // Base confidence

    // Boost confidence with more factors
    confidence += Math.min(factorCount * 0.05, 0.2);

    // Adjust based on divergence score
    if (divergenceScore > 0.7) {
      confidence += 0.1; // High divergence = more confident analysis
    }

    return Math.min(1.0, Math.max(0.5, confidence));
  }
}

module.exports = MultiFacetTrendAnalyzer;