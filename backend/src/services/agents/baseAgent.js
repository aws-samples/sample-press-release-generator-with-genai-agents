/**
 * BaseAgent - Base class for all AI agents in the system
 * Provides common functionality for logging, error handling, and lifecycle management
 * Enhanced with trusted data enforcement system
 */

// Custom error class for data source violations
class DataSourceViolationError extends Error {
    constructor(message, dataSource, allowedSources) {
        super(message);
        this.name = 'DataSourceViolationError';
        this.dataSource = dataSource;
        this.allowedSources = allowedSources;
    }
}

class BaseAgent {
    constructor(name, options = {}, lineageService = null) {
        this.name = name;
        this.options = options;
        this.startTime = Date.now();
        this.logs = [];
        this.errors = [];
        
        // Agent Lineage Tracking Integration
        this.lineageService = lineageService;
        this.jobId = null;
        this.dataId = null;
        this.version = '1.0.0';
        
        // TRUSTED DATA ENFORCEMENT SYSTEM
        this.dataSourceMode = options.dataSourceMode || 'crawler';
        this.trustedDataMode = this.dataSourceMode === 'trusted';
        this.dataSourceLocked = false; // Prevents mode changes once set to trusted
        
        // Data source constraint definitions
        this.dataSourceConstraints = {
            trusted: {
                allowedSources: ['trusted', 'trustedDataService'],
                blockedSources: ['crawler', 'firecrawl', 'ai', 'perplexity', 'tavily', 'web_scraping'],
                strictMode: true,
                description: 'Trusted data only - no web scraping or AI inference allowed'
            },
            ai: {
                allowedSources: ['ai', 'perplexity', 'tavily', 'trusted', 'trustedDataService'],
                blockedSources: ['crawler', 'firecrawl'],
                strictMode: false,
                description: 'AI-first with trusted data fallback and Tavily unified search'
            },
            crawler: {
                allowedSources: ['crawler', 'firecrawl', 'tavily', 'trusted', 'trustedDataService', 'ai', 'perplexity'],
                blockedSources: [],
                strictMode: false,
                description: 'All data sources allowed including Tavily unified search'
            }
        };
        
        // Log data source mode initialization
        this.log(`Agent initialized with data source mode: ${this.dataSourceMode}`, 'info');
        if (this.trustedDataMode) {
            this.log('TRUSTED DATA MODE ACTIVE - Only trusted data sources will be used', 'warn');
        }
    }

    /**
     * Log a message with timestamp
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            agent: this.name
        };
        
        this.logs.push(logEntry);
        
        // Also log to console for debugging
        console.log(`[${timestamp}] [${this.name}] ${level.toUpperCase()}: ${message}`);
    }

    /**
     * Log an error with stack trace
     */
    logError(message, error) {
        const timestamp = new Date().toISOString();
        const errorEntry = {
            timestamp,
            message,
            error: error.message,
            stack: error.stack,
            agent: this.name
        };
        
        this.errors.push(errorEntry);
        this.log(`ERROR: ${message} - ${error.message}`, 'error');
    }

    /**
     * Get agent performance metrics
     */
    getMetrics() {
        const uptime = Date.now() - this.startTime;
        return {
            name: this.name,
            uptime,
            logsCount: this.logs.length,
            errorsCount: this.errors.length,
            lastActivity: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
        };
    }

    /**
     * Get recent logs
     */
    getRecentLogs(count = 10) {
        return this.logs.slice(-count);
    }

    /**
     * Get all errors
     */
    getErrors() {
        return this.errors;
    }

    /**
     * Clear logs and errors
     */
    clearLogs() {
        this.logs = [];
        this.errors = [];
        this.log('Logs cleared');
    }

    /**
     * Abstract method for initialization - to be implemented by subclasses
     */
    async initialize() {
        throw new Error(`initialize() method must be implemented by ${this.name}`);
    }

    /**
     * Abstract method for main processing - to be implemented by subclasses
     */
    async process(input, options = {}) {
        throw new Error(`process() method must be implemented by ${this.name}`);
    }

    /**
     * Abstract method for validation - to be implemented by subclasses
     */
    async validate(input, options = {}) {
        throw new Error(`validate() method must be implemented by ${this.name}`);
    }

