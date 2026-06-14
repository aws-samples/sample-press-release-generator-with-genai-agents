/**
 * Agent Wrapper Factory
 * 
 * Central factory for creating Strands-compatible wrappers for all 37 agents
 * in the 100 Market Press Release Generator system, organized by categories
 * with intelligent wrapper selection and capability mapping.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const BaseAgentWrapper = require('./base-agent-wrapper');
const { logger } = require('../../../utils/logger');

// Import category-specific wrapper factories
const { ContentGenerationWrapperFactory } = require('./content-generation-wrappers');
const { QualityAssuranceWrapperFactory } = require('./quality-assurance-wrappers');
const { FactCheckingWrapperFactory } = require('./fact-checking-wrappers');

class AgentWrapperFactory {
    constructor() {
        this.wrapperRegistry = new Map();
        this.categoryMappings = this._initializeCategoryMappings();
        this.capabilityMappings = this._initializeCapabilityMappings();
        this.wrapperCache = new Map();
        
        this.statistics = {
            wrappersCreated: 0,
            cacheHits: 0,
            cacheMisses: 0,
            categoriesUsed: new Set(),
            agentTypesWrapped: new Set()
        };

        logger.info('AgentWrapperFactory initialized', {
            supportedCategories: Object.keys(this.categoryMappings).length,
            totalAgentTypes: this._getTotalSupportedAgents()
        });
    }

    /**
     * Create a Strands-compatible wrapper for any agent
     * @param {Object} agentInstance - The agent instance to wrap
     * @param {string} agentType - Type/name of the agent
     * @param {Object} options - Wrapper configuration options
     * @returns {BaseAgentWrapper} Strands-compatible wrapper
     */
    createWrapper(agentInstance, agentType, options = {}) {
        try {
            const agentName = agentInstance.constructor.name || agentType;
            const cacheKey = `${agentName}_${JSON.stringify(options)}`;

            // Check cache first
            if (this.wrapperCache.has(cacheKey) && options.useCache !== false) {
                this.statistics.cacheHits++;
                return this.wrapperCache.get(cacheKey);
            }

            this.statistics.cacheMisses++;
            this.statistics.agentTypesWrapped.add(agentName);

            // Determine agent category
            const category = this._determineAgentCategory(agentName);
            this.statistics.categoriesUsed.add(category);

            let wrapper;

            // Create category-specific wrapper
            switch (category) {
                case 'content_generation':
                    wrapper = ContentGenerationWrapperFactory.createWrapper(agentInstance, agentType, options);
                    break;

                case 'quality_assurance':
                    wrapper = QualityAssuranceWrapperFactory.createWrapper(agentInstance, agentType, options);
                    break;

                case 'fact_checking':
                    wrapper = FactCheckingWrapperFactory.createWrapper(agentInstance, agentType, options);
                    break;

                case 'market_intelligence':
                    wrapper = this._createMarketIntelligenceWrapper(agentInstance, agentName, options);
                    break;

                case 'compliance':
                    wrapper = this._createComplianceWrapper(agentInstance, agentName, options);
                    break;

                case 'source_validation':
                    wrapper = this._createSourceValidationWrapper(agentInstance, agentName, options);
                    break;

                case 'specialized_validation':
                    wrapper = this._createSpecializedValidationWrapper(agentInstance, agentName, options);
                    break;

                default:
                    logger.warn('Unknown agent category, using base wrapper', {
                        agentName,
                        category
                    });
                    wrapper = new BaseAgentWrapper(agentInstance, {
                        ...options,
                        category: 'general'
                    });
                    break;
            }

            // Cache the wrapper
            if (options.useCache !== false) {
                this.wrapperCache.set(cacheKey, wrapper);
            }

            this.statistics.wrappersCreated++;

            logger.debug('Agent wrapper created', {
                agentName,
                category,
                wrapperType: wrapper.constructor.name,
                capabilities: wrapper.getCapabilities()
            });

            return wrapper;

        } catch (error) {
            logger.error('Failed to create agent wrapper', {
                agentType,
                error: error.message
            });

            // Fallback to base wrapper
            return new BaseAgentWrapper(agentInstance, {
                ...options,
                category: 'general',
                fallback: true
            });
        }
    }

    /**
     * Create market intelligence agent wrapper
     * @private
     */
    _createMarketIntelligenceWrapper(agentInstance, agentName, options) {
        const capabilities = this._getAgentCapabilities(agentName);
        const primaryMethods = this._getAgentPrimaryMethods(agentName);

        return new BaseAgentWrapper(agentInstance, {
            ...options,
            category: 'market_intelligence',
            capabilities,
            primaryMethods
        });
    }

    /**
     * Create compliance agent wrapper
     * @private
     */
    _createComplianceWrapper(agentInstance, agentName, options) {
        const capabilities = this._getAgentCapabilities(agentName);
        const primaryMethods = this._getAgentPrimaryMethods(agentName);

        return new BaseAgentWrapper(agentInstance, {
            ...options,
            category: 'compliance',
            capabilities,
            primaryMethods
        });
    }

    /**
     * Create source validation agent wrapper
     * @private
     */
    _createSourceValidationWrapper(agentInstance, agentName, options) {
        const capabilities = this._getAgentCapabilities(agentName);
        const primaryMethods = this._getAgentPrimaryMethods(agentName);

        return new BaseAgentWrapper(agentInstance, {
            ...options,
            category: 'source_validation',
            capabilities,
            primaryMethods
        });
    }

    /**
     * Create specialized validation agent wrapper
     * @private
     */
    _createSpecializedValidationWrapper(agentInstance, agentName, options) {
        const capabilities = this._getAgentCapabilities(agentName);
        const primaryMethods = this._getAgentPrimaryMethods(agentName);

        return new BaseAgentWrapper(agentInstance, {
            ...options,
            category: 'specialized_validation',
            capabilities,
            primaryMethods
        });
    }

    /**
     * Determine agent category based on name
     * @private
     */
    _determineAgentCategory(agentName) {
        for (const [category, agents] of Object.entries(this.categoryMappings)) {
            if (agents.some(agentType => agentName.includes(agentType))) {
                return category;
            }
        }
        return 'general';
    }

    /**
     * Get agent capabilities based on name
     * @private
     */
    _getAgentCapabilities(agentName) {
        return this.capabilityMappings[agentName] || ['general_processing'];
    }

    /**
     * Get agent primary methods based on name
     * @private
     */
    _getAgentPrimaryMethods(agentName) {
        const methodMappings = {
            'MarketResearcherAgent': ['_performResearch', '_fetchMarketData', '_prepareMarketContext'],
            'MarketContextAnalyzer': ['analyzeMarketContext', 'classifyMarketTier', 'analyzeSeasonalContext'],
            'MultiFacetTrendAnalyzer': ['analyzeFactor', 'identifyKeyFactors', 'generateTrendExplanation'],
            'RegulatoryComplianceChecker': ['validateContent', 'validateFairHousingCompliance', 'validateTruthInAdvertisingCompliance'],
            'IndustryStandardsValidator': ['validateContent', 'validateNARCompliance', 'validateMLSCompliance'],
            'RealEstateRulesEngine': ['validateClaim', 'validateMultipleClaims', 'extractRealEstateClaims'],
            'SourceGroundingValidator': ['validateGrounding', 'validateSourceCitations', 'validateFactualClaims'],
            'SourceGroundingVerifier': ['verifySourceGrounding'],
            'AccessibilityVerifier': ['verifySourceAccessibility', 'validateDataAvailability', 'assessSourceReliability'],
            'AuthorityScorer': ['scoreSourceAuthority', 'evaluateDomainExpertise', 'assessPublicationCredibility'],
            'ContradictionDetector': ['extractClaims', 'detectContradictions', 'compareStatements'],
            'ContradictionResolver': ['resolveContradictions', 'detectContradictions'],
            'CrossDomainTranslator': ['translateNationalToLocal', 'createContrastClaim', 'generateLocalizedContext'],
            'CrossReferenceValidator': ['validateCrossReferences'],
            'FactualConsistencyChecker': ['checkConsistency'],
            'FrameworkExtractor': ['extractFramework', 'detectContentType', 'extractStructure'],
            'NarrativeScenarioTester': ['testNarrativeScenarios', 'testScenario', 'generateScenarioContent'],
            'RecencyValidator': ['validateDataRecency', 'assessTemporalRelevance', 'checkDataFreshness'],
            'StatisticalPlausibilityValidator': ['validatePlausibility'],
            'TemporalConsistencyValidator': ['validateTemporalConsistency']
        };

        return methodMappings[agentName] || ['process'];
    }

    /**
     * Initialize category mappings for all 37 agents
     * @private
     */
    _initializeCategoryMappings() {
        return {
            content_generation: [
                'ContentAnalyzer', 'LocalizationEngine', 'OutputFormatter', 
                'PitchEmailExtractor', 'ComprehensiveDataExtractor'
            ],
            quality_assurance: [
                'QualityValidator', 'ConsistencyChecker', 'HallucinationDetector', 'StyleGuideService'
            ],
            market_intelligence: [
                'MarketResearcher', 'MarketContextAnalyzer', 'MultiFacetTrendAnalyzer'
            ],
            fact_checking: [
                'ConfidenceScorer', 'CrossMarketValidator', 'RealTimeDataVerifier',
                'SemanticValidator', 'SourceTracker', 'StatisticalChecker'
            ],
            compliance: [
                'RegulatoryComplianceChecker', 'IndustryStandardsValidator', 'RealEstateRulesEngine'
            ],
            source_validation: [
                'SourceGroundingValidator', 'SourceGroundingVerifier', 'AccessibilityVerifier', 'AuthorityScorer'
            ],
            specialized_validation: [
                'ContradictionDetector', 'ContradictionResolver', 'CrossDomainTranslator',
                'CrossReferenceValidator', 'FactualConsistencyChecker', 'FrameworkExtractor',
                'NarrativeScenarioTester', 'RecencyValidator', 'StatisticalPlausibilityValidator',
                'TemporalConsistencyValidator'
            ]
        };
    }

    /**
     * Initialize capability mappings for all agents
     * @private
     */
    _initializeCapabilityMappings() {
        return {
            // Content Generation
            'ContentAnalyzerAgent': ['analysis', 'extraction', 'structure_detection'],
            'LocalizationEngine': ['localization', 'market_adaptation', 'quote_integration'],
            'OutputFormatter': ['formatting', 'multi_format_output', 'file_management'],
            'PitchEmailExtractor': ['email_extraction', 'pitch_generation', 'media_outreach'],
            'ComprehensiveDataExtractorAgent': ['data_extraction', 'pattern_matching', 'content_analysis'],

            // Quality Assurance
            'QualityValidator': ['quality_assessment', 'multi_dimensional_validation', 'scoring'],
            'ConsistencyChecker': ['consistency_validation', 'cross_source_analysis', 'outlier_detection'],
            'HallucinationDetector': ['hallucination_detection', 'source_grounding', 'authority_validation'],
            'StyleGuideService': ['style_validation', 'ap_style_compliance', 'seo_optimization'],

            // Market Intelligence
            'MarketResearcherAgent': ['market_research', 'data_collection', 'context_preparation'],
            'MarketContextAnalyzer': ['context_analysis', 'tier_classification', 'seasonal_analysis'],
            'MultiFacetTrendAnalyzer': ['trend_analysis', 'factor_identification', 'divergence_analysis'],

            // Fact Checking
            'ConfidenceScorer': ['confidence_scoring', 'risk_assessment', 'validation_weighting'],
            'CrossMarketValidator': ['cross_market_validation', 'statistical_consistency', 'outlier_detection'],
            'RealTimeDataVerifier': ['real_time_verification', 'multi_source_validation', 'data_scraping'],
            'SemanticValidator': ['semantic_validation', 'logical_consistency', 'contradiction_detection'],
            'SourceTracker': ['source_attribution', 'reliability_tracking', 'citation_validation'],
            'StatisticalChecker': ['statistical_validation', 'numerical_analysis', 'data_plausibility'],

            // Compliance
            'RegulatoryComplianceChecker': ['regulatory_compliance', 'fair_housing', 'truth_in_advertising'],
            'IndustryStandardsValidator': ['industry_standards', 'nar_compliance', 'mls_compliance'],
            'RealEstateRulesEngine': ['real_estate_rules', 'domain_validation', 'claim_validation'],

            // Source Validation
            'SourceGroundingValidator': ['source_grounding', 'citation_validation', 'factual_claims'],
            'SourceGroundingVerifier': ['grounding_verification', 'claim_support', 'authority_weighting'],
            'AccessibilityVerifier': ['accessibility_verification', 'url_validation', 'source_reliability'],
            'AuthorityScorer': ['authority_scoring', 'domain_expertise', 'publication_credibility'],

            // Specialized Validation
            'ContradictionDetector': ['contradiction_detection', 'claim_extraction', 'statement_comparison'],
            'ContradictionResolver': ['contradiction_resolution', 'conflict_analysis', 'resolution_strategies'],
            'CrossDomainTranslator': ['domain_translation', 'national_to_local', 'context_generation'],
            'CrossReferenceValidator': ['cross_reference_validation', 'source_triangulation', 'consistency_checking'],
            'FactualConsistencyChecker': ['factual_consistency', 'internal_consistency', 'logical_consistency'],
            'FrameworkExtractor': ['framework_extraction', 'content_type_detection', 'structure_extraction'],
            'NarrativeScenarioTester': ['scenario_testing', 'narrative_quality', 'content_generation'],
            'RecencyValidator': ['recency_validation', 'temporal_decay', 'data_freshness'],
            'StatisticalPlausibilityValidator': ['statistical_plausibility', 'range_validation', 'outlier_detection'],
            'TemporalConsistencyValidator': ['temporal_consistency', 'historical_accuracy', 'timeline_validation']
        };
    }

    /**
     * Create multiple wrappers from agent instances
     * @param {Map|Object} agents - Map or object of agent instances
     * @param {Object} globalOptions - Global wrapper options
     * @returns {Map} Map of wrapped agents
     */
    createMultipleWrappers(agents, globalOptions = {}) {
        const wrappedAgents = new Map();
        const agentEntries = agents instanceof Map ? agents.entries() : Object.entries(agents);

        for (const [agentName, agentInstance] of agentEntries) {
            try {
                const wrapper = this.createWrapper(agentInstance, agentName, globalOptions);
                wrappedAgents.set(agentName, wrapper);

                logger.debug('Agent wrapped successfully', {
                    agentName,
                    wrapperType: wrapper.constructor.name,
                    category: wrapper.getCategory()
                });

            } catch (error) {
                logger.error('Failed to wrap agent', {
                    agentName,
                    error: error.message
                });

                // Create fallback wrapper
                const fallbackWrapper = new BaseAgentWrapper(agentInstance, {
                    ...globalOptions,
                    category: 'general',
                    fallback: true
                });
                wrappedAgents.set(agentName, fallbackWrapper);
            }
        }

        logger.info('Multiple agents wrapped', {
            totalAgents: wrappedAgents.size,
            successfulWraps: wrappedAgents.size,
            categoriesUsed: Array.from(this.statistics.categoriesUsed)
        });

        return wrappedAgents;
    }

    /**
     * Get wrapper for specific agent category
     * @param {string} category - Agent category
     * @param {Object} agentInstance - Agent instance
     * @param {string} agentType - Agent type
     * @param {Object} options - Wrapper options
     * @returns {BaseAgentWrapper} Category-specific wrapper
     */
    getWrapperForCategory(category, agentInstance, agentType, options = {}) {
        const categoryOptions = { ...options, category };

        switch (category) {
            case 'content_generation':
                return ContentGenerationWrapperFactory.createWrapper(agentInstance, agentType, categoryOptions);
            
            case 'quality_assurance':
                return QualityAssuranceWrapperFactory.createWrapper(agentInstance, agentType, categoryOptions);
            
            case 'fact_checking':
                return FactCheckingWrapperFactory.createWrapper(agentInstance, agentType, categoryOptions);
            
            default:
                return new BaseAgentWrapper(agentInstance, categoryOptions);
        }
    }

    /**
     * Get all supported agent types
     */
    getSupportedAgentTypes() {
        const allAgents = [];
        
        for (const agents of Object.values(this.categoryMappings)) {
            allAgents.push(...agents);
        }

        return allAgents;
    }

    /**
     * Get agents by category
     */
    getAgentsByCategory(category) {
        return this.categoryMappings[category] || [];
    }

    /**
     * Get agent capabilities
     */
    getAgentCapabilities(agentName) {
        return this.capabilityMappings[agentName] || ['general_processing'];
    }

    /**
     * Get wrapper statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            categoriesUsed: Array.from(this.statistics.categoriesUsed),
            agentTypesWrapped: Array.from(this.statistics.agentTypesWrapped),
            cacheEfficiency: this.statistics.cacheHits / (this.statistics.cacheHits + this.statistics.cacheMisses),
            cacheSize: this.wrapperCache.size
        };
    }

    /**
     * Clear wrapper cache
     */
    clearCache() {
        this.wrapperCache.clear();
        logger.info('Wrapper cache cleared');
    }

    /**
     * Get total supported agents count
     * @private
     */
    _getTotalSupportedAgents() {
        return Object.values(this.categoryMappings)
            .reduce((total, agents) => total + agents.length, 0);
    }

    /**
     * Validate agent instance
     */
    validateAgentInstance(agentInstance, agentType) {
        if (!agentInstance) {
            throw new Error(`Agent instance is null or undefined for type: ${agentType}`);
        }

        if (typeof agentInstance !== 'object') {
            throw new Error(`Agent instance must be an object for type: ${agentType}`);
        }

        // Check if agent extends BaseAgent
        const hasBaseAgentMethods = ['initialize', 'log', 'getStatus'].every(method => 
            typeof agentInstance[method] === 'function'
        );

        if (!hasBaseAgentMethods) {
            logger.warn('Agent may not extend BaseAgent', {
                agentType,
                availableMethods: Object.getOwnPropertyNames(agentInstance).filter(prop => 
                    typeof agentInstance[prop] === 'function'
                )
            });
        }

        return true;
    }

    /**
     * Create wrapper with validation
     */
    createValidatedWrapper(agentInstance, agentType, options = {}) {
        try {
            this.validateAgentInstance(agentInstance, agentType);
            return this.createWrapper(agentInstance, agentType, options);
        } catch (error) {
            logger.error('Agent validation failed', {
                agentType,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get factory status
     */
    getStatus() {
        return {
            type: 'AgentWrapperFactory',
            version: '1.0.0',
            supportedCategories: Object.keys(this.categoryMappings).length,
            supportedAgents: this._getTotalSupportedAgents(),
            statistics: this.getStatistics(),
            cacheSize: this.wrapperCache.size,
            registrySize: this.wrapperRegistry.size
        };
    }
}

// Export singleton instance
const agentWrapperFactory = new AgentWrapperFactory();

module.exports = {
    AgentWrapperFactory,
    agentWrapperFactory,
    
    // Re-export category factories for direct use
    ContentGenerationWrapperFactory,
    QualityAssuranceWrapperFactory,
    FactCheckingWrapperFactory
};