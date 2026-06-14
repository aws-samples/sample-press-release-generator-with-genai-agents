const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * StatisticalPlausibilityValidator Agent
 * Market data plausibility assessment and validation
 * 
 * Features:
 * - Historical range validation
 * - Outlier detection for unrealistic claims
 * - Mathematical consistency checks
 * - Market trend plausibility assessment
 * - Performance target: <3 seconds processing time
 */
class StatisticalPlausibilityValidator extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Statistical Plausibility Validator', {
      maxProcessingTime: 3000, // 3 seconds
      plausibilityThreshold: 0.7,
      outlierSensitivity: 2.5, // Standard deviations
      ...options
    }, lineageService);

    // Market data ranges and historical norms
    this.marketRanges = null;
    this.historicalNorms = null;
    
    // Statistical thresholds
    this.statisticalThresholds = {
      priceChangeMonthly: { min: -50, max: 50, typical: [-10, 10] },
      priceChangeYearly: { min: -80, max: 100, typical: [-20, 20] },
      interestRates: { min: 0, max: 20, typical: [2, 8] },
      inventoryMonths: { min: 0.5, max: 24, typical: [3, 8] },
      daysOnMarket: { min: 1, max: 365, typical: [20, 90] },
      salesVolume: { min: 0, max: 10000, typical: [100, 2000] }
    };

    // Seasonal patterns
    this.seasonalPatterns = {
      spring: { activity: 'high', priceGrowth: 'moderate' },
      summer: { activity: 'peak', priceGrowth: 'high' },
      fall: { activity: 'moderate', priceGrowth: 'low' },
      winter: { activity: 'low', priceGrowth: 'minimal' }
    };
  }

  /**
   * Initialize the StatisticalPlausibilityValidator
   */
  async initialize() {
    await super.initialize();

    try {
      this.log('info', 'Initializing statistical validation parameters');
      
      // Initialize market ranges and historical norms
      this.marketRanges = this._initializeMarketRanges();
      this.historicalNorms = this._initializeHistoricalNorms();
      
      this.log('info', 'Statistical plausibility validator initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize statistical plausibility validator', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate statistical plausibility of claims
   * @param {Array} claims - Claims to validate for statistical plausibility
   * @param {Object} context - Market and temporal context
   * @returns {Object} Statistical plausibility validation results
   */
  async validatePlausibility(claims, context = {}) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting statistical plausibility validation', {
        claimsCount: claims.length,
        contextKeys: Object.keys(context)
      });

      // Handle empty claims
      if (!claims || claims.length === 0) {
        return this._createEmptyResult();
      }

      // Validate and filter claims
      const validClaims = this._validateClaims(claims);
      
      // Perform statistical validation
      const results = {
        rangeValidation: await this._validateRanges(validClaims, context),
        outlierDetection: await this._detectOutliers(validClaims, context),
        trendPlausibility: await this._validateTrendPlausibility(validClaims, context),
        mathematicalConsistency: await this._validateMathematicalConsistency(validClaims),
        seasonalConsistency: await this._validateSeasonalConsistency(validClaims, context)
      };

      // Calculate overall plausibility score
      const overallPlausibilityScore = this._calculateOverallScore(results);
      
      // Identify flagged implausibilities
      const flaggedImplausibilities = this._compileFlaggedImplausibilities(results);
      
      // Calculate confidence
      const confidence = this._calculateConfidence(results, validClaims.length);

      const processingTime = Date.now() - startTime;
      
      // Check processing time requirement
      if (processingTime >= this.options.maxProcessingTime) {
        this.log('warn', 'Statistical validation exceeded time limit', { processingTime });
      }

      const result = {
        overallPlausibilityScore,
        results,
        flaggedImplausibilities,
        confidence,
        processingTime
      };

      this.log('info', 'Statistical plausibility validation completed', {
        overallScore: overallPlausibilityScore,
        outliers: results.outlierDetection.filter(r => r.isOutlier).length,
        flaggedIssues: flaggedImplausibilities.length,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log('error', 'Statistical plausibility validation failed', {
        error: error.message,
        processingTime
      });
      throw error;
    }
  }

  /**
   * Validate ranges of claims against historical norms
   * @private
   */
  async _validateRanges(claims, context) {
    const results = [];

    for (const claim of claims) {
      try {
        const rangeResult = await this._validateSingleClaimRange(claim, context);
        results.push(rangeResult);
      } catch (error) {
        this.log('warn', 'Failed to validate range for claim', {
          claim: claim.text,
          error: error.message
        });
        
        results.push({
          claim,
          isWithinRange: false,
          plausibilityScore: 0,
          issues: [`Range validation failed: ${error.message}`]
        });
      }
    }

    return results;
  }

  /**
   * Validate range for a single claim
   * @private
   */
  async _validateSingleClaimRange(claim, context) {
    const issues = [];
    let plausibilityScore = 1.0;

    // Extract numerical values from claim
    const numericalData = this._extractNumericalData(claim);
    
    if (numericalData.length === 0) {
      return {
        claim,
        isWithinRange: true,
        plausibilityScore: 1.0,
        issues: []
      };
    }

    // Validate each numerical value
    for (const data of numericalData) {
      const rangeValidation = this._validateValueRange(data, claim, context);
      if (!rangeValidation.isValid) {
        issues.push(rangeValidation.issue);
        plausibilityScore -= rangeValidation.penalty;
      }
    }

    plausibilityScore = Math.max(plausibilityScore, 0);

    return {
      claim,
      isWithinRange: plausibilityScore >= this.options.plausibilityThreshold,
      plausibilityScore,
      issues
    };
  }

  /**
   * Detect statistical outliers
   * @private
   */
  async _detectOutliers(claims, context) {
    const results = [];

    // Group claims by type for outlier detection
    const claimsByType = this._groupClaimsByType(claims);

    for (const [type, typeClaims] of Object.entries(claimsByType)) {
      const outlierResults = this._detectOutliersInGroup(typeClaims, type, context);
      results.push(...outlierResults);
    }

    return results;
  }

  /**
   * Detect outliers within a group of similar claims
   * @private
   */
  _detectOutliersInGroup(claims, type, context) {
    const results = [];
    
    // Extract values for statistical analysis
    const values = claims.map(claim => this._extractPrimaryValue(claim)).filter(v => v !== null);
    
    if (values.length < 3) {
      // Not enough data for outlier detection
      return claims.map(claim => ({
        claim,
        isOutlier: false,
        outlierScore: 0,
        zScore: 0
      }));
    }

    // Calculate statistical measures
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Detect outliers using z-score
    for (const claim of claims) {
      const value = this._extractPrimaryValue(claim);
      if (value !== null) {
        const zScore = stdDev > 0 ? Math.abs(value - mean) / stdDev : 0;
        const isOutlier = zScore > this.options.outlierSensitivity;
        
        results.push({
          claim,
          isOutlier,
          outlierScore: Math.min(zScore / this.options.outlierSensitivity, 2.0),
          zScore
        });
      } else {
        results.push({
          claim,
          isOutlier: false,
          outlierScore: 0,
          zScore: 0
        });
      }
    }

    return results;
  }

  /**
   * Validate trend plausibility
   * @private
   */
  async _validateTrendPlausibility(claims, context) {
    const results = [];

    for (const claim of claims) {
      const trendResult = this._validateSingleTrendPlausibility(claim, context);
      results.push(trendResult);
    }

    return results;
  }

  /**
   * Validate plausibility of a single trend claim
   * @private
   */
  _validateSingleTrendPlausibility(claim, context) {
    const issues = [];
    let plausibilityScore = 1.0;

    // Check if claim describes a trend
    const trendData = this._extractTrendData(claim);
    
    if (!trendData) {
      return {
        claim,
        isPlausibleTrend: true,
        plausibilityScore: 1.0,
        issues: []
      };
    }

    // Validate trend magnitude
    if (trendData.magnitude !== undefined) {
      const magnitudeValidation = this._validateTrendMagnitude(trendData, context);
      if (!magnitudeValidation.isValid) {
        issues.push(magnitudeValidation.issue);
        plausibilityScore -= magnitudeValidation.penalty;
      }
    }

    // Validate trend direction consistency
    if (trendData.direction && context.marketConditions) {
      const directionValidation = this._validateTrendDirection(trendData, context);
      if (!directionValidation.isValid) {
        issues.push(directionValidation.issue);
        plausibilityScore -= directionValidation.penalty;
      }
    }

    // Validate trend timeframe
    if (trendData.timeframe) {
      const timeframeValidation = this._validateTrendTimeframe(trendData, context);
      if (!timeframeValidation.isValid) {
        issues.push(timeframeValidation.issue);
        plausibilityScore -= timeframeValidation.penalty;
      }
    }

    plausibilityScore = Math.max(plausibilityScore, 0);

    return {
      claim,
      isPlausibleTrend: plausibilityScore >= this.options.plausibilityThreshold,
      plausibilityScore,
      issues
    };
  }

  /**
   * Validate mathematical consistency
   * @private
   */
  async _validateMathematicalConsistency(claims) {
    const results = [];

    for (const claim of claims) {
      const mathResult = this._validateSingleMathematicalConsistency(claim);
      results.push(mathResult);
    }

    return results;
  }

  /**
   * Validate mathematical consistency of a single claim
   * @private
   */
  _validateSingleMathematicalConsistency(claim) {
    const issues = [];
    let consistencyScore = 1.0;

    // Extract mathematical relationships
    const mathData = this._extractMathematicalData(claim);
    
    if (mathData.length === 0) {
      return {
        claim,
        isMathematicallyConsistent: true,
        consistencyScore: 1.0,
        issues: []
      };
    }

    // Validate each mathematical relationship
    for (const math of mathData) {
      const validation = this._validateMathematicalRelationship(math);
      if (!validation.isValid) {
        issues.push(validation.issue);
        consistencyScore -= validation.penalty;
      }
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isMathematicallyConsistent: consistencyScore >= this.options.plausibilityThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Validate seasonal consistency
   * @private
   */
  async _validateSeasonalConsistency(claims, context) {
    const results = [];

    // Determine current season from context
    const season = this._determineSeason(context);
    
    if (!season) {
      // No seasonal context available
      return claims.map(claim => ({
        claim,
        isSeasonallyConsistent: true,
        consistencyScore: 1.0,
        issues: []
      }));
    }

    for (const claim of claims) {
      const seasonalResult = this._validateSingleSeasonalConsistency(claim, season, context);
      results.push(seasonalResult);
    }

    return results;
  }

  /**
   * Validate seasonal consistency of a single claim
   * @private
   */
  _validateSingleSeasonalConsistency(claim, season, context) {
    const issues = [];
    let consistencyScore = 1.0;

    // Extract seasonal indicators from claim
    const seasonalData = this._extractSeasonalData(claim);
    
    if (!seasonalData) {
      return {
        claim,
        isSeasonallyConsistent: true,
        consistencyScore: 1.0,
        issues: []
      };
    }

    // Validate against seasonal patterns
    const expectedPattern = this.seasonalPatterns[season];
    if (expectedPattern) {
      const validation = this._validateAgainstSeasonalPattern(seasonalData, expectedPattern);
      if (!validation.isValid) {
        issues.push(validation.issue);
        consistencyScore -= validation.penalty;
      }
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isSeasonallyConsistent: consistencyScore >= this.options.plausibilityThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Extract numerical data from claim
   * @private
   */
  _extractNumericalData(claim) {
    const data = [];
    const text = claim.text || '';

    // Extract percentages
    const percentages = text.match(/(\d+(?:\.\d+)?)\s*%/g);
    if (percentages) {
      percentages.forEach(match => {
        const value = parseFloat(match.replace('%', ''));
        data.push({ type: 'percentage', value, unit: '%' });
      });
    }

    // Extract currency amounts
    const currency = text.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)/g);
    if (currency) {
      currency.forEach(match => {
        const value = parseFloat(match.replace(/[$,]/g, ''));
        data.push({ type: 'currency', value, unit: '$' });
      });
    }

    // Extract numbers with units
    const numbersWithUnits = text.match(/(\d+(?:\.\d+)?)\s*(months?|days?|years?|weeks?)/gi);
    if (numbersWithUnits) {
      numbersWithUnits.forEach(match => {
        const parts = match.match(/(\d+(?:\.\d+)?)\s*(\w+)/);
        if (parts) {
          const value = parseFloat(parts[1]);
          const unit = parts[2].toLowerCase();
          data.push({ type: 'duration', value, unit });
        }
      });
    }

    return data;
  }

  /**
   * Validate value range
   * @private
   */
  _validateValueRange(data, claim, context) {
    const { type, value, unit } = data;
    
    // Determine appropriate range based on type and context
    let range = null;
    let penalty = 0.3;

    if (type === 'percentage') {
      if (claim.text.toLowerCase().includes('price') || claim.text.toLowerCase().includes('value')) {
        range = context.timeframe === 'monthly' ? 
          this.statisticalThresholds.priceChangeMonthly : 
          this.statisticalThresholds.priceChangeYearly;
      }
    } else if (type === 'duration' && unit.includes('month')) {
      if (claim.text.toLowerCase().includes('inventory') || claim.text.toLowerCase().includes('supply')) {
        range = this.statisticalThresholds.inventoryMonths;
      }
    } else if (type === 'duration' && unit.includes('day')) {
      if (claim.text.toLowerCase().includes('market') || claim.text.toLowerCase().includes('sell')) {
        range = this.statisticalThresholds.daysOnMarket;
      }
    }

    if (!range) {
      return { isValid: true, issue: null, penalty: 0 };
    }

    // Check if value is within acceptable range
    if (value < range.min || value > range.max) {
      return {
        isValid: false,
        issue: `Value ${value}${unit} outside acceptable range [${range.min}, ${range.max}]`,
        penalty: 0.5
      };
    }

    // Check if value is within typical range
    if (value < range.typical[0] || value > range.typical[1]) {
      return {
        isValid: false,
        issue: `Value ${value}${unit} outside typical range [${range.typical[0]}, ${range.typical[1]}]`,
        penalty: 0.2
      };
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Group claims by type for analysis
   * @private
   */
  _groupClaimsByType(claims) {
    const groups = {};

    for (const claim of claims) {
      const type = this._determineClaimType(claim);
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(claim);
    }

    return groups;
  }

  /**
   * Determine claim type
   * @private
   */
  _determineClaimType(claim) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    if (text.includes('price') || text.includes('value')) return 'price';
    if (text.includes('rate') || text.includes('interest')) return 'rate';
    if (text.includes('inventory') || text.includes('supply')) return 'inventory';
    if (text.includes('sales') || text.includes('volume')) return 'sales';
    if (text.includes('days') && text.includes('market')) return 'days_on_market';
    
    return 'general';
  }

  /**
   * Extract primary value from claim
   * @private
   */
  _extractPrimaryValue(claim) {
    const numericalData = this._extractNumericalData(claim);
    return numericalData.length > 0 ? numericalData[0].value : null;
  }

  /**
   * Extract trend data from claim
   * @private
   */
  _extractTrendData(claim) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    // Look for trend indicators
    const trendIndicators = {
      increase: /\b(increase|rise|up|growth|gain)\b/i,
      decrease: /\b(decrease|fall|down|decline|drop)\b/i,
      stable: /\b(stable|unchanged|flat|steady)\b/i
    };

    let direction = null;
    for (const [dir, pattern] of Object.entries(trendIndicators)) {
      if (pattern.test(text)) {
        direction = dir;
        break;
      }
    }

    if (!direction) return null;

    // Extract magnitude
    const magnitudeIndicators = {
      high: /\b(rapid|fast|sharp|significant|dramatic)\b/i,
      medium: /\b(moderate|steady|gradual)\b/i,
      low: /\b(slight|small|minor|modest)\b/i
    };

    let magnitude = 'medium'; // default
    for (const [mag, pattern] of Object.entries(magnitudeIndicators)) {
      if (pattern.test(text)) {
        magnitude = mag;
        break;
      }
    }

    // Extract timeframe
    const timeframeMatch = text.match(/\b(monthly|quarterly|yearly|annual|weekly)\b/i);
    const timeframe = timeframeMatch ? timeframeMatch[1].toLowerCase() : null;

    return { direction, magnitude, timeframe };
  }

  /**
   * Validate trend magnitude
   * @private
   */
  _validateTrendMagnitude(trendData, context) {
    // Check if magnitude is reasonable for the timeframe
    if (trendData.timeframe === 'monthly' && trendData.magnitude === 'high') {
      // High magnitude monthly changes are less common
      return {
        isValid: false,
        issue: 'High magnitude monthly trend may be implausible',
        penalty: 0.2
      };
    }

    if (trendData.timeframe === 'yearly' && trendData.magnitude === 'low') {
      // Very low magnitude yearly changes might be unusual
      return {
        isValid: true, // Still valid but note it
        issue: null,
        penalty: 0
      };
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Validate trend direction
   * @private
   */
  _validateTrendDirection(trendData, context) {
    // Check against market conditions if available
    if (context.marketConditions) {
      const expectedDirection = context.marketConditions.toLowerCase();
      
      if (expectedDirection.includes('bull') && trendData.direction === 'decrease') {
        return {
          isValid: false,
          issue: 'Decreasing trend inconsistent with bull market conditions',
          penalty: 0.3
        };
      }
      
      if (expectedDirection.includes('bear') && trendData.direction === 'increase') {
        return {
          isValid: false,
          issue: 'Increasing trend inconsistent with bear market conditions',
          penalty: 0.3
        };
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Validate trend timeframe
   * @private
   */
  _validateTrendTimeframe(trendData, context) {
    // Check if timeframe is reasonable
    if (trendData.timeframe === 'weekly' && trendData.magnitude === 'high') {
      return {
        isValid: false,
        issue: 'High magnitude weekly trends are typically implausible',
        penalty: 0.4
      };
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Extract mathematical data from claim
   * @private
   */
  _extractMathematicalData(claim) {
    const data = [];
    const text = claim.text || '';

    // Look for mathematical relationships
    const ratioMatch = text.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
    if (ratioMatch) {
      data.push({
        type: 'ratio',
        value1: parseFloat(ratioMatch[1]),
        value2: parseFloat(ratioMatch[2])
      });
    }

    // Look for percentage calculations
    const percentCalc = text.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*\$?(\d+(?:,\d{3})*(?:\.\d+)?)/);
    if (percentCalc) {
      data.push({
        type: 'percentage_calculation',
        percentage: parseFloat(percentCalc[1]),
        base: parseFloat(percentCalc[2].replace(/,/g, ''))
      });
    }

    return data;
  }

  /**
   * Validate mathematical relationship
   * @private
   */
  _validateMathematicalRelationship(math) {
    if (math.type === 'ratio') {
      // Check for reasonable ratios
      const ratio = math.value1 / math.value2;
      if (ratio > 100 || ratio < 0.01) {
        return {
          isValid: false,
          issue: `Extreme ratio ${math.value1}:${math.value2} may be implausible`,
          penalty: 0.3
        };
      }
    }

    if (math.type === 'percentage_calculation') {
      // Validate percentage calculation
      const calculated = (math.percentage / 100) * math.base;
      // This is just a structural check - actual validation would need context
      if (math.percentage > 100) {
        return {
          isValid: false,
          issue: `Percentage over 100% in calculation may be implausible`,
          penalty: 0.2
        };
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Determine season from context
   * @private
   */
  _determineSeason(context) {
    if (context.month) {
      const month = parseInt(context.month);
      if (month >= 3 && month <= 5) return 'spring';
      if (month >= 6 && month <= 8) return 'summer';
      if (month >= 9 && month <= 11) return 'fall';
      if (month === 12 || month <= 2) return 'winter';
    }

    if (context.season) {
      return context.season.toLowerCase();
    }

    return null;
  }

  /**
   * Extract seasonal data from claim
   * @private
   */
  _extractSeasonalData(claim) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    // Look for seasonal indicators
    const seasonalTerms = {
      spring: /\b(spring|march|april|may)\b/i,
      summer: /\b(summer|june|july|august)\b/i,
      fall: /\b(fall|autumn|september|october|november)\b/i,
      winter: /\b(winter|december|january|february)\b/i
    };

    for (const [season, pattern] of Object.entries(seasonalTerms)) {
      if (pattern.test(text)) {
        return { season, hasSeasonalReference: true };
      }
    }

    // Look for activity level indicators
    const activityIndicators = {
      high: /\b(busy|active|peak|high)\b/i,
      low: /\b(slow|quiet|low|minimal)\b/i,
      moderate: /\b(moderate|steady|normal)\b/i
    };

    for (const [level, pattern] of Object.entries(activityIndicators)) {
      if (pattern.test(text)) {
        return { activityLevel: level };
      }
    }

    return null;
  }

  /**
   * Validate against seasonal pattern
   * @private
   */
  _validateAgainstSeasonalPattern(seasonalData, expectedPattern) {
    if (seasonalData.activityLevel) {
      const expected = expectedPattern.activity;
      const actual = seasonalData.activityLevel;
      
      // Check for major inconsistencies
      if ((expected === 'high' && actual === 'low') ||
          (expected === 'low' && actual === 'high')) {
        return {
          isValid: false,
          issue: `Activity level '${actual}' inconsistent with seasonal pattern '${expected}'`,
          penalty: 0.3
        };
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Calculate overall plausibility score
   * @private
   */
  _calculateOverallScore(results) {
    const weights = {
      range: 0.3,
      outlier: 0.25,
      trend: 0.2,
      mathematical: 0.15,
      seasonal: 0.1
    };

    let totalScore = 0;

    // Range validation score
    if (results.rangeValidation.length > 0) {
      const rangeScore = results.rangeValidation.reduce((sum, result) => 
        sum + result.plausibilityScore, 0) / results.rangeValidation.length;
      totalScore += rangeScore * weights.range * 100;
    }

    // Outlier detection score (inverse of outlier rate)
    if (results.outlierDetection.length > 0) {
      const outlierRate = results.outlierDetection.filter(r => r.isOutlier).length / results.outlierDetection.length;
      const outlierScore = Math.max(0, 1 - outlierRate);
      totalScore += outlierScore * weights.outlier * 100;
    }

    // Trend plausibility score
    if (results.trendPlausibility.length > 0) {
      const trendScore = results.trendPlausibility.reduce((sum, result) => 
        sum + result.plausibilityScore, 0) / results.trendPlausibility.length;
      totalScore += trendScore * weights.trend * 100;
    }

    // Mathematical consistency score
    if (results.mathematicalConsistency.length > 0) {
      const mathScore = results.mathematicalConsistency.reduce((sum, result) => 
        sum + result.consistencyScore, 0) / results.mathematicalConsistency.length;
      totalScore += mathScore * weights.mathematical * 100;
    }

    // Seasonal consistency score
    if (results.seasonalConsistency.length > 0) {
      const seasonalScore = results.seasonalConsistency.reduce((sum, result) => 
        sum + result.consistencyScore, 0) / results.seasonalConsistency.length;
      totalScore += seasonalScore * weights.seasonal * 100;
    }

    return Math.round(totalScore);
  }

  /**
   * Compile flagged implausibilities
   * @private
   */
  _compileFlaggedImplausibilities(results) {
    const flagged = [];

    // Add range validation issues
    results.rangeValidation.forEach(result => {
      if (!result.isWithinRange) {
        flagged.push({
          type: 'range_violation',
          severity: 'high',
          description: `Range validation issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add outlier detection issues
    results.outlierDetection.forEach(result => {
      if (result.isOutlier) {
        flagged.push({
          type: 'statistical_outlier',
          severity: 'medium',
          description: `Statistical outlier detected (z-score: ${result.zScore.toFixed(2)})`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add trend plausibility issues
    results.trendPlausibility.forEach(result => {
      if (!result.isPlausibleTrend) {
        flagged.push({
          type: 'implausible_trend',
          severity: 'medium',
          description: `Trend plausibility issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add mathematical consistency issues
    results.mathematicalConsistency.forEach(result => {
      if (!result.isMathematicallyConsistent) {
        flagged.push({
          type: 'mathematical_inconsistency',
          severity: 'high',
          description: `Mathematical consistency issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add seasonal consistency issues
    results.seasonalConsistency.forEach(result => {
      if (!result.isSeasonallyConsistent) {
        flagged.push({
          type: 'seasonal_inconsistency',
          severity: 'low',
          description: `Seasonal consistency issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    return flagged;
  }

  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(results, claimsCount) {
    if (claimsCount === 0) return 1.0;

    const issueCount = results.outlierDetection.filter(r => r.isOutlier).length +
                     results.rangeValidation.filter(r => !r.isWithinRange).length +
                     results.trendPlausibility.filter(r => !r.isPlausibleTrend).length +
                     results.mathematicalConsistency.filter(r => !r.isMathematicallyConsistent).length +
                     results.seasonalConsistency.filter(r => !r.isSeasonallyConsistent).length;

    const confidence = Math.max(0.1, 1 - (issueCount / claimsCount));
    return Math.min(confidence, 1.0);
  }

  /**
   * Initialize market ranges
   * @private
   */
  _initializeMarketRanges() {
    return {
      priceRanges: {
        singleFamily: { min: 100000, max: 10000000, typical: [300000, 800000] },
        condo: { min: 50000, max: 5000000, typical: [200000, 600000] },
        luxury: { min: 1000000, max: 50000000, typical: [1500000, 5000000] }
      },
      changeRanges: {
        monthly: { min: -30, max: 30, typical: [-5, 5] },
        quarterly: { min: -50, max: 50, typical: [-10, 10] },
        yearly: { min: -80, max: 100, typical: [-20, 20] }
      }
    };
  }

  /**
   * Initialize historical norms
   * @private
   */
  _initializeHistoricalNorms() {
    return {
      averageAppreciation: 3.5, // Annual percentage
      typicalInventory: 4.5, // Months of supply
      averageDaysOnMarket: 45,
      seasonalVariation: {
        spring: 1.2, // Multiplier for activity
        summer: 1.4,
        fall: 0.9,
        winter: 0.7
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
   * Create empty result for no claims
   * @private
   */
  _createEmptyResult() {
    return {
      overallPlausibilityScore: 100, // No claims = no implausibilities
      results: {
        rangeValidation: [],
        outlierDetection: [],
        trendPlausibility: [],
        mathematicalConsistency: [],
        seasonalConsistency: []
      },
      flaggedImplausibilities: [],
      confidence: 1.0,
      processingTime: 0
    };
  }
}

module.exports = StatisticalPlausibilityValidator;