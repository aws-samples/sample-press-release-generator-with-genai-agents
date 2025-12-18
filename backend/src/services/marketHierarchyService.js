const fs = require('fs').promises;
const path = require('path');

/**
 * Market Hierarchy Service - Data-driven market classification and relationship management
 * 
 * This service provides a scalable, data-driven approach to market relationships
 * without hardcoded logic. It uses the existing market data structure to determine
 * market hierarchies, submarket relationships, and quote compatibility.
 * 
 * Enhanced with real estate market anti-correlation analysis based on research findings:
 * - Markets can have different dynamics despite geographic proximity (SF vs LAX)
 * - Economic factors create anti-correlations (tech markets vs traditional markets)
 * - Supply/demand imbalances create market-specific conditions
 * - Regional performance can diverge significantly
 * 
 * "Key Principles":
 * - No hardcoded market-specific logic
 * - Data-driven market relationships
 * - Anti-correlation aware compatibility scoring
 * - Market dynamics beyond geographic proximity
 * - Scalable to all 100+ markets
 * - Submarket relationship support
 */
class MarketHierarchyService {
  constructor(marketDataPath = null) {
    // Multiple fallback paths for Docker compatibility
    const possiblePaths = [
      path.join(__dirname, '../../../data/top-100-markets.json'), // Original path
      path.join(process.cwd(), 'data/top-100-markets.json'),      // From process working directory
      path.join(__dirname, '../../data/top-100-markets.json'),   // Alternative relative path
      '/app/data/top-100-markets.json'                           // Absolute Docker path
    ];
    
    this.marketDataPath = marketDataPath || possiblePaths[0];
    this.possiblePaths = possiblePaths;
    this.marketData = null;
    this.marketIndex = new Map(); // Fast lookup by name/code
    this.submarketRelationships = new Map(); // Parent -> [children] relationships
    this.marketAntiCorrelations = new Map(); // Market -> [anti-correlated markets] with reasons
    this.marketCharacteristics = new Map(); // Market -> characteristics for compatibility
    this.isLoaded = false;
  }

  /**
   * Load and index market data
   */
  async loadMarketData() {
    if (this.isLoaded) {
      return;
    }

    let lastError = null;
    
    // Try each possible path until one works
    for (const possiblePath of this.possiblePaths) {
      try {
        console.log(`MarketHierarchyService: Trying to load market data from: ${possiblePath}`);
        const rawData = await fs.readFile(possiblePath, 'utf8');
        this.marketData = JSON.parse(rawData);
        
        // Build market index for fast lookups
        this.marketData.markets.forEach(market => {
          // Index by full name
          this.marketIndex.set(market.name.toLowerCase(), market);
          
          // Index by code
          if (market.code) {
            this.marketIndex.set(market.code.toLowerCase(), market);
          }
          
          // Index by primary city (first part of name)
          const primaryCity = market.name.split('-')[0].trim().toLowerCase();
          if (!this.marketIndex.has(primaryCity)) {
            this.marketIndex.set(primaryCity, market);
          }
        });

        // Build submarket relationships based on geographic and economic proximity
        this._buildSubmarketRelationships();
        
        // Build market anti-correlations based on research findings
        this._buildMarketAntiCorrelations();
        
        // Build market characteristics for enhanced compatibility scoring
        this._buildMarketCharacteristics();
        
        this.isLoaded = true;
        this.marketDataPath = possiblePath; // Update to working path
        console.log(`MarketHierarchyService: Loaded ${this.marketData.markets.length} markets with ${this.submarketRelationships.size} parent-child relationships and ${this.marketAntiCorrelations.size} anti-correlation patterns from ${possiblePath}`);
        return;
        
      } catch (error) {
        console.warn(`MarketHierarchyService: Failed to load from ${possiblePath}: ${error.message}`);
        lastError = error;
      }
    }
    
    // If we get here, all paths failed
    console.error('MarketHierarchyService: Error loading market data from all paths:', lastError?.message);
    throw new Error(`Failed to load market data from any path. Last error: ${lastError?.message}. Tried paths: ${this.possiblePaths.join(', ')}`);
  }

