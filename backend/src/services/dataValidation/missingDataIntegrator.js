/**
 * Missing Data Integration System
 * Phase 1 Critical Data Validation Layer - GREEN Phase Implementation
 * 
 * Addresses Critical Issue C2: Missing Critical Data
 * - Identifies missing mortgage rates, cancellation rates, above-list-price sales
 * - Implements fallback data integration strategies
 * - Provides confidence scoring for integrated data
 * - Maintains data quality and localization requirements
 */

const { performance } = require('perf_hooks');

class MissingDataIntegrator {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.fallbackSources = options.fallbackSources || [];
        this.confidenceThreshold = options.confidenceThreshold || 0.6;
        this.version = '1.0.0';
        
        // Critical data fields that must be present
        this.criticalFields = {
            mortgageRates: {
                required: true,
                fallbackValue: null,
                confidence: 0.3,
                sources: ['freddie_mac', 'fannie_mae', 'national_average']
            },
            cancellationRates: {
                required: true,
                fallbackValue: null,
                confidence: 0.4,
                sources: ['Example Company', 'market_data', 'market_average']
            },
            aboveListPriceSales: {
                required: true,
                fallbackValue: null,
                confidence: 0.5,
                sources: ['mls', 'Example Company', 'Competitor One']
            },
            inventoryLevels: {
                required: true,
                fallbackValue: null,
                confidence: 0.6,
                sources: ['market_data', 'Example Company', 'local_mls']
            },
            medianPrice: {
                required: true,
                fallbackValue: null,
                confidence: 0.7,
                sources: ['mls', 'Example Company', 'Competitor One', 'market_data']
            }
        };

