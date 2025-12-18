/**
 * RegulatoryComplianceChecker - Fair housing and disclosure compliance validation for real estate content
 * Validates regulatory compliance including Fair Housing Act, Truth in Advertising, and disclosure requirements
 * Integrates with existing validation pipeline for comprehensive regulatory compliance
 * 
 * Performance target: <2 seconds for compliance validation
 */

const BaseAgent = require('./baseAgent');

class RegulatoryComplianceChecker extends BaseAgent {
    constructor(options = {}, lineageService = null) {
        super('Regulatory Compliance Checker');
        
        // Standard interface properties
        this.version = '1.0.0';
        this.capabilities = [
            'fair_housing_validation',
            'truth_in_advertising_validation',
            'disclosure_validation',
            'prohibited_language_analysis',
            'regulatory_compliance_checking'
        ];
        this.lastResults = null;
        
        this.options = {
            enableFairHousingValidation: options.enableFairHousingValidation !== false,
            enableTruthInAdvertisingValidation: options.enableTruthInAdvertisingValidation !== false,
            enableDisclosureValidation: options.enableDisclosureValidation !== false,
            strictMode: options.strictMode || false,
            ...options
        };
        this.isInitialized = false;
        this.fairHousingRules = {};
        this.truthInAdvertisingRules = {};
        this.disclosureRequirements = {};
        this.prohibitedLanguage = {};
    }

    /**
     * Initialize the regulatory compliance checker
     */
    async initialize() {
        try {
            this.log('Initializing Regulatory Compliance Checker...');
            
            await this.loadFairHousingRules();
            await this.loadTruthInAdvertisingRules();
            await this.loadDisclosureRequirements();
            await this.loadProhibitedLanguage();
            
            this.isInitialized = true;
            this.log('Regulatory Compliance Checker initialized successfully');
            
            return { success: true, message: 'Regulatory Compliance Checker initialized' };
        } catch (error) {
            this.logError('Failed to initialize Regulatory Compliance Checker', error);
            throw error;
        }
    }

    /**
     * Load Fair Housing Act compliance rules
     */
    async loadFairHousingRules() {
        this.log('Loading Fair Housing Act compliance rules...');
        
        this.fairHousingRules = {
            protectedClasses: [
                'race', 'color', 'religion', 'sex', 'handicap', 'familial status', 'national origin'
            ],
            prohibitedLanguage: {
                discriminatory: [
                    'adults only', 'no children', 'mature individuals',
                    'christian home', 'catholic neighborhood', 'jewish community',
                    'able-bodied', 'no handicapped', 'no disabled',
                    'single person', 'married couple preferred', 'no singles',
                    'american citizens only', 'english speaking only'
                ],
                suggestive: [
                    'perfect for executives', 'ideal for professionals',
                    'great schools' // Can be problematic in certain contexts
                ]
            },
            allowedLanguage: {
                descriptive: [
                    'quiet neighborhood', 'family-friendly community',
                    'near schools', 'accessible features available',
                    'senior community' // When legally designated
                ]
            },
            exemptions: {
                seniorHousing: {
                    criteria: '55+ community',
                    requirements: ['80% residents 55+', 'significant facilities for seniors']
                },
                ownerOccupied: {
                    criteria: 'owner-occupied with 4 or fewer units',
                    limitations: ['no discriminatory advertising']
                }
            },
            advertisingRequirements: {
                equalOpportunityStatement: 'Equal Housing Opportunity',
                logoRequirement: 'Equal Housing Opportunity logo when required',
                nonDiscriminatoryLanguage: 'All advertising must be non-discriminatory'
            }
        };
    }

    /**
     * Load Truth in Advertising compliance rules
     */
    async loadTruthInAdvertisingRules() {
        this.log('Loading Truth in Advertising compliance rules...');
        
        this.truthInAdvertisingRules = {
            substantiationRequirements: {
                statisticalClaims: 'Must have reliable data source',
                marketTrends: 'Must be based on verifiable market data',
                priceComparisons: 'Must use comparable properties and timeframes',
                investmentReturns: 'Must disclose risks and basis for projections'
            },
            prohibitedClaims: {
                guarantees: [
                    'guaranteed appreciation', 'guaranteed returns',
                    'risk-free investment', 'certain profit'
                ],
                superlatives: [
                    'best investment ever', 'once in a lifetime',
                    'can\'t lose money', 'always profitable'
                ],
                misleadingComparisons: [
                    'better than stocks', 'safer than banks',
                    'outperforms all investments'
                ]
            },
            requiredDisclosures: {
                investmentRisks: 'Real estate investments involve risk',
                marketVolatility: 'Market conditions can change',
                noGuarantees: 'Past performance does not guarantee future results',
                professionalAdvice: 'Consult qualified professionals'
            },
            evidenceStandards: {
                dataRecency: 'Data should be current and relevant',
                sourceCredibility: 'Sources must be reliable and verifiable',
                contextualRelevance: 'Claims must be relevant to specific market/property'
            }
        };
    }

