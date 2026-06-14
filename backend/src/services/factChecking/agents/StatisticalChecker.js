const { logger } = require('../../../utils/logger');
const { ValidationError } = require('../../../utils/errorHandler');

/**
 * Statistical Checker Agent
 * Validates mathematical feasibility and statistical plausibility of claims
 * 
 * Features:
 * - Mathematical boundary validation
 * - Statistical plausibility checking
 * - Percentage and ratio validation
 * - Time-series consistency validation
 * - Distribution analysis for outlier detection
 * - Real estate domain-specific statistical rules
 */
class StatisticalChecker {
  constructor(options = {}) {
    this.name = 'StatisticalChecker';
    this.version = '1.0.0';
    
    this.config = {
      confidenceThreshold: options.confidenceThreshold || 0.8,
      maxPercentage: options.maxPercentage || 100,
      maxYearOverYearChange: options.maxYearOverYearChange || 50, // 50% max change
      maxPriceChangePercent: options.maxPriceChangePercent || 30, // 30% max price change
      minReasonablePrice: options.minReasonablePrice || 50000, // $50k minimum
      maxReasonablePrice: options.maxReasonablePrice || 10000000, // $10M maximum
      timeout: options.timeout || 20000
    };
    
    this.isInitialized = false;
    
    // Real estate statistical boundaries and rules
    this.statisticalRules = {
      percentages: {
        downPayment: { min: 0, max: 50, typical: [3, 20] },
        mortgageRate: { min: 0, max: 20, typical: [2, 8] },
        priceChange: { min: -50, max: 50, typical: [-10, 15] },
        inventoryChange: { min: -80, max: 200, typical: [-30, 50] },
        loanShare: { min: 0, max: 100, typical: [5, 40] }
      },
      prices: {
        medianHome: { min: 50000, max: 5000000 },
        rentPrice: { min: 500, max: 20000 },
        pricePerSqFt: { min: 50, max: 2000 }
      },
      timeMetrics: {
        daysOnMarket: { min: 1, max: 365, typical: [10, 90] },
        monthsOfSupply: { min: 0.1, max: 24, typical: [1, 8] }
      },
      ratios: {
        priceToIncome: { min: 1, max: 15, typical: [3, 8] },
        rentToPrice: { min: 0.02, max: 0.15, typical: [0.04, 0.08] }
      }
    };
    
    // Statistical distribution parameters for outlier detection
    this.distributionParams = {
      priceChanges: { mean: 5, stdDev: 8 },
      inventoryChanges: { mean: 0, stdDev: 15 },
      daysOnMarket: { mean: 45, stdDev: 20 }
    };
  }

