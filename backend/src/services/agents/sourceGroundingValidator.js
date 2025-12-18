/**
 * SourceGroundingValidator - Validates factual accuracy and source grounding
 * Part of the Hallucination Detection System
 */

const BaseAgent = require('./baseAgent');

class SourceGroundingValidator extends BaseAgent {
    constructor() {
        super('SourceGroundingValidator');
        
        // Standard interface properties
        this.version = '1.0.0';
        this.capabilities = [
            'source_grounding_validation',
            'citation_validation',
            'factual_claims_validation',
            'data_consistency_validation',
            'source_verification'
        ];
        this.lastResults = null;
        
        this.initialized = false;
        this.sourceDatabase = new Map();
        this.validationRules = [];
    }

    /**
     * Initialize the source grounding validator
     */
    async initialize() {
        try {
            this.log('Initializing SourceGroundingValidator...');
            
            // Initialize source database and validation rules
            await this.loadSourceDatabase();
            await this.loadValidationRules();
            
            this.initialized = true;
            this.log('SourceGroundingValidator initialized successfully');
            
            return { success: true, message: 'SourceGroundingValidator initialized' };
        } catch (error) {
            this.logError('Failed to initialize SourceGroundingValidator', error);
            throw error;
        }
    }

    /**
     * Load source database for validation
     */
    async loadSourceDatabase() {
        this.log('Loading source database...');
        
        // Mock source database - in real implementation, this would load from external sources
        this.sourceDatabase.set('government', {
            sources: ['census.gov', 'bls.gov', 'hud.gov'],
            reliability: 0.95,
            weight: 1.0
        });
        
        this.sourceDatabase.set('industry', {
            sources: ['nar.realtor', 'mba.org', 'freddiemac.com'],
            reliability: 0.85,
            weight: 0.8
        });
        
        this.sourceDatabase.set('academic', {
            sources: ['harvard.edu', 'stanford.edu', 'mit.edu'],
            reliability: 0.90,
            weight: 0.9
        });
        
        this.log(`Loaded ${this.sourceDatabase.size} source categories`);
    }

    /**
     * Load validation rules
     */
    async loadValidationRules() {
        this.log('Loading validation rules...');
        
        this.validationRules = [
            {
                name: 'source_citation',
                description: 'Check for proper source citations',
                weight: 0.3,
                validator: this.validateSourceCitations.bind(this)
            },
            {
                name: 'fact_verification',
                description: 'Verify factual claims against sources',
                weight: 0.4,
                validator: this.validateFactualClaims.bind(this)
            },
            {
                name: 'data_consistency',
                description: 'Check data consistency across sources',
                weight: 0.3,
                validator: this.validateDataConsistency.bind(this)
            }
        ];
        
        this.log(`Loaded ${this.validationRules.length} validation rules`);
    }

    /**
     * Standard process method - delegates to validateGrounding
     */
    async process(input, options = {}) {
        return await this.validateGrounding(input, options);
    }

    /**
     * Standard validate method - delegates to validateGrounding
     */
    async validate(input, options = {}) {
        return await this.validateGrounding(input, options);
    }

    /**
     * Get processing results
     */
    getResults() {
        return this.lastResults;
    }

    /**
     * Validate sources (standardized method name)
     */
    async validateSources(content, options = {}) {
        return await this.validateGrounding(content, options);
    }

    /**
     * Get source database (standardized method name)
     */
    getSourceDatabase() {
        const database = {};
        for (const [key, value] of this.sourceDatabase) {
            database[key] = value;
        }
        return database;
    }

    /**
     * Main validation method
     */
    async validateGrounding(content, options = {}) {
        if (!this.initialized) {
            throw new Error('SourceGroundingValidator not initialized. Call initialize() first.');
        }

        const startTime = Date.now();
        this.log(`Starting source grounding validation for content (${content.length} chars)`);

        try {
            const results = {
                sourcesFound: 0,
                sourcesValidated: 0,
                groundingScore: 0,
                issues: [],
                details: {}
            };

            // Run all validation rules
            for (const rule of this.validationRules) {
                this.log(`Running validation rule: ${rule.name}`);
                const ruleResult = await rule.validator(content, options);
                results.details[rule.name] = ruleResult;
                
                // Update overall results
                results.sourcesFound += ruleResult.sourcesFound || 0;
                results.sourcesValidated += ruleResult.sourcesValidated || 0;
                results.issues.push(...(ruleResult.issues || []));
            }

            // Calculate overall grounding score
            results.groundingScore = this.calculateGroundingScore(results.details);
            
            const processingTime = Date.now() - startTime;
            this.log(`Source grounding validation completed in ${processingTime}ms`);

            const result = {
                success: true,
                processingTime,
                ...results
            };

            // Store results for getResults() method
            this.lastResults = result;

            return result;

        } catch (error) {
            this.logError('Source grounding validation failed', error);
            
            // Store error result for getResults() method
            const errorResult = {
                success: false,
                processingTime: Date.now() - startTime,
                sourcesFound: 0,
                sourcesValidated: 0,
                groundingScore: 0,
                issues: [{
                    type: 'system_error',
                    message: 'Source grounding validation failed',
                    error: error.message
                }],
                details: {},
                error: error.message
            };
            this.lastResults = errorResult;
            
            throw error;
        }
    }

