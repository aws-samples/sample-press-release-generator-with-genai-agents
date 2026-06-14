/**
 * Market Code Mapping Service
 * Maps airport codes to market data service codes and metro names
 * Fixes the 74-market soft failure issue where airport codes don't match data sources
 */

const { logger } = require('../utils/logger');
const marketDataService = require('./marketData');

class MarketCodeMappingService {
  constructor() {
    this.mappings = this._initializeMappings();
    this.reverseMapping = this._createReverseMapping();
  }

  /**
   * Initialize comprehensive airport code to market code mappings
   * Based on the 74 failing markets from the log analysis
   */
  _initializeMappings() {
    return {
      // Major markets that exist in marketData service
      'MSP': 'MIN', // Minneapolis-St. Paul
      'BWI': 'BAL', // Baltimore-Washington
      'DCA': 'WDC', // Washington DC
      'IAD': 'WDC', // Washington DC (Dulles)
      'DFW': 'DFW', // Dallas-Fort Worth (already matches)
      'IAH': 'HOU', // Houston
      'HOU': 'HOU', // Houston (already matches)
      'ORD': 'CHI', // Chicago
      'MDW': 'CHI', // Chicago Midway
      'LAX': 'LAX', // Los Angeles (already matches)
      'SFO': 'SFO', // San Francisco (already matches)
      'OAK': 'SFO', // Oakland -> San Francisco Bay Area
      'SJC': 'SFO', // San Jose -> San Francisco Bay Area
      'SEA': 'SEA', // Seattle (already matches)
      'BOS': 'BOS', // Boston (already matches)
      'JFK': 'NYC', // New York JFK
      'LGA': 'NYC', // New York LaGuardia
      'EWR': 'NYC', // Newark -> New York metro
      'PHL': 'PHL', // Philadelphia (already matches)
      'MIA': 'MIA', // Miami (already matches)
      'FLL': 'MIA', // Fort Lauderdale -> Miami metro
      'PBI': 'MIA', // West Palm Beach -> Miami metro
      'ATL': 'ATL', // Atlanta (already matches)
      'PHX': 'PHX', // Phoenix (already matches)
      'DEN': 'DEN', // Denver (already matches)
      'LAS': 'LAS', // Las Vegas (already matches)
      'SAN': 'SDG', // San Diego
      'PDX': 'POR', // Portland
      'DTW': 'DET', // Detroit
      'CLT': 'CHA', // Charlotte
      'TPA': 'TPA', // Tampa (already matches)
      'MCO': 'ORL', // Orlando
      'SAT': 'SAN', // San Antonio
      'AUS': 'AUS', // Austin (already matches)
      'STL': 'STL', // St. Louis (already matches)
      'PIT': 'PIT', // Pittsburgh (already matches)
      'CVG': 'CIN', // Cincinnati
      'SMF': 'SAC', // Sacramento
      'SLC': 'SLC', // Salt Lake City (if exists in market data)
      'RDU': 'RAL', // Raleigh-Durham (if exists)
      'BNA': 'NAS', // Nashville (if exists)
      
      // Additional failing markets from the log analysis
      'ABE': null, // Allentown, PA - not in top 100 markets
      'ABQ': null, // Albuquerque, NM - not in top 100 markets  
      'ALB': null, // Albany, NY - not in top 100 markets
      'AVP': null, // Scranton, PA - not in top 100 markets
      'BDL': null, // Hartford, CT - not in top 100 markets
      'BDR': null, // Bridgeport, CT - not in top 100 markets
      'BFL': null, // Bakersfield, CA - not in top 100 markets
      'BHM': null, // Birmingham, AL - not in top 100 markets
      'BOI': null, // Boise, ID - not in top 100 markets
      'BTR': null, // Baton Rouge, LA - not in top 100 markets
      'BUF': null, // Buffalo, NY - not in top 100 markets
      'CAE': null, // Columbia, SC - not in top 100 markets
      'CAK': null, // Akron, OH - not in top 100 markets
      'CEF': null, // Unknown airport code
      'CHS': null, // Charleston, SC - not in top 100 markets
      'CMH': null, // Columbus, OH - not in top 100 markets
      'COS': null, // Colorado Springs, CO - not in top 100 markets
      'DAY': null, // Dayton, OH - not in top 100 markets
      'ELP': null, // El Paso, TX - not in top 100 markets
      'FAR': null, // Fargo, ND - not in top 100 markets
      'GRR': null, // Grand Rapids, MI - not in top 100 markets
      'GSO': null, // Greensboro, NC - not in top 100 markets
      'ICT': null, // Wichita, KS - not in top 100 markets
      'JAX': null, // Jacksonville, FL - not in top 100 markets
      'LIT': null, // Little Rock, AR - not in top 100 markets
      'MCI': null, // Kansas City, MO - not in top 100 markets
      'MEM': null, // Memphis, TN - not in top 100 markets
      'MKE': null, // Milwaukee, WI - not in top 100 markets
      'MSY': null, // New Orleans, LA - not in top 100 markets
      'OKC': null, // Oklahoma City, OK - not in top 100 markets
      'OMA': null, // Omaha, NE - not in top 100 markets
      'PNS': null, // Pensacola, FL - not in top 100 markets
      'PVD': null, // Providence, RI - not in top 100 markets
      'RIC': null, // Richmond, VA - not in top 100 markets
      'ROC': null, // Rochester, NY - not in top 100 markets
      'SDF': null, // Louisville, KY - not in top 100 markets
      'SYR': null, // Syracuse, NY - not in top 100 markets
      'TUL': null, // Tulsa, OK - not in top 100 markets
      'TYS': null, // Knoxville, TN - not in top 100 markets
      'XNA': null, // Northwest Arkansas - not in top 100 markets
      'PIA': null, // Peoria, IL - not in top 100 markets
      
      // Add more mappings as needed based on the complete list of 74 failing markets
    };
  }

