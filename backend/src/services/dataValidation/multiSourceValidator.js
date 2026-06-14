/**
 * Multi-Source Cross-Validation System
 * Phase 1 Critical Data Validation Layer - GREEN Phase Implementation
 * 
 * Addresses Critical Issue C1: Data Consistency Conflicts
 * - Detects directional conflicts (inventory +16.2% → -8.7%)
 * - Validates magnitude reasonableness across sources
 * - Implements cross-source consensus validation
 * - Provides confidence scoring and conflict resolution
 */

const { performance } = require('perf_hooks');

class MultiSourceValidator {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.confidenceThreshold = options.confidenceThreshold || 0.7;
        this.maxConflictTolerance = options.maxConflictTolerance || 0.02; // 2% tolerance
        this.version = '1.0.0';
        
        // Magnitude reasonableness thresholds by data type
        this.magnitudeThresholds = {
            price: { min: 0.5, max: 5.0 }, // 0.5x to 5x reasonable for price changes
            inventory: { min: 0.1, max: 10.0 }, // 0.1x to 10x reasonable for inventory
            sales: { min: 0.2, max: 8.0 }, // 0.2x to 8x reasonable for sales volume
            default: { min: 0.3, max: 3.0 } // Default conservative range
        };
    }

    /**
     * Validate data consistency between original and localized data
     * @param {Object} originalData - Original national/baseline data
     * @param {Object} localizedData - Market-specific localized data
     * @returns {Array} Array of conflict objects
     */
    validateDataConsistency(originalData, localizedData) {
        const startTime = performance.now();
        const conflicts = [];

        try {
            // Handle null/undefined inputs gracefully
            if (!originalData || !localizedData) {
                this.logger.warn('MultiSourceValidator: Null or undefined data provided');
                return [{
                    type: 'missing_data',
                    severity: 'high',
                    message: 'Original or localized data is missing'
                }];
            }

            // Handle empty objects
            if (Object.keys(originalData).length === 0 && Object.keys(localizedData).length === 0) {
                return [];
            }

            // Get all unique fields from both datasets
            const allFields = new Set([
                ...Object.keys(originalData),
                ...Object.keys(localizedData)
            ]);

            for (const field of allFields) {
                const originalValue = originalData[field];
                const localizedValue = localizedData[field];

                // Check for missing data
                if (originalValue && !localizedValue) {
                    conflicts.push({
                        type: 'missing_data',
                        field: field,
                        severity: 'medium',
                        originalValue: originalValue,
                        message: `Field ${field} missing in localized data`
                    });
                    continue;
                }

                if (!originalValue && localizedValue) {
                    conflicts.push({
                        type: 'extra_data',
                        field: field,
                        severity: 'low',
                        localizedValue: localizedValue,
                        message: `Field ${field} only present in localized data`
                    });
                    continue;
                }

                // Skip if both are missing
                if (!originalValue && !localizedValue) {
                    continue;
                }

                // Check for directional conflicts
                if (this.hasDirectionalConflict(originalValue, localizedValue)) {
                    const conflictMagnitude = Math.abs(
                        (originalValue.change || originalValue) - 
                        (localizedValue.change || localizedValue)
                    );

                    conflicts.push({
                        type: 'directional_conflict',
                        field: field,
                        severity: 'critical',
                        originalValue: originalValue.change || originalValue,
                        localizedValue: localizedValue.change || localizedValue,
                        conflictMagnitude: conflictMagnitude,
                        message: `Directional conflict in ${field}: ${originalValue.change || originalValue} vs ${localizedValue.change || localizedValue}`
                    });
                }

                // Check for unreasonable magnitude differences
                if (this.hasUnreasonableMagnitude(originalValue, localizedValue, field)) {
                    const ratio = this.calculateMagnitudeRatio(originalValue, localizedValue);
                    
                    conflicts.push({
                        type: 'magnitude_unreasonable',
                        field: field,
                        severity: 'high',
                        originalValue: originalValue.median || originalValue.change || originalValue,
                        localizedValue: localizedValue.median || localizedValue.change || localizedValue,
                        magnitudeRatio: ratio,
                        message: `Unreasonable magnitude difference in ${field}: ${ratio}x change`
                    });
                }
            }

            const duration = performance.now() - startTime;
            this.logger.debug(`MultiSourceValidator: Validation completed in ${duration.toFixed(2)}ms, found ${conflicts.length} conflicts`);

            return conflicts;

        } catch (error) {
            this.logger.error('MultiSourceValidator: Error during validation', error);
            return [{
                type: 'validation_error',
                severity: 'critical',
                message: error.message
            }];
        }
    }

    /**
     * Check if two values have directional conflicts
     * @param {Object|Number} original - Original value
     * @param {Object|Number} localized - Localized value
     * @returns {Boolean} True if directional conflict exists
     */
    hasDirectionalConflict(original, localized) {
        try {
            // Extract numeric values
            const origValue = this.extractNumericValue(original);
            const localValue = this.extractNumericValue(localized);

            // Skip if either value is null/undefined
            if (origValue === null || localValue === null) {
                return false;
            }

            // Check for sign differences (positive vs negative)
            const origSign = Math.sign(origValue);
            const localSign = Math.sign(localValue);

            // Conflict if signs are different and both are non-zero
            return origSign !== localSign && origSign !== 0 && localSign !== 0;

        } catch (error) {
            this.logger.warn('MultiSourceValidator: Error checking directional conflict', error);
            return false;
        }
    }

    /**
     * Check if magnitude difference is unreasonable
     * @param {Object|Number} original - Original value
     * @param {Object|Number} localized - Localized value
     * @param {String} field - Field name for context
     * @returns {Boolean} True if magnitude is unreasonable
     */
    hasUnreasonableMagnitude(original, localized, field) {
        try {
            const ratio = this.calculateMagnitudeRatio(original, localized);
            
            if (ratio === null) {
                return false;
            }

            const thresholds = this.magnitudeThresholds[field] || this.magnitudeThresholds.default;
            
            return ratio < thresholds.min || ratio > thresholds.max;

        } catch (error) {
            this.logger.warn('MultiSourceValidator: Error checking magnitude reasonableness', error);
            return false;
        }
    }

    /**
     * Calculate magnitude ratio between two values
     * @param {Object|Number} original - Original value
     * @param {Object|Number} localized - Localized value
     * @returns {Number|null} Magnitude ratio or null if cannot calculate
     */
    calculateMagnitudeRatio(original, localized) {
        try {
            const origValue = Math.abs(this.extractNumericValue(original));
            const localValue = Math.abs(this.extractNumericValue(localized));

            if (origValue === 0 || localValue === 0 || origValue === null || localValue === null) {
                return null;
            }

            return localValue / origValue;

        } catch (error) {
            this.logger.warn('MultiSourceValidator: Error calculating magnitude ratio', error);
            return null;
        }
    }

    /**
     * Extract numeric value from various data structures
     * @param {Object|Number} value - Value to extract from
     * @returns {Number|null} Extracted numeric value
     */
    extractNumericValue(value) {
        if (typeof value === 'number') {
            return value;
        }

        if (typeof value === 'object' && value !== null) {
            // Try common numeric fields
            return value.change || value.median || value.value || value.amount || null;
        }

        return null;
    }

    /**
     * Cross-validate data across multiple sources
     * @param {Array} dataSources - Array of data source objects
     * @returns {Object} Validation result with consensus and conflicts
     */
    async crossValidateData(dataSources) {
        const startTime = performance.now();

        try {
            if (!Array.isArray(dataSources) || dataSources.length === 0) {
                return {
                    consensus: false,
                    conflicts: ['No data sources provided'],
                    confidence: 0
                };
            }

            if (dataSources.length === 1) {
                return {
                    consensus: true,
                    averageValue: this.extractNumericValue(dataSources[0].data),
                    confidence: dataSources[0].data.confidence || 0.5,
                    conflicts: []
                };
            }

            // Extract values and calculate consensus
            const values = dataSources.map(source => ({
                value: this.extractNumericValue(source.data),
                confidence: source.data.confidence || 0.5,
                source: source.source
            })).filter(item => item.value !== null);

            if (values.length === 0) {
                return {
                    consensus: false,
                    conflicts: ['No valid numeric values found'],
                    confidence: 0
                };
            }

            // Calculate average and detect outliers
            const numericValues = values.map(v => v.value);
            const average = numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
            const conflicts = [];

            // Check for conflicts (values that differ significantly from average)
            for (const item of values) {
                const deviation = Math.abs(item.value - average) / Math.abs(average);
                if (deviation > 0.3) { // 30% deviation threshold
                    conflicts.push({
                        type: 'source_conflict',
                        source: item.source,
                        value: item.value,
                        average: average,
                        deviation: deviation,
                        severity: deviation > 0.5 ? 'high' : 'medium'
                    });
                }
            }

            // Calculate overall confidence
            const weightedConfidence = values.reduce((sum, item) => sum + item.confidence, 0) / values.length;
            const consensusConfidence = conflicts.length === 0 ? weightedConfidence : weightedConfidence * 0.7;

            const duration = performance.now() - startTime;
            this.logger.debug(`MultiSourceValidator: Cross-validation completed in ${duration.toFixed(2)}ms`);

            return {
                consensus: conflicts.length === 0,
                averageValue: Math.round(average * 100) / 100,
                confidence: Math.round(consensusConfidence * 100) / 100,
                conflicts: conflicts,
                sourceCount: dataSources.length,
                validValueCount: values.length
            };

        } catch (error) {
            this.logger.error('MultiSourceValidator: Error during cross-validation', error);
            return {
                consensus: false,
                conflicts: [`Validation error: ${error.message}`],
                confidence: 0
            };
        }
    }

    /**
     * Calculate overall confidence based on source reliability
     * @param {Array} sources - Array of source objects with confidence scores
     * @returns {Number} Overall confidence score (0-1)
     */
    calculateOverallConfidence(sources) {
        try {
            if (!Array.isArray(sources) || sources.length === 0) {
                return 0;
            }

            const totalConfidence = sources.reduce((sum, source) => {
                return sum + (source.confidence || 0.5);
            }, 0);

            return Math.min(1.0, totalConfidence / sources.length);

        } catch (error) {
            this.logger.warn('MultiSourceValidator: Error calculating overall confidence', error);
            return 0.5; // Default moderate confidence
        }
    }

    /**
     * Adjust confidence score based on conflicts
     * @param {Number} baseConfidence - Base confidence score
     * @param {Array} conflicts - Array of conflict objects
     * @returns {Number} Adjusted confidence score
     */
    adjustConfidenceForConflicts(baseConfidence, conflicts) {
        try {
            if (!Array.isArray(conflicts) || conflicts.length === 0) {
                return baseConfidence;
            }

            let penalty = 0;
            for (const conflict of conflicts) {
                switch (conflict.severity) {
                    case 'critical':
                        penalty += 0.3;
                        break;
                    case 'high':
                        penalty += 0.2;
                        break;
                    case 'medium':
                        penalty += 0.1;
                        break;
                    case 'low':
                        penalty += 0.05;
                        break;
                    default:
                        penalty += 0.1;
                }
            }

            return Math.max(0, baseConfidence - penalty);

        } catch (error) {
            this.logger.warn('MultiSourceValidator: Error adjusting confidence for conflicts', error);
            return baseConfidence * 0.5; // Conservative fallback
        }
    }
}

module.exports = MultiSourceValidator;