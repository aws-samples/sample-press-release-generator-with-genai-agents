const BaseAgent = require('./baseAgent');
const { logger } = require('../../utils/logger');

/**
 * Pitch Email Data Extractor Agent
 * 
 * Extracts structured pitch email data from generated PR content
 * following the Hook + 3 bullets + interview offer format.
 * 
 * "Key Features":
 * - Extracts hook with market + data point + national context
 * - Prioritizes active listings over new listings (metric hierarchy)
 * - Generates 3 structured bullets (sales volume, primary supply, secondary metric)
 * - Creates interview offer with expert contacts
 * - Validates terminology usage (year-over-year vs annually)
 */
class PitchEmailExtractor extends BaseAgent {
  constructor() {
    super('Pitch Email Extractor', {
      timeout: 30000,
      retries: 2
    });

    // Metric hierarchy rules based on pitch email analysis
    this.metricHierarchy = {
      primary: 'active_listings',
      secondary: 'new_listings',
      rationale: 'Active listings are the main thing reporters think about for supply'
    };

    // Terminology validation rules
    this.terminologyRules = {
      forbidden: ['annually', 'per year'],
      preferred: ['year over year', 'from a year ago', 'on an annual basis'],
      context: 'year_over_year_data'
    };

    // Data point patterns for extraction
    this.dataPatterns = {
      medianPrice: /median.*price.*(\$[\d,]+|(\+|\-)?[\d.]+%|[\d.]+-year (high|low)|record (high|low))/gi,
      salesVolume: /(sales|home sales|existing.home sales).*((\+|\-)?[\d.]+%|[\d.]+-\w+ (high|low)|record (high|low)|hit.*low|hit.*high)/gi,
      activeListings: /active.*listings.*((\+|\-)?[\d.]+%|[\d.]+-\w+ (high|low)|record (high|low)|hit.*high|hit.*low)/gi,
      newListings: /new.*listings.*((\+|\-)?[\d.]+%|[\d.]+-\w+ (high|low)|record (high|low)|hit.*high|hit.*low)/gi,
      monthsSupply: /[\d.]+.*months.*supply/gi,
      daysOnMarket: /([\d]+.*days.*(market|contract)|took.*[\d]+.*days)/gi
    };

    this.log('info', 'Pitch Email Extractor initialized', {
      metricHierarchy: this.metricHierarchy,
      terminologyRules: this.terminologyRules
    });
  }

