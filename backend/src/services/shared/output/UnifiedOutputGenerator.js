/**
 * UnifiedOutputGenerator
 * 
 * Shared dual output generation (narrative + pitch) for API consistency between
 * Traditional and Strands APIs.
 * 
 * CRITICAL PROBLEM SOLVED:
 * Ensures both Traditional and Strands APIs produce identical dual outputs
 * (narrative + pitch files) when pitch format is requested, preventing the
 * missing pitch file bug discovered in Phase 1.
 * 
 * KEY FEATURES:
 * - Always generates BOTH narrative AND pitch when pitch format requested
 * - Consistent file naming across all APIs
 * - Comprehensive validation of output completeness
 * - Detailed logging for debugging dual output issues
 * 
 * @module UnifiedOutputGenerator
 * @version 1.0.0
 * @since Phase 2.2
 */

/**
 * UnifiedOutputGenerator Class
 * 
 * Provides unified dual output generation logic used by both Traditional
 * and Strands APIs to ensure consistent file generation.
 */
class UnifiedOutputGenerator {
  /**
   * Constructor
   * 
   * @param {Object} outputFormatter - OutputFormatter agent instance
   * @param {Object} pitchEmailExtractor - PitchEmailExtractor agent instance (optional)
   * @param {Object} logger - Winston logger instance
   * @throws {Error} If required dependencies are missing
   */
  constructor(outputFormatter, pitchEmailExtractor, logger) {
    if (!outputFormatter) {
      throw new Error('OutputFormatter is required for UnifiedOutputGenerator');
    }
    if (!logger) {
      throw new Error('Logger is required for UnifiedOutputGenerator');
    }
    
    this.outputFormatter = outputFormatter;
    this.pitchEmailExtractor = pitchEmailExtractor;
    this.logger = logger;
  }

  /**
   * Generate dual outputs (narrative + pitch)
   * 
   * CRITICAL: Always generates BOTH files when pitch format requested.
   * This is the core method that prevents the Phase 1 missing pitch file bug.
   * 
   * Process:
   * 1. Generate narrative/PR variant files FIRST
   * 2. If pitch requested, generate pitch emails from narratives
   * 3. Merge outputs and validate completeness
   * 
   * @param {Array} variants - Generated content variants
   * @param {Object} canonicalParams - Canonical format parameters
   * @returns {Promise<Object>} { files: [], formats: {}, variants: [] }
   * @throws {Error} If pitch generation fails or no variants available
   * 
   * @example
   * const outputs = await generator.generateDualOutputs(variants, {
   *   markets: ['LAX'],
   *   masterPR: 'content...',
   *   dataSource: 'trusted',
   *   options: { formats: ['pitch'], jobId: 'job123' }
   * });
   * // Returns: { files: [narrative, pitch], formats: {json: true, pitch: true} }
   */
  async generateDualOutputs(variants, canonicalParams) {
    const { options } = canonicalParams;
    const requestedFormats = options.formats || ['json'];
    const hasPitchRequest = requestedFormats.includes('pitch');
    
    this.logger.info('🔄 UNIFIED OUTPUT: Starting dual output generation', {
      jobId: options.jobId,
      requestedFormats,
      hasPitchRequest,
      variantCount: variants.length
    });
    
    let finalOutputs = {
      files: [],
      formats: {},
      variants: []
    };
    
    // Step 1: Generate narrative/PR variant files FIRST
    // When pitch is requested, we still need narrative files first
    const narrativeFormats = hasPitchRequest ? ['json'] : requestedFormats;
    
    this.logger.info('🔄 UNIFIED OUTPUT: Step 1 - Generating narrative files', {
      jobId: options.jobId,
      narrativeFormats,
      reason: hasPitchRequest ? 'Pitch requires narrative first' : 'Regular generation'
    });
    
    const narrativeOutputs = await this.outputFormatter.execute({
      method: 'formatContent',
      input: variants,
      options: {
        ...options,
        formats: narrativeFormats,
        phase: 'narrative'
      }
    });
    
    // Preserve narrative outputs and variants for pitch generation
    finalOutputs = {
      files: narrativeOutputs.files || [],
      formats: narrativeOutputs.formats || {},
      variants: narrativeOutputs.variants || variants // Preserve variants
    };
    
    // Step 2: Generate pitch emails if requested
    if (hasPitchRequest) {
      this.logger.info('🔄 UNIFIED OUTPUT: Step 2 - Generating pitch emails', {
        jobId: options.jobId,
        variantsAvailable: finalOutputs.variants?.length || 0
      });
      
      // Validate variants are available for pitch generation
      if (!finalOutputs.variants || finalOutputs.variants.length === 0) {
        this.logger.error('❌ UNIFIED OUTPUT: No variants available for pitch generation', {
          jobId: options.jobId,
          narrativeOutputsKeys: Object.keys(narrativeOutputs)
        });
        throw new Error('UNIFIED OUTPUT ERROR: No variants available for pitch generation');
      }
      
      // Generate pitch emails
      const pitchOutputs = await this.outputFormatter.execute({
        method: 'formatContent',
        input: finalOutputs.variants,
        options: {
          ...options,
          formats: ['pitch'],
          phase: 'pitch',
          masterPR: canonicalParams.masterPR // Required for pitch context
        }
      });
      
      // Step 3: Merge outputs
      if (pitchOutputs && pitchOutputs.files && pitchOutputs.files.length > 0) {
        // Merge files and formats
        finalOutputs.files = [...(finalOutputs.files || []), ...pitchOutputs.files];
        finalOutputs.formats = { 
          ...(finalOutputs.formats || {}), 
          ...pitchOutputs.formats 
        };
        
        // Log successful dual output generation
        const narrativeFiles = finalOutputs.files.filter(f => !f.fileName?.includes('pitch'));
        const pitchFiles = finalOutputs.files.filter(f => f.fileName?.includes('pitch'));
        
        this.logger.info('✅ UNIFIED OUTPUT: Dual output generation complete', {
          jobId: options.jobId,
          narrativeFiles: narrativeFiles.length,
          pitchFiles: pitchFiles.length,
          totalFiles: finalOutputs.files.length
        });
      } else {
        // Pitch generation failed
        this.logger.error('❌ UNIFIED OUTPUT: Pitch generation failed', {
          jobId: options.jobId,
          pitchOutputsStatus: pitchOutputs?.status,
          pitchOutputsKeys: pitchOutputs ? Object.keys(pitchOutputs) : [],
          pitchOutputsFilesLength: pitchOutputs?.files?.length || 0
        });
        
        throw new Error('UNIFIED OUTPUT ERROR: Pitch generation returned no files');
      }
    }
    
    return finalOutputs;
  }

