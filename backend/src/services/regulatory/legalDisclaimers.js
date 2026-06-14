/**
 * Legal Disclaimer Service
 * 
 * Automated legal disclaimer generation system ensuring all press releases
 * include required legal compliance elements for Fair Housing Act, Equal
 * Housing Opportunity, and Business Wire format standards.
 * 
 * This service addresses the critical missing disclaimers identified in the
 * Chicago job analysis that caused brand compliance to score only 70/100.
 * 
 * @module LegalDisclaimerService
 * @version 1.0.0
 */

const logger = require('../../utils/logger');

/**
 * Market to State mapping for dateline generation
 * Maps major US metropolitan markets to their state abbreviations
 */
const MARKET_STATE_MAP = {
  'Chicago': 'IL',
  'Los Angeles': 'CA',
  'New York': 'NY',
  'Dallas': 'TX',
  'Houston': 'TX',
  'Philadelphia': 'PA',
  'Phoenix': 'AZ',
  'San Antonio': 'TX',
  'San Diego': 'CA',
  'San Jose': 'CA',
  'Austin': 'TX',
  'Jacksonville': 'FL',
  'Fort Worth': 'TX',
  'Columbus': 'OH',
  'Charlotte': 'NC',
  'San Francisco': 'CA',
  'Indianapolis': 'IN',
  'Seattle': 'WA',
  'Denver': 'CO',
  'Washington': 'DC',
  'Boston': 'MA',
  'El Paso': 'TX',
  'Nashville': 'TN',
  'Detroit': 'MI',
  'Oklahoma City': 'OK',
  'Portland': 'OR',
  'Las Vegas': 'NV',
  'Memphis': 'TN',
  'Louisville': 'KY',
  'Baltimore': 'MD',
  'Milwaukee': 'WI',
  'Albuquerque': 'NM',
  'Tucson': 'AZ',
  'Fresno': 'CA',
  'Mesa': 'AZ',
  'Sacramento': 'CA',
  'Atlanta': 'GA',
  'Kansas City': 'MO',
  'Colorado Springs': 'CO',
  'Omaha': 'NE',
  'Raleigh': 'NC',
  'Miami': 'FL',
  'Long Beach': 'CA',
  'Virginia Beach': 'VA',
  'Oakland': 'CA',
  'Minneapolis': 'MN',
  'Tulsa': 'OK',
  'Tampa': 'FL',
  'Arlington': 'TX',
  'New Orleans': 'LA'
};

class LegalDisclaimerService {
  constructor() {
    this.version = '1.0.0';
    // Use console for logging in tests, logger in production
    // Ensure logger has all required methods with fallbacks
    this.logger = logger || console;
    
    // Ensure logger has all required methods
    if (!this.logger.debug) this.logger.debug = console.log.bind(console);
    if (!this.logger.error) this.logger.error = console.error.bind(console);
    if (!this.logger.info) this.logger.info = console.log.bind(console);
    if (!this.logger.warn) this.logger.warn = console.warn.bind(console);
    
    // Company information for contact section
    this.companyInfo = {
      name: 'Press Release Generator',
      contactName: 'Media Relations',
      phone: '(555) 123-4567',
      email: 'media@pressreleasegenerator.com'
    };
  }

  /**
   * Generate complete disclaimer package for press release
   * 
   * @param {string} market - Market name (e.g., "Chicago-Naperville-Elgin")
   * @param {Array<string>} dataSourcesUsed - Array of data sources used in content
   * @returns {Object} Complete disclaimer package with header, footer, attributions, contact
   */
  generateDisclaimers(market, dataSourcesUsed) {
    try {
      this.logger.debug('Generating legal disclaimers', {
        market,
        dataSourceCount: dataSourcesUsed ? dataSourcesUsed.length : 0
      });

      const disclaimers = {
        header: this._generateHeaderDisclaimers(market),
        footer: this._generateFooterDisclaimers(),
        attributions: this._generateAttributions(dataSourcesUsed),
        contact: this._generateContactInfo()
      };

      this.logger.debug('Legal disclaimers generated successfully', {
        headerLength: disclaimers.header.length,
        footerLength: disclaimers.footer.length,
        attributionsLength: disclaimers.attributions.length,
        contactLength: disclaimers.contact.length
      });

      return disclaimers;
    } catch (error) {
      this.logger.error('Error generating legal disclaimers', {
        error: error.message,
        market,
        dataSourcesUsed
      });
      
      // Return minimal disclaimers on error to ensure compliance
      return {
        header: 'FOR IMMEDIATE RELEASE\n\n',
        footer: this._generateFooterDisclaimers(),
        attributions: 'Data sources: Multiple sources',
        contact: this._generateContactInfo()
      };
    }
  }