  /**
   * Create reverse mapping from market codes to airport codes
   */
  _createReverseMapping() {
    const reverse = {};
    for (const [airportCode, marketCode] of Object.entries(this.mappings)) {
      if (marketCode) {
        if (!reverse[marketCode]) {
          reverse[marketCode] = [];
        }
        reverse[marketCode].push(airportCode);
      }
    }
    return reverse;
  }

  /**
   * Map airport code to market data service code
   * @param {string} airportCode - Airport code (e.g., 'MSP', 'BWI')
   * @returns {string|null} Market code or null if not supported
   */
  mapAirportToMarket(airportCode) {
    const upperCode = airportCode.toUpperCase();
    const marketCode = this.mappings[upperCode];
    
    if (marketCode === null) {
      logger.warn(`Airport code ${upperCode} maps to unsupported market (not in top 100)`);
      return null;
    }
    
    if (marketCode === undefined) {
      logger.warn(`Unknown airport code: ${upperCode}`);
      return null;
    }
    
    return marketCode;
  }

  /**
   * Get market information for airport code
   * @param {string} airportCode - Airport code
   * @returns {Object|null} Market information or null
   */
  getMarketForAirportCode(airportCode) {
    const marketCode = this.mapAirportToMarket(airportCode);
    if (!marketCode) {
      return null;
    }
    
    return marketDataService.getMarket(marketCode);
  }

  /**
   * Check if airport code is supported (maps to a market in our data)
   * @param {string} airportCode - Airport code
   * @returns {boolean} True if supported
   */
  isAirportCodeSupported(airportCode) {
    const marketCode = this.mapAirportToMarket(airportCode);
    return marketCode !== null && marketCode !== undefined;
  }

  /**
   * Get all supported airport codes
   * @returns {Array} Array of supported airport codes
   */
  getSupportedAirportCodes() {
    return Object.keys(this.mappings).filter(code => this.mappings[code] !== null);
  }

  /**
   * Get all unsupported airport codes (not in top 100 markets)
   * @returns {Array} Array of unsupported airport codes
   */
  getUnsupportedAirportCodes() {
    return Object.keys(this.mappings).filter(code => this.mappings[code] === null);
  }

  /**
   * Batch map multiple airport codes
   * @param {Array} airportCodes - Array of airport codes
   * @returns {Object} Object with successful and failed mappings
   */
  batchMapAirportCodes(airportCodes) {
    const results = {
      successful: [],
      unsupported: [],
      unknown: []
    };

    for (const airportCode of airportCodes) {
      const marketCode = this.mapAirportToMarket(airportCode);
      
      if (marketCode) {
        const market = marketDataService.getMarket(marketCode);
        results.successful.push({
          airportCode,
          marketCode,
          market
        });
      } else if (this.mappings[airportCode.toUpperCase()] === null) {
        results.unsupported.push(airportCode);
      } else {
        results.unknown.push(airportCode);
      }
    }

    return results;
  }

  /**
   * Get mapping statistics
   * @returns {Object} Mapping statistics
   */
  getMappingStats() {
    const total = Object.keys(this.mappings).length;
    const supported = this.getSupportedAirportCodes().length;
    const unsupported = this.getUnsupportedAirportCodes().length;

    return {
      totalMappings: total,
      supportedCodes: supported,
      unsupportedCodes: unsupported,
      supportRate: Math.round((supported / total) * 100),
      topMarketsCovered: marketDataService.getAllMarkets().length
    };
  }

  /**
   * Validate mapping against market data service
   * @returns {Object} Validation results
   */
  async validateMappings() {
    const results = {
      valid: [],
      invalid: [],
      missing: []
    };

    for (const [airportCode, marketCode] of Object.entries(this.mappings)) {
      if (marketCode === null) continue; // Skip unsupported markets
      
      const market = marketDataService.getMarket(marketCode);
      if (market) {
        results.valid.push({ airportCode, marketCode, market: market.name });
      } else {
        results.invalid.push({ airportCode, marketCode, error: 'Market not found' });
      }
    }

    return results;
  }
}

// Create and export singleton instance
const marketCodeMappingService = new MarketCodeMappingService();
module.exports = marketCodeMappingService;
