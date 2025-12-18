const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { config } = require('../config');

// S3 Storage Service - only used when STORAGE_TYPE=cloud
// Use centralized storage selector based on STORAGE_TYPE environment variable
const storage = require('../services/storageSelector');

const router = express.Router();

// FORCE RELOAD - Add timestamp to ensure this code is loaded
console.log(`🔥 LINEAGE DASHBOARD ROUTES LOADED AT: ${new Date().toISOString()}`);
console.log(`📦 STORAGE_TYPE: ${config.storage.type}`);

/**
 * Check if we're using local storage
 * @returns {boolean} True if using local filesystem storage
 */
function isLocalStorage() {
    return config.storage.type === 'local';
}

/**
 * List job directories - environment-aware
 * @returns {Promise<Array<string>>} Array of job directory names
 */
async function listJobDirectories() {
    if (isLocalStorage()) {
        // Local filesystem: Read from backend/storage/generated/
        const storagePath = path.join(process.cwd(), 'backend/storage/generated');
        try {
            const entries = await fs.readdir(storagePath, { withFileTypes: true });
            return entries
                .filter(entry => entry.isDirectory() && entry.name.startsWith('job_'))
                .map(entry => entry.name);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // Directory doesn't exist yet
            }
            throw error;
        }
    } else {
        // S3: List from jobs/ prefix
        const jobKeys = await storage.list('jobs/');
        const jobDirsSet = new Set();
        for (const obj of jobKeys) {
            const match = obj.key.match(/^jobs\/(job_[^\/]+)/);
            if (match) {
                jobDirsSet.add(match[1]);
            }
        }
        return Array.from(jobDirsSet);
    }
}

/**
 * Read JSON file - environment-aware
 * @param {string} jobId - Job ID
 * @param {string} relativePath - Path relative to job directory (e.g., 'lineage/lineage_summary.json')
 * @returns {Promise<Object>} Parsed JSON object
 */
async function readJobJSON(jobId, relativePath) {
    if (isLocalStorage()) {
        // Local filesystem
        const filePath = path.join(process.cwd(), 'backend/storage/generated', jobId, relativePath);
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } else {
        // S3
        const key = `jobs/${jobId}/${relativePath}`;
        return await storage.getJSON(key);
    }
}

/**
 * List files in job directory - environment-aware
 * @param {string} jobId - Job ID
 * @param {string} subPath - Subdirectory path (e.g., 'lineage/')
 * @returns {Promise<Array<string>>} Array of file paths
 */
async function listJobFiles(jobId, subPath = '') {
    if (isLocalStorage()) {
        // Local filesystem
        const dirPath = path.join(process.cwd(), 'backend/storage/generated', jobId, subPath);
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            return entries
                .filter(entry => entry.isFile())
                .map(entry => path.join(subPath, entry.name));
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    } else {
        // S3
        const prefix = `jobs/${jobId}/${subPath}`;
        const objects = await storage.list(prefix);
        return objects.map(obj => obj.key.replace(`jobs/${jobId}/`, ''));
    }
}

/**
 * GET /api/v1/lineage/jobs
 * List all jobs with lineage data - environment-aware
 */
