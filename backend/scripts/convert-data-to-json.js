#!/usr/bin/env node

/**
 * Data Conversion Script: XLS/CSV to JSON
 * 
 * This script converts XLS and CSV files in the trusteddata/ directory to JSON format.
 * It maintains data structure and integrity while providing clean, well-structured JSON output.
 * 
 * Usage: node scripts/convert-data-to-json.js
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const csv = require('csv-parser');

// Configuration
const TRUSTED_DATA_DIR = path.join(__dirname, '../../trusteddata');
const SUPPORTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

/**
 * Logger utility for consistent output formatting
 */
const logger = {
    info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
    success: (message) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${message}`),
    error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`),
    warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
};

/**
 * Convert CSV file to JSON
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array>} - Promise resolving to JSON array
 */
function convertCsvToJson(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                // Clean up data - remove extra spaces and normalize values
                const cleanedData = {};
                for (const [key, value] of Object.entries(data)) {
                    cleanedData[key.trim()] = value ? value.trim() : value;
                }
                results.push(cleanedData);
            })
            .on('end', () => {
                logger.info(`CSV parsing completed: ${results.length} records processed`);
                resolve(results);
            })
            .on('error', (error) => {
                logger.error(`CSV parsing failed: ${error.message}`);
                reject(error);
            });
    });
}

/**
 * Convert XLS/XLSX file to JSON
 * @param {string} filePath - Path to the XLS/XLSX file
 * @returns {Array} - JSON array
 */
function convertXlsToJson(filePath) {
    try {
        logger.info(`Reading XLS/XLSX file: ${filePath}`);
        
        // Read the workbook
        const workbook = XLSX.readFile(filePath);
        
        // Get the first worksheet (or you can specify a particular sheet)
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1, // Use first row as header
            defval: null // Default value for empty cells
        });
        
        // Convert array of arrays to array of objects
        if (jsonData.length === 0) {
            logger.warn('XLS file appears to be empty');
            return [];
        }
        
        const headers = jsonData[0];
        const rows = jsonData.slice(1);
        
        const result = rows.map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined ? row[index] : null;
            });
            return obj;
        });
        
        logger.info(`XLS parsing completed: ${result.length} records processed`);
        return result;
        
    } catch (error) {
        logger.error(`XLS parsing failed: ${error.message}`);
        throw error;
    }
}

/**
 * Get output filename for JSON file
 * @param {string} originalFilename - Original filename
 * @returns {string} - JSON filename
 */
function getJsonFilename(originalFilename) {
    const baseName = path.parse(originalFilename).name;
    return `${baseName}.json`;
}

/**
 * Write JSON data to file with proper formatting
 * @param {string} outputPath - Output file path
 * @param {Array} data - JSON data to write
 */
function writeJsonFile(outputPath, data) {
    try {
        const jsonContent = JSON.stringify(data, null, 2);
        fs.writeFileSync(outputPath, jsonContent, 'utf8');
        logger.success(`JSON file created: ${outputPath}`);
    } catch (error) {
        logger.error(`Failed to write JSON file: ${error.message}`);
        throw error;
    }
}

/**
 * Process a single file for conversion
 * @param {string} filePath - Path to the file to convert
 * @returns {Promise<Object>} - Conversion result
 */
async function processFile(filePath) {
    const filename = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    logger.info(`Processing file: ${filename}`);
    
    try {
        let jsonData;
        
        if (extension === '.csv') {
            jsonData = await convertCsvToJson(filePath);
        } else if (extension === '.xls' || extension === '.xlsx') {
            jsonData = convertXlsToJson(filePath);
        } else {
            throw new Error(`Unsupported file extension: ${extension}`);
        }
        
        // Generate output path
        const jsonFilename = getJsonFilename(filename);
        const outputPath = path.join(TRUSTED_DATA_DIR, jsonFilename);
        
        // Write JSON file
        writeJsonFile(outputPath, jsonData);
        
        return {
            success: true,
            originalFile: filename,
            outputFile: jsonFilename,
            recordCount: jsonData.length,
            outputPath: outputPath
        };
        
    } catch (error) {
        logger.error(`Failed to process ${filename}: ${error.message}`);
        return {
            success: false,
            originalFile: filename,
            error: error.message
        };
    }
}

/**
 * Get all files in the trusted data directory that need conversion
 * @returns {Array<string>} - Array of file paths
 */
function getFilesToConvert() {
    try {
        if (!fs.existsSync(TRUSTED_DATA_DIR)) {
            logger.error(`Trusted data directory not found: ${TRUSTED_DATA_DIR}`);
            return [];
        }
        
        const files = fs.readdirSync(TRUSTED_DATA_DIR);
        const filesToConvert = files.filter(file => {
            const extension = path.extname(file).toLowerCase();
            return SUPPORTED_EXTENSIONS.includes(extension);
        });
        
        return filesToConvert.map(file => path.join(TRUSTED_DATA_DIR, file));
        
    } catch (error) {
        logger.error(`Failed to read directory: ${error.message}`);
        return [];
    }
}

/**
 * Main conversion function
 */
async function main() {
    logger.info('Starting data conversion process...');
    logger.info(`Target directory: ${TRUSTED_DATA_DIR}`);
    
    // Get files to convert
    const filePaths = getFilesToConvert();
    
    if (filePaths.length === 0) {
        logger.warn('No files found for conversion');
        return;
    }
    
    logger.info(`Found ${filePaths.length} file(s) to convert`);
    
    // Process each file
    const results = [];
    for (const filePath of filePaths) {
        const result = await processFile(filePath);
        results.push(result);
    }
    
    // Generate summary report
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    logger.info('\n=== CONVERSION SUMMARY ===');
    logger.info(`Total files processed: ${results.length}`);
    logger.success(`Successfully converted: ${successful.length}`);
    
    if (successful.length > 0) {
        logger.info('\nSuccessful conversions:');
        successful.forEach(result => {
            logger.info(`  • ${result.originalFile} → ${result.outputFile} (${result.recordCount} records)`);
        });
    }
    
    if (failed.length > 0) {
        logger.error(`Failed conversions: ${failed.length}`);
        failed.forEach(result => {
            logger.error(`  • ${result.originalFile}: ${result.error}`);
        });
    }
    
    // Verify JSON files
    logger.info('\n=== VERIFICATION ===');
    successful.forEach(result => {
        try {
            const jsonContent = fs.readFileSync(result.outputPath, 'utf8');
            const parsedData = JSON.parse(jsonContent);
            logger.success(`✓ ${result.outputFile} - Valid JSON with ${parsedData.length} records`);
        } catch (error) {
            logger.error(`✗ ${result.outputFile} - Invalid JSON: ${error.message}`);
        }
    });
    
    logger.info('\nData conversion process completed!');
}

// Run the script if called directly
if (require.main === module) {
    main().catch(error => {
        logger.error(`Script execution failed: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    convertCsvToJson,
    convertXlsToJson,
    processFile,
    main
};