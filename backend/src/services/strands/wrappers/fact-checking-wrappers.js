/**
 * Fact-Checking Agent Wrappers
 * 
 * Strands-compatible wrappers for specialized fact-checking agents including
 * ConfidenceScorer, CrossMarketValidator, RealTimeDataVerifier, SemanticValidator,
 * SourceTracker, and StatisticalChecker.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const BaseAgentWrapper = require('./base-agent-wrapper');
const { logger } = require('../../../utils/logger');

/**
 * Confidence Scorer Agent Wrapper
 */
class ConfidenceScorerWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['confidence_scoring', 'risk_assessment', 'validation_weighting'],
            primaryMethods: ['calculateConfidence', 'getConfidenceStatistics']
        });
    }

    async calculateConfidence(validationResults, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('calculateConfidence', [validationResults, content, marketContext, options]);
    }

    async getStatistics() {
        return await this.executeWithStrands('getConfidenceStatistics', []);
    }
}

/**
 * Cross Market Validator Agent Wrapper
 */
class CrossMarketValidatorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['cross_market_validation', 'statistical_consistency', 'outlier_detection'],
            primaryMethods: ['validateClaims']
        });
    }

    async validateClaims(claims, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('validateClaims', [claims, content, marketContext, options]);
    }
}

/**
 * Real Time Data Verifier Agent Wrapper
 */
class RealTimeDataVerifierWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['real_time_verification', 'multi_source_validation', 'data_scraping'],
            primaryMethods: ['verifyClaims']
        });
    }

    async verifyClaims(claims, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('verifyClaims', [claims, content, marketContext, options]);
    }
}

/**
 * Semantic Validator Agent Wrapper
 */
class SemanticValidatorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['semantic_validation', 'logical_consistency', 'contradiction_detection'],
            primaryMethods: ['validateClaims']
        });
    }

    async validateClaims(claims, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('validateClaims', [claims, content, marketContext, options]);
    }
}

/**
 * Source Tracker Agent Wrapper
 */
class SourceTrackerWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['source_attribution', 'reliability_tracking', 'citation_validation'],
            primaryMethods: ['validateClaims']
        });
    }

    async validateClaims(claims, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('validateClaims', [claims, content, marketContext, options]);
    }
}

/**
 * Statistical Checker Agent Wrapper
 */
class StatisticalCheckerWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'fact_checking',
            capabilities: ['statistical_validation', 'numerical_analysis', 'data_plausibility'],
            primaryMethods: ['validateClaims']
        });
    }

    async validateClaims(claims, content, marketContext = {}, options = {}) {
        return await this.executeWithStrands('validateClaims', [claims, content, marketContext, options]);
    }
}

/**
 * Fact-Checking Wrapper Factory
 */
class FactCheckingWrapperFactory {
    static createWrapper(agentInstance, agentType, options = {}) {
        const agentName = agentInstance.constructor.name || agentType;

        switch (true) {
            case agentName.includes('ConfidenceScorer'):
                return new ConfidenceScorerWrapper(agentInstance, options);
            
            case agentName.includes('CrossMarketValidator'):
                return new CrossMarketValidatorWrapper(agentInstance, options);
            
            case agentName.includes('RealTimeDataVerifier'):
                return new RealTimeDataVerifierWrapper(agentInstance, options);
            
            case agentName.includes('SemanticValidator'):
                return new SemanticValidatorWrapper(agentInstance, options);
            
            case agentName.includes('SourceTracker'):
                return new SourceTrackerWrapper(agentInstance, options);
            
            case agentName.includes('StatisticalChecker'):
                return new StatisticalCheckerWrapper(agentInstance, options);
            
            default:
                logger.warn('Unknown fact-checking agent type, using base wrapper', {
                    agentName,
                    agentType
                });
                return new BaseAgentWrapper(agentInstance, {
                    ...options,
                    category: 'fact_checking'
                });
        }
    }

    static getSupportedAgents() {
        return [
            'ConfidenceScorer',
            'CrossMarketValidator',
            'RealTimeDataVerifier',
            'SemanticValidator',
            'SourceTracker',
            'StatisticalChecker'
        ];
    }

    static getWrapperCapabilities() {
        return {
            ConfidenceScorer: ['confidence_scoring', 'risk_assessment', 'validation_weighting'],
            CrossMarketValidator: ['cross_market_validation', 'statistical_consistency', 'outlier_detection'],
            RealTimeDataVerifier: ['real_time_verification', 'multi_source_validation', 'data_scraping'],
            SemanticValidator: ['semantic_validation', 'logical_consistency', 'contradiction_detection'],
            SourceTracker: ['source_attribution', 'reliability_tracking', 'citation_validation'],
            StatisticalChecker: ['statistical_validation', 'numerical_analysis', 'data_plausibility']
        };
    }
}

module.exports = {
    ConfidenceScorerWrapper,
    CrossMarketValidatorWrapper,
    RealTimeDataVerifierWrapper,
    SemanticValidatorWrapper,
    SourceTrackerWrapper,
    StatisticalCheckerWrapper,
    FactCheckingWrapperFactory
};