/**
 * The shape of `auth.mfa.listFactors()` — and the one rule that is easy to get
 * wrong.
 *
 * VERIFIED against @supabase/auth-js 2.78.0, `GoTrueClient._listFactors`:
 *
 *   for (const factor of user?.factors ?? []) {
 *     data.all.push(factor)
 *     if (factor.status === 'verified') { data[factor.factor_type].push(factor) }
 *   }
 *
 * So `data.all` holds EVERY factor, while the typed buckets (`data.totp`,
 * `data.phone`, `data.webauthn`) hold ONLY verified ones.
 *
 * The consequence, which cost a real bug: an unverified factor NEVER appears in
 * `data.totp`. Code hunting for abandoned enrollments must read `data.all`, or
 * it silently matches nothing while looking correct — and hand-written mocks
 * that put unverified factors into `data.totp` describe a payload the library
 * cannot produce, so they hide the mistake instead of catching it.
 */

export type TotpFactorStatus = 'verified' | 'unverified';

export interface TotpFactor {
  id: string;
  status: TotpFactorStatus;
  friendlyName: string | null;
}

/** Raw factor as returned by auth-js. */
export interface RawFactor {
  id: string;
  status: string;
  factor_type?: string;
  friendly_name?: string | null;
}

/** Buckets returned by `listFactors()`. `all` is the only complete one. */
export interface RawFactorBuckets {
  all?: RawFactor[];
  totp?: RawFactor[];
  phone?: RawFactor[];
  webauthn?: RawFactor[];
}

export function toTotpFactor(factor: RawFactor): TotpFactor {
  return {
    id: factor.id,
    status: factor.status === 'verified' ? 'verified' : 'unverified',
    friendlyName: factor.friendly_name ?? null,
  };
}

/**
 * The account's verified TOTP factors — read from `data.totp`, which is
 * verified-only by construction.
 *
 * Deliberately verified-only: this answers "is this account enrolled?" for the
 * mandatory-enrollment gate, and an abandoned enrollment must not count. Do NOT
 * switch this to `data.all` for symmetry with `selectAbandonedTotpFactors` —
 * that would let an unverified factor open the gate.
 */
export function selectVerifiedTotpFactors(data: RawFactorBuckets | null | undefined): TotpFactor[] {
  return (data?.totp ?? []).map(toTotpFactor);
}

/**
 * TOTP factors from an enrollment that was started but never verified.
 *
 * Reads `data.all` because that is the only bucket unverified factors reach,
 * then filters by `factor_type` so phone/WebAuthn factors are left alone.
 */
export function selectAbandonedTotpFactors(data: RawFactorBuckets | null | undefined): RawFactor[] {
  return (data?.all ?? []).filter(
    (factor) => factor.factor_type === 'totp' && factor.status !== 'verified'
  );
}
