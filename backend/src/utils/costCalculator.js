/**
 * Cost Calculator Utility
 * Calculates API costs for Bedrock and Tavily services
 * 
 * @module costCalculator
 */

/**
 * Bedrock API Pricing (Claude 3.7 Sonnet)
 * Input: $3.00 per 1M tokens
 * Output: $15.00 per 1M tokens
 */
const BEDROCK_PRICING = {
  'claude-3-7-sonnet': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00
  }
};

/**
 * Tavily API Pricing
 * Pay-as-you-go: $0.008 per credit
 * 
 * Operation costs:
 * - "Basic Search": 1 credit
 * - "Advanced Search": 2 credits
 * - "Basic Extract": 0.2 credits per URL (5 URLs = 1 credit)
 * - "Advanced Extract": 0.4 credits per URL (5 URLs = 2 credits)
 * - "Regular Mapping": 0.1 credits per page (10 pages = 1 credit)
 * - Mapping with Instructions: 0.2 credits per page (10 pages = 2 credits)
 */
const TAVILY_PRICING = {
  creditCost: 0.008,
  operations: {
    basicSearch: 1,
    advancedSearch: 2,
    basicExtract: 0.2,      // per URL
    advancedExtract: 0.4,   // per URL
    regularMapping: 0.1,    // per page
    mappingWithInstructions: 0.2  // per page
  }
};

/**
 * Calculate cost for AWS Bedrock API call
 * 
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {string} model - Model identifier (default: 'claude-3-7-sonnet')
 * @returns {Object} Cost breakdown with input, output, and total costs
 */
function calculateBedrockCost(inputTokens, outputTokens, model = 'claude-3-7-sonnet') {
  // Handle null/undefined tokens
  const safeInputTokens = inputTokens || 0;
  const safeOutputTokens = outputTokens || 0;
  
  // Get pricing for model
  const pricing = BEDROCK_PRICING[model] || BEDROCK_PRICING['claude-3-7-sonnet'];
  
  // Calculate costs
  const inputCost = (safeInputTokens / 1000000) * pricing.inputCostPer1M;
  const outputCost = (safeOutputTokens / 1000000) * pricing.outputCostPer1M;
  const totalCost = inputCost + outputCost;
  
  return {
    inputTokens: safeInputTokens,
    outputTokens: safeOutputTokens,
    totalTokens: safeInputTokens + safeOutputTokens,
    inputCost: parseFloat(inputCost.toFixed(6)),
    outputCost: parseFloat(outputCost.toFixed(6)),
    totalCost: parseFloat(totalCost.toFixed(6)),
    model,
    currency: 'USD'
  };
}

/**
 * Calculate cost for Tavily API operation
 * 
 * @param {string} operation - Operation type (basicSearch, advancedSearch, etc.)
 * @param {number} count - Count of operations or items (searches, URLs, pages)
 * @returns {Object} Cost breakdown with credits and total cost
 */
function calculateTavilyCost(operation, count = 1) {
  // Handle zero count
  if (count === 0) {
    return {
      operation,
      credits: 0,
      costPerCredit: TAVILY_PRICING.creditCost,
      totalCost: 0,
      currency: 'USD'
    };
  }
  
  // Calculate credits based on operation type
  let credits;
  
  switch (operation) {
    case 'basicSearch':
      credits = count * TAVILY_PRICING.operations.basicSearch;
      break;
    case 'advancedSearch':
      credits = count * TAVILY_PRICING.operations.advancedSearch;
      break;
    case 'basicExtract':
      credits = count * TAVILY_PRICING.operations.basicExtract;
      break;
    case 'advancedExtract':
      credits = count * TAVILY_PRICING.operations.advancedExtract;
      break;
    case 'regularMapping':
      credits = count * TAVILY_PRICING.operations.regularMapping;
      break;
    case 'mappingWithInstructions':
      credits = count * TAVILY_PRICING.operations.mappingWithInstructions;
      break;
    default:
      // Unknown operation - default to 1 credit per count
      credits = count;
  }
  
  // Calculate total cost
  const totalCost = credits * TAVILY_PRICING.creditCost;
  
  return {
    operation,
    credits: parseFloat(credits.toFixed(6)),
    costPerCredit: TAVILY_PRICING.creditCost,
    totalCost: parseFloat(totalCost.toFixed(6)),
    currency: 'USD'
  };
}

/**
 * Format cost for display with currency symbol and proper formatting
 * 
 * @param {number} costUSD - Cost in USD
 * @returns {string} Formatted cost string (e.g., "$4.15", "$1,234.56")
 */
function formatCostForDisplay(costUSD) {
  // Round to 2 decimal places
  const rounded = Math.round(costUSD * 100) / 100;
  
  // Format with thousands separator
  const parts = rounded.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  
  return `$${parts.join('.')}`;
}

module.exports = {
  calculateBedrockCost,
  calculateTavilyCost,
  formatCostForDisplay,
  BEDROCK_PRICING,
  TAVILY_PRICING
};