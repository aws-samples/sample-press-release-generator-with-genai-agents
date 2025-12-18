/**
 * Shared Components Library - Phase 2
 * 
 * Exports all shared components for use by Traditional and Strands APIs.
 * 
 * COMPONENTS:
 * - UnifiedParameterHandler: Canonical parameter format management
 * - UnifiedOutputGenerator: Dual output generation (narrative + pitch)
 * - StorageAdapter: Unified storage interface (FileSystem/S3)
 * - LineageTracker: Centralized lineage tracking
 * 
 * @module shared
 * @version 1.0.0
 * @since Phase 2
 */

const UnifiedParameterHandler = require('./parameters/UnifiedParameterHandler');
const UnifiedOutputGenerator = require('./output/UnifiedOutputGenerator');
const StorageAdapter = require('./storage/StorageAdapter');
const LineageTracker = require('./lineage/LineageTracker');

module.exports = {
  UnifiedParameterHandler,
  UnifiedOutputGenerator,
  StorageAdapter,
  LineageTracker
};