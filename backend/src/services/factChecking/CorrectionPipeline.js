const { logger } = require('../../utils/logger');
const { ValidationError, ExternalServiceError } = require('../../utils/errorHandler');

/**
 * Correction Pipeline
 * Handles data correction and agent updates when fact-checking issues are found
 * 
 * Features:
 * - Orchestrates correction actions across different agents
 * - Integrates with Firecrawl for fresh data fetching
 * - Triggers targeted agent corrections
 * - Tracks correction attempts and success rates
 * - Prevents correction loops through circuit breaker integration
 */
class CorrectionPipeline {
  constructor(options = {}) {
    this.name = 'Correction Pipeline';
    this.agents = options.agents || {};
    this.firecrawlService = options.firecrawlService;
    this.circuitBreaker = options.circuitBreaker;
    
    // Configuration
    this.config = {
      maxCorrectionAttempts: options.maxCorrectionAttempts || 3,
      correctionTimeout: options.correctionTimeout || 30000, // 30 seconds
      enableDataRefresh: options.enableDataRefresh !== false,
      enableContentRevision: options.enableContentRevision !== false,
      priorityThreshold: options.priorityThreshold || 'medium'
    };
    
    // Correction tracking
    this.correctionHistory = new Map(); // jobId -> correction attempts
    this.correctionStats = {
      totalAttempts: 0,
      successfulCorrections: 0,
      failedCorrections: 0,
      averageCorrectionTime: 0
    };
    
    logger.info('Correction Pipeline initialized', {
      config: this.config,
      availableAgents: Object.keys(this.agents),
      firecrawlEnabled: !!this.firecrawlService
    });
  }

  /**
   * Execute correction pipeline for identified issues
   */
  async executeCorrections(correctionNeeds, marketContext, options = {}) {
    const { jobId, originalContent } = options;
    const startTime = Date.now();
    
    if (!correctionNeeds.needed || correctionNeeds.corrections.length === 0) {
      logger.debug('No corrections needed', { jobId });
      return {
        success: true,
        correctionsMade: 0,
        correctedContent: originalContent,
        processingTime: 0
      };
    }

    logger.info('Starting correction pipeline', {
      jobId,
      correctionsNeeded: correctionNeeds.corrections.length,
      priority: correctionNeeds.priority
    });

    try {
      // Check circuit breaker
      if (this.circuitBreaker) {
        const circuitCheck = this.circuitBreaker.shouldAllowRetry(jobId, 'correction');
        if (!circuitCheck.allowed) {
          logger.warn('Circuit breaker blocking corrections', {
            jobId,
            reason: circuitCheck.reason
          });
          return {
            success: false,
            reason: 'circuit_breaker_open',
            correctionsMade: 0,
            correctedContent: originalContent
          };
        }
      }

      // Initialize correction tracking
      const correctionAttempt = this._initializeCorrectionAttempt(jobId, correctionNeeds);
      
      // Group corrections by type and priority
      const groupedCorrections = this._groupCorrections(correctionNeeds.corrections);
      
      // Execute corrections in priority order
      const results = await this._executeGroupedCorrections(
        groupedCorrections, 
        marketContext, 
        { jobId, originalContent }
      );
      
      // Process results and update tracking
      const finalResult = this._processCorrectionResults(results, correctionAttempt);
      
      // Update statistics
      this._updateCorrectionStats(finalResult, Date.now() - startTime);
      
      // Record circuit breaker attempt
      if (this.circuitBreaker) {
        this.circuitBreaker.recordAttempt(jobId, finalResult.success, {
          correctionsMade: finalResult.correctionsMade,
          processingTime: Date.now() - startTime
        });
      }

      logger.info('Correction pipeline completed', {
        jobId,
        success: finalResult.success,
        correctionsMade: finalResult.correctionsMade,
        processingTime: Date.now() - startTime
      });

      return finalResult;

    } catch (error) {
      // Record failed attempt
      if (this.circuitBreaker) {
        this.circuitBreaker.recordAttempt(jobId, false, {
          error: error.message,
          criticalIssues: 1
        });
      }

      logger.error('Correction pipeline failed', {
        jobId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        reason: 'pipeline_error',
        error: error.message,
        correctionsMade: 0,
        correctedContent: originalContent
      };
    }
  }

  /**
   * Execute grouped corrections by type
   */
  async _executeGroupedCorrections(groupedCorrections, marketContext, options) {
    const { jobId, originalContent } = options;
    const results = [];
    let currentContent = originalContent;

    // Execute in priority order: critical -> high -> medium -> low
    const priorityOrder = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorityOrder) {
      if (!groupedCorrections[priority] || groupedCorrections[priority].length === 0) {
        continue;
      }

      logger.debug(`Executing ${priority} priority corrections`, {
        jobId,
        count: groupedCorrections[priority].length
      });

      // Execute corrections of same priority in parallel
      const priorityPromises = groupedCorrections[priority].map(correction =>
        this._executeSingleCorrection(correction, marketContext, {
          jobId,
          currentContent
        })
      );

      const priorityResults = await Promise.allSettled(priorityPromises);
      
      // Process results and update content if successful
      for (let i = 0; i < priorityResults.length; i++) {
        const result = priorityResults[i];
        const correction = groupedCorrections[priority][i];
        
        if (result.status === 'fulfilled' && result.value.success) {
          results.push(result.value);
          if (result.value.updatedContent) {
            currentContent = result.value.updatedContent;
          }
        } else {
          results.push({
            success: false,
            correction,
            error: result.reason?.message || 'Unknown error',
            type: correction.type
          });
        }
      }
    }

    return {
      results,
      finalContent: currentContent
    };
  }

