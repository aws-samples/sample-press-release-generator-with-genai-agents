/**
 * Content Generation Agent Wrappers
 * 
 * Strands-compatible wrappers for content generation agents including
 * ContentAnalyzer, LocalizationEngine, OutputFormatter, PitchEmailExtractor,
 * and ComprehensiveDataExtractor.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const BaseAgentWrapper = require('./base-agent-wrapper');
const { logger } = require('../../../utils/logger');

/**
 * Content Analyzer Agent Wrapper
 */
class ContentAnalyzerWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'content_generation',
            capabilities: ['analysis', 'extraction', 'structure_detection'],
            primaryMethods: ['_performAnalysis', 'extractPRFramework', 'validatePipelineContent']
        });
    }

    async analyzeContent(masterPR, options = {}) {
        return await this.executeWithStrands('_performAnalysis', [masterPR, options]);
    }

    async extractFramework(masterPR, options = {}) {
        return await this.executeWithStrands('extractPRFramework', [masterPR, options]);
    }

    async validateContent(content, marketData, options = {}) {
        return await this.executeWithStrands('validatePipelineContent', [content, marketData, options]);
    }
}

/**
 * Localization Engine Agent Wrapper
 */
class LocalizationEngineWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'content_generation',
            capabilities: ['localization', 'market_adaptation', 'quote_integration'],
            primaryMethods: ['_generateVariant', 'selectMarketQuote', '_analyzeMarketContext']
        });
    }

    async generateVariant(input, options = {}) {
        return await this.executeWithStrands('_generateVariant', [input, options]);
    }

    async selectQuote(marketContext, prVariant, contentTheme = {}) {
        return await this.executeWithStrands('selectMarketQuote', [marketContext, prVariant, contentTheme]);
    }

    async analyzeMarket(marketData, market) {
        return await this.executeWithStrands('_analyzeMarketContext', [marketData, market]);
    }
}

/**
 * Output Formatter Agent Wrapper
 */
class OutputFormatterWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'content_generation',
            capabilities: ['formatting', 'multi_format_output', 'file_management'],
            primaryMethods: ['formatContent', 'getFormattedContent', '_processJSON', '_processTXT', '_processHTML']
        });
    }

    async formatContent(variants, options = {}) {
        return await this.executeWithStrands('formatContent', [variants, options]);
    }

    async getContent(jobId, options = {}) {
        return await this.executeWithStrands('getFormattedContent', [jobId, options]);
    }

    async processJSON(variant, options = {}) {
        return await this.executeWithStrands('_processJSON', [variant, options]);
    }

    async processTXT(variant, options = {}) {
        return await this.executeWithStrands('_processTXT', [variant, options]);
    }

    async processHTML(variant, options = {}) {
        return await this.executeWithStrands('_processHTML', [variant, options]);
    }
}

/**
 * Pitch Email Extractor Agent Wrapper
 */
class PitchEmailExtractorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'content_generation',
            capabilities: ['email_extraction', 'pitch_generation', 'media_outreach'],
            primaryMethods: ['extractPitchData', '_extractHook', '_generateKeyBullets']
        });
    }

    async extractPitch(prContent, marketData, options = {}) {
        return await this.executeWithStrands('extractPitchData', [prContent, marketData, options]);
    }

    async extractHook(contentText, marketData) {
        return await this.executeWithStrands('_extractHook', [contentText, marketData]);
    }

    async generateBullets(metrics, marketData) {
        return await this.executeWithStrands('_generateKeyBullets', [metrics, marketData]);
    }
}

/**
 * Comprehensive Data Extractor Agent Wrapper
 */
class ComprehensiveDataExtractorWrapper extends BaseAgentWrapper {
    constructor(agentInstance, options = {}) {
        super(agentInstance, {
            ...options,
            category: 'content_generation',
            capabilities: ['data_extraction', 'pattern_matching', 'content_analysis'],
            primaryMethods: ['_performComprehensiveExtraction', 'generateExtractionSummary']
        });
    }

    async extractData(content, options = {}) {
        return await this.executeWithStrands('_performComprehensiveExtraction', [content, options]);
    }

    async generateSummary(extractionResults) {
        return await this.executeWithStrands('generateExtractionSummary', [extractionResults]);
    }
}

/**
 * Content Generation Wrapper Factory
 */
class ContentGenerationWrapperFactory {
    static createWrapper(agentInstance, agentType, options = {}) {
        const agentName = agentInstance.constructor.name || agentType;

        switch (true) {
            case agentName.includes('ContentAnalyzer'):
                return new ContentAnalyzerWrapper(agentInstance, options);
            
            case agentName.includes('LocalizationEngine'):
                return new LocalizationEngineWrapper(agentInstance, options);
            
            case agentName.includes('OutputFormatter'):
                return new OutputFormatterWrapper(agentInstance, options);
            
            case agentName.includes('PitchEmailExtractor'):
                return new PitchEmailExtractorWrapper(agentInstance, options);
            
            case agentName.includes('ComprehensiveDataExtractor'):
                return new ComprehensiveDataExtractorWrapper(agentInstance, options);
            
            default:
                logger.warn('Unknown content generation agent type, using base wrapper', {
                    agentName,
                    agentType
                });
                return new BaseAgentWrapper(agentInstance, {
                    ...options,
                    category: 'content_generation'
                });
        }
    }

    static getSupportedAgents() {
        return [
            'ContentAnalyzerAgent',
            'LocalizationEngine',
            'OutputFormatter',
            'PitchEmailExtractor',
            'ComprehensiveDataExtractorAgent'
        ];
    }

    static getWrapperCapabilities() {
        return {
            ContentAnalyzerAgent: ['analysis', 'extraction', 'structure_detection'],
            LocalizationEngine: ['localization', 'market_adaptation', 'quote_integration'],
            OutputFormatter: ['formatting', 'multi_format_output', 'file_management'],
            PitchEmailExtractor: ['email_extraction', 'pitch_generation', 'media_outreach'],
            ComprehensiveDataExtractorAgent: ['data_extraction', 'pattern_matching', 'content_analysis']
        };
    }
}

module.exports = {
    ContentAnalyzerWrapper,
    LocalizationEngineWrapper,
    OutputFormatterWrapper,
    PitchEmailExtractorWrapper,
    ComprehensiveDataExtractorWrapper,
    ContentGenerationWrapperFactory
};