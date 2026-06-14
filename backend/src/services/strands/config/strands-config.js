/**
 * Strands Framework Configuration Management
 * 
 * Manages configuration for Strands framework integration with the 100 Market Press Release Generator.
 * Provides centralized configuration management for Node-Python bridge, agent wrappers, 
 * orchestration patterns, and monitoring capabilities.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');

class StrandsConfig {
    constructor() {
        this.config = this._loadConfiguration();
        this.initialized = false;
        
        // Validate configuration on instantiation
        this._validateConfiguration();
    }

    /**
     * Load configuration from environment variables and defaults
     * @private
     */
    _loadConfiguration() {
        return {
            // Core Strands Framework Settings
            enabled: process.env.STRANDS_ENABLED === 'true',
            pythonPath: process.env.STRANDS_PYTHON_PATH || '/app/strands-integration/python',
            logLevel: process.env.STRANDS_LOG_LEVEL || 'info',
            debug: process.env.NODE_ENV !== 'production',

            // Timeout Configuration
            nodeTimeout: parseInt(process.env.STRANDS_NODE_TIMEOUT) || 120000, // 2 minutes
            graphTimeout: parseInt(process.env.STRANDS_GRAPH_TIMEOUT) || 600000, // 10 minutes
            bridgeTimeout: parseInt(process.env.STRANDS_BRIDGE_TIMEOUT) || 30000, // 30 seconds
            
            // Execution Limits
            maxNodeExecutions: parseInt(process.env.STRANDS_MAX_NODE_EXECUTIONS) || 50,
            maxRetries: parseInt(process.env.STRANDS_MAX_RETRIES) || 3,
            maxConcurrentAgents: parseInt(process.env.STRANDS_MAX_CONCURRENT_AGENTS) || 10,

            // Bridge Configuration
            bridge: {
                messageQueueSize: parseInt(process.env.STRANDS_MESSAGE_QUEUE_SIZE) || 1000,
                heartbeatInterval: parseInt(process.env.STRANDS_HEARTBEAT_INTERVAL) || 5000,
                reconnectAttempts: parseInt(process.env.STRANDS_RECONNECT_ATTEMPTS) || 5,
                reconnectDelay: parseInt(process.env.STRANDS_RECONNECT_DELAY) || 2000
            },

            // Agent Wrapper Configuration
            wrappers: {
                preserveFunctionality: process.env.STRANDS_PRESERVE_FUNCTIONALITY !== 'false',
                enhancedFeatures: process.env.STRANDS_ENHANCED_FEATURES !== 'false',
                monitoringEnabled: process.env.STRANDS_MONITORING_ENABLED !== 'false',
                fallbackEnabled: process.env.STRANDS_FALLBACK_ENABLED !== 'false'
            },

            // Orchestration Pattern Configuration
            orchestration: {
                defaultPattern: process.env.STRANDS_DEFAULT_PATTERN || 'conditional_graph',
                enableSwarmIntelligence: process.env.STRANDS_ENABLE_SWARM !== 'false',
                enableNestedPatterns: process.env.STRANDS_ENABLE_NESTED !== 'false',
                enableHybridOrchestration: process.env.STRANDS_ENABLE_HYBRID !== 'false',
                consensusThreshold: parseFloat(process.env.STRANDS_CONSENSUS_THRESHOLD) || 0.75,
                maxIterations: parseInt(process.env.STRANDS_MAX_ITERATIONS) || 3
            },

            // Monitoring Configuration
            monitoring: {
                metricsEnabled: process.env.STRANDS_METRICS_ENABLED !== 'false',
                performanceTracking: process.env.STRANDS_PERFORMANCE_TRACKING !== 'false',
                healthCheckInterval: parseInt(process.env.STRANDS_HEALTH_CHECK_INTERVAL) || 30000,
                metricsRetentionDays: parseInt(process.env.STRANDS_METRICS_RETENTION_DAYS) || 7
            },

            // Integration with existing 37-agent system
            integration: {
                preserveExistingAgents: true,
                enableDualMode: true, // Support both traditional and Strands execution
                fallbackToTraditional: true,
                validateCompatibility: true
            }
        };
    }

    /**
     * Validate configuration values
     * @private
     */
    _validateConfiguration() {
        const errors = [];

        // Validate required settings when enabled
        if (this.config.enabled) {
            if (!this.config.pythonPath) {
                errors.push('STRANDS_PYTHON_PATH is required when Strands is enabled');
            }

            // Validate timeout values
            if (this.config.nodeTimeout < 1000) {
                errors.push('STRANDS_NODE_TIMEOUT must be at least 1000ms');
            }

            if (this.config.graphTimeout < this.config.nodeTimeout) {
                errors.push('STRANDS_GRAPH_TIMEOUT must be greater than STRANDS_NODE_TIMEOUT');
            }

            // Validate execution limits
            if (this.config.maxNodeExecutions < 1) {
                errors.push('STRANDS_MAX_NODE_EXECUTIONS must be at least 1');
            }

            if (this.config.maxConcurrentAgents < 1) {
                errors.push('STRANDS_MAX_CONCURRENT_AGENTS must be at least 1');
            }

            // Validate consensus threshold
            if (this.config.orchestration.consensusThreshold < 0 || this.config.orchestration.consensusThreshold > 1) {
                errors.push('STRANDS_CONSENSUS_THRESHOLD must be between 0 and 1');
            }
        }

        if (errors.length > 0) {
            const errorMessage = `Strands configuration validation failed:\n${errors.join('\n')}`;
            logger.error('Strands Config Validation Error', { errors });
            throw new Error(errorMessage);
        }

        logger.info('Strands configuration validated successfully', {
            enabled: this.config.enabled,
            pythonPath: this.config.pythonPath ? '[CONFIGURED]' : '[NOT SET]',
            nodeTimeout: this.config.nodeTimeout,
            maxNodeExecutions: this.config.maxNodeExecutions
        });
    }

    /**
     * Initialize Strands configuration
     */
    async initialize() {
        if (this.initialized) {
            logger.warn('Strands configuration already initialized');
            return;
        }

        try {
            logger.info('Initializing Strands configuration...', {
                enabled: this.config.enabled,
                debug: this.config.debug
            });

            // Additional initialization logic can be added here
            // For example, validating Python environment, checking dependencies, etc.

            this.initialized = true;
            logger.info('Strands configuration initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Strands configuration', { error: error.message });
            throw error;
        }
    }

    /**
     * Check if Strands framework is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.config.enabled;
    }

    /**
     * Get complete configuration object
     * @returns {Object}
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Get specific configuration section
     * @param {string} section - Configuration section name
     * @returns {Object|undefined}
     */
    getSection(section) {
        return this.config[section];
    }

    /**
     * Get bridge configuration
     * @returns {Object}
     */
    getBridgeConfig() {
        return {
            ...this.config.bridge,
            pythonPath: this.config.pythonPath,
            timeout: this.config.bridgeTimeout,
            debug: this.config.debug,
            maxRetries: this.config.maxRetries
        };
    }

    /**
     * Get wrapper configuration
     * @returns {Object}
     */
    getWrapperConfig() {
        return {
            ...this.config.wrappers,
            debug: this.config.debug,
            logLevel: this.config.logLevel
        };
    }

    /**
     * Get orchestration configuration
     * @returns {Object}
     */
    getOrchestrationConfig() {
        return {
            ...this.config.orchestration,
            nodeTimeout: this.config.nodeTimeout,
            graphTimeout: this.config.graphTimeout,
            maxNodeExecutions: this.config.maxNodeExecutions,
            maxConcurrentAgents: this.config.maxConcurrentAgents
        };
    }

    /**
     * Get monitoring configuration
     * @returns {Object}
     */
    getMonitoringConfig() {
        return {
            ...this.config.monitoring,
            logLevel: this.config.logLevel,
            debug: this.config.debug
        };
    }

    /**
     * Update configuration at runtime (for testing purposes)
     * @param {string} key - Configuration key (dot notation supported)
     * @param {*} value - New value
     */
    updateConfig(key, value) {
        const keys = key.split('.');

        let current = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const segment = keys[i];
            // SECURITY (CodeQL js/prototype-polluting-assignment, alert 50): INLINE
            // dangerous-key guard immediately before the dynamic `current[segment] = {}`
            // assignment sink. A `__proto__`/`constructor`/`prototype` segment would
            // otherwise walk into and mutate Object.prototype. CodeQL recognizes this
            // inline literal key comparison as a sanitizer barrier on the bracket
            // assignment; an equivalent check hoisted to the top (e.g. `keys.some(...)`)
            // is NOT propagated to this specific sink (cause of the re-opened alert).
            if (segment === '__proto__' || segment === 'constructor' || segment === 'prototype') {
                logger.warn('Strands configuration update rejected: unsafe key path', { key });
                return;
            }
            // Use hasOwnProperty so inherited props don't masquerade as existing config,
            // and create plain objects only for own, safe segments.
            if (!Object.prototype.hasOwnProperty.call(current, segment) || typeof current[segment] !== 'object' || current[segment] === null) {
                current[segment] = {};
            }
            current = current[segment];
        }

        const leafKey = keys[keys.length - 1];
        // SECURITY (CodeQL js/prototype-polluting-assignment, alert 50): INLINE guard
        // at the leaf assignment sink. Reject the special keys so a dot-notation key
        // like `__proto__.polluted` or `constructor.prototype.x` can never write to a
        // built-in prototype. Inline here so the barrier is recognized on this exact
        // `current[leafKey] = value` assignment.
        if (leafKey === '__proto__' || leafKey === 'constructor' || leafKey === 'prototype') {
            logger.warn('Strands configuration update rejected: unsafe key path', { key });
            return;
        }

        const oldValue = current[leafKey];
        current[leafKey] = value;
        
        logger.debug('Strands configuration updated', {
            key,
            oldValue,
            newValue: value
        });
    }

    /**
     * Get configuration summary for logging/debugging
     * @returns {Object}
     */
    getConfigSummary() {
        return {
            enabled: this.config.enabled,
            pythonPath: this.config.pythonPath ? '[CONFIGURED]' : '[NOT SET]',
            nodeTimeout: this.config.nodeTimeout,
            graphTimeout: this.config.graphTimeout,
            maxNodeExecutions: this.config.maxNodeExecutions,
            maxConcurrentAgents: this.config.maxConcurrentAgents,
            defaultPattern: this.config.orchestration.defaultPattern,
            monitoringEnabled: this.config.monitoring.metricsEnabled,
            initialized: this.initialized
        };
    }

    /**
     * Validate Python environment availability
     * @returns {Promise<boolean>}
     */
    async validatePythonEnvironment() {
        if (!this.config.enabled) {
            return true; // Skip validation if Strands is disabled
        }

        try {
            const { spawn } = require('child_process');
            
            return new Promise((resolve) => {
                const pythonProcess = spawn('python3', ['--version'], {
                    stdio: 'pipe',
                    timeout: 5000
                });

                pythonProcess.on('close', (code) => {
                    const isValid = code === 0;
                    logger.info('Python environment validation', {
                        available: isValid,
                        pythonPath: this.config.pythonPath
                    });
                    resolve(isValid);
                });

                pythonProcess.on('error', (error) => {
                    logger.warn('Python environment validation failed', { error: error.message });
                    resolve(false);
                });
            });
        } catch (error) {
            logger.warn('Python environment validation error', { error: error.message });
            return false;
        }
    }

    /**
     * Get environment variables template for documentation
     * @returns {Object}
     */
    getEnvironmentTemplate() {
        return {
            // Core Settings
            STRANDS_ENABLED: 'true|false - Enable Strands framework integration',
            STRANDS_PYTHON_PATH: '/path/to/strands/python - Path to Strands Python environment',
            STRANDS_LOG_LEVEL: 'debug|info|warn|error - Logging level for Strands operations',
            
            // Timeout Configuration
            STRANDS_NODE_TIMEOUT: '120000 - Node execution timeout in milliseconds',
            STRANDS_GRAPH_TIMEOUT: '600000 - Graph execution timeout in milliseconds',
            STRANDS_BRIDGE_TIMEOUT: '30000 - Bridge communication timeout in milliseconds',
            
            // Execution Limits
            STRANDS_MAX_NODE_EXECUTIONS: '50 - Maximum node executions per graph',
            STRANDS_MAX_RETRIES: '3 - Maximum retry attempts for failed operations',
            STRANDS_MAX_CONCURRENT_AGENTS: '10 - Maximum concurrent agent executions',
            
            // Bridge Settings
            STRANDS_MESSAGE_QUEUE_SIZE: '1000 - Message queue size for bridge communication',
            STRANDS_HEARTBEAT_INTERVAL: '5000 - Heartbeat interval in milliseconds',
            STRANDS_RECONNECT_ATTEMPTS: '5 - Maximum reconnection attempts',
            STRANDS_RECONNECT_DELAY: '2000 - Delay between reconnection attempts',
            
            // Feature Toggles
            STRANDS_PRESERVE_FUNCTIONALITY: 'true|false - Preserve existing agent functionality',
            STRANDS_ENHANCED_FEATURES: 'true|false - Enable enhanced Strands features',
            STRANDS_MONITORING_ENABLED: 'true|false - Enable Strands monitoring',
            STRANDS_FALLBACK_ENABLED: 'true|false - Enable fallback to traditional execution',
            
            // Orchestration Settings
            STRANDS_DEFAULT_PATTERN: 'conditional_graph|swarm_intelligence|nested_patterns|hybrid - Default orchestration pattern',
            STRANDS_ENABLE_SWARM: 'true|false - Enable swarm intelligence patterns',
            STRANDS_ENABLE_NESTED: 'true|false - Enable nested orchestration patterns',
            STRANDS_ENABLE_HYBRID: 'true|false - Enable hybrid orchestration patterns',
            STRANDS_CONSENSUS_THRESHOLD: '0.75 - Consensus threshold for swarm intelligence (0-1)',
            STRANDS_MAX_ITERATIONS: '3 - Maximum iterations for consensus algorithms',
            
            // Monitoring Settings
            STRANDS_METRICS_ENABLED: 'true|false - Enable metrics collection',
            STRANDS_PERFORMANCE_TRACKING: 'true|false - Enable performance tracking',
            STRANDS_HEALTH_CHECK_INTERVAL: '30000 - Health check interval in milliseconds',
            STRANDS_METRICS_RETENTION_DAYS: '7 - Metrics retention period in days'
        };
    }

    /**
     * Export configuration for external use
     * @returns {Object}
     */
    exportConfig() {
        return {
            ...this.getConfigSummary(),
            bridge: this.getBridgeConfig(),
            wrappers: this.getWrapperConfig(),
            orchestration: this.getOrchestrationConfig(),
            monitoring: this.getMonitoringConfig(),
            environmentTemplate: this.getEnvironmentTemplate()
        };
    }
}

// Create singleton instance
const strandsConfig = new StrandsConfig();

module.exports = strandsConfig;