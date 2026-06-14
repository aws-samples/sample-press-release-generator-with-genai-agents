/**
 * Swarm Intelligence Orchestration Pattern
 * 
 * Implements swarm-based coordination patterns for the Strands framework,
 * enabling multiple agents to work together using collective intelligence,
 * consensus mechanisms, and distributed decision-making.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');

class SwarmIntelligenceOrchestrator {
    constructor(options = {}) {
        this.options = {
            maxSwarmSize: options.maxSwarmSize || 50, // Increased for 37-agent system
            consensusThreshold: options.consensusThreshold || 0.7,
            communicationTimeout: options.communicationTimeout || 15000,
            enablePheromoneTrails: options.enablePheromoneTrails !== false,
            enableCollectiveLearning: options.enableCollectiveLearning !== false,
            enableLogging: options.enableLogging !== false,
            ...options
        };

        // Store bridge manager reference for real agent execution
        this.bridgeManager = options.bridgeManager || null;

        this.swarms = new Map();
        this.pheromoneTrails = new Map();
        this.collectiveKnowledge = new Map();
        this.swarmMetrics = {
            totalSwarms: 0,
            activeSwarms: 0,
            consensusAchieved: 0,
            consensusFailed: 0,
            averageSwarmSize: 0,
            averageConsensusTime: 0
        };

        this.swarmBehaviors = {
            CONSENSUS: 'consensus',
            COMPETITION: 'competition',
            COLLABORATION: 'collaboration',
            EXPLORATION: 'exploration',
            EXPLOITATION: 'exploitation'
        };

        if (this.options.enableLogging) {
            logger.info('SwarmIntelligenceOrchestrator initialized', {
                maxSwarmSize: this.options.maxSwarmSize,
                consensusThreshold: this.options.consensusThreshold,
                enablePheromoneTrails: this.options.enablePheromoneTrails
            });
        }
    }

    /**
     * Create a new swarm of agents
     * @param {string} swarmId - Unique identifier for the swarm
     * @param {Array} agents - Agent configurations for the swarm
     * @param {Object} behavior - Swarm behavior configuration
     * @returns {Promise<Object>} Swarm creation result
     */
    async createSwarm(swarmId, agents, behavior = {}) {
        try {
            if (agents.length > this.options.maxSwarmSize) {
                throw new Error(`Swarm size ${agents.length} exceeds maximum ${this.options.maxSwarmSize}`);
            }

            const swarm = {
                id: swarmId,
                agents: agents.map((agent, index) => ({
                    ...agent,
                    swarmIndex: index,
                    fitness: 0,
                    contribution: 0,
                    reputation: 1.0,
                    lastActive: new Date().toISOString()
                })),
                behavior: {
                    type: behavior.type || this.swarmBehaviors.CONSENSUS,
                    parameters: behavior.parameters || {},
                    adaptationRate: behavior.adaptationRate || 0.1,
                    explorationRate: behavior.explorationRate || 0.2
                },
                state: {
                    phase: 'initialized',
                    iteration: 0,
                    bestSolution: null,
                    consensusLevel: 0,
                    convergenceHistory: []
                },
                communication: {
                    messageQueue: [],
                    broadcastHistory: [],
                    peerConnections: new Map()
                },
                metrics: {
                    created: new Date().toISOString(),
                    totalExecutions: 0,
                    successfulExecutions: 0,
                    averageExecutionTime: 0,
                    bestFitness: 0
                }
            };

            this.swarms.set(swarmId, swarm);
            this.swarmMetrics.totalSwarms++;
            this.swarmMetrics.activeSwarms++;

            if (this.options.enableLogging) {
                logger.info('Swarm created', {
                    swarmId,
                    agentCount: agents.length,
                    behaviorType: swarm.behavior.type
                });
            }

            return {
                success: true,
                swarmId,
                agentCount: agents.length,
                behavior: swarm.behavior.type
            };

        } catch (error) {
            logger.error('Failed to create swarm', {
                swarmId,
                error: error.message
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Execute swarm-based processing
     * @param {string} swarmId - Swarm to execute
     * @param {Object} task - Task configuration
     * @param {Object} data - Input data
     * @returns {Promise<Object>} Swarm execution results
     */
    async executeSwarm(swarmId, task, data = {}) {
        const startTime = Date.now();

        try {
            const swarm = this.swarms.get(swarmId);
            if (!swarm) {
                throw new Error(`Swarm '${swarmId}' not found`);
            }

            if (this.options.enableLogging) {
                logger.info('Starting swarm execution', {
                    swarmId,
                    taskType: task.type,
                    agentCount: swarm.agents.length,
                    behaviorType: swarm.behavior.type
                });
            }

            swarm.state.phase = 'executing';
            swarm.state.iteration++;

            let result;

            // Execute based on swarm behavior
            switch (swarm.behavior.type) {
                case this.swarmBehaviors.CONSENSUS:
                    result = await this._executeConsensusSwarm(swarm, task, data);
                    break;

                case this.swarmBehaviors.COMPETITION:
                    result = await this._executeCompetitiveSwarm(swarm, task, data);
                    break;

                case this.swarmBehaviors.COLLABORATION:
                    result = await this._executeCollaborativeSwarm(swarm, task, data);
                    break;

                case this.swarmBehaviors.EXPLORATION:
                    result = await this._executeExplorationSwarm(swarm, task, data);
                    break;

                case this.swarmBehaviors.EXPLOITATION:
                    result = await this._executeExploitationSwarm(swarm, task, data);
                    break;

                default:
                    throw new Error(`Unknown swarm behavior: ${swarm.behavior.type}`);
            }

            // Update swarm state
            swarm.state.phase = 'completed';
            swarm.metrics.totalExecutions++;
            if (result.success) {
                swarm.metrics.successfulExecutions++;
            }

            const executionTime = Date.now() - startTime;
            swarm.metrics.averageExecutionTime = 
                (swarm.metrics.averageExecutionTime * (swarm.metrics.totalExecutions - 1) + executionTime) / 
                swarm.metrics.totalExecutions;

            // Update pheromone trails if enabled
            if (this.options.enablePheromoneTrails && result.success) {
                await this._updatePheromoneTrails(swarmId, task, result);
            }

            // Update collective knowledge if enabled
            if (this.options.enableCollectiveLearning && result.success) {
                await this._updateCollectiveKnowledge(swarmId, task, result);
            }

            const finalResult = {
                success: result.success,
                swarmId,
                behaviorType: swarm.behavior.type,
                agentsParticipated: result.agentsParticipated || swarm.agents.length,
                consensusLevel: result.consensusLevel || 0,
                bestSolution: result.bestSolution,
                allSolutions: result.allSolutions || [],
                convergenceData: result.convergenceData,
                executionTime,
                swarmMetrics: {
                    iteration: swarm.state.iteration,
                    totalExecutions: swarm.metrics.totalExecutions,
                    successRate: swarm.metrics.successfulExecutions / swarm.metrics.totalExecutions
                },
                metadata: {
                    timestamp: new Date().toISOString(),
                    taskType: task.type,
                    dataSize: JSON.stringify(data).length
                }
            };

            if (this.options.enableLogging) {
                logger.info('Swarm execution completed', {
                    swarmId,
                    success: result.success,
                    consensusLevel: result.consensusLevel,
                    executionTime
                });
            }

            return finalResult;

        } catch (error) {
            logger.error('Swarm execution failed', {
                swarmId,
                error: error.message
            });

            return {
                success: false,
                swarmId,
                error: error.message,
                executionTime: Date.now() - startTime
            };
        }
    }

    /**
     * Execute consensus-based swarm
     * @private
     */
    async _executeConsensusSwarm(swarm, task, data) {
        const agentResults = [];
        const startTime = Date.now();

        // Execute all agents in parallel
        const executionPromises = swarm.agents.map(async (agent, index) => {
            try {
                const agentResult = await this._executeSwarmAgent(agent, task, data, {
                    swarmId: swarm.id,
                    agentIndex: index,
                    totalAgents: swarm.agents.length
                });

                return {
                    agentIndex: index,
                    agentName: agent.name,
                    success: true,
                    result: agentResult,
                    fitness: this._calculateAgentFitness(agentResult, task),
                    confidence: agentResult.confidence || 0.5
                };

            } catch (error) {
                logger.error('Agent execution failed in consensus swarm', {
                    swarmId: swarm.id,
                    agentIndex: index,
                    agentName: agent.name,
                    error: error.message
                });

                return {
                    agentIndex: index,
                    agentName: agent.name,
                    success: false,
                    error: error.message,
                    fitness: 0,
                    confidence: 0
                };
            }
        });

        const results = await Promise.allSettled(executionPromises);
        const validResults = results
            .filter(r => r.status === 'fulfilled' && r.value.success)
            .map(r => r.value);

        if (validResults.length === 0) {
            return {
                success: false,
                error: 'No agents produced valid results',
                agentsParticipated: 0
            };
        }

        // Calculate consensus
        const consensus = await this._calculateConsensus(validResults, task);
        
        // Update agent reputations based on consensus alignment
        this._updateAgentReputations(swarm, validResults, consensus);

        return {
            success: consensus.level >= this.options.consensusThreshold,
            consensusLevel: consensus.level,
            bestSolution: consensus.solution,
            allSolutions: validResults.map(r => r.result),
            agentsParticipated: validResults.length,
            convergenceData: {
                consensusTime: Date.now() - startTime,
                iterations: 1,
                agreementMatrix: consensus.agreementMatrix
            }
        };
    }

    /**
     * Execute competitive swarm
     * @private
     */
    async _executeCompetitiveSwarm(swarm, task, data) {
        const agentResults = [];

        // Execute agents in competition
        for (const agent of swarm.agents) {
            try {
                const agentResult = await this._executeSwarmAgent(agent, task, data, {
                    swarmId: swarm.id,
                    competitionMode: true
                });

                const fitness = this._calculateAgentFitness(agentResult, task);
                
                agentResults.push({
                    agentName: agent.name,
                    result: agentResult,
                    fitness,
                    success: true
                });

                // Update agent fitness in swarm
                agent.fitness = fitness;

            } catch (error) {
                logger.error('Agent failed in competitive swarm', {
                    swarmId: swarm.id,
                    agentName: agent.name,
                    error: error.message
                });

                agentResults.push({
                    agentName: agent.name,
                    success: false,
                    error: error.message,
                    fitness: 0
                });
            }
        }

        // Select best performing agent
        const validResults = agentResults.filter(r => r.success);
        if (validResults.length === 0) {
            return {
                success: false,
                error: 'No agents produced valid results'
            };
        }

        const bestResult = validResults.reduce((best, current) => 
            current.fitness > best.fitness ? current : best
        );

        return {
            success: true,
            bestSolution: bestResult.result,
            winner: bestResult.agentName,
            allSolutions: validResults.map(r => r.result),
            fitnessScores: validResults.map(r => ({ agent: r.agentName, fitness: r.fitness })),
            agentsParticipated: validResults.length
        };
    }

    /**
     * Execute collaborative swarm
     * @private
     */
    async _executeCollaborativeSwarm(swarm, task, data) {
        const phases = task.phases || ['analyze', 'process', 'validate'];
        const phaseResults = [];
        let currentData = { ...data };

        for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
            const phase = phases[phaseIndex];
            const phaseAgents = this._selectAgentsForPhase(swarm.agents, phase, task);

            if (this.options.enableLogging) {
                logger.debug('Executing collaborative phase', {
                    swarmId: swarm.id,
                    phase,
                    phaseIndex,
                    agentCount: phaseAgents.length
                });
            }

            // Execute phase agents in parallel
            const phasePromises = phaseAgents.map(agent => 
                this._executeSwarmAgent(agent, { ...task, phase }, currentData, {
                    swarmId: swarm.id,
                    phase,
                    phaseIndex
                })
            );

            const phaseExecutionResults = await Promise.allSettled(phasePromises);
            const validPhaseResults = phaseExecutionResults
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);

            if (validPhaseResults.length === 0) {
                return {
                    success: false,
                    error: `No valid results in phase: ${phase}`,
                    completedPhases: phaseIndex
                };
            }

            // Merge phase results
            const mergedPhaseResult = await this._mergePhaseResults(validPhaseResults, phase, task);
            
            phaseResults.push({
                phase,
                phaseIndex,
                agentsParticipated: validPhaseResults.length,
                result: mergedPhaseResult,
                success: true
            });

            // Update data for next phase
            currentData = { ...currentData, ...mergedPhaseResult };
        }

        return {
            success: true,
            phaseResults,
            finalResult: currentData,
            agentsParticipated: swarm.agents.length,
            phasesCompleted: phases.length
        };
    }

    /**
     * Execute exploration swarm (for discovering optimal solutions)
     * @private
     */
    async _executeExplorationSwarm(swarm, task, data) {
        const explorationResults = [];
        const explorationStrategies = task.strategies || ['random', 'guided', 'hybrid'];

        for (const strategy of explorationStrategies) {
            const strategyAgents = this._selectAgentsForStrategy(swarm.agents, strategy);
            
            if (this.options.enableLogging) {
                logger.debug('Executing exploration strategy', {
                    swarmId: swarm.id,
                    strategy,
                    agentCount: strategyAgents.length
                });
            }

            const strategyPromises = strategyAgents.map(agent => 
                this._executeSwarmAgent(agent, { ...task, strategy }, data, {
                    swarmId: swarm.id,
                    explorationStrategy: strategy
                })
            );

            const strategyResults = await Promise.allSettled(strategyPromises);
            const validStrategyResults = strategyResults
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);

            if (validStrategyResults.length > 0) {
                explorationResults.push({
                    strategy,
                    results: validStrategyResults,
                    bestFitness: Math.max(...validStrategyResults.map(r => 
                        this._calculateAgentFitness(r, task)
                    ))
                });
            }
        }

        if (explorationResults.length === 0) {
            return {
                success: false,
                error: 'No exploration strategies produced valid results'
            };
        }

        // Find best exploration result
        const bestExploration = explorationResults.reduce((best, current) => 
            current.bestFitness > best.bestFitness ? current : best
        );

        return {
            success: true,
            bestSolution: bestExploration.results[0],
            explorationResults,
            bestStrategy: bestExploration.strategy,
            agentsParticipated: explorationResults.reduce((sum, exp) => sum + exp.results.length, 0)
        };
    }

    /**
     * Execute exploitation swarm (for optimizing known solutions)
     * @private
     */
    async _executeExploitationSwarm(swarm, task, data) {
        // Get best known solution from pheromone trails or collective knowledge
        const bestKnownSolution = await this._getBestKnownSolution(swarm.id, task);
        
        if (!bestKnownSolution) {
            // Fall back to exploration if no known solution
            return await this._executeExplorationSwarm(swarm, task, data);
        }

        // Select top-performing agents based on reputation
        const topAgents = swarm.agents
            .sort((a, b) => b.reputation - a.reputation)
            .slice(0, Math.ceil(swarm.agents.length * 0.7)); // Top 70% of agents

        if (this.options.enableLogging) {
            logger.debug('Executing exploitation with top agents', {
                swarmId: swarm.id,
                totalAgents: swarm.agents.length,
                selectedAgents: topAgents.length
            });
        }

        // Execute top agents with best known solution as starting point
        const exploitationPromises = topAgents.map(agent => 
            this._executeSwarmAgent(agent, task, {
                ...data,
                seedSolution: bestKnownSolution
            }, {
                swarmId: swarm.id,
                exploitationMode: true
            })
        );

        const results = await Promise.allSettled(exploitationPromises);
        const validResults = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        if (validResults.length === 0) {
            return {
                success: false,
                error: 'No agents produced valid exploitation results'
            };
        }

        // Find best improvement
        const bestResult = validResults.reduce((best, current) => {
            const currentFitness = this._calculateAgentFitness(current, task);
            const bestFitness = this._calculateAgentFitness(best, task);
            return currentFitness > bestFitness ? current : best;
        });

        return {
            success: true,
            bestSolution: bestResult,
            improvement: this._calculateImprovement(bestKnownSolution, bestResult, task),
            allSolutions: validResults,
            agentsParticipated: validResults.length,
            seedSolution: bestKnownSolution
        };
    }

    /**
     * Calculate consensus among agent results
     * @private
     */
    async _calculateConsensus(agentResults, task) {
        const solutions = agentResults.map(r => r.result);
        const confidences = agentResults.map(r => r.confidence);
        
        // Calculate pairwise agreement
        const agreementMatrix = [];
        for (let i = 0; i < solutions.length; i++) {
            agreementMatrix[i] = [];
            for (let j = 0; j < solutions.length; j++) {
                if (i === j) {
                    agreementMatrix[i][j] = 1.0;
                } else {
                    agreementMatrix[i][j] = await this._calculateSolutionSimilarity(
                        solutions[i], 
                        solutions[j], 
                        task
                    );
                }
            }
        }

        // Calculate overall consensus level
        const totalPairs = solutions.length * (solutions.length - 1) / 2;
        let totalAgreement = 0;
        
        for (let i = 0; i < solutions.length; i++) {
            for (let j = i + 1; j < solutions.length; j++) {
                totalAgreement += agreementMatrix[i][j];
            }
        }

        const consensusLevel = totalPairs > 0 ? totalAgreement / totalPairs : 1.0;

        // Select consensus solution (weighted by confidence and agreement)
        let bestSolutionIndex = 0;
        let bestScore = 0;

        for (let i = 0; i < solutions.length; i++) {
            const agreementScore = agreementMatrix[i].reduce((sum, val) => sum + val, 0) / solutions.length;
            const weightedScore = agreementScore * confidences[i];
            
            if (weightedScore > bestScore) {
                bestScore = weightedScore;
                bestSolutionIndex = i;
            }
        }

        return {
            level: consensusLevel,
            solution: solutions[bestSolutionIndex],
            agreementMatrix,
            selectedIndex: bestSolutionIndex,
            weightedScore: bestScore
        };
    }

    /**
     * Calculate similarity between two solutions
     * @private
     */
    async _calculateSolutionSimilarity(solution1, solution2, task) {
        try {
            // Basic similarity calculation - can be enhanced based on task type
            if (typeof solution1 === 'string' && typeof solution2 === 'string') {
                return this._calculateTextSimilarity(solution1, solution2);
            }

            if (typeof solution1 === 'object' && typeof solution2 === 'object') {
                return this._calculateObjectSimilarity(solution1, solution2);
            }

            return solution1 === solution2 ? 1.0 : 0.0;

        } catch (error) {
            logger.error('Solution similarity calculation failed', {
                error: error.message
            });
            return 0.0;
        }
    }

    /**
     * Calculate text similarity using simple metrics
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
     * Execute a single agent in swarm context through bridge manager
     * @private
     */
    async _executeSwarmAgent(agent, task, data, swarmContext) {
        try {
            // Use bridge manager for real agent execution if available
            if (this.bridgeManager && this.bridgeManager.isStrandsAvailable()) {
                const result = await this.bridgeManager.executeAgent(
                    agent.name,
                    task.method || agent.method || 'process',
                    [data],
                    {
                        timeout: agent.timeout || 15000,
                        swarmContext,
                        ...agent.parameters
                    }
                );

                return {
                    agentName: agent.name,
                    method: task.method || agent.method || 'process',
                    result: result,
                    confidence: result.confidence || 0.8,
                    executionTime: result.executionTime || 1000,
                    swarmContext,
                    executionMode: 'bridge'
                };
            } else {
                // Fallback to mock result if bridge not available
                if (this.options.enableLogging) {
                    logger.warn('Bridge manager not available, using mock swarm agent execution', {
                        agentName: agent.name,
                        swarmId: swarmContext.swarmId
                    });
                }

                return {
                    agentName: agent.name,
                    method: task.method || 'process',
                    result: `Processed by ${agent.name} in swarm ${swarmContext.swarmId}`,
                    confidence: Math.random() * 0.4 + 0.6, // Random confidence between 0.6-1.0
                    executionTime: Math.random() * 1000 + 500, // Random time 500-1500ms
                    swarmContext,
                    executionMode: 'mock'
                };
            }
        } catch (error) {
            logger.error('Swarm agent execution failed', {
                agentName: agent.name,
                swarmId: swarmContext.swarmId,
                error: error.message
            });

            return {
                agentName: agent.name,
                success: false,
                error: error.message,
                confidence: 0,
                executionTime: 0,
                swarmContext
            };
        }
    }

    /**
     * Calculate agent fitness based on result quality
     * @private
     */
    _calculateAgentFitness(agentResult, task) {
        // Basic fitness calculation - can be enhanced based on task requirements
        let fitness = 0;

        if (agentResult.confidence) {
            fitness += agentResult.confidence * 0.4;
        }

        if (agentResult.executionTime) {
            // Faster execution gets higher fitness (up to 0.3)
            const timeScore = Math.max(0, 1 - (agentResult.executionTime / 10000));
            fitness += timeScore * 0.3;
        }

        if (agentResult.result && typeof agentResult.result === 'string') {
            // Longer, more detailed results get higher fitness (up to 0.3)
            const lengthScore = Math.min(1, agentResult.result.length / 1000);
            fitness += lengthScore * 0.3;
        }

        return Math.min(1.0, fitness);
    }

    /**
     * Update agent reputations based on consensus alignment
     * @private
     */
    _updateAgentReputations(swarm, agentResults, consensus) {
        const adaptationRate = swarm.behavior.adaptationRate || 0.1;

        for (const agentResult of agentResults) {
            const agent = swarm.agents[agentResult.agentIndex];
            if (!agent) continue;

            // Calculate how well this agent's result aligns with consensus
            const alignment = this._calculateSolutionSimilarity(
                agentResult.result,
                consensus.solution,
                {}
            );

            // Update reputation using exponential moving average
            agent.reputation = agent.reputation * (1 - adaptationRate) + alignment * adaptationRate;
            agent.contribution += alignment;
            agent.lastActive = new Date().toISOString();
        }
    }

    /**
     * Select agents for a specific phase in collaborative execution
     * @private
     */
    _selectAgentsForPhase(agents, phase, task) {
        // Simple selection based on agent capabilities
        // In a real implementation, this would use agent metadata and capabilities
        const phaseAgentMap = {
            analyze: ['ContentAnalyzerAgent', 'MarketContextAnalyzer', 'ComprehensiveDataExtractorAgent'],
            process: ['LocalizationEngine', 'MarketResearcherAgent', 'MultiFacetTrendAnalyzer'],
            validate: ['QualityValidator', 'ConsistencyChecker', 'FactualConsistencyChecker']
        };

        const preferredAgentTypes = phaseAgentMap[phase] || [];
        
        // Select agents that match the phase requirements
        const selectedAgents = agents.filter(agent => 
            preferredAgentTypes.some(type => agent.name.includes(type)) ||
            preferredAgentTypes.length === 0
        );

        // If no specific agents found, use all agents
        return selectedAgents.length > 0 ? selectedAgents : agents;
    }

    /**
     * Select agents for exploration strategy
     * @private
     */
    _selectAgentsForStrategy(agents, strategy) {
        switch (strategy) {
            case 'random':
                return agents.sort(() => Math.random() - 0.5).slice(0, Math.ceil(agents.length / 3));
            
            case 'guided':
                return agents.sort((a, b) => b.reputation - a.reputation).slice(0, Math.ceil(agents.length / 2));
            
            case 'hybrid':
            default:
                return agents;
        }
    }

    /**
     * Merge results from a collaborative phase
     * @private
     */
    async _mergePhaseResults(phaseResults, phase, task) {
        // Simple merge strategy - can be enhanced based on phase type
        const merged = {};

        for (const result of phaseResults) {
            if (typeof result === 'object') {
                Object.assign(merged, result);
            }
        }

        merged.phaseMetadata = {
            phase,
            contributingAgents: phaseResults.length,
            mergedAt: new Date().toISOString()
        };

        return merged;
    }

    /**
     * Update pheromone trails based on successful executions
     * @private
     */
    async _updatePheromoneTrails(swarmId, task, result) {
        if (!this.options.enablePheromoneTrails) return;

        const trailKey = `${swarmId}_${task.type}`;
        
        if (!this.pheromoneTrails.has(trailKey)) {
            this.pheromoneTrails.set(trailKey, {
                strength: 0,
                lastUpdated: new Date().toISOString(),
                successCount: 0,
                solutions: []
            });
        }

        const trail = this.pheromoneTrails.get(trailKey);
        trail.strength += result.consensusLevel || 0.5;
        trail.successCount++;
        trail.lastUpdated = new Date().toISOString();
        
        if (result.bestSolution) {
            trail.solutions.push({
                solution: result.bestSolution,
                fitness: this._calculateAgentFitness(result.bestSolution, task),
                timestamp: new Date().toISOString()
            });

            // Keep only top 10 solutions
            trail.solutions = trail.solutions
                .sort((a, b) => b.fitness - a.fitness)
                .slice(0, 10);
        }
    }

    /**
     * Update collective knowledge base
     * @private
     */
    async _updateCollectiveKnowledge(swarmId, task, result) {
        if (!this.options.enableCollectiveLearning) return;

        const knowledgeKey = `${task.type}_patterns`;
        
        if (!this.collectiveKnowledge.has(knowledgeKey)) {
            this.collectiveKnowledge.set(knowledgeKey, {
                patterns: [],
                successfulStrategies: new Map(),
                commonFailures: new Map()
            });
        }

        const knowledge = this.collectiveKnowledge.get(knowledgeKey);
        
        // Record successful patterns
        if (result.success && result.bestSolution) {
            knowledge.patterns.push({
                solution: result.bestSolution,
                swarmId,
                timestamp: new Date().toISOString(),
                fitness: this._calculateAgentFitness(result.bestSolution, task)
            });

            // Update successful strategies
            const strategyKey = `${swarmId}_${task.type}`;
            const currentCount = knowledge.successfulStrategies.get(strategyKey) || 0;
            knowledge.successfulStrategies.set(strategyKey, currentCount + 1);
        }

        // Keep only recent patterns (last 100)
        if (knowledge.patterns.length > 100) {
            knowledge.patterns = knowledge.patterns
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 100);
        }
    }

    /**
     * Get best known solution from collective knowledge
     * @private
     */
    async _getBestKnownSolution(swarmId, task) {
        const knowledgeKey = `${task.type}_patterns`;
        const knowledge = this.collectiveKnowledge.get(knowledgeKey);
        
        if (!knowledge || knowledge.patterns.length === 0) {
            return null;
        }

        // Return the highest fitness solution
        const bestPattern = knowledge.patterns.reduce((best, current) =>
            current.fitness > best.fitness ? current : best
        );

        return bestPattern.solution;
    }

    /**
     * Calculate improvement between solutions
     * @private
     */
    _calculateImprovement(oldSolution, newSolution, task) {
        const oldFitness = this._calculateAgentFitness(oldSolution, task);
        const newFitness = this._calculateAgentFitness(newSolution, task);
        
        return {
            absolute: newFitness - oldFitness,
            relative: oldFitness > 0 ? (newFitness - oldFitness) / oldFitness : 0,
            improved: newFitness > oldFitness
        };
    }

    /**
     * Get swarm information
     */
    getSwarm(swarmId) {
        return this.swarms.get(swarmId);
    }

    /**
     * List all active swarms
     */
    getActiveSwarms() {
        return Array.from(this.swarms.values()).filter(swarm =>
            swarm.state.phase !== 'terminated'
        );
    }

    /**
     * Get pheromone trails
     */
    getPheromoneTrails() {
        return Object.fromEntries(this.pheromoneTrails);
    }

    /**
     * Get collective knowledge
     */
    getCollectiveKnowledge() {
        return Object.fromEntries(this.collectiveKnowledge);
    }

    /**
     * Terminate a swarm
     */
    async terminateSwarm(swarmId) {
        const swarm = this.swarms.get(swarmId);
        if (!swarm) {
            return false;
        }

        swarm.state.phase = 'terminated';
        swarm.state.terminatedAt = new Date().toISOString();
        this.swarmMetrics.activeSwarms--;

        if (this.options.enableLogging) {
            logger.info('Swarm terminated', {
                swarmId,
                totalExecutions: swarm.metrics.totalExecutions,
                successRate: swarm.metrics.successfulExecutions / swarm.metrics.totalExecutions
            });
        }

        return true;
    }

    /**
     * Get orchestrator status
     */
    getStatus() {
        return {
            type: 'SwarmIntelligenceOrchestrator',
            version: '1.0.0',
            activeSwarms: this.swarmMetrics.activeSwarms,
            totalSwarms: this.swarmMetrics.totalSwarms,
            pheromoneTrails: this.pheromoneTrails.size,
            collectiveKnowledge: this.collectiveKnowledge.size,
            metrics: this.swarmMetrics,
            configuration: {
                maxSwarmSize: this.options.maxSwarmSize,
                consensusThreshold: this.options.consensusThreshold,
                enablePheromoneTrails: this.options.enablePheromoneTrails,
                enableCollectiveLearning: this.options.enableCollectiveLearning
            }
        };
    }

    /**
     * Shutdown orchestrator
     */
    async shutdown() {
        // Terminate all active swarms
        for (const swarmId of this.swarms.keys()) {
            await this.terminateSwarm(swarmId);
        }

        this.swarms.clear();
        this.pheromoneTrails.clear();
        this.collectiveKnowledge.clear();

        if (this.options.enableLogging) {
            logger.info('SwarmIntelligenceOrchestrator shutdown completed');
        }
    }
}

module.exports = SwarmIntelligenceOrchestrator;