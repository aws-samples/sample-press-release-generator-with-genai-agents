/**
 * Main Application JavaScript
 * Handles navigation and main page functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize main page functionality
    initializeMainPage();
});

/**
 * Initialize main page functionality
 */
function initializeMainPage() {
    bindNavigationEvents();
    bindHealthCheckEvent();
    bindLineageDashboardEvent();
}

/**
 * Bind navigation event handlers
 */
function bindNavigationEvents() {
    // Data Lineage Dashboard navigation
    const lineageDashboardBtn = document.getElementById('lineage-dashboard');
    if (lineageDashboardBtn) {
        lineageDashboardBtn.addEventListener('click', function() {
            window.location.href = 'lineage-dashboard.html';
        });
    }
}

/**
 * Bind data lineage dashboard event handler
 */
function bindLineageDashboardEvent() {
    const dashboardBtn = document.getElementById('data-lineage-dashboard');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', function() {
            window.location.href = 'lineage-dashboard.html';
        });
    }
}

/**
 * Bind health check event handler
 */
function bindHealthCheckEvent() {
    const healthCheckBtn = document.getElementById('health-check');
    if (healthCheckBtn) {
        healthCheckBtn.addEventListener('click', function() {
            performHealthCheck();
        });
    }
}

/**
 * Perform system health check
 */
