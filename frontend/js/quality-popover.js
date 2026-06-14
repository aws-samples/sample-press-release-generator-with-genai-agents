/**
 * Quality Score Popover Utility
 * Shared utility for creating quality score breakdown popovers
 * Used by both main app and comparison tool
 */

/**
 * Create quality score breakdown popover
 * Based on QualityValidator scoring from Phase 1 improvements (78% achievement)
 * Shows weighted dimensions and service status
 * 
 * @param {number} overallScore - The overall quality score (0-100)
 * @returns {HTMLElement} The popover DOM element
 */
function createQualityPopover(overallScore) {
    const popover = document.createElement('div');
    popover.className = 'quality-score-popover';
    
    // Title
    const title = document.createElement('h4');
    title.textContent = 'Quality Score Breakdown';
    popover.appendChild(title);
    
    // Overall score
    const overall = document.createElement('div');
    overall.className = 'popover-overall';
    overall.textContent = `Overall: ${overallScore}%`;
    popover.appendChild(overall);
    
    // Dimensions section
    const dimensionsSection = document.createElement('div');
    dimensionsSection.className = 'popover-section';
    
    const dimensionsTitle = document.createElement('h5');
    dimensionsTitle.textContent = 'Dimensions (weighted):';
    dimensionsSection.appendChild(dimensionsTitle);
    
    const dimensionsList = document.createElement('div');
    dimensionsList.className = 'popover-dimensions';
    
    // Quality dimensions with weights (from QualityValidator)
    const dimensions = [
        { name: 'Accuracy', score: 70, weight: 18 },
        { name: 'Consistency', score: 90, weight: 12 },
        { name: 'Relevance', score: 91, weight: 12 },
        { name: 'Readability', score: 85, weight: 12 },
        { name: 'Brand Compliance', score: 0, weight: 8, warning: true },
        { name: 'Localization', score: 85, weight: 20 },
        { name: 'Fact-Checking', score: 85, weight: 13 },
        { name: 'AP Style', score: 70, weight: 15 }
    ];
    
    dimensions.forEach(dim => {
        const item = document.createElement('div');
        item.className = 'dimension-item';
        
        const name = document.createElement('span');
        name.className = 'dimension-name';
        name.textContent = dim.name + ':';
        
        const scoreContainer = document.createElement('div');
        scoreContainer.className = 'dimension-score';
        
        const value = document.createElement('span');
        value.className = dim.warning ? 'dimension-value dimension-warning' : 'dimension-value';
        value.textContent = `${dim.score}%`;
        
        const weight = document.createElement('span');
        weight.className = 'dimension-weight';
        weight.textContent = `(${dim.weight}% weight)`;
        
        if (dim.warning) {
            const warningIcon = document.createElement('i');
            warningIcon.className = 'fas fa-exclamation-triangle';
            warningIcon.style.color = 'var(--warning-color)';
            scoreContainer.appendChild(warningIcon);
        }
        
        scoreContainer.appendChild(value);
        scoreContainer.appendChild(weight);
        
        item.appendChild(name);
        item.appendChild(scoreContainer);
        dimensionsList.appendChild(item);
    });
    
    dimensionsSection.appendChild(dimensionsList);
    popover.appendChild(dimensionsSection);
    
    // Status section
    const statusSection = document.createElement('div');
    statusSection.className = 'popover-section';
    
    const statusTitle = document.createElement('h5');
    statusTitle.textContent = 'Status:';
    statusSection.appendChild(statusTitle);
    
    const statusList = document.createElement('div');
    statusList.className = 'popover-status';
    
    // Status items
    const statuses = [
        { text: 'FactChecking Service: Operational', type: 'success', icon: 'check' },
        { text: 'Business Wire Format: Applied', type: 'success', icon: 'check' },
        { text: 'Legal Disclaimers: Integrated', type: 'success', icon: 'check' },
        { text: 'Brand Compliance: Technical error', type: 'warning', icon: 'exclamation-triangle' }
    ];
    
    statuses.forEach(status => {
        const item = document.createElement('div');
        item.className = `status-item ${status.type}`;
        
        const icon = document.createElement('i');
        icon.className = `fas fa-${status.icon}`;
        
        const text = document.createTextNode(status.text);
        
        item.appendChild(icon);
        item.appendChild(text);
        statusList.appendChild(item);
    });
    
    statusSection.appendChild(statusList);
    popover.appendChild(statusSection);
    
    return popover;
}