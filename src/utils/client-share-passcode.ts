/**
 * Client-share passcode hashing — BROWSER MIRROR of
 * `supabase/functions/serve-client-share/passcode.ts`.
 *
 * The publish dialog hashes; the edge function verifies. Two runtimes, one
 * format, so the algorithm is duplicated rather than imported: `src` cannot
 * import out of the Deno function tree without dragging it into the app's
 * TypeScript project and its bundle.
 *
 * The duplication is held honest by
 * `src/utils/__tests__/client-share-passcode.test.ts`, which imports BOTH files
 * and asserts each side verifies the other's hashes. If you change one, that
 * test fails until you change the other — which is the point.
 *
 * Format (self-describing, so the work factor can be raised without a migration):
 *
 *     pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
 */

/** Current work factor. Must match the Deno mirror. */
export const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function derive(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  // WebCrypto's BufferSource wants an ArrayBuffer-backed view; TS's default
  // Uint8Array is ArrayBufferLike (SharedArrayBuffer included), so the salt is
  // handed over as its own buffer slice.
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/**
 * Hash a passcode for storage in `client_shares.passcode_hash`.
 *
 * The plaintext never leaves this call: the publish dialog hands the hash to the
 * service layer, and the passcode itself is only ever sent again by the CLIENT,
 * to the edge function, over TLS.
 */
export async function hashPasscode(passcode: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(passcode, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}
