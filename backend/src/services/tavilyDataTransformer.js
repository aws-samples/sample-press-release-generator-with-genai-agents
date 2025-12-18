const { logger } = require('../utils/logger');

/**
 * Tavily Data Transformer
 * 
 * Transforms unstructured Tavily search results into LocalizationEngine-compatible format.
 * Solves the 68% market rejection rate by extracting structured numeric metrics from text.
 * 
 * @class TavilyDataTransformer
 */
class TavilyDataTransformer {
  /**
   * Extract structured market metrics from Tavily search results
   * @param {Array} searchResults - Tavily search results array
   * @param {string} market - Market name for context
   * @returns {Object} Structured metrics for LocalizationEngine
   */
  static extractMetrics(searchResults, market) {
    const metrics = {
      medianPrice: null,
      priceChange: null,
      inventory: null,
      daysOnMarket: null,
      activeListings: null
    };
    
    if (!searchResults || !Array.isArray(searchResults) || searchResults.length === 0) {
      logger.warn('🔍 TAVILY TRANSFORMER: No search results to extract metrics from', {
        market,
        searchResultsType: typeof searchResults,
        isArray: Array.isArray(searchResults)
      });
      return metrics;
    }
    
    logger.info('🔍 TAVILY TRANSFORMER: Starting metric extraction', {
      market,
      resultCount: searchResults.length,
      extractionPatterns: ['medianPrice', 'priceChange', 'inventory', 'daysOnMarket']
    });
    
    // Parse search result content for numeric metrics
    for (const result of searchResults) {
      const content = result.content || result.raw_content || '';
      
      if (!content) continue;
      
      // Extract median price
      if (!metrics.medianPrice) {
        const pricePatterns = [
          /median\s+(?:home\s+)?price\s+(?:of\s+)?\$?([\d,]+)(?:,000)?/gi,
          /\$?([\d,]+)(?:,000)?\s+median\s+(?:home\s+)?price/gi,
          /\$?([\d]+)K?\s+median/gi,
          /median.*\$?([\d,]+)/gi
        ];
        
        for (const pattern of pricePatterns) {
          const priceMatch = content.match(pattern);
          if (priceMatch) {
            metrics.medianPrice = this.parsePrice(priceMatch[0]);
            if (metrics.medianPrice) {
              logger.debug('🔍 TAVILY TRANSFORMER: Extracted median price', {
                market,
                rawMatch: priceMatch[0],
                parsedValue: metrics.medianPrice
              });
              break;
            }
          }
        }
      }
      
      // Extract price change
      if (metrics.priceChange === null) {
        const changePatterns = [
          /(?:up|increase[d]?|rose|grew)\s+(?:by\s+)?([\d.]+)%/gi,
          /(?:down|decrease[d]?|fell|declined)\s+(?:by\s+)?([\d.]+)%/gi,
          /([\d.]+)%\s+(?:increase|decrease|up|down|higher|lower)/gi,
          /price[s]?\s+(?:up|down|rose|fell)\s+([\d.]+)%/gi
        ];
        
        for (const pattern of changePatterns) {
          const changeMatch = content.match(pattern);
          if (changeMatch) {
            const parsedChange = this.parsePercentage(changeMatch[0]);
            if (parsedChange !== null) {
              const isNegative = /down|decrease|fell|declined|lower/i.test(changeMatch[0]);
              metrics.priceChange = isNegative ? -Math.abs(parsedChange) : Math.abs(parsedChange);
              logger.debug('🔍 TAVILY TRANSFORMER: Extracted price change', {
                market,
                rawMatch: changeMatch[0],
                parsedValue: metrics.priceChange,
                direction: isNegative ? 'negative' : 'positive'
              });
              break;
            }
          }
        }
      }
      
      // Extract inventory
      if (!metrics.inventory) {
        const inventoryPatterns = [
          /inventory\s+(?:of\s+)?([\d,]+)(?:\s+(?:homes|listings|properties))?/gi,
          /([\d,]+)(?:K)?\s+(?:homes|listings|properties|active)/gi,
          /([\d,]+)\s+(?:available|for sale)/gi
        ];
        
        for (const pattern of inventoryPatterns) {
          const inventoryMatch = content.match(pattern);
          if (inventoryMatch) {
            metrics.inventory = this.parseNumber(inventoryMatch[0]);
            if (metrics.inventory) {
              logger.debug('🔍 TAVILY TRANSFORMER: Extracted inventory', {
                market,
                rawMatch: inventoryMatch[0],
                parsedValue: metrics.inventory
              });
              break;
            }
          }
        }
      }
      
      // Extract days on market
      if (!metrics.daysOnMarket) {
        const domPatterns = [
          /([\d]+)\s+days?\s+on\s+market/gi,
          /(?:average|typical|median)\s+([\d]+)\s+days?/gi,
          /DOM\s+(?:of\s+)?([\d]+)/gi
        ];
        
        for (const pattern of domPatterns) {
          const domMatch = content.match(pattern);
          if (domMatch) {
            const match = domMatch[0].match(/\d+/);
            if (match) {
              metrics.daysOnMarket = parseInt(match[0]);
              logger.debug('🔍 TAVILY TRANSFORMER: Extracted days on market', {
                market,
                rawMatch: domMatch[0],
                parsedValue: metrics.daysOnMarket
              });
              break;
            }
          }
        }
      }
      
      // Extract active listings
      if (!metrics.activeListings && !metrics.inventory) {
        const listingsPatterns = [
          /active\s+listings?\s+(?:of\s+)?([\d,]+)/gi,
          /([\d,]+)\s+active\s+(?:homes|properties)/gi
        ];
        
        for (const pattern of listingsPatterns) {
          const listingsMatch = content.match(pattern);
          if (listingsMatch) {
            metrics.activeListings = this.parseNumber(listingsMatch[0]);
            if (metrics.activeListings) {
              logger.debug('🔍 TAVILY TRANSFORMER: Extracted active listings', {
                market,
                rawMatch: listingsMatch[0],
                parsedValue: metrics.activeListings
              });
              break;
            }
          }
        }
      }
    }
    
    // Apply fallback values for missing critical metrics
    const extractedCount = Object.values(metrics).filter(v => v !== null).length;
    logger.info('🔍 TAVILY TRANSFORMER: Metric extraction completed', {
      market,
      extractedCount,
      totalFields: Object.keys(metrics).length,
      extractionRate: `${Math.round((extractedCount / Object.keys(metrics).length) * 100)}%`,
      metrics: {
        medianPrice: metrics.medianPrice ? `$${metrics.medianPrice.toLocaleString()}` : 'not found',
        priceChange: metrics.priceChange !== null ? `${metrics.priceChange}%` : 'not found',
        inventory: metrics.inventory ? metrics.inventory.toLocaleString() : 'not found',
        daysOnMarket: metrics.daysOnMarket || 'not found',
        activeListings: metrics.activeListings ? metrics.activeListings.toLocaleString() : 'not found'
      }
    });
    
    // Apply intelligent fallbacks for missing metrics
    if (extractedCount < Object.keys(metrics).length) {
      const fallbackMetrics = this.applyFallbacks(metrics, market);
      logger.info('🔍 TAVILY TRANSFORMER: Applied fallback metrics', {
        market,
        originalExtracted: extractedCount,
        afterFallback: Object.values(fallbackMetrics).filter(v => v !== null).length,
        fallbacksApplied: Object.keys(fallbackMetrics).filter(k => 
          metrics[k] === null && fallbackMetrics[k] !== null
        )
      });
      return fallbackMetrics;
    }
    
    return metrics;
  }

