// =============================================================================
// passcode — the hash format both ends of client sharing must agree on
// =============================================================================
// The publish dialog (browser) writes these hashes and the edge function (Deno)
// verifies them, so the format is a contract between two runtimes. What is
// pinned here: the encoded shape, that a hash is salted (never deterministic),
// that verification is exact, and that every malformed stored value DENIES
// rather than throws — a corrupt row must read as "wrong passcode", not as a
// 500 that confirms the share exists.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  PBKDF2_ITERATIONS,
  hashPasscode,
  timingSafeEqual,
  timingSafeEqualStrings,
  verifyPasscode,
} from './passcode.ts';

// PBKDF2 at the production work factor is deliberately slow; a handful of
// derivations per test is fine, but these blocks get a wider budget than default.
const SLOW = { timeout: 20_000 };

describe('hashPasscode', SLOW, () => {
  it('encodes scheme, hash, iterations, salt and digest', async () => {
    const parts = (await hashPasscode('open sesame')).split('$');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('pbkdf2');
    expect(parts[1]).toBe('sha256');
    expect(Number(parts[2])).toBe(PBKDF2_ITERATIONS);
    expect(parts[3].length).toBeGreaterThan(0);
    expect(parts[4].length).toBeGreaterThan(0);
  });

  it('salts, so the same passcode never hashes to the same string', async () => {
    const [a, b] = await Promise.all([hashPasscode('same'), hashPasscode('same')]);
    expect(a).not.toBe(b);
  });
});

describe('verifyPasscode', SLOW, () => {
  it('accepts the right passcode', async () => {
    const stored = await hashPasscode('correct horse');
    expect(await verifyPasscode('correct horse', stored)).toBe(true);
  });

  it('rejects the wrong passcode, including near misses', async () => {
    const stored = await hashPasscode('correct horse');
    expect(await verifyPasscode('correct hors', stored)).toBe(false);
    expect(await verifyPasscode('Correct horse', stored)).toBe(false);
    expect(await verifyPasscode('', stored)).toBe(false);
  });

  it('round-trips unicode and long passcodes', async () => {
    const passcode = 'pä§§ – wörd 🔒 '.repeat(4);
    const stored = await hashPasscode(passcode);
    expect(await verifyPasscode(passcode, stored)).toBe(true);
  });

  it('denies — never throws — on a malformed stored hash', async () => {
    const malformed = [
      '',
      'not-a-hash',
      'pbkdf2$sha256$1000',
      'bcrypt$sha256$210000$c2FsdA==$aGFzaA==',
      'pbkdf2$sha512$210000$c2FsdA==$aGFzaA==',
      'pbkdf2$sha256$abc$c2FsdA==$aGFzaA==',
      'pbkdf2$sha256$1$c2FsdA==$aGFzaA==', // work factor below the floor
      'pbkdf2$sha256$99999999$c2FsdA==$aGFzaA==', // absurd work factor
      'pbkdf2$sha256$210000$!!!not-base64!!!$aGFzaA==',
    ];
    for (const stored of malformed) {
      expect(await verifyPasscode('anything', stored)).toBe(false);
    }
  });

  it('derives with the iteration count in the string, not the current constant', async () => {
    // Take a real hash and rewrite ONLY its iteration count. If the verifier
    // ignored the stored value and always used PBKDF2_ITERATIONS, this would
    // still verify — the failure is what proves the parameter is honoured, and
    // is what lets the work factor be raised without invalidating old rows.
    const stored = await hashPasscode('x');
    const [, , , salt, digest] = stored.split('$');
    expect(await verifyPasscode('x', `pbkdf2$sha256$1000$${salt}$${digest}`)).toBe(false);
    expect(await verifyPasscode('x', stored)).toBe(true);
  });
});

describe('timing-safe comparison', () => {
  it('matches identical byte sequences', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it('rejects a single differing byte, at any position', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([9, 2, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 9]))).toBe(false);
  });

  it('rejects differing lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });

  it('compares strings the same way', () => {
    expect(timingSafeEqualStrings('token-abc', 'token-abc')).toBe(true);
    expect(timingSafeEqualStrings('token-abc', 'token-abd')).toBe(false);
    expect(timingSafeEqualStrings('token-abc', 'token-ab')).toBe(false);
  });
});
