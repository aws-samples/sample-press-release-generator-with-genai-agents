/**
 * ContradictionDetector Agent
 * Detects contradictions between master PR content and local market data
 * Part of the Narrative Contradiction Resolution System
 */

const BaseAgent = require('./baseAgent');
const { SchemaValidators } = require('../../schemas/prFrameworkSchema');

class ContradictionDetector extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('ContradictionDetector', {
      confidenceThreshold: 0.7,
      maxProcessingTime: 10000,
      ...options
    }, lineageService);
    
    this.confidenceThreshold = this.options.confidenceThreshold;
  }

  /**
   * Initialize the ContradictionDetector
   */
  async initialize() {
    await super.initialize();
    this.agentLogger.info('ContradictionDetector initialized', {
      confidenceThreshold: this.confidenceThreshold
    });
    return true;
  }

  /**
   * Extract claims from content (master PR or local data)
   */
  async extractClaims(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    try {
      const claims = [];
      
      // Extract numerical claims (percentages, currency, counts)
      const percentageRegex = /(\d+\.?\d*)\s*%/g;
      const currencyRegex = /\$[\d,]+/g;
      const daysRegex = /(\d+)\s+days?/g;
      
      let match;
      
      // Extract percentage claims
      while ((match = percentageRegex.exec(content)) !== null) {
        claims.push({
          text: match[0],
          type: 'percentage',
          value: parseFloat(match[1]),
          context: this._extractContext(content, match.index),
          confidence: 0.9
        });
      }
      
      // Extract currency claims
      while ((match = currencyRegex.exec(content)) !== null) {
        claims.push({
          text: match[0],
          type: 'currency',
          value: this._parseCurrency(match[0]),
          context: this._extractContext(content, match.index),
          confidence: 0.9
        });
      }
      
      // Extract days claims
      while ((match = daysRegex.exec(content)) !== null) {
        claims.push({
          text: match[0],
          type: 'days',
          value: parseInt(match[1]),
          context: this._extractContext(content, match.index),
          confidence: 0.8
        });
      }
      
      // Extract trend claims
      const trendPatterns = [
        { pattern: /rose|increased|grew|up/gi, direction: 'up' },
        { pattern: /fell|decreased|declined|down/gi, direction: 'down' },
        { pattern: /remained|stable|unchanged/gi, direction: 'stable' }
      ];
      
      for (const trendPattern of trendPatterns) {
        while ((match = trendPattern.pattern.exec(content)) !== null) {
          claims.push({
            text: match[0],
            type: 'trend',
            direction: trendPattern.direction,
            context: this._extractContext(content, match.index),
            confidence: 0.7
          });
        }
      }

      this.agentLogger.info('Claims extracted', {
        claimCount: claims.length,
        types: [...new Set(claims.map(c => c.type))]
      });

      return claims;
    } catch (error) {
      this.agentLogger.error('Error extracting claims', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect contradictions between master content and local data
   */
  async detectContradictions(masterContent, localData) {
    try {
      const masterClaims = await this.extractClaims(masterContent);
      const localClaims = this._extractLocalDataClaims(localData);
      
      const contradictions = [];
      
      // Compare claims for contradictions
      for (const masterClaim of masterClaims) {
        for (const localClaim of localClaims) {
          const contradiction = await this.compareStatements(masterClaim, localClaim);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }
      
      this.agentLogger.info('Contradiction detection completed', {
        masterClaimsCount: masterClaims.length,
        localClaimsCount: localClaims.length,
        contradictionsFound: contradictions.length
      });
      
      return contradictions;
    } catch (error) {
      this.agentLogger.error('Error detecting contradictions', { error: error.message });
      throw error;
    }
  }

  /**
   * Compare two statements for contradictions
   */
  async compareStatements(masterClaim, localClaim) {
    try {
      // Validate inputs
      if (!masterClaim || !localClaim) {
        throw new Error('Both masterClaim and localClaim are required');
      }

      // Check for temporal contradictions first
      if (masterClaim.timeframe && localClaim.timeframe && masterClaim.trend && localClaim.trend) {
        if (masterClaim.timeframe === localClaim.timeframe && masterClaim.trend !== localClaim.trend) {
          return {
            isContradictory: true,
            type: 'temporal',
            severity: 'medium',
            confidence: 0.8,
            masterClaim,
            localClaim,
            explanation: `Same timeframe (${masterClaim.timeframe}) but conflicting trends: ${masterClaim.trend} vs ${localClaim.trend}`
          };
        }
      }

      // Type-based comparison
      if (masterClaim.type === localClaim.type) {
        switch (masterClaim.type) {
          case 'percentage':
            return this._comparePercentages(masterClaim, localClaim);
          case 'currency':
            return this._compareCurrency(masterClaim, localClaim);
          case 'days':
          case 'duration':
            return this._compareDays(masterClaim, localClaim);
          case 'trend':
            return this._compareTrends(masterClaim, localClaim);
          default:
            // Default comparison for unknown types
            return {
              isContradictory: false,
              type: 'unknown',
              severity: 'minor',
              confidence: 0.5,
              masterClaim,
              localClaim,
              explanation: `Unknown type comparison: ${masterClaim.type}`
            };
        }
      }
      
      // Different types - provide basic comparison
      return {
        isContradictory: true,
        type: 'type_mismatch',
        severity: 'minor',
        confidence: 0.6,
        masterClaim,
        localClaim,
        explanation: `Type mismatch: ${masterClaim.type} vs ${localClaim.type}`
      };
    } catch (error) {
      this.agentLogger.error('Error comparing statements', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract local data claims from structured market data
   */
  _extractLocalDataClaims(localData) {
    const claims = [];
    
    if (!localData || typeof localData !== 'object') {
      return claims;
    }
    
    // Extract price change claims
    if (localData.medianPrice && typeof localData.medianPrice.change === 'number') {
      claims.push({
        text: `${localData.medianPrice.change}% price change`,
        type: 'percentage',
        value: localData.medianPrice.change,
        marketName: localData.marketName,
        confidence: 0.9
      });
    }
    
    // Extract days on market claims
    if (localData.daysOnMarket && typeof localData.daysOnMarket.current === 'number') {
      claims.push({
        text: `${localData.daysOnMarket.current} days on market`,
        type: 'days',
        value: localData.daysOnMarket.current,
        marketName: localData.marketName,
        confidence: 0.9
      });
    }
    
    // Extract inventory change claims
    if (localData.inventory && typeof localData.inventory.change === 'number') {
      claims.push({
        text: `${localData.inventory.change}% inventory change`,
        type: 'percentage',
        value: localData.inventory.change,
        marketName: localData.marketName,
        confidence: 0.8
      });
    }
    
    // Extract trend claims
    if (localData.marketTrend && localData.marketTrend.direction) {
      claims.push({
        text: `market trending ${localData.marketTrend.direction}`,
        type: 'trend',
        direction: localData.marketTrend.direction,
        marketName: localData.marketName,
        confidence: 0.8
      });
    }
    
    return claims;
  }

  /**
   * Compare percentage values for contradictions
   */
  _comparePercentages(masterClaim, localClaim) {
    // Get values from either 'value' or 'magnitude' property
    const masterValue = masterClaim.value !== undefined ? masterClaim.value : masterClaim.magnitude;
    const localValue = localClaim.value !== undefined ? localClaim.value : localClaim.magnitude;
    
    if (masterValue === undefined || localValue === undefined) {
      return {
        isContradictory: false,
        type: 'percentage',
        severity: 'minor',
        confidence: 0.5,
        masterClaim,
        localClaim,
        explanation: 'Unable to compare - missing values'
      };
    }
    
    const difference = Math.abs(masterValue - localValue);
    const threshold = 1.0; // 1% threshold for significant difference
    
    if (difference > threshold) {
      return {
        isContradictory: true,
        type: 'magnitude',
        severity: difference > 3.0 ? 'major' : 'medium',
        confidence: 0.8,
        masterClaim,
        localClaim,
        explanation: `Significant percentage difference: ${masterValue}% vs ${localValue}%`
      };
    }
    
    return {
      isContradictory: false,
      type: 'percentage',
      severity: 'minor',
      confidence: 0.7,
      masterClaim,
      localClaim,
      explanation: 'Percentage values are consistent'
    };
  }

  /**
   * Compare currency values for contradictions
   */
  _compareCurrency(masterClaim, localClaim) {
    const difference = Math.abs(masterClaim.value - localClaim.value);
    const percentDiff = (difference / masterClaim.value) * 100;
    
    if (percentDiff > 10) { // 10% threshold
      return {
        masterClaim,
        localData: localClaim,
        severityLevel: percentDiff > 50 ? 'high' : 'medium',
        adaptationStrategy: 'contextual_reframe',
        resolutionApproach: `Local market pricing differs significantly from national average`,
        qualityImpact: Math.min(percentDiff, 40)
      };
    }
    
    return null;
  }

  /**
   * Compare days values for contradictions
   */
  _compareDays(masterClaim, localClaim) {
    const masterValue = masterClaim.magnitude || masterClaim.value;
    const localValue = localClaim.magnitude || localClaim.value;
    const difference = Math.abs(masterValue - localValue);
    
    if (difference > 5) { // 5 days threshold for contradiction
      return {
        isContradictory: true,
        type: 'duration',
        severity: difference > 15 ? 'major' : 'medium',
        confidence: 0.8,
        masterClaim,
        localClaim,
        explanation: `Significant difference in days: ${masterValue} vs ${localValue} (${difference} days apart)`
      };
    }
    
    // Small differences are not contradictory
    return {
      isContradictory: false,
      type: 'duration',
      severity: 'minor',
      confidence: 0.7,
      masterClaim,
      localClaim,
      explanation: `Days values are similar: ${masterValue} vs ${localValue} (${difference} days apart)`
    };
  }

  /**
   * Compare trend directions for contradictions
   */
  _compareTrends(masterClaim, localClaim) {
    const opposites = {
      'up': ['down', 'slow_growth'],
      'down': ['up'],
      'slow_growth': ['up'],
      'stable': ['up', 'down']
    };
    
    // Check for directional contradictions
    const masterOpposites = opposites[masterClaim.direction] || [];
    if (masterOpposites.includes(localClaim.direction)) {
      return {
        isContradictory: true,
        type: 'directional',
        severity: 'major',
        confidence: 0.9,
        masterClaim,
        localClaim,
        explanation: `Local market trends (${localClaim.direction}) contradict national direction (${masterClaim.direction})`
      };
    }
    
    // Check magnitude differences for same or similar direction trends
    if (masterClaim.magnitude !== undefined && localClaim.magnitude !== undefined) {
      const magnitudeDiff = Math.abs(masterClaim.magnitude - localClaim.magnitude);
      if (magnitudeDiff > 2) {
        return {
          isContradictory: true,
          type: 'magnitude',
          severity: magnitudeDiff > 5 ? 'major' : 'medium',
          confidence: 0.8,
          masterClaim,
          localClaim,
          explanation: `Significant magnitude difference: ${masterClaim.magnitude}% vs ${localClaim.magnitude}%`
        };
      }
    }
    
    return {
      isContradictory: false,
      type: 'directional',
      severity: 'minor',
      confidence: 0.7,
      masterClaim,
      localClaim,
      explanation: `Trends are consistent`
    };
  }

  /**
   * Extract context around a match position
   */
  _extractContext(content, position, contextLength = 50) {
    const start = Math.max(0, position - contextLength);
    const end = Math.min(content.length, position + contextLength);
    return content.substring(start, end).trim();
  }

  /**
   * Parse currency string to number
   */
  _parseCurrency(currencyStr) {
    return parseInt(currencyStr.replace(/[$,]/g, ''));
  }
}

module.exports = ContradictionDetector;