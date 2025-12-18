/**
 * FrameworkExtractor - Extracts structural framework and key elements from content
 * Extends BaseAgent for standardized interface and consistent behavior
 */

const BaseAgent = require('./baseAgent');

class FrameworkExtractor extends BaseAgent {
    constructor() {
        super('Framework Extractor');
        
        // Standard interface properties
        this.version = '1.0.0';
        this.capabilities = [
            'framework_extraction',
            'content_type_detection',
            'structure_analysis',
            'key_points_extraction',
            'quotes_extraction',
            'statistics_extraction'
        ];
        this.lastResults = null;
        
        this.patterns = new Map();
        this.loadPatterns();
    }

    /**
     * Load extraction patterns for different content types
     */
    loadPatterns() {
        this.patterns.set('press_release', {
            structure: ['headline', 'dateline', 'body', 'boilerplate', 'contact'],
            keyElements: ['quotes', 'statistics', 'company_info', 'market_data'],
            indicators: ['FOR IMMEDIATE RELEASE', 'PRESS RELEASE', 'announces', 'reports']
        });

        this.patterns.set('news_article', {
            structure: ['headline', 'lead', 'body', 'conclusion'],
            keyElements: ['who', 'what', 'when', 'where', 'why', 'how'],
            indicators: ['breaking', 'reported', 'according to', 'sources say']
        });

        this.patterns.set('research_report', {
            structure: ['executive_summary', 'methodology', 'findings', 'conclusions'],
            keyElements: ['data_points', 'analysis', 'recommendations', 'sources'],
            indicators: ['study', 'research', 'analysis', 'findings', 'methodology']
        });
    }

    /**
     * Standard process method - delegates to extractFramework
     */
    async process(input, options = {}) {
        return await this.extractFramework(input, options);
    }

