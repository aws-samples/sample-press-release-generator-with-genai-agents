const { logger } = require('../../../utils/logger');
const { ValidationError } = require('../../../utils/errorHandler');

/**
 * Cross-Market Validator Agent
 * Ensures claims are consistent across similar markets and detects outliers
 * 
 * Features:
 * - Market similarity clustering and analysis
 * - Cross-market consistency validation
 * - Outlier detection for statistical claims
 * - Regional trend analysis and validation
 * - Market context consistency checking
 */
class CrossMarketValidator {
  constructor(options = {}) {
    this.name = 'CrossMarketValidator';
    this.version = '1.0.0';
    
    this.config = {
      confidenceThreshold: options.confidenceThreshold || 0.75,
      outlierThreshold: options.outlierThreshold || 2.0, // Standard deviations
      minSimilarMarkets: options.minSimilarMarkets || 3,
      maxVarianceThreshold: options.maxVarianceThreshold || 0.3, // 30%
      timeout: options.timeout || 30000
    };
    
    this.isInitialized = false;
    
    // Market similarity matrix and groupings
    this.marketGroups = {
      'major_coastal': ['LAX', 'SF', 'SEA', 'NYC', 'BOS', 'WAS'],
      'major_inland': ['CHI', 'DEN', 'PHX', 'DAL', 'ATL'],
      'secondary_coastal': ['SD', 'POR', 'MIA', 'TB'],
      'secondary_inland': ['MIN', 'KC', 'STL', 'CLE', 'DET'],
      'emerging': ['AUS', 'NSH', 'RDU', 'CHA']
    };
    
    // Market characteristics for similarity scoring
    this.marketCharacteristics = {
      'LAX': { population: 13200000, medianIncome: 70000, coastalPremium: 1.4, techInfluence: 0.8 },
      'SF': { population: 4700000, medianIncome: 120000, coastalPremium: 1.8, techInfluence: 1.0 },
      'NYC': { population: 20300000, medianIncome: 85000, coastalPremium: 1.5, techInfluence: 0.7 },
      'CHI': { population: 9500000, medianIncome: 65000, coastalPremium: 1.0, techInfluence: 0.5 },
      'SEA': { population: 4000000, medianIncome: 95000, coastalPremium: 1.3, techInfluence: 0.9 },
      'BOS': { population: 4900000, medianIncome: 90000, coastalPremium: 1.3, techInfluence: 0.8 },
      'WAS': { population: 6300000, medianIncome: 100000, coastalPremium: 1.2, techInfluence: 0.6 },
      'DEN': { population: 2900000, medianIncome: 75000, coastalPremium: 1.1, techInfluence: 0.6 },
      'ATL': { population: 6100000, medianIncome: 60000, coastalPremium: 1.0, techInfluence: 0.5 }
    };
    
    // Cache for cross-market data
    this.crossMarketCache = new Map();
    this.cacheExpiry = 1800000; // 30 minutes
  }