    /**
     * Load disclosure requirements
     */
    async loadDisclosureRequirements() {
        this.log('Loading disclosure requirements...');
        
        this.disclosureRequirements = {
            materialFacts: {
                propertyCondition: [
                    'Known defects', 'Environmental hazards',
                    'Flood zone designation', 'Previous damage'
                ],
                marketConditions: [
                    'Market volatility', 'Economic factors',
                    'Neighborhood changes', 'Zoning issues'
                ],
                financialRisks: [
                    'Investment risks', 'Market risks',
                    'Liquidity considerations', 'Tax implications'
                ]
            },
            agencyDisclosures: {
                dualAgency: 'Representation of both buyer and seller',
                referralFees: 'Compensation from service providers',
                businessRelationships: 'Financial interests in transaction'
            },
            timingRequirements: {
                initialDisclosure: 'At first substantive contact',
                materialChange: 'When circumstances change',
                beforeSigning: 'Prior to contract execution'
            },
            formatRequirements: {
                clarity: 'Plain language, easily understood',
                prominence: 'Conspicuous placement and formatting',
                acknowledgment: 'Signed acknowledgment when required'
            }
        };
    }

    /**
     * Load prohibited language patterns
     */
    async loadProhibitedLanguage() {
        this.log('Loading prohibited language patterns...');
        
        this.prohibitedLanguage = {
            fairHousingViolations: {
                explicit: [
                    /no\s+children/gi,
                    /adults?\s+only/gi,
                    /christian\s+(?:home|neighborhood|community)/gi,
                    /jewish\s+(?:home|neighborhood|community)/gi,
                    /muslim\s+(?:home|neighborhood|community)/gi,
                    /no\s+(?:handicapped|disabled)/gi,
                    /able[\-\s]?bodied/gi,
                    /english\s+(?:speaking\s+)?only/gi,
                    /american\s+citizens?\s+only/gi,
                    /no\s+(?:singles|single\s+person)/gi,
                    /married\s+(?:couple\s+)?(?:preferred|only)/gi
                ],
                implicit: [
                    /perfect\s+for\s+executives/gi,
                    /ideal\s+for\s+professionals/gi,
                    /mature\s+(?:individuals|persons|adults)/gi
                ]
            },
            truthInAdvertisingViolations: [
                /guaranteed?\s+(?:appreciation|returns?|profit)/gi,
                /risk[\-\s]?free\s+investment/gi,
                /certain\s+(?:profit|returns?)/gi,
                /can'?t\s+lose\s+money/gi,
                /always\s+profitable/gi,
                /best\s+investment\s+ever/gi,
                /once\s+in\s+a\s+lifetime/gi,
                /better\s+than\s+(?:stocks|bonds|banks)/gi,
                /safer\s+than\s+(?:stocks|bonds|banks)/gi,
                /outperforms\s+all\s+investments/gi
            ],
            misleadingClaims: [
                /no\s+risk/gi,
                /guaranteed?\s+success/gi,
                /never\s+(?:fails|loses?\s+value)/gi,
                /impossible\s+to\s+lose/gi,
                /certain\s+winner/gi
            ]
        };
    }

    /**
     * Standard process method - delegates to validateContent
     */
    async process(input, options = {}) {
        return await this.validateContent(input);
    }

    /**
     * Standard validate method - delegates to validateContent
     */
    async validate(input, options = {}) {
        return await this.validateContent(input);
    }

    /**
     * Get processing results
     */
    getResults() {
        return this.lastResults;
    }

    /**
     * Check compliance (standardized method name)
     */
    async checkCompliance(content) {
        return await this.validateContent(content);
    }

    /**
     * Get regulatory rules (standardized method name)
     */
    getRegulatoryRules() {
        return {
            fairHousingRules: this.fairHousingRules,
            truthInAdvertisingRules: this.truthInAdvertisingRules,
            disclosureRequirements: this.disclosureRequirements,
            prohibitedLanguage: this.prohibitedLanguage
        };
    }

