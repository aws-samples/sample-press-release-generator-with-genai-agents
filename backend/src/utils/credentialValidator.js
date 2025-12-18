const { logger } = require('./logger');

/**
 * AWS Credentials Validator
 * Validates that required AWS credentials are properly configured
 * Provides clear setup instructions when credentials are missing
 */
class CredentialValidator {
  constructor() {
    this.requiredEnvVars = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'BEDROCK_MODEL_ID',
      'BEDROCK_REGION'
    ];
  }

  /**
   * Validate AWS credentials and configuration
   * @returns {Object} Validation result with status and messages
   */
  validateAWSCredentials() {
    const missing = [];
    const present = [];

    // Check each required environment variable
    for (const envVar of this.requiredEnvVars) {
      if (!process.env[envVar] || process.env[envVar].trim() === '') {
        missing.push(envVar);
      } else {
        present.push(envVar);
      }
    }

    const isValid = missing.length === 0;

    return {
      isValid,
      missing,
      present,
      message: this.generateSetupMessage(missing, isValid)
    };
  }

  /**
   * Generate helpful setup message for missing credentials
   * @param {Array} missing - Array of missing environment variables
   * @param {boolean} isValid - Whether all credentials are present
   * @returns {string} Setup instructions
   */
  generateSetupMessage(missing, isValid) {
    if (isValid) {
      return '✅ All AWS credentials are properly configured';
    }

    return `
❌ MISSING AWS CREDENTIALS CONFIGURATION

The following required environment variables are not set:
${missing.map(env => `  • ${env}`).join('\n')}

🔧 SETUP INSTRUCTIONS:

1. Copy the example environment file:
   cp .env.example .env

2. Edit the .env file and add your AWS credentials:
   AWS_ACCESS_KEY_ID=your_aws_access_key_here
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
   AWS_REGION=us-west-2
   BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
   BEDROCK_REGION=us-west-2

3. Get AWS credentials from:
   - AWS Console → IAM → Users → Security credentials
   - Or use AWS CLI: aws configure

4. Ensure your AWS account has Bedrock access:
   - Enable Bedrock service in your AWS region
   - Request access to Claude models if needed

5. Restart the server after adding credentials

📚 For detailed setup instructions, see: backend/SETUP-TESTING.md
`;
  }

  /**
   * Log credential validation results
   * @param {Object} validation - Validation result
   */
  logValidationResults(validation) {
    if (validation.isValid) {
      logger.info('AWS credentials validation passed', {
        configuredVars: validation.present.length,
        totalRequired: this.requiredEnvVars.length
      });
    } else {
      logger.error('AWS credentials validation failed', {
        missingVars: validation.missing,
        missingCount: validation.missing.length,
        totalRequired: this.requiredEnvVars.length
      });
      
      // Log the setup message line by line for better readability
      const lines = validation.message.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(line);
        }
      });
    }
  }

  /**
   * Validate credentials and throw error if invalid
   * @throws {Error} If credentials are missing
   */
  validateOrThrow() {
    const validation = this.validateAWSCredentials();
    this.logValidationResults(validation);

    if (!validation.isValid) {
      throw new Error(`AWS credentials not configured. Missing: ${validation.missing.join(', ')}`);
    }

    return validation;
  }
}

module.exports = { CredentialValidator };