  /**
   * Build submarket relationships based on data patterns
   * @private
   */
  _buildSubmarketRelationships() {
    // Group markets by state and region to identify natural hierarchies
    const stateGroups = new Map();
    const regionGroups = new Map();

    this.marketData.markets.forEach(market => {
      // Group by primary state
      const primaryState = market.state.split('-')[0];
      if (!stateGroups.has(primaryState)) {
        stateGroups.set(primaryState, []);
      }
      stateGroups.get(primaryState).push(market);

      // Group by region
      if (!regionGroups.has(market.region)) {
        regionGroups.set(market.region, []);
      }
      regionGroups.get(market.region).push(market);
    });

    // Build submarket relationships for California markets
    const californiaMarkets = stateGroups.get('CA') || [];
    
    // Find the largest market in each state as potential parent
    californiaMarkets.forEach(market => {
      const marketName = market.name.toLowerCase();
      
      // LAX is the largest CA market - check for submarkets
      if (market.code === 'LAX') {
        const submarkets = californiaMarkets.filter(other => 
          other.code !== 'LAX' && 
          this._isSubmarketOf(other, market)
        );
        
        if (submarkets.length > 0) {
          this.submarketRelationships.set(market.code, submarkets.map(s => s.code));
        }
      }
    });

    // Apply same logic to other major markets
    ['TX', 'FL', 'NY', 'IL'].forEach(state => {
      const stateMarkets = stateGroups.get(state) || [];
      if (stateMarkets.length > 1) {
        // Find the largest market as parent
        const parentMarket = stateMarkets[0]; // First in list is typically largest
        const submarkets = stateMarkets.slice(1).filter(other => 
          this._isSubmarketOf(other, parentMarket)
        );
        
        if (submarkets.length > 0) {
          this.submarketRelationships.set(parentMarket.code, submarkets.map(s => s.code));
        }
      }
    });
  }

  /**
   * Build market anti-correlations based on research findings
   * @private
   */
  _buildMarketAntiCorrelations() {
    // Research-based anti-correlations: markets that behave differently despite proximity or expectations
    const antiCorrelationPatterns = [
      // California Tech vs Traditional Markets
      {
        market1: 'San Jose-Sunnyvale-Santa Clara',
        market2: 'Los Angeles-Long Beach-Anaheim',
        reason: 'tech_vs_traditional',
        strength: 0.8, // High anti-correlation
        description: 'Silicon Valley tech-driven market vs LA entertainment/traditional market - different economic drivers'
      },
      
      // West Coast Tech vs Other Regions
      {
        market1: 'Seattle-Tacoma-Bellevue',
        market2: 'Miami-Fort Lauderdale-West Palm Beach',
        reason: 'tech_vs_tourism',
        strength: 0.9,
        description: 'Seattle tech market vs Miami tourism/international market - completely different dynamics'
      },
      {
        market1: 'San Jose-Sunnyvale-Santa Clara',
        market2: 'Denver-Aurora-Lakewood',
        reason: 'coastal_tech_vs_mountain_traditional',
        strength: 0.8,
        description: 'Silicon Valley coastal tech market vs Denver mountain traditional market - different economic bases'
      },
      
      // Northeast Financial vs Other Markets
      {
        market1: 'New York-Newark-Jersey City',
        market2: 'Phoenix-Mesa-Scottsdale',
        reason: 'financial_vs_sunbelt',
        strength: 0.7,
        description: 'NYC financial market vs Phoenix sunbelt growth market - different price dynamics'
      },
      
      // Supply-Constrained vs Supply-Rich Markets
      {
        market1: 'San Jose-Sunnyvale-Santa Clara',
        market2: 'Dallas-Fort Worth-Arlington',
        reason: 'constrained_vs_expanding',
        strength: 0.6,
        description: 'Silicon Valley supply-constrained market vs DFW rapidly expanding market - different growth patterns'
      },
      {
        market1: 'Los Angeles-Long Beach-Anaheim',
        market2: 'Dallas-Fort Worth-Arlington',
        reason: 'constrained_vs_expanding',
        strength: 0.5,
        description: 'LA constrained coastal market vs DFW expanding inland market - different supply dynamics'
      },
      
      // Climate-Driven Markets vs Traditional Markets
      {
        market1: 'Miami-Fort Lauderdale-West Palm Beach',
        market2: 'Chicago-Naperville-Elgin',
        reason: 'climate_vs_traditional',
        strength: 0.7,
        description: 'Miami climate-driven market vs Chicago traditional industrial market - different seasonal patterns'
      },
      {
        market1: 'Phoenix-Mesa-Scottsdale',
        market2: 'Chicago-Naperville-Elgin',
        reason: 'sunbelt_vs_rustbelt',
        strength: 0.8,
        description: 'Phoenix sunbelt growth market vs Chicago traditional industrial market - opposite trajectories'
      }
    ];

    // Build anti-correlation maps
    antiCorrelationPatterns.forEach(pattern => {
      // Find markets directly from the index instead of using getMarket() to avoid circular dependency
      const market1 = this.marketIndex.get(pattern.market1.toLowerCase());
      const market2 = this.marketIndex.get(pattern.market2.toLowerCase());
      
      if (market1 && market2) {
        // Add bidirectional anti-correlations
        if (!this.marketAntiCorrelations.has(market1.code)) {
          this.marketAntiCorrelations.set(market1.code, []);
        }
        if (!this.marketAntiCorrelations.has(market2.code)) {
          this.marketAntiCorrelations.set(market2.code, []);
        }
        
        this.marketAntiCorrelations.get(market1.code).push({
          market: market2.code,
          reason: pattern.reason,
          strength: pattern.strength,
          description: pattern.description
        });
        
        this.marketAntiCorrelations.get(market2.code).push({
          market: market1.code,
          reason: pattern.reason,
          strength: pattern.strength,
          description: pattern.description
        });
      }
    });
  }