    /**
     * Validate source citations
     */
    async validateSourceCitations(content, options) {
        this.log('Validating source citations...');
        
        // Mock citation validation
        const citations = this.extractCitations(content);
        const validCitations = citations.filter(citation => this.isValidCitation(citation));
        
        return {
            sourcesFound: citations.length,
            sourcesValidated: validCitations.length,
            score: citations.length > 0 ? validCitations.length / citations.length : 0,
            issues: citations.length === 0 ? ['No citations found'] : []
        };
    }

    /**
     * Validate factual claims
     */
    async validateFactualClaims(content, options) {
        this.log('Validating factual claims...');
        
        // Mock factual validation
        const claims = this.extractFactualClaims(content);
        const verifiedClaims = claims.filter(claim => this.verifyFactualClaim(claim));
        
        return {
            claimsFound: claims.length,
            claimsVerified: verifiedClaims.length,
            score: claims.length > 0 ? verifiedClaims.length / claims.length : 1,
            issues: claims.length - verifiedClaims.length > 0 ? 
                [`${claims.length - verifiedClaims.length} claims could not be verified`] : []
        };
    }

    /**
     * Validate data consistency
     */
    async validateDataConsistency(content, options) {
        this.log('Validating data consistency...');
        
        // Mock consistency validation
        const dataPoints = this.extractDataPoints(content);
        const consistentData = dataPoints.filter(data => this.checkDataConsistency(data));
        
        return {
            dataPointsFound: dataPoints.length,
            consistentDataPoints: consistentData.length,
            score: dataPoints.length > 0 ? consistentData.length / dataPoints.length : 1,
            issues: dataPoints.length - consistentData.length > 0 ? 
                [`${dataPoints.length - consistentData.length} data inconsistencies found`] : []
        };
    }

    /**
     * Extract citations from content
     */
    extractCitations(content) {
        // Mock citation extraction - in real implementation, this would use NLP
        const citationPatterns = [
            /according to [^,.]*/gi,
            /source: [^,.]*/gi,
            /\([^)]*\.gov[^)]*\)/gi,
            /\([^)]*\.org[^)]*\)/gi
        ];
        
        const citations = [];
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        citationPatterns.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            citations.push(...matches);
        });
        
        return citations;
    }

    /**
     * Check if citation is valid
     */
    isValidCitation(citation) {
        // Mock validation - check against known source patterns
        const lowerCitation = citation.toLowerCase();
        
        for (const [category, data] of this.sourceDatabase) {
            if (data.sources.some(source => lowerCitation.includes(source))) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Extract factual claims from content
     */
    extractFactualClaims(content) {
        // Mock claim extraction - in real implementation, this would use NLP
        const claimPatterns = [
            /\d+(\.\d+)?%/g,  // Percentages
            /\$[\d,]+/g,      // Dollar amounts
            /\d{4}/g          // Years
        ];
        
        const claims = [];
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        claimPatterns.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            claims.push(...matches);
        });
        
        return claims;
    }

    /**
     * Verify a factual claim
     */
    verifyFactualClaim(claim) {
        // Mock verification - in real implementation, this would check against databases
        // For now, assume most claims are verifiable
        return Math.random() > 0.2; // 80% verification rate
    }

    /**
     * Extract data points from content
     */
    extractDataPoints(content) {
        // Mock data extraction
        return this.extractFactualClaims(content);
    }

    /**
     * Check data consistency
     */
    checkDataConsistency(dataPoint) {
        // Mock consistency check
        return Math.random() > 0.1; // 90% consistency rate
    }

    /**
     * Calculate overall grounding score
     */
    calculateGroundingScore(details) {
        let totalScore = 0;
        let totalWeight = 0;
        
        this.validationRules.forEach(rule => {
            const ruleResult = details[rule.name];
            if (ruleResult && ruleResult.score !== undefined) {
                totalScore += ruleResult.score * rule.weight;
                totalWeight += rule.weight;
            }
        });
        
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    /**
     * Alias for validateGrounding to match test expectations
     */
    async validateSourceGrounding(content, options = {}) {
        return await this.validateGrounding(content, options);
    }

    /**
     * Get validator status
     */
    getStatus() {
        return {
            initialized: this.initialized,
            sourceCategories: this.sourceDatabase.size,
            validationRules: this.validationRules.length,
            ready: this.initialized
        };
    }
}

module.exports = SourceGroundingValidator;