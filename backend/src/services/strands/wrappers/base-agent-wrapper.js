/**
 * Base Agent Wrapper for Strands Framework Integration
 * 
 * Provides the foundation for wrapping existing 37 agents in the 100 Market Press Release Generator
 * to be compatible with the Strands framework while preserving all existing functionality.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const strandsConfig = require('../config/strands-config');

class BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        // Handle both old and new constructor signatures for backward compatibility
        if (typeof agentInstance === 'string') {
            // Old signature: (agentName, originalAgent, options)
            this.agentName = agentInstance;
            this.originalAgent = options;
            this.options = arguments[2] || {};
        } else {
            // New signature: (agentInstance, options)
            this.originalAgent = agentInstance;
            this.agentName = agentInstance?.name || agentInstance?.constructor?.name || 'UnknownAgent';
            this.options = options;
        }

        this.options = {
            ...strandsConfig.getWrapperConfig(),
            ...this.options
        };

        // Set category from options
        this.category = this.options.category || this._getAgentCategory();
        this.capabilities = this.options.capabilities || this._getAgentCapabilities();
        this.primaryMethods = this.options.primaryMethods || ['process'];
        
        // Strands-specific configuration
        this.strandsConfig = {
            preserveFunctionality: this.options.preserveFunctionality,
            enhancedFeatures: this.options.enhancedFeatures,
            monitoringEnabled: this.options.monitoringEnabled,
            fallbackEnabled: this.options.fallbackEnabled
        };

        // Metrics tracking
        this.metrics = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0,
            lastExecutionTime: null,
            strandsExecutions: 0,
            traditionalExecutions: 0
        };

        // Execution state
        this.isInitialized = false;
        this.strandsEnabled = false;
        this.executionHistory = [];

        logger.info(`BaseAgentWrapper created for agent: ${this.agentName}`, {
            version: '1.0.0',
            agentName: this.agentName,
            preserveFunctionality: this.strandsConfig.preserveFunctionality,
            enhancedFeatures: this.strandsConfig.enhancedFeatures,
            monitoringEnabled: this.strandsConfig.monitoringEnabled
        });
    }

    /**
     * Initialize the agent wrapper
     * @param {Object} strandsContext - Strands execution context
     */
    async initialize(strandsContext = null) {
        if (this.isInitialized) {
            logger.debug(`Agent wrapper ${this.agentName} already initialized`);
            return;
        }

        try {
            logger.info(`Initializing agent wrapper: ${this.agentName}`);

            // Initialize original agent if it has an initialize method
            if (this.originalAgent && typeof this.originalAgent.initialize === 'function') {
                await this.originalAgent.initialize();
                logger.debug(`Original agent ${this.agentName} initialized`);
            }

            // Set Strands context if provided
            if (strandsContext) {
                this.strandsEnabled = true;
                this.strandsContext = strandsContext;
                logger.debug(`Strands context set for agent: ${this.agentName}`);
            }

            this.isInitialized = true;
            logger.info(`Agent wrapper ${this.agentName} initialized successfully`);
        } catch (error) {
            logger.error(`Failed to initialize agent wrapper: ${this.agentName}`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Wrap agent for Strands compatibility
     * @returns {Object} Strands-compatible agent interface
     */
    async wrapForStrands() {
        try {
            logger.debug(`Wrapping agent ${this.agentName} for Strands compatibility`);

            // Create Strands-compatible interface
            const strandsInterface = {
                name: this.agentName,
                originalAgent: this.originalAgent,
                
                // Core execution method for Strands
                execute: this.executeWithStrands.bind(this),
                
                // Metadata for Strands framework
                metadata: {
                    type: 'node_agent',
                    category: this._getAgentCategory(),
                    capabilities: this._getAgentCapabilities(),
                    dependencies: this._getAgentDependencies(),
                    preserveFunctionality: this.strandsConfig.preserveFunctionality,
                    enhancedFeatures: this.strandsConfig.enhancedFeatures
                },

                // Monitoring interface
                getMetrics: () => this.getMetrics(),
                getExecutionHistory: () => this.getExecutionHistory(),
                
                // Configuration interface
                getConfig: () => this.strandsConfig,
                updateConfig: (key, value) => this.updateWrapperConfig(key, value)
            };

            // Add enhanced monitoring if enabled
            if (this.strandsConfig.monitoringEnabled) {
                strandsInterface.monitoring = {
                    startTime: Date.now(),
                    executionCount: this.metrics.totalExecutions,
                    successRate: this._calculateSuccessRate(),
                    averageExecutionTime: this.metrics.averageExecutionTime
                };
            }

            logger.debug(`Agent ${this.agentName} wrapped for Strands successfully`);
            return strandsInterface;
        } catch (error) {
            logger.error(`Failed to wrap agent ${this.agentName} for Strands`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Execute agent method with Strands orchestration context
     * @param {string} method - Method name to execute
     * @param {Array} params - Method parameters
     * @param {Object} options - Execution options
     * @returns {Promise<*>} Execution result
     */
    async executeWithStrands(method, params = [], options = {}) {
        const startTime = Date.now();
        const executionId = `${this.agentName}_${method}_${Date.now()}`;
        
        try {
            logger.debug(`Executing ${this.agentName}.${method} with Strands context`, {
                executionId,
                method,
                paramsLength: params.length,
                strandsEnabled: this.strandsEnabled,
                options
            });

            // Update metrics
            this.metrics.totalExecutions++;
            if (this.strandsEnabled) {
                this.metrics.strandsExecutions++;
            } else {
                this.metrics.traditionalExecutions++;
            }

            let result;

            if (this.strandsEnabled && this.strandsConfig.enhancedFeatures) {
                // Execute with Strands enhancements
                result = await this._executeWithStrandsEnhancements(method, params, options);
            } else {
                // Execute original agent method
                result = await this._executeOriginalMethod(method, params, options);
            }

            // Record successful execution
            const executionTime = Date.now() - startTime;
            this.metrics.successfulExecutions++;
            this._updateAverageExecutionTime(executionTime);
            this.metrics.lastExecutionTime = executionTime;

            // Add to execution history
            this._addToExecutionHistory({
                executionId,
                method,
                startTime,
                executionTime,
                success: true,
                strandsEnabled: this.strandsEnabled,
                resultSize: this._getResultSize(result)
            });

            logger.debug(`Agent ${this.agentName}.${method} executed successfully`, {
                executionId,
                executionTime,
                strandsEnabled: this.strandsEnabled,
                resultSize: this._getResultSize(result)
            });

            return result;
        } catch (error) {
            // Record failed execution
            const executionTime = Date.now() - startTime;
            this.metrics.failedExecutions++;
            this.metrics.lastExecutionTime = executionTime;

            // Add to execution history
            this._addToExecutionHistory({
                executionId,
                method,
                startTime,
                executionTime,
                success: false,
                strandsEnabled: this.strandsEnabled,
                error: error.message
            });

            logger.error(`Agent ${this.agentName}.${method} execution failed`, {
                executionId,
                executionTime,
                error: error.message,
                strandsEnabled: this.strandsEnabled
            });

            // Fallback to traditional execution if enabled and Strands execution failed
            if (this.strandsEnabled && this.strandsConfig.fallbackEnabled && !options.noFallback) {
                logger.warn(`Falling back to traditional execution for ${this.agentName}.${method}`);
                return await this._executeOriginalMethod(method, params, { ...options, fallback: true });
            }

            throw error;
        }
    }

    /**
     * Execute with Strands enhancements
     * @private
     */
    async _executeWithStrandsEnhancements(method, params, options) {
        // This will be implemented by specific agent wrappers
        // For now, delegate to original method with enhanced monitoring
        logger.debug(`Executing ${this.agentName}.${method} with Strands enhancements`);
        
        // Add Strands-specific context to execution
        const enhancedOptions = {
            ...options,
            strandsContext: this.strandsContext,
            executionId: `strands_${Date.now()}`,
            monitoringEnabled: this.strandsConfig.monitoringEnabled
        };

        return await this._executeOriginalMethod(method, params, enhancedOptions);
    }

    /**
     * Execute original agent method
     * @private
     */
    async _executeOriginalMethod(method, params, options) {
        if (!this.originalAgent) {
            throw new Error(`Original agent not available for ${this.agentName}`);
        }

        if (typeof this.originalAgent[method] !== 'function') {
            throw new Error(`Method ${method} not found on agent ${this.agentName}`);
        }

        // Execute original method
        return await this.originalAgent[method](...params);
    }

    /**
     * Get agent category for Strands metadata
     * @private
     */
    _getAgentCategory() {
        // Categorize based on agent name patterns
        const name = this.agentName.toLowerCase();
        
        if (name.includes('content') || name.includes('analyzer')) return 'content_processing';
        if (name.includes('market') || name.includes('research')) return 'market_intelligence';
        if (name.includes('quality') || name.includes('validator')) return 'quality_assurance';
        if (name.includes('fact') || name.includes('checker')) return 'fact_checking';
        if (name.includes('output') || name.includes('formatter')) return 'output_generation';
        if (name.includes('compliance') || name.includes('regulatory')) return 'compliance';
        if (name.includes('source') || name.includes('authority')) return 'source_validation';
        if (name.includes('localization') || name.includes('engine')) return 'localization';
        
        return 'general';
    }

    /**
     * Get agent capabilities for Strands metadata
     * @private
     */
    _getAgentCapabilities() {
        const capabilities = ['execute', 'monitor', 'fallback'];
        
        if (this.originalAgent) {
            // Add capabilities based on original agent methods
            const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this.originalAgent))
                .filter(name => typeof this.originalAgent[name] === 'function' && name !== 'constructor');
            capabilities.push(...methods);
        }

        return [...new Set(capabilities)]; // Remove duplicates
    }

    /**
     * Get agent dependencies for Strands metadata
     * @private
     */
    _getAgentDependencies() {
        // This would be enhanced by specific agent wrappers
        return {
            external_services: [],
            internal_services: [],
            data_sources: [],
            ai_services: []
        };
    }

    /**
     * Calculate success rate
     * @private
     */
    _calculateSuccessRate() {
        if (this.metrics.totalExecutions === 0) return 0;
        return (this.metrics.successfulExecutions / this.metrics.totalExecutions) * 100;
    }

    /**
     * Update average execution time
     * @private
     */
    _updateAverageExecutionTime(newTime) {
        const totalTime = (this.metrics.averageExecutionTime * this.metrics.successfulExecutions) + newTime;
        this.metrics.averageExecutionTime = totalTime / (this.metrics.successfulExecutions + 1);
    }

    /**
     * Get result size for metrics
     * @private
     */
    _getResultSize(result) {
        if (!result) return 0;
        if (typeof result === 'string') return result.length;
        if (typeof result === 'object') return JSON.stringify(result).length;
        return String(result).length;
    }

    /**
     * Add execution to history
     * @private
     */
    _addToExecutionHistory(execution) {
        this.executionHistory.push(execution);
        
        // Keep only last 100 executions
        if (this.executionHistory.length > 100) {
            this.executionHistory = this.executionHistory.slice(-100);
        }
    }

    /**
     * Update wrapper configuration
     * @param {string} key - Configuration key
     * @param {*} value - New value
     */
    updateWrapperConfig(key, value) {
        this.strandsConfig[key] = value;
        logger.debug(`Updated wrapper config for ${this.agentName}`, { key, value });
    }

    /**
     * Get execution metrics
     * @returns {Object}
     */
    getMetrics() {
        return {
            ...this.metrics,
            successRate: this._calculateSuccessRate(),
            strandsUtilization: this.metrics.totalExecutions > 0 
                ? (this.metrics.strandsExecutions / this.metrics.totalExecutions) * 100 
                : 0
        };
    }

    /**
     * Get execution history
     * @returns {Array}
     */
    getExecutionHistory() {
        return [...this.executionHistory];
    }

    /**
     * Get agent capabilities
     * @returns {Array} List of agent capabilities
     */
    getCapabilities() {
        return this.capabilities || this._getAgentCapabilities();
    }

    /**
     * Get agent category
     * @returns {string} Agent category
     */
    getCategory() {
        return this.category || this._getAgentCategory();
    }

    /**
     * Get primary methods
     * @returns {Array} List of primary methods
     */
    getPrimaryMethods() {
        return this.primaryMethods || ['process'];
    }

    /**
     * Get wrapper status
     * @returns {Object}
     */
    getStatus() {
        return {
            agentName: this.agentName,
            category: this.getCategory(),
            capabilities: this.getCapabilities(),
            primaryMethods: this.getPrimaryMethods(),
            isInitialized: this.isInitialized,
            strandsEnabled: this.strandsEnabled,
            originalAgentAvailable: !!this.originalAgent,
            config: this.strandsConfig,
            metrics: this.getMetrics(),
            lastExecution: this.executionHistory[this.executionHistory.length - 1] || null
        };
    }

    /**
     * Enable Strands execution mode
     * @param {Object} strandsContext - Strands execution context
     */
    enableStrands(strandsContext) {
        this.strandsEnabled = true;
        this.strandsContext = strandsContext;
        logger.info(`Strands enabled for agent: ${this.agentName}`);
    }

    /**
     * Disable Strands execution mode (fallback to traditional)
     */
    disableStrands() {
        this.strandsEnabled = false;
        this.strandsContext = null;
        logger.info(`Strands disabled for agent: ${this.agentName}, using traditional execution`);
    }

    /**
     * Check if agent supports specific Strands pattern
     * @param {string} pattern - Orchestration pattern name
     * @returns {boolean}
     */
    supportsPattern(pattern) {
        // Base implementation - can be overridden by specific wrappers
        const supportedPatterns = ['conditional_graph', 'sequential', 'parallel'];
        return supportedPatterns.includes(pattern);
    }

    /**
     * Get agent configuration for Strands orchestration
     * @returns {Object}
     */
    getStrandsAgentConfig() {
        return {
            name: this.agentName,
            type: 'node_agent',
            category: this._getAgentCategory(),
            capabilities: this._getAgentCapabilities(),
            dependencies: this._getAgentDependencies(),
            timeout: strandsConfig.getConfig().nodeTimeout,
            retries: strandsConfig.getConfig().maxRetries,
            monitoring: this.strandsConfig.monitoringEnabled,
            fallback: this.strandsConfig.fallbackEnabled
        };
    }

    /**
     * Validate agent compatibility with Strands
     * @returns {Object} Validation result
     */
    validateStrandsCompatibility() {
        const issues = [];
        const warnings = [];

        // Check if original agent exists
        if (!this.originalAgent) {
            issues.push('Original agent not available');
        }

        // Check if agent has required methods
        if (this.originalAgent && typeof this.originalAgent.execute !== 'function') {
            warnings.push('Original agent does not have execute method - using method delegation');
        }

        // Check initialization status
        if (!this.isInitialized) {
            warnings.push('Agent wrapper not initialized');
        }

        const isCompatible = issues.length === 0;

        logger.debug(`Strands compatibility validation for ${this.agentName}`, {
            compatible: isCompatible,
            issues: issues.length,
            warnings: warnings.length
        });

        return {
            compatible: isCompatible,
            issues,
            warnings,
            agentName: this.agentName,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset metrics (for testing purposes)
     */
    resetMetrics() {
        this.metrics = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0,
            lastExecutionTime: null,
            strandsExecutions: 0,
            traditionalExecutions: 0
        };
        this.executionHistory = [];
        logger.debug(`Metrics reset for agent: ${this.agentName}`);
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        try {
            logger.info(`Cleaning up agent wrapper: ${this.agentName}`);

            // Cleanup original agent if it has cleanup method
            if (this.originalAgent && typeof this.originalAgent.cleanup === 'function') {
                await this.originalAgent.cleanup();
            }

            // Reset state
            this.isInitialized = false;
            this.strandsEnabled = false;
            this.strandsContext = null;

            logger.info(`Agent wrapper ${this.agentName} cleaned up successfully`);
        } catch (error) {
            logger.error(`Failed to cleanup agent wrapper: ${this.agentName}`, {
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = BaseAgentWrapper;