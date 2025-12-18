/**
 * Redis Service
 * Provides a consistent Redis interface with graceful degradation
 * Supports embedded Redis, ElastiCache, and no-Redis modes
 */

const { getRedisClient, redisHealthCheck, getRedisInfo } = require('./redisConnectionFactory');
const { createLogger } = require('../utils/logger');

class RedisService {
    constructor() {
        this.logger = createLogger('RedisService');
        this.mode = process.env.REDIS_MODE || 'embedded';
        this.client = null;
        this.fallbackStorage = new Map(); // In-memory fallback for 'none' mode
        this.initialized = false;
        
        this.logger.info(`Redis Service initialized in '${this.mode}' mode`);
    }

    /**
     * Initialize Redis service
     */
    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            this.client = await getRedisClient();
            this.initialized = true;
            
            if (this.client) {
                this.logger.info(`Redis Service ready in '${this.mode}' mode`);
            } else {
                this.logger.warn(`Redis Service operating in fallback mode (mode: ${this.mode})`);
            }
        } catch (error) {
            this.logger.error('Failed to initialize Redis Service', {
                error: error.message,
                mode: this.mode
            });
            this.initialized = true; // Mark as initialized to prevent retry loops
        }
    }

    /**
     * Set a key-value pair with optional TTL
     * @param {string} key - Redis key
     * @param {string|Object} value - Value to store
     * @param {number} ttl - Time to live in seconds (optional)
     */
    async set(key, value, ttl = null) {
        await this.initialize();

        const serializedValue = typeof value === 'object' ? JSON.stringify(value) : value;

        if (this.client) {
            try {
                if (ttl) {
                    await this.client.setex(key, ttl, serializedValue);
                } else {
                    await this.client.set(key, serializedValue);
                }
                
                this.logger.debug(`Redis SET successful`, { key, ttl, mode: this.mode });
                return true;
            } catch (error) {
                this.logger.error(`Redis SET failed, using fallback`, {
                    key,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackSet(key, serializedValue, ttl);
            }
        } else {
            return this._fallbackSet(key, serializedValue, ttl);
        }
    }

    /**
     * Get a value by key
     * @param {string} key - Redis key
     * @returns {string|Object|null} - Retrieved value or null if not found
     */
    async get(key) {
        await this.initialize();

        if (this.client) {
            try {
                const value = await this.client.get(key);
                this.logger.debug(`Redis GET successful`, { key, found: !!value, mode: this.mode });
                return this._deserializeValue(value);
            } catch (error) {
                this.logger.error(`Redis GET failed, using fallback`, {
                    key,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackGet(key);
            }
        } else {
            return this._fallbackGet(key);
        }
    }

    /**
     * Delete a key
     * @param {string} key - Redis key to delete
     */
    async del(key) {
        await this.initialize();

        if (this.client) {
            try {
                const result = await this.client.del(key);
                this.logger.debug(`Redis DEL successful`, { key, deleted: result, mode: this.mode });
                return result;
            } catch (error) {
                this.logger.error(`Redis DEL failed, using fallback`, {
                    key,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackDel(key);
            }
        } else {
            return this._fallbackDel(key);
        }
    }

    /**
     * Check if a key exists
     * @param {string} key - Redis key
     */
    async exists(key) {
        await this.initialize();

        if (this.client) {
            try {
                const result = await this.client.exists(key);
                this.logger.debug(`Redis EXISTS successful`, { key, exists: !!result, mode: this.mode });
                return !!result;
            } catch (error) {
                this.logger.error(`Redis EXISTS failed, using fallback`, {
                    key,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackExists(key);
            }
        } else {
            return this._fallbackExists(key);
        }
    }

    /**
     * Set expiration time for a key
     * @param {string} key - Redis key
     * @param {number} seconds - Expiration time in seconds
     */
    async expire(key, seconds) {
        await this.initialize();

        if (this.client) {
            try {
                const result = await this.client.expire(key, seconds);
                this.logger.debug(`Redis EXPIRE successful`, { key, seconds, set: !!result, mode: this.mode });
                return !!result;
            } catch (error) {
                this.logger.error(`Redis EXPIRE failed, using fallback`, {
                    key,
                    seconds,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackExpire(key, seconds);
            }
        } else {
            return this._fallbackExpire(key, seconds);
        }
    }

    /**
     * Get multiple keys
     * @param {string[]} keys - Array of Redis keys
     */
    async mget(keys) {
        await this.initialize();

        if (this.client) {
            try {
                const values = await this.client.mget(...keys);
                this.logger.debug(`Redis MGET successful`, { keyCount: keys.length, mode: this.mode });
                return values.map(value => this._deserializeValue(value));
            } catch (error) {
                this.logger.error(`Redis MGET failed, using fallback`, {
                    keyCount: keys.length,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackMget(keys);
            }
        } else {
            return this._fallbackMget(keys);
        }
    }

    /**
     * Increment a numeric value
     * @param {string} key - Redis key
     * @param {number} increment - Amount to increment (default: 1)
     */
    async incr(key, increment = 1) {
        await this.initialize();

        if (this.client) {
            try {
                const result = increment === 1 ? 
                    await this.client.incr(key) : 
                    await this.client.incrby(key, increment);
                
                this.logger.debug(`Redis INCR successful`, { key, increment, result, mode: this.mode });
                return result;
            } catch (error) {
                this.logger.error(`Redis INCR failed, using fallback`, {
                    key,
                    increment,
                    error: error.message,
                    mode: this.mode
                });
                return this._fallbackIncr(key, increment);
            }
        } else {
            return this._fallbackIncr(key, increment);
        }
    }

    // Fallback methods for when Redis is unavailable
    _fallbackSet(key, value, ttl) {
        this.fallbackStorage.set(key, {
            value,
            expires: ttl ? Date.now() + (ttl * 1000) : null
        });
        
        if (ttl) {
            setTimeout(() => {
                this.fallbackStorage.delete(key);
            }, ttl * 1000);
        }
        
        this.logger.debug(`Fallback SET successful`, { key, ttl });
        return true;
    }

    _fallbackGet(key) {
        const item = this.fallbackStorage.get(key);
        if (!item) {
            return null;
        }
        
        if (item.expires && Date.now() > item.expires) {
            this.fallbackStorage.delete(key);
            return null;
        }
        
        this.logger.debug(`Fallback GET successful`, { key, found: true });
        return this._deserializeValue(item.value);
    }

    _fallbackDel(key) {
        const existed = this.fallbackStorage.has(key);
        this.fallbackStorage.delete(key);
        this.logger.debug(`Fallback DEL successful`, { key, deleted: existed });
        return existed ? 1 : 0;
    }

    _fallbackExists(key) {
        const item = this.fallbackStorage.get(key);
        if (!item) {
            return false;
        }
        
        if (item.expires && Date.now() > item.expires) {
            this.fallbackStorage.delete(key);
            return false;
        }
        
        return true;
    }

    _fallbackExpire(key, seconds) {
        const item = this.fallbackStorage.get(key);
        if (!item) {
            return false;
        }
        
        item.expires = Date.now() + (seconds * 1000);
        setTimeout(() => {
            this.fallbackStorage.delete(key);
        }, seconds * 1000);
        
        return true;
    }

    _fallbackMget(keys) {
        return keys.map(key => this._fallbackGet(key));
    }

    _fallbackIncr(key, increment) {
        const current = this._fallbackGet(key);
        const numValue = parseInt(current) || 0;
        const newValue = numValue + increment;
        this._fallbackSet(key, newValue.toString());
        return newValue;
    }

    _deserializeValue(value) {
        if (value === null || value === undefined) {
            return null;
        }
        
        try {
            return JSON.parse(value);
        } catch {
            return value; // Return as string if not valid JSON
        }
    }

    /**
     * Get service status and statistics
     */
    async getServiceStatus() {
        const healthCheck = await this.healthCheck();
        const info = await this.getInfo();
        
        return {
            mode: this.mode,
            initialized: this.initialized,
            health: healthCheck,
            info: info,
            fallback_storage_size: this.fallbackStorage.size,
            features: {
                caching: this.mode !== 'none',
                persistence: this.mode === 'elasticache',
                clustering: this.mode === 'elasticache',
                backup: this.mode === 'elasticache'
            }
        };
    }

    /**
     * Clear all data (use with caution)
     */
    async flushAll() {
        await this.initialize();

        if (this.client) {
            try {
                await this.client.flushall();
                this.logger.warn(`Redis FLUSHALL executed in '${this.mode}' mode`);
                return true;
            } catch (error) {
                this.logger.error(`Redis FLUSHALL failed`, {
                    error: error.message,
                    mode: this.mode
                });
                return false;
            }
        } else {
            this.fallbackStorage.clear();
            this.logger.warn(`Fallback storage cleared`);
            return true;
        }
    }
}

// Singleton instance
let serviceInstance = null;

/**
 * Get singleton Redis service instance
 */
function getRedisService() {
    if (!serviceInstance) {
        serviceInstance = new RedisService();
    }
    return serviceInstance;
}

module.exports = {
    RedisService,
    getRedisService
};