/**
 * Redis Connection Factory
 * Provides deployment-time choice between embedded Redis, ElastiCache, and no Redis
 * 
 * Supports three modes:
 * - 'none': No Redis functionality (graceful degradation)
 * - 'embedded': Redis running in the same container
 * - 'elasticache': AWS ElastiCache managed Redis
 */

const Redis = require('ioredis');
const { createLogger } = require('../utils/logger');

class RedisConnectionFactory {
    constructor() {
        this.logger = createLogger('RedisConnectionFactory');
        this.client = null;
        this.mode = process.env.REDIS_MODE || 'embedded';
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 3;
        this.retryDelay = parseInt(process.env.REDIS_RETRY_DELAY) || 1000;
        
        this.logger.info(`Redis Connection Factory initialized in '${this.mode}' mode`);
    }

    /**
     * Get Redis client instance based on deployment mode
     * @returns {Object|null} Redis client or null if disabled
     */
    async getClient() {
        if (this.mode === 'none') {
            this.logger.debug('Redis mode is "none" - returning null client');
            return null;
        }

        if (this.client && this.isConnected) {
            return this.client;
        }

        return await this._createConnection();
    }

    /**
     * Create Redis connection based on mode
     * @private
     */
    async _createConnection() {
        const config = this._getConnectionConfig();
        
        if (!config) {
            this.logger.warn('No Redis configuration available - operating without Redis');
            return null;
        }

        try {
            this.logger.info(`Attempting to connect to Redis in '${this.mode}' mode`, {
                host: config.host,
                port: config.port,
                tls: config.tls || false
            });

            this.client = new Redis(config);
            
            // Set up event handlers
            this._setupEventHandlers();
            
            // Test connection
            await this._testConnection();
            
            this.isConnected = true;
            this.connectionAttempts = 0;
            
            this.logger.info(`Successfully connected to Redis in '${this.mode}' mode`);
            return this.client;
            
        } catch (error) {
            this.connectionAttempts++;
            this.logger.error(`Failed to connect to Redis (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`, {
                error: error.message,
                mode: this.mode,
                config: { ...config, password: config.password ? '[REDACTED]' : undefined }
            });

            if (this.connectionAttempts < this.maxConnectionAttempts) {
                this.logger.info(`Retrying Redis connection in ${this.retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return await this._createConnection();
            }

            this.logger.warn('Max Redis connection attempts reached - operating without Redis');
            return null;
        }
    }

    /**
     * Get connection configuration based on mode
     * @private
     */
    _getConnectionConfig() {
        const baseConfig = {
            connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 5000,
            commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT) || 3000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 3,
            lazyConnect: true,
            keepAlive: 30000,
            family: 4, // IPv4
        };

        switch (this.mode) {
            case 'elasticache':
                return {
                    ...baseConfig,
                    host: process.env.REDIS_HOST,
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    password: process.env.REDIS_AUTH_TOKEN || undefined,
                    tls: process.env.REDIS_TLS_ENABLED === 'true' ? {
                        servername: process.env.REDIS_HOST
                    } : undefined,
                    // ElastiCache specific optimizations
                    enableReadyCheck: true,
                    maxRetriesPerRequest: 3,
                    retryDelayOnFailover: 100,
                    enableOfflineQueue: false,
                    // Connection pool settings for ElastiCache
                    db: 0,
                    keyPrefix: `${process.env.NODE_ENV || 'development'}:`,
                };

            case 'embedded':
                return {
                    ...baseConfig,
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT) || 6379,
                    // Embedded Redis optimizations
                    enableReadyCheck: false, // Faster startup for embedded
                    maxRetriesPerRequest: 2,  // Fewer retries for local connection
                    connectTimeout: 2000,     // Shorter timeout for local connection
                    commandTimeout: 1000,     // Shorter command timeout for local
                    db: 0,
                    keyPrefix: `${process.env.NODE_ENV || 'development'}:`,
                };

            case 'none':
            default:
                return null;
        }
    }

    /**
     * Set up Redis event handlers
     * @private
     */
    _setupEventHandlers() {
        if (!this.client) return;

        this.client.on('connect', () => {
            this.logger.info(`Redis connected in '${this.mode}' mode`);
            this.isConnected = true;
        });

        this.client.on('ready', () => {
            this.logger.info(`Redis ready for commands in '${this.mode}' mode`);
        });

        this.client.on('error', (error) => {
            this.logger.error(`Redis error in '${this.mode}' mode`, {
                error: error.message,
                code: error.code
            });
            this.isConnected = false;
        });

        this.client.on('close', () => {
            this.logger.warn(`Redis connection closed in '${this.mode}' mode`);
            this.isConnected = false;
        });

        this.client.on('reconnecting', (delay) => {
            this.logger.info(`Redis reconnecting in ${delay}ms (mode: ${this.mode})`);
        });

        this.client.on('end', () => {
            this.logger.info(`Redis connection ended in '${this.mode}' mode`);
            this.isConnected = false;
        });
    }

    /**
     * Test Redis connection
     * @private
     */
    async _testConnection() {
        if (!this.client) return false;

        try {
            const result = await this.client.ping();
            if (result === 'PONG') {
                this.logger.debug(`Redis ping successful in '${this.mode}' mode`);
                return true;
            }
            throw new Error(`Unexpected ping response: ${result}`);
        } catch (error) {
            this.logger.error(`Redis ping failed in '${this.mode}' mode`, {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            mode: this.mode,
            connected: this.isConnected,
            client: this.client ? 'initialized' : 'null',
            connectionAttempts: this.connectionAttempts,
            maxAttempts: this.maxConnectionAttempts
        };
    }

    /**
     * Gracefully close Redis connection
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            try {
                await this.client.quit();
                this.logger.info(`Redis connection closed gracefully in '${this.mode}' mode`);
            } catch (error) {
                this.logger.error(`Error closing Redis connection in '${this.mode}' mode`, {
                    error: error.message
                });
            }
        }
        
        this.client = null;
        this.isConnected = false;
    }

    /**
     * Health check for Redis connection
     */
    async healthCheck() {
        if (this.mode === 'none') {
            return {
                status: 'disabled',
                mode: 'none',
                message: 'Redis is disabled'
            };
        }

        if (!this.client || !this.isConnected) {
            return {
                status: 'disconnected',
                mode: this.mode,
                message: 'Redis client not connected'
            };
        }

        try {
            const start = Date.now();
            await this.client.ping();
            const responseTime = Date.now() - start;
            
            return {
                status: 'healthy',
                mode: this.mode,
                responseTime: `${responseTime}ms`,
                message: 'Redis connection healthy'
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                mode: this.mode,
                error: error.message,
                message: 'Redis ping failed'
            };
        }
    }

    /**
     * Get Redis info (for monitoring and debugging)
     */
    async getInfo() {
        if (this.mode === 'none' || !this.client || !this.isConnected) {
            return null;
        }

        try {
            const info = await this.client.info();
            const memory = await this.client.info('memory');
            const stats = await this.client.info('stats');
            
            return {
                mode: this.mode,
                server_info: this._parseRedisInfo(info),
                memory_info: this._parseRedisInfo(memory),
                stats_info: this._parseRedisInfo(stats),
                connection_status: this.getStatus()
            };
        } catch (error) {
            this.logger.error(`Failed to get Redis info in '${this.mode}' mode`, {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Parse Redis INFO command output
     * @private
     */
    _parseRedisInfo(infoString) {
        const info = {};
        const lines = infoString.split('\r\n');
        
        for (const line of lines) {
            if (line && !line.startsWith('#') && line.includes(':')) {
                const [key, value] = line.split(':');
                info[key] = value;
            }
        }
        
        return info;
    }
}

// Singleton instance
let instance = null;

/**
 * Get singleton Redis connection factory instance
 */
function getRedisConnectionFactory() {
    if (!instance) {
        instance = new RedisConnectionFactory();
    }
    return instance;
}

/**
 * Get Redis client (convenience method)
 */
async function getRedisClient() {
    const factory = getRedisConnectionFactory();
    return await factory.getClient();
}

/**
 * Redis health check (convenience method)
 */
async function redisHealthCheck() {
    const factory = getRedisConnectionFactory();
    return await factory.healthCheck();
}

/**
 * Get Redis info (convenience method)
 */
async function getRedisInfo() {
    const factory = getRedisConnectionFactory();
    return await factory.getInfo();
}

module.exports = {
    RedisConnectionFactory,
    getRedisConnectionFactory,
    getRedisClient,
    redisHealthCheck,
    getRedisInfo
};