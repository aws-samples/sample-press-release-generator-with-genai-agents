/**
 * Strands Framework Integration - Main Export
 * 
 * Provides a clean interface for importing and using the Strands framework
 * integration components in the 100 Market Press Release Generator.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

// Main service interface
const strandsService = require('./strands-service');

// Core components
const strandsConfig = require('./config/strands-config');
const agentRegistry = require('./config/agent-registry');
const bridgeManager = require('./bridges/bridge-manager');

// Component classes for direct instantiation if needed
const BaseAgentWrapper = require('./wrappers/base-agent-wrapper');
const StrandsHealthChecker = require('./monitoring/health-checker');
const StrandsMetricsCollector = require('./monitoring/metrics-collector');

// Phase 2: Orchestration Patterns
const ConditionalLogicOrchestrator = require('./orchestration/conditional-logic');
const SwarmIntelligenceOrchestrator = require('./orchestration/swarm-intelligence');
const NestedOrchestrationManager = require('./orchestration/nested-patterns');
const OrchestrationPatternManager = require('./orchestration/pattern-manager');

// Phase 4: Advanced Hybrid Orchestration and Production Features
const HybridOrchestrationEngine = require('./orchestration/hybrid-orchestration');
const StrandsPerformanceOptimizer = require('./optimization/performance-optimizer');
const StrandsEnterpriseSecurity = require('./security/enterprise-security');

// Phase 2: Agent Wrappers
const { agentWrapperFactory, AgentWrapperFactory } = require('./wrappers/agent-wrapper-factory');
const { ContentGenerationWrapperFactory } = require('./wrappers/content-generation-wrappers');
const { QualityAssuranceWrapperFactory } = require('./wrappers/quality-assurance-wrappers');
const { FactCheckingWrapperFactory } = require('./wrappers/fact-checking-wrappers');

/**
 * Initialize Strands framework with existing 37-agent system
 * @param {Object} agents - Map of existing agents
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
async function initializeStrands(agents = {}, options = {}) {
    try {
        // Initialize main service
        await strandsService.initialize();

        // Register agents if provided
        if (Object.keys(agents).length > 0) {
            const registrationResults = await strandsService.registerMultipleAgents(agents, options);
            
            return {
                success: true,
                strandsEnabled: strandsConfig.isEnabled(),
                strandsAvailable: strandsService.isStrandsAvailable(),
                agentsRegistered: registrationResults.successful.length,
                agentsFailed: registrationResults.failed.length,
                status: strandsService.getStatus()
            };
        }

        return {
            success: true,
            strandsEnabled: strandsConfig.isEnabled(),
            strandsAvailable: strandsService.isStrandsAvailable(),
            status: strandsService.getStatus()
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            strandsEnabled: strandsConfig.isEnabled(),
            strandsAvailable: false
        };
    }
}

/**
 * Get comprehensive Strands framework status
 * @returns {Object} Complete status information
 */
function getStrandsStatus() {
    return {
        framework: {
            version: '1.0.0',
            phase: 'Phase 4 - Production Ready with Advanced Features',
            enabled: strandsConfig.isEnabled(),
            available: strandsService.isStrandsAvailable()
        },
        service: strandsService.getComprehensiveStatus(),
        health: strandsService.getHealthSummary(),
        metrics: strandsService.getMetrics(),
        orchestration: {
            patternsAvailable: ['conditional', 'swarm', 'nested', 'hybrid', 'advanced_hybrid'],
            agentWrapperFactory: !!agentWrapperFactory,
            supportedAgents: agentWrapperFactory.getSupportedAgentTypes().length
        },
        phase4Features: {
            hybridOrchestration: true,
            performanceOptimization: true,
            enterpriseSecurity: true,
            comprehensiveTesting: true,
            productionReadiness: true
        }
    };
}

/**
 * Execute agent with Strands orchestration (if available) or traditional fallback
 * @param {string} agentName - Name of the agent
 * @param {string} method - Method to execute
 * @param {Array} params - Method parameters
 * @param {Object} options - Execution options
 * @returns {Promise<*>} Execution result
 */
