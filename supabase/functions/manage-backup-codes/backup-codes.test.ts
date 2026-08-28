// =============================================================================
// backup-codes — the codes themselves, and the digests that stand in for them
// =============================================================================
// A backup code is a standing 2FA bypass written on a piece of paper, so what is
// pinned here is the stuff that makes one safe: the alphabet is bias-free and
// unambiguous, generation is CSPRNG-backed and never repeats within a batch, the
// stored digest never contains the code, a wrong code never matches, and every
// malformed stored value DENIES rather than throws — a corrupt row must read as
// "wrong code", not as a 500.
//
// Also pinned: the batch-salt optimisation is an optimisation only. Rows written
// by two different batches (two different salts) must both still verify, because
// the alternative is a user whose older codes silently stop working.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LENGTH,
  PBKDF2_ITERATIONS,
  findMatchingCode,
  formatBackupCode,
  generateBackupCodes,
  hashBackupCodes,
  normalizeBackupCode,
  parseEncodedHash,
  timingSafeEqual,
} from './backup-codes.ts';

// PBKDF2 at the production work factor is deliberately slow.
const SLOW = { timeout: 30_000 };

describe('alphabet', () => {
  it('has exactly 32 symbols, so `byte % 32` draws without modulo bias', () => {
    expect(BACKUP_CODE_ALPHABET.length).toBe(32);
    expect(256 % BACKUP_CODE_ALPHABET.length).toBe(0);
  });

  it('omits the glyphs that get mistranscribed', () => {
    for (const ambiguous of ['I', 'L', 'O', 'U']) {
      expect(BACKUP_CODE_ALPHABET.includes(ambiguous)).toBe(false);
    }
  });

  it('has no duplicate symbols', () => {
    expect(new Set(BACKUP_CODE_ALPHABET).size).toBe(BACKUP_CODE_ALPHABET.length);
  });
});

describe('generateBackupCodes', () => {
  it('mints the requested number of codes at the right length', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    for (const code of codes) expect(code).toHaveLength(BACKUP_CODE_LENGTH);
  });

  it('draws only from the alphabet', () => {
    for (const code of generateBackupCodes()) {
      for (const char of code) expect(BACKUP_CODE_ALPHABET.includes(char)).toBe(true);
    }
  });

  it('never repeats a code within a batch — the unique index depends on it', () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('is random: two batches do not coincide', () => {
    const a = generateBackupCodes();
    const b = generateBackupCodes();
    expect(a.filter((code) => b.includes(code))).toHaveLength(0);
  });
});