  /**
   * Generate FOR IMMEDIATE RELEASE header with proper dateline
   * 
   * Format: FOR IMMEDIATE RELEASE
   *         
   *         CITY, State — Month Day, Year —
   * 
   * @param {string} market - Market name to extract city from
   * @returns {string} Formatted header with dateline
   */
  _generateHeaderDisclaimers(market) {
    try {
      // Extract city name from market (first part before hyphen)
      const cityName = market ? market.split('-')[0].trim() : 'United States';
      
      // Get state abbreviation
      const stateAbbr = this._getStateAbbreviation(cityName);
      
      // Generate current date in proper format
      const currentDate = new Date();
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const month = monthNames[currentDate.getMonth()];
      const day = currentDate.getDate();
      const year = currentDate.getFullYear();
      
      // Format: CITY, ST — Month Day, Year —
      const dateline = `${cityName}, ${stateAbbr} — ${month} ${day}, ${year} —`;
      
      return `FOR IMMEDIATE RELEASE\n\n${dateline}`;
    } catch (error) {
      this.logger.error('Error generating header disclaimers', { error: error.message, market });
      return 'FOR IMMEDIATE RELEASE\n\n';
    }
  }

  /**
   * Generate footer disclaimers including Fair Housing Act compliance,
   * Equal Housing Opportunity statement, and informational disclaimer
   * 
   * @returns {string} Complete footer disclaimer text
   */
  _generateFooterDisclaimers() {
    const disclaimers = [];
    
    // Informational purposes disclaimer - MUST include exact phrase "informational purposes"
    disclaimers.push(
      'This information is provided for informational purposes only. ' +
      'This publication is designed to provide accurate information in regard to the subject matter covered. ' +
      'It is provided with the understanding that the publisher is not engaged in rendering legal, accounting, ' +
      'or other professional service. If legal advice or other expert assistance is required, the services of ' +
      'a competent professional should be sought.'
    );
    
    // Fair Housing Act compliance statement
    disclaimers.push(
      'This material complies with the Fair Housing Act and does not discriminate based on race, color, ' +
      'religion, sex, handicap, familial status, or national origin.'
    );
    
    // Equal Housing Opportunity statement
    disclaimers.push(
      'Equal Housing Opportunity\n' +
      `${this.companyInfo.name} is committed to providing equal opportunity in housing without discrimination ` +
      'on the basis of race, color, religion, sex, national origin, familial status, or disability.'
    );
    
    // Data verification disclaimer
    disclaimers.push(
      'All data and statistics presented are subject to change and may not reflect the most current information ' +
      'available. Readers are advised to verify all data independently before making decisions based on this information.'
    );
    
    // Use single newline to avoid double spaces when newlines are replaced with spaces in tests
    return '\n###\n' + disclaimers.join('\n');
  }

  /**
   * Generate data source attributions
   * 
   * @param {Array<string>} sources - Array of data source names
   * @returns {string} Formatted attribution text
   */
  _generateAttributions(sources) {
    try {
      if (!sources || sources.length === 0) {
        return '\n\nMarket data provided by multiple authoritative sources.';
      }
      
      // Format sources list
      const sourceList = sources
        .filter(source => source && source.trim())
        .map(source => {
          // Add URLs for known sources
          if (source.toLowerCase().includes('Example Company')) {
            return 'Example Company Corporation (www.example.com)';
          } else if (source.toLowerCase().includes('Competitor One')) {
            return 'Competitor One Group (www.competitor1.com)';
          } else if (source.toLowerCase().includes('competitor2')) {
            return 'competitor2.com (www.competitor2.com)';
          } else {
            return source;
          }
        })
        .join('\n- ');
      
      return `\n\nMarket data provided by:\n- ${sourceList}\n\n` +
             'Data is subject to change and may not reflect the most current information available. ' +
             'Verify all data independently before making decisions based on this information.';
    } catch (error) {
      this.logger.error('Error generating attributions', { error: error.message, sources });
      return '\n\nMarket data provided by multiple sources.';
    }
  }

