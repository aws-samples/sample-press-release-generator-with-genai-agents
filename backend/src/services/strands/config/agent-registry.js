/**
 * Agent Registry for Strands Framework Integration
 * 
 * Manages agent discovery, registration, and metadata for the 37-agent system
 * in the 100 Market Press Release Generator. Provides centralized agent management
 * and discovery capabilities for Strands framework integration.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../../../utils/logger');
const strandsConfig = require('./strands-config');

class AgentRegistry {
    constructor() {
        this.agents = new Map();
        this.agentCategories = new Map();
        this.discoveredAgents = new Map();
        this.isInitialized = false;

        // Agent discovery paths
        this.discoveryPaths = [
            path.join(__dirname, '../../../agents'),
            path.join(__dirname, '../../../factChecking/agents')
        ];

        // Agent category definitions based on the 37-agent system
        this.categoryDefinitions = {
            'core_content_generation': {
                description: 'Core content generation pipeline agents',
                expectedAgents: ['contentAnalyzer', 'marketResearcher', 'localizationEngine', 'outputFormatter', 'pitchEmailExtractor'],
                weight: 1.0,
                priority: 'high'
            },
            'quality_assurance': {
                description: 'Quality assurance and validation agents',
                expectedAgents: ['qualityValidator', 'consistencyChecker', 'hallucinationDetector', 'domainSpecificValidator'],
                weight: 0.9,
                priority: 'high'
            },
            'market_intelligence': {
                description: 'Market intelligence and analysis agents',
                expectedAgents: ['marketContextAnalyzer', 'multiFacetTrendAnalyzer', 'comparativeAnalyzer'],
                weight: 0.8,
                priority: 'medium'
            },
            'compliance': {
                description: 'Compliance and regulatory agents',
                expectedAgents: ['regulatoryComplianceChecker', 'industryStandardsValidator', 'legalComplianceValidator'],
                weight: 0.7,
                priority: 'medium'
            },
            'source_validation': {
                description: 'Source validation and authority agents',
                expectedAgents: ['sourceGroundingValidator', 'authorityScorer', 'sourceReliabilityChecker'],
                weight: 0.8,
                priority: 'medium'
            },
            'fact_checking': {
                description: 'Specialized fact-checking agents',
                expectedAgents: ['RealTimeDataVerifier', 'StatisticalChecker', 'ConfidenceScorer', 'ClaimExtractor'],
                weight: 0.9,
                priority: 'high'
            }
        };

        logger.info('AgentRegistry initialized', {
            discoveryPaths: this.discoveryPaths.length,
            categories: Object.keys(this.categoryDefinitions).length
        });
    }

    /**
     * Initialize the agent registry
     */
    async initialize() {
        if (this.isInitialized) {
            logger.warn('AgentRegistry already initialized');
            return;
        }

        try {
            logger.info('Initializing Agent Registry...');

            // Discover agents from file system
            await this._discoverAgents();

            // Categorize discovered agents
            this._categorizeAgents();

            // Validate agent completeness
            this._validateAgentCompleteness();

            this.isInitialized = true;

            logger.info('Agent Registry initialized successfully', {
                totalAgents: this.discoveredAgents.size,
                categories: this.agentCategories.size,
                registeredAgents: this.agents.size
            });
        } catch (error) {
            logger.error('Failed to initialize Agent Registry', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Discover agents from file system
     * @private
     */
    async _discoverAgents() {
        logger.info('Discovering agents from file system...');

        for (const discoveryPath of this.discoveryPaths) {
            try {
                await this._discoverAgentsInPath(discoveryPath);
            } catch (error) {
                logger.warn(`Failed to discover agents in path: ${discoveryPath}`, {
                    error: error.message
                });
            }
        }

        logger.info(`Agent discovery completed`, {
            totalDiscovered: this.discoveredAgents.size,
            paths: this.discoveryPaths.length
        });
    }

    /**
     * Discover agents in specific path
     * @private
     */
    async _discoverAgentsInPath(discoveryPath) {
        try {
            const exists = await fs.access(discoveryPath).then(() => true).catch(() => false);
            if (!exists) {
                logger.debug(`Discovery path does not exist: ${discoveryPath}`);
                return;
            }

            const files = await fs.readdir(discoveryPath);
            
            for (const file of files) {
                if (file.endsWith('.js') && !file.includes('.test.') && !file.includes('.spec.')) {
                    const agentPath = path.join(discoveryPath, file);
                    const agentName = path.basename(file, '.js');
                    
                    try {
                        // Attempt to load agent metadata
                        const agentInfo = await this._analyzeAgentFile(agentPath, agentName);
                        
                        this.discoveredAgents.set(agentName, {
                            name: agentName,
                            path: agentPath,
                            discoveryPath,
                            ...agentInfo,
                            discoveredAt: Date.now()
                        });

                        logger.debug(`Discovered agent: ${agentName}`, {
                            path: agentPath,
                            category: agentInfo.category
                        });
                    } catch (error) {
                        logger.warn(`Failed to analyze agent file: ${file}`, {
                            error: error.message
                        });
                    }
                }
            }
        } catch (error) {
            logger.error(`Error discovering agents in path: ${discoveryPath}`, {
                error: error.message
            });
        }
    }

    /**
     * Analyze agent file to extract metadata
     * @private
     */
    async _analyzeAgentFile(agentPath, agentName) {
        try {
            // For now, we'll use naming patterns to categorize agents
            // In a more sophisticated implementation, we could parse the file
            const category = this._categorizeAgentByName(agentName);
            
            return {
                category,
                type: 'node_agent',
                capabilities: this._inferCapabilities(agentName),
                dependencies: this._inferDependencies(agentName),
                strandsCompatible: true, // Assume compatible unless proven otherwise
                metadata: {
                    fileSize: (await fs.stat(agentPath)).size,
                    lastModified: (await fs.stat(agentPath)).mtime
                }
            };
        } catch (error) {
            logger.warn(`Failed to analyze agent file: ${agentPath}`, {
                error: error.message
            });
            return {
                category: 'unknown',
                type: 'node_agent',
                capabilities: [],
                dependencies: {},
                strandsCompatible: false,
                error: error.message
            };
        }
    }

    /**
     * Categorize agent by name patterns
     * @private
     */
    _categorizeAgentByName(agentName) {
        const name = agentName.toLowerCase();
        
        // Core content generation
        if (['contentanalyzer', 'marketresearcher', 'localizationengine', 'outputformatter', 'pitchemailextractor'].includes(name)) {
            return 'core_content_generation';
        }
        
        // Quality assurance
        if (name.includes('quality') || name.includes('consistency') || name.includes('hallucination') || name.includes('validator')) {
            return 'quality_assurance';
        }
        
        // Market intelligence
        if (name.includes('market') && (name.includes('context') || name.includes('trend') || name.includes('comparative'))) {
            return 'market_intelligence';
        }
        
        // Compliance
        if (name.includes('regulatory') || name.includes('compliance') || name.includes('standards') || name.includes('legal')) {
            return 'compliance';
        }
        
        // Source validation
        if (name.includes('source') || name.includes('authority') || name.includes('grounding') || name.includes('reliability')) {
            return 'source_validation';
        }
        
        // Fact-checking (specialized agents in factChecking directory)
        if (name.includes('verifier') || name.includes('checker') || name.includes('scorer') || name.includes('extractor')) {
            return 'fact_checking';
        }
        
        return 'unknown';
    }

    /**
     * Infer agent capabilities from name
     * @private
     */
    _inferCapabilities(agentName) {
        const capabilities = ['execute'];
        const name = agentName.toLowerCase();
        
        if (name.includes('analyzer') || name.includes('analysis')) capabilities.push('analyze');
        if (name.includes('validator') || name.includes('validation')) capabilities.push('validate');
        if (name.includes('checker') || name.includes('check')) capabilities.push('check');
        if (name.includes('extractor') || name.includes('extract')) capabilities.push('extract');
        if (name.includes('scorer') || name.includes('score')) capabilities.push('score');
        if (name.includes('formatter') || name.includes('format')) capabilities.push('format');
        if (name.includes('researcher') || name.includes('research')) capabilities.push('research');
        if (name.includes('generator') || name.includes('generate')) capabilities.push('generate');
        
        return capabilities;
    }

    /**
     * Infer agent dependencies from name and category
     * @private
     */
    _inferDependencies(agentName) {
        const dependencies = {
            external_services: [],
            internal_services: [],
            data_sources: [],
            ai_services: []
        };

        const name = agentName.toLowerCase();
        
        // AI service dependencies
        if (name.includes('content') || name.includes('generate') || name.includes('analyzer')) {
            dependencies.ai_services.push('aws_bedrock');
        }
        
        if (name.includes('realtime') || name.includes('verifier') || name.includes('research')) {
            dependencies.ai_services.push('perplexity_ai');
        }
        
        // External service dependencies
        if (name.includes('market') || name.includes('research')) {
            dependencies.external_services.push('firecrawl_api');
        }
        
        // Data source dependencies
        if (name.includes('market') || name.includes('data')) {
            dependencies.data_sources.push('trusted_data', 'market_data');
        }
        
        // Internal service dependencies
        dependencies.internal_services.push('logger', 'config');
        
        return dependencies;
    }

    /**
     * Categorize discovered agents
     * @private
     */
    _categorizeAgents() {
        logger.info('Categorizing discovered agents...');

        // Initialize category maps
        for (const category of Object.keys(this.categoryDefinitions)) {
            this.agentCategories.set(category, []);
        }

        // Categorize each discovered agent
        for (const [agentName, agentInfo] of this.discoveredAgents.entries()) {
            const category = agentInfo.category;
            
            if (this.agentCategories.has(category)) {
                this.agentCategories.get(category).push(agentName);
            } else {
                // Create unknown category if needed
                if (!this.agentCategories.has('unknown')) {
                    this.agentCategories.set('unknown', []);
                }
                this.agentCategories.get('unknown').push(agentName);
            }
        }

        // Log categorization results
        for (const [category, agents] of this.agentCategories.entries()) {
            logger.debug(`Category ${category}: ${agents.length} agents`, { agents });
        }
    }

    /**
     * Validate agent completeness against expected agents
     * @private
     */
    _validateAgentCompleteness() {
        logger.info('Validating agent completeness...');

        const validation = {
            complete: [],
            missing: [],
            unexpected: []
        };

        for (const [category, definition] of Object.entries(this.categoryDefinitions)) {
            const discoveredInCategory = this.agentCategories.get(category) || [];
            const expectedAgents = definition.expectedAgents || [];

            // Check for missing agents
            for (const expectedAgent of expectedAgents) {
                if (!discoveredInCategory.includes(expectedAgent)) {
                    validation.missing.push({
                        agent: expectedAgent,
                        category,
                        priority: definition.priority
                    });
                } else {
                    validation.complete.push({
                        agent: expectedAgent,
                        category
                    });
                }
            }

            // Check for unexpected agents
            for (const discoveredAgent of discoveredInCategory) {
                if (!expectedAgents.includes(discoveredAgent)) {
                    validation.unexpected.push({
                        agent: discoveredAgent,
                        category
                    });
                }
            }
        }

        logger.info('Agent completeness validation completed', {
            complete: validation.complete.length,
            missing: validation.missing.length,
            unexpected: validation.unexpected.length
        });

        if (validation.missing.length > 0) {
            logger.warn('Missing expected agents', {
                missing: validation.missing.map(m => `${m.agent} (${m.category})`)
            });
        }

        return validation;
    }

    /**
     * Register an agent with the registry
     * @param {string} agentName - Name of the agent
     * @param {Object} agentInstance - Agent instance
     * @param {Object} options - Registration options
     */
    async registerAgent(agentName, agentInstance, options = {}) {
        try {
            logger.info(`Registering agent with registry: ${agentName}`);

            if (this.agents.has(agentName)) {
                logger.warn(`Agent ${agentName} already registered - updating registration`);
            }

            // Get discovered agent info if available
            const discoveredInfo = this.discoveredAgents.get(agentName) || {};

            // Create agent registration
            const registration = {
                name: agentName,
                instance: agentInstance,
                category: discoveredInfo.category || this._categorizeAgentByName(agentName),
                capabilities: discoveredInfo.capabilities || this._inferCapabilities(agentName),
                dependencies: discoveredInfo.dependencies || this._inferDependencies(agentName),
                strandsCompatible: discoveredInfo.strandsCompatible !== false,
                registeredAt: Date.now(),
                options: {
                    preserveFunctionality: options.preserveFunctionality !== false,
                    enhancedFeatures: options.enhancedFeatures !== false,
                    monitoringEnabled: options.monitoringEnabled !== false,
                    ...options
                },
                metadata: {
                    ...discoveredInfo.metadata,
                    version: options.version || '1.0.0',
                    description: options.description || `${agentName} agent`,
                    tags: options.tags || []
                }
            };

            this.agents.set(agentName, registration);

            logger.info(`Agent ${agentName} registered successfully`, {
                category: registration.category,
                capabilities: registration.capabilities.length,
                strandsCompatible: registration.strandsCompatible
            });

            return registration;
        } catch (error) {
            logger.error(`Failed to register agent ${agentName}`, {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Get agent registration by name
     * @param {string} agentName - Name of the agent
     * @returns {Object|null}
     */
    getAgent(agentName) {
        return this.agents.get(agentName) || null;
    }

    /**
     * Get all agents in a category
     * @param {string} category - Category name
     * @returns {Array}
     */
    getAgentsByCategory(category) {
        const agents = [];
        
        for (const [agentName, registration] of this.agents.entries()) {
            if (registration.category === category) {
                agents.push(registration);
            }
        }

        return agents;
    }

    /**
     * Get agents by capability
     * @param {string} capability - Capability name
     * @returns {Array}
     */
    getAgentsByCapability(capability) {
        const agents = [];
        
        for (const [agentName, registration] of this.agents.entries()) {
            if (registration.capabilities.includes(capability)) {
                agents.push(registration);
            }
        }

        return agents;
    }

    /**
     * Get Strands-compatible agents
     * @returns {Array}
     */
    getStrandsCompatibleAgents() {
        const agents = [];
        
        for (const [agentName, registration] of this.agents.entries()) {
            if (registration.strandsCompatible) {
                agents.push(registration);
            }
        }

        return agents;
    }

    /**
     * Get agent dependency graph
     * @returns {Object}
     */
    getAgentDependencyGraph() {
        const graph = {
            nodes: [],
            edges: [],
            categories: {}
        };

        // Add nodes
        for (const [agentName, registration] of this.agents.entries()) {
            graph.nodes.push({
                id: agentName,
                name: agentName,
                category: registration.category,
                capabilities: registration.capabilities,
                strandsCompatible: registration.strandsCompatible
            });
        }

        // Add category information
        for (const [category, definition] of Object.entries(this.categoryDefinitions)) {
            graph.categories[category] = {
                ...definition,
                agents: this.getAgentsByCategory(category).map(a => a.name)
            };
        }

        // Add edges based on dependencies (simplified for now)
        for (const [agentName, registration] of this.agents.entries()) {
            const dependencies = registration.dependencies;
            
            // Add edges for internal service dependencies
            for (const service of dependencies.internal_services || []) {
                graph.edges.push({
                    from: agentName,
                    to: service,
                    type: 'internal_service'
                });
            }
        }

        return graph;
    }

    /**
     * Get registry statistics
     * @returns {Object}
     */
    getStatistics() {
        const stats = {
            total: this.agents.size,
            discovered: this.discoveredAgents.size,
            categories: {},
            capabilities: {},
            strandsCompatible: 0,
            registrationRate: 0
        };

        // Category statistics
        for (const [category, agents] of this.agentCategories.entries()) {
            stats.categories[category] = {
                count: agents.length,
                registered: this.getAgentsByCategory(category).length,
                expected: this.categoryDefinitions[category]?.expectedAgents?.length || 0
            };
        }

        // Capability statistics
        const capabilityCount = {};
        for (const registration of this.agents.values()) {
            for (const capability of registration.capabilities) {
                capabilityCount[capability] = (capabilityCount[capability] || 0) + 1;
            }
            
            if (registration.strandsCompatible) {
                stats.strandsCompatible++;
            }
        }
        stats.capabilities = capabilityCount;

        // Registration rate
        stats.registrationRate = this.discoveredAgents.size > 0 
            ? (this.agents.size / this.discoveredAgents.size) * 100 
            : 0;

        return stats;
    }

    /**
     * Export agent configurations for Strands
     * @returns {Array}
     */
    exportStrandsAgentConfigs() {
        const configs = [];
        
        for (const registration of this.agents.values()) {
            if (registration.strandsCompatible) {
                configs.push({
                    name: registration.name,
                    category: registration.category,
                    capabilities: registration.capabilities,
                    dependencies: registration.dependencies,
                    options: registration.options,
                    metadata: registration.metadata
                });
            }
        }

        return configs;
    }

    /**
     * Get registry status
     * @returns {Object}
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            totalAgents: this.agents.size,
            discoveredAgents: this.discoveredAgents.size,
            categories: Object.keys(this.categoryDefinitions).length,
            strandsCompatible: this.getStrandsCompatibleAgents().length,
            statistics: this.getStatistics(),
            lastDiscovery: this.discoveredAgents.size > 0 
                ? Math.max(...Array.from(this.discoveredAgents.values()).map(a => a.discoveredAt))
                : null
        };
    }

    /**
     * Refresh agent discovery
     */
    async refreshDiscovery() {
        try {
            logger.info('Refreshing agent discovery...');

            // Clear previous discovery
            this.discoveredAgents.clear();
            this.agentCategories.clear();

            // Re-discover agents
            await this._discoverAgents();
            this._categorizeAgents();
            this._validateAgentCompleteness();

            logger.info('Agent discovery refreshed successfully', {
                totalDiscovered: this.discoveredAgents.size
            });

            return this.getStatus();
        } catch (error) {
            logger.error('Failed to refresh agent discovery', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Validate specific agent for Strands compatibility
     * @param {string} agentName - Name of the agent
     * @returns {Object}
     */
    validateAgentCompatibility(agentName) {
        const registration = this.agents.get(agentName);
        if (!registration) {
            return {
                compatible: false,
                error: 'Agent not found in registry'
            };
        }

        const issues = [];
        const warnings = [];

        // Check if agent instance exists
        if (!registration.instance) {
            issues.push('Agent instance not available');
        }

        // Check if agent has required methods
        if (registration.instance && typeof registration.instance.execute !== 'function') {
            warnings.push('Agent does not have execute method');
        }

        // Check category compatibility
        if (registration.category === 'unknown') {
            warnings.push('Agent category could not be determined');
        }

        return {
            compatible: issues.length === 0,
            issues,
            warnings,
            agentName,
            category: registration.category,
            capabilities: registration.capabilities,
            timestamp: new Date().toISOString()
        };
    }
}

// Create singleton instance
const agentRegistry = new AgentRegistry();

module.exports = agentRegistry;