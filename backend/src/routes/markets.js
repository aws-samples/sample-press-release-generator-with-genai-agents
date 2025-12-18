const express = require('express');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const router = express.Router();

// Load centralized market data from JSON file
let CENTRALIZED_MARKETS = [];
let TOP_10_MARKETS = [];
let ALL_MARKETS = [];

// Try multiple possible paths for the markets data file
const possiblePaths = [
  path.join(__dirname, '../../../data/top-100-markets.json'), // Original path
  path.join(process.cwd(), 'data/top-100-markets.json'),      // From process working directory
  path.join(__dirname, '../../data/top-100-markets.json'),   // Alternative relative path
  '/app/data/top-100-markets.json'                           // Absolute Docker path
];

let marketsData = null;
let successfulPath = null;

for (const filePath of possiblePaths) {
  try {
    logger.info(`Attempting to load markets data from: ${filePath}`);
    
    // Check if file exists first
    if (fs.existsSync(filePath)) {
      marketsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      successfulPath = filePath;
      logger.info(`Successfully loaded markets data from: ${filePath}`);
      break;
    } else {
      logger.warn(`Markets data file not found at: ${filePath}`);
    }
  } catch (error) {
    logger.warn(`Failed to load markets data from ${filePath}:`, error.message);
  }
}

if (marketsData && marketsData.markets) {
  // Extract markets array from centralized file
  CENTRALIZED_MARKETS = marketsData.markets || [];
  
  // Create ALL_MARKETS from centralized data (should be 100 markets)
  ALL_MARKETS = CENTRALIZED_MARKETS;
  
  // Create TOP_10_MARKETS from first 10 markets in centralized data
  TOP_10_MARKETS = CENTRALIZED_MARKETS.slice(0, 10);
  
  logger.info('Markets data loaded successfully', {
    totalMarkets: ALL_MARKETS.length,
    top10Markets: TOP_10_MARKETS.length,
    source: 'centralized JSON file',
    filePath: successfulPath,
    version: marketsData.version,
    lastUpdated: marketsData.lastUpdated
  });
  
} else {
  logger.error('Failed to load centralized markets data from all attempted paths, falling back to hardcoded data', {
    attemptedPaths: possiblePaths,
    workingDirectory: process.cwd(),
    __dirname: __dirname
  });
  
  // Fallback to hardcoded data if centralized file fails to load
  TOP_10_MARKETS = [
    { name: 'New York-Newark-Jersey City', state: 'NY-NJ-PA', code: 'NYC', region: 'Northeast' },
    { name: 'Los Angeles-Long Beach-Anaheim', state: 'CA', code: 'LAX', region: 'West' },
    { name: 'Chicago-Naperville-Elgin', state: 'IL-IN-WI', code: 'CHI', region: 'Midwest' },
    { name: 'Dallas-Fort Worth-Arlington', state: 'TX', code: 'DFW', region: 'South' },
    { name: 'Houston-The Woodlands-Sugar Land', state: 'TX', code: 'HOU', region: 'South' },
    { name: 'Washington-Arlington-Alexandria', state: 'DC-VA-MD-WV', code: 'WAS', region: 'South' },
    { name: 'Miami-Fort Lauderdale-West Palm Beach', state: 'FL', code: 'MIA', region: 'South' },
    { name: 'Philadelphia-Camden-Wilmington', state: 'PA-NJ-DE-MD', code: 'PHL', region: 'Northeast' },
    { name: 'Atlanta-Sandy Springs-Roswell', state: 'GA', code: 'ATL', region: 'South' },
    { name: 'Boston-Cambridge-Newton', state: 'MA-NH', code: 'BOS', region: 'Northeast' }
  ];
  
  ALL_MARKETS = TOP_10_MARKETS; // Limited fallback data
}

/**
 * GET /api/v1/markets
 * Get all available markets
 */
router.get('/', async (req, res) => {
  try {
    const { limit, region, search } = req.query;
    
    let markets = ALL_MARKETS;
    
    // Filter by region if specified
    if (region) {
      markets = markets.filter(market => 
        market.region.toLowerCase() === region.toLowerCase()
      );
    }
    
    // Filter by search term if specified
    if (search) {
      const searchTerm = search.toLowerCase();
      markets = markets.filter(market => 
        market.name.toLowerCase().includes(searchTerm) ||
        market.state.toLowerCase().includes(searchTerm) ||
        market.code.toLowerCase().includes(searchTerm)
      );
    }
    
    // Limit results if specified
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        markets = markets.slice(0, limitNum);
      }
    }
    
    logger.info(`Markets endpoint called`, {
      totalMarkets: markets.length,
      filters: { region, search, limit }
    });
    
    res.json({
      success: true,
      markets,
      total: markets.length,
      filters: { region, search, limit }
    });
    
  } catch (error) {
    logger.error('Failed to get markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve markets',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/markets/top10
 * Get top 10 major US metropolitan markets
 */
router.get('/top10', async (req, res) => {
  try {
    logger.info('Top 10 markets endpoint called');
    
    res.json({
      success: true,
      markets: TOP_10_MARKETS,
      total: TOP_10_MARKETS.length,
      description: 'Top 10 Major US Metropolitan Markets'
    });
    
  } catch (error) {
    logger.error('Failed to get top 10 markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve top 10 markets',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/markets/regions
 * Get available regions
 */
router.get('/regions', async (req, res) => {
  try {
    const regions = [...new Set(ALL_MARKETS.map(market => market.region))];
    
    logger.info('Regions endpoint called');
    
    res.json({
      success: true,
      regions,
      total: regions.length
    });
    
  } catch (error) {
    logger.error('Failed to get regions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve regions',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/markets/:code
 * Get specific market by code
 */
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const market = ALL_MARKETS.find(m => 
      m.code.toLowerCase() === code.toLowerCase()
    );
    
    if (!market) {
      return res.status(404).json({
        success: false,
        error: 'Market not found',
        message: `Market with code '${code}' not found`
      });
    }
    
    logger.info(`Market detail endpoint called for ${code}`);
    
    res.json({
      success: true,
      market
    });
    
  } catch (error) {
    logger.error('Failed to get market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve market',
      message: error.message
    });
  }
});

module.exports = router;