/**
 * Real-Time Data Lineage Monitoring API Routes
 */
const express = require('express');
const router = express.Router();
const LineageMonitoringService = require('../services/lineageMonitoringService');

// Create singleton monitoring service instance
let monitoringService = null;

function getMonitoringService() {
  if (!monitoringService) {
    monitoringService = new LineageMonitoringService();
    
    // Set up event listeners for logging
    monitoringService.on('monitoring_started', (data) => {
      console.log('Monitoring started:', data);
    });
    
    monitoringService.on('monitoring_stopped', (data) => {
      console.log('Monitoring stopped:', data);
    });
    
    monitoringService.on('alert_generated', (alert) => {
      console.log(`ALERT GENERATED [${alert.severity}]: ${alert.title}`);
    });
    
    monitoringService.on('monitoring_error', (error) => {
      console.error('Monitoring error:', error);
    });
  }
  
  return monitoringService;
}

/**
 * POST /api/v1/lineage/monitoring/start
 * Start real-time monitoring
 */
router.post('/monitoring/start', async (req, res) => {
  try {
    const service = getMonitoringService();
    service.startMonitoring();
    
    res.json({
      success: true,
      message: 'Real-time monitoring started',
      stats: service.getMonitoringStats()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/lineage/monitoring/stop
 * Stop real-time monitoring
 */
router.post('/monitoring/stop', async (req, res) => {
  try {
    const service = getMonitoringService();
    service.stopMonitoring();
    
    res.json({
      success: true,
      message: 'Real-time monitoring stopped',
      stats: service.getMonitoringStats()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/lineage/monitoring/status
 * Get monitoring status and statistics
 */
router.get('/monitoring/status', async (req, res) => {
  try {
    const service = getMonitoringService();
    const stats = service.getMonitoringStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/lineage/monitoring/alerts
 * Get recent alerts
 */
router.get('/monitoring/alerts', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const service = getMonitoringService();
    const alerts = await service.getRecentAlerts(parseInt(limit));
    
    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/v1/lineage/monitoring/config
 * Update monitoring configuration
 */
router.put('/monitoring/config', async (req, res) => {
  try {
    const service = getMonitoringService();
    const newConfig = req.body;
    
    // Validate configuration
    if (newConfig.alertThresholds) {
      const thresholds = newConfig.alertThresholds;
      if (thresholds.utilizationRate && (thresholds.utilizationRate < 0 || thresholds.utilizationRate > 100)) {
        return res.status(400).json({
          success: false,
          error: 'Utilization rate threshold must be between 0 and 100'
        });
      }
    }
    
    service.updateConfig(newConfig);
    
    res.json({
      success: true,
      message: 'Monitoring configuration updated',
      config: service.getMonitoringStats().config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/lineage/monitoring/run-cycle
 * Manually trigger a monitoring cycle
 */
router.post('/monitoring/run-cycle', async (req, res) => {
  try {
    const service = getMonitoringService();
    
    // Run monitoring cycle in background
    service.runMonitoringCycle().catch(error => {
      console.error('Manual monitoring cycle error:', error);
    });
    
    res.json({
      success: true,
      message: 'Monitoring cycle triggered'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;