/**
 * MFA factor queries — the source of truth for "is this account enrolled in 2FA?".
 *
 * Separate from `useTwoFactorStatus` on purpose: that hook also fetches the
 * session AAL and is used by the profile security panel. This one answers a
 * single question for the mandatory-enrollment gate, so it can be cached per
 * user and invalidated the moment enrollment completes.
 */

import { useQuery } from '@tanstack/react-query';
import { twoFactorService, type TotpFactor } from '../../services/two-factor-service';

export const mfaFactorKeys = {
  all: ['mfaFactors'] as const,
  byUser: (userId: string | null | undefined) => ['mfaFactors', userId ?? null] as const,
};

interface UseMfaFactorsOptions {
  /** Gate the fetch on authentication — never query for a signed-out session. */
  enabled?: boolean;
}

/**
 * List the current user's TOTP factors.
 *
 * Keyed by user id so a session swap cannot serve another account's factors
 * out of the cache.
 */
export function useMfaFactors(
  userId: string | null | undefined,
  options: UseMfaFactorsOptions = {}
) {
  const { enabled = true } = options;

  return useQuery<TotpFactor[]>({
    queryKey: mfaFactorKeys.byUser(userId),
    queryFn: () => twoFactorService.listFactors(),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * True only when a factor has completed challenge+verify. Abandoned
 * enrollments (status 'unverified') deliberately do not count.
 */
export function hasVerifiedTotpFactor(factors: TotpFactor[] | undefined): boolean {
  return !!factors?.some((factor) => factor.status === 'verified');
}