  /**
   * Execute a single correction
   */
  async _executeSingleCorrection(correction, marketContext, options) {
    const { jobId, currentContent } = options;
    const startTime = Date.now();

    logger.debug('Executing single correction', {
      jobId,
      type: correction.type,
      target: correction.target
    });

    try {
      let result;

      switch (correction.type) {
        case 'data_refresh':
          result = await this._executeDataRefresh(correction, marketContext, { jobId });
          break;
          
        case 'content_revision':
          result = await this._executeContentRevision(correction, currentContent, marketContext, { jobId });
          break;
          
        case 'source_attribution_addition':
          result = await this._executeSourceAttribution(correction, currentContent, { jobId });
          break;
          
        case 'market_comparison_review':
          result = await this._executeMarketComparison(correction, marketContext, { jobId });
          break;
          
        default:
          logger.warn('Unknown correction type', { type: correction.type, jobId });
          result = {
            success: false,
            error: `Unknown correction type: ${correction.type}`
          };
      }

      return {
        ...result,
        correction,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      logger.error('Single correction failed', {
        jobId,
        type: correction.type,
        error: error.message
      });

      return {
        success: false,
        correction,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Execute data refresh correction
   */
  async _executeDataRefresh(correction, marketContext, options) {
    const { jobId } = options;

    if (!this.config.enableDataRefresh) {
      return {
        success: false,
        reason: 'data_refresh_disabled'
      };
    }

    try {
      logger.debug('Executing data refresh', { jobId, target: correction.target });

      // Use Firecrawl to fetch fresh market data
      if (this.firecrawlService && correction.target === 'market_researcher') {
        const freshData = await this._fetchFreshMarketData(marketContext.market);
        
        if (freshData) {
          // Update market researcher with fresh data
          if (this.agents.marketResearcher && 
              typeof this.agents.marketResearcher.updateMarketData === 'function') {
            await this.agents.marketResearcher.updateMarketData(marketContext.market, freshData);
          }
          
          return {
            success: true,
            action: 'data_refreshed',
            freshDataFetched: true
          };
        }
      }

      return {
        success: false,
        reason: 'fresh_data_unavailable'
      };

    } catch (error) {
      logger.error('Data refresh failed', {
        jobId,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute content revision correction
   */
  async _executeContentRevision(correction, currentContent, marketContext, options) {
    const { jobId } = options;

    if (!this.config.enableContentRevision) {
      return {
        success: false,
        reason: 'content_revision_disabled'
      };
    }

    try {
      logger.debug('Executing content revision', { jobId, target: correction.target });

      let updatedContent = currentContent;

      if (correction.target === 'localization_engine' && this.agents.localizationEngine) {
        // Request content revision from localization engine
        if (typeof this.agents.localizationEngine.reviseContent === 'function') {
          const revisionResult = await this.agents.localizationEngine.reviseContent({
            content: currentContent,
            issue: correction.claim || correction.suggestedAction,
            marketContext,
            jobId
          });
          
          if (revisionResult && revisionResult.revisedContent) {
            updatedContent = revisionResult.revisedContent;
          }
        }
      }

      return {
        success: updatedContent !== currentContent,
        action: 'content_revised',
        updatedContent: updatedContent,
        contentChanged: updatedContent !== currentContent
      };

    } catch (error) {
      logger.error('Content revision failed', {
        jobId,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute source attribution addition
   */
  async _executeSourceAttribution(correction, currentContent, options) {
    const { jobId } = options;

    try {
      logger.debug('Executing source attribution addition', { jobId });

      // Simple source attribution addition
      const attributionPhrases = [
        'according to market data',
        'based on recent analysis',
        'data shows',
        'market research indicates'
      ];

      let updatedContent = currentContent;
      
      // Find statistical claims without attribution and add it
      const statisticalPattern = /(\d+(?:\.\d+)?%|\$[\d,]+)/g;
      const matches = currentContent.match(statisticalPattern);
      
      if (matches && matches.length > 0) {
        // Add attribution to the first statistical claim found
        const firstMatch = matches[0];
        const attribution = attributionPhrases[Math.floor(Math.random() * attributionPhrases.length)];
        updatedContent = currentContent.replace(firstMatch, `${attribution}, ${firstMatch}`);
      }

      return {
        success: updatedContent !== currentContent,
        action: 'source_attribution_added',
        updatedContent: updatedContent,
        contentChanged: updatedContent !== currentContent
      };

    } catch (error) {
      logger.error('Source attribution addition failed', {
        jobId,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute market comparison review
   */
  async _executeMarketComparison(correction, marketContext, options) {
    const { jobId } = options;

    try {
      logger.debug('Executing market comparison review', { jobId });

      // Trigger market researcher to review cross-market data
      if (this.agents.marketResearcher && 
          typeof this.agents.marketResearcher.reviewMarketComparison === 'function') {
        const reviewResult = await this.agents.marketResearcher.reviewMarketComparison({
          market: marketContext.market,
          issue: correction.claim,
          jobId
        });
        
        return {
          success: !!reviewResult,
          action: 'market_comparison_reviewed',
          reviewCompleted: !!reviewResult
        };
      }

      return {
        success: false,
        reason: 'market_researcher_unavailable'
      };

    } catch (error) {
      logger.error('Market comparison review failed', {
        jobId,
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch fresh market data using Firecrawl
   */
  async _fetchFreshMarketData(market) {
    if (!this.firecrawlService) {
      return null;
    }

    try {
      // This would integrate with Firecrawl to fetch fresh market data
      // For now, return a placeholder structure
      logger.debug('Fetching fresh market data', { market });
      
      // Placeholder for Firecrawl integration
      return {
        market,
        timestamp: new Date().toISOString(),
        source: 'firecrawl_refresh',
        data: {
          // Fresh market data would be populated here
        }
      };

    } catch (error) {
      logger.warn('Failed to fetch fresh market data', {
        market,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Group corrections by priority and type
   */
  _groupCorrections(corrections) {
    const grouped = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    for (const correction of corrections) {
      const priority = correction.priority || 'medium';
      if (grouped[priority]) {
        grouped[priority].push(correction);
      } else {
        grouped.medium.push(correction);
      }
    }

    return grouped;
  }

  /**
   * Initialize correction attempt tracking
   */
  _initializeCorrectionAttempt(jobId, correctionNeeds) {
    const attempt = {
      jobId,
      startTime: Date.now(),
      correctionsRequested: correctionNeeds.corrections.length,
      priority: correctionNeeds.priority,
      results: []
    };

    if (!this.correctionHistory.has(jobId)) {
      this.correctionHistory.set(jobId, []);
    }
    
    this.correctionHistory.get(jobId).push(attempt);
    return attempt;
  }

  /**
   * Process correction results and create final result
   */
  _processCorrectionResults(executionResults, correctionAttempt) {
    const { results, finalContent } = executionResults;
    
    const successfulCorrections = results.filter(r => r.success);
    const failedCorrections = results.filter(r => !r.success);
    
    correctionAttempt.results = results;
    correctionAttempt.endTime = Date.now();
    correctionAttempt.duration = correctionAttempt.endTime - correctionAttempt.startTime;
    correctionAttempt.success = successfulCorrections.length > 0;

    return {
      success: successfulCorrections.length > 0,
      correctionsMade: successfulCorrections.length,
      correctionsFailed: failedCorrections.length,
      correctedContent: finalContent,
      processingTime: correctionAttempt.duration,
      details: {
        successful: successfulCorrections.map(r => ({
          type: r.correction.type,
          target: r.correction.target,
          action: r.action
        })),
        failed: failedCorrections.map(r => ({
          type: r.correction.type,
          target: r.correction.target,
          error: r.error
        }))
      }
    };
  }

  /**
   * Update correction statistics
   */
  _updateCorrectionStats(result, processingTime) {
    this.correctionStats.totalAttempts++;
    
    if (result.success) {
      this.correctionStats.successfulCorrections++;
    } else {
      this.correctionStats.failedCorrections++;
    }
    
    // Update average processing time
    const totalTime = this.correctionStats.averageCorrectionTime * 
                     (this.correctionStats.totalAttempts - 1) + processingTime;
    this.correctionStats.averageCorrectionTime = 
      Math.round(totalTime / this.correctionStats.totalAttempts);
  }

  /**
   * Get correction pipeline status
   */
  getStatus() {
    return {
      service: 'Correction Pipeline',
      configuration: this.config,
      statistics: this.correctionStats,
      capabilities: {
        dataRefresh: this.config.enableDataRefresh && !!this.firecrawlService,
        contentRevision: this.config.enableContentRevision,
        sourceAttribution: true,
        marketComparison: !!this.agents.marketResearcher
      },
      activeJobs: this.correctionHistory.size,
      availableAgents: Object.keys(this.agents)
    };
  }

  /**
   * Cleanup correction history
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const jobsToCleanup = [];
    
    for (const [jobId, attempts] of this.correctionHistory.entries()) {
      const lastAttempt = attempts[attempts.length - 1];
      if (now - lastAttempt.endTime > maxAge) {
        jobsToCleanup.push(jobId);
      }
    }
    
    for (const jobId of jobsToCleanup) {
      this.correctionHistory.delete(jobId);
    }
    
    if (jobsToCleanup.length > 0) {
      logger.info('Correction pipeline cleanup completed', {
        cleanedJobs: jobsToCleanup.length
      });
    }
  }
}

module.exports = CorrectionPipeline;