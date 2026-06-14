/**
 * Schema definitions for data lineage events
 * Provides validation and structure for all lineage tracking events
 */
const lineageEventSchemas = {
  /**
   * Data extraction event schema
   * Tracks initial data extraction from external sources
   */
  DATA_EXTRACTION: {
    required: ['jobId', 'dataId', 'sourceType', 'dataType', 'extractedValue'],
    optional: ['sourceUrl', 'rawData', 'geographicScope', 'metadata', 'confidence', 'masterPRId', 'method'],
    eventType: 'DATA_EXTRACTION',
    description: 'Initial data extraction from external sources (Perplexity, market data sources, etc.)'
  },
  
  /**
   * API call event schema
   * Tracks all external API interactions
   */
  API_CALL: {
    required: ['jobId', 'dataId', 'apiService', 'responseStatus', 'responseHandlingStatus'],
    optional: ['endpoint', 'requestPayload', 'responseSize', 'responseTime', 'errorDetails', 'retryAttempts', 'circuitBreakerStatus'],
    eventType: 'API_CALL',
    description: 'External API calls to services like Perplexity, exampleCompany, AWS Bedrock'
  },
  
  /**
   * Source verification event schema
   * Tracks data validation and verification processes
   */
  SOURCE_VERIFICATION: {
    required: ['jobId', 'dataId', 'verificationType', 'verificationStatus'],
    optional: ['sourcesQueried', 'confidenceScore', 'discrepanciesFound', 'geographicScopeValidation', 'verificationResults'],
    eventType: 'SOURCE_VERIFICATION',
    description: 'Data validation and cross-source verification processes'
  },
  
  /**
   * Agent decision event schema
   * Tracks agent processing decisions and transformations
   */
  AGENT_DECISION: {
    required: ['jobId', 'dataId', 'agentName', 'decision', 'decisionRationale'],
    optional: ['claudeReasoning', 'inputData', 'outputData', 'transformationsApplied', 'agentVersion', 'processingStep', 'qualityScore', 'confidenceLevel'],
    eventType: 'AGENT_DECISION',
    description: 'Agent processing decisions including Claude reasoning and data transformations'
  },
  
  /**
   * Narrative integration event schema
   * Tracks final data integration into deliverables
   */
  NARRATIVE_INTEGRATION: {
    required: ['jobId', 'dataId', 'integrationStatus', 'narrativeSection'],
    optional: ['finalValue', 'contextUsed', 'deliverableFiles', 'utilizationPercentage', 'integrationMethod'],
    eventType: 'NARRATIVE_INTEGRATION',
    description: 'Final integration of data into narrative deliverables'
  }
};

