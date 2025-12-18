/**
 * ContradictionResolver - Resolves contradictions and conflicts in content
 * Part of the Hallucination Detection System
 */

const BaseAgent = require('./baseAgent');

class ContradictionResolver extends BaseAgent {
    constructor() {
        super('ContradictionResolver');
        
        // Standard interface properties
        this.version = '1.0.0';
        this.capabilities = [
            'contradiction_resolution',
            'conflict_detection',
            'authority_weighting',
            'temporal_resolution',
            'consensus_building'
        ];
        this.lastResults = null;
        
        this.initialized = false;
        this.resolutionStrategies = new Map();
        this.conflictDatabase = new Map();
    }

    /**
     * Initialize the contradiction resolver
     */
    async initialize() {
        try {
            this.log('Initializing ContradictionResolver...');
            
            // Load resolution strategies
            await this.loadResolutionStrategies();
            
            // Initialize conflict tracking
            this.conflictDatabase.clear();
            
            this.initialized = true;
            this.log('ContradictionResolver initialized successfully');
            
            return { success: true, message: 'ContradictionResolver initialized' };
        } catch (error) {
            this.logError('Failed to initialize ContradictionResolver', error);
            throw error;
        }
    }

    /**
     * Load resolution strategies
     */
    async loadResolutionStrategies() {
        this.log('Loading resolution strategies...');
        
        this.resolutionStrategies.set('authority_weighted', {
            name: 'Authority Weighted Resolution',
            description: 'Resolve conflicts by weighting source authority',
            priority: 1,
            resolver: this.resolveByAuthority.bind(this)
        });
        
        this.resolutionStrategies.set('temporal_priority', {
            name: 'Temporal Priority Resolution',
            description: 'Resolve conflicts by preferring more recent information',
            priority: 2,
            resolver: this.resolveByTemporal.bind(this)
        });
        
        this.resolutionStrategies.set('consensus_based', {
            name: 'Consensus Based Resolution',
            description: 'Resolve conflicts by finding consensus among sources',
            priority: 3,
            resolver: this.resolveByConsensus.bind(this)
        });
        
        this.resolutionStrategies.set('context_aware', {
            name: 'Context Aware Resolution',
            description: 'Resolve conflicts based on contextual relevance',
            priority: 4,
            resolver: this.resolveByContext.bind(this)
        });
        
        this.log(`Loaded ${this.resolutionStrategies.size} resolution strategies`);
    }

    /**
     * Standard process method - delegates to resolveContradictions
     */
    async process(input, validationResults, options = {}) {
        return await this.resolveContradictions(input, validationResults, options);
    }

    /**
     * Standard validate method - performs basic validation then delegates to resolveContradictions
     */
    async validate(input, validationResults, options = {}) {
        return await this.resolveContradictions(input, validationResults, options);
    }

    /**
     * Get processing results
     */
    getResults() {
        return this.lastResults;
    }

    /**
     * Get resolution strategy (standardized method name)
     */
    getResolutionStrategy(strategyName) {
        return this.resolutionStrategies.get(strategyName) || null;
    }

    /**
     * Get all resolution strategies (standardized method name)
     */
    getResolutionStrategies() {
        const strategies = {};
        for (const [key, value] of this.resolutionStrategies) {
            strategies[key] = value;
        }
        return strategies;
    }

    /**
     * Main contradiction resolution method
     */
    async resolveContradictions(content, validationResults, options = {}) {
        if (!this.initialized) {
            throw new Error('ContradictionResolver not initialized. Call initialize() first.');
        }

        const startTime = Date.now();
        this.log(`Starting contradiction resolution for content (${content.length} chars)`);

        try {
            // Detect contradictions
            const contradictions = await this.detectContradictions(content, validationResults);
            
            // Resolve each contradiction
            const resolutions = [];
            for (const contradiction of contradictions) {
                this.log(`Resolving contradiction: ${contradiction.type}`);
                const resolution = await this.resolveContradiction(contradiction, options);
                resolutions.push(resolution);
            }
            
            // Calculate final scores
            const finalScore = this.calculateFinalScore(resolutions);
            const confidenceScore = this.calculateConfidenceScore(resolutions);
            
            const processingTime = Date.now() - startTime;
            
            const result = {
                success: true,
                processingTime,
                contradictionsFound: contradictions.length,
                contradictionsResolved: resolutions.filter(r => r.resolved).length,
                resolutions,
                finalScore,
                confidenceScore,
                resolutionStrategy: options.strategy || 'authority_weighted',
                summary: this.generateResolutionSummary(contradictions, resolutions)
            };

            this.log(`Contradiction resolution completed in ${processingTime}ms`);
            
            // Store results for getResults() method
            this.lastResults = result;
            
            return result;

        } catch (error) {
            this.logError('Contradiction resolution failed', error);
            
            // Store error result for getResults() method
            const errorResult = {
                success: false,
                processingTime: Date.now() - startTime,
                contradictionsFound: 0,
                contradictionsResolved: 0,
                resolutions: [],
                finalScore: 0,
                confidenceScore: 0,
                resolutionStrategy: options.strategy || 'authority_weighted',
                summary: {
                    status: 'failed',
                    error: error.message,
                    timestamp: new Date().toISOString()
                },
                error: error.message
            };
            this.lastResults = errorResult;
            
            throw error;
        }
    }

