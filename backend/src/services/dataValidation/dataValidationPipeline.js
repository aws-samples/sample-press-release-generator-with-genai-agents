/**
 * Data Validation Pipeline Orchestrator
 * Phase 1 Critical Data Validation Layer - GREEN Phase Implementation
 * 
 * Orchestrates all three critical validation services:
 * - MultiSourceValidator: Addresses data consistency conflicts
 * - TemporalAlignmentValidator: Addresses temporal misalignment
 * - MissingDataIntegrator: Addresses missing critical data
 * 
 * Provides end-to-end validation pipeline with comprehensive reporting
 */

const { performance } = require('perf_hooks');
const MultiSourceValidator = require('./multiSourceValidator');
const TemporalAlignmentValidator = require('./temporalAlignmentValidator');
const MissingDataIntegrator = require('./missingDataIntegrator');

class DataValidationPipeline {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.performanceThreshold = options.performanceThreshold || 15000; // 15 seconds
        this.version = '1.0.0';
        
        // Initialize validation services
        this.multiSourceValidator = new MultiSourceValidator({
            logger: this.logger,
            confidenceThreshold: options.confidenceThreshold || 0.7,
            maxConflictTolerance: options.maxConflictTolerance || 0.02
        });
        
        this.temporalAlignmentValidator = new TemporalAlignmentValidator({
            logger: this.logger,
            standardPeriod: options.standardPeriod || 'monthly',
            maxTemporalDeviation: options.maxTemporalDeviation || 30
        });
        
        this.missingDataIntegrator = new MissingDataIntegrator({
            logger: this.logger,
            fallbackSources: options.fallbackSources || [],
            confidenceThreshold: options.confidenceThreshold || 0.6
        });

