/**
 * Data Lineage Dashboard Service - Provides data visualization and analytics
 * Transforms lineage data into dashboard-ready formats
 */
class LineageDashboardService {
  constructor() {
    this.DataLineageService = require('./dataLineageService');
    this.lineageService = new this.DataLineageService();
    this.fs = require('fs');
    this.path = require('path');
  }

  /**
   * Get dashboard data for a specific job
   */
  async getJobDashboardData(jobId) {
    try {
      console.log(`[DEBUG] LineageDashboardService.getJobDashboardData - jobId: ${jobId}`);
      
      const lineage = await this.lineageService.getJobLineageData(jobId);
      console.log(`[DEBUG] LineageDashboardService.getJobDashboardData - lineage:`, lineage ? 'found' : 'null');
      
      if (!lineage) {
        console.log(`[DEBUG] LineageDashboardService.getJobDashboardData - no lineage data found for jobId: ${jobId}`);
        return null;
      }

      // Defensive programming - ensure required properties exist
      const summary = lineage.summary || {};
      const eventCounts = summary.eventCounts || {};
      const dataObjects = summary.dataObjects || {};
      
      console.log(`[DEBUG] LineageDashboardService.getJobDashboardData - summary:`, {
        eventCounts: Object.keys(eventCounts).length,
        dataObjects: Object.keys(dataObjects).length,
        totalEvents: lineage.totalEvents,
        dataObjectCount: lineage.dataObjectCount
      });

      const dashboardData = {
        jobId,
        summary: {
          totalDataObjects: lineage.dataObjectCount || 0,
          totalEvents: lineage.totalEvents || 0,
          eventCounts: eventCounts,
          utilizationRate: await this.calculateUtilizationRate(lineage),
          lastUpdated: summary.lastUpdated || new Date().toISOString()
        },
        dataFlow: this.buildDataFlowVisualization(lineage),
        utilizationAnalysis: lineage ? this.lineageService.analyzeDataUtilization(lineage) : null,
        timelineData: this.buildTimelineData(lineage),
        sourceBreakdown: this.buildSourceBreakdown(lineage),
        agentDecisionAnalysis: this.buildAgentDecisionAnalysis(lineage),
        geographicScopeAnalysis: this.buildGeographicScopeAnalysis(lineage),
        perplexityDataObjectAnalysis: this.buildPerplexityDataObjectAnalysis(lineage),
        tavilyDataObjectAnalysis: this.buildTavilyDataObjectAnalysis(lineage)
      };

      console.log(`[DEBUG] LineageDashboardService.getJobDashboardData - returning dashboard data for jobId: ${jobId}`);
      return dashboardData;
    } catch (error) {
      // SECURITY (js/tainted-format-string, alert 52): pass user-controlled jobId as a
      // data argument with a constant format string so embedded %s/%d are not interpreted.
      console.error('[ERROR] LineageDashboardService.getJobDashboardData - error for jobId: %s', jobId, error);
      throw error;
    }
  }

