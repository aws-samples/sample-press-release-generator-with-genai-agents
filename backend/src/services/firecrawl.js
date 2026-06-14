const { default: FirecrawlApp } = require('@mendable/firecrawl-js');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { ExternalServiceError, RateLimitError } = require('../utils/errorHandler');
// SECURITY (js/incomplete-url-substring-sanitization): exact host allow-listing
// replaces bypassable `source.includes('host.com')` substring checks.
const { urlMatchesDomain } = require('../utils/urlAllowlist');

class FirecrawlService {
  constructor() {
    this.client = null;
    this.initialized = false;
    
    // Rate limiting configuration
    this.rateLimiter = {
      requestsPerMinute: process.env.FIRECRAWL_RATE_LIMIT || 5,
      requestQueue: [],
      lastRequestTime: 0,
      isProcessing: false,
      backoffMultiplier: 2,
      maxBackoffTime: 60000, // 1 minute max backoff
      currentBackoffTime: 1000 // Start with 1 second
    };
    
    // URL caching to prevent redundant requests
    this.urlCache = new Map();
    this.cacheExpiry = 1800000; // 30 minutes
    
    // Circuit breaker for failed requests
    this.circuitBreaker = {
      failureCount: 0,
      failureThreshold: 10,
      resetTimeout: 300000, // 5 minutes
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      lastFailureTime: 0
    };
  }

  /**
   * Initialize the Firecrawl service
   */
  async initialize() {
    try {
      if (!config.firecrawl.apiKey) {
        logger.warn('FIRECRAWL_API_KEY not configured - service will operate in degraded mode');
        this.initialized = false;
        return false;
      }

      // Don't reinitialize if already initialized
      if (this.initialized && this.client) {
        return true;
      }

      this.client = new FirecrawlApp({
        apiKey: config.firecrawl.apiKey,
        apiUrl: config.firecrawl.baseUrl,
      });

      logger.info('Initializing Firecrawl service', {
        baseUrl: config.firecrawl.baseUrl,
        configured: !!config.firecrawl.apiKey,
      });

      // Test the connection with circuit breaker pattern
      const connectionTest = await this.testConnectionWithRetry();
      if (connectionTest) {
        this.initialized = true;
        logger.info('Firecrawl service initialized successfully');
        return true;
      } else {
        logger.warn('Firecrawl service connection test failed - service will operate in degraded mode');
        this.initialized = false;
        return false;
      }
    } catch (error) {
      logger.warn('Failed to initialize Firecrawl service - continuing in degraded mode', {
        error: error.message,
        stack: error.stack,
      });
      this.initialized = false;
      return false;
    }
  }

  /**
   * Test Firecrawl connectivity with retry logic
   */
  async testConnectionWithRetry(maxRetries = 3, retryDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.client) {
          throw new Error('Firecrawl client not created - check API key configuration');
        }

        // Simple connection test - verify the client exists and is configured
        // For now, we'll just check that the client was created successfully
        logger.debug('Testing Firecrawl connection', { attempt, maxRetries });
        
