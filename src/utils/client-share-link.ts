// ---------------------------------------------------------------------------
// Client-share link primitives — pure.
//
// The token, the expiry arithmetic and the "is this link live" question, with
// no Supabase and no React attached, so the publish dialog can reason about a
// share without importing the data layer and the rules can be unit-tested.
// ---------------------------------------------------------------------------

/** A share's live state, as the management UI reasons about it. */
export type ClientShareStatus = 'active' | 'revoked' | 'expired';

/** The two fields that decide whether a link still works. */
export interface ClientShareLifetime {
  revoked_at: string | null;
  expires_at: string | null;
}

/**
 * Revocation beats expiry: a link that was pulled reads "revoked" even after its
 * expiry passes, because that is the fact the person who pulled it cares about.
 * The CLIENT, of course, is told nothing at all — the edge function answers all
 * three states with one identical 404.
 */
export function clientShareStatus(share: ClientShareLifetime, now = Date.now()): ClientShareStatus {
  if (share.revoked_at !== null) return 'revoked';
  if (share.expires_at !== null && new Date(share.expires_at).getTime() <= now) return 'expired';
  return 'active';
}

/** Expiry options offered at publish time, in days. `null` = never. */
export const SHARE_EXPIRY_CHOICES: { label: string; days: number | null }[] = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'No expiry', days: null },
];

/** Design default: 90 days. */
export const DEFAULT_SHARE_EXPIRY_DAYS = 90;

/** ISO expiry for a day count, or null for "no expiry". */
export function expiryFromDays(days: number | null, now = Date.now()): string | null {
  return days === null ? null : new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 128 bits of CSPRNG entropy, base64url, unpadded → 22 characters.
 *
 * Never derived from the project, the vessel or a timestamp: the token IS the
 * access control, and anything guessable in it is the whole feature undone.
 */
export function mintShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Public URL a client is given. Same origin as the app, its own lazy chunk. */
export function shareUrl(token: string, origin = window.location.origin): string {
  return `${origin}/share/${token}`;
}