  /**
   * Build data flow visualization structure
   */
  buildDataFlowVisualization(lineage) {
    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    // Defensive programming - ensure required properties exist
    const summary = lineage.summary || {};
    const dataObjects = summary.dataObjects || {};
    const events = lineage.events || [];

    console.log(`[DEBUG] buildDataFlowVisualization - dataObjects count: ${Object.keys(dataObjects).length}, events count: ${events.length}`);

    // ENHANCED FORMAT EXPANSION - Process events with extractedDataPoints
    let expandedNodeCount = 0;
    events.forEach(event => {
      if (this.isEnhancedFormatEvent(event)) {
        console.log(`[DEBUG] buildDataFlowVisualization - expanding enhanced format event: ${event.eventType}`);
        const expandedNodes = this.expandEnhancedFormatToNodes(event);
        nodes.push(...expandedNodes);
        expandedNodeCount += expandedNodes.length;
        console.log(`[DEBUG] buildDataFlowVisualization - added ${expandedNodes.length} nodes from ${event.eventType}`);
      }
    });

    // Create nodes for each data object (traditional format)
    const safeDataObjects = dataObjects || {};
    Object.values(safeDataObjects).forEach(dataObj => {
      const extractionEvent = events.find(e =>
        e.eventType === 'DATA_EXTRACTION' && e.dataId === dataObj.dataId
      );
      
      const integrationEvent = events.find(e =>
        e.eventType === 'NARRATIVE_INTEGRATION' && e.dataId === dataObj.dataId
      );

      const node = {
        id: dataObj.dataId,
        type: 'data_object',
        label: extractionEvent ? `${extractionEvent.dataType}` : dataObj.dataId,
        sourceType: extractionEvent ? extractionEvent.sourceType : 'unknown',
        dataType: extractionEvent ? extractionEvent.dataType : 'unknown',
        geographicScope: extractionEvent ? extractionEvent.geographicScope : 'unknown',
        status: integrationEvent ? 'utilized' : 'unused',
        lifecycle: dataObj.lifecycle,
        events: dataObj.events.length,
        extractedValue: extractionEvent ? extractionEvent.extractedValue : null,
        finalValue: integrationEvent ? integrationEvent.finalValue : null
      };

      nodes.push(node);
      nodeMap.set(dataObj.dataId, node);
    });

    console.log(`[DEBUG] buildDataFlowVisualization - total nodes: ${nodes.length} (${expandedNodeCount} from enhanced format expansion)`);

    // Create source nodes
    const sources = new Set();
    events.filter(e => e.eventType === 'DATA_EXTRACTION').forEach(event => {
      sources.add(event.sourceType);
    });

    sources.forEach(source => {
      nodes.push({
        id: `source_${source}`,
        type: 'source',
        label: source.toUpperCase(),
        sourceType: source
      });
    });

    // Create agent nodes
    const agents = new Set();
    events.filter(e => e.eventType === 'AGENT_DECISION').forEach(event => {
      agents.add(event.agentName);
    });

    agents.forEach(agent => {
      nodes.push({
        id: `agent_${agent}`,
        type: 'agent',
        label: agent,
        agentName: agent
      });
    });

    // Create narrative section nodes
    const narrativeSections = new Set();
    events.filter(e => e.eventType === 'NARRATIVE_INTEGRATION').forEach(event => {
      if (event.narrativeSection) {
        narrativeSections.add(event.narrativeSection);
      }
    });

    narrativeSections.forEach(section => {
      nodes.push({
        id: `narrative_${section}`,
        type: 'narrative',
        label: section.replace('_', ' ').toUpperCase(),
        narrativeSection: section
      });
    });

    // Create edges based on events
    events.forEach(event => {
      switch (event.eventType) {
        case 'DATA_EXTRACTION':
          edges.push({
            id: `extract_${event.dataId}`,
            source: `source_${event.sourceType}`,
            target: event.dataId,
            type: 'extraction',
            label: 'extracts',
            timestamp: event.timestamp
          });
          break;

        case 'AGENT_DECISION':
          edges.push({
            id: `decision_${event.dataId}_${event.agentName}`,
            source: event.dataId,
            target: `agent_${event.agentName}`,
            type: 'processing',
            label: event.decision.toLowerCase(),
            decision: event.decision,
            timestamp: event.timestamp
          });
          break;

        case 'NARRATIVE_INTEGRATION':
          if (event.narrativeSection) {
            edges.push({
              id: `integrate_${event.dataId}`,
              source: event.dataId,
              target: `narrative_${event.narrativeSection}`,
              type: 'integration',
              label: 'integrates into',
              status: event.integrationStatus,
              timestamp: event.timestamp
            });
          }
          break;
      }
    });

    return {
      nodes,
      edges,
      layout: 'hierarchical',
      direction: 'left-to-right'
    };
  }

  /**
   * Build timeline data for visualization
   */
  buildTimelineData(lineage) {
    const timeline = lineage.events.map(event => ({
      id: `${event.eventType}_${event.timestamp}`,
      timestamp: event.timestamp,
      eventType: event.eventType,
      dataId: event.dataId,
      title: this.getEventTitle(event),
      description: this.getEventDescription(event),
      category: this.getEventCategory(event.eventType),
      status: this.getEventStatus(event)
    })).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return timeline;
  }

  /**
   * Build source breakdown analysis
   */
  buildSourceBreakdown(lineage) {
    const breakdown = {};
    
    // Process DATA_EXTRACTION events (traditional format)
    lineage.events.filter(e => e.eventType === 'DATA_EXTRACTION').forEach(event => {
      if (!breakdown[event.sourceType]) {
        breakdown[event.sourceType] = {
          sourceType: event.sourceType,
          totalExtractions: 0,
          dataTypes: new Set(),
          geographicScopes: new Set(),
          utilizationRate: 0,
          extractedData: []
        };
      }
      
      breakdown[event.sourceType].totalExtractions++;
      breakdown[event.sourceType].dataTypes.add(event.dataType);
      if (event.geographicScope) {
        breakdown[event.sourceType].geographicScopes.add(event.geographicScope);
      }
      breakdown[event.sourceType].extractedData.push({
        dataId: event.dataId,
        dataType: event.dataType,
        extractedValue: event.extractedValue,
        geographicScope: event.geographicScope
      });
    });

    // Process TAVILY_DATA_OBJECT_REQUEST events
    lineage.events.filter(e => e.eventType === 'TAVILY_DATA_OBJECT_REQUEST').forEach(event => {
      const sourceType = 'tavily';
      if (!breakdown[sourceType]) {
        breakdown[sourceType] = {
          sourceType: sourceType,
          totalExtractions: 0,
          dataTypes: new Set(),
          geographicScopes: new Set(),
          utilizationRate: 0,
          extractedData: []
        };
      }
      
      breakdown[sourceType].totalExtractions++;
      breakdown[sourceType].dataTypes.add(event.dataPointType || 'data_object');
      if (event.geographicScope) {
        breakdown[sourceType].geographicScopes.add(event.geographicScope);
      }
      breakdown[sourceType].extractedData.push({
        dataId: event.dataObjectId,
        dataType: event.dataPointType || 'data_object',
        extractedValue: event.searchQuery,
        geographicScope: event.geographicScope
      });
    });

    // Process PERPLEXITY_DATA_OBJECT_REQUEST events
    lineage.events.filter(e => e.eventType === 'PERPLEXITY_DATA_OBJECT_REQUEST').forEach(event => {
      const sourceType = 'perplexity';
      if (!breakdown[sourceType]) {
        breakdown[sourceType] = {
          sourceType: sourceType,
          totalExtractions: 0,
          dataTypes: new Set(),
          geographicScopes: new Set(),
          utilizationRate: 0,
          extractedData: []
        };
      }
      
      breakdown[sourceType].totalExtractions++;
      breakdown[sourceType].dataTypes.add(event.dataPointType || 'data_object');
      if (event.geographicScope) {
        breakdown[sourceType].geographicScopes.add(event.geographicScope);
      }
      breakdown[sourceType].extractedData.push({
        dataId: event.dataObjectId,
        dataType: event.dataPointType || 'data_object',
        extractedValue: event.searchQuery,
        geographicScope: event.geographicScope
      });
    });

    // Calculate utilization rates
    Object.keys(breakdown).forEach(sourceType => {
      const sourceData = breakdown[sourceType];
      const utilized = sourceData.extractedData.filter(data => {
        return lineage.events.some(e => 
          e.eventType === 'NARRATIVE_INTEGRATION' && e.dataId === data.dataId
        );
      }).length;
      
      sourceData.utilizationRate = sourceData.totalExtractions > 0 
        ? (utilized / sourceData.totalExtractions) * 100 
        : 0;
      
      // Convert Sets to Arrays for JSON serialization
      sourceData.dataTypes = Array.from(sourceData.dataTypes);
      sourceData.geographicScopes = Array.from(sourceData.geographicScopes);
    });

    return breakdown;
  }