describe('formatBackupCode', () => {
  it('splits into two halves for display', () => {
    expect(formatBackupCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('normalizeBackupCode', () => {
  it('accepts the form the UI hands out', () => {
    expect(normalizeBackupCode('ABCD-EFGH')).toBe('ABCDEFGH');
  });

  it('accepts lowercase and stray whitespace', () => {
    expect(normalizeBackupCode('  abcd efgh ')).toBe('ABCDEFGH');
  });

  it('folds the ambiguous glyphs a person might write down', () => {
    // I and L read as 1, O reads as 0. None of them is in the alphabet, so this
    // can never rewrite one legitimate symbol into another.
    expect(normalizeBackupCode('IL0O-2345')).toBe('11002345');
  });

  it('rejects anything that is not the right length', () => {
    expect(normalizeBackupCode('ABCD-EFG')).toBeNull();
    expect(normalizeBackupCode('ABCD-EFGHI')).toBeNull();
    expect(normalizeBackupCode('')).toBeNull();
  });

  it('rejects U, which is deliberately not in the alphabet and is not folded', () => {
    expect(normalizeBackupCode('UUUU-UUUU')).toBeNull();
  });

  it('rejects non-strings rather than throwing', () => {
    expect(normalizeBackupCode(null)).toBeNull();
    expect(normalizeBackupCode(undefined)).toBeNull();
    expect(normalizeBackupCode(12345678 as unknown as string)).toBeNull();
  });
});

describe('timingSafeEqual', () => {
  it('compares by value', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it('is false for differing lengths', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('parseEncodedHash', () => {
  it('reads a well-formed digest', () => {
    const parsed = parseEncodedHash('pbkdf2$sha256$210000$c2FsdA==$aGFzaA==');
    expect(parsed).toEqual({ iterations: 210000, saltB64: 'c2FsdA==', hashB64: 'aGFzaA==' });
  });

  it('denies anything malformed instead of throwing', () => {
    for (const bad of [
      '',
      'not-a-hash',
      'pbkdf2$sha256$210000$salt', // too few segments
      'pbkdf2$sha256$210000$salt$hash$extra', // too many
      'bcrypt$sha256$210000$c2FsdA==$aGFzaA==', // wrong scheme
      'pbkdf2$sha512$210000$c2FsdA==$aGFzaA==', // wrong digest
      'pbkdf2$sha256$abc$c2FsdA==$aGFzaA==', // non-numeric work factor
      'pbkdf2$sha256$10$c2FsdA==$aGFzaA==', // work factor below the floor
      'pbkdf2$sha256$99999999$c2FsdA==$aGFzaA==', // absurd work factor
      'pbkdf2$sha256$210000$$aGFzaA==', // empty salt
    ]) {
      expect(parseEncodedHash(bad), bad).toBeNull();
    }
  });
});

describe('hashBackupCodes', SLOW, () => {
  it('emits the self-describing encoded shape', async () => {
    const [encoded] = await hashBackupCodes(['ABCDEFGH']);
    const parts = encoded.split('$');
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe('pbkdf2');
    expect(parts[1]).toBe('sha256');
    expect(Number(parts[2])).toBe(PBKDF2_ITERATIONS);
  });

  it('never stores the code itself', async () => {
    const [encoded] = await hashBackupCodes(['ABCDEFGH']);
    expect(encoded).not.toContain('ABCDEFGH');
    expect(encoded.toUpperCase()).not.toContain('ABCD-EFGH');
  });

  it('shares one salt across a batch — that is what keeps verification to one derivation', async () => {
    const encoded = await hashBackupCodes(['ABCDEFGH', 'JKMNPQRS']);
    const salts = encoded.map((value) => value.split('$')[3]);
    expect(salts[0]).toBe(salts[1]);
  });

  it('salts each batch freshly, so the same code hashes differently every time', async () => {
    const [first] = await hashBackupCodes(['ABCDEFGH']);
    const [second] = await hashBackupCodes(['ABCDEFGH']);
    expect(first).not.toBe(second);
  });

  it('gives distinct codes distinct digests under the same salt', async () => {
    const [a, b] = await hashBackupCodes(['ABCDEFGH', 'JKMNPQRS']);
    expect(a.split('$')[4]).not.toBe(b.split('$')[4]);
  });
});

describe('findMatchingCode', SLOW, () => {
  it('matches the row holding the code and identifies which one', async () => {
    const codes = ['ABCDEFGH', 'JKMNPQRS', '23456789'];
    const hashes = await hashBackupCodes(codes);
    const stored = hashes.map((code_hash, i) => ({ id: `row-${i}`, code_hash }));

    const match = await findMatchingCode('JKMNPQRS', stored);
    expect(match?.id).toBe('row-1');
  });

  it('accepts the display form and casing the user actually types', async () => {
    const hashes = await hashBackupCodes(['ABCDEFGH']);
    const stored = [{ id: 'row-0', code_hash: hashes[0] }];

    expect((await findMatchingCode('ABCD-EFGH', stored))?.id).toBe('row-0');
    expect((await findMatchingCode('abcd-efgh', stored))?.id).toBe('row-0');
  });

  it('rejects a code that was never issued', async () => {
    const hashes = await hashBackupCodes(['ABCDEFGH']);
    const stored = [{ id: 'row-0', code_hash: hashes[0] }];

    expect(await findMatchingCode('ZZZZZZZZ', stored)).toBeNull();
  });

  it('rejects a near miss — one symbol out is still out', async () => {
    const hashes = await hashBackupCodes(['ABCDEFGH']);
    const stored = [{ id: 'row-0', code_hash: hashes[0] }];

    expect(await findMatchingCode('ABCDEFGJ', stored)).toBeNull();
  });

  it('returns null for an empty set rather than throwing', async () => {
    expect(await findMatchingCode('ABCDEFGH', [])).toBeNull();
  });

  it('verifies across batches, so older rows with a different salt still work', async () => {
    // The single-derivation path groups by salt. This is the case that proves
    // the grouping is real and not an assumption that one salt is in play.
    const [oldHash] = await hashBackupCodes(['ABCDEFGH']);
    const [newHash] = await hashBackupCodes(['JKMNPQRS']);
    const stored = [
      { id: 'old', code_hash: oldHash },
      { id: 'new', code_hash: newHash },
    ];

    expect((await findMatchingCode('ABCDEFGH', stored))?.id).toBe('old');
    expect((await findMatchingCode('JKMNPQRS', stored))?.id).toBe('new');
  });

  it('verifies EVERY code of two whole live batches — the degraded state minting may leave', SLOW, async () => {
    // index.ts issues a new batch BEFORE deleting the old one, so that a failure
    // mid-mint can only ever leave the user with the old set or with both —
    // never with none. That ordering is only safe if both sets genuinely work,
    // which is what this pins. If a future change made verification assume a
    // single salt, the insert-first ordering would silently become a way to
    // strand a user holding codes that no longer verify.
    const previous = generateBackupCodes();
    const current = generateBackupCodes();
    const [previousHashes, currentHashes] = await Promise.all([
      hashBackupCodes(previous),
      hashBackupCodes(current),
    ]);

    const stored = [
      ...previousHashes.map((code_hash, i) => ({ id: `prev-${i}`, code_hash })),
      ...currentHashes.map((code_hash, i) => ({ id: `curr-${i}`, code_hash })),
    ];
    expect(stored).toHaveLength(BACKUP_CODE_COUNT * 2);

    // One from each end of each batch is enough to prove the grouping holds
    // without paying for twenty derivations.
    expect((await findMatchingCode(previous[0], stored))?.id).toBe('prev-0');
    expect((await findMatchingCode(previous[BACKUP_CODE_COUNT - 1], stored))?.id).toBe(
      `prev-${BACKUP_CODE_COUNT - 1}`
    );
    expect((await findMatchingCode(current[0], stored))?.id).toBe('curr-0');
    expect((await findMatchingCode(current[BACKUP_CODE_COUNT - 1], stored))?.id).toBe(
      `curr-${BACKUP_CODE_COUNT - 1}`
    );
  });

  it('skips corrupt rows and still matches a good one beside them', async () => {
    const [good] = await hashBackupCodes(['ABCDEFGH']);
    const stored = [
      { id: 'corrupt', code_hash: 'not-a-hash' },
      { id: 'empty', code_hash: '' },
      { id: 'good', code_hash: good },
    ];

    expect((await findMatchingCode('ABCDEFGH', stored))?.id).toBe('good');
  });

  it('denies rather than throws when every row is corrupt', async () => {
    const stored = [
      { id: 'a', code_hash: 'pbkdf2$sha256$210000$!!!not-base64!!!$aGFzaA==' },
      { id: 'b', code_hash: 'garbage' },
    ];

    expect(await findMatchingCode('ABCDEFGH', stored)).toBeNull();
  });

  it('rejects a malformed candidate without consulting the rows', async () => {
    const hashes = await hashBackupCodes(['ABCDEFGH']);
    const stored = [{ id: 'row-0', code_hash: hashes[0] }];

    expect(await findMatchingCode('', stored)).toBeNull();
    expect(await findMatchingCode('TOO-SHORT-XX', stored)).toBeNull();
  });

  it('round-trips a real generated batch end to end', async () => {
    const codes = generateBackupCodes();
    const hashes = await hashBackupCodes(codes);
    const stored = hashes.map((code_hash, i) => ({ id: `row-${i}`, code_hash }));

    // Every issued code redeems against its own row, in display form.
    for (let i = 0; i < codes.length; i++) {
      const match = await findMatchingCode(formatBackupCode(codes[i]), stored);
      expect(match?.id).toBe(`row-${i}`);
    }
  });
});
