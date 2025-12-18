/**
 * Frontend Environment Configuration
 * This file is dynamically generated/updated based on deployment environment
 * DO NOT hardcode production URLs here - use environment variables instead
 * 
 * Configuration Priority (handled by frontend/js/config.js):
 * 1. Runtime ENV (injected by server.js during HTML serving)
 * 2. Build-time ENV (set during deployment)
 * 3. Auto-detect (based on hostname/port)
 * 4. Fallback (localhost:3001 for development)
 */

// For local development, this file can be empty or contain development defaults
// The frontend/server.js will inject proper environment variables at runtime
window.ENV = {
  // Use relative path for universal compatibility (cloud + local)
  // Works with same ALB in cloud, works with proxy in local dev
  API_BASE_URL: '/api/v1',
  NODE_ENV: 'development',
  DEBUG: 'false',
  CORS_MODE: 'cors'
};

console.log('🔧 Environment configuration loaded:', window.ENV);
console.log('📝 Note: This configuration will be overridden by server.js runtime injection');