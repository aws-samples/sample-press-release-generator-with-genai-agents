/**
 * Temporal Alignment Validation System
 * Phase 1 Critical Data Validation Layer - GREEN Phase Implementation
 * 
 * Addresses Critical Issue C3: Temporal Misalignment
 * - Standardizes data points to consistent time periods
 * - Validates temporal consistency across data sources
 * - Implements temporal normalization and alignment
 * - Provides temporal conflict detection and resolution
 */

const { performance } = require('perf_hooks');

class TemporalAlignmentValidator {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.standardPeriod = options.standardPeriod || 'monthly'; // monthly, quarterly, yearly
        this.maxTemporalDeviation = options.maxTemporalDeviation || 30; // days
        this.version = '1.0.0';
        
        // Standard temporal periods in days
        this.periodDurations = {
            daily: 1,
            weekly: 7,
            monthly: 30,
            quarterly: 90,
            yearly: 365
        };

        // Temporal pattern recognition
        this.temporalPatterns = {
            'year-over-year': /\b(yoy|year.over.year|annual|yearly)\b/i,
            'month-over-month': /\b(mom|month.over.month|monthly)\b/i,
            'quarter-over-quarter': /\b(qoq|quarter.over.quarter|quarterly)\b/i,
            'week-over-week': /\b(wow|week.over.week|weekly)\b/i,
            'day-over-day': /\b(dod|day.over.day|daily)\b/i
        };
    }

    /**
     * Validate temporal alignment across data points
     * @param {Array} dataPoints - Array of data points with temporal information
     * @returns {Object} Validation result with alignment status and conflicts
     */
    async validateTemporalAlignment(dataPoints) {
        const startTime = performance.now();

        try {
            if (!Array.isArray(dataPoints)) {
                return {
                    aligned: false,
                    conflicts: ['Invalid input: dataPoints must be an array'],
                    standardizedData: []
                };
            }

            if (dataPoints.length === 0) {
                return {
                    aligned: true,
                    conflicts: [],
                    standardizedData: []
                };
            }

            // Extract temporal information from each data point
            const temporalData = dataPoints.map((point, index) => ({
                index,
                originalData: point,
                temporal: this.extractTemporalInfo(point),
                period: this.detectTemporalPeriod(point)
            }));

            // Detect conflicts
            const conflicts = this.detectTemporalConflicts(temporalData);

            // Standardize to common temporal reference
            const standardizedData = await this.standardizeTemporalData(temporalData);

            // Calculate alignment score
            const alignmentScore = this.calculateAlignmentScore(temporalData, conflicts);

            const duration = performance.now() - startTime;
            this.logger.debug(`TemporalAlignmentValidator: Validation completed in ${duration.toFixed(2)}ms`);

            return {
                aligned: conflicts.length === 0,
                alignmentScore,
                conflicts,
                standardizedData,
                temporalSummary: this.generateTemporalSummary(temporalData)
            };

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error during validation', error);
            return {
                aligned: false,
                conflicts: [`Validation error: ${error.message}`],
                standardizedData: []
            };
        }
    }

    /**
     * Extract temporal information from data point
     * @param {Object} dataPoint - Data point to analyze
     * @returns {Object} Extracted temporal information
     */
    extractTemporalInfo(dataPoint) {
        try {
            const temporal = {
                period: null,
                startDate: null,
                endDate: null,
                referenceDate: null,
                periodType: null
            };

            // Check for explicit temporal fields
            if (dataPoint.temporal) {
                Object.assign(temporal, dataPoint.temporal);
            }

            // Check for date fields
            if (dataPoint.date || dataPoint.timestamp) {
                temporal.referenceDate = new Date(dataPoint.date || dataPoint.timestamp);
            }

            // Check for period information in metadata
            if (dataPoint.metadata) {
                temporal.period = dataPoint.metadata.period || temporal.period;
                temporal.periodType = dataPoint.metadata.periodType || temporal.periodType;
            }

            // Detect period from text content
            if (dataPoint.description || dataPoint.text) {
                const detectedPeriod = this.detectPeriodFromText(dataPoint.description || dataPoint.text);
                if (detectedPeriod && !temporal.periodType) {
                    temporal.periodType = detectedPeriod;
                }
            }

            return temporal;

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error extracting temporal info', error);
            return {
                period: null,
                startDate: null,
                endDate: null,
                referenceDate: null,
                periodType: null
            };
        }
    }

    /**
     * Detect temporal period from text content
     * @param {String} text - Text to analyze
     * @returns {String|null} Detected period type
     */
    detectPeriodFromText(text) {
        try {
            if (!text || typeof text !== 'string') {
                return null;
            }

            for (const [periodType, pattern] of Object.entries(this.temporalPatterns)) {
                if (pattern.test(text)) {
                    return periodType;
                }
            }

            return null;

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error detecting period from text', error);
            return null;
        }
    }

    /**
     * Detect temporal period for data point
     * @param {Object} dataPoint - Data point to analyze
     * @returns {String} Detected period
     */
    detectTemporalPeriod(dataPoint) {
        try {
            // Check explicit period field
            if (dataPoint.period) {
                return dataPoint.period;
            }

            // Check temporal metadata
            const temporal = this.extractTemporalInfo(dataPoint);
            if (temporal.periodType) {
                return temporal.periodType;
            }

            // Default to monthly if no period detected
            return 'monthly';

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error detecting temporal period', error);
            return 'monthly';
        }
    }

    /**
     * Detect temporal conflicts between data points
     * @param {Array} temporalData - Array of temporal data objects
     * @returns {Array} Array of conflict objects
     */
    detectTemporalConflicts(temporalData) {
        const conflicts = [];

        try {
            if (temporalData.length <= 1) {
                return conflicts;
            }

            // Group by period type
            const periodGroups = {};
            temporalData.forEach(item => {
                const period = item.period || 'unknown';
                if (!periodGroups[period]) {
                    periodGroups[period] = [];
                }
                periodGroups[period].push(item);
            });

            // Check for mixed periods
            const periodTypes = Object.keys(periodGroups);
            if (periodTypes.length > 1) {
                conflicts.push({
                    type: 'mixed_periods',
                    severity: 'high',
                    periods: periodTypes,
                    message: `Mixed temporal periods detected: ${periodTypes.join(', ')}`,
                    affectedIndices: temporalData.map(item => item.index)
                });
            }

            // Check for missing temporal information
            temporalData.forEach(item => {
                if (!item.temporal.referenceDate && !item.temporal.period) {
                    conflicts.push({
                        type: 'missing_temporal_info',
                        severity: 'medium',
                        index: item.index,
                        message: `Missing temporal information for data point ${item.index}`
                    });
                }
            });

            // Check for temporal gaps
            const datedItems = temporalData
                .filter(item => item.temporal.referenceDate)
                .sort((a, b) => a.temporal.referenceDate - b.temporal.referenceDate);

            for (let i = 1; i < datedItems.length; i++) {
                const prev = datedItems[i - 1];
                const curr = datedItems[i];
                const gap = Math.abs(curr.temporal.referenceDate - prev.temporal.referenceDate) / (1000 * 60 * 60 * 24);

                if (gap > this.maxTemporalDeviation) {
                    conflicts.push({
                        type: 'temporal_gap',
                        severity: 'medium',
                        gap: Math.round(gap),
                        indices: [prev.index, curr.index],
                        message: `Large temporal gap of ${Math.round(gap)} days between data points`
                    });
                }
            }

            return conflicts;

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error detecting temporal conflicts', error);
            return [{
                type: 'detection_error',
                severity: 'critical',
                message: error.message
            }];
        }
    }

    /**
     * Standardize temporal data to common reference
     * @param {Array} temporalData - Array of temporal data objects
     * @returns {Array} Standardized data array
     */
    async standardizeTemporalData(temporalData) {
        try {
            const standardized = [];

            for (const item of temporalData) {
                const standardizedItem = {
                    ...item.originalData,
                    temporal: {
                        ...item.temporal,
                        standardPeriod: this.standardPeriod,
                        normalizedDate: this.normalizeDate(item.temporal.referenceDate),
                        periodAlignment: this.alignToPeriod(item.temporal, this.standardPeriod)
                    },
                    metadata: {
                        ...item.originalData.metadata,
                        temporalStandardization: {
                            originalPeriod: item.period,
                            standardizedPeriod: this.standardPeriod,
                            alignmentApplied: true,
                            timestamp: new Date().toISOString()
                        }
                    }
                };

                standardized.push(standardizedItem);
            }

            return standardized;

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error standardizing temporal data', error);
            return temporalData.map(item => item.originalData);
        }
    }

    /**
     * Normalize date to standard format
     * @param {Date|String|null} date - Date to normalize
     * @returns {String|null} Normalized date string
     */
    normalizeDate(date) {
        try {
            if (!date) {
                return null;
            }

            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) {
                return null;
            }

            return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error normalizing date', error);
            return null;
        }
    }

    /**
     * Align temporal data to standard period
     * @param {Object} temporal - Temporal information
     * @param {String} targetPeriod - Target period for alignment
     * @returns {Object} Alignment information
     */
    alignToPeriod(temporal, targetPeriod) {
        try {
            const alignment = {
                aligned: false,
                targetPeriod,
                originalPeriod: temporal.periodType,
                adjustmentFactor: 1,
                notes: []
            };

            if (!temporal.periodType || temporal.periodType === targetPeriod) {
                alignment.aligned = true;
                return alignment;
            }

            // Calculate adjustment factor for period conversion
            const originalDuration = this.periodDurations[temporal.periodType] || 30;
            const targetDuration = this.periodDurations[targetPeriod] || 30;
            
            alignment.adjustmentFactor = targetDuration / originalDuration;
            alignment.aligned = true;
            alignment.notes.push(`Converted from ${temporal.periodType} to ${targetPeriod}`);

            return alignment;

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error aligning to period', error);
            return {
                aligned: false,
                targetPeriod,
                originalPeriod: temporal.periodType,
                adjustmentFactor: 1,
                notes: ['Alignment failed due to error']
            };
        }
    }

    /**
     * Calculate alignment score
     * @param {Array} temporalData - Temporal data array
     * @param {Array} conflicts - Array of conflicts
     * @returns {Number} Alignment score (0-1)
     */
    calculateAlignmentScore(temporalData, conflicts) {
        try {
            if (temporalData.length === 0) {
                return 1.0;
            }

            let score = 1.0;

            // Penalize for conflicts
            conflicts.forEach(conflict => {
                switch (conflict.severity) {
                    case 'critical':
                        score -= 0.4;
                        break;
                    case 'high':
                        score -= 0.3;
                        break;
                    case 'medium':
                        score -= 0.2;
                        break;
                    case 'low':
                        score -= 0.1;
                        break;
                    default:
                        score -= 0.15;
                }
            });

            // Bonus for complete temporal information
            const completeItems = temporalData.filter(item => 
                item.temporal.referenceDate && item.temporal.periodType
            ).length;
            
            const completenessBonus = (completeItems / temporalData.length) * 0.2;
            score += completenessBonus;

            return Math.max(0, Math.min(1, score));

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error calculating alignment score', error);
            return 0.5;
        }
    }

    /**
     * Generate temporal summary
     * @param {Array} temporalData - Temporal data array
     * @returns {Object} Temporal summary
     */
    generateTemporalSummary(temporalData) {
        try {
            const summary = {
                totalDataPoints: temporalData.length,
                periodsDetected: {},
                dateRange: {
                    earliest: null,
                    latest: null
                },
                completeness: {
                    withDates: 0,
                    withPeriods: 0,
                    complete: 0
                }
            };

            const dates = [];

            temporalData.forEach(item => {
                // Count periods
                const period = item.period || 'unknown';
                summary.periodsDetected[period] = (summary.periodsDetected[period] || 0) + 1;

                // Collect dates
                if (item.temporal.referenceDate) {
                    dates.push(item.temporal.referenceDate);
                    summary.completeness.withDates++;
                }

                // Count periods
                if (item.temporal.periodType) {
                    summary.completeness.withPeriods++;
                }

                // Count complete items
                if (item.temporal.referenceDate && item.temporal.periodType) {
                    summary.completeness.complete++;
                }
            });

            // Calculate date range
            if (dates.length > 0) {
                dates.sort((a, b) => a - b);
                summary.dateRange.earliest = dates[0].toISOString().split('T')[0];
                summary.dateRange.latest = dates[dates.length - 1].toISOString().split('T')[0];
            }

            return summary;

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error generating temporal summary', error);
            return {
                totalDataPoints: temporalData.length,
                periodsDetected: {},
                dateRange: { earliest: null, latest: null },
                completeness: { withDates: 0, withPeriods: 0, complete: 0 }
            };
        }
    }

    /**
     * Normalize data to standard temporal period
     * @param {Object} data - Data to normalize
     * @param {String} targetPeriod - Target temporal period
     * @returns {Object} Normalized data
     */
    async normalizeToStandardPeriod(data, targetPeriod = null) {
        const startTime = performance.now();
        const period = targetPeriod || this.standardPeriod;

        try {
            if (!data || typeof data !== 'object') {
                return {
                    success: false,
                    error: 'Invalid data provided for normalization',
                    normalizedData: null
                };
            }

            const temporal = this.extractTemporalInfo(data);
            const alignment = this.alignToPeriod(temporal, period);

            const normalizedData = {
                ...data,
                temporal: {
                    ...temporal,
                    standardPeriod: period,
                    normalizedDate: this.normalizeDate(temporal.referenceDate),
                    alignment
                },
                metadata: {
                    ...data.metadata,
                    temporalNormalization: {
                        applied: true,
                        targetPeriod: period,
                        adjustmentFactor: alignment.adjustmentFactor,
                        timestamp: new Date().toISOString()
                    }
                }
            };

            // Apply adjustment factor to numeric values if needed
            if (alignment.adjustmentFactor !== 1) {
                normalizedData = this.applyTemporalAdjustment(normalizedData, alignment.adjustmentFactor);
            }

            const duration = performance.now() - startTime;
            this.logger.debug(`TemporalAlignmentValidator: Normalization completed in ${duration.toFixed(2)}ms`);

            return {
                success: true,
                normalizedData,
                adjustmentApplied: alignment.adjustmentFactor !== 1,
                adjustmentFactor: alignment.adjustmentFactor
            };

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error normalizing to standard period', error);
            return {
                success: false,
                error: error.message,
                normalizedData: data
            };
        }
    }

    /**
     * Apply temporal adjustment to numeric values
     * @param {Object} data - Data to adjust
     * @param {Number} factor - Adjustment factor
     * @returns {Object} Adjusted data
     */
    applyTemporalAdjustment(data, factor) {
        try {
            const adjusted = { ...data };

            // Apply factor to common numeric fields
            const numericFields = ['value', 'amount', 'change', 'median', 'average'];
            
            numericFields.forEach(field => {
                if (typeof adjusted[field] === 'number') {
                    adjusted[field] = Math.round(adjusted[field] * factor * 100) / 100;
                }
            });

            // Apply to nested objects
            Object.keys(adjusted).forEach(key => {
                if (typeof adjusted[key] === 'object' && adjusted[key] !== null && !Array.isArray(adjusted[key])) {
                    numericFields.forEach(field => {
                        if (typeof adjusted[key][field] === 'number') {
                            adjusted[key][field] = Math.round(adjusted[key][field] * factor * 100) / 100;
                        }
                    });
                }
            });

            return adjusted;

        } catch (error) {
            this.logger.warn('TemporalAlignmentValidator: Error applying temporal adjustment', error);
            return data;
        }
    }

    /**
     * Detect temporal anomalies in data points
     * @param {Array} dataPoints - Array of data points to analyze
     * @returns {Array} Array of anomaly objects
     */
    detectTemporalAnomalities(dataPoints) {
        const anomalies = [];

        try {
            if (!Array.isArray(dataPoints)) {
                return anomalies;
            }

            const now = new Date();
            const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

            dataPoints.forEach((point, index) => {
                const temporal = this.extractTemporalInfo(point);
                
                if (temporal.referenceDate) {
                    const date = new Date(temporal.referenceDate);
                    
                    // Check for future-dated data
                    if (date > oneYearFromNow) {
                        anomalies.push({
                            type: 'future_dated_data',
                            severity: 'critical',
                            index: index,
                            date: date.toISOString(),
                            message: `Data point ${index} has future date: ${date.toISOString()}`
                        });
                    }
                    
                    // Check for extremely old data
                    if (date < oneYearAgo) {
                        anomalies.push({
                            type: 'extremely_old_data',
                            severity: 'medium',
                            index: index,
                            date: date.toISOString(),
                            message: `Data point ${index} has very old date: ${date.toISOString()}`
                        });
                    }
                    
                    // Check for invalid dates
                    if (isNaN(date.getTime())) {
                        anomalies.push({
                            type: 'invalid_date',
                            severity: 'high',
                            index: index,
                            message: `Data point ${index} has invalid date`
                        });
                    }
                }
            });

            return anomalies;

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error detecting temporal anomalies', error);
            return [{
                type: 'detection_error',
                severity: 'critical',
                message: error.message
            }];
        }
    }

    /**
     * Validate temporal consistency across data points
     * @param {Array} dataPoints - Array of data points to validate
     * @returns {Array} Array of misalignment objects
     */
    validateTemporalConsistency(dataPoints) {
        try {
            if (!Array.isArray(dataPoints)) {
                return [];
            }

            if (dataPoints.length === 0) {
                return [];
            }

            const misalignments = [];
            const periods = {};

            // Group by period and detect inconsistencies
            dataPoints.forEach((point, index) => {
                const period = this.detectTemporalPeriod(point);
                if (!periods[period]) {
                    periods[period] = [];
                }
                periods[period].push({ point, index });
            });

            // Check for mixed periods
            const periodTypes = Object.keys(periods);
            if (periodTypes.length > 1) {
                misalignments.push({
                    type: 'mixed_periods',
                    severity: 'high',
                    periods: periodTypes,
                    message: `Mixed temporal periods detected: ${periodTypes.join(', ')}`
                });
            }

            // Check for temporal gaps
            const datedPoints = dataPoints
                .map((point, index) => ({ point, index, temporal: this.extractTemporalInfo(point) }))
                .filter(item => item.temporal.referenceDate)
                .sort((a, b) => new Date(a.temporal.referenceDate) - new Date(b.temporal.referenceDate));

            for (let i = 1; i < datedPoints.length; i++) {
                const prev = datedPoints[i - 1];
                const curr = datedPoints[i];
                const gap = Math.abs(new Date(curr.temporal.referenceDate) - new Date(prev.temporal.referenceDate)) / (1000 * 60 * 60 * 24);

                if (gap > this.maxTemporalDeviation) {
                    misalignments.push({
                        type: 'temporal_gap',
                        severity: 'medium',
                        gap: Math.round(gap),
                        indices: [prev.index, curr.index],
                        message: `Large temporal gap of ${Math.round(gap)} days between data points`
                    });
                }
            }

            return misalignments;

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error validating temporal consistency', error);
            return [{
                type: 'validation_error',
                severity: 'critical',
                message: error.message
            }];
        }
    }

    /**
     * Align data to standard period
     * @param {Array} dataPoints - Array of data points to align
     * @param {String} targetPeriod - Target period for alignment
     * @returns {Array} Array of aligned data points
     */
    alignDataToStandardPeriod(dataPoints, targetPeriod) {
        try {
            if (!Array.isArray(dataPoints)) {
                return [];
            }

            return dataPoints.map(point => {
                const temporal = this.extractTemporalInfo(point);
                const alignment = this.alignToPeriod(temporal, targetPeriod);

                return {
                    ...point,
                    period: targetPeriod,
                    originalValue: point.value || point.median || point.change,
                    temporal: {
                        ...temporal,
                        standardPeriod: targetPeriod,
                        alignment
                    },
                    metadata: {
                        ...point.metadata,
                        temporalAlignment: {
                            originalPeriod: temporal.periodType,
                            targetPeriod: targetPeriod,
                            adjustmentFactor: alignment.adjustmentFactor,
                            timestamp: new Date().toISOString()
                        }
                    }
                };
            });

        } catch (error) {
            this.logger.error('TemporalAlignmentValidator: Error aligning data to standard period', error);
            return dataPoints;
        }
    }
}

module.exports = TemporalAlignmentValidator;