    /**
     * Get processing results - to be implemented by subclasses
     */
    getResults() {
        throw new Error(`getResults() method must be implemented by ${this.name}`);
    }

    /**
     * Execute method with error handling and retry logic
     * This is the core execution wrapper that all agents use
     */
    async execute(methodOrConfig, ...args) {
        const startTime = Date.now();
        let lastError = null;
        
        // Handle both old signature (method, ...args) and new signature ({ method, input, options })
        let methodName, actualMethod, methodArgs;
        
        if (typeof methodOrConfig === 'object' && methodOrConfig.method) {
            // New object-based signature from orchestrator
            methodName = methodOrConfig.method;
            actualMethod = this[methodName];
            
            if (!actualMethod || typeof actualMethod !== 'function') {
                throw new Error(`Method '${methodName}' not found on agent ${this.constructor.name}`);
            }
            
            // Prepare arguments based on method signature
            if (methodOrConfig.options) {
                methodArgs = [methodOrConfig.input, methodOrConfig.options];
            } else {
                methodArgs = [methodOrConfig.input];
            }
        } else {
            // Legacy signature (method, ...args) - maintain backward compatibility
            methodName = methodOrConfig.name || 'method';
            actualMethod = methodOrConfig;
            methodArgs = args;
        }
        
        // LINEAGE TRACKING: Generate DATA_EXTRACTION event at start
        await this._trackExecutionStart(methodName, methodArgs);
        
        for (let attempt = 1; attempt <= (this.options?.maxRetries || 3); attempt++) {
            try {
                this.log(`Executing ${methodName} (attempt ${attempt})`, 'debug');
                
                const result = await actualMethod.call(this, ...methodArgs);
                
                const duration = Date.now() - startTime;
                this.log(`Execution completed successfully in ${duration}ms`, 'info');
                
                // LINEAGE TRACKING: Generate VERIFICATION event on success
                await this._trackExecutionSuccess(methodName, result, duration);
                
                return result;
                
            } catch (error) {
                lastError = error;
                const duration = Date.now() - startTime;
                
                this.logError(`Execution attempt ${attempt} failed after ${duration}ms`, error);
                
                // LINEAGE TRACKING: Generate ERROR event on failure
                await this._trackExecutionError(methodName, error, attempt, duration);
                
                // Don't retry on validation errors or if this is the last attempt
                if (error.name === 'ValidationError' || attempt === (this.options?.maxRetries || 3)) {
                    break;
                }
                
                // Wait before retry with exponential backoff
                const delay = (this.options?.retryDelay || 1000) * Math.pow(2, attempt - 1);
                this.log(`Retrying in ${delay}ms...`, 'warn');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // If we get here, all attempts failed
        const totalDuration = Date.now() - startTime;
        this.logError(`All execution attempts failed after ${totalDuration}ms`, lastError);
        throw lastError;
    }

    /**
     * Validate input data against schema
     * @param {Object} input - Input data to validate
     * @param {Object} schema - Validation schema
     * @throws {ValidationError} If validation fails
     */
    validateInput(input, schema) {
        if (!schema) {
            this.log('No validation schema provided, skipping validation', 'warn');
            return;
        }

        for (const [key, rules] of Object.entries(schema)) {
            const value = input[key];

            // Check required fields
            if (rules.required && (value === undefined || value === null)) {
                const error = new Error(`Required field '${key}' is missing`);
                error.name = 'ValidationError';
                throw error;
            }

            // Skip type checking if value is not provided and not required
            if (value === undefined || value === null) {
                continue;
            }

            // Type validation
            if (rules.type) {
                const expectedType = rules.type;
                const actualType = Array.isArray(value) ? 'array' : typeof value;

                if (expectedType !== actualType) {
                    const error = new Error(`Field '${key}' must be of type '${expectedType}', got '${actualType}'`);
                    error.name = 'ValidationError';
                    throw error;
                }
            }

            // String length validation - CRITICAL DEBUG VERSION
            if (rules.minLength && typeof value === 'string') {
                // CRITICAL DEBUG: Always log length validation attempt
                this.log('info', `[AGENT VALIDATION DEBUG] Checking minLength for field '${key}'`, {
                    fieldName: key,
                    actualLength: value.length,
                    requiredMinLength: rules.minLength,
                    valueType: typeof value,
                    valueFirst100: value.substring(0, 100),
                    agentName: this.name,
                    validationPassed: value.length >= rules.minLength
                });
                
                if (value.length < rules.minLength) {
                    // CRITICAL DEBUG: Log validation failure details
                    this.log('error', `[AGENT VALIDATION ERROR] Field '${key}' length validation failed`, {
                        fieldName: key,
                        actualLength: value.length,
                        requiredMinLength: rules.minLength,
                        valueType: typeof value,
                        valueFirst100: value.substring(0, 100),
                        agentName: this.name
                    });
                    const error = new Error(`Field '${key}' must be at least ${rules.minLength} characters long`);
                    error.name = 'ValidationError';
                    throw error;
                }
            }

            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                const error = new Error(`Field '${key}' must be no more than ${rules.maxLength} characters long`);
                error.name = 'ValidationError';
                throw error;
            }

            // Array validation
            if (rules.type === 'array' && Array.isArray(value)) {
                if (rules.minItems && value.length < rules.minItems) {
                    const error = new Error(`Field '${key}' must have at least ${rules.minItems} items`);
                    error.name = 'ValidationError';
                    throw error;
                }

                if (rules.maxItems && value.length > rules.maxItems) {
                    const error = new Error(`Field '${key}' must have no more than ${rules.maxItems} items`);
                    error.name = 'ValidationError';
                    throw error;
                }
            }

            // Custom validation function
            if (rules.validate && typeof rules.validate === 'function') {
                try {
                    const isValid = rules.validate(value);
                    if (!isValid) {
                        const error = new Error(`Field '${key}' failed custom validation`);
                        error.name = 'ValidationError';
                        throw error;
                    }
                } catch (validationError) {
                    const error = new Error(`Field '${key}' validation error: ${validationError.message}`);
                    error.name = 'ValidationError';
                    throw error;
                }
            }
        }

        this.log(`Input validation passed for ${Object.keys(schema).length} fields`, 'debug');
    }

    /**
     * Get agent configuration
     */
    getConfig() {
        return this.config || {};
    }

    /**
     * Set agent configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.log('Configuration updated');
    }

    /**
     * Get validation rules - to be implemented by subclasses if needed
     */
    getValidationRules() {
        return this.validationRules || [];
    }

    /**
     * Get agent name
     */
    getName() {
        return this.name;
    }

    /**
     * Get agent version
     */
    getVersion() {
        return this.version || '1.0.0';
    }

    /**
     * Get agent capabilities
     */
    getCapabilities() {
        return this.capabilities || [];
    }

    /**
    /**
     * COST TRACKING DOCUMENTATION
     * 
     * All agents should include a 'cost' field in their result objects to track API costs.
     * 
     * For Bedrock agents, use calculateBedrockCost() from utils/costCalculator:
     * ```javascript
     * const { calculateBedrockCost } = require('../../utils/costCalculator');
     * 
     * // After Bedrock API call:
     * const usage = response.usage || {};
     * const costData = calculateBedrockCost(usage.inputTokens, usage.outputTokens);
     * 
     * return {
     *   // ... other result fields
     *   cost: {
     *     provider: 'bedrock',
     *     model: 'claude-3-7-sonnet',
     *     inputTokens: usage.inputTokens || 0,
     *     outputTokens: usage.outputTokens || 0,
     *     totalTokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
     *     inputCost: costData.inputCost,
     *     outputCost: costData.outputCost,
     *     totalCost: costData.totalCost,
     *     currency: 'USD'
     *   }
     * };
     * ```
     * 
     * For Tavily agents, extract from TavilyService response:
     * ```javascript
     * const tavilyResponse = await tavilyService.search(query, options);
     * 
     * return {
     *   // ... other result fields
     *   cost: {
     *     provider: 'tavily',
     *     operation: tavilyResponse._costTracking.operation,
     *     credits: tavilyResponse._costTracking.credits,
     *     costPerCredit: tavilyResponse._costTracking.costPerCredit,
     *     totalCost: tavilyResponse._costTracking.totalCost,
     *     currency: 'USD'
     *   }
     * };
     * ```
     * 
     * Agents that don't use external APIs should include:
     * ```javascript
     * return {
     *   // ... other result fields
     *   cost: {
     *     provider: 'none',
     *     totalCost: 0,
     *     currency: 'USD'
     *   }
     * };
     * ```
     */

    /**
     * Handle errors consistently
     */
    handleError(error, context = '') {
        const errorMessage = `${context ? context + ': ' : ''}${error.message}`;
        this.logError(errorMessage, error);
        return {
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Report agent status
     */
    reportStatus() {
        return {
            name: this.name,
            version: this.getVersion(),
            initialized: this.isInitialized || false,
            uptime: Date.now() - this.startTime,
            errors: this.errors.length,
            lastActivity: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
        };
    }

    /**
     * Abstract method for cleanup - to be implemented by subclasses
     */
    async cleanup() {
        this.log('Cleaning up agent');
    }

    /**
     * Set job context for lineage tracking
     * @param {string} jobId - Job identifier
     * @param {string} dataId - Data identifier
     */
    setJobContext(jobId, dataId) {
        this.jobId = jobId;
        this.dataId = dataId;
        this.log(`Job context set: jobId=${jobId}, dataId=${dataId}`, 'debug');
    }

    /**
     * Track agent decision for lineage monitoring
     * @param {Object} decisionData - Decision data to track
     * @param {string} decisionData.step - Processing step (e.g., 'analysis', 'validation', 'integration')
     * @param {Object} decisionData.inputData - Input data for the decision
     * @param {string} decisionData.decision - Decision made ('INCLUDE', 'EXCLUDE', 'MODIFY')
     * @param {string} decisionData.decisionRationale - Rationale for the decision
     * @param {Object} decisionData.outputData - Output data from the decision
     * @param {Array} decisionData.transformationsApplied - List of transformations applied
     * @param {number} decisionData.qualityScore - Quality score (0-100)
     * @param {number} decisionData.confidenceLevel - Confidence level (0-100)
     * @param {Object} decisionData.metadata - Additional metadata
     */
    async trackDecision(decisionData) {
        // Skip tracking if no lineage service or job context
        if (!this.lineageService || !this.jobId || !this.dataId) {
            this.log('Lineage tracking skipped - missing service or context', 'debug');
            return;
        }

        try {
            const startTime = Date.now();
            
            // Prepare agent decision event
            const agentDecisionEvent = {
                agentName: this.name,
                agentVersion: this.version,
                step: decisionData.step,
                inputData: decisionData.inputData || {},
                reasoning: decisionData.claudeReasoning || `${this.name} processing decision`,
                decision: decisionData.decision,
                decisionRationale: decisionData.decisionRationale,
                outputData: decisionData.outputData || {},
                transformations: decisionData.transformationsApplied || [],
                qualityScore: decisionData.qualityScore,
                confidenceLevel: decisionData.confidenceLevel,
                metadata: {
                    ...decisionData.metadata,
                    processingTimeMs: decisionData.processingTimeMs || (Date.now() - startTime),
                    agentStartTime: this.startTime,
                    agentUptime: Date.now() - this.startTime
                }
            };

            // Track the decision
            await this.lineageService.trackAgentDecision(
                this.jobId,
                this.dataId,
                agentDecisionEvent
            );

            this.log(`Decision tracked: ${decisionData.step} -> ${decisionData.decision}`, 'info');
            
        } catch (error) {
            this.logError('Failed to track agent decision', error);
            // Don't throw - lineage tracking should not break agent operation
        }
    }

    /**
     * Track agent performance metrics
     * @param {Object} performanceData - Performance metrics to track
     */
    async trackPerformance(performanceData) {
        if (!this.lineageService || !this.jobId) {
            return;
        }

        try {
            const metrics = {
                agentName: this.name,
                processingTime: performanceData.processingTime,
                memoryUsage: performanceData.memoryUsage,
                cpuUsage: performanceData.cpuUsage,
                successRate: performanceData.successRate,
                errorCount: this.errors.length,
                ...performanceData
            };
            
            // TODO: Implement metrics tracking logic here
            this.log(`📊 Performance metrics tracked: ${JSON.stringify(metrics)}`, 'debug');
        } catch (error) {
            this.log(`⚠️ Performance tracking failed: ${error.message}`, 'warn');
        }
    }

    /**
     * LINEAGE TRACKING: Track execution start with DATA_EXTRACTION event
     * @private
     */
    async _trackExecutionStart(methodName, args) {
        if (!this.lineageService || !this.jobId || !this.dataId) {
            return; // Skip if lineage not configured
        }

        try {
            await this.lineageService.trackEvent(this.jobId, this.dataId, {
                eventType: 'DATA_EXTRACTION',
                agentName: this.name || this.constructor.name,
                methodName: methodName,
                timestamp: new Date().toISOString(),
                metadata: {
                    executionPhase: 'start',
                    inputArgsCount: args ? args.length : 0,
                    agentVersion: this.version || '1.0.0'
                }
            });
            this.log(`🔗 Lineage tracked: DATA_EXTRACTION start for ${methodName}`, 'debug');
        } catch (error) {
            this.log(`⚠️ Lineage tracking failed for execution start: ${error.message}`, 'warn');
        }
    }

    /**
     * LINEAGE TRACKING: Track execution success with VERIFICATION event
     * @private
     */
    async _trackExecutionSuccess(methodName, result, duration) {
        if (!this.lineageService || !this.jobId || !this.dataId) {
            return; // Skip if lineage not configured
        }

        try {
            await this.lineageService.trackEvent(this.jobId, this.dataId, {
                eventType: 'VERIFICATION',
                agentName: this.name || this.constructor.name,
                methodName: methodName,
                timestamp: new Date().toISOString(),
                metadata: {
                    executionPhase: 'success',
                    duration: duration,
                    hasResult: !!result,
                    resultType: typeof result,
                    agentVersion: this.version || '1.0.0'
                }
            });
            this.log(`🔗 Lineage tracked: VERIFICATION success for ${methodName}`, 'debug');
        } catch (error) {
            this.log(`⚠️ Lineage tracking failed for execution success: ${error.message}`, 'warn');
        }
    }

    /**
     * LINEAGE TRACKING: Track execution error with ERROR event
     * @private
     */
    async _trackExecutionError(methodName, error, attempt, duration) {
        if (!this.lineageService || !this.jobId || !this.dataId) {
            return; // Skip if lineage not configured
        }

        try {
            await this.lineageService.trackEvent(this.jobId, this.dataId, {
                eventType: 'ERROR',
                agentName: this.name || this.constructor.name,
                methodName: methodName,
                timestamp: new Date().toISOString(),
                metadata: {
                    executionPhase: 'error',
                    errorName: error.name,
                    errorMessage: error.message,
                    attempt: attempt,
                    duration: duration,
                    agentVersion: this.version || '1.0.0'
                }
            });
            this.log(`🔗 Lineage tracked: ERROR for ${methodName} (attempt ${attempt})`, 'debug');
        } catch (lineageError) {
            this.log(`⚠️ Lineage tracking failed for execution error: ${lineageError.message}`, 'warn');
        }
    }

    /**
     * TRUSTED DATA ENFORCEMENT METHODS
     */

    /**
     * Set data source mode for the agent
     * @param {string} mode - Data source mode ('trusted', 'ai', 'crawler')
     */
    setDataSourceMode(mode) {
        // Validate mode parameter
        if (!mode || typeof mode !== 'string') {
            throw new Error('Data source mode must be a valid string');
        }

        if (!this.dataSourceConstraints[mode]) {
            throw new Error(`Invalid data source mode: ${mode}. Valid modes: ${Object.keys(this.dataSourceConstraints).join(', ')}`);
        }

        // Prevent mode changes once set to trusted (security measure)
        if (this.dataSourceLocked && this.dataSourceMode === 'trusted') {
            throw new Error('Cannot change data source mode once set to trusted - security constraint');
        }

        this.dataSourceMode = mode;
        this.trustedDataMode = mode === 'trusted';
        
        // Lock the mode if setting to trusted
        if (mode === 'trusted') {
            this.dataSourceLocked = true;
        }

        this.log(`Data source mode set to: ${mode}`, 'info');
        if (this.trustedDataMode) {
            this.log('🔒 TRUSTED DATA MODE ACTIVATED - System will only use trusted data sources', 'warn');
        }
    }

    /**
     * Validate if a data source access is allowed under current constraints
     * @param {string} dataSource - Data source to validate
     * @throws {DataSourceViolationError} If access is not allowed
     */
    validateDataSourceAccess(dataSource) {
        const constraints = this.dataSourceConstraints[this.dataSourceMode];
        
        if (!constraints) {
            throw new Error(`No constraints defined for data source mode: ${this.dataSourceMode}`);
        }

        // Check if data source is explicitly blocked
        if (constraints.blockedSources.includes(dataSource)) {
            const errorMessage = `Data source access violation: '${dataSource}' is blocked in ${this.dataSourceMode} mode. Allowed sources: ${constraints.allowedSources.join(', ')}`;
            
            this.log(`🚫 ${errorMessage}`, 'error');
            
            throw new DataSourceViolationError(
                errorMessage,
                dataSource,
                constraints.allowedSources
            );
        }

        // Check if data source is in allowed list (for strict modes)
        if (constraints.strictMode && !constraints.allowedSources.includes(dataSource)) {
            const errorMessage = `Data source access violation: '${dataSource}' is not in allowed sources for ${this.dataSourceMode} mode. Allowed sources: ${constraints.allowedSources.join(', ')}`;
            
            this.log(`🚫 ${errorMessage}`, 'error');
            
            throw new DataSourceViolationError(
                errorMessage,
                dataSource,
                constraints.allowedSources
            );
        }

        // Log successful validation
        this.log(`✅ Data source access validated: '${dataSource}' is allowed in ${this.dataSourceMode} mode`, 'debug');
    }

    /**
     * Enforce data source constraints before any external operation
     * This method should be called by agents before accessing external data sources
     * @param {string} operation - Description of the operation being performed
     * @param {string} dataSource - Data source being accessed
     */
    enforceDataSourceConstraints(operation, dataSource) {
        try {
            this.validateDataSourceAccess(dataSource);
            
            this.log(`🔍 Data source constraint check passed for operation: ${operation} using ${dataSource}`, 'debug');
            
            // Track constraint enforcement for audit trail
            if (this.lineageService && this.jobId) {
                this.lineageService.trackEvent(this.jobId, this.dataId || 'unknown', {
                    eventType: 'DATA_SOURCE_VALIDATION',
                    agentName: this.name,
                    operation: operation,
                    dataSource: dataSource,
                    dataSourceMode: this.dataSourceMode,
                    trustedDataMode: this.trustedDataMode,
                    timestamp: new Date().toISOString(),
                    result: 'ALLOWED'
                }).catch(error => {
                    this.log(`⚠️ Failed to track data source validation: ${error.message}`, 'warn');
                });
            }
            
        } catch (error) {
            // Track constraint violation for audit trail
            if (this.lineageService && this.jobId) {
                this.lineageService.trackEvent(this.jobId, this.dataId || 'unknown', {
                    eventType: 'DATA_SOURCE_VIOLATION',
                    agentName: this.name,
                    operation: operation,
                    dataSource: dataSource,
                    dataSourceMode: this.dataSourceMode,
                    trustedDataMode: this.trustedDataMode,
                    timestamp: new Date().toISOString(),
                    result: 'BLOCKED',
                    error: error.message
                }).catch(trackError => {
                    this.log(`⚠️ Failed to track data source violation: ${trackError.message}`, 'warn');
                });
            }
            
            throw error;
        }
    }

    /**
     * Get current data source constraints information
     * @returns {Object} Current constraints and mode information
     */
    getDataSourceInfo() {
        return {
            mode: this.dataSourceMode,
            trustedDataMode: this.trustedDataMode,
            locked: this.dataSourceLocked,
            constraints: this.dataSourceConstraints[this.dataSourceMode],
            agentName: this.name,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = BaseAgent;