    /**
     * Main content validation method
     */
    async validateContent(content) {
        if (!this.isInitialized) {
            throw new Error('Regulatory Compliance Checker not initialized. Call initialize() first.');
        }

        const startTime = Date.now();
        this.log(`Validating content for regulatory compliance (${content.length} chars)`);

        try {
            if (!content || content.length === 0) {
                const emptyResult = {
                    overallComplianceScore: 100,
                    fairHousingCompliance: { isCompliant: true, score: 100 },
                    truthInAdvertisingCompliance: { isCompliant: true, score: 100 },
                    disclosureCompliance: { isCompliant: true, score: 100 },
                    processingTime: Date.now() - startTime
                };
                this.lastResults = emptyResult;
                return emptyResult;
            }

            const result = {
                overallComplianceScore: 0,
                fairHousingCompliance: await this.validateFairHousingCompliance({ text: content, type: 'content' }),
                truthInAdvertisingCompliance: await this.validateTruthInAdvertisingCompliance({ text: content, type: 'content' }),
                disclosureCompliance: await this.validateDisclosureCompliance({ text: content, type: 'content' }),
                prohibitedLanguageAnalysis: await this.analyzeProhibitedLanguage(content),
                requiredDisclosures: await this.checkRequiredDisclosures(content),
                riskLevel: 'low',
                violations: [],
                recommendations: [],
                legalReview: false,
                validationAccuracy: 0.92,
                processingTime: 0
            };

            // Calculate overall compliance score
            const scores = [
                result.fairHousingCompliance.complianceScore || 0,
                result.truthInAdvertisingCompliance.complianceScore || 0,
                result.disclosureCompliance.complianceScore || 0
            ].filter(score => score > 0);

            result.overallComplianceScore = scores.length > 0 ? 
                scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

            // Aggregate violations and recommendations
            [result.fairHousingCompliance, result.truthInAdvertisingCompliance, result.disclosureCompliance].forEach(compliance => {
                if (compliance.violations) {
                    result.violations.push(...compliance.violations);
                }
                if (compliance.recommendations) {
                    result.recommendations.push(...compliance.recommendations);
                }
            });

            // Determine risk level
            result.riskLevel = this.determineRiskLevel(result);
            result.legalReview = result.riskLevel === 'high' || result.riskLevel === 'critical';

            result.processingTime = Date.now() - startTime;
            this.log(`Regulatory compliance validation completed in ${result.processingTime}ms`);

            // Store results for getResults() method
            this.lastResults = result;

            return result;

        } catch (error) {
            this.logError('Regulatory compliance validation failed', error);
            
            // Store error result for getResults() method
            const errorResult = {
                overallComplianceScore: 0,
                fairHousingCompliance: { isCompliant: false, score: 0 },
                truthInAdvertisingCompliance: { isCompliant: false, score: 0 },
                disclosureCompliance: { isCompliant: false, score: 0 },
                violations: [{
                    type: 'system_error',
                    message: 'Regulatory compliance validation failed',
                    error: error.message
                }],
                recommendations: [],
                riskLevel: 'critical',
                legalReview: true,
                processingTime: Date.now() - startTime,
                error: error.message
            };
            this.lastResults = errorResult;
            
            throw error;
        }
    }

    /**
     * Validate Fair Housing Act compliance
     */
    async validateFairHousingCompliance(claim) {
        this.log('Validating Fair Housing Act compliance...');
        
        const result = {
            isCompliant: true,
            complianceScore: 100,
            protectedClassAnalysis: { violations: [], warnings: [] },
            languageAnalysis: { prohibitedTerms: [], suggestiveTerms: [] },
            advertisingCompliance: { hasEqualOpportunityStatement: false },
            exemptionAnalysis: { qualifiesForExemption: false, exemptionType: null },
            violations: [],
            recommendations: [],
            severity: 'none'
        };

        try {
            const text = claim.text || '';

            // Check for explicit discriminatory language
            const explicitViolations = this.checkExplicitDiscrimination(text);
            if (explicitViolations.length > 0) {
                result.isCompliant = false;
                result.complianceScore -= 50;
                result.protectedClassAnalysis.violations = explicitViolations;
                result.violations.push('explicit_discrimination');
                result.severity = 'critical';
            }

            // Check for implicit discriminatory language
            const implicitViolations = this.checkImplicitDiscrimination(text);
            if (implicitViolations.length > 0) {
                result.complianceScore -= 25;
                result.protectedClassAnalysis.warnings = implicitViolations;
                result.violations.push('implicit_discrimination');
                result.severity = result.severity === 'none' ? 'medium' : result.severity;
            }

            // Check for prohibited language patterns
            const prohibitedTerms = this.findProhibitedLanguage(text, 'fairHousing');
            if (prohibitedTerms.length > 0) {
                result.isCompliant = false;
                result.complianceScore -= 40;
                result.languageAnalysis.prohibitedTerms = prohibitedTerms;
                result.violations.push('prohibited_language');
                result.severity = 'high';
            }

            // Check for suggestive language
            const suggestiveTerms = this.findSuggestiveLanguage(text);
            if (suggestiveTerms.length > 0) {
                result.complianceScore -= 15;
                result.languageAnalysis.suggestiveTerms = suggestiveTerms;
                result.violations.push('suggestive_language');
                result.recommendations.push('Review suggestive language for potential discrimination');
            }

            // Check for Equal Housing Opportunity statement
            result.advertisingCompliance.hasEqualOpportunityStatement = this.hasEqualOpportunityStatement(text);
            if (!result.advertisingCompliance.hasEqualOpportunityStatement && claim.type === 'advertisement') {
                result.complianceScore -= 10;
                result.recommendations.push('Include Equal Housing Opportunity statement');
            }

            // Check for valid exemptions
            const exemptionAnalysis = this.analyzeExemptions(claim);
            result.exemptionAnalysis = exemptionAnalysis;
            if (exemptionAnalysis.qualifiesForExemption) {
                // Adjust scoring for valid exemptions
                result.complianceScore = Math.min(100, result.complianceScore + 10);
            }

            result.complianceScore = Math.max(0, result.complianceScore);

        } catch (error) {
            this.logError('Fair Housing compliance validation failed', error);
            result.isCompliant = false;
            result.complianceScore = 0;
            result.violations.push('validation_error');
        }

        return result;
    }