  /**
   * Generate contact information in proper format
   * 
   * @returns {string} Formatted contact information
   */
  _generateContactInfo() {
    return `\n\nContact: ${this.companyInfo.contactName}\n` +
           `Phone: ${this.companyInfo.phone}\n` +
           `Email: ${this.companyInfo.email}`;
  }

  /**
   * Get state abbreviation for a city name
   * 
   * @param {string} cityName - City name to look up
   * @returns {string} State abbreviation or 'US' if not found
   * @private
   */
  _getStateAbbreviation(cityName) {
    if (!cityName) return 'US';
    
    // Direct lookup
    if (MARKET_STATE_MAP[cityName]) {
      return MARKET_STATE_MAP[cityName];
    }
    
    // Try partial match (for compound city names)
    for (const [city, state] of Object.entries(MARKET_STATE_MAP)) {
      if (cityName.includes(city) || city.includes(cityName)) {
        return state;
      }
    }
    
    return 'US'; // Default fallback
  }

  /**
   * Validate that content includes required disclaimers
   * Used by QualityValidator to check disclaimer presence
   * 
   * @param {string} content - Press release content to validate
   * @returns {Object} Validation results with score and missing elements
   */
  validateDisclaimers(content) {
    const validation = {
      score: 0,
      maxScore: 100,
      present: [],
      missing: [],
      details: {}
    };

    if (!content) {
      validation.missing = ['all_disclaimers'];
      return validation;
    }

    const contentLower = content.toLowerCase();
    let pointsEarned = 0;

    // Check FOR IMMEDIATE RELEASE (20 points)
    if (content.includes('FOR IMMEDIATE RELEASE')) {
      validation.present.push('for_immediate_release');
      pointsEarned += 20;
      validation.details.forImmediateRelease = true;
    } else {
      validation.missing.push('for_immediate_release');
      validation.details.forImmediateRelease = false;
    }

    // Check Fair Housing Act compliance (20 points)
    if (contentLower.includes('fair housing act')) {
      validation.present.push('fair_housing_act');
      pointsEarned += 20;
      validation.details.fairHousingAct = true;
    } else {
      validation.missing.push('fair_housing_act');
      validation.details.fairHousingAct = false;
    }

    // Check Equal Housing Opportunity (20 points)
    if (contentLower.includes('equal housing opportunity')) {
      validation.present.push('equal_housing_opportunity');
      pointsEarned += 20;
      validation.details.equalHousingOpportunity = true;
    } else {
      validation.missing.push('equal_housing_opportunity');
      validation.details.equalHousingOpportunity = false;
    }

    // Check data source attribution (15 points)
    if (contentLower.includes('data') && (contentLower.includes('provided') || contentLower.includes('source'))) {
      validation.present.push('data_attribution');
      pointsEarned += 15;
      validation.details.dataAttribution = true;
    } else {
      validation.missing.push('data_attribution');
      validation.details.dataAttribution = false;
    }

    // Check informational purposes disclaimer (15 points)
    if (contentLower.includes('informational purposes')) {
      validation.present.push('informational_disclaimer');
      pointsEarned += 15;
      validation.details.informationalDisclaimer = true;
    } else {
      validation.missing.push('informational_disclaimer');
      validation.details.informationalDisclaimer = false;
    }

    // Check contact information (10 points)
    if (contentLower.includes('contact:') || contentLower.includes('phone:') || contentLower.includes('email:')) {
      validation.present.push('contact_info');
      pointsEarned += 10;
      validation.details.contactInfo = true;
    } else {
      validation.missing.push('contact_info');
      validation.details.contactInfo = false;
    }

    validation.score = pointsEarned;
    
    this.logger.debug('Disclaimer validation complete', {
      score: validation.score,
      present: validation.present.length,
      missing: validation.missing.length
    });

    return validation;
  }
}

// Export singleton instance
module.exports = new LegalDisclaimerService();

// Also export class for testing
module.exports.LegalDisclaimerService = LegalDisclaimerService;