  /**
   * Build agent decision analysis
   */
  buildAgentDecisionAnalysis(lineage) {
    const analysis = {};
    
    lineage.events.filter(e => e.eventType === 'AGENT_DECISION').forEach(event => {
      if (!analysis[event.agentName]) {
        analysis[event.agentName] = {
          agentName: event.agentName,
          totalDecisions: 0,
          decisions: {
            INCLUDE: 0,
            EXCLUDE: 0,
            MODIFY: 0
          },
          averageConfidence: 0,
          processingSteps: new Set(),
          decisionReasons: []
        };
      }
      
      const agentData = analysis[event.agentName];
      agentData.totalDecisions++;
      agentData.decisions[event.decision] = (agentData.decisions[event.decision] || 0) + 1;
      
      if (event.processingStep) {
        agentData.processingSteps.add(event.processingStep);
      }
      
      agentData.decisionReasons.push({
        dataId: event.dataId,
        decision: event.decision,
        rationale: event.decisionRationale,
        confidenceLevel: event.confidenceLevel
      });
    });

    // Calculate averages and convert Sets
    Object.keys(analysis).forEach(agentName => {
      const agentData = analysis[agentName];
      const confidenceLevels = agentData.decisionReasons
        .map(r => r.confidenceLevel)
        .filter(c => c !== undefined && c !== null);
      
      agentData.averageConfidence = confidenceLevels.length > 0
        ? confidenceLevels.reduce((sum, c) => sum + c, 0) / confidenceLevels.length
        : 0;
      
      agentData.processingSteps = Array.from(agentData.processingSteps);
    });

    return analysis;
  }

  /**
   * Build geographic scope analysis
   */
  buildGeographicScopeAnalysis(lineage) {
    const analysis = {};
    
    lineage.events.filter(e => e.eventType === 'DATA_EXTRACTION' && e.geographicScope)
      .forEach(event => {
        if (!analysis[event.geographicScope]) {
          analysis[event.geographicScope] = {
            scope: event.geographicScope,
            totalExtractions: 0,
            dataTypes: new Set(),
            sources: new Set(),
            utilizationRate: 0,
            extractedData: []
          };
        }
        
        const scopeData = analysis[event.geographicScope];
        scopeData.totalExtractions++;
        scopeData.dataTypes.add(event.dataType);
        scopeData.sources.add(event.sourceType);
        scopeData.extractedData.push({
          dataId: event.dataId,
          dataType: event.dataType,
          sourceType: event.sourceType,
          extractedValue: event.extractedValue
        });
      });

    // Calculate utilization rates
    Object.keys(analysis).forEach(scope => {
      const scopeData = analysis[scope];
      const utilized = scopeData.extractedData.filter(data => {
        return lineage.events.some(e => 
          e.eventType === 'NARRATIVE_INTEGRATION' && e.dataId === data.dataId
        );
      }).length;
      
      scopeData.utilizationRate = scopeData.totalExtractions > 0 
        ? (utilized / scopeData.totalExtractions) * 100 
        : 0;
      
      // Convert Sets to Arrays
      scopeData.dataTypes = Array.from(scopeData.dataTypes);
      scopeData.sources = Array.from(scopeData.sources);
    });

    return analysis;
  }