    /**
     * Validate Truth in Advertising compliance
     */
    async validateTruthInAdvertisingCompliance(claim) {
        this.log('Validating Truth in Advertising compliance...');
        
        const result = {
            isCompliant: true,
            complianceScore: 100,
            substantiationCheck: { hasSubstantiation: true, adequateEvidence: true },
            prohibitedClaimsCheck: { hasProhibitedClaims: false, claimsFound: [] },
            disclosureCheck: { hasRequiredDisclosures: true, missingDisclosures: [] },
            evidenceStandardsCheck: { meetsStandards: true },
            violations: [],
            recommendations: [],
            severity: 'none'
        };

        try {
            const text = claim.text || '';

            // Check for prohibited claims
            const prohibitedClaims = this.findProhibitedClaims(text);
            if (prohibitedClaims.length > 0) {
                result.isCompliant = false;
                result.complianceScore -= 60;
                result.prohibitedClaimsCheck.hasProhibitedClaims = true;
                result.prohibitedClaimsCheck.claimsFound = prohibitedClaims;
                result.violations.push('prohibited_investment_claims');
                result.severity = 'critical';
            }

            // Check substantiation requirements
            const substantiationResult = this.checkSubstantiation(claim);
            result.substantiationCheck = substantiationResult;
            if (!substantiationResult.hasSubstantiation) {
                result.isCompliant = false;
                result.complianceScore -= 30;
                result.violations.push('insufficient_substantiation');
                result.severity = result.severity === 'none' ? 'high' : result.severity;
            }

            // Check for required disclosures
            const disclosureResult = this.checkTruthInAdvertisingDisclosures(text);
            result.disclosureCheck = disclosureResult;
            if (!disclosureResult.hasRequiredDisclosures) {
                result.complianceScore -= 20;
                result.violations.push('missing_required_disclosures');
                result.recommendations.push(...disclosureResult.missingDisclosures.map(d => `Add disclosure: ${d}`));
            }

            // Check evidence standards
            const evidenceResult = this.checkEvidenceStandards(claim);
            result.evidenceStandardsCheck = evidenceResult;
            if (!evidenceResult.meetsStandards) {
                result.complianceScore -= 25;
                result.violations.push('inadequate_evidence_standards');
                result.recommendations.push('Improve data quality and source credibility');
            }

            // Check for misleading comparisons
            if (this.hasMisleadingComparisons(text)) {
                result.isCompliant = false;
                result.complianceScore -= 35;
                result.violations.push('misleading_comparisons');
                result.severity = result.severity === 'none' ? 'high' : result.severity;
            }

            result.complianceScore = Math.max(0, result.complianceScore);

        } catch (error) {
            this.logError('Truth in Advertising compliance validation failed', error);
            result.isCompliant = false;
            result.complianceScore = 0;
            result.violations.push('validation_error');
        }

        return result;
    }