async function performHealthCheck() {
    const button = document.getElementById('health-check');
    const originalText = button.innerHTML;
    
    // SECURITY FIX: Use safe DOM manipulation for loading state
    button.textContent = '';
    const loadingIcon = document.createElement('i');
    loadingIcon.className = 'fas fa-spinner fa-spin';
    button.appendChild(loadingIcon);
    button.appendChild(document.createTextNode(' Checking...'));
    button.disabled = true;
    
    try {
        const apiUrl = window.AppConfig ? window.AppConfig.getApiUrl('/status') : '/api/v1/status';
        const response = await fetch(apiUrl);
        
        if (response.ok) {
            const status = await response.json();
            showHealthStatus(status);
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
    } catch (error) {
        console.error('Health check failed:', error);
        showHealthError(error.message);
    } finally {
        // SECURITY FIX: Restore button state safely
        button.textContent = '';
        const parser = new DOMParser();
        const doc = parser.parseFromString(originalText, 'text/html');
        Array.from(doc.body.childNodes).forEach(node => {
            button.appendChild(node.cloneNode(true));
        });
        button.disabled = false;
    }
}

/**
 * Show health status results
 */
function showHealthStatus(status) {
    const modal = createHealthModal();
    const content = modal.querySelector('.modal-content');
    
    // Determine if system is operational (green) based on required services only
    const isOperational = status.status === 'operational';
    
    // SECURITY FIX: Build modal content safely using DOM manipulation
    content.textContent = '';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    
    const headerTitle = document.createElement('h3');
    const heartbeatIcon = document.createElement('i');
    heartbeatIcon.className = 'fas fa-heartbeat';
    headerTitle.appendChild(heartbeatIcon);
    headerTitle.appendChild(document.createTextNode(' System Health Status'));
    
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.textContent = '×';
    
    modalHeader.appendChild(headerTitle);
    modalHeader.appendChild(closeButton);
    
    // Modal body
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    
    // Health overview
    const healthOverview = document.createElement('div');
    healthOverview.className = 'health-overview';
    
    const healthItem = document.createElement('div');
    healthItem.className = `health-item ${isOperational ? 'healthy' : 'unhealthy'}`;
    if (isOperational) {
        healthItem.style.borderColor = '#10b981';
        healthItem.style.backgroundColor = '#d1fae5';
    }
    
    const healthIcon = document.createElement('div');
    healthIcon.className = 'health-icon';
    if (isOperational) {
        healthIcon.style.color = '#10b981';
    }
    const statusIcon = document.createElement('i');
    statusIcon.className = `fas ${isOperational ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    healthIcon.appendChild(statusIcon);
    
    const healthInfo = document.createElement('div');
    healthInfo.className = 'health-info';
    
    const healthTitle = document.createElement('div');
    healthTitle.className = 'health-title';
    healthTitle.textContent = 'Overall Status';
    
    const healthValue = document.createElement('div');
    healthValue.className = 'health-value';
    if (isOperational) {
        healthValue.style.color = '#10b981';
    }
    healthValue.textContent = status.status.charAt(0).toUpperCase() + status.status.slice(1);
    
    healthInfo.appendChild(healthTitle);
    healthInfo.appendChild(healthValue);
    healthItem.appendChild(healthIcon);
    healthItem.appendChild(healthInfo);
    healthOverview.appendChild(healthItem);
    
    // Health details
    const healthDetails = document.createElement('div');
    healthDetails.className = 'health-details';
    
    const detailsTitle = document.createElement('h4');
    detailsTitle.textContent = 'Service Details';
    healthDetails.appendChild(detailsTitle);
    
    // Service items
    Object.entries(status.services || {}).forEach(([service, info]) => {
        const isConfigured = typeof info === 'string' ? info === 'running' : info.configured;
        const isOptional = typeof info === 'object' && info.optional;
        const statusText = typeof info === 'string' ? info.charAt(0).toUpperCase() + info.slice(1) : (info.configured ? 'Configured' : 'Not Configured');
        
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';
        
        const serviceName = document.createElement('div');
        serviceName.className = 'service-name';
        serviceName.textContent = service;
        
        if (isOptional) {
            const optionalBadge = document.createElement('span');
            optionalBadge.className = 'optional-badge';
            optionalBadge.style.color = '#f59e0b';
            optionalBadge.style.fontSize = '0.75em';
            optionalBadge.textContent = ' (Optional)';
            serviceName.appendChild(optionalBadge);
        }
        
        const serviceStatus = document.createElement('div');
        serviceStatus.className = `service-status ${isConfigured ? 'configured' : 'not-configured'}`;
        if (!isConfigured && isOptional) {
            serviceStatus.style.backgroundColor = '#fef3c7';
            serviceStatus.style.color = '#d97706';
            serviceStatus.style.borderColor = '#f59e0b';
        }
        serviceStatus.textContent = statusText;
        
        serviceItem.appendChild(serviceName);
        serviceItem.appendChild(serviceStatus);
        healthDetails.appendChild(serviceItem);
    });
    
    // Health metadata
    const healthMetadata = document.createElement('div');
    healthMetadata.className = 'health-metadata';
    
    const versionItem = document.createElement('div');
    versionItem.className = 'metadata-item';
    const versionLabel = document.createElement('span');
    versionLabel.className = 'label';
    versionLabel.textContent = 'Version:';
    const versionValue = document.createElement('span');
    versionValue.className = 'value';
    versionValue.textContent = status.version || 'Unknown';
    versionItem.appendChild(versionLabel);
    versionItem.appendChild(versionValue);
    
    const envItem = document.createElement('div');
    envItem.className = 'metadata-item';
    const envLabel = document.createElement('span');
    envLabel.className = 'label';
    envLabel.textContent = 'Environment:';
    const envValue = document.createElement('span');
    envValue.className = 'value';
    envValue.textContent = status.environment || 'Unknown';
    envItem.appendChild(envLabel);
    envItem.appendChild(envValue);
    
    healthMetadata.appendChild(versionItem);
    healthMetadata.appendChild(envItem);
    
    // Assemble modal body
    modalBody.appendChild(healthOverview);
    modalBody.appendChild(healthDetails);
    modalBody.appendChild(healthMetadata);
    
    // Assemble content
    content.appendChild(modalHeader);
    content.appendChild(modalBody);
    
    // Bind close events
    bindModalCloseEvents(modal);
    
    // Show modal
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

/**
 * Show health check error
 */
function showHealthError(errorMessage) {
    const modal = createHealthModal();
    const content = modal.querySelector('.modal-content');
    
    // SECURITY FIX: Build error modal safely using DOM manipulation
    content.textContent = '';
    
    // Modal header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    
    const headerTitle = document.createElement('h3');
    const warningIcon = document.createElement('i');
    warningIcon.className = 'fas fa-exclamation-triangle';
    headerTitle.appendChild(warningIcon);
    headerTitle.appendChild(document.createTextNode(' Health Check Failed'));
    
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.textContent = '×';
    
    modalHeader.appendChild(headerTitle);
    modalHeader.appendChild(closeButton);
    
    // Modal body
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    
    // Error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    
    const errorIcon = document.createElement('i');
    errorIcon.className = 'fas fa-exclamation-circle';
    
    const errorText = document.createElement('p');
    errorText.textContent = 'Unable to retrieve system health status:';
    
    const errorCode = document.createElement('code');
    errorCode.textContent = errorMessage;
    
    errorDiv.appendChild(errorIcon);
    errorDiv.appendChild(errorText);
    errorDiv.appendChild(errorCode);
    
    // Error actions
    const errorActions = document.createElement('div');
    errorActions.className = 'error-actions';
    
    const retryButton = document.createElement('button');
    retryButton.className = 'btn btn-primary';
    retryButton.onclick = performHealthCheck;
    
    const retryIcon = document.createElement('i');
    retryIcon.className = 'fas fa-redo';
    retryButton.appendChild(retryIcon);
    retryButton.appendChild(document.createTextNode(' Retry'));
    
    errorActions.appendChild(retryButton);
    
    // Assemble modal body
    modalBody.appendChild(errorDiv);
    modalBody.appendChild(errorActions);
    
    // Assemble content
    content.appendChild(modalHeader);
    content.appendChild(modalBody);
    
    // Bind close events
    bindModalCloseEvents(modal);
    
    // Show modal
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);
}

/**
 * Create health modal element
 */
function createHealthModal() {
    const modal = document.createElement('div');
    modal.className = 'health-modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content"></div>
    `;
    return modal;
}

/**
 * Bind modal close events
 */
function bindModalCloseEvents(modal) {
    const closeBtn = modal.querySelector('.modal-close');
    const overlay = modal.querySelector('.modal-overlay');
    
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    };
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeModal);
    }
    
    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.parentNode) {
            closeModal();
        }
    });
}

/**
 * Format uptime in human readable format
 */
function formatUptime(seconds) {
    if (!seconds) return 'Unknown';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.length > 0 ? parts.join(' ') : '< 1m';
}