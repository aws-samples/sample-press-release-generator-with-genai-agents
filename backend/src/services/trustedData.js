const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { ValidationError, ExternalServiceError } = require('../utils/errorHandler');

/**
 * Trusted Data Service
 * Provides access to pre-processed market data from JSON files in trusteddata/ directory
 * 
 * Features:
 * - Read and parse JSON files from trusteddata/ directory
 * - Format data to match firecrawl service output structure
 * - Caching and error handling
 * - Market-specific data filtering
 */
class TrustedDataService {
  constructor() {
    this.name = 'Trusted Data Service';
    this.initialized = false;
    this.dataCache = new Map();
    this.cacheExpiry = 3600000; // 1 hour cache
    
    // Configuration with multiple possible paths for Docker compatibility
    this.config = {
      dataDirectory: null, // Will be determined dynamically
      possibleDataDirectories: [
        path.join(__dirname, '../../../trusteddata'),     // Original path
        path.join(process.cwd(), 'trusteddata'),          // From process working directory
        path.join(__dirname, '../../trusteddata'),        // Alternative relative path
        '/app/trusteddata'                                // Absolute Docker path
      ],
      supportedFiles: [
        'April 2025 Market Tracker Data for Reporters - national.json',
        'April 2025 Market Tracker Data for Reporters (1).json'
      ],
      maxRecords: 10000,
      defaultTimeout: 5000
    };

    // Data structure mapping
    this.dataMapping = {
      // Map trusted data fields to expected output format
      fieldMappings: {
        'MONTH': 'date',
        'MEDIAN_SALE_PRICE': 'medianSalePrice',
        'MEDIAN_SALE_PRICE_MOM': 'medianSalePriceMoM',
        'MEDIAN_SALE_PRICE_YOY': 'medianSalePriceYoY',
        'PENDING_SALES_SA': 'pendingSales',
        'PENDING_SALES_MOM_SA': 'pendingSalesMoM',
        'PENDING_SALES_YOY_SA': 'pendingSalesYoY',
        'HOMES_SOLD_SA': 'homesSold',
        'HOMES_SOLD_MOM_SA': 'homesSoldMoM',
        'HOMES_SOLD_YOY_SA': 'homesSoldYoY',
        'NEW_LISTINGS_SA': 'newListings',
        'NEW_LISTINGS_MOM_SA': 'newListingsMoM',
        'NEW_LISTINGS_YOY_SA': 'newListingsYoY',
        'ACTIVE_LISTINGS_SA': 'activeListings',
        'ACTIVE_LISTINGS_MOM_SA': 'activeListingsMoM',
        'ACTIVE_LISTINGS_YOY_SA': 'activeListingsYoY',
        'MONTHS_OF_SUPPLY': 'monthsOfSupply',
        'MONTHS_OF_SUPPLY_MOM': 'monthsOfSupplyMoM',
        'MONTHS_OF_SUPPLY_YOY': 'monthsOfSupplyYoY'
      }
    };

    logger.info('Trusted Data Service created', {
      dataDirectory: this.config.dataDirectory,
      supportedFiles: this.config.supportedFiles.length
    });
  }

