/**
 * Enhanced Market Data Service
 * Provides market-specific data with comprehensive breakdowns for quality framework enhancement
 * 
 * Features:
 * - Market-specific data loading with caching
 * - JSON schema validation for data integrity
 * - Integration with existing quality framework
 * - Performance optimization with lazy loading
 * - Comprehensive error handling and logging
 */

const fs = require('fs').promises;
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class EnhancedMarketDataService {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.marketDataCache = new Map();
        this.validationCache = new Map();
        this.cacheTimeout = options.cacheTimeout || 3600000; // 1 hour
        this.maxCacheSize = options.maxCacheSize || 50; // Maximum 50 markets in cache
        
        // Data paths - adjust for backend working directory
        const projectRoot = path.resolve(process.cwd(), '..');
        this.enhancedDataPath = path.join(projectRoot, 'data', 'enhanced-market-data');
        this.marketsPath = path.join(this.enhancedDataPath, 'markets');
        this.schemasPath = path.join(this.enhancedDataPath, 'schemas');
        
        // JSON Schema validator
        this.ajv = new Ajv({ allErrors: true });
        addFormats(this.ajv);
        
        // Performance metrics
        this.performanceMetrics = {
            cacheHits: 0,
            cacheMisses: 0,
            dataLoads: 0,
            validationChecks: 0,
            averageLoadTime: 0,
            loadTimes: []
        };
        
        // Initialize schemas
        this.schemas = {};
        this.initialized = false;
    }

    /**
     * Initialize the service by loading JSON schemas
     */
    async initialize() {
        try {
            const startTime = Date.now();
            
            // Load market data schema
            const marketSchemaPath = path.join(this.schemasPath, 'market-data-schema.json');
            const marketSchemaContent = await fs.readFile(marketSchemaPath, 'utf8');
            this.schemas.marketData = JSON.parse(marketSchemaContent);
            this.ajv.addSchema(this.schemas.marketData, 'marketData');
            
            // Load validation schema
            const validationSchemaPath = path.join(this.schemasPath, 'validation-schema.json');
            const validationSchemaContent = await fs.readFile(validationSchemaPath, 'utf8');
            this.schemas.validation = JSON.parse(validationSchemaContent);
            this.ajv.addSchema(this.schemas.validation, 'validation');
            
            this.initialized = true;
            const initTime = Date.now() - startTime;
            
            this.logger.info('EnhancedMarketDataService initialized successfully', {
                initializationTime: initTime,
                schemasLoaded: Object.keys(this.schemas).length
            });
            
        } catch (error) {
            this.logger.error('Failed to initialize EnhancedMarketDataService', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get comprehensive market-specific data for a given market
     * @param {string} marketName - Full market name (e.g., "Los Angeles-Long Beach-Anaheim")
     * @param {Array} categories - Data categories to load ['all'] or specific categories
     * @returns {Object} Market-specific data object
     */
    async getMarketSpecificData(marketName, categories = ['all']) {
        if (!this.initialized) {
            await this.initialize();
        }

        const startTime = Date.now();
        const cacheKey = `${marketName}_${categories.join('_')}`;
        
        // Check cache first
        if (this.marketDataCache.has(cacheKey)) {
            const cached = this.marketDataCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                this.performanceMetrics.cacheHits++;
                this.logger.debug('Market data cache hit', { marketName, cacheKey });
                return cached.data;
            } else {
                // Remove expired cache entry
                this.marketDataCache.delete(cacheKey);
            }
        }

        this.performanceMetrics.cacheMisses++;
        this.performanceMetrics.dataLoads++;

        try {
            // Load market data from file system
            const marketData = await this._loadMarketData(marketName, categories);
            
            // Validate data integrity
            const validation = await this._validateMarketData(marketData);
            if (!validation.isValid) {
                throw new Error(`Invalid market data for ${marketName}: ${validation.errors.join(', ')}`);
            }

            // Cache the result with LRU eviction
            this._cacheMarketData(cacheKey, marketData);

            const loadTime = Date.now() - startTime;
            this._updatePerformanceMetrics(loadTime);

            this.logger.info('Market data loaded successfully', {
                marketName,
                categories,
                loadTime,
                cacheSize: this.marketDataCache.size,
                validation: validation.score
            });

            return marketData;

        } catch (error) {
            this.logger.error('Failed to load market data', {
                marketName,
                categories,
                error: error.message,
                loadTime: Date.now() - startTime
            });
            throw error;
        }
    }

    /**
     * Get validation baselines for market-specific quality assessment
     * @param {string} marketName - Market name
     * @returns {Object} Validation baselines and rules
     */
    async getValidationBaselines(marketName) {
        const cacheKey = `validation_${marketName}`;
        
        // Check validation cache
        if (this.validationCache.has(cacheKey)) {
            const cached = this.validationCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        try {
            const marketDir = this._getMarketDirectory(marketName);
            const validationPath = path.join(marketDir, 'validation-baselines.json');
            
            const validationContent = await fs.readFile(validationPath, 'utf8');
            const validationData = JSON.parse(validationContent);
            
            // Validate against schema
            const isValid = this.ajv.validate('validation', validationData);
            if (!isValid) {
                throw new Error(`Invalid validation data: ${this.ajv.errorsText()}`);
            }

            // Cache validation data
            this.validationCache.set(cacheKey, {
                data: validationData,
                timestamp: Date.now()
            });

            this.performanceMetrics.validationChecks++;
            
            return validationData;

        } catch (error) {
            this.logger.error('Failed to load validation baselines', {
                marketName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get available markets with enhanced data
     * @returns {Array} List of markets with enhanced data available
     */
    async getAvailableMarkets() {
        try {
            const marketDirs = await fs.readdir(this.marketsPath);
            const availableMarkets = [];

            for (const dir of marketDirs) {
                const marketDir = path.join(this.marketsPath, dir);
                const stats = await fs.stat(marketDir);
                
                if (stats.isDirectory()) {
                    // Check if market profile exists
                    const profilePath = path.join(marketDir, 'market-profile.json');
                    try {
                        await fs.access(profilePath);
                        
                        // Load basic market info
                        const profileContent = await fs.readFile(profilePath, 'utf8');
                        const profile = JSON.parse(profileContent);
                        
                        availableMarkets.push({
                            name: profile.marketInfo.name,
                            code: profile.marketInfo.code,
                            directory: dir,
                            lastUpdated: profile.marketInfo.lastUpdated
                        });
                    } catch (err) {
                        this.logger.warn('Market directory missing profile', { directory: dir });
                    }
                }
            }

            return availableMarkets;

        } catch (error) {
            this.logger.error('Failed to get available markets', {
                error: error.message
            });
            return [];
        }
    }

    /**
     * Validate market-specific content against baselines
     * @param {string} content - Content to validate
     * @param {string} marketName - Market name for validation rules
     * @returns {Object} Validation results with scores and suggestions
     */
    async validateMarketContent(content, marketName) {
        try {
            const baselines = await this.getValidationBaselines(marketName);
            const marketData = await this.getMarketSpecificData(marketName);
            
            const validation = {
                marketName,
                timestamp: new Date().toISOString(),
                scores: {},
                suggestions: [],
                overallScore: 0
            };

            // Validate neighborhood mentions
            validation.scores.neighborhoodRelevance = this._validateNeighborhoodMentions(
                content, 
                marketData.neighborhoods, 
                baselines.marketSpecificRules.requiredNeighborhoods
            );

            // Validate economic context
            validation.scores.economicAccuracy = this._validateEconomicReferences(
                content,
                marketData.economicIndicators,
                baselines.marketSpecificRules.keyEconomicIndicators
            );

            // Validate cultural context
            validation.scores.culturalRelevance = this._validateCulturalReferences(
                content,
                baselines.marketSpecificRules.culturalReferences
            );

            // Validate housing market data
            validation.scores.housingDataAccuracy = this._validateHousingDataReferences(
                content,
                marketData.housingMarket
            );

            // Calculate overall score
            validation.overallScore = this._calculateOverallValidationScore(validation.scores);
            
            // Generate suggestions
            validation.suggestions = this._generateValidationSuggestions(
                validation.scores, 
                baselines, 
                marketData
            );

            return validation;

        } catch (error) {
            this.logger.error('Market content validation failed', {
                marketName,
                error: error.message
            });
            
            return {
                marketName,
                error: error.message,
                overallScore: 0,
                scores: {},
                suggestions: ['Unable to validate due to data loading error']
            };
        }
    }

    /**
     * Get performance metrics for monitoring
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        const totalRequests = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
        const cacheHitRate = totalRequests > 0 ? this.performanceMetrics.cacheHits / totalRequests : 0;
        
        return {
            ...this.performanceMetrics,
            cacheHitRate: Math.round(cacheHitRate * 100) / 100,
            cacheSize: this.marketDataCache.size,
            validationCacheSize: this.validationCache.size,
            averageLoadTime: this.performanceMetrics.loadTimes.length > 0
                ? this.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / this.performanceMetrics.loadTimes.length
                : 0
        };
    }

    /**
     * Clear all caches (useful for testing or data updates)
     */
    clearCache() {
        this.marketDataCache.clear();
        this.validationCache.clear();
        this.logger.info('Enhanced market data caches cleared');
    }

    // Private methods

    /**
     * Load market data from file system
     * @private
     */
    async _loadMarketData(marketName, categories) {
        const marketDir = this._getMarketDirectory(marketName);
        
        // Load market profile (always required)
        const profilePath = path.join(marketDir, 'market-profile.json');
        const profileContent = await fs.readFile(profilePath, 'utf8');
        const marketData = JSON.parse(profileContent);

        // Load validation baselines if requested
        if (categories.includes('all') || categories.includes('validation')) {
            try {
                const validationPath = path.join(marketDir, 'validation-baselines.json');
                const validationContent = await fs.readFile(validationPath, 'utf8');
                marketData.validationBaselines = JSON.parse(validationContent);
            } catch (error) {
                this.logger.warn('Validation baselines not found', { marketName });
            }
        }

        return marketData;
    }

    /**
     * Validate market data against JSON schema
     * @private
     */
    async _validateMarketData(marketData) {
        this.performanceMetrics.validationChecks++;
        
        const isValid = this.ajv.validate('marketData', marketData);
        
        if (isValid) {
            return {
                isValid: true,
                score: 1.0,
                errors: []
            };
        } else {
            return {
                isValid: false,
                score: 0.0,
                errors: this.ajv.errors.map(err => `${err.instancePath}: ${err.message}`)
            };
        }
    }

    /**
     * Get market directory path from market name
     * @private
     */
    _getMarketDirectory(marketName) {
        // Convert market name to directory name (lowercase, hyphens)
        const dirName = marketName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        return path.join(this.marketsPath, dirName);
    }

    /**
     * Cache market data with LRU eviction
     * @private
     */
    _cacheMarketData(cacheKey, marketData) {
        // Implement LRU eviction if cache is full
        if (this.marketDataCache.size >= this.maxCacheSize) {
            const oldestKey = this.marketDataCache.keys().next().value;
            this.marketDataCache.delete(oldestKey);
        }

        this.marketDataCache.set(cacheKey, {
            data: marketData,
            timestamp: Date.now()
        });
    }

    /**
     * Update performance metrics
     * @private
     */
    _updatePerformanceMetrics(loadTime) {
        this.performanceMetrics.loadTimes.push(loadTime);
        
        // Keep only last 100 measurements
        if (this.performanceMetrics.loadTimes.length > 100) {
            this.performanceMetrics.loadTimes.shift();
        }
        
        // Update average
        this.performanceMetrics.averageLoadTime = 
            this.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / 
            this.performanceMetrics.loadTimes.length;
    }

    /**
     * Validate neighborhood mentions in content
     * @private
     */
    _validateNeighborhoodMentions(content, neighborhoods, requiredNeighborhoods) {
        const mentionedNeighborhoods = [];
        const allNeighborhoods = neighborhoods.submarkets.map(n => n.name);
        
        // Check for neighborhood mentions
        for (const neighborhood of allNeighborhoods) {
            if (content.toLowerCase().includes(neighborhood.toLowerCase())) {
                mentionedNeighborhoods.push(neighborhood);
            }
        }

        // Check required neighborhoods
        const requiredMentioned = requiredNeighborhoods.filter(req => 
            mentionedNeighborhoods.some(mentioned => 
                mentioned.toLowerCase().includes(req.toLowerCase())
            )
        );

        const score = requiredMentioned.length / requiredNeighborhoods.length;
        
        return {
            score: Math.round(score * 100) / 100,
            mentionedNeighborhoods,
            requiredMentioned,
            missing: requiredNeighborhoods.filter(req => !requiredMentioned.includes(req))
        };
    }

    /**
     * Validate economic references in content
     * @private
     */
    _validateEconomicReferences(content, economicData, keyIndicators) {
        const foundIndicators = [];
        const contentLower = content.toLowerCase();
        
        // Check for key economic indicators
        for (const indicator of keyIndicators) {
            const indicatorTerms = indicator.split('_');
            const found = indicatorTerms.some(term => contentLower.includes(term));
            if (found) {
                foundIndicators.push(indicator);
            }
        }

        // Check for specific economic data mentions
        const economicMentions = {
            unemployment: contentLower.includes('unemployment') || contentLower.includes('jobless'),
            employment: contentLower.includes('employment') || contentLower.includes('jobs'),
            growth: contentLower.includes('growth') || contentLower.includes('expansion'),
            industry: economicData.employment.majorIndustries.some(ind => 
                contentLower.includes(ind.sector.toLowerCase())
            )
        };

        const economicScore = Object.values(economicMentions).filter(Boolean).length / 
                            Object.keys(economicMentions).length;
        const indicatorScore = foundIndicators.length / keyIndicators.length;
        
        return {
            score: Math.round(((economicScore + indicatorScore) / 2) * 100) / 100,
            foundIndicators,
            economicMentions,
            industryMentions: economicData.employment.majorIndustries.filter(ind =>
                contentLower.includes(ind.sector.toLowerCase())
            )
        };
    }

    /**
     * Validate cultural references in content
     * @private
     */
    _validateCulturalReferences(content, culturalReferences) {
        const foundReferences = [];
        const contentLower = content.toLowerCase();
        
        for (const reference of culturalReferences) {
            const referenceTerms = reference.split('_');
            const found = referenceTerms.some(term => contentLower.includes(term));
            if (found) {
                foundReferences.push(reference);
            }
        }

        const score = foundReferences.length / culturalReferences.length;
        
        return {
            score: Math.round(score * 100) / 100,
            foundReferences,
            missing: culturalReferences.filter(ref => !foundReferences.includes(ref))
        };
    }

    /**
     * Validate housing market data references
     * @private
     */
    _validateHousingDataReferences(content, housingMarket) {
        const contentLower = content.toLowerCase();
        const validations = {
            priceReferences: contentLower.includes('price') || contentLower.includes('cost'),
            inventoryReferences: contentLower.includes('inventory') || contentLower.includes('supply'),
            marketActivity: contentLower.includes('sales') || contentLower.includes('volume'),
            marketTrends: contentLower.includes('trend') || contentLower.includes('direction')
        };

        // Check for specific price ranges
        const priceRangeCheck = this._checkPriceRangeAccuracy(content, housingMarket.pricing);
        
        const baseScore = Object.values(validations).filter(Boolean).length / 
                         Object.keys(validations).length;
        const finalScore = (baseScore + priceRangeCheck.accuracy) / 2;

        return {
            score: Math.round(finalScore * 100) / 100,
            validations,
            priceRangeAccuracy: priceRangeCheck,
            suggestions: this._generateHousingDataSuggestions(validations, priceRangeCheck)
        };
    }

    /**
     * Check price range accuracy in content
     * @private
     */
    _checkPriceRangeAccuracy(content, pricingData) {
        const priceRegex = /\$[\d,]+/g;
        const prices = content.match(priceRegex);
        
        if (!prices || prices.length === 0) {
            return { accuracy: 0, foundPrices: [], withinRange: false };
        }

        const numericPrices = prices.map(p => 
            parseInt(p.replace(/[$,]/g, ''))
        ).filter(p => !isNaN(p) && p > 10000); // Filter out small numbers

        const medianPrice = pricingData.medianSalePrice;
        const variance = medianPrice * 0.3; // 30% variance allowed
        
        const withinRange = numericPrices.some(price => 
            Math.abs(price - medianPrice) <= variance
        );

        return {
            accuracy: withinRange ? 1.0 : 0.5,
            foundPrices: numericPrices,
            withinRange,
            expectedRange: {
                min: medianPrice - variance,
                max: medianPrice + variance
            }
        };
    }

    /**
     * Calculate overall validation score
     * @private
     */
    _calculateOverallValidationScore(scores) {
        const weights = {
            neighborhoodRelevance: 0.30,
            economicAccuracy: 0.25,
            culturalRelevance: 0.20,
            housingDataAccuracy: 0.25
        };

        let weightedSum = 0;
        let totalWeight = 0;

        for (const [category, score] of Object.entries(scores)) {
            if (weights[category] && typeof score.score === 'number') {
                weightedSum += score.score * weights[category];
                totalWeight += weights[category];
            }
        }

        return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
    }

    /**
     * Generate validation suggestions
     * @private
     */
    _generateValidationSuggestions(scores, baselines, marketData) {
        const suggestions = [];

        // Neighborhood suggestions
        if (scores.neighborhoodRelevance && scores.neighborhoodRelevance.score < 0.7) {
            suggestions.push(`Consider mentioning key neighborhoods: ${scores.neighborhoodRelevance.missing.join(', ')}`);
        }

        // Economic suggestions
        if (scores.economicAccuracy && scores.economicAccuracy.score < 0.7) {
            suggestions.push('Include more economic context and industry-specific information');
        }

        // Cultural suggestions
        if (scores.culturalRelevance && scores.culturalRelevance.score < 0.7) {
            suggestions.push(`Add cultural context: ${scores.culturalRelevance.missing.join(', ')}`);
        }

        // Housing data suggestions
        if (scores.housingDataAccuracy && scores.housingDataAccuracy.score < 0.8) {
            suggestions.push('Ensure housing price references align with current market data');
        }

        return suggestions;
    }

    /**
     * Generate housing data suggestions
     * @private
     */
    _generateHousingDataSuggestions(validations, priceRangeCheck) {
        const suggestions = [];

        if (!validations.priceReferences) {
            suggestions.push('Include specific price information for market context');
        }
        
        if (!validations.inventoryReferences) {
            suggestions.push('Reference current inventory levels and supply conditions');
        }
        
        if (!priceRangeCheck.withinRange) {
            suggestions.push('Verify price references align with current market median prices');
        }

        return suggestions;
    }
}

module.exports = EnhancedMarketDataService;