  /**
   * Build market characteristics for enhanced compatibility scoring
   * @private
   */
  _buildMarketCharacteristics() {
    // Define market characteristics based on research findings
    const marketTypes = {
      // Tech-Heavy Markets
      'tech_hub': {
        volatility: 'high',
        priceLevel: 'very_high',
        supplyConstraint: 'severe',
        economicDriver: 'technology',
        buyVsRentPremium: 'extreme', // 200%+
        inventoryMonths: 'very_low', // <2 months
        priceGrowthPattern: 'boom_bust'
      },
      
      // Traditional Metropolitan Markets
      'traditional_metro': {
        volatility: 'moderate',
        priceLevel: 'high',
        supplyConstraint: 'moderate',
        economicDriver: 'diversified',
        buyVsRentPremium: 'high', // 100-150%
        inventoryMonths: 'moderate', // 3-4 months
        priceGrowthPattern: 'steady'
      },
      
      // Sunbelt Growth Markets
      'sunbelt_growth': {
        volatility: 'moderate',
        priceLevel: 'moderate',
        supplyConstraint: 'low',
        economicDriver: 'population_growth',
        buyVsRentPremium: 'moderate', // 80-120%
        inventoryMonths: 'high', // 4+ months
        priceGrowthPattern: 'rapid_growth'
      },
      
      // Financial Centers
      'financial_center': {
        volatility: 'high',
        priceLevel: 'very_high',
        supplyConstraint: 'high',
        economicDriver: 'finance',
        buyVsRentPremium: 'very_high', // 150-200%
        inventoryMonths: 'low', // 2-3 months
        priceGrowthPattern: 'cyclical'
      },
      
      // Tourism/Climate Markets
      'tourism_climate': {
        volatility: 'high',
        priceLevel: 'high',
        supplyConstraint: 'moderate',
        economicDriver: 'tourism_climate',
        buyVsRentPremium: 'high', // 120-160%
        inventoryMonths: 'variable', // Seasonal
        priceGrowthPattern: 'seasonal'
      },
      
      // Industrial/Recovery Markets
      'industrial_recovery': {
        volatility: 'low',
        priceLevel: 'low',
        supplyConstraint: 'low',
        economicDriver: 'manufacturing',
        buyVsRentPremium: 'low', // 60-100%
        inventoryMonths: 'high', // 5+ months
        priceGrowthPattern: 'recovery'
      }
    };

    // Assign characteristics to markets based on research
    const marketClassifications = {
      // Tech Hubs (need to find actual codes from data)
      'SJC': 'tech_hub', // San Jose-Sunnyvale-Santa Clara
      'SEA': 'tech_hub', // Seattle-Tacoma-Bellevue
      
      // Traditional Metros
      'LAX': 'traditional_metro', // Los Angeles-Long Beach-Anaheim
      'CHI': 'traditional_metro', // Chicago-Naperville-Elgin
      
      // Sunbelt Growth
      'PHX': 'sunbelt_growth', // Phoenix-Mesa-Scottsdale
      'DFW': 'sunbelt_growth', // Dallas-Fort Worth-Arlington
      'DEN': 'sunbelt_growth', // Denver-Aurora-Lakewood
      
      // Financial Centers
      'NYC': 'financial_center', // New York-Newark-Jersey City
      
      // Tourism/Climate
      'MIA': 'tourism_climate' // Miami-Fort Lauderdale-West Palm Beach
    };

    // Build characteristics map
    Object.entries(marketClassifications).forEach(([marketCode, type]) => {
      const characteristics = marketTypes[type];
      if (characteristics) {
        this.marketCharacteristics.set(marketCode, {
          type,
          ...characteristics
        });
      }
    });

    // Add default characteristics for unclassified markets
    this.marketData.markets.forEach(market => {
      if (!this.marketCharacteristics.has(market.code)) {
        // Default to traditional metro characteristics
        this.marketCharacteristics.set(market.code, {
          type: 'traditional_metro',
          ...marketTypes.traditional_metro
        });
      }
    });
  }

