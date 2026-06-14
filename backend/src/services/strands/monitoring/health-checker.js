/**
 * Health Checker for Strands Framework Integration
 * 
 * Provides comprehensive health monitoring for Strands framework components
 * including bridge connectivity, agent status, and system performance metrics.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const EventEmitter = require('events');
const { logger } = require('../../../utils/logger');
const strandsConfig = require('../config/strands-config');

class StrandsHealthChecker extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            checkInterval: options.checkInterval || strandsConfig.getMonitoringConfig().healthCheckInterval,
            alertThreshold: options.alertThreshold || 3, // Consecutive failures before alert
            performanceWindow: options.performanceWindow || 300000, // 5 minutes
            ...options
        };

        // Health state tracking
        this.healthState = {
            overall: 'unknown',
            bridge: 'unknown',
            python: 'unknown',
            agents: 'unknown',
            lastCheck: null,
            consecutiveFailures: 0
        };

        // Performance tracking
        this.performanceHistory = [];
        this.alertHistory = [];

        // Health check interval
        this.healthCheckInterval = null;
        this.isRunning = false;

        // Component references (set by bridge manager)
        this.bridgeManager = null;
        this.bridge = null;

        logger.info('StrandsHealthChecker initialized', {
            checkInterval: this.options.checkInterval,
            alertThreshold: this.options.alertThreshold
        });
    }

    /**
     * Initialize health checker
     * @param {Object} components - Component references
     */
    async initialize(components = {}) {
        try {
            logger.info('Initializing Strands Health Checker...');

            // Set component references
            this.bridgeManager = components.bridgeManager;
            this.bridge = components.bridge;

            // Start health monitoring if Strands is enabled
            if (strandsConfig.isEnabled()) {
                this.startMonitoring();
            } else {
                logger.info('Strands disabled - health checker in passive mode');
            }

            logger.info('Strands Health Checker initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Strands Health Checker', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Start health monitoring
     */
    startMonitoring() {
        if (this.isRunning) {
            logger.warn('Health monitoring already running');
            return;
        }

        logger.info('Starting Strands health monitoring...', {
            interval: this.options.checkInterval
        });

        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck();
        }, this.options.checkInterval);

        this.isRunning = true;
        this.emit('monitoring_started');
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring() {
        if (!this.isRunning) {
            logger.warn('Health monitoring not running');
            return;
        }

        logger.info('Stopping Strands health monitoring...');

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        this.isRunning = false;
        this.emit('monitoring_stopped');
    }

    /**
     * Perform comprehensive health check
     * @private
     */
    async _performHealthCheck() {
        const checkStartTime = Date.now();
        
        try {
            logger.debug('Performing Strands health check...');

            const healthResults = {
                timestamp: checkStartTime,
                overall: 'healthy',
                components: {}
            };

            // Check bridge health
            healthResults.components.bridge = await this._checkBridgeHealth();
            
            // Check Python process health
            healthResults.components.python = await this._checkPythonHealth();
            
            // Check agent health
            healthResults.components.agents = await this._checkAgentHealth();
            
            // Check system performance
            healthResults.components.performance = await this._checkPerformanceHealth();

            // Determine overall health
            healthResults.overall = this._determineOverallHealth(healthResults.components);

            // Update health state
            this._updateHealthState(healthResults);

            // Record performance metrics
            this._recordPerformanceMetrics(checkStartTime, healthResults);

            // Emit health check event
            this.emit('health_check_completed', healthResults);

            logger.debug('Health check completed', {
                overall: healthResults.overall,
                duration: Date.now() - checkStartTime
            });

        } catch (error) {
            logger.error('Health check failed', {
                error: error.message,
                duration: Date.now() - checkStartTime
            });

            this._handleHealthCheckFailure(error);
        }
    }

    /**
     * Check bridge health
     * @private
     */
    async _checkBridgeHealth() {
        try {
            if (!this.bridge) {
                return {
                    status: 'unavailable',
                    message: 'Bridge not initialized',
                    details: {}
                };
            }

            const bridgeStatus = this.bridge.getStatus();
            const bridgeMetrics = this.bridge.getMetrics();

            return {
                status: bridgeStatus.connected ? 'healthy' : 'unhealthy',
                message: bridgeStatus.connected ? 'Bridge connected' : 'Bridge disconnected',
                details: {
                    connected: bridgeStatus.connected,
                    pythonProcessId: bridgeStatus.pythonProcessId,
                    registeredAgents: bridgeStatus.registeredAgents?.length || 0,
                    successRate: bridgeMetrics.successRate || 0,
                    averageResponseTime: bridgeMetrics.averageResponseTime || 0,
                    uptime: bridgeMetrics.uptime || 0
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Bridge health check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check Python process health
     * @private
     */
    async _checkPythonHealth() {
        try {
            if (!this.bridge || !this.bridge.isConnected) {
                return {
                    status: 'unavailable',
                    message: 'Python process not accessible - bridge disconnected',
                    details: {}
                };
            }

            const bridgeStatus = this.bridge.getStatus();
            const healthStatus = bridgeStatus.healthStatus || {};

            const isHealthy = healthStatus.python === 'healthy' && 
                            healthStatus.lastHeartbeat && 
                            (Date.now() - healthStatus.lastHeartbeat) < (this.options.checkInterval * 2);

            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                message: isHealthy ? 'Python process healthy' : 'Python process unhealthy or unresponsive',
                details: {
                    pythonStatus: healthStatus.python,
                    lastHeartbeat: healthStatus.lastHeartbeat,
                    timeSinceHeartbeat: healthStatus.lastHeartbeat 
                        ? Date.now() - healthStatus.lastHeartbeat 
                        : null,
                    consecutiveFailures: healthStatus.consecutiveFailures || 0
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Python health check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check agent health
     * @private
     */
    async _checkAgentHealth() {
        try {
            if (!this.bridgeManager) {
                return {
                    status: 'unavailable',
                    message: 'Bridge manager not available',
                    details: {}
                };
            }

            const agentWrappers = this.bridgeManager.getAgentWrappers();
            const agentStats = this.bridgeManager.getAgentStatistics();

            let healthyAgents = 0;
            let unhealthyAgents = 0;
            const agentDetails = {};

            for (const [agentName, wrapper] of agentWrappers.entries()) {
                const wrapperStatus = wrapper.getStatus();
                const wrapperMetrics = wrapper.getMetrics();

                const isHealthy = wrapperStatus.isInitialized && 
                                wrapperStatus.originalAgentAvailable &&
                                wrapperMetrics.successRate >= 80;

                if (isHealthy) {
                    healthyAgents++;
                } else {
                    unhealthyAgents++;
                }

                agentDetails[agentName] = {
                    healthy: isHealthy,
                    initialized: wrapperStatus.isInitialized,
                    strandsEnabled: wrapperStatus.strandsEnabled,
                    successRate: wrapperMetrics.successRate,
                    totalExecutions: wrapperMetrics.totalExecutions
                };
            }

            const totalAgents = healthyAgents + unhealthyAgents;
            const overallHealthy = totalAgents > 0 && (healthyAgents / totalAgents) >= 0.8;

            return {
                status: overallHealthy ? 'healthy' : 'degraded',
                message: `${healthyAgents}/${totalAgents} agents healthy`,
                details: {
                    totalAgents,
                    healthyAgents,
                    unhealthyAgents,
                    overallSuccessRate: agentStats.overall?.averageSuccessRate || 0,
                    agentDetails
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Agent health check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Check performance health
     * @private
     */
    async _checkPerformanceHealth() {
        try {
            const recentPerformance = this._getRecentPerformanceMetrics();
            
            // Define performance thresholds
            const thresholds = {
                averageResponseTime: 5000, // 5 seconds
                successRate: 90, // 90%
                errorRate: 10 // 10%
            };

            const issues = [];
            
            if (recentPerformance.averageResponseTime > thresholds.averageResponseTime) {
                issues.push(`High response time: ${recentPerformance.averageResponseTime}ms`);
            }
            
            if (recentPerformance.successRate < thresholds.successRate) {
                issues.push(`Low success rate: ${recentPerformance.successRate}%`);
            }
            
            if (recentPerformance.errorRate > thresholds.errorRate) {
                issues.push(`High error rate: ${recentPerformance.errorRate}%`);
            }

            return {
                status: issues.length === 0 ? 'healthy' : 'degraded',
                message: issues.length === 0 ? 'Performance within thresholds' : `Performance issues: ${issues.join(', ')}`,
                details: {
                    ...recentPerformance,
                    thresholds,
                    issues
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Performance health check failed: ${error.message}`,
                details: { error: error.message }
            };
        }
    }

    /**
     * Get recent performance metrics
     * @private
     */
    _getRecentPerformanceMetrics() {
        const cutoffTime = Date.now() - this.options.performanceWindow;
        const recentMetrics = this.performanceHistory.filter(m => m.timestamp > cutoffTime);

        if (recentMetrics.length === 0) {
            return {
                averageResponseTime: 0,
                successRate: 100,
                errorRate: 0,
                totalChecks: 0
            };
        }

        const totalResponseTime = recentMetrics.reduce((sum, m) => sum + (m.responseTime || 0), 0);
        const successfulChecks = recentMetrics.filter(m => m.success).length;

        return {
            averageResponseTime: totalResponseTime / recentMetrics.length,
            successRate: (successfulChecks / recentMetrics.length) * 100,
            errorRate: ((recentMetrics.length - successfulChecks) / recentMetrics.length) * 100,
            totalChecks: recentMetrics.length,
            timeWindow: this.options.performanceWindow
        };
    }

    /**
     * Determine overall health from component health
     * @private
     */
    _determineOverallHealth(components) {
        const componentStatuses = Object.values(components).map(c => c.status);
        
        // If any component has error status, overall is error
        if (componentStatuses.includes('error')) {
            return 'error';
        }
        
        // If any component is unhealthy, overall is unhealthy
        if (componentStatuses.includes('unhealthy')) {
            return 'unhealthy';
        }
        
        // If any component is degraded, overall is degraded
        if (componentStatuses.includes('degraded')) {
            return 'degraded';
        }
        
        // If any component is unavailable, overall is degraded
        if (componentStatuses.includes('unavailable')) {
            return 'degraded';
        }
        
        // All components healthy
        return 'healthy';
    }

    /**
     * Update health state
     * @private
     */
    _updateHealthState(healthResults) {
        const previousState = this.healthState.overall;
        
        this.healthState = {
            overall: healthResults.overall,
            bridge: healthResults.components.bridge?.status || 'unknown',
            python: healthResults.components.python?.status || 'unknown',
            agents: healthResults.components.agents?.status || 'unknown',
            performance: healthResults.components.performance?.status || 'unknown',
            lastCheck: healthResults.timestamp,
            consecutiveFailures: healthResults.overall === 'healthy' ? 0 : this.healthState.consecutiveFailures + 1
        };

        // Emit state change event
        if (previousState !== this.healthState.overall) {
            logger.info('Strands health state changed', {
                from: previousState,
                to: this.healthState.overall,
                consecutiveFailures: this.healthState.consecutiveFailures
            });

            this.emit('health_state_changed', {
                previousState,
                currentState: this.healthState.overall,
                healthResults
            });
        }

        // Check for alert conditions
        this._checkAlertConditions(healthResults);
    }

    /**
     * Record performance metrics
     * @private
     */
    _recordPerformanceMetrics(startTime, healthResults) {
        const performanceMetric = {
            timestamp: startTime,
            responseTime: Date.now() - startTime,
            success: healthResults.overall === 'healthy',
            overallStatus: healthResults.overall,
            componentStatuses: Object.fromEntries(
                Object.entries(healthResults.components).map(([key, value]) => [key, value.status])
            )
        };

        this.performanceHistory.push(performanceMetric);

        // Keep only recent metrics
        const cutoffTime = Date.now() - (this.options.performanceWindow * 2); // Keep 2x window for analysis
        this.performanceHistory = this.performanceHistory.filter(m => m.timestamp > cutoffTime);
    }

    /**
     * Check for alert conditions
     * @private
     */
    _checkAlertConditions(healthResults) {
        // Alert on consecutive failures
        if (this.healthState.consecutiveFailures >= this.options.alertThreshold) {
            this._triggerAlert('consecutive_failures', {
                failures: this.healthState.consecutiveFailures,
                threshold: this.options.alertThreshold,
                healthResults
            });
        }

        // Alert on component-specific issues
        for (const [component, result] of Object.entries(healthResults.components)) {
            if (result.status === 'error' || result.status === 'unhealthy') {
                this._triggerAlert('component_unhealthy', {
                    component,
                    status: result.status,
                    message: result.message,
                    details: result.details
                });
            }
        }
    }

    /**
     * Trigger health alert
     * @private
     */
    _triggerAlert(alertType, alertData) {
        const alert = {
            type: alertType,
            timestamp: Date.now(),
            severity: this._getAlertSeverity(alertType, alertData),
            data: alertData
        };

        this.alertHistory.push(alert);

        // Keep only recent alerts
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        this.alertHistory = this.alertHistory.filter(a => a.timestamp > cutoffTime);

        logger.warn(`Strands health alert: ${alertType}`, {
            severity: alert.severity,
            alertData
        });

        this.emit('health_alert', alert);
    }

    /**
     * Get alert severity
     * @private
     */
    _getAlertSeverity(alertType, alertData) {
        switch (alertType) {
            case 'consecutive_failures':
                return alertData.failures >= 5 ? 'critical' : 'warning';
            case 'component_unhealthy':
                return alertData.status === 'error' ? 'critical' : 'warning';
            default:
                return 'info';
        }
    }

    /**
     * Handle health check failure
     * @private
     */
    _handleHealthCheckFailure(error) {
        this.healthState.consecutiveFailures++;
        this.healthState.lastCheck = Date.now();
        this.healthState.overall = 'error';

        this._triggerAlert('health_check_failure', {
            error: error.message,
            consecutiveFailures: this.healthState.consecutiveFailures
        });
    }

    /**
     * Get current health status
     * @returns {Object}
     */
    getHealthStatus() {
        return {
            ...this.healthState,
            monitoring: {
                running: this.isRunning,
                interval: this.options.checkInterval,
                alertThreshold: this.options.alertThreshold
            },
            recentPerformance: this._getRecentPerformanceMetrics(),
            recentAlerts: this.alertHistory.slice(-10) // Last 10 alerts
        };
    }

    /**
     * Get health summary for external consumption
     * @returns {Object}
     */
    getHealthSummary() {
        const recentPerformance = this._getRecentPerformanceMetrics();
        
        return {
            overall: this.healthState.overall,
            components: {
                bridge: this.healthState.bridge,
                python: this.healthState.python,
                agents: this.healthState.agents,
                performance: this.healthState.performance
            },
            metrics: {
                successRate: recentPerformance.successRate,
                averageResponseTime: recentPerformance.averageResponseTime,
                consecutiveFailures: this.healthState.consecutiveFailures,
                lastCheck: this.healthState.lastCheck
            },
            alerts: {
                recentCount: this.alertHistory.filter(a => a.timestamp > Date.now() - 3600000).length, // Last hour
                criticalCount: this.alertHistory.filter(a => a.severity === 'critical').length
            },
            monitoring: {
                enabled: strandsConfig.isEnabled(),
                running: this.isRunning
            }
        };
    }

    /**
     * Force health check
     * @returns {Promise<Object>}
     */
    async forceHealthCheck() {
        logger.info('Forcing Strands health check...');
        
        return new Promise((resolve) => {
            // Listen for next health check completion
            const timeout = setTimeout(() => {
                resolve({
                    success: false,
                    error: 'Health check timeout'
                });
            }, 10000);

            this.once('health_check_completed', (results) => {
                clearTimeout(timeout);
                resolve({
                    success: true,
                    results
                });
            });

            // Trigger immediate health check
            this._performHealthCheck();
        });
    }

    /**
     * Get health trends
     * @returns {Object}
     */
    getHealthTrends() {
        const recentMetrics = this.performanceHistory.filter(
            m => m.timestamp > Date.now() - this.options.performanceWindow
        );

        if (recentMetrics.length === 0) {
            return {
                trend: 'stable',
                confidence: 0,
                metrics: {}
            };
        }

        // Calculate trends
        const successRates = recentMetrics.map(m => m.success ? 100 : 0);
        const responseTimes = recentMetrics.map(m => m.responseTime);

        const avgSuccessRate = successRates.reduce((a, b) => a + b, 0) / successRates.length;
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        // Determine trend
        let trend = 'stable';
        if (avgSuccessRate < 80) trend = 'degrading';
        if (avgSuccessRate > 95 && avgResponseTime < 1000) trend = 'improving';

        return {
            trend,
            confidence: Math.min(recentMetrics.length / 10, 1), // Confidence based on sample size
            metrics: {
                averageSuccessRate: avgSuccessRate,
                averageResponseTime: avgResponseTime,
                sampleSize: recentMetrics.length,
                timeWindow: this.options.performanceWindow
            }
        };
    }

    /**
     * Cleanup health checker
     */
    async cleanup() {
        try {
            logger.info('Cleaning up Strands Health Checker...');

            this.stopMonitoring();

            // Clear data
            this.performanceHistory = [];
            this.alertHistory = [];
            
            // Reset state
            this.healthState = {
                overall: 'unknown',
                bridge: 'unknown',
                python: 'unknown',
                agents: 'unknown',
                lastCheck: null,
                consecutiveFailures: 0
            };

            logger.info('Strands Health Checker cleaned up successfully');
            this.emit('cleanup_complete');
        } catch (error) {
            logger.error('Error during health checker cleanup', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = StrandsHealthChecker;