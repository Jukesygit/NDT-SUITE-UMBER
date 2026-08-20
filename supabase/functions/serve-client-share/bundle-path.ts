/**
 * Bundle path resolution — the containment boundary of the whole feature.
 *
 * A client asks for a file BY NAME. Everything anonymous flows through here, so
 * this module's only job is: a request can never address an object outside its
 * own share's current revision prefix.
 *
 * Rules, all of them deny-by-default:
 *   • the relative path must match a strict allowlist of characters;
 *   • no segment may be empty, `.` or `..` (so no traversal, and no collapsing
 *     of a doubled slash into a parent walk);
 *   • no leading slash, no scheme, no backslash (Windows-style traversal), no
 *     percent-encoding (a decoded `%2e%2e` is the classic bypass);
 *   • the stored prefix itself is re-validated, so a corrupted `bundle_path`
 *     cannot be used to reach another share.
 *
 * The result is always `<bundlePath>/<relative>`, built by concatenation from
 * validated parts — never by resolving or normalising a caller-supplied string.
 */

/** Letters, digits, dot, dash, underscore and the path separator. Nothing else. */
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/** `<uuid>/rev-<n>` — the exact shape the migration documents. */
const BUNDLE_PREFIX_PATTERN =
  /^[0-9a-fA-F-]{36}\/rev-[1-9][0-9]*$/;

/** Longest relative path we will consider; well past any real bundle entry. */
const MAX_RELATIVE_LENGTH = 256;

function segmentsValid(path: string): boolean {
  const segments = path.split('/');
  if (segments.length === 0 || segments.length > 8) return false;
  return segments.every(
    (segment) => segment !== '' && segment !== '.' && segment !== '..' && SEGMENT_PATTERN.test(segment)
  );
}

/**
 * Resolve a client-requested relative path inside a share's bundle prefix.
 *
 * @returns The storage object key, or null when the request is not obviously
 *          safe. Callers must treat null as "not found" — never as an error
 *          worth describing, which would confirm the share exists.
 */
export function resolveBundleObjectKey(
  bundlePath: string,
  relative: string
): string | null {
  if (!BUNDLE_PREFIX_PATTERN.test(bundlePath)) return null;

  if (typeof relative !== 'string' || relative.length === 0) return null;
  if (relative.length > MAX_RELATIVE_LENGTH) return null;
  // Reject the encodings before the characters: `%` never appears in a name we
  // generate, so anything percent-shaped is an attempt at something.
  if (relative.includes('%') || relative.includes('\\') || relative.includes('\0')) return null;
  if (relative.startsWith('/')) return null;
  if (!segmentsValid(relative)) return null;

  return `${bundlePath}/${relative}`;
}

/** The manifest is always at the root of a revision — never client-addressed. */
export function manifestObjectKey(bundlePath: string): string | null {
  return BUNDLE_PREFIX_PATTERN.test(bundlePath) ? `${bundlePath}/manifest.json` : null;
}
