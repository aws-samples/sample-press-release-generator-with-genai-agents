/**
 * Strands Framework Service
 * 
 * Main service that integrates all Strands framework components and provides
 * a unified interface for the 100 Market Press Release Generator system.
 * Manages the complete Strands integration lifecycle.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const EventEmitter = require('events');
const { logger } = require('../../utils/logger');

// Import Strands components
const strandsConfig = require('./config/strands-config');
const agentRegistry = require('./config/agent-registry');
const bridgeManager = require('./bridges/bridge-manager');
const BaseAgentWrapper = require('./wrappers/base-agent-wrapper');
const StrandsHealthChecker = require('./monitoring/health-checker');
const StrandsMetricsCollector = require('./monitoring/metrics-collector');

class StrandsService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            autoInitialize: options.autoInitialize !== false,
            enableMonitoring: options.enableMonitoring !== false,
            enableMetrics: options.enableMetrics !== false,
            ...options
        };

        // Service state
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.initializationTime = null;

        // Component instances
        this.healthChecker = null;
        this.metricsCollector = null;

        // Service metrics
        this.serviceMetrics = {
            totalAgentsWrapped: 0,
            totalExecutions: 0,
            totalPatternExecutions: 0,
            initializationTime: 0,
            uptime: 0
        };

        logger.info('StrandsService created', {
            autoInitialize: this.options.autoInitialize,
            enableMonitoring: this.options.enableMonitoring,
            strandsEnabled: strandsConfig.isEnabled()
        });
    }

    /**
     * Initialize the Strands service
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('StrandsService already initialized');
            return;
        }

        const startTime = Date.now();

        try {
            logger.info('Initializing Strands Framework Service...');

            // Initialize configuration
            await strandsConfig.initialize();

            // Check if Strands is enabled
            if (!strandsConfig.isEnabled()) {
                logger.info('Strands framework disabled - service in passive mode');
                this.isInitialized = true;
                return;
            }

            // Initialize agent registry
            await agentRegistry.initialize();
            logger.info('Agent registry initialized');

            // Initialize bridge manager
            await bridgeManager.initialize();
            logger.info('Bridge manager initialized');

            // Initialize monitoring components
            if (this.options.enableMonitoring) {
                await this._initializeMonitoring();
            }

            // Initialize metrics collection
            if (this.options.enableMetrics) {
                await this._initializeMetrics();
            }

            // Set up event handlers
            this._setupEventHandlers();

            this.isInitialized = true;
            this.initializationTime = Date.now();
            this.serviceMetrics.initializationTime = Date.now() - startTime;

            logger.info('Strands Framework Service initialized successfully', {
                initializationTime: this.serviceMetrics.initializationTime,
                strandsEnabled: strandsConfig.isEnabled(),
                monitoringEnabled: !!this.healthChecker,
                metricsEnabled: !!this.metricsCollector
            });

            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize Strands Framework Service', {
                error: error.message,
                stack: error.stack,
                initializationTime: Date.now() - startTime
            });
            throw error;
        }
    }

    /**
     * Initialize monitoring components
     * @private
     */
    async _initializeMonitoring() {
        try {
            logger.info('Initializing Strands monitoring...');

            this.healthChecker = new StrandsHealthChecker();
            await this.healthChecker.initialize({
                bridgeManager,
                bridge: bridgeManager.bridge
            });

            logger.info('Strands health monitoring initialized');
        } catch (error) {
            logger.error('Failed to initialize monitoring', { error: error.message });
            throw error;
        }
    }

    /**
     * Initialize metrics collection
     * @private
     */
    async _initializeMetrics() {
        try {
            logger.info('Initializing Strands metrics collection...');

            this.metricsCollector = new StrandsMetricsCollector();
            await this.metricsCollector.initialize({
                bridgeManager,
                healthChecker: this.healthChecker
            });

            logger.info('Strands metrics collection initialized');
        } catch (error) {
            logger.error('Failed to initialize metrics collection', { error: error.message });
            throw error;
        }
    }

    /**
     * Set up event handlers
     * @private
     */
    _setupEventHandlers() {
        // Bridge manager events
        bridgeManager.on('initialized', () => {
            logger.info('Bridge manager initialized');
            this.emit('bridge_ready');
        });

        bridgeManager.on('agent_registered', ({ agentName }) => {
            this.serviceMetrics.totalAgentsWrapped++;
            logger.debug(`Agent registered: ${agentName}`);
            this.emit('agent_registered', agentName);
        });

        bridgeManager.on('bridge_failure', (error) => {
            logger.error('Bridge failure detected', { error: error.message });
            this.emit('bridge_failure', error);
        });

        // Health checker events
        if (this.healthChecker) {
            this.healthChecker.on('health_alert', (alert) => {
                logger.warn('Strands health alert', { alert });
                this.emit('health_alert', alert);
            });

            this.healthChecker.on('health_state_changed', ({ previousState, currentState }) => {
                logger.info('Strands health state changed', { previousState, currentState });
                this.emit('health_state_changed', { previousState, currentState });
            });
        }

        // Metrics collector events
        if (this.metricsCollector) {
            this.metricsCollector.on('metrics_collected', (metrics) => {
                logger.debug('Strands metrics collected');
                this.emit('metrics_collected', metrics);
            });
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
            if (!this.isInitialized) {
                throw new Error('StrandsService not initialized - call initialize() first');
            }

            logger.info(`Registering agent with Strands service: ${agentName}`);

            // Register with agent registry
            await agentRegistry.registerAgent(agentName, originalAgent, options);

            // Register with bridge manager
            const wrapper = await bridgeManager.registerAgent(agentName, originalAgent, options);

            this.serviceMetrics.totalAgentsWrapped++;

            logger.info(`Agent ${agentName} registered successfully with Strands service`);
            this.emit('agent_registered', { agentName, wrapper });

            return wrapper;
        } catch (error) {
            logger.error(`Failed to register agent ${agentName} with Strands service`, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Execute agent through Strands framework
     * @param {string} agentName - Name of the agent
     * @param {string} method - Method to execute
     * @param {Array} params - Method parameters
     * @param {Object} options - Execution options
     */
    async executeAgent(agentName, method, params = [], options = {}) {
        try {
            if (!this.isInitialized) {
                throw new Error('StrandsService not initialized - call initialize() first');
            }

            this.serviceMetrics.totalExecutions++;

            // Execute through bridge manager
            const result = await bridgeManager.executeAgent(agentName, method, params, options);

            logger.debug(`Agent ${agentName}.${method} executed successfully through Strands`);
            this.emit('agent_executed', { agentName, method, success: true });

            return result;
        } catch (error) {
            logger.error(`Failed to execute agent ${agentName}.${method} through Strands`, {
                error: error.message
            });
            this.emit('agent_executed', { agentName, method, success: false, error: error.message });
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
            if (!this.isInitialized) {
                throw new Error('StrandsService not initialized - call initialize() first');
            }

            this.serviceMetrics.totalPatternExecutions++;

            logger.info(`Executing orchestration pattern: ${pattern}`);

            // Execute through bridge manager
            const result = await bridgeManager.executeOrchestrationPattern(pattern, config);

            logger.info(`Orchestration pattern ${pattern} executed successfully`);
            this.emit('pattern_executed', { pattern, success: true });

            return result;
        } catch (error) {
            logger.error(`Failed to execute orchestration pattern ${pattern}`, {
                error: error.message
            });
            this.emit('pattern_executed', { pattern, success: false, error: error.message });
            throw error;
        }
    }

    /**
     * Get comprehensive service status
     * @returns {Object}
     */
    getStatus() {
        const status = {
            service: {
                initialized: this.isInitialized,
                shuttingDown: this.isShuttingDown,
                initializationTime: this.initializationTime,
                uptime: this.initializationTime ? Date.now() - this.initializationTime : 0,
                metrics: this.serviceMetrics
            },
            strands: {
                enabled: strandsConfig.isEnabled(),
                available: bridgeManager.isStrandsAvailable(),
                config: strandsConfig.getConfigSummary()
            },
            components: {
                agentRegistry: agentRegistry.getStatus(),
                bridgeManager: bridgeManager.getStatus(),
                healthChecker: this.healthChecker?.getHealthSummary() || { enabled: false },
                metricsCollector: this.metricsCollector?.getMetricsSummary() || { enabled: false }
            }
        };

        return status;
    }

    /**
     * Get service health summary
     * @returns {Object}
     */
    getHealthSummary() {
        if (!this.healthChecker) {
            return {
                enabled: false,
                overall: 'unknown',
                message: 'Health monitoring not enabled'
            };
        }

        return this.healthChecker.getHealthSummary();
    }

    /**
     * Get service metrics
     * @returns {Object}
     */
    getMetrics() {
        const baseMetrics = {
            service: this.serviceMetrics,
            timestamp: Date.now()
        };

        if (this.metricsCollector) {
            return {
                ...baseMetrics,
                strands: this.metricsCollector.getCurrentMetrics()
            };
        }

        return baseMetrics;
    }

    /**
     * Register multiple agents from the existing 37-agent system
     * @param {Object} agents - Map of agent names to agent instances
     * @param {Object} globalOptions - Global registration options
     */
    async registerMultipleAgents(agents, globalOptions = {}) {
        try {
            logger.info(`Registering ${Object.keys(agents).length} agents with Strands service`);

            const results = {
                successful: [],
                failed: [],
                total: Object.keys(agents).length
            };

            for (const [agentName, agentInstance] of Object.entries(agents)) {
                try {
                    const wrapper = await this.registerAgent(agentName, agentInstance, {
                        ...globalOptions,
                        batchRegistration: true
                    });

                    results.successful.push({
                        agentName,
                        wrapper,
                        category: wrapper._getAgentCategory()
                    });
                } catch (error) {
                    results.failed.push({
                        agentName,
                        error: error.message
                    });
                    
                    logger.warn(`Failed to register agent ${agentName}`, {
                        error: error.message
                    });
                }
            }

            logger.info('Batch agent registration completed', {
                total: results.total,
                successful: results.successful.length,
                failed: results.failed.length
            });

            this.emit('batch_registration_completed', results);
            return results;
        } catch (error) {
            logger.error('Failed to register multiple agents', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate backward compatibility with existing system
     * @returns {Promise<Object>}
     */
    async validateBackwardCompatibility() {
        try {
            logger.info('Validating Strands backward compatibility...');

            const validation = {
                compatible: true,
                issues: [],
                warnings: [],
                agentValidation: null,
                configValidation: null,
                systemValidation: null
            };

            // Validate agent compatibility
            if (bridgeManager.isInitialized) {
                validation.agentValidation = await bridgeManager.validateAllAgents();
                
                if (validation.agentValidation.incompatible.length > 0) {
                    validation.compatible = false;
                    validation.issues.push(`${validation.agentValidation.incompatible.length} agents incompatible with Strands`);
                }
            }

            // Validate configuration
            try {
                strandsConfig._validateConfiguration();
                validation.configValidation = { valid: true };
            } catch (error) {
                validation.compatible = false;
                validation.configValidation = { valid: false, error: error.message };
                validation.issues.push(`Configuration validation failed: ${error.message}`);
            }

            // Validate system integration
            validation.systemValidation = {
                strandsEnabled: strandsConfig.isEnabled(),
                bridgeAvailable: bridgeManager.isStrandsAvailable(),
                agentRegistryInitialized: agentRegistry.isInitialized,
                monitoringEnabled: !!this.healthChecker,
                metricsEnabled: !!this.metricsCollector
            };

            // Add warnings for missing components
            if (!validation.systemValidation.monitoringEnabled) {
                validation.warnings.push('Health monitoring not enabled');
            }
            if (!validation.systemValidation.metricsEnabled) {
                validation.warnings.push('Metrics collection not enabled');
            }

            logger.info('Backward compatibility validation completed', {
                compatible: validation.compatible,
                issues: validation.issues.length,
                warnings: validation.warnings.length
            });

            return validation;
        } catch (error) {
            logger.error('Backward compatibility validation failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get comprehensive system status for monitoring
     * @returns {Object}
     */
    getComprehensiveStatus() {
        const status = this.getStatus();
        
        return {
            ...status,
            validation: {
                lastValidation: null, // Will be set when validation is run
                compatible: true // Assume compatible unless validation fails
            },
            performance: {
                uptime: status.service.uptime,
                totalExecutions: this.serviceMetrics.totalExecutions,
                totalPatternExecutions: this.serviceMetrics.totalPatternExecutions,
                averageResponseTime: this.metricsCollector?.getCurrentMetrics()?.latest?.bridge?.averageResponseTime || 0
            },
            recommendations: this._generateRecommendations(status)
        };
    }

    /**
     * Generate recommendations based on current status
     * @private
     */
    _generateRecommendations(status) {
        const recommendations = [];

        // Configuration recommendations
        if (!strandsConfig.isEnabled()) {
            recommendations.push({
                type: 'configuration',
                priority: 'info',
                message: 'Strands framework is disabled. Enable with STRANDS_ENABLED=true to use advanced orchestration features.'
            });
        }

        // Monitoring recommendations
        if (!this.healthChecker) {
            recommendations.push({
                type: 'monitoring',
                priority: 'medium',
                message: 'Health monitoring not enabled. Enable for better system observability.'
            });
        }

        if (!this.metricsCollector) {
            recommendations.push({
                type: 'metrics',
                priority: 'medium',
                message: 'Metrics collection not enabled. Enable for performance monitoring and optimization.'
            });
        }

        // Bridge recommendations
        if (strandsConfig.isEnabled() && !bridgeManager.isStrandsAvailable()) {
            recommendations.push({
                type: 'bridge',
                priority: 'high',
                message: 'Strands bridge not available. Check Python environment and bridge configuration.'
            });
        }

        // Agent recommendations
        const agentStats = status.components.agentRegistry;
        if (agentStats.totalAgents === 0) {
            recommendations.push({
                type: 'agents',
                priority: 'high',
                message: 'No agents registered. Register agents to use Strands orchestration features.'
            });
        }

        return recommendations;
    }

    /**
     * Perform system health check
     * @returns {Promise<Object>}
     */
    async performHealthCheck() {
        try {
            if (!this.healthChecker) {
                return {
                    available: false,
                    message: 'Health monitoring not enabled'
                };
            }

            const healthCheck = await this.healthChecker.forceHealthCheck();
            
            logger.info('Strands system health check completed', {
                success: healthCheck.success
            });

            return healthCheck;
        } catch (error) {
            logger.error('System health check failed', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Export system metrics
     * @param {string} format - Export format
     * @returns {Object|string}
     */
    exportMetrics(format = 'json') {
        if (!this.metricsCollector) {
            return {
                available: false,
                message: 'Metrics collection not enabled'
            };
        }

        return this.metricsCollector.exportMetrics(format);
    }

    /**
     * Check if Strands is available for use
     * @returns {boolean}
     */
    isStrandsAvailable() {
        return this.isInitialized && 
               strandsConfig.isEnabled() && 
               bridgeManager.isStrandsAvailable();
    }

    /**
     * Get service uptime
     * @returns {number}
     */
    getUptime() {
        return this.initializationTime ? Date.now() - this.initializationTime : 0;
    }

    /**
     * Shutdown the Strands service
     */
    async shutdown() {
        if (this.isShuttingDown) {
            logger.warn('StrandsService already shutting down');
            return;
        }

        this.isShuttingDown = true;

        try {
            logger.info('Shutting down Strands Framework Service...');

            // Stop metrics collection
            if (this.metricsCollector) {
                await this.metricsCollector.cleanup();
                this.metricsCollector = null;
            }

            // Stop health monitoring
            if (this.healthChecker) {
                await this.healthChecker.cleanup();
                this.healthChecker = null;
            }

            // Shutdown bridge manager
            if (bridgeManager.isInitialized) {
                await bridgeManager.shutdown();
            }

            // Reset state
            this.isInitialized = false;
            this.initializationTime = null;

            logger.info('Strands Framework Service shutdown completed');
            this.emit('shutdown_complete');
        } catch (error) {
            logger.error('Error during Strands service shutdown', {
                error: error.message
            });
            throw error;
        } finally {
            this.isShuttingDown = false;
        }
    }
}

// Create singleton instance
const strandsService = new StrandsService();

module.exports = strandsService;