  /**
   * Build Perplexity data object analysis
   * Tracks data objects sent to Perplexity and their utilization in final narrative
   */
  buildPerplexityDataObjectAnalysis(lineage) {
    const analysis = {
      summary: {
        totalDataObjectsSentToPerplexity: 0,
        totalPerplexityResponses: 0,
        successfulPerplexityResponses: 0,
        failedPerplexityResponses: 0,
        totalDataObjectsUsedInNarrative: 0,
        perplexityUtilizationRate: 0,
        averageResponseTime: 0,
        averageResponseSize: 0
      },
      dataObjectDetails: [],
      performanceMetrics: {
        responseTimeDistribution: {},
        responseSizeDistribution: {},
        errorPatterns: {}
      },
      utilizationBreakdown: {
        byDataType: {},
        byCategory: {},
        bySearchQuery: {}
      }
    };

    // Defensive programming - ensure required properties exist
    const events = lineage.events || [];
    
    // Find all Perplexity data object request events
    const perplexityRequests = events.filter(e =>
      e.eventType === 'PERPLEXITY_DATA_OBJECT_REQUEST'
    );
    
    // Find all Perplexity data object response events
    const perplexityResponses = events.filter(e =>
      e.eventType === 'PERPLEXITY_DATA_OBJECT_RESPONSE'
    );
    
    // Find all data object utilization events
    const utilizationEvents = events.filter(e =>
      e.eventType === 'DATA_OBJECT_UTILIZATION'
    );

    console.log(`[DEBUG] buildPerplexityDataObjectAnalysis - found ${perplexityRequests.length} requests, ${perplexityResponses.length} responses, ${utilizationEvents.length} utilization events`);

    // Process each data object sent to Perplexity
    const dataObjectMap = new Map();
    
    perplexityRequests.forEach(request => {
      const dataObjectId = request.dataObjectId;
      if (!dataObjectMap.has(dataObjectId)) {
        dataObjectMap.set(dataObjectId, {
          dataObjectId,
          dataPointType: request.dataPointType,
          dataPointCategory: request.dataPointCategory,
          searchQuery: request.searchQuery,
          requestTimestamp: request.timestamp,
          responseReceived: false,
          responseSuccess: false,
          responseTimestamp: null,
          responseSize: 0,
          duration: 0,
          errorMessage: null,
          usedInNarrative: false,
          narrativeSection: null,
          utilizationTimestamp: null
        });
      }
    });

    // Match responses to requests
    perplexityResponses.forEach(response => {
      const dataObjectId = response.dataObjectId;
      if (dataObjectMap.has(dataObjectId)) {
        const dataObj = dataObjectMap.get(dataObjectId);
        dataObj.responseReceived = true;
        dataObj.responseSuccess = response.success;
        dataObj.responseTimestamp = response.responseTimestamp;
        dataObj.responseSize = response.responseSize || 0;
        dataObj.duration = response.duration || 0;
        dataObj.errorMessage = response.errorMessage || null;
      }
    });

    // Match utilization events
    utilizationEvents.forEach(utilization => {
      const dataObjectId = utilization.dataObjectId;
      if (dataObjectMap.has(dataObjectId)) {
        const dataObj = dataObjectMap.get(dataObjectId);
        dataObj.usedInNarrative = true;
        dataObj.narrativeSection = utilization.narrativeSection;
        dataObj.utilizationTimestamp = utilization.timestamp;
      }
    });

    // Calculate summary metrics
    const dataObjects = Array.from(dataObjectMap.values());
    analysis.summary.totalDataObjectsSentToPerplexity = dataObjects.length;
    analysis.summary.totalPerplexityResponses = dataObjects.filter(d => d.responseReceived).length;
    analysis.summary.successfulPerplexityResponses = dataObjects.filter(d => d.responseSuccess).length;
    analysis.summary.failedPerplexityResponses = dataObjects.filter(d => d.responseReceived && !d.responseSuccess).length;
    analysis.summary.totalDataObjectsUsedInNarrative = dataObjects.filter(d => d.usedInNarrative).length;
    
    // Calculate utilization rate (data objects used in narrative / successful Perplexity responses)
    if (analysis.summary.successfulPerplexityResponses > 0) {
      analysis.summary.perplexityUtilizationRate =
        (analysis.summary.totalDataObjectsUsedInNarrative / analysis.summary.successfulPerplexityResponses) * 100;
    }

    // Calculate average response time and size
    const successfulResponses = dataObjects.filter(d => d.responseSuccess);
    if (successfulResponses.length > 0) {
      analysis.summary.averageResponseTime =
        successfulResponses.reduce((sum, d) => sum + d.duration, 0) / successfulResponses.length;
      analysis.summary.averageResponseSize =
        successfulResponses.reduce((sum, d) => sum + d.responseSize, 0) / successfulResponses.length;
    }

    // Build detailed data object list
    analysis.dataObjectDetails = dataObjects.map(dataObj => ({
      ...dataObj,
      utilizationStatus: dataObj.usedInNarrative ? 'UTILIZED' : 'NOT_UTILIZED',
      responseStatus: dataObj.responseReceived ?
        (dataObj.responseSuccess ? 'SUCCESS' : 'FAILED') : 'NO_RESPONSE'
    }));

    // Build performance metrics
    successfulResponses.forEach(dataObj => {
      // Response time distribution (in seconds)
      const responseTimeSeconds = Math.floor(dataObj.duration / 1000);
      const timeKey = `${responseTimeSeconds}s`;
      analysis.performanceMetrics.responseTimeDistribution[timeKey] =
        (analysis.performanceMetrics.responseTimeDistribution[timeKey] || 0) + 1;

      // Response size distribution (in KB)
      const responseSizeKB = Math.floor(dataObj.responseSize / 1024);
      const sizeKey = `${responseSizeKB}KB`;
      analysis.performanceMetrics.responseSizeDistribution[sizeKey] =
        (analysis.performanceMetrics.responseSizeDistribution[sizeKey] || 0) + 1;
    });

    // Build error patterns
    const failedResponses = dataObjects.filter(d => d.responseReceived && !d.responseSuccess);
    failedResponses.forEach(dataObj => {
      const errorKey = dataObj.errorMessage || 'Unknown Error';
      analysis.performanceMetrics.errorPatterns[errorKey] =
        (analysis.performanceMetrics.errorPatterns[errorKey] || 0) + 1;
    });

    // Build utilization breakdown
    dataObjects.forEach(dataObj => {
      // By data type
      const dataType = dataObj.dataPointType || 'unknown';
      if (!analysis.utilizationBreakdown.byDataType[dataType]) {
        analysis.utilizationBreakdown.byDataType[dataType] = {
          total: 0,
          utilized: 0,
          utilizationRate: 0
        };
      }
      analysis.utilizationBreakdown.byDataType[dataType].total++;
      if (dataObj.usedInNarrative) {
        analysis.utilizationBreakdown.byDataType[dataType].utilized++;
      }

      // By category
      const category = dataObj.dataPointCategory || 'unknown';
      if (!analysis.utilizationBreakdown.byCategory[category]) {
        analysis.utilizationBreakdown.byCategory[category] = {
          total: 0,
          utilized: 0,
          utilizationRate: 0
        };
      }
      analysis.utilizationBreakdown.byCategory[category].total++;
      if (dataObj.usedInNarrative) {
        analysis.utilizationBreakdown.byCategory[category].utilized++;
      }

      // By search query (first 50 characters for grouping)
      const queryKey = dataObj.searchQuery ?
        dataObj.searchQuery.substring(0, 50) + (dataObj.searchQuery.length > 50 ? '...' : '') :
        'no-query';
      if (!analysis.utilizationBreakdown.bySearchQuery[queryKey]) {
        analysis.utilizationBreakdown.bySearchQuery[queryKey] = {
          total: 0,
          utilized: 0,
          utilizationRate: 0
        };
      }
      analysis.utilizationBreakdown.bySearchQuery[queryKey].total++;
      if (dataObj.usedInNarrative) {
        analysis.utilizationBreakdown.bySearchQuery[queryKey].utilized++;
      }
    });

    // Calculate utilization rates for breakdowns
    Object.keys(analysis.utilizationBreakdown.byDataType).forEach(dataType => {
      const breakdown = analysis.utilizationBreakdown.byDataType[dataType];
      breakdown.utilizationRate = breakdown.total > 0 ?
        (breakdown.utilized / breakdown.total) * 100 : 0;
    });

    Object.keys(analysis.utilizationBreakdown.byCategory).forEach(category => {
      const breakdown = analysis.utilizationBreakdown.byCategory[category];
      breakdown.utilizationRate = breakdown.total > 0 ?
        (breakdown.utilized / breakdown.total) * 100 : 0;
    });

    Object.keys(analysis.utilizationBreakdown.bySearchQuery).forEach(queryKey => {
      const breakdown = analysis.utilizationBreakdown.bySearchQuery[queryKey];
      breakdown.utilizationRate = breakdown.total > 0 ?
        (breakdown.utilized / breakdown.total) * 100 : 0;
    });

    console.log(`[DEBUG] buildPerplexityDataObjectAnalysis - completed analysis:`, {
      totalSent: analysis.summary.totalDataObjectsSentToPerplexity,
      successfulResponses: analysis.summary.successfulPerplexityResponses,
      utilized: analysis.summary.totalDataObjectsUsedInNarrative,
      utilizationRate: analysis.summary.perplexityUtilizationRate
    });

    return analysis;
  }
  /**
   * Build Tavily data object analysis
   * Analyzes Tavily data objects sent, responses received, and utilization in narratives
   * @param {Object} lineage - Job lineage data
   * @returns {Object} Tavily data object analysis
   */
  buildTavilyDataObjectAnalysis(lineage) {
    const analysis = {
      summary: {
        totalDataObjectsSentToTavily: 0,
        totalTavilyResponses: 0,
        successfulTavilyResponses: 0,
        failedTavilyResponses: 0,
        totalDataObjectsUsedInNarrative: 0,
        tavilyUtilizationRate: 0,
        averageResponseTime: 0,
        averageResponseSize: 0
      },
      dataObjectDetails: [],
      performanceMetrics: {
        responseTimeDistribution: {},
        responseSizeDistribution: {},
        errorPatterns: {}
      },
      utilizationBreakdown: {
        byMarket: {},
        bySearchQuery: {}
      }
    };

    // Defensive programming - ensure required properties exist
    const events = lineage.events || [];
    
    // Find all Tavily data object request events
    const tavilyRequests = events.filter(e =>
      e.eventType === 'TAVILY_DATA_OBJECT_REQUEST'
    );
    
    // Find all Tavily data object response events
    const tavilyResponses = events.filter(e =>
      e.eventType === 'TAVILY_DATA_OBJECT_RESPONSE'
    );
    
    // Find all data object utilization events for Tavily
    const utilizationEvents = events.filter(e =>
      e.eventType === 'DATA_OBJECT_UTILIZATION' && e.sourceType === 'tavily'
    );

    console.log(`[DEBUG] buildTavilyDataObjectAnalysis - found ${tavilyRequests.length} requests, ${tavilyResponses.length} responses, ${utilizationEvents.length} utilization events`);

    // Process each data object sent to Tavily
    const dataObjectMap = new Map();
    
    tavilyRequests.forEach(request => {
      const dataObjectId = request.dataObjectId;
      if (!dataObjectMap.has(dataObjectId)) {
        dataObjectMap.set(dataObjectId, {
          dataObjectId,
          market: request.market,
          searchQuery: request.searchQuery,
          requestTimestamp: request.timestamp,
          responseReceived: false,
          responseSuccess: false,
          responseTimestamp: null,
          responseSize: 0,
          duration: 0,
          errorMessage: null,
          usedInNarrative: false,
          narrativeSection: null,
          utilizationTimestamp: null
        });
      }
    });

    // Match responses to requests
    tavilyResponses.forEach(response => {
      const dataObjectId = response.dataObjectId;
      if (dataObjectMap.has(dataObjectId)) {
        const dataObj = dataObjectMap.get(dataObjectId);
        dataObj.responseReceived = true;
        dataObj.responseSuccess = response.success;
        dataObj.responseTimestamp = response.responseTimestamp;
        dataObj.responseSize = response.responseSize || 0;
        dataObj.duration = response.duration || 0;
        dataObj.errorMessage = response.errorMessage || null;
      }
    });

    // Match utilization events
    utilizationEvents.forEach(utilization => {
      const dataObjectId = utilization.dataObjectId;
      if (dataObjectMap.has(dataObjectId)) {
        const dataObj = dataObjectMap.get(dataObjectId);
        dataObj.usedInNarrative = utilization.usedInNarrative || false;
        dataObj.narrativeSection = utilization.narrativeSection;
        dataObj.utilizationTimestamp = utilization.timestamp;
      }
    });

    // Calculate summary metrics
    const dataObjects = Array.from(dataObjectMap.values());
    analysis.summary.totalDataObjectsSentToTavily = dataObjects.length;
    analysis.summary.totalTavilyResponses = dataObjects.filter(d => d.responseReceived).length;
    analysis.summary.successfulTavilyResponses = dataObjects.filter(d => d.responseSuccess).length;
    analysis.summary.failedTavilyResponses = dataObjects.filter(d => d.responseReceived && !d.responseSuccess).length;
    analysis.summary.totalDataObjectsUsedInNarrative = dataObjects.filter(d => d.usedInNarrative).length;
    
    // Calculate utilization rate (data objects used in narrative / successful Tavily responses)
    if (analysis.summary.successfulTavilyResponses > 0) {
      analysis.summary.tavilyUtilizationRate =
        (analysis.summary.totalDataObjectsUsedInNarrative / analysis.summary.successfulTavilyResponses) * 100;
    }

    // Calculate average response time and size
    const successfulResponses = dataObjects.filter(d => d.responseSuccess);
    if (successfulResponses.length > 0) {
      analysis.summary.averageResponseTime =
        successfulResponses.reduce((sum, d) => sum + d.duration, 0) / successfulResponses.length;
      analysis.summary.averageResponseSize =
        successfulResponses.reduce((sum, d) => sum + d.responseSize, 0) / successfulResponses.length;
    }

    // Build detailed data object list
    analysis.dataObjectDetails = dataObjects.map(dataObj => ({
      ...dataObj,
      utilizationStatus: dataObj.usedInNarrative ? 'UTILIZED' : 'NOT_UTILIZED',
      responseStatus: dataObj.responseReceived ?
        (dataObj.responseSuccess ? 'SUCCESS' : 'FAILED') : 'NO_RESPONSE'
    }));

    // Build performance metrics
    successfulResponses.forEach(dataObj => {
      // Response time distribution (in seconds)
      const responseTimeSeconds = Math.floor(dataObj.duration / 1000);
      const timeKey = `${responseTimeSeconds}s`;
      analysis.performanceMetrics.responseTimeDistribution[timeKey] =
        (analysis.performanceMetrics.responseTimeDistribution[timeKey] || 0) + 1;

      // Response size distribution (in KB)
      const responseSizeKB = Math.floor(dataObj.responseSize / 1024);
      const sizeKey = `${responseSizeKB}KB`;
      analysis.performanceMetrics.responseSizeDistribution[sizeKey] =
        (analysis.performanceMetrics.responseSizeDistribution[sizeKey] || 0) + 1;
    });

    // Build error patterns
    const failedResponses = dataObjects.filter(d => d.responseReceived && !d.responseSuccess);
    failedResponses.forEach(dataObj => {
      const errorKey = dataObj.errorMessage || 'Unknown Error';
      analysis.performanceMetrics.errorPatterns[errorKey] =
        (analysis.performanceMetrics.errorPatterns[errorKey] || 0) + 1;
    });

    // Build utilization breakdown
    dataObjects.forEach(dataObj => {
      // By market
      const market = dataObj.market || 'unknown';
      if (!analysis.utilizationBreakdown.byMarket[market]) {
        analysis.utilizationBreakdown.byMarket[market] = {
          total: 0,
          utilized: 0,
          utilizationRate: 0
        };
      }
      analysis.utilizationBreakdown.byMarket[market].total++;
      if (dataObj.usedInNarrative) {
        analysis.utilizationBreakdown.byMarket[market].utilized++;
      }

      // By search query (first 50 characters for grouping)
      const queryKey = dataObj.searchQuery ?
        dataObj.searchQuery.substring(0, 50) + (dataObj.searchQuery.length > 50 ? '...' : '') :
        'no-query';
      if (!analysis.utilizationBreakdown.bySearchQuery[queryKey]) {
        analysis.utilizationBreakdown.bySearchQuery[queryKey] = {
          total: 0,
          utilized: 0,
          utilizationRate: 0
        };
      }
      analysis.utilizationBreakdown.bySearchQuery[queryKey].total++;
      if (dataObj.usedInNarrative) {
        analysis.utilizationBreakdown.bySearchQuery[queryKey].utilized++;
      }
    });

    // Calculate utilization rates for breakdowns
    Object.keys(analysis.utilizationBreakdown.byMarket).forEach(market => {
      const breakdown = analysis.utilizationBreakdown.byMarket[market];
      breakdown.utilizationRate = breakdown.total > 0 ?
        (breakdown.utilized / breakdown.total) * 100 : 0;
    });

    Object.keys(analysis.utilizationBreakdown.bySearchQuery).forEach(queryKey => {
      const breakdown = analysis.utilizationBreakdown.bySearchQuery[queryKey];
      breakdown.utilizationRate = breakdown.total > 0 ?
        (breakdown.utilized / breakdown.total) * 100 : 0;
    });

    console.log(`[DEBUG] buildTavilyDataObjectAnalysis - completed analysis:`, {
      totalSent: analysis.summary.totalDataObjectsSentToTavily,
      successfulResponses: analysis.summary.successfulTavilyResponses,
      utilized: analysis.summary.totalDataObjectsUsedInNarrative,
      utilizationRate: analysis.summary.tavilyUtilizationRate
    });

    return analysis;
  }