/**
 * Validate lineage event against schema
 * @param {string} eventType - Type of lineage event
 * @param {Object} event - Event data to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validateLineageEvent(eventType, event) {
  const schema = lineageEventSchemas[eventType];
  
  if (!schema) {
    return {
      isValid: false,
      errors: [`Unknown lineage event type: ${eventType}`],
      eventType
    };
  }
  
  const errors = [];
  
  // Check required fields
  for (const field of schema.required) {
    if (!event.hasOwnProperty(field) || event[field] === null || event[field] === undefined) {
      errors.push(`Missing required field: ${field} for event type: ${eventType}`);
    }
  }
  
  // Validate specific field types and constraints
  if (event.jobId && typeof event.jobId !== 'string') {
    errors.push('jobId must be a string');
  }
  
  if (event.dataId && typeof event.dataId !== 'string') {
    errors.push('dataId must be a string');
  }
  
  if (event.timestamp && !isValidISO8601(event.timestamp)) {
    errors.push('timestamp must be a valid ISO 8601 date string');
  }
  
  // Event-specific validations
  switch (eventType) {
    case 'DATA_EXTRACTION':
      if (event.sourceType && !['perplexity', 'Example Company', 'competitor2', 'Competitor One', 'census', 'trusted_data'].includes(event.sourceType)) {
        errors.push('sourceType must be one of: perplexity, exampleCompany, competitor2, Competitor One, census, trusted_data');
      }
      if (event.method && !['api_call', 'web_scraping', 'ai_search', 'file_read'].includes(event.method)) {
        errors.push('method must be one of: api_call, web_scraping, ai_search, file_read');
      }
      break;
      
    case 'API_CALL':
      if (event.responseStatus && (typeof event.responseStatus !== 'number' || event.responseStatus < 100 || event.responseStatus > 599)) {
        errors.push('responseStatus must be a valid HTTP status code (100-599)');
      }
      if (event.responseHandlingStatus && !['processed', 'ignored', 'error', 'cached'].includes(event.responseHandlingStatus)) {
        errors.push('responseHandlingStatus must be one of: processed, ignored, error, cached');
      }
      break;
      
    case 'SOURCE_VERIFICATION':
      if (event.verificationType && !['cross_validation', 'geographic_scope', 'temporal_alignment', 'statistical_check'].includes(event.verificationType)) {
        errors.push('verificationType must be one of: cross_validation, geographic_scope, temporal_alignment, statistical_check');
      }
      if (event.verificationStatus && !['PASSED', 'FAILED', 'WARNING', 'SKIPPED'].includes(event.verificationStatus)) {
        errors.push('verificationStatus must be one of: PASSED, FAILED, WARNING, SKIPPED');
      }
      break;
      
    case 'AGENT_DECISION':
      if (event.decision && !['INCLUDE', 'EXCLUDE', 'MODIFY', 'TRANSFORM'].includes(event.decision)) {
        errors.push('decision must be one of: INCLUDE, EXCLUDE, MODIFY, TRANSFORM');
      }
      if (event.qualityScore && (typeof event.qualityScore !== 'number' || event.qualityScore < 0 || event.qualityScore > 100)) {
        errors.push('qualityScore must be a number between 0 and 100');
      }
      break;
      
    case 'NARRATIVE_INTEGRATION':
      if (event.integrationStatus && !['INTEGRATED', 'EXCLUDED', 'MODIFIED', 'PENDING'].includes(event.integrationStatus)) {
        errors.push('integrationStatus must be one of: INTEGRATED, EXCLUDED, MODIFIED, PENDING');
      }
      if (event.utilizationPercentage && (typeof event.utilizationPercentage !== 'number' || event.utilizationPercentage < 0 || event.utilizationPercentage > 100)) {
        errors.push('utilizationPercentage must be a number between 0 and 100');
      }
      break;
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    eventType,
    schema: schema.description
  };
}

/**
 * Check if string is valid ISO 8601 date
 * @param {string} dateString - Date string to validate
 * @returns {boolean} True if valid ISO 8601 date
 */
function isValidISO8601(dateString) {
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString;
  } catch (error) {
    return false;
  }
}

/**
 * Get schema information for event type
 * @param {string} eventType - Event type to get schema for
 * @returns {Object|null} Schema information or null if not found
 */
function getEventSchema(eventType) {
  return lineageEventSchemas[eventType] || null;
}

/**
 * Get all available event types
 * @returns {Array} Array of available event type names
 */
function getAvailableEventTypes() {
  return Object.keys(lineageEventSchemas);
}

/**
 * Create template event object for given type
 * @param {string} eventType - Event type to create template for
 * @param {string} jobId - Job ID for the event
 * @param {string} dataId - Data ID for the event
 * @returns {Object|null} Template event object or null if invalid type
 */
function createEventTemplate(eventType, jobId, dataId) {
  const schema = lineageEventSchemas[eventType];
  if (!schema) {
    return null;
  }
  
  const template = {
    eventType,
    jobId,
    dataId,
    timestamp: new Date().toISOString()
  };
  
  // Add required fields with placeholder values
  schema.required.forEach(field => {
    if (!template.hasOwnProperty(field)) {
      switch (field) {
        case 'sourceType':
          template[field] = 'unknown';
          break;
        case 'dataType':
          template[field] = 'unknown';
          break;
        case 'extractedValue':
          template[field] = null;
          break;
        case 'apiService':
          template[field] = 'unknown';
          break;
        case 'responseStatus':
          template[field] = 200;
          break;
        case 'responseHandlingStatus':
          template[field] = 'processed';
          break;
        case 'verificationType':
          template[field] = 'cross_validation';
          break;
        case 'verificationStatus':
          template[field] = 'PASSED';
          break;
        case 'agentName':
          template[field] = 'unknown';
          break;
        case 'decision':
          template[field] = 'INCLUDE';
          break;
        case 'decisionRationale':
          template[field] = 'No rationale provided';
          break;
        case 'integrationStatus':
          template[field] = 'INTEGRATED';
          break;
        case 'narrativeSection':
          template[field] = 'unknown';
          break;
        default:
          template[field] = null;
      }
    }
  });
  
  // Add metadata object for optional fields
  template.metadata = {};
  
  return template;
}

module.exports = {
  lineageEventSchemas,
  validateLineageEvent,
  getEventSchema,
  getAvailableEventTypes,
  createEventTemplate
};