    /**
     * Standard validate method - performs basic content validation
     */
    async validate(input, options = {}) {
        if (!input || typeof input !== 'string') {
            return {
                isValid: false,
                errors: ['Input must be a non-empty string'],
                timestamp: new Date().toISOString()
            };
        }
        
        if (input.length < 10) {
            return {
                isValid: false,
                errors: ['Input too short for meaningful framework extraction'],
                timestamp: new Date().toISOString()
            };
        }
        
        return {
            isValid: true,
            errors: [],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get processing results
     */
    getResults() {
        return this.lastResults;
    }

    /**
     * Extract framework (standardized method name)
     */
    async extract(content, options = {}) {
        return await this.extractFramework(content, options);
    }

    /**
     * Get extraction patterns (standardized method name)
     */
    getExtractionPatterns() {
        const patterns = {};
        for (const [key, value] of this.patterns) {
            patterns[key] = value;
        }
        return patterns;
    }

    /**
     * Extract framework from content
     */
    async extractFramework(content, options = {}) {
        const startTime = Date.now();
        
        try {
            // Detect content type
            const contentType = this.detectContentType(content);
            
            // Extract structural elements
            const structure = this.extractStructure(content, contentType);
            
            // Extract key points and elements
            const keyPoints = this.extractKeyPoints(content, contentType);
            
            // Extract quotes and citations
            const quotes = this.extractQuotes(content);
            
            // Extract statistics and data points
            const statistics = this.extractStatistics(content);
            
            // Calculate confidence score
            const confidence = this.calculateConfidence(structure, keyPoints, quotes, statistics);
            
            const processingTime = Date.now() - startTime;
            
            const result = {
                success: true,
                processingTime,
                framework: {
                    contentType,
                    structure,
                    keyPoints,
                    quotes,
                    statistics,
                    confidence,
                    metadata: {
                        wordCount: content.split(/\s+/).length,
                        characterCount: content.length,
                        extractedAt: new Date().toISOString()
                    }
                },
                claims: this.extractClaims(content, quotes, statistics)
            };

            // Store results for getResults() method
            this.lastResults = result;
            
            return result;

        } catch (error) {
            this.logError('Framework extraction failed', error);
            
            // Store error result for getResults() method
            const errorResult = {
                success: false,
                processingTime: Date.now() - startTime,
                framework: null,
                claims: [],
                error: error.message,
                timestamp: new Date().toISOString()
            };
            this.lastResults = errorResult;
            
            throw error;
        }
    }

    /**
     * Detect content type based on patterns
     */
    detectContentType(content) {
        const lowerContent = content.toLowerCase();
        let bestMatch = 'unknown';
        let highestScore = 0;

        for (const [type, pattern] of this.patterns) {
            let score = 0;
            pattern.indicators.forEach(indicator => {
                if (lowerContent.includes(indicator.toLowerCase())) {
                    score++;
                }
            });
            
            if (score > highestScore) {
                highestScore = score;
                bestMatch = type;
            }
        }

        return bestMatch;
    }

    /**
     * Extract structural elements
     */
    extractStructure(content, contentType) {
        const pattern = this.patterns.get(contentType);
        if (!pattern) return {};

        const structure = {};
        
        // Simple structure detection based on content patterns
        if (contentType === 'press_release') {
            structure.hasHeadline = this.hasHeadline(content);
            structure.hasDateline = this.hasDateline(content);
            structure.hasBody = content.length > 200;
            structure.hasContact = this.hasContactInfo(content);
        }

        return structure;
    }

    /**
     * Extract key points from content
     */
    extractKeyPoints(content, contentType) {
        const keyPoints = [];
        
        // Extract based on content type
        if (contentType === 'press_release') {
            keyPoints.push(...this.extractPressReleaseKeyPoints(content));
        }
        
        return keyPoints;
    }

    /**
     * Extract press release specific key points
     */
    extractPressReleaseKeyPoints(content) {
        const keyPoints = [];
        
        // Look for market data indicators
        if (/market|housing|real estate|sales|prices/i.test(content)) {
            keyPoints.push('market_data');
        }
        
        // Look for expert quotes
        if (/said|according to|stated|commented/i.test(content)) {
            keyPoints.push('expert_quotes');
        }
        
        // Look for statistics
        if (/\d+%|\$[\d,]+|\d+\.\d+/i.test(content)) {
            keyPoints.push('statistics');
        }
        
        // Look for company information
        if (/company|corporation|inc\.|llc|ltd\./i.test(content)) {
            keyPoints.push('company_info');
        }
        
        return keyPoints;
    }

    /**
     * Extract quotes from content
     */
    extractQuotes(content) {
        const quotes = [];
        
        // Simple quote extraction using regex
        const quotePatterns = [
            /"([^"]+)"/g,  // Double quotes
            /'([^']+)'/g,  // Single quotes
            /said[^.]*"([^"]+)"/gi,  // Said quotes
            /according to[^.]*"([^"]+)"/gi  // According to quotes
        ];
        
        quotePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (match[1] && match[1].length > 10) {  // Filter out short quotes
                    quotes.push({
                        text: match[1],
                        context: this.getQuoteContext(content, match.index),
                        position: match.index
                    });
                }
            }
        });
        
        return quotes;
    }

    /**
     * Get context around a quote
     */
    getQuoteContext(content, position) {
        const start = Math.max(0, position - 50);
        const end = Math.min(content.length, position + 100);
        return content.substring(start, end).trim();
    }

    /**
     * Extract statistics and data points
     */
    extractStatistics(content) {
        const statistics = [];
        
        // Extract percentages
        const percentages = content.match(/\d+(\.\d+)?%/g) || [];
        percentages.forEach(stat => {
            statistics.push({
                type: 'percentage',
                value: stat,
                context: this.getStatContext(content, stat)
            });
        });
        
        // Extract dollar amounts
        const dollarAmounts = content.match(/\$[\d,]+(\.\d+)?/g) || [];
        dollarAmounts.forEach(stat => {
            statistics.push({
                type: 'currency',
                value: stat,
                context: this.getStatContext(content, stat)
            });
        });
        
        // Extract years
        const years = content.match(/\b(19|20)\d{2}\b/g) || [];
        years.forEach(stat => {
            statistics.push({
                type: 'year',
                value: stat,
                context: this.getStatContext(content, stat)
            });
        });
        
        return statistics;
    }

    /**
     * Get context around a statistic
     */
    getStatContext(content, statistic) {
        const index = content.indexOf(statistic);
        if (index === -1) return '';
        
        const start = Math.max(0, index - 30);
        const end = Math.min(content.length, index + statistic.length + 30);
        return content.substring(start, end).trim();
    }

    /**
     * Check if content has headline
     */
    hasHeadline(content) {
        const lines = content.split('\n');
        return lines.length > 0 && lines[0].length > 10 && lines[0].length < 200;
    }

    /**
     * Check if content has dateline
     */
    hasDateline(content) {
        return /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i.test(content);
    }

    /**
     * Check if content has contact information
     */
    hasContactInfo(content) {
        return /contact|phone|email|@|tel:|call/i.test(content);
    }

    /**
     * Extract claims from content for validation
     */
    extractClaims(content, quotes, statistics) {
        const claims = [];
        
        // Add quote-based claims
        quotes.forEach(quote => {
            claims.push({
                type: 'quote',
                text: quote.text,
                context: quote.context,
                source: 'extracted_quote',
                confidence: 0.8
            });
        });
        
        // Add statistical claims
        statistics.forEach(stat => {
            claims.push({
                type: 'statistic',
                text: stat.value,
                context: stat.context,
                source: 'extracted_data',
                confidence: 0.9
            });
        });
        
        // Add factual claims from content
        const factualClaims = this.extractFactualClaims(content);
        factualClaims.forEach(claim => {
            claims.push({
                type: 'factual',
                text: claim,
                context: this.getStatContext(content, claim),
                source: 'content_analysis',
                confidence: 0.7
            });
        });
        
        return claims;
    }

    /**
     * Extract factual claims from content
     */
    extractFactualClaims(content) {
        const claims = [];
        
        // Extract market-related claims
        const marketClaims = content.match(/market[^.]*\d+[^.]*/gi) || [];
        claims.push(...marketClaims);
        
        // Extract housing-related claims
        const housingClaims = content.match(/housing[^.]*\d+[^.]*/gi) || [];
        claims.push(...housingClaims);
        
        // Extract sales-related claims
        const salesClaims = content.match(/sales[^.]*\d+[^.]*/gi) || [];
        claims.push(...salesClaims);
        
        return claims.slice(0, 20); // Limit to 20 claims
    }

    /**
     * Calculate confidence score for extraction
     */
    calculateConfidence(structure, keyPoints, quotes, statistics) {
        let score = 0;
        let maxScore = 0;
        
        // Structure confidence
        const structureElements = Object.values(structure).filter(Boolean).length;
        score += structureElements * 0.2;
        maxScore += Object.keys(structure).length * 0.2;
        
        // Key points confidence
        score += keyPoints.length * 0.15;
        maxScore += 4 * 0.15; // Assume max 4 key points
        
        // Quotes confidence
        score += Math.min(quotes.length, 3) * 0.2;
        maxScore += 3 * 0.2;
        
        // Statistics confidence
        score += Math.min(statistics.length, 5) * 0.1;
        maxScore += 5 * 0.1;
        
        return maxScore > 0 ? Math.min(1, score / maxScore) : 0;
    }

    /**
     * Get extractor status
     */
    getStatus() {
        return {
            name: this.name,
            patterns: this.patterns.size,
            ready: true
        };
    }
}

module.exports = FrameworkExtractor;