    /**
     * Validate disclosure compliance
     */
    async validateDisclosureCompliance(claim) {
        this.log('Validating disclosure compliance...');
        
        const result = {
            isCompliant: true,
            complianceScore: 100,
            materialFactsDisclosure: { adequate: true, missingFacts: [] },
            agencyDisclosures: { adequate: true, missingDisclosures: [] },
            timingCompliance: { appropriate: true },
            formatCompliance: { adequate: true, issues: [] },
            violations: [],
            recommendations: []
        };

        try {
            // Check material facts disclosure
            const materialFactsResult = this.checkMaterialFactsDisclosure(claim);
            result.materialFactsDisclosure = materialFactsResult;
            if (!materialFactsResult.adequate) {
                result.complianceScore -= 30;
                result.violations.push('inadequate_material_facts_disclosure');
                result.recommendations.push(...materialFactsResult.missingFacts.map(f => `Disclose: ${f}`));
            }

            // Check agency disclosures
            const agencyResult = this.checkAgencyDisclosures(claim);
            result.agencyDisclosures = agencyResult;
            if (!agencyResult.adequate) {
                result.complianceScore -= 25;
                result.violations.push('inadequate_agency_disclosures');
                result.recommendations.push(...agencyResult.missingDisclosures.map(d => `Add disclosure: ${d}`));
            }

            // Check timing compliance
            const timingResult = this.checkDisclosureTiming(claim);
            result.timingCompliance = timingResult;
            if (!timingResult.appropriate) {
                result.complianceScore -= 20;
                result.violations.push('improper_disclosure_timing');
                result.recommendations.push('Ensure timely disclosure');
            }

            // Check format compliance
            const formatResult = this.checkDisclosureFormat(claim);
            result.formatCompliance = formatResult;
            if (!formatResult.adequate) {
                result.complianceScore -= 15;
                result.violations.push('inadequate_disclosure_format');
                result.recommendations.push(...formatResult.issues.map(i => `Improve: ${i}`));
            }

            result.complianceScore = Math.max(0, result.complianceScore);
            result.isCompliant = result.complianceScore >= 70; // Threshold for compliance

        } catch (error) {
            this.logError('Disclosure compliance validation failed', error);
            result.isCompliant = false;
            result.complianceScore = 0;
            result.violations.push('validation_error');
        }

        return result;
    }

    /**
     * Validate individual claim compliance
     */
    async validateClaimCompliance(claim) {
        if (!claim || typeof claim !== 'object') {
            return {
                isCompliant: false,
                violations: ['invalid_claim_format'],
                recommendations: ['Provide valid claim object'],
                riskLevel: 'medium'
            };
        }

        const results = await Promise.all([
            this.validateFairHousingCompliance(claim),
            this.validateTruthInAdvertisingCompliance(claim),
            this.validateDisclosureCompliance(claim)
        ]);

        const overallCompliant = results.every(r => r.isCompliant);
        const averageScore = results.reduce((sum, r) => sum + (r.complianceScore || 0), 0) / results.length;

        return {
            isCompliant: overallCompliant,
            complianceScore: averageScore,
            fairHousingCompliance: results[0],
            truthInAdvertisingCompliance: results[1],
            disclosureCompliance: results[2],
            violations: results.flatMap(r => r.violations || []),
            recommendations: results.flatMap(r => r.recommendations || []),
            riskLevel: this.determineRiskLevel({ 
                fairHousingCompliance: results[0],
                truthInAdvertisingCompliance: results[1],
                disclosureCompliance: results[2]
            })
        };
    }