  /**
   * Validate output completeness
   * 
   * Ensures expected files were generated based on requested formats.
   * Critical for catching missing file generation issues.
   * 
   * @param {Object} outputs - Generated outputs
   * @param {Object} canonicalParams - Original request parameters
   * @returns {Object} { valid: boolean, missing: string[] }
   * 
   * @example
   * const validation = generator.validateOutputs(outputs, canonicalParams);
   * if (!validation.valid) {
   *   console.error('Missing files:', validation.missing);
   * }
   */
  validateOutputs(outputs, canonicalParams) {
    const { options } = canonicalParams;
    const requestedFormats = options.formats || ['json'];
    const missing = [];
    
    // Handle null/undefined outputs
    if (!outputs || !outputs.files) {
      if (requestedFormats.includes('json') || requestedFormats.includes('pitch')) {
        missing.push('narrative files');
      }
      if (requestedFormats.includes('pitch')) {
        missing.push('pitch files');
      }
      return {
        valid: false,
        missing
      };
    }
    
    // Check narrative files
    if (requestedFormats.includes('json') || requestedFormats.includes('pitch')) {
      const narrativeCount = outputs.files.filter(f => !f.fileName?.includes('pitch')).length;
      if (narrativeCount === 0) {
        missing.push('narrative files');
      }
    }
    
    // Check pitch files
    if (requestedFormats.includes('pitch')) {
      const pitchCount = outputs.files.filter(f => f.fileName?.includes('pitch')).length;
      if (pitchCount === 0) {
        missing.push('pitch files');
      }
    }
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Generate file name using consistent pattern
   * 
   * Prevents file naming inconsistencies across APIs by providing
   * a single standardized naming function.
   * 
   * Pattern:
   * - Narrative: Market_Name.json
   * - Pitch: Market_Name_pitch.json
   * 
   * @param {string} market - Market name
   * @param {string} format - File format ('json' or 'pitch')
   * @returns {string} Standardized file name
   * 
   * @example
   * generateFileName('Los Angeles-Long Beach-Anaheim', 'json')
   * // Returns: 'Los_Angeles_Long_Beach_Anaheim.json'
   * 
   * generateFileName('Los Angeles-Long Beach-Anaheim', 'pitch')
   * // Returns: 'Los_Angeles_Long_Beach_Anaheim_pitch.json'
   */
  static generateFileName(market, format) {
    // Standardize market name (replace spaces and hyphens with underscores)
    const sanitizedMarket = market
      .replace(/\s+/g, '_')      // Replace one or more spaces with single underscore
      .replace(/-/g, '_');        // Replace hyphens with underscores
    
    // Generate file name based on format
    if (format === 'pitch') {
      return `${sanitizedMarket}_pitch.json`;
    } else {
      return `${sanitizedMarket}.json`;
    }
  }
}

module.exports = UnifiedOutputGenerator;