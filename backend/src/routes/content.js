/**
 * Content Retrieval Routes
 * Phase 2: S3 Storage Migration - Content Retrieval API
 * 
 * Provides REST API endpoints for retrieving generated content from S3:
 * - GET /narrative/:jobId/:market - Retrieve PR narrative
 * - GET /email/:jobId/:market - Retrieve pitch email (FIXES 404 ERROR)
 * - GET /job/:jobId/all - Retrieve all job content
 * - GET /download/:jobId/:market/:type - Generate presigned download URL
 * 
 * @module routes/content
 */

const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content');

/**
 * GET /api/v1/content/narrative/:jobId/:market
 * Retrieve PR narrative for a specific market
 * 
 * Query params:
 * - format: json (default), txt, html, docx, pdf
 * 
 * Response: 200 OK with content data
 * Error: 404 Not Found, 500 Server Error
 */
/**
 * GET /api/v1/content/jobs/:jobId
 * Get job status for tracking progress
 * 
 * ⭐ CRITICAL: This endpoint fixes the 404 error from frontend
 * Frontend polls: GET /api/v1/content/jobs/{jobId}
 * 
 * Response: 200 OK with job status data
 * Error: 404 Not Found (job doesn't exist), 500 Server Error
 */
router.get('/jobs/:jobId', (req, res) => {
  contentController.getJobStatus(req, res);
});

router.get('/narrative/:jobId/:market', (req, res) => {
  contentController.getNarrative(req, res);
});

/**
 * GET /api/v1/content/email/:jobId/:market
 * Retrieve pitch email for a specific market
 * 
 * ⭐ CRITICAL: This endpoint fixes the 404 error from frontend
 * Frontend calls: GET /api/v1/content/email/{jobId}/{market}
 * 
 * Query params:
 * - format: json (default), txt, html
 * 
 * Response: 200 OK with pitch email data
 * Error: 404 Not Found, 500 Server Error
 */
router.get('/email/:jobId/:market', (req, res) => {
  contentController.getPitchEmail(req, res);
});

/**
 * GET /api/v1/content/job/:jobId/all
 * Retrieve all content for a job (all markets, both narratives and pitches)
 * 
 * Response: 200 OK with array of market content
 * Error: 500 Server Error
 */
router.get('/job/:jobId/all', (req, res) => {
  contentController.getAllJobContent(req, res);
});

/**
 * GET /api/v1/content/download/:jobId/:market/:type
 * Generate presigned download URL for content
 * 
 * Path params:
 * - jobId: Job identifier
 * - market: Market name (LAX, NYC, or full name)
 * - type: Content type (narrative or pitch)
 * 
 * Query params:
 * - format: json (default), txt, html, docx, pdf
 * - expiresIn: URL expiration in seconds (default: 3600)
 * 
 * Response: 200 OK with presigned URL
 * Error: 404 Not Found, 400 Bad Request, 500 Server Error
 */
router.get('/download/:jobId/:market/:type', (req, res) => {
  contentController.getDownloadUrl(req, res);
});

module.exports = router;