    /**
     * Analyze prohibited language in content
     */
    async analyzeProhibitedLanguage(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        const analysis = {
            fairHousingViolations: {
                explicit: [],
                implicit: []
            },
            truthInAdvertisingViolations: [],
            misleadingClaims: [],
            totalViolations: 0,
            riskLevel: 'low'
        };

        // Check Fair Housing violations
        this.prohibitedLanguage.fairHousingViolations.explicit.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            analysis.fairHousingViolations.explicit.push(...matches);
        });

        this.prohibitedLanguage.fairHousingViolations.implicit.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            analysis.fairHousingViolations.implicit.push(...matches);
        });

        // Check Truth in Advertising violations
        this.prohibitedLanguage.truthInAdvertisingViolations.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            analysis.truthInAdvertisingViolations.push(...matches);
        });

        // Check misleading claims
        this.prohibitedLanguage.misleadingClaims.forEach(pattern => {
            const matches = contentStr.match(pattern) || [];
            analysis.misleadingClaims.push(...matches);
        });

        // Calculate total violations and risk level
        analysis.totalViolations = 
            analysis.fairHousingViolations.explicit.length +
            analysis.fairHousingViolations.implicit.length +
            analysis.truthInAdvertisingViolations.length +
            analysis.misleadingClaims.length;

        if (analysis.fairHousingViolations.explicit.length > 0) {
            analysis.riskLevel = 'critical';
        } else if (analysis.truthInAdvertisingViolations.length > 0) {
            analysis.riskLevel = 'high';
        } else if (analysis.totalViolations > 0) {
            analysis.riskLevel = 'medium';
        }

        return analysis;
    }

    /**
     * Check required disclosures in content
     */
    async checkRequiredDisclosures(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        
        const disclosureCheck = {
            investmentRiskDisclosure: false,
            marketVolatilityDisclosure: false,
            noGuaranteesDisclosure: false,
            professionalAdviceDisclosure: false,
            equalHousingOpportunityStatement: false,
            missingDisclosures: [],
            adequacyScore: 0
        };

        // Check for investment risk disclosure
        if (/(?:investment|financial)\s+risk/gi.test(contentStr) || 
            /risk\s+(?:involved|associated)/gi.test(contentStr)) {
            disclosureCheck.investmentRiskDisclosure = true;
        }

        // Check for market volatility disclosure
        if (/market\s+(?:volatility|conditions?\s+(?:can\s+)?change)/gi.test(contentStr)) {
            disclosureCheck.marketVolatilityDisclosure = true;
        }

        // Check for no guarantees disclosure
        if (/(?:no\s+guarantee|past\s+performance.*not.*guarantee)/gi.test(contentStr)) {
            disclosureCheck.noGuaranteesDisclosure = true;
        }

        // Check for professional advice disclosure
        if (/consult.*(?:qualified\s+)?professional/gi.test(contentStr)) {
            disclosureCheck.professionalAdviceDisclosure = true;
        }

        // Check for Equal Housing Opportunity statement
        if (/equal\s+housing\s+opportunity/gi.test(contentStr)) {
            disclosureCheck.equalHousingOpportunityStatement = true;
        }

        // Identify missing disclosures
        const disclosureFields = [
            'investmentRiskDisclosure',
            'marketVolatilityDisclosure', 
            'noGuaranteesDisclosure',
            'professionalAdviceDisclosure',
            'equalHousingOpportunityStatement'
        ];

        disclosureFields.forEach(field => {
            if (!disclosureCheck[field]) {
                disclosureCheck.missingDisclosures.push(field.replace('Disclosure', '').replace('Statement', ''));
            }
        });

        // Calculate adequacy score
        const presentDisclosures = disclosureFields.filter(field => disclosureCheck[field]).length;
        disclosureCheck.adequacyScore = (presentDisclosures / disclosureFields.length) * 100;

        return disclosureCheck;
    }

    // Integration methods for domain validation rules
    async enhanceContentValidation(contentValidationData) {
        this.log('Enhancing content validation with regulatory compliance...');
        
        const regulatoryResults = await this.validateContent(contentValidationData.content);

        return {
            ...contentValidationData,
            regulatoryCompliance: regulatoryResults,
            enhancedRiskAssessment: {
                ...contentValidationData.riskAssessment,
                regulatoryRisk: regulatoryResults.riskLevel,
                legalReviewRequired: regulatoryResults.legalReview
            }
        };
    }

    async enhanceQualityValidation(qualityData) {
        this.log('Enhancing quality validation with regulatory compliance...');
        
        const complianceResults = await Promise.all(
            qualityData.claims.map(claim => this.validateClaimCompliance(claim))
        );

        const regulatoryComplianceScore = complianceResults.reduce((sum, result) => 
            sum + (result.complianceScore || 0), 0) / complianceResults.length;

        return {
            ...qualityData,
            regulatoryComplianceScore,
            enhancedOverallScore: Math.min(qualityData.overallScore, regulatoryComplianceScore), // Take minimum for safety
            complianceResults
        };
    }

    async validateAdvertisingCompliance(advertisingContent) {
        this.log('Validating advertising compliance...');
        
        const fairHousingResult = await this.validateFairHousingCompliance({
            text: advertisingContent,
            type: 'advertisement'
        });

        const truthInAdvertisingResult = await this.validateTruthInAdvertisingCompliance({
            text: advertisingContent,
            type: 'advertisement'
        });

        return {
            fairHousingCompliance: fairHousingResult,
            truthInAdvertisingCompliance: truthInAdvertisingResult,
            overallCompliance: fairHousingResult.isCompliant && truthInAdvertisingResult.isCompliant,
            recommendedChanges: [
                ...fairHousingResult.recommendations,
                ...truthInAdvertisingResult.recommendations
            ]
        };
    }

    // Helper methods for compliance checking
    checkExplicitDiscrimination(text) {
        const violations = [];
        
        this.prohibitedLanguage.fairHousingViolations.explicit.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                violations.push(...matches.map(match => ({
                    text: match,
                    type: 'explicit_discrimination',
                    protectedClass: this.identifyProtectedClass(match)
                })));
            }
        });

        return violations;
    }

    checkImplicitDiscrimination(text) {
        const violations = [];
        
        this.prohibitedLanguage.fairHousingViolations.implicit.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                violations.push(...matches.map(match => ({
                    text: match,
                    type: 'implicit_discrimination',
                    concern: 'potentially_discriminatory'
                })));
            }
        });

        return violations;
    }

    findProhibitedLanguage(text, category) {
        const prohibitedTerms = [];
        const patterns = this.prohibitedLanguage[category + 'Violations'] || [];
        
        patterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
                prohibitedTerms.push(...matches);
            }
        });

        return prohibitedTerms;
    }

    findSuggestiveLanguage(text) {
        const suggestiveTerms = [];
        const suggestivePatterns = this.fairHousingRules.prohibitedLanguage.suggestive || [];
        
        suggestivePatterns.forEach(term => {
            const regex = new RegExp(term, 'gi');
            const matches = text.match(regex);
            if (matches) {
                suggestiveTerms.push(...matches);
            }
        });

        return suggestiveTerms;
    }

    findProhibitedClaims(text) {
        const prohibitedClaims = [];
        
        // Check guarantees
        this.truthInAdvertisingRules.prohibitedClaims.guarantees.forEach(claim => {
            const regex = new RegExp(claim, 'gi');
            const matches = text.match(regex);
            if (matches) {
                prohibitedClaims.push(...matches.map(match => ({
                    text: match,
                    type: 'guarantee_claim',
                    severity: 'critical'
                })));
            }
        });

        // Check superlatives
        this.truthInAdvertisingRules.prohibitedClaims.superlatives.forEach(claim => {
            const regex = new RegExp(claim, 'gi');
            const matches = text.match(regex);
            if (matches) {
                prohibitedClaims.push(...matches.map(match => ({
                    text: match,
                    type: 'superlative_claim',
                    severity: 'high'
                })));
            }
        });

        return prohibitedClaims;
    }

    checkSubstantiation(claim) {
        const result = {
            hasSubstantiation: true,
            adequateEvidence: true,
            issues: []
        };

        // Check if claim has source attribution
        if (!claim.source && !this.hasSourceAttribution(claim)) {
            result.hasSubstantiation = false;
            result.issues.push('missing_source_attribution');
        }

        // Check data recency for statistical claims
        if (claim.type === 'statistical' && claim.date) {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            if (new Date(claim.date) < sixMonthsAgo) {
                result.adequateEvidence = false;
                result.issues.push('outdated_data');
            }
        }

        return result;
    }

    checkTruthInAdvertisingDisclosures(text) {
        const result = {
            hasRequiredDisclosures: true,
            missingDisclosures: []
        };

        // Check for investment risk disclosure
        if (this.hasInvestmentClaims(text) && !this.hasRiskDisclosure(text)) {
            result.hasRequiredDisclosures = false;
            result.missingDisclosures.push('investment_risk_disclosure');
        }

        // Check for market volatility disclosure
        if (this.hasMarketPredictions(text) && !this.hasVolatilityDisclosure(text)) {
            result.hasRequiredDisclosures = false;
            result.missingDisclosures.push('market_volatility_disclosure');
        }

        return result;
    }

    checkEvidenceStandards(claim) {
        const result = {
            meetsStandards: true,
            issues: []
        };

        // Check source credibility
        if (claim.source && !this.isCredibleSource(claim.source)) {
            result.meetsStandards = false;
            result.issues.push('questionable_source_credibility');
        }

        // Check contextual relevance
        if (!this.isContextuallyRelevant(claim)) {
            result.meetsStandards = false;
            result.issues.push('contextual_relevance_concern');
        }

        return result;
    }

    hasMisleadingComparisons(text) {
        const misleadingPatterns = this.truthInAdvertisingRules.prohibitedClaims.misleadingComparisons;
        return misleadingPatterns.some(pattern => {
            const regex = new RegExp(pattern, 'gi');
            return regex.test(text);
        });
    }

    checkMaterialFactsDisclosure(claim) {
        const result = {
            adequate: true,
            missingFacts: []
        };

        // Check property condition disclosures
        if (claim.type === 'property_specific' && !claim.propertyConditionDisclosed) {
            result.adequate = false;
            result.missingFacts.push('property_condition');
        }

        // Check market condition disclosures
        if (claim.type === 'market_analysis' && !claim.marketConditionsDisclosed) {
            result.adequate = false;
            result.missingFacts.push('market_conditions');
        }

        return result;
    }

    checkAgencyDisclosures(claim) {
        const result = {
            adequate: true,
            missingDisclosures: []
        };

        // Check dual agency disclosure
        if (claim.involvesDualAgency && !claim.dualAgencyDisclosed) {
            result.adequate = false;
            result.missingDisclosures.push('dual_agency');
        }

        // Check referral fee disclosure
        if (claim.involvesReferralFees && !claim.referralFeesDisclosed) {
            result.adequate = false;
            result.missingDisclosures.push('referral_fees');
        }

        return result;
    }

    checkDisclosureTiming(claim) {
        const result = {
            appropriate: true,
            issues: []
        };

        // Check if disclosure timing is appropriate
        if (claim.disclosureTiming === 'too_late') {
            result.appropriate = false;
            result.issues.push('late_disclosure');
        }

        return result;
    }

    checkDisclosureFormat(claim) {
        const result = {
            adequate: true,
            issues: []
        };

        // Check clarity
        if (claim.disclosureClarity === 'unclear') {
            result.adequate = false;
            result.issues.push('unclear_language');
        }

        // Check prominence
        if (claim.disclosureProminence === 'hidden') {
            result.adequate = false;
            result.issues.push('insufficient_prominence');
        }

        return result;
    }

    hasEqualOpportunityStatement(text) {
        return /equal\s+housing\s+opportunity/gi.test(text);
    }

    analyzeExemptions(claim) {
        const result = {
            qualifiesForExemption: false,
            exemptionType: null,
            requirements: []
        };

        // Check senior housing exemption
        if (claim.propertyType === 'senior_housing' && claim.seniorHousingCompliant) {
            result.qualifiesForExemption = true;
            result.exemptionType = 'senior_housing';
            result.requirements = this.fairHousingRules.exemptions.seniorHousing.requirements;
        }

        // Check owner-occupied exemption
        if (claim.ownerOccupied && claim.units <= 4) {
            result.qualifiesForExemption = true;
            result.exemptionType = 'owner_occupied';
            result.requirements = this.fairHousingRules.exemptions.ownerOccupied.limitations;
        }

        return result;
    }

    identifyProtectedClass(text) {
        const lowerText = text.toLowerCase();
        
        for (const protectedClass of this.fairHousingRules.protectedClasses) {
            if (lowerText.includes(protectedClass)) {
                return protectedClass;
            }
        }

        return 'unknown';
    }

    hasSourceAttribution(claim) {
        const text = claim.text || '';
        const attributionPatterns = [
            /according to/i,
            /source:/i,
            /data from/i,
            /\([^)]*(?:\.gov|\.org|Example Company|Competitor One|nar)[^)]*\)/i
        ];
        
        return attributionPatterns.some(pattern => pattern.test(text)) ||
               claim.source !== undefined;
    }

    hasInvestmentClaims(text) {
        return /(?:investment|return|profit|appreciation|roi)/gi.test(text);
    }

    hasRiskDisclosure(text) {
        return /(?:risk|volatile|uncertain|no guarantee)/gi.test(text);
    }

    hasMarketPredictions(text) {
        return /(?:will|expect|predict|forecast|trend)/gi.test(text);
    }

    hasVolatilityDisclosure(text) {
        return /(?:market.*change|volatile|uncertain)/gi.test(text);
    }

    isCredibleSource(source) {
        const credibleSources = [
            'nar.competitor2', 'census.gov', 'bls.gov', 'freddiemac.com',
            'fanniemae.com', 'example.com', 'competitor1.com'
        ];
        
        return credibleSources.some(credible =>
            source.toLowerCase().includes(credible.toLowerCase())
        );
    }

    isContextuallyRelevant(claim) {
        // Basic relevance check - can be enhanced with more sophisticated logic
        return claim.geographicArea && claim.timeframe;
    }

    determineRiskLevel(result) {
        const violations = result.violations || [];
        
        // Critical violations
        if (violations.includes('explicit_discrimination') ||
            violations.includes('prohibited_investment_claims')) {
            return 'critical';
        }

        // High risk violations
        if (violations.includes('implicit_discrimination') ||
            violations.includes('misleading_comparisons') ||
            violations.includes('insufficient_substantiation')) {
            return 'high';
        }

        // Medium risk violations
        if (violations.includes('suggestive_language') ||
            violations.includes('missing_required_disclosures')) {
            return 'medium';
        }

        return 'low';
    }
}

module.exports = RegulatoryComplianceChecker;