  /**
   * Get filtered dashboard data
   */
  async getFilteredDashboardData(filters = {}) {
    const { jobId, dataType, geographicScope, sourceType, agentName, dateRange } = filters;
    
    if (!jobId) {
      throw new Error('Job ID is required for filtered dashboard data');
    }
    
    const dashboardData = await this.getJobDashboardData(jobId);
    if (!dashboardData) {
      return null;
    }
    
    // Apply filters
    if (dataType) {
      dashboardData.dataFlow.nodes = dashboardData.dataFlow.nodes.filter(node => 
        node.type !== 'data_object' || node.dataType === dataType
      );
    }
    
    if (geographicScope) {
      dashboardData.dataFlow.nodes = dashboardData.dataFlow.nodes.filter(node => 
        node.type !== 'data_object' || node.geographicScope === geographicScope
      );
    }
    
    if (sourceType) {
      dashboardData.dataFlow.nodes = dashboardData.dataFlow.nodes.filter(node => 
        node.type !== 'data_object' || node.sourceType === sourceType
      );
    }
    
    if (agentName) {
      dashboardData.dataFlow.nodes = dashboardData.dataFlow.nodes.filter(node => 
        node.type !== 'agent' || node.agentName === agentName
      );
    }
    
    // Filter edges to match filtered nodes
    const nodeIds = new Set(dashboardData.dataFlow.nodes.map(n => n.id));
    dashboardData.dataFlow.edges = dashboardData.dataFlow.edges.filter(edge => 
      nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );
    
    return dashboardData;
  }