  /**
   * Initialize the trusted data service
   */
  async initialize() {
    try {
      logger.info('Initializing Trusted Data Service');

      // Find the correct data directory from possible paths
      let foundDataDirectory = null;
      for (const possiblePath of this.config.possibleDataDirectories) {
        try {
          logger.info(`Checking trusted data directory: ${possiblePath}`);
          await fs.access(possiblePath);
          
          // Check if at least one supported file exists
          let hasValidFile = false;
          for (const fileName of this.config.supportedFiles) {
            try {
              const filePath = path.join(possiblePath, fileName);
              await fs.access(filePath);
              hasValidFile = true;
              logger.info(`Found trusted data file: ${filePath}`);
              break;
            } catch (fileError) {
              logger.warn(`Trusted data file not found: ${path.join(possiblePath, fileName)}`);
            }
          }
          
          if (hasValidFile) {
            foundDataDirectory = possiblePath;
            logger.info(`Successfully found trusted data directory: ${possiblePath}`);
            break;
          }
        } catch (error) {
          logger.warn(`Trusted data directory not accessible: ${possiblePath} - ${error.message}`);
        }
      }

      if (!foundDataDirectory) {
        logger.error('No valid trusted data directory found', {
          attemptedPaths: this.config.possibleDataDirectories,
          workingDirectory: process.cwd(),
          __dirname: __dirname
        });
        throw new Error(`Trusted data directory not found. Attempted paths: ${this.config.possibleDataDirectories.join(', ')}`);
      }

      // Set the found directory
      this.config.dataDirectory = foundDataDirectory;

      // Validate data files exist and are readable
      const validationResults = await this._validateDataFiles();
      
      if (validationResults.validFiles === 0) {
        throw new Error('No valid trusted data files found');
      }

      // Pre-load and cache data for faster access
      await this._preloadData();

      this.initialized = true;
      logger.info('Trusted Data Service initialized successfully', {
        dataDirectory: this.config.dataDirectory,
        validFiles: validationResults.validFiles,
        totalRecords: validationResults.totalRecords,
        cacheSize: this.dataCache.size
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize Trusted Data Service', {
        error: error.message,
        stack: error.stack
      });
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Get market data in format compatible with firecrawl service
   * @param {Object} options - Query options
   * @returns {Object} Formatted market data
   */
  async getMarketData(options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const {
        market = 'national',
        dateRange = null,
        limit = 100,
        format = 'markdown',
        includeMetadata = true
      } = options;

      logger.info('Retrieving trusted market data', {
        market,
        dateRange,
        limit,
        format
      });

      // Get cached or fresh data
      const rawData = await this._getCachedData();
      
      // Filter and format data
      const filteredData = this._filterData(rawData, { market, dateRange, limit });
      
      // Format data to match firecrawl output structure
      const formattedData = this._formatDataForCompatibility(filteredData, format);

      // Generate markdown content
      const markdownContent = this._generateMarkdownContent(filteredData);

      const result = {
        success: true,
        data: {
          markdown: markdownContent,
          html: format === 'html' ? this._generateHtmlContent(filteredData) : '',
          rawHtml: '',
          links: [],
          screenshot: null,
          // Include structured data for processing
          structuredData: formattedData
        },
        metadata: {
          source: 'trusted_data',
          dataFiles: this.config.supportedFiles,
          recordCount: filteredData.length,
          market,
          retrievedAt: new Date().toISOString(),
          format,
          ...(includeMetadata && {
            dateRange: this._getDataDateRange(filteredData),
            latestData: filteredData[0] || null,
            dataQuality: this._assessDataQuality(filteredData)
          })
        }
      };

      logger.info('Trusted market data retrieved successfully', {
        recordCount: filteredData.length,
        contentLength: markdownContent.length,
        market
      });

      return result;
    } catch (error) {
      logger.error('Failed to get trusted market data', {
        error: error.message,
        stack: error.stack,
        options
      });
      throw new ExternalServiceError('TrustedData', `Market data retrieval failed: ${error.message}`);
    }
  }

  /**
   * Search content within trusted data
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Object} Search results in firecrawl-compatible format
   */
  async searchContent(query, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const {
        limit = 10,
        market = 'national',
        includeData = true
      } = options;

      logger.info('Searching trusted data content', {
        query,
        limit,
        market
      });

      // Get all data
      const rawData = await this._getCachedData();
      
      // Search within the data
      const searchResults = this._searchWithinData(rawData, query, { limit, market });

      // Format results to match firecrawl search output
      const results = searchResults.map((result, index) => ({
        url: `trusted://data/record/${index}`,
        title: `Market Data - ${result.date || result.MONTH}`,
        snippet: this._generateSearchSnippet(result, query),
        source: 'trusted_data',
        relevanceScore: result.relevanceScore || 0.8,
        scrapedAt: new Date().toISOString(),
        ...(includeData && {
          markdown: this._generateMarkdownForRecord(result),
          metadata: {
            recordType: 'market_data',
            dataSource: 'trusted',
            ...result
          }
        })
      }));

      const searchResponse = {
        success: true,
        results,
        metadata: {
          query,
          searchedAt: new Date().toISOString(),
          resultsCount: results.length,
          totalPossible: limit,
          searchEngine: 'trusted_data',
          market
        }
      };

      logger.info('Trusted data search completed', {
        query,
        resultsFound: results.length,
        market
      });

      return searchResponse;
    } catch (error) {
      logger.error('Failed to search trusted data content', {
        query,
        error: error.message,
        stack: error.stack
      });
      throw new ExternalServiceError('TrustedData', `Content search failed: ${error.message}`);
    }
  }

