/**
 * safePath — secure filesystem path utilities.
 *
 * Defends against path injection / uncontrolled path expression
 * (CodeQL: js/path-injection). User/external-controlled input (job IDs, storage
 * keys, filenames) must never be used to build filesystem paths without
 * containment, or an attacker can escape the intended directory:
 *   - `../../etc/passwd`            → climbs out of the base dir
 *   - `/etc/passwd`                 → absolute path supplied by the user
 *   - `file\0.txt`                  → null-byte truncation tricks
 *   - `..\\..\\windows\\system32`   → Windows-style traversal
 *
 * This module provides two audited primitives (plus boolean wrappers) that all
 * path-handling code in the backend should funnel through, mirroring the
 * Group A `urlAllowlist.js` helper style:
 *
 *   - safeFilename(name)         → validated FLAT filename (single component)
 *   - resolveWithinBase(base, p) → absolute path GUARANTEED to stay inside base
 *   - isSafeFilename / isWithinBase → non-throwing boolean variants
 *
 * CodeQL: addresses js/path-injection.
 */

'use strict';

const path = require('path');

// Strict allow-list for a single user-supplied filename component.
// Alphanumerics plus dot, underscore and hyphen — covers UUIDs, job IDs and
// typical generated artifact names (e.g. `report-123.json`).
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Throw if a string contains a NUL byte (classic poison-null-byte defense).
 * @param {string} value
 * @param {string} label
 */
function assertNoNullByte(value, label) {
  if (value.indexOf('\0') !== -1) {
    throw new Error(`Unsafe ${label}: null byte detected`);
  }
}

/**
 * Validate and return a safe FLAT filename (a single path component).
 *
 * Rejects anything that is not a plain filename: empty values, path separators
 * (POSIX `/` or Windows `\`), `.`/`..`, absolute paths, null bytes, and any
 * character outside the strict allow-list. Returns the original (valid) name so
 * callers can use the return value as the sanitized token.
 *
 * @param {string} name
 * @returns {string} the validated filename
 * @throws {Error|TypeError} when `name` is not a safe flat filename
 */
function safeFilename(name) {
  if (typeof name !== 'string') {
    throw new TypeError('Unsafe filename: expected a string');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Unsafe filename: empty value');
  }
  assertNoNullByte(trimmed, 'filename');

  // Reject explicit traversal / relative tokens.
  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`Unsafe filename: "${trimmed}" is a traversal token`);
  }

  // Reject any path separators (POSIX and Windows) and Windows drive letters.
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Unsafe filename: path separators are not allowed');
  }

  // Reject absolute paths (covers `/etc/passwd`; also defends across platforms).
  if (path.isAbsolute(trimmed)) {
    throw new Error('Unsafe filename: absolute paths are not allowed');
  }

  // A safe flat filename is identical to its own basename.
  if (path.basename(trimmed) !== trimmed) {
    throw new Error('Unsafe filename: must be a single path component');
  }

  // Enforce the strict character allow-list.
  if (!SAFE_FILENAME_RE.test(trimmed)) {
    throw new Error('Unsafe filename: contains disallowed characters');
  }

  return trimmed;
}

/**
 * Non-throwing wrapper around {@link safeFilename}.
 * @param {string} name
 * @returns {boolean} true when `name` is a safe flat filename
 */
function isSafeFilename(name) {
  try {
    safeFilename(name);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Resolve `userPath` against an absolute `baseDir` and guarantee the result
 * stays inside `baseDir`. Allows legitimate multi-segment subpaths
 * (e.g. `jobId/content/narratives/x.json`) while rejecting any traversal that
 * escapes the base, absolute user paths, and null bytes.
 *
 * @param {string} baseDir   trusted base directory (resolved to absolute)
 * @param {string} userPath  untrusted relative path/key (may be multi-segment)
 * @returns {string} absolute, contained path
 * @throws {Error|TypeError} when the path escapes the base or is otherwise unsafe
 */
function resolveWithinBase(baseDir, userPath) {
  if (typeof baseDir !== 'string' || !baseDir.trim()) {
    throw new TypeError('resolveWithinBase: baseDir must be a non-empty string');
  }
  if (typeof userPath !== 'string') {
    throw new TypeError('resolveWithinBase: userPath must be a string');
  }

  assertNoNullByte(baseDir, 'base directory');
  assertNoNullByte(userPath, 'path');

  // Reject user-supplied absolute paths outright — callers always intend a
  // path relative to baseDir.
  if (path.isAbsolute(userPath)) {
    throw new Error('Unsafe path: absolute paths are not allowed');
  }

  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(resolvedBase, userPath);

  // Containment check: either exactly the base, or strictly beneath it.
  // The `path.sep` suffix prevents sibling-prefix bypasses such as
  // `/tmp/sp-base-evil` being treated as within `/tmp/sp-base`.
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error('Unsafe path: resolved path escapes the base directory');
  }

  return resolved;
}

/**
 * Non-throwing wrapper around {@link resolveWithinBase}.
 * @param {string} baseDir
 * @param {string} userPath
 * @returns {boolean} true when `userPath` resolves safely within `baseDir`
 */
function isWithinBase(baseDir, userPath) {
  try {
    resolveWithinBase(baseDir, userPath);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  safeFilename,
  isSafeFilename,
  resolveWithinBase,
  isWithinBase,
  SAFE_FILENAME_RE,
};
