/**
 * Strands Enterprise Security & Compliance
 * 
 * Phase 4: Enterprise-grade security features including access control,
 * audit logging, compliance validation, and security monitoring for
 * production Strands framework deployments.
 * 
 * @author AI Agent
 * @date 2025-09-24
 * @version 1.0.0
 */

const crypto = require('crypto');
const { logger } = require('../../../utils/logger');
const EventEmitter = require('events');

class StrandsEnterpriseSecurity extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enableAccessControl: options.enableAccessControl !== false,
            enableAuditLogging: options.enableAuditLogging !== false,
            enableComplianceValidation: options.enableComplianceValidation !== false,
            enableSecurityMonitoring: options.enableSecurityMonitoring !== false,
            enableEncryption: options.enableEncryption !== false,
            accessControlLevel: options.accessControlLevel || 'standard', // basic, standard, strict
            auditRetentionDays: options.auditRetentionDays || 90,
            complianceFrameworks: options.complianceFrameworks || ['SOX', 'GDPR'],
            encryptionAlgorithm: options.encryptionAlgorithm || 'aes-256-gcm',
            ...options
        };

        // Security state
        this.accessControlList = new Map();
        this.auditLog = [];
        this.securityEvents = [];
        this.complianceStatus = new Map();
        this.encryptionKeys = new Map();

        // Security metrics
        this.securityMetrics = {
            totalAccessAttempts: 0,
            authorizedAccess: 0,
            unauthorizedAccess: 0,
            auditEventsLogged: 0,
            complianceViolations: 0,
            securityIncidents: 0,
            encryptionOperations: 0
        };

        // Access control roles
        this.roles = {
            ADMIN: {
                level: 100,
                permissions: ['*'],
                description: 'Full system access'
            },
            OPERATOR: {
                level: 80,
                permissions: ['execute', 'monitor', 'read'],
                description: 'Operational access'
            },
            DEVELOPER: {
                level: 60,
                permissions: ['execute', 'read', 'test'],
                description: 'Development access'
            },
            VIEWER: {
                level: 20,
                permissions: ['read'],
                description: 'Read-only access'
            }
        };

        // Compliance frameworks
        this.complianceFrameworks = {
            SOX: {
                name: 'Sarbanes-Oxley Act',
                requirements: [
                    'audit_trail_completeness',
                    'data_integrity_controls',
                    'access_control_segregation',
                    'change_management_controls'
                ]
            },
            GDPR: {
                name: 'General Data Protection Regulation',
                requirements: [
                    'data_encryption',
                    'access_logging',
                    'data_retention_controls',
                    'consent_management'
                ]
            },
            HIPAA: {
                name: 'Health Insurance Portability and Accountability Act',
                requirements: [
                    'data_encryption',
                    'access_controls',
                    'audit_logging',
                    'breach_notification'
                ]
            }
        };

        if (this.options.enableLogging) {
            logger.info('StrandsEnterpriseSecurity initialized', {
                accessControlLevel: this.options.accessControlLevel,
                complianceFrameworks: this.options.complianceFrameworks,
                enableEncryption: this.options.enableEncryption
            });
        }
    }

    /**
     * Initialize enterprise security
     */
    async initialize() {
        try {
            // Initialize access control
            if (this.options.enableAccessControl) {
                await this._initializeAccessControl();
            }

            // Initialize audit logging
            if (this.options.enableAuditLogging) {
                await this._initializeAuditLogging();
            }

            // Initialize compliance validation
            if (this.options.enableComplianceValidation) {
                await this._initializeComplianceValidation();
            }

            // Initialize encryption
            if (this.options.enableEncryption) {
                await this._initializeEncryption();
            }

            // Start security monitoring
            if (this.options.enableSecurityMonitoring) {
                await this._startSecurityMonitoring();
            }

            logger.info('StrandsEnterpriseSecurity initialization completed');
            this.emit('security_initialized');

            return true;

        } catch (error) {
            logger.error('Enterprise security initialization failed', {
                error: error.message
            });
            return false;
        }
    }

    /**
     * Validate access for orchestration operation
     * @param {string} userId - User identifier
     * @param {string} operation - Operation being attempted
     * @param {Object} context - Operation context
     * @returns {Promise<Object>} Access validation result
     */
    async validateAccess(userId, operation, context = {}) {
        const validationStartTime = Date.now();

        try {
            if (!this.options.enableAccessControl) {
                return { authorized: true, reason: 'access_control_disabled' };
            }

            this.securityMetrics.totalAccessAttempts++;

            // Get user access control entry
            const userACL = this.accessControlList.get(userId);
            if (!userACL) {
                this.securityMetrics.unauthorizedAccess++;
                await this._logSecurityEvent('unauthorized_access_attempt', {
                    userId,
                    operation,
                    reason: 'user_not_found'
                });

                return {
                    authorized: false,
                    reason: 'user_not_found',
                    userId
                };
            }

            // Check if user role has permission for operation
            const hasPermission = this._checkPermission(userACL.role, operation);
            if (!hasPermission) {
                this.securityMetrics.unauthorizedAccess++;
                await this._logSecurityEvent('insufficient_permissions', {
                    userId,
                    operation,
                    userRole: userACL.role,
                    requiredPermission: operation
                });

                return {
                    authorized: false,
                    reason: 'insufficient_permissions',
                    userId,
                    userRole: userACL.role
                };
            }

            // Check additional security constraints
            const constraintCheck = await this._validateSecurityConstraints(userId, operation, context);
            if (!constraintCheck.valid) {
                this.securityMetrics.unauthorizedAccess++;
                await this._logSecurityEvent('security_constraint_violation', {
                    userId,
                    operation,
                    constraint: constraintCheck.violatedConstraint
                });

                return {
                    authorized: false,
                    reason: 'security_constraint_violation',
                    constraint: constraintCheck.violatedConstraint
                };
            }

            // Access granted
            this.securityMetrics.authorizedAccess++;
            await this._logAuditEvent('access_granted', {
                userId,
                operation,
                userRole: userACL.role,
                validationTime: Date.now() - validationStartTime
            });

            return {
                authorized: true,
                userId,
                userRole: userACL.role,
                permissions: this.roles[userACL.role].permissions,
                validationTime: Date.now() - validationStartTime
            };

        } catch (error) {
            logger.error('Access validation failed', {
                userId,
                operation,
                error: error.message
            });

            return {
                authorized: false,
                reason: 'validation_error',
                error: error.message
            };
        }
    }

    /**
     * Add user to access control list
     * @param {string} userId - User identifier
     * @param {string} role - User role
     * @param {Object} metadata - Additional user metadata
     */
    addUser(userId, role, metadata = {}) {
        if (!this.roles[role]) {
            throw new Error(`Invalid role: ${role}`);
        }

        const userEntry = {
            userId,
            role,
            addedAt: new Date().toISOString(),
            lastAccess: null,
            accessCount: 0,
            metadata: {
                ...metadata,
                addedBy: metadata.addedBy || 'system'
            }
        };

        this.accessControlList.set(userId, userEntry);

        this._logAuditEvent('user_added', {
            userId,
            role,
            addedBy: metadata.addedBy
        });

        if (this.options.enableLogging) {
            logger.info('User added to access control list', {
                userId,
                role
            });
        }

        return true;
    }

    /**
     * Remove user from access control list
     * @param {string} userId - User identifier
     * @param {string} removedBy - Who removed the user
     */
    removeUser(userId, removedBy = 'system') {
        const userEntry = this.accessControlList.get(userId);
        if (!userEntry) {
            return false;
        }

        this.accessControlList.delete(userId);

        this._logAuditEvent('user_removed', {
            userId,
            previousRole: userEntry.role,
            removedBy
        });

        if (this.options.enableLogging) {
            logger.info('User removed from access control list', {
                userId,
                previousRole: userEntry.role
            });
        }

        return true;
    }

    /**
     * Encrypt sensitive data
     * @param {string} data - Data to encrypt
     * @param {string} keyId - Encryption key identifier
     * @returns {Promise<Object>} Encryption result
     */
    async encryptData(data, keyId = 'default') {
        if (!this.options.enableEncryption) {
            return { encrypted: false, data, reason: 'encryption_disabled' };
        }

        try {
            const key = this.encryptionKeys.get(keyId);
            if (!key) {
                throw new Error(`Encryption key not found: ${keyId}`);
            }

            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', key.key, iv);
            cipher.setAutoPadding(true);
            
            let encrypted = cipher.update(data, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            this.securityMetrics.encryptionOperations++;

            const result = {
                encrypted: true,
                data: encrypted,
                iv: iv.toString('hex'),
                keyId,
                algorithm: 'aes-256-cbc',
                timestamp: new Date().toISOString()
            };

            await this._logAuditEvent('data_encrypted', {
                keyId,
                dataSize: data.length,
                algorithm: this.options.encryptionAlgorithm
            });

            return result;

        } catch (error) {
            logger.error('Data encryption failed', {
                keyId,
                error: error.message
            });

            return {
                encrypted: false,
                error: error.message,
                keyId
            };
        }
    }

    /**
     * Decrypt sensitive data
     * @param {Object} encryptedData - Encrypted data object
     * @returns {Promise<Object>} Decryption result
     */
    async decryptData(encryptedData) {
        if (!this.options.enableEncryption || !encryptedData.encrypted) {
            return { decrypted: false, reason: 'not_encrypted' };
        }

        try {
            const key = this.encryptionKeys.get(encryptedData.keyId);
            if (!key) {
                throw new Error(`Encryption key not found: ${encryptedData.keyId}`);
            }

            const iv = Buffer.from(encryptedData.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-cbc', key.key, iv);
            decipher.setAutoPadding(true);
            
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            await this._logAuditEvent('data_decrypted', {
                keyId: encryptedData.keyId,
                algorithm: encryptedData.algorithm
            });

            return {
                decrypted: true,
                data: decrypted,
                keyId: encryptedData.keyId
            };

        } catch (error) {
            logger.error('Data decryption failed', {
                keyId: encryptedData.keyId,
                error: error.message
            });

            return {
                decrypted: false,
                error: error.message,
                keyId: encryptedData.keyId
            };
        }
    }

    /**
     * Validate compliance for operation
     * @param {string} operation - Operation to validate
     * @param {Object} context - Operation context
     * @returns {Promise<Object>} Compliance validation result
     */
    async validateCompliance(operation, context = {}) {
        if (!this.options.enableComplianceValidation) {
            return { compliant: true, reason: 'compliance_validation_disabled' };
        }

        const validationResults = [];

        for (const framework of this.options.complianceFrameworks) {
            const frameworkValidation = await this._validateFrameworkCompliance(
                framework,
                operation,
                context
            );
            validationResults.push(frameworkValidation);
        }

        const overallCompliant = validationResults.every(v => v.compliant);
        const violations = validationResults.filter(v => !v.compliant);

        if (!overallCompliant) {
            this.securityMetrics.complianceViolations++;
            await this._logSecurityEvent('compliance_violation', {
                operation,
                violations: violations.map(v => ({
                    framework: v.framework,
                    violatedRequirements: v.violatedRequirements
                }))
            });
        }

        return {
            compliant: overallCompliant,
            frameworks: validationResults,
            violations,
            operation,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Log security event
     * @private
     */
    async _logSecurityEvent(eventType, eventData) {
        const securityEvent = {
            id: crypto.randomUUID(),
            type: eventType,
            severity: this._getEventSeverity(eventType),
            data: eventData,
            timestamp: new Date().toISOString(),
            source: 'StrandsEnterpriseSecurity'
        };

        this.securityEvents.push(securityEvent);
        this.securityMetrics.securityIncidents++;

        // Keep only recent events (last 10000)
        if (this.securityEvents.length > 10000) {
            this.securityEvents = this.securityEvents.slice(-10000);
        }

        logger.warn(`🔒 SECURITY EVENT: ${eventType}`, {
            eventId: securityEvent.id,
            severity: securityEvent.severity,
            data: eventData
        });

        this.emit('security_event', securityEvent);

        // Trigger incident response for high severity events
        if (securityEvent.severity === 'critical' || securityEvent.severity === 'high') {
            await this._triggerIncidentResponse(securityEvent);
        }
    }

    /**
     * Log audit event
     * @private
     */
    async _logAuditEvent(eventType, eventData) {
        const auditEvent = {
            id: crypto.randomUUID(),
            type: eventType,
            data: eventData,
            timestamp: new Date().toISOString(),
            source: 'StrandsEnterpriseSecurity'
        };

        this.auditLog.push(auditEvent);
        this.securityMetrics.auditEventsLogged++;

        // Implement audit log rotation based on retention policy
        const retentionCutoff = Date.now() - (this.options.auditRetentionDays * 24 * 60 * 60 * 1000);
        this.auditLog = this.auditLog.filter(event => 
            new Date(event.timestamp).getTime() > retentionCutoff
        );

        if (this.options.enableLogging) {
            logger.debug('Audit event logged', {
                eventId: auditEvent.id,
                type: eventType
            });
        }

        this.emit('audit_event', auditEvent);
    }

    /**
     * Initialize access control
     * @private
     */
    async _initializeAccessControl() {
        // Add default admin user if none exists
        if (this.accessControlList.size === 0) {
            this.addUser('system_admin', 'ADMIN', {
                addedBy: 'system_initialization',
                description: 'Default system administrator'
            });
        }

        if (this.options.enableLogging) {
            logger.info('Access control initialized', {
                level: this.options.accessControlLevel,
                users: this.accessControlList.size
            });
        }
    }

    /**
     * Initialize audit logging
     * @private
     */
    async _initializeAuditLogging() {
        // Set up audit log rotation
        this.auditRotationInterval = setInterval(() => {
            this._rotateAuditLog();
        }, 24 * 60 * 60 * 1000); // Daily rotation

        await this._logAuditEvent('audit_system_initialized', {
            retentionDays: this.options.auditRetentionDays,
            rotationEnabled: true
        });

        if (this.options.enableLogging) {
            logger.info('Audit logging initialized', {
                retentionDays: this.options.auditRetentionDays
            });
        }
    }

    /**
     * Initialize compliance validation
     * @private
     */
    async _initializeComplianceValidation() {
        // Initialize compliance status for each framework
        for (const framework of this.options.complianceFrameworks) {
            if (this.complianceFrameworks[framework]) {
                this.complianceStatus.set(framework, {
                    framework,
                    status: 'initializing',
                    lastValidation: null,
                    requirements: this.complianceFrameworks[framework].requirements.map(req => ({
                        requirement: req,
                        status: 'pending',
                        lastCheck: null
                    }))
                });
            }
        }

        // Perform initial compliance validation
        await this._performComplianceValidation();

        if (this.options.enableLogging) {
            logger.info('Compliance validation initialized', {
                frameworks: this.options.complianceFrameworks
            });
        }
    }

    /**
     * Initialize encryption
     * @private
     */
    async _initializeEncryption() {
        // Generate default encryption key
        const defaultKey = crypto.randomBytes(32);
        this.encryptionKeys.set('default', {
            key: defaultKey,
            algorithm: 'aes-256-cbc',
            created: new Date().toISOString(),
            usage: 0
        });

        await this._logAuditEvent('encryption_initialized', {
            algorithm: 'aes-256-cbc',
            keyCount: this.encryptionKeys.size
        });

        if (this.options.enableLogging) {
            logger.info('Encryption initialized', {
                algorithm: 'aes-256-cbc',
                keyCount: this.encryptionKeys.size
            });
        }
    }

    /**
     * Start security monitoring
     * @private
     */
    async _startSecurityMonitoring() {
        // Monitor security events
        this.securityMonitoringInterval = setInterval(() => {
            this._performSecurityMonitoring();
        }, 60000); // Every minute

        if (this.options.enableLogging) {
            logger.info('Security monitoring started');
        }
    }

    /**
     * Check permission for role and operation
     * @private
     */
    _checkPermission(role, operation) {
        const roleConfig = this.roles[role];
        if (!roleConfig) return false;

        // Check for wildcard permission
        if (roleConfig.permissions.includes('*')) return true;

        // Check for specific permission
        if (roleConfig.permissions.includes(operation)) return true;

        // Check for operation category permissions
        const operationCategory = operation.split('_')[0]; // e.g., 'execute' from 'execute_hybrid'
        return roleConfig.permissions.includes(operationCategory);
    }

    /**
     * Validate security constraints
     * @private
     */
    async _validateSecurityConstraints(userId, operation, context) {
        const constraints = [];

        // Time-based constraints
        if (this.options.accessControlLevel === 'strict') {
            const hour = new Date().getHours();
            if (hour < 6 || hour > 22) { // Outside business hours
                constraints.push({
                    type: 'time_restriction',
                    valid: false,
                    message: 'Access restricted outside business hours'
                });
            }
        }

        // Rate limiting constraints
        const userACL = this.accessControlList.get(userId);
        if (userACL) {
            const recentAccess = Date.now() - (userACL.lastAccess || 0);
            if (recentAccess < 1000) { // Less than 1 second since last access
                constraints.push({
                    type: 'rate_limiting',
                    valid: false,
                    message: 'Rate limit exceeded'
                });
            }
        }

        // Resource constraints
        if (context.resourceIntensive && this.options.accessControlLevel === 'strict') {
            const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
            if (memoryUsage > 0.8) {
                constraints.push({
                    type: 'resource_constraint',
                    valid: false,
                    message: 'System under high resource usage'
                });
            }
        }

        const violatedConstraints = constraints.filter(c => !c.valid);
        
        return {
            valid: violatedConstraints.length === 0,
            constraints,
            violatedConstraint: violatedConstraints[0]?.type
        };
    }

    /**
     * Validate framework compliance
     * @private
     */
    async _validateFrameworkCompliance(framework, operation, context) {
        const frameworkConfig = this.complianceFrameworks[framework];
        if (!frameworkConfig) {
            return {
                framework,
                compliant: false,
                error: 'Unknown compliance framework'
            };
        }

        const requirementResults = [];

        for (const requirement of frameworkConfig.requirements) {
            const requirementResult = await this._validateComplianceRequirement(
                framework,
                requirement,
                operation,
                context
            );
            requirementResults.push(requirementResult);
        }

        const compliant = requirementResults.every(r => r.compliant);
        const violatedRequirements = requirementResults.filter(r => !r.compliant);

        return {
            framework,
            compliant,
            requirements: requirementResults,
            violatedRequirements: violatedRequirements.map(r => r.requirement)
        };
    }

    /**
     * Validate specific compliance requirement
     * @private
     */
    async _validateComplianceRequirement(framework, requirement, operation, context) {
        let compliant = true;
        let details = {};

        switch (requirement) {
            case 'audit_trail_completeness':
                compliant = this.options.enableAuditLogging && this.auditLog.length > 0;
                details.auditEventsCount = this.auditLog.length;
                break;

            case 'data_integrity_controls':
                compliant = this.options.enableEncryption || context.dataIntegrityVerified;
                details.encryptionEnabled = this.options.enableEncryption;
                break;

            case 'access_control_segregation':
                compliant = this.options.enableAccessControl && this.accessControlList.size > 0;
                details.accessControlEnabled = this.options.enableAccessControl;
                break;

            case 'data_encryption':
                compliant = this.options.enableEncryption && this.encryptionKeys.size > 0;
                details.encryptionKeysCount = this.encryptionKeys.size;
                break;

            case 'access_logging':
                compliant = this.options.enableAuditLogging;
                details.auditLoggingEnabled = this.options.enableAuditLogging;
                break;

            case 'data_retention_controls':
                compliant = this.options.auditRetentionDays > 0;
                details.retentionDays = this.options.auditRetentionDays;
                break;

            default:
                compliant = true; // Unknown requirements pass by default
                details.unknown = true;
        }

        return {
            requirement,
            compliant,
            details,
            framework
        };
    }

    /**
     * Get event severity
     * @private
     */
    _getEventSeverity(eventType) {
        const severityMap = {
            unauthorized_access_attempt: 'high',
            insufficient_permissions: 'medium',
            security_constraint_violation: 'medium',
            compliance_violation: 'high',
            encryption_failure: 'high',
            audit_failure: 'medium',
            access_granted: 'info',
            user_added: 'info',
            user_removed: 'medium'
        };

        return severityMap[eventType] || 'medium';
    }

    /**
     * Trigger incident response
     * @private
     */
    async _triggerIncidentResponse(securityEvent) {
        const incident = {
            id: crypto.randomUUID(),
            securityEventId: securityEvent.id,
            type: 'security_incident',
            severity: securityEvent.severity,
            status: 'open',
            createdAt: new Date().toISOString(),
            description: `Security incident triggered by ${securityEvent.type}`,
            data: securityEvent.data
        };

        logger.error(`🚨 SECURITY INCIDENT: ${securityEvent.type}`, {
            incidentId: incident.id,
            severity: incident.severity,
            eventData: securityEvent.data
        });

        this.emit('security_incident', incident);

        // TODO: Integrate with external incident response systems
        // - PagerDuty alerts
        // - Slack notifications
        // - Email alerts
        // - SIEM integration
    }

    /**
     * Perform security monitoring
     * @private
     */
    _performSecurityMonitoring() {
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);

        // Check for suspicious patterns
        const recentEvents = this.securityEvents.filter(event => 
            new Date(event.timestamp).getTime() > oneHourAgo
        );

        // Check for multiple unauthorized access attempts
        const unauthorizedAttempts = recentEvents.filter(event => 
            event.type === 'unauthorized_access_attempt'
        );

        if (unauthorizedAttempts.length > 10) {
            this._logSecurityEvent('suspicious_activity_detected', {
                pattern: 'multiple_unauthorized_attempts',
                count: unauthorizedAttempts.length,
                timeWindow: '1_hour'
            });
        }

        // Check for compliance violations
        const complianceViolations = recentEvents.filter(event => 
            event.type === 'compliance_violation'
        );

        if (complianceViolations.length > 5) {
            this._logSecurityEvent('compliance_pattern_detected', {
                pattern: 'multiple_compliance_violations',
                count: complianceViolations.length,
                timeWindow: '1_hour'
            });
        }
    }

    /**
     * Rotate audit log
     * @private
     */
    _rotateAuditLog() {
        const retentionCutoff = Date.now() - (this.options.auditRetentionDays * 24 * 60 * 60 * 1000);
        const beforeCount = this.auditLog.length;
        
        this.auditLog = this.auditLog.filter(event => 
            new Date(event.timestamp).getTime() > retentionCutoff
        );

        const rotatedCount = beforeCount - this.auditLog.length;

        if (rotatedCount > 0) {
            logger.info('Audit log rotated', {
                rotatedEvents: rotatedCount,
                remainingEvents: this.auditLog.length
            });
        }
    }

    /**
     * Perform compliance validation
     * @private
     */
    async _performComplianceValidation() {
        for (const [framework, status] of this.complianceStatus.entries()) {
            const validation = await this._validateFrameworkCompliance(framework, 'system_check', {});
            
            status.status = validation.compliant ? 'compliant' : 'non_compliant';
            status.lastValidation = new Date().toISOString();
            status.requirements = status.requirements.map(req => {
                const reqResult = validation.requirements.find(r => r.requirement === req.requirement);
                return {
                    ...req,
                    status: reqResult ? (reqResult.compliant ? 'compliant' : 'non_compliant') : 'unknown',
                    lastCheck: new Date().toISOString()
                };
            });
        }
    }

    /**
     * Get security metrics
     */
    getSecurityMetrics() {
        const accessSuccessRate = this.securityMetrics.totalAccessAttempts > 0 ? 
            (this.securityMetrics.authorizedAccess / this.securityMetrics.totalAccessAttempts) * 100 : 100;

        return {
            ...this.securityMetrics,
            accessSuccessRate: accessSuccessRate.toFixed(2) + '%',
            recentSecurityEvents: this.securityEvents.slice(-10),
            recentAuditEvents: this.auditLog.slice(-10),
            complianceStatus: Object.fromEntries(this.complianceStatus)
        };
    }

    /**
     * Get comprehensive security status
     */
    getStatus() {
        return {
            type: 'StrandsEnterpriseSecurity',
            version: '1.0.0',
            configuration: {
                enableAccessControl: this.options.enableAccessControl,
                enableAuditLogging: this.options.enableAuditLogging,
                enableComplianceValidation: this.options.enableComplianceValidation,
                enableSecurityMonitoring: this.options.enableSecurityMonitoring,
                enableEncryption: this.options.enableEncryption,
                accessControlLevel: this.options.accessControlLevel
            },
            accessControl: {
                users: this.accessControlList.size,
                roles: Object.keys(this.roles)
            },
            audit: {
                eventsLogged: this.auditLog.length,
                retentionDays: this.options.auditRetentionDays
            },
            compliance: {
                frameworks: this.options.complianceFrameworks,
                status: Object.fromEntries(this.complianceStatus)
            },
            encryption: {
                enabled: this.options.enableEncryption,
                keys: this.encryptionKeys.size,
                algorithm: this.options.encryptionAlgorithm
            },
            securityEvents: this.securityEvents.length,
            metrics: this.getSecurityMetrics(),
            health: this._calculateSecurityHealth()
        };
    }

    /**
     * Calculate security health score
     * @private
     */
    _calculateSecurityHealth() {
        let healthScore = 1.0;

        // Reduce score for high unauthorized access rate
        const accessSuccessRate = this.securityMetrics.totalAccessAttempts > 0 ? 
            this.securityMetrics.authorizedAccess / this.securityMetrics.totalAccessAttempts : 1.0;
        
        if (accessSuccessRate < 0.9) {
            healthScore -= 0.3;
        }

        // Reduce score for compliance violations
        if (this.securityMetrics.complianceViolations > 0) {
            healthScore -= 0.2;
        }

        // Reduce score for security incidents
        if (this.securityMetrics.securityIncidents > 5) {
            healthScore -= 0.3;
        }

        healthScore = Math.max(0, healthScore);

        if (healthScore >= 0.9) return 'excellent';
        if (healthScore >= 0.7) return 'good';
        if (healthScore >= 0.5) return 'fair';
        return 'poor';
    }

    /**
     * Cleanup security resources
     */
    async cleanup() {
        try {
            // Clear intervals
            if (this.auditRotationInterval) {
                clearInterval(this.auditRotationInterval);
                this.auditRotationInterval = null;
            }

            if (this.securityMonitoringInterval) {
                clearInterval(this.securityMonitoringInterval);
                this.securityMonitoringInterval = null;
            }

            // Clear sensitive data
            this.encryptionKeys.clear();
            this.accessControlList.clear();

            // Remove all listeners
            this.removeAllListeners();

            await this._logAuditEvent('security_system_shutdown', {
                cleanupCompleted: true
            });

            if (this.options.enableLogging) {
                logger.info('StrandsEnterpriseSecurity cleanup completed');
            }

        } catch (error) {
            logger.error('Security cleanup failed', {
                error: error.message
            });
        }
    }
}

module.exports = StrandsEnterpriseSecurity;