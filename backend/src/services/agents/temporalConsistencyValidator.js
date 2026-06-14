const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');
const { ValidationError } = require('../../utils/errorHandler');

/**
 * TemporalConsistencyValidator Agent
 * Historical data accuracy and temporal consistency validation
 * 
 * Features:
 * - Historical data accuracy assessment
 * - Timeline sequence validation
 * - Future reference error detection
 * - Seasonal/cyclical pattern analysis
 * - Performance target: <3 seconds processing time
 */
class TemporalConsistencyValidator extends BaseAgent {
  constructor(options = {}, lineageService = null) {
    super('Temporal Consistency Validator', {
      maxProcessingTime: 3000, // 3 seconds
      consistencyThreshold: 0.7,
      temporalAccuracy: 0.8,
      ...options
    }, lineageService);

    // Temporal patterns and historical data
    this.temporalPatterns = null;
    this.historicalBaselines = null;
    
    // Date and time patterns
    this.datePatterns = {
      year: /\b(19|20)\d{2}\b/g,
      month: /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi,
      quarter: /\b(q[1-4]|first quarter|second quarter|third quarter|fourth quarter)\b/gi,
      relative: /\b(last|this|next|previous|current)\s+(year|month|quarter|week)\b/gi
    };

    // Temporal relationship indicators
    this.temporalRelations = {
      before: /\b(before|prior to|earlier than|preceding)\b/gi,
      after: /\b(after|following|later than|subsequent to)\b/gi,
      during: /\b(during|throughout|within|in)\b/gi,
      since: /\b(since|from|starting)\b/gi,
      until: /\b(until|through|up to)\b/gi
    };

    // Market cycle patterns
    this.marketCycles = {
      seasonal: {
        spring: { months: [3, 4, 5], activity: 'increasing', typical: 'high' },
        summer: { months: [6, 7, 8], activity: 'peak', typical: 'highest' },
        fall: { months: [9, 10, 11], activity: 'declining', typical: 'moderate' },
        winter: { months: [12, 1, 2], activity: 'low', typical: 'lowest' }
      },
      economic: {
        expansion: { duration: '2-8 years', characteristics: ['growth', 'rising prices', 'low unemployment'] },
        peak: { duration: '1-2 quarters', characteristics: ['maximum activity', 'high prices', 'tight supply'] },
        contraction: { duration: '6 months-2 years', characteristics: ['declining activity', 'falling prices', 'rising inventory'] },
        trough: { duration: '1-2 quarters', characteristics: ['minimum activity', 'low prices', 'high inventory'] }
      }
    };
  }

