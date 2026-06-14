/**
 * Data Lineage Service - Core service for managing and retrieving lineage data
 * Handles reading lineage files from storage and aggregating data for analysis
 *
 * Phase 4 S3 Migration: Migrated to use S3StorageService for persistent lineage tracking
 */
const fs = require('fs');
const path = require('path');
const S3StorageService = require('./s3StorageService');
const FileSystemStorageService = require('./fileSystemStorageService');

class DataLineageService {
  constructor() {
    // Respect STORAGE_TYPE environment variable for dual-mode support
    const storageType = process.env.STORAGE_TYPE || 'local';
    
    if (storageType === 'local') {
      this.storage = new FileSystemStorageService();
      console.log(`[DEBUG] DataLineageService initialized with FileSystemStorageService for local development`);
    } else {
      this.storage = new S3StorageService();
      console.log(`[DEBUG] DataLineageService initialized with S3StorageService for cloud deployment (environment: ${this.storage.environment})`);
    }
    
    // Keep filesystem path for backward compatibility during migration
    this.storageBasePath = path.join(__dirname, '../../storage/generated');
  }

  /**
   * Initialize the Data Lineage Service
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('[DEBUG] DataLineageService.initialize - starting initialization');
      
      // Ensure storage directory exists
      if (!fs.existsSync(this.storageBasePath)) {
        fs.mkdirSync(this.storageBasePath, { recursive: true });
        console.log(`[DEBUG] DataLineageService.initialize - created storage directory: ${this.storageBasePath}`);
      }
      
      console.log('[DEBUG] DataLineageService.initialize - initialization completed successfully');
    } catch (error) {
      console.error('[ERROR] DataLineageService.initialize - initialization failed:', error);
      throw error;
    }
  }

  /**
   * Track data extraction event
   * @param {string} jobId - The job ID
   * @param {string} dataId - The data identifier
   * @param {Object} extractionEvent - The extraction event data
   * @returns {Promise<void>}
   */
  async trackDataExtraction(jobId, dataId, extractionEvent) {
    try {
      console.log(`[DEBUG] DataLineageService.trackDataExtraction - jobId: ${jobId}, dataId: ${dataId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        dataId: dataId,
        eventType: 'DATA_EXTRACTION',
        ...extractionEvent
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'data_extraction', dataId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackDataExtraction - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackDataExtraction - failed:`, error);
      throw error;
    }
  }

  /**
   * Track workflow stage event
   * @param {string} jobId - The job ID
   * @param {string} stage - The workflow stage
   * @param {Object} stageData - The stage event data
   * @returns {Promise<void>}
   */
  async trackWorkflowStage(jobId, stage, stageData = {}) {
    try {
      console.log(`[DEBUG] DataLineageService.trackWorkflowStage - jobId: ${jobId}, stage: ${stage}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'WORKFLOW_STAGE',
        stage: stage,
        ...stageData
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'workflow_stage', stage);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackWorkflowStage - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackWorkflowStage - failed:`, error);
      throw error;
    }
  }

  /**
   * Track job start event
   * @param {string} jobId - The job ID
   * @param {Object} jobData - The job start data
   * @returns {Promise<void>}
   */
  async trackJobStart(jobId, jobData = {}) {
    try {
      console.log(`[DEBUG] DataLineageService.trackJobStart - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'JOB_STARTED',
        ...jobData
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'job_start');
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackJobStart - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackJobStart - failed:`, error);
      throw error;
    }
  }

  /**
   * Track job completion event
   * @param {string} jobId - The job ID
   * @param {Object} completionData - The job completion data
   * @returns {Promise<void>}
   */
  async trackJobCompletion(jobId, completionData = {}) {
    try {
      console.log(`[DEBUG] DataLineageService.trackJobCompletion - jobId: ${jobId}`);
      
      const jobPath = path.join(this.storageBasePath, jobId);
      const lineagePath = path.join(jobPath, 'lineage');
      
      // Ensure directories exist
      if (!fs.existsSync(jobPath)) {
        fs.mkdirSync(jobPath, { recursive: true });
      }
      if (!fs.existsSync(lineagePath)) {
        fs.mkdirSync(lineagePath, { recursive: true });
      }
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'JOB_COMPLETED',
        ...completionData
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'job_complete');
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackJobCompletion - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackJobCompletion - failed:`, error);
      throw error;
    }
  }

  /**
   * Track generic event (alias for trackWorkflowStage with more flexibility)
   * @param {string} jobId - The job ID
   * @param {string} eventType - The event type
   * @param {Object} eventData - The event data
   * @returns {Promise<void>}
   */
  async trackEvent(jobId, eventType, eventData = {}) {
    try {
      console.log(`[DEBUG] DataLineageService.trackEvent - jobId: ${jobId}, eventType: ${eventType}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: eventType.toUpperCase(),
        ...eventData
      };
      
