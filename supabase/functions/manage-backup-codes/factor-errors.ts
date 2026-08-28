/**
 * Reading a factor-deletion error, for the one case where failure is success.
 *
 * Two people — or two tabs — can redeem a backup code at the same moment. Both
 * matches succeed, both go on to delete the caller's TOTP factors, and the
 * second one finds them already gone. Telling that caller "recovery failed"
 * would be wrong twice over: the outcome they asked for is exactly the state
 * they found, and the failure would send them to burn another code (or an admin)
 * for a reset that has already happened.
 *
 * So "already gone" reads as success. Everything else — a permission problem, a
 * network fault, anything that could have left a factor standing — reads as
 * failure, because the redemption path consumes codes only after the factors are
 * confirmed removed.
 *
 * The Supabase admin API surfaces this as an ordinary AuthError rather than a
 * typed code, so this matches on status and message shape. Kept pure and beside
 * index.ts (which calls serve() on import) so it can be tested at all.
 */

/** The error shape supabase-js hands back from `auth.admin.mfa.deleteFactor`. */
export interface FactorDeletionError {
  status?: number;
  message?: string;
}

/** Message shapes that mean the factor is not there any more. */
const ALREADY_GONE_PATTERN = /not.?found|no.*factor|does not exist|already.*(deleted|removed)/i;

/**
 * True when the deletion failed because there was nothing left to delete.
 *
 * A null/undefined error means the call simply succeeded, which is trivially
 * "gone" — callers pass the raw error through without pre-checking it.
 */
export function isFactorAlreadyGone(error: FactorDeletionError | null | undefined): boolean {
  if (!error) return true;
  if (error.status === 404) return true;
  return typeof error.message === 'string' && ALREADY_GONE_PATTERN.test(error.message);
}