  /**
   * Initialize the Statistical Checker
   */
  async initialize() {
    try {
      logger.info('Initializing StatisticalChecker', {
        config: this.config,
        rules: Object.keys(this.statisticalRules)
      });
      
      this.isInitialized = true;
      logger.info('StatisticalChecker initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize StatisticalChecker', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate statistical plausibility of claims
   */
  async validateClaims(claims, content, marketContext = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('StatisticalChecker not initialized');
    }

    const { jobId } = options;
    const startTime = Date.now();

    logger.debug('Starting statistical validation', {
      jobId,
      claimsCount: claims.length,
      market: marketContext.market
    });

    try {
      const result = {
        agent: 'StatisticalChecker',
        confidence: 100,
        issues: [],
        corrections: [],
        metadata: {
          claimsAnalyzed: 0,
          statisticalChecks: [],
          processingTime: 0
        }
      };

      // Step 1: Validate percentage claims
      const percentageValidation = await this._validatePercentageClaims(claims, content, jobId);
      result.confidence -= percentageValidation.penalty;
      result.issues.push(...percentageValidation.issues);
      result.corrections.push(...percentageValidation.corrections);
      result.metadata.statisticalChecks.push('percentage_validation');

      // Step 2: Validate price claims
      const priceValidation = await this._validatePriceClaims(claims, content, marketContext, jobId);
      result.confidence -= priceValidation.penalty;
      result.issues.push(...priceValidation.issues);
      result.corrections.push(...priceValidation.corrections);
      result.metadata.statisticalChecks.push('price_validation');

      // Step 3: Validate time-based metrics
      const timeValidation = await this._validateTimeMetrics(claims, content, jobId);
      result.confidence -= timeValidation.penalty;
      result.issues.push(...timeValidation.issues);
      result.corrections.push(...timeValidation.corrections);
      result.metadata.statisticalChecks.push('time_validation');

      // Step 4: Validate ratios and relationships
      const ratioValidation = await this._validateRatios(claims, content, jobId);
      result.confidence -= ratioValidation.penalty;
      result.issues.push(...ratioValidation.issues);
      result.corrections.push(...ratioValidation.corrections);
      result.metadata.statisticalChecks.push('ratio_validation');

      // Step 5: Validate year-over-year changes
      const changeValidation = await this._validateYearOverYearChanges(claims, content, jobId);
      result.confidence -= changeValidation.penalty;
      result.issues.push(...changeValidation.issues);
      result.corrections.push(...changeValidation.corrections);
      result.metadata.statisticalChecks.push('change_validation');

      // Step 6: Statistical distribution analysis
      const distributionValidation = await this._validateStatisticalDistribution(claims, content, jobId);
      result.confidence -= distributionValidation.penalty;
      result.issues.push(...distributionValidation.issues);
      result.metadata.statisticalChecks.push('distribution_validation');

      result.metadata.claimsAnalyzed = claims.length;
      result.metadata.processingTime = Date.now() - startTime;
      result.confidence = Math.max(0, Math.min(100, result.confidence));

      logger.debug('Statistical validation completed', {
        jobId,
        confidence: result.confidence,
        issuesFound: result.issues.length,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      logger.error('Statistical validation failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        agent: 'StatisticalChecker',
        confidence: 50,
        issues: [{
          type: 'statistical_validation_error',
          issue: 'Statistical validation encountered an error',
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
   * Validate percentage claims
   */
  async _validatePercentageClaims(claims, content, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const percentageClaims = this._extractPercentageClaims(claims, content);

      logger.debug('Validating percentage claims', {
        jobId,
        percentageClaims: percentageClaims.length
      });

      for (const claim of percentageClaims) {
        const validation = this._validatePercentage(claim);
        
        if (!validation.valid) {
          result.penalty += validation.penalty;
          result.issues.push({
            type: 'invalid_percentage',
            claim: claim.text,
            percentage: claim.percentage,
            issue: validation.issue,
            severity: validation.severity,
            category: claim.category
          });

          if (validation.severity === 'critical') {
            result.corrections.push({
              type: 'percentage_correction',
              target: 'content_generator',
              action: 'Correct invalid percentage value',
              claim: claim.text,
              suggestedRange: validation.suggestedRange
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Percentage validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate price claims
   */
  async _validatePriceClaims(claims, content, marketContext, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const priceClaims = this._extractPriceClaims(claims, content);

      logger.debug('Validating price claims', {
        jobId,
        priceClaims: priceClaims.length
      });

      for (const claim of priceClaims) {
        const validation = this._validatePrice(claim, marketContext);
        
        if (!validation.valid) {
          result.penalty += validation.penalty;
          result.issues.push({
            type: 'invalid_price',
            claim: claim.text,
            price: claim.price,
            issue: validation.issue,
            severity: validation.severity,
            priceType: claim.priceType
          });

          if (validation.severity === 'critical') {
            result.corrections.push({
              type: 'price_correction',
              target: 'market_researcher',
              action: 'Verify price data against market sources',
              claim: claim.text,
              suggestedRange: validation.suggestedRange
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Price validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate time-based metrics
   */
  async _validateTimeMetrics(claims, content, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const timeClaims = this._extractTimeClaims(claims, content);

      logger.debug('Validating time metrics', {
        jobId,
        timeClaims: timeClaims.length
      });

      for (const claim of timeClaims) {
        const validation = this._validateTimeMetric(claim);
        
        if (!validation.valid) {
          result.penalty += validation.penalty;
          result.issues.push({
            type: 'invalid_time_metric',
            claim: claim.text,
            value: claim.value,
            issue: validation.issue,
            severity: validation.severity,
            metric: claim.metric
          });

          if (validation.severity === 'high') {
            result.corrections.push({
              type: 'time_metric_correction',
              target: 'market_researcher',
              action: 'Verify time-based metric data',
              claim: claim.text,
              suggestedRange: validation.suggestedRange
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Time metrics validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate ratios and relationships
   */
  async _validateRatios(claims, content, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const ratioClaims = this._extractRatioClaims(claims, content);

      logger.debug('Validating ratios', {
        jobId,
        ratioClaims: ratioClaims.length
      });

      for (const claim of ratioClaims) {
        const validation = this._validateRatio(claim);
        
        if (!validation.valid) {
          result.penalty += validation.penalty;
          result.issues.push({
            type: 'invalid_ratio',
            claim: claim.text,
            ratio: claim.ratio,
            issue: validation.issue,
            severity: validation.severity,
            ratioType: claim.ratioType
          });

          if (validation.severity === 'high') {
            result.corrections.push({
              type: 'ratio_correction',
              target: 'market_researcher',
              action: 'Verify ratio calculation and data sources',
              claim: claim.text
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Ratio validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate year-over-year changes
   */
  async _validateYearOverYearChanges(claims, content, jobId) {
    const result = { penalty: 0, issues: [], corrections: [] };

    try {
      const changeClaims = this._extractChangeClaims(claims, content);

      logger.debug('Validating year-over-year changes', {
        jobId,
        changeClaims: changeClaims.length
      });

      for (const claim of changeClaims) {
        const validation = this._validateChange(claim);
        
        if (!validation.valid) {
          result.penalty += validation.penalty;
          result.issues.push({
            type: 'invalid_change',
            claim: claim.text,
            change: claim.change,
            issue: validation.issue,
            severity: validation.severity,
            changeType: claim.changeType
          });

          if (validation.severity === 'high') {
            result.corrections.push({
              type: 'change_verification',
              target: 'market_researcher',
              action: 'Verify year-over-year change calculation',
              claim: claim.text,
              suggestedAction: 'Check data sources and calculation methodology'
            });
          }
        }
      }

    } catch (error) {
      logger.warn('Change validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  /**
   * Validate statistical distribution
   */
  async _validateStatisticalDistribution(claims, content, jobId) {
    const result = { penalty: 0, issues: [] };

    try {
      const numericalClaims = this._extractNumericalClaims(claims);

      logger.debug('Validating statistical distribution', {
        jobId,
        numericalClaims: numericalClaims.length
      });

      for (const claim of numericalClaims) {
        const outlierAnalysis = this._analyzeStatisticalOutlier(claim);
        
        if (outlierAnalysis.isOutlier) {
          result.penalty += outlierAnalysis.penalty;
          result.issues.push({
            type: 'statistical_outlier',
            claim: claim.text,
            value: claim.value,
            issue: outlierAnalysis.issue,
            zScore: outlierAnalysis.zScore,
            severity: outlierAnalysis.severity,
            metric: claim.metric
          });
        }
      }

    } catch (error) {
      logger.warn('Statistical distribution validation failed', {
        jobId,
        error: error.message
      });
      result.penalty += 5;
    }

    return result;
  }

  // Helper methods for extracting different types of claims

  /**
   * Extract percentage claims from content
   */
  _extractPercentageClaims(claims, content) {
    const percentageClaims = [];
    
    for (const claim of claims) {
      const percentageMatch = claim.text.match(/(\d+(?:\.\d+)?)\s*%/);
      if (percentageMatch) {
        const percentage = parseFloat(percentageMatch[1]);
        const category = this._categorizePercentage(claim.text);
        
        percentageClaims.push({
          ...claim,
          percentage,
          category,
          context: this._extractContext(content, claim.text)
        });
      }
    }
    
    return percentageClaims;
  }

  /**
   * Extract price claims from content
   */
  _extractPriceClaims(claims, content) {
    const priceClaims = [];
    
    for (const claim of claims) {
      const priceMatch = claim.text.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        const priceType = this._categorizePriceType(claim.text);
        
        priceClaims.push({
          ...claim,
          price,
          priceType,
          context: this._extractContext(content, claim.text)
        });
      }
    }
    
    return priceClaims;
  }

  /**
   * Extract time-based claims
   */
  _extractTimeClaims(claims, content) {
    const timeClaims = [];
    
    for (const claim of claims) {
      // Days on market
      const daysMatch = claim.text.match(/(\d+)\s+days?\s+on\s+market/i);
      if (daysMatch) {
        timeClaims.push({
          ...claim,
          value: parseInt(daysMatch[1]),
          metric: 'daysOnMarket',
          context: this._extractContext(content, claim.text)
        });
        continue;
      }
      
      // Months of supply
      const monthsMatch = claim.text.match(/(\d+(?:\.\d+)?)\s+months?\s+of\s+supply/i);
      if (monthsMatch) {
        timeClaims.push({
          ...claim,
          value: parseFloat(monthsMatch[1]),
          metric: 'monthsOfSupply',
          context: this._extractContext(content, claim.text)
        });
      }
    }
    
    return timeClaims;
  }

  /**
   * Extract ratio claims
   */
  _extractRatioClaims(claims, content) {
    const ratioClaims = [];
    
    for (const claim of claims) {
      // Price-to-income ratio
      const priceIncomeMatch = claim.text.match(/price[- ]to[- ]income.*?(\d+(?:\.\d+)?)/i);
      if (priceIncomeMatch) {
        ratioClaims.push({
          ...claim,
          ratio: parseFloat(priceIncomeMatch[1]),
          ratioType: 'priceToIncome',
          context: this._extractContext(content, claim.text)
        });
        continue;
      }
      
      // Rent-to-price ratio (as percentage)
      const rentPriceMatch = claim.text.match(/rent[- ]to[- ]price.*?(\d+(?:\.\d+)?)\s*%/i);
      if (rentPriceMatch) {
        ratioClaims.push({
          ...claim,
          ratio: parseFloat(rentPriceMatch[1]) / 100,
          ratioType: 'rentToPrice',
          context: this._extractContext(content, claim.text)
        });
      }
    }
    
    return ratioClaims;
  }

  /**
   * Extract change claims (year-over-year, etc.)
   */
  _extractChangeClaims(claims, content) {
    const changeClaims = [];
    
    for (const claim of claims) {
      // Percentage changes
      const changeMatch = claim.text.match(/(increase|decrease|up|down|change).*?(\d+(?:\.\d+)?)\s*%/i);
      if (changeMatch) {
        const direction = /increase|up/i.test(changeMatch[1]) ? 1 : -1;
        const change = parseFloat(changeMatch[2]) * direction;
        const changeType = this._categorizeChangeType(claim.text);
        
        changeClaims.push({
          ...claim,
          change,
          changeType,
          direction: direction > 0 ? 'increase' : 'decrease',
          context: this._extractContext(content, claim.text)
        });
      }
    }
    
    return changeClaims;
  }

  /**
   * Extract numerical claims for distribution analysis
   */
  _extractNumericalClaims(claims) {
    return claims.map(claim => {
      const percentageMatch = claim.text.match(/(\d+(?:\.\d+)?)\s*%/);
      const numberMatch = claim.text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
      
      if (percentageMatch) {
        return {
          ...claim,
          value: parseFloat(percentageMatch[1]),
          metric: this._categorizePercentage(claim.text)
        };
      } else if (numberMatch) {
        return {
          ...claim,
          value: parseFloat(numberMatch[1].replace(/,/g, '')),
          metric: 'general'
        };
      }
      
      return null;
    }).filter(claim => claim !== null);
  }

  // Validation methods

  /**
   * Validate a percentage value
   */
  _validatePercentage(claim) {
    const { percentage, category } = claim;
    const rules = this.statisticalRules.percentages[category];
    
    if (!rules) {
      // Generic percentage validation
      if (percentage < 0 || percentage > 100) {
        return {
          valid: false,
          penalty: 30,
          issue: `Invalid percentage: ${percentage}% (must be 0-100%)`,
          severity: 'critical',
          suggestedRange: '0-100%'
        };
      }
      return { valid: true };
    }
    
    // Category-specific validation
    if (percentage < rules.min || percentage > rules.max) {
      return {
        valid: false,
        penalty: 25,
        issue: `${category} percentage ${percentage}% outside valid range (${rules.min}-${rules.max}%)`,
        severity: 'critical',
        suggestedRange: `${rules.min}-${rules.max}%`
      };
    }
    
    // Check if outside typical range
    if (rules.typical && (percentage < rules.typical[0] || percentage > rules.typical[1])) {
      return {
        valid: false,
        penalty: 10,
        issue: `${category} percentage ${percentage}% outside typical range (${rules.typical[0]}-${rules.typical[1]}%)`,
        severity: 'medium',
        suggestedRange: `${rules.typical[0]}-${rules.typical[1]}%`
      };
    }
    
    return { valid: true };
  }

  /**
   * Validate a price value
   */
  _validatePrice(claim, marketContext) {
    const { price, priceType } = claim;
    const rules = this.statisticalRules.prices[priceType];
    
    if (!rules) {
      // Generic price validation
      if (price < this.config.minReasonablePrice || price > this.config.maxReasonablePrice) {
        return {
          valid: false,
          penalty: 20,
          issue: `Price $${price.toLocaleString()} outside reasonable range`,
          severity: 'high',
          suggestedRange: `$${this.config.minReasonablePrice.toLocaleString()}-$${this.config.maxReasonablePrice.toLocaleString()}`
        };
      }
      return { valid: true };
    }
    
    // Type-specific validation
    if (price < rules.min || price > rules.max) {
      return {
        valid: false,
        penalty: 25,
        issue: `${priceType} price $${price.toLocaleString()} outside valid range`,
        severity: 'critical',
        suggestedRange: `$${rules.min.toLocaleString()}-$${rules.max.toLocaleString()}`
      };
    }
    
    return { valid: true };
  }

  /**
   * Validate a time metric
   */
  _validateTimeMetric(claim) {
    const { value, metric } = claim;
    const rules = this.statisticalRules.timeMetrics[metric];
    
    if (!rules) {
      return { valid: true };
    }
    
    if (value < rules.min || value > rules.max) {
      return {
        valid: false,
        penalty: 20,
        issue: `${metric} value ${value} outside valid range (${rules.min}-${rules.max})`,
        severity: 'high',
        suggestedRange: `${rules.min}-${rules.max}`
      };
    }
    
    // Check if outside typical range
    if (rules.typical && (value < rules.typical[0] || value > rules.typical[1])) {
      return {
        valid: false,
        penalty: 10,
        issue: `${metric} value ${value} outside typical range (${rules.typical[0]}-${rules.typical[1]})`,
        severity: 'medium',
        suggestedRange: `${rules.typical[0]}-${rules.typical[1]}`
      };
    }
    
    return { valid: true };
  }

  /**
   * Validate a ratio
   */
  _validateRatio(claim) {
    const { ratio, ratioType } = claim;
    const rules = this.statisticalRules.ratios[ratioType];
    
    if (!rules) {
      return { valid: true };
    }
    
    if (ratio < rules.min || ratio > rules.max) {
      return {
        valid: false,
        penalty: 20,
        issue: `${ratioType} ratio ${ratio} outside valid range (${rules.min}-${rules.max})`,
        severity: 'high'
      };
    }
    
    // Check if outside typical range
    if (rules.typical && (ratio < rules.typical[0] || ratio > rules.typical[1])) {
      return {
        valid: false,
        penalty: 10,
        issue: `${ratioType} ratio ${ratio} outside typical range (${rules.typical[0]}-${rules.typical[1]})`,
        severity: 'medium'
      };
    }
    
    return { valid: true };
  }

  /**
   * Validate a change percentage
   */
  _validateChange(claim) {
    const { change, changeType } = claim;
    const absChange = Math.abs(change);
    
    // General change validation
    if (absChange > this.config.maxYearOverYearChange) {
      return {
        valid: false,
        penalty: 25,
        issue: `Year-over-year change of ${change}% exceeds maximum reasonable change (${this.config.maxYearOverYearChange}%)`,
        severity: 'high'
      };
    }
    
    // Type-specific validation
    if (changeType === 'price' && absChange > this.config.maxPriceChangePercent) {
      return {
        valid: false,
        penalty: 20,
        issue: `Price change of ${change}% exceeds maximum reasonable price change (${this.config.maxPriceChangePercent}%)`,
        severity: 'high'
      };
    }
    
    return { valid: true };
  }

  /**
   * Analyze if a value is a statistical outlier
   */
  _analyzeStatisticalOutlier(claim) {
    const { value, metric } = claim;
    const params = this.distributionParams[metric];
    
    if (!params) {
      return { isOutlier: false };
    }
    
    const zScore = Math.abs(value - params.mean) / params.stdDev;
    
    if (zScore > 3) {
      return {
        isOutlier: true,
        penalty: 15,
        issue: `Value ${value} is ${zScore.toFixed(1)} standard deviations from expected mean`,
        zScore,
        severity: zScore > 4 ? 'high' : 'medium'
      };
    }
    
    return { isOutlier: false };
  }

  // Utility methods for categorization

  _categorizePercentage(text) {
    const textLower = text.toLowerCase();
    
    if (/down\s*payment|down-payment/.test(textLower)) return 'downPayment';
    if (/mortgage\s+rate|interest\s+rate/.test(textLower)) return 'mortgageRate';
    if (/price.*change|change.*price/.test(textLower)) return 'priceChange';
    if (/inventory.*change|change.*inventory/.test(textLower)) return 'inventoryChange';
    if (/(fha|va|conventional).*loan/.test(textLower)) return 'loanShare';
    
    return 'general';
  }

  _categorizePriceType(text) {
    const textLower = text.toLowerCase();
    
    if (/median.*home|home.*median|median.*price/.test(textLower)) return 'medianHome';
    if (/rent|rental/.test(textLower)) return 'rentPrice';
    if (/per\s+sq\s*ft|square\s+foot/.test(textLower)) return 'pricePerSqFt';
    
    return 'general';
  }

  _categorizeChangeType(text) {
    const textLower = text.toLowerCase();
    
    if (/price/.test(textLower)) return 'price';
    if (/inventory|listing/.test(textLower)) return 'inventory';
    if (/sales?|volume/.test(textLower)) return 'sales';
    
    return 'general';
  }

  _extractContext(content, claimText) {
    const index = content.toLowerCase().indexOf(claimText.toLowerCase());
    if (index === -1) return claimText;
    
    const contextRadius = 100;
    const start = Math.max(0, index - contextRadius);
    const end = Math.min(content.length, index + claimText.length + contextRadius);
    
    return content.substring(start, end).trim();
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
      statisticalRules: Object.keys(this.statisticalRules)
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.info('Cleaning up StatisticalChecker');
    this.isInitialized = false;
  }
}

module.exports = StatisticalChecker;