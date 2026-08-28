// =============================================================================
// jwt-claims — reading `aal` off an already-verified token
// =============================================================================
// These helpers decide whether a caller has actually cleared a TOTP challenge,
// which is what stands between an aal1 (password-only) session and minting
// itself a permanent 2FA bypass. So the property that matters most is that they
// FAIL CLOSED: every shape this code does not understand — no header, junk
// token, absent claim, unexpected claim value — must read as "not aal2".
//
// Nothing here verifies a signature, and nothing should: `verifyAuth` has
// already handed the token to getUser() by the time these run. What is pinned is
// the decoding, not the trust decision.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { assuranceLevel, bearerToken, decodeJwtPayload, hasAal2 } from './jwt-claims.ts';

/**
 * base64url with the padding stripped, exactly as a real JWT carries it.
 *
 * UTF-8 encodes before btoa, because btoa only accepts Latin-1 — which is
 * precisely why the module under test decodes through TextDecoder rather than
 * treating the bytes as characters.
 */
function b64url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature-not-checked-here`;
}

function requestWith(authorization: string | null): Request {
  const headers = new Headers();
  if (authorization !== null) headers.set('Authorization', authorization);
  return new Request('https://example.test/', { headers });
}

describe('decodeJwtPayload', () => {
  it('reads the claims out of a three-segment token', () => {
    const claims = decodeJwtPayload(makeToken({ sub: 'user-1', aal: 'aal2' }));
    expect(claims).toEqual({ sub: 'user-1', aal: 'aal2' });
  });

  it('handles payloads of every padding length', () => {
    // base64 padding depends on byte count; all three cases must decode.
    for (const sub of ['a', 'ab', 'abc']) {
      expect(decodeJwtPayload(makeToken({ sub }))).toEqual({ sub });
    }
  });

  it('decodes non-ASCII claims as UTF-8', () => {
    const claims = decodeJwtPayload(makeToken({ name: 'Zoë', emoji: '🔐' }));
    expect(claims).toEqual({ name: 'Zoë', emoji: '🔐' });
  });

  it('returns null for anything that is not a JWT', () => {
    for (const bad of ['', 'nope', 'one.two', 'a.b.c.d', 'a.!!!not-base64!!!.c']) {
      expect(decodeJwtPayload(bad), bad).toBeNull();
    }
  });

  it('returns null when the payload is not a JSON object', () => {
    const arrayPayload = `${b64url({ alg: 'HS256' })}.${b64url([1, 2, 3])}.sig`;
    const stringPayload = `${b64url({ alg: 'HS256' })}.${b64url('just-a-string')}.sig`;
    expect(decodeJwtPayload(arrayPayload)).toBeNull();
    expect(decodeJwtPayload(stringPayload)).toBeNull();
  });

  it('returns null for non-strings rather than throwing', () => {
    expect(decodeJwtPayload(null as unknown as string)).toBeNull();
    expect(decodeJwtPayload(undefined as unknown as string)).toBeNull();
  });
});

describe('bearerToken', () => {
  it('strips the scheme', () => {
    expect(bearerToken(requestWith('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  it('is null without a Bearer header', () => {
    expect(bearerToken(requestWith(null))).toBeNull();
    expect(bearerToken(requestWith('Basic abc'))).toBeNull();
    expect(bearerToken(requestWith('Bearer '))).toBeNull();
  });
});

describe('assuranceLevel', () => {
  it('reads aal1 and aal2', () => {
    expect(assuranceLevel(requestWith(`Bearer ${makeToken({ aal: 'aal1' })}`))).toBe('aal1');
    expect(assuranceLevel(requestWith(`Bearer ${makeToken({ aal: 'aal2' })}`))).toBe('aal2');
  });

  it('is null when the claim is absent or unrecognised', () => {
    expect(assuranceLevel(requestWith(`Bearer ${makeToken({ sub: 'u' })}`))).toBeNull();
    expect(assuranceLevel(requestWith(`Bearer ${makeToken({ aal: 'aal3' })}`))).toBeNull();
    expect(assuranceLevel(requestWith(`Bearer ${makeToken({ aal: 2 })}`))).toBeNull();
  });
});

describe('hasAal2 — the gate, which must fail closed', () => {
  it('is true only for an explicit aal2 claim', () => {
    expect(hasAal2(requestWith(`Bearer ${makeToken({ aal: 'aal2' })}`))).toBe(true);
  });

  it('is false for a password-only session', () => {
    expect(hasAal2(requestWith(`Bearer ${makeToken({ aal: 'aal1' })}`))).toBe(false);
  });

  it('is false for every shape it cannot read', () => {
    const cases: Array<[string, string | null]> = [
      ['no header', null],
      ['wrong scheme', 'Basic abc'],
      ['empty bearer', 'Bearer '],
      ['not a jwt', 'Bearer nonsense'],
      ['claim missing', `Bearer ${makeToken({ sub: 'u' })}`],
      ['claim misspelled', `Bearer ${makeToken({ aal: 'AAL2' })}`],
      ['claim truthy but wrong type', `Bearer ${makeToken({ aal: true })}`],
      ['claim is an object', `Bearer ${makeToken({ aal: { level: 'aal2' } })}`],
    ];

    for (const [label, header] of cases) {
      expect(hasAal2(requestWith(header)), label).toBe(false);
    }
  });
});
