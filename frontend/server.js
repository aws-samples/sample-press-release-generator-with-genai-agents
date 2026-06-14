#!/usr/bin/env node

/**
 * Simple HTTP Server for AI Press Release Generator Frontend
 * Serves static files and provides CORS support for development
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = __dirname;

// Environment configuration for runtime injection
const ENV_CONFIG = {
    // Use relative path as final fallback for universal compatibility
    API_BASE_URL: process.env.API_BASE_URL || process.env.BACKEND_URL || '/api/v1',
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG: process.env.DEBUG || 'false',
    CORS_MODE: process.env.CORS_MODE || 'cors'
};

// MIME types for different file extensions
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Inject environment variables into HTML files
 */
function injectEnvironmentVariables(htmlContent) {
    const envScript = `
    <script>
        // Runtime environment configuration
        window.ENV = ${JSON.stringify(ENV_CONFIG)};
        console.log('🔧 Environment configuration loaded:', window.ENV);
    </script>`;
    
    // Inject before the closing head tag or at the beginning of body
    if (htmlContent.includes('</head>')) {
        return htmlContent.replace('</head>', `${envScript}\n</head>`);
    } else if (htmlContent.includes('<body>')) {
        return htmlContent.replace('<body>', `<body>\n${envScript}`);
    } else {
        return envScript + htmlContent;
    }
}

/**
 * Get CORS headers based on environment
 */
function getCorsHeaders(req) {
    const origin = req.headers.origin;
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    // In development, allow any origin
    if (isDevelopment) {
        return {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400'
        };
    }
    
    // In production, be more restrictive
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.CORS_ORIGIN
    ].filter(Boolean);
    
    const isAllowed = !origin || allowedOrigins.includes(origin) ||
                     /^https:\/\/[a-z0-9-]+\.(cloudfront\.net|amazonaws\.com)$/.test(origin);
    
    return {
        'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Credentials': isAllowed ? 'true' : 'false',
        'Access-Control-Max-Age': '3600'
    };
}

/**
 * Serve static files
 */
function serveStaticFile(filePath, res, req) {
    // Read file as buffer (not utf8) to preserve binary files
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }

        const mimeType = getMimeType(filePath);
        const corsHeaders = getCorsHeaders(req);
        
        // Inject environment variables into HTML files
        if (mimeType === 'text/html') {
            // Convert buffer to string for HTML processing
            let htmlContent = data.toString('utf8');
            htmlContent = injectEnvironmentVariables(htmlContent);
            data = Buffer.from(htmlContent, 'utf8');
        }
        
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Cache-Control': mimeType === 'text/html' ? 'no-cache' : 'public, max-age=31536000',
            ...corsHeaders
        });
        res.end(data);
    });
}

/**
 * Proxy API requests to backend server
 */
function proxyToBackend(req, res) {
    const backendPort = process.env.BACKEND_PORT || 3001;
    const backendHost = process.env.BACKEND_HOST || 'localhost';
    
    const options = {
        hostname: backendHost,
        port: backendPort,
        path: req.url,
        method: req.method,
        headers: req.headers
    };

    console.log(`🔄 Proxying ${req.method} ${req.url} to backend:${backendPort}`);

    const proxyReq = http.request(options, (proxyRes) => {
        const corsHeaders = getCorsHeaders(req);
        
        // Forward status code and headers
        res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            ...corsHeaders
        });
        
        // Pipe response back to client
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('❌ Proxy error:', err.message);
        const corsHeaders = getCorsHeaders(req);
        res.writeHead(502, {
            'Content-Type': 'application/json',
            ...corsHeaders
        });
        res.end(JSON.stringify({
            error: 'Backend service unavailable',
            message: err.message
        }));
    });

    // Forward request body if present
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(proxyReq);
    } else {
        proxyReq.end();
    }
}

/**
 * Handle HTTP requests
 */
function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        const corsHeaders = getCorsHeaders(req);
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }

    // Proxy API requests to backend
    if (pathname.startsWith('/api/')) {
        proxyToBackend(req, res);
        return;
    }

    // Default to index.html for root requests
    if (pathname === '/') {
        pathname = '/index.html';
    }

    // Construct file path
    const filePath = path.join(FRONTEND_DIR, pathname);

    // Security check - ensure file is within frontend directory
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }

        serveStaticFile(filePath, res, req);
    });
}

/**
 * Create and start the server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`🚀 AI Press Release Generator Frontend Server`);
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving files from: ${FRONTEND_DIR}`);
    console.log(`🔗 Open http://localhost:${PORT} in your browser`);
    console.log(`🔧 Backend API should be running on http://localhost:3001`);
    console.log('');
    console.log('Press Ctrl+C to stop the server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down frontend server...');
    server.close(() => {
        console.log('✅ Frontend server stopped');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});