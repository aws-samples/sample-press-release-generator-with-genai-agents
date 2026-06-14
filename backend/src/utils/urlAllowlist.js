/**
 * urlAllowlist — secure host allow-listing utilities.
 *
 * Replaces bypassable substring checks (e.g. `url.includes('trusted.com')`) used
 * for host validation. Substring checks are insecure because the trusted token can
 * appear anywhere in the URL string:
 *   - `https://trusted.com.attacker.com`   → attacker-controlled host, contains token
 *   - `https://attacker.com/?x=trusted.com` → token in query/path
 *
 * The functions here parse the URL with the WHATWG `URL` parser and compare the
 * `hostname` against an exact allow-list using strict equality OR a proper
 * subdomain suffix match (`host === domain || host.endsWith('.' + domain)`).
 *
 * CodeQL: addresses js/incomplete-url-substring-sanitization.
 */

'use strict';

/**
 * Extract a lower-cased hostname from a URL or bare host string.
 * Accepts full URLs ("https://www.census.gov/x") and bare hosts ("census.gov").
 * Returns null when the input cannot be resolved to a hostname.
 *
 * @param {string} input
 * @returns {string|null}
 */
function extractHostname(input) {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // Fast path: already a valid absolute URL.
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch (_) {
    // Not an absolute URL; fall through.
  }

  // Treat as a scheme-less value (bare host or host/path). Prepend a scheme so
  // the WHATWG parser can extract the authority component reliably.
  try {
    return new URL(`https://${trimmed}`).hostname.toLowerCase();
  } catch (_) {
    return null;
  }
}

/**
 * Strict host-vs-domain match: exact host OR a true subdomain of `domain`.
 * Rejects substring spoofs like `census.gov.attacker.com` or `notcensus.gov`.
 *
 * @param {string} host    already-parsed hostname (case-insensitive)
 * @param {string} domain  allow-listed registrable domain (e.g. "census.gov")
 * @returns {boolean}
 */
function hostMatches(host, domain) {
  if (typeof host !== 'string' || typeof domain !== 'string') {
    return false;
  }
  const h = host.toLowerCase().replace(/\.$/, ''); // strip trailing dot
  const d = domain.toLowerCase().replace(/\.$/, '');
  if (!h || !d) {
    return false;
  }
  return h === d || h.endsWith('.' + d);
}

/**
 * Parse `url` and test whether its hostname matches the allow-listed `domain`
 * (exact or proper subdomain). Safe against substring-injection bypasses.
 *
 * @param {string} url
 * @param {string} domain
 * @returns {boolean}
 */
function urlMatchesDomain(url, domain) {
  const host = extractHostname(url);
  if (host === null) {
    return false;
  }
  return hostMatches(host, domain);
}

/**
 * Test whether `url`'s hostname matches ANY domain in `domains`.
 *
 * @param {string} url
 * @param {string[]} domains
 * @returns {boolean}
 */
function urlMatchesAnyDomain(url, domains) {
  const host = extractHostname(url);
  if (host === null || !Array.isArray(domains)) {
    return false;
  }
  return domains.some((d) => hostMatches(host, d));
}

module.exports = {
  extractHostname,
  hostMatches,
  urlMatchesDomain,
  urlMatchesAnyDomain,
};