  /**
   * Validate data files exist and are readable
   */
  async _validateDataFiles() {
    let validFiles = 0;
    let totalRecords = 0;

    for (const fileName of this.config.supportedFiles) {
      try {
        const filePath = path.join(this.config.dataDirectory, fileName);
        await fs.access(filePath);
        
        // Try to read and parse the file
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (Array.isArray(data) && data.length > 0) {
          validFiles++;
          totalRecords += data.length;
          logger.debug('Validated data file', {
            fileName,
            recordCount: data.length
          });
        }
      } catch (error) {
        logger.warn('Failed to validate data file', {
          fileName,
          error: error.message
        });
      }
    }

    return { validFiles, totalRecords };
  }

  /**
   * Pre-load data into cache
   */
  async _preloadData() {
    const allData = [];

    // Load national files (existing functionality)
    for (const fileName of this.config.supportedFiles) {
      try {
        const filePath = path.join(this.config.dataDirectory, fileName);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (Array.isArray(data)) {
          allData.push(...data);
          logger.debug('Loaded national data file', {
            fileName,
            recordCount: data.length
          });
        }
      } catch (error) {
        logger.warn('Failed to load national data file', {
          fileName,
          error: error.message
        });
      }
    }

    // NEW: Load market-specific files from markets/ subdirectory
    const marketsDir = path.join(this.config.dataDirectory, 'markets');
    try {
      const marketFiles = await fs.readdir(marketsDir);
      const jsonFiles = marketFiles.filter(f => f.endsWith('.json'));
      
      logger.info(`Found ${jsonFiles.length} market data files in markets/ subdirectory`);
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(marketsDir, file);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const marketData = JSON.parse(fileContent);
          
          // Extract market slug from filename (e.g., "los-angeles-long-beach-anaheim.json" -> "los-angeles-long-beach-anaheim")
          const marketSlug = file.replace('.json', '');
          
          // Cache market-specific data separately for quick lookup
          this.dataCache.set(`market-${marketSlug}`, {
            data: marketData,
            timestamp: Date.now(),
            source: 'market_specific'
          });
          
          logger.debug('Loaded market-specific data file', {
            fileName: file,
            marketSlug,
            hasData: !!marketData
          });
        } catch (error) {
          logger.warn('Failed to load market data file', {
            fileName: file,
            error: error.message
          });
        }
      }
      