        // Pipeline configuration
        this.pipelineConfig = {
            enableMultiSourceValidation: options.enableMultiSourceValidation !== false,
            enableTemporalAlignment: options.enableTemporalAlignment !== false,
            enableMissingDataIntegration: options.enableMissingDataIntegration !== false,
            stopOnCriticalError: options.stopOnCriticalError !== false,
            generateDetailedReport: options.generateDetailedReport !== false
        };
    }

    /**
     * Execute complete validation pipeline
     * @param {Object} originalData - Original data before validation
     * @param {Object} localizedData - Localized market data
     * @param {String} market - Market identifier
     * @returns {Object} Complete validation result
     */
    async executeValidationPipeline(originalData, localizedData, market = null) {
        const startTime = performance.now();
        const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.logger.info(`DataValidationPipeline: Starting validation pipeline ${pipelineId}`);

        const result = {
            pipelineId,
            success: false,
            validatedData: null,
            validationSteps: [],
            overallScore: 0,
            criticalIssues: [],
            recommendations: [],
            performance: {
                totalDuration: 0,
                stepDurations: {},
                withinThreshold: false
            },
            metadata: {
                version: this.version,
                timestamp: new Date().toISOString(),
                market: market,
                configuration: this.pipelineConfig
            }
        };

        try {
            let currentData = { ...localizedData };
            let stepIndex = 0;

            // Step 1: Multi-Source Cross-Validation
            if (this.pipelineConfig.enableMultiSourceValidation) {
                const stepResult = await this.executeMultiSourceValidation(
                    originalData, 
                    currentData, 
                    ++stepIndex
                );
                
                result.validationSteps.push(stepResult);
                
                if (stepResult.criticalIssues.length > 0) {
                    result.criticalIssues.push(...stepResult.criticalIssues);
                    
                    if (this.pipelineConfig.stopOnCriticalError) {
                        result.success = false;
                        result.validatedData = currentData;
                        return this.finalizePipelineResult(result, startTime);
                    }
                }
            }

            // Step 2: Temporal Alignment Validation
            if (this.pipelineConfig.enableTemporalAlignment) {
                const stepResult = await this.executeTemporalAlignment(
                    currentData, 
                    ++stepIndex
                );
                
                result.validationSteps.push(stepResult);
                currentData = stepResult.processedData || currentData;
                
                if (stepResult.criticalIssues.length > 0) {
                    result.criticalIssues.push(...stepResult.criticalIssues);
                    
                    if (this.pipelineConfig.stopOnCriticalError) {
                        result.success = false;
                        result.validatedData = currentData;
                        return this.finalizePipelineResult(result, startTime);
                    }
                }
            }

            // Step 3: Missing Data Integration
            if (this.pipelineConfig.enableMissingDataIntegration) {
                const stepResult = await this.executeMissingDataIntegration(
                    currentData, 
                    market, 
                    ++stepIndex
                );
                
                result.validationSteps.push(stepResult);
                currentData = stepResult.processedData || currentData;
                
                if (stepResult.criticalIssues.length > 0) {
                    result.criticalIssues.push(...stepResult.criticalIssues);
                }
            }

            // Calculate overall validation score
            result.overallScore = this.calculateOverallScore(result.validationSteps);
            
            // Generate recommendations
            result.recommendations = this.generateRecommendations(result);
            
            // Set final success status
            result.success = result.criticalIssues.length === 0 && result.overallScore >= 0.7;
            result.validatedData = currentData;

            return this.finalizePipelineResult(result, startTime);

        } catch (error) {
            this.logger.error(`DataValidationPipeline: Pipeline ${pipelineId} failed`, error);
            
            result.success = false;
            result.criticalIssues.push({
                type: 'pipeline_error',
                severity: 'critical',
                message: `Pipeline execution failed: ${error.message}`,
                step: 'pipeline_orchestration'
            });
            
            return this.finalizePipelineResult(result, startTime);
        }
    }

    /**
     * Execute multi-source validation step
     * @param {Object} originalData - Original data
     * @param {Object} localizedData - Localized data
     * @param {Number} stepIndex - Step index
     * @returns {Object} Step result
     */
    async executeMultiSourceValidation(originalData, localizedData, stepIndex) {
        const stepStartTime = performance.now();
        const stepResult = {
            step: stepIndex,
            name: 'Multi-Source Cross-Validation',
            success: false,
            processedData: localizedData,
            criticalIssues: [],
            warnings: [],
            metrics: {},
            duration: 0
        };

        try {
            this.logger.debug(`DataValidationPipeline: Executing step ${stepIndex} - Multi-Source Validation`);

            // Validate data consistency
            const conflicts = this.multiSourceValidator.validateDataConsistency(
                originalData, 
                localizedData
            );

            // Classify conflicts by severity
            const criticalConflicts = conflicts.filter(c => c.severity === 'critical');
            const warnings = conflicts.filter(c => c.severity !== 'critical');

            stepResult.criticalIssues = criticalConflicts;
            stepResult.warnings = warnings;
            stepResult.metrics = {
                totalConflicts: conflicts.length,
                criticalConflicts: criticalConflicts.length,
                conflictRate: conflicts.length > 0 ? conflicts.length / Object.keys(localizedData).length : 0
            };

            // Cross-validate if multiple sources available
            if (Array.isArray(localizedData.sources) && localizedData.sources.length > 1) {
                const crossValidationResult = await this.multiSourceValidator.crossValidateData(
                    localizedData.sources
                );
                
                stepResult.metrics.crossValidation = {
                    consensus: crossValidationResult.consensus,
                    confidence: crossValidationResult.confidence,
                    sourceCount: crossValidationResult.sourceCount
                };

                if (!crossValidationResult.consensus) {
                    stepResult.warnings.push({
                        type: 'cross_validation_failed',
                        severity: 'medium',
                        message: 'Cross-source validation failed to reach consensus'
                    });
                }
            }

            stepResult.success = criticalConflicts.length === 0;
            stepResult.duration = performance.now() - stepStartTime;

            this.logger.debug(`DataValidationPipeline: Step ${stepIndex} completed in ${stepResult.duration.toFixed(2)}ms`);
            return stepResult;

        } catch (error) {
            this.logger.error(`DataValidationPipeline: Step ${stepIndex} failed`, error);
            
            stepResult.success = false;
            stepResult.criticalIssues.push({
                type: 'step_execution_error',
                severity: 'critical',
                message: `Multi-source validation failed: ${error.message}`
            });
            stepResult.duration = performance.now() - stepStartTime;
            
            return stepResult;
        }
    }

    /**
     * Execute temporal alignment step
     * @param {Object} data - Data to align
     * @param {Number} stepIndex - Step index
     * @returns {Object} Step result
     */
    async executeTemporalAlignment(data, stepIndex) {
        const stepStartTime = performance.now();
        const stepResult = {
            step: stepIndex,
            name: 'Temporal Alignment Validation',
            success: false,
            processedData: data,
            criticalIssues: [],
            warnings: [],
            metrics: {},
            duration: 0
        };

        try {
            this.logger.debug(`DataValidationPipeline: Executing step ${stepIndex} - Temporal Alignment`);

            // Convert data to array format for validation
            const dataPoints = Array.isArray(data) ? data : [data];
            
            // Validate temporal alignment
            const alignmentResult = await this.temporalAlignmentValidator.validateTemporalAlignment(dataPoints);

            // Process alignment conflicts
            const criticalConflicts = alignmentResult.conflicts.filter(c => c.severity === 'critical');
            const warnings = alignmentResult.conflicts.filter(c => c.severity !== 'critical');

            stepResult.criticalIssues = criticalConflicts;
            stepResult.warnings = warnings;
            stepResult.metrics = {
                aligned: alignmentResult.aligned,
                alignmentScore: alignmentResult.alignmentScore,
                totalConflicts: alignmentResult.conflicts.length,
                temporalSummary: alignmentResult.temporalSummary
            };

            // Apply temporal standardization if needed
            if (alignmentResult.standardizedData && alignmentResult.standardizedData.length > 0) {
                stepResult.processedData = Array.isArray(data) ? 
                    alignmentResult.standardizedData : 
                    alignmentResult.standardizedData[0];
            }

            stepResult.success = criticalConflicts.length === 0;
            stepResult.duration = performance.now() - stepStartTime;

            this.logger.debug(`DataValidationPipeline: Step ${stepIndex} completed in ${stepResult.duration.toFixed(2)}ms`);
            return stepResult;

        } catch (error) {
            this.logger.error(`DataValidationPipeline: Step ${stepIndex} failed`, error);
            
            stepResult.success = false;
            stepResult.criticalIssues.push({
                type: 'step_execution_error',
                severity: 'critical',
                message: `Temporal alignment failed: ${error.message}`
            });
            stepResult.duration = performance.now() - stepStartTime;
            
            return stepResult;
        }
    }

    /**
     * Execute missing data integration step
     * @param {Object} data - Data to integrate
     * @param {String} market - Market identifier
     * @param {Number} stepIndex - Step index
     * @returns {Object} Step result
     */
    async executeMissingDataIntegration(data, market, stepIndex) {
        const stepStartTime = performance.now();
        const stepResult = {
            step: stepIndex,
            name: 'Missing Data Integration',
            success: false,
            processedData: data,
            criticalIssues: [],
            warnings: [],
            metrics: {},
            duration: 0
        };

        try {
            this.logger.debug(`DataValidationPipeline: Executing step ${stepIndex} - Missing Data Integration`);

            // Identify missing data
            const missingFields = this.missingDataIntegrator.identifyMissingData(data);
            
            // Integrate missing data
            const integrationResult = await this.missingDataIntegrator.integrateMissingData(data, market);

            // Validate integrated data quality
            const validationResult = this.missingDataIntegrator.validateIntegratedData(
                data, 
                integrationResult.integratedData
            );

            // Process integration issues
            const criticalIssues = validationResult.issues.filter(i => i.severity === 'critical');
            const warnings = validationResult.issues.filter(i => i.severity !== 'critical');

            stepResult.criticalIssues = criticalIssues;
            stepResult.warnings = warnings;
            stepResult.processedData = integrationResult.integratedData;
            stepResult.metrics = {
                missingFieldsCount: integrationResult.missingFieldsCount || 0,
                integratedFieldsCount: integrationResult.integratedFieldsCount || 0,
                integrationRate: integrationResult.integratedFieldsCount / 
                    Math.max(1, integrationResult.missingFieldsCount),
                qualityScore: validationResult.qualityScore,
                completeness: validationResult.completeness,
                confidence: validationResult.confidence
            };

            stepResult.success = integrationResult.success && criticalIssues.length === 0;
            stepResult.duration = performance.now() - stepStartTime;

            this.logger.debug(`DataValidationPipeline: Step ${stepIndex} completed in ${stepResult.duration.toFixed(2)}ms`);
            return stepResult;

        } catch (error) {
            this.logger.error(`DataValidationPipeline: Step ${stepIndex} failed`, error);
            
            stepResult.success = false;
            stepResult.criticalIssues.push({
                type: 'step_execution_error',
                severity: 'critical',
                message: `Missing data integration failed: ${error.message}`
            });
            stepResult.duration = performance.now() - stepStartTime;
            
            return stepResult;
        }
    }

    /**
     * Calculate overall validation score
     * @param {Array} validationSteps - Array of validation step results
     * @returns {Number} Overall score (0-1)
     */
    calculateOverallScore(validationSteps) {
        try {
            if (validationSteps.length === 0) {
                return 0;
            }

            let totalScore = 0;
            let totalWeight = 0;

            // Weight different validation steps
            const stepWeights = {
                'Multi-Source Cross-Validation': 0.4,
                'Temporal Alignment Validation': 0.3,
                'Missing Data Integration': 0.3
            };

            validationSteps.forEach(step => {
                const weight = stepWeights[step.name] || 0.33;
                let stepScore = step.success ? 1.0 : 0.0;

                // Adjust score based on metrics
                if (step.metrics) {
                    if (step.name === 'Multi-Source Cross-Validation' && step.metrics.conflictRate) {
                        stepScore = Math.max(0, 1.0 - step.metrics.conflictRate);
                    } else if (step.name === 'Temporal Alignment Validation' && step.metrics.alignmentScore) {
                        stepScore = step.metrics.alignmentScore;
                    } else if (step.name === 'Missing Data Integration' && step.metrics.qualityScore) {
                        stepScore = step.metrics.qualityScore;
                    }
                }

                totalScore += stepScore * weight;
                totalWeight += weight;
            });

            return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) / 100 : 0;

        } catch (error) {
            this.logger.warn('DataValidationPipeline: Error calculating overall score', error);
            return 0.5;
        }
    }

    /**
     * Generate recommendations based on validation results
     * @param {Object} pipelineResult - Pipeline result object
     * @returns {Array} Array of recommendation objects
     */
    generateRecommendations(pipelineResult) {
        const recommendations = [];

        try {
            // Analyze critical issues
            const criticalIssueTypes = pipelineResult.criticalIssues.map(issue => issue.type);
            const uniqueCriticalTypes = [...new Set(criticalIssueTypes)];

            if (uniqueCriticalTypes.includes('directional_conflict')) {
                recommendations.push({
                    type: 'data_quality',
                    priority: 'high',
                    message: 'Review data sources for directional conflicts - may indicate data collection issues'
                });
            }

            if (uniqueCriticalTypes.includes('mixed_periods')) {
                recommendations.push({
                    type: 'temporal_standardization',
                    priority: 'high',
                    message: 'Standardize temporal periods across all data sources to ensure consistency'
                });
            }

            if (uniqueCriticalTypes.includes('missing_data')) {
                recommendations.push({
                    type: 'data_completeness',
                    priority: 'medium',
                    message: 'Implement additional fallback data sources for missing critical fields'
                });
            }

            // Analyze overall score
            if (pipelineResult.overallScore < 0.7) {
                recommendations.push({
                    type: 'overall_quality',
                    priority: 'high',
                    message: `Overall validation score (${Math.round(pipelineResult.overallScore * 100)}%) is below acceptable threshold`
                });
            }

            // Analyze performance
            if (pipelineResult.performance.totalDuration > this.performanceThreshold) {
                recommendations.push({
                    type: 'performance',
                    priority: 'medium',
                    message: `Validation pipeline exceeded performance threshold (${this.performanceThreshold}ms)`
                });
            }

            // Step-specific recommendations
            pipelineResult.validationSteps.forEach(step => {
                if (step.metrics && step.metrics.conflictRate > 0.15) {
                    recommendations.push({
                        type: 'conflict_rate',
                        priority: 'medium',
                        message: `${step.name} shows high conflict rate (${Math.round(step.metrics.conflictRate * 100)}%)`
                    });
                }
            });

            return recommendations;

        } catch (error) {
            this.logger.warn('DataValidationPipeline: Error generating recommendations', error);
            return [{
                type: 'error',
                priority: 'low',
                message: 'Unable to generate recommendations due to analysis error'
            }];
        }
    }

    /**
     * Finalize pipeline result with performance metrics
     * @param {Object} result - Pipeline result object
     * @param {Number} startTime - Pipeline start time
     * @returns {Object} Finalized result
     */
    finalizePipelineResult(result, startTime) {
        try {
            const totalDuration = performance.now() - startTime;
            
            result.performance.totalDuration = Math.round(totalDuration);
            result.performance.withinThreshold = totalDuration <= this.performanceThreshold;
            
            // Collect step durations
            result.validationSteps.forEach(step => {
                result.performance.stepDurations[step.name] = step.duration;
            });

            // Log pipeline completion
            const status = result.success ? 'SUCCESS' : 'FAILED';
            const criticalCount = result.criticalIssues.length;
            const score = Math.round(result.overallScore * 100);
            
            this.logger.info(
                `DataValidationPipeline: Pipeline ${result.pipelineId} completed - ` +
                `Status: ${status}, Score: ${score}%, "Critical Issues": ${criticalCount}, ` +
                `Duration: ${result.performance.totalDuration}ms`
            );

            return result;

        } catch (error) {
            this.logger.error('DataValidationPipeline: Error finalizing pipeline result', error);
            result.performance.totalDuration = performance.now() - startTime;
            return result;
        }
    }

    /**
     * Get pipeline health status
     * @returns {Object} Health status object
     */
    getHealthStatus() {
        try {
            return {
                status: 'healthy',
                version: this.version,
                services: {
                    multiSourceValidator: 'active',
                    temporalAlignmentValidator: 'active',
                    missingDataIntegrator: 'active'
                },
                configuration: this.pipelineConfig,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('DataValidationPipeline: Error getting health status', error);
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = DataValidationPipeline;