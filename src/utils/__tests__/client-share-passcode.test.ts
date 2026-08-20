// =============================================================================
// client-share passcode — the browser mirror must not drift from the Deno one
// =============================================================================
// The passcode format is a contract between two runtimes that cannot import
// each other: the publish dialog (browser, `src/utils/client-share-passcode.ts`)
// writes hashes that the edge function (Deno,
// `supabase/functions/serve-client-share/passcode.ts`) has to verify.
//
// Duplicated code with no test is a bug waiting for a deploy. So this file
// imports BOTH implementations and asserts they agree in both directions —
// change one and this fails until you change the other.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  PBKDF2_ITERATIONS as BROWSER_ITERATIONS,
  hashPasscode as browserHash,
} from '../client-share-passcode';
import {
  PBKDF2_ITERATIONS as EDGE_ITERATIONS,
  hashPasscode as edgeHash,
  verifyPasscode as edgeVerify,
} from '../../../supabase/functions/serve-client-share/passcode.ts';

// PBKDF2 at the production work factor is deliberately slow.
const SLOW = { timeout: 20_000 };

describe('browser ↔ edge passcode contract', SLOW, () => {
  it('agrees on the work factor', () => {
    expect(BROWSER_ITERATIONS).toBe(EDGE_ITERATIONS);
  });

  it('produces the same encoded shape', async () => {
    const [browser, edge] = await Promise.all([browserHash('shared'), edgeHash('shared')]);
    const [b, e] = [browser.split('$'), edge.split('$')];
    expect(b.slice(0, 3)).toEqual(e.slice(0, 3));
    // Same salt and digest widths — a mismatch here means one side changed
    // SALT_BYTES or KEY_BITS without the other.
    expect(b[3].length).toBe(e[3].length);
    expect(b[4].length).toBe(e[4].length);
  });

  it('lets the edge function verify a hash the browser wrote', async () => {
    const stored = await browserHash('correct horse battery staple');
    expect(await edgeVerify('correct horse battery staple', stored)).toBe(true);
    expect(await edgeVerify('wrong horse', stored)).toBe(false);
  });

  it('holds for unicode passcodes, which encode differently if either side slips', async () => {
    const passcode = 'påsskøde-🔐';
    const stored = await browserHash(passcode);
    expect(await edgeVerify(passcode, stored)).toBe(true);
  });

  it('salts on the browser side too — no two publishes share a hash', async () => {
    const [a, b] = await Promise.all([browserHash('same'), browserHash('same')]);
    expect(a).not.toBe(b);
    expect(await edgeVerify('same', a)).toBe(true);
    expect(await edgeVerify('same', b)).toBe(true);
  });
});
