#!/usr/bin/env node

/**
 * Local Desktop Setup Script
 * Initializes local directories and configuration for desktop deployment
 */

const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');

console.log('🚀 Setting up local desktop environment...');

// Create required directories
const directories = [
  config.storage.localPath,
  config.storage.generatedPath,
  config.storage.tempPath,
  'logs',
  'storage/jobs',
  'storage/cache',
  'storage/uploads'
];

directories.forEach(dir => {
  const fullPath = path.resolve(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  } else {
    console.log(`📁 Directory already exists: ${dir}`);
  }
});

// Create .gitkeep files to preserve empty directories
const gitkeepDirs = [
  'storage/generated',
  'storage/temp',
  'storage/jobs',
  'storage/cache',
  'storage/uploads'
];

gitkeepDirs.forEach(dir => {
  const gitkeepPath = path.resolve(__dirname, '..', dir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '# Keep this directory in git\n');
    console.log(`✅ Created .gitkeep in: ${dir}`);
  }
});

// Create local configuration summary
const configSummary = {
  environment: 'local-desktop',
  storage: {
    type: config.storage.type,
    localPath: config.storage.localPath,
    generatedPath: config.storage.generatedPath,
    tempPath: config.storage.tempPath
  },
  server: {
    port: config.server.port,
    nodeEnv: config.server.nodeEnv
  },
  firecrawl: {
    configured: !!config.firecrawl.apiKey
  },
  aws: {
    required: config.storage.type === 'cloud',
    configured: !!(config.aws.accessKeyId && config.aws.secretAccessKey)
  }
};

const configPath = path.resolve(__dirname, '..', 'storage', 'local-config.json');
fs.writeFileSync(configPath, JSON.stringify(configSummary, null, 2));
console.log('✅ Created local configuration summary');

// Check environment variables
console.log('\n📋 Environment Check:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   PORT: ${process.env.PORT || '3001'}`);
console.log(`   STORAGE_TYPE: ${process.env.STORAGE_TYPE || 'local'}`);
console.log(`   FIRECRAWL_API_KEY: ${process.env.FIRECRAWL_API_KEY ? '✅ Set' : '❌ Missing'}`);

if (config.storage.type === 'cloud') {
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`);
}

console.log('\n🎉 Local desktop setup complete!');
console.log('\n📝 Next steps:');
console.log('   1. Start the backend server: npm run dev');
console.log('   2. Start the frontend server: cd ../frontend && node server.js');
console.log('   3. Open http://localhost:3000 in your browser');
console.log('\n🔗 API Endpoints:');
console.log(`   Health Check: http://localhost:${config.server.port}/health`);
console.log(`   API Status: http://localhost:${config.server.port}/api/v1/status`);
console.log(`   Markets: http://localhost:${config.server.port}/api/v1/markets`);
console.log(`   Top 10 Markets: http://localhost:${config.server.port}/api/v1/markets/top10`);