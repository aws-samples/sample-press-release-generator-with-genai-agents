const marketDataService = require('../services/marketData');
const { redisService } = require('../services/redis');
const { DataProcessorService } = require('../services/dataProcessor');
const { logger } = require('../utils/logger');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

/**
 * Market Data Controllers - API endpoints for market data collection and retrieval
 * Handles data collection triggers, market data retrieval, and status monitoring
 */
class MarketDataController {
  constructor() {
    this.marketDataService = marketDataService; // Use singleton instance
    this.redisService = redisService;
    this.dataProcessor = new DataProcessorService();
    this.isInitialized = false;
  }

  /**
   * Initialize the controller and its services
   */
  async initialize() {
    try {
      await this.marketDataService.initialize();
      await this.redisService.initialize();
      await this.dataProcessor.initialize();
      this.isInitialized = true;
      logger.info('MarketDataController initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize MarketDataController:', error);
      throw error;
    }
  }

  /**
   * Validation schemas for request data
   */
  static schemas = {
    collectMarketData: z.object({
      markets: z.array(z.string()).optional(),
      dataTypes: z.array(z.enum(['realEstate', 'economic', 'news', 'demographics'])).optional(),
      forceRefresh: z.boolean().optional().default(false),
      priority: z.enum(['high', 'normal']).optional().default('normal')
    }),
    
    marketCode: z.object({
      market: z.string().min(2).max(10)
    })
  };

  /**
   * POST /api/v1/market-data/collect
   * Trigger market data collection for specific markets
   */
  collectMarketData = async (req, res) => {
    try {
      // Validate request body
      const validatedData = MarketDataController.schemas.collectMarketData.parse(req.body);
      const { markets, dataTypes, forceRefresh, priority } = validatedData;

      logger.info('Market data collection requested', { markets, dataTypes, forceRefresh, priority });

      // If no markets specified, collect for all markets
      const targetMarkets = markets || this.marketDataService.getAllMarkets().map(m => m.code);
      
      // Validate that all specified markets exist
      const invalidMarkets = [];
      for (const marketCode of targetMarkets) {
        if (!this.marketDataService.getMarket(marketCode)) {
          invalidMarkets.push(marketCode);
        }
      }

      if (invalidMarkets.length > 0) {
        return res.status(400).json({
          error: 'Invalid markets specified',
          invalidMarkets,
          availableMarkets: this.marketDataService.getAllMarkets().map(m => ({
            code: m.code,
            name: m.name
          }))
        });
      }

      // Create job ID for tracking
      const jobId = uuidv4();
      const jobData = {
        jobId,
        type: markets ? 'specific_markets' : 'all_markets',
        status: 'queued',
        markets: targetMarkets,
        dataTypes: dataTypes || ['realEstate', 'economic', 'news', 'demographics'],
        options: { forceRefresh, priority },
        progress: {
          total: targetMarkets.length,
          completed: 0,
          failed: 0,
          currentMarket: null
        },
        results: {
          successful: [],
          failed: []
        },
        createdAt: moment().toISOString(),
        updatedAt: moment().toISOString()
      };

      // Cache job status
      await this.redisService.setJobStatus(jobId, jobData);

      // Start collection process asynchronously
      this._processDataCollection(jobData).catch(error => {
        logger.error('Error in background data collection:', error);
      });

      // Return immediate response
      res.status(202).json({
        jobId,
        status: 'queued',
        message: 'Data collection job queued successfully',
        estimatedDuration: Math.ceil(targetMarkets.length * 0.5), // Rough estimate in minutes
        markets: {
          total: targetMarkets.length,
          queued: targetMarkets
        },
        dataTypes: jobData.dataTypes,
        trackingUrl: `/api/v1/jobs/${jobId}`
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Error in collectMarketData:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to initiate data collection'
      });
    }
  };

