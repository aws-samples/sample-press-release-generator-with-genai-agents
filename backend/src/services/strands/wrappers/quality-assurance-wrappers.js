/**
 * Quality Assurance Agent Wrappers
 * 
 * Strands-compatible wrappers for quality assurance agents including
 * QualityValidator, ConsistencyChecker, HallucinationDetector, and StyleGuideService.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const BaseAgentWrapper = require('./base-agent-wrapper');
const { logger } = require('../../../utils/logger');

/**
 * Quality Validator Agent Wrapper
 */
class QualityValidatorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'quality_assurance',
            capabilities: ['quality_assessment', 'multi_dimensional_validation', 'scoring'],
            primaryMethods: ['_validateVariants', '_validateSingleVariant', '_assessAccuracy', '_assessConsistency']
        });
    }

    async validateVariants(variants, options = {}) {
        return await this.executeWithStrands('_validateVariants', [variants, options]);
    }

    async validateSingle(variant, options = {}) {
        return await this.executeWithStrands('_validateSingleVariant', [variant, options]);
    }

    async assessAccuracy(variant) {
        return await this.executeWithStrands('_assessAccuracy', [variant]);
    }

    async assessConsistency(variant) {
        return await this.executeWithStrands('_assessConsistency', [variant]);
    }

    async assessReadability(variant) {
        return await this.executeWithStrands('_assessReadability', [variant]);
    }

    async assessBrandCompliance(variant) {
        return await this.executeWithStrands('_assessBrandCompliance', [variant]);
    }

    async assessLocalization(variant) {
        return await this.executeWithStrands('_assessLocalizationQuality', [variant]);
    }
}

/**
 * Consistency Checker Agent Wrapper
 */
class ConsistencyCheckerWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'quality_assurance',
            capabilities: ['consistency_validation', 'cross_source_analysis', 'outlier_detection'],
            primaryMethods: ['validateCrossSourceConsistency', 'detectOutliers', 'performStatisticalAnalysis']
        });
    }

    async validateConsistency(sources, claim) {
        return await this.executeWithStrands('validateCrossSourceConsistency', [sources, claim]);
    }

    async detectOutliers(dataPoints) {
        return await this.executeWithStrands('detectOutliers', [dataPoints]);
    }

    async performAnalysis(sources) {
        return await this.executeWithStrands('performStatisticalAnalysis', [sources]);
    }

    async checkClaimConsistency(sources, claims) {
        return await this.executeWithStrands('checkConsistencyAcrossClaims', [sources, claims]);
    }
}

/**
 * Hallucination Detector Agent Wrapper
 */
class HallucinationDetectorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'quality_assurance',
            capabilities: ['hallucination_detection', 'source_grounding', 'authority_validation'],
            primaryMethods: ['detectHallucinations', 'extractFramework', 'validateSourceGrounding']
        });
    }

    async detectHallucinations(content, options = {}) {
        return await this.executeWithStrands('detectHallucinations', [content, options]);
    }

    async extractFramework(content) {
        return await this.executeWithStrands('extractFramework', [content]);
    }

    async validateGrounding(content, frameworkResult) {
        return await this.executeWithStrands('validateSourceGrounding', [content, frameworkResult]);
    }

    async validateCrossReferences(content, groundingResult) {
        return await this.executeWithStrands('validateCrossReferences', [content, groundingResult]);
    }

    async validateAuthority(content, crossRefResult) {
        return await this.executeWithStrands('validateAuthority', [content, crossRefResult]);
    }
}

/**
 * Style Guide Service Agent Wrapper
 */
class StyleGuideServiceWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'quality_assurance',
            capabilities: ['style_validation', 'ap_style_compliance', 'seo_optimization'],
            primaryMethods: ['_validateStyle', '_validateAPStyle', '_assessSEOOptimization']
        });
    }

    async validateStyle(content, options = {}) {
        return await this.executeWithStrands('_validateStyle', [content, options]);
    }

    async validateAPStyle(content) {
        return await this.executeWithStrands('_validateAPStyle', [content]);
    }

    async assessSEO(content, market) {
        return await this.executeWithStrands('_assessSEOOptimization', [content, market]);
    }

    async generateMultimediaHooks(content, market) {
        return await this.executeWithStrands('_generateMultimediaHooks', [content, market]);
    }

    async assessBoilerplate(content) {
        return await this.executeWithStrands('_assessBoilerplateQuality', [content]);
    }
}

/**
 * Quality Assurance Wrapper Factory
 */
class QualityAssuranceWrapperFactory {
    static createWrapper(agentInstance, agentType, options = {}) {
        const agentName = agentInstance.constructor.name || agentType;

        switch (true) {
            case agentName.includes('QualityValidator'):
                return new QualityValidatorWrapper(agentInstance, options);
            
            case agentName.includes('ConsistencyChecker'):
                return new ConsistencyCheckerWrapper(agentInstance, options);
            
            case agentName.includes('HallucinationDetector'):
                return new HallucinationDetectorWrapper(agentInstance, options);
            
            case agentName.includes('StyleGuideService'):
                return new StyleGuideServiceWrapper(agentInstance, options);
            
            default:
                logger.warn('Unknown quality assurance agent type, using base wrapper', {
                    agentName,
                    agentType
                });
                return new BaseAgentWrapper(agentInstance, {
                    ...options,
                    category: 'quality_assurance'
                });
        }
    }

    static getSupportedAgents() {
        return [
            'QualityValidator',
            'ConsistencyChecker',
            'HallucinationDetector',
            'StyleGuideService'
        ];
    }

    static getWrapperCapabilities() {
        return {
            QualityValidator: ['quality_assessment', 'multi_dimensional_validation', 'scoring'],
            ConsistencyChecker: ['consistency_validation', 'cross_source_analysis', 'outlier_detection'],
            HallucinationDetector: ['hallucination_detection', 'source_grounding', 'authority_validation'],
            StyleGuideService: ['style_validation', 'ap_style_compliance', 'seo_optimization']
        };
    }
}

module.exports = {
    QualityValidatorWrapper,
    ConsistencyCheckerWrapper,
    HallucinationDetectorWrapper,
    StyleGuideServiceWrapper,
    QualityAssuranceWrapperFactory
};