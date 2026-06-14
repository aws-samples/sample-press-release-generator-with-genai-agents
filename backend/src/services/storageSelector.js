/**
 * Storage Selector - Centralized storage backend selection
 * 
 * This module provides a single source of truth for storage backend selection
 * based on the STORAGE_TYPE environment variable. It ensures consistent
 * storage behavior across all services.
 * 
 * Usage:
 *   const storage = require('./storageSelector');
 *   await storage.putJSON(key, data);
 *   const data = await storage.getJSON(key);
 * 
 * "Environment Variables":
 *   STORAGE_TYPE=local  -> Uses FileSystemStorageService (backend/storage/)
 *   STORAGE_TYPE=cloud  -> Uses S3StorageService (AWS S3 bucket)
 */

const S3StorageService = require('./s3StorageService');
const FileSystemStorageService = require('./fileSystemStorageService');

/**
 * Get the appropriate storage service based on environment configuration
 * @returns {S3StorageService|FileSystemStorageService} Storage service instance
 */
function getStorageService() {
  const storageType = process.env.STORAGE_TYPE || 'local';
  
  if (storageType === 'local') {
    console.log('[StorageSelector] Using FileSystemStorageService for local development');
    return new FileSystemStorageService();
  } else {
    console.log('[StorageSelector] Using S3StorageService for cloud deployment');
    return S3StorageService.instance;
  }
}

// Export singleton instance based on environment
const storageInstance = getStorageService();

module.exports = storageInstance;
module.exports.getStorageService = getStorageService;