const redis = require('redis');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const moment = require('moment');

/**
 * Redis Cache Service - Singleton implementation to prevent multiple connection attempts
 * Implements TTL policies and cache invalidation strategies
 */
class RedisService {
  constructor() {
    if (RedisService.instance) {
      return RedisService.instance;
    }

    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 1; // Reduced to 1 for fail-fast behavior
    this.initializationPromise = null;
    
    // Cache key patterns
    this.keyPatterns = {
      marketData: (marketCode, dataType) => `market:${marketCode}:${dataType}`,
      marketSummary: (marketCode) => `summary:${marketCode}`,
      aggregated: (type) => `agg:${type}`,
      trending: (marketCode, timeframe) => `trend:${marketCode}:${timeframe}`,
      lastCollection: 'meta:last_collection',
      dataQuality: (marketCode, dataType) => `quality:${marketCode}:${dataType}`,
      jobStatus: (jobId) => `job:${jobId}:status`
    };

    RedisService.instance = this;
  }

  /**
   * Initialize Redis connection with fail-fast behavior
   */
  async initialize() {
    // Return existing initialization promise if already in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Return immediately if already connected
    if (this.isConnected) {
      return Promise.resolve();
    }

    // Create initialization promise to prevent multiple concurrent attempts
    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  async _performInitialization() {
    try {
      logger.info('Attempting Redis connection (single attempt)...');
      
      // Create Redis client with minimal retry configuration
      const clientConfig = {
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: 5000, // 5 second timeout
          reconnectStrategy: false // Disable automatic reconnection
        },
        password: config.redis.password || undefined,
        database: 0
      };

      this.client = redis.createClient(clientConfig);

      // Set up event handlers
      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.connectionAttempts = 0;
        logger.info('Redis client ready - caching enabled');
      });

      this.client.on('error', (error) => {
        this.isConnected = false;
        logger.warn('Redis client error (continuing without cache):', error.message);
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.info('Redis client connection ended');
      });

