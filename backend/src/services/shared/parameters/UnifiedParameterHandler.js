/**
 * UnifiedParameterHandler
 * 
 * Canonical parameter format manager preventing parameter structure loss across
 * Traditional and Strands APIs.
 * 
 * CRITICAL PROBLEM SOLVED:
 * Phase 1 discovered that Strands API fallback at genaiOrchestrator.js:844 uses
 * parameter spreading (...options) which destroys the nested options structure
 * that generateContent() expects, causing options.formats to become undefined
 * and preventing pitch file generation.
 * 
 * SOLUTION:
 * This class establishes a canonical parameter format and provides transformation
 * utilities to/from this format, ensuring parameter structure is preserved across
 * all API calls and fallback scenarios.
 * 
 * @module UnifiedParameterHandler
 * @version 1.0.0
 * @since Phase 2.1
 */

const logger = require('../../../utils/logger').logger;

/**
 * UnifiedParameterHandler Class
 * 
 * Provides static methods for parameter format conversion, validation, and debugging.
 * All methods are static as this is a utility class with no instance state.
 */
class UnifiedParameterHandler {
  /**
   * Canonical parameter format definition
   * This is the single source of truth for parameter structure across all APIs
   * 
   * @static
   * @readonly
   */
  static CANONICAL_FORMAT = {
    // Top-level required fields
    markets: [],        // string[] - ALWAYS array
    masterPR: '',       // string - ALWAYS present, min 100 chars
    dataSource: '',     // 'trusted' | 'tavily' | 'ai' | 'crawler'
    
    // Nested options object (CRITICAL: Keep nested!)
    options: {
      formats: [],           // string[] - ['json', 'pitch', etc]
      validationMode: '',    // string - 'standard' | 'enhanced'
      batchSize: 1,          // number - batch processing size
      timeout: 60,           // number - timeout in seconds
      jobId: '',             // string - if pre-generated
      orchestrationPattern: 'auto', // string - Strands specific
      // ... other options preserved
    }
  };

  /**
   * Convert any input format to canonical format
   * 
   * Handles both nested and flattened parameter structures, reconstructing
   * the proper nested format when parameters have been spread.
   * 
   * CRITICAL: This method fixes the spread operator bug by detecting flattened
   * parameters and reconstructing the nested options structure.
   * 
   * @param {Object} input - Input parameters (any format)
   * @returns {Object} Canonical format parameters
   * 
   * @example
   * // Nested format (already canonical)
   * toCanonical({ 
   *   markets: ['LAX'], 
   *   masterPR: 'content...', 
   *   dataSource: 'trusted',
   *   options: { formats: ['pitch'] }
   * });
   * 
   * @example
   * // Flattened format (needs reconstruction)
   * toCanonical({ 
   *   markets: ['LAX'], 
   *   masterPR: 'content...', 
   *   dataSource: 'trusted',
   *   formats: ['pitch'],  // Will be moved to options
   *   validationMode: 'standard'  // Will be moved to options
   * });
   * 
   * @example
   * // Spread operator scenario (Phase 1 bug)
   * const options = { formats: ['pitch'] };
   * toCanonical({ markets: ['LAX'], masterPR: 'content...', ...options });
   * // Reconstructs: { markets, masterPR, options: { formats: ['pitch'] } }
   */
  static toCanonical(input) {
    // Handle null/undefined input
    if (!input || typeof input !== 'object') {
      input = {};
    }
    
    // Extract top-level required fields with defaults
    const markets = input.markets || [];
    const masterPR = input.masterPR || '';
    const dataSource = input.dataSource || 'trusted';
    
    // Extract options - handle both nested and flattened structures
    let options = {};
    
    if (input.options && typeof input.options === 'object' && input.options !== null) {
      // Already nested - use directly (shallow copy to avoid mutation)
      options = { ...input.options };
    } else {
      // Flattened or missing - reconstruct nested structure
      // Known option fields that should be in options object
      const knownOptionFields = [
        'formats', 'validationMode', 'batchSize', 'timeout', 
        'jobId', 'orchestrationPattern'
      ];
      
      // Extract known fields from top level
      options = {
        formats: input.formats || ['json'],
        validationMode: input.validationMode || 'standard',
        batchSize: input.batchSize !== undefined ? input.batchSize : 1,
        timeout: input.timeout !== undefined ? input.timeout : 60,
        jobId: input.jobId || null,
        orchestrationPattern: input.orchestrationPattern || 'auto'
      };
      
      // Copy any unknown properties to options (preserve custom fields)
      const topLevelFields = ['markets', 'masterPR', 'dataSource'];
      const allKnownFields = [...topLevelFields, ...knownOptionFields, 'options'];
      
      Object.keys(input).forEach(key => {
        if (!allKnownFields.includes(key)) {
          options[key] = input[key];
        }
      });
    }
    
    // Ensure options has required fields with defaults
    if (!options.formats || !Array.isArray(options.formats)) {
      options.formats = ['json'];
    }
    if (!options.validationMode) {
      options.validationMode = 'standard';
    }
    if (options.batchSize === undefined) {
      options.batchSize = 1;
    }
    if (options.timeout === undefined) {
      options.timeout = 60;
    }
    if (!options.orchestrationPattern) {
      options.orchestrationPattern = 'auto';
    }
    
    return {
      markets,
      masterPR,
      dataSource,
      options
    };
  }

