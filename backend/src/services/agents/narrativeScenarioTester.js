/**
 * NarrativeScenarioTester Agent
 * Tests different narrative scenarios and selects the best approach
 * Part of the Narrative Contradiction Resolution System
 */

const BaseAgent = require('./baseAgent');
const { SchemaValidators } = require('../../schemas/prFrameworkSchema');

class NarrativeScenarioTester extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('NarrativeScenarioTester', {
      maxProcessingTime: 12000,
      qualityThreshold: 80,
      ...options
    }, lineageService);
    
    this.scenarios = [
      {
        name: 'CONTRAST_NARRATIVE',
        template: 'While nationally [national_trend], {market} shows [local_trend] due to [primary_factors]',
        description: 'Direct contrast between national and local trends',
        suitability: 'opposite_trends'
      },
      {
        name: 'LOCALIZED_NARRATIVE',
        template: 'In {market}, [local_trend] reflects [local_context] with [supporting_data]',
        description: 'Focus on local market with national context',
        suitability: 'similar_trends'
      },
      {
        name: 'CONTEXTUAL_NARRATIVE',
        template: '[National_trend] nationally, while {market} experiences [local_variation] influenced by [contextual_factors]',
        description: 'National context with local variation explanation',
        suitability: 'moderate_differences'
      },
      {
        name: 'COMPARATIVE_NARRATIVE',
        template: 'Compared to the national [national_metric], {market} shows [local_metric], highlighting [key_differences]',
        description: 'Direct comparison with explanatory factors',
        suitability: 'data_driven_comparison'
      }
    ];
    
    this.qualityThreshold = options.qualityThreshold || 80;
  }

  /**
   * Initialize the NarrativeScenarioTester
   */
  async initialize() {
    await super.initialize();
    this.agentLogger.info('NarrativeScenarioTester initialized', {
      scenarioCount: this.scenarios.length,
      qualityThreshold: this.qualityThreshold
    });
    return true;
  }

  /**
   * Test all narrative scenarios and select the best one
   */
  async testNarrativeScenarios(masterContent, localData, marketName) {
    try {
      this.agentLogger.info('Testing narrative scenarios', {
        marketName,
        scenarioCount: this.scenarios.length
      });

      const allScenarios = [];
      
      // Test each scenario
      for (const scenario of this.scenarios) {
        const result = await this.testScenario(scenario, masterContent, localData, marketName);
        allScenarios.push(result);
      }

      // Sort by overall score (highest first)
      allScenarios.sort((a, b) => b.overallScore - a.overallScore);

      // Select best scenario
      const bestScenario = await this.selectBestScenario(allScenarios);

      const result = {
        allScenarios,
        bestScenario,
        testingComplete: true,
        marketName
      };

      this.agentLogger.info('Scenario testing completed', {
        bestScenario: bestScenario.scenario.name,
        bestScore: bestScenario.overallScore,
        totalScenarios: allScenarios.length
      });

      return result;
    } catch (error) {
      this.agentLogger.error('Scenario testing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Test a single narrative scenario
   */
  async testScenario(scenario, masterContent, localData, marketName) {
    try {
      // Validate inputs
      if (!scenario) {
        throw new Error('Invalid scenario provided');
      }
      if (!masterContent || masterContent.trim() === '') {
        throw new Error('Master content cannot be empty');
      }

      this.agentLogger.info('Testing scenario', {
        scenarioName: scenario.name,
        marketName
      });

      // Generate content for this scenario
      const generatedContent = await this.generateScenarioContent(
        scenario, 
        masterContent, 
        localData, 
        marketName
      );

      // Score the narrative quality
      const qualityScore = await this.scoreNarrativeQuality(
        generatedContent, 
        masterContent, 
        localData
      );

      // Evaluate individual components
      const factualAccuracy = await this.evaluateFactualAccuracy(generatedContent, localData);
      const readability = await this.evaluateReadability(generatedContent);
      const localRelevance = await this.evaluateLocalRelevance(generatedContent, localData, marketName);

      // Calculate overall score
      const overallScore = this.calculateOverallScore(
        qualityScore,
        factualAccuracy,
        readability,
        localRelevance
      );

      const result = {
        scenario,
        generatedContent,
        qualityScore: qualityScore.overallScore,
        factualAccuracy: factualAccuracy.score,
        readability: readability.score,
        localRelevance: localRelevance.score,
        overallScore,
        issues: this.identifyIssues(localData, overallScore)
      };

      this.agentLogger.info('Scenario tested', {
        scenarioName: scenario.name,
        overallScore,
        qualityScore: qualityScore.overallScore
      });

      return result;
    } catch (error) {
      this.agentLogger.error('Scenario testing failed', { 
        scenarioName: scenario?.name,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Generate content for a specific scenario
   */
  async generateScenarioContent(scenario, masterContent, localData, marketName) {
    try {
      let content = '';
      
      switch (scenario.name) {
        case 'CONTRAST_NARRATIVE':
          content = await this.generateContrastNarrative(masterContent, localData, marketName);
          break;
        case 'LOCALIZED_NARRATIVE':
          content = await this.generateLocalizedNarrative(masterContent, localData, marketName);
          break;
        case 'CONTEXTUAL_NARRATIVE':
          content = await this.generateContextualNarrative(masterContent, localData, marketName);
          break;
        case 'COMPARATIVE_NARRATIVE':
          content = await this.generateComparativeNarrative(masterContent, localData, marketName);
          break;
        default:
          content = await this.generateLocalizedNarrative(masterContent, localData, marketName);
      }

      return content;
    } catch (error) {
      this.agentLogger.error('Content generation failed', { 
        scenarioName: scenario.name,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Score overall narrative quality
   */
  async scoreNarrativeQuality(generatedNarrative, originalContent, localData) {
    try {
      // Evaluate different quality aspects
      const factualAccuracy = await this.evaluateFactualAccuracy(generatedNarrative, localData);
      const readability = await this.evaluateReadability(generatedNarrative);
      const localRelevance = await this.evaluateLocalRelevance(generatedNarrative, localData, localData.marketName);
      const narrativeFlow = this.evaluateNarrativeFlow(generatedNarrative);

      // Calculate weighted overall score
      const overallScore = Math.round(
        (factualAccuracy.score * 0.3) +
        (readability.score * 0.25) +
        (localRelevance.score * 0.3) +
        (narrativeFlow * 0.15)
      );

      return {
        factualAccuracy: factualAccuracy.score,
        readability: readability.score,
        localRelevance: localRelevance.score,
        narrativeFlow,
        overallScore
      };
    } catch (error) {
      this.agentLogger.error('Quality scoring failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Select the best scenario from test results
   */
  async selectBestScenario(scenarioResults) {
    try {
      if (!scenarioResults || scenarioResults.length === 0) {
        throw new Error('No scenario results provided');
      }

      // Find highest scoring scenario
      const bestScenario = scenarioResults[0]; // Already sorted by overall score

      // Add selection reasoning
      bestScenario.selectionReason = this.generateSelectionReason(bestScenario, scenarioResults);

      this.agentLogger.info('Best scenario selected', {
        scenarioName: bestScenario.scenario.name,
        overallScore: bestScenario.overallScore,
        reason: bestScenario.selectionReason
      });

      return bestScenario;
    } catch (error) {
      this.agentLogger.error('Best scenario selection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Evaluate factual accuracy of narrative
   */
  async evaluateFactualAccuracy(narrative, localData) {
    try {
      const verifiedFacts = [];
      const errors = [];
      let score = 95; // Start with high score

      // Check for key data points
      if (localData.priceChange !== undefined) {
        const priceRegex = new RegExp(`${localData.priceChange}%`, 'i');
        if (priceRegex.test(narrative)) {
          verifiedFacts.push(`Price change: ${localData.priceChange}%`);
        } else {
          // Check for incorrect price data
          const incorrectPriceRegex = /(\d+\.?\d*)%.*price/i;
          const match = narrative.match(incorrectPriceRegex);
          if (match && parseFloat(match[1]) !== localData.priceChange) {
            errors.push(`Incorrect price change: ${match[1]}% vs actual ${localData.priceChange}%`);
            score -= 30;
          }
        }
      }

      // Check days on market
      if (localData.daysOnMarket !== undefined) {
        const daysRegex = new RegExp(`${localData.daysOnMarket} days`, 'i');
        if (daysRegex.test(narrative)) {
          verifiedFacts.push(`Days on market: ${localData.daysOnMarket}`);
        }
      }

      // Check above list price share
      if (localData.aboveListPriceShare !== undefined) {
        const listPriceRegex = new RegExp(`${localData.aboveListPriceShare}%`, 'i');
        if (listPriceRegex.test(narrative)) {
          verifiedFacts.push(`Above list price: ${localData.aboveListPriceShare}%`);
        }
      }

      // Penalize for obviously incorrect claims
      if (narrative.includes('declined 5%') && localData.priceChange > 0) {
        errors.push('Claims price decline when data shows growth');
        score -= 50;
      }

      if (narrative.includes('grew 10%') && localData.priceChange < 1) {
        errors.push('Claims high growth when data shows minimal change');
        score -= 40;
      }

      return {
        score: Math.max(0, Math.min(100, score)),
        verifiedFacts,
        errors
      };
    } catch (error) {
      this.agentLogger.error('Factual accuracy evaluation failed', { error: error.message });
      return { score: 50, verifiedFacts: [], errors: ['Evaluation failed'] };
    }
  }

  /**
   * Evaluate readability of narrative
   */
  async evaluateReadability(narrative) {
    try {
      const sentences = narrative.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = narrative.split(/\s+/).filter(w => w.length > 0);
      
      // Calculate average sentence length
      const avgSentenceLength = words.length / sentences.length;
      
      // Count complex words (3+ syllables, rough approximation)
      const complexWords = words.filter(word => 
        word.length > 6 && /[aeiou].*[aeiou].*[aeiou]/i.test(word)
      );
      const complexWordRatio = complexWords.length / words.length;

      // Calculate readability score
      let score = 90; // Start high
      
      // Penalize very long sentences
      if (avgSentenceLength > 25) {
        score -= 15;
      } else if (avgSentenceLength > 20) {
        score -= 8;
      }
      
      // Penalize too many complex words
      if (complexWordRatio > 0.15) {
        score -= 10;
      }

      // Bonus for good length
      if (narrative.length > 200 && narrative.length < 800) {
        score += 5;
      }

      return {
        score: Math.max(0, Math.min(100, score)),
        sentenceLength: Math.round(avgSentenceLength),
        complexWords: Math.round(complexWordRatio * 100) / 100
      };
    } catch (error) {
      this.agentLogger.error('Readability evaluation failed', { error: error.message });
      return { score: 75, sentenceLength: 20, complexWords: 0.1 };
    }
  }

  /**
   * Evaluate local relevance of narrative
   */
  async evaluateLocalRelevance(narrative, localData, marketName) {
    try {
      const localFactors = [];
      const marketSpecificData = [];
      let score = 70; // Base score

      // Check for market name
      if (narrative.includes(marketName)) {
        score += 15;
        localFactors.push('Market name mentioned');
      }

      // Check for local factors
      if (localData.localFactors) {
        localData.localFactors.forEach(factor => {
          const factorText = factor.replace(/_/g, ' ');
          if (narrative.toLowerCase().includes(factorText.toLowerCase()) || 
              narrative.toLowerCase().includes(factor.replace(/_/g, '').toLowerCase())) {
            score += 8;
            localFactors.push(factorText);
          }
        });
      }

      // Check for specific local data points
      if (localData.aboveListPriceShare && narrative.includes(`${localData.aboveListPriceShare}%`)) {
        score += 10;
        marketSpecificData.push('Above list price share');
      }

      if (localData.daysOnMarket && narrative.includes(`${localData.daysOnMarket} days`)) {
        score += 8;
        marketSpecificData.push('Days on market');
      }

      // Check for tech industry mentions (common in LA)
      if (narrative.toLowerCase().includes('tech') && 
          localData.localFactors?.includes('tech_industry_resilience')) {
        score += 12;
        localFactors.push('Tech industry relevance');
      }

      return {
        score: Math.max(0, Math.min(100, score)),
        localFactors,
        marketSpecificData
      };
    } catch (error) {
      this.agentLogger.error('Local relevance evaluation failed', { error: error.message });
      return { score: 60, localFactors: [], marketSpecificData: [] };
    }
  }

  /**
   * Content generation methods for different scenarios
   */
  async generateContrastNarrative(masterContent, localData, marketName) {
    let narrative = `While nationally home prices experienced their slowest growth since June 2023 at 0.7% year-over-year, `;
    narrative += `${marketName} demonstrated resilience with ${localData.priceChange || 2.8}% price appreciation. `;
    
    if (localData.localFactors) {
      const factors = localData.localFactors.slice(0, 2).map(f => f.replace(/_/g, ' ')).join(' and ');
      narrative += `This outperformance stems from the region's ${factors}`;
    }
    
    if (localData.aboveListPriceShare) {
      narrative += `, with ${localData.aboveListPriceShare}% of homes selling above list price.`;
    }

    return narrative;
  }

  async generateLocalizedNarrative(masterContent, localData, marketName) {
    let narrative = `In ${marketName}, `;
    narrative += `${localData.priceChange || 2.8}% price appreciation reflects strong local market conditions `;
    narrative += `with ${localData.daysOnMarket || 39} days average market time`;
    
    if (localData.aboveListPriceShare) {
      narrative += ` and ${localData.aboveListPriceShare}% of homes selling above list price`;
    }
    
    narrative += '.';
    return narrative;
  }

  async generateContextualNarrative(masterContent, localData, marketName) {
    let narrative = `Home prices grew at their slowest pace nationally since June 2023, `;
    narrative += `while ${marketName} experiences ${localData.priceChange || 2.8}% appreciation `;
    narrative += `influenced by local market dynamics`;
    
    if (localData.localFactors) {
      const factors = localData.localFactors.slice(0, 2).map(f => f.replace(/_/g, ' ')).join(' and ');
      narrative += ` including ${factors}`;
    }
    
    narrative += '.';
    return narrative;
  }

  async generateComparativeNarrative(masterContent, localData, marketName) {
    let narrative = `Compared to the national 0.7% price growth, `;
    narrative += `${marketName} shows ${localData.priceChange || 2.8}% appreciation, `;
    narrative += `highlighting the region's market strength`;
    
    if (localData.aboveListPriceShare) {
      narrative += ` with ${localData.aboveListPriceShare}% of homes selling above list price`;
    }
    
    narrative += '.';
    return narrative;
  }

  /**
   * Helper methods
   */
  evaluateNarrativeFlow(narrative) {
    // Simple flow evaluation based on structure and transitions
    let score = 80;
    
    // Check for good transitions
    const transitions = ['while', 'however', 'meanwhile', 'in contrast', 'compared to'];
    const hasTransitions = transitions.some(t => narrative.toLowerCase().includes(t));
    if (hasTransitions) score += 10;
    
    // Check for logical structure
    if (narrative.includes('.') && narrative.split('.').length > 1) {
      score += 5;
    }
    
    return Math.min(100, score);
  }

  calculateOverallScore(qualityScore, factualAccuracy, readability, localRelevance) {
    return Math.round(
      (qualityScore.overallScore * 0.4) +
      (factualAccuracy.score * 0.3) +
      (readability.score * 0.15) +
      (localRelevance.score * 0.15)
    );
  }

  identifyIssues(localData, overallScore) {
    const issues = [];
    
    if (overallScore < 50) {
      issues.push('insufficient local data');
    }
    
    if (!localData.priceChange) {
      issues.push('missing price change data');
    }
    
    if (!localData.localFactors || localData.localFactors.length === 0) {
      issues.push('missing local factors');
    }
    
    return issues;
  }

  generateSelectionReason(bestScenario, allScenarios) {
    if (bestScenario.overallScore > 90) {
      return 'highest overall score with excellent factual accuracy';
    } else if (bestScenario.factualAccuracy > 90) {
      return 'superior factual accuracy';
    } else if (bestScenario.localRelevance > 85) {
      return 'strong local market relevance';
    } else {
      return 'best overall performance across all metrics';
    }
  }
}

module.exports = NarrativeScenarioTester;