/**
 * Bridge Manager for Strands Framework Integration
 *
 * Manages agent registration coordination and provides high-level orchestration operations.
 * Pure Node.js implementation - no Python bridge required.
 *
 * @author AI Agent
 * @date 2025-09-24
 * @version 2.0.0
 */

const EventEmitter = require('events');
const { logger } = require('../../../utils/logger');
const strandsConfig = require('../config/strands-config');
const BaseAgentWrapper = require('../wrappers/base-agent-wrapper');

class BridgeManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            autoReconnect: true,
            maxReconnectAttempts: 5,
            reconnectDelay: 2000,
            healthCheckInterval: 30000,
            ...options
        };

        // Manager state
        this.isInitialized = false;
        this.isShuttingDown = false;

        // Agent management
        this.agentWrappers = new Map();
        this.registrationQueue = [];

        // Lifecycle management
        this.connectionAttempts = 0;
        this.lastConnectionTime = null;
        this.healthCheckInterval = null;

        // Metrics aggregation
        this.managerMetrics = {
            bridgeRestarts: 0,
            totalAgentsRegistered: 0,
            totalExecutions: 0,
            totalErrors: 0,
            uptime: 0
        };

        logger.info('BridgeManager initialized', {
            autoReconnect: this.options.autoReconnect,
            maxReconnectAttempts: this.options.maxReconnectAttempts
        });
    }

    /**
     * Initialize the bridge manager and establish connection
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('BridgeManager already initialized');
            return;
        }

        try {
            logger.info('Initializing Strands Bridge Manager...');

            // Check if Strands is enabled
            if (!strandsConfig.isEnabled()) {
                logger.info('Strands framework disabled - BridgeManager in passive mode');
                this.isInitialized = true;
                return;
            }

            // Initialize Strands configuration
            await strandsConfig.initialize();

            logger.info('✅ BridgeManager initialized in pure Node.js mode', {
                pythonBridge: false,
                nodeOnlyMode: true,
                capabilities: 'Agent wrapping and orchestration available'
            });

            // Start health monitoring
            this._startHealthMonitoring();

            // Process any queued agent registrations
            await this._processRegistrationQueue();

            this.isInitialized = true;
            this.lastConnectionTime = Date.now();

            logger.info('✅ BridgeManager initialization complete', {
                mode: 'pure-nodejs',
                strandsEnabled: strandsConfig.isEnabled()
            });

            this.emit('initialized');
        } catch (error) {
            logger.error('❌ Failed to initialize BridgeManager', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Register an agent with Strands framework
     * @param {string} agentName - Name of the agent
     * @param {Object} originalAgent - Original agent instance
     * @param {Object} options - Registration options
     */
    async registerAgent(agentName, originalAgent, options = {}) {
        try {
            logger.info(`Registering agent with BridgeManager: ${agentName}`);

            // If not initialized, queue the registration
            if (!this.isInitialized) {
                logger.debug(`Queueing agent registration: ${agentName}`);
                this.registrationQueue.push({ agentName, originalAgent, options });
                return;
            }

            // If Strands is disabled, create wrapper but don't register with bridge
            if (!strandsConfig.isEnabled()) {
                logger.debug(`Creating wrapper for ${agentName} (Strands disabled)`);
                const wrapper = new BaseAgentWrapper(agentName, originalAgent, options);
                await wrapper.initialize();
                this.agentWrappers.set(agentName, wrapper);
                return wrapper;
            }

            // Create agent wrapper
            const wrapper = new BaseAgentWrapper(agentName, originalAgent, options);
            await wrapper.initialize();

            // Enable Strands for the wrapper (Node.js orchestration)
            wrapper.enableStrands({
                bridgeManager: this,
                registeredAt: Date.now()
            });

            logger.info(`Agent ${agentName} registered with Strands (Node.js mode)`);

            // Store wrapper
            this.agentWrappers.set(agentName, wrapper);
            this.managerMetrics.totalAgentsRegistered++;

            this.emit('agent_registered', { agentName, wrapper });
            return wrapper;
        } catch (error) {
            logger.error(`Failed to register agent ${agentName}`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Execute agent through Strands orchestration
     * @param {string} agentName - Name of the agent
     * @param {string} method - Method to execute
     * @param {Array} params - Method parameters
     * @param {Object} options - Execution options
     */
    async executeAgent(agentName, method, params = [], options = {}) {
        try {
            this.managerMetrics.totalExecutions++;

            // Get agent wrapper
            const wrapper = this.agentWrappers.get(agentName);
            if (!wrapper) {
                throw new Error(`Agent ${agentName} not registered`);
            }

            // Execute through wrapper (Node.js orchestration)
            return await wrapper.executeWithStrands(method, params, options);
        } catch (error) {
            this.managerMetrics.totalErrors++;
            logger.error(`Failed to execute agent ${agentName}.${method}`, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute orchestration pattern
     * @param {string} pattern - Pattern name
     * @param {Object} config - Pattern configuration
     */
    async executeOrchestrationPattern(pattern, config) {
        try {
            logger.info(`Executing orchestration pattern: ${pattern} (Node.js mode)`);

            // Node.js orchestration patterns handled by pattern manager
            // This method is kept for API compatibility but delegates to Node.js implementations
            throw new Error('Orchestration patterns should be executed through OrchestrationPatternManager');
        } catch (error) {
            this.managerMetrics.totalErrors++;
            logger.error(`Failed to execute orchestration pattern ${pattern}`, {
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Re-register all agents after reconnection
     * @private
     */

    /**
     * Process queued agent registrations
     * @private
     */
    async _processRegistrationQueue() {
        if (this.registrationQueue.length === 0) {
            return;
        }

        logger.info(`Processing ${this.registrationQueue.length} queued agent registrations`);

        const queue = [...this.registrationQueue];
        this.registrationQueue = [];

        for (const { agentName, originalAgent, options } of queue) {
            try {
                await this.registerAgent(agentName, originalAgent, options);
            } catch (error) {
                logger.error(`Failed to process queued registration for ${agentName}`, {
                    error: error.message
                });
                // Re-queue failed registrations
                this.registrationQueue.push({ agentName, originalAgent, options });
            }
        }
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck();
        }, this.options.healthCheckInterval);

        logger.info('Bridge health monitoring started', {
            interval: this.options.healthCheckInterval
        });
    }

    /**
     * Perform health check
     * @private
     */
    _performHealthCheck() {
        try {
            const overallHealth = this._assessOverallHealth();

            logger.debug('Health check completed', {
                registeredAgents: this.agentWrappers.size,
                overallHealth
            });

            this.emit('health_check', {
                overallHealth,
                timestamp: Date.now()
            });
        } catch (error) {
            logger.warn('Health check error', { error: error.message });
        }
    }

    /**
     * Assess overall health
     * @private
     */
    _assessOverallHealth() {
        // Assess health based on agent wrapper metrics
        let totalExecutions = 0;
        let totalSuccesses = 0;

        for (const wrapper of this.agentWrappers.values()) {
            const metrics = wrapper.getMetrics();
            totalExecutions += metrics.totalExecutions;
            totalSuccesses += metrics.successfulExecutions;
        }

        if (totalExecutions === 0) return 'healthy'; // No executions yet
        
        const successRate = (totalSuccesses / totalExecutions) * 100;
        if (successRate >= 95) return 'healthy';
        if (successRate >= 80) return 'degraded';
        return 'unhealthy';
    }

    /**
     * Get all registered agent wrappers
     * @returns {Map}
     */
    getAgentWrappers() {
        return new Map(this.agentWrappers);
    }

    /**
     * Get agent wrapper by name
     * @param {string} agentName - Name of the agent
     * @returns {BaseAgentWrapper|null}
     */
    getAgentWrapper(agentName) {
        return this.agentWrappers.get(agentName) || null;
    }

    /**
     * Get comprehensive status
     * @returns {Object}
     */
    getStatus() {
        return {
            manager: {
                initialized: this.isInitialized,
                shuttingDown: this.isShuttingDown,
                mode: 'pure-nodejs',
                lastConnectionTime: this.lastConnectionTime,
                registeredAgents: this.agentWrappers.size,
                queuedRegistrations: this.registrationQueue.length
            },
            strands: {
                enabled: strandsConfig.isEnabled(),
                config: strandsConfig.getConfigSummary()
            },
            metrics: this._getAggregatedMetrics(),
            health: this._assessOverallHealth()
        };
    }

    /**
     * Get aggregated metrics from all components
     * @private
     */
    _getAggregatedMetrics() {
        // Aggregate wrapper metrics
        let totalWrapperExecutions = 0;
        let totalWrapperSuccesses = 0;
        let totalWrapperFailures = 0;

        for (const wrapper of this.agentWrappers.values()) {
            const wrapperMetrics = wrapper.getMetrics();
            totalWrapperExecutions += wrapperMetrics.totalExecutions;
            totalWrapperSuccesses += wrapperMetrics.successfulExecutions;
            totalWrapperFailures += wrapperMetrics.failedExecutions;
        }

        return {
            manager: this.managerMetrics,
            wrappers: {
                totalExecutions: totalWrapperExecutions,
                successfulExecutions: totalWrapperSuccesses,
                failedExecutions: totalWrapperFailures,
                successRate: totalWrapperExecutions > 0
                    ? (totalWrapperSuccesses / totalWrapperExecutions) * 100
                    : 0
            },
            overall: {
                uptime: this.lastConnectionTime ? Date.now() - this.lastConnectionTime : 0,
                totalAgents: this.agentWrappers.size,
                strandsEnabled: strandsConfig.isEnabled()
            }
        };
    }

    /**
     * Validate all registered agents
     * @returns {Object}
     */
    async validateAllAgents() {
        const results = {
            compatible: [],
            incompatible: [],
            warnings: []
        };

        for (const [agentName, wrapper] of this.agentWrappers.entries()) {
            try {
                const validation = wrapper.validateStrandsCompatibility();
                
                if (validation.compatible) {
                    results.compatible.push({
                        agentName,
                        validation
                    });
                } else {
                    results.incompatible.push({
                        agentName,
                        validation
                    });
                }

                if (validation.warnings.length > 0) {
                    results.warnings.push({
                        agentName,
                        warnings: validation.warnings
                    });
                }
            } catch (error) {
                results.incompatible.push({
                    agentName,
                    error: error.message
                });
            }
        }

        logger.info('Agent validation completed', {
            compatible: results.compatible.length,
            incompatible: results.incompatible.length,
            warnings: results.warnings.length
        });

        return results;
    }

    /**
     * Get agent execution statistics
     * @returns {Object}
     */
    getAgentStatistics() {
        const stats = {
            byAgent: {},
            byCategory: {},
            overall: {
                totalAgents: this.agentWrappers.size,
                totalExecutions: 0,
                averageSuccessRate: 0
            }
        };

        let totalSuccessRate = 0;
        let agentCount = 0;

        for (const [agentName, wrapper] of this.agentWrappers.entries()) {
            const metrics = wrapper.getMetrics();
            const status = wrapper.getStatus();
            
            stats.byAgent[agentName] = {
                ...metrics,
                category: wrapper._getAgentCategory(),
                strandsEnabled: status.strandsEnabled
            };

            // Aggregate by category
            const category = wrapper._getAgentCategory();
            if (!stats.byCategory[category]) {
                stats.byCategory[category] = {
                    agents: [],
                    totalExecutions: 0,
                    averageSuccessRate: 0
                };
            }
            
            stats.byCategory[category].agents.push(agentName);
            stats.byCategory[category].totalExecutions += metrics.totalExecutions;
            
            stats.overall.totalExecutions += metrics.totalExecutions;
            totalSuccessRate += metrics.successRate || 0;
            agentCount++;
        }

        // Calculate averages
        if (agentCount > 0) {
            stats.overall.averageSuccessRate = totalSuccessRate / agentCount;
        }

        for (const category of Object.keys(stats.byCategory)) {
            const categoryAgents = stats.byCategory[category].agents;
            let categorySuccessRate = 0;
            
            for (const agentName of categoryAgents) {
                categorySuccessRate += stats.byAgent[agentName].successRate || 0;
            }
            
            stats.byCategory[category].averageSuccessRate = categoryAgents.length > 0 
                ? categorySuccessRate / categoryAgents.length 
                : 0;
        }

        return stats;
    }

    /**
     * Shutdown bridge manager
     */
    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn('BridgeManager already shutting down');
            return;
        }

        this.isShuttingDown = true;

        try {
            logger.info('Shutting down BridgeManager...');

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            // Cleanup all agent wrappers
            for (const [agentName, wrapper] of this.agentWrappers.entries()) {
                try {
                    await wrapper.cleanup();
                } catch (error) {
                    logger.warn(`Error cleaning up wrapper ${agentName}`, { error: error.message });
                }
            }
            this.agentWrappers.clear();


            // Reset state
            this.isInitialized = false;
            this.connectionAttempts = 0;
            this.registrationQueue = [];

            logger.info('BridgeManager shutdown completed');
            this.emit('shutdown_complete');
        } catch (error) {
            logger.error('Error during BridgeManager shutdown', { error: error.message });
            throw error;
        } finally {
            this.isShuttingDown = false;
        }
    }

    /**
     * Check if Strands is available and operational
     * @returns {boolean}
     */
    isStrandsAvailable() {
        return strandsConfig.isEnabled() && this.isInitialized;
    }

    /**
     * Get bridge manager metrics
     * @returns {Object}
     */
    getMetrics() {
        return this._getAggregatedMetrics();
    }
}

// Create singleton instance
const bridgeManager = new BridgeManager();

module.exports = bridgeManager;