      // Phase 4 S3 Migration: Use workflow_stage as the event type for generic events
      const s3Key = this.storage.buildLineageEventKey(jobId, 'workflow_stage', eventType);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackEvent - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackEvent - failed:`, error);
      throw error;
    }
  }

  /**
   * Track job completion (alias for trackJobCompletion)
   * @param {string} jobId - The job ID
   * @param {Object} completionData - The completion data
   * @returns {Promise<void>}
   */
  async trackJobComplete(jobId, completionData = {}) {
    return this.trackJobCompletion(jobId, completionData);
  }

  /**
   * Track job failure
   * @param {string} jobId - The job ID
   * @param {Object} failureData - The failure data
   * @returns {Promise<void>}
   */
  async trackJobFailure(jobId, failureData = {}) {
    try {
      console.log(`[DEBUG] DataLineageService.trackJobFailure - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'JOB_FAILED',
        ...failureData
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'job_complete');
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackJobFailure - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackJobFailure - failed:`, error);
      // Don't throw on failure tracking to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackJobFailure - continuing despite tracking failure`);
    }
  }

  /**
   * Track Perplexity data object request
   * @param {string} jobId - The job ID
   * @param {Object} dataObjectRequest - The data object request details
   * @returns {Promise<void>}
   */
  async trackPerplexityDataObjectRequest(jobId, dataObjectRequest) {
    try {
      console.log(`[DEBUG] DataLineageService.trackPerplexityDataObjectRequest - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'PERPLEXITY_DATA_OBJECT_REQUEST',
        dataObjectId: dataObjectRequest.dataObjectId,
        dataPointType: dataObjectRequest.dataPointType,
        dataPointCategory: dataObjectRequest.dataPointCategory,
        searchQuery: dataObjectRequest.searchQuery,
        requestTimestamp: dataObjectRequest.requestTimestamp
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'perplexity_request', dataObjectRequest.dataObjectId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackPerplexityDataObjectRequest - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackPerplexityDataObjectRequest - failed:`, error);
      // Don't throw on tracking failure to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackPerplexityDataObjectRequest - continuing despite tracking failure`);
    }
  }

  /**
   * Track Perplexity data object response
   * @param {string} jobId - The job ID
   * @param {Object} dataObjectResponse - The data object response details
   * @returns {Promise<void>}
   */
  async trackPerplexityDataObjectResponse(jobId, dataObjectResponse) {
    try {
      console.log(`[DEBUG] DataLineageService.trackPerplexityDataObjectResponse - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'PERPLEXITY_DATA_OBJECT_RESPONSE',
        dataObjectId: dataObjectResponse.dataObjectId,
        success: dataObjectResponse.success,
        responseSize: dataObjectResponse.responseSize,
        duration: dataObjectResponse.duration,
        responseTimestamp: dataObjectResponse.responseTimestamp,
        errorMessage: dataObjectResponse.errorMessage || null
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'perplexity_response', dataObjectResponse.dataObjectId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackPerplexityDataObjectResponse - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackPerplexityDataObjectResponse - failed:`, error);
      // Don't throw on tracking failure to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackPerplexityDataObjectResponse - continuing despite tracking failure`);
    }
  }

  /**
   * Track Tavily data object request
   * @param {string} jobId - The job ID
   * @param {Object} dataObjectRequest - The data object request details
   * @returns {Promise<void>}
   */
  async trackTavilyDataObjectRequest(jobId, dataObjectRequest) {
    try {
      console.log(`[DEBUG] DataLineageService.trackTavilyDataObjectRequest - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'TAVILY_DATA_OBJECT_REQUEST',
        dataObjectId: dataObjectRequest.dataObjectId,
        dataPointType: dataObjectRequest.dataPointType,
        dataPointCategory: dataObjectRequest.dataPointCategory,
        searchQuery: dataObjectRequest.searchQuery,
        searchMethod: dataObjectRequest.searchMethod, // 'search', 'extract', 'crawl', 'map'
        searchDepth: dataObjectRequest.searchDepth,
        requestTimestamp: dataObjectRequest.requestTimestamp
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'tavily_request', dataObjectRequest.dataObjectId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackTavilyDataObjectRequest - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackTavilyDataObjectRequest - failed:`, error);
      // Don't throw on tracking failure to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackTavilyDataObjectRequest - continuing despite tracking failure`);
    }
  }

  /**
   * Track Tavily data object response
   * @param {string} jobId - The job ID
   * @param {Object} dataObjectResponse - The data object response details
   * @returns {Promise<void>}
   */
  async trackTavilyDataObjectResponse(jobId, dataObjectResponse) {
    try {
      console.log(`[DEBUG] DataLineageService.trackTavilyDataObjectResponse - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'TAVILY_DATA_OBJECT_RESPONSE',
        dataObjectId: dataObjectResponse.dataObjectId,
        success: dataObjectResponse.success,
        searchMethod: dataObjectResponse.searchMethod,
        responseSize: dataObjectResponse.responseSize,
        resultsCount: dataObjectResponse.resultsCount,
        duration: dataObjectResponse.duration,
        responseTimestamp: dataObjectResponse.responseTimestamp,
        errorMessage: dataObjectResponse.errorMessage || null
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'tavily_response', dataObjectResponse.dataObjectId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackTavilyDataObjectResponse - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackTavilyDataObjectResponse - failed:`, error);
      // Don't throw on tracking failure to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackTavilyDataObjectResponse - continuing despite tracking failure`);
    }
  }

  /**
   * Track data object utilization in final narrative
   * @param {string} jobId - The job ID
   * @param {Object} utilizationData - The utilization details
   * @returns {Promise<void>}
   */
  async trackDataObjectUtilization(jobId, utilizationData) {
    try {
      console.log(`[DEBUG] DataLineageService.trackDataObjectUtilization - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Create lineage event
      const lineageEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'DATA_OBJECT_UTILIZATION',
        dataObjectId: utilizationData.dataObjectId,
        sourceType: utilizationData.sourceType, // 'perplexity', 'firecrawl', 'trusted'
        usedInNarrative: utilizationData.usedInNarrative || utilizationData.utilized, // Support both field names for backward compatibility
        utilizationContext: utilizationData.utilizationContext,
        narrativeSection: utilizationData.narrativeSection || null,
        confidenceScore: utilizationData.confidenceScore || null
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageEventKey
      const s3Key = this.storage.buildLineageEventKey(jobId, 'utilization', utilizationData.dataObjectId);
      await this.storage.putJSON(s3Key, lineageEvent);
      
      console.log(`[DEBUG] DataLineageService.trackDataObjectUtilization - wrote lineage event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.trackDataObjectUtilization - failed:`, error);
      // Don't throw on tracking failure to avoid cascading errors
      console.warn(`[WARN] DataLineageService.trackDataObjectUtilization - continuing despite tracking failure`);
    }
  }

  /**
   * Get complete lineage data for a specific job
   * Phase 4 S3 Migration: Now reads from S3 using listObjects + getJSON
   * @param {string} jobId - The job ID to retrieve lineage data for
   * @returns {Promise<Object|null>} Aggregated lineage data or null if not found
   */
  async getJobLineageData(jobId) {
    try {
      console.log(`[DEBUG] DataLineageService.getJobLineageData - jobId: ${jobId}`);
      
      // Phase 4 S3 Migration: Get all lineage event files for this job from S3
      const prefix = this.storage.buildLineageEventKey(jobId, '', '').replace(/\/$/, '') + '/';
      console.log(`[DEBUG] DataLineageService.getJobLineageData - listing S3 objects with prefix: ${prefix}`);
      
      const objects = await this.storage.listObjects(prefix);
      console.log(`[DEBUG] DataLineageService.getJobLineageData - found ${objects.length} S3 objects`);
      
      if (objects.length === 0) {
        console.log(`[DEBUG] DataLineageService.getJobLineageData - no lineage files found in S3`);
        return null;
      }
      
      const events = [];
      const dataObjects = {};
      const eventCounts = {};
      let totalEvents = 0;
      
      // Phase 4 S3 Migration: Read each lineage event file from S3
      for (const obj of objects) {
        if (obj.Key.endsWith('.json')) {
          try {
            const eventData = await this.storage.getJSON(obj.Key);
            if (eventData) {
              // Add event to collection
              events.push(eventData);
              totalEvents++;

              // Count event types
              const eventType = eventData.eventType || 'UNKNOWN';
              eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;

              // Track data objects if present (support both dataId and dataObjectId)
              const objectId = eventData.dataId || eventData.dataObjectId;
              if (objectId) {
                if (!dataObjects[objectId]) {
                  dataObjects[objectId] = {
                    dataId: objectId,
                    dataType: eventData.dataType || eventData.dataPointType || 'unknown',
                    sourceType: eventData.sourceType || (eventType.includes('TAVILY') ? 'tavily' : eventType.includes('PERPLEXITY') ? 'perplexity' : 'unknown'),
                    geographicScope: eventData.geographicScope || 'unknown',
                    lifecycle: [],
                    events: []
                  };
                }
                dataObjects[objectId].events.push(eventData);
                dataObjects[objectId].lifecycle.push({
                  timestamp: eventData.timestamp,
                  eventType: eventType,
                  status: eventData.status || (eventData.success !== undefined ? (eventData.success ? 'success' : 'failed') : 'unknown')
                });
              }

              console.log(`[DEBUG] DataLineageService.getJobLineageData - processed S3 object: ${obj.Key}, eventType: ${eventType}`);
            }
          } catch (fileError) {
            console.error(`[ERROR] DataLineageService.getJobLineageData - error reading S3 object ${obj.Key}:`, fileError.message);
            // Continue processing other files
          }
        }
      }
      
      // Sort events by timestamp
      events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Build summary
      const summary = {
        eventCounts,
        dataObjects,
        lastUpdated: new Date().toISOString(),
        fileCount: objects.length
      };

      const lineageData = {
        jobId,
        totalEvents,
        dataObjectCount: Object.keys(dataObjects).length,
        events,
        summary
      };

      console.log(`[DEBUG] DataLineageService.getJobLineageData - returning lineage data:`, {
        jobId,
        totalEvents,
        dataObjectCount: lineageData.dataObjectCount,
        eventTypes: Object.keys(eventCounts),
        fileCount: objects.length
      });

      return lineageData;
    } catch (error) {
      // SECURITY (js/tainted-format-string, alert 51): pass user-controlled jobId as a
      // data argument with a constant format string so embedded %s/%d are not interpreted.
      console.error('[ERROR] DataLineageService.getJobLineageData - error for jobId: %s', jobId, error);
      return null;
    }
  }

  /**
   * Analyze data utilization patterns
   * @param {Object} lineageData - The lineage data to analyze
   * @returns {Object} Utilization analysis
   */
  analyzeDataUtilization(lineageData) {
    try {
      const { events, summary } = lineageData;
      const dataObjects = summary.dataObjects || {};
      
      let utilized = 0;
      let unused = 0;
      const utilizationByType = {};
      const utilizationBySource = {};

      Object.values(dataObjects).forEach(dataObj => {
        // Check for integration or utilization events
        const hasIntegration = dataObj.events.some(event =>
          event.eventType === 'NARRATIVE_INTEGRATION' ||
          event.eventType === 'DATA_INTEGRATION' ||
          event.eventType === 'DATA_OBJECT_UTILIZATION'
        );
        
        if (hasIntegration) {
          utilized++;
        } else {
          unused++;
        }

        // Track by type
        const type = dataObj.dataType || 'unknown';
        if (!utilizationByType[type]) {
          utilizationByType[type] = { utilized: 0, unused: 0 };
        }
        utilizationByType[type][hasIntegration ? 'utilized' : 'unused']++;

        // Track by source
        const source = dataObj.sourceType || 'unknown';
        if (!utilizationBySource[source]) {
          utilizationBySource[source] = { utilized: 0, unused: 0 };
        }
        utilizationBySource[source][hasIntegration ? 'utilized' : 'unused']++;
      });

      const total = utilized + unused;
      const utilizationRate = total > 0 ? (utilized / total) * 100 : 0;

      return {
        total,
        utilized,
        unused,
        utilizationRate: Math.round(utilizationRate * 100) / 100,
        byType: utilizationByType,
        bySource: utilizationBySource
      };
    } catch (error) {
      console.error('[ERROR] DataLineageService.analyzeDataUtilization - error:', error);
      return {
        total: 0,
        utilized: 0,
        unused: 0,
        utilizationRate: 0,
        byType: {},
        bySource: {}
      };
    }
  }

  /**
   * Get all available job IDs with lineage data
   * Phase 4 S3 Migration: Now reads from S3 using listObjects
   * @returns {Promise<Array>} Array of job IDs that have lineage data
   */
  async getAvailableJobs() {
    try {
      console.log('[DEBUG] DataLineageService.getAvailableJobs - listing jobs from S3');
      
      // Phase 4 S3 Migration: List all job directories in S3
      const prefix = 'jobs/';
      const objects = await this.storage.listObjects(prefix, { recursive: false });
      
      console.log(`[DEBUG] DataLineageService.getAvailableJobs - found ${objects.length} S3 objects under jobs/`);
      
      // Extract unique job IDs from directory paths
      const jobIds = new Set();
      for (const obj of objects) {
        // Extract jobId from path like "jobs/job_123/..."
        const match = obj.Key.match(/^jobs\/([^\/]+)\//);
        if (match) {
          jobIds.add(match[1]);
        }
      }
      
      const jobArray = Array.from(jobIds);
      console.log(`[DEBUG] DataLineageService.getAvailableJobs - found ${jobArray.length} unique jobs with lineage data`);
      
      return jobArray;
    } catch (error) {
      console.error('[ERROR] DataLineageService.getAvailableJobs - error:', error);
      return [];
    }
  }

  /**
   * Get lineage statistics across all jobs
   * Phase 4 S3 Migration: Now async due to S3 operations
   * @returns {Promise<Object>} Overall lineage statistics
   */
  async getOverallStatistics() {
    try {
      const availableJobs = await this.getAvailableJobs();
      let totalEvents = 0;
      let totalDataObjects = 0;
      const eventTypeCounts = {};

      for (const jobId of availableJobs) {
        const lineageData = await this.getJobLineageData(jobId);
        if (lineageData) {
          totalEvents += lineageData.totalEvents;
          totalDataObjects += lineageData.dataObjectCount;
          
          Object.entries(lineageData.summary.eventCounts || {}).forEach(([eventType, count]) => {
            eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + count;
          });
        }
      }

      return {
        totalJobs: availableJobs.length,
        totalEvents,
        totalDataObjects,
        averageEventsPerJob: availableJobs.length > 0 ? Math.round(totalEvents / availableJobs.length) : 0,
        eventTypeCounts
      };
    } catch (error) {
      console.error('[ERROR] DataLineageService.getOverallStatistics - error:', error);
      return {
        totalJobs: 0,
        totalEvents: 0,
        totalDataObjects: 0,
        averageEventsPerJob: 0,
        eventTypeCounts: {}
      };
    }
  }

  /**
   * Phase 4: Record cost tracking data for a job
   * Writes cost summary to lineage directory for integration with lineage.json
   * @param {string} jobId - The job ID
   * @param {Object} costData - Cost tracking data from orchestrator
   * @returns {Promise<void>}
   */
  async recordCosts(jobId, costData) {
    try {
      console.log(`[DEBUG] DataLineageService.recordCosts - jobId: ${jobId}`);
      
      const jobPath = path.join(this.storageBasePath, jobId);
      const lineagePath = path.join(jobPath, 'lineage');
      
      // Ensure directories exist
      if (!fs.existsSync(jobPath)) {
        fs.mkdirSync(jobPath, { recursive: true });
      }
      if (!fs.existsSync(lineagePath)) {
        fs.mkdirSync(lineagePath, { recursive: true });
      }
      
      // Create cost tracking event with schema from architecture
      const costTrackingEvent = {
        timestamp: new Date().toISOString(),
        jobId: jobId,
        eventType: 'COST_TRACKING',
        costTracking: {
          jobCostSummary: {
            totalCost: costData.totalCost || 0,
            marketCount: costData.marketCount || 0,
            averageCostPerMarket: costData.averageCostPerMarket || 0,
            breakdown: {
              bedrock: {
                totalCost: costData.breakdown?.bedrock?.totalCost || 0,
                totalTokens: costData.breakdown?.bedrock?.totalTokens || 0,
                agentCount: costData.breakdown?.bedrock?.agentCount || 0
              },
              tavily: {
                totalCost: costData.breakdown?.tavily?.totalCost || 0,
                totalCredits: costData.breakdown?.tavily?.totalCredits || 0,
                operationCount: costData.breakdown?.tavily?.operationCount || 0
              }
            }
          },
          marketCosts: costData.markets || [],
          generatedAt: new Date().toISOString()
        }
      };
      
      // Phase 4 S3 Migration: Write to S3 using buildLineageCostKey
      const s3Key = this.storage.buildLineageCostKey(jobId);
      await this.storage.putJSON(s3Key, costTrackingEvent);
      
      console.log(`[DEBUG] DataLineageService.recordCosts - wrote cost tracking event to S3: ${s3Key}`);
      
    } catch (error) {
      console.error(`[ERROR] DataLineageService.recordCosts - failed:`, error);
      // Don't throw - cost tracking failure shouldn't break workflow
      console.warn(`[WARN] DataLineageService.recordCosts - continuing despite tracking failure`);
    }
  }
}

module.exports = DataLineageService;