        // Fallback data patterns for different markets
        this.fallbackPatterns = {
            mortgageRates: {
                national: 7.2,
                regional: {
                    'california': 7.3,
                    'texas': 7.1,
                    'florida': 7.2,
                    'new_york': 7.4
                }
            },
            cancellationRates: {
                national: 4.2,
                regional: {
                    'california': 5.1,
                    'texas': 3.8,
                    'florida': 4.5,
                    'new_york': 4.9
                }
            },
            aboveListPriceSales: {
                national: 23.5,
                regional: {
                    'california': 31.2,
                    'texas': 18.7,
                    'florida': 25.3,
                    'new_york': 28.9
                }
            }
        };
    }

    /**
     * Identify missing critical data fields
     * @param {Object} data - Data object to analyze
     * @returns {Array} Array of missing field objects
     */
    identifyMissingData(data) {
        const startTime = performance.now();
        const missingFields = [];

        try {
            if (!data || typeof data !== 'object') {
                return Object.keys(this.criticalFields).map(field => ({
                    field,
                    severity: 'critical',
                    message: `Critical field ${field} missing - no data provided`
                }));
            }

            // Check each critical field
            for (const [fieldName, fieldConfig] of Object.entries(this.criticalFields)) {
                const fieldValue = this.extractFieldValue(data, fieldName);
                
                if (this.isFieldMissing(fieldValue)) {
                    missingFields.push({
                        field: fieldName,
                        severity: fieldConfig.required ? 'critical' : 'medium',
                        message: `Critical field ${fieldName} is missing or invalid`,
                        expectedSources: fieldConfig.sources,
                        fallbackAvailable: this.hasFallbackData(fieldName)
                    });
                }
            }

            const duration = performance.now() - startTime;
            this.logger.debug(`MissingDataIntegrator: Missing data identification completed in ${duration.toFixed(2)}ms, found ${missingFields.length} missing fields`);

            return missingFields;

        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error identifying missing data', error);
            return [{
                field: 'unknown',
                severity: 'critical',
                message: `Error during missing data identification: ${error.message}`
            }];
        }
    }

    /**
     * Extract field value from data object
     * @param {Object} data - Data object
     * @param {String} fieldName - Field name to extract
     * @returns {*} Extracted field value
     */
    extractFieldValue(data, fieldName) {
        try {
            // Direct field access
            if (data[fieldName] !== undefined) {
                return data[fieldName];
            }

            // Check common variations
            const variations = this.getFieldVariations(fieldName);
            for (const variation of variations) {
                if (data[variation] !== undefined) {
                    return data[variation];
                }
            }

            // Check nested objects
            if (data.market && data.market[fieldName] !== undefined) {
                return data.market[fieldName];
            }

            if (data.data && data.data[fieldName] !== undefined) {
                return data.data[fieldName];
            }

            return null;

        } catch (error) {
            this.logger.warn('MissingDataIntegrator: Error extracting field value', error);
            return null;
        }
    }

    /**
     * Get field name variations
     * @param {String} fieldName - Original field name
     * @returns {Array} Array of field name variations
     */
    getFieldVariations(fieldName) {
        const variations = [];

        // Convert camelCase to snake_case
        const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
        variations.push(snakeCase);

        // Convert to kebab-case
        const kebabCase = fieldName.replace(/([A-Z])/g, '-$1').toLowerCase();
        variations.push(kebabCase);

        // Add common abbreviations
        const abbreviations = {
            mortgageRates: ['mortgage_rate', 'interest_rate', 'rate'],
            cancellationRates: ['cancellation_rate', 'cancel_rate', 'cancelled'],
            aboveListPriceSales: ['above_list', 'over_asking', 'above_asking'],
            inventoryLevels: ['inventory', 'supply', 'listings'],
            medianPrice: ['median_price', 'price', 'median']
        };

        if (abbreviations[fieldName]) {
            variations.push(...abbreviations[fieldName]);
        }

        return variations;
    }

    /**
     * Check if field is missing or invalid
     * @param {*} value - Field value to check
     * @returns {Boolean} True if field is missing
     */
    isFieldMissing(value) {
        return value === null || 
               value === undefined || 
               value === '' || 
               (typeof value === 'number' && isNaN(value)) ||
               (Array.isArray(value) && value.length === 0) ||
               (typeof value === 'object' && Object.keys(value).length === 0);
    }

    /**
     * Check if fallback data is available for field
     * @param {String} fieldName - Field name
     * @returns {Boolean} True if fallback data available
     */
    hasFallbackData(fieldName) {
        return this.fallbackPatterns[fieldName] !== undefined;
    }

    /**
     * Integrate missing data using fallback strategies
     * @param {Object} data - Original data object
     * @param {String} market - Market identifier for localization
     * @returns {Object} Data with integrated missing fields
     */
    async integrateMissingData(data, market = null) {
        const startTime = performance.now();

        try {
            if (!data || typeof data !== 'object') {
                return {
                    success: false,
                    error: 'Invalid data provided for integration',
                    integratedData: null,
                    integrationLog: []
                };
            }

            const missingFields = this.identifyMissingData(data);
            const integratedData = { ...data };
            const integrationLog = [];

            if (missingFields.length === 0) {
                return {
                    success: true,
                    integratedData,
                    integrationLog: ['No missing data detected'],
                    missingFieldsCount: 0
                };
            }

            // Integrate each missing field
            for (const missingField of missingFields) {
                const integrationResult = await this.integrateSingleField(
                    integratedData, 
                    missingField.field, 
                    market
                );

                if (integrationResult.success) {
                    integratedData[missingField.field] = integrationResult.value;
                    integrationLog.push({
                        field: missingField.field,
                        action: 'integrated',
                        source: integrationResult.source,
                        confidence: integrationResult.confidence,
                        value: integrationResult.value
                    });
                } else {
                    integrationLog.push({
                        field: missingField.field,
                        action: 'failed',
                        error: integrationResult.error
                    });
                }
            }

            // Add integration metadata
            integratedData.metadata = {
                ...integratedData.metadata,
                dataIntegration: {
                    applied: true,
                    missingFieldsCount: missingFields.length,
                    integratedFieldsCount: integrationLog.filter(log => log.action === 'integrated').length,
                    timestamp: new Date().toISOString(),
                    integrationLog
                }
            };

            const duration = performance.now() - startTime;
            this.logger.debug(`MissingDataIntegrator: Integration completed in ${duration.toFixed(2)}ms`);

            return {
                success: true,
                integratedData,
                integrationLog,
                missingFieldsCount: missingFields.length,
                integratedFieldsCount: integrationLog.filter(log => log.action === 'integrated').length
            };

        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error during data integration', error);
            return {
                success: false,
                error: error.message,
                integratedData: data,
                integrationLog: []
            };
        }
    }

    /**
     * Integrate a single missing field
     * @param {Object} data - Data object
     * @param {String} fieldName - Field to integrate
     * @param {String} market - Market identifier
     * @returns {Object} Integration result
     */
    async integrateSingleField(data, fieldName, market) {
        try {
            const fieldConfig = this.criticalFields[fieldName];
            if (!fieldConfig) {
                return {
                    success: false,
                    error: `Unknown field: ${fieldName}`
                };
            }

            // Try fallback sources first
            for (const source of this.fallbackSources) {
                try {
                    const fallbackValue = await this.queryFallbackSource(source, fieldName, market);
                    if (fallbackValue !== null) {
                        return {
                            success: true,
                            value: fallbackValue.value,
                            source: source,
                            confidence: fallbackValue.confidence || 0.5
                        };
                    }
                } catch (error) {
                    this.logger.warn(`MissingDataIntegrator: Fallback source ${source} failed for ${fieldName}`, error);
                }
            }

            // Use pattern-based fallback
            const patternValue = this.getPatternBasedFallback(fieldName, market);
            if (patternValue !== null) {
                return {
                    success: true,
                    value: patternValue.value,
                    source: 'pattern_fallback',
                    confidence: patternValue.confidence
                };
            }

            // Use field configuration fallback
            if (fieldConfig.fallbackValue !== null) {
                return {
                    success: true,
                    value: fieldConfig.fallbackValue,
                    source: 'config_fallback',
                    confidence: fieldConfig.confidence
                };
            }

            return {
                success: false,
                error: `No fallback available for ${fieldName}`
            };

        } catch (error) {
            this.logger.error(`MissingDataIntegrator: Error integrating field ${fieldName}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Query fallback data source
     * @param {String} source - Source identifier
     * @param {String} fieldName - Field name
     * @param {String} market - Market identifier
     * @returns {Object|null} Fallback value or null
     */
    async queryFallbackSource(source, fieldName, market) {
        try {
            // This would typically query external APIs or databases
            // For now, return null to indicate no external sources configured
            this.logger.debug(`MissingDataIntegrator: Querying ${source} for ${fieldName} in market ${market}`);
            return null;

        } catch (error) {
            this.logger.warn(`MissingDataIntegrator: Error querying fallback source ${source}`, error);
            return null;
        }
    }

    /**
     * Get pattern-based fallback value
     * @param {String} fieldName - Field name
     * @param {String} market - Market identifier
     * @returns {Object|null} Fallback value with confidence
     */
    getPatternBasedFallback(fieldName, market) {
        try {
            const pattern = this.fallbackPatterns[fieldName];
            if (!pattern) {
                return null;
            }

            let value = pattern.national;
            let confidence = 0.3; // Low confidence for national averages

            // Try to get regional value if market is provided
            if (market && pattern.regional) {
                const region = this.extractRegionFromMarket(market);
                if (region && pattern.regional[region]) {
                    value = pattern.regional[region];
                    confidence = 0.5; // Higher confidence for regional data
                }
            }

            return {
                value,
                confidence
            };

        } catch (error) {
            this.logger.warn(`MissingDataIntegrator: Error getting pattern-based fallback for ${fieldName}`, error);
            return null;
        }
    }

    /**
     * Extract region from market identifier
     * @param {String} market - Market identifier
     * @returns {String|null} Region identifier
     */
    extractRegionFromMarket(market) {
        try {
            if (!market || typeof market !== 'string') {
                return null;
            }

            const marketLower = market.toLowerCase();

            // Map market names to regions
            const regionMappings = {
                'california': ['los angeles', 'san francisco', 'san diego', 'sacramento', 'fresno'],
                'texas': ['houston', 'dallas', 'austin', 'san antonio', 'fort worth'],
                'florida': ['miami', 'tampa', 'orlando', 'jacksonville', 'fort lauderdale'],
                'new_york': ['new york', 'buffalo', 'rochester', 'syracuse', 'albany']
            };

            for (const [region, cities] of Object.entries(regionMappings)) {
                if (cities.some(city => marketLower.includes(city))) {
                    return region;
                }
            }

            return null;

        } catch (error) {
            this.logger.warn('MissingDataIntegrator: Error extracting region from market', error);
            return null;
        }
    }

    /**
     * Validate integrated data quality
     * @param {Object} originalData - Original data before integration
     * @param {Object} integratedData - Data after integration
     * @returns {Object} Validation result
     */
    validateIntegratedData(originalData, integratedData) {
        const startTime = performance.now();

        try {
            const validation = {
                valid: true,
                issues: [],
                qualityScore: 1.0,
                completeness: 0,
                confidence: 0
            };

            // Check completeness
            const totalFields = Object.keys(this.criticalFields).length;
            let presentFields = 0;
            let totalConfidence = 0;

            for (const fieldName of Object.keys(this.criticalFields)) {
                const value = this.extractFieldValue(integratedData, fieldName);
                if (!this.isFieldMissing(value)) {
                    presentFields++;
                    
                    // Get confidence from integration metadata
                    const integrationLog = integratedData.metadata?.dataIntegration?.integrationLog || [];
                    const fieldLog = integrationLog.find(log => log.field === fieldName);
                    const fieldConfidence = fieldLog?.confidence || 0.8; // Assume high confidence for original data
                    totalConfidence += fieldConfidence;
                }
            }

            validation.completeness = presentFields / totalFields;
            validation.confidence = totalConfidence / totalFields;

            // Check for quality issues
            if (validation.completeness < 0.8) {
                validation.issues.push({
                    type: 'low_completeness',
                    severity: 'medium',
                    message: `Data completeness is ${Math.round(validation.completeness * 100)}%, below 80% threshold`
                });
                validation.qualityScore -= 0.2;
            }

            if (validation.confidence < 0.6) {
                validation.issues.push({
                    type: 'low_confidence',
                    severity: 'medium',
                    message: `Average confidence is ${Math.round(validation.confidence * 100)}%, below 60% threshold`
                });
                validation.qualityScore -= 0.2;
            }

            // Check for unreasonable values
            const unreasonableValues = this.detectUnreasonableValues(integratedData);
            if (unreasonableValues.length > 0) {
                validation.issues.push(...unreasonableValues);
                validation.qualityScore -= unreasonableValues.length * 0.1;
            }

            validation.valid = validation.issues.filter(issue => issue.severity === 'critical').length === 0;
            validation.qualityScore = Math.max(0, validation.qualityScore);

            const duration = performance.now() - startTime;
            this.logger.debug(`MissingDataIntegrator: Validation completed in ${duration.toFixed(2)}ms`);

            return validation;

        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error validating integrated data', error);
            return {
                valid: false,
                issues: [{
                    type: 'validation_error',
                    severity: 'critical',
                    message: error.message
                }],
                qualityScore: 0,
                completeness: 0,
                confidence: 0
            };
        }
    }

    /**
     * Detect unreasonable values in integrated data
     * @param {Object} data - Data to check
     * @returns {Array} Array of unreasonable value issues
     */
    detectUnreasonableValues(data) {
        const issues = [];

        try {
            // Define reasonable ranges for different fields
            const reasonableRanges = {
                mortgageRates: { min: 3.0, max: 15.0 },
                cancellationRates: { min: 0.0, max: 20.0 },
                aboveListPriceSales: { min: 0.0, max: 80.0 },
                inventoryLevels: { min: 0.1, max: 12.0 },
                medianPrice: { min: 50000, max: 5000000 }
            };

            for (const [fieldName, range] of Object.entries(reasonableRanges)) {
                const value = this.extractFieldValue(data, fieldName);
                
                if (value !== null && typeof value === 'number') {
                    if (value < range.min || value > range.max) {
                        issues.push({
                            type: 'unreasonable_value',
                            severity: 'medium',
                            field: fieldName,
                            value: value,
                            expectedRange: range,
                            message: `${fieldName} value ${value} is outside reasonable range ${range.min}-${range.max}`
                        });
                    }
                }
            }

            return issues;

        } catch (error) {
            this.logger.warn('MissingDataIntegrator: Error detecting unreasonable values', error);
            return [];
        }
    }

    /**
     * Generate integration summary report
     * @param {Object} integrationResult - Result from integrateMissingData
     * @returns {Object} Summary report
     */
    generateIntegrationSummary(integrationResult) {
        try {
            const summary = {
                totalFields: Object.keys(this.criticalFields).length,
                missingFields: integrationResult.missingFieldsCount || 0,
                integratedFields: integrationResult.integratedFieldsCount || 0,
                integrationRate: 0,
                qualityAssessment: 'unknown',
                recommendations: []
            };

            if (summary.missingFields > 0) {
                summary.integrationRate = summary.integratedFields / summary.missingFields;
            } else {
                summary.integrationRate = 1.0;
            }

            // Quality assessment
            if (summary.integrationRate >= 0.9) {
                summary.qualityAssessment = 'excellent';
            } else if (summary.integrationRate >= 0.7) {
                summary.qualityAssessment = 'good';
            } else if (summary.integrationRate >= 0.5) {
                summary.qualityAssessment = 'fair';
            } else {
                summary.qualityAssessment = 'poor';
            }

            // Generate recommendations
            if (summary.integrationRate < 0.8) {
                summary.recommendations.push('Consider adding more fallback data sources');
            }

            if (summary.missingFields > summary.totalFields * 0.3) {
                summary.recommendations.push('Review data collection processes for completeness');
            }

            const integrationLog = integrationResult.integrationLog || [];
            const lowConfidenceFields = integrationLog.filter(log => log.confidence && log.confidence < 0.5);
            if (lowConfidenceFields.length > 0) {
                summary.recommendations.push('Validate low-confidence integrated fields manually');
            }

            return summary;

        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error generating integration summary', error);
            return {
                totalFields: 0,
                missingFields: 0,
                integratedFields: 0,
                integrationRate: 0,
                qualityAssessment: 'error',
                recommendations: ['Error generating summary - review integration process']
            };
        }
    }

    /**
     * Integrate market-specific data for missing fields
     * @param {Object} incompleteData - Data with missing fields
     * @param {Array} requiredFields - List of required field names
     * @returns {Object} Data with integrated market-specific values
     */
    async integrateMarketSpecificData(incompleteData, requiredFields) {
        try {
            this.logger.info('MissingDataIntegrator: Starting market-specific data integration', {
                market: incompleteData.market,
                requiredFields,
                missingFieldCount: requiredFields.length
            });

            const integratedData = { ...incompleteData };
            const integrationLog = [];
            let successCount = 0;

            // Process each required field
            for (const fieldName of requiredFields) {
                try {
                    let fieldData = null;
                    let confidence = 0;

                    // Try to get data from external sources first
                    switch (fieldName) {
                        case 'mortgageRates':
                            if (this.dataSources.fredAPI) {
                                const mortgageData = await this.dataSources.fredAPI.getMortgageRates();
                                if (mortgageData && mortgageData.current) {
                                    fieldData = {
                                        current: mortgageData.current,
                                        trend: mortgageData.trend || 'stable',
                                        lastUpdated: new Date().toISOString()
                                    };
                                    confidence = mortgageData.confidence || 0.9;
                                }
                            }
                            break;

                        case 'cancellationRates':
                            if (this.dataSources.mlsAPI) {
                                const cancellationData = await this.dataSources.mlsAPI.getCancellationRates();
                                if (cancellationData && cancellationData.current) {
                                    fieldData = {
                                        current: cancellationData.current,
                                        marketAverage: cancellationData.marketAverage || cancellationData.current,
                                        lastUpdated: new Date().toISOString()
                                    };
                                    confidence = cancellationData.confidence || 0.8;
                                }
                            }
                            break;

                        case 'aboveListPriceSales':
                            if (this.dataSources.mlsAPI) {
                                const aboveListData = await this.dataSources.mlsAPI.getAboveListSales();
                                if (aboveListData && aboveListData.percentage) {
                                    fieldData = {
                                        percentage: aboveListData.percentage,
                                        trend: aboveListData.trend || 'stable',
                                        lastUpdated: new Date().toISOString()
                                    };
                                    confidence = aboveListData.confidence || 0.85;
                                }
                            }
                            break;

                        default:
                            // Try fallback sources for other fields
                            const fallbackResult = await this.queryFallbackSource('external', fieldName, incompleteData.market);
                            if (fallbackResult) {
                                fieldData = fallbackResult.value;
                                confidence = fallbackResult.confidence;
                            }
                            break;
                    }

                    // If external source failed, try pattern-based fallback
                    if (!fieldData) {
                        const patternFallback = this.getPatternBasedFallback(fieldName, incompleteData.market);
                        if (patternFallback) {
                            fieldData = patternFallback.value;
                            confidence = patternFallback.confidence;
                        }
                    }

                    // Add the integrated data
                    if (fieldData) {
                        integratedData[fieldName] = fieldData;
                        successCount++;

                        integrationLog.push({
                            field: fieldName,
                            status: 'integrated',
                            confidence,
                            source: confidence > 0.7 ? 'external' : 'fallback',
                            timestamp: new Date().toISOString()
                        });

                        this.logger.debug(`MissingDataIntegrator: Successfully integrated ${fieldName}`, {
                            confidence,
                            source: confidence > 0.7 ? 'external' : 'fallback'
                        });
                    } else {
                        integrationLog.push({
                            field: fieldName,
                            status: 'failed',
                            confidence: 0,
                            source: 'none',
                            timestamp: new Date().toISOString()
                        });

                        this.logger.warn(`MissingDataIntegrator: Failed to integrate ${fieldName} for market ${incompleteData.market}`);
                    }

                } catch (fieldError) {
                    this.logger.error(`MissingDataIntegrator: Error integrating field ${fieldName}`, fieldError);
                    integrationLog.push({
                        field: fieldName,
                        status: 'error',
                        confidence: 0,
                        source: 'none',
                        error: fieldError.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }

            // Add integration metadata
            integratedData._integration = {
                totalFields: requiredFields.length,
                integratedFields: successCount,
                integrationRate: successCount / requiredFields.length,
                integrationLog,
                timestamp: new Date().toISOString()
            };

            this.logger.info('MissingDataIntegrator: Market-specific integration completed', {
                market: incompleteData.market,
                totalFields: requiredFields.length,
                integratedFields: successCount,
                integrationRate: successCount / requiredFields.length
            });

            return integratedData;

        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error in market-specific data integration', error);
            throw new Error(`Market-specific data integration failed: ${error.message}`);
        }
    }

    /**
     * Prioritize missing data by market impact
     * @param {Object} marketData - Market data with missing fields
     * @param {Array} criticalFields - List of critical field names
     * @returns {Array} Prioritized missing data list
     */
    prioritizeMissingData(marketData, criticalFields) {
        try {
            const missingFields = [];
            
            criticalFields.forEach(field => {
                if (!marketData[field] || marketData[field] === null || marketData[field] === undefined) {
                    let priority = 'medium';
                    let impact = 'medium';
                    
                    // Determine priority based on field importance
                    switch (field) {
                        case 'price':
                        case 'inventory':
                            priority = 'critical';
                            impact = 'high';
                            break;
                        case 'mortgageRates':
                        case 'marketTrends':
                            priority = 'high';
                            impact = 'high';
                            break;
                        case 'cancellationRates':
                        case 'aboveListPriceSales':
                            priority = 'medium';
                            impact = 'medium';
                            break;
                        default:
                            priority = 'low';
                            impact = 'low';
                    }
                    
                    missingFields.push({
                        field,
                        priority,
                        impact
                    });
                }
            });
            
            // Sort by priority (critical > high > medium > low)
            const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
            return missingFields.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
            
        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error prioritizing missing data', error);
            return [];
        }
    }

    /**
     * Integrate data with fallback strategies
     * @param {Object} incompleteData - Data with missing fields
     * @param {String} fieldName - Field to integrate
     * @returns {Object} Data with integrated field
     */
    async integrateWithFallback(incompleteData, fieldName) {
        try {
            const result = { ...incompleteData };
            
            // Try regional interpolation first
            const regionalData = await this.getRegionalInterpolation(incompleteData.market, fieldName);
            if (regionalData) {
                result[fieldName] = {
                    ...regionalData,
                    source: 'regional_interpolation',
                    confidence: 0.7
                };
                return result;
            }
            
            // Fall back to pattern-based data
            const patternData = this.getPatternBasedFallback(fieldName, incompleteData.market);
            if (patternData) {
                result[fieldName] = {
                    value: patternData.value,
                    source: 'pattern_based',
                    confidence: patternData.confidence
                };
            }
            
            return result;
            
        } catch (error) {
            this.logger.error(`MissingDataIntegrator: Error in fallback integration for ${fieldName}`, error);
            return incompleteData;
        }
    }

    /**
     * Get regional interpolation data
     * @param {String} market - Market identifier
     * @param {String} fieldName - Field name
     * @returns {Object|null} Regional interpolation data
     */
    async getRegionalInterpolation(market, fieldName) {
        try {
            const region = this.extractRegionFromMarket(market);
            if (!region) return null;
            
            // Mock regional data - in real implementation, this would query regional databases
            const regionalData = {
                'california': {
                    'mortgageRates': { current: 7.1, trend: 'stable' },
                    'cancellationRates': { current: 4.5, trend: 'decreasing' }
                },
                'texas': {
                    'mortgageRates': { current: 6.9, trend: 'increasing' },
                    'cancellationRates': { current: 3.8, trend: 'stable' }
                }
            };
            
            return regionalData[region]?.[fieldName] || null;
            
        } catch (error) {
            this.logger.warn(`MissingDataIntegrator: Error getting regional interpolation for ${fieldName}`, error);
            return null;
        }
    }

    /**
     * Integrate with national fallback data
     * @param {Object} incompleteData - Data with missing fields
     * @param {String} fieldName - Field to integrate
     * @param {Object} nationalData - National fallback data
     * @returns {Object} Data with integrated field
     */
    async integrateWithNationalFallback(incompleteData, fieldName, nationalData) {
        try {
            const result = { ...incompleteData };
            
            if (nationalData && nationalData[fieldName]) {
                result[fieldName] = {
                    ...nationalData[fieldName],
                    source: 'national_fallback',
                    confidence: 0.4, // Lower confidence for national data
                    confidencePenalty: 0.3
                };
            }
            
            return result;
            
        } catch (error) {
            this.logger.error(`MissingDataIntegrator: Error in national fallback integration for ${fieldName}`, error);
            return incompleteData;
        }
    }

    /**
     * Interpolate missing data from similar markets
     * @param {String} targetMarket - Target market identifier
     * @param {String} fieldName - Field to interpolate
     * @param {Array} similarMarkets - Array of similar market data
     * @returns {Object|null} Interpolated data
     */
    interpolateFromSimilarMarkets(targetMarket, fieldName, similarMarkets) {
        try {
            if (!similarMarkets || similarMarkets.length === 0) return null;
            
            const validMarkets = similarMarkets.filter(market =>
                market[fieldName] && typeof market[fieldName] === 'object'
            );
            
            if (validMarkets.length === 0) return null;
            
            // Calculate weighted average based on similarity scores
            let totalWeight = 0;
            let weightedSum = 0;
            
            validMarkets.forEach(market => {
                const weight = market.similarityScore || 0.5;
                const value = typeof market[fieldName].current === 'number'
                    ? market[fieldName].current
                    : market[fieldName].value || 0;
                
                weightedSum += value * weight;
                totalWeight += weight;
            });
            
            if (totalWeight === 0) return null;
            
            const interpolatedValue = weightedSum / totalWeight;
            
            return {
                current: interpolatedValue,
                source: 'similar_markets_interpolation',
                confidence: Math.min(totalWeight / validMarkets.length, 0.8),
                contributingMarkets: validMarkets.length
            };
            
        } catch (error) {
            this.logger.error(`MissingDataIntegrator: Error interpolating from similar markets for ${fieldName}`, error);
            return null;
        }
    }

    /**
     * Validate integrated data quality
     * @param {Object} integratedData - Data after integration
     * @returns {Object} Quality validation report
     */
    validateIntegratedDataQuality(integratedData) {
        try {
            const report = {
                overallQuality: 'good',
                fieldQuality: {},
                issues: [],
                recommendations: []
            };
            
            let totalConfidence = 0;
            let fieldCount = 0;
            
            Object.keys(integratedData).forEach(field => {
                if (field.startsWith('_') || field === 'market') return; // Skip metadata
                
                const fieldData = integratedData[field];
                if (fieldData && typeof fieldData === 'object' && fieldData.confidence !== undefined) {
                    const confidence = fieldData.confidence;
                    totalConfidence += confidence;
                    fieldCount++;
                    
                    let quality = 'good';
                    if (confidence < 0.3) {
                        quality = 'poor';
                        report.issues.push(`Low confidence for ${field}: ${confidence}`);
                    } else if (confidence < 0.6) {
                        quality = 'medium';
                    }
                    
                    report.fieldQuality[field] = {
                        quality,
                        confidence,
                        source: fieldData.source || 'unknown'
                    };
                }
            });
            
            // Calculate overall quality
            if (fieldCount > 0) {
                const avgConfidence = totalConfidence / fieldCount;
                if (avgConfidence < 0.4) {
                    report.overallQuality = 'poor';
                    report.recommendations.push('Consider manual data verification');
                } else if (avgConfidence < 0.7) {
                    report.overallQuality = 'medium';
                    report.recommendations.push('Review low-confidence fields');
                }
            }
            
            return report;
            
        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error validating integrated data quality', error);
            return {
                overallQuality: 'error',
                fieldQuality: {},
                issues: ['Error during quality validation'],
                recommendations: ['Manual review required']
            };
        }
    }

    /**
     * Detect anomalies in integrated data
     * @param {Object} integratedData - Data after integration
     * @returns {Array} Array of detected anomalies
     */
    detectIntegratedDataAnomalies(integratedData) {
        try {
            const anomalies = [];
            
            Object.keys(integratedData).forEach(field => {
                if (field.startsWith('_') || field === 'market') return;
                
                const fieldData = integratedData[field];
                if (fieldData && typeof fieldData === 'object') {
                    // Check for unreasonable values
                    if (field === 'mortgageRates' && fieldData.current) {
                        if (fieldData.current > 15 || fieldData.current < 1) {
                            anomalies.push({
                                field,
                                type: 'unreasonable_value',
                                value: fieldData.current,
                                expected: 'between 1% and 15%',
                                severity: 'high'
                            });
                        }
                    }
                    
                    if (field === 'cancellationRates' && fieldData.current) {
                        if (fieldData.current > 20 || fieldData.current < 0) {
                            anomalies.push({
                                field,
                                type: 'unreasonable_value',
                                value: fieldData.current,
                                expected: 'between 0% and 20%',
                                severity: 'high'
                            });
                        }
                    }
                    
                    // Check for very low confidence
                    if (fieldData.confidence && fieldData.confidence < 0.2) {
                        anomalies.push({
                            field,
                            type: 'low_confidence',
                            confidence: fieldData.confidence,
                            severity: 'medium'
                        });
                    }
                }
            });
            
            return anomalies;
            
        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error detecting integrated data anomalies', error);
            return [];
        }
    }

    /**
     * Enhance extractor output with missing data integration
     * @param {Object} extractorOutput - Output from ComprehensiveDataExtractor
     * @param {Array} requiredFields - List of required field names
     * @returns {Object} Enhanced data with integrated missing fields
     */
    async enhanceExtractorOutput(extractorOutput, requiredFields) {
        try {
            this.logger.info('MissingDataIntegrator: Enhancing extractor output', {
                market: extractorOutput.market,
                requiredFields
            });
            
            const enhancedData = { ...extractorOutput };
            const integrationLog = [];
            
            for (const fieldName of requiredFields) {
                if (!enhancedData[fieldName] || this.isFieldIncomplete(enhancedData[fieldName])) {
                    try {
                        const integratedField = await this.integrateMarketSpecificData(
                            { market: extractorOutput.market },
                            [fieldName]
                        );
                        
                        if (integratedField[fieldName]) {
                            enhancedData[fieldName] = integratedField[fieldName];
                            integrationLog.push({
                                field: fieldName,
                                status: 'enhanced',
                                source: integratedField[fieldName].source || 'integration',
                                confidence: integratedField[fieldName].confidence || 0.5
                            });
                        }
                    } catch (fieldError) {
                        this.logger.warn(`MissingDataIntegrator: Failed to enhance ${fieldName}`, fieldError);
                        integrationLog.push({
                            field: fieldName,
                            status: 'failed',
                            error: fieldError.message
                        });
                    }
                }
            }
            
            // Add enhancement metadata
            enhancedData._enhancement = {
                originalFields: Object.keys(extractorOutput).length,
                enhancedFields: integrationLog.filter(log => log.status === 'enhanced').length,
                integrationLog,
                timestamp: new Date().toISOString()
            };
            
            return enhancedData;
            
        } catch (error) {
            this.logger.error('MissingDataIntegrator: Error enhancing extractor output', error);
            throw new Error(`Extractor output enhancement failed: ${error.message}`);
        }
    }

    /**
     * Check if a field is incomplete
     * @param {*} fieldValue - Field value to check
     * @returns {Boolean} True if field is incomplete
     */
    isFieldIncomplete(fieldValue) {
        if (fieldValue === null || fieldValue === undefined) return true;
        if (typeof fieldValue === 'string' && fieldValue.trim() === '') return true;
        if (typeof fieldValue === 'object' && Object.keys(fieldValue).length === 0) return true;
        if (Array.isArray(fieldValue) && fieldValue.length === 0) return true;
        return false;
    }
}

module.exports = MissingDataIntegrator;