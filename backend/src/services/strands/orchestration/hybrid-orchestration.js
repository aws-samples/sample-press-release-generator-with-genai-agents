/**
 * Hybrid Orchestration Engine
 * 
 * Phase 4: Advanced hybrid orchestration patterns that intelligently combine
 * conditional logic, swarm intelligence, and nested patterns for optimal
 * multi-agent coordination in complex workflows.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const ConditionalLogicOrchestrator = require('./conditional-logic');
const SwarmIntelligenceOrchestrator = require('./swarm-intelligence');
const NestedOrchestrationManager = require('./nested-patterns');

class HybridOrchestrationEngine {
    constructor(options = {}) {
        this.options = {
            enableAdaptivePatternSelection: options.enableAdaptivePatternSelection !== false,
            enablePatternLearning: options.enablePatternLearning !== false,
            enableDynamicReconfiguration: options.enableDynamicReconfiguration !== false,
            maxHybridComplexity: options.maxHybridComplexity || 5,
            patternTransitionTimeout: options.patternTransitionTimeout || 30000,
            enableLogging: options.enableLogging !== false,
            ...options
        };

        // Store bridge manager reference for real agent execution
        this.bridgeManager = options.bridgeManager || null;

        // Initialize orchestration engines with bridge manager
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

        // Hybrid orchestration state
        this.hybridExecutions = new Map();
        this.patternPerformanceHistory = new Map();
        this.adaptiveStrategies = new Map();
        
        // Performance metrics
        this.metrics = {
            totalHybridExecutions: 0,
            successfulHybridExecutions: 0,
            averageExecutionTime: 0,
            patternCombinations: new Map(),
            adaptiveDecisions: 0,
            patternTransitions: 0,
            optimalPatternHits: 0
        };

        // Hybrid pattern types - Only sequential_hybrid is supported
        this.hybridPatterns = {
            SEQUENTIAL_HYBRID: 'sequential_hybrid'
        };

        if (this.options.enableLogging) {
            logger.info('HybridOrchestrationEngine initialized', {
                enableAdaptivePatternSelection: this.options.enableAdaptivePatternSelection,
                enablePatternLearning: this.options.enablePatternLearning,
                maxHybridComplexity: this.options.maxHybridComplexity
            });
        }
    }

    /**
     * Initialize hybrid orchestration engine
     */
    async initialize() {
        try {
            // Initialize all underlying orchestrators
            await Promise.all([
                this.conditionalOrchestrator.initialize?.(),
                this.swarmOrchestrator.initialize?.(),
                this.nestedOrchestrator.initialize?.()
            ].filter(Boolean));

            // Initialize adaptive strategies
            await this._initializeAdaptiveStrategies();

            // Initialize pattern performance tracking
            await this._initializePatternTracking();

            if (this.options.enableLogging) {
                logger.info('HybridOrchestrationEngine initialization completed');
            }

            return true;

        } catch (error) {
            logger.error('Hybrid orchestration engine initialization failed', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Execute hybrid orchestration with intelligent pattern combination
     * @param {Object} task - Task configuration
     * @param {Object} data - Input data
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Hybrid execution results
     */
    async executeHybridOrchestration(task, data = {}, context = {}) {
        const executionId = `hybrid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        try {
            if (this.options.enableLogging) {
                logger.info('Starting hybrid orchestration execution', {
                    executionId,
                    taskType: task.type,
                    hybridPattern: task.hybridPattern,
                    agentCount: task.agents?.length || 0
                });
            }

            // Store execution context
            this.hybridExecutions.set(executionId, {
                task,
                data,
                context,
                startTime,
                status: 'executing',
                phases: []
            });

            // Only sequential_hybrid pattern is supported
            const result = await this._executeSequentialHybrid(executionId, task, data, context);

            // Update execution record
            const execution = this.hybridExecutions.get(executionId);
            execution.status = result.success ? 'completed' : 'failed';
            execution.result = result;
            execution.executionTime = Date.now() - startTime;

            // Update metrics
            this._updateHybridMetrics(task, result, startTime);

            // Learn from execution if enabled
            if (this.options.enablePatternLearning && result.success) {
                await this._learnFromExecution(executionId, task, result);
            }

            const finalResult = {
                ...result,
                executionId,
                hybridPattern: task.hybridPattern || this.hybridPatterns.ADAPTIVE_HYBRID,
                totalExecutionTime: Date.now() - startTime,
                metadata: {
                    timestamp: new Date().toISOString(),
                    taskType: task.type,
                    agentsCoordinated: task.agents?.length || 0
                }
            };

            if (this.options.enableLogging) {
                logger.info('Hybrid orchestration execution completed', {
                    executionId,
                    success: result.success,
                    hybridPattern: task.hybridPattern,
                    totalTime: finalResult.totalExecutionTime
                });
            }

            return finalResult;

        } catch (error) {
            logger.error('Hybrid orchestration execution failed', {
                executionId,
                error: error.message
            });

            return {
                success: false,
                executionId,
                error: error.message,
                totalExecutionTime: Date.now() - startTime,
                hybridPattern: task.hybridPattern
            };
        }
    }

    /**
     * Execute sequential hybrid pattern
     * @private
     */
    async _executeSequentialHybrid(executionId, task, data, context) {
        const phases = [
            { pattern: 'conditional', agents: task.agents?.slice(0, 5) || [] },
            { pattern: 'swarm', agents: task.agents?.slice(5, 15) || [] },
            { pattern: 'nested', agents: task.agents?.slice(15) || [] }
        ];

        const phaseResults = [];
        let currentData = { ...data };

        for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            
            if (phase.agents.length === 0) continue;

            const phaseTask = {
                ...task,
                type: `${task.type}_phase_${i}`,
                agents: phase.agents,
                pattern: phase.pattern
            };

            const phaseResult = await this._executePatternPhase(
                phase.pattern,
                phaseTask,
                currentData,
                { ...context, phase: i, executionId }
            );

            // CRITICAL FIX: Extract agent results immediately using pattern-specific logic
            const extractedAgentResults = this._extractAgentResultsFromPattern(
                phase.pattern,
                phaseResult
            );
            
            logger.info('✅ Agent results extracted for phase', {
                phase: i,
                pattern: phase.pattern,
                extractedCount: extractedAgentResults.length,
                agentNames: extractedAgentResults.map(r => r.agentName)
            });

            // Store phase result with extracted agent results
            phaseResults.push({
                phase: i,
                pattern: phase.pattern,
                agentCount: phase.agents.length,
                result: phaseResult,
                extractedAgentResults,
                success: phaseResult.success
            });

            // Update data for next phase using extracted results
            if (phaseResult.success && extractedAgentResults.length > 0) {
                for (const agentResult of extractedAgentResults) {
                    if (agentResult.success && agentResult.result) {
                        currentData = this._mapAgentOutputToFields(
                            agentResult.agentName,
                            agentResult.result,
                            currentData
                        );
                    }
                }
                
                logger.info('🔄 Current data updated for next phase', {
                    phase: i,
                    hasPrStructure: !!currentData.prStructure,
                    hasMarketData: !!currentData.marketData,
                    hasVariants: !!currentData.variants,
                    variantsCount: currentData.variants?.length || 0,
                    currentDataKeys: Object.keys(currentData)
                });
            }

            // Handle phase failure
            if (!phaseResult.success && task.failureStrategy === 'abort') {
                break;
            }
        }

        return {
            success: phaseResults.some(p => p.success),
            phaseResults,
            finalData: currentData,
            phasesExecuted: phaseResults.length,
            hybridType: 'sequential'
        };
    }

    

    

    

    

    

    /**
     * Execute pattern phase with specific orchestrator
     * @private
     */
    async _executePatternPhase(pattern, task, data, context) {
        try {
            switch (pattern) {
                case 'conditional':
                    // Create temporary rule for execution
                    const ruleId = `temp_rule_${Date.now()}`;
                    const condition = this._createTaskCondition(task, data, context);
                    const agentChain = this._createAgentChain(task.agents || []);
                    
                    this.conditionalOrchestrator.registerCondition(ruleId, condition, agentChain);
                    const conditionalResult = await this.conditionalOrchestrator.executeConditional(ruleId, context, data);
                    this.conditionalOrchestrator.removeCondition(ruleId);
                    
                    return conditionalResult;

                case 'swarm':
                    const swarmId = `temp_swarm_${Date.now()}`;
                    const agents = this._prepareSwarmAgents(task.agents || []);
                    const behavior = { type: 'consensus', parameters: { threshold: 0.7 } };
                    
                    const swarmCreated = await this.swarmOrchestrator.createSwarm(swarmId, agents, behavior);
                    if (!swarmCreated.success) {
                        throw new Error(`Failed to create swarm: ${swarmCreated.error}`);
                    }
                    
                    const swarmResult = await this.swarmOrchestrator.executeSwarm(swarmId, task, data);
                    await this.swarmOrchestrator.terminateSwarm(swarmId);
                    
                    return swarmResult;

                case 'nested':
                    const treeId = `temp_tree_${Date.now()}`;
                    const rootNode = this._createOrchestrationTree(task, data, context);
                    
                    const treeCreated = this.nestedOrchestrator.createOrchestrationTree(treeId, rootNode);
                    if (!treeCreated.success) {
                        throw new Error(`Failed to create tree: ${treeCreated.error}`);
                    }
                    
                    const nestedResult = await this.nestedOrchestrator.executeTree(treeId, data, context);
                    await this.nestedOrchestrator.terminateTree(treeId);
                    
                    return nestedResult;

                default:
                    throw new Error(`Unknown pattern: ${pattern}`);
            }
        } catch (error) {
            logger.error('Pattern phase execution failed', {
                pattern,
                taskType: task.type,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                pattern
            };
        }
    }

    /**
     * Analyze task characteristics for adaptive pattern selection
     * @private
     */
    async _analyzeTaskCharacteristics(task, data, context) {
        const analysis = {
            complexity: 'medium',
            agentCount: task.agents?.length || 0,
            dataSize: JSON.stringify(data).length,
            hasConditions: !!(task.conditions || task.branches),
            requiresConsensus: !!task.requireConsensus,
            hasHierarchy: !!(task.hierarchy || task.phases),
            isRecursive: !!task.recursive,
            hasDecisions: !!task.decisions,
            timeConstraints: !!task.timeout,
            resourceConstraints: !!task.resourceLimits
        };

        // Calculate complexity score
        let complexityScore = 0;
        if (analysis.agentCount > 20) complexityScore += 0.3;
        if (analysis.dataSize > 10000) complexityScore += 0.2;
        if (analysis.hasConditions) complexityScore += 0.2;
        if (analysis.requiresConsensus) complexityScore += 0.2;
        if (analysis.hasHierarchy) complexityScore += 0.3;
        if (analysis.isRecursive) complexityScore += 0.4;
        if (analysis.hasDecisions) complexityScore += 0.3;

        if (complexityScore < 0.3) analysis.complexity = 'low';
        else if (complexityScore > 0.7) analysis.complexity = 'high';

        // Determine optimal patterns
        analysis.recommendedPatterns = [];
        if (analysis.hasConditions) analysis.recommendedPatterns.push('conditional');
        if (analysis.requiresConsensus || analysis.agentCount > 10) analysis.recommendedPatterns.push('swarm');
        if (analysis.hasHierarchy || analysis.isRecursive) analysis.recommendedPatterns.push('nested');

        return analysis;
    }

    /**
     * Select optimal pattern combination based on task analysis
     * @private
     */
    async _selectOptimalPatternCombination(taskAnalysis, task) {
        try {
            // Handle null/invalid taskAnalysis
            if (!taskAnalysis || typeof taskAnalysis !== 'object') {
                logger.warn('Invalid task analysis, using fallback');
                return {
                    strategy: this.combinationStrategies.CONDITIONAL_TO_SWARM,
                    score: 0.5,
                    confidence: 0.6
                };
            }

            const combinations = [];

            // Evaluate different combination strategies with error handling
            for (const strategy of Object.values(this.combinationStrategies)) {
                try {
                    const score = await this._scoreCombinationStrategy(strategy, taskAnalysis, task);
                    const confidence = this._calculateCombinationConfidence(strategy, taskAnalysis);
                    
                    combinations.push({
                        strategy,
                        score: isNaN(score) ? 0.5 : score,
                        confidence: isNaN(confidence) ? 0.5 : confidence
                    });
                } catch (strategyError) {
                    logger.warn('Strategy scoring failed, using default score', {
                        strategy,
                        error: strategyError.message
                    });
                    
                    // Add strategy with default score
                    combinations.push({
                        strategy,
                        score: 0.3,
                        confidence: 0.4
                    });
                }
            }

            // Ensure we have at least one combination
            if (combinations.length === 0) {
                logger.warn('No combinations available, using default');
                return {
                    strategy: this.combinationStrategies.CONDITIONAL_TO_SWARM,
                    score: 0.5,
                    confidence: 0.6
                };
            }

            // Select highest scoring combination with validation
            const optimal = combinations.reduce((best, current) => {
                const bestScore = isNaN(best.score) ? 0 : best.score;
                const currentScore = isNaN(current.score) ? 0 : current.score;
                return currentScore > bestScore ? current : best;
            });

            // Validate optimal combination
            if (!optimal || !optimal.strategy) {
                logger.warn('Invalid optimal combination, using fallback');
                return {
                    strategy: this.combinationStrategies.CONDITIONAL_TO_SWARM,
                    score: 0.5,
                    confidence: 0.6
                };
            }

            return optimal;

        } catch (error) {
            logger.error('Pattern combination selection failed completely', {
                error: error.message
            });
            
            // Return safe fallback
            return {
                strategy: this.combinationStrategies.CONDITIONAL_TO_SWARM,
                score: 0.5,
                confidence: 0.6
            };
        }
    }

    /**
     * Execute pattern combination based on strategy
     * @private
     */
    async _executePatternCombination(executionId, combination, task, data, context) {
        switch (combination.strategy) {
            case this.combinationStrategies.CONDITIONAL_TO_SWARM:
                return await this._executeConditionalToSwarm(executionId, task, data, context);

            case this.combinationStrategies.SWARM_TO_NESTED:
                return await this._executeSwarmToNested(executionId, task, data, context);

            case this.combinationStrategies.NESTED_TO_CONDITIONAL:
                return await this._executeNestedToConditional(executionId, task, data, context);

            case this.combinationStrategies.ALL_PATTERNS_PARALLEL:
                return await this._executeParallelHybrid(executionId, task, data, context);

            case this.combinationStrategies.PERFORMANCE_BASED:
                return await this._executePerformanceBasedCombination(executionId, task, data, context);

            default:
                return await this._executeSequentialHybrid(executionId, task, data, context);
        }
    }

    

    /**
     * Helper methods for pattern classification and utilities
     */
    _isConditionalAgent(agent) {
        // CRITICAL FIX: Use camelCase names to match agent registration
        const conditionalAgentTypes = [
            'qualityValidator', 'consistencyChecker', 'hallucinationDetector'
        ];
        const agentName = agent.name || agent;
        return conditionalAgentTypes.some(type => agentName.includes(type));
    }

    _isSwarmAgent(agent) {
        // CRITICAL FIX: Use camelCase names to match agent registration
        const swarmAgentTypes = [
            'confidenceScorer', 'crossMarketValidator', 'realTimeDataVerifier',
            'semanticValidator', 'sourceTracker', 'statisticalChecker'
        ];
        const agentName = agent.name || agent;
        return swarmAgentTypes.some(type => agentName.includes(type));
    }

    _isNestedAgent(agent) {
        // CRITICAL FIX: Use camelCase names to match agent registration
        const nestedAgentTypes = [
            'contentAnalyzer', 'marketResearcher', 'localizationEngine',
            'outputFormatter', 'pitchEmailExtractor'
        ];
        const agentName = agent.name || agent;
        return nestedAgentTypes.some(type => agentName.includes(type));
    }

    /**
     * Initialize adaptive strategies (simplified for sequential_hybrid only)
     * @private
     */
    async _initializeAdaptiveStrategies() {
        // Simplified - only sequential_hybrid pattern is used
        if (this.options.enableLogging) {
            logger.debug('Adaptive strategies initialized (sequential_hybrid only)');
        }
    }

    /**
     * Initialize pattern performance tracking
     * @private
     */
    async _initializePatternTracking() {
        const patterns = ['conditional', 'swarm', 'nested'];
        
        for (const pattern of patterns) {
            this.patternPerformanceHistory.set(pattern, {
                executions: 0,
                successes: 0,
                failures: 0,
                averageTime: 0,
                successRate: 0,
                lastExecution: null,
                performanceTrend: 'stable'
            });
        }

        if (this.options.enableLogging) {
            logger.debug('Pattern performance tracking initialized', {
                trackedPatterns: patterns.length
            });
        }
    }

    

    /**
     * Create task condition for conditional orchestration
     * @private
     */
    _createTaskCondition(task, data, context) {
        return {
            type: 'custom',
            description: `Hybrid task condition for ${task.type}`,
            evaluator: async (evalData, evalContext) => {
                // Default condition logic
                if (task.condition) {
                    return await task.condition(evalData, evalContext);
                }

                // Check data quality and availability
                return evalData && Object.keys(evalData).length > 0;
            },
            parameters: task.conditionParameters || {}
        };
    }

    /**
     * Create agent chain for orchestration
     * @private
     */
    _createAgentChain(agents) {
        return agents.map((agent, index) => ({
            name: agent.name || agent,
            method: agent.method || 'process',
            parameters: agent.parameters || {},
            failureStrategy: agent.failureStrategy || 'continue',
            timeout: agent.timeout || 30000
        }));
    }

    /**
     * Prepare agents for swarm execution
     * @private
     */
    _prepareSwarmAgents(agents) {
        return agents.map((agent, index) => ({
            name: agent.name || agent,
            method: agent.method || 'process',
            parameters: agent.parameters || {},
            swarmRole: agent.swarmRole || 'worker',
            specialization: agent.specialization || 'general',
            initialReputation: agent.reputation || 1.0
        }));
    }

    /**
     * Create orchestration tree for nested execution
     * @private
     */
    _createOrchestrationTree(task, data, context) {
        if (task.orchestrationTree) {
            return task.orchestrationTree;
        }

        // Auto-generate tree based on task structure
        const rootNode = {
            id: 'hybrid_root',
            type: 'sequential',
            children: []
        };

        // Group agents by category for nested execution
        const agentsByCategory = this._groupAgentsByCategory(task.agents || []);

        for (const [category, categoryAgents] of agentsByCategory.entries()) {
            const categoryNode = {
                id: `category_${category}`,
                type: categoryAgents.length > 3 ? 'parallel' : 'sequential',
                children: categoryAgents.map(agent => ({
                    id: `agent_${agent.name}`,
                    type: 'agent',
                    agentName: agent.name,
                    method: agent.method || 'process',
                    parameters: agent.parameters || {}
                }))
            };

            rootNode.children.push(categoryNode);
        }

        return rootNode;
    }

    /**
     * Group agents by category
     * @private
     */
    _groupAgentsByCategory(agents) {
        const categories = new Map();
        // CRITICAL FIX: Use camelCase names to match agent registration
        const categoryMappings = {
            content_generation: ['contentAnalyzer', 'localizationEngine', 'outputFormatter'],
            quality_assurance: ['qualityValidator', 'consistencyChecker', 'hallucinationDetector'],
            market_intelligence: ['marketResearcher', 'marketContextAnalyzer'],
            fact_checking: ['confidenceScorer', 'realTimeDataVerifier', 'statisticalChecker'],
            compliance: ['regulatoryComplianceChecker', 'industryStandardsValidator'],
            source_validation: ['sourceGroundingValidator', 'authorityScorer']
        };

        for (const agent of agents) {
            const agentName = agent.name || agent;
            let category = 'general';

            for (const [cat, types] of Object.entries(categoryMappings)) {
                if (types.some(type => agentName.includes(type))) {
                    category = cat;
                    break;
                }
            }

            if (!categories.has(category)) {
                categories.set(category, []);
            }
            categories.get(category).push(agent);
        }

        return categories;
    }

    /**
     * Merge results from multiple patterns
     * @private
     */
    async _mergePatternResults(patternResults) {
        if (patternResults.length === 0) return null;
        if (patternResults.length === 1) return patternResults[0].result;

        const merged = {};
        
        // Extract confidence values from nested result objects
        const weights = patternResults.map(r => {
            const result = r.result;
            // Handle nested result structure: { result: { confidence: X } }
            if (result && typeof result === 'object' && result.result && typeof result.result === 'object') {
                return result.result.confidence || 0.5;
            }
            // Handle direct confidence: { confidence: X }
            return result?.confidence || 0.5;
        });
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);

        // Weighted merge of results
        for (let i = 0; i < patternResults.length; i++) {
            const resultWrapper = patternResults[i].result;
            // Extract actual result from nested structure
            const result = (resultWrapper && typeof resultWrapper === 'object' && resultWrapper.result)
                ? resultWrapper.result
                : resultWrapper;
            const weight = totalWeight > 0 ? weights[i] / totalWeight : 1 / patternResults.length;

            if (typeof result === 'object' && result !== null) {
                for (const [key, value] of Object.entries(result)) {
                    if (typeof value === 'number') {
                        merged[key] = (merged[key] || 0) + value * weight;
                    } else if (!merged[key]) {
                        merged[key] = value;
                    }
                }
            }
        }

        merged.mergeMetadata = {
            sourcePatterns: patternResults.map(r => r.pattern),
            weights,
            mergedAt: new Date().toISOString()
        };

        return merged;
    }

    
    /**
     * Extract agent results from pattern-specific result structures
     * Each pattern returns results in a different format
     * @private
     */
    _extractAgentResultsFromPattern(patternType, patternResult) {
        logger.info('🔍 Extracting agent results from pattern', {
            patternType,
            resultKeys: Object.keys(patternResult || {})
        });
        
        switch(patternType) {
            case 'conditional':
                // Conditional returns: {success, ruleId, executionResults: {agentResults, finalData}}
                const conditionalResults = patternResult.executionResults?.agentResults || [];
                logger.info('✅ Conditional pattern extraction', {
                    found: conditionalResults.length,
                    path: 'executionResults.agentResults',
                    agentNames: conditionalResults.map(r => r.agentName)
                });
                return conditionalResults;
                
            case 'swarm':
                // Swarm returns: {success, bestSolution, allSolutions, consensusLevel}
                // Convert solutions to agent result format
                const swarmSolutions = patternResult.allSolutions || [];
                const swarmResults = swarmSolutions.map((solution, idx) => ({
                    agentIndex: idx,
                    agentName: solution.agentName || `swarm_agent_${idx}`,
                    success: true,
                    result: solution.result || solution,
                    method: 'process'
                }));
                logger.info('✅ Swarm pattern extraction', {
                    found: swarmResults.length,
                    path: 'allSolutions',
                    agentNames: swarmResults.map(r => r.agentName)
                });
                return swarmResults;
                
            case 'nested':
                // Nested returns: {success, result, executionPath, nodesExecuted}
                // Extract from execution path or result
                if (patternResult.result && typeof patternResult.result === 'object') {
                    // If result is an agent output, wrap it
                    const nestedResults = [{
                        agentIndex: 0,
                        agentName: 'nested_result',
                        success: true,
                        result: patternResult.result,
                        method: 'process'
                    }];
                    logger.info('✅ Nested pattern extraction', {
                        found: 1,
                        path: 'result (direct)'
                    });
                    return nestedResults;
                }
                logger.warn('⚠️ Nested pattern extraction found no results');
                return [];
                
            default:
                logger.warn('⚠️ Unknown pattern type for extraction', { patternType });
                return [];
        }
    }

    /**
     * Map agent output to expected field names for dependent agents
     * @private
     */
    _mapAgentOutputToFields(agentName, agentResult, currentData) {
        logger.debug('Mapping agent output', {
            agentName,
            resultKeys: Object.keys(agentResult || {}),
            currentDataKeys: Object.keys(currentData)
        });
        
        const agentNameLower = agentName.toLowerCase();
        
        // ContentAnalyzer: Map entire result to prStructure
        if (agentNameLower.includes('contentanalyzer') || agentNameLower.includes('content_analyzer')) {
            logger.info('📋 Mapping ContentAnalyzer → prStructure', {
                hasHeadline: !!agentResult.headline,
                hasQuotes: !!agentResult.quotes,
                hasStructure: !!agentResult.structure,
                confidence: agentResult.confidence
            });
            return {
                ...currentData,
                prStructure: agentResult
            };
        }
        
        // MarketResearcher: Map result to marketData
        if (agentNameLower.includes('marketresearcher') || agentNameLower.includes('market_researcher')) {
            logger.info('📊 Mapping MarketResearcher → marketData', {
                markets: Object.keys(agentResult || {})
            });
            return {
                ...currentData,
                marketData: agentResult
            };
        }
        
        // LocalizationEngine: Extract variant and add to variants array
        if (agentNameLower.includes('localizationengine') || agentNameLower.includes('localization_engine')) {
            const variants = currentData.variants || [];
            
            // Check multiple possible variant locations
            const variant = agentResult.variant || 
                           agentResult.localizedContent ||
                           agentResult.content ||
                           agentResult;
            
            if (variant && typeof variant === 'object') {
                variants.push(variant);
                logger.info('📝 Mapping LocalizationEngine → variants[]', {
                    variantCount: variants.length,
                    variantKeys: Object.keys(variant)
                });
            }
            
            return {
                ...currentData,
                variants
            };
        }
        
        // QualityValidator: Merge validation results
        if (agentNameLower.includes('qualityvalidator') || agentNameLower.includes('quality_validator')) {
            logger.info('✓ Mapping QualityValidator → validation', {
                hasValidation: !!agentResult.validation,
                hasScore: !!agentResult.score
            });
            return {
                ...currentData,
                validation: agentResult.validation || agentResult,
                qualityScore: agentResult.score || agentResult.overallScore
            };
        }
        
        // OutputFormatter: Merge formatted output
        if (agentNameLower.includes('outputformatter') || agentNameLower.includes('output_formatter')) {
            logger.info('📄 Mapping OutputFormatter → files/formats', {
                hasFiles: !!agentResult.files,
                hasFormats: !!agentResult.formats
            });
            return {
                ...currentData,
                files: agentResult.files || currentData.files || [],
                formats: agentResult.formats || currentData.formats || {}
            };
        }
        
        // Default: Merge all fields
        logger.debug('Default field merge', { agentName });
        return {
            ...currentData,
            ...agentResult
        };
    }


    /**
     * Calculate solution similarity
     * @private
     */
    _calculateSolutionSimilarity(solution1, solution2) {
        try {
            if (typeof solution1 === 'string' && typeof solution2 === 'string') {
                return this._calculateTextSimilarity(solution1, solution2);
            }

            if (typeof solution1 === 'object' && typeof solution2 === 'object') {
                return this._calculateObjectSimilarity(solution1, solution2);
            }

            return solution1 === solution2 ? 1.0 : 0.0;
        } catch (error) {
            return 0.0;
        }
    }

    /**
     * Calculate text similarity
     * @private
     */
    _calculateTextSimilarity(text1, text2) {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        
        const intersection = words1.filter(word => words2.includes(word));
        const union = [...new Set([...words1, ...words2])];
        
        return intersection.length / union.length;
    }

    /**
     * Calculate object similarity
     * @private
     */
    _calculateObjectSimilarity(obj1, obj2) {
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        const allKeys = [...new Set([...keys1, ...keys2])];
        
        let matchingKeys = 0;
        for (const key of allKeys) {
            if (obj1[key] === obj2[key]) {
                matchingKeys++;
            }
        }
        
        return matchingKeys / allKeys.length;
    }

    

    /**
     * Update hybrid execution metrics
     * @private
     */
    _updateHybridMetrics(task, result, startTime) {
        this.metrics.totalHybridExecutions++;
        
        if (result.success) {
            this.metrics.successfulHybridExecutions++;
        }

        const executionTime = Date.now() - startTime;
        this.metrics.averageExecutionTime = 
            (this.metrics.averageExecutionTime * (this.metrics.totalHybridExecutions - 1) + executionTime) / 
            this.metrics.totalHybridExecutions;

        // Update pattern combination metrics
        const combination = result.combinationStrategy || 'unknown';
        const currentCount = this.metrics.patternCombinations.get(combination) || 0;
        this.metrics.patternCombinations.set(combination, currentCount + 1);

        // Update pattern performance history
        if (result.patternResults) {
            for (const patternResult of result.patternResults) {
                this._updatePatternPerformance(patternResult.pattern, patternResult.success, patternResult.executionTime);
            }
        }
    }

    /**
     * Update pattern performance history
     * @private
     */
    _updatePatternPerformance(pattern, success, executionTime) {
        const history = this.patternPerformanceHistory.get(pattern);
        if (!history) return;

        history.executions++;
        history.lastExecution = Date.now();

        if (success) {
            history.successes++;
        } else {
            history.failures++;
        }

        history.successRate = history.successes / history.executions;

        if (executionTime) {
            history.averageTime = 
                (history.averageTime * (history.executions - 1) + executionTime) / history.executions;
        }

        // Update performance trend
        if (history.executions >= 5) {
            const recentSuccessRate = history.successes / history.executions;
            if (recentSuccessRate > 0.8) history.performanceTrend = 'improving';
            else if (recentSuccessRate < 0.6) history.performanceTrend = 'declining';
            else history.performanceTrend = 'stable';
        }
    }

    /**
     * Learn from execution for adaptive improvement (simplified for sequential_hybrid)
     * @private
     */
    async _learnFromExecution(executionId, task, result) {
        if (!this.options.enablePatternLearning) return;

        const execution = this.hybridExecutions.get(executionId);
        if (!execution) return;

        // Simplified learning for sequential_hybrid only
        const insights = {
            taskType: task.type,
            hybridPattern: 'sequential_hybrid',
            success: result.success,
            executionTime: result.totalExecutionTime,
            agentCount: task.agents?.length || 0,
            timestamp: new Date().toISOString()
        };

        if (this.options.enableLogging) {
            logger.debug('Learning from hybrid execution (sequential_hybrid)', {
                executionId,
                insights
            });
        }
    }

    /**
     * Get hybrid execution history
     */
    getExecutionHistory(limit = 100) {
        const executions = Array.from(this.hybridExecutions.values())
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);

        return executions.map(exec => ({
            executionId: exec.executionId,
            taskType: exec.task.type,
            hybridPattern: exec.task.hybridPattern,
            status: exec.status,
            executionTime: exec.executionTime,
            success: exec.result?.success,
            timestamp: new Date(exec.startTime).toISOString()
        }));
    }

    /**
     * Get hybrid orchestration metrics
     */
    getMetrics() {
        const successRate = this.metrics.totalHybridExecutions > 0 ? 
            this.metrics.successfulHybridExecutions / this.metrics.totalHybridExecutions : 0;

        return {
            ...this.metrics,
            successRate: (successRate * 100).toFixed(2) + '%',
            patternCombinations: Object.fromEntries(this.metrics.patternCombinations),
            patternPerformance: Object.fromEntries(this.patternPerformanceHistory),
            adaptiveStrategies: Object.fromEntries(this.adaptiveStrategies),
            executionHistorySize: this.hybridExecutions.size
        };
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            type: 'HybridOrchestrationEngine',
            version: '1.0.0',
            activeExecutions: Array.from(this.hybridExecutions.values())
                .filter(exec => exec.status === 'executing').length,
            totalExecutions: this.metrics.totalHybridExecutions,
            successRate: this.metrics.totalHybridExecutions > 0 ? 
                (this.metrics.successfulHybridExecutions / this.metrics.totalHybridExecutions * 100).toFixed(2) + '%' : '0%',
            availablePatterns: ['sequential_hybrid'],
            metrics: this.getMetrics(),
            configuration: {
                enableAdaptivePatternSelection: this.options.enableAdaptivePatternSelection,
                enablePatternLearning: this.options.enablePatternLearning,
                enableDynamicReconfiguration: this.options.enableDynamicReconfiguration,
                maxHybridComplexity: this.options.maxHybridComplexity
            }
        };
    }

    /**
     * Shutdown hybrid orchestration engine
     */
    async shutdown() {
        try {
            // Shutdown all underlying orchestrators
            await Promise.all([
                this.conditionalOrchestrator.shutdown(),
                this.swarmOrchestrator.shutdown(),
                this.nestedOrchestrator.shutdown()
            ]);

            // Clear execution state
            this.hybridExecutions.clear();
            this.patternPerformanceHistory.clear();
            this.adaptiveStrategies.clear();

            if (this.options.enableLogging) {
                logger.info('HybridOrchestrationEngine shutdown completed');
            }

        } catch (error) {
            logger.error('Hybrid orchestration engine shutdown failed', {
                error: error.message
            });
        }
    }
}

module.exports = HybridOrchestrationEngine;