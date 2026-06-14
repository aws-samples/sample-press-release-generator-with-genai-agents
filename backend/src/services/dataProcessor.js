const { config } = require('../config');
const { logger } = require('../utils/logger');
const moment = require('moment');
const _ = require('lodash');

/**
 * Data Processing Service - ETL pipeline for data normalization and quality assurance
 * Handles data transformation, validation, and quality scoring
 */
class DataProcessorService {
  constructor() {
    this.isInitialized = false;
    
    // Data validation rules for different data types
    this.validationRules = this._initializeValidationRules();
    
    // Data transformation schemas
    this.transformationSchemas = this._initializeTransformationSchemas();
    
    // Quality scoring weights
    this.qualityWeights = {
      completeness: 0.3,
      accuracy: 0.25,
      freshness: 0.2,
      consistency: 0.15,
      validity: 0.1
    };
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      this.isInitialized = true;
      logger.info('DataProcessorService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize DataProcessorService:', error);
      throw error;
    }
  }

  /**
   * Initialize validation rules for different data types
   */
  _initializeValidationRules() {
    return {
      realEstate: {
        required: ['medianPrice', 'inventory', 'priceChange'],
        ranges: {
          medianPrice: { min: 50000, max: 10000000 },
          inventory: { min: 0, max: 100000 },
          priceChange: { min: -50, max: 50 }
        },
        types: {
          medianPrice: 'number',
          inventory: 'number',
          priceChange: 'number',
          marketHeat: 'string'
        }
      },
      economic: {
        required: ['unemploymentRate', 'populationGrowth'],
        ranges: {
          unemploymentRate: { min: 0, max: 25 },
          populationGrowth: { min: -10, max: 20 },
          medianIncome: { min: 20000, max: 200000 }
        },
        types: {
          unemploymentRate: 'number',
          populationGrowth: 'number',
          medianIncome: 'number',
          laborForce: 'number'
        }
      },
      news: {
        required: ['headlines'],
        types: {
          headlines: 'array',
          sentiment: 'number',
          publishDate: 'string'
        },
        ranges: {
          sentiment: { min: -1, max: 1 }
        }
      },
      demographics: {
        required: ['population'],
        ranges: {
          population: { min: 100000, max: 25000000 }
        },
        types: {
          population: 'number',
          ageDistribution: 'object',
          educationLevels: 'object'
        }
      }
    };
  }

  /**
   * Initialize transformation schemas
   */
  _initializeTransformationSchemas() {
    return {
      realEstate: {
        medianPrice: {
          transform: (value) => this._parsePrice(value),
          normalize: (value) => Math.round(value)
        },
        priceChange: {
          transform: (value) => this._parsePercentage(value),
          normalize: (value) => Math.round(value * 100) / 100
        },
        inventory: {
          transform: (value) => this._parseNumber(value),
          normalize: (value) => Math.round(value)
        }
      },
      economic: {
        unemploymentRate: {
          transform: (value) => this._parsePercentage(value),
          normalize: (value) => Math.round(value * 100) / 100
        },
        populationGrowth: {
          transform: (value) => this._parsePercentage(value),
          normalize: (value) => Math.round(value * 100) / 100
        },
        medianIncome: {
          transform: (value) => this._parsePrice(value),
          normalize: (value) => Math.round(value)
        }
      },
      news: {
        headlines: {
          transform: (value) => Array.isArray(value) ? value : [value],
          normalize: (value) => value.filter(h => h && h.length > 10)
        },
        sentiment: {
          transform: (value) => this._parseNumber(value),
          normalize: (value) => Math.max(-1, Math.min(1, value))
        }
      },
      demographics: {
        population: {
          transform: (value) => this._parseNumber(value),
          normalize: (value) => Math.round(value)
        }
      }
    };
  }

  /**
   * Process raw data through ETL pipeline
   */
  async processData(rawData, dataType, market) {
    try {
      logger.debug(`Processing ${dataType} data for market ${market.code}`);

      // Extract phase - get data from sources
      const extractedData = await this._extractData(rawData, dataType);

      // Transform phase - normalize and clean data
      const transformedData = await this._transformData(extractedData, dataType);

      // Load phase - validate and enrich data
      const processedData = await this._loadData(transformedData, dataType, market);

      // Add processing metadata
      processedData._processing = {
        processedAt: moment().toISOString(),
        dataType,
        market: market.code,
        pipeline: 'ETL',
        version: '1.0'
      };

      logger.debug(`Successfully processed ${dataType} data for market ${market.code}`);
      return processedData;

    } catch (error) {
      logger.error(`Error processing ${dataType} data for market ${market.code}:`, error);
      throw error;
    }
  }

  /**
   * Extract phase - consolidate data from multiple sources
   */
  async _extractData(rawData, dataType) {
    const extracted = {
      consolidated: {},
      sources: [],
      conflicts: [],
      coverage: {}
    };

    if (!rawData.sources) {
      throw new Error('No source data provided');
    }

    // Process each source
    for (const [sourceName, sourceData] of Object.entries(rawData.sources)) {
      try {
        extracted.sources.push(sourceName);
        
        if (sourceData.data) {
          // Merge data from this source
          for (const [field, value] of Object.entries(sourceData.data)) {
            if (extracted.consolidated[field] !== undefined) {
              // Handle conflicts between sources
              if (extracted.consolidated[field] !== value) {
                extracted.conflicts.push({
                  field,
                  sources: [extracted.coverage[field], sourceName],
                  values: [extracted.consolidated[field], value]
                });
              }
            } else {
              extracted.consolidated[field] = value;
              extracted.coverage[field] = sourceName;
            }
          }
        }
      } catch (error) {
        logger.warn(`Error extracting data from source ${sourceName}:`, error);
      }
    }

    return extracted;
  }

  /**
   * Transform phase - normalize and clean data
   */
  async _transformData(extractedData, dataType) {
    const schema = this.transformationSchemas[dataType];
    if (!schema) {
      logger.warn(`No transformation schema found for data type: ${dataType}`);
      return extractedData;
    }

    const transformed = {
      ...extractedData,
      normalized: {},
      transformations: []
    };

    // Apply transformations to each field
    for (const [field, value] of Object.entries(extractedData.consolidated)) {
      try {
        if (schema[field]) {
          const fieldSchema = schema[field];
          
          // Apply transformation
          let transformedValue = value;
          if (fieldSchema.transform) {
            transformedValue = fieldSchema.transform(value);
            transformed.transformations.push({
              field,
              original: value,
              transformed: transformedValue,
              method: 'transform'
            });
          }

          // Apply normalization
          if (fieldSchema.normalize) {
            const normalizedValue = fieldSchema.normalize(transformedValue);
            transformed.normalized[field] = normalizedValue;
            
            if (normalizedValue !== transformedValue) {
              transformed.transformations.push({
                field,
                original: transformedValue,
                normalized: normalizedValue,
                method: 'normalize'
              });
            }
          } else {
            transformed.normalized[field] = transformedValue;
          }
        } else {
          // No transformation defined, use as-is
          transformed.normalized[field] = value;
        }
      } catch (error) {
        logger.warn(`Error transforming field ${field}:`, error);
        transformed.normalized[field] = value; // Use original value on error
      }
    }

    return transformed;
  }

  /**
   * Load phase - validate and enrich data
   */
  async _loadData(transformedData, dataType, market) {
    const validation = await this.validateData(transformedData.normalized, dataType);
    
    const loaded = {
      data: transformedData.normalized,
      metadata: {
        market: market,
        dataType,
        sources: transformedData.sources,
        conflicts: transformedData.conflicts,
        transformations: transformedData.transformations,
        validation: validation,
        processedAt: moment().toISOString()
      }
    };

    // Enrich with additional computed fields
    loaded.data = await this._enrichData(loaded.data, dataType, market);

    return loaded;
  }

  /**
   * Enrich data with computed fields and market context
   */
  async _enrichData(data, dataType, market) {
    const enriched = { ...data };

    try {
      switch (dataType) {
        case 'realEstate':
          enriched._computed = {
            affordabilityIndex: this._calculateAffordability(data, market),
            marketTrend: this._determineMarketTrend(data),
            pricePerSqFt: this._estimatePricePerSqFt(data, market)
          };
          break;

        case 'economic':
          enriched._computed = {
            economicHealth: this._assessEconomicHealth(data),
            growthMomentum: this._calculateGrowthMomentum(data),
            employmentStrength: this._assessEmploymentStrength(data)
          };
          break;

        case 'news':
          enriched._computed = {
            sentimentTrend: this._analyzeSentimentTrend(data),
            keyTopics: this._extractKeyTopics(data),
            marketMentions: this._countMarketMentions(data, market)
          };
          break;

        case 'demographics':
          enriched._computed = {
            diversityIndex: this._calculateDiversityIndex(data),
            housingDemand: this._estimateHousingDemand(data),
            economicPotential: this._assessEconomicPotential(data)
          };
          break;
      }
    } catch (error) {
      logger.warn(`Error enriching ${dataType} data:`, error);
    }

    return enriched;
  }

  /**
   * Validate data against rules
   */
  async validateData(data, dataType) {
    const rules = this.validationRules[dataType];
    if (!rules) {
      return { valid: true, score: 100, issues: [] };
    }

    const validation = {
      valid: true,
      score: 0,
      issues: [],
      checks: {
        completeness: 0,
        types: 0,
        ranges: 0
      }
    };

    // Check completeness
    const completenessScore = this._checkCompleteness(data, rules.required || []);
    validation.checks.completeness = completenessScore;

    // Check data types
    const typesScore = this._checkTypes(data, rules.types || {});
    validation.checks.types = typesScore;

    // Check ranges
    const rangesScore = this._checkRanges(data, rules.ranges || {});
    validation.checks.ranges = rangesScore;

    // Calculate overall score
    validation.score = Math.round(
      (completenessScore + typesScore + rangesScore) / 3
    );

    validation.valid = validation.score >= config.dataCollection.dataQualityThreshold;

    return validation;
  }

  /**
   * Validate data quality and return detailed assessment
   */
  async validateQuality(data, dataType) {
    try {
      const qualityAssessment = {
        overall: 0,
        dimensions: {},
        issues: [],
        recommendations: []
      };

      // Completeness assessment
      qualityAssessment.dimensions.completeness = this._assessCompleteness(data);

      // Freshness assessment
      qualityAssessment.dimensions.freshness = this._assessFreshness(data);

      // Accuracy assessment
      qualityAssessment.dimensions.accuracy = this._assessAccuracy(data, dataType);

      // Consistency assessment
      qualityAssessment.dimensions.consistency = this._assessConsistency(data);

      // Validity assessment
      qualityAssessment.dimensions.validity = this._assessValidity(data, dataType);

      // Calculate weighted overall score
      qualityAssessment.overall = this._calculateWeightedScore(qualityAssessment.dimensions);

      // Generate recommendations
      qualityAssessment.recommendations = this._generateQualityRecommendations(qualityAssessment);

      return qualityAssessment;

    } catch (error) {
      logger.error(`Error validating data quality for ${dataType}:`, error);
      throw error;
    }
  }

  /**
   * Check data completeness
   */
  _checkCompleteness(data, requiredFields) {
    if (requiredFields.length === 0) return 100;

    const presentFields = requiredFields.filter(field => 
      data[field] !== undefined && data[field] !== null && data[field] !== ''
    );

    return Math.round((presentFields.length / requiredFields.length) * 100);
  }

  /**
   * Check data types
   */
  _checkTypes(data, typeRules) {
    const fields = Object.keys(typeRules);
    if (fields.length === 0) return 100;

    let correctTypes = 0;
    for (const field of fields) {
      if (data[field] !== undefined) {
        const expectedType = typeRules[field];
        const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
        if (actualType === expectedType) {
          correctTypes++;
        }
      }
    }

    return Math.round((correctTypes / fields.length) * 100);
  }

  /**
   * Check data ranges
   */
  _checkRanges(data, rangeRules) {
    const fields = Object.keys(rangeRules);
    if (fields.length === 0) return 100;

    let validRanges = 0;
    for (const field of fields) {
      if (data[field] !== undefined && typeof data[field] === 'number') {
        const range = rangeRules[field];
        if (data[field] >= range.min && data[field] <= range.max) {
          validRanges++;
        }
      }
    }

    return Math.round((validRanges / fields.length) * 100);
  }

  /**
   * Assess data completeness
   */
  _assessCompleteness(data) {
    const totalFields = Object.keys(data).length;
    const nonEmptyFields = Object.values(data).filter(value => 
      value !== null && value !== undefined && value !== ''
    ).length;

    return totalFields > 0 ? Math.round((nonEmptyFields / totalFields) * 100) : 0;
  }

  /**
   * Assess data freshness
   */
  _assessFreshness(data) {
    if (!data._processing || !data._processing.processedAt) {
      return 50; // Default score if no timestamp
    }

    const age = moment().diff(moment(data._processing.processedAt), 'hours');
    
    // Freshness decreases over time
    if (age <= 1) return 100;
    if (age <= 6) return 90;
    if (age <= 24) return 75;
    if (age <= 72) return 50;
    return 25;
  }

  /**
   * Assess data accuracy (based on validation rules)
   */
  _assessAccuracy(data, dataType) {
    const rules = this.validationRules[dataType];
    if (!rules) return 100;

    return this._checkRanges(data, rules.ranges || {});
  }

  /**
   * Assess data consistency
   */
  _assessConsistency(data) {
    // Check for internal consistency
    let consistencyScore = 100;

    // Example consistency checks could be added here
    // For now, return a default score
    return consistencyScore;
  }

  /**
   * Assess data validity
   */
  _assessValidity(data, dataType) {
    const rules = this.validationRules[dataType];
    if (!rules) return 100;

    return this._checkTypes(data, rules.types || {});
  }

  /**
   * Calculate weighted quality score
   */
  _calculateWeightedScore(dimensions) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [dimension, score] of Object.entries(dimensions)) {
      const weight = this.qualityWeights[dimension] || 0.1;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Generate quality improvement recommendations
   */
  _generateQualityRecommendations(assessment) {
    const recommendations = [];

    for (const [dimension, score] of Object.entries(assessment.dimensions)) {
      if (score < 80) {
        switch (dimension) {
          case 'completeness':
            recommendations.push('Improve data collection to fill missing fields');
            break;
          case 'freshness':
            recommendations.push('Increase data refresh frequency');
            break;
          case 'accuracy':
            recommendations.push('Validate data sources and ranges');
            break;
          case 'consistency':
            recommendations.push('Implement cross-source validation');
            break;
          case 'validity':
            recommendations.push('Strengthen data type validation');
            break;
        }
      }
    }

    return recommendations;
  }

  // Utility parsing methods
  _parsePrice(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return parseFloat(value.replace(/[$,]/g, '')) || 0;
    }
    return 0;
  }

  _parsePercentage(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return parseFloat(value.replace('%', '')) || 0;
    }
    return 0;
  }

  _parseNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      return parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
    }
    return 0;
  }

  // Enrichment calculation methods (simplified implementations)
  _calculateAffordability(data, market) {
    // Simplified affordability calculation
    return data.medianPrice && market.population ? 
      Math.round((data.medianPrice / market.population) * 1000) / 1000 : null;
  }

  _determineMarketTrend(data) {
    if (!data.priceChange) return 'stable';
    if (data.priceChange > 5) return 'rising';
    if (data.priceChange < -5) return 'declining';
    return 'stable';
  }

  _estimatePricePerSqFt(data, market) {
    // Simplified estimation - would use more sophisticated calculation in production
    return data.medianPrice ? Math.round(data.medianPrice / 2000) : null;
  }

  _assessEconomicHealth(data) {
    const unemployment = data.unemploymentRate || 5;
    const growth = data.populationGrowth || 0;
    
    if (unemployment < 4 && growth > 1) return 'strong';
    if (unemployment < 6 && growth > 0) return 'moderate';
    return 'weak';
  }

  _calculateGrowthMomentum(data) {
    return data.populationGrowth || 0;
  }

  _assessEmploymentStrength(data) {
    const unemployment = data.unemploymentRate || 5;
    if (unemployment < 3) return 'excellent';
    if (unemployment < 5) return 'good';
    if (unemployment < 7) return 'fair';
    return 'poor';
  }

  _analyzeSentimentTrend(data) {
    return data.sentiment || 0;
  }

  _extractKeyTopics(data) {
    // Simplified topic extraction
    return data.headlines ? data.headlines.slice(0, 5) : [];
  }

  _countMarketMentions(data, market) {
    if (!data.headlines) return 0;
    return data.headlines.filter(headline => 
      headline.toLowerCase().includes(market.name.toLowerCase())
    ).length;
  }

  _calculateDiversityIndex(data) {
    // Simplified diversity calculation
    return data.ageDistribution ? Object.keys(data.ageDistribution).length : 0;
  }

  _estimateHousingDemand(data) {
    return data.population ? Math.round(data.population * 0.4) : 0;
  }

  _assessEconomicPotential(data) {
    const population = data.population || 0;
    if (population > 5000000) return 'high';
    if (population > 1000000) return 'medium';
    return 'low';
  }
}

module.exports = { DataProcessorService };