      // Single connection attempt with timeout
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
        )
      ]);
      
      // Test the connection
      await this.client.ping();
      
      logger.info('RedisService initialized successfully');
    } catch (error) {
      this.connectionAttempts++;
      logger.warn('Redis connection failed - continuing without caching:', error.message);
      
      // Clean up failed client
      if (this.client) {
        try {
          await this.client.quit();
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        this.client = null;
      }
      
      this.isConnected = false;
      // Don't throw error - allow service to continue without Redis
    }
  }

  /**
   * Check if Redis is connected
   */
  isReady() {
    return this.isConnected && this.client && this.client.isReady;
  }

  /**
   * Set market data with appropriate TTL
   */
  async setMarketData(marketCode, dataType, data, customTtl = null) {
    if (!this.isReady()) {
      logger.debug('Redis not ready, skipping cache set');
      return false;
    }

    try {
      const key = this.keyPatterns.marketData(marketCode, dataType);
      const ttl = customTtl || this._getTtlForDataType(dataType);
      
      const cacheData = {
        data,
        cachedAt: moment().toISOString(),
        expiresAt: moment().add(ttl, 'seconds').toISOString(),
        dataType,
        marketCode
      };

      await this.client.setEx(key, ttl, JSON.stringify(cacheData));
      
      logger.debug(`Cached market data: ${key} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`Error setting market data cache for ${marketCode}:${dataType}:`, error);
      return false;
    }
  }

  /**
   * Get market data from cache
   */
  async getMarketData(marketCode, dataType) {
    if (!this.isReady()) {
      logger.debug('Redis not ready, skipping cache get');
      return null;
    }

    try {
      const key = this.keyPatterns.marketData(marketCode, dataType);
      const cachedData = await this.client.get(key);
      
      if (!cachedData) {
        logger.debug(`Cache miss for: ${key}`);
        return null;
      }

      const parsed = JSON.parse(cachedData);
      
      // Check if data is still valid (additional validation beyond TTL)
      if (moment().isAfter(moment(parsed.expiresAt))) {
        logger.debug(`Cache expired for: ${key}`);
        await this.client.del(key);
        return null;
      }

      logger.debug(`Cache hit for: ${key}`);
      return parsed.data;
    } catch (error) {
      logger.error(`Error getting market data cache for ${marketCode}:${dataType}:`, error);
      return null;
    }
  }

  /**
   * Set market summary data
   */
  async setMarketSummary(marketCode, summaryData) {
    if (!this.isReady()) {
      logger.debug('Redis not ready, skipping summary cache set');
      return false;
    }

    try {
      const key = this.keyPatterns.marketSummary(marketCode);
      const ttl = config.redis.ttl.default;
      
      const cacheData = {
        summary: summaryData,
        cachedAt: moment().toISOString(),
        marketCode
      };

      await this.client.setEx(key, ttl, JSON.stringify(cacheData));
      logger.debug(`Cached market summary: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Error setting market summary cache for ${marketCode}:`, error);
      return false;
    }
  }

  /**
   * Get market summary from cache
   */
  async getMarketSummary(marketCode) {
    if (!this.isReady()) {
      return null;
    }

    try {
      const key = this.keyPatterns.marketSummary(marketCode);
      const cachedData = await this.client.get(key);
      
      if (!cachedData) {
        return null;
      }

      const parsed = JSON.parse(cachedData);
      return parsed.summary;
    } catch (error) {
      logger.error(`Error getting market summary cache for ${marketCode}:`, error);
      return null;
    }
  }

  /**
   * Set data quality score
   */
  async setDataQuality(marketCode, dataType, qualityData) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const key = this.keyPatterns.dataQuality(marketCode, dataType);
      const ttl = config.redis.ttl.default;
      
      await this.client.setEx(key, ttl, JSON.stringify({
        ...qualityData,
        assessedAt: moment().toISOString()
      }));
      
      return true;
    } catch (error) {
      logger.error(`Error setting data quality cache:`, error);
      return false;
    }
  }

  /**
   * Get data quality score
   */
  async getDataQuality(marketCode, dataType) {
    if (!this.isReady()) {
      return null;
    }

    try {
      const key = this.keyPatterns.dataQuality(marketCode, dataType);
      const cachedData = await this.client.get(key);
      
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      logger.error(`Error getting data quality cache:`, error);
      return null;
    }
  }

  /**
   * Set job status
   */
  async setJobStatus(jobId, status) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const key = this.keyPatterns.jobStatus(jobId);
      const ttl = 86400; // 24 hours for job status
      
      await this.client.setEx(key, ttl, JSON.stringify({
        ...status,
        updatedAt: moment().toISOString()
      }));
      
      return true;
    } catch (error) {
      logger.error(`Error setting job status cache:`, error);
      return false;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    if (!this.isReady()) {
      return null;
    }

    try {
      const key = this.keyPatterns.jobStatus(jobId);
      const cachedData = await this.client.get(key);
      
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      logger.error(`Error getting job status cache:`, error);
      return null;
    }
  }

  /**
   * Set last collection timestamp
   */
  async setLastCollectionTime(timestamp = null) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const time = timestamp || moment().toISOString();
      await this.client.set(this.keyPatterns.lastCollection, time);
      return true;
    } catch (error) {
      logger.error('Error setting last collection time:', error);
      return false;
    }
  }

  /**
   * Get last collection timestamp
   */
  async getLastCollectionTime() {
    if (!this.isReady()) {
      return null;
    }

    try {
      return await this.client.get(this.keyPatterns.lastCollection);
    } catch (error) {
      logger.error('Error getting last collection time:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a specific market
   */
  async invalidateMarketCache(marketCode) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const patterns = [
        this.keyPatterns.marketData(marketCode, '*'),
        this.keyPatterns.marketSummary(marketCode),
        this.keyPatterns.dataQuality(marketCode, '*')
      ];

      let deletedCount = 0;
      
      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          await this.client.del(keys);
          deletedCount += keys.length;
        }
      }

      logger.info(`Invalidated ${deletedCount} cache entries for market ${marketCode}`);
      return true;
    } catch (error) {
      logger.error(`Error invalidating cache for market ${marketCode}:`, error);
      return false;
    }
  }

  /**
   * Invalidate cache for a specific data type across all markets
   */
  async invalidateDataTypeCache(dataType) {
    if (!this.isReady()) {
      return false;
    }

    try {
      const pattern = this.keyPatterns.marketData('*', dataType);
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info(`Invalidated ${keys.length} cache entries for data type ${dataType}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error invalidating cache for data type ${dataType}:`, error);
      return false;
    }
  }

  /**
   * Clear all cache
   */
  async clearAllCache() {
    if (!this.isReady()) {
      return false;
    }

    try {
      await this.client.flushDb();
      logger.info('Cleared all cache data');
      return true;
    } catch (error) {
      logger.error('Error clearing all cache:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    if (!this.isReady()) {
      return null;
    }

    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      // Count keys by pattern
      const marketDataKeys = await this.client.keys('market:*');
      const summaryKeys = await this.client.keys('summary:*');
      const qualityKeys = await this.client.keys('quality:*');
      
      return {
        connected: this.isConnected,
        memory: this._parseRedisInfo(info),
        keyspace: this._parseRedisInfo(keyspace),
        keyCounts: {
          marketData: marketDataKeys.length,
          summaries: summaryKeys.length,
          quality: qualityKeys.length,
          total: marketDataKeys.length + summaryKeys.length + qualityKeys.length
        },
        lastUpdated: moment().toISOString()
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return null;
    }
  }

  /**
   * Get service status
   */
  async getStatus() {
    return {
      connected: this.isConnected,
      ready: this.isReady(),
      connectionAttempts: this.connectionAttempts,
      config: {
        host: config.redis.host,
        port: config.redis.port,
        ttl: config.redis.ttl
      }
    };
  }

  /**
   * Get TTL for specific data type
   */
  _getTtlForDataType(dataType) {
    return config.redis.ttl[dataType] || config.redis.ttl.default;
  }

  /**
   * Parse Redis INFO command output
   */
  _parseRedisInfo(infoString) {
    const info = {};
    const lines = infoString.split('\r\n');
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        info[key] = value;
      }
    }
    
    return info;
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis connection closed');
      } catch (error) {
        logger.error('Error closing Redis connection:', error);
      }
    }
  }
}

// Create and export singleton instance
const redisService = new RedisService();

module.exports = { RedisService, redisService };