  /**
   * Validate canonical parameters
   * 
   * Performs comprehensive validation of parameter structure and values,
   * catching issues before they cause processing failures.
   * 
   * @param {Object} params - Canonical format parameters
   * @returns {Object} { valid: boolean, errors: string[] }
   * 
   * @example
   * const validation = validate(canonicalParams);
   * if (!validation.valid) {
   *   throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
   * }
   */
  static validate(params) {
    const errors = [];
    
    // Required field validation
    if (!params.markets || !Array.isArray(params.markets)) {
      errors.push('markets must be an array');
    }
    
    if (!params.masterPR || typeof params.masterPR !== 'string') {
      errors.push('masterPR must be a non-empty string');
    }
    
    if (params.masterPR && params.masterPR.length < 100) {
      errors.push('masterPR must be at least 100 characters');
    }
    
    if (!params.dataSource || typeof params.dataSource !== 'string') {
      errors.push('dataSource must be a string');
    }
    
    // Options validation
    if (!params.options || typeof params.options !== 'object' || params.options === null) {
      errors.push('options must be an object');
    }
    
    if (params.options && typeof params.options === 'object') {
      if (!Array.isArray(params.options.formats)) {
        errors.push('options.formats must be an array');
      }
      
      if (typeof params.options.validationMode !== 'string') {
        errors.push('options.validationMode must be a string');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert canonical format to Traditional API format
   * 
   * Used when calling Traditional API methods. Preserves nested options structure
   * to prevent the spread operator bug.
   * 
   * CRITICAL: This method ensures options remain NESTED, not flattened.
   * 
   * @param {Object} canonical - Canonical format parameters
   * @returns {Object} Traditional API format
   * 
   * @example
   * const traditional = toTraditionalAPI(canonical);
   * // Returns: { markets, masterPR, dataSource, options: { formats, ... } }
   * // NOT: { markets, masterPR, dataSource, formats, ... } (flattened)
   */
  static toTraditionalAPI(canonical) {
    return {
      markets: canonical.markets,
      masterPR: canonical.masterPR,
      dataSource: canonical.dataSource,
      options: { ...canonical.options } // Keep nested! Shallow copy to avoid mutation
    };
  }

  /**
   * Convert canonical format to Strands API format
   * 
   * Used when calling Strands-specific methods. Moves dataSource into options
   * as Strands API expects it there.
   * 
   * @param {Object} canonical - Canonical format parameters
   * @returns {Object} Strands API format
   * 
   * @example
   * const strands = toStrandsAPI(canonical);
   * // Returns: { masterPR, markets, options: { dataSource, formats, ... } }
   */
  static toStrandsAPI(canonical) {
    return {
      masterPR: canonical.masterPR,
      markets: canonical.markets,
      options: {
        ...canonical.options,
        dataSource: canonical.dataSource // Move to options for Strands
      }
    };
  }

  /**
   * Extract agent-ready parameters from canonical format
   * 
   * Ensures consistent parameter passing to agents with all required fields
   * easily accessible.
   * 
   * @param {Object} canonical - Canonical format parameters
   * @returns {Object} Agent-ready parameters
   * 
   * @example
   * const agentParams = toAgentParams(canonical);
   * // Returns: { jobId, dataSource, markets, formats, validationMode, options }
   */
  static toAgentParams(canonical) {
    return {
      jobId: canonical.options.jobId,
      dataSource: canonical.dataSource,
      markets: canonical.markets,
      formats: canonical.options.formats,
      validationMode: canonical.options.validationMode,
      // Preserve all options for agents that need them
      options: canonical.options
    };
  }

  /**
   * Get default options object
   * 
   * Returns a new default options object for use when options are missing.
   * Each call returns a new object to prevent shared reference issues.
   * 
   * @returns {Object} Default options
   * 
   * @example
   * const defaults = getDefaults();
   * // Returns: { formats: ['json'], validationMode: 'standard', ... }
   */
  static getDefaults() {
    return {
      formats: ['json'],
      validationMode: 'standard',
      batchSize: 1,
      timeout: 60,
      jobId: null,
      orchestrationPattern: 'auto'
    };
  }

  /**
   * Log parameter structure for debugging
   * 
   * CRITICAL for diagnosing parameter loss issues. Logs detailed structure
   * information without exposing sensitive content.
   * 
   * @param {Object} params - Parameters to log
   * @param {string} location - Where parameters are being logged from
   * 
   * @example
   * logStructure(params, 'generateContent-entry');
   * // Logs: hasMarkets, hasOptions, formatsExists, formatsIsArray, etc.
   */
  static logStructure(params, location) {
    if (!params) {
      logger.debug(`[PARAM-DEBUG] ${location}: params is null/undefined`);
      return;
    }
    
    try {
      logger.debug(`[PARAM-DEBUG] ${location}:`, {
        hasMarkets: !!params.markets,
        marketsIsArray: Array.isArray(params.markets),
        marketsLength: params.markets?.length || 0,
        hasMasterPR: !!params.masterPR,
        masterPRLength: params.masterPR?.length || 0,
        hasDataSource: !!params.dataSource,
        dataSourceValue: params.dataSource,
        hasOptions: !!params.options,
        optionsIsObject: typeof params.options === 'object' && params.options !== null,
        optionsKeys: params.options ? Object.keys(params.options) : [],
        formatsExists: params.options?.formats ? true : false,
        formatsIsArray: Array.isArray(params.options?.formats),
        formatsLength: params.options?.formats?.length || 0,
        formatsValue: params.options?.formats
      });
    } catch (error) {
      logger.error(`[PARAM-DEBUG] ${location}: Error logging structure`, { error: error.message });
    }
  }
}

module.exports = UnifiedParameterHandler;