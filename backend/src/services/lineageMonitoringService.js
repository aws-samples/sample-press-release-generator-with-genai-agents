/**
 * Real-Time Data Lineage Monitoring Service
 * Provides continuous monitoring, alerting, and pattern detection
 * 
 * S3 Migration: All alert storage operations now use S3 instead of filesystem
 */
const EventEmitter = require('events');
const logger = require('../utils/logger');

class LineageMonitoringService extends EventEmitter {
  constructor(dataLineageService) {
    super();
    
    // Use injected dataLineageService or create new instance
    if (dataLineageService) {
      this.lineageService = dataLineageService;
      this.storage = dataLineageService.storage; // Use same S3 storage instance
    } else {
      this.DataLineageService = require('./dataLineageService');
      this.lineageService = new this.DataLineageService();
      this.storage = this.lineageService.storage;
    }
    
    this.LineageDashboardService = require('./lineageDashboardService');
    this.dashboardService = new this.LineageDashboardService();
    
    this.monitoringConfig = {
      alertThresholds: {
        utilizationRate: 70, // Alert if below 70%
        dataExtractionFailures: 3, // Alert after 3 failures
        apiCallFailures: 5, // Alert after 5 API failures
        agentDecisionTime: 30000, // Alert if decisions take > 30s
        narrativeIntegrationGaps: 2 // Alert if 2+ data objects not integrated
      },
      monitoringInterval: 30000, // Check every 30 seconds
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
      alertCooldown: 5 * 60 * 1000 // 5 minutes between same alerts
    };
    
    this.activeAlerts = new Map();
    this.monitoringStats = {
      totalJobsMonitored: 0,
      alertsGenerated: 0,
      patternsDetected: 0,
      lastMonitoringRun: null,
      systemHealth: 'HEALTHY'
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  /**
   * Start real-time monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) {
      logger.info('Monitoring already active');
      return;
    }

    logger.info('Starting real-time data lineage monitoring...');
    this.isMonitoring = true;
    
    // Initial monitoring run
    this.runMonitoringCycle();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.runMonitoringCycle();
    }, this.monitoringConfig.monitoringInterval);

    this.emit('monitoring_started', {
      timestamp: new Date().toISOString(),
      config: this.monitoringConfig
    });
  }

  /**
   * Stop real-time monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      logger.info('Monitoring not active');
      return;
    }

    logger.info('Stopping real-time data lineage monitoring...');
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring_stopped', {
      timestamp: new Date().toISOString(),
      stats: this.monitoringStats
    });
  }

  /**
   * Run a complete monitoring cycle
   */
  async runMonitoringCycle() {
    try {
      const cycleStart = Date.now();
      logger.info(`Starting monitoring cycle at ${new Date().toISOString()}`);

      // Get all active jobs
      const activeJobs = await this.getActiveJobs();
      
      if (activeJobs.length === 0) {
        logger.info('No active jobs to monitor');
        return;
      }

      // Monitor each job
      const monitoringResults = [];
      for (const jobId of activeJobs) {
        const result = await this.monitorJob(jobId);
        monitoringResults.push(result);
      }

      // Analyze patterns across all jobs
      const patternAnalysis = await this.analyzePatterns(monitoringResults);
      
      // Update system health
      this.updateSystemHealth(monitoringResults, patternAnalysis);
      
      // Generate alerts if needed
      await this.processAlerts(monitoringResults, patternAnalysis);

      const cycleDuration = Date.now() - cycleStart;
      this.monitoringStats.lastMonitoringRun = new Date().toISOString();
      this.monitoringStats.totalJobsMonitored += activeJobs.length;

      logger.info(`Monitoring cycle completed in ${cycleDuration}ms - monitored ${activeJobs.length} jobs`);

      this.emit('monitoring_cycle_complete', {
        timestamp: new Date().toISOString(),
        jobsMonitored: activeJobs.length,
        duration: cycleDuration,
        systemHealth: this.monitoringStats.systemHealth
      });

    } catch (error) {
      logger.error('Error in monitoring cycle:', {
        error: error.message,
        stack: error.stack
      });
      this.emit('monitoring_error', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Monitor a specific job
   */
  async monitorJob(jobId) {
    const lineage = this.lineageService.getJobLineageData(jobId);
    if (!lineage) {
      return {
        jobId,
        status: 'NO_LINEAGE',
        issues: ['No lineage data found']
      };
    }

    const dashboardData = await this.dashboardService.getJobDashboardData(jobId);
    if (!dashboardData) {
      return {
        jobId,
        status: 'NO_DASHBOARD_DATA',
        issues: ['No dashboard data available']
      };
    }

    const issues = [];
    const warnings = [];
    const metrics = {};

    // Check utilization rate
    const utilizationRate = dashboardData.summary.utilizationRate;
    metrics.utilizationRate = utilizationRate;
    
    if (utilizationRate < this.monitoringConfig.alertThresholds.utilizationRate) {
      issues.push(`Low utilization rate: ${utilizationRate.toFixed(1)}%`);
    }

    // Check for extraction failures
    const extractionFailures = lineage.events.filter(e => 
      e.eventType === 'DATA_EXTRACTION' && e.extractionStatus === 'FAILED'
    ).length;
    metrics.extractionFailures = extractionFailures;
    
    if (extractionFailures >= this.monitoringConfig.alertThresholds.dataExtractionFailures) {
      issues.push(`High extraction failure count: ${extractionFailures}`);
    }

    // Check for API call failures
    const apiFailures = lineage.events.filter(e => 
      e.eventType === 'API_CALL' && e.responseHandlingStatus === 'FAILED'
    ).length;
    metrics.apiFailures = apiFailures;
    
    if (apiFailures >= this.monitoringConfig.alertThresholds.apiCallFailures) {
      issues.push(`High API failure count: ${apiFailures}`);
    }

    // Check agent decision times
    const agentDecisions = lineage.events.filter(e => e.eventType === 'AGENT_DECISION');
    const slowDecisions = agentDecisions.filter(e => {
      if (!e.processingDuration) return false;
      return e.processingDuration > this.monitoringConfig.alertThresholds.agentDecisionTime;
    });
    metrics.slowDecisions = slowDecisions.length;
    
    if (slowDecisions.length > 0) {
      warnings.push(`Slow agent decisions detected: ${slowDecisions.length}`);
    }

    // Check narrative integration gaps
    const utilizationAnalysis = dashboardData.utilizationAnalysis;
    const integrationGaps = utilizationAnalysis ? utilizationAnalysis.unusedDataObjects.length : 0;
    metrics.integrationGaps = integrationGaps;
    
    if (integrationGaps >= this.monitoringConfig.alertThresholds.narrativeIntegrationGaps) {
      issues.push(`Narrative integration gaps: ${integrationGaps} unused data objects`);
    }

    // Check data freshness
    const lastUpdated = new Date(dashboardData.summary.lastUpdated);
    const dataAge = Date.now() - lastUpdated.getTime();
    const maxAge = 60 * 60 * 1000; // 1 hour
    metrics.dataAge = dataAge;
    
    if (dataAge > maxAge) {
      warnings.push(`Stale data detected: ${Math.round(dataAge / (60 * 1000))} minutes old`);
    }

    // Determine overall status
    let status = 'HEALTHY';
    if (issues.length > 0) {
      status = 'CRITICAL';
    } else if (warnings.length > 0) {
      status = 'WARNING';
    }

    // Defensive programming - handle undefined summary
    const summary = lineage.summary || {};
    const dataObjects = summary.dataObjects || {};
    const events = lineage.events || [];

    return {
      jobId,
      status,
      issues,
      warnings,
      metrics,
      timestamp: new Date().toISOString(),
      lineageEventCount: events.length,
      dataObjectCount: Object.keys(dataObjects).length
    };
  }

  /**
   * Analyze patterns across multiple jobs
   */
  async analyzePatterns(monitoringResults) {
    const patterns = {
      utilizationTrends: [],
      failurePatterns: [],
      performancePatterns: [],
      dataQualityTrends: []
    };

    // Utilization trend analysis
    const utilizationRates = monitoringResults
      .filter(r => r.metrics && r.metrics.utilizationRate !== undefined)
      .map(r => r.metrics.utilizationRate);
    
    if (utilizationRates.length > 0) {
      const avgUtilization = utilizationRates.reduce((sum, rate) => sum + rate, 0) / utilizationRates.length;
      const minUtilization = Math.min(...utilizationRates);
      const maxUtilization = Math.max(...utilizationRates);
      
      patterns.utilizationTrends.push({
        average: avgUtilization,
        minimum: minUtilization,
        maximum: maxUtilization,
        variance: this.calculateVariance(utilizationRates),
        trend: this.calculateTrend(utilizationRates)
      });
    }

    // Failure pattern analysis
    const totalExtractionFailures = monitoringResults
      .reduce((sum, r) => sum + (r.metrics?.extractionFailures || 0), 0);
    const totalApiFailures = monitoringResults
      .reduce((sum, r) => sum + (r.metrics?.apiFailures || 0), 0);
    
    patterns.failurePatterns.push({
      totalExtractionFailures,
      totalApiFailures,
      failureRate: (totalExtractionFailures + totalApiFailures) / monitoringResults.length,
      criticalJobs: monitoringResults.filter(r => r.status === 'CRITICAL').length
    });

    // Performance pattern analysis
    const slowDecisionCounts = monitoringResults
      .map(r => r.metrics?.slowDecisions || 0);
    const avgSlowDecisions = slowDecisionCounts.reduce((sum, count) => sum + count, 0) / slowDecisionCounts.length;
    
    patterns.performancePatterns.push({
      averageSlowDecisions: avgSlowDecisions,
      performanceIssues: monitoringResults.filter(r =>
        r.warnings && r.warnings.some(w => w.includes('Slow'))
      ).length
    });

    // Data quality trend analysis
    const integrationGaps = monitoringResults
      .map(r => r.metrics?.integrationGaps || 0);
    const avgIntegrationGaps = integrationGaps.reduce((sum, gaps) => sum + gaps, 0) / integrationGaps.length;
    
    patterns.dataQualityTrends.push({
      averageIntegrationGaps: avgIntegrationGaps,
      dataQualityIssues: monitoringResults.filter(r =>
        r.issues && r.issues.some(i => i.includes('integration') || i.includes('utilization'))
      ).length
    });

    this.monitoringStats.patternsDetected++;
    return patterns;
  }

  /**
   * Process and generate alerts
   */
  async processAlerts(monitoringResults, patternAnalysis) {
    const currentTime = Date.now();
    const newAlerts = [];

    // Job-specific alerts
    for (const result of monitoringResults) {
      if (result.status === 'CRITICAL') {
        const alertKey = `job_critical_${result.jobId}`;
        
        if (this.shouldGenerateAlert(alertKey, currentTime)) {
          const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'JOB_CRITICAL',
            severity: 'HIGH',
            jobId: result.jobId,
            title: `Critical Issues Detected in Job ${result.jobId}`,
            description: `Job has ${result.issues.length} critical issues: ${result.issues.join(', ')}`,
            timestamp: new Date().toISOString(),
            metrics: result.metrics,
            recommendedActions: this.generateRecommendedActions(result)
          };
          
          newAlerts.push(alert);
          this.activeAlerts.set(alertKey, currentTime);
        }
      }
    }

    // System-wide pattern alerts
    const utilizationTrend = patternAnalysis.utilizationTrends[0];
    if (utilizationTrend && utilizationTrend.average < this.monitoringConfig.alertThresholds.utilizationRate) {
      const alertKey = 'system_low_utilization';
      
      if (this.shouldGenerateAlert(alertKey, currentTime)) {
        const alert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'SYSTEM_UTILIZATION',
          severity: 'MEDIUM',
          title: 'System-Wide Low Data Utilization',
          description: `Average utilization rate across all jobs is ${utilizationTrend.average.toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          patternAnalysis: utilizationTrend,
          recommendedActions: [
            'Review data extraction processes',
            'Analyze unused data objects',
            'Optimize narrative integration logic'
          ]
        };
        
        newAlerts.push(alert);
        this.activeAlerts.set(alertKey, currentTime);
      }
    }

    // Failure pattern alerts
    const failurePattern = patternAnalysis.failurePatterns[0];
    if (failurePattern && failurePattern.failureRate > 0.1) { // 10% failure rate threshold
      const alertKey = 'system_high_failures';
      
      if (this.shouldGenerateAlert(alertKey, currentTime)) {
        const alert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'SYSTEM_FAILURES',
          severity: 'HIGH',
          title: 'High System Failure Rate Detected',
          description: `System failure rate is ${(failurePattern.failureRate * 100).toFixed(1)}%`,
          timestamp: new Date().toISOString(),
          patternAnalysis: failurePattern,
          recommendedActions: [
            'Check external API connectivity',
            'Review error logs for patterns',
            'Implement additional retry logic'
          ]
        };
        
        newAlerts.push(alert);
        this.activeAlerts.set(alertKey, currentTime);
      }
    }

    // Emit and save alerts
    for (const alert of newAlerts) {
      this.emit('alert_generated', alert);
      this.monitoringStats.alertsGenerated++;
      
      // Log alert
      logger.warn(`ALERT [${alert.severity}]: ${alert.title}`, {
        description: alert.description,
        alertId: alert.id
      });
      
      // Save alert to S3
      await this._saveAlert(alert);
    }

    return newAlerts;
  }

  /**
   * Check if alert should be generated (respects cooldown)
   */
  shouldGenerateAlert(alertKey, currentTime) {
    const lastAlertTime = this.activeAlerts.get(alertKey);
    if (!lastAlertTime) {
      return true;
    }
    
    return (currentTime - lastAlertTime) > this.monitoringConfig.alertCooldown;
  }

  /**
   * Generate recommended actions for job issues
   */
  generateRecommendedActions(jobResult) {
    const actions = [];
    
    for (const issue of jobResult.issues) {
      if (issue.includes('utilization')) {
        actions.push('Review data extraction and integration processes');
        actions.push('Analyze unused data objects for potential integration');
      }
      
      if (issue.includes('extraction failure')) {
        actions.push('Check data source connectivity and availability');
        actions.push('Review extraction logic for edge cases');
      }
      
      if (issue.includes('API failure')) {
        actions.push('Verify external API credentials and rate limits');
        actions.push('Implement circuit breaker pattern for failing APIs');
      }
      
      if (issue.includes('integration gaps')) {
        actions.push('Review narrative integration logic');
        actions.push('Ensure all extracted data has integration pathways');
      }
    }
    
    // Remove duplicates
    return [...new Set(actions)];
  }

  /**
   * Update system health status
   */
  updateSystemHealth(monitoringResults, patternAnalysis) {
    const criticalJobs = monitoringResults.filter(r => r.status === 'CRITICAL').length;
    const warningJobs = monitoringResults.filter(r => r.status === 'WARNING').length;
    const totalJobs = monitoringResults.length;
    
    if (totalJobs === 0) {
      this.monitoringStats.systemHealth = 'UNKNOWN';
      return;
    }
    
    const criticalRatio = criticalJobs / totalJobs;
    const warningRatio = warningJobs / totalJobs;
    
    if (criticalRatio >= 0.5) { // More than 50% critical
      this.monitoringStats.systemHealth = 'CRITICAL';
    } else if (criticalRatio > 0.2 || warningRatio > 0.6) { // More than 20% critical or 60% warning
      this.monitoringStats.systemHealth = 'DEGRADED';
    } else if (warningRatio > 0.3) { // More than 30% warning
      this.monitoringStats.systemHealth = 'WARNING';
    } else {
      this.monitoringStats.systemHealth = 'HEALTHY';
    }
  }

  /**
   * Get list of active jobs to monitor
   * Uses dataLineageService which is already S3-migrated
   */
  async getActiveJobs() {
    try {
      // Delegate to dataLineageService.getAvailableJobs() which uses S3
      const allJobs = await this.lineageService.getAvailableJobs();
      
      // Filter to recent jobs (within retention period)
      const cutoffTime = Date.now() - this.monitoringConfig.retentionPeriod;
      const activeJobs = [];
      
      for (const jobId of allJobs) {
        try {
          const summary = await this.lineageService.getLineageSummary(jobId);
          if (summary && summary.createdAt) {
            const createdTime = new Date(summary.createdAt).getTime();
            
            if (createdTime > cutoffTime) {
              activeJobs.push(jobId);
            }
          }
        } catch (error) {
          logger.warn(`Error reading job summary for ${jobId}`, {
            error: error.message
          });
        }
      }
      
      return activeJobs.sort(); // Sort for consistent processing order
      
    } catch (error) {
      logger.error('Error getting active jobs', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Save alert to S3
   * @private
   */
  async _saveAlert(alert) {
    try {
      const alertKey = this.storage.buildLineageAlertKey(alert.id);
      await this.storage.putJSON(alertKey, alert);
      
      logger.debug('Alert saved to S3', {
        alertId: alert.id,
        key: alertKey,
        type: alert.type
      });
    } catch (error) {
      logger.error('Failed to save alert to S3', {
        alertId: alert.id,
        error: error.message
      });
      // Don't throw - alerting failures should not break monitoring
    }
  }

  /**
   * Load alerts from S3
   * @private
   */
  async _loadAlerts() {
    try {
      // List all alert files from S3
      const prefix = 'alerts/';
      const objects = await this.storage.listObjects(prefix);
      
      const alerts = [];
      
      // Read each alert file
      for (const obj of objects) {
        if (obj.Key && obj.Key.endsWith('.json')) {
          try {
            const alertData = await this.storage.getJSON(obj.Key);
            if (alertData) {
              alerts.push(alertData);
            }
          } catch (error) {
            logger.warn(`Failed to read alert file ${obj.Key}`, {
              error: error.message
            });
          }
        }
      }
      
      // Sort by timestamp descending (most recent first)
      alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      return alerts;
    } catch (error) {
      logger.error('Failed to load alerts from S3', {
        error: error.message
      });
      return []; // Return empty array on error
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats() {
    return {
      ...this.monitoringStats,
      isMonitoring: this.isMonitoring,
      activeAlertsCount: this.activeAlerts.size,
      config: this.monitoringConfig
    };
  }

  /**
   * Get recent alerts from S3
   */
  async getRecentAlerts(limit = 50) {
    try {
      const allAlerts = await this._loadAlerts();
      return allAlerts.slice(0, limit);
    } catch (error) {
      logger.error('Error getting recent alerts', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig) {
    this.monitoringConfig = {
      ...this.monitoringConfig,
      ...newConfig
    };
    
    this.emit('config_updated', {
      timestamp: new Date().toISOString(),
      config: this.monitoringConfig
    });
  }

  // Helper methods
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  calculateTrend(values) {
    if (values.length < 2) return 'STABLE';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    const threshold = firstAvg * 0.05; // 5% threshold
    
    if (diff > threshold) return 'IMPROVING';
    if (diff < -threshold) return 'DECLINING';
    return 'STABLE';
  }
}

module.exports = LineageMonitoringService;