  /**
   * POST /api/v1/market-data/collect-all
   * Trigger collection for all 100 markets
   */
  collectAllMarkets = async (req, res) => {
    try {
      const validatedData = MarketDataController.schemas.collectMarketData.parse(req.body);
      const { dataTypes, forceRefresh, priority } = validatedData;

      logger.info('Full market data collection requested', { dataTypes, forceRefresh, priority });

      // Get all markets
      const allMarkets = this.marketDataService.getAllMarkets().map(m => m.code);

      // Create job for all markets
      const jobId = uuidv4();
      const jobData = {
        jobId,
        type: 'full_refresh',
        status: 'queued',
        markets: allMarkets,
        dataTypes: dataTypes || ['realEstate', 'economic', 'news', 'demographics'],
        options: { forceRefresh, priority },
        progress: {
          total: allMarkets.length,
          completed: 0,
          failed: 0,
          currentMarket: null
        },
        results: {
          successful: [],
          failed: []
        },
        createdAt: moment().toISOString(),
        updatedAt: moment().toISOString()
      };

      // Cache job status
      await this.redisService.setJobStatus(jobId, jobData);

      // Start collection process asynchronously
      this._processDataCollection(jobData).catch(error => {
        logger.error('Error in background full collection:', error);
      });

      // Return immediate response
      res.status(202).json({
        jobId,
        status: 'queued',
        message: 'Full market data collection job queued successfully',
        estimatedDuration: Math.ceil(allMarkets.length * 0.5), // Rough estimate in minutes
        markets: {
          total: allMarkets.length,
          queued: allMarkets
        },
        dataTypes: jobData.dataTypes,
        trackingUrl: `/api/v1/jobs/${jobId}`
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Error in collectAllMarkets:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to initiate full market data collection'
      });
    }
  };

