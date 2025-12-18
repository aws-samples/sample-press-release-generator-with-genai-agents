/**
 * Metrics Collector for Strands Framework Integration
 * 
 * Collects, aggregates, and reports performance metrics for Strands framework
 * components including bridge performance, agent execution metrics, and system health.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const EventEmitter = require('events');
const { logger } = require('../../../utils/logger');
const strandsConfig = require('../config/strands-config');

class StrandsMetricsCollector extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            collectionInterval: options.collectionInterval || 60000, // 1 minute
            retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
            aggregationWindow: options.aggregationWindow || 300000, // 5 minutes
            ...options
        };

        // Metrics storage
        this.rawMetrics = [];
        this.aggregatedMetrics = new Map();
        this.customMetrics = new Map();

        // Collection state
        this.isCollecting = false;
        this.collectionInterval = null;
        this.lastCollection = null;

        // Component references
        this.bridgeManager = null;
        this.healthChecker = null;

        // Metric definitions
        this.metricDefinitions = {
            // Bridge metrics
            'strands.bridge.requests.total': { type: 'counter', description: 'Total bridge requests' },
            'strands.bridge.requests.success': { type: 'counter', description: 'Successful bridge requests' },
            'strands.bridge.requests.failed': { type: 'counter', description: 'Failed bridge requests' },
            'strands.bridge.response_time.avg': { type: 'gauge', description: 'Average bridge response time' },
            'strands.bridge.connections.active': { type: 'gauge', description: 'Active bridge connections' },
            
            // Agent metrics
            'strands.agents.registered.total': { type: 'gauge', description: 'Total registered agents' },
            'strands.agents.executions.total': { type: 'counter', description: 'Total agent executions' },
            'strands.agents.executions.success': { type: 'counter', description: 'Successful agent executions' },
            'strands.agents.executions.failed': { type: 'counter', description: 'Failed agent executions' },
            'strands.agents.response_time.avg': { type: 'gauge', description: 'Average agent response time' },
            
            // Pattern metrics
            'strands.patterns.executions.total': { type: 'counter', description: 'Total pattern executions' },
            'strands.patterns.executions.success': { type: 'counter', description: 'Successful pattern executions' },
            'strands.patterns.response_time.avg': { type: 'gauge', description: 'Average pattern response time' },
            
            // System metrics
            'strands.system.health.score': { type: 'gauge', description: 'Overall system health score (0-100)' },
            'strands.system.uptime': { type: 'gauge', description: 'System uptime in milliseconds' },
            'strands.system.memory.usage': { type: 'gauge', description: 'Memory usage in bytes' }
        };

        logger.info('StrandsMetricsCollector initialized', {
            collectionInterval: this.options.collectionInterval,
            retentionPeriod: this.options.retentionPeriod,
            metricsCount: Object.keys(this.metricDefinitions).length
        });
    }

    /**
     * Initialize metrics collector
     * @param {Object} components - Component references
     */
    async initialize(components = {}) {
        try {
            logger.info('Initializing Strands Metrics Collector...');

            // Set component references
            this.bridgeManager = components.bridgeManager;
            this.healthChecker = components.healthChecker;

            // Start collection if Strands is enabled
            if (strandsConfig.isEnabled() && strandsConfig.getMonitoringConfig().metricsEnabled) {
                this.startCollection();
            } else {
                logger.info('Strands metrics collection disabled');
            }

            logger.info('Strands Metrics Collector initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Strands Metrics Collector', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Start metrics collection
     */
    startCollection() {
        if (this.isCollecting) {
            logger.warn('Metrics collection already running');
            return;
        }

        logger.info('Starting Strands metrics collection...', {
            interval: this.options.collectionInterval
        });

        this.collectionInterval = setInterval(() => {
            this._collectMetrics();
        }, this.options.collectionInterval);

        this.isCollecting = true;
        this.emit('collection_started');
    }

    /**
     * Stop metrics collection
     */
    stopCollection() {
        if (!this.isCollecting) {
            logger.warn('Metrics collection not running');
            return;
        }

        logger.info('Stopping Strands metrics collection...');

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        this.isCollecting = false;
        this.emit('collection_stopped');
    }

    /**
     * Collect metrics from all components
     * @private
     */
    async _collectMetrics() {
        const collectionStartTime = Date.now();
        
        try {
            logger.debug('Collecting Strands metrics...');

            const metrics = {
                timestamp: collectionStartTime,
                bridge: this._collectBridgeMetrics(),
                agents: this._collectAgentMetrics(),
                patterns: this._collectPatternMetrics(),
                system: this._collectSystemMetrics(),
                health: this._collectHealthMetrics()
            };

            // Store raw metrics
            this.rawMetrics.push(metrics);

            // Clean old metrics
            this._cleanOldMetrics();

            // Update aggregated metrics
            this._updateAggregatedMetrics(metrics);

            // Record collection performance
            const collectionTime = Date.now() - collectionStartTime;
            this.lastCollection = collectionStartTime;

            logger.debug('Metrics collection completed', {
                collectionTime,
                metricsCount: Object.keys(metrics).length
            });

            this.emit('metrics_collected', metrics);
        } catch (error) {
            logger.error('Metrics collection failed', {
                error: error.message,
                collectionTime: Date.now() - collectionStartTime
            });
        }
    }

    /**
     * Collect bridge metrics
     * @private
     */
    _collectBridgeMetrics() {
        try {
            if (!this.bridgeManager || !this.bridgeManager.bridge) {
                return {
                    available: false,
                    connected: false
                };
            }

            const bridgeMetrics = this.bridgeManager.bridge.getMetrics();
            const bridgeStatus = this.bridgeManager.bridge.getStatus();

            return {
                available: true,
                connected: bridgeStatus.connected,
                totalRequests: bridgeMetrics.totalRequests || 0,
                successfulRequests: bridgeMetrics.successfulRequests || 0,
                failedRequests: bridgeMetrics.failedRequests || 0,
                successRate: bridgeMetrics.successRate || 0,
                averageResponseTime: bridgeMetrics.averageResponseTime || 0,
                registeredAgents: bridgeMetrics.registeredAgents || 0,
                uptime: bridgeMetrics.uptime || 0,
                pythonProcessRestarts: bridgeMetrics.pythonProcessRestarts || 0
            };
        } catch (error) {
            logger.warn('Failed to collect bridge metrics', { error: error.message });
            return { available: false, error: error.message };
        }
    }

    /**
     * Collect agent metrics
     * @private
     */
    _collectAgentMetrics() {
        try {
            if (!this.bridgeManager) {
                return {
                    available: false,
                    totalAgents: 0
                };
            }

            const agentStats = this.bridgeManager.getAgentStatistics();
            const agentWrappers = this.bridgeManager.getAgentWrappers();

            let totalExecutions = 0;
            let totalSuccessful = 0;
            let totalFailed = 0;
            let totalResponseTime = 0;
            let responseTimeCount = 0;

            const categoryMetrics = {};

            for (const [agentName, wrapper] of agentWrappers.entries()) {
                const metrics = wrapper.getMetrics();
                const category = wrapper._getAgentCategory();

                totalExecutions += metrics.totalExecutions;
                totalSuccessful += metrics.successfulExecutions;
                totalFailed += metrics.failedExecutions;

                if (metrics.averageExecutionTime > 0) {
                    totalResponseTime += metrics.averageExecutionTime;
                    responseTimeCount++;
                }

                // Aggregate by category
                if (!categoryMetrics[category]) {
                    categoryMetrics[category] = {
                        agents: 0,
                        executions: 0,
                        successful: 0,
                        failed: 0,
                        averageResponseTime: 0
                    };
                }

                categoryMetrics[category].agents++;
                categoryMetrics[category].executions += metrics.totalExecutions;
                categoryMetrics[category].successful += metrics.successfulExecutions;
                categoryMetrics[category].failed += metrics.failedExecutions;
            }

            return {
                available: true,
                totalAgents: agentWrappers.size,
                totalExecutions,
                successfulExecutions: totalSuccessful,
                failedExecutions: totalFailed,
                successRate: totalExecutions > 0 ? (totalSuccessful / totalExecutions) * 100 : 0,
                averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
                categoryMetrics,
                strandsUtilization: this._calculateStrandsUtilization(agentWrappers)
            };
        } catch (error) {
            logger.warn('Failed to collect agent metrics', { error: error.message });
            return { available: false, error: error.message };
        }
    }

    /**
     * Calculate Strands utilization across agents
     * @private
     */
    _calculateStrandsUtilization(agentWrappers) {
        let totalExecutions = 0;
        let strandsExecutions = 0;

        for (const wrapper of agentWrappers.values()) {
            const metrics = wrapper.getMetrics();
            totalExecutions += metrics.totalExecutions;
            strandsExecutions += metrics.strandsExecutions || 0;
        }

        return totalExecutions > 0 ? (strandsExecutions / totalExecutions) * 100 : 0;
    }

    /**
     * Collect pattern execution metrics
     * @private
     */
    _collectPatternMetrics() {
        // For Phase 1, we'll return basic structure
        // This will be enhanced in later phases when orchestration patterns are implemented
        return {
            available: false,
            totalPatternExecutions: 0,
            successfulPatternExecutions: 0,
            failedPatternExecutions: 0,
            averagePatternResponseTime: 0,
            patternTypes: {}
        };
    }

    /**
     * Collect system metrics
     * @private
     */
    _collectSystemMetrics() {
        try {
            const memoryUsage = process.memoryUsage();
            const uptime = process.uptime() * 1000; // Convert to milliseconds

            return {
                available: true,
                uptime,
                memoryUsage: {
                    rss: memoryUsage.rss,
                    heapTotal: memoryUsage.heapTotal,
                    heapUsed: memoryUsage.heapUsed,
                    external: memoryUsage.external
                },
                cpuUsage: process.cpuUsage(),
                nodeVersion: process.version,
                platform: process.platform,
                strandsEnabled: strandsConfig.isEnabled()
            };
        } catch (error) {
            logger.warn('Failed to collect system metrics', { error: error.message });
            return { available: false, error: error.message };
        }
    }

    /**
     * Collect health metrics
     * @private
     */
    _collectHealthMetrics() {
        try {
            if (!this.healthChecker) {
                return {
                    available: false,
                    healthScore: 0
                };
            }

            const healthStatus = this.healthChecker.getHealthStatus();
            const healthSummary = this.healthChecker.getHealthSummary();

            // Calculate health score (0-100)
            const healthScore = this._calculateHealthScore(healthSummary);

            return {
                available: true,
                healthScore,
                overallStatus: healthStatus.overall,
                componentHealth: healthSummary.components,
                consecutiveFailures: healthStatus.consecutiveFailures,
                lastCheck: healthStatus.lastCheck,
                alertCount: healthSummary.alerts?.recentCount || 0,
                criticalAlertCount: healthSummary.alerts?.criticalCount || 0
            };
        } catch (error) {
            logger.warn('Failed to collect health metrics', { error: error.message });
            return { available: false, error: error.message };
        }
    }

    /**
     * Calculate health score from health summary
     * @private
     */
    _calculateHealthScore(healthSummary) {
        let score = 100;

        // Deduct points for unhealthy components
        const componentStatuses = Object.values(healthSummary.components || {});
        for (const status of componentStatuses) {
            switch (status) {
                case 'error':
                    score -= 30;
                    break;
                case 'unhealthy':
                    score -= 20;
                    break;
                case 'degraded':
                    score -= 10;
                    break;
                case 'unavailable':
                    score -= 5;
                    break;
            }
        }

        // Deduct points for low success rate
        const successRate = healthSummary.metrics?.successRate || 100;
        if (successRate < 95) {
            score -= (95 - successRate);
        }

        // Deduct points for consecutive failures
        const consecutiveFailures = healthSummary.metrics?.consecutiveFailures || 0;
        score -= Math.min(consecutiveFailures * 5, 25);

        // Deduct points for critical alerts
        const criticalAlerts = healthSummary.alerts?.criticalCount || 0;
        score -= Math.min(criticalAlerts * 10, 30);

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Update aggregated metrics
     * @private
     */
    _updateAggregatedMetrics(rawMetrics) {
        const windowStart = Date.now() - this.options.aggregationWindow;
        
        // Get recent metrics for aggregation
        const recentMetrics = this.rawMetrics.filter(m => m.timestamp > windowStart);
        
        if (recentMetrics.length === 0) {
            return;
        }

        // Aggregate bridge metrics
        const bridgeAggregation = this._aggregateBridgeMetrics(recentMetrics);
        this.aggregatedMetrics.set('bridge', bridgeAggregation);

        // Aggregate agent metrics
        const agentAggregation = this._aggregateAgentMetrics(recentMetrics);
        this.aggregatedMetrics.set('agents', agentAggregation);

        // Aggregate system metrics
        const systemAggregation = this._aggregateSystemMetrics(recentMetrics);
        this.aggregatedMetrics.set('system', systemAggregation);

        // Aggregate health metrics
        const healthAggregation = this._aggregateHealthMetrics(recentMetrics);
        this.aggregatedMetrics.set('health', healthAggregation);

        logger.debug('Metrics aggregation completed', {
            windowSize: recentMetrics.length,
            aggregationWindow: this.options.aggregationWindow
        });
    }

    /**
     * Aggregate bridge metrics
     * @private
     */
    _aggregateBridgeMetrics(metrics) {
        const bridgeMetrics = metrics.map(m => m.bridge).filter(b => b.available);
        
        if (bridgeMetrics.length === 0) {
            return { available: false };
        }

        return {
            available: true,
            avgSuccessRate: this._calculateAverage(bridgeMetrics, 'successRate'),
            avgResponseTime: this._calculateAverage(bridgeMetrics, 'averageResponseTime'),
            totalRequests: this._calculateSum(bridgeMetrics, 'totalRequests'),
            connectionUptime: this._calculateAverage(bridgeMetrics, 'uptime'),
            restartCount: this._calculateMax(bridgeMetrics, 'pythonProcessRestarts')
        };
    }

    /**
     * Aggregate agent metrics
     * @private
     */
    _aggregateAgentMetrics(metrics) {
        const agentMetrics = metrics.map(m => m.agents).filter(a => a.available);
        
        if (agentMetrics.length === 0) {
            return { available: false };
        }

        return {
            available: true,
            avgSuccessRate: this._calculateAverage(agentMetrics, 'successRate'),
            avgResponseTime: this._calculateAverage(agentMetrics, 'averageResponseTime'),
            totalExecutions: this._calculateSum(agentMetrics, 'totalExecutions'),
            avgStrandsUtilization: this._calculateAverage(agentMetrics, 'strandsUtilization'),
            agentCount: this._calculateAverage(agentMetrics, 'totalAgents')
        };
    }

    /**
     * Aggregate system metrics
     * @private
     */
    _aggregateSystemMetrics(metrics) {
        const systemMetrics = metrics.map(m => m.system).filter(s => s.available);
        
        if (systemMetrics.length === 0) {
            return { available: false };
        }

        return {
            available: true,
            avgMemoryUsage: this._calculateAverage(systemMetrics, 'memoryUsage.heapUsed'),
            maxMemoryUsage: this._calculateMax(systemMetrics, 'memoryUsage.heapUsed'),
            uptime: this._calculateMax(systemMetrics, 'uptime')
        };
    }

    /**
     * Aggregate health metrics
     * @private
     */
    _aggregateHealthMetrics(metrics) {
        const healthMetrics = metrics.map(m => m.health).filter(h => h.available);
        
        if (healthMetrics.length === 0) {
            return { available: false };
        }

        return {
            available: true,
            avgHealthScore: this._calculateAverage(healthMetrics, 'healthScore'),
            minHealthScore: this._calculateMin(healthMetrics, 'healthScore'),
            maxHealthScore: this._calculateMax(healthMetrics, 'healthScore'),
            totalAlerts: this._calculateSum(healthMetrics, 'alertCount'),
            criticalAlerts: this._calculateSum(healthMetrics, 'criticalAlertCount')
        };
    }

    /**
     * Calculate average of a metric across samples
     * @private
     */
    _calculateAverage(samples, metricPath) {
        const values = samples.map(s => this._getNestedValue(s, metricPath)).filter(v => v != null);
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    /**
     * Calculate sum of a metric across samples
     * @private
     */
    _calculateSum(samples, metricPath) {
        const values = samples.map(s => this._getNestedValue(s, metricPath)).filter(v => v != null);
        return values.reduce((a, b) => a + b, 0);
    }

    /**
     * Calculate maximum of a metric across samples
     * @private
     */
    _calculateMax(samples, metricPath) {
        const values = samples.map(s => this._getNestedValue(s, metricPath)).filter(v => v != null);
        return values.length > 0 ? Math.max(...values) : 0;
    }

    /**
     * Calculate minimum of a metric across samples
     * @private
     */
    _calculateMin(samples, metricPath) {
        const values = samples.map(s => this._getNestedValue(s, metricPath)).filter(v => v != null);
        return values.length > 0 ? Math.min(...values) : 0;
    }

    /**
     * Get nested value from object using dot notation
     * @private
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Clean old metrics based on retention period
     * @private
     */
    _cleanOldMetrics() {
        const cutoffTime = Date.now() - this.options.retentionPeriod;
        const originalCount = this.rawMetrics.length;
        
        this.rawMetrics = this.rawMetrics.filter(m => m.timestamp > cutoffTime);
        
        const removedCount = originalCount - this.rawMetrics.length;
        if (removedCount > 0) {
            logger.debug('Cleaned old metrics', {
                removed: removedCount,
                remaining: this.rawMetrics.length
            });
        }
    }

    /**
     * Record custom metric
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {Object} tags - Optional tags
     */
    recordCustomMetric(name, value, tags = {}) {
        const metric = {
            name,
            value,
            tags,
            timestamp: Date.now()
        };

        if (!this.customMetrics.has(name)) {
            this.customMetrics.set(name, []);
        }

        this.customMetrics.get(name).push(metric);

        // Keep only recent custom metrics
        const cutoffTime = Date.now() - this.options.retentionPeriod;
        const metrics = this.customMetrics.get(name).filter(m => m.timestamp > cutoffTime);
        this.customMetrics.set(name, metrics);

        logger.debug('Custom metric recorded', { name, value, tags });
        this.emit('custom_metric_recorded', metric);
    }

    /**
     * Get current metrics snapshot
     * @returns {Object}
     */
    getCurrentMetrics() {
        const latest = this.rawMetrics[this.rawMetrics.length - 1];
        const aggregated = Object.fromEntries(this.aggregatedMetrics.entries());

        return {
            timestamp: Date.now(),
            latest: latest || null,
            aggregated,
            collection: {
                isCollecting: this.isCollecting,
                lastCollection: this.lastCollection,
                metricsCount: this.rawMetrics.length,
                customMetricsCount: this.customMetrics.size
            }
        };
    }

    /**
     * Get metrics for specific time range
     * @param {number} startTime - Start timestamp
     * @param {number} endTime - End timestamp
     * @returns {Array}
     */
    getMetricsInRange(startTime, endTime) {
        return this.rawMetrics.filter(m => 
            m.timestamp >= startTime && m.timestamp <= endTime
        );
    }

    /**
     * Get custom metrics
     * @param {string} name - Metric name (optional)
     * @returns {Object|Array}
     */
    getCustomMetrics(name = null) {
        if (name) {
            return this.customMetrics.get(name) || [];
        }
        return Object.fromEntries(this.customMetrics.entries());
    }

    /**
     * Export metrics for external monitoring systems
     * @param {string} format - Export format ('prometheus', 'json', 'csv')
     * @returns {string|Object}
     */
    exportMetrics(format = 'json') {
        const currentMetrics = this.getCurrentMetrics();
        
        switch (format) {
            case 'prometheus':
                return this._exportPrometheusFormat(currentMetrics);
            case 'csv':
                return this._exportCsvFormat(currentMetrics);
            case 'json':
            default:
                return currentMetrics;
        }
    }

    /**
     * Export metrics in Prometheus format
     * @private
     */
    _exportPrometheusFormat(metrics) {
        const lines = [];
        const timestamp = Date.now();

        if (metrics.latest) {
            const latest = metrics.latest;

            // Bridge metrics
            if (latest.bridge?.available) {
                lines.push(`strands_bridge_requests_total ${latest.bridge.totalRequests} ${timestamp}`);
                lines.push(`strands_bridge_success_rate ${latest.bridge.successRate} ${timestamp}`);
                lines.push(`strands_bridge_response_time_avg ${latest.bridge.averageResponseTime} ${timestamp}`);
            }

            // Agent metrics
            if (latest.agents?.available) {
                lines.push(`strands_agents_total ${latest.agents.totalAgents} ${timestamp}`);
                lines.push(`strands_agents_executions_total ${latest.agents.totalExecutions} ${timestamp}`);
                lines.push(`strands_agents_success_rate ${latest.agents.successRate} ${timestamp}`);
                lines.push(`strands_agents_utilization ${latest.agents.strandsUtilization} ${timestamp}`);
            }

            // System metrics
            if (latest.system?.available) {
                lines.push(`strands_system_uptime ${latest.system.uptime} ${timestamp}`);
                lines.push(`strands_system_memory_heap_used ${latest.system.memoryUsage.heapUsed} ${timestamp}`);
            }

            // Health metrics
            if (latest.health?.available) {
                lines.push(`strands_system_health_score ${latest.health.healthScore} ${timestamp}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Export metrics in CSV format
     * @private
     */
    _exportCsvFormat(metrics) {
        const headers = [
            'timestamp',
            'bridge_success_rate',
            'bridge_response_time',
            'agents_total',
            'agents_success_rate',
            'agents_utilization',
            'system_uptime',
            'system_memory_used',
            'health_score'
        ];

        const rows = [headers.join(',')];

        for (const metric of this.rawMetrics.slice(-100)) { // Last 100 samples
            const row = [
                metric.timestamp,
                metric.bridge?.successRate || 0,
                metric.bridge?.averageResponseTime || 0,
                metric.agents?.totalAgents || 0,
                metric.agents?.successRate || 0,
                metric.agents?.strandsUtilization || 0,
                metric.system?.uptime || 0,
                metric.system?.memoryUsage?.heapUsed || 0,
                metric.health?.healthScore || 0
            ];
            rows.push(row.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Get metrics summary
     * @returns {Object}
     */
    getMetricsSummary() {
        const current = this.getCurrentMetrics();
        const aggregated = current.aggregated;

        return {
            collection: {
                enabled: strandsConfig.getMonitoringConfig().metricsEnabled,
                running: this.isCollecting,
                interval: this.options.collectionInterval,
                lastCollection: this.lastCollection,
                totalSamples: this.rawMetrics.length
            },
            current: {
                timestamp: current.timestamp,
                bridge: current.latest?.bridge || { available: false },
                agents: current.latest?.agents || { available: false },
                system: current.latest?.system || { available: false },
                health: current.latest?.health || { available: false }
            },
            aggregated: {
                bridge: aggregated.bridge || { available: false },
                agents: aggregated.agents || { available: false },
                system: aggregated.system || { available: false },
                health: aggregated.health || { available: false }
            },
            customMetrics: {
                count: this.customMetrics.size,
                names: Array.from(this.customMetrics.keys())
            }
        };
    }

    /**
     * Cleanup metrics collector
     */
    async cleanup() {
        try {
            logger.info('Cleaning up Strands Metrics Collector...');

            this.stopCollection();

            // Clear metrics data
            this.rawMetrics = [];
            this.aggregatedMetrics.clear();
            this.customMetrics.clear();

            // Reset state
            this.lastCollection = null;

            logger.info('Strands Metrics Collector cleaned up successfully');
            this.emit('cleanup_complete');
        } catch (error) {
            logger.error('Error during metrics collector cleanup', {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = StrandsMetricsCollector;