  /**
   * Get multi-job comparison data
   */
  async getMultiJobComparison(jobIds) {
    const comparison = {
      jobs: [],
      aggregatedMetrics: {
        totalDataObjects: 0,
        totalEvents: 0,
        averageUtilizationRate: 0,
        sourceDistribution: {},
        agentPerformance: {}
      }
    };
    
    for (const jobId of jobIds) {
      const dashboardData = await this.getJobDashboardData(jobId);
      if (dashboardData) {
        comparison.jobs.push({
          jobId,
          summary: dashboardData.summary,
          utilizationRate: dashboardData.summary.utilizationRate
        });
        
        // Aggregate metrics
        comparison.aggregatedMetrics.totalDataObjects += dashboardData.summary.totalDataObjects;
        comparison.aggregatedMetrics.totalEvents += dashboardData.summary.totalEvents;
      }
    }
    
    // Calculate averages
    if (comparison.jobs.length > 0) {
      comparison.aggregatedMetrics.averageUtilizationRate = 
        comparison.jobs.reduce((sum, job) => sum + job.utilizationRate, 0) / comparison.jobs.length;
    }
    
    return comparison;
  }

  // Helper methods
  async calculateUtilizationRate(lineage) {
    // Extract jobId safely from lineage object
    const jobId = lineage.jobId || (lineage.summary && lineage.summary.jobId);
    if (!jobId) {
      console.log('[DEBUG] calculateUtilizationRate - no jobId found in lineage object');
      return 0;
    }
    
    const jobLineage = await this.lineageService.getJobLineageData(jobId);
    const analysis = this.lineageService.analyzeDataUtilization(jobLineage);
    return analysis ? analysis.utilizationRate : 0;
  }