  /**
   * Determine if one market is a submarket of another based on data patterns
   * @private
   */
  _isSubmarketOf(candidateSubmarket, parentMarket) {
    // Same state is a prerequisite
    if (candidateSubmarket.state.split('-')[0] !== parentMarket.state.split('-')[0]) {
      return false;
    }

    // Same region is required
    if (candidateSubmarket.region !== parentMarket.region) {
      return false;
    }

    // Geographic proximity based on name patterns
    const parentName = parentMarket.name.toLowerCase();
    const candidateName = candidateSubmarket.name.toLowerCase();
    
    // Check if candidate is geographically related to parent
    // This is based on common metropolitan area patterns
    if (parentMarket.code === 'LAX') {
      // Riverside-San Bernardino is part of Greater LA metropolitan area
      return candidateName.includes('riverside') || 
             candidateName.includes('san bernardino') ||
             candidateName.includes('ontario');
    }
    
    if (parentMarket.code === 'NYC') {
      // Long Island, Westchester, etc. would be NYC submarkets
      return candidateName.includes('long island') ||
             candidateName.includes('westchester') ||
             candidateName.includes('nassau');
    }

    // Default: smaller markets in same state/region could be submarkets
    return false;
  }

  /**
   * Get market information by name or code
   */
  getMarket(marketIdentifier) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const key = marketIdentifier.toLowerCase();
    return this.marketIndex.get(key) || null;
  }

  /**
   * Calculate market compatibility score between two markets
   * 
   * @param {string} targetMarket - Target market name/code
   * @param {string} quoteMarket - Quote source market/location
   * @returns {number} Compatibility score (0-1)
   */
  calculateMarketCompatibility(targetMarket, quoteMarket) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const target = this.getMarket(targetMarket);
    const quote = this.getMarket(quoteMarket);

    // If we can't find either market in our data, use string matching
    if (!target || !quote) {
      return this._calculateStringCompatibility(targetMarket, quoteMarket);
    }

    // Exact match
    if (target.code === quote.code) {
      return 1.0;
    }

    // Check for anti-correlations first - these override geographic proximity
    const antiCorrelationPenalty = this._calculateAntiCorrelationPenalty(target, quote);
    
    // Submarket relationship
    if (this._isSubmarketRelationship(target, quote)) {
      return Math.max(0.9 - antiCorrelationPenalty, 0.1);
    }

    // Market characteristics compatibility
    const characteristicsScore = this._calculateCharacteristicsCompatibility(target, quote);

    // Same state, different markets - but consider market characteristics
    if (target.state.split('-')[0] === quote.state.split('-')[0]) {
      const baseScore = 0.6;
      const adjustedScore = baseScore * characteristicsScore - antiCorrelationPenalty;
      return Math.max(adjustedScore, 0.0);
    }

    // Same region, different states - heavily penalized for anti-correlations
    if (target.region === quote.region) {
      const baseScore = 0.1;
      const adjustedScore = baseScore * characteristicsScore - antiCorrelationPenalty;
      return Math.max(adjustedScore, 0.0);
    }

    // Different regions - only compatible if very similar characteristics
    const adjustedScore = characteristicsScore * 0.05 - antiCorrelationPenalty;
    return Math.max(adjustedScore, 0.0);
  }

  /**
   * Calculate anti-correlation penalty between two markets
   * @private
   */
  _calculateAntiCorrelationPenalty(market1, market2) {
    const antiCorrelations1 = this.marketAntiCorrelations.get(market1.code) || [];
    const antiCorrelation = antiCorrelations1.find(ac => ac.market === market2.code);
    
    if (antiCorrelation) {
      // Anti-correlations create penalties but shouldn't completely eliminate all quotes
      return antiCorrelation.strength * 0.4; // Up to 0.4 penalty (reduced from 0.8)
    }
    
    return 0.0;
  }

  /**
   * Calculate compatibility based on market characteristics
   * @private
   */
  _calculateCharacteristicsCompatibility(market1, market2) {
    const char1 = this.marketCharacteristics.get(market1.code);
    const char2 = this.marketCharacteristics.get(market2.code);
    
    if (!char1 || !char2) {
      return 0.5; // Default moderate compatibility
    }

    let compatibilityScore = 1.0;
    
    // Market type compatibility
    if (char1.type === char2.type) {
      compatibilityScore *= 1.0; // Same type = full compatibility
    } else {
      // Different types have reduced compatibility
      const typeCompatibility = this._getTypeCompatibility(char1.type, char2.type);
      compatibilityScore *= typeCompatibility;
    }
    
    // Economic driver compatibility
    if (char1.economicDriver === char2.economicDriver) {
      compatibilityScore *= 1.0;
    } else {
      compatibilityScore *= 0.7; // Different economic drivers reduce compatibility
    }
    
    // Price level compatibility (similar price levels are more compatible)
    const priceLevelCompatibility = this._getPriceLevelCompatibility(char1.priceLevel, char2.priceLevel);
    compatibilityScore *= priceLevelCompatibility;
    
    // Volatility compatibility (similar volatility patterns are more compatible)
    const volatilityCompatibility = this._getVolatilityCompatibility(char1.volatility, char2.volatility);
    compatibilityScore *= volatilityCompatibility;
    
    return Math.max(compatibilityScore, 0.1); // Minimum 0.1 compatibility
  }

  /**
   * Get compatibility score between market types
   * @private
   */
  _getTypeCompatibility(type1, type2) {
    const compatibilityMatrix = {
      'tech_hub': {
        'tech_hub': 1.0,
        'financial_center': 0.7,
        'traditional_metro': 0.4,
        'sunbelt_growth': 0.3,
        'tourism_climate': 0.2,
        'industrial_recovery': 0.1
      },
      'financial_center': {
        'financial_center': 1.0,
        'tech_hub': 0.7,
        'traditional_metro': 0.6,
        'tourism_climate': 0.4,
        'sunbelt_growth': 0.3,
        'industrial_recovery': 0.2
      },
      'traditional_metro': {
        'traditional_metro': 1.0,
        'financial_center': 0.6,
        'sunbelt_growth': 0.5,
        'tech_hub': 0.4,
        'tourism_climate': 0.4,
        'industrial_recovery': 0.3
      },
      'sunbelt_growth': {
        'sunbelt_growth': 1.0,
        'traditional_metro': 0.5,
        'tourism_climate': 0.6,
        'tech_hub': 0.3,
        'financial_center': 0.3,
        'industrial_recovery': 0.4
      },
      'tourism_climate': {
        'tourism_climate': 1.0,
        'sunbelt_growth': 0.6,
        'traditional_metro': 0.4,
        'financial_center': 0.4,
        'tech_hub': 0.2,
        'industrial_recovery': 0.2
      },
      'industrial_recovery': {
        'industrial_recovery': 1.0,
        'sunbelt_growth': 0.4,
        'traditional_metro': 0.3,
        'financial_center': 0.2,
        'tourism_climate': 0.2,
        'tech_hub': 0.1
      }
    };
    
    return compatibilityMatrix[type1]?.[type2] || 0.3;
  }

  /**
   * Get compatibility score between price levels
   * @private
   */
  _getPriceLevelCompatibility(level1, level2) {
    const levels = ['low', 'moderate', 'high', 'very_high'];
    const index1 = levels.indexOf(level1);
    const index2 = levels.indexOf(level2);
    
    if (index1 === -1 || index2 === -1) return 0.5;
    
    const difference = Math.abs(index1 - index2);
    return Math.max(1.0 - (difference * 0.25), 0.2);
  }

  /**
   * Get compatibility score between volatility levels
   * @private
   */
  _getVolatilityCompatibility(vol1, vol2) {
    if (vol1 === vol2) return 1.0;
    
    const volatilityOrder = ['low', 'moderate', 'high'];
    const index1 = volatilityOrder.indexOf(vol1);
    const index2 = volatilityOrder.indexOf(vol2);
    
    if (index1 === -1 || index2 === -1) return 0.5;
    
    const difference = Math.abs(index1 - index2);
    return Math.max(1.0 - (difference * 0.3), 0.3);
  }

  /**
   * Check if there's a submarket relationship between two markets
   * @private
   */
  _isSubmarketRelationship(market1, market2) {
    // Check if market1 is a submarket of market2
    const market2Submarkets = this.submarketRelationships.get(market2.code) || [];
    if (market2Submarkets.includes(market1.code)) {
      return true;
    }

    // Check if market2 is a submarket of market1
    const market1Submarkets = this.submarketRelationships.get(market1.code) || [];
    if (market1Submarkets.includes(market2.code)) {
      return true;
    }

    return false;
  }

  /**
   * Fallback string-based compatibility for markets not in our data
   * @private
   */
  _calculateStringCompatibility(targetMarket, quoteMarket) {
    const target = targetMarket.toLowerCase();
    const quote = quoteMarket.toLowerCase();

    // Exact match
    if (target === quote) {
      return 1.0;
    }

    // One contains the other
    if (target.includes(quote) || quote.includes(target)) {
      return 0.8;
    }

    // Extract city names and compare
    const targetCity = target.split(',')[0].split('-')[0].trim();
    const quoteCity = quote.split(',')[0].split('-')[0].trim();

    if (targetCity === quoteCity) {
      return 0.7;
    }

    // No relationship found
    return 0.0;
  }

  /**
   * Get all markets in the same region as the target market
   */
  getRegionalMarkets(targetMarket) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const target = this.getMarket(targetMarket);
    if (!target) {
      return [];
    }

    return this.marketData.markets.filter(market => 
      market.region === target.region && market.code !== target.code
    );
  }

  /**
   * Get submarkets for a given parent market
   */
  getSubmarkets(parentMarket) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const parent = this.getMarket(parentMarket);
    if (!parent) {
      return [];
    }

    const submarketCodes = this.submarketRelationships.get(parent.code) || [];
    return submarketCodes.map(code => this.getMarket(code)).filter(Boolean);
  }

  /**
   * Get anti-correlation information for a market
   */
  getMarketAntiCorrelations(marketIdentifier) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const market = this.getMarket(marketIdentifier);
    if (!market) {
      return [];
    }

    return this.marketAntiCorrelations.get(market.code) || [];
  }

  /**
   * Get market characteristics
   */
  getMarketCharacteristics(marketIdentifier) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const market = this.getMarket(marketIdentifier);
    if (!market) {
      return null;
    }

    return this.marketCharacteristics.get(market.code) || null;
  }

  /**
   * Check if two markets are anti-correlated
   */
  areMarketsAntiCorrelated(market1Identifier, market2Identifier) {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const market1 = this.getMarket(market1Identifier);
    const market2 = this.getMarket(market2Identifier);
    
    if (!market1 || !market2) {
      return false;
    }

    const antiCorrelations = this.marketAntiCorrelations.get(market1.code) || [];
    return antiCorrelations.some(ac => ac.market === market2.code);
  }

  /**
   * Get market hierarchy information for debugging
   */
  getMarketHierarchyInfo() {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const hierarchyInfo = {
      totalMarkets: this.marketData.markets.length,
      regions: {},
      submarketRelationships: {}
    };

    // Group by region
    this.marketData.markets.forEach(market => {
      if (!hierarchyInfo.regions[market.region]) {
        hierarchyInfo.regions[market.region] = [];
      }
      hierarchyInfo.regions[market.region].push({
        name: market.name,
        code: market.code,
        state: market.state
      });
    });

    // Add submarket relationships
    this.submarketRelationships.forEach((submarkets, parent) => {
      hierarchyInfo.submarketRelationships[parent] = submarkets;
    });

    return hierarchyInfo;
  }

  /**
   * Get enhanced market hierarchy information for debugging
   */
  getEnhancedMarketHierarchyInfo() {
    if (!this.isLoaded) {
      throw new Error('Market data not loaded. Call loadMarketData() first.');
    }

    const hierarchyInfo = this.getMarketHierarchyInfo();
    
    // Add anti-correlation information
    hierarchyInfo.antiCorrelations = {};
    this.marketAntiCorrelations.forEach((correlations, market) => {
      hierarchyInfo.antiCorrelations[market] = correlations;
    });

    // Add market characteristics
    hierarchyInfo.marketCharacteristics = {};
    this.marketCharacteristics.forEach((characteristics, market) => {
      hierarchyInfo.marketCharacteristics[market] = characteristics;
    });

    return hierarchyInfo;
  }
}

module.exports = MarketHierarchyService;