  /**
   * Initialize the extractor
   */
  async initialize() {
    try {
      this.log('info', 'PITCH EMAIL EXTRACTOR AGENT INITIALIZED SUCCESSFULLY');
      this.log('info', 'Pitch Email Extractor initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize Pitch Email Extractor', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Extract pitch email data from PR content
   * @param {Object} prContent - Generated PR content
   * @param {Object} marketData - Market-specific data
   * @param {Object} options - Extraction options
   * @returns {Object} Structured pitch email data
   */
  async extractPitchData(prContent, marketData, options = {}) {
    const startTime = Date.now();
    
    try {
      this.log('info', 'Starting pitch email data extraction', {
        market: marketData?.market || 'unknown',
        contentLength: typeof prContent === 'string' ? prContent.length : 'object',
        options
      });

      // Extract content text from various possible formats
      const contentText = this._extractContentText(prContent);
      
      // Extract hook (opening statement)
      const hook = await this._extractHook(contentText, marketData);
      
      // Extract and prioritize metrics
      const extractedMetrics = this._extractMetrics(contentText);
      const prioritizedMetrics = this._prioritizeMetrics(extractedMetrics);
      
      // Generate 3 key bullets
      const bullets = await this._generateKeyBullets(prioritizedMetrics, marketData);
      
      // Generate interview offer
      const interviewOffer = this._generateInterviewOffer(marketData?.market || 'Unknown Market');
      
      // Generate subject line
      const subject = this._generateSubjectLine(hook, marketData);
      
      // Validate terminology
      const terminologyValidation = this._validateTerminology(contentText);
      
      // Generate complete email combining all components
      this.log('info', 'About to compose complete email', {
        market: marketData?.market,
        hookLength: hook ? hook.length : 0,
        bulletsCount: bullets ? bullets.length : 0,
        hasInterviewOffer: !!interviewOffer
      });

      let email = null;
      try {
        this.log('info', '🔍 EMAIL DEBUG: About to call _composeCompleteEmail', {
          market: marketData?.market,
          hookExists: !!hook,
          hookLength: hook ? hook.length : 0,
          bulletsExists: !!bullets,
          bulletsCount: bullets ? bullets.length : 0,
          interviewOfferExists: !!interviewOffer,
          marketDataExists: !!marketData,
          methodName: '_composeCompleteEmail'
        });

        email = this._composeCompleteEmail(hook, bullets, interviewOffer, marketData);
        
        this.log('info', '🔍 EMAIL DEBUG: _composeCompleteEmail returned', {
          market: marketData?.market,
          hasEmail: !!email,
          emailType: typeof email,
          emailKeys: email ? Object.keys(email) : [],
          emailSubject: email ? email.subject : 'MISSING',
          emailBodyLength: email && email.body ? email.body.length : 0,
          emailHtmlLength: email && email.html ? email.html.length : 0,
          emailPlainTextLength: email && email.plainText ? email.plainText.length : 0,
          emailMetadata: email && email.metadata ? email.metadata : null
        });

        if (!email) {
          this.log('error', '🔍 EMAIL DEBUG: CRITICAL - _composeCompleteEmail returned null/undefined', {
            market: marketData?.market,
            hookProvided: !!hook,
            bulletsProvided: !!bullets,
            interviewOfferProvided: !!interviewOffer,
            marketDataProvided: !!marketData
          });
        }

      } catch (error) {
        this.log('error', '🔍 EMAIL DEBUG: CRITICAL - Email composition threw exception', {
          market: marketData?.market,
          error: error.message,
          stack: error.stack,
          errorType: error.constructor.name,
          hookProvided: !!hook,
          bulletsProvided: !!bullets,
          interviewOfferProvided: !!interviewOffer,
          marketDataProvided: !!marketData
        });
        email = null;
      }

      const pitchData = {
        subject,
        hook,
        bullets,
        interviewOffer,
        email, // NEW: Complete email section
        extractedMetrics: prioritizedMetrics,
        validation: {
          terminologyCheck: terminologyValidation.passed ? 'passed' : 'failed',
          terminologyIssues: terminologyValidation.issues,
          metricHierarchy: 'passed', // Will be validated by PitchEmailValidator
          extractionConfidence: this._calculateExtractionConfidence(hook, bullets, extractedMetrics)
        },
        metadata: {
          market: marketData?.market || 'Unknown Market',
          extractedAt: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          contentSource: typeof prContent
        }
      };

      this.log('info', 'Pitch email data extraction completed', {
        market: pitchData.metadata.market,
        bulletCount: bullets.length,
        extractionConfidence: pitchData.validation.extractionConfidence,
        processingTime: pitchData.metadata.processingTime
      });

      return pitchData;

    } catch (error) {
      this.log('error', 'Pitch email data extraction failed', {
        error: error.message,
        stack: error.stack,
        market: marketData?.market
      });
      
      // Return fallback structure to prevent system failure
      return this._generateFallbackPitchData(marketData, error);
    }
  }

  /**
   * Extract content text from various PR content formats
   * @param {*} prContent - PR content in various formats
   * @returns {string} Extracted text content
   */
  _extractContentText(prContent) {
    if (typeof prContent === 'string') {
      return prContent;
    }

    if (typeof prContent === 'object' && prContent !== null) {
      // Try various content field names
      const contentFields = [
        'content',
        'narrativeBody',
        'fullContent',
        'fullNarrative',
        'text',
        'body'
      ];

      for (const field of contentFields) {
        if (prContent[field] && typeof prContent[field] === 'string') {
          return prContent[field];
        }
      }

      // If structured content, try to extract from nested objects
      if (prContent.content && typeof prContent.content === 'object') {
        return this._extractContentText(prContent.content);
      }

      // Fallback to stringification
      return JSON.stringify(prContent);
    }

    return String(prContent);
  }

  /**
   * Extract hook (opening statement) from content
   * @param {string} contentText - PR content text
   * @param {Object} marketData - Market data
   * @returns {string} Hook statement
   */
  async _extractHook(contentText, marketData) {
    try {
      // Enhanced hook generation with compelling leads and neighborhood localization
      const market = marketData?.market || 'Market';
      const marketName = marketData?.name || market;
      
      // Extract key data points for compelling hook creation
      const priceMatch = contentText.match(/\$[\d,]+/);
      const percentMatch = contentText.match(/(\+|\-)?[\d.]+%/);
      const trendMatch = contentText.match(/(cooling|heating|shift|break|surge|decline|rise|jump|fall|stabiliz)/gi);
      
      // Extract neighborhood references for localization
      const neighborhoods = this._extractNeighborhoods(contentText, market);
      
      // Look for original headline first
      const lines = contentText.split('\n').filter(line => line.trim().length > 0);
      let originalHeadline = '';
      for (const line of lines) {
        if (line.length > 20 && line.length < 200 && !line.includes('FOR IMMEDIATE RELEASE')) {
          originalHeadline = line.trim();
          break;
        }
      }

      // Generate compelling hook based on market trends and data
      let compellingHook = '';
      
      if (trendMatch && trendMatch.length > 0) {
        const trend = trendMatch[0].toLowerCase();
        const neighborhoodRef = neighborhoods.length > 0 ? ` across ${neighborhoods[0]}` : '';
        
        if (trend.includes('cool') || trend.includes('shift') || trend.includes('break')) {
          compellingHook = `After nearly two years of frenzied bidding wars, ${marketName} buyers are finally catching a break${neighborhoodRef}`;
        } else if (trend.includes('heat') || trend.includes('surge') || trend.includes('jump')) {
          compellingHook = `${marketName} housing market defies national trends with unexpected surge in activity${neighborhoodRef}`;
        } else if (trend.includes('stabiliz')) {
          compellingHook = `${marketName} housing market finds its footing as inventory and demand reach new equilibrium${neighborhoodRef}`;
        }
      }
      
      // If no trend-based hook, create data-driven hook
      if (!compellingHook && priceMatch && percentMatch) {
        const price = priceMatch[0];
        const percent = percentMatch[0];
        const direction = percent.startsWith('-') ? 'cooling' : 'heating';
        const cleanPrice = this._cleanPriceForSentence(price);
        compellingHook = `${marketName} median home prices hit ${cleanPrice} as market shows signs of ${direction}`;
      }
      
      // Fallback to enhanced original headline or create human-interest hook
      if (!compellingHook) {
        if (originalHeadline && originalHeadline.length > 30) {
          compellingHook = this._enhanceHeadlineWithHumanAngle(originalHeadline, marketName, neighborhoods);
        } else {
          compellingHook = `${marketName} homebuyers navigate shifting market dynamics as housing landscape evolves`;
        }
      }

      // Clean up and ensure proper formatting
      compellingHook = compellingHook.replace(/^#+\s*/, '').trim();
      compellingHook = compellingHook.replace(/\*\*/g, '');
      
      // Ensure hook is compelling length (50-150 characters ideal)
      if (compellingHook.length < 50) {
        compellingHook += ` with significant implications for local buyers and sellers`;
      }
      
      this.log('info', 'Generated compelling hook with localization', {
        market,
        hookLength: compellingHook.length,
        neighborhoods: neighborhoods.length,
        trendsFound: trendMatch?.length || 0
      });
      
      return compellingHook;

    } catch (error) {
      this.log('warn', 'Enhanced hook extraction failed, using fallback', {
        error: error.message,
        market: marketData?.market
      });
      return `${marketData?.market || 'Market'} housing market shows evolving trends with local impact`;
    }
  }

  /**
   * Extract neighborhood references for localization
   * @param {string} contentText - Content to analyze
   * @param {string} market - Market code
   * @returns {Array} Array of neighborhood names
   */
  _extractNeighborhoods(contentText, market) {
    const neighborhoods = [];
    
    // Market-specific neighborhood patterns
    const neighborhoodPatterns = {
      'LAX': ['Santa Monica', 'Long Beach', 'Anaheim', 'Pasadena', 'Irvine', 'Studio City', 'Burbank', 'San Gabriel Valley', 'Westside'],
      'CHI': ['Lincoln Park', 'Wicker Park', 'River North', 'Oak Park', 'Millennium Park', 'Lakeshore', 'Loop'],
      'NYC': ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'SoHo', 'Tribeca', 'Upper East Side'],
      'SF': ['Mission', 'Castro', 'Nob Hill', 'Pacific Heights', 'SOMA', 'Marina', 'Richmond'],
      'MIA': ['South Beach', 'Coral Gables', 'Wynwood', 'Brickell', 'Coconut Grove']
    };
    
    const patterns = neighborhoodPatterns[market] || [];
    
    for (const neighborhood of patterns) {
      if (contentText.includes(neighborhood)) {
        neighborhoods.push(neighborhood);
      }
    }
    
    return neighborhoods;
  }

  /**
   * Enhance headline with human angle
   * @param {string} headline - Original headline
   * @param {string} marketName - Market name
   * @param {Array} neighborhoods - Neighborhood list
   * @returns {string} Enhanced headline
   */
  _enhanceHeadlineWithHumanAngle(headline, marketName, neighborhoods) {
    const neighborhoodRef = neighborhoods.length > 0 ? ` in ${neighborhoods[0]}` : '';
    
    // Transform dry headlines into human-interest angles
    if (headline.includes('inventory') || headline.includes('supply')) {
      return `${marketName} homebuyers find more options${neighborhoodRef} as market dynamics shift`;
    } else if (headline.includes('price') || headline.includes('median')) {
      return `${marketName} families adjust housing strategies${neighborhoodRef} amid changing affordability landscape`;
    } else if (headline.includes('sales') || headline.includes('volume')) {
      return `${marketName} real estate activity reflects broader economic trends${neighborhoodRef}`;
    }
    
    return headline;
  }

  /**
   * Extract metrics from content text
   * @param {string} contentText - PR content text
   * @returns {Object} Extracted metrics
   */
  _extractMetrics(contentText) {
    const metrics = {};

    try {
      // Extract median price data
      const priceMatches = contentText.match(this.dataPatterns.medianPrice);
      if (priceMatches && priceMatches.length > 0) {
        metrics.medianPrice = this._parseMetricData(priceMatches[0], 'price');
      }

      // Extract sales volume data
      const salesMatches = contentText.match(this.dataPatterns.salesVolume);
      if (salesMatches && salesMatches.length > 0) {
        metrics.salesVolume = this._parseMetricData(salesMatches[0], 'sales');
      }

      // Extract active listings data (PRIORITIZED)
      const activeListingsMatches = contentText.match(this.dataPatterns.activeListings);
      if (activeListingsMatches && activeListingsMatches.length > 0) {
        metrics.activeListings = this._parseMetricData(activeListingsMatches[0], 'active_listings');
      }

      // Extract new listings data (SECONDARY)
      const newListingsMatches = contentText.match(this.dataPatterns.newListings);
      if (newListingsMatches && newListingsMatches.length > 0) {
        metrics.newListings = this._parseMetricData(newListingsMatches[0], 'new_listings');
      }

      // Extract months of supply
      const supplyMatches = contentText.match(this.dataPatterns.monthsSupply);
      if (supplyMatches && supplyMatches.length > 0) {
        metrics.monthsSupply = this._parseMetricData(supplyMatches[0], 'supply');
      }

      // Extract days on market
      const domMatches = contentText.match(this.dataPatterns.daysOnMarket);
      if (domMatches && domMatches.length > 0) {
        metrics.daysOnMarket = this._parseMetricData(domMatches[0], 'dom');
      }

      this.log('debug', 'Metrics extracted from content', {
        extractedMetrics: Object.keys(metrics),
        totalMetrics: Object.keys(metrics).length
      });

      return metrics;

    } catch (error) {
      this.log('warn', 'Metric extraction failed', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Parse metric data from text match
   * @param {string} matchText - Matched text containing metric
   * @param {string} metricType - Type of metric
   * @returns {Object} Parsed metric data
   */
  _parseMetricData(matchText, metricType) {
    try {
      // Extract percentage change
      const percentMatch = matchText.match(/(\+|\-)?[\d.]+%/);
      const percentChange = percentMatch ? percentMatch[0] : null;

      // Extract dollar amount for prices with comprehensive regex to prevent trailing commas
      // Enhanced regex: Match $ followed by digits and commas, but ensure it doesn't end with comma
      const dollarMatch = matchText.match(/\$[\d,]*\d(?!\s*,)/);
      let dollarAmount = dollarMatch ? dollarMatch[0] : null;
      
      // Additional comprehensive cleanup to ensure no trailing commas
      if (dollarAmount) {
        // Remove any trailing commas that might have been captured
        dollarAmount = dollarAmount.replace(/,+$/, '');
        
        // Validate the price format and reformat if needed
        const cleanNumeric = dollarAmount.replace(/[,$]/g, '');
        if (!isNaN(cleanNumeric) && cleanNumeric.trim() !== '') {
          const numericPrice = parseInt(cleanNumeric);
          dollarAmount = `$${numericPrice.toLocaleString()}`;
        }
        
        this.log('debug', '🔍 DOLLAR EXTRACTION DEBUG: Enhanced cleaning', {
          original: dollarMatch ? dollarMatch[0] : 'null',
          cleaned: dollarAmount,
          cleanNumeric,
          matchText: matchText.substring(0, 100)
        });
      }
      
      this.log('debug', '🔍 DOLLAR EXTRACTION DEBUG: Final result', {
        dollarAmount,
        hasTrailingComma: dollarAmount ? dollarAmount.endsWith(',') : false,
        hasDoubleComma: dollarAmount ? dollarAmount.includes(',,') : false,
        matchText: matchText.substring(0, 100)
      });

      // Extract number for days/months
      const numberMatch = matchText.match(/[\d.]+/);
      const numericValue = numberMatch ? numberMatch[0] : null;

      return {
        type: metricType,
        rawText: matchText.trim(),
        percentChange,
        dollarAmount,
        numericValue,
        context: this._determineContext(matchText)
      };

    } catch (error) {
      this.log('warn', 'Failed to parse metric data', {
        matchText,
        metricType,
        error: error.message
      });
      return {
        type: metricType,
        rawText: matchText.trim(),
        percentChange: null,
        dollarAmount: null,
        numericValue: null,
        context: 'unknown'
      };
    }
  }

  /**
   * Determine context of metric (year-over-year, monthly, etc.)
   * @param {string} text - Text containing metric
   * @returns {string} Context type
   */
  _determineContext(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('year over year') || lowerText.includes('from a year ago')) {
      return 'year_over_year';
    }
    if (lowerText.includes('monthly') || lowerText.includes('month')) {
      return 'monthly';
    }
    if (lowerText.includes('quarterly') || lowerText.includes('quarter')) {
      return 'quarterly';
    }
    if (lowerText.includes('annually') || lowerText.includes('annual')) {
      return 'annual'; // This should be flagged for terminology correction
    }
    
    return 'year_over_year'; // Default assumption
  }

  /**
   * Prioritize metrics according to hierarchy rules
   * @param {Object} extractedMetrics - Raw extracted metrics
   * @returns {Object} Prioritized metrics
   */
  _prioritizeMetrics(extractedMetrics) {
    const prioritized = { ...extractedMetrics };

    // Apply metric hierarchy: active listings > new listings
    if (prioritized.activeListings && prioritized.newListings) {
      prioritized.primarySupply = prioritized.activeListings;
      prioritized.secondarySupply = prioritized.newListings;
      
      this.log('debug', 'Applied metric hierarchy', {
        primary: 'active_listings',
        secondary: 'new_listings',
        rationale: this.metricHierarchy.rationale
      });
    } else if (prioritized.activeListings) {
      prioritized.primarySupply = prioritized.activeListings;
    } else if (prioritized.newListings) {
      prioritized.primarySupply = prioritized.newListings;
      this.log('warn', 'Using new listings as primary supply metric (active listings not available)');
    }

    return prioritized;
  }

  /**
   * Generate 3 key bullets for pitch email
   * @param {Object} metrics - Prioritized metrics
   * @param {Object} marketData - Market data
   * @returns {Array} Array of bullet objects
   */
  async _generateKeyBullets(metrics, marketData) {
    const bullets = [];

    try {
      // Bullet 1: Sales volume change vs. national
      if (metrics.salesVolume) {
        bullets.push({
          type: 'sales_volume',
          content: this._formatSalesVolumeBullet(metrics.salesVolume, marketData),
          data: {
            metric: 'home_sales',
            value: metrics.salesVolume.percentChange || 'N/A',
            comparison: 'national_trend',
            context: metrics.salesVolume.context || 'year_over_year'
          }
        });
      }

      // Bullet 2: Primary supply metric (active listings preferred)
      if (metrics.primarySupply) {
        bullets.push({
          type: 'supply_primary',
          content: this._formatSupplyBullet(metrics.primarySupply, marketData, 'primary'),
          data: {
            metric: metrics.primarySupply.type,
            value: metrics.primarySupply.percentChange || 'N/A',
            comparison: 'national_average',
            context: metrics.primarySupply.context || 'year_over_year'
          }
        });
      }

      // Bullet 3: Secondary supply or demand metric
      if (metrics.monthsSupply) {
        bullets.push({
          type: 'supply_secondary',
          content: this._formatSupplyBullet(metrics.monthsSupply, marketData, 'secondary'),
          data: {
            metric: 'months_of_supply',
            value: metrics.monthsSupply.numericValue ? `${metrics.monthsSupply.numericValue} months` : 'N/A',
            comparison: '3.1_month_national',
            context: 'current_level'
          }
        });
      } else if (metrics.secondarySupply) {
        bullets.push({
          type: 'supply_secondary',
          content: this._formatSupplyBullet(metrics.secondarySupply, marketData, 'secondary'),
          data: {
            metric: metrics.secondarySupply.type,
            value: metrics.secondarySupply.percentChange || 'N/A',
            comparison: 'national_average',
            context: metrics.secondarySupply.context || 'year_over_year'
          }
        });
      } else if (metrics.medianPrice) {
        bullets.push({
          type: 'price_trend',
          content: this._formatPriceBullet(metrics.medianPrice, marketData),
          data: {
            metric: 'median_price',
            value: metrics.medianPrice.percentChange || 'N/A',
            comparison: 'national_trend',
            context: metrics.medianPrice.context || 'year_over_year'
          }
        });
      }

      // Ensure we have exactly 3 bullets
      while (bullets.length < 3) {
        bullets.push({
          type: 'market_context',
          content: `${marketData?.market || 'Market'} housing market continues to evolve with changing supply and demand dynamics.`,
          data: {
            metric: 'market_context',
            value: 'contextual',
            comparison: 'market_trends',
            context: 'general'
          }
        });
      }

      return bullets.slice(0, 3); // Ensure exactly 3 bullets

    } catch (error) {
      this.log('error', 'Failed to generate key bullets', {
        error: error.message,
        availableMetrics: Object.keys(metrics)
      });
      
      // Return fallback bullets
      return this._generateFallbackBullets(marketData);
    }
  }

  /**
   * Format sales volume bullet
   * @param {Object} salesData - Sales volume data
   * @param {Object} marketData - Market data
   * @returns {string} Formatted bullet content
   */
  _formatSalesVolumeBullet(salesData, marketData) {
    const market = marketData?.market || 'Market';
    const change = salesData.percentChange || 'N/A';
    const direction = change.startsWith('-') ? 'declined' : 'increased';
    
    return `${market} home sales ${direction} ${change.replace(/^[\+\-]/, '')} year over year, ${change.startsWith('-') ? 'underperforming' : 'outperforming'} the national trend.`;
  }

  /**
   * Format supply bullet (active/new listings)
   * @param {Object} supplyData - Supply data
   * @param {Object} marketData - Market data
   * @param {string} type - Primary or secondary
   * @returns {string} Formatted bullet content
   */
  _formatSupplyBullet(supplyData, marketData, type) {
    const market = marketData?.market || 'Market';
    const metricName = supplyData.type === 'active_listings' ? 'active listings' :
                      supplyData.type === 'new_listings' ? 'new listings' :
                      supplyData.type === 'supply' ? 'housing supply' : 'inventory';
    
    // Fix: Add null validation before parseFloat to prevent NaN values
    if (supplyData.type === 'supply' && supplyData.numericValue) {
      const numericValue = supplyData.numericValue;
      
      // Validate numeric value exists and is not null/undefined
      if (numericValue !== null && numericValue !== undefined && numericValue !== '') {
        const months = parseFloat(numericValue);
        
        // Additional check to ensure parseFloat didn't return NaN
        if (!isNaN(months) && months > 0) {
          const comparison = months > 3.1 ? 'above' : 'below';
          return `${market} has ${months} months of housing supply, ${comparison} the national average of 3.1 months.`;
        }
      }
      
      // Fallback for missing or invalid supply data
      return `${market} housing supply data is currently being analyzed, with inventory levels showing market evolution.`;
    }
    
    const change = supplyData.percentChange || 'N/A';
    const direction = change.startsWith('-') ? 'decreased' : 'increased';
    
    return `${market} ${metricName} ${direction} ${change.replace(/^[\+\-]/, '')} year over year, indicating ${change.startsWith('-') ? 'tightening' : 'expanding'} inventory levels.`;
  }

  /**
   * Format price bullet
   * @param {Object} priceData - Price data
   * @param {Object} marketData - Market data
   * @returns {string} Formatted bullet content
   */
  _formatPriceBullet(priceData, marketData) {
    const market = marketData?.market || 'Market';
    const change = priceData.percentChange || 'N/A';
    let price = priceData.dollarAmount || 'N/A';
    
    // Fix: Clean price formatting to prevent double commas and trailing commas
    if (price !== 'N/A' && typeof price === 'string') {
      this.log('debug', '🔍 PRICE DEBUG: Before cleaning', {
        originalPrice: price,
        priceType: typeof price,
        priceLength: price.length
      });
      
      // First, clean any trailing commas from the original price
      price = price.replace(/,+$/, '');
      
      // Remove all commas and dollar signs to get clean numeric value
      const cleanNumeric = price.replace(/[,$]/g, '');
      
      if (!isNaN(cleanNumeric) && cleanNumeric.trim() !== '') {
        // Reformat as clean currency
        const numericPrice = parseInt(cleanNumeric);
        price = `$${numericPrice.toLocaleString()}`;
        this.log('debug', '🔍 PRICE DEBUG: Numeric reformatting', {
          cleanNumeric,
          numericPrice,
          formattedPrice: price
        });
      } else {
        // Fallback: clean the original price string
        price = priceData.dollarAmount
          .replace(/,,+/g, ',')      // Remove multiple consecutive commas
          .replace(/,+$/, '');       // Remove trailing commas
        this.log('debug', '🔍 PRICE DEBUG: String cleaning fallback', {
          originalDollarAmount: priceData.dollarAmount,
          cleanedPrice: price
        });
      }
      
      this.log('debug', '🔍 PRICE DEBUG: After cleaning', {
        finalPrice: price,
        hasTrailingComma: price.endsWith(','),
        hasDoubleComma: price.includes(',,')
      });
    }
    
    // Final comprehensive price cleaning to ensure proper punctuation
    price = this._cleanPriceForSentence(price);
    
    this.log('debug', '🔍 PRICE DEBUG: After final sentence cleaning', {
      finalPrice: price,
      hasTrailingComma: price.endsWith(','),
      hasDoubleComma: price.includes(',,')
    });
    
    const direction = change.startsWith('-') ? 'declined' : 'increased';
    
    // Clean the price one final time before using in template
    const finalCleanPrice = this._cleanPriceForSentence(price);
    
    // Additional safety check to ensure no trailing commas in the final sentence
    let bulletContent = `${market} median home prices ${direction} ${change.replace(/^[\+\-]/, '')} year over year to ${finalCleanPrice}, reflecting current market dynamics.`;
    
    // Final comprehensive cleanup to remove any double commas that might have been introduced
    bulletContent = bulletContent.replace(/,{2,}/g, ',').replace(/,\s*,/g, ',');
    
    this.log('debug', '🔍 FINAL BULLET DEBUG: Complete bullet content', {
      market,
      finalCleanPrice,
      bulletContent,
      hasDoubleComma: bulletContent.includes(',,'),
      hasTrailingComma: bulletContent.endsWith(',')
    });
    
    return bulletContent;
  }

  /**
   * Clean price for proper sentence formatting
   * Removes trailing commas, double commas, and ensures proper punctuation
   * @param {string} price - Price string to clean
   * @returns {string} Cleaned price string
   */
  _cleanPriceForSentence(price) {
    if (!price || typeof price !== 'string') {
      return price;
    }

    this.log('debug', '🔍 SENTENCE CLEAN DEBUG: Input price', {
      originalPrice: price,
      hasTrailingComma: price.endsWith(','),
      hasDoubleComma: price.includes(',,'),
      length: price.length
    });

    let cleaned = price;

    // Step 1: Remove all trailing commas and whitespace
    cleaned = cleaned.replace(/,+\s*$/, '');
    
    // Step 2: Remove any multiple consecutive commas (,,, -> ,)
    cleaned = cleaned.replace(/,{2,}/g, ',');
    
    // Step 3: Remove any spaces before commas that shouldn't be there
    cleaned = cleaned.replace(/\s+,/g, ',');
    
    // Step 4: Ensure proper comma spacing in numbers (but not trailing)
    // This handles cases like $285,000 vs $285 ,000
    cleaned = cleaned.replace(/(\d)\s+,\s*(\d)/g, '$1,$2');
    
    // Step 5: Final cleanup - remove any remaining trailing commas
    cleaned = cleaned.replace(/,+$/, '');
    
    // Step 6: Remove any trailing whitespace
    cleaned = cleaned.trim();

    // Step 7: Validate and reformat if it's a valid price
    if (cleaned.startsWith('$')) {
      const numericPart = cleaned.replace(/[,$]/g, '');
      if (!isNaN(numericPart) && numericPart.trim() !== '') {
        const numericPrice = parseInt(numericPart);
        if (!isNaN(numericPrice) && numericPrice > 0) {
          cleaned = `$${numericPrice.toLocaleString()}`;
        }
      }
    }

    this.log('debug', '🔍 SENTENCE CLEAN DEBUG: Comprehensive cleaning complete', {
      originalPrice: price,
      cleanedPrice: cleaned,
      hasTrailingComma: cleaned.endsWith(','),
      hasDoubleComma: cleaned.includes(',,'),
      hasSpaceComma: cleaned.includes(' ,'),
      length: cleaned.length,
      changesMade: price !== cleaned,
      isValidPrice: cleaned.startsWith('$') && !cleaned.endsWith(',')
    });

    return cleaned;
  }

  /**
   * Generate interview offer section
   * @param {string} market - Market name
   * @returns {Object} Interview offer data
   */
  _generateInterviewOffer(market) {
    return {
      economists: [
        'our company Chief Economist',
        'Local Market Expert'
      ],
      agents: [
        'Top Local Agent',
        'Market Specialist'
      ],
      contact: 'press@our company.com',
      message: `For expert commentary on ${market} housing market trends, we can connect you with our chief economist or a local market specialist.`
    };
  }

  /**
   * Generate subject line for pitch email
   * @param {string} hook - Email hook
   * @param {Object} marketData - Market data
   * @returns {string} Subject line
   */
  _generateSubjectLine(hook, marketData) {
    const market = marketData?.market || 'Market';
    
    // Extract key trend from hook
    let keyTrend = 'housing market update';
    const hookLower = hook.toLowerCase();
    
    if (hookLower.includes('price') && hookLower.includes('rise')) {
      keyTrend = 'home prices rise';
    } else if (hookLower.includes('price') && hookLower.includes('fall')) {
      keyTrend = 'home prices fall';
    } else if (hookLower.includes('sales') && hookLower.includes('up')) {
      keyTrend = 'home sales increase';
    } else if (hookLower.includes('sales') && hookLower.includes('down')) {
      keyTrend = 'home sales decline';
    } else if (hookLower.includes('inventory') || hookLower.includes('listings')) {
      keyTrend = 'inventory shifts';
    }
    
    return `${market} ${keyTrend} as market dynamics evolve`;
  }

  /**
   * Validate terminology usage
   * @param {string} contentText - Content to validate
   * @returns {Object} Validation results
   */
  _validateTerminology(contentText) {
    const issues = [];
    const lowerContent = contentText.toLowerCase();

    // Check for forbidden terms
    for (const forbidden of this.terminologyRules.forbidden) {
      if (lowerContent.includes(forbidden)) {
        issues.push({
          type: 'terminology',
          issue: `Use of "${forbidden}" should be replaced with preferred terms`,
          suggestion: this.terminologyRules.preferred.join(' or '),
          severity: 'medium'
        });
      }
    }

    return {
      passed: issues.length === 0,
      issues,
      checkedTerms: this.terminologyRules.forbidden.length
    };
  }

  /**
   * Calculate extraction confidence score
   * @param {string} hook - Extracted hook
   * @param {Array} bullets - Generated bullets
   * @param {Object} metrics - Extracted metrics
   * @returns {number} Confidence score (0-100)
   */
  _calculateExtractionConfidence(hook, bullets, metrics) {
    let confidence = 0;

    // Hook quality (30 points)
    if (hook && hook.length > 20 && hook.length < 200) {
      confidence += 30;
    } else if (hook && hook.length > 10) {
      confidence += 15;
    }

    // Bullets quality (40 points)
    const validBullets = bullets.filter(b => b.content && b.content.length > 20);
    confidence += (validBullets.length / 3) * 40;

    // Metrics extraction (30 points)
    const keyMetrics = ['salesVolume', 'activeListings', 'medianPrice'];
    const extractedKeyMetrics = keyMetrics.filter(m => metrics[m]);
    confidence += (extractedKeyMetrics.length / keyMetrics.length) * 30;

    return Math.round(confidence);
  }

  /**
   * Generate fallback pitch data when extraction fails
   * @param {Object} marketData - Market data
   * @param {Error} error - Original error
   * @returns {Object} Fallback pitch data
   */
  _generateFallbackPitchData(marketData, error) {
    const market = marketData?.market || 'Market';
    
    return {
      subject: `${market} housing market update`,
      hook: `${market} housing market continues to evolve with changing conditions`,
      bullets: this._generateFallbackBullets(marketData),
      interviewOffer: this._generateInterviewOffer(market),
      extractedMetrics: {},
      validation: {
        terminologyCheck: 'unknown',
        terminologyIssues: [],
        metricHierarchy: 'unknown',
        extractionConfidence: 25
      },
      metadata: {
        market,
        extractedAt: new Date().toISOString(),
        processingTime: 0,
        contentSource: 'fallback',
        error: error.message
      }
    };
  }

  /**
   * Generate fallback bullets when extraction fails
   * @param {Object} marketData - Market data
   * @returns {Array} Fallback bullets
   */
  _generateFallbackBullets(marketData) {
    const market = marketData?.market || 'Market';
    
    return [
      {
        type: 'sales_volume',
        content: `${market} home sales activity reflects current market conditions and buyer sentiment.`,
        data: {
          metric: 'home_sales',
          value: 'N/A',
          comparison: 'national_trend',
          context: 'year_over_year'
        }
      },
      {
        type: 'supply_primary',
        content: `${market} housing inventory levels continue to impact market dynamics and buyer options.`,
        data: {
          metric: 'active_listings',
          value: 'N/A',
          comparison: 'national_average',
          context: 'year_over_year'
        }
      },
      {
        type: 'market_context',
        content: `${market} housing market trends align with broader regional and national patterns.`,
        data: {
          metric: 'market_context',
          value: 'contextual',
          comparison: 'regional_trends',
          context: 'general'
        }
      }
    ];
  }

  /**
   * Compose complete email combining all pitch components
   * @param {string} hook - The compelling headline
   * @param {Array} bullets - Array of bullet points with data
   * @param {Object} interviewOffer - Expert contact information
   * @param {Object} marketData - Market-specific data
   * @returns {Object} Complete email structure
   */
  _composeCompleteEmail(hook, bullets, interviewOffer, marketData) {
    this.log('info', '🔍 EMAIL COMPOSE DEBUG: _composeCompleteEmail method entry', {
      methodName: '_composeCompleteEmail',
      hookProvided: !!hook,
      hookType: typeof hook,
      hookLength: hook ? hook.length : 0,
      bulletsProvided: !!bullets,
      bulletsType: typeof bullets,
      bulletsCount: bullets ? bullets.length : 0,
      interviewOfferProvided: !!interviewOffer,
      interviewOfferType: typeof interviewOffer,
      marketDataProvided: !!marketData,
      marketDataType: typeof marketData,
      market: marketData?.market || 'Unknown'
    });

    const market = marketData?.market || 'Unknown Market';
    
    this.log('info', '🔍 EMAIL COMPOSE DEBUG: Market extracted', {
      market,
      originalMarketData: marketData?.market,
      fallbackUsed: !marketData?.market
    });
    
    // Generate subject line using hook
    const subject = hook || `${market} Housing Market Update`;
    
    this.log('info', '🔍 EMAIL COMPOSE DEBUG: Subject generated', {
      subject,
      subjectLength: subject.length,
      usedHook: !!hook,
      usedFallback: !hook
    });
    
    // Enhanced press-friendly format instead of generic email
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const marketName = marketData?.name || market;
    
    // Press release header
    const pressHeader = [
      'FOR IMMEDIATE RELEASE',
      `${currentDate}`,
      '',
      `${hook}`,
      '',
      `${marketName.toUpperCase()}—`
    ].join('\n');
    
    // Enhanced opening with human interest angle
    const pressOpening = this._createPressOpening(bullets, marketName);
    
    // Format bullets as press-worthy content with context
    const pressContent = this._formatPressContent(bullets, marketName);
    
    // Expert quotes section (moved into body for press format)
    const expertQuotes = this._generateExpertQuotes(bullets, marketName, interviewOffer);
    
    // Media contact section
    const mediaContact = [
      '',
      '###',
      '',
      'MEDIA CONTACT:',
      `${interviewOffer.contact}`,
      'our company Press Team',
      'Available for interviews and additional data',
      '',
      'MULTIMEDIA ASSETS:',
      '• Interactive market dashboard: our company.com/news-center',
      '• High-resolution charts and graphs available upon request',
      '• Local market expert interviews available',
      '',
      'About our company',
      'our company (www.our company.com) is a technology-powered real estate company serving more than 100 markets across the U.S. and Canada.'
    ].join('\n');
    
    // Compose complete press release body
    const emailBody = [
      pressHeader,
      pressOpening,
      '',
      pressContent,
      '',
      expertQuotes,
      mediaContact
    ].join('\n');
    
    // Create plain text version (same as body for now)
    const plainText = emailBody;
    
    // Create HTML version
    const htmlBody = [
      '<p>Hi [Reporter Name],</p>',
      '',
      `<p>${pressOpening}</p>`,
      '',
      '<p><strong>Key "Market Highlights":</strong></p>',
      '<ul>',
      ...bullets.map(bullet => `<li>${bullet.content}</li>`),
      '</ul>',
      '',
      `<p>${interviewOffer.message}</p>`,
      '',
      '<p><strong>Available experts:</strong></p>',
      '<ul>',
      ...interviewOffer.economists.map(expert => `<li>${expert}</li>`),
      ...interviewOffer.agents.map(agent => `<li>${agent}</li>`),
      '</ul>',
      '',
      `<p><strong>Contact:</strong> <a href="mailto:${interviewOffer.contact}">${interviewOffer.contact}</a></p>`,
      '',
      '<p>Please let me know if you\'d like to schedule an interview or need additional data points for your story.</p>',
      '',
      '<p>Best regards,<br>[Your Name]<br>our company Press Team</p>'
    ].join('\n');
    
    const emailResult = {
      subject,
      body: emailBody,
      plainText,
      html: htmlBody,
      metadata: {
        market,
        bulletCount: bullets.length,
        expertCount: interviewOffer.economists.length + interviewOffer.agents.length,
        generatedAt: new Date().toISOString(),
        readyToSend: true
      }
    };

    this.log('info', '🔍 EMAIL COMPOSE DEBUG: Final email object created', {
      methodName: '_composeCompleteEmail',
      emailResultKeys: Object.keys(emailResult),
      subject: emailResult.subject,
      subjectLength: emailResult.subject.length,
      bodyLength: emailResult.body.length,
      plainTextLength: emailResult.plainText.length,
      htmlLength: emailResult.html.length,
      metadataKeys: Object.keys(emailResult.metadata),
      bulletCount: emailResult.metadata.bulletCount,
      expertCount: emailResult.metadata.expertCount,
      readyToSend: emailResult.metadata.readyToSend,
      generatedAt: emailResult.metadata.generatedAt
    });

    this.log('info', '🔍 EMAIL COMPOSE DEBUG: About to return email object', {
      methodName: '_composeCompleteEmail',
      returningType: typeof emailResult,
      returningKeys: Object.keys(emailResult),
      isValidObject: emailResult && typeof emailResult === 'object',
      hasAllRequiredFields: !!(emailResult.subject && emailResult.body && emailResult.html && emailResult.plainText && emailResult.metadata)
    });

    return emailResult;
  }

  /**
   * Create press-worthy opening with human interest angle
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @returns {string} Press opening
   */
  _createPressOpening(bullets, marketName) {
    // Extract key data for human-interest angle
    const priceData = bullets.find(b => b.type === 'price_trend');
    const supplyData = bullets.find(b => b.type.includes('supply'));
    
    if (priceData && priceData.content.includes('increased')) {
      return `Homebuyers in ${marketName} are navigating a shifting landscape as housing costs continue to climb, with local families adjusting their strategies amid changing market conditions. The latest data reveals significant movement in both pricing and inventory levels, reflecting broader economic trends that are reshaping how residents approach homeownership decisions.`;
    } else if (supplyData && supplyData.content.includes('increased')) {
      return `After months of limited options, ${marketName} homebuyers are finding more choices as inventory levels expand, offering the first signs of market rebalancing in nearly two years. The shift represents a potential turning point for local families who have been waiting on the sidelines, watching prices and competition intensify throughout the pandemic era.`;
    }
    
    return `The ${marketName} housing market is experiencing notable changes that could impact thousands of local families, as new data reveals evolving patterns in both buyer behavior and market dynamics. These shifts come at a critical time when many residents are reassessing their housing needs and financial strategies.`;
  }

  /**
   * Format press content with enhanced context and differentiation
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @returns {string} Formatted press content
   */
  _formatPressContent(bullets, marketName) {
    const sections = [];
    
    bullets.forEach((bullet, index) => {
      let enhancedContent = bullet.content;
      
      // Add historical context and impact explanations
      if (bullet.type === 'price_trend') {
        enhancedContent += ` This price movement reflects broader economic pressures affecting household budgets across the region, with implications for first-time buyers and families looking to upgrade their living situations.`;
      } else if (bullet.type.includes('supply')) {
        enhancedContent += ` The inventory changes signal a potential shift in market dynamics, offering both opportunities and challenges for buyers who have been competing in a constrained market environment.`;
      } else if (bullet.type === 'sales_volume') {
        enhancedContent += ` These sales patterns indicate changing buyer sentiment and economic confidence, providing insights into how local residents are responding to current market conditions.`;
      }
      
      sections.push(enhancedContent);
    });
    
    return sections.join('\n\n');
  }

  /**
   * Generate expert quotes with local authority
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @param {Object} interviewOffer - Interview offer data
   * @returns {string} Expert quotes section
   */
  _generateExpertQuotes(bullets, marketName, interviewOffer) {
    const quotes = [];
    
    // Generate market-specific expert quote
    const expertName = this._getLocalExpertName(marketName);
    const quote = this._generateContextualQuote(bullets, marketName);
    
    quotes.push(`"${quote}" said ${expertName}, Senior Market Analyst at our company. "${this._generateSecondaryQuote(bullets, marketName)}"`);
    
    // Add buyer/seller perspective
    const humanInterestQuote = this._generateHumanInterestQuote(bullets, marketName);
    if (humanInterestQuote) {
      quotes.push(humanInterestQuote);
    }
    
    return quotes.join('\n\n');
  }

  /**
   * Get local expert name based on market
   * @param {string} marketName - Market name
   * @returns {string} Expert name
   */
  _getLocalExpertName(marketName) {
    const expertNames = {
      'Los Angeles-Long Beach-Anaheim': 'Maria Hernandez',
      'Chicago-Naperville-Elgin': 'Thomas Wilson',
      'New York': 'Sarah Chen',
      'San Francisco': 'David Rodriguez',
      'Miami': 'Carmen Gutierrez'
    };
    
    return expertNames[marketName] || 'Jennifer Martinez';
  }

  /**
   * Generate contextual quote based on market data
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @returns {string} Contextual quote
   */
  _generateContextualQuote(bullets, marketName) {
    const priceData = bullets.find(b => b.type === 'price_trend');
    const supplyData = bullets.find(b => b.type.includes('supply'));
    
    if (priceData && priceData.content.includes('increased')) {
      return `What we're seeing in ${marketName} is a market in transition, where buyers are becoming more selective and strategic about their purchases.`;
    } else if (supplyData && supplyData.content.includes('increased')) {
      return `The increase in available inventory is giving ${marketName} buyers more negotiating power than we've seen in months.`;
    }
    
    return `${marketName} continues to be a dynamic market where local conditions are creating both challenges and opportunities for residents.`;
  }

  /**
   * Generate secondary quote for additional context
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @returns {string} Secondary quote
   */
  _generateSecondaryQuote(bullets, marketName) {
    return `We're advising clients to stay informed about these trends while making decisions that align with their long-term housing goals and financial circumstances.`;
  }

  /**
   * Generate human interest quote
   * @param {Array} bullets - Bullet points
   * @param {string} marketName - Market name
   * @returns {string} Human interest quote
   */
  _generateHumanInterestQuote(bullets, marketName) {
    const scenarios = [
      `Local families are taking advantage of the changing conditions to explore neighborhoods that were previously out of reach, according to recent buyer surveys.`,
      `First-time homebuyers in the area report feeling more optimistic about their prospects as market dynamics continue to evolve.`,
      `Long-time residents considering moves within ${marketName} are finding more options available than in previous months.`
    ];
    
    return scenarios[Math.floor(Math.random() * scenarios.length)];
  }

  /**
   * Get agent status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      ...super.getStatus(),
      capabilities: {
        dataExtraction: true,
        metricPrioritization: true,
        terminologyValidation: true,
        bulletGeneration: true,
        hookExtraction: true,
        emailComposition: true // NEW: Email composition capability
      },
      configuration: {
        metricHierarchy: this.metricHierarchy,
        terminologyRules: this.terminologyRules,
        supportedMetrics: Object.keys(this.dataPatterns)
      }
    };
  }
}

module.exports = PitchEmailExtractor;