/**
 * Nested Orchestration Patterns
 * 
 * Implements nested and hierarchical orchestration patterns for the Strands framework,
 * enabling complex multi-level agent coordination with parent-child relationships,
 * recursive execution, and hierarchical decision-making.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');

class NestedOrchestrationManager {
    constructor(options = {}) {
        this.options = {
            maxNestingDepth: options.maxNestingDepth || 5,
            executionTimeout: options.executionTimeout || 60000,
            enableRecursion: options.enableRecursion !== false,
            enableHierarchicalDecisions: options.enableHierarchicalDecisions !== false,
            enableLogging: options.enableLogging !== false,
            ...options
        };

        // Store bridge manager reference for real agent execution
        this.bridgeManager = options.bridgeManager || null;

        this.orchestrationTrees = new Map();
        this.executionStack = [];
        this.hierarchyMetrics = {
            totalTrees: 0,
            activeTrees: 0,
            maxDepthReached: 0,
            averageExecutionTime: 0,
            recursiveExecutions: 0
        };

        this.nodeTypes = {
            SEQUENTIAL: 'sequential',
            PARALLEL: 'parallel',
            CONDITIONAL: 'conditional',
            LOOP: 'loop',
            RECURSIVE: 'recursive',
            DECISION: 'decision',
            MERGE: 'merge',
            SPLIT: 'split'
        };

        if (this.options.enableLogging) {
            logger.info('NestedOrchestrationManager initialized', {
                maxNestingDepth: this.options.maxNestingDepth,
                enableRecursion: this.options.enableRecursion,
                enableHierarchicalDecisions: this.options.enableHierarchicalDecisions
            });
        }
    }

    /**
     * Create a nested orchestration tree
     * @param {string} treeId - Unique identifier for the tree
     * @param {Object} rootNode - Root node configuration
     * @returns {Object} Tree creation result
     */
    createOrchestrationTree(treeId, rootNode) {
        try {
            const tree = {
                id: treeId,
                rootNode: this._validateAndEnhanceNode(rootNode, 0),
                state: {
                    phase: 'created',
                    currentDepth: 0,
                    maxDepthReached: 0,
                    executionPath: [],
                    activeNodes: new Set()
                },
                metrics: {
                    created: new Date().toISOString(),
                    totalExecutions: 0,
                    successfulExecutions: 0,
                    averageExecutionTime: 0,
                    nodeExecutionCounts: new Map()
                },
                context: {
                    globalData: {},
                    nodeResults: new Map(),
                    decisionHistory: [],
                    recursionStack: []
                }
            };

            this.orchestrationTrees.set(treeId, tree);
            this.hierarchyMetrics.totalTrees++;
            this.hierarchyMetrics.activeTrees++;

            if (this.options.enableLogging) {
                logger.info('Orchestration tree created', {
                    treeId,
                    rootNodeType: rootNode.type,
                    estimatedDepth: this._estimateTreeDepth(rootNode)
                });
            }

            return {
                success: true,
                treeId,
                rootNodeType: rootNode.type,
                estimatedDepth: this._estimateTreeDepth(rootNode)
            };

        } catch (error) {
            logger.error('Failed to create orchestration tree', {
                treeId,
                error: error.message
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute a nested orchestration tree
     * @param {string} treeId - Tree to execute
     * @param {Object} initialData - Initial execution data
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Execution results
     */
    async executeTree(treeId, initialData = {}, context = {}) {
        const startTime = Date.now();

        try {
            const tree = this.orchestrationTrees.get(treeId);
            if (!tree) {
                throw new Error(`Orchestration tree '${treeId}' not found`);
            }

            if (this.options.enableLogging) {
                logger.info('Starting tree execution', {
                    treeId,
                    initialDataKeys: Object.keys(initialData),
                    contextKeys: Object.keys(context)
                });
            }

            // Initialize execution context
            tree.state.phase = 'executing';
            tree.state.executionPath = [];
            tree.state.activeNodes.clear();
            tree.context.globalData = { ...initialData };
            tree.context.nodeResults.clear();
            tree.context.decisionHistory = [];
            tree.context.recursionStack = [];

            // Execute root node
            const executionResult = await this._executeNode(
                tree.rootNode,
                tree.context.globalData,
                {
                    ...context,
                    treeId,
                    depth: 0,
                    parentPath: []
                },
                tree
            );

            // Update tree state
            tree.state.phase = 'completed';
            tree.metrics.totalExecutions++;
            if (executionResult.success) {
                tree.metrics.successfulExecutions++;
            }

            const executionTime = Date.now() - startTime;
            tree.metrics.averageExecutionTime = 
                (tree.metrics.averageExecutionTime * (tree.metrics.totalExecutions - 1) + executionTime) / 
                tree.metrics.totalExecutions;

            // Update global metrics
            this.hierarchyMetrics.maxDepthReached = Math.max(
                this.hierarchyMetrics.maxDepthReached,
                tree.state.maxDepthReached
            );

            const result = {
                success: executionResult.success,
                treeId,
                result: executionResult.result,
                executionPath: tree.state.executionPath,
                maxDepthReached: tree.state.maxDepthReached,
                nodesExecuted: tree.state.executionPath.length,
                decisionHistory: tree.context.decisionHistory,
                executionTime,
                metadata: {
                    timestamp: new Date().toISOString(),
                    recursiveExecutions: tree.context.recursionStack.length,
                    nodeExecutionCounts: Object.fromEntries(tree.metrics.nodeExecutionCounts)
                }
            };

            if (this.options.enableLogging) {
                logger.info('Tree execution completed', {
                    treeId,
                    success: result.success,
                    nodesExecuted: result.nodesExecuted,
                    maxDepth: result.maxDepthReached,
                    executionTime
                });
            }

            return result;

        } catch (error) {
            logger.error('Tree execution failed', {
                treeId,
                error: error.message
            });

            return {
                success: false,
                treeId,
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Execute a single node in the orchestration tree
     * @private
     */
    async _executeNode(node, data, context, tree) {
        const nodeStartTime = Date.now();
        const nodePath = [...context.parentPath, node.id || `node_${context.depth}`];

        try {
            // Check depth limits
            if (context.depth >= this.options.maxNestingDepth) {
                throw new Error(`Maximum nesting depth ${this.options.maxNestingDepth} exceeded`);
            }

            // Update tree state
            tree.state.currentDepth = context.depth;
            tree.state.maxDepthReached = Math.max(tree.state.maxDepthReached, context.depth);
            tree.state.executionPath.push({
                nodeId: node.id,
                nodeType: node.type,
                depth: context.depth,
                timestamp: new Date().toISOString(),
                path: nodePath.join('.')
            });

            // Update node execution count
            const nodeKey = `${node.type}_${node.id || 'anonymous'}`;
            const currentCount = tree.metrics.nodeExecutionCounts.get(nodeKey) || 0;
            tree.metrics.nodeExecutionCounts.set(nodeKey, currentCount + 1);

            if (this.options.enableLogging) {
                logger.debug('Executing node', {
                    treeId: tree.id,
                    nodeId: node.id,
                    nodeType: node.type,
                    depth: context.depth,
                    path: nodePath.join('.')
                });
            }

            let result;

            // Execute based on node type
            switch (node.type) {
                case this.nodeTypes.SEQUENTIAL:
                    result = await this._executeSequentialNode(node, data, context, tree);
                    break;

                case this.nodeTypes.PARALLEL:
                    result = await this._executeParallelNode(node, data, context, tree);
                    break;

                case this.nodeTypes.CONDITIONAL:
                    result = await this._executeConditionalNode(node, data, context, tree);
                    break;

                case this.nodeTypes.LOOP:
                    result = await this._executeLoopNode(node, data, context, tree);
                    break;

                case this.nodeTypes.RECURSIVE:
                    result = await this._executeRecursiveNode(node, data, context, tree);
                    break;

                case this.nodeTypes.DECISION:
                    result = await this._executeDecisionNode(node, data, context, tree);
                    break;

                case this.nodeTypes.MERGE:
                    result = await this._executeMergeNode(node, data, context, tree);
                    break;

                case this.nodeTypes.SPLIT:
                    result = await this._executeSplitNode(node, data, context, tree);
                    break;

                default:
                    // Leaf node - execute agent
                    result = await this._executeAgentNode(node, data, context, tree);
                    break;
            }

            const nodeExecutionTime = Date.now() - nodeStartTime;

            // Store node result
            tree.context.nodeResults.set(nodePath.join('.'), {
                result,
                executionTime: nodeExecutionTime,
                timestamp: new Date().toISOString()
            });

            if (this.options.enableLogging) {
                logger.debug('Node execution completed', {
                    treeId: tree.id,
                    nodeId: node.id,
                    nodeType: node.type,
                    success: result.success,
                    executionTime: nodeExecutionTime
                });
            }

            return result;

        } catch (error) {
            logger.error('Node execution failed', {
                treeId: tree.id,
                nodeId: node.id,
                nodeType: node.type,
                depth: context.depth,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                nodeId: node.id,
                nodeType: node.type,
                depth: context.depth
            };
        }
    }

    /**
     * Execute sequential node (children execute in order)
     * @private
     */
    async _executeSequentialNode(node, data, context, tree) {
        const results = [];
        let currentData = { ...data };

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            
            const childResult = await this._executeNode(child, currentData, {
                ...context,
                depth: context.depth + 1,
                parentPath: [...context.parentPath, node.id || `seq_${context.depth}`],
                sequenceIndex: i
            }, tree);

            results.push(childResult);

            if (!childResult.success && node.failureStrategy === 'abort') {
                break;
            }

            // Update data for next child if transformation specified
            if (node.dataFlow && childResult.success) {
                currentData = await this._transformNodeData(currentData, childResult.result, node.dataFlow);
            }
        }

        return {
            success: results.length > 0 && (node.requireAllSuccess ? 
                results.every(r => r.success) : 
                results.some(r => r.success)
            ),
            results,
            finalData: currentData,
            executedChildren: results.length
        };
    }

    /**
     * Execute parallel node (children execute simultaneously)
     * @private
     */
    async _executeParallelNode(node, data, context, tree) {
        const childPromises = node.children.map((child, index) => 
            this._executeNode(child, data, {
                ...context,
                depth: context.depth + 1,
                parentPath: [...context.parentPath, node.id || `par_${context.depth}`],
                parallelIndex: index
            }, tree)
        );

        const results = await Promise.allSettled(childPromises);
        const successfulResults = results
            .filter(r => r.status === 'fulfilled' && r.value.success)
            .map(r => r.value);

        const failedResults = results
            .filter(r => r.status === 'rejected' || !r.value.success)
            .map(r => r.reason || r.value);

        return {
            success: successfulResults.length > 0 && (node.requireAllSuccess ? 
                failedResults.length === 0 : 
                successfulResults.length >= (node.minimumSuccess || 1)
            ),
            successfulResults,
            failedResults,
            totalChildren: node.children.length,
            successfulChildren: successfulResults.length
        };
    }

    /**
     * Execute conditional node (execute children based on condition)
     * @private
     */
    async _executeConditionalNode(node, data, context, tree) {
        // Evaluate condition
        const conditionResult = await this._evaluateNodeCondition(node.condition, data, context);
        
        // Record decision
        tree.context.decisionHistory.push({
            nodeId: node.id,
            condition: node.condition.description || 'unnamed_condition',
            result: conditionResult.passed,
            timestamp: new Date().toISOString(),
            depth: context.depth
        });

        // Select execution path
        const selectedChildren = conditionResult.passed ? 
            (node.trueChildren || []) : 
            (node.falseChildren || []);

        if (selectedChildren.length === 0) {
            return {
                success: true,
                conditionResult,
                selectedPath: conditionResult.passed ? 'true' : 'false',
                executedChildren: 0
            };
        }

        // Execute selected children
        const childResults = [];
        for (const child of selectedChildren) {
            const childResult = await this._executeNode(child, data, {
                ...context,
                depth: context.depth + 1,
                parentPath: [...context.parentPath, node.id || `cond_${context.depth}`],
                conditionPath: conditionResult.passed ? 'true' : 'false'
            }, tree);

            childResults.push(childResult);

            if (!childResult.success && node.failureStrategy === 'abort') {
                break;
            }
        }

        return {
            success: childResults.length > 0 && childResults.some(r => r.success),
            conditionResult,
            selectedPath: conditionResult.passed ? 'true' : 'false',
            childResults,
            executedChildren: childResults.length
        };
    }

    /**
     * Execute loop node (repeat children based on condition)
     * @private
     */
    async _executeLoopNode(node, data, context, tree) {
        const iterations = [];
        let currentData = { ...data };
        let iterationCount = 0;
        const maxIterations = node.maxIterations || 10;

        while (iterationCount < maxIterations) {
            // Check loop condition
            const continueLoop = await this._evaluateNodeCondition(
                node.condition, 
                currentData, 
                { ...context, iteration: iterationCount }
            );

            if (!continueLoop.passed) {
                break;
            }

            // Execute loop body
            const iterationResults = [];
            for (const child of node.children) {
                const childResult = await this._executeNode(child, currentData, {
                    ...context,
                    depth: context.depth + 1,
                    parentPath: [...context.parentPath, node.id || `loop_${context.depth}`],
                    iteration: iterationCount
                }, tree);

                iterationResults.push(childResult);

                if (!childResult.success && node.failureStrategy === 'abort') {
                    break;
                }
            }

            iterations.push({
                iteration: iterationCount,
                results: iterationResults,
                success: iterationResults.some(r => r.success)
            });

            // Update data for next iteration
            if (node.dataFlow && iterationResults.some(r => r.success)) {
                const successfulResults = iterationResults.filter(r => r.success);
                currentData = await this._transformNodeData(
                    currentData, 
                    successfulResults[0].result, 
                    node.dataFlow
                );
            }

            iterationCount++;
        }

        return {
            success: iterations.length > 0 && iterations.some(iter => iter.success),
            iterations,
            totalIterations: iterationCount,
            finalData: currentData,
            terminationReason: iterationCount >= maxIterations ? 'max_iterations' : 'condition_failed'
        };
    }

    /**
     * Execute recursive node
     * @private
     */
    async _executeRecursiveNode(node, data, context, tree) {
        if (!this.options.enableRecursion) {
            throw new Error('Recursion is disabled');
        }

        // Check recursion depth
        const recursionDepth = tree.context.recursionStack.length;
        if (recursionDepth >= (node.maxRecursionDepth || 3)) {
            return {
                success: false,
                error: 'Maximum recursion depth exceeded',
                recursionDepth
            };
        }

        // Add to recursion stack
        tree.context.recursionStack.push({
            nodeId: node.id,
            depth: context.depth,
            timestamp: new Date().toISOString()
        });

        this.hierarchyMetrics.recursiveExecutions++;

        try {
            // Check base case
            const baseCase = await this._evaluateNodeCondition(
                node.baseCase, 
                data, 
                { ...context, recursionDepth }
            );

            if (baseCase.passed) {
                // Execute base case
                const baseResult = await this._executeNode(node.baseNode, data, {
                    ...context,
                    depth: context.depth + 1,
                    parentPath: [...context.parentPath, node.id || `rec_${context.depth}`],
                    recursionType: 'base'
                }, tree);

                tree.context.recursionStack.pop();
                return baseResult;
            }

            // Execute recursive case
            const recursiveResults = [];
            for (const child of node.children) {
                const childResult = await this._executeNode(child, data, {
                    ...context,
                    depth: context.depth + 1,
                    parentPath: [...context.parentPath, node.id || `rec_${context.depth}`],
                    recursionType: 'recursive'
                }, tree);

                recursiveResults.push(childResult);

                // If child produces data for recursion, recurse
                if (childResult.success && node.recursionDataTransform) {
                    const recursionData = await this._transformNodeData(
                        data, 
                        childResult.result, 
                        node.recursionDataTransform
                    );

                    const recursiveResult = await this._executeRecursiveNode(node, recursionData, context, tree);
                    recursiveResults.push(recursiveResult);
                }
            }

            tree.context.recursionStack.pop();

            return {
                success: recursiveResults.some(r => r.success),
                recursiveResults,
                recursionDepth,
                baseCase: baseCase.passed
            };

        } catch (error) {
            tree.context.recursionStack.pop();
            throw error;
        }
    }

    /**
     * Execute decision node (hierarchical decision making)
     * @private
     */
    async _executeDecisionNode(node, data, context, tree) {
        if (!this.options.enableHierarchicalDecisions) {
            throw new Error('Hierarchical decisions are disabled');
        }

        const decisionOptions = node.options || [];
        const decisionResults = [];

        // Evaluate all decision options
        for (let i = 0; i < decisionOptions.length; i++) {
            const option = decisionOptions[i];
            
            try {
                const optionScore = await this._evaluateDecisionOption(option, data, context);
                
                decisionResults.push({
                    optionIndex: i,
                    optionId: option.id,
                    score: optionScore.score,
                    confidence: optionScore.confidence,
                    criteria: optionScore.criteria,
                    viable: optionScore.score >= (option.threshold || 0.5)
                });

            } catch (error) {
                logger.error('Decision option evaluation failed', {
                    treeId: tree.id,
                    optionIndex: i,
                    error: error.message
                });

                decisionResults.push({
                    optionIndex: i,
                    optionId: option.id,
                    score: 0,
                    confidence: 0,
                    viable: false,
                    error: error.message
                });
            }
        }

        // Select best viable option
        const viableOptions = decisionResults.filter(r => r.viable);
        if (viableOptions.length === 0) {
            return {
                success: false,
                error: 'No viable decision options',
                decisionResults
            };
        }

        const bestOption = viableOptions.reduce((best, current) => 
            current.score > best.score ? current : best
        );

        const selectedOption = decisionOptions[bestOption.optionIndex];

        // Record decision
        tree.context.decisionHistory.push({
            nodeId: node.id,
            selectedOption: selectedOption.id,
            score: bestOption.score,
            confidence: bestOption.confidence,
            alternativeCount: viableOptions.length - 1,
            timestamp: new Date().toISOString()
        });

        // Execute selected option's children
        if (selectedOption.children && selectedOption.children.length > 0) {
            const executionResults = [];
            
            for (const child of selectedOption.children) {
                const childResult = await this._executeNode(child, data, {
                    ...context,
                    depth: context.depth + 1,
                    parentPath: [...context.parentPath, node.id || `dec_${context.depth}`],
                    selectedOption: selectedOption.id
                }, tree);

                executionResults.push(childResult);
            }

            return {
                success: executionResults.some(r => r.success),
                selectedOption: selectedOption.id,
                decisionScore: bestOption.score,
                executionResults,
                decisionResults,
                viableOptionsCount: viableOptions.length
            };
        }

        return {
            success: true,
            selectedOption: selectedOption.id,
            decisionScore: bestOption.score,
            decisionResults,
            viableOptionsCount: viableOptions.length
        };
    }

    /**
     * Execute merge node (combine results from multiple sources)
     * @private
     */
    async _executeMergeNode(node, data, context, tree) {
        const sourceResults = [];

        // Collect results from specified sources
        for (const source of node.sources) {
            if (source.type === 'node_result') {
                const nodeResult = tree.context.nodeResults.get(source.path);
                if (nodeResult) {
                    sourceResults.push({
                        source: source.path,
                        result: nodeResult.result,
                        weight: source.weight || 1.0
                    });
                }
            } else if (source.type === 'data_field') {
                const fieldValue = this._getNestedValue(data, source.path);
                if (fieldValue !== undefined) {
                    sourceResults.push({
                        source: source.path,
                        result: fieldValue,
                        weight: source.weight || 1.0
                    });
                }
            }
        }

        if (sourceResults.length === 0) {
            return {
                success: false,
                error: 'No source results available for merge'
            };
        }

        // Merge results based on strategy
        const mergedResult = await this._mergeResults(sourceResults, node.mergeStrategy || 'weighted');

        return {
            success: true,
            result: mergedResult,
            sourceCount: sourceResults.length,
            mergeStrategy: node.mergeStrategy || 'weighted'
        };
    }

    /**
     * Execute split node (distribute data to multiple paths)
     * @private
     */
    async _executeSplitNode(node, data, context, tree) {
        const splitResults = [];

        // Split data based on strategy
        const dataSplits = await this._splitData(data, node.splitStrategy || 'equal', node.children.length);

        // Execute each child with its data split
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const splitData = dataSplits[i] || data;

            const childResult = await this._executeNode(child, splitData, {
                ...context,
                depth: context.depth + 1,
                parentPath: [...context.parentPath, node.id || `split_${context.depth}`],
                splitIndex: i
            }, tree);

            splitResults.push({
                splitIndex: i,
                result: childResult,
                dataSize: JSON.stringify(splitData).length
            });
        }

        return {
            success: splitResults.some(r => r.result.success),
            splitResults,
            totalSplits: dataSplits.length,
            successfulSplits: splitResults.filter(r => r.result.success).length
        };
    }

    /**
     * Execute agent node (leaf node with actual agent) through bridge manager
     * @private
     */
    async _executeAgentNode(node, data, context, tree) {
        try {
            // Use bridge manager for real agent execution if available
            if (this.bridgeManager && this.bridgeManager.isStrandsAvailable()) {
                const result = await this.bridgeManager.executeAgent(
                    node.agentName,
                    node.method || 'process',
                    [data],
                    {
                        timeout: node.timeout || 60000,
                        context,
                        executionPath: context.parentPath.join('.'),
                        treeId: tree.id,
                        ...node.parameters
                    }
                );

                return {
                    success: true,
                    result: result,
                    agentName: node.agentName,
                    method: node.method || 'process',
                    executionPath: context.parentPath.join('.'),
                    executionMode: 'bridge'
                };
            } else {
                // Fallback to mock result if bridge not available
                if (this.options.enableLogging) {
                    logger.warn('Bridge manager not available, using mock agent execution', {
                        agentName: node.agentName,
                        treeId: tree.id
                    });
                }

                return {
                    success: true,
                    result: {
                        agentName: node.agentName,
                        method: node.method || 'process',
                        processedData: data,
                        context,
                        executionPath: context.parentPath.join('.'),
                        mockExecution: true
                    },
                    agentName: node.agentName,
                    method: node.method || 'process',
                    executionMode: 'mock'
                };
            }
        } catch (error) {
            logger.error('Agent node execution failed', {
                agentName: node.agentName,
                treeId: tree.id,
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                agentName: node.agentName,
                method: node.method || 'process',
                executionPath: context.parentPath.join('.')
            };
        }
    }

    /**
     * Validate and enhance node configuration
     * @private
     */
    _validateAndEnhanceNode(node, depth) {
        const enhancedNode = {
            ...node,
            id: node.id || `node_${depth}_${Date.now()}`,
            depth,
            validated: true,
            enhancedAt: new Date().toISOString()
        };

        // Validate children recursively
        if (node.children && Array.isArray(node.children)) {
            enhancedNode.children = node.children.map(child => 
                this._validateAndEnhanceNode(child, depth + 1)
            );
        }

        // Validate node-specific requirements
        switch (node.type) {
            case this.nodeTypes.CONDITIONAL:
                if (!node.condition) {
                    throw new Error(`Conditional node ${node.id} missing condition`);
                }
                break;

            case this.nodeTypes.LOOP:
                if (!node.condition) {
                    throw new Error(`Loop node ${node.id} missing condition`);
                }
                break;

            case this.nodeTypes.RECURSIVE:
                if (!node.baseCase) {
                    throw new Error(`Recursive node ${node.id} missing base case`);
                }
                break;

            case this.nodeTypes.DECISION:
                if (!node.options || node.options.length === 0) {
                    throw new Error(`Decision node ${node.id} missing options`);
                }
                break;
        }

        return enhancedNode;
    }

    /**
     * Estimate tree depth for planning
     * @private
     */
    _estimateTreeDepth(node, currentDepth = 0) {
        if (!node.children || node.children.length === 0) {
            return currentDepth;
        }

        const childDepths = node.children.map(child => 
            this._estimateTreeDepth(child, currentDepth + 1)
        );

        return Math.max(...childDepths);
    }

    /**
     * Evaluate node condition
     * @private
     */
    async _evaluateNodeCondition(condition, data, context) {
        try {
            if (typeof condition.evaluator === 'function') {
                const passed = await condition.evaluator(data, context);
                return {
                    passed,
                    type: 'custom_evaluator',
                    timestamp: new Date().toISOString()
                };
            }

            // Built-in condition types
            if (condition.type === 'data_threshold') {
                const value = this._getNestedValue(data, condition.field);
                const passed = this._compareValues(value, condition.operator, condition.value);
                return { passed, type: 'data_threshold', value, threshold: condition.value };
            }

            if (condition.type === 'iteration_limit') {
                const passed = context.iteration < condition.limit;
                return { passed, type: 'iteration_limit', iteration: context.iteration, limit: condition.limit };
            }

            return { passed: true, type: 'default' };

        } catch (error) {
            logger.error('Node condition evaluation failed', {
                error: error.message
            });
            return { passed: false, error: error.message };
        }
    }

    /**
     * Evaluate decision option
     * @private
     */
    async _evaluateDecisionOption(option, data, context) {
        try {
            let score = 0;
            let confidence = 1.0;
            const criteria = {};

            // Evaluate criteria
            for (const criterion of option.criteria || []) {
                const criterionResult = await this._evaluateCriterion(criterion, data, context);
                criteria[criterion.name] = criterionResult;
                score += criterionResult.score * (criterion.weight || 1.0);
                confidence *= criterionResult.confidence;
            }

            // Normalize score
            const totalWeight = (option.criteria || []).reduce((sum, c) => sum + (c.weight || 1.0), 0);
            const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;

            return {
                score: normalizedScore,
                confidence,
                criteria
            };

        } catch (error) {
            logger.error('Decision option evaluation failed', {
                optionId: option.id,
                error: error.message
            });

            return {
                score: 0,
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Evaluate a single criterion for decision making
     * @private
     */
    async _evaluateCriterion(criterion, data, context) {
        try {
            if (typeof criterion.evaluator === 'function') {
                const result = await criterion.evaluator(data, context);
                return {
                    score: result.score || 0,
                    confidence: result.confidence || 1.0,
                    details: result.details || {}
                };
            }

            // Built-in criterion types
            if (criterion.type === 'data_quality') {
                const value = this._getNestedValue(data, criterion.field);
                const score = value !== undefined ? 1.0 : 0.0;
                return { score, confidence: 1.0, value };
            }

            if (criterion.type === 'threshold') {
                const value = this._getNestedValue(data, criterion.field);
                const passed = this._compareValues(value, criterion.operator, criterion.threshold);
                return { score: passed ? 1.0 : 0.0, confidence: 1.0, value, threshold: criterion.threshold };
            }

            return { score: 0.5, confidence: 0.5 };

        } catch (error) {
            logger.error('Criterion evaluation failed', {
                criterionName: criterion.name,
                error: error.message
            });

            return {
                score: 0,
                confidence: 0,
                error: error.message
            };
        }
    }

    /**
     * Transform data between nodes
     * @private
     */
    async _transformNodeData(currentData, nodeResult, transformConfig) {
        try {
            if (typeof transformConfig === 'function') {
                return await transformConfig(currentData, nodeResult);
            }

            if (transformConfig.type === 'merge') {
                return { ...currentData, ...nodeResult };
            }

            if (transformConfig.type === 'extract') {
                const extracted = {};
                for (const key of transformConfig.keys) {
                    if (nodeResult[key] !== undefined) {
                        extracted[key] = nodeResult[key];
                    }
                }
                return { ...currentData, ...extracted };
            }

            if (transformConfig.type === 'replace') {
                return nodeResult;
            }

            return currentData;

        } catch (error) {
            logger.error('Node data transformation failed', {
                error: error.message,
                transformType: transformConfig.type || 'unknown'
            });
            return currentData;
        }
    }

    /**
     * Merge results from multiple sources
     * @private
     */
    async _mergeResults(sourceResults, strategy) {
        try {
            switch (strategy) {
                case 'weighted':
                    return this._weightedMerge(sourceResults);
                
                case 'concatenate':
                    return this._concatenateMerge(sourceResults);
                
                case 'best_score':
                    return this._bestScoreMerge(sourceResults);
                
                case 'consensus':
                    return this._consensusMerge(sourceResults);
                
                default:
                    return this._simpleMerge(sourceResults);
            }

        } catch (error) {
            logger.error('Result merge failed', {
                strategy,
                sourceCount: sourceResults.length,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Split data for parallel processing
     * @private
     */
    async _splitData(data, strategy, splitCount) {
        try {
            switch (strategy) {
                case 'equal':
                    return this._equalSplit(data, splitCount);
                
                case 'by_field':
                    return this._fieldBasedSplit(data, splitCount);
                
                case 'random':
                    return this._randomSplit(data, splitCount);
                
                default:
                    // Default: duplicate data for all splits
                    return Array(splitCount).fill(data);
            }

        } catch (error) {
            logger.error('Data split failed', {
                strategy,
                splitCount,
                error: error.message
            });
            return [data]; // Fallback to single split
        }
    }

    /**
     * Utility methods for data operations
     */
    _getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    _compareValues(value1, operator, value2) {
        switch (operator) {
            case 'gt': return value1 > value2;
            case 'gte': return value1 >= value2;
            case 'lt': return value1 < value2;
            case 'lte': return value1 <= value2;
            case 'eq': return value1 === value2;
            case 'ne': return value1 !== value2;
            case 'contains': return String(value1).includes(value2);
            default: return false;
        }
    }

    _weightedMerge(sourceResults) {
        const totalWeight = sourceResults.reduce((sum, source) => sum + source.weight, 0);
        const merged = {};

        for (const source of sourceResults) {
            const weight = source.weight / totalWeight;
            if (typeof source.result === 'object') {
                for (const [key, value] of Object.entries(source.result)) {
                    if (typeof value === 'number') {
                        merged[key] = (merged[key] || 0) + value * weight;
                    } else {
                        merged[key] = value; // Take last value for non-numeric
                    }
                }
            }
        }

        return merged;
    }

    _concatenateMerge(sourceResults) {
        const merged = [];
        for (const source of sourceResults) {
            if (Array.isArray(source.result)) {
                merged.push(...source.result);
            } else {
                merged.push(source.result);
            }
        }
        return merged;
    }

    _bestScoreMerge(sourceResults) {
        return sourceResults.reduce((best, current) =>
            (current.result.score || 0) > (best.result.score || 0) ? current : best
        ).result;
    }

    _consensusMerge(sourceResults) {
        // Simple consensus: return most common result
        const resultCounts = new Map();
        
        for (const source of sourceResults) {
            const key = JSON.stringify(source.result);
            resultCounts.set(key, (resultCounts.get(key) || 0) + source.weight);
        }

        const mostCommon = Array.from(resultCounts.entries())
            .reduce((best, current) => current[1] > best[1] ? current : best);

        return JSON.parse(mostCommon[0]);
    }

    _simpleMerge(sourceResults) {
        const merged = {};
        for (const source of sourceResults) {
            Object.assign(merged, source.result);
        }
        return merged;
    }

    _equalSplit(data, splitCount) {
        if (Array.isArray(data)) {
            const chunkSize = Math.ceil(data.length / splitCount);
            const splits = [];
            for (let i = 0; i < splitCount; i++) {
                splits.push(data.slice(i * chunkSize, (i + 1) * chunkSize));
            }
            return splits;
        }
        
        // For objects, duplicate the data
        return Array(splitCount).fill(data);
    }

    _fieldBasedSplit(data, splitCount) {
        // Simple field-based split - can be enhanced
        return Array(splitCount).fill(data);
    }

    _randomSplit(data, splitCount) {
        if (Array.isArray(data)) {
            const shuffled = [...data].sort(() => Math.random() - 0.5);
            return this._equalSplit(shuffled, splitCount);
        }
        
        return Array(splitCount).fill(data);
    }

    /**
     * Get orchestration tree
     */
    getTree(treeId) {
        return this.orchestrationTrees.get(treeId);
    }

    /**
     * List all active trees
     */
    getActiveTrees() {
        return Array.from(this.orchestrationTrees.values()).filter(tree =>
            tree.state.phase !== 'terminated'
        );
    }

    /**
     * Get tree execution history
     */
    getTreeHistory(treeId) {
        const tree = this.orchestrationTrees.get(treeId);
        return tree ? {
            executionPath: tree.state.executionPath,
            decisionHistory: tree.context.decisionHistory,
            nodeResults: Object.fromEntries(tree.context.nodeResults)
        } : null;
    }

    /**
     * Terminate an orchestration tree
     */
    async terminateTree(treeId) {
        const tree = this.orchestrationTrees.get(treeId);
        if (!tree) {
            return false;
        }

        tree.state.phase = 'terminated';
        tree.state.terminatedAt = new Date().toISOString();
        this.hierarchyMetrics.activeTrees--;

        if (this.options.enableLogging) {
            logger.info('Orchestration tree terminated', {
                treeId,
                totalExecutions: tree.metrics.totalExecutions,
                maxDepthReached: tree.state.maxDepthReached
            });
        }

        return true;
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            type: 'NestedOrchestrationManager',
            version: '1.0.0',
            activeTrees: this.hierarchyMetrics.activeTrees,
            totalTrees: this.hierarchyMetrics.totalTrees,
            maxDepthReached: this.hierarchyMetrics.maxDepthReached,
            recursiveExecutions: this.hierarchyMetrics.recursiveExecutions,
            metrics: this.hierarchyMetrics,
            configuration: {
                maxNestingDepth: this.options.maxNestingDepth,
                enableRecursion: this.options.enableRecursion,
                enableHierarchicalDecisions: this.options.enableHierarchicalDecisions,
                executionTimeout: this.options.executionTimeout
            }
        };
    }

    /**
     * Shutdown orchestrator
     */
    async shutdown() {
        // Terminate all active trees
        for (const treeId of this.orchestrationTrees.keys()) {
            await this.terminateTree(treeId);
        }

        this.orchestrationTrees.clear();
        this.executionStack = [];

        if (this.options.enableLogging) {
            logger.info('NestedOrchestrationManager shutdown completed');
        }
    }
}

module.exports = NestedOrchestrationManager;