// Controllers for the Press Release Generation System
// Phase 3B: Content Generation Controllers

const healthController = require('./health');
const statusController = require('./status');
const contentGenerationController = require('./contentGeneration');

module.exports = {
  healthController,
  statusController,
  contentGenerationController,
};