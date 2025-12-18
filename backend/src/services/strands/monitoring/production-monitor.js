/**
 * Strands Production Monitoring Service
 * 
 * Phase 3: Production monitoring and alerting integration for Strands framework
 * operations. Provides comprehensive monitoring, alerting, and performance
 * tracking for Strands-enhanced content generation workflows.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const EventEmitter = require('events');
const { logger } = require('../../../utils/logger');

class StrandsProductionMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableCloudWatchMetrics: options.enableCloudWatchMetrics !== false,
            enableAlerting: options.enableAlerting !== false,
            metricsInterval: options.metricsInterval || 60000, // 1 minute
            alertThresholds: {
                errorRate: options.alertThresholds?.errorRate || 0.1, // 10%
                responseTime: options.alertThresholds?.responseTime || 30000, // 30 seconds
                patternFailureRate: options.alertThresholds?.patternFailureRate || 0.2, // 20%
                ...options.alertThresholds
            },
            ...options
        };

        // Monitoring state
        this.isMonitoring = false;
        this.metricsInterval = null;
        this.startTime = Date.now();

        // Performance metrics
        this.metrics = {
            strandsExecutions: {
                total: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0,
                lastExecution: null
            },
            orchestrationPatterns: {
                conditional: { executions: 0, successes: 0, averageTime: 0 },
                swarm: { executions: 0, successes: 0, averageTime: 0 },
                nested: { executions: 0, successes: 0, averageTime: 0 },
                hybrid: { executions: 0, successes: 0, averageTime: 0 }
            },
            agentCoordination: {
                totalAgentsCoordinated: 0,
                averageAgentsPerExecution: 0,
                coordinationFailures: 0
            },
            fallbackUsage: {
                total: 0,
                reasons: new Map()
            },
            alerts: {
                total: 0,
                active: 0,
                resolved: 0
            }
        };

        // Alert state
        this.activeAlerts = new Map();
        this.alertHistory = [];

        if (this.options.enableCloudWatchMetrics) {
            this._initializeCloudWatchMetrics();
        }

        logger.info('StrandsProductionMonitor initialized', {
            enableCloudWatchMetrics: this.options.enableCloudWatchMetrics,
            enableAlerting: this.options.enableAlerting,
            metricsInterval: this.options.metricsInterval
        });
    }

    /**
     * Start production monitoring
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            logger.warn('Strands production monitoring already running');
            return;
        }

        try {
            logger.info('🚀 Starting Strands production monitoring...');

            this.isMonitoring = true;
            this.startTime = Date.now();

            // Start metrics collection interval
            this.metricsInterval = setInterval(() => {
                this._collectAndPublishMetrics();
            }, this.options.metricsInterval);

            // Set up event listeners for real-time monitoring
            this._setupEventListeners();

            logger.info('✅ Strands production monitoring started successfully', {
                metricsInterval: this.options.metricsInterval,
                alerting: this.options.enableAlerting,
                cloudWatch: this.options.enableCloudWatchMetrics
            });

            this.emit('monitoring_started');

        } catch (error) {
            logger.error('Failed to start Strands production monitoring', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Stop production monitoring
     */
    async stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        try {
            logger.info('🛑 Stopping Strands production monitoring...');

            this.isMonitoring = false;

            // Clear metrics interval
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
                this.metricsInterval = null;
            }

            // Publish final metrics
            await this._collectAndPublishMetrics();

            logger.info('✅ Strands production monitoring stopped');
            this.emit('monitoring_stopped');

        } catch (error) {
            logger.error('Error stopping Strands production monitoring', {
                error: error.message
            });
        }
    }

    /**
     * Track Strands execution
     */
    trackStrandsExecution(executionData) {
        try {
            const {
                pattern,
                success,
                executionTime,
                agentsCoordinated,
                error,
                fallbackUsed,
                fallbackReason
            } = executionData;

            // Update overall metrics
            this.metrics.strandsExecutions.total++;
            this.metrics.strandsExecutions.lastExecution = Date.now();

            if (success) {
                this.metrics.strandsExecutions.successful++;
                this._updateAverageResponseTime(executionTime);
            } else {
                this.metrics.strandsExecutions.failed++;
                this._checkErrorRateAlert();
            }

            // Update pattern-specific metrics
            if (pattern && this.metrics.orchestrationPatterns[pattern]) {
                this.metrics.orchestrationPatterns[pattern].executions++;
                if (success) {
                    this.metrics.orchestrationPatterns[pattern].successes++;
                    this._updatePatternAverageTime(pattern, executionTime);
                }
            }

            // Update agent coordination metrics
            if (agentsCoordinated) {
                this.metrics.agentCoordination.totalAgentsCoordinated += agentsCoordinated;
                this._updateAverageAgentsPerExecution(agentsCoordinated);
            }

            // Track fallback usage
            if (fallbackUsed) {
                this.metrics.fallbackUsage.total++;
                const reason = fallbackReason || 'unknown';
                const currentCount = this.metrics.fallbackUsage.reasons.get(reason) || 0;
                this.metrics.fallbackUsage.reasons.set(reason, currentCount + 1);
            }

            // Check for alerts
            this._checkPerformanceAlerts(executionTime);
            this._checkPatternFailureAlerts(pattern, success);

            logger.debug('Strands execution tracked', {
                pattern,
                success,
                executionTime,
                agentsCoordinated,
                fallbackUsed
            });

            this.emit('execution_tracked', executionData);

        } catch (error) {
            logger.error('Failed to track Strands execution', {
                error: error.message,
                executionData
            });
        }
    }

    /**
     * Get current monitoring metrics
     */
    getMetrics() {
        const uptime = Date.now() - this.startTime;
        const errorRate = this.metrics.strandsExecutions.total > 0 ? 
            this.metrics.strandsExecutions.failed / this.metrics.strandsExecutions.total : 0;

        return {
            monitoring: {
                isActive: this.isMonitoring,
                uptime,
                startTime: this.startTime
            },
            performance: {
                ...this.metrics.strandsExecutions,
                errorRate: (errorRate * 100).toFixed(2) + '%',
                successRate: ((1 - errorRate) * 100).toFixed(2) + '%'
            },
            patterns: this._getPatternMetrics(),
            agentCoordination: this.metrics.agentCoordination,
            fallbacks: {
                total: this.metrics.fallbackUsage.total,
                reasons: Object.fromEntries(this.metrics.fallbackUsage.reasons)
            },
            alerts: {
                total: this.metrics.alerts.total,
                active: this.metrics.alerts.active,
                resolved: this.metrics.alerts.resolved,
                activeAlerts: Array.from(this.activeAlerts.values())
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get pattern-specific metrics
     * @private
     */
    _getPatternMetrics() {
        const patternMetrics = {};
        
        for (const [pattern, data] of Object.entries(this.metrics.orchestrationPatterns)) {
            const successRate = data.executions > 0 ? data.successes / data.executions : 0;
            
            patternMetrics[pattern] = {
                executions: data.executions,
                successes: data.successes,
                failures: data.executions - data.successes,
                successRate: (successRate * 100).toFixed(2) + '%',
                averageTime: data.averageTime
            };
        }

        return patternMetrics;
    }

    /**
     * Initialize CloudWatch metrics
     * @private
     */
    _initializeCloudWatchMetrics() {
        try {
            // Only initialize if AWS SDK is available
            if (process.env.AWS_REGION) {
                logger.info('CloudWatch metrics integration enabled for Strands monitoring');
                this.cloudWatchEnabled = true;
            } else {
                logger.warn('AWS_REGION not configured - CloudWatch metrics disabled');
                this.cloudWatchEnabled = false;
            }
        } catch (error) {
            logger.warn('Failed to initialize CloudWatch metrics', {
                error: error.message
            });
            this.cloudWatchEnabled = false;
        }
    }

    /**
     * Set up event listeners for real-time monitoring
     * @private
     */
    _setupEventListeners() {
        // Listen for orchestrator events (if available)
        this.on('strands_execution_started', (data) => {
            logger.debug('Strands execution started', data);
        });

        this.on('strands_execution_completed', (data) => {
            this.trackStrandsExecution(data);
        });

        this.on('strands_execution_failed', (data) => {
            this.trackStrandsExecution({ ...data, success: false });
        });

        this.on('alert_triggered', (alert) => {
            this._handleAlert(alert);
        });
    }

    /**
     * Collect and publish metrics
     * @private
     */
    async _collectAndPublishMetrics() {
        try {
            const metrics = this.getMetrics();

            // Publish to CloudWatch if enabled
            if (this.cloudWatchEnabled) {
                await this._publishToCloudWatch(metrics);
            }

            // Log metrics summary
            logger.info('📊 Strands monitoring metrics collected', {
                totalExecutions: metrics.performance.total,
                successRate: metrics.performance.successRate,
                averageResponseTime: metrics.performance.averageResponseTime,
                activeAlerts: metrics.alerts.active,
                uptime: metrics.monitoring.uptime
            });

            this.emit('metrics_collected', metrics);

        } catch (error) {
            logger.error('Failed to collect and publish Strands metrics', {
                error: error.message
            });
        }
    }

    /**
     * Publish metrics to CloudWatch
     * @private
     */
    async _publishToCloudWatch(metrics) {
        try {
            // This would integrate with AWS CloudWatch SDK
            // For now, we'll log the metrics that would be published
            
            const cloudWatchMetrics = [
                {
                    MetricName: 'StrandsExecutions',
                    Value: metrics.performance.total,
                    Unit: 'Count',
                    Namespace: 'Custom/StrandsFramework'
                },
                {
                    MetricName: 'StrandsSuccessRate',
                    Value: parseFloat(metrics.performance.successRate),
                    Unit: 'Percent',
                    Namespace: 'Custom/StrandsFramework'
                },
                {
                    MetricName: 'StrandsAverageResponseTime',
                    Value: metrics.performance.averageResponseTime,
                    Unit: 'Milliseconds',
                    Namespace: 'Custom/StrandsFramework'
                },
                {
                    MetricName: 'StrandsActiveAlerts',
                    Value: metrics.alerts.active,
                    Unit: 'Count',
                    Namespace: 'Custom/StrandsFramework'
                }
            ];

            logger.debug('📈 CloudWatch metrics prepared for Strands monitoring', {
                metricsCount: cloudWatchMetrics.length,
                namespace: 'Custom/StrandsFramework'
            });

            // TODO: Implement actual CloudWatch SDK integration
            // await cloudWatch.putMetricData({ MetricData: cloudWatchMetrics }).promise();

        } catch (error) {
            logger.error('Failed to publish CloudWatch metrics', {
                error: error.message
            });
        }
    }

    /**
     * Update average response time
     * @private
     */
    _updateAverageResponseTime(executionTime) {
        const total = this.metrics.strandsExecutions.successful;
        const current = this.metrics.strandsExecutions.averageResponseTime;
        this.metrics.strandsExecutions.averageResponseTime = 
            (current * (total - 1) + executionTime) / total;
    }

    /**
     * Update pattern average time
     * @private
     */
    _updatePatternAverageTime(pattern, executionTime) {
        const patternData = this.metrics.orchestrationPatterns[pattern];
        const successes = patternData.successes;
        const current = patternData.averageTime;
        patternData.averageTime = (current * (successes - 1) + executionTime) / successes;
    }

    /**
     * Update average agents per execution
     * @private
     */
    _updateAverageAgentsPerExecution(agentsCoordinated) {
        const total = this.metrics.strandsExecutions.total;
        const currentTotal = this.metrics.agentCoordination.totalAgentsCoordinated;
        this.metrics.agentCoordination.averageAgentsPerExecution = currentTotal / total;
    }

    /**
     * Check error rate alerts
     * @private
     */
    _checkErrorRateAlert() {
        const total = this.metrics.strandsExecutions.total;
        const failed = this.metrics.strandsExecutions.failed;
        
        if (total >= 10) { // Only check after minimum executions
            const errorRate = failed / total;
            
            if (errorRate > this.options.alertThresholds.errorRate) {
                this._triggerAlert('high_error_rate', {
                    errorRate: (errorRate * 100).toFixed(2) + '%',
                    threshold: (this.options.alertThresholds.errorRate * 100).toFixed(2) + '%',
                    totalExecutions: total,
                    failedExecutions: failed
                });
            }
        }
    }

    /**
     * Check performance alerts
     * @private
     */
    _checkPerformanceAlerts(executionTime) {
        if (executionTime > this.options.alertThresholds.responseTime) {
            this._triggerAlert('slow_response_time', {
                executionTime,
                threshold: this.options.alertThresholds.responseTime,
                message: `Strands execution took ${executionTime}ms (threshold: ${this.options.alertThresholds.responseTime}ms)`
            });
        }
    }

    /**
     * Check pattern failure alerts
     * @private
     */
    _checkPatternFailureAlerts(pattern, success) {
        if (!pattern || success) return;

        const patternData = this.metrics.orchestrationPatterns[pattern];
        if (!patternData || patternData.executions < 5) return; // Need minimum executions

        const failureRate = (patternData.executions - patternData.successes) / patternData.executions;
        
        if (failureRate > this.options.alertThresholds.patternFailureRate) {
            this._triggerAlert('pattern_failure_rate', {
                pattern,
                failureRate: (failureRate * 100).toFixed(2) + '%',
                threshold: (this.options.alertThresholds.patternFailureRate * 100).toFixed(2) + '%',
                executions: patternData.executions,
                failures: patternData.executions - patternData.successes
            });
        }
    }

    /**
     * Trigger alert
     * @private
     */
    _triggerAlert(alertType, alertData) {
        const alertId = `${alertType}_${Date.now()}`;
        const alert = {
            id: alertId,
            type: alertType,
            severity: this._getAlertSeverity(alertType),
            data: alertData,
            timestamp: new Date().toISOString(),
            status: 'active'
        };

        this.activeAlerts.set(alertId, alert);
        this.metrics.alerts.total++;
        this.metrics.alerts.active++;

        logger.warn(`🚨 STRANDS ALERT: ${alertType}`, {
            alertId,
            severity: alert.severity,
            data: alertData
        });

        this.emit('alert_triggered', alert);

        // Auto-resolve certain alerts after a timeout
        if (this._shouldAutoResolve(alertType)) {
            setTimeout(() => {
                this._resolveAlert(alertId, 'auto_resolved');
            }, 300000); // 5 minutes
        }
    }

    /**
     * Resolve alert
     * @private
     */
    _resolveAlert(alertId, resolution = 'manual') {
        const alert = this.activeAlerts.get(alertId);
        if (!alert) return;

        alert.status = 'resolved';
        alert.resolvedAt = new Date().toISOString();
        alert.resolution = resolution;

        this.activeAlerts.delete(alertId);
        this.alertHistory.push(alert);
        this.metrics.alerts.active--;
        this.metrics.alerts.resolved++;

        logger.info(`✅ STRANDS ALERT RESOLVED: ${alert.type}`, {
            alertId,
            resolution,
            duration: Date.now() - new Date(alert.timestamp).getTime()
        });

        this.emit('alert_resolved', alert);
    }

    /**
     * Get alert severity
     * @private
     */
    _getAlertSeverity(alertType) {
        const severityMap = {
            high_error_rate: 'critical',
            slow_response_time: 'warning',
            pattern_failure_rate: 'high',
            agent_coordination_failure: 'high',
            fallback_usage_spike: 'medium'
        };

        return severityMap[alertType] || 'medium';
    }

    /**
     * Check if alert should auto-resolve
     * @private
     */
    _shouldAutoResolve(alertType) {
        const autoResolveTypes = ['slow_response_time'];
        return autoResolveTypes.includes(alertType);
    }

    /**
     * Handle alert
     * @private
     */
    _handleAlert(alert) {
        // This could integrate with external alerting systems
        // For now, we'll log the alert
        
        logger.warn(`🚨 STRANDS PRODUCTION ALERT: ${alert.type}`, {
            alertId: alert.id,
            severity: alert.severity,
            data: alert.data,
            timestamp: alert.timestamp
        });

        // TODO: Integrate with external alerting systems
        // - PagerDuty
        // - Slack notifications
        // - Email alerts
        // - AWS SNS
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            service: 'StrandsProductionMonitor',
            version: '1.0.0',
            monitoring: {
                active: this.isMonitoring,
                uptime: Date.now() - this.startTime,
                startTime: this.startTime
            },
            configuration: {
                metricsInterval: this.options.metricsInterval,
                enableAlerting: this.options.enableAlerting,
                enableCloudWatchMetrics: this.options.enableCloudWatchMetrics,
                alertThresholds: this.options.alertThresholds
            },
            metrics: this.getMetrics(),
            health: this.isMonitoring ? 'healthy' : 'stopped'
        };
    }

    /**
     * Cleanup monitoring resources
     */
    async cleanup() {
        await this.stopMonitoring();
        this.removeAllListeners();
        this.activeAlerts.clear();
        this.alertHistory = [];
        
        logger.info('Strands production monitoring cleanup completed');
    }
}

module.exports = StrandsProductionMonitor;