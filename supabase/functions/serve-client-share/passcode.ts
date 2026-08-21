/**
 * Client-share passcode hashing — the format both ends must agree on.
 *
 * Stored in `client_shares.passcode_hash` as a single self-describing string:
 *
 *     pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
 *
 * Self-describing so the parameters can be raised later without a migration:
 * old rows keep verifying with their own iteration count, new rows are written
 * with the current one.
 *
 * PBKDF2-SHA256 via WebCrypto rather than bcrypt/argon2 because both ends of
 * this feature are WebCrypto environments — this function (Deno) verifies, and
 * the publish dialog (browser) hashes — and a shared, dependency-free
 * implementation is worth more here than a marginally better KDF. The passcode
 * is a courtesy lock on a link that is already 128 bits of unguessable entropy,
 * not the primary access control.
 *
 * Verification is timing-safe: the comparison is a constant-time byte walk, and
 * a share with no passcode is rejected before any of this runs.
 */

/** Current work factor for newly hashed passcodes. */
export const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(
  passcode: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Hash a passcode for storage. Used by the publish flow. */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(passcode, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Constant-time byte comparison — no early exit on the first mismatch. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time comparison of two strings of arbitrary length. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

/**
 * Verify a candidate passcode against a stored hash. Returns false for anything
 * malformed rather than throwing, so a corrupt row denies access instead of
 * turning into a 500 that tells an attacker the row exists.
 */
export async function verifyPasscode(candidate: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5) return false;
  const [scheme, hashName, iterationsRaw, saltB64, hashB64] = parts;
  if (scheme !== 'pbkdf2' || hashName !== 'sha256') return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000) return false;

  try {
    const derived = await derive(candidate, fromBase64(saltB64), iterations);
    return timingSafeEqual(derived, fromBase64(hashB64));
  } catch {
    return false;
  }
}