  getEventTitle(event) {
    const titles = {
      'DATA_EXTRACTION': `Data Extracted: ${event.dataType}`,
      'API_CALL': `API Call: ${event.apiService}`,
      'SOURCE_VERIFICATION': `Verification: ${event.verificationType}`,
      'AGENT_DECISION': `Agent Decision: ${event.decision}`,
      'NARRATIVE_INTEGRATION': `Integrated: ${event.narrativeSection}`
    };
    return titles[event.eventType] || event.eventType;
  }

  getEventDescription(event) {
    switch (event.eventType) {
      case 'DATA_EXTRACTION':
        return `Extracted "${event.extractedValue}" from ${event.sourceType}`;
      case 'API_CALL':
        return `${event.apiService} API call (${event.responseStatus}) - ${event.responseHandlingStatus}`;
      case 'SOURCE_VERIFICATION':
        return `${event.verificationType} verification: ${event.verificationStatus}`;
      case 'AGENT_DECISION':
        return `${event.agentName}: ${event.decision} - ${event.decisionRationale}`;
      case 'NARRATIVE_INTEGRATION':
        return `Integrated into ${event.narrativeSection}: ${event.integrationStatus}`;
      default:
        return event.eventType;
    }
  }

  getEventCategory(eventType) {
    const categories = {
      'DATA_EXTRACTION': 'extraction',
      'API_CALL': 'api',
      'SOURCE_VERIFICATION': 'verification',
      'AGENT_DECISION': 'processing',
      'NARRATIVE_INTEGRATION': 'integration'
    };
    return categories[eventType] || 'other';
  }

