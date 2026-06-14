/**
 * Static Market Profiles for Emergency Fallback
 * Phase 1 "Critical Fix": Provides static market data when external services fail
 * 
 * This file contains comprehensive market profiles for the top 10 markets
 * to ensure the system can operate even when Firecrawl or other external
 * data sources are unavailable.
 */

const marketProfiles = {
  'New York, NY': {
    code: 'NYC',
    name: 'New York, NY',
    region: 'Northeast',
    population: 8336817,
    medianIncome: 70663,
    medianHomePrice: 679000,
    unemploymentRate: 4.2,
    costOfLiving: 168.6,
    rentPrices: {
      studio: 2800,
      oneBedroom: 3200,
      twoBedroom: 4100,
      threeBedroom: 5200
    },
    housingSupply: {
      totalUnits: 3644826,
      vacancyRate: 8.8,
      ownerOccupied: 32.0,
      renterOccupied: 68.0
    },
    ageDistribution: {
      under25: 22.1,
      age25to44: 35.8,
      age45to64: 25.4,
      over65: 16.7
    },
    educationLevel: {
      highSchool: 78.9,
      bachelors: 37.2,
      graduate: 15.8
    },
    householdComposition: {
      families: 0.48,
      singlePerson: 0.32,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 89000,
      majorIndustries: ['Finance', 'Real Estate', 'Technology', 'Media'],
      employmentGrowth: 2.1
    },
    marketTrends: {
      priceGrowthYoY: 8.5,
      inventoryChange: -12.3,
      daysOnMarket: 45,
      salesVolume: 15200
    },
    personality: {
      traits: ['Direct', 'Fast-paced', 'No-nonsense', 'Results-oriented'],
      terminology: ['Manhattan', 'outer boroughs', 'co-op', 'condo conversion', 'rent-stabilized'],
      tone: 'Urgent, competitive, sophisticated',
      demographics: 'High-income professionals, international buyers, investors',
      context: 'Luxury market focus, space constraints, premium pricing'
    },
    sources: ['US Census', 'NYC Housing Authority', 'Real Estate Board of NY'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 95
  },

  'Los Angeles-Long Beach-Anaheim': {
    code: 'LAX',
    name: 'Los Angeles-Long Beach-Anaheim',
    region: 'West',
    population: 13200998, // Combined MSA population
    medianIncome: 68044, // MSA median household income
    medianHomePrice: 849000, // MSA median home price
    unemploymentRate: 4.2, // MSA unemployment rate
    costOfLiving: 148.7, // MSA cost of living index
    rentPrices: {
      studio: 2100,
      oneBedroom: 2600,
      twoBedroom: 3400,
      threeBedroom: 4800
    },
    housingSupply: {
      totalUnits: 4825000, // Total housing units across MSA
      vacancyRate: 7.1, // MSA vacancy rate
      ownerOccupied: 47.2, // MSA homeownership rate
      renterOccupied: 52.8
    },
    ageDistribution: {
      under25: 24.8,
      age25to44: 33.2,
      age45to64: 25.1,
      over65: 16.9
    },
    educationLevel: {
      highSchool: 76.4,
      bachelors: 33.8,
      graduate: 12.1
    },
    householdComposition: {
      families: 0.52,
      singlePerson: 0.28,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 71000,
      majorIndustries: ['Entertainment', 'Technology', 'Aerospace', 'International Trade', 'Tourism', 'Manufacturing'],
      employmentGrowth: 1.8
    },
    marketTrends: {
      priceGrowthYoY: 12.1,
      inventoryChange: -8.7,
      daysOnMarket: 38,
      salesVolume: 28400
    },
    neighborhoods: {
      primary: ['Downtown LA', 'Santa Monica', 'Beverly Hills', 'Long Beach', 'Anaheim', 'Pasadena'],
      secondary: ['Glendale', 'Torrance', 'Irvine', 'Huntington Beach', 'Burbank', 'Fullerton']
    },
    msaSpecificFactors: {
      diverseEconomy: 'Multi-sector economy spanning entertainment, tech, aerospace, and international trade',
      geographicSpread: 'Encompasses urban cores, suburban communities, and coastal areas across multiple counties',
      transportationNetwork: 'Extensive freeway system, Metro Rail, ports, and multiple airports',
      culturalDiversity: 'Highly diverse population with varied housing preferences and economic drivers'
    },
    personality: {
      traits: ['Diverse', 'Aspirational', 'Innovation-driven', 'Lifestyle-focused'],
      terminology: ['metro area', 'greater LA', 'SoCal', 'coastal communities', 'inland empire', 'OC', 'beach cities'],
      tone: 'Aspirational, lifestyle-oriented, diverse',
      demographics: 'Entertainment industry, tech workers, international professionals, families, retirees',
      context: 'Diverse metropolitan area with varied submarkets, lifestyle amenities, and economic opportunities'
    },
    sources: ['US Census', 'CA Dept of Finance', 'LA County Assessor', 'Orange County Assessor', 'Long Beach Economic Development'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 92
  },

  'Los Angeles, CA': {
    code: 'LA',
    name: 'Los Angeles, CA',
    region: 'West',
    population: 3898747,
    medianIncome: 65290,
    medianHomePrice: 849000,
    unemploymentRate: 4.8,
    costOfLiving: 148.7,
    rentPrices: {
      studio: 2100,
      oneBedroom: 2600,
      twoBedroom: 3400,
      threeBedroom: 4800
    },
    housingSupply: {
      totalUnits: 1532364,
      vacancyRate: 7.2,
      ownerOccupied: 36.4,
      renterOccupied: 63.6
    },
    ageDistribution: {
      under25: 24.8,
      age25to44: 33.2,
      age45to64: 25.1,
      over65: 16.9
    },
    educationLevel: {
      highSchool: 76.4,
      bachelors: 33.8,
      graduate: 12.1
    },
    householdComposition: {
      families: 0.52,
      singlePerson: 0.28,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 71000,
      majorIndustries: ['Entertainment', 'Technology', 'Aerospace', 'Fashion'],
      employmentGrowth: 1.8
    },
    marketTrends: {
      priceGrowthYoY: 12.1,
      inventoryChange: -8.7,
      daysOnMarket: 38,
      salesVolume: 28400
    },
    personality: {
      traits: ['Lifestyle-focused', 'Aspirational', 'Trend-aware', 'Image-conscious'],
      terminology: ['Hollywood Hills', 'beach cities', 'mid-century modern', 'celebrity homes'],
      tone: 'Aspirational, lifestyle-oriented, trendy',
      demographics: 'Entertainment industry, tech workers, lifestyle buyers',
      context: 'Outdoor living, architectural styles, celebrity influence'
    },
    sources: ['US Census', 'CA Dept of Finance', 'LA County Assessor'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 92
  },

  'Chicago, IL': {
    code: 'CHI',
    name: 'Chicago, IL',
    region: 'Midwest',
    population: 2746388,
    medianIncome: 58247,
    medianHomePrice: 285000,
    unemploymentRate: 5.1,
    costOfLiving: 106.9,
    rentPrices: {
      studio: 1400,
      oneBedroom: 1800,
      twoBedroom: 2300,
      threeBedroom: 3100
    },
    housingSupply: {
      totalUnits: 1194337,
      vacancyRate: 9.8,
      ownerOccupied: 43.7,
      renterOccupied: 56.3
    },
    ageDistribution: {
      under25: 26.2,
      age25to44: 32.1,
      age45to64: 24.8,
      over65: 16.9
    },
    educationLevel: {
      highSchool: 84.9,
      bachelors: 37.8,
      graduate: 15.5
    },
    householdComposition: {
      families: 0.44,
      singlePerson: 0.36,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 65000,
      majorIndustries: ['Finance', 'Manufacturing', 'Transportation', 'Technology'],
      employmentGrowth: 1.2
    },
    marketTrends: {
      priceGrowthYoY: 6.8,
      inventoryChange: 4.2,
      daysOnMarket: 52,
      salesVolume: 18700
    },
    personality: {
      traits: ['Practical', 'Value-focused', 'Straightforward', 'Neighborhood-oriented'],
      terminology: ['Loop', 'North Side', 'South Side', 'vintage homes', 'Chicago bungalow'],
      tone: 'Practical, honest, community-focused',
      demographics: 'Families, young professionals, value-conscious buyers',
      context: 'Neighborhood character, architectural heritage, value proposition'
    },
    sources: ['US Census', 'Chicago Dept of Planning', 'IL Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 90
  },

  'Dallas, TX': {
    code: 'DFW',
    name: 'Dallas, TX',
    region: 'South',
    population: 1343573,
    medianIncome: 52580,
    medianHomePrice: 425000,
    unemploymentRate: 3.8,
    costOfLiving: 101.8,
    rentPrices: {
      studio: 1200,
      oneBedroom: 1500,
      twoBedroom: 1900,
      threeBedroom: 2600
    },
    housingSupply: {
      totalUnits: 584471,
      vacancyRate: 8.1,
      ownerOccupied: 41.2,
      renterOccupied: 58.8
    },
    ageDistribution: {
      under25: 28.5,
      age25to44: 34.8,
      age45to64: 23.2,
      over65: 13.5
    },
    educationLevel: {
      highSchool: 78.1,
      bachelors: 32.4,
      graduate: 11.8
    },
    householdComposition: {
      families: 0.48,
      singlePerson: 0.32,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 58000,
      majorIndustries: ['Technology', 'Finance', 'Energy', 'Healthcare'],
      employmentGrowth: 3.2
    },
    marketTrends: {
      priceGrowthYoY: 15.3,
      inventoryChange: -18.5,
      daysOnMarket: 28,
      salesVolume: 32100
    },
    personality: {
      traits: ['Business-minded', 'Growth-oriented', 'Family-focused', 'Opportunity-driven'],
      terminology: ['DFW', 'master-planned communities', 'new construction', 'corporate relocations'],
      tone: 'Optimistic, business-focused, family-oriented',
      demographics: 'Corporate relocations, families, business professionals',
      context: 'Job growth, new construction, suburban expansion'
    },
    sources: ['US Census', 'TX Demographic Center', 'Dallas Central Appraisal'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 88
  },

  'Houston, TX': {
    code: 'HOU',
    name: 'Houston, TX',
    region: 'South',
    population: 2304580,
    medianIncome: 52338,
    medianHomePrice: 298000,
    unemploymentRate: 4.4,
    costOfLiving: 96.5,
    rentPrices: {
      studio: 1100,
      oneBedroom: 1400,
      twoBedroom: 1800,
      threeBedroom: 2400
    },
    housingSupply: {
      totalUnits: 956621,
      vacancyRate: 10.2,
      ownerOccupied: 42.8,
      renterOccupied: 57.2
    },
    ageDistribution: {
      under25: 29.8,
      age25to44: 33.1,
      age45to64: 23.4,
      over65: 13.7
    },
    educationLevel: {
      highSchool: 74.6,
      bachelors: 31.2,
      graduate: 10.9
    },
    householdComposition: {
      families: 0.51,
      singlePerson: 0.29,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 62000,
      majorIndustries: ['Energy', 'Healthcare', 'Aerospace', 'Petrochemicals'],
      employmentGrowth: 2.8
    },
    marketTrends: {
      priceGrowthYoY: 11.7,
      inventoryChange: -14.2,
      daysOnMarket: 35,
      salesVolume: 41200
    },
    personality: {
      traits: ['Energy-sector focused', 'Diverse', 'Opportunity-seeking', 'Resilient'],
      terminology: ['Energy corridor', 'medical center', 'master-planned', 'flood zones'],
      tone: 'Resilient, opportunity-focused, practical',
      demographics: 'Energy workers, medical professionals, diverse population',
      context: 'Industry influence, weather considerations, diversity'
    },
    sources: ['US Census', 'Greater Houston Partnership', 'Harris County'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 87
  },

  'Washington, DC': {
    code: 'WDC',
    name: 'Washington, DC',
    region: 'South',
    population: 705749,
    medianIncome: 92266,
    medianHomePrice: 695000,
    unemploymentRate: 3.9,
    costOfLiving: 152.1,
    rentPrices: {
      studio: 2200,
      oneBedroom: 2800,
      twoBedroom: 3600,
      threeBedroom: 4800
    },
    housingSupply: {
      totalUnits: 321418,
      vacancyRate: 7.8,
      ownerOccupied: 38.4,
      renterOccupied: 61.6
    },
    ageDistribution: {
      under25: 21.8,
      age25to44: 42.2,
      age45to64: 22.1,
      over65: 13.9
    },
    educationLevel: {
      highSchool: 90.1,
      bachelors: 59.2,
      graduate: 33.4
    },
    householdComposition: {
      families: 0.35,
      singlePerson: 0.45,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 185000,
      majorIndustries: ['Government', 'Professional Services', 'Education', 'Tourism'],
      employmentGrowth: 1.5
    },
    marketTrends: {
      priceGrowthYoY: 7.2,
      inventoryChange: -6.8,
      daysOnMarket: 42,
      salesVolume: 8900
    },
    personality: {
      traits: ['Policy-aware', 'Educated', 'Status-conscious', 'Politically engaged'],
      terminology: ['Capitol Hill', 'Georgetown', 'federal workers', 'security clearance', 'Metro accessible'],
      tone: 'Sophisticated, policy-aware, status-conscious',
      demographics: 'Government workers, lobbyists, policy professionals',
      context: 'Political influence, government employment, education levels'
    },
    sources: ['US Census', 'DC Office of Planning', 'Washington Board of Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 94
  },

  'Miami, FL': {
    code: 'MIA',
    name: 'Miami, FL',
    region: 'South',
    population: 467963,
    medianIncome: 43401,
    medianHomePrice: 595000,
    unemploymentRate: 4.1,
    costOfLiving: 123.1,
    rentPrices: {
      studio: 2000,
      oneBedroom: 2500,
      twoBedroom: 3200,
      threeBedroom: 4500
    },
    housingSupply: {
      totalUnits: 249422,
      vacancyRate: 12.8,
      ownerOccupied: 28.1,
      renterOccupied: 71.9
    },
    ageDistribution: {
      under25: 22.4,
      age25to44: 32.8,
      age45to64: 26.1,
      over65: 18.7
    },
    educationLevel: {
      highSchool: 79.2,
      bachelors: 28.4,
      graduate: 9.8
    },
    householdComposition: {
      families: 0.42,
      singlePerson: 0.38,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 48000,
      majorIndustries: ['Tourism', 'International Trade', 'Finance', 'Real Estate'],
      employmentGrowth: 2.4
    },
    marketTrends: {
      priceGrowthYoY: 18.9,
      inventoryChange: -22.1,
      daysOnMarket: 31,
      salesVolume: 12800
    },
    personality: {
      traits: ['International', 'Luxury-focused', 'Lifestyle-oriented', 'Investment-driven'],
      terminology: ['South Beach', 'Brickell', 'international buyers', 'luxury condos', 'waterfront'],
      tone: 'Luxurious, international, lifestyle-focused',
      demographics: 'International buyers, retirees, luxury market',
      context: 'International investment, luxury market, lifestyle amenities'
    },
    sources: ['US Census', 'Miami-Dade County', 'Miami Association of Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 85
  },

  'Philadelphia, PA': {
    code: 'PHL',
    name: 'Philadelphia, PA',
    region: 'Northeast',
    population: 1603797,
    medianIncome: 45927,
    medianHomePrice: 185000,
    unemploymentRate: 5.8,
    costOfLiving: 101.2,
    rentPrices: {
      studio: 1200,
      oneBedroom: 1500,
      twoBedroom: 1900,
      threeBedroom: 2500
    },
    housingSupply: {
      totalUnits: 670171,
      vacancyRate: 11.1,
      ownerOccupied: 52.4,
      renterOccupied: 47.6
    },
    ageDistribution: {
      under25: 28.1,
      age25to44: 29.8,
      age45to64: 24.2,
      over65: 17.9
    },
    educationLevel: {
      highSchool: 85.4,
      bachelors: 27.1,
      graduate: 12.8
    },
    householdComposition: {
      families: 0.41,
      singlePerson: 0.39,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 54000,
      majorIndustries: ['Healthcare', 'Education', 'Manufacturing', 'Tourism'],
      employmentGrowth: 0.8
    },
    marketTrends: {
      priceGrowthYoY: 9.4,
      inventoryChange: 2.1,
      daysOnMarket: 48,
      salesVolume: 14200
    },
    personality: {
      traits: ['Historic', 'Value-conscious', 'Neighborhood-focused', 'Practical'],
      terminology: ['Center City', 'Main Line', 'rowhomes', 'historic districts', 'SEPTA'],
      tone: 'Historic, practical, community-oriented',
      demographics: 'Families, young professionals, historic preservation enthusiasts',
      context: 'Historic character, neighborhood identity, value markets'
    },
    sources: ['US Census', 'Philadelphia Planning Commission', 'PA Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 89
  },

  'Atlanta, GA': {
    code: 'ATL',
    name: 'Atlanta, GA',
    region: 'South',
    population: 498715,
    medianIncome: 59948,
    medianHomePrice: 385000,
    unemploymentRate: 4.2,
    costOfLiving: 108.3,
    rentPrices: {
      studio: 1300,
      oneBedroom: 1700,
      twoBedroom: 2200,
      threeBedroom: 3000
    },
    housingSupply: {
      totalUnits: 242975,
      vacancyRate: 9.4,
      ownerOccupied: 45.1,
      renterOccupied: 54.9
    },
    ageDistribution: {
      under25: 25.8,
      age25to44: 38.2,
      age45to64: 22.1,
      over65: 13.9
    },
    educationLevel: {
      highSchool: 87.2,
      bachelors: 50.4,
      graduate: 21.3
    },
    householdComposition: {
      families: 0.38,
      singlePerson: 0.42,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 68000,
      majorIndustries: ['Transportation', 'Technology', 'Film', 'Finance'],
      employmentGrowth: 2.9
    },
    marketTrends: {
      priceGrowthYoY: 13.8,
      inventoryChange: -16.4,
      daysOnMarket: 33,
      salesVolume: 18900
    },
    personality: {
      traits: ['Growth-oriented', 'Business-friendly', 'Diverse', 'Opportunity-focused'],
      terminology: ['Perimeter', 'Buckhead', 'intown', 'corporate relocations', 'new construction'],
      tone: 'Growth-focused, business-oriented, welcoming',
      demographics: 'Corporate relocations, young professionals, diverse population',
      context: 'Business growth, corporate presence, urban development'
    },
    sources: ['US Census', 'Atlanta Regional Commission', 'GA Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 86
  },

  'Boston, MA': {
    code: 'BOS',
    name: 'Boston, MA',
    region: 'Northeast',
    population: 695506,
    medianIncome: 81744,
    medianHomePrice: 825000,
    unemploymentRate: 3.4,
    costOfLiving: 149.7,
    rentPrices: {
      studio: 2400,
      oneBedroom: 3000,
      twoBedroom: 3800,
      threeBedroom: 5200
    },
    housingSupply: {
      totalUnits: 296652,
      vacancyRate: 6.2,
      ownerOccupied: 35.8,
      renterOccupied: 64.2
    },
    ageDistribution: {
      under25: 28.6,
      age25to44: 35.1,
      age45to64: 21.8,
      over65: 14.5
    },
    educationLevel: {
      highSchool: 89.8,
      bachelors: 47.1,
      graduate: 25.6
    },
    householdComposition: {
      families: 0.37,
      singlePerson: 0.43,
      nonFamily: 0.20
    },
    economicIndicators: {
      gdpPerCapita: 89000,
      majorIndustries: ['Biotechnology', 'Education', 'Healthcare', 'Finance'],
      employmentGrowth: 1.8
    },
    marketTrends: {
      priceGrowthYoY: 10.2,
      inventoryChange: -9.1,
      daysOnMarket: 39,
      salesVolume: 11400
    },
    personality: {
      traits: ['Educated', 'Historic', 'Innovation-focused', 'Quality-conscious'],
      terminology: ['Back Bay', 'Cambridge', 'triple-deckers', 'T-accessible', 'biotech corridor'],
      tone: 'Educated, quality-focused, innovation-oriented',
      demographics: 'Students, tech workers, medical professionals, academics',
      context: 'Education institutions, innovation economy, historic preservation'
    },
    sources: ['US Census', 'Boston Planning & Development', 'MA Realtors'],
    lastUpdated: new Date('2024-12-01'),
    dataQuality: 93
  }
};

/**
 * Get market profile by name or code
 */
function getMarketProfile(marketIdentifier) {
  // Direct lookup by key
  if (marketProfiles[marketIdentifier]) {
    return marketProfiles[marketIdentifier];
  }
  
  // Search by code (case insensitive)
  for (const [key, profile] of Object.entries(marketProfiles)) {
    if (profile.code.toLowerCase() === marketIdentifier.toLowerCase()) {
      return profile;
    }
  }
  
  // Search by name (case insensitive)
  const normalizedInput = marketIdentifier.toLowerCase();
  for (const [key, profile] of Object.entries(marketProfiles)) {
    if (profile.name.toLowerCase() === normalizedInput) {
      return profile;
    }
  }
  
  return null;
}

/**
 * Get all available market codes
 */
function getAvailableMarkets() {
  return Object.keys(marketProfiles);
}

/**
 * Get market profiles for multiple markets
 */
function getMarketProfiles(marketIdentifiers) {
  const profiles = {};
  
  for (const identifier of marketIdentifiers) {
    const profile = getMarketProfile(identifier);
    if (profile) {
      profiles[identifier] = profile;
    }
  }
  
  return profiles;
}

module.exports = {
  marketProfiles,
  getMarketProfile,
  getAvailableMarkets,
  getMarketProfiles
};