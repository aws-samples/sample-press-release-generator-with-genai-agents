/**
 * Pattern Manager
 * 
 * Central coordinator for all Strands orchestration patterns, providing
 * unified interface for conditional logic, swarm intelligence, and nested
 * orchestration patterns with intelligent pattern selection and coordination.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const ConditionalLogicOrchestrator = require('./conditional-logic');
const SwarmIntelligenceOrchestrator = require('./swarm-intelligence');
const NestedOrchestrationManager = require('./nested-patterns');

class OrchestrationPatternManager {
    constructor(options = {}) {
        this.options = {
            enableAutoSelection: options.enableAutoSelection !== false,
            enablePatternCombination: options.enablePatternCombination !== false,
            enableAdaptiveLearning: options.enableAdaptiveLearning !== false,
            enableLogging: options.enableLogging !== false,
            maxConcurrentPatterns: options.maxConcurrentPatterns || 5,
            patternTimeout: options.patternTimeout || 120000,
            ...options
        };

        // Store bridge manager reference for real agent execution
        this.bridgeManager = options.bridgeManager || null;

        // Initialize orchestration patterns with bridge manager
        this.conditionalOrchestrator = new ConditionalLogicOrchestrator({
            enableLogging: this.options.enableLogging,
            bridgeManager: this.bridgeManager,
            ...options.conditional
        });

        this.swarmOrchestrator = new SwarmIntelligenceOrchestrator({
            enableLogging: this.options.enableLogging,
            bridgeManager: this.bridgeManager,
            ...options.swarm
        });

        this.nestedOrchestrator = new NestedOrchestrationManager({
            enableLogging: this.options.enableLogging,
            bridgeManager: this.bridgeManager,
            ...options.nested
        });

        this.patternRegistry = new Map();
        this.executionHistory = [];
        this.patternMetrics = {
            totalExecutions: 0,
            patternUsage: new Map(),
            averageExecutionTime: 0,
            successRate: 0,
            patternCombinations: new Map()
        };

        this.patternTypes = {
            CONDITIONAL: 'conditional',
            SWARM: 'swarm',
            NESTED: 'nested',
            // Only sequential_hybrid is supported
            SEQUENTIAL_HYBRID: 'sequential_hybrid'
        };

        this.agentCategories = {
            CONTENT_GENERATION: 'content_generation',
            QUALITY_ASSURANCE: 'quality_assurance',
            MARKET_INTELLIGENCE: 'market_intelligence',
            FACT_CHECKING: 'fact_checking',
            COMPLIANCE: 'compliance',
            SOURCE_VALIDATION: 'source_validation'
        };

        if (this.options.enableLogging) {
            logger.info('OrchestrationPatternManager initialized', {
                enableAutoSelection: this.options.enableAutoSelection,
                enablePatternCombination: this.options.enablePatternCombination,
                maxConcurrentPatterns: this.options.maxConcurrentPatterns
            });
        }
    }

    /**
     * Initialize the pattern manager
     */
    async initialize() {
        try {
            // Initialize all orchestration patterns
            await Promise.all([
                this.conditionalOrchestrator.initialize?.(),
                this.swarmOrchestrator.initialize?.(),
                this.nestedOrchestrator.initialize?.()
            ].filter(Boolean));

            // Register default patterns for the 37-agent system
            await this._registerDefaultPatterns();

            if (this.options.enableLogging) {
                logger.info('OrchestrationPatternManager initialization completed', {
                    registeredPatterns: this.patternRegistry.size
                });
            }

            return true;

        } catch (error) {
            logger.error('Pattern manager initialization failed', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Execute orchestration with automatic pattern selection
     * @param {Object} task - Task configuration
     * @param {Object} data - Input data
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Execution results
     */
    async executeOrchestration(task, data = {}, context = {}) {
        const startTime = Date.now();

        try {
            // BREAKPOINT 1: Entry point
            logger.info('🔍 ORCHESTRATION DEBUG: executeOrchestration called', {
                taskType: task.type,
                taskPattern: task.pattern,
                agentCount: task.agents?.length || 0,
                agentNames: task.agents?.map(a => a.name) || [],
                enableAutoSelection: this.options.enableAutoSelection,
                dataKeys: Object.keys(data),
                contextKeys: Object.keys(context)
            });

            let result;

            if (this.options.enableAutoSelection && !task.pattern) {
                // BREAKPOINT 2: Auto-selection path
                logger.info('🔍 ORCHESTRATION DEBUG: Auto-selecting pattern');
                const selectedPattern = await this._selectOptimalPattern(task, data, context);
                logger.info('🔍 ORCHESTRATION DEBUG: Pattern selected', { selectedPattern });
                result = await this._executeWithPattern(selectedPattern, task, data, context);
            } else {
                // BREAKPOINT 3: Explicit pattern path
                const pattern = task.pattern || this.patternTypes.CONDITIONAL;
                logger.info('🔍 ORCHESTRATION DEBUG: Using explicit pattern', { pattern });
                result = await this._executeWithPattern(pattern, task, data, context);
            }

            // BREAKPOINT 4: Result received
            logger.info('🔍 ORCHESTRATION DEBUG: Pattern execution result', {
                resultKeys: result ? Object.keys(result) : 'null',
                success: result?.success,
                error: result?.error,
                patternUsed: result?.patternUsed,
                hasResult: !!result
            });

            // Update metrics
            this._updateExecutionMetrics(task, result, startTime);

            // Record execution history
            this._recordExecution(task, result, startTime);

            // BREAKPOINT 5: Final result
            logger.info('🔍 ORCHESTRATION DEBUG: Returning result', {
                success: result.success,
                error: result.error,
                executionTime: result.executionTime
            });

            return result;

        } catch (error) {
            // BREAKPOINT 6: Exception caught
            logger.error('🔍 ORCHESTRATION DEBUG: Exception in executeOrchestration', {
                taskType: task.type,
                error: error.message,
                stack: error.stack,
                errorType: error.constructor.name
            });

            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime,
                taskType: task.type
            };
        }
    }

    /**
     * Execute with specific pattern
     * @private
     */
    async _executeWithPattern(pattern, task, data, context) {
        const startTime = Date.now();

        try {
            // BREAKPOINT 7: Pattern execution entry
            logger.info('🔍 PATTERN DEBUG: _executeWithPattern called', {
                pattern,
                taskType: task.type,
                agentCount: task.agents?.length || 0
            });

            let result;

            // Only sequential_hybrid is supported - all patterns route through it
            switch (pattern) {
                case this.patternTypes.CONDITIONAL:
                case this.patternTypes.SWARM:
                case this.patternTypes.NESTED:
                case this.patternTypes.SEQUENTIAL_HYBRID:
                    logger.info('🔍 PATTERN DEBUG: Executing SEQUENTIAL_HYBRID pattern', { requestedPattern: pattern });
                    result = await this._executeSpecificHybridPattern(this.patternTypes.SEQUENTIAL_HYBRID, task, data, context);
                    break;

                default:
                    throw new Error(`Unknown orchestration pattern: ${pattern}`);
            }

            // BREAKPOINT 8: Pattern result
            logger.info('🔍 PATTERN DEBUG: Pattern execution completed', {
                pattern,
                resultKeys: result ? Object.keys(result) : 'null',
                success: result?.success,
                error: result?.error
            });

            return {
                ...result,
                patternUsed: pattern,
                executionTime: Date.now() - startTime,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            // BREAKPOINT 9: Pattern exception
            logger.error('🔍 PATTERN DEBUG: Exception in _executeWithPattern', {
                pattern,
                taskType: task.type,
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                error: error.message,
                patternUsed: pattern,
                executionTime: Date.now() - startTime
            };
        }
    }

    

    /**
     * Execute specific hybrid pattern using hybrid orchestration engine
     * @private
     */
    async _executeSpecificHybridPattern(pattern, task, data, context) {
        try {
            // Import hybrid orchestration engine
            const HybridOrchestrationEngine = require('./hybrid-orchestration');
            
            // Initialize hybrid orchestration engine if not already done
            if (!this.hybridOrchestrator) {
                this.hybridOrchestrator = new HybridOrchestrationEngine({
                    enableLogging: this.options.enableLogging,
                    enableAdaptivePatternSelection: true,
                    enablePatternLearning: true,
                    enableDynamicReconfiguration: true,
                    // CRITICAL FIX: Pass bridge manager for real agent execution
                    bridgeManager: this.bridgeManager
                });
                await this.hybridOrchestrator.initialize();
            }

            // Create hybrid task configuration
            const hybridTask = {
                ...task,
                hybridPattern: pattern,
                type: task.type || 'content_generation'
            };

            if (this.options.enableLogging) {
                logger.info('Executing specific hybrid pattern with bridge manager', {
                    pattern,
                    taskType: task.type,
                    agentCount: task.agents?.length || 0,
                    hasBridgeManager: !!this.bridgeManager
                });
            }

            // Execute through hybrid orchestration engine
            const result = await this.hybridOrchestrator.executeHybridOrchestration(
                hybridTask,
                data,
                context
            );

            return result;

        } catch (error) {
            logger.error('Specific hybrid pattern execution failed', {
                pattern,
                taskType: task.type,
                error: error.message,
                hasBridgeManager: !!this.bridgeManager
            });

            // Fallback to generic hybrid pattern
            logger.warn('Falling back to generic hybrid pattern', { pattern });
            return await this._executeHybridPattern(task, data, context);
        }
    }

    /**
     * Select optimal orchestration pattern (simplified - always returns sequential_hybrid)
     * @private
     */
    async _selectOptimalPattern(task, data, context) {
        // Always use sequential_hybrid pattern
        if (this.options.enableLogging) {
            logger.debug('Pattern selection: using sequential_hybrid (only supported pattern)');
        }
        return this.patternTypes.SEQUENTIAL_HYBRID;
    }

    

    /**
     * Register default orchestration patterns for the 37-agent system
     * @private
     */
    async _registerDefaultPatterns() {
        // Content Generation Pipeline Pattern
        this.patternRegistry.set('content_generation_pipeline', {
            type: this.patternTypes.NESTED,
            description: 'Standard content generation pipeline',
            phases: ['analyze', 'research', 'generate', 'validate', 'format'],
            agentMapping: {
                analyze: ['ContentAnalyzerAgent', 'ComprehensiveDataExtractorAgent'],
                research: ['MarketResearcherAgent', 'MarketContextAnalyzer'],
                generate: ['LocalizationEngine'],
                validate: ['QualityValidator', 'ConsistencyChecker'],
                format: ['OutputFormatter', 'PitchEmailExtractor']
            }
        });

        // Quality Assurance Swarm Pattern
        this.patternRegistry.set('quality_assurance_swarm', {
            type: this.patternTypes.SWARM,
            description: 'Quality assurance through swarm consensus',
            behavior: 'consensus',
            agents: [
                'QualityValidator', 'ConsistencyChecker', 'HallucinationDetector',
                'FactualConsistencyChecker', 'StyleGuideService'
            ]
        });

        // Fact-Checking Conditional Pattern
        this.patternRegistry.set('fact_checking_conditional', {
            type: this.patternTypes.CONDITIONAL,
            description: 'Conditional fact-checking based on content complexity',
            condition: {
                type: 'data_quality',
                threshold: 0.8
            },
            primaryAgents: [
                'ConfidenceScorer', 'RealTimeDataVerifier', 'StatisticalChecker'
            ],
            fallbackAgents: [
                'SourceTracker', 'SemanticValidator'
            ]
        });

        if (this.options.enableLogging) {
            logger.info('Default orchestration patterns registered', {
                patternCount: this.patternRegistry.size
            });
        }
    }

    /**
     * Update execution metrics
     * @private
     */
    _updateExecutionMetrics(task, result, startTime) {
        this.patternMetrics.totalExecutions++;
        
        const pattern = result.patternUsed || 'unknown';
        const currentCount = this.patternMetrics.patternUsage.get(pattern) || 0;
        this.patternMetrics.patternUsage.set(pattern, currentCount + 1);

        const executionTime = Date.now() - startTime;
        this.patternMetrics.averageExecutionTime = 
            (this.patternMetrics.averageExecutionTime * (this.patternMetrics.totalExecutions - 1) + executionTime) / 
            this.patternMetrics.totalExecutions;

        if (result.success) {
            this.patternMetrics.successRate = 
                (this.patternMetrics.successRate * (this.patternMetrics.totalExecutions - 1) + 1) / 
                this.patternMetrics.totalExecutions;
        } else {
            this.patternMetrics.successRate = 
                (this.patternMetrics.successRate * (this.patternMetrics.totalExecutions - 1)) / 
                this.patternMetrics.totalExecutions;
        }
    }

    /**
     * Record execution in history
     * @private
     */
    _recordExecution(task, result, startTime) {
        this.executionHistory.push({
            taskType: task.type,
            pattern: result.patternUsed,
            success: result.success,
            executionTime: Date.now() - startTime,
            agentCount: task.agents?.length || 0,
            timestamp: new Date().toISOString(),
            error: result.error
        });

        // Keep only last 1000 executions
        if (this.executionHistory.length > 1000) {
            this.executionHistory = this.executionHistory.slice(-1000);
        }
    }

    

    /**
     * Get registered patterns
     */
    getRegisteredPatterns() {
        return Object.fromEntries(this.patternRegistry);
    }

    /**
     * Get pattern usage statistics
     */
    getPatternStatistics() {
        return {
            totalExecutions: this.patternMetrics.totalExecutions,
            patternUsage: Object.fromEntries(this.patternMetrics.patternUsage),
            averageExecutionTime: this.patternMetrics.averageExecutionTime,
            successRate: this.patternMetrics.successRate,
            historyLength: this.executionHistory.length
        };
    }

    /**
     * Get execution history
     */
    getExecutionHistory(limit = 100) {
        return this.executionHistory.slice(-limit);
    }

    /**
     * Get comprehensive status
     */
    getStatus() {
        return {
            type: 'OrchestrationPatternManager',
            version: '1.0.0',
            patterns: {
                conditional: this.conditionalOrchestrator.getStatus(),
                swarm: this.swarmOrchestrator.getStatus(),
                nested: this.nestedOrchestrator.getStatus()
            },
            registeredPatterns: this.patternRegistry.size,
            metrics: this.patternMetrics,
            configuration: {
                enableAutoSelection: this.options.enableAutoSelection,
                enablePatternCombination: this.options.enablePatternCombination,
                maxConcurrentPatterns: this.options.maxConcurrentPatterns
            }
        };
    }

    /**
     * Shutdown pattern manager
     */
    async shutdown() {
        await Promise.all([
            this.conditionalOrchestrator.shutdown(),
            this.swarmOrchestrator.shutdown(),
            this.nestedOrchestrator.shutdown()
        ]);

        this.patternRegistry.clear();
        this.executionHistory = [];

        if (this.options.enableLogging) {
            logger.info('OrchestrationPatternManager shutdown completed');
        }
    }
}

module.exports = OrchestrationPatternManager;