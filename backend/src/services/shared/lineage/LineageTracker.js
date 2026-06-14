/**
 * LineageTracker
 * 
 * Centralized lineage tracking for Traditional and Strands APIs.
 * 
 * CRITICAL FEATURES:
 * - Tracks API calls and parameter transformations
 * - Detects parameter loss (critical for debugging Phase 1 bug)
 * - Tracks output generation phases
 * - Aggregates cost data from variants
 * - Records API fallback events
 * 
 * @module LineageTracker
 * @version 1.0.0
 * @since Phase 2.4
 */

/**
 * LineageTracker Class
 * 
 * Provides centralized lineage tracking methods for both Traditional
 * and Strands APIs to ensure consistent audit trails.
 */
class LineageTracker {
  /**
   * Constructor
   * 
   * @param {Object} dataLineageService - DataLineageService instance
   * @param {Object} logger - Winston logger instance
   * @throws {Error} If required dependencies are missing
   */
  constructor(dataLineageService, logger) {
    if (!dataLineageService) {
      throw new Error('DataLineageService is required for LineageTracker');
    }
    if (!logger) {
      throw new Error('Logger is required for LineageTracker');
    }
    
    this.lineageService = dataLineageService;
    this.logger = logger;
  }

  /**
   * Track API call (Traditional or Strands)
   * 
   * Records the start of an API call with all relevant parameters.
   * Critical for understanding which API path was taken.
   * 
   * @param {string} jobId - Job identifier
   * @param {string} apiType - 'traditional' or 'strands'
   * @param {Object} canonicalParams - Canonical format parameters
   * @returns {Promise<void>}
   * 
   * @example
   * await tracker.trackAPICall('job_123', 'traditional', canonicalParams);
   */
  async trackAPICall(jobId, apiType, canonicalParams) {
    if (!this.lineageService) return;
    
    try {
      await this.lineageService.trackEvent(jobId, 'api_call_started', {
        apiType,
        markets: canonicalParams.markets,
        dataSource: canonicalParams.dataSource,
        formats: canonicalParams.options?.formats || [],
        orchestrationPattern: canonicalParams.options?.orchestrationPattern || 'auto',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to track API call', { jobId, apiType, error: error.message });
      throw error;
    }
  }

  /**
   * Track parameter transformation
   * 
   * CRITICAL for debugging parameter loss issues like the Phase 1 bug.
   * Records parameter structure before and after transformation, detecting
   * if formats array or other critical fields were lost.
   * 
   * @param {string} jobId - Job identifier
   * @param {string} transformation - Transformation type (e.g., 'toCanonical', 'toTraditionalAPI')
   * @param {Object} before - Parameters before transformation
   * @param {Object} after - Parameters after transformation
   * @returns {Promise<void>}
   * 
   * @example
   * await tracker.trackParameterTransformation('job_123', 'toCanonical', before, after);
   */
  async trackParameterTransformation(jobId, transformation, before, after) {
    if (!this.lineageService) return;
    
    try {
      // Detect if formats were preserved
      const beforeFormats = before.formats || before.options?.formats;
      const afterFormats = after.options?.formats;
      const formatsPreserved = beforeFormats === afterFormats || 
                              (Array.isArray(beforeFormats) && Array.isArray(afterFormats) && 
                               beforeFormats.length === afterFormats.length);
      
      // Detect data loss
      const dataLossDetected = !afterFormats && !!beforeFormats;
      
      await this.lineageService.trackEvent(jobId, 'parameter_transformation', {
        transformation,
        beforeKeys: Object.keys(before),
        afterKeys: Object.keys(after),
        formatsPreserved,
        dataLossDetected,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to track parameter transformation', { 
        jobId, 
        transformation, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Track output generation phase
   * 
   * Records completion of narrative or pitch generation phase.
   * 
   * @param {string} jobId - Job identifier
   * @param {string} phase - 'narrative' or 'pitch'
   * @param {Object} result - Generation result
   * @returns {Promise<void>}
   * 
   * @example
   * await tracker.trackOutputGeneration('job_123', 'narrative', result);
   */
  async trackOutputGeneration(jobId, phase, result) {
    if (!this.lineageService) return;
    
    try {
      await this.lineageService.trackEvent(jobId, 'output_generation_complete', {
        phase,
        filesGenerated: result.files?.length || 0,
        formats: Object.keys(result.formats || {}),
        success: result.status === 'completed',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to track output generation', { 
        jobId, 
        phase, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Track API fallback (Strands → Traditional)
   * 
   * CRITICAL for debugging the Phase 1 bug where fallback caused parameter loss.
   * Records when Strands falls back to Traditional and whether parameters
   * were preserved correctly.
   * 
   * @param {string} jobId - Job identifier
   * @param {string} reason - Fallback reason
   * @param {Object} canonicalParams - Parameters being passed to fallback
   * @returns {Promise<void>}
   * 
   * @example
   * await tracker.trackAPIFallback('job_123', 'Strands service unavailable', canonicalParams);
   */
  async trackAPIFallback(jobId, reason, canonicalParams) {
    if (!this.lineageService) return;
    
    try {
      await this.lineageService.trackEvent(jobId, 'api_fallback', {
        from: 'strands',
        to: 'traditional',
        reason,
        parameterStructurePreserved: !!canonicalParams.options,
        formatsPreserved: !!canonicalParams.options?.formats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Failed to track API fallback', { 
        jobId, 
        reason, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Aggregate cost data from variants
   * 
   * Collects and aggregates API costs (Bedrock, Tavily) from all variants
   * for comprehensive cost tracking.
   * 
   * @param {Array} variants - Generated variants with cost data
   * @returns {Object} Aggregated costs
   * 
   * @example
   * const costs = tracker.aggregateCosts(variants);
   * // Returns: { totalCost: 0.15, breakdown: { bedrock: {...}, tavily: {...} } }
   */
  aggregateCosts(variants) {
    const costs = {
      totalCost: 0,
      breakdown: {
        bedrock: { 
          totalCost: 0, 
          totalTokens: 0, 
          agents: [] 
        },
        tavily: { 
          totalCost: 0, 
          totalCredits: 0, 
          operations: [] 
        }
      }
    };
    
    if (!variants || !Array.isArray(variants)) {
      return costs;
    }
    
    for (const variant of variants) {
      if (!variant.cost && !variant._costTracking) continue;
      
      const costData = variant.cost || variant._costTracking;
      
      // Aggregate Bedrock costs (AWS Bedrock API)
      if (costData.inputCost !== undefined && costData.outputCost !== undefined) {
        const bedrockCost = costData.inputCost + costData.outputCost;
        costs.breakdown.bedrock.totalCost += bedrockCost;
        costs.breakdown.bedrock.totalTokens += (costData.inputTokens || 0) + (costData.outputTokens || 0);
        costs.totalCost += bedrockCost;
        
        if (variant.market) {
          costs.breakdown.bedrock.agents.push({
            market: variant.market,
            cost: bedrockCost,
            tokens: (costData.inputTokens || 0) + (costData.outputTokens || 0)
          });
        }
      }
      
      // Aggregate Tavily costs (Tavily Search API)
      if (costData.credits !== undefined) {
        const tavilyCost = costData.totalCost || (costData.credits * 0.008); // $0.008 per credit
        costs.breakdown.tavily.totalCost += tavilyCost;
        costs.breakdown.tavily.totalCredits += costData.credits;
        costs.totalCost += tavilyCost;
        
        if (variant.market) {
          costs.breakdown.tavily.operations.push({
            market: variant.market,
            cost: tavilyCost,
            credits: costData.credits
          });
        }
      }
    }
    
    return costs;
  }
}

module.exports = LineageTracker;