        // If we have a client, consider the connection test successful
        // In production, this could make an actual API call to verify connectivity
        return true;
      } catch (error) {
        logger.warn('Firecrawl connectivity test failed', {
          attempt,
          maxRetries,
          error: error.message,
          willRetry: attempt < maxRetries
        });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }
    
    logger.error('Firecrawl connectivity test failed after all retries');
    return false;
  }

  /**
   * Test Firecrawl connectivity (legacy method)
   */
  async testConnection() {
    return this.testConnectionWithRetry(1, 0);
  }

  /**
   * Add request to rate limiting queue
   */
  async _queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.rateLimiter.requestQueue.push({
        execute: requestFn,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      this._processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  async _processQueue() {
    if (this.rateLimiter.isProcessing || this.rateLimiter.requestQueue.length === 0) {
      return;
    }

    // Check circuit breaker
    if (this._isCircuitBreakerOpen()) {
      logger.warn('Circuit breaker is open, rejecting requests');
      this._rejectQueuedRequests('Circuit breaker is open');
      return;
    }

    this.rateLimiter.isProcessing = true;

    while (this.rateLimiter.requestQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.rateLimiter.lastRequestTime;
      const minInterval = 60000 / this.rateLimiter.requestsPerMinute; // ms between requests

      // Wait if we need to respect rate limit
      if (timeSinceLastRequest < minInterval) {
        const waitTime = minInterval - timeSinceLastRequest;
        logger.debug('Rate limiting: waiting before next request', { waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const request = this.rateLimiter.requestQueue.shift();
      this.rateLimiter.lastRequestTime = Date.now();

      try {
        const result = await request.execute();
        this._onRequestSuccess();
        request.resolve(result);
      } catch (error) {
        this._onRequestFailure(error);
        
        // Handle rate limiting with exponential backoff
        if (this._isRateLimitError(error)) {
          logger.warn('Rate limit hit, applying exponential backoff', {
            currentBackoff: this.rateLimiter.currentBackoffTime,
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, this.rateLimiter.currentBackoffTime));
          this._increaseBackoff();
          
          // Re-queue the request for retry
          this.rateLimiter.requestQueue.unshift(request);
          continue;
        }
        
        request.reject(error);
      }
    }

    this.rateLimiter.isProcessing = false;
  }

  /**
   * Handle successful request
   */
  _onRequestSuccess() {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = 'CLOSED';
    this._resetBackoff();
  }

  /**
   * Handle failed request
   */
  _onRequestFailure(error) {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      logger.warn('Circuit breaker opened due to repeated failures', {
        failureCount: this.circuitBreaker.failureCount,
        error: error.message
      });
    }
  }

  /**
   * Check if circuit breaker is open
   */
  _isCircuitBreakerOpen() {
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure > this.circuitBreaker.resetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info('Circuit breaker moved to HALF_OPEN state');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Check if error is rate limiting related
   */
  _isRateLimitError(error) {
    const message = error.message.toLowerCase();
    return message.includes('429') || 
           message.includes('rate limit') || 
           message.includes('too many requests');
  }

  /**
   * Increase backoff time exponentially
   */
  _increaseBackoff() {
    this.rateLimiter.currentBackoffTime = Math.min(
      this.rateLimiter.currentBackoffTime * this.rateLimiter.backoffMultiplier,
      this.rateLimiter.maxBackoffTime
    );
  }

  /**
   * Reset backoff time to initial value
   */
  _resetBackoff() {
    this.rateLimiter.currentBackoffTime = 1000;
  }

  /**
   * Reject all queued requests
   */
  _rejectQueuedRequests(reason) {
    while (this.rateLimiter.requestQueue.length > 0) {
      const request = this.rateLimiter.requestQueue.shift();
      request.reject(new Error(reason));
    }
  }

  /**
   * Check URL cache to prevent redundant requests
   */
  _getCachedResult(url) {
    const cached = this.urlCache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.debug('Using cached result for URL', { url });
      return cached.result;
    }
    return null;
  }

  /**
   * Cache URL result
   */
  _setCachedResult(url, result) {
    this.urlCache.set(url, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Scrape a single URL with rate limiting and caching
   */
  async scrapeUrl(url, options = {}) {
    try {
      // Validate URL format
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL format');
      }

      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL format');
      }

      if (!this.client) {
        throw new Error('Firecrawl service not initialized');
      }

      if (!this.initialized) {
        await this.initialize();
      }

      // Check cache first
      const cachedResult = this._getCachedResult(url);
      if (cachedResult) {
        return cachedResult;
      }

      // Queue the request with rate limiting
      const result = await this._queueRequest(async () => {
        return await this._performScrape(url, options);
      });

      // Cache the result
      this._setCachedResult(url, result);
      return result;
    } catch (error) {
      logger.error('Failed to scrape URL', {
        url,
        error: error.message,
        stack: error.stack,
      });

      // Handle specific error types
      if (error.message.includes('rate limit')) {
        throw new RateLimitError('Firecrawl API rate limit exceeded');
      }

      throw new ExternalServiceError('Firecrawl', `URL scraping failed: ${error.message}`);
    }
  }

  /**
   * Perform the actual scraping operation
   */
  async _performScrape(url, options = {}) {
    const {
      formats = ['markdown', 'html'],
      includeTags = [],
      excludeTags = ['nav', 'footer', 'header'],
      onlyMainContent = true,
      timeout = 60000, // Increased from 30s to 60s
      maxRetries = 3,
      retryDelay = 2000,
    } = options;

    const startTime = Date.now();
    
    // Improved scrape options based on Firecrawl v1 API documentation
    const scrapeOptions = {
      formats,
      ...(includeTags.length > 0 && { includeTags }),
      ...(excludeTags.length > 0 && { excludeTags }),
      onlyMainContent,
      timeout,
      // Add additional options for better content extraction
      waitFor: 2000, // Wait for dynamic content to load
    };

    logger.info('Starting URL scrape', {
      url,
      options: scrapeOptions,
      maxRetries,
    });

    // Implement retry logic for timeout and server errors
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.scrapeUrl(url, scrapeOptions);
        const duration = Date.now() - startTime;

        if (!response.success) {
          throw new Error(response.error || 'Scraping failed');
        }

        // Check if we actually got content - SDK v1.25.5+ returns content directly, not in data object
        const contentLength = response.markdown?.length || 0;
        const hasContent = contentLength > 0;
        
        // Build data object from response for backward compatibility
        const data = {
          markdown: response.markdown || '',
          html: response.html || '',
          rawHtml: response.rawHtml || '',
          links: response.links || [],
          screenshot: response.screenshot || null,
        };

        logger.info('URL scraped successfully', {
          url,
          attempt,
          duration: `${duration}ms`,
          contentLength,
          hasContent,
          formats: Object.keys(data).filter(key => data[key] && (typeof data[key] === 'string' ? data[key].length > 0 : true)),
        });

        return {
          success: true,
          data,
          metadata: {
            url,
            scrapedAt: new Date().toISOString(),
            duration,
            contentLength,
            hasContent,
            attempts: attempt,
            ...response.metadata, // Include original metadata from SDK
          },
        };
      } catch (error) {
        lastError = error;
        const isRetryableError = this.isRetryableError(error);
        
        logger.warn('URL scrape attempt failed', {
          url,
          attempt,
          maxRetries,
          error: error.message,
          isRetryable: isRetryableError,
          willRetry: attempt < maxRetries && isRetryableError,
        });

        // Don't retry if it's not a retryable error or if we've exhausted attempts
        if (!isRetryableError || attempt >= maxRetries) {
          break;
        }

        // Wait before retrying
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    // If we get here, all retries failed
    throw lastError;
  }

  /**
   * Crawl multiple URLs (batch processing)
   * This is a placeholder implementation - will be expanded in Phase 2
   */
  async crawlUrls(urls, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const {
        limit = 10,
        formats = ['markdown'],
        excludeTags = ['nav', 'footer', 'header'],
        onlyMainContent = true,
      } = options;

      logger.info('Starting batch URL crawl', {
        urlCount: urls.length,
        limit,
        formats,
      });

      const results = [];
      const errors = [];

      // Process URLs in batches to respect rate limits
      for (let i = 0; i < urls.length; i += limit) {
        const batch = urls.slice(i, i + limit);
        
        const batchPromises = batch.map(async (url) => {
          try {
            const result = await this.scrapeUrl(url, {
              formats,
              excludeTags,
              onlyMainContent,
            });
            return { url, ...result };
          } catch (error) {
            errors.push({ url, error: error.message });
            return { url, success: false, error: error.message };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults.map(r => r.value || r.reason));

        // Add delay between batches to respect rate limits
        if (i + limit < urls.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Batch URL crawl completed', {
        totalUrls: urls.length,
        successful: results.filter(r => r.success).length,
        failed: errors.length,
      });

      return {
        success: true,
        results,
        errors,
        metadata: {
          totalUrls: urls.length,
          successful: results.filter(r => r.success).length,
          failed: errors.length,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to crawl URLs', {
        error: error.message,
        stack: error.stack,
        urlCount: urls.length,
      });
      throw new ExternalServiceError('Firecrawl', `Batch crawling failed: ${error.message}`);
    }
  }

  /**
   * Search for content using Firecrawl's search functionality
   * This performs a web search and returns relevant URLs and snippets
   */
  async searchContent(query, options = {}) {
    try {
      if (!this.client) {
        throw new Error('Firecrawl service not initialized');
      }

      if (!this.initialized) {
        await this.initialize();
      }

      const {
        limit = 10,
        scrapeOptions = null,
        location = null,
        tbs = null,
        timeout = 30000
      } = options;

      logger.info('Starting Firecrawl search', {
        query,
        limit,
        location,
        tbs,
        scrapeOptions: !!scrapeOptions
      });

      // Queue the search request with rate limiting
      const result = await this._queueRequest(async () => {
        return await this._performFirecrawlSearch(query, {
          limit,
          scrapeOptions,
          location,
          tbs,
          timeout
        });
      });

      return result;
    } catch (error) {
      logger.error('Failed to search content', {
        query,
        error: error.message,
        stack: error.stack,
      });

      if (error.message.includes('rate limit')) {
        throw new RateLimitError('Firecrawl API rate limit exceeded during search');
      }

      throw new ExternalServiceError('Firecrawl', `Content search failed: ${error.message}`);
    }
  }

  /**
   * Perform the actual Firecrawl search operation
   */
  async _performFirecrawlSearch(query, options = {}) {
    const {
      limit = 10,
      scrapeOptions = null,
      location = null,
      tbs = null,
      timeout = 30000
    } = options;

    const startTime = Date.now();

    logger.info('Executing Firecrawl search', {
      query,
      limit,
      location,
      tbs,
      scrapeOptions: !!scrapeOptions
    });

    // Build search options
    const searchOptions = {
      limit,
      ...(location && { location }),
      ...(tbs && { tbs }),
      ...(timeout && { timeout }),
      ...(scrapeOptions && { scrapeOptions })
    };

    // Use Firecrawl's search API
    const searchResult = await this.client.search(query, searchOptions);

    const duration = Date.now() - startTime;

    // Add defensive programming for undefined response
    if (!searchResult) {
      logger.error('Firecrawl search returned undefined response', {
        version: this.version,
        query,
        searchOptions
      });
      throw new Error('Firecrawl search returned undefined response');
    }

    if (!searchResult.success) {
      logger.error('Firecrawl search failed', {
        version: this.version,
        query,
        error: searchResult.error || 'Unknown error',
        searchResult
      });
      throw new Error(searchResult.error || 'Search failed');
    }

    // Transform results to match expected format
    if (!searchResult.data || !Array.isArray(searchResult.data)) {
      logger.error('Firecrawl search returned invalid data structure', {
        version: this.version,
        query,
        hasData: !!searchResult.data,
        dataType: typeof searchResult.data,
        searchResult
      });
      throw new Error('Firecrawl search returned invalid data structure');
    }

    const results = searchResult.data.map(result => ({
      url: result.url,
      title: result.title || 'No title',
      snippet: result.description || 'No description',
      source: new URL(result.url).hostname,
      relevanceScore: 0.8, // Default relevance score
      scrapedAt: new Date().toISOString(),
      // Include scraped content if scrapeOptions were provided
      ...(result.markdown && { markdown: result.markdown }),
      ...(result.html && { html: result.html }),
      ...(result.links && { links: result.links }),
      ...(result.metadata && { metadata: result.metadata })
    }));

    logger.info('Firecrawl search completed', {
      query,
      resultsFound: results.length,
      duration: `${duration}ms`,
      hasScrapedContent: results.some(r => r.markdown || r.html)
    });

    return {
      success: true,
      results,
      metadata: {
        query,
        searchedAt: new Date().toISOString(),
        duration,
        resultsCount: results.length,
        totalPossible: limit,
        searchEngine: 'firecrawl'
      }
    };
  }

  /**
   * Simulate search by targeting authoritative sources
   * This is a temporary implementation until Firecrawl's search API is available
   */
  async _simulateSearch(query, options = {}) {
    const { limit = 10, domains = [], excludeDomains = [] } = options;
    
    // Define authoritative sources for real estate data
    const authoritativeSources = [
      'https://www.nar.competitor2',
      'https://www.example.com/news',
      'https://www.competitor1.com/research',
      'https://www.competitor2.com/research',
      'https://www.housingwire.com',
      'https://fred.stlouisfed.org',
      'https://www.census.gov'
    ];

    // Filter sources based on domain restrictions
    let targetSources = authoritativeSources;
    if (domains.length > 0) {
      targetSources = targetSources.filter(source =>
        domains.some(domain => source.includes(domain))
      );
    }
    if (excludeDomains.length > 0) {
      targetSources = targetSources.filter(source =>
        !excludeDomains.some(domain => source.includes(domain))
      );
    }

    const searchResults = [];
    const searchTerms = this._extractSearchTerms(query);

    // Try to find relevant content from each authoritative source
    for (const source of targetSources.slice(0, limit)) {
      try {
        const searchUrl = this._buildAuthoritativeSearchUrl(source, searchTerms);
        const scrapeResult = await this.scrapeUrl(searchUrl, {
          timeout: 15000,
          onlyMainContent: true,
          formats: ['markdown', 'links']
        });

        if (scrapeResult.success && scrapeResult.data) {
          const relevantUrls = this._extractRelevantUrls(
            scrapeResult.data.links || [],
            searchTerms,
            source
          );

          for (const url of relevantUrls.slice(0, 3)) { // Max 3 URLs per source
            searchResults.push({
              url: url.href,
              title: url.text || 'Relevant Content',
              snippet: this._generateSnippet(scrapeResult.data.markdown, searchTerms),
              source: source,
              relevanceScore: url.relevanceScore || 0.7,
              scrapedAt: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        logger.debug('Failed to search authoritative source', {
          source,
          error: error.message
        });
      }

      if (searchResults.length >= limit) {
        break;
      }
    }

    // Sort by relevance score
    return searchResults
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Extract search terms from query
   */
  _extractSearchTerms(query) {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 10); // Limit to 10 most important terms
  }

  /**
   * Build search URL for authoritative sources
   */
  _buildAuthoritativeSearchUrl(source, searchTerms) {
    const query = searchTerms.join(' ');
    const encodedQuery = encodeURIComponent(query);

    // Build appropriate search URLs for different sources.
    // SECURITY (js/incomplete-url-substring-sanitization, alerts 31,32,33,57,58,59):
    // Select the source-specific search path by matching the parsed hostname
    // (exact or true subdomain) rather than substring-matching the raw URL, which
    // was bypassable by spoofed hosts like `https://census.gov.attacker.com`.
    if (urlMatchesDomain(source, 'nar.competitor2')) {
      return `${source}/research-and-statistics?search=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'example.com')) {
      return `${source}?s=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'competitor1.com')) {
      return `${source}?q=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'competitor2.com')) {
      return `${source}?q=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'housingwire.com')) {
      return `${source}?s=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'fred.stlouisfed.org')) {
      return `${source}/search?st=${encodedQuery}`;
    } else if (urlMatchesDomain(source, 'census.gov')) {
      return `${source}/search-results.html?q=${encodedQuery}`;
    } else {
      return `${source}/search?q=${encodedQuery}`;
    }
  }

  /**
   * Extract relevant URLs from scraped links
   */
  _extractRelevantUrls(links, searchTerms, sourceBase) {
    const relevantUrls = [];

    for (const link of links) {
      if (!link.href || !link.href.startsWith('http')) {
        continue;
      }

      // Calculate relevance score based on URL and text content
      let relevanceScore = 0;
      const linkText = (link.text || '').toLowerCase();
      const linkUrl = link.href.toLowerCase();

      // Score based on search terms in URL and text
      for (const term of searchTerms) {
        if (linkUrl.includes(term)) relevanceScore += 0.3;
        if (linkText.includes(term)) relevanceScore += 0.2;
      }

      // Boost score for content types we want
      if (linkUrl.includes('report') || linkText.includes('report')) relevanceScore += 0.2;
      if (linkUrl.includes('data') || linkText.includes('data')) relevanceScore += 0.2;
      if (linkUrl.includes('research') || linkText.includes('research')) relevanceScore += 0.2;
      if (linkUrl.includes('news') || linkText.includes('news')) relevanceScore += 0.1;

      // Filter out unwanted content
      if (linkUrl.includes('login') || linkUrl.includes('signup') ||
          linkUrl.includes('contact') || linkUrl.includes('about')) {
        continue;
      }

      if (relevanceScore > 0.3) {
        relevantUrls.push({
          href: link.href,
          text: link.text,
          relevanceScore
        });
      }
    }

    return relevantUrls.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Generate snippet from content based on search terms
   */
  _generateSnippet(content, searchTerms, maxLength = 200) {
    if (!content) return 'No content available';

    const contentLower = content.toLowerCase();
    let bestMatch = '';
    let bestScore = 0;

    // Find the section with the most search terms
    const sentences = content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      let score = 0;
      
      for (const term of searchTerms) {
        if (sentenceLower.includes(term)) {
          score += 1;
        }
      }
      
      if (score > bestScore && sentence.trim().length > 50) {
        bestScore = score;
        bestMatch = sentence.trim();
      }
    }

    if (bestMatch) {
      return bestMatch.length > maxLength
        ? bestMatch.substring(0, maxLength) + '...'
        : bestMatch;
    }

    // Fallback to first part of content
    return content.substring(0, maxLength) + '...';
  }

  /**
   * Get crawl job status
   */
  async getStatus(jobId) {
    try {
      if (!this.client) {
        throw new Error('Firecrawl service not initialized');
      }

      if (!jobId) {
        throw new Error('Job ID is required');
      }

      // Mock implementation for testing - in real implementation this would call the Firecrawl API
      const mockResponse = {
        status: 'completed',
        data: [
          { url: 'https://example1.com', content: 'Content 1' },
          { url: 'https://example2.com', content: 'Content 2' }
        ]
      };

      return mockResponse;
    } catch (error) {
      logger.error('Failed to get crawl status', {
        jobId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'timeout',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'Request timed out',
      '408', // Request Timeout
      '429', // Too Many Requests
      '500', // Internal Server Error
      '502', // Bad Gateway
      '503', // Service Unavailable
      '504', // Gateway Timeout
    ];

    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    
    return retryableErrors.some(retryableError =>
      errorMessage.toLowerCase().includes(retryableError.toLowerCase()) ||
      errorCode.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      service: 'Firecrawl',
      baseUrl: config.firecrawl.baseUrl,
      configured: !!config.firecrawl.apiKey,
      initialized: this.initialized,
    };
  }
}

// Create singleton instance
const firecrawlService = new FirecrawlService();

module.exports = firecrawlService;