  /**
   * Initialize the Cross-Market Validator
   */
  async initialize() {
    try {
      logger.info('Initializing CrossMarketValidator', {
        config: this.config,
        marketGroups: Object.keys(this.marketGroups)
      });
      
      this.isInitialized = true;
      logger.info('CrossMarketValidator initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize CrossMarketValidator', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate claims for cross-market consistency
   */
  async validateClaims(claims, content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('CrossMarketValidator not initialized');
    }

    const { jobId } = options;
    const startTime = Date.now();

    logger.debug('Starting cross-market validation', {
      jobId,
      claimsCount: claims.length,
      market: marketContext.market
    });

    try {
      const result = {
        agent: 'CrossMarketValidator',
        confidence: 100,
        issues: [],
        corrections: [],
        metadata: {
          targetMarket: marketContext.market,
          similarMarkets: [],
          consistencyChecks: [],
          processingTime: 0
        }
      };

      // Step 1: Identify similar markets
      const similarMarkets = await this._identifySimilarMarkets(marketContext.market);
      result.metadata.similarMarkets = similarMarkets;

      if (similarMarkets.length < this.config.minSimilarMarkets) {
        result.confidence -= 10;
        result.issues.push({
          type: 'insufficient_comparison_markets',
          issue: `Only ${similarMarkets.length} similar markets found for comparison`,
          severity: 'low'
        });
      }

      // Step 2: Validate statistical consistency
      const statisticalConsistency = await this._validateStatisticalConsistency(
        claims, marketContext.market, similarMarkets, jobId
      );
      result.confidence -= statisticalConsistency.penalty;
      result.issues.push(...statisticalConsistency.issues);
      result.corrections.push(...statisticalConsistency.corrections);
      result.metadata.consistencyChecks.push('statistical_consistency');

      // Step 3: Validate trend consistency
      const trendConsistency = await this._validateTrendConsistency(
        claims, content, marketContext.market, similarMarkets, jobId
      );
      result.confidence -= trendConsistency.penalty;
      result.issues.push(...trendConsistency.issues);
      result.corrections.push(...trendConsistency.corrections);
      result.metadata.consistencyChecks.push('trend_consistency');

      // Step 4: Validate market context consistency
      const contextConsistency = await this._validateMarketContextConsistency(
        claims, content, marketContext, similarMarkets, jobId
      );
      result.confidence -= contextConsistency.penalty;
      result.issues.push(...contextConsistency.issues);
      result.metadata.consistencyChecks.push('context_consistency');

      // Step 5: Detect outlier claims
      const outlierDetection = await this._detectOutlierClaims(
        claims, marketContext.market, similarMarkets, jobId
      );
      result.confidence -= outlierDetection.penalty;
      result.issues.push(...outlierDetection.issues);
      result.corrections.push(...outlierDetection.corrections);
      result.metadata.consistencyChecks.push('outlier_detection');

      result.metadata.processingTime = Date.now() - startTime;
      result.confidence = Math.max(0, Math.min(100, result.confidence));

      logger.debug('Cross-market validation completed', {
        jobId,
        confidence: result.confidence,
        issuesFound: result.issues.length,
        similarMarkets: similarMarkets.length,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Cross-market validation failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'CrossMarketValidator',
        confidence: 50,
        issues: [{
          type: 'cross_market_validation_error',
          issue: 'Cross-market validation encountered an error',
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
   * Identify similar markets for comparison
   */
  async _identifySimilarMarkets(targetMarket) {
    try {
      if (!targetMarket) {
        return [];
      }

      // Check cache first
      const cacheKey = `similar_${targetMarket}`;
      const cached = this.crossMarketCache.get(cacheKey);
      if (cached && !this._isCacheExpired(cached.timestamp)) {
        return cached.markets;
      }

      // Find markets in the same group
      let similarMarkets = [];
      for (const [groupName, markets] of Object.entries(this.marketGroups)) {
        if (markets.includes(targetMarket)) {
          similarMarkets = markets.filter(m => m !== targetMarket);
          break;
        }
      }

      // If no group found, use similarity scoring
      if (similarMarkets.length === 0) {
        similarMarkets = this._calculateMarketSimilarity(targetMarket);
      }

      // Cache the result
      this.crossMarketCache.set(cacheKey, {
        markets: similarMarkets,
        timestamp: Date.now()
      });

      return similarMarkets.slice(0, 5); // Limit to top 5 similar markets

    } catch (error) {
      logger.warn('Failed to identify similar markets', {
        targetMarket,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Calculate market similarity using characteristics
   */
  _calculateMarketSimilarity(targetMarket) {
    const targetChar = this.marketCharacteristics[targetMarket];
    if (!targetChar) {
      return [];
    }

    const similarities = [];
    
    for (const [market, characteristics] of Object.entries(this.marketCharacteristics)) {
      if (market === targetMarket) continue;
      
      const similarity = this._calculateSimilarityScore(targetChar, characteristics);
      similarities.push({ market, similarity });
    }

    // Sort by similarity and return top markets
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map(s => s.market);
  }

  /**
   * Calculate similarity score between two market characteristics
   */
  _calculateSimilarityScore(char1, char2) {
    const weights = {
      population: 0.3,
      medianIncome: 0.3,
      coastalPremium: 0.2,
      techInfluence: 0.2
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (char1[key] !== undefined && char2[key] !== undefined) {
        const diff = Math.abs(char1[key] - char2[key]);
        const maxVal = Math.max(char1[key], char2[key]);
        const similarity = 1 - (diff / maxVal);
        totalScore += similarity * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Validate statistical consistency across markets
   */
  async _validateStatisticalConsistency(claims, targetMarket, similarMarkets, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const statisticalClaims = claims.filter(claim => 
        claim.type === 'statistical' || 
        /\d+%|\$[\d,]+|\d+\.\d+%/.test(claim.text)
      );

      if (statisticalClaims.length === 0) {
        return result;
      }

      logger.debug('Validating statistical consistency', {
        jobId,
        targetMarket,
        similarMarkets: similarMarkets.length,
        statisticalClaims: statisticalClaims.length
      });

      for (const claim of statisticalClaims) {
        const consistency = await this._checkStatisticalConsistency(
          claim, targetMarket, similarMarkets
        );

        if (!consistency.consistent) {
          const penalty = consistency.severity === 'high' ? 20 : 10;
          result.penalty += penalty;
          
          result.issues.push({
            type: 'statistical_inconsistency',
            claim: claim.text,
            targetMarket,
            issue: consistency.issue,
            comparedMarkets: consistency.comparedMarkets,
            variance: consistency.variance,
            severity: consistency.severity
          });

          if (consistency.severity === 'high') {
            result.corrections.push({
              type: 'market_data_review',
              target: 'market_researcher',
              action: 'Review statistical claim against similar markets',
              claim: claim.text,
              suggestedAction: consistency.suggestion
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Statistical consistency validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate trend consistency across markets
   */
  async _validateTrendConsistency(claims, content, targetMarket, similarMarkets, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const trendClaims = this._extractTrendClaims(claims, content);

      if (trendClaims.length === 0) {
        return result;
      }

      logger.debug('Validating trend consistency', {
        jobId,
        targetMarket,
        trendClaims: trendClaims.length
      });

      for (const claim of trendClaims) {
        const consistency = await this._checkTrendConsistency(
          claim, targetMarket, similarMarkets
        );

        if (!consistency.consistent) {
          result.penalty += 15;
          
          result.issues.push({
            type: 'trend_inconsistency',
            claim: claim.text,
            trendDirection: claim.direction,
            targetMarket,
            issue: consistency.issue,
            comparedMarkets: consistency.comparedMarkets,
            severity: 'medium'
          });

          result.corrections.push({
            type: 'trend_verification',
            target: 'market_researcher',
            action: 'Verify trend direction against similar markets',
            claim: claim.text
          });
        }
      }

    } catch (error) {
      logger.warn('Trend consistency validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate market context consistency
   */
  async _validateMarketContextConsistency(claims, content, marketContext, similarMarkets, jobId) {
    const result = { penalty: 0, issues: [] };

    try {
      // Check if market-specific claims are reasonable given market characteristics
      const marketSpecificClaims = claims.filter(claim => 
        this._isMarketSpecificClaim(claim.text, marketContext.market)
      );

      for (const claim of marketSpecificClaims) {
        const contextCheck = this._validateMarketContext(
          claim, marketContext.market, similarMarkets
        );

        if (!contextCheck.valid) {
          result.penalty += 10;
          result.issues.push({
            type: 'market_context_inconsistency',
            claim: claim.text,
            targetMarket: marketContext.market,
            issue: contextCheck.issue,
            severity: 'medium'
          });
        }
      }

    } catch (error) {
      logger.warn('Market context validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Detect outlier claims that are inconsistent with similar markets
   */
  async _detectOutlierClaims(claims, targetMarket, similarMarkets, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const numericalClaims = this._extractNumericalClaims(claims);

      if (numericalClaims.length === 0) {
        return result;
      }

      logger.debug('Detecting outlier claims', {
        jobId,
        targetMarket,
        numericalClaims: numericalClaims.length
      });

      for (const claim of numericalClaims) {
        const outlierAnalysis = await this._analyzeOutlier(
          claim, targetMarket, similarMarkets
        );

        if (outlierAnalysis.isOutlier) {
          const penalty = outlierAnalysis.severity === 'high' ? 25 : 15;
          result.penalty += penalty;
          
          result.issues.push({
            type: 'outlier_claim',
            claim: claim.text,
            value: claim.value,
            targetMarket,
            issue: outlierAnalysis.issue,
            standardDeviations: outlierAnalysis.standardDeviations,
            comparedMarkets: outlierAnalysis.comparedMarkets,
            severity: outlierAnalysis.severity
          });

          if (outlierAnalysis.severity === 'high') {
            result.corrections.push({
              type: 'outlier_investigation',
              target: 'market_researcher',
              action: 'Investigate outlier claim against market data',
              claim: claim.text,
              suggestedAction: 'Verify data source and provide context for unusual values'
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Outlier detection failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  // Helper methods

  /**
   * Extract trend claims from content
   */
  _extractTrendClaims(claims, content) {
    const trendPatterns = [
      { pattern: /(increase|increasing|rising|growth|up)/i, direction: 'positive' },
      { pattern: /(decrease|decreasing|falling|decline|down)/i, direction: 'negative' },
      { pattern: /(stable|unchanged|flat|steady)/i, direction: 'neutral' }
    ];

    const trendClaims = [];

    for (const claim of claims) {
      for (const { pattern, direction } of trendPatterns) {
        if (pattern.test(claim.text)) {
          trendClaims.push({
            ...claim,
            direction,
            context: this._extractContext(content, claim.text)
          });
          break;
        }
      }
    }

    return trendClaims;
  }

  /**
   * Extract numerical claims for outlier detection
   */
  _extractNumericalClaims(claims) {
    return claims.map(claim => {
      const percentageMatch = claim.text.match(/(\d+(?:\.\d+)?)\s*%/);
      const dollarMatch = claim.text.match(/\$([0-9,]+)/);
      const numberMatch = claim.text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);

      let value = null;
      let type = 'unknown';

      if (percentageMatch) {
        value = parseFloat(percentageMatch[1]);
        type = 'percentage';
      } else if (dollarMatch) {
        value = parseInt(dollarMatch[1].replace(/,/g, ''));
        type = 'currency';
      } else if (numberMatch) {
        value = parseFloat(numberMatch[1].replace(/,/g, ''));
        type = 'number';
      }

      return value !== null ? { ...claim, value, valueType: type } : null;
    }).filter(claim => claim !== null);
  }

  /**
   * Check statistical consistency across markets
   */
  async _checkStatisticalConsistency(claim, targetMarket, similarMarkets) {
    try {
      // Mock implementation - in real scenario, this would fetch actual market data
      const mockMarketData = this._generateMockMarketData(targetMarket, similarMarkets);
      
      const claimValue = this._extractNumericalValue(claim.text);
      if (claimValue === null) {
        return { consistent: true };
      }

      const marketValues = mockMarketData.map(d => d.value);
      const mean = marketValues.reduce((a, b) => a + b, 0) / marketValues.length;
      const variance = this._calculateVariance(marketValues, mean);
      const relativeVariance = variance / mean;

      if (relativeVariance > this.config.maxVarianceThreshold) {
        return {
          consistent: false,
          issue: `Statistical claim shows high variance (${(relativeVariance * 100).toFixed(1)}%) across similar markets`,
          comparedMarkets: similarMarkets,
          variance: relativeVariance,
          severity: relativeVariance > 0.5 ? 'high' : 'medium',
          suggestion: 'Verify data source and provide market-specific context'
        };
      }

      return { consistent: true };

    } catch (error) {
      logger.warn('Statistical consistency check failed', {
        claim: claim.text,
        error: error.message
      });
      return { consistent: true }; // Default to consistent on error
    }
  }

  /**
   * Check trend consistency across markets
   */
  async _checkTrendConsistency(claim, targetMarket, similarMarkets) {
    try {
      // Mock implementation - in real scenario, this would analyze actual trend data
      const mockTrendData = this._generateMockTrendData(targetMarket, similarMarkets);
      
      const claimDirection = claim.direction;
      const marketDirections = mockTrendData.map(d => d.direction);
      
      // Check if claimed direction is consistent with majority of similar markets
      const directionCounts = marketDirections.reduce((acc, dir) => {
        acc[dir] = (acc[dir] || 0) + 1;
        return acc;
      }, {});

      const majorityDirection = Object.keys(directionCounts).reduce((a, b) => 
        directionCounts[a] > directionCounts[b] ? a : b
      );

      if (claimDirection !== majorityDirection && directionCounts[majorityDirection] > similarMarkets.length * 0.6) {
        return {
          consistent: false,
          issue: `Trend direction '${claimDirection}' inconsistent with majority of similar markets showing '${majorityDirection}'`,
          comparedMarkets: similarMarkets
        };
      }

      return { consistent: true };

    } catch (error) {
      logger.warn('Trend consistency check failed', {
        claim: claim.text,
        error: error.message
      });
      return { consistent: true };
    }
  }

  /**
   * Validate market context for specific claims
   */
  _validateMarketContext(claim, targetMarket, similarMarkets) {
    try {
      const marketChar = this.marketCharacteristics[targetMarket];
      if (!marketChar) {
        return { valid: true }; // Can't validate without characteristics
      }

      // Check if claim makes sense given market characteristics
      const claimText = claim.text.toLowerCase();
      
      // Example: High-tech influence claims should match market's tech influence
      if (claimText.includes('tech') || claimText.includes('technology')) {
        if (marketChar.techInfluence < 0.5 && /growth|increase|rising/i.test(claimText)) {
          return {
            valid: false,
            issue: 'Tech-related growth claim inconsistent with market\'s low tech influence'
          };
        }
      }

      // Example: Coastal premium claims should match coastal markets
      if (claimText.includes('premium') || claimText.includes('expensive')) {
        if (marketChar.coastalPremium < 1.2 && /high|expensive|premium/i.test(claimText)) {
          return {
            valid: false,
            issue: 'Premium pricing claim inconsistent with market\'s coastal premium factor'
          };
        }
      }

      return { valid: true };

    } catch (error) {
      logger.warn('Market context validation failed', {
        claim: claim.text,
        error: error.message
      });
      return { valid: true };
    }
  }

  /**
   * Analyze if a claim is an outlier
   */
  async _analyzeOutlier(claim, targetMarket, similarMarkets) {
    try {
      const claimValue = claim.value;
      
      // Mock implementation - generate similar market values
      const mockValues = this._generateMockValuesForMarkets(similarMarkets, claim.valueType);
      
      if (mockValues.length < 2) {
        return { isOutlier: false };
      }

      const mean = mockValues.reduce((a, b) => a + b, 0) / mockValues.length;
      const stdDev = Math.sqrt(this._calculateVariance(mockValues, mean));
      
      if (stdDev === 0) {
        return { isOutlier: false };
      }

      const standardDeviations = Math.abs(claimValue - mean) / stdDev;

      if (standardDeviations > this.config.outlierThreshold) {
        return {
          isOutlier: true,
          issue: `Value ${claimValue} is ${standardDeviations.toFixed(1)} standard deviations from similar markets`,
          standardDeviations,
          comparedMarkets: similarMarkets,
          severity: standardDeviations > 3 ? 'high' : 'medium'
        };
      }

      return { isOutlier: false };

    } catch (error) {
      logger.warn('Outlier analysis failed', {
        claim: claim.text,
        error: error.message
      });
      return { isOutlier: false };
    }
  }

  // Utility methods

  _isMarketSpecificClaim(text, market) {
    const marketLower = market ? market.toLowerCase() : '';
    const textLower = text.toLowerCase();
    
    return textLower.includes(marketLower) ||
           textLower.includes('local') ||
           textLower.includes('metro') ||
           textLower.includes('area');
  }

  _extractNumericalValue(text) {
    const percentageMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentageMatch) return parseFloat(percentageMatch[1]);
    
    const dollarMatch = text.match(/\$([0-9,]+)/);
    if (dollarMatch) return parseInt(dollarMatch[1].replace(/,/g, ''));
    
    const numberMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
    if (numberMatch) return parseFloat(numberMatch[1].replace(/,/g, ''));
    
    return null;
  }

  _calculateVariance(values, mean) {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  _extractContext(content, claimText) {
    const index = content.toLowerCase().indexOf(claimText.toLowerCase());
    if (index === -1) return claimText;
    
    const contextRadius = 100;
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(content.length, index + claimText.length + contextRadius);
    
    return content.substring(start, end).trim();
  }

  // Mock data generation methods (would be replaced with real data in production)

  _generateMockMarketData(targetMarket, similarMarkets) {
    return similarMarkets.map(market => ({
      market,
      value: Math.random() * 100 + 50 // Mock percentage value
    }));
  }

  _generateMockTrendData(targetMarket, similarMarkets) {
    const directions = ['positive', 'negative', 'neutral'];
    return similarMarkets.map(market => ({
      market,
      direction: directions[Math.floor(Math.random() * directions.length)]
    }));
  }

  _generateMockValuesForMarkets(markets, valueType) {
    const baseValue = valueType === 'percentage' ? 50 : 
                     valueType === 'currency' ? 500000 : 1000;
    
    return markets.map(() => baseValue + (Math.random() - 0.5) * baseValue * 0.4);
  }

  _isCacheExpired(timestamp) {
    return Date.now() - timestamp > this.cacheExpiry;
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
      marketGroups: Object.keys(this.marketGroups),
      cacheSize: this.crossMarketCache.size
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up CrossMarketValidator');
    this.crossMarketCache.clear();
    this.isInitialized = false;
  }
}

module.exports = CrossMarketValidator;