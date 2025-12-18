// Core services for the Press Release Generation System
// Phase 1, Phase 2, and Phase 3A services

const bedrockService = require('./bedrock');
const firecrawlService = require('./firecrawl');
const s3Service = require('./s3');
const dynamoService = require('./dynamo');

// Phase 2A: Core Data Infrastructure Services
const marketDataService = require('./marketData');
const { RedisService } = require('./redis');
const { DataProcessorService } = require('./dataProcessor');

// Phase 1: Enhanced Search Intelligence System
const perplexityService = require('./perplexityService');
const tavilyService = require('./tavilyService');

// Phase 3A: GenAI Agent Architecture
const genaiOrchestrator = require('./genaiOrchestrator');
const BaseAgent = require('./agents/baseAgent');
const ContentAnalyzerAgent = require('./agents/contentAnalyzer');
const MarketResearcherAgent = require('./agents/marketResearcher');

// Phase 3B: Localization & Validation Engine
const LocalizationEngine = require('./agents/localizationEngine');
const QualityValidator = require('./agents/qualityValidator');
const FactChecker = require('./factChecker');

// Phase 3C: Output Formatting
const OutputFormatter = require('./agents/outputFormatter');

// Phase 4: Data Lineage Infrastructure
const DataLineageService = require('./dataLineageService');

module.exports = {
  // Phase 1 & 2 Services
  bedrockService,
  firecrawlService,
  s3Service,
  dynamoService,
  marketDataService,
  RedisService,
  DataProcessorService,
  
  // Phase 1: Enhanced Search Intelligence
  perplexityService,
  tavilyService,
  
  // Phase 3A Services
  genaiOrchestrator,
  BaseAgent,
  ContentAnalyzerAgent,
  MarketResearcherAgent,
  
  // Phase 3B Services
  LocalizationEngine,
  QualityValidator,
  FactChecker,
  
  // Phase 3C Services
  OutputFormatter,
  
  // Phase 4 Services
  DataLineageService,
};