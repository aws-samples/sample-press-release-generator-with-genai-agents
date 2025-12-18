/**
 * AI Press Release Generator - Frontend Application
 * Handles all user interactions and API communication
 */

class PressReleaseApp {
    constructor() {
        // Use dynamic configuration system with proper fallback
        this.apiBaseUrl = window.AppConfig ? window.AppConfig.get('apiBaseUrl') : (window.ENV?.API_BASE_URL || window.location.origin + '/api/v1');
        this.currentStep = 1;
        this.currentJobId = null;
        this.generationInterval = null;
        this.selectedMarkets = [];
        this.industryTemplates = []; // Store loaded industry templates
        this.selectedTemplateId = null; // Track selected template
        this.allMarkets = [];
        this.currentResults = []; // Store current results for download functionality
        
        // Configuration - Optimized for large market batches
        this.config = {
            maxContentLength: 50000,
            pollInterval: 15000, // 15 seconds - optimized for large batches
            maxPollInterval: 45000, // 45 seconds max for large batches
            maxRetries: 3,
            maxPollingFailures: 15, // Increased for long-running jobs (37+ minutes)
            batchSizeThreshold: 10 // Adjust polling strategy for large batches
        };
        
        // Initialize the application
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            await this.loadIndustryTemplates();
            this.bindEvents();
            await this.loadMarkets();
            this.showToast('Application initialized successfully', 'success');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showToast('Failed to initialize application', 'error');
        }
    }

    /**
     * Bind all event listeners
     */
    bindEvents() {
        // Navigation events
        document.getElementById('next-to-configure').addEventListener('click', () => this.goToStep(2));
        document.getElementById('back-to-input').addEventListener('click', () => this.goToStep(1));
        document.getElementById('next-to-generate').addEventListener('click', () => this.startGeneration());
        document.getElementById('start-new').addEventListener('click', () => this.resetApplication());

        // Input events
        document.getElementById('press-release-input').addEventListener('input', this.handleInputChange.bind(this));
        
        // Industry template events - using correct button IDs
        document.getElementById('loadTemplateBtn').addEventListener('click', this.loadIndustryTemplate.bind(this));
        document.getElementById('clearTemplateBtn').addEventListener('click', this.clearTemplate.bind(this));

        // Configuration events
        document.querySelectorAll('input[name="market-selection"]').forEach(radio => {
            radio.addEventListener('change', this.handleMarketSelectionChange.bind(this));
        });
        document.querySelectorAll('input[name="data-source"]').forEach(radio => {
            radio.addEventListener('change', this.handleDataSourceChange.bind(this));
        });
        
        // Generation approach selection event listeners
        document.querySelectorAll('input[name="generation-approach"]').forEach(radio => {
            radio.addEventListener('change', this.handleGenerationApproachChange.bind(this));
        });
        
        // Strands configuration event listeners (orchestration pattern removed - only sequential_hybrid supported)
        document.querySelectorAll('input[name="performance-mode"]').forEach(radio => {
            radio.addEventListener('change', this.handlePerformanceModeChange.bind(this));
        });
        
        // AI Provider selection event listeners
        document.querySelectorAll('input[name="ai-provider"]').forEach(radio => {
            radio.addEventListener('change', this.handleAIProviderChange.bind(this));
        });
        document.getElementById('market-search').addEventListener('input', this.handleMarketSearch.bind(this));

        // Generation events
        document.getElementById('cancel-generation').addEventListener('click', this.cancelGeneration.bind(this));

        // Results events
        document.getElementById('download-all').addEventListener('click', this.downloadAll.bind(this));
        document.querySelectorAll('.format-download').forEach(btn => {
            btn.addEventListener('click', (e) => this.downloadFormat(e.target.dataset.format));
        });
        document.getElementById('grid-view').addEventListener('click', () => this.setResultsView('grid'));
        document.getElementById('list-view').addEventListener('click', () => this.setResultsView('list'));

        // Modal events
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', this.closeModals.bind(this));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModals();
            });
        });

        // Health check (optional button)
        const healthCheckBtn = document.getElementById('health-check');
        if (healthCheckBtn) {
            healthCheckBtn.addEventListener('click', this.checkSystemHealth.bind(this));
        }
        
        // Data Lineage Dashboard
        const lineageDashboardBtn = document.getElementById('data-lineage-dashboard');
        if (lineageDashboardBtn) {
            lineageDashboardBtn.addEventListener('click', () => {
                window.location.href = 'lineage-dashboard.html';
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeyboard.bind(this));
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        if (e.key === 'Escape') {
            this.closeModals();
        }
    }

    /**
     * Load available markets from the API
     */
    async loadMarkets() {
        try {
            const response = await this.apiCall('/markets');
            this.allMarkets = response.markets || [];
            this.renderMarketList();
        } catch (error) {
            console.error('Failed to load markets:', error);
            this.showToast('Failed to load market data', 'error');
            // Use fallback markets if API fails
            this.allMarkets = this.getFallbackMarkets();
            this.renderMarketList();
        }
    }

    /**
     * Load industry templates from JSON file
     */
    async loadIndustryTemplates() {
        try {
            const response = await fetch('data/industry-templates.json');
            const data = await response.json();
            // Filter to only show active templates (where active !== false)
            const allTemplates = data.templates || [];
            this.industryTemplates = allTemplates.filter(template => template.active !== false);
            console.log(`Loaded ${this.industryTemplates.length} active industry templates (${allTemplates.length} total, ${allTemplates.length - this.industryTemplates.length} inactive)`);
        } catch (error) {
            console.error('Failed to load industry templates:', error);
            this.showToast('Failed to load industry templates', 'warning');
            this.industryTemplates = [];
        }
    }

    /**
     * Load industry template from dropdown selection
     */
    loadIndustryTemplate() {
        // Show the industry template modal
        this.showIndustryTemplateModal();
    }
    
    /**
     * Show industry template selection modal
     */
    showIndustryTemplateModal() {
        const modal = document.getElementById('industry-template-modal');
        const templatesList = document.getElementById('industry-templates-list');
        
        // Clear existing content - SECURITY FIX: Use textContent instead of innerHTML
        templatesList.textContent = '';
        
        // Check if templates are loaded
        if (!this.industryTemplates || this.industryTemplates.length === 0) {
            // SECURITY FIX: Use safe DOM manipulation instead of innerHTML
            const noTemplatesDiv = document.createElement('div');
            noTemplatesDiv.className = 'no-templates';
            noTemplatesDiv.textContent = 'No templates available. Please refresh the page.';
            templatesList.appendChild(noTemplatesDiv);
            modal.classList.add('active');
            return;
        }
        
        // Create template cards with previews
        this.industryTemplates.forEach(template => {
            const templateCard = document.createElement('div');
            templateCard.className = 'template-card';
            templateCard.dataset.templateId = template.id;
            
            // Create preview (first 300 characters)
            const preview = template.content.substring(0, 300) + '...';
            
            // SECURITY FIX: Build DOM structure safely instead of innerHTML
            const templateHeader = document.createElement('div');
            templateHeader.className = 'template-header';
            
            const templateName = document.createElement('h4');
            templateName.className = 'template-name';
            templateName.textContent = template.name;
            
            const templateIndustry = document.createElement('span');
            templateIndustry.className = 'template-industry';
            templateIndustry.textContent = template.industry;
            
            templateHeader.appendChild(templateName);
            templateHeader.appendChild(templateIndustry);
            
            const templateSummary = document.createElement('p');
            templateSummary.className = 'template-summary';
            templateSummary.textContent = template.uiSummary;
            
            const templatePreview = document.createElement('div');
            templatePreview.className = 'template-preview';
            
            const previewLabel = document.createElement('div');
            previewLabel.className = 'preview-label';
            previewLabel.textContent = 'Preview:';
            
            const previewContent = document.createElement('div');
            previewContent.className = 'preview-content';
            previewContent.textContent = preview;
            
            templatePreview.appendChild(previewLabel);
            templatePreview.appendChild(previewContent);
            
            const templateMeta = document.createElement('div');
            templateMeta.className = 'template-meta';
            
            const metaItem1 = document.createElement('span');
            metaItem1.className = 'meta-item';
            const icon1 = document.createElement('i');
            icon1.className = 'fas fa-file-alt';
            metaItem1.appendChild(icon1);
            metaItem1.appendChild(document.createTextNode(` ${template.metadata.characterCount.toLocaleString()} chars`));
            
            const metaItem2 = document.createElement('span');
            metaItem2.className = 'meta-item';
            const icon2 = document.createElement('i');
            icon2.className = 'fas fa-database';
            metaItem2.appendChild(icon2);
            metaItem2.appendChild(document.createTextNode(` ${template.metadata.dataPointCount} data points`));
            
            templateMeta.appendChild(metaItem1);
            templateMeta.appendChild(metaItem2);
            
            const selectButton = document.createElement('button');
            selectButton.className = 'btn btn-primary btn-select-template';
            selectButton.dataset.templateId = template.id;
            selectButton.textContent = 'Select Template';
            
            templateCard.appendChild(templateHeader);
            templateCard.appendChild(templateSummary);
            templateCard.appendChild(templatePreview);
            templateCard.appendChild(templateMeta);
            templateCard.appendChild(selectButton);
            
            templatesList.appendChild(templateCard);
        });
        
        // Bind click events to select buttons
        templatesList.querySelectorAll('.btn-select-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const templateId = e.target.dataset.templateId;
                this.selectIndustryTemplate(templateId);
            });
        });
        
        // Bind modal close events
        this.bindIndustryTemplateModalEvents(modal);
        
        // Show modal
        modal.classList.add('active');
    }
    
    /**
     * Select and load an industry template
     */
    selectIndustryTemplate(templateId) {
        const template = this.industryTemplates.find(t => t.id === templateId);
        if (!template) {
            this.showToast('Template not found', 'error');
            return;
        }
        
        // Load template content into textarea
        const textarea = document.getElementById('press-release-input');
        textarea.value = template.content;
        
        // Trigger input change to update character count and validation
        this.handleInputChange({ target: textarea });
        
        // Close modal
        document.getElementById('industry-template-modal').classList.remove('active');
        
        this.showToast(`Loaded ${template.name} template`, 'success');
    }
    
    /**
     * Bind industry template modal events
     */
    bindIndustryTemplateModalEvents(modal) {
        // Close button
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }

    /**
     * Get fallback markets if API is unavailable
     */
    getFallbackMarkets() {
        return [
            { name: 'New York', state: 'NY', code: 'NYC' },
            { name: 'Los Angeles', state: 'CA', code: 'LAX' },
            { name: 'Chicago', state: 'IL', code: 'CHI' },
            { name: 'Houston', state: 'TX', code: 'HOU' },
            { name: 'Phoenix', state: 'AZ', code: 'PHX' },
            { name: 'Philadelphia', state: 'PA', code: 'PHL' },
            { name: 'San Antonio', state: 'TX', code: 'SAT' },
            { name: 'San Diego', state: 'CA', code: 'SAN' },
            { name: 'Dallas', state: 'TX', code: 'DAL' },
            { name: 'San Jose', state: 'CA', code: 'SJC' }
        ];
    }

    /**
     * Load top 10 major US markets from API
     */
    async loadTop10Markets() {
        try {
            const response = await this.apiCall('/markets/top10');
            this.selectedMarkets = response.markets || [];
            this.showToast(`Loaded ${this.selectedMarkets.length} top markets`, 'success');
        } catch (error) {
            console.error('Failed to load top 10 markets:', error);
            this.showToast('Failed to load top 10 markets', 'error');
            // Use fallback top 10 markets
            this.selectedMarkets = this.getFallbackMarkets().slice(0, 10);
        }
    }

    /**
     * Render the market list for custom selection
     */
    renderMarketList() {
        const marketList = document.getElementById('market-list');
        if (!marketList) return;

        // SECURITY FIX: Use safe DOM manipulation instead of innerHTML
        marketList.textContent = '';
        
        this.allMarkets.forEach(market => {
            const marketItem = document.createElement('div');
            marketItem.className = 'market-item';
            marketItem.dataset.market = market.code || market.name;
            marketItem.textContent = `${market.name}, ${market.state}`;
            marketItem.addEventListener('click', this.toggleMarketSelection.bind(this));
            marketList.appendChild(marketItem);
        });
    }

    /**
     * Handle input changes in the press release textarea
     */
    handleInputChange(e) {
        const content = e.target.value;
        const charCount = content.length;
        
        // Update character count
        document.getElementById('char-count').textContent = charCount.toLocaleString();
        
        // Validate content
        this.validateTemplate(content);
        
        // Enable/disable next button
        const nextBtn = document.getElementById('next-to-configure');
        nextBtn.disabled = charCount === 0 || charCount > this.config.maxContentLength;
    }

    /**
     * Validate the press release template
     */
    validateTemplate(content) {
        const feedback = document.getElementById('validation-feedback');
        
        if (content.length === 0) {
            feedback.innerHTML = '';
            return;
        }

        if (content.length > this.config.maxContentLength) {
            feedback.className = 'validation-feedback error';
            feedback.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Content exceeds maximum length limit.';
            return;
        }

        // Content is valid - show success message
        feedback.className = 'validation-feedback success';
        feedback.innerHTML = '<i class="fas fa-check-circle"></i> Content is ready for AI-powered localization.';
    }

    /**
     * Show sample templates modal
     */
    showSampleModal() {
        const modal = document.getElementById('sample-modal');
        const container = document.getElementById('sample-templates');
        
        // SECURITY FIX: Use safe DOM manipulation instead of innerHTML
        container.textContent = '';
        
        SAMPLE_TEMPLATES.forEach(template => {
            const sampleTemplate = document.createElement('div');
            sampleTemplate.className = 'sample-template';
            sampleTemplate.dataset.templateId = template.id;
            
            const title = document.createElement('h4');
            title.textContent = template.title;
            
            const description = document.createElement('p');
            description.textContent = template.description;
            
            const preview = document.createElement('div');
            preview.className = 'sample-preview';
            preview.textContent = template.template.substring(0, 200) + '...';
            
            sampleTemplate.appendChild(title);
            sampleTemplate.appendChild(description);
            sampleTemplate.appendChild(preview);
            
            sampleTemplate.addEventListener('click', (e) => {
                const templateId = e.currentTarget.dataset.templateId;
                this.loadSampleTemplate(templateId);
            });
            
            container.appendChild(sampleTemplate);
        });

        modal.classList.add('active');
    }

    /**
     * Load a sample template
     */
    loadSampleTemplate(templateId) {
        const template = SAMPLE_TEMPLATES.find(t => t.id === templateId);
        if (template) {
            document.getElementById('press-release-input').value = template.template;
            this.handleInputChange({ target: { value: template.template } });
            this.closeModals();
            this.showToast(`Loaded template: ${template.title}`, 'success');
        }
    }

    /**
     * Clear the template
     */
    clearTemplate() {
        document.getElementById('press-release-input').value = '';
        this.handleInputChange({ target: { value: '' } });
        this.showToast('Template cleared', 'success');
    }

    /**
     * Handle market selection changes
     */
    handleMarketSelectionChange(e) {
        const value = e.target.value;
        const customMarkets = document.getElementById('custom-markets');
        
        if (value === 'custom') {
            customMarkets.classList.remove('hidden');
        } else {
            customMarkets.classList.add('hidden');
            
            // Set selected markets based on selection
            if (value === 'all') {
                this.selectedMarkets = this.allMarkets.slice(0, 100);
            } else if (value === 'top25') {
                this.selectedMarkets = this.allMarkets.slice(0, 25);
            } else if (value === 'top10') {
                // Load top 10 markets from API
                this.loadTop10Markets();
            }
        }
    }

    /**
     * Handle market search
     */
    handleMarketSearch(e) {
        const query = e.target.value.toLowerCase();
        const marketItems = document.querySelectorAll('.market-item');
        
        marketItems.forEach(item => {
            const marketName = item.textContent.toLowerCase();
            if (marketName.includes(query)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Handle data source selection change
     */
    handleDataSourceChange(e) {
        const selectedValue = e.target.value;
        const detailsContainer = document.getElementById('data-source-details');
        const aiProviderSection = document.getElementById('ai-provider-selection');
        
        // Show/hide AI provider selection based on data source
        if (selectedValue === 'ai') {
            aiProviderSection.style.display = 'block';
        } else {
            aiProviderSection.style.display = 'none';
        }
        
        // Update the information displayed based on selected data source
        if (selectedValue === 'trusted') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-database"></i>
                    <span>Pre-processed market data from verified sources</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-shield-alt"></i>
                    <span>Validated and structured data sets</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-chart-bar"></i>
                    <span>Historical market trends and statistics</span>
                </div>
            `;
        } else if (selectedValue === 'ai') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-brain"></i>
                    <span>AI-powered market research and analysis</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-search"></i>
                    <span>Intelligent search across multiple data sources</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-lightbulb"></i>
                    <span>Advanced market insights and analysis</span>
                </div>
            `;
        } else if (selectedValue === 'crawler') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-spider"></i>
                    <span>Real-time web scraping and data collection</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-sync-alt"></i>
                    <span>Live updates from market data source, market data source, market data source</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-chart-line"></i>
                    <span>Current market trends and statistics</span>
                </div>
            `;
        }
        
        console.log('Data source changed to:', selectedValue);
    }

    /**
     * Handle AI provider selection change
     */
    handleAIProviderChange(e) {
        const selectedProvider = e.target.value;
        const detailsContainer = document.getElementById('data-source-details');
        
        // Update details based on selected AI provider
        if (selectedProvider === 'auto') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-magic"></i>
                    <span>System automatically selects optimal AI provider</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-balance-scale"></i>
                    <span>Load balancing across available services</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-shield-check"></i>
                    <span>Fallback protection and error recovery</span>
                </div>
            `;
        } else if (selectedProvider === 'perplexity') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-search"></i>
                    <span>Real-time web search and analysis</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-globe"></i>
                    <span>Access to current web information</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-brain"></i>
                    <span>AI-powered research synthesis</span>
                </div>
            `;
        } else if (selectedProvider === 'firecrawl') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-spider"></i>
                    <span>Advanced web scraping and extraction</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-code"></i>
                    <span>Structured data extraction from websites</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-filter"></i>
                    <span>Content filtering and processing</span>
                </div>
            `;
        } else if (selectedProvider === 'tavily') {
            detailsContainer.innerHTML = `
                <div class="detail-item">
                    <i class="fas fa-brain"></i>
                    <span>AI-powered search and research</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-chart-line"></i>
                    <span>Market trend analysis and insights</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-lightning-bolt"></i>
                    <span>Fast and accurate data retrieval</span>
                </div>
            `;
        }
        
        console.log('AI provider changed to:', selectedProvider);
    }

    /**
     * Handle generation approach selection change
     */
    handleGenerationApproachChange(e) {
        const selectedApproach = e.target.value;
        const strandsConfiguration = document.getElementById('strands-configuration');
        
        // Show/hide Strands configuration based on approach
        if (selectedApproach === 'strands') {
            strandsConfiguration.style.display = 'block';
            this.showToast('Strands Framework selected - Advanced orchestration enabled', 'success');
        } else {
            strandsConfiguration.style.display = 'none';
            this.showToast('Traditional approach selected - Standard processing', 'success');
        }
        
        console.log('Generation approach changed to:', selectedApproach);
    }

    /**
     * Handle orchestration pattern selection change
     */

    /**
     * Handle performance mode selection change
     */
    handlePerformanceModeChange(e) {
        const selectedMode = e.target.value;
        
        // Update UI feedback based on performance mode
        const modeMap = {
            'fast': 'Speed-optimized execution',
            'balanced': 'Optimal speed/quality balance',
            'quality': 'Maximum quality output with detailed processing',
            'comprehensive': 'Full feature utilization with all capabilities'
        };
        
        const description = modeMap[selectedMode] || 'Advanced performance optimization';
        this.showToast(`Performance mode: ${description}`, 'success');
        
        console.log('Performance mode changed to:', selectedMode);
    }

    /**
     * Toggle market selection
     */
    toggleMarketSelection(e) {
        const item = e.currentTarget;
        const marketCode = item.dataset.market;
        const market = this.allMarkets.find(m => (m.code || m.name) === marketCode);
        
        if (item.classList.contains('selected')) {
            item.classList.remove('selected');
            this.selectedMarkets = this.selectedMarkets.filter(m => (m.code || m.name) !== marketCode);
        } else {
            item.classList.add('selected');
            if (market) this.selectedMarkets.push(market);
        }
        
        document.getElementById('selected-count').textContent = this.selectedMarkets.length;
    }

    /**
     * Navigate to a specific step
     */
    goToStep(step) {
        // Hide all steps
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });
        
        // Show target step
        document.getElementById(`step-${this.getStepName(step)}`).classList.add('active');
        
        // Update progress indicator
        document.querySelectorAll('.step').forEach((stepEl, index) => {
            stepEl.classList.remove('active', 'completed');
            if (index + 1 < step) {
                stepEl.classList.add('completed');
            } else if (index + 1 === step) {
                stepEl.classList.add('active');
            }
        });
        
        this.currentStep = step;
    }

    /**
     * Get step name by number
     */
    getStepName(step) {
        const names = ['', 'input', 'configure', 'generate', 'results'];
        return names[step] || 'input';
    }

    /**
     * Start the generation process
     */
    async startGeneration() {
      try {
        // Collect form data
        const template = document.getElementById('press-release-input').value;
        const marketSelection = document.querySelector('input[name="market-selection"]:checked').value;
        const formats = Array.from(document.querySelectorAll('input[name="formats"]:checked')).map(cb => cb.value);
        const validationMode = document.querySelector('input[name="validation-mode"]:checked').value;
        const batchSize = parseInt(document.getElementById('batch-size').value);
        const timeout = parseInt(document.getElementById('timeout').value) * 60; // Convert to seconds
    
        console.log('Starting generation with settings:', {
          marketSelection,
          formats,
          validationMode,
          batchSize,
          timeout
        });
    
        // Determine markets to process
        let markets = [];
        if (marketSelection === 'all') {
          markets = this.allMarkets.slice(0, 100);
        } else if (marketSelection === 'top25') {
          markets = this.allMarkets.slice(0, 25);
        } else if (marketSelection === 'top10') {
          markets = this.selectedMarkets; // Top 10 markets loaded from API
        } else {
          markets = this.selectedMarkets;
        }
    
        if (markets.length === 0) {
          this.showToast('Please select at least one market', 'error');
          return;
        }
    
        if (formats.length === 0) {
          this.showToast('Please select at least one output format', 'error');
          return;
        }
    
        console.log('Selected markets:', markets.length, markets.slice(0, 5));
    
        // Go to generation step
        this.goToStep(3);
    
        // Initialize progress tracking
        this.initializeProgress(markets.length);
    
        // Start generation
        // Get selected generation approach
        const generationApproach = document.querySelector('input[name="generation-approach"]:checked')?.value || 'traditional';
        
        // Get selected data source (only 'trusted' and 'tavily' available after commenting out other integrations)
        const dataSource = document.querySelector('input[name="data-source"]:checked')?.value || 'trusted';
        
        // Get Strands configuration (only relevant when generationApproach is 'strands')
        // FIXED: Always use sequential_hybrid pattern (only working pattern)
        const orchestrationPattern = 'sequential_hybrid';
        const performanceMode = document.querySelector('input[name="performance-mode"]:checked')?.value || 'balanced';
        
        // COMMENTED OUT - AI provider mapping logic (Perplexity, Firecrawl integrations disabled)
        // Uncomment and restore lines 843-867 to re-enable AI provider selection logic
        
        console.log('Sending API request to start generation', {
            generationApproach: generationApproach,
            dataSource: dataSource,
            orchestrationPattern: orchestrationPattern,
            performanceMode: performanceMode
        });
        
        // Choose API endpoint based on generation approach
        let apiEndpoint, requestPayload;
        
        if (generationApproach === 'strands') {
            // Use Strands API endpoint
            apiEndpoint = '/strands/generate-strands';
            requestPayload = {
                masterPR: template,
                markets: markets.map(m => m.code || m.name),
                orchestrationPattern: orchestrationPattern,
                performanceMode: performanceMode,
                dataSource: dataSource,
                options: {
                    formats,
                    validationMode,
                    batchSize,
                    timeout
                }
            };
        } else {
            // Use traditional API endpoint
            apiEndpoint = '/content/generate';
            requestPayload = {
                masterPR: template,
                markets: markets.map(m => m.code || m.name),
                dataSource: dataSource,
                options: {
                    formats,
                    validationMode,
                    batchSize,
                    timeout
                }
            };
        }
        
        const response = await this.apiCall(apiEndpoint, 'POST', requestPayload);
    
        console.log('Generation started successfully, received response:', response);
        
        // DEBUG: Log detailed response structure
        console.log('DEBUG - Response structure:', {
          hasJobId: !!response.result?.jobId,
          jobIdValue: response.result?.jobId,
          responseKeys: Object.keys(response),
          resultKeys: response.result ? Object.keys(response.result) : 'no result object'
        });
        
        if (response && response.result?.jobId) {
          console.log('Job ID received:', response.result.jobId);
          this.currentJobId = response.result.jobId;
          this.addLogEntry(`Generation job started with ID: ${response.result.jobId}`, 'info');
          console.log('Starting progress polling with job ID:', this.currentJobId);
          this.startProgressPolling();
        } else {
          console.error('No job ID received in response:', response);
          this.addLogEntry('Error: No job ID received from server', 'error');
        }
    
      } catch (error) {
        console.error('Failed to start generation:', error);
        this.showToast('Failed to start generation', 'error');
        this.goToStep(2);
      }
    }

    /**
     * Initialize progress tracking UI
     */
    initializeProgress(totalMarkets) {
        document.getElementById('total-markets').textContent = totalMarkets;
        document.getElementById('markets-processed').textContent = '0';
        document.getElementById('progress-percentage').textContent = '0%';
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('current-status').textContent = 'Starting generation...';
        document.getElementById('estimated-time').textContent = 'Calculating...';
        
        // Clear log
        document.getElementById('generation-log').innerHTML = '';
        
        // Reset progress ring
        const circle = document.querySelector('.progress-ring-circle');
        circle.classList.remove('active');
        circle.style.strokeDashoffset = '339.292';
    }

    /**
     * Start polling for progress updates
     */
    startProgressPolling(marketCount = 1) {
      let failureCount = 0;
      let rateLimitCount = 0;
      const maxFailures = this.config.maxPollingFailures;
      
      // INTELLIGENT POLLING: Adjust strategy based on batch size
      const isLargeBatch = marketCount >= this.config.batchSizeThreshold;
      let currentPollInterval = isLargeBatch ? this.config.pollInterval : Math.max(this.config.pollInterval * 0.5, 5000);
      const maxInterval = isLargeBatch ? this.config.maxPollInterval : 30000;
      
      // Calculate estimated completion time for user communication
      const estimatedMinutes = Math.ceil(marketCount * 1.5);
      
      console.log('🚀 OPTIMIZED POLLING: Starting intelligent polling', {
        currentJobId: this.currentJobId,
        marketCount: marketCount,
        isLargeBatch: isLargeBatch,
        initialPollInterval: currentPollInterval,
        maxPollInterval: maxInterval,
        estimatedCompletionMinutes: estimatedMinutes,
        maxFailures: maxFailures
      });
      
      this.addLogEntry(`Starting optimized polling for ${marketCount} market${marketCount > 1 ? 's' : ''} (Est. ${estimatedMinutes} min)`, 'info');
      
      // Show user-friendly message for large batches
      if (isLargeBatch) {
        this.showToast(`Processing ${marketCount} markets. Estimated completion: ${estimatedMinutes} minutes. Please be patient.`, 'info');
      }
      
      // Initialize polling variables for intelligent rate limiting
      let pollAttempts = 0;
      let consecutiveFailures = 0;
      
      const pollJob = async () => {
        try {
          pollAttempts++;
          console.log(`🔄 OPTIMIZED POLLING: Attempt ${pollAttempts}, Interval: ${currentPollInterval}ms, Failures: ${consecutiveFailures}/${maxFailures}`);
          
          const endpoint = `/content/jobs/${this.currentJobId}`;
          const response = await this.apiCall(endpoint);
          
          // Reset failure count on successful response
          if (consecutiveFailures > 0) {
            console.log(`✅ RECOVERY: Successful poll after ${consecutiveFailures} failures`);
            this.addLogEntry(`Connection recovered after ${consecutiveFailures} failures`, 'success');
            consecutiveFailures = 0;
          }
          
          console.log('🔍 POLLING DIAGNOSTIC: API Response received', {
            timestamp: new Date().toISOString(),
            jobId: this.currentJobId,
            pollAttempt: pollAttempts,
            status: response?.status,
            progress: response?.progress,
            currentInterval: currentPollInterval
          });
          
          this.addLogEntry(`Job status: ${response.status} (${response.progress || 0}%)`, 'info');
          this.updateProgress(response);
          
          // Adaptive polling: Gradually increase interval for long-running jobs
          if (pollAttempts > 10 && currentPollInterval < maxInterval) {
            const newInterval = Math.min(currentPollInterval + 5000, maxInterval);
            if (newInterval !== currentPollInterval) {
              console.log(`📈 ADAPTIVE: Increasing poll interval from ${currentPollInterval}ms to ${newInterval}ms (attempt ${pollAttempts})`);
              this.addLogEntry(`Adjusted polling to ${Math.round(newInterval/1000)}s for long-running job`, 'info');
              currentPollInterval = newInterval;
              
              // Restart polling with new interval
              clearInterval(this.generationInterval);
              this.generationInterval = setInterval(pollJob, currentPollInterval);
            }
          }
          
          // Check for completion
          if (response.status === 'completed' || response.status === 'failed') {
            console.log(`🏁 JOB FINISHED: Status=${response.status}, Total polls=${pollAttempts}, Duration=${Math.round(pollAttempts * currentPollInterval / 1000)}s`);
            this.stopProgressPolling();
            
            if (response.status === 'completed') {
              this.addLogEntry(`Job completed successfully after ${pollAttempts} polls!`, 'success');
              await this.handleGenerationComplete(response);
            } else {
              this.addLogEntry(`Job failed: ${response.error || 'Unknown error'}`, 'error');
              this.handleGenerationFailed(response);
            }
          }
          
        } catch (error) {
          consecutiveFailures++;
          console.error(`❌ POLLING ERROR: ${error.message} (Failure ${consecutiveFailures}/${maxFailures})`);
          
          // Enhanced rate limiting handling with exponential backoff
          if (error.message.includes('429') || error.message.includes('Rate limited')) {
            console.warn(`⚠️ RATE LIMITED (429): Implementing exponential backoff...`);
            this.addLogEntry(`Rate limited - implementing backoff strategy (${consecutiveFailures}/${maxFailures})`, 'warning');
            
            // Don't count rate limiting as a "failure" for circuit breaker purposes
            consecutiveFailures = Math.max(0, consecutiveFailures - 1);
            
            // Exponential backoff with jitter for rate limiting
            const backoffMultiplier = Math.min(Math.pow(2, consecutiveFailures), 8); // Cap at 8x
            const backoffDelay = Math.min(currentPollInterval * backoffMultiplier, maxInterval);
            const jitter = Math.random() * 0.3 * backoffDelay; // 30% jitter
            const nextInterval = Math.floor(backoffDelay + jitter);
            
            console.log(`🔄 BACKOFF: Next poll in ${Math.round(nextInterval/1000)}s (was ${Math.round(currentPollInterval/1000)}s)`);
            this.addLogEntry(`Backing off to ${Math.round(nextInterval/1000)}s due to rate limiting`, 'warning');
            
            // Clear current interval and set new one with backoff delay
            clearInterval(this.generationInterval);
            setTimeout(() => {
              currentPollInterval = Math.min(nextInterval, maxInterval);
              this.generationInterval = setInterval(pollJob, currentPollInterval);
            }, nextInterval);
            
            return;
          }
          
          // Handle other errors
          this.addLogEntry(`Polling error: ${error.message} (${consecutiveFailures}/${maxFailures})`, 'error');
          
          // Circuit breaker: Stop polling on persistent non-rate-limit errors
          if (consecutiveFailures >= maxFailures) {
            console.error('🚨 CIRCUIT BREAKER: Max failures reached, stopping polling');
            this.addLogEntry('Polling stopped: Too many consecutive errors. Please check system status.', 'error');
            this.stopProgressPolling();
            
            // User-friendly error messages based on error type
            if (error.message.includes('fetch')) {
              this.showToast('Connection lost. Please check your internet connection and try again.', 'error');
            } else if (error.message.includes('404')) {
              this.showToast('Job not found. It may have expired or been removed.', 'error');
            } else {
              this.showToast('Polling failed. Please refresh the page and try again.', 'error');
            }
            
            this.goToStep(2); // Go back to configure step
          }
        }
      };
      
      // Start polling with initial interval
      this.generationInterval = setInterval(pollJob, currentPollInterval);
      
      // Initial poll
      pollJob();
    }

    /**
     * Stop progress polling
     */
    stopProgressPolling() {
        if (this.generationInterval) {
            clearInterval(this.generationInterval);
            this.generationInterval = null;
        }
    }

    /**
     * Update progress UI
     */
    updateProgress(jobData) {
      // ENHANCED DIAGNOSTICS: Log all incoming data for debugging
      console.log('🔍 POLLING DIAGNOSTIC: updateProgress called', {
        timestamp: new Date().toISOString(),
        jobDataKeys: Object.keys(jobData || {}),
        rawProgress: jobData.progress,
        rawStatus: jobData.status,
        hasMetadata: !!(jobData.metadata),
        metadataKeys: jobData.metadata ? Object.keys(jobData.metadata) : null,
        fullJobData: JSON.stringify(jobData, null, 2)
      });

      // Extract data from jobData with fallbacks for backward compatibility
      const progress = jobData.progress;
      const status = jobData.status || 'processing';
      
      // Get processed and total from metadata if available
      const metadata = jobData.metadata || {};
      const processed = metadata.processed || jobData.processed || 0;
      const total = metadata.total || jobData.total || 0;
      const estimatedTime = metadata.estimatedTime || jobData.estimatedTime;
      const currentMarket = metadata.currentMarket || jobData.currentMarket;
      
      // ENHANCED DIAGNOSTICS: Log extracted values
      console.log('🔍 POLLING DIAGNOSTIC: Extracted values', {
        progress: progress,
        progressType: typeof progress,
        status: status,
        processed: processed,
        total: total,
        currentMarket: currentMarket,
        hasEstimatedTime: !!estimatedTime
      });
      
      // Update progress percentage - FIXED: Improved logic to handle edge cases
      // Backend sends progress as decimal (0.1 for 10%) OR as percentage (10 for 10%)
      // We need to handle both cases correctly
      
      let percentage = 0;
      let calculationMethod = 'none';
      
      // Primary calculation: Use progress value if available and valid
      // CRITICAL DEBUG: Log the condition check
      console.log('🔍 POLLING DIAGNOSTIC: Condition check before if statement', {
        progress: progress,
        progressType: typeof progress,
        isUndefined: progress === undefined,
        isNull: progress === null,
        isNaN: isNaN(progress),
        conditionResult: (progress !== undefined && progress !== null && !isNaN(progress))
      });
      
      if (progress !== undefined && progress !== null && !isNaN(progress)) {
        // ENHANCED DIAGNOSTICS: Log condition evaluation
        console.log('🔍 POLLING DIAGNOSTIC: Condition evaluation', {
          progress: progress,
          progressType: typeof progress,
          isZero: progress === 0,
          isDecimal: progress > 0 && progress < 1,
          isOne: progress === 1,
          isPercentage: progress > 1 && progress <= 100,
          isOverHundred: progress > 100
        });
        
        // FIXED: Handle edge cases properly with explicit conditions
        if (progress === 0) {
          // Zero progress is treated as percentage (0%)
          percentage = 0;
          calculationMethod = 'percentage-direct';
          console.log('🔍 POLLING DIAGNOSTIC: Using zero progress logic');
        } else if (progress > 0 && progress < 1) {
          // Progress is decimal (0.1 for 10%), convert to percentage
          percentage = Math.round(progress * 100);
          calculationMethod = 'decimal-conversion';
          console.log('🔍 POLLING DIAGNOSTIC: Using decimal conversion logic');
        } else if (progress === 1) {
          // Progress of 1 is 100% (decimal format)
          percentage = 100;
          calculationMethod = 'decimal-conversion';
          console.log('🔍 POLLING DIAGNOSTIC: Using completion logic');
        } else if (progress > 1 && progress <= 100) {
          // Progress is already percentage (10 for 10%), use as-is
          percentage = Math.round(progress);
          calculationMethod = 'percentage-direct';
          console.log('🔍 POLLING DIAGNOSTIC: Using percentage direct logic');
        } else if (progress > 100) {
          // FIXED: Progress over 100 should be clamped to 100%
          percentage = 100;
          calculationMethod = 'percentage-clamped';
          console.log('🔍 POLLING DIAGNOSTIC: Using over-100 clamping logic');
        } else {
          // Fallback for any other edge cases (negative numbers, etc.)
          percentage = 0;
          calculationMethod = 'invalid-clamped';
          console.log('🔍 POLLING DIAGNOSTIC: Using fallback logic');
        }
      }
      
      // FIXED: Only use fallback if primary calculation failed AND we have valid processed/total
      if (percentage === 0 && calculationMethod === 'none' && total > 0 && processed >= 0) {
        percentage = Math.round((processed / total) * 100);
        calculationMethod = 'processed-total-fallback';
      }
      
      // ENHANCED DIAGNOSTICS: Log calculation results
      console.log('🔍 POLLING DIAGNOSTIC: Progress calculation', {
        originalProgress: progress,
        calculatedPercentage: percentage,
        calculationMethod: calculationMethod,
        processed: processed,
        total: total,
        willUseFallback: (percentage === 0 && calculationMethod === 'none')
      });
      
      // Ensure percentage is within valid range (0-100)
      percentage = Math.max(0, Math.min(100, percentage));
      
      // ENHANCED DIAGNOSTICS: Log final calculation results
      console.log('🔍 POLLING DIAGNOSTIC: Final progress calculation', {
        finalPercentage: percentage,
        isValidRange: percentage >= 0 && percentage <= 100,
        status: status,
        willUpdateUI: true
      });
      
      // Update DOM elements with corrected percentage - ENHANCED ERROR HANDLING
      try {
        const progressPercentageEl = document.getElementById('progress-percentage');
        const progressFillEl = document.getElementById('progress-fill');
        
        if (progressPercentageEl) {
          progressPercentageEl.textContent = `${percentage}%`;
        } else {
          console.warn('🚨 POLLING DIAGNOSTIC: progress-percentage element not found');
        }
        
        if (progressFillEl) {
          progressFillEl.style.width = `${percentage}%`;
        } else {
          console.warn('🚨 POLLING DIAGNOSTIC: progress-fill element not found');
        }
        
        // Update progress ring - FIXED: Use consistent percentage calculation with error handling
        const circle = document.querySelector('.progress-ring-circle');
        if (circle) {
          const circumference = 339.292;
          // Convert percentage back to decimal for progress ring calculation
          const progressDecimal = percentage / 100;
          const offset = circumference - (progressDecimal * circumference);
          circle.style.strokeDashoffset = offset;
          circle.classList.add('active');
        } else {
          console.warn('🚨 POLLING DIAGNOSTIC: progress-ring-circle element not found');
        }
        
        // ENHANCED DIAGNOSTICS: Log UI update success
        console.log('🔍 POLLING DIAGNOSTIC: UI elements updated successfully', {
          percentage: percentage,
          progressPercentageUpdated: !!progressPercentageEl,
          progressFillUpdated: !!progressFillEl,
          progressRingUpdated: !!circle
        });
        
      } catch (error) {
        console.error('🚨 POLLING DIAGNOSTIC: Error updating UI elements', error);
      }
      
      // Update stats with enhanced error handling
      try {
        const marketsProcessedEl = document.getElementById('markets-processed');
        const currentStatusEl = document.getElementById('current-status');
        const estimatedTimeEl = document.getElementById('estimated-time');
        
        if (marketsProcessedEl) {
          marketsProcessedEl.textContent = processed;
        }
        
        if (currentStatusEl) {
          const statusText = currentMarket ? `Processing ${currentMarket}` : status;
          currentStatusEl.textContent = statusText;
          
          // ENHANCED DIAGNOSTICS: Log status update
          console.log('🔍 POLLING DIAGNOSTIC: Status updated', {
            statusText: statusText,
            currentMarket: currentMarket,
            status: status
          });
        }
        
        if (estimatedTime && estimatedTimeEl) {
          estimatedTimeEl.textContent = this.formatTime(estimatedTime);
        }
        
      } catch (error) {
        console.error('🚨 POLLING DIAGNOSTIC: Error updating status elements', error);
      }
      
      // Add log entries for new progress
      if (currentMarket) {
        this.addLogEntry(`Processing ${currentMarket}...`, 'info');
      }
      
      // Add progress log entry with enhanced information
      const progressLogMessage = `Progress update: ${processed}/${total} markets (${percentage}%) - Status: ${status}`;
      this.addLogEntry(progressLogMessage, 'info');
      
      // ENHANCED DIAGNOSTICS: Log completion of updateProgress method
      console.log('🔍 POLLING DIAGNOSTIC: updateProgress completed', {
        finalPercentage: percentage,
        finalStatus: status,
        processed: processed,
        total: total,
        timestamp: new Date().toISOString()
      });
    }

    /**
     * Handle generation completion
     */
    async handleGenerationComplete(jobData) {
        this.addLogEntry('Generation completed successfully!', 'success');
        
        // Load results
        await this.loadResults(jobData);
        
        // Go to results step
        this.goToStep(4);
        
        this.showToast('Press release generation completed!', 'success');
    }

    /**
     * Handle generation failure
     */
    handleGenerationFailed(jobData) {
        this.addLogEntry(`Generation failed: ${jobData.error || 'Unknown error'}`, 'error');
        this.showToast('Generation failed. Please try again.', 'error');
        
        // Enable cancel button to go back
        const cancelBtn = document.getElementById('cancel-generation');
        cancelBtn.textContent = 'Back to Configuration';
        cancelBtn.onclick = () => this.goToStep(2);
    }

    /**
     * Cancel generation
     */
    async cancelGeneration() {
        if (this.currentJobId) {
            try {
                await this.apiCall(`/content/jobs/${this.currentJobId}`, 'DELETE');
                this.showToast('Generation cancelled', 'warning');
            } catch (error) {
                console.error('Failed to cancel generation:', error);
            }
        }
        
        this.stopProgressPolling();
        this.goToStep(2);
    }

    /**
     * Load and display results
     */
    async loadResults(jobData) {
        try {
            // Log the job data for debugging
            console.log('Loading results with jobData structure:', {
                hasJobId: !!jobData.jobId,
                hasStatus: !!jobData.status,
                hasFiles: !!jobData.files,
                hasFormats: !!jobData.formats,
                hasResults: !!jobData.results,
                hasMetadata: !!jobData.metadata,
                jobDataKeys: Object.keys(jobData)
            });
            
            // Extract results and stats with comprehensive fallbacks
            let results = [];
            
            // Enhanced handling of different result structures based on actual backend response
            if (jobData.files && Array.isArray(jobData.files)) {
                console.log('Processing files array from top-level jobData.files');
                // Handle the case where files are at the top level of jobData (most common case)
                results = jobData.files.map(file => {
                    // Extract market name from filename if not provided
                    const marketFromFile = file.market ||
                                         file.name?.replace(/\.(json|txt|html)$/, '') ||
                                         file.path?.split('/').pop()?.replace(/\.(json|txt|html)$/, '') ||
                                         'Unknown Market';
                    
                    return {
                        market: marketFromFile,
                        marketName: file.marketName || marketFromFile,
                        content: file.content || '',
                        qualityScore: file.metadata?.confidence || file.qualityScore || 85,
                        metadata: file.metadata || {},
                        preview: file.content ? file.content.substring(0, 150) + '...' : 'No preview available'
                    };
                });
            } else if (jobData.variants && Array.isArray(jobData.variants)) {
                // FIXED: Handle top-level variants array (new backend response structure)
                console.log('Processing top-level variants array:', jobData.variants.length, 'variants');
                results = jobData.variants.map(variant => {
                    const market = variant.market || 'Unknown Market';
                    // Handle both string content and nested content object
                    const content = typeof variant.content === 'string' ? variant.content :
                                   (variant.content?.content || variant.content?.fullContent || variant.content?.fullNarrative || '');
                    const qualityScore = variant.validation?.overallScore || variant.metadata?.confidence || variant.qualityScore || 85;
                    
                    return {
                        market: market,
                        marketName: market,
                        content: content,
                        qualityScore: qualityScore,
                        metadata: variant.metadata || {},
                        preview: content ? content.substring(0, 150) + '...' : 'No preview available',
                        status: variant.status, // CRITICAL: Preserve variant status for display logic
                        error: variant.error, // Preserve error if any
                        fullVariant: variant
                    };
                });
            } else if (jobData.results) {
                console.log('Processing jobData.results structure');
                if (Array.isArray(jobData.results)) {
                    results = jobData.results;
                } else if (jobData.results.variants && Array.isArray(jobData.results.variants)) {
                    console.log('Processing variants array:', jobData.results.variants.length, 'variants');
                    results = jobData.results.variants.map(variant => {
                        const market = variant.market || 'Unknown Market';
                        const content = variant.content?.content || variant.content?.fullContent || variant.content?.fullNarrative || '';
                        const qualityScore = variant.validation?.overallScore || variant.metadata?.confidence || variant.qualityScore || 85;
                        
                        return {
                            market: market,
                            marketName: market, // Use market code as name for now
                            content: content,
                            qualityScore: qualityScore,
                            metadata: variant.metadata || {},
                            preview: content ? content.substring(0, 150) + '...' : 'No preview available',
                            // Store the full variant data for the press release modal
                            fullVariant: variant
                        };
                    });
                } else if (jobData.results.files && Array.isArray(jobData.results.files)) {
                    // Handle the case where results contains files array
                    results = jobData.results.files.map(file => ({
                        market: file.market || file.name?.replace(/\.(json|txt|html)$/, '') || 'Unknown Market',
                        marketName: file.marketName || file.market || file.name?.replace(/\.(json|txt|html)$/, '') || 'Unknown Market',
                        content: file.content || '',
                        qualityScore: file.metadata?.confidence || file.qualityScore || 85,
                        metadata: file.metadata || {},
                        preview: file.content ? file.content.substring(0, 150) + '...' : 'No preview available'
                    }));
                } else {
                    console.warn('Unexpected results structure:', jobData.results);
                    this.showToast('Unexpected results structure received', 'warning');
                    results = [];
                }
            } else {
                console.warn('No files or results found in jobData:', jobData);
                this.showToast('No results found in response', 'warning');
                results = [];
            }
            
            console.log('Processed results array:', results.length, 'items');
            
            // Extract stats with improved fallbacks and better error handling
            const stats = jobData.metadata?.stats || jobData.stats || {};
            const metadata = jobData.metadata || {};
            
            // Update summary stats with better fallbacks
            const totalGenerated = results.length;
            const avgQuality = stats.averageQuality ||
                             (results.length > 0 ?
                              Math.round(results.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / results.length) :
                              0);
            
            // Extract generation time from multiple possible sources
            const generationTime = stats.totalTime ||
                                 jobData.duration ||
                                 metadata.totalTime ||
                                 metadata.duration ||
                                 0;
            
            // Update DOM elements with error handling
            const totalGeneratedEl = document.getElementById('total-generated');
            const avgQualityEl = document.getElementById('avg-quality');
            const generationTimeEl = document.getElementById('generation-time');
            
            if (totalGeneratedEl) totalGeneratedEl.textContent = totalGenerated;
            
            // Add quality score with popover
            if (avgQualityEl) {
                // Clear existing content
                avgQualityEl.textContent = '';
                
                // Create wrapper for popover
                const qualityWrapper = document.createElement('div');
                qualityWrapper.className = 'quality-score-wrapper';
                qualityWrapper.style.display = 'inline-block';
                qualityWrapper.style.position = 'relative';
                
                // Create score value
                const scoreValue = document.createElement('span');
                scoreValue.textContent = `${avgQuality}%`;
                
                // Create popover using shared utility function
                const popover = createQualityPopover(avgQuality);
                
                qualityWrapper.appendChild(scoreValue);
                qualityWrapper.appendChild(popover);
                avgQualityEl.appendChild(qualityWrapper);
            }
            
            if (generationTimeEl) generationTimeEl.textContent = this.formatTime(generationTime);
            
            // Calculate and display variants generated percentage
            const totalMarkets = metadata.total ||
                                jobData.total ||
                                jobData.options?.markets?.length ||
                                totalGenerated;
            const variantsPercentage = totalMarkets > 0 ? Math.round((totalGenerated / totalMarkets) * 100) : 100;
            const variantsElement = document.getElementById('variants-generated');
            if (variantsElement) {
                variantsElement.textContent = `${variantsPercentage}%`;
            }
            
            // Store results for download functionality
            this.currentResults = results;
            
            // Display job-level cost summary
            this.displayJobCostSummary(jobData);
            
            // Render results grid with cost data
            this.renderResults(results, jobData);
            
            // Update market variants display
            this.updateMarketVariantsDisplay(results);
            
            console.log('Results loading completed successfully:', {
                totalResults: results.length,
                avgQuality: avgQuality,
                generationTime: this.formatTime(generationTime),
                variantsPercentage: variantsPercentage
            });
            
        } catch (error) {
            console.error('Failed to load results:', error);
            this.showToast('Failed to load results: ' + error.message, 'error');
            
            // Show error state in UI
            const container = document.getElementById('results-container');
            if (container) {
                container.innerHTML = '<div class="error-message">Failed to load results. Please try again.</div>';
            }
        }
    }

    /**
     * Display job-level cost summary
     */
    displayJobCostSummary(jobData) {
        try {
            // FIXED: Extract cost tracking data from correct location in API response
            // Backend returns cost data in metadata.costs, not costTracking
            const costTracking = jobData.metadata?.costs || jobData.costTracking || jobData.costs;
            
            if (!costTracking) {
                console.warn('No cost tracking data available in job response');
                console.log('Job data structure:', {
                    hasMetadata: !!jobData.metadata,
                    metadataKeys: jobData.metadata ? Object.keys(jobData.metadata) : [],
                    hasCostTracking: !!jobData.costTracking,
                    hasCosts: !!jobData.costs
                });
                this.displayCostUnavailable();
                return;
            }
            
            // Extract cost values with fallbacks
            const totalCost = costTracking.jobTotalCost || costTracking.totalCost || 0;
            const avgCostPerMarket = costTracking.avgCostPerMarket || 0;
            // FIXED: Extract breakdown costs from correct path (metadata.costs.breakdown)
            const bedrockTotal = costTracking.breakdown?.bedrock?.totalCost ||
                                costTracking.bedrockTotal || 0;
            const tavilyTotal = costTracking.breakdown?.tavily?.totalCost ||
                               costTracking.tavilyTotal || 0;
            const marketCount = costTracking.summary?.marketCount ||
                              costTracking.marketCount ||
                              (costTracking.marketCosts ? costTracking.marketCosts.length : 0);
            
            // Update DOM elements - 4th tile (new layout)
            const totalCostEl = document.getElementById('total-cost');
            const bedrockCostCompactEl = document.getElementById('bedrock-cost-compact');
            const tavilyCostCompactEl = document.getElementById('tavily-cost-compact');
            
            if (totalCostEl) totalCostEl.textContent = this.formatCost(totalCost);
            if (bedrockCostCompactEl) bedrockCostCompactEl.textContent = this.formatCost(bedrockTotal);
            if (tavilyCostCompactEl) tavilyCostCompactEl.textContent = this.formatCost(tavilyTotal);
            
            console.log('Job cost summary displayed:', {
                totalCost,
                avgCostPerMarket,
                marketCount,
                bedrockTotal,
                tavilyTotal
            });
            
        } catch (error) {
            console.error('Error displaying job cost summary:', error);
            this.displayCostUnavailable();
        }
    }
    
    /**
     * Display cost unavailable message
     */
    displayCostUnavailable() {
        const elements = [
            'total-cost',
            'bedrock-cost-compact',
            'tavily-cost-compact'
        ];
        
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = '$0.00';
                el.classList.add('cost-unavailable');
            }
        });
    }
    
    /**
     * Format cost as currency
     */
    formatCost(amount) {
        if (amount === undefined || amount === null || isNaN(amount)) {
            return '$0.00';
        }
        
        const numAmount = Number(amount);
        return `$${numAmount.toFixed(2)}`;
    }
    
    /**
     * Get cost color class based on amount
     */
    getCostColorClass(cost) {
        if (cost < 1.00) return 'cost-low';
        if (cost < 5.00) return 'cost-medium';
        if (cost < 10.00) return 'cost-high';
        return 'cost-very-high';
    }
    
    /**
     * Add cost display to market tile
     */
    addMarketCostDisplay(resultCard, result, costTracking) {
        try {
            // FIXED: Find market-specific cost data with enhanced logging
            const marketCosts = costTracking?.marketCosts || [];
            
            console.log('Adding market cost display:', {
                market: result.market || result.marketName,
                hasCostTracking: !!costTracking,
                marketCostsLength: marketCosts.length,
                marketCostsAvailable: marketCosts.map(mc => mc.marketName)
            });
            const marketCostData = marketCosts.find(mc => 
                mc.marketName === result.market || 
                mc.marketName === result.marketName
            );
            
            if (!marketCostData) {
                console.log('No cost data found for market:', result.market || result.marketName);
                return; // Don't add cost display if no data available
            }
            
            // Extract cost values
            const totalCost = marketCostData.totalCost || 0;
            const bedrockCost = marketCostData.bedrockCost || 0;
            const tavilyCost = marketCostData.tavilyCost || 0;
            
            // Get token counts if available
            const bedrockTokens = marketCostData.agentCosts
                ?.filter(ac => ac.apiProvider === 'bedrock')
                .reduce((sum, ac) => sum + (ac.tokenUsage?.inputTokens || 0) + (ac.tokenUsage?.outputTokens || 0), 0) || 0;
            
            const tavilyCredits = marketCostData.agentCosts
                ?.filter(ac => ac.apiProvider === 'tavily')
                .reduce((sum, ac) => sum + (ac.creditUsage?.totalCredits || 0), 0) || 0;
            
            // Create cost info element
            const costInfo = document.createElement('div');
            costInfo.className = 'market-cost-info';
            
            const costTotal = document.createElement('div');
            costTotal.className = 'market-cost-total';
            const costIcon = document.createElement('i');
            costIcon.className = 'fas fa-dollar-sign';
            costTotal.appendChild(costIcon);
            costTotal.appendChild(document.createTextNode(` Cost: ${this.formatCost(totalCost)}`));
            
            const costBreakdown = document.createElement('div');
            costBreakdown.className = 'market-cost-breakdown';
            
            // Bedrock cost line
            const bedrockLine = document.createElement('span');
            bedrockLine.textContent = `Bedrock: ${this.formatCost(bedrockCost)}`;
            if (bedrockTokens > 0) {
                bedrockLine.textContent += ` (${bedrockTokens.toLocaleString()} tokens)`;
            }
            
            // Tavily cost line
            const tavilyLine = document.createElement('span');
            tavilyLine.textContent = `Tavily: ${this.formatCost(tavilyCost)}`;
            if (tavilyCredits > 0) {
                tavilyLine.textContent += ` (${tavilyCredits} credits)`;
            }
            
            costBreakdown.appendChild(bedrockLine);
            costBreakdown.appendChild(tavilyLine);
            
            costInfo.appendChild(costTotal);
            costInfo.appendChild(costBreakdown);
            
            // Insert cost info before result actions
            const resultActions = resultCard.querySelector('.result-actions');
            if (resultActions) {
                resultCard.insertBefore(costInfo, resultActions);
            } else {
                resultCard.appendChild(costInfo);
            }
            
            console.log('Market cost display added:', {
                market: result.market || result.marketName,
                totalCost,
                bedrockCost,
                tavilyCost
            });
            
        } catch (error) {
            console.error('Error adding market cost display:', error);
            // Don't break tile rendering if cost display fails
        }
    }

    /**
     * Render results in the grid
     */
    renderResults(results, jobData) {
        const container = document.getElementById('results-container');
        
        if (!Array.isArray(results)) {
            console.error('Results is not an array:', results);
            container.innerHTML = '<div class="error-message">Error: Invalid results format</div>';
            return;
        }
        
        if (results.length === 0) {
            // SECURITY FIX: Use safe DOM manipulation instead of innerHTML
            container.textContent = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-message';
            emptyDiv.textContent = 'No results available';
            container.appendChild(emptyDiv);
            return;
        }
        
        // SECURITY FIX: Build result cards using safe DOM manipulation instead of innerHTML
        container.textContent = '';
        
        // FIXED: Extract cost tracking data from correct location for market tiles
        const costTracking = jobData?.metadata?.costs || jobData?.costTracking || jobData?.costs;
        
        results.forEach(result => {
            const resultCard = document.createElement('div');
            
            // FIXED: Detect error/incomplete states - don't treat failed_validation as incomplete if content exists
            const hasError = result.error || result.status === 'failed';
            const hasEmptyContent = !result.content ||
                                   (typeof result.content === 'string' && result.content.trim().length === 0) ||
                                   (typeof result.content === 'object' && !result.content.content);
            
            // CRITICAL FIX: Only mark as incomplete if there's an actual error OR no content
            // Don't block display for failed_validation status if content exists
            const isIncomplete = hasError || hasEmptyContent;
            
            // Log validation status for debugging
            if (result.status === 'failed_validation' && !isIncomplete) {
                console.log('Market has failed_validation status but content exists - will display with warning:', result.market);
            }
            
            // Add error class if incomplete
            resultCard.className = isIncomplete ? 'result-card error-state' : 'result-card';
            resultCard.dataset.market = result.market;
            
            // Result header
            const resultHeader = document.createElement('div');
            resultHeader.className = 'result-header';
            
            const marketName = document.createElement('div');
            marketName.className = 'market-name';
            marketName.textContent = result.marketName || result.market;
            
            // FIXED: Show error indicator, validation warning, or quality score
            if (isIncomplete) {
                const errorIndicator = document.createElement('div');
                errorIndicator.className = 'error-indicator';
                const errorIcon = document.createElement('i');
                errorIcon.className = 'fas fa-exclamation-triangle';
                errorIndicator.appendChild(errorIcon);
                errorIndicator.appendChild(document.createTextNode(' Error'));
                resultHeader.appendChild(errorIndicator);
            } else if (result.status === 'failed_validation') {
                // Show validation warning but still display content
                const validationWarning = document.createElement('div');
                validationWarning.className = 'validation-warning';
                validationWarning.title = 'Content generated but failed quality validation';
                const warningIcon = document.createElement('i');
                warningIcon.className = 'fas fa-exclamation-circle';
                validationWarning.appendChild(warningIcon);
                
                const scoreValue = Math.round(result.qualityScore || result.metadata?.confidence || 0);
                validationWarning.appendChild(document.createTextNode(` ${scoreValue}%`));
                resultHeader.appendChild(validationWarning);
            } else {
                const qualityScore = document.createElement('div');
                const scoreValue = Math.round(result.qualityScore || result.metadata?.confidence || 0);
                qualityScore.className = `quality-score ${this.getQualityClass(scoreValue)}`;
                qualityScore.textContent = `${scoreValue}%`;
                resultHeader.appendChild(qualityScore);
            }
            
            resultHeader.insertBefore(marketName, resultHeader.firstChild);
            
            // Result preview or error message
            const resultPreview = document.createElement('div');
            resultPreview.className = 'result-preview';
            
            if (isIncomplete) {
                // Show error message instead of preview
                const errorMessage = document.createElement('div');
                errorMessage.className = 'error-message-content';
                
                const errorTitle = document.createElement('div');
                errorTitle.className = 'error-title';
                const errorTitleIcon = document.createElement('i');
                errorTitleIcon.className = 'fas fa-times-circle';
                errorTitle.appendChild(errorTitleIcon);
                errorTitle.appendChild(document.createTextNode(' Generation Failed'));
                
                const errorDescription = document.createElement('div');
                errorDescription.className = 'error-description';
                
                // Determine specific error message
                let errorText = 'Content generation incomplete';
                if (result.error) {
                    if (typeof result.error === 'string') {
                        errorText = result.error;
                    } else if (result.error.message) {
                        errorText = result.error.message;
                    }
                } else if (hasEmptyContent) {
                    errorText = 'No content was generated for this market';
                }
                
                errorDescription.textContent = errorText;
                
                const errorSuggestion = document.createElement('div');
                errorSuggestion.className = 'error-suggestion';
                const suggestionIcon = document.createElement('i');
                suggestionIcon.className = 'fas fa-lightbulb';
                errorSuggestion.appendChild(suggestionIcon);
                errorSuggestion.appendChild(document.createTextNode(' Try regenerating this market or check system logs'));
                
                errorMessage.appendChild(errorTitle);
                errorMessage.appendChild(errorDescription);
                errorMessage.appendChild(errorSuggestion);
                resultPreview.appendChild(errorMessage);
            } else {
                // Show normal preview
                const previewText = result.preview ||
                    (typeof result.content === 'string' ? result.content.substring(0, 150) + '...' : 'No preview available');
                resultPreview.textContent = previewText;
            }
            
            // Result actions - disable buttons for error states
            const resultActions = document.createElement('div');
            resultActions.className = 'result-actions';
            
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'btn btn-outline download-btn';
            downloadBtn.dataset.market = result.market;
            downloadBtn.disabled = isIncomplete;
            const downloadIcon = document.createElement('i');
            downloadIcon.className = 'fas fa-download';
            downloadBtn.appendChild(downloadIcon);
            downloadBtn.appendChild(document.createTextNode(' Download'));
            
            const previewBtn = document.createElement('button');
            previewBtn.className = 'btn btn-primary press-release-btn';
            previewBtn.dataset.market = result.market;
            previewBtn.disabled = isIncomplete;
            const previewIcon = document.createElement('i');
            previewIcon.className = 'fas fa-newspaper';
            previewBtn.appendChild(previewIcon);
            previewBtn.appendChild(document.createTextNode(' Preview'));
            
            const emailBtn = document.createElement('button');
            emailBtn.className = 'btn btn-outline email-btn';
            emailBtn.dataset.market = result.market;
            emailBtn.disabled = isIncomplete;
            const emailIcon = document.createElement('i');
            emailIcon.className = 'fas fa-envelope';
            emailBtn.appendChild(emailIcon);
            emailBtn.appendChild(document.createTextNode(' View Email'));
            
            resultActions.appendChild(downloadBtn);
            resultActions.appendChild(previewBtn);
            resultActions.appendChild(emailBtn);
            
            // Assemble result card
            resultCard.appendChild(resultHeader);
            resultCard.appendChild(resultPreview);
            
            // Add cost display if not in error state and cost data available
            if (!isIncomplete && costTracking) {
                this.addMarketCostDisplay(resultCard, result, costTracking);
            }
            
            resultCard.appendChild(resultActions);
            
            container.appendChild(resultCard);
        });
        
        // Bind result actions
        container.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.downloadMarket(e.target.dataset.market));
        });
        
        container.querySelectorAll('.press-release-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.viewPressRelease(e.target.dataset.market));
        });
        
        container.querySelectorAll('.email-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.viewPitchEmail(e.target.dataset.market));
        });
    }

    /**
     * Get quality score CSS class
     */
    getQualityClass(score) {
        if (score >= 80) return 'high';
        if (score >= 60) return 'medium';
        return 'low';
    }


    /**
     * Download a specific market variant
     */
    async downloadMarket(market) {
        try {
            const url = `${this.apiBaseUrl}/content/download/${this.currentJobId}?market=${market}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `press-release-${market}.zip`;
            link.click();
            
            this.showToast(`Downloading ${market} variant`, 'success');
        } catch (error) {
            console.error('Failed to download market:', error);
            this.showToast('Failed to download market variant', 'error');
        }
    }

    /**
     * View pitch email for a specific market
     */
    async viewPitchEmail(market) {
        try {
            this.showLoading();
            
            // Call the email composition API - endpoint WITHOUT /api/v1 prefix (apiCall adds it)
            const response = await this.apiCall(`/content/email/${this.currentJobId}/${market}`);
            
            if (response.success && response.email) {
                this.showEmailModal(response.email, market);
            } else {
                throw new Error('Invalid email response format');
            }
            
        } catch (error) {
            console.error('Failed to load pitch email:', error);
            this.showToast('Failed to load pitch email', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * View press release for a specific market
     */
    async viewPressRelease(market) {
        try {
            this.showLoading();
            
            // DEBUG: Log the market being requested
            console.log('🔍 DEBUG - Requesting press release for market:', market);
            console.log('🔍 DEBUG - Current job ID:', this.currentJobId);
            
            // Fetch press release content from job data
            const response = await this.apiCall(`/content/jobs/${this.currentJobId}`);
            
            // DEBUG: Log the complete API response structure
            console.log('🔍 DEBUG - Complete API response:', JSON.stringify(response, null, 2));
            
            // Enhanced response validation and data extraction
            if (response && (response.success !== false)) {
                let marketResult = null;
                let jobData = response.job || response; // Handle both wrapped and direct responses
                
                console.log('🔍 DEBUG - Job data structure:', {
                    hasResults: !!jobData.results,
                    resultsKeys: jobData.results ? Object.keys(jobData.results) : 'no results',
                    hasVariants: !!(jobData.results && jobData.results.variants),
                    variantsLength: jobData.results && jobData.results.variants ? jobData.results.variants.length : 0
                });
                
                // FIXED: Handle the actual backend response structure
                if (jobData.results && jobData.results.variants && Array.isArray(jobData.results.variants)) {
                    console.log('🔍 DEBUG - Processing variants array:', jobData.results.variants.length, 'variants');
                    
                    // Find the market variant
                    marketResult = jobData.results.variants.find(v => v.market === market);
                    
                    if (!marketResult) {
                        // Try alternative market matching (case insensitive, partial match)
                        marketResult = jobData.results.variants.find(v =>
                            v.market && v.market.toLowerCase().includes(market.toLowerCase())
                        );
                    }
                    
                    console.log('🔍 DEBUG - Market result found:', !!marketResult);
                    if (marketResult) {
                        console.log('🔍 DEBUG - Market result structure:', {
                            hasContent: !!marketResult.content,
                            contentType: typeof marketResult.content,
                            contentLength: marketResult.content ? marketResult.content.length : 0,
                            marketResultKeys: Object.keys(marketResult)
                        });
                    }
                    
                } else if (jobData.results && Array.isArray(jobData.results)) {
                    // Fallback: Handle direct results array
                    console.log('🔍 DEBUG - Processing direct results array');
                    marketResult = jobData.results.find(r => r.market === market);
                } else {
                    // Try to find variants in different locations
                    console.log('🔍 DEBUG - Searching for variants in alternative locations');
                    if (jobData.variants && Array.isArray(jobData.variants)) {
                        marketResult = jobData.variants.find(v => v.market === market);
                    }
                }
                
                // FIXED: Validate content exists and show modal
                if (marketResult) {
                    // FIXED: Handle nested content structure - content is at marketResult.content.content
                    const actualContent = marketResult.content?.content || marketResult.content;
                    if (actualContent && typeof actualContent === 'string' && actualContent.length > 0) {
                        console.log('✅ SUCCESS - Found press release content, length:', actualContent.length);
                        this.showPressReleaseModal(marketResult, market);
                    } else {
                        console.error('❌ ERROR - Market result found but no valid content:', {
                            hasContent: !!marketResult.content,
                            contentType: typeof marketResult.content,
                            hasNestedContent: !!(marketResult.content?.content),
                            nestedContentType: typeof marketResult.content?.content,
                            contentPreview: actualContent && typeof actualContent === 'string' ?
                                actualContent.substring(0, 100) : 'no content'
                        });
                        throw new Error('Press release content is empty or invalid for this market');
                    }
                } else {
                    console.error('❌ ERROR - No market result found for:', market);
                    console.error('Available markets:', jobData.results && jobData.results.variants ?
                        jobData.results.variants.map(v => v.market) : 'no variants found');
                    throw new Error(`Press release not found for market: ${market}`);
                }
            } else {
                console.error('❌ ERROR - Invalid API response:', response);
                throw new Error('Invalid job response format');
            }
            
        } catch (error) {
            console.error('❌ FAILED to load press release:', error);
            this.showToast(`Failed to load press release: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Show press release modal with content
     */
    showPressReleaseModal(marketResult, market) {
        // Create press release modal if it doesn't exist
        let pressReleaseModal = document.getElementById('press-release-modal');
        if (!pressReleaseModal) {
            this.createPressReleaseModal();
            pressReleaseModal = document.getElementById('press-release-modal');
        }

        // Update modal content
        document.getElementById('press-release-title').textContent = `Press Release: ${market}`;
        
        // FIXED: Extract headline and content from the correct nested structure
        // Handle both nested (content.content) and direct (content) structures
        let headline = 'Press Release';
        let content = '';
        
        // Extract actual content from nested structure
        const actualContent = marketResult.content?.content || marketResult.content;
        
        if (actualContent && typeof actualContent === 'string') {
            content = actualContent;
            
            // Extract headline from markdown content (first # header)
            const headlineMatch = content.match(/^#\s+(.+)$/m);
            if (headlineMatch) {
                headline = headlineMatch[1].trim();
            } else {
                // Fallback: use first line if no markdown header found
                const firstLine = content.split('\n')[0];
                if (firstLine && firstLine.length > 0 && firstLine.length < 200) {
                    headline = firstLine.replace(/^#+\s*/, '').trim();
                }
            }
        } else {
            content = 'No content available';
            console.error('❌ ERROR - Invalid content structure in marketResult:', {
                hasContent: !!marketResult.content,
                contentType: typeof marketResult.content,
                hasNestedContent: !!(marketResult.content?.content),
                nestedContentType: typeof marketResult.content?.content,
                marketResultKeys: Object.keys(marketResult)
            });
        }
        
        console.log('✅ SUCCESS - Press release content extraction:', {
            market,
            headline: headline && typeof headline === 'string' ? headline.substring(0, 100) : 'No headline',
            contentLength: content.length,
            contentPreview: content && typeof content === 'string' ? content.substring(0, 200) : 'No content'
        });
        
        document.getElementById('press-release-headline').textContent = headline;
        
        // SECURITY FIX: Use safe DOM manipulation for formatted content
        const pressReleaseContentEl = document.getElementById('press-release-content');
        pressReleaseContentEl.textContent = '';
        
        // Create a temporary div to parse the formatted HTML safely
        const tempDiv = document.createElement('div');
        const formattedContent = this.formatPressReleaseContent(content);
        
        // Parse the formatted content and append as DOM nodes
        const parser = new DOMParser();
        const doc = parser.parseFromString(formattedContent, 'text/html');
        Array.from(doc.body.childNodes).forEach(node => {
            pressReleaseContentEl.appendChild(node.cloneNode(true));
        });
        
        // Update quality score if available
        const qualityScore = marketResult.validation?.overallScore ||
                           marketResult.metadata?.confidence ||
                           marketResult.qualityScore || 85; // Default quality score
        document.getElementById('press-release-quality').textContent = `Quality Score: ${Math.round(qualityScore)}%`;

        // Show the modal
        pressReleaseModal.classList.add('active');
        
        console.log('✅ SUCCESS - Press release modal displayed for market:', market);
    }

    /**
     * Show email modal with composed email
     */
    showEmailModal(emailData, market) {
        // Create email modal if it doesn't exist
        let emailModal = document.getElementById('email-modal');
        if (!emailModal) {
            this.createEmailModal();
            emailModal = document.getElementById('email-modal');
        }

        // Update modal content
        document.getElementById('email-title').textContent = `Pitch Email: ${market}`;
        document.getElementById('email-subject').textContent = emailData.subject;
        
        // SECURITY FIX: Use safe DOM manipulation for email HTML
        const emailHtmlContentEl = document.getElementById('email-html-content');
        emailHtmlContentEl.textContent = '';
        
        // Parse email HTML safely
        const parser = new DOMParser();
        const emailDoc = parser.parseFromString(emailData.html, 'text/html');
        Array.from(emailDoc.body.childNodes).forEach(node => {
            emailHtmlContentEl.appendChild(node.cloneNode(true));
        });
        
        document.getElementById('email-text-content').textContent = emailData.text;

        // Show the modal
        emailModal.classList.add('active');
    }

    /**
     * Create press release modal HTML structure
     */
    createPressReleaseModal() {
        const modalHTML = `
            <div id="press-release-modal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="press-release-title">Press Release</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="press-release-container">
                            <div class="press-release-header">
                                <div class="press-release-headline">
                                    <h4 id="press-release-headline"></h4>
                                </div>
                                <div class="press-release-meta">
                                    <span id="press-release-quality" class="quality-indicator"></span>
                                </div>
                                <div class="press-release-actions">
                                    <button id="copy-press-release" class="btn btn-primary">
                                        <i class="fas fa-copy"></i> Copy to Clipboard
                                    </button>
                                </div>
                            </div>
                            <div class="press-release-content">
                                <div id="press-release-content" class="press-release-body"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert modal into DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Bind modal events
        this.bindPressReleaseModalEvents();
    }

    /**
     * Create email modal HTML structure
     */
    createEmailModal() {
        const modalHTML = `
            <div id="email-modal" class="modal">
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="email-title">Pitch Email</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="email-container">
                            <div class="email-header">
                                <div class="email-subject-line">
                                    <strong>Subject:</strong> <span id="email-subject"></span>
                                </div>
                                <div class="email-actions">
                                    <button id="copy-email-html" class="btn btn-primary">
                                        <i class="fas fa-copy"></i> Copy HTML
                                    </button>
                                    <button id="copy-email-text" class="btn btn-outline">
                                        <i class="fas fa-copy"></i> Copy Text
                                    </button>
                                    <button id="toggle-email-view" class="btn btn-outline">
                                        <i class="fas fa-eye"></i> Toggle View
                                    </button>
                                </div>
                            </div>
                            <div class="email-content">
                                <div id="email-html-view" class="email-view active">
                                    <h4>HTML Preview</h4>
                                    <div id="email-html-content" class="email-preview"></div>
                                </div>
                                <div id="email-text-view" class="email-view">
                                    <h4>Plain Text</h4>
                                    <pre id="email-text-content" class="email-text"></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert modal into DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Bind modal events
        this.bindEmailModalEvents();
    }

    /**
     * Bind press release modal events
     */
    bindPressReleaseModalEvents() {
        const pressReleaseModal = document.getElementById('press-release-modal');
        
        // Close modal events
        pressReleaseModal.querySelector('.modal-close').addEventListener('click', () => {
            pressReleaseModal.classList.remove('active');
        });
        
        pressReleaseModal.addEventListener('click', (e) => {
            if (e.target === pressReleaseModal) {
                pressReleaseModal.classList.remove('active');
            }
        });

        // Copy functionality
        document.getElementById('copy-press-release').addEventListener('click', () => {
            this.copyPressReleaseContent();
        });
    }

    /**
     * Bind email modal events
     */
    bindEmailModalEvents() {
        const emailModal = document.getElementById('email-modal');
        
        // Close modal events
        emailModal.querySelector('.modal-close').addEventListener('click', () => {
            emailModal.classList.remove('active');
        });
        
        emailModal.addEventListener('click', (e) => {
            if (e.target === emailModal) {
                emailModal.classList.remove('active');
            }
        });

        // Copy functionality
        document.getElementById('copy-email-html').addEventListener('click', () => {
            this.copyEmailContent('html');
        });

        document.getElementById('copy-email-text').addEventListener('click', () => {
            this.copyEmailContent('text');
        });

        // Toggle view
        document.getElementById('toggle-email-view').addEventListener('click', () => {
            this.toggleEmailView();
        });
    }

    /**
     * Copy press release content to clipboard
     */
    copyPressReleaseContent() {
        const content = document.getElementById('press-release-content').textContent;
        const headline = document.getElementById('press-release-headline').textContent;
        const fullContent = `${headline}\n\n${content}`;
        
        navigator.clipboard.writeText(fullContent).then(() => {
            this.showToast('Press release copied to clipboard', 'success');
        }).catch(err => {
            console.error('Failed to copy press release:', err);
            this.showToast('Failed to copy press release', 'error');
        });
    }

    /**
     * Format press release content for display
     */
    formatPressReleaseContent(content) {
        if (!content) return 'No content available';
        
        console.log('🔧 FORMATTING - Input content preview:', content.substring(0, 200));
        
        // Step 1: Convert markdown headers to HTML
        let formattedContent = content
            .replace(/^# (.+)$/gm, '<h2>$1</h2>')
            .replace(/^## (.+)$/gm, '<h3>$1</h3>')
            .replace(/^### (.+)$/gm, '<h4>$1</h4>');
        
        // Step 2: Split content into paragraphs using double newlines
        const paragraphs = formattedContent.split(/\n\n+/);
        
        // Step 3: Process each paragraph
        const processedParagraphs = paragraphs.map(paragraph => {
            const trimmed = paragraph.trim();
            if (!trimmed) return ''; // Skip empty paragraphs
            
            // If it's already a header, don't wrap in <p>
            if (trimmed.match(/^<h[2-4]>/)) {
                return trimmed;
            }
            
            // Convert single newlines within paragraphs to <br> tags
            const withBreaks = trimmed.replace(/\n/g, '<br>');
            
            // Wrap in paragraph tags
            return `<p>${withBreaks}</p>`;
        }).filter(p => p); // Remove empty paragraphs
        
        // Step 4: Join paragraphs with proper spacing
        formattedContent = processedParagraphs.join('\n\n');
        
        console.log('✅ FORMATTING - Output preview:', formattedContent.substring(0, 300));
        console.log('📊 FORMATTING - Paragraph count:', processedParagraphs.length);
        
        return formattedContent;
    }

    /**
     * Copy email content to clipboard
     */
    async copyEmailContent(type) {
        try {
            let content;
            if (type === 'html') {
                content = document.getElementById('email-html-content').innerHTML;
            } else {
                content = document.getElementById('email-text-content').textContent;
            }

            await navigator.clipboard.writeText(content);
            this.showToast(`${type.toUpperCase()} email copied to clipboard!`, 'success');
        } catch (error) {
            console.error('Failed to copy email:', error);
            this.showToast('Failed to copy email content', 'error');
        }
    }

    /**
     * Toggle between HTML and text email views
     */
    toggleEmailView() {
        const htmlView = document.getElementById('email-html-view');
        const textView = document.getElementById('email-text-view');
        
        if (htmlView.classList.contains('active')) {
            htmlView.classList.remove('active');
            textView.classList.add('active');
        } else {
            textView.classList.remove('active');
            htmlView.classList.add('active');
        }
    }
    /**
     * Download all results
     */
    async downloadAll() {
        try {
            if (!this.currentJobId) {
                throw new Error('No active job found');
            }
            
            // Show loading indicator with specific message
            this.showLoading();
            this.showToast('Preparing download...', 'info');
            
            const url = `${this.apiBaseUrl}/content/download/${this.currentJobId}`;
            console.log('Downloading all variants from URL:', url);
            
            // First, verify the download endpoint is available
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (!response.ok) {
                    throw new Error(`Download not available: ${response.status} ${response.statusText}`);
                }
            } catch (fetchError) {
                console.warn('HEAD request failed, proceeding with download attempt:', fetchError);
            }
            
            // Create download link and trigger download
            const link = document.createElement('a');
            link.href = url;
            link.download = `press-releases-${this.currentJobId}.zip`;
            link.style.display = 'none';
            
            // Add to DOM, click, and remove
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            this.showToast('Download started successfully', 'success');
            
            // Hide loading after a short delay to allow download to start
            setTimeout(() => {
                this.hideLoading();
            }, 2000);
            
            // Log download attempt for debugging
            console.log('Download initiated for job:', this.currentJobId);
            
        } catch (error) {
            console.error('Failed to download all variants:', error);
            this.showToast(`Failed to download: ${error.message}`, 'error');
            this.hideLoading();
            
            // Provide fallback option
            if (this.currentResults && this.currentResults.length > 0) {
                console.log('Offering individual downloads as fallback');
                this.showToast('Try downloading individual variants instead', 'info');
            }
        }
    }

    /**
     * Download specific format
     */
    async downloadFormat(format) {
        try {
            const url = `${this.apiBaseUrl}/content/download/${this.currentJobId}?format=${format}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `press-releases-${format}.zip`;
            link.click();
            
            this.showToast(`Downloading ${format.toUpperCase()} format`, 'success');
        } catch (error) {
            console.error('Failed to download format:', error);
            this.showToast(`Failed to download ${format.toUpperCase()} format`, 'error');
        }
    }

    /**
     * Set results view mode
     */
    setResultsView(view) {
        const container = document.getElementById('results-container');
        const gridBtn = document.getElementById('grid-view');
        const listBtn = document.getElementById('list-view');
        
        if (view === 'grid') {
            container.className = 'results-container grid-view';
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        } else {
            container.className = 'results-container list-view';
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        }
    }

    /**
     * Reset the application to start over
     */
    resetApplication() {
        this.currentStep = 1;
        this.currentJobId = null;
        this.selectedMarkets = [];
        this.stopProgressPolling();
        
        // Clear form data
        document.getElementById('press-release-input').value = '';
        document.getElementById('char-count').textContent = '0';
        document.getElementById('validation-feedback').innerHTML = '';
        
        // Reset configuration
        document.querySelector('input[name="market-selection"][value="all"]').checked = true;
        document.querySelectorAll('input[name="formats"]').forEach(cb => {
            cb.checked = ['json', 'txt', 'html', 'pitch'].includes(cb.value);
        });
        document.querySelector('input[name="validation-mode"][value="standard"]').checked = true;
        
        // Go to first step
        this.goToStep(1);
        
        this.showToast('Started new generation session', 'success');
    }

    /**
     * Check system health
     */
    async checkSystemHealth() {
        try {
            this.showLoading();
            const response = await this.apiCall('/status');
            
            // Check if we got a successful response with system information
            // Response has 'status' (not 'message') and 'version' fields
            if (response && response.status && response.version) {
                this.showToast(`System is ${response.status} and ready`, 'success');
            } else {
                this.showToast('System health check failed', 'warning');
            }
        } catch (error) {
            console.error('Health check failed:', error);
            this.showToast('System is not responding', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Add entry to generation log
     */
    addLogEntry(message, type = 'info') {
        const log = document.getElementById('generation-log');
        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${timestamp}] ${message}`;
        
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    /**
     * Close all modals
     */
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    /**
     * Show loading overlay
     */
    showLoading() {
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // SECURITY FIX: Build toast structure safely instead of innerHTML
        const toastContent = document.createElement('div');
        toastContent.style.display = 'flex';
        toastContent.style.alignItems = 'center';
        toastContent.style.gap = '8px';
        
        const icon = document.createElement('i');
        icon.className = `fas fa-${this.getToastIcon(type)}`;
        
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        
        toastContent.appendChild(icon);
        toastContent.appendChild(messageSpan);
        toast.appendChild(toastContent);
        
        container.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    /**
     * Get toast icon by type
     */
    getToastIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    /**
     * Format time in seconds to human readable format
     */
    formatTime(seconds) {
        // Handle invalid input
        if (!seconds || isNaN(seconds) || seconds < 0) {
            return '0s';
        }
        
        // Convert to number if it's a string
        seconds = Number(seconds);
        
        // Handle milliseconds input (convert to seconds)
        if (seconds > 1000000) { // If it's likely in milliseconds
            seconds = seconds / 1000;
        }
        
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            
            // Sanity check to prevent unreasonable values
            if (hours > 24) {
                return `${Math.min(hours, 24)}h ${minutes}m`;
            }
            
            return `${hours}h ${minutes}m`;
        }
    }

    /**
     * Make API call with error handling and retries
     */
    async apiCall(endpoint, method = 'GET', data = null, retries = 0) {
      try {
        const options = {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
        };
    
        if (data) {
          options.body = JSON.stringify(data);
        }
    
        const url = `${this.apiBaseUrl}${endpoint}`;
        console.log(`Making API call: ${method} ${url}`, options);
        
        // DEBUG: Log API call details
        console.log('DEBUG - API call details:', {
          method,
          url,
          endpoint,
          hasData: !!data,
          dataSize: data ? JSON.stringify(data).length : 0,
          apiBaseUrl: this.apiBaseUrl,
          retryAttempt: retries
        });
        
        const response = await fetch(url, options);
        
        console.log(`API response status: ${response.status} ${response.statusText}`);
        
        // ENHANCED 429 ERROR HANDLING
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
          const rateLimitReset = response.headers.get('X-RateLimit-Reset');
          
          console.error('🚫 RATE LIMIT - 429 Error Details:', {
            endpoint,
            method,
            retryAfter,
            rateLimitRemaining,
            rateLimitReset,
            retryAttempt: retries,
            timestamp: new Date().toISOString()
          });
          
          // Show user-friendly rate limiting message
          if (endpoint.includes('/content/jobs/')) {
            this.showToast('Checking job status... (rate limited, will retry)', 'warning');
          }
          
          // Calculate exponential backoff with jitter
          const baseDelay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retries) * 1000;
          const jitter = Math.random() * 1000; // Add up to 1 second jitter
          const delay = Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds
          
          console.log(`⏳ Rate limited, waiting ${Math.round(delay/1000)}s before retry...`);
          
          if (retries < this.config.maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.apiCall(endpoint, method, data, retries + 1);
          } else {
            throw new Error(`Rate limited after ${this.config.maxRetries} retries. Please try again later.`);
          }
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    
        const responseData = await response.json();
        console.log('API response data:', responseData);
        
        // DIAGNOSTIC: Log complete API response for job status endpoints
        if (endpoint.includes('/content/jobs/') && !endpoint.includes('DELETE')) {
          console.log('🔍 DIAGNOSTIC - Job status API response:', JSON.stringify(responseData, null, 2));
        }
        
        // DEBUG: Log response data structure
        console.log('DEBUG - API response structure:', {
          responseKeys: Object.keys(responseData),
          hasJobId: 'jobId' in responseData || (responseData.result && 'jobId' in responseData.result),
          hasStatus: 'status' in responseData || (responseData.result && 'status' in responseData.result),
          hasProgress: 'progress' in responseData || (responseData.result && 'progress' in responseData.result),
          hasProcessed: 'processed' in responseData,
          hasTotal: 'total' in responseData,
          hasMetadata: !!responseData.metadata || !!(responseData.result && responseData.result.metadata),
          metadataKeys: responseData.metadata ? Object.keys(responseData.metadata) : (responseData.result && responseData.result.metadata ? Object.keys(responseData.result.metadata) : []),
          metadataHasProcessed: (responseData.metadata && 'processed' in responseData.metadata) || (responseData.result && responseData.result.metadata && 'processed' in responseData.result.metadata),
          metadataHasTotal: (responseData.metadata && 'total' in responseData.metadata) || (responseData.result && responseData.result.metadata && 'total' in responseData.result.metadata),
          hasResult: !!responseData.result,
          resultKeys: responseData.result ? Object.keys(responseData.result) : []
        });
        
        return responseData;
      } catch (error) {
        console.error(`API call error for ${endpoint}:`, error);
        
        // DEBUG: Log detailed error information
        console.error('DEBUG - API call error details:', {
          endpoint,
          method,
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          retries,
          maxRetries: this.config.maxRetries
        });
        
        // Enhanced error handling for different error types
        if (error.message.includes('429') || error.message.includes('Rate limited')) {
          // Rate limiting error already handled above
          throw error;
        }
        
        if (retries < this.config.maxRetries) {
          console.warn(`API call failed, retrying... (${retries + 1}/${this.config.maxRetries})`);
          // Use exponential backoff for general errors too
          const delay = Math.min(Math.pow(2, retries) * 1000, 10000); // Cap at 10 seconds for general errors
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.apiCall(endpoint, method, data, retries + 1);
        }
        throw error;
      }
    }
    /**
     * Update market variants display
     */
    updateMarketVariantsDisplay(results) {
        const variantsContainer = document.getElementById('market-variants-status');
        if (!variantsContainer) {
            console.warn('Market variants container not found in DOM');
            return;
        }
        
        try {
            // Clear previous content - SECURITY FIX: Use textContent instead of innerHTML
            variantsContainer.textContent = '';
            
            if (!Array.isArray(results) || results.length === 0) {
                // SECURITY FIX: Use safe DOM manipulation
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-message';
                emptyDiv.textContent = 'No market variants available';
                variantsContainer.appendChild(emptyDiv);
                return;
            }
            
            console.log('Updating market variants display with results:', results.length, 'items');
            
            // Get top 10 markets (or all if less than 10)
            const topMarkets = results.slice(0, 10);
            
            // SECURITY FIX: Build DOM structure safely instead of using innerHTML with template strings
            const variantsHeader = document.createElement('div');
            variantsHeader.className = 'market-variants-header';
            
            const headerTitle = document.createElement('h4');
            headerTitle.textContent = 'Market Variants';
            
            const variantsSummary = document.createElement('div');
            variantsSummary.className = 'variants-summary';
            
            // Calculate summary statistics
            const successCount = results.filter(r => r.status !== 'failed' && !r.error).length;
            const avgQuality = results.length > 0 ?
                Math.round(results.reduce((sum, r) => {
                    const score = r.qualityScore || r.metadata?.confidence || 75;
                    return sum + (typeof score === 'number' ? score : 75);
                }, 0) / results.length) : 0;
            
            const totalCountSpan = document.createElement('span');
            totalCountSpan.className = 'total-count';
            totalCountSpan.textContent = `${results.length} total`;
            
            const successCountSpan = document.createElement('span');
            successCountSpan.className = 'success-count';
            successCountSpan.textContent = `${successCount} successful`;
            
            const avgQualitySpan = document.createElement('span');
            avgQualitySpan.className = 'avg-quality';
            avgQualitySpan.textContent = `Avg: ${avgQuality}%`;
            
            variantsSummary.appendChild(totalCountSpan);
            variantsSummary.appendChild(successCountSpan);
            variantsSummary.appendChild(avgQualitySpan);
            
            variantsHeader.appendChild(headerTitle);
            variantsHeader.appendChild(variantsSummary);
            
            const variantsList = document.createElement('div');
            variantsList.className = 'market-variants-list';
            
            // Create market variant items safely
            topMarkets.forEach((result, index) => {
                try {
                    // Extract quality score with multiple fallbacks and validation
                    let qualityScore = 0;
                    if (typeof result.qualityScore === 'number' && !isNaN(result.qualityScore)) {
                        qualityScore = result.qualityScore;
                    } else if (result.metadata?.confidence && typeof result.metadata.confidence === 'number') {
                        qualityScore = result.metadata.confidence;
                    } else if (result.metadata) {
                        qualityScore = 85;
                    } else {
                        qualityScore = 75;
                    }
                    
                    qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));
                    const qualityClass = this.getQualityClass(qualityScore);
                    
                    // Extract market name with multiple fallbacks
                    let marketName = 'Unknown Market';
                    if (result.marketName && typeof result.marketName === 'string') {
                        marketName = result.marketName;
                    } else if (result.market && typeof result.market === 'string') {
                        marketName = result.market;
                    } else if (result.name && typeof result.name === 'string') {
                        marketName = result.name.replace(/\.(json|txt|html)$/, '');
                    }
                    
                    const status = (result.status === 'failed' || result.error) ? 'failed' : 'success';
                    const statusIcon = status === 'success' ? '✓' : '✗';
                    
                    const variantItem = document.createElement('div');
                    variantItem.className = `market-variant-item ${status}`;
                    variantItem.dataset.market = result.market || index;
                    
                    const marketInfo = document.createElement('div');
                    marketInfo.className = 'market-info';
                    
                    const marketNameDiv = document.createElement('div');
                    marketNameDiv.className = 'market-name';
                    marketNameDiv.title = marketName;
                    marketNameDiv.textContent = marketName;
                    
                    const marketStatusDiv = document.createElement('div');
                    marketStatusDiv.className = 'market-status';
                    
                    const statusIconSpan = document.createElement('span');
                    statusIconSpan.className = `status-icon ${status}`;
                    statusIconSpan.textContent = statusIcon;
                    
                    marketStatusDiv.appendChild(statusIconSpan);
                    marketInfo.appendChild(marketNameDiv);
                    marketInfo.appendChild(marketStatusDiv);
                    
                    const variantStatus = document.createElement('div');
                    variantStatus.className = `variant-status ${status}`;
                    
                    const qualityIndicator = document.createElement('span');
                    qualityIndicator.className = `quality-indicator ${qualityClass}`;
                    qualityIndicator.title = `Quality Score: ${qualityScore}%`;
                    qualityIndicator.textContent = `${qualityScore}%`;
                    
                    variantStatus.appendChild(qualityIndicator);
                    variantItem.appendChild(marketInfo);
                    variantItem.appendChild(variantStatus);
                    
                    variantsList.appendChild(variantItem);
                    
                } catch (itemError) {
                    console.error('Error rendering market variant item:', itemError, result);
                    
                    const errorItem = document.createElement('div');
                    errorItem.className = 'market-variant-item error';
                    errorItem.dataset.index = index;
                    
                    const marketInfo = document.createElement('div');
                    marketInfo.className = 'market-info';
                    
                    const marketNameDiv = document.createElement('div');
                    marketNameDiv.className = 'market-name';
                    marketNameDiv.textContent = 'Error Processing Item';
                    
                    const marketStatusDiv = document.createElement('div');
                    marketStatusDiv.className = 'market-status';
                    
                    const statusIconSpan = document.createElement('span');
                    statusIconSpan.className = 'status-icon failed';
                    statusIconSpan.textContent = '✗';
                    
                    marketStatusDiv.appendChild(statusIconSpan);
                    marketInfo.appendChild(marketNameDiv);
                    marketInfo.appendChild(marketStatusDiv);
                    
                    const variantStatus = document.createElement('div');
                    variantStatus.className = 'variant-status failed';
                    
                    const qualityIndicator = document.createElement('span');
                    qualityIndicator.className = 'quality-indicator low';
                    qualityIndicator.title = 'Error occurred';
                    qualityIndicator.textContent = '0%';
                    
                    variantStatus.appendChild(qualityIndicator);
                    errorItem.appendChild(marketInfo);
                    errorItem.appendChild(variantStatus);
                    
                    variantsList.appendChild(errorItem);
                }
            });
            
            variantsContainer.appendChild(variantsHeader);
            variantsContainer.appendChild(variantsList);
            
            // Add note if showing subset
            if (results.length > 10) {
                const note = document.createElement('div');
                note.className = 'variants-note';
                note.textContent = `Showing top 10 of ${results.length} variants`;
                variantsContainer.appendChild(note);
            }
            
            console.log('Market variants display updated successfully:', {
                totalVariants: results.length,
                successfulVariants: successCount,
                averageQuality: avgQuality,
                displayedVariants: Math.min(results.length, 10)
            });
            
        } catch (error) {
            console.error('Failed to update market variants display:', error);
            
            // SECURITY FIX: Use safe DOM manipulation for error message
            variantsContainer.textContent = '';
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            
            const errorTitle = document.createElement('h4');
            errorTitle.textContent = 'Market Variants';
            
            const errorText = document.createElement('p');
            errorText.textContent = 'Error loading market variants display';
            
            errorDiv.appendChild(errorTitle);
            errorDiv.appendChild(errorText);
            variantsContainer.appendChild(errorDiv);
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PressReleaseApp();
});