async function executeAgent(agentName, method, params = [], options = {}) {
    if (strandsService.isStrandsAvailable() && options.useStrands !== false) {
        return await strandsService.executeAgent(agentName, method, params, options);
    } else {
        // Fallback to direct agent execution
        const wrapper = bridgeManager.getAgentWrapper(agentName);
        if (wrapper) {
            return await wrapper.executeWithStrands(method, params, { ...options, noFallback: true });
        } else {
            throw new Error(`Agent ${agentName} not registered with Strands framework`);
        }
    }
}

/**
 * Validate backward compatibility with existing system
 * @returns {Promise<Object>} Validation results
 */
async function validateBackwardCompatibility() {
    return await strandsService.validateBackwardCompatibility();
}

/**
 * Shutdown Strands framework gracefully
 * @returns {Promise<void>}
 */
async function shutdownStrands() {
    await strandsService.shutdown();
}

// Export main interface
module.exports = {
    // Main functions
    initializeStrands,
    getStrandsStatus,
    executeAgent,
    validateBackwardCompatibility,
    shutdownStrands,

    // Direct service access
    strandsService,
    strandsConfig,
    agentRegistry,
    bridgeManager,

    // Component classes
    BaseAgentWrapper,
    StrandsHealthChecker,
    StrandsMetricsCollector,

    // Phase 2: Orchestration Pattern Classes
    ConditionalLogicOrchestrator,
    SwarmIntelligenceOrchestrator,
    NestedOrchestrationManager,
    OrchestrationPatternManager,

    // Phase 2: Agent Wrapper Classes
    AgentWrapperFactory,
    ContentGenerationWrapperFactory,
    QualityAssuranceWrapperFactory,
    FactCheckingWrapperFactory,
    agentWrapperFactory, // Singleton instance

    // Phase 4: Advanced Production Features
    HybridOrchestrationEngine,
    StrandsPerformanceOptimizer,
    StrandsEnterpriseSecurity,

    // Utility functions
    isStrandsEnabled: () => strandsConfig.isEnabled(),
    isStrandsAvailable: () => strandsService.isStrandsAvailable(),
    
    // Configuration helpers
    getConfig: () => strandsConfig.getConfig(),
    getConfigSummary: () => strandsConfig.getConfigSummary(),
    
    // Agent management
    registerAgent: (name, instance, options) => strandsService.registerAgent(name, instance, options),
    getRegisteredAgents: () => bridgeManager.getAgentWrappers(),
    
    // Phase 2: Agent wrapping helpers
    wrapAgent: (instance, type, options) => agentWrapperFactory.createWrapper(instance, type, options),
    wrapMultipleAgents: (agents, options) => agentWrapperFactory.createMultipleWrappers(agents, options),
    
    // Monitoring
    getHealthStatus: () => strandsService.getHealthSummary(),
    getMetrics: () => strandsService.getMetrics(),
    exportMetrics: (format) => strandsService.exportMetrics(format),
    
    // Version information
    version: '1.0.0',
    phase: 'Phase 4 - Production Ready with Advanced Features',
    
    // Feature flags
    features: {
        agentWrapping: true,
        healthMonitoring: true,
        metricsCollection: true,
        backwardCompatibility: true,
        dualModeOperation: true,
        orchestrationPatterns: true,  // Phase 2 ✅
        swarmIntelligence: true,      // Phase 2 ✅
        nestedPatterns: true,         // Phase 2 ✅
        hybridOrchestration: true,    // Phase 2 ✅
        advancedHybridOrchestration: true,  // Phase 4 ✅
        performanceOptimization: true,      // Phase 4 ✅
        enterpriseSecurity: true,           // Phase 4 ✅
        comprehensiveTesting: true,         // Phase 4 ✅
        productionReadiness: true           // Phase 4 ✅
    }
};

// Auto-initialize if required
if (process.env.STRANDS_AUTO_INITIALIZE === 'true') {
    initializeStrands()
        .then(result => {
            if (result.success) {
                console.log('Strands framework auto-initialized successfully');
            } else {
                console.warn('Strands framework auto-initialization failed:', result.error);
            }
        })
        .catch(error => {
            console.error('Strands framework auto-initialization error:', error.message);
        });
}