/**
 * StorageAdapter
 * 
 * Unified storage interface abstracting FileSystem vs S3 storage for both
 * Traditional and Strands APIs.
 * 
 * CRITICAL FEATURES:
 * - Environment-aware storage selection (local FileSystem vs cloud S3)
 * - Consistent file naming across all APIs
 * - Atomic dual output saves (both succeed or both fail)
 * - Job-specific path conventions
 * 
 * INTEGRATION:
 * Wraps existing storageSelector.js which provides environment-aware
 * storage backend selection based on STORAGE_TYPE environment variable.
 * 
 * @module StorageAdapter
 * @version 1.0.0
 * @since Phase 2.3
 */

const UnifiedOutputGenerator = require('../output/UnifiedOutputGenerator');

/**
 * StorageAdapter Class
 * 
 * Provides unified storage operations with consistent path structure
 * and file naming conventions.
 */
class StorageAdapter {
  /**
   * Constructor
   * 
   * @param {Object} storageService - Storage service instance (FileSystem or S3)
   * @throws {Error} If storage service is missing
   */
  constructor(storageService) {
    if (!storageService) {
      throw new Error('Storage service is required for StorageAdapter');
    }
    
    this.storage = storageService;
  }

  /**
   * Save narrative file
   * 
   * Saves narrative/PR variant file with consistent naming pattern.
   * Path: job_{jobId}/Market_Name.json
   * 
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name
   * @param {Object} content - Narrative content
   * @returns {Promise<string>} Saved file path
   * @throws {Error} If jobId or market is missing
   * 
   * @example
   * const path = await adapter.saveNarrative('job_123', 'Los Angeles-Long Beach-Anaheim', content);
   * // Returns: 'job_123/Los_Angeles_Long_Beach_Anaheim.json'
   */
  async saveNarrative(jobId, market, content) {
    // Validate required parameters
    if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
      throw new Error('Job ID is required for saveNarrative');
    }
    if (!market || typeof market !== 'string' || market.trim() === '') {
      throw new Error('Market name is required for saveNarrative');
    }
    
    // Generate consistent file name
    const fileName = UnifiedOutputGenerator.generateFileName(market, 'json');
    const key = `${jobId}/${fileName}`;
    
    // Save to storage
    await this.storage.putJSON(key, content);
    
    return key;
  }

  /**
   * Save pitch file
   * 
   * Saves pitch email file with consistent naming pattern.
   * Path: job_{jobId}/Market_Name_pitch.json
   * 
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name
   * @param {Object} content - Pitch email content
   * @returns {Promise<string>} Saved file path
   * @throws {Error} If jobId or market is missing
   * 
   * @example
   * const path = await adapter.savePitch('job_123', 'Los Angeles-Long Beach-Anaheim', content);
   * // Returns: 'job_123/Los_Angeles_Long_Beach_Anaheim_pitch.json'
   */
  async savePitch(jobId, market, content) {
    // Validate required parameters
    if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
      throw new Error('Job ID is required for savePitch');
    }
    if (!market || typeof market !== 'string' || market.trim() === '') {
      throw new Error('Market name is required for savePitch');
    }
    
    // Generate consistent file name
    const fileName = UnifiedOutputGenerator.generateFileName(market, 'pitch');
    const key = `${jobId}/${fileName}`;
    
    // Save to storage
    await this.storage.putJSON(key, content);
    
    return key;
  }

  /**
   * Save dual output (narrative + pitch) atomically
   * 
   * CRITICAL: Atomic operation - both files succeed or both fail.
   * If pitch save fails, narrative is rolled back.
   * 
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name
   * @param {Object} outputs - { narrative: {}, pitch: {} }
   * @returns {Promise<Object>} { narrative: 'path', pitch: 'path' }
   * @throws {Error} If either content is missing or save fails
   * 
   * @example
   * const paths = await adapter.saveDualOutput('job_123', 'LAX', {
   *   narrative: { title: 'PR' },
   *   pitch: { subject: 'Email' }
   * });
   * // Returns: { narrative: 'job_123/LAX.json', pitch: 'job_123/LAX_pitch.json' }
   */
  async saveDualOutput(jobId, market, outputs) {
    // Validate both outputs are present
    if (!outputs || !outputs.narrative || !outputs.pitch) {
      throw new Error('Both narrative and pitch content required for saveDualOutput');
    }
    
    let narrativePath = null;
    
    try {
      // Step 1: Save narrative
      narrativePath = await this.saveNarrative(jobId, market, outputs.narrative);
      
      // Step 2: Save pitch
      const pitchPath = await this.savePitch(jobId, market, outputs.pitch);
      
      // Both succeeded
      return {
        narrative: narrativePath,
        pitch: pitchPath
      };
    } catch (error) {
      // Rollback narrative if pitch failed
      if (narrativePath) {
        try {
          await this.storage.delete(narrativePath);
        } catch (rollbackError) {
          // Log rollback failure but throw original error
          console.error('Failed to rollback narrative after pitch save failure:', rollbackError);
        }
      }
      
      // Re-throw original error
      throw error;
    }
  }

  /**
   * Retrieve narrative file
   * 
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name
   * @returns {Promise<Object|null>} Narrative content or null if not found
   * 
   * @example
   * const content = await adapter.retrieveNarrative('job_123', 'Los Angeles-Long Beach-Anaheim');
   */
  async retrieveNarrative(jobId, market) {
    const fileName = UnifiedOutputGenerator.generateFileName(market, 'json');
    const key = `${jobId}/${fileName}`;
    
    try {
      return await this.storage.getJSON(key);
    } catch (error) {
      // Return null if file not found
      if (error.message?.includes('not found') || error.message?.includes('NoSuchKey')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Retrieve pitch file
   * 
   * @param {string} jobId - Job identifier
   * @param {string} market - Market name
   * @returns {Promise<Object|null>} Pitch content or null if not found
   * 
   * @example
   * const content = await adapter.retrievePitch('job_123', 'Los Angeles-Long Beach-Anaheim');
   */
  async retrievePitch(jobId, market) {
    const fileName = UnifiedOutputGenerator.generateFileName(market, 'pitch');
    const key = `${jobId}/${fileName}`;
    
    try {
      return await this.storage.getJSON(key);
    } catch (error) {
      // Return null if file not found
      if (error.message?.includes('not found') || error.message?.includes('NoSuchKey')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all files for job
   * 
   * @param {string} jobId - Job identifier
   * @returns {Promise<Array>} List of file paths
   * 
   * @example
   * const files = await adapter.listJobOutputs('job_123');
   * // Returns: ['Los_Angeles_Long_Beach_Anaheim.json', 'Los_Angeles_Long_Beach_Anaheim_pitch.json', ...]
   */
  async listJobOutputs(jobId) {
    try {
      return await this.storage.list(`${jobId}/`);
    } catch (error) {
      // Return empty array if job directory doesn't exist
      if (error.message?.includes('not found') || error.message?.includes('NoSuchKey')) {
        return [];
      }
      throw error;
    }
  }
}

module.exports = StorageAdapter;