  /**
   * Initialize the TemporalConsistencyValidator
   */
  async initialize() {
    await super.initialize();

    try {
      this.log('info', 'Initializing temporal validation parameters');
      
      // Initialize temporal patterns and baselines
      this.temporalPatterns = this._initializeTemporalPatterns();
      this.historicalBaselines = this._initializeHistoricalBaselines();
      
      this.log('info', 'Temporal consistency validator initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize temporal consistency validator', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate temporal consistency of claims
   * @param {Array} claims - Claims to validate for temporal consistency
   * @param {Object} context - Temporal and market context
   * @returns {Object} Temporal consistency validation results
   */
  async validateTemporalConsistency(claims, context = {}) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting temporal consistency validation', {
        claimsCount: claims.length,
        contextKeys: Object.keys(context)
      });

      // Handle empty claims
      if (!claims || claims.length === 0) {
        return this._createEmptyResult();
      }

      // Validate and filter claims
      const validClaims = this._validateClaims(claims);
      
      // Perform temporal validation
      const results = {
        historicalAccuracy: await this._validateHistoricalAccuracy(validClaims, context),
        timelineSequence: await this._validateTimelineSequence(validClaims, context),
        futureReferences: await this._detectFutureReferenceErrors(validClaims, context),
        seasonalConsistency: await this._validateSeasonalConsistency(validClaims, context),
        cyclicalPatterns: await this._validateCyclicalPatterns(validClaims, context)
      };

      // Calculate overall temporal consistency score
      const overallConsistencyScore = this._calculateOverallScore(results);
      
      // Identify flagged temporal issues
      const flaggedTemporalIssues = this._compileFlaggedTemporalIssues(results);
      
      // Calculate confidence
      const confidence = this._calculateConfidence(results, validClaims.length);

      const processingTime = Date.now() - startTime;
      
      // Check processing time requirement
      if (processingTime >= this.options.maxProcessingTime) {
        this.log('warn', 'Temporal validation exceeded time limit', { processingTime });
      }

      const result = {
        overallConsistencyScore,
        results,
        flaggedTemporalIssues,
        confidence,
        processingTime
      };

      this.log('info', 'Temporal consistency validation completed', {
        overallScore: overallConsistencyScore,
        historicalIssues: results.historicalAccuracy.filter(r => !r.isHistoricallyAccurate).length,
        futureErrors: results.futureReferences.length,
        flaggedIssues: flaggedTemporalIssues.length,
        processingTime
      });

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.log('error', 'Temporal consistency validation failed', {
        error: error.message,
        processingTime
      });
      throw error;
    }
  }

  /**
   * Validate historical accuracy of claims
   * @private
   */
  async _validateHistoricalAccuracy(claims, context) {
    const results = [];

    for (const claim of claims) {
      try {
        const accuracyResult = await this._validateSingleHistoricalAccuracy(claim, context);
        results.push(accuracyResult);
      } catch (error) {
        this.log('warn', 'Failed to validate historical accuracy for claim', {
          claim: claim.text,
          error: error.message
        });
        
        results.push({
          claim,
          isHistoricallyAccurate: false,
          accuracyScore: 0,
          issues: [`Historical validation failed: ${error.message}`]
        });
      }
    }

    return results;
  }

  /**
   * Validate historical accuracy for a single claim
   * @private
   */
  async _validateSingleHistoricalAccuracy(claim, context) {
    const issues = [];
    let accuracyScore = 1.0;

    // Extract temporal references from claim
    const temporalRefs = this._extractTemporalReferences(claim);
    
    if (temporalRefs.length === 0) {
      return {
        claim,
        isHistoricallyAccurate: true,
        accuracyScore: 1.0,
        issues: []
      };
    }

    // Validate each temporal reference
    for (const ref of temporalRefs) {
      const validation = this._validateTemporalReference(ref, claim, context);
      if (!validation.isValid) {
        issues.push(validation.issue);
        accuracyScore -= validation.penalty;
      }
    }

    // Check against historical baselines
    const baselineValidation = this._validateAgainstHistoricalBaselines(claim, temporalRefs, context);
    if (!baselineValidation.isValid) {
      issues.push(baselineValidation.issue);
      accuracyScore -= baselineValidation.penalty;
    }

    accuracyScore = Math.max(accuracyScore, 0);

    return {
      claim,
      isHistoricallyAccurate: accuracyScore >= this.options.temporalAccuracy,
      accuracyScore,
      issues
    };
  }

  /**
   * Validate timeline sequence consistency
   * @private
   */
  async _validateTimelineSequence(claims, context) {
    const results = [];
    
    // Extract temporal claims with dates/periods
    const temporalClaims = claims.filter(claim => this._hasTemporalReference(claim));
    
    if (temporalClaims.length < 2) {
      return results; // Need at least 2 temporal claims for sequence validation
    }

    // Sort claims by temporal reference
    const sortedClaims = this._sortClaimsByTime(temporalClaims);
    
    // Validate sequence consistency
    for (let i = 0; i < sortedClaims.length - 1; i++) {
      const sequenceResult = this._validateSequencePair(sortedClaims[i], sortedClaims[i + 1], context);
      if (sequenceResult) {
        results.push(sequenceResult);
      }
    }

    return results;
  }

  /**
   * Detect future reference errors
   * @private
   */
  async _detectFutureReferenceErrors(claims, context) {
    const errors = [];
    const currentDate = context.currentDate ? new Date(context.currentDate) : new Date();

    for (const claim of claims) {
      const futureRefs = this._extractFutureReferences(claim, currentDate);
      
      for (const ref of futureRefs) {
        if (this._isFutureReferenceError(ref, claim, context)) {
          errors.push({
            claim,
            futureReference: ref,
            errorType: ref.errorType,
            severity: ref.severity,
            description: ref.description
          });
        }
      }
    }

    return errors;
  }

  /**
   * Validate seasonal consistency
   * @private
   */
  async _validateSeasonalConsistency(claims, context) {
    const results = [];

    for (const claim of claims) {
      const seasonalResult = this._validateSingleSeasonalConsistency(claim, context);
      results.push(seasonalResult);
    }

    return results;
  }

  /**
   * Validate seasonal consistency for a single claim
   * @private
   */
  _validateSingleSeasonalConsistency(claim, context) {
    const issues = [];
    let consistencyScore = 1.0;

    // Extract seasonal references
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
    const validation = this._validateAgainstSeasonalPatterns(seasonalData, claim, context);
    if (!validation.isValid) {
      issues.push(validation.issue);
      consistencyScore -= validation.penalty;
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isSeasonallyConsistent: consistencyScore >= this.options.consistencyThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Validate cyclical patterns
   * @private
   */
  async _validateCyclicalPatterns(claims, context) {
    const results = [];

    for (const claim of claims) {
      const cyclicalResult = this._validateSingleCyclicalPattern(claim, context);
      results.push(cyclicalResult);
    }

    return results;
  }

  /**
   * Validate cyclical pattern for a single claim
   * @private
   */
  _validateSingleCyclicalPattern(claim, context) {
    const issues = [];
    let consistencyScore = 1.0;

    // Extract cyclical indicators
    const cyclicalData = this._extractCyclicalData(claim);
    
    if (!cyclicalData) {
      return {
        claim,
        isCyclicallyConsistent: true,
        consistencyScore: 1.0,
        issues: []
      };
    }

    // Validate against market cycle patterns
    const validation = this._validateAgainstCyclicalPatterns(cyclicalData, claim, context);
    if (!validation.isValid) {
      issues.push(validation.issue);
      consistencyScore -= validation.penalty;
    }

    consistencyScore = Math.max(consistencyScore, 0);

    return {
      claim,
      isCyclicallyConsistent: consistencyScore >= this.options.consistencyThreshold,
      consistencyScore,
      issues
    };
  }

  /**
   * Extract temporal references from claim
   * @private
   */
  _extractTemporalReferences(claim) {
    const refs = [];
    const text = claim.text || '';

    // Extract years
    const years = text.match(this.datePatterns.year);
    if (years) {
      years.forEach(year => {
        refs.push({
          type: 'year',
          value: parseInt(year),
          text: year
        });
      });
    }

    // Extract months
    const months = text.match(this.datePatterns.month);
    if (months) {
      months.forEach(month => {
        refs.push({
          type: 'month',
          value: this._monthToNumber(month),
          text: month
        });
      });
    }

    // Extract quarters
    const quarters = text.match(this.datePatterns.quarter);
    if (quarters) {
      quarters.forEach(quarter => {
        refs.push({
          type: 'quarter',
          value: this._quarterToNumber(quarter),
          text: quarter
        });
      });
    }

    // Extract relative time references
    const relatives = text.match(this.datePatterns.relative);
    if (relatives) {
      relatives.forEach(relative => {
        refs.push({
          type: 'relative',
          value: relative,
          text: relative
        });
      });
    }

    return refs;
  }

  /**
   * Validate temporal reference
   * @private
   */
  _validateTemporalReference(ref, claim, context) {
    const currentYear = context.currentYear || new Date().getFullYear();
    
    if (ref.type === 'year') {
      // Check for reasonable year range
      if (ref.value < 1900 || ref.value > currentYear + 10) {
        return {
          isValid: false,
          issue: `Year ${ref.value} is outside reasonable range`,
          penalty: 0.3
        };
      }
      
      // Check for future years in historical claims
      if (ref.value > currentYear && claim.text.toLowerCase().includes('historical')) {
        return {
          isValid: false,
          issue: `Future year ${ref.value} referenced in historical context`,
          penalty: 0.4
        };
      }
    }

    if (ref.type === 'relative') {
      // Validate relative time references
      const validation = this._validateRelativeTimeReference(ref, context);
      if (!validation.isValid) {
        return validation;
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Validate against historical baselines
   * @private
   */
  _validateAgainstHistoricalBaselines(claim, temporalRefs, context) {
    // Extract numerical values from claim
    const values = this._extractNumericalValues(claim);
    
    if (values.length === 0) {
      return { isValid: true, issue: null, penalty: 0 };
    }

    // Check against historical ranges for the time period
    for (const ref of temporalRefs) {
      if (ref.type === 'year' && ref.value) {
        const baseline = this._getHistoricalBaseline(ref.value, claim.type);
        if (baseline) {
          for (const value of values) {
            if (this._isValueOutsideHistoricalRange(value, baseline)) {
              return {
                isValid: false,
                issue: `Value ${value.value} outside historical range for ${ref.value}`,
                penalty: 0.3
              };
            }
          }
        }
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Check if claim has temporal reference
   * @private
   */
  _hasTemporalReference(claim) {
    const text = claim.text || '';
    return this.datePatterns.year.test(text) ||
           this.datePatterns.month.test(text) ||
           this.datePatterns.quarter.test(text) ||
           this.datePatterns.relative.test(text);
  }

  /**
   * Sort claims by temporal reference
   * @private
   */
  _sortClaimsByTime(claims) {
    return claims.sort((a, b) => {
      const timeA = this._extractPrimaryTimeValue(a);
      const timeB = this._extractPrimaryTimeValue(b);
      return timeA - timeB;
    });
  }

  /**
   * Extract primary time value for sorting
   * @private
   */
  _extractPrimaryTimeValue(claim) {
    const refs = this._extractTemporalReferences(claim);
    if (refs.length === 0) return 0;

    // Prioritize year references
    const yearRef = refs.find(ref => ref.type === 'year');
    if (yearRef) return yearRef.value;

    // Then quarter references
    const quarterRef = refs.find(ref => ref.type === 'quarter');
    if (quarterRef) return quarterRef.value;

    // Then month references
    const monthRef = refs.find(ref => ref.type === 'month');
    if (monthRef) return monthRef.value;

    return 0;
  }

  /**
   * Validate sequence pair
   * @private
   */
  _validateSequencePair(claim1, claim2, context) {
    const time1 = this._extractPrimaryTimeValue(claim1);
    const time2 = this._extractPrimaryTimeValue(claim2);

    // Check for logical sequence
    if (time1 >= time2) {
      // Check if this is actually an error or just different time scales
      const validation = this._validateTimeSequenceLogic(claim1, claim2, time1, time2);
      if (!validation.isValid) {
        return {
          type: 'sequence_error',
          claim1,
          claim2,
          issue: validation.issue,
          severity: 'medium'
        };
      }
    }

    return null;
  }

  /**
   * Extract future references
   * @private
   */
  _extractFutureReferences(claim, currentDate) {
    const refs = [];
    const text = claim.text || '';
    const currentYear = currentDate.getFullYear();

    // Check for explicit future years
    const years = text.match(this.datePatterns.year);
    if (years) {
      years.forEach(year => {
        const yearValue = parseInt(year);
        if (yearValue > currentYear) {
          refs.push({
            type: 'future_year',
            value: yearValue,
            errorType: 'explicit_future_reference',
            severity: 'high',
            description: `Reference to future year ${yearValue}`
          });
        }
      });
    }

    // Check for future-oriented language in historical context
    const futureLanguage = /\b(will|shall|going to|expected to|projected to)\b/gi;
    if (futureLanguage.test(text) && text.toLowerCase().includes('historical')) {
      refs.push({
        type: 'future_language',
        errorType: 'future_language_in_historical_context',
        severity: 'medium',
        description: 'Future-oriented language in historical context'
      });
    }

    return refs;
  }

  /**
   * Check if future reference is an error
   * @private
   */
  _isFutureReferenceError(ref, claim, context) {
    // Future references are errors if:
    // 1. Explicit future dates in historical claims
    // 2. Future language in past tense context
    // 3. Predictions presented as historical facts

    if (ref.errorType === 'explicit_future_reference') {
      return claim.text.toLowerCase().includes('historical') ||
             claim.text.toLowerCase().includes('was') ||
             claim.text.toLowerCase().includes('had');
    }

    if (ref.errorType === 'future_language_in_historical_context') {
      return true; // Always an error
    }

    return false;
  }

  /**
   * Extract seasonal data
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
        return {
          season,
          hasSeasonalReference: true,
          activityLevel: this._extractActivityLevel(text)
        };
      }
    }

    return null;
  }

  /**
   * Extract activity level from text
   * @private
   */
  _extractActivityLevel(text) {
    const activityTerms = {
      high: /\b(high|peak|busy|active|strong)\b/i,
      low: /\b(low|slow|quiet|weak|minimal)\b/i,
      moderate: /\b(moderate|steady|normal|average)\b/i
    };

    for (const [level, pattern] of Object.entries(activityTerms)) {
      if (pattern.test(text)) {
        return level;
      }
    }

    return null;
  }

  /**
   * Validate against seasonal patterns
   * @private
   */
  _validateAgainstSeasonalPatterns(seasonalData, claim, context) {
    const expectedPattern = this.marketCycles.seasonal[seasonalData.season];
    
    if (!expectedPattern) {
      return { isValid: true, issue: null, penalty: 0 };
    }

    // Check activity level consistency
    if (seasonalData.activityLevel) {
      const expectedActivity = expectedPattern.typical;
      const actualActivity = seasonalData.activityLevel;
      
      // Check for major inconsistencies
      if ((expectedActivity === 'highest' && actualActivity === 'low') ||
          (expectedActivity === 'lowest' && actualActivity === 'high')) {
        return {
          isValid: false,
          issue: `Activity level '${actualActivity}' inconsistent with ${seasonalData.season} pattern '${expectedActivity}'`,
          penalty: 0.3
        };
      }
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Extract cyclical data
   * @private
   */
  _extractCyclicalData(claim) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    // Look for economic cycle indicators
    const cycleTerms = {
      expansion: /\b(expansion|growth|recovery|upturn)\b/i,
      peak: /\b(peak|top|maximum|height)\b/i,
      contraction: /\b(contraction|recession|downturn|decline)\b/i,
      trough: /\b(trough|bottom|minimum|low point)\b/i
    };

    for (const [cycle, pattern] of Object.entries(cycleTerms)) {
      if (pattern.test(text)) {
        return {
          cycle,
          hasCyclicalReference: true,
          duration: this._extractDuration(text)
        };
      }
    }

    return null;
  }

  /**
   * Extract duration from text
   * @private
   */
  _extractDuration(text) {
    const durationPattern = /(\d+)\s*(year|month|quarter|week)s?/i;
    const match = text.match(durationPattern);
    
    if (match) {
      return {
        value: parseInt(match[1]),
        unit: match[2].toLowerCase()
      };
    }

    return null;
  }

  /**
   * Validate against cyclical patterns
   * @private
   */
  _validateAgainstCyclicalPatterns(cyclicalData, claim, context) {
    const expectedPattern = this.marketCycles.economic[cyclicalData.cycle];
    
    if (!expectedPattern) {
      return { isValid: true, issue: null, penalty: 0 };
    }

    // Check duration consistency
    if (cyclicalData.duration) {
      const validation = this._validateCycleDuration(cyclicalData.duration, expectedPattern);
      if (!validation.isValid) {
        return validation;
      }
    }

    // Check characteristics consistency
    const characteristicsValidation = this._validateCycleCharacteristics(claim, expectedPattern);
    if (!characteristicsValidation.isValid) {
      return characteristicsValidation;
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Validate cycle duration
   * @private
   */
  _validateCycleDuration(duration, expectedPattern) {
    // This is a simplified validation - in practice, you'd have more sophisticated duration checking
    if (duration.unit === 'year' && duration.value > 10) {
      return {
        isValid: false,
        issue: `Cycle duration of ${duration.value} years seems excessive`,
        penalty: 0.2
      };
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Validate cycle characteristics
   * @private
   */
  _validateCycleCharacteristics(claim, expectedPattern) {
    const text = claim.text ? claim.text.toLowerCase() : '';
    
    // Check if claim characteristics match expected cycle characteristics
    for (const characteristic of expectedPattern.characteristics) {
      if (text.includes(characteristic.toLowerCase())) {
        return { isValid: true, issue: null, penalty: 0 };
      }
    }

    // If no matching characteristics found, it might be inconsistent
    return {
      isValid: false,
      issue: 'Claim characteristics don\'t match expected cycle pattern',
      penalty: 0.1
    };
  }

  /**
   * Convert month name to number
   * @private
   */
  _monthToNumber(monthName) {
    const months = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
      april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
      august: 8, aug: 8, september: 9, sep: 9, october: 10, oct: 10,
      november: 11, nov: 11, december: 12, dec: 12
    };
    
    return months[monthName.toLowerCase()] || 0;
  }

  /**
   * Convert quarter to number
   * @private
   */
  _quarterToNumber(quarterName) {
    const quarters = {
      'q1': 1, 'first quarter': 1,
      'q2': 2, 'second quarter': 2,
      'q3': 3, 'third quarter': 3,
      'q4': 4, 'fourth quarter': 4
    };
    
    return quarters[quarterName.toLowerCase()] || 0;
  }

  /**
   * Validate relative time reference
   * @private
   */
  _validateRelativeTimeReference(ref, context) {
    // Check for logical consistency in relative time references
    const text = ref.text.toLowerCase();
    
    if (text.includes('last') && text.includes('next')) {
      return {
        isValid: false,
        issue: 'Contradictory relative time reference: last and next',
        penalty: 0.3
      };
    }

    return { isValid: true, issue: null, penalty: 0 };
  }

  /**
   * Extract numerical values from claim
   * @private
   */
  _extractNumericalValues(claim) {
    const values = [];
    const text = claim.text || '';

    // Extract percentages
    const percentages = text.match(/(\d+(?:\.\d+)?)\s*%/g);
    if (percentages) {
      percentages.forEach(match => {
        const value = parseFloat(match.replace('%', ''));
        values.push({ type: 'percentage', value });
      });
    }

    // Extract currency amounts
    const currency = text.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)/g);
    if (currency) {
      currency.forEach(match => {
        const value = parseFloat(match.replace(/[$,]/g, ''));
        values.push({ type: 'currency', value });
      });
    }

    return values;
  }

  /**
   * Get historical baseline for year and claim type
   * @private
   */
  _getHistoricalBaseline(year, claimType) {
    // This would typically query a historical database
    // For now, return simplified baselines
    if (year >= 2020) {
      return this.historicalBaselines.recent;
    } else if (year >= 2010) {
      return this.historicalBaselines.decade;
    } else {
      return this.historicalBaselines.historical;
    }
  }

  /**
   * Check if value is outside historical range
   * @private
   */
  _isValueOutsideHistoricalRange(value, baseline) {
    if (!baseline || !value) return false;
    
    const range = baseline[value.type];
    if (!range) return false;
    
    return value.value < range.min || value.value > range.max;
  }

  /**
   * Validate time sequence logic
   * @private
   */
  _validateTimeSequenceLogic(claim1, claim2, time1, time2) {
    // Check if the sequence makes logical sense
    // This is a simplified check - real implementation would be more sophisticated
    
    if (Math.abs(time1 - time2) < 0.1) {
      // Times are very close, might be same period
      return { isValid: true, issue: null };
    }

    return {
      isValid: false,
      issue: `Timeline sequence appears inconsistent: ${time1} vs ${time2}`
    };
  }

  /**
   * Calculate overall temporal consistency score
   * @private
   */
  _calculateOverallScore(results) {
    const weights = {
      historical: 0.3,
      sequence: 0.25,
      future: 0.2,
      seasonal: 0.15,
      cyclical: 0.1
    };

    let totalScore = 0;

    // Historical accuracy score
    if (results.historicalAccuracy.length > 0) {
      const historicalScore = results.historicalAccuracy.reduce((sum, result) =>
        sum + result.accuracyScore, 0) / results.historicalAccuracy.length;
      totalScore += historicalScore * weights.historical * 100;
    }

    // Timeline sequence score (inverse of sequence errors)
    const sequenceScore = results.timelineSequence.length === 0 ? 1.0 :
      Math.max(0, 1 - (results.timelineSequence.length * 0.2));
    totalScore += sequenceScore * weights.sequence * 100;

    // Future reference score (inverse of future errors)
    const futureScore = results.futureReferences.length === 0 ? 1.0 :
      Math.max(0, 1 - (results.futureReferences.length * 0.3));
    totalScore += futureScore * weights.future * 100;

    // Seasonal consistency score
    if (results.seasonalConsistency.length > 0) {
      const seasonalScore = results.seasonalConsistency.reduce((sum, result) =>
        sum + result.consistencyScore, 0) / results.seasonalConsistency.length;
      totalScore += seasonalScore * weights.seasonal * 100;
    }

    // Cyclical consistency score
    if (results.cyclicalPatterns.length > 0) {
      const cyclicalScore = results.cyclicalPatterns.reduce((sum, result) =>
        sum + result.consistencyScore, 0) / results.cyclicalPatterns.length;
      totalScore += cyclicalScore * weights.cyclical * 100;
    }

    return Math.round(totalScore);
  }

  /**
   * Compile flagged temporal issues
   * @private
   */
  _compileFlaggedTemporalIssues(results) {
    const flagged = [];

    // Add historical accuracy issues
    results.historicalAccuracy.forEach(result => {
      if (!result.isHistoricallyAccurate) {
        flagged.push({
          type: 'historical_inaccuracy',
          severity: 'high',
          description: `Historical accuracy issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add timeline sequence issues
    results.timelineSequence.forEach(issue => {
      flagged.push({
        type: 'timeline_sequence_error',
        severity: issue.severity,
        description: issue.issue,
        affectedClaims: [issue.claim1, issue.claim2]
      });
    });

    // Add future reference errors
    results.futureReferences.forEach(error => {
      flagged.push({
        type: 'future_reference_error',
        severity: error.severity,
        description: error.description,
        affectedClaims: [error.claim]
      });
    });

    // Add seasonal consistency issues
    results.seasonalConsistency.forEach(result => {
      if (!result.isSeasonallyConsistent) {
        flagged.push({
          type: 'seasonal_inconsistency',
          severity: 'medium',
          description: `Seasonal consistency issues: ${result.issues.join(', ')}`,
          affectedClaims: [result.claim]
        });
      }
    });

    // Add cyclical pattern issues
    results.cyclicalPatterns.forEach(result => {
      if (!result.isCyclicallyConsistent) {
        flagged.push({
          type: 'cyclical_inconsistency',
          severity: 'medium',
          description: `Cyclical consistency issues: ${result.issues.join(', ')}`,
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

    const issueCount = results.historicalAccuracy.filter(r => !r.isHistoricallyAccurate).length +
                     results.timelineSequence.length +
                     results.futureReferences.length +
                     results.seasonalConsistency.filter(r => !r.isSeasonallyConsistent).length +
                     results.cyclicalPatterns.filter(r => !r.isCyclicallyConsistent).length;

    const confidence = Math.max(0.1, 1 - (issueCount / claimsCount));
    return Math.min(confidence, 1.0);
  }

  /**
   * Initialize temporal patterns
   * @private
   */
  _initializeTemporalPatterns() {
    return {
      yearlyTrends: {
        2020: { priceChange: -5, marketActivity: 'low', events: ['pandemic start'] },
        2021: { priceChange: 15, marketActivity: 'high', events: ['low rates', 'high demand'] },
        2022: { priceChange: 8, marketActivity: 'moderate', events: ['rate increases'] },
        2023: { priceChange: 3, marketActivity: 'moderate', events: ['market stabilization'] },
        2024: { priceChange: 5, marketActivity: 'moderate', events: ['continued growth'] }
      },
      seasonalTrends: {
        spring: { activityMultiplier: 1.2, priceMultiplier: 1.1 },
        summer: { activityMultiplier: 1.4, priceMultiplier: 1.15 },
        fall: { activityMultiplier: 0.9, priceMultiplier: 1.05 },
        winter: { activityMultiplier: 0.7, priceMultiplier: 1.0 }
      }
    };
  }

  /**
   * Initialize historical baselines
   * @private
   */
  _initializeHistoricalBaselines() {
    return {
      recent: {
        percentage: { min: -30, max: 50 },
        currency: { min: 100000, max: 5000000 }
      },
      decade: {
        percentage: { min: -50, max: 100 },
        currency: { min: 50000, max: 3000000 }
      },
      historical: {
        percentage: { min: -80, max: 200 },
        currency: { min: 10000, max: 2000000 }
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
      overallConsistencyScore: 100, // No claims = no temporal issues
      results: {
        historicalAccuracy: [],
        timelineSequence: [],
        futureReferences: [],
        seasonalConsistency: [],
        cyclicalPatterns: []
      },
      flaggedTemporalIssues: [],
      confidence: 1.0,
      processingTime: 0
    };
  }
}

module.exports = TemporalConsistencyValidator;