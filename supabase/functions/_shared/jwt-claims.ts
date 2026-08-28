/**
 * Reading non-identity claims out of an already-verified access token.
 *
 * IMPORTANT: nothing in here verifies anything. These helpers are only safe on a
 * token that `verifyAuth` has ALREADY handed to `supabaseAdmin.auth.getUser()`,
 * which is what checks the signature and expiry. Decoding an unverified token
 * and trusting a claim from it would be a straightforward auth bypass.
 *
 * The claim that matters here is `aal` — Authenticator Assurance Level.
 * `getUser()` resolves who the caller is but not how hard they had to work to
 * prove it, and for 2FA operations that difference is the whole point: a session
 * that only presented a password is `aal1`, one that also cleared a TOTP
 * challenge is `aal2`. Minting backup codes from an `aal1` session would let
 * anyone holding just the password issue themselves a permanent 2FA bypass.
 */

/** Assurance levels Supabase issues. Anything else is treated as unknown. */
export type AssuranceLevel = 'aal1' | 'aal2';

/** Decode a base64url segment to its UTF-8 string, or null if it is malformed. */
function decodeSegment(segment: string): string | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Claims payload of a JWT, or null when the token is not three dot-separated
 * segments carrying a JSON object.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  if (typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const json = decodeSegment(parts[1]);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Strip the `Bearer ` prefix from an Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Assurance level asserted by the request's token, or null when it cannot be
 * read. Callers must treat null as "not aal2" — see `hasAal2`.
 */
export function assuranceLevel(req: Request): AssuranceLevel | null {
  const token = bearerToken(req);
  if (!token) return null;

  const claims = decodeJwtPayload(token);
  const aal = claims?.aal;
  return aal === 'aal1' || aal === 'aal2' ? aal : null;
}

/**
 * True only when the token explicitly says `aal2`.
 *
 * Fails closed: a missing, malformed or unrecognised `aal` claim is NOT aal2, so
 * a token shape this code does not understand can never satisfy a 2FA gate.
 */
export function hasAal2(req: Request): boolean {
  return assuranceLevel(req) === 'aal2';
}
