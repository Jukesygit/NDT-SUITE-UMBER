/**
 * Backup-code generation, encoding and verification — the pure half of
 * `manage-backup-codes`, kept beside index.ts so it can be unit tested without a
 * Deno runtime or a database (same split as serve-client-share/passcode.ts).
 *
 * STORAGE FORMAT
 * Codes are stored as the same self-describing string the client-share passcode
 * uses, so the work factor can be raised later without a migration:
 *
 *     pbkdf2$sha256$<iterations>$<saltBase64>$<hashBase64>
 *
 * WHY ONE SALT PER BATCH
 * A per-code random salt would force one PBKDF2 derivation per stored code on
 * every verification — ten derivations at 210k iterations is far past an edge
 * function's CPU budget. A salt is only required to be UNIQUE, not per-row, so a
 * batch shares one fresh random salt and verification derives ONCE per distinct
 * (iterations, salt) group. `findMatchingCode` groups rather than assuming, so a
 * user holding rows from two different batches still verifies correctly — it just
 * costs one derivation per batch present.
 *
 * WHY PBKDF2 AT ALL, GIVEN THE CODES ARE RANDOM
 * A code carries 40 bits of entropy (8 symbols from a 32-symbol alphabet), so
 * online guessing is hopeless on entropy alone. The KDF is there for the
 * database-leak case: it turns a stolen digest into an infeasible offline search
 * instead of a rainbow-table lookup.
 *
 * COST, measured: one derivation is roughly 75-150ms. A verification is ONE
 * derivation; minting a batch is ten (~0.8s), which is the most CPU either
 * action spends and is why minting is rate limited harder than redeeming. If
 * that ever crowds the edge CPU budget, the safe knob is PBKDF2_ITERATIONS —
 * against a 40-bit random secret the work factor is defence in depth, not the
 * thing standing between an attacker and the code.
 */

/** Codes minted per generation batch. */
export const BACKUP_CODE_COUNT = 10;

/** Symbols per code. 8 symbols x 5 bits = 40 bits of entropy. */
export const BACKUP_CODE_LENGTH = 8;

/** Current work factor for newly hashed codes. Matches the client-share passcode. */
export const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * Crockford Base32 — the digits plus A-Z with I, L, O and U removed.
 *
 * Exactly 32 symbols, and 256 is a whole multiple of 32, so drawing a symbol
 * with `byte % 32` is uniform: no rejection sampling and no modulo bias.
 * Dropping I/L/O/U also means a transcription of "I" or "O" is unambiguous, so
 * `normalizeBackupCode` can fold them into 1 and 0 without ever colliding with a
 * symbol that could legitimately have been generated.
 */
export const BACKUP_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Derive key material for one code.
 *
 * SCAR (client-share passcode, Node 20 CI): hand crypto.subtle a Uint8Array
 * VIEW. Passing a detached `.buffer.slice()` copy fails on Node 20. `salt` is
 * used as given and `new Uint8Array(bits)` wraps the returned buffer directly.
 */
async function derive(
  canonicalCode: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(canonicalCode),
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

/** Constant-time byte comparison — no early exit on the first mismatch. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Canonical form of a user-typed code, or null if it could never be one of ours.
 *
 * Accepts the formatting the UI hands out ("ABCD-EFGH"), plus lowercase, spaces
 * and the usual transcription slips (I/l -> 1, O -> 0). Returns the bare
 * 8-symbol string that was hashed. Anything else is null, and the caller must
 * answer a null exactly as it answers a wrong code — a distinct "malformed"
 * reply would tell an attacker when they had at least hit the right shape.
 */
export function normalizeBackupCode(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;

  const stripped = input.toUpperCase().replace(/[^0-9A-Z]/g, '');

  // Fold the ambiguous glyphs. Safe because none of them is in the alphabet, so
  // this can never rewrite one legitimate symbol into a different one.
  const folded = stripped.replace(/[IL]/g, '1').replace(/O/g, '0');

  if (folded.length !== BACKUP_CODE_LENGTH) return null;
  for (const char of folded) {
    if (!BACKUP_CODE_ALPHABET.includes(char)) return null;
  }
  return folded;
}

/** Display form: "ABCDEFGH" -> "ABCD-EFGH". Purely cosmetic; never hashed. */
export function formatBackupCode(canonical: string): string {
  const half = Math.floor(canonical.length / 2);
  return `${canonical.slice(0, half)}-${canonical.slice(half)}`;
}

/**
 * Mint `count` distinct codes in canonical form using CSPRNG bytes.
 *
 * Distinctness is enforced here rather than left to chance so the unique index
 * on (user_id, code_hash) can never reject a legitimate batch.
 */
export function generateBackupCodes(count: number = BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();

  // Bounded so a pathological RNG cannot spin forever; a collision at 40 bits is
  // already vanishingly unlikely.
  for (let attempt = 0; codes.size < count && attempt < count * 100; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(BACKUP_CODE_LENGTH));
    let code = '';
    for (const byte of bytes) {
      code += BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length];
    }
    codes.add(code);
  }

  return [...codes];
}

