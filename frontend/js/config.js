/**
 * Frontend Configuration Management
 * Supports multiple configuration sources with fallbacks
 */
class Config {
  constructor() {
    this.config = this.loadConfig();
    this.logConfiguration();
  }

  loadConfig() {
    // Priority order: Runtime ENV > Build-time ENV > Auto-detect > Defaults
    return {
      apiBaseUrl: this.getApiBaseUrl(),
      environment: window.ENV?.NODE_ENV || process.env.NODE_ENV || 'development',
      enableDebug: window.ENV?.DEBUG === 'true' || false,
      corsMode: window.ENV?.CORS_MODE || 'cors'
    };
  }

  getApiBaseUrl() {
    // 1. Runtime environment (injected by deployment)
    if (window.ENV?.API_BASE_URL) {
      console.log('🔧 Config: Using runtime API_BASE_URL:', window.ENV.API_BASE_URL);
      return window.ENV.API_BASE_URL;
    }
    
    // 2. Build-time environment variable
    if (typeof process !== 'undefined' && process.env?.API_BASE_URL) {
      console.log('🔧 Config: Using build-time API_BASE_URL:', process.env.API_BASE_URL);
      return process.env.API_BASE_URL;
    }
    
    // 3. Auto-detect based on current location
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      const port = window.location.port;
      
      // Production detection (not localhost)
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        // For production deployments, assume API is on same domain with /api path
        const apiUrl = `${protocol}//${hostname}/api/v1`;
        console.log('🔧 Config: Auto-detected production API URL:', apiUrl);
        return apiUrl;
      }
      
      // Development detection with port handling
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Check if we're running on a different port than 3000
        if (port && port !== '3000') {
          // Assume API is on port 3001 if frontend is on different port
          const apiUrl = `${protocol}//${hostname}:3001/api/v1`;
          console.log('🔧 Config: Auto-detected development API URL:', apiUrl);
          return apiUrl;
        }
      }
    }
    
    // 4. Intelligent fallback - use relative path for universal compatibility
    let fallbackUrl;
    if (window.ENV?.BACKEND_URL) {
      fallbackUrl = `${window.ENV.BACKEND_URL}/api/v1`;
      console.log('🔧 Config: Using ENV BACKEND_URL fallback:', fallbackUrl);
    } else if (typeof window !== 'undefined' && window.location) {
      // Use relative path - works for both cloud (same ALB) and local (with proxy)
      fallbackUrl = '/api/v1';
      console.log('🔧 Config: Using relative path fallback:', fallbackUrl);
    } else {
      fallbackUrl = '/api/v1';
      console.log('🔧 Config: Using relative path fallback (last resort):', fallbackUrl);
    }
    return fallbackUrl;
  }

  logConfiguration() {
    if (this.config.enableDebug) {
      console.log('🔧 Frontend Configuration:', {
        apiBaseUrl: this.config.apiBaseUrl,
        environment: this.config.environment,
        corsMode: this.config.corsMode,
        enableDebug: this.config.enableDebug,
        windowENV: window.ENV,
        location: typeof window !== 'undefined' ? {
          protocol: window.location.protocol,
          hostname: window.location.hostname,
          port: window.location.port,
          pathname: window.location.pathname
        } : 'not available'
      });
    }
  }

  get(key) {
    return this.config[key];
  }

  // Helper method to check if we're in development
  isDevelopment() {
    return this.config.environment === 'development';
  }

  // Helper method to check if we're in production
  isProduction() {
    return this.config.environment === 'production';
  }

  // Helper method to get full API URL for an endpoint
  getApiUrl(endpoint) {
    const baseUrl = this.config.apiBaseUrl;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  }
}

// Export singleton instance
window.AppConfig = new Config();

// Also export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.AppConfig;
}