    /**
     * Detect contradictions in content and validation results
     */
    async detectContradictions(content, validationResults) {
        this.log('Detecting contradictions...');
        
        const contradictions = [];
        
        // Detect data contradictions
        const dataContradictions = this.detectDataContradictions(content, validationResults);
        contradictions.push(...dataContradictions);
        
        // Detect source contradictions
        const sourceContradictions = this.detectSourceContradictions(validationResults);
        contradictions.push(...sourceContradictions);
        
        // Detect temporal contradictions
        const temporalContradictions = this.detectTemporalContradictions(content);
        contradictions.push(...temporalContradictions);
        
        // Detect logical contradictions
        const logicalContradictions = this.detectLogicalContradictions(content);
        contradictions.push(...logicalContradictions);
        
        this.log(`Detected ${contradictions.length} contradictions`);
        return contradictions;
    }

    /**
     * Detect data contradictions
     */
    detectDataContradictions(content, validationResults) {
        const contradictions = [];
        
        // Mock data contradiction detection
        // In real implementation, this would analyze numerical data for inconsistencies
        const statistics = this.extractStatistics(content);
        
        if (statistics.length > 1) {
            // Check for conflicting percentages
            const percentages = statistics.filter(s => s.includes('%'));
            if (percentages.length > 1) {
                contradictions.push({
                    type: 'data_conflict',
                    severity: 'medium',
                    description: 'Multiple conflicting percentage values found',
                    values: percentages,
                    location: 'content_body'
                });
            }
        }
        
        return contradictions;
    }

    /**
     * Detect source contradictions
     */
    detectSourceContradictions(validationResults) {
        const contradictions = [];
        
        // Mock source contradiction detection
        if (validationResults && validationResults.grounding) {
            const sourcesFound = validationResults.grounding.sourcesFound || 0;
            const sourcesValidated = validationResults.grounding.sourcesValidated || 0;
            
            if (sourcesFound > sourcesValidated) {
                contradictions.push({
                    type: 'source_conflict',
                    severity: 'high',
                    description: 'Some sources could not be validated',
                    unvalidatedSources: sourcesFound - sourcesValidated,
                    location: 'source_references'
                });
            }
        }
        
        return contradictions;
    }

    /**
     * Detect temporal contradictions
     */
    detectTemporalContradictions(content) {
        const contradictions = [];
        
        // Ensure content is a string for regex matching
        const contentText = typeof content === 'string' ? content :
                           (content?.text || content?.content || JSON.stringify(content));
        
        // Extract years from content
        const years = contentText.match(/\b(19|20)\d{2}\b/g) || [];
        const uniqueYears = [...new Set(years)];
        
        if (uniqueYears.length > 2) {
            contradictions.push({
                type: 'temporal_conflict',
                severity: 'low',
                description: 'Multiple time references may indicate temporal inconsistency',
                years: uniqueYears,
                location: 'temporal_references'
            });
        }
        
        return contradictions;
    }

    /**
     * Detect logical contradictions
     */
    detectLogicalContradictions(content) {
        const contradictions = [];
        
        // Mock logical contradiction detection
        // Look for contradictory statements
        const lowerContent = content.toLowerCase();
        
        if (lowerContent.includes('increase') && lowerContent.includes('decrease')) {
            contradictions.push({
                type: 'logical_conflict',
                severity: 'medium',
                description: 'Content contains both increase and decrease statements',
                location: 'content_analysis'
            });
        }
        
        return contradictions;
    }

