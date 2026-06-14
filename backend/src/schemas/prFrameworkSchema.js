/**
 * PR Framework Schema
 * Defines the structured data model for master PR analysis and adaptation
 * 
 * Enhanced Structural Framework Preservation Approach
 * Part of the narrative adaptation system to handle contradictions between
 * master PR content and local market data
 */

/**
 * PR Framework Object Schema
 * Core data structure for capturing master PR framework
 */
const PRFrameworkSchema = {
  metadata: {
    originalLength: 'number',
    analysisVersion: 'string',
    extractedAt: 'timestamp',
    jobId: 'string',
    confidence: 'number'
  },
  
  structure: {
    headline: {
      text: 'string',
      adaptable: 'boolean',
      importance: 'high|medium|low',
      dataPoints: 'array'
    },
    subheadline: {
      text: 'string',
      adaptable: 'boolean',
      importance: 'high|medium|low',
      dataPoints: 'array'
    },
    paragraphs: [
      {
        id: 'string',
        purpose: 'intro|data|quote|conclusion|context',
        content: 'string',
        dataPoints: [
          {
            value: 'string',
            type: 'percentage|currency|count|trend|statistic',
            localizationPotential: 'high|medium|low',
            context: 'string'
          }
        ],
        adaptationRules: {
          canReplace: 'boolean',
          mustPreserve: 'array',
          adaptationStrategy: 'replace|contextualize|contrast|preserve'
        }
      }
    ]
  },
  
  themes: {
    primary: 'string',
    secondary: 'array',
    marketCondition: 'growth|decline|stable|mixed|neutral',
    sentiment: 'positive|negative|neutral',
    urgency: 'high|medium|low'
  },
  
  dataPoints: [
    {
      value: 'string',
      type: 'percentage|currency|count|trend|statistic',
      context: 'string',
      contradictionPotential: 'high|medium|low',
      adaptationStrategy: 'replace|contextualize|contrast|preserve',
      sourceLocation: {
        paragraphId: 'string',
        position: 'number'
      }
    }
  ],
  
  adaptationRules: {
    preserveStructure: 'boolean',
    allowContradiction: 'boolean',
    contrastStrategy: 'acknowledge|explain|reframe|contextualize',
    qualityThreshold: 'number',
    maxAdaptations: 'number'
  }
};

/**
 * Contradiction Analysis Schema
 * Structure for detected contradictions between master PR and local data
 */
const ContradictionSchema = {
  masterClaim: {
    value: 'string',
    type: 'string',
    context: 'string',
    sourceLocation: 'object'
  },
  localData: {
    value: 'string',
    type: 'string',
    source: 'string',
    confidence: 'number'
  },
  severityLevel: 'high|medium|low',
  adaptationStrategy: 'acknowledge_contrast|contextual_reframe|multi_factor_analysis|scenario_adaptation',
  resolutionApproach: 'string',
  qualityImpact: 'number'
};

/**
 * Paragraph Adaptation Schema
 * Structure for adapted paragraph content
 */
const ParagraphAdaptationSchema = {
  originalParagraph: 'object',
  adaptedContent: 'string',
  adaptationStrategy: 'string',
  contradictionsResolved: 'array',
  qualityScore: 'number',
  preservesIntent: 'boolean',
  dataPointsIntegrated: 'array',
  marketSpecificElements: 'array'
};

/**
 * Quality Assessment Schema
 * Structure for quality validation results
 */
const QualityAssessmentSchema = {
  dataAccuracy: 'number',        // 0-100: Factual correctness
  narrativeAlignment: 'number',  // 0-100: Story consistency with framework
  structuralIntegrity: 'number', // 0-100: Framework preservation
  marketRelevance: 'number',     // 0-100: Local market applicability
  professionalStandard: 'number', // 0-100: PR industry standards
  overallScore: 'number',        // 0-100: Weighted overall quality
  issues: 'array',
  recommendations: 'array'
};

/**
 * Validation functions for schema compliance
 */