router.get('/jobs', async (req, res) => {
    console.log(`🚀 JOBS ENDPOINT HIT AT: ${new Date().toISOString()}`);
    console.log(`📦 Using storage type: ${config.storage.type}`);
    
    try {
        // List all job directories (environment-aware)
        const jobDirs = await listJobDirectories();
        console.log(`📁 [DEBUG] Found ${jobDirs.length} job directories:`, jobDirs.slice(0, 5));

        const jobs = [];
        
        for (const jobDir of jobDirs) {
            console.log(`🔍 [DEBUG] Processing job: ${jobDir}`);
            
            try {
                let summary = null;
                let jobData = null;
                
                // Try to read summary file (environment-aware)
                try {
                    console.log(`✅ [DEBUG] Attempting to read summary for ${jobDir}`);
                    summary = await readJobJSON(jobDir, 'lineage/lineage_summary.json');
                    console.log(`✅ [DEBUG] Summary file exists for ${jobDir}`);
                    
                    console.log(`📊 [DEBUG] Summary data for ${jobDir}:`, {
                        createdAt: summary.createdAt,
                        dataObjectsType: Array.isArray(summary.dataObjects) ? 'array' : typeof summary.dataObjects,
                        dataObjectsLength: Array.isArray(summary.dataObjects) ? summary.dataObjects.length :
                                         (summary.dataObjects && typeof summary.dataObjects === 'object' ? Object.keys(summary.dataObjects).length : 0),
                        totalEvents: summary.totalEvents
                    });
                    
                    // Construct job data from summary
                    jobData = {
                        jobId: jobDir,
                        createdAt: summary.createdAt,
                        lastUpdated: summary.lastUpdated,
                        dataObjectCount: Array.isArray(summary.dataObjects) ? summary.dataObjects.length :
                                       (summary.dataObjects && typeof summary.dataObjects === 'object' ? Object.keys(summary.dataObjects).length : 0),
                        totalEvents: summary.totalEvents || 0,
                        eventCounts: summary.eventCounts || {}
                    };
                    
                } catch (summaryError) {
                    console.log(`⚠️ [DEBUG] No summary file for ${jobDir}, creating from individual files`);
                    
                    // Fallback: List lineage files and create summary (environment-aware)
                    const lineageFiles = await listJobFiles(jobDir, 'lineage/');
                    const jsonFiles = lineageFiles.filter(f => f.endsWith('.json'));
                    
                    console.log(`📁 [DEBUG] Found ${jsonFiles.length} lineage files for ${jobDir}`);
                    
                    // Get creation time from job directory or first file
                    let createdAt = new Date().toISOString();
                    let lastUpdated = createdAt;
                    
                    // Try to extract timestamp from job ID
                    const timestampMatch = jobDir.match(/job_(\d+)_/);
                    if (timestampMatch) {
                        createdAt = new Date(parseInt(timestampMatch[1])).toISOString();
                    }
                    
                    // Count events from files
                    let totalEvents = jsonFiles.length;
                    let dataObjectCount = 0;
                    
                    // Try to get more accurate counts by examining first few files
                    for (const fileRelPath of jsonFiles.slice(0, 3)) { // Check first 3 files for performance
                        try {
                            const fileData = await readJobJSON(jobDir, fileRelPath);
                            
                            // Count data objects if present
                            if (fileData.dataObjects) {
                                dataObjectCount += Array.isArray(fileData.dataObjects) ? fileData.dataObjects.length :
                                                 (typeof fileData.dataObjects === 'object' ? Object.keys(fileData.dataObjects).length : 0);
                            }
                            
                            // Update last updated time
                            if (fileData.timestamp) {
                                lastUpdated = fileData.timestamp;
                            }
                        } catch (fileError) {
                            console.log(`⚠️ [DEBUG] Could not parse ${fileRelPath}: ${fileError.message}`);
                        }
                    }
                    
                    // Construct job data from available information
                    jobData = {
                        jobId: jobDir,
                        createdAt: createdAt,
                        lastUpdated: lastUpdated,
                        dataObjectCount: Math.max(dataObjectCount, 1), // At least 1 if we have files
                        totalEvents: totalEvents,
                        eventCounts: { 'lineage_files': totalEvents },
                        source: 'generated_from_files' // Indicate this was generated
                    };
                }
                
                if (jobData) {
                    jobs.push(jobData);
                    console.log(`✅ [DEBUG] Added job: ${jobDir} with ${jobData.dataObjectCount} data objects, ${jobData.totalEvents} events`);
                }
                
            } catch (error) {
                console.warn(`⚠️ [WARN] Skipping job ${jobDir}: ${error.message}`);
                continue;
            }
        }

        // Sort jobs by creation date (newest first)
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log(`🎯 [DEBUG] Returning ${jobs.length} jobs to client`);
        console.log(`🎯 [DEBUG] Jobs summary:`, jobs.map(j => ({ jobId: j.jobId, dataObjectCount: j.dataObjectCount, totalEvents: j.totalEvents })));
        
        res.json({
            success: true,
            data: jobs
        });

    } catch (error) {
        console.error('💥 [ERROR] Failed to fetch lineage jobs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v1/lineage/dashboard/:jobId
 * Get complete dashboard data for a specific job - environment-aware
 */
router.get('/dashboard/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        console.log(`[DEBUG] Dashboard route - processing job: ${jobId}`);
        console.log(`[DEBUG] Dashboard route - storage type: ${config.storage.type}`);
        
        // Add error handling around module loading
        let LineageDashboardService;
        try {
            console.log(`[DEBUG] Dashboard route - requiring LineageDashboardService module`);
            LineageDashboardService = require('../services/lineageDashboardService');
            console.log(`[DEBUG] Dashboard route - module loaded successfully`);
        } catch (requireError) {
            console.error(`[ERROR] Dashboard route - failed to require module:`, requireError);
            return res.status(500).json({
                success: false,
                error: `Module load error: ${requireError.message}`
            });
        }
        
        // Add error handling around class instantiation
        let dashboardService;
        try {
            console.log(`[DEBUG] Dashboard route - instantiating LineageDashboardService`);
            dashboardService = new LineageDashboardService();
            console.log(`[DEBUG] Dashboard route - service instantiated successfully`);
        } catch (instantiationError) {
            console.error(`[ERROR] Dashboard route - failed to instantiate service:`, instantiationError);
            return res.status(500).json({
                success: false,
                error: `Service instantiation error: ${instantiationError.message}`
            });
        }
        
        console.log(`[DEBUG] Dashboard route - calling getJobDashboardData`);
        const dashboardData = await dashboardService.getJobDashboardData(jobId);
        
        console.log(`[DEBUG] Dashboard route - received data, type: ${typeof dashboardData}, has data: ${!!dashboardData}`);
        
        if (!dashboardData) {
            return res.status(404).json({
                success: false,
                error: 'Job lineage data not found'
            });
        }
        
        console.log(`[DEBUG] Dashboard route - sending response`);
        res.json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;