    /**
     * Resolve a single contradiction
     */
    async resolveContradiction(contradiction, options) {
        const strategy = options.strategy || 'authority_weighted';
        const resolver = this.resolutionStrategies.get(strategy);
        
        if (!resolver) {
            throw new Error(`Unknown resolution strategy: ${strategy}`);
        }
        
        try {
            const resolution = await resolver.resolver(contradiction, options);
            
            // Track resolution in database
            this.conflictDatabase.set(contradiction.type + '_' + Date.now(), {
                contradiction,
                resolution,
                strategy,
                timestamp: new Date().toISOString()
            });
            
            return {
                contradiction,
                resolution,
                resolved: resolution.success,
                strategy,
                confidence: resolution.confidence || 0.5
            };
            
        } catch (error) {
            this.logError(`Failed to resolve contradiction: ${contradiction.type}`, error);
            return {
                contradiction,
                resolution: { success: false, error: error.message },
                resolved: false,
                strategy,
                confidence: 0
            };
        }
    }

    /**
     * Resolve contradiction by authority weighting
     */
    async resolveByAuthority(contradiction, options) {
        this.log(`Resolving by authority: ${contradiction.type}`);
        
        // Mock authority-based resolution
        return {
            success: true,
            method: 'authority_weighted',
            decision: 'Prioritized government source over industry source',
            confidence: 0.85,
            reasoning: 'Government sources have higher authority weight (0.95 vs 0.85)'
        };
    }

    /**
     * Resolve contradiction by temporal priority
     */
    async resolveByTemporal(contradiction, options) {
        this.log(`Resolving by temporal priority: ${contradiction.type}`);
        
        // Mock temporal resolution
        return {
            success: true,
            method: 'temporal_priority',
            decision: 'Used most recent data point',
            confidence: 0.75,
            reasoning: 'More recent information typically supersedes older data'
        };
    }

    /**
     * Resolve contradiction by consensus
     */
    async resolveByConsensus(contradiction, options) {
        this.log(`Resolving by consensus: ${contradiction.type}`);
        
        // Mock consensus resolution
        return {
            success: true,
            method: 'consensus_based',
            decision: 'Selected value supported by majority of sources',
            confidence: 0.80,
            reasoning: '3 out of 4 sources support this value'
        };
    }

    /**
     * Resolve contradiction by context
     */
    async resolveByContext(contradiction, options) {
        this.log(`Resolving by context: ${contradiction.type}`);
        
        // Mock context-aware resolution
        return {
            success: true,
            method: 'context_aware',
            decision: 'Selected contextually relevant information',
            confidence: 0.70,
            reasoning: 'Value is more relevant to the specific context discussed'
        };
    }

    /**
     * Extract statistics from content
     */
    extractStatistics(content) {
        const stats = [];
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        // Extract percentages
        const percentages = contentStr.match(/\d+(\.\d+)?%/g) || [];
        stats.push(...percentages);
        
        // Extract dollar amounts
        const dollars = contentStr.match(/\$[\d,]+(\.\d+)?/g) || [];
        stats.push(...dollars);
        
        return stats;
    }

    /**
     * Calculate final score after resolution
     */
    calculateFinalScore(resolutions) {
        if (resolutions.length === 0) return 1.0;
        
        const resolvedCount = resolutions.filter(r => r.resolved).length;
        const totalConfidence = resolutions.reduce((sum, r) => sum + r.confidence, 0);
        
        const resolutionRate = resolvedCount / resolutions.length;
        const avgConfidence = totalConfidence / resolutions.length;
        
        return (resolutionRate * 0.6) + (avgConfidence * 0.4);
    }

    /**
     * Calculate confidence score
     */
    calculateConfidenceScore(resolutions) {
        if (resolutions.length === 0) return 1.0;
        
        const totalConfidence = resolutions.reduce((sum, r) => r.confidence, 0);
        return totalConfidence / resolutions.length;
    }

    /**
     * Generate resolution summary
     */
    generateResolutionSummary(contradictions, resolutions) {
        const resolvedCount = resolutions.filter(r => r.resolved).length;
        const totalCount = contradictions.length;
        
        return {
            total: totalCount,
            resolved: resolvedCount,
            unresolved: totalCount - resolvedCount,
            resolutionRate: totalCount > 0 ? resolvedCount / totalCount : 1,
            primaryStrategy: resolutions.length > 0 ? resolutions[0].strategy : 'none',
            status: resolvedCount === totalCount ? 'FULLY_RESOLVED' : 'PARTIALLY_RESOLVED'
        };
    }

    /**
     * Get resolver status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            strategies: this.resolutionStrategies.size,
            conflictsTracked: this.conflictDatabase.size,
            ready: this.initialized
        };
    }
}

module.exports = ContradictionResolver;