const SchemaValidators = {
  /**
   * Validate PR Framework Object structure
   */
  validatePRFramework(framework) {
    const errors = [];
    
    // Check required metadata
    if (!framework.metadata) {
      errors.push('Missing metadata object');
    } else {
      if (!framework.metadata.originalLength || typeof framework.metadata.originalLength !== 'number') {
        errors.push('Invalid or missing metadata.originalLength');
      }
      if (!framework.metadata.analysisVersion || typeof framework.metadata.analysisVersion !== 'string') {
        errors.push('Invalid or missing metadata.analysisVersion');
      }
      if (!framework.metadata.extractedAt) {
        errors.push('Missing metadata.extractedAt');
      }
    }
    
    // Check structure
    if (!framework.structure) {
      errors.push('Missing structure object');
    } else {
      if (!framework.structure.paragraphs || !Array.isArray(framework.structure.paragraphs)) {
        errors.push('Invalid or missing structure.paragraphs array');
      }
    }
    
    // Check themes
    if (!framework.themes) {
      errors.push('Missing themes object');
    } else {
      if (!framework.themes.primary || typeof framework.themes.primary !== 'string') {
        errors.push('Invalid or missing themes.primary');
      }
    }
    
    // Check dataPoints
    if (!framework.dataPoints || !Array.isArray(framework.dataPoints)) {
      errors.push('Invalid or missing dataPoints array');
    }
    
    // Check adaptationRules
    if (!framework.adaptationRules) {
      errors.push('Missing adaptationRules object');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },
  
  /**
   * Validate Contradiction structure
   */
  validateContradiction(contradiction) {
    const errors = [];
    
    if (!contradiction.masterClaim) {
      errors.push('Missing masterClaim');
    }
    if (!contradiction.localData) {
      errors.push('Missing localData');
    }
    if (!contradiction.severityLevel || !['high', 'medium', 'low'].includes(contradiction.severityLevel)) {
      errors.push('Invalid severityLevel');
    }
    if (!contradiction.adaptationStrategy) {
      errors.push('Missing adaptationStrategy');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },
  
  /**
   * Validate Quality Assessment structure
   */
  validateQualityAssessment(assessment) {
    const errors = [];
    
    const requiredMetrics = ['dataAccuracy', 'narrativeAlignment', 'structuralIntegrity', 'marketRelevance', 'professionalStandard'];
    
    for (const metric of requiredMetrics) {
      if (typeof assessment[metric] !== 'number' || assessment[metric] < 0 || assessment[metric] > 100) {
        errors.push(`Invalid ${metric}: must be number between 0-100`);
      }
    }
    
    if (typeof assessment.overallScore !== 'number' || assessment.overallScore < 0 || assessment.overallScore > 100) {
      errors.push('Invalid overallScore: must be number between 0-100');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

/**
 * Default values for schema objects
 */
const SchemaDefaults = {
  prFramework: {
    metadata: {
      originalLength: 0,
      analysisVersion: '1.0',
      extractedAt: new Date().toISOString(),
      jobId: null,
      confidence: 85
    },
    structure: {
      headline: { text: '', adaptable: true, importance: 'high', dataPoints: [] },
      subheadline: { text: '', adaptable: true, importance: 'medium', dataPoints: [] },
      paragraphs: []
    },
    themes: {
      primary: 'market_analysis',
      secondary: [],
      marketCondition: 'neutral',
      sentiment: 'neutral',
      urgency: 'medium'
    },
    dataPoints: [],
    adaptationRules: {
      preserveStructure: true,
      allowContradiction: true,
      contrastStrategy: 'acknowledge',
      qualityThreshold: 85,
      maxAdaptations: 10
    }
  },
  
  qualityAssessment: {
    dataAccuracy: 85,
    narrativeAlignment: 85,
    structuralIntegrity: 95,
    marketRelevance: 85,
    professionalStandard: 90,
    overallScore: 88,
    issues: [],
    recommendations: []
  }
};

module.exports = {
  PRFrameworkSchema,
  ContradictionSchema,
  ParagraphAdaptationSchema,
  QualityAssessmentSchema,
  SchemaValidators,
  SchemaDefaults
};