  /**
   * GET /api/v1/market-data/:market
   * Retrieve market data for specific market
   */
  getMarketData = async (req, res) => {
    try {
      const { market } = MarketDataController.schemas.marketCode.parse(req.params);
      const { dataTypes, includeMetadata = true } = req.query;

      // Validate market exists
      const marketInfo = this.marketDataService.getMarket(market);
      if (!marketInfo) {
        return res.status(404).json({
          error: 'Market not found',
          message: `Market '${market}' is not in our supported markets list`,
          availableMarkets: this.marketDataService.getAllMarkets().map(m => ({
            code: m.code,
            name: m.name
          }))
        });
      }

      // Parse requested data types
      const requestedTypes = dataTypes ? 
        dataTypes.split(',').filter(type => ['realEstate', 'economic', 'news', 'demographics'].includes(type)) :
        ['realEstate', 'economic', 'news', 'demographics'];

      // Collect data from cache/service
      const marketData = {
        market: marketInfo,
        data: {},
        metadata: {
          retrievedAt: moment().toISOString(),
          dataTypes: requestedTypes,
          cached: {}
        }
      };

      // Get data for each requested type
      for (const dataType of requestedTypes) {
        try {
          const data = await this.redisService.getMarketData(market, dataType);
          if (data) {
            marketData.data[dataType] = data;
            marketData.metadata.cached[dataType] = true;
          } else {
            marketData.data[dataType] = null;
            marketData.metadata.cached[dataType] = false;
          }
        } catch (error) {
          logger.warn(`Error retrieving ${dataType} data for ${market}:`, error);
          marketData.data[dataType] = null;
          marketData.metadata.cached[dataType] = false;
        }
      }

      // Check data freshness and quality
      const dataQuality = {};
      for (const dataType of requestedTypes) {
        if (marketData.data[dataType]) {
          try {
            const quality = await this.redisService.getDataQuality(market, dataType);
            if (quality) {
              dataQuality[dataType] = quality;
            }
          } catch (error) {
            logger.warn(`Error retrieving quality data for ${market}:${dataType}:`, error);
          }
        }
      }

      if (Object.keys(dataQuality).length > 0) {
        marketData.metadata.quality = dataQuality;
      }

      // Remove metadata if not requested
      if (!includeMetadata) {
        delete marketData.metadata;
      }

      res.status(200).json(marketData);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Error in getMarketData:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve market data'
      });
    }
  };

  /**
   * GET /api/v1/market-data
   * List all available market data
   */
  getAllMarketsData = async (req, res) => {
    try {
      const { region, includeData = false, dataTypes } = req.query;

      // Get markets (filtered by region if specified)
      let markets = this.marketDataService.getAllMarkets();
      if (region) {
        markets = this.marketDataService.getMarketsByRegion(region);
      }

      const response = {
        markets: markets.map(market => ({
          code: market.code,
          name: market.name,
          region: market.region,
          population: market.population
        })),
        metadata: {
          total: markets.length,
          regions: [...new Set(markets.map(m => m.region))],
          retrievedAt: moment().toISOString()
        }
      };

      // Include actual data if requested
      if (includeData === 'true') {
        const requestedTypes = dataTypes ? 
          dataTypes.split(',').filter(type => ['realEstate', 'economic', 'news', 'demographics'].includes(type)) :
          ['realEstate'];

        response.data = {};
        
        // Get cached data for each market
        for (const market of markets.slice(0, 10)) { // Limit to first 10 for performance
          try {
            const marketData = {};
            for (const dataType of requestedTypes) {
              const data = await this.redisService.getMarketData(market.code, dataType);
              if (data) {
                marketData[dataType] = data;
              }
            }
            if (Object.keys(marketData).length > 0) {
              response.data[market.code] = marketData;
            }
          } catch (error) {
            logger.warn(`Error retrieving data for market ${market.code}:`, error);
          }
        }

        if (markets.length > 10) {
          response.metadata.note = 'Data limited to first 10 markets for performance. Use specific market endpoints for complete data.';
        }
      }

      res.status(200).json(response);

    } catch (error) {
      logger.error('Error in getAllMarketsData:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve markets data'
      });
    }
  };

  /**
   * Background process for data collection
   */
  async _processDataCollection(jobData) {
    try {
      logger.info(`Starting background data collection for job ${jobData.jobId}`);
      
      // Update job status to running
      jobData.status = 'running';
      jobData.updatedAt = moment().toISOString();
      await this.redisService.setJobStatus(jobData.jobId, jobData);

      // Process markets in batches
      const batchSize = 5; // Process 5 markets at a time
      const markets = jobData.markets;
      
      for (let i = 0; i < markets.length; i += batchSize) {
        const batch = markets.slice(i, i + batchSize);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (marketCode) => {
          try {
            jobData.progress.currentMarket = marketCode;
            await this.redisService.setJobStatus(jobData.jobId, jobData);

            // Collect data for this market
            const marketData = await this.marketDataService.collectMarketData(marketCode, {
              dataTypes: jobData.dataTypes,
              forceRefresh: jobData.options.forceRefresh
            });

            jobData.results.successful.push({
              market: marketCode,
              dataTypes: Object.keys(marketData).filter(key => key !== '_metadata'),
              timestamp: moment().toISOString()
            });
            
            jobData.progress.completed++;
            
            logger.debug(`Successfully collected data for market ${marketCode} in job ${jobData.jobId}`);
            
          } catch (error) {
            jobData.results.failed.push({
              market: marketCode,
              error: error.message,
              timestamp: moment().toISOString()
            });
            
            jobData.progress.failed++;
            
            logger.error(`Failed to collect data for market ${marketCode} in job ${jobData.jobId}:`, error);
          }
        });

        // Wait for batch to complete
        await Promise.all(batchPromises);
        
        // Update job progress
        jobData.updatedAt = moment().toISOString();
        await this.redisService.setJobStatus(jobData.jobId, jobData);
        
        // Small delay between batches to avoid overwhelming external APIs
        if (i + batchSize < markets.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Mark job as completed
      jobData.status = 'completed';
      jobData.progress.currentMarket = null;
      jobData.completedAt = moment().toISOString();
      jobData.updatedAt = moment().toISOString();
      
      await this.redisService.setJobStatus(jobData.jobId, jobData);
      await this.redisService.setLastCollectionTime();

      logger.info(`Completed data collection job ${jobData.jobId}. Success: ${jobData.results.successful.length}, Failed: ${jobData.results.failed.length}`);

    } catch (error) {
      // Mark job as failed
      jobData.status = 'failed';
      jobData.error = error.message;
      jobData.failedAt = moment().toISOString();
      jobData.updatedAt = moment().toISOString();
      
      await this.redisService.setJobStatus(jobData.jobId, jobData);
      
      logger.error(`Data collection job ${jobData.jobId} failed:`, error);
    }
  }
}

module.exports = { MarketDataController };