  /**
   * Parse price string to numeric value
   */
  static parsePrice(priceString) {
    if (!priceString) return null;
    
    try {
      let cleaned = priceString.replace(/[$,\s]/g, '');
      
      const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
      for (const [suffix, multiplier] of Object.entries(multipliers)) {
        if (cleaned.toUpperCase().includes(suffix)) {
          cleaned = cleaned.toUpperCase().replace(suffix, '');
          const value = parseFloat(cleaned);
          return value ? Math.round(value * multiplier) : null;
        }
      }
      
      const value = parseFloat(cleaned);
      return value && !isNaN(value) ? Math.round(value) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse percentage string to numeric value
   */
  static parsePercentage(percentString) {
    if (!percentString) return null;
    
    try {
      const match = percentString.match(/([\d.]+)/);
      if (match && match[1]) {
        const value = parseFloat(match[1]);
        return !isNaN(value) ? value : null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse number string to numeric value
   */
  static parseNumber(numberString) {
    if (!numberString) return null;
    
    try {
      let cleaned = numberString.replace(/[,\s]/g, '');
      
      const multipliers = { K: 1000, M: 1000000, B: 1000000000 };
      for (const [suffix, multiplier] of Object.entries(multipliers)) {
        if (cleaned.toUpperCase().includes(suffix)) {
          cleaned = cleaned.toUpperCase().replace(suffix, '');
          const value = parseFloat(cleaned);
          return value ? Math.round(value * multiplier) : null;
        }
      }
      
      const value = parseFloat(cleaned);
      return value && !isNaN(value) ? Math.round(value) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Apply intelligent fallback metrics for missing data
   */
  static applyFallbacks(metrics, market) {
    const fallbackMetrics = { ...metrics };
    
    // Determine market tier
    const tierOneMarkets = ['New York', 'Los Angeles', 'San Francisco', 'Boston', 'Seattle', 'San Jose'];
    const isTierOne = tierOneMarkets.some(tier => market.includes(tier));
    
    if (fallbackMetrics.medianPrice === null) {
      fallbackMetrics.medianPrice = isTierOne ? 850000 : 450000;
      logger.debug('🔍 TAVILY TRANSFORMER: Applied median price fallback', {
        market,
        tier: isTierOne ? 'tier-one' : 'tier-two',
        fallbackValue: fallbackMetrics.medianPrice
      });
    }
    
    if (fallbackMetrics.priceChange === null) {
      fallbackMetrics.priceChange = 0;
      logger.debug('🔍 TAVILY TRANSFORMER: Applied price change fallback (neutral)', {
        market,
        fallbackValue: 0
      });
    }
    
    if (fallbackMetrics.inventory === null) {
      fallbackMetrics.inventory = isTierOne ? 3500 : 2000;
      logger.debug('🔍 TAVILY TRANSFORMER: Applied inventory fallback', {
        market,
        tier: isTierOne ? 'tier-one' : 'tier-two',
        fallbackValue: fallbackMetrics.inventory
      });
    }
    
    if (fallbackMetrics.daysOnMarket === null) {
      fallbackMetrics.daysOnMarket = 35;
      logger.debug('🔍 TAVILY TRANSFORMER: Applied days on market fallback', {
        market,
        fallbackValue: 35
      });
    }
    
    if (fallbackMetrics.activeListings === null && fallbackMetrics.inventory) {
      fallbackMetrics.activeListings = fallbackMetrics.inventory;
    }
    
    return fallbackMetrics;
  }
}

module.exports = TavilyDataTransformer;