/**
 * Comprehensive Data Extractor Agent
 * Extracts all quantitative data points from source narratives for market localization
 * 
 * Purpose: Address the critical gap where system processes only 3 output files 
 * instead of extracting and tracking 40+ individual quantitative data points
 * from pr-master2 narrative content.
 */

const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');

class ComprehensiveDataExtractorAgent extends BaseAgent {
    constructor(options = {}, lineageService = null) {
        super('Comprehensive Data Extractor', {
            maxRetries: 3,
            retryDelay: 1000,
            timeout: 120000, // 2 minutes for comprehensive extraction
            ...options
        }, lineageService);

        // ENHANCED extraction patterns specifically designed for pr-master2 content
        this.extractionPatterns = {
            // National statistics and market data
            nationalStatistics: {
                patterns: [
                    // Price data patterns
                    /median\s+(?:u\.?s\.?|national)\s+home[- ]sale\s+price\s+rose\s+([+-]?\d+(?:\.\d+)?%)/gi,
                    /sale\s+price\s+of\s+\$?([\d,]+(?:\.\d+)?)/gi,
                    /\$?([\d,]+(?:\.\d+)?)\s+was\s+the\s+highest/gi,
                    /record\s+high\s+for\s+this\s+time\s+of\s+year/gi,
                    
                    // Growth and change patterns
                    /rose\s+([+-]?\d+(?:\.\d+)?%)\s+year\s+over\s+year/gi,
                    /slowest\s+growth\s+since\s+(\w+\s+\d{4})/gi,
                    /slowest\s+clip\s+since\s+(\d{4})/gi,
                    
                    // Sales data patterns
                    /existing[- ]home\s+sales\s+came\s+in\s+at[^.]*?([\d,]+(?:\.\d+)?\s+million)/gi,
                    /seasonally\s+adjusted\s+annual\s+rate\s+of\s+([\d,]+(?:\.\d+)?\s+million)/gi,
                    /lowest\s+level\s+since\s+(\w+)/gi,
                    
                    // Market timing patterns
                    /took\s+(\d+)\s+days\s+for\s+the\s+typical\s+home\s+to\s+go\s+under\s+contract/gi,
                    /slowest\s+(\w+)\s+pace\s+since\s+(\d{4})/gi,
                    /(\d+)\s+days[^.]*?nearly\s+a\s+week\s+longer/gi,
                    
                    // Mortgage and rates
                    /mortgage\s+rates\s+remained\s+elevated\s+near\s+([+-]?\d+(?:\.\d+)?%)/gi,
                    /rates\s+will\s+remain\s+near\s+([+-]?\d+(?:\.\d+)?%)/gi
                ],
                category: 'national_statistics'
            },

            // Market data tables and structured data
            marketDataTables: {
                patterns: [
                    // Listing and inventory patterns
                    /active\s+listings\s+hit[^.]*?(\d+)[- ]year\s+high/gi,
                    /rising\s+([+-]?\d+(?:\.\d+)?%)\s+month\s+over\s+month/gi,
                    /([+-]?\d+(?:\.\d+)?%)\s+year\s+over\s+year/gi,
                    /highest\s+level\s+since\s+(\w+\s+\d{4})/gi,
                    
                    // New listings patterns
                    /new\s+listings\s+fell\s+([+-]?\d+(?:\.\d+)?%)\s+month\s+over\s+month/gi,
                    /rose\s+([+-]?\d+(?:\.\d+)?%)\s+year\s+over\s+year/gi,
                    /slowest\s+annual\s+growth\s+since\s+(\w+)/gi,
                    
                    // Sales volume and activity
                    /hit\s+a\s+(\d+)[- ]month\s+low/gi,
                    /(\d+)[- ]year\s+high\s+in\s+(\w+)/gi,
                    /(\d+)[- ]month\s+low/gi,
                    
                    // Cancellation and contract data
                    /roughly\s+([\d,]+)\s+home[- ]purchase\s+agreements\s+were\s+canceled/gi,
                    /equal\s+to\s+([+-]?\d+(?:\.\d+)?%)\s+of\s+homes/gi,
                    /highest\s+(\w+)\s+percentage\s+in\s+records/gi,
                    /up\s+from\s+([+-]?\d+(?:\.\d+)?%)\s+a\s+year\s+earlier/gi,
                    /records\s+dating\s+back\s+to\s+(\d{4})/gi
                ],
                category: 'market_data_tables'
            },

            // Regional and city-specific data
            regionalSpecific: {
                patterns: [
                    // California specific patterns
                    /oakland,?\s+ca\s+\(([+-]?\d+(?:\.\d+)?%)\)/gi,
                    /california[^.]*?([+-]?\d+(?:\.\d+)?%)/gi,
                    
                    // Florida patterns
                    /florida[^.]*?biggest\s+slowdown/gi,
                    /jacksonville,?\s+fl\s+\(([+-]?\d+(?:\.\d+)?%)\)/gi,
                    /orlando,?\s+fl\s+\(([+-]?\d+(?:\.\d+)?%)\)/gi,
                    
                    // Texas patterns
                    /dallas\s+\(([+-]?\d+(?:\.\d+)?%)\)/gi,
                    /texas[^.]*?highest\s+rate\s+of\s+cancellations/gi,
                    /san\s+antonio[^.]*?([+-]?\d+(?:\.\d+)?%)/gi,
                    
                    // Regional market patterns
                    /midwest[^.]*?holding\s+up\s+relatively\s+well/gi,
                    /northeast[^.]*?holding\s+up\s+best/gi,
                    /(\d+)\s+of\s+the\s+(\d+)\s+most\s+populous/gi,
                    /metropolitan\s+areas/gi
                ],
                category: 'regional_specific'
            },

            // Economic indicators and market conditions
            economicIndicators: {
                patterns: [
                    // Interest and mortgage rates
                    /mortgage\s+rates\s+remained\s+elevated\s+near\s+([+-]?\d+(?:\.\d+)?%)/gi,
                    /rates\s+will\s+remain\s+near\s+([+-]?\d+(?:\.\d+)?%)\s+for\s+the\s+rest\s+of\s+the\s+year/gi,
                    
                    // Economic conditions
                    /prohibitively\s+high\s+homebuying\s+costs/gi,
                    /economic\s+uncertainty/gi,
                    /mortgage\s+rate\s+lock[- ]in\s+effect\s+is\s+easing/gi,
                    
                    // Market sentiment indicators
                    /sellers\s+outnumber\s+buyers/gi,
                    /balance\s+of\s+power\s+shifts\s+toward\s+buyers/gi,
                    /sellers\s+no\s+longer\s+hold\s+all\s+the\s+cards/gi
                ],
                category: 'economic_indicators'
            },

            // Behavioral and market dynamics
            marketBehavior: {
                patterns: [
                    // Buyer/seller behavior
                    /less\s+than\s+([^(]+)\s*\(([^)]+)\)\s+of\s+homes\s+that\s+sold/gi,
                    /([+-]?\d+(?:\.\d+)?%)\s+of\s+homes\s+that\s+sold\s+in\s+(\w+)/gi,
                    /went\s+for\s+over\s+their\s+asking\s+price/gi,
                    /lowest\s+(\w+)\s+share\s+in\s+(\d+)\s+years/gi,
                    
                    // Market dynamics
                    /buyers\s+have\s+already\s+gained\s+some\s+bargaining\s+power/gi,
                    /buyers\s+may\s+gain\s+more\s+negotiating\s+power/gi,
                    /little\s+urgency/gi,
                    /browsing\s+instead\s+of\s+buying/gi,
                    /hoping\s+mortgage\s+rates\s+will\s+come\s+down/gi
                ],
                category: 'market_behavior'
            },

            // Seasonal and temporal data
            seasonalTemporal: {
                patterns: [
                    // Monthly patterns
                    /in\s+(january|february|march|april|may|june|july|august|september|october|november|december)/gi,
                    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi,
                    /(\w+)\s+pace\s+since\s+(\d{4})/gi,
                    /(\w+)\s+(\d{4})\s+by\s+\w+\s+\w+/gi,
                    
                    // Time-based comparisons
                    /since\s+(\w+\s+\d{4})/gi,
                    /since\s+(\d{4})/gi,
                    /dating\s+back\s+to\s+(\d{4})/gi,
                    /records\s+dating\s+back\s+to\s+(\d{4})/gi,
                    /for\s+this\s+time\s+of\s+year/gi,
                    /before\s+the\s+pandemic/gi
                ],
                category: 'seasonal_temporal'
            },

            // Price and market positioning
            priceSegments: {
                patterns: [
                    // Price thresholds and comparisons
                    /asking\s+price/gi,
                    /record\s+high/gi,
                    /near\s+record\s+highs/gi,
                    /homebuying\s+costs\s+remain\s+near\s+record\s+highs/gi,
                    
                    // Market positioning phrases
                    /market\s+has\s+been\s+shifting\s+in\s+buyers['\s]+favor/gi,
                    /doesn['\s]*t\s+feel\s+that\s+way\s+to\s+many\s+americans/gi,
                    /sellers\s+may\s+be\s+willing\s+to\s+come\s+down\s+on\s+price/gi,
                    /offer\s+concessions/gi,
                    /priced\s+fairly\s+and\s+in\s+good\s+condition/gi,
                    
                    // Market conditions
                    /tough\s+reality/gi,
                    /plateau\s+with\s+home\s+prices/gi,
                    /considering\s+renting\s+their\s+homes\s+out\s+instead\s+of\s+selling/gi
                ],
                category: 'price_segments'
            },

            // Predictions and forecasts
            predictions: {
                patterns: [
                    /Example Company\s+recently\s+predicted/gi,
                    /home\s+prices\s+will\s+start\s+falling/gi,
                    /by\s+the\s+end\s+of\s+(\d{4})/gi,
                    /that\s+has\s+already\s+happened\s+in\s+(\d+)\s+of\s+the\s+(\d+)/gi,
                    /Example Company\s+predicts\s+mortgage\s+rates/gi,
                    /unlikely\s+to\s+happen\s+soon/gi
                ],
                category: 'predictions'
            }
        };

        // Data point classification system
        this.dataPointTypes = {
            PERCENTAGE: 'percentage',
            CURRENCY: 'currency',
            COUNT: 'count',
            RATIO: 'ratio',
            INDEX: 'index',
            DURATION: 'duration',
            DATE: 'date',
            PHRASE: 'phrase'
        };

        // Enhanced validation patterns for data quality
        this.validationPatterns = {
            percentage: /^[+-]?\d+(?:\.\d+)?%?$/,
            currency: /^\$?[\d,]+(?:\.\d+)?[KMB]?$/,
            count: /^[\d,]+$/,
            ratio: /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/,
            index: /^\d+(?:\.\d+)?$/,
            duration: /^\d+\s+(?:days?|weeks?|months?|years?)$/,
            date: /^\w+\s+\d{4}$|^\d{4}$/,
            phrase: /.+/
        };
    }

    /**
     * Initialize the Comprehensive Data Extractor Agent
     * Required by BaseAgent - sets up the agent for operation
     */
    async initialize() {
        this.log('Initializing Comprehensive Data Extractor Agent', 'info');
        
        try {
            // Validate extraction patterns are properly configured
            const patternCount = Object.keys(this.extractionPatterns).length;
            if (patternCount === 0) {
                throw new Error('No extraction patterns configured');
            }
            
            // Validate data point types are configured
            const dataTypeCount = Object.keys(this.dataPointTypes).length;
            if (dataTypeCount === 0) {
                throw new Error('No data point types configured');
            }
            
            // Validate validation patterns are configured
            const validationPatternCount = Object.keys(this.validationPatterns).length;
            if (validationPatternCount === 0) {
                throw new Error('No validation patterns configured');
            }
            
            // Log initialization success
            this.log(`Agent initialized successfully with ${patternCount} extraction categories, ${dataTypeCount} data types, and ${validationPatternCount} validation patterns`, 'info');
            
            // Mark as initialized
            this.isInitialized = true;
            
            return {
                success: true,
                extractionCategories: patternCount,
                dataTypes: dataTypeCount,
                validationPatterns: validationPatternCount,
                capabilities: [
                    'comprehensive_data_extraction',
                    'pattern_matching',
                    'data_validation',
                    'context_enhancement',
                    'semantic_tagging',
                    'localization_prioritization'
                ]
            };
            
        } catch (error) {
            this.logError('Failed to initialize Comprehensive Data Extractor Agent', error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * Main extraction method - processes narrative content to extract all quantitative data points
     */
    async extractComprehensiveData(content, options = {}) {
        return this.execute(this._performComprehensiveExtraction.bind(this), content, options);
    }

    /**
     * Internal method to perform comprehensive data extraction
     */
    async _performComprehensiveExtraction(content, options = {}) {
        const startTime = Date.now();
        this.log('Starting comprehensive data extraction', 'info');

        try {
            // Validate input
            if (!content || typeof content !== 'string') {
                throw new Error('Content must be a non-empty string');
            }

            if (content.length < 100) {
                throw new Error('Content too short for meaningful data extraction');
            }

            // Initialize extraction results
            const extractionResults = {
                totalDataPoints: 0,
                extractedDataPoints: [],
                categorizedData: {},
                extractionMetrics: {
                    startTime: new Date().toISOString(),
                    contentLength: content.length,
                    categoriesProcessed: 0
                }
            };

            this.log(`Processing content of ${content.length} characters across ${Object.keys(this.extractionPatterns).length} categories`, 'debug');

            // Process each category
            for (const [categoryName, categoryConfig] of Object.entries(this.extractionPatterns)) {
                this.log(`Processing category: ${categoryName}`, 'debug');
                
                const categoryData = await this._extractCategoryData(content, categoryName, categoryConfig);
                extractionResults.categorizedData[categoryName] = categoryData;
                extractionResults.totalDataPoints += categoryData.dataPoints.length;
                extractionResults.extractedDataPoints.push(...categoryData.dataPoints);
                extractionResults.extractionMetrics.categoriesProcessed++;
            }

            // Validate extracted data points
            this.log('Validating extracted data points', 'debug');
            const validationResults = await this._validateDataPoints(extractionResults.extractedDataPoints);
            extractionResults.validationResults = validationResults;

            // Enhance data points with context and metadata
            this.log('Enhancing data points with context', 'debug');
            extractionResults.extractedDataPoints = await this._enhanceDataPoints(
                extractionResults.extractedDataPoints, 
                content
            );

            // Calculate processing metrics
            const processingTime = Date.now() - startTime;
            extractionResults.extractionMetrics.processingTime = processingTime;
            extractionResults.extractionMetrics.endTime = new Date().toISOString();
            extractionResults.extractionMetrics.dataPointsPerSecond = 
                Math.round((extractionResults.totalDataPoints / processingTime) * 1000);

            this.log(`Comprehensive data extraction completed: ${extractionResults.totalDataPoints} data points extracted in ${processingTime}ms`, 'info');

            // Track lineage event if service available
            if (this.lineageService && options.jobId) {
                try {
                    // Validate that the lineage service has the required method
                    if (typeof this.lineageService.trackDataExtraction === 'function') {
                        await this.lineageService.trackDataExtraction(options.jobId, 'comprehensive_data_extraction', {
                            agent: this.name,
                            totalDataPoints: extractionResults.totalDataPoints,
                            validDataPoints: validationResults.validDataPoints,
                            processingTime: processingTime,
                            categories: Object.keys(extractionResults.categorizedData)
                        });
                        console.log(`[DEBUG] ComprehensiveDataExtractor - lineage tracking successful for jobId: ${options.jobId}`);
                    } else {
                        console.warn(`[WARN] ComprehensiveDataExtractor - lineage service exists but trackDataExtraction method is not available. Service type: ${typeof this.lineageService}, methods: ${Object.getOwnPropertyNames(this.lineageService)}`);
                    }
                } catch (error) {
                    console.error(`[ERROR] ComprehensiveDataExtractor - lineage tracking failed for jobId: ${options.jobId}:`, error.message);
                    // Continue processing despite lineage tracking failure
                }
            } else {
                console.log(`[DEBUG] ComprehensiveDataExtractor - lineage tracking skipped. Service available: ${!!this.lineageService}, jobId: ${options.jobId}`);
            }

            return extractionResults;

        } catch (error) {
            this.logError('Comprehensive data extraction failed', error);
            throw error;
        }
    }

    /**
     * Extract data points for a specific category
     */
    async _extractCategoryData(content, categoryName, categoryConfig) {
        const categoryData = {
            category: categoryName,
            dataPoints: [],
            patterns: categoryConfig.patterns.length,
            matches: 0
        };

        for (const pattern of categoryConfig.patterns) {
            // Reset regex lastIndex to ensure proper matching
            pattern.lastIndex = 0;
            
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const dataPoint = {
                    id: `${categoryName}_${categoryData.dataPoints.length + 1}`,
                    category: categoryConfig.category,
                    value: match[1] || match[0], // Use captured group or full match
                    rawMatch: match[0],
                    context: this._extractContext(content, match.index, 100),
                    position: {
                        start: match.index,
                        end: match.index + match[0].length
                    },
                    type: this._classifyDataPoint(match[1] || match[0]),
                    confidence: this._calculateConfidence(match[0], content),
                    extractedAt: new Date().toISOString()
                };

                categoryData.dataPoints.push(dataPoint);
                categoryData.matches++;
                
                // Prevent infinite loops with global regex
                if (!pattern.global) break;
            }
        }

        return categoryData;
    }

    /**
     * Extract surrounding context for a data point
     */
    _extractContext(content, position, contextLength = 100) {
        const start = Math.max(0, position - contextLength);
        const end = Math.min(content.length, position + contextLength);
        return {
            before: content.substring(start, position).trim(),
            after: content.substring(position, end).trim(),
            full: content.substring(start, end).trim()
        };
    }

    /**
     * Classify data point type based on value format
     */
    _classifyDataPoint(value) {
        if (!value) return this.dataPointTypes.PHRASE;
        
        const cleanValue = value.toString().trim();
        
        if (this.validationPatterns.percentage.test(cleanValue)) {
            return this.dataPointTypes.PERCENTAGE;
        } else if (this.validationPatterns.currency.test(cleanValue)) {
            return this.dataPointTypes.CURRENCY;
        } else if (this.validationPatterns.count.test(cleanValue)) {
            return this.dataPointTypes.COUNT;
        } else if (this.validationPatterns.ratio.test(cleanValue)) {
            return this.dataPointTypes.RATIO;
        } else if (this.validationPatterns.date.test(cleanValue)) {
            return this.dataPointTypes.DATE;
        } else if (this.validationPatterns.duration.test(cleanValue)) {
            return this.dataPointTypes.DURATION;
        } else {
            return this.dataPointTypes.PHRASE;
        }
    }

    /**
     * Calculate confidence score for a data point
     */
    _calculateConfidence(rawMatch, content) {
        let confidence = 0.5; // Base confidence
        
        // Increase confidence for specific patterns
        if (/\d+(?:\.\d+)?%/.test(rawMatch)) confidence += 0.2;
        if (/\$[\d,]+/.test(rawMatch)) confidence += 0.2;
        if (/\d{4}/.test(rawMatch)) confidence += 0.1; // Years
        if (rawMatch.length > 10) confidence += 0.1; // Longer matches tend to be more specific
        
        // Context-based confidence adjustments
        if (content.includes('median') || content.includes('average')) confidence += 0.1;
        if (content.includes('year over year') || content.includes('month over month')) confidence += 0.1;
        
        return Math.min(1.0, confidence);
    }

    /**
     * Validate extracted data points
     */
    async _validateDataPoints(dataPoints) {
        const validationResults = {
            totalDataPoints: dataPoints.length,
            validDataPoints: 0,
            invalidDataPoints: 0,
            validationErrors: []
        };

        for (const dataPoint of dataPoints) {
            try {
                const isValid = this._validateSingleDataPoint(dataPoint);
                if (isValid) {
                    validationResults.validDataPoints++;
                } else {
                    validationResults.invalidDataPoints++;
                    validationResults.validationErrors.push({
                        id: dataPoint.id,
                        error: 'Failed validation pattern check',
                        value: dataPoint.value
                    });
                }
            } catch (error) {
                validationResults.invalidDataPoints++;
                validationResults.validationErrors.push({
                    id: dataPoint.id,
                    error: error.message,
                    value: dataPoint.value
                });
            }
        }

        validationResults.qualityScore = validationResults.totalDataPoints > 0 
            ? validationResults.validDataPoints / validationResults.totalDataPoints 
            : 0;

        return validationResults;
    }

    /**
     * Validate a single data point
     */
    _validateSingleDataPoint(dataPoint) {
        if (!dataPoint.value) return false;
        
        const pattern = this.validationPatterns[dataPoint.type];
        if (!pattern) return true; // If no pattern defined, assume valid
        
        return pattern.test(dataPoint.value.toString());
    }

    /**
     * Enhance data points with additional context and metadata
     */
    async _enhanceDataPoints(dataPoints, content) {
        return dataPoints.map(dataPoint => ({
            ...dataPoint,
            semanticTags: this._generateSemanticTags(dataPoint, content),
            localizationPriority: this._assignLocalizationPriority(dataPoint),
            normalizationSuggestions: this._generateNormalizationSuggestions(dataPoint)
        }));
    }

    /**
     * Generate semantic tags for better categorization
     */
    _generateSemanticTags(dataPoint, content) {
        const tags = [];
        
        // Type-based tags
        tags.push(dataPoint.type);
        tags.push(dataPoint.category);
        
        // Content-based tags
        if (dataPoint.rawMatch.includes('%')) tags.push('percentage');
        if (dataPoint.rawMatch.includes('$')) tags.push('currency');
        if (dataPoint.rawMatch.includes('year')) tags.push('temporal');
        if (dataPoint.rawMatch.includes('month')) tags.push('temporal');
        if (dataPoint.rawMatch.includes('high') || dataPoint.rawMatch.includes('low')) tags.push('extremes');
        
        // Context-based tags
        const contextLower = dataPoint.context.full.toLowerCase();
        if (contextLower.includes('median')) tags.push('median');
        if (contextLower.includes('average')) tags.push('average');
        if (contextLower.includes('record')) tags.push('record');
        if (contextLower.includes('since')) tags.push('historical');
        
        return [...new Set(tags)]; // Remove duplicates
    }

    /**
     * Assign localization priority for market-specific adaptation
     */
    _assignLocalizationPriority(dataPoint) {
        // High priority for market-specific data
        if (dataPoint.category === 'regional_specific' || dataPoint.category === 'la_metro_specific') {
            return 'high';
        }
        
        // Medium priority for national statistics that can be localized
        if (dataPoint.category === 'national_statistics' && dataPoint.type === 'percentage') {
            return 'medium';
        }
        
        // Low priority for general market behavior
        return 'low';
    }

    /**
     * Generate normalization suggestions for data consistency
     */
    _generateNormalizationSuggestions(dataPoint) {
        const suggestions = [];
        
        if (dataPoint.type === 'percentage' && !dataPoint.value.includes('%')) {
            suggestions.push('Add percentage symbol');
        }
        
        if (dataPoint.type === 'currency' && !dataPoint.value.includes('$')) {
            suggestions.push('Add currency symbol');
        }
        
        if (dataPoint.type === 'count' && dataPoint.value.includes(',')) {
            suggestions.push('Consider removing commas for numerical processing');
        }
        
        return suggestions;
    }

    /**
     * Generate comprehensive extraction summary
     */
    generateExtractionSummary(extractionResults) {
        return {
            totalDataPoints: extractionResults.totalDataPoints,
            categoriesProcessed: extractionResults.extractionMetrics.categoriesProcessed,
            processingTime: extractionResults.extractionMetrics.processingTime,
            dataPointsPerSecond: extractionResults.extractionMetrics.dataPointsPerSecond,
            qualityScore: extractionResults.validationResults.qualityScore,
            highPriorityDataPoints: extractionResults.extractedDataPoints.filter(
                dp => dp.localizationPriority === 'high'
            ).length,
            categoryBreakdown: Object.keys(extractionResults.categorizedData).reduce((acc, category) => {
                acc[category] = extractionResults.categorizedData[category].dataPoints.length;
                return acc;
            }, {})
        };
    }
}

module.exports = ComprehensiveDataExtractorAgent;