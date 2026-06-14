/**
 * Jest global setup (referenced by jest.config.js `setupFilesAfterEnv`).
 *
 * Several backend services instantiate singletons at require-time (notably
 * `s3StorageService.js`, which throws unless `S3_CONTENT_BUCKET` is set). To let
 * unit tests `require()` those modules without hitting real AWS/network, we seed
 * safe placeholder environment variables here BEFORE any test module is loaded.
 *
 * These values are inert test placeholders — no real credentials, no network I/O.
 */

// Force local storage mode so DataLineageService et al. avoid the S3 client path
// where possible, but also provide the S3 bucket var because the S3 singleton is
// constructed at module-load time regardless of STORAGE_TYPE.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
process.env.S3_CONTENT_BUCKET = process.env.S3_CONTENT_BUCKET || 'test-content-bucket';
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'test-content-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-west-2';
process.env.S3_REGION = process.env.S3_REGION || 'us-west-2';

// Placeholder API keys so configuration checks can be exercised deterministically.
process.env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'test-firecrawl-key';
process.env.PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || 'test-perplexity-key';
