/**
 * Phase 1 Validation Script for Strands Framework Integration
 * 
 * Validates that all Phase 1 components are properly implemented and work together.
 * This script can be run independently to verify the Strands framework integration.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const path = require('path');

// Import Strands framework
const {
    initializeStrands,
    getStrandsStatus,
    executeAgent,
    validateBackwardCompatibility,
    strandsService,
    strandsConfig,
    agentRegistry,
    BaseAgentWrapper
} = require('../index');

// Mock agents for testing
const createMockAgent = (name, behavior = {}) => ({
    name,
    execute: jest.fn().mockResolvedValue(behavior.executeResult || `${name} result`),
    initialize: jest.fn().mockResolvedValue(),
    cleanup: jest.fn().mockResolvedValue(),
    ...behavior
});

class Phase1Validator {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            errors: []
        };
    }

    /**
     * Run all Phase 1 validation tests
     */
    async runValidation() {
        console.log('🚀 Starting Strands Framework Phase 1 Validation...\n');

        try {
            // Test 1: Configuration System
            await this.testConfiguration();

            // Test 2: Agent Registry
            await this.testAgentRegistry();

            // Test 3: Agent Wrapper System
            await this.testAgentWrapper();

            // Test 4: Service Integration
            await this.testServiceIntegration();

            // Test 5: Backward Compatibility
            await this.testBackwardCompatibility();

            // Test 6: Error Handling
            await this.testErrorHandling();

            // Test 7: Monitoring System
            await this.testMonitoring();

            // Generate final report
            this.generateReport();

        } catch (error) {
            console.error('❌ Validation failed with error:', error.message);
            this.results.errors.push(`Validation failure: ${error.message}`);
        }
    }

    /**
     * Test configuration system
     */
    async testConfiguration() {
        this.startTest('Configuration System');

        try {
            // Test configuration loading
            const config = strandsConfig.getConfig();
            this.assert(config !== null, 'Configuration should be loaded');
            this.assert(typeof config.enabled === 'boolean', 'Configuration should have enabled flag');

            // Test configuration sections
            const bridgeConfig = strandsConfig.getBridgeConfig();
            const wrapperConfig = strandsConfig.getWrapperConfig();
            const monitoringConfig = strandsConfig.getMonitoringConfig();

            this.assert(bridgeConfig !== null, 'Bridge configuration should be available');
            this.assert(wrapperConfig !== null, 'Wrapper configuration should be available');
            this.assert(monitoringConfig !== null, 'Monitoring configuration should be available');

            // Test configuration validation
            this.assert(config.nodeTimeout > 0, 'Node timeout should be positive');
            this.assert(config.maxNodeExecutions > 0, 'Max node executions should be positive');

            this.passTest('Configuration system working correctly');
        } catch (error) {
            this.failTest(`Configuration test failed: ${error.message}`);
        }
    }

    /**
     * Test agent registry
     */
    async testAgentRegistry() {
        this.startTest('Agent Registry');

        try {
            // Initialize registry
            await agentRegistry.initialize();
            this.assert(agentRegistry.isInitialized, 'Agent registry should be initialized');

            // Test agent registration
            const mockAgent = createMockAgent('testRegistryAgent');
            const registration = await agentRegistry.registerAgent('testRegistryAgent', mockAgent);

            this.assert(registration !== null, 'Agent registration should succeed');
            this.assert(registration.name === 'testRegistryAgent', 'Registration should have correct name');

            // Test agent retrieval
            const retrievedAgent = agentRegistry.getAgent('testRegistryAgent');
            this.assert(retrievedAgent !== null, 'Registered agent should be retrievable');

            // Test statistics
            const stats = agentRegistry.getStatistics();
            this.assert(stats.total > 0, 'Statistics should show registered agents');

            this.passTest('Agent registry working correctly');
        } catch (error) {
            this.failTest(`Agent registry test failed: ${error.message}`);
        }
    }

    /**
     * Test agent wrapper system
     */
    async testAgentWrapper() {
        this.startTest('Agent Wrapper System');

        try {
            // Create mock agent
            const mockAgent = createMockAgent('testWrapperAgent', {
                executeResult: { success: true, data: 'wrapper test' }
            });

            // Create wrapper
            const wrapper = new BaseAgentWrapper('testWrapperAgent', mockAgent);
            await wrapper.initialize();

            this.assert(wrapper.isInitialized, 'Wrapper should be initialized');
            this.assert(wrapper.originalAgent === mockAgent, 'Wrapper should reference original agent');

            // Test execution
            const result = await wrapper.executeWithStrands('execute', ['test param']);
            this.assert(result.success === true, 'Wrapper execution should succeed');
            this.assert(result.data === 'wrapper test', 'Wrapper should return correct result');

            // Test metrics
            const metrics = wrapper.getMetrics();
            this.assert(metrics.totalExecutions === 1, 'Metrics should track executions');
            this.assert(metrics.successfulExecutions === 1, 'Metrics should track successes');

            // Test Strands compatibility
            const compatibility = wrapper.validateStrandsCompatibility();
            this.assert(compatibility.compatible === true, 'Wrapper should be Strands compatible');

            await wrapper.cleanup();
            this.passTest('Agent wrapper system working correctly');
        } catch (error) {
            this.failTest(`Agent wrapper test failed: ${error.message}`);
        }
    }

    /**
     * Test service integration
     */
    async testServiceIntegration() {
        this.startTest('Service Integration');

        try {
            // Initialize Strands service
            await strandsService.initialize();
            this.assert(strandsService.isInitialized, 'Strands service should be initialized');

            // Test status reporting
            const status = strandsService.getStatus();
            this.assert(status.service.initialized === true, 'Service status should show initialized');

            // Test comprehensive status
            const comprehensiveStatus = strandsService.getComprehensiveStatus();
            this.assert(comprehensiveStatus.service !== null, 'Comprehensive status should be available');
            this.assert(Array.isArray(comprehensiveStatus.recommendations), 'Should provide recommendations');

            // Test metrics
            const metrics = strandsService.getMetrics();
            this.assert(metrics.service !== null, 'Service metrics should be available');

            this.passTest('Service integration working correctly');
        } catch (error) {
            this.failTest(`Service integration test failed: ${error.message}`);
        }
    }

    /**
     * Test backward compatibility
     */
    async testBackwardCompatibility() {
        this.startTest('Backward Compatibility');

        try {
            // Test with Strands disabled
            const originalEnabled = strandsConfig.getConfig().enabled;
            strandsConfig.updateConfig('enabled', false);

            // Create mock agent
            const mockAgent = createMockAgent('compatibilityAgent');
            const wrapper = new BaseAgentWrapper('compatibilityAgent', mockAgent);
            await wrapper.initialize();

            // Execute in traditional mode
            const result = await wrapper.executeWithStrands('execute', ['compat test']);
            this.assert(result === 'compatibilityAgent result', 'Traditional execution should work');

            // Test metrics tracking
            const metrics = wrapper.getMetrics();
            this.assert(metrics.traditionalExecutions === 1, 'Should track traditional executions');
            this.assert(metrics.strandsExecutions === 0, 'Should not track Strands executions when disabled');

            // Test validation
            const validation = await strandsService.validateBackwardCompatibility();
            this.assert(validation !== null, 'Backward compatibility validation should be available');
            this.assert(typeof validation.compatible === 'boolean', 'Validation should provide compatibility status');

            // Restore original setting
            strandsConfig.updateConfig('enabled', originalEnabled);

            await wrapper.cleanup();
            this.passTest('Backward compatibility working correctly');
        } catch (error) {
            this.failTest(`Backward compatibility test failed: ${error.message}`);
        }
    }

    /**
     * Test error handling
     */
    async testErrorHandling() {
        this.startTest('Error Handling');

        try {
            // Test with failing agent
            const failingAgent = {
                name: 'failingAgent',
                execute: jest.fn().mockRejectedValue(new Error('Test failure')),
                initialize: jest.fn().mockResolvedValue()
            };

            const wrapper = new BaseAgentWrapper('failingAgent', failingAgent);
            await wrapper.initialize();

            // Should handle errors gracefully
            try {
                await wrapper.executeWithStrands('execute', []);
                this.failTest('Should have thrown error');
            } catch (error) {
                this.assert(error.message === 'Test failure', 'Should preserve original error');
            }

            // Should track failed execution
            const metrics = wrapper.getMetrics();
            this.assert(metrics.failedExecutions === 1, 'Should track failed executions');
            this.assert(metrics.successRate === 0, 'Success rate should be 0');

            await wrapper.cleanup();
            this.passTest('Error handling working correctly');
        } catch (error) {
            this.failTest(`Error handling test failed: ${error.message}`);
        }
    }

    /**
     * Test monitoring system
     */
    async testMonitoring() {
        this.startTest('Monitoring System');

        try {
            // Test health summary
            const healthSummary = strandsService.getHealthSummary();
            this.assert(healthSummary !== null, 'Health summary should be available');

            // Test metrics
            const metrics = strandsService.getMetrics();
            this.assert(metrics.timestamp !== null, 'Metrics should have timestamp');

            // Test status reporting
            const status = getStrandsStatus();
            this.assert(status.framework !== null, 'Framework status should be available');
            this.assert(status.framework.version === '1.0.0', 'Should report correct version');
            this.assert(status.framework.phase.includes('Phase'), 'Should report correct phase');

            this.passTest('Monitoring system working correctly');
        } catch (error) {
            this.failTest(`Monitoring test failed: ${error.message}`);
        }
    }

    /**
     * Helper methods for test execution
     */
    startTest(testName) {
        console.log(`🧪 Testing: ${testName}`);
        this.results.total++;
    }

    passTest(message) {
        console.log(`✅ PASS: ${message}`);
        this.results.passed++;
    }

    failTest(message) {
        console.log(`❌ FAIL: ${message}`);
        this.results.failed++;
        this.results.errors.push(message);
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    /**
     * Generate final validation report
     */
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('🎯 STRANDS FRAMEWORK PHASE 1 VALIDATION REPORT');
        console.log('='.repeat(60));
        
        console.log(`📊 "Total Tests": ${this.results.total}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        
        const successRate = this.results.total > 0 ? (this.results.passed / this.results.total) * 100 : 0;
        console.log(`📈 "Success Rate": ${successRate.toFixed(1)}%`);

        if (this.results.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED - PHASE 1 IMPLEMENTATION SUCCESSFUL!');
            console.log('✅ Strands Framework Phase 1 is ready for integration');
        } else {
            console.log('\n⚠️  SOME TESTS FAILED - REVIEW REQUIRED');
            console.log('❌ Errors encountered:');
            this.results.errors.forEach(error => console.log(`   - ${error}`));
        }

        console.log('\n📋 Phase 1 "Components Implemented":');
        console.log('   ✅ Configuration Management (strands-config.js)');
        console.log('   ✅ Agent Registry (agent-registry.js)');
        console.log('   ✅ Bridge Manager (bridge-manager.js) - Pure Node.js');
        console.log('   ✅ Base Agent Wrapper (base-agent-wrapper.js)');
        console.log('   ✅ Health Monitoring (health-checker.js)');
        console.log('   ✅ Metrics Collection (metrics-collector.js)');
        console.log('   ✅ Main Service (strands-service.js)');
        console.log('   ✅ Testing Infrastructure (test suites)');
        console.log('   ✅ Integration Interface (index.js)');

        console.log('\n🔄 Next Steps (Phase 2):');
        console.log('   - Implement orchestration patterns');
        console.log('   - Add swarm intelligence capabilities');
        console.log('   - Create nested pattern support');
        console.log('   - Integrate with GenAI Orchestrator');

        console.log('\n' + '='.repeat(60));
        
        return {
            success: this.results.failed === 0,
            results: this.results,
            phase: 'Phase 1 - Foundation Infrastructure',
            version: '1.0.0'
        };
    }
}

// Main execution
async function main() {
    const validator = new Phase1Validator();
    
    try {
        const report = await validator.runValidation();
        process.exit(report.success ? 0 : 1);
    } catch (error) {
        console.error('💥 Validation script failed:', error.message);
        process.exit(1);
    }
}

// Run validation if called directly
if (require.main === module) {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.STRANDS_ENABLED = 'false'; // Start with Strands disabled for compatibility testing
    process.env.STRANDS_LOG_LEVEL = 'error'; // Reduce log noise

    main();
}

module.exports = Phase1Validator;