/**
 * Hash a whole batch under ONE fresh random salt.
 *
 * Returns the encoded strings positionally aligned with `canonicalCodes`.
 */
export async function hashBackupCodes(canonicalCodes: string[]): Promise<string[]> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const saltB64 = toBase64(salt);

  const encoded: string[] = [];
  for (const code of canonicalCodes) {
    const hash = await derive(code, salt, PBKDF2_ITERATIONS);
    encoded.push(`pbkdf2$sha256$${PBKDF2_ITERATIONS}$${saltB64}$${toBase64(hash)}`);
  }
  return encoded;
}

interface ParsedHash {
  iterations: number;
  saltB64: string;
  hashB64: string;
}

/**
 * Parse an encoded digest, or null for anything malformed. A corrupt row must
 * deny the code rather than throw — a 500 here would confirm the row exists.
 */
export function parseEncodedHash(stored: string): ParsedHash | null {
  if (typeof stored !== 'string') return null;

  const parts = stored.split('$');
  if (parts.length !== 5) return null;

  const [scheme, hashName, iterationsRaw, saltB64, hashB64] = parts;
  if (scheme !== 'pbkdf2' || hashName !== 'sha256') return null;

  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 5_000_000) return null;
  if (!saltB64 || !hashB64) return null;

  return { iterations, saltB64, hashB64 };
}

/** The shape `findMatchingCode` needs from a stored row. */
export interface StoredBackupCode {
  id: string;
  code_hash: string;
}

/**
 * Find which of `stored` the candidate redeems, or null.
 *
 * Derives once per distinct (iterations, salt) group rather than once per row,
 * which keeps a ten-code verification at a single PBKDF2 pass in the normal case
 * where the whole batch shares a salt.
 *
 * The scan does not break on the first hit: every row in a group is compared
 * with a constant-time equality. The remaining timing signal is which of the
 * caller's OWN codes matched, which tells an attacker nothing they could use.
 */
export async function findMatchingCode(
  candidate: string,
  stored: StoredBackupCode[]
): Promise<StoredBackupCode | null> {
  const canonical = normalizeBackupCode(candidate);
  if (!canonical) return null;

  // Group by work factor + salt so each distinct pair costs one derivation.
  const groups = new Map<string, { iterations: number; salt: Uint8Array; rows: Array<{ row: StoredBackupCode; hash: Uint8Array }> }>();

  for (const row of stored) {
    const parsed = parseEncodedHash(row?.code_hash);
    if (!parsed) continue;

    const key = `${parsed.iterations}$${parsed.saltB64}`;
    let group = groups.get(key);
    if (!group) {
      try {
        group = { iterations: parsed.iterations, salt: fromBase64(parsed.saltB64), rows: [] };
      } catch {
        continue;
      }
      groups.set(key, group);
    }

    try {
      group.rows.push({ row, hash: fromBase64(parsed.hashB64) });
    } catch {
      // Undecodable digest — skip the row, never surface an error.
    }
  }

  let match: StoredBackupCode | null = null;

  for (const group of groups.values()) {
    let derived: Uint8Array;
    try {
      derived = await derive(canonical, group.salt, group.iterations);
    } catch {
      continue;
    }
    for (const { row, hash } of group.rows) {
      if (timingSafeEqual(derived, hash)) match = row;
    }
  }

  return match;
}