  getEventStatus(event) {
    if (event.extractionStatus) return event.extractionStatus;
    if (event.responseHandlingStatus) return event.responseHandlingStatus;
    if (event.verificationStatus) return event.verificationStatus;
    if (event.decision) return event.decision;
    if (event.integrationStatus) return event.integrationStatus;
    return 'COMPLETED';
  }

  /**
   * Check if an event is in enhanced format (has extractedDataPoints or categorized data)
   * @param {Object} event - The event data to check
   * @returns {boolean} True if enhanced format
   */
  isEnhancedFormatEvent(event) {
    return !!(
      event.extractedDataPoints ||
      event.totalDataPoints ||
      event.categorizedDataCount ||
      event.dataCategories ||
      event.dataSourcesUsed ||
      (event.detailedDataUsage && Array.isArray(event.detailedDataUsage))
    );
  }

  /**
   * Expand enhanced format event into individual visualization nodes
   * @param {Object} event - The enhanced format event data
   * @returns {Array} Array of visualization nodes
   */
  expandEnhancedFormatToNodes(event) {
    const nodes = [];
    
    try {
      // Extract data points from enhanced format
      const extractedCount = parseInt(event.extractedDataPoints) || 0;
      const baseTimestamp = new Date(event.timestamp).getTime();
      
      console.log(`[DEBUG] expandEnhancedFormatToNodes - processing ${extractedCount} data points from ${event.eventType}`);
      
      // Generate individual nodes for each extracted data point
      if (extractedCount > 0) {
        for (let i = 0; i < extractedCount; i++) {
          const node = {
            id: `${event.eventType}_data_${i}`,
            type: 'extracted_data',
            label: `Data Point ${i + 1}/${extractedCount}`,
            sourceType: event.sourceType || 'enhanced_extraction',
            dataType: 'data_transformation',
            geographicScope: event.geographicScope || 'DFW',
            status: 'extracted',
            eventType: event.eventType,
            parentEvent: event.eventType,
            transformationIndex: i,
            timestamp: new Date(baseTimestamp + i).toISOString()
          };
          
          nodes.push(node);
        }
      }
      
      // Add category nodes if data categories exist
      if (event.dataCategories && typeof event.dataCategories === 'object') {
        const categories = Object.keys(event.dataCategories);
        categories.forEach((category, index) => {
          const node = {
            id: `${event.eventType}_category_${category}`,
            type: 'data_category',
            label: `Category: ${category}`,
            sourceType: 'category_processing',
            dataType: 'categorized_data',
            geographicScope: event.geographicScope || 'DFW',
            status: 'categorized',
            eventType: event.eventType,
            parentEvent: event.eventType,
            categoryIndex: index,
            timestamp: new Date(baseTimestamp + extractedCount + index).toISOString()
          };
          
          nodes.push(node);
        });
      }
      
      console.log(`[DEBUG] expandEnhancedFormatToNodes - generated ${nodes.length} nodes`);
      
    } catch (error) {
      console.error(`[ERROR] expandEnhancedFormatToNodes - error:`, error);
    }
    
    return nodes;
  }
}

module.exports = LineageDashboardService;