      logger.info(`Loaded ${jsonFiles.length} market-specific data files into cache`);
    } catch (error) {
      logger.warn('Markets subdirectory not found or not accessible, using national data only', {
        marketsDir,
        error: error.message
      });
    }

    // Sort national data by date (most recent first)
    allData.sort((a, b) => {
      const dateA = new Date(a.MONTH || a.date || 0);
      const dateB = new Date(b.MONTH || b.date || 0);
      return dateB - dateA;
    });

    // Cache the national data
    this.dataCache.set('all_data', {
      data: allData,
      timestamp: Date.now()
    });

    logger.info('Data preloaded into cache', {
      nationalRecords: allData.length,
      marketFiles: this.dataCache.size - 1 // Subtract 1 for 'all_data' entry
    });
  }

  /**
   * Get cached data or reload if expired
   */
  async _getCachedData() {
    const cached = this.dataCache.get('all_data');
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    // Reload data if cache expired
    await this._preloadData();
    const refreshed = this.dataCache.get('all_data');
    return refreshed ? refreshed.data : [];
  }

  /**
   * Filter data based on criteria
   */
  _filterData(data, filters) {
    let filtered = [...data];

    // Filter by market (for future market-specific data)
    if (filters.market && filters.market !== 'national') {
      // Currently all data is national, but this allows for future expansion
      filtered = filtered.filter(record => 
        record.market === filters.market || 
        record.MARKET === filters.market ||
        !record.market // Default to national if no market specified
      );
    }

    // Filter by date range
    if (filters.dateRange) {
      const { startDate, endDate } = filters.dateRange;
      filtered = filtered.filter(record => {
        const recordDate = new Date(record.MONTH || record.date);
        return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
      });
    }

    // Apply limit
    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Format data for compatibility with existing system
   */
  _formatDataForCompatibility(data, format) {
    return data.map(record => {
      const formatted = {};
      
      // Apply field mappings
      for (const [originalField, mappedField] of Object.entries(this.dataMapping.fieldMappings)) {
        if (record[originalField] !== undefined) {
          formatted[mappedField] = record[originalField];
        }
      }

      // Add metadata
      formatted.source = 'trusted_data';
      formatted.recordType = 'market_data';
      formatted.originalRecord = record;

      return formatted;
    });
  }

  /**
   * Generate markdown content from data
   */
  _generateMarkdownContent(data) {
    if (!data || data.length === 0) {
      return '# Market Data\n\nNo data available.';
    }

    let markdown = '# Market Data Report\n\n';
    markdown += `**Data Source:** Trusted Market Data\n`;
    markdown += `**Records:** ${data.length}\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;

    // Add summary of latest data
    const latest = data[0];
    if (latest) {
      markdown += '## Latest Market Snapshot\n\n';
      markdown += `**Date:** ${latest.MONTH}\n`;
      markdown += `**Median "Sale Price":** ${latest.MEDIAN_SALE_PRICE}\n`;
      markdown += `**Price Change (MoM):** ${latest.MEDIAN_SALE_PRICE_MOM}\n`;
      markdown += `**Price Change (YoY):** ${latest.MEDIAN_SALE_PRICE_YOY}\n`;
      markdown += `**Homes Sold:** ${latest.HOMES_SOLD_SA}\n`;
      markdown += `**New Listings:** ${latest.NEW_LISTINGS_SA}\n`;
      markdown += `**Active Listings:** ${latest.ACTIVE_LISTINGS_SA}\n`;
      markdown += `**Months of Supply:** ${latest.MONTHS_OF_SUPPLY}\n\n`;
    }

    // Add trend analysis
    if (data.length > 1) {
      markdown += '## Market Trends\n\n';
      markdown += this._generateTrendAnalysis(data);
    }

    // Add detailed data table
    markdown += '## Detailed Data\n\n';
    markdown += '| Date | Median Price | Price Change (YoY) | Homes Sold | New Listings | Months Supply |\n';
    markdown += '|------|-------------|-------------------|------------|--------------|---------------|\n';
    
    data.slice(0, 10).forEach(record => {
      markdown += `| ${record.MONTH} | ${record.MEDIAN_SALE_PRICE} | ${record.MEDIAN_SALE_PRICE_YOY} | ${record.HOMES_SOLD_SA} | ${record.NEW_LISTINGS_SA} | ${record.MONTHS_OF_SUPPLY} |\n`;
    });

    return markdown;
  }

  /**
   * Generate HTML content from data
   */
  _generateHtmlContent(data) {
    const markdown = this._generateMarkdownContent(data);
    // Simple markdown to HTML conversion (basic implementation)
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^\*\*(.*)\*\*/gm, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /**
   * Generate trend analysis from data
   */
  _generateTrendAnalysis(data) {
    let analysis = '';
    
    // Price trend
    const priceChanges = data.slice(0, 6).map(d => parseFloat(d.MEDIAN_SALE_PRICE_YOY?.replace('%', '') || 0));
    const avgPriceChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    
    analysis += `**Price Trend:** `;
    if (avgPriceChange > 2) {
      analysis += `Strong price appreciation averaging ${avgPriceChange.toFixed(1)}% year-over-year\n`;
    } else if (avgPriceChange > 0) {
      analysis += `Moderate price growth averaging ${avgPriceChange.toFixed(1)}% year-over-year\n`;
    } else {
      analysis += `Price decline averaging ${avgPriceChange.toFixed(1)}% year-over-year\n`;
    }

    // Inventory trend
    const inventoryChanges = data.slice(0, 6).map(d => parseFloat(d.ACTIVE_LISTINGS_YOY_SA?.replace('%', '') || 0));
    const avgInventoryChange = inventoryChanges.reduce((a, b) => a + b, 0) / inventoryChanges.length;
    
    analysis += `**Inventory Trend:** `;
    if (avgInventoryChange > 10) {
      analysis += `Significant inventory increase averaging ${avgInventoryChange.toFixed(1)}% year-over-year\n`;
    } else if (avgInventoryChange > 0) {
      analysis += `Moderate inventory growth averaging ${avgInventoryChange.toFixed(1)}% year-over-year\n`;
    } else {
      analysis += `Inventory decline averaging ${Math.abs(avgInventoryChange).toFixed(1)}% year-over-year\n`;
    }

    return analysis + '\n';
  }

  /**
   * Search within data records
   */
  _searchWithinData(data, query, options) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const results = [];

    for (const record of data) {
      let relevanceScore = 0;
      const recordText = JSON.stringify(record).toLowerCase();

      // Calculate relevance based on query terms
      for (const term of queryTerms) {
        if (recordText.includes(term)) {
          relevanceScore += 0.2;
        }
        
        // Boost score for key field matches
        if (record.MONTH && record.MONTH.toLowerCase().includes(term)) relevanceScore += 0.3;
        if (record.MEDIAN_SALE_PRICE && record.MEDIAN_SALE_PRICE.toLowerCase().includes(term)) relevanceScore += 0.3;
      }

      if (relevanceScore > 0.1) {
        results.push({
          ...record,
          relevanceScore
        });
      }

      if (results.length >= options.limit) {
        break;
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Generate search snippet for a record
   */
  _generateSearchSnippet(record, query) {
    const date = record.MONTH || record.date || 'Unknown Date';
    const price = record.MEDIAN_SALE_PRICE || 'N/A';
    const priceChange = record.MEDIAN_SALE_PRICE_YOY || 'N/A';
    
    return `Market data for ${date}: Median sale price ${price} (${priceChange} YoY change). Includes sales, listings, and inventory metrics.`;
  }

  /**
   * Generate markdown for a single record
   */
  _generateMarkdownForRecord(record) {
    let markdown = `## Market Data - ${record.MONTH}\n\n`;
    
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'relevanceScore' && value !== null && value !== undefined) {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        markdown += `**${label}:** ${value}\n`;
      }
    }
    
    return markdown;
  }

  /**
   * Get date range of data
   */
  _getDataDateRange(data) {
    if (!data || data.length === 0) return null;
    
    const dates = data.map(d => new Date(d.MONTH || d.date)).filter(d => !isNaN(d));
    if (dates.length === 0) return null;
    
    return {
      startDate: new Date(Math.min(...dates)).toISOString(),
      endDate: new Date(Math.max(...dates)).toISOString()
    };
  }

  /**
   * Assess data quality
   */
  _assessDataQuality(data) {
    if (!data || data.length === 0) return { score: 0, issues: ['No data available'] };
    
    const issues = [];
    let score = 100;
    
    // Check for missing key fields
    const keyFields = ['MONTH', 'MEDIAN_SALE_PRICE', 'HOMES_SOLD_SA'];
    const missingFields = keyFields.filter(field => 
      !data.some(record => record[field] !== null && record[field] !== undefined)
    );
    
    if (missingFields.length > 0) {
      issues.push(`Missing key fields: ${missingFields.join(', ')}`);
      score -= missingFields.length * 20;
    }
    
    // Check data recency
    const latestDate = new Date(data[0]?.MONTH || 0);
    const monthsOld = (Date.now() - latestDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    
    if (monthsOld > 3) {
      issues.push(`Data is ${Math.round(monthsOld)} months old`);
      score -= Math.min(monthsOld * 5, 30);
    }
    
    return {
      score: Math.max(0, score),
      issues,
      recordCount: data.length,
      latestDate: latestDate.toISOString()
    };
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      service: 'TrustedData',
      initialized: this.initialized,
      dataDirectory: this.config.dataDirectory,
      supportedFiles: this.config.supportedFiles.length,
      cacheSize: this.dataCache.size,
      lastCacheUpdate: this.dataCache.get('all_data')?.timestamp || null
    };
  }
}

// Create singleton instance
const trustedDataService = new TrustedDataService();

module.exports = trustedDataService;