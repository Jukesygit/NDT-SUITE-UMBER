/**
 * Two-Factor Authentication Service
 * Wraps Supabase MFA SDK calls and backup code Edge Function calls.
 */

import { getSupabase } from '../supabase-client';
import { BackupCodesError, toBackupCodesError } from './backup-codes-error';
import {
  selectVerifiedTotpFactors,
  selectAbandonedTotpFactors,
  type RawFactorBuckets,
  type TotpFactor,
  type TotpFactorStatus,
} from './mfa-factor-shape';

// Re-exported so callers have one import site for the 2FA client surface.
export { BackupCodesError };
export type { TotpFactor, TotpFactorStatus };

export interface TwoFactorStatus {
  isEnabled: boolean;
  factorId: string | null;
  currentLevel: string;
  nextLevel: string;
}

export interface EnrollmentData {
  factorId: string;
  qr_code: string;
  secret: string;
  uri: string;
}

/**
 * Result of redeeming a backup code.
 *
 * `recovered` means the server reset the account's 2FA as part of the
 * redemption (all TOTP factors and remaining codes deleted). `remaining` is
 * always 0 on that path — deletion is consumption — so it must not be used to
 * decide anything.
 */
export interface BackupCodeRedemption {
  remaining: number;
  recovered: boolean;
}

class TwoFactorService {
  /**
   * List the user's VERIFIED TOTP factors — the answer to "is this account
   * enrolled?". See `mfa-factor-shape.ts` for why this is verified-only and
   * must stay that way.
   */
  async listFactors(): Promise<TotpFactor[]> {
    const { data, error } = await getSupabase().auth.mfa.listFactors();

    if (error) throw new Error(error.message);

    return selectVerifiedTotpFactors(data as RawFactorBuckets | null);
  }

  /**
   * Get current 2FA status: factor enrollment and AAL levels.
   */
  async getStatus(): Promise<TwoFactorStatus> {
    const { data: factorsData, error: factorsError } = await getSupabase().auth.mfa.listFactors();

    if (factorsError) throw new Error(factorsError.message);

    const { data: aalData, error: aalError } =
      await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();

    if (aalError) throw new Error(aalError.message);

    const verifiedFactor = factorsData.totp.find(
      (f: { status: string }) => f.status === 'verified'
    );

    return {
      isEnabled: !!verifiedFactor,
      factorId: verifiedFactor?.id ?? null,
      currentLevel: aalData.currentLevel ?? 'aal1',
      nextLevel: aalData.nextLevel ?? 'aal1',
    };
  }

  /**
   * Drop abandoned enrollments — TOTP factors that never completed verification.
   *
   * Every visit to a setup screen calls `enroll()`, which mints a fresh
   * unverified factor; without this they accumulate until Supabase's per-user
   * limit rejects further enrollment and the user is locked out of the
   * mandatory-enrollment gate entirely.
   *
   * Selection is `selectAbandonedTotpFactors`, which reads `data.all` — the
   * only bucket unverified factors reach. Sourcing this from `data.totp`
   * silently matches nothing and makes the cleanup dead code (see
   * `mfa-factor-shape.ts`).
   *
   * Best-effort by design: cleanup is hygiene, so a failure here must never
   * block setting up 2FA. Returns the number of factors actually removed.
   *
   * SAFETY: only factors whose status is not 'verified' are touched. A verified
   * factor is the user's live second factor and is never unenrolled here.
   */
  async cleanupUnverifiedFactors(): Promise<number> {
    try {
      const { data, error } = await getSupabase().auth.mfa.listFactors();
      if (error) return 0;

      const abandoned = selectAbandonedTotpFactors(data as RawFactorBuckets | null);

      let removed = 0;
      for (const factor of abandoned) {
        try {
          const { error: unenrollError } = await getSupabase().auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (!unenrollError) removed += 1;
        } catch {
          // One stubborn factor must not stop the rest being cleared.
        }
      }
      return removed;
    } catch {
      return 0;
    }
  }

  /**
   * Start TOTP enrollment. Returns QR code SVG, secret, and URI.
   *
   * Clears abandoned unverified factors first so repeated visits to a setup
   * screen cannot exhaust the per-user factor limit.
   */
  async enroll(): Promise<EnrollmentData> {
    await this.cleanupUnverifiedFactors();

    const { data, error } = await getSupabase().auth.mfa.enroll({
      factorType: 'totp',
    });

    if (error) throw new Error(error.message);

    return {
      factorId: data.id,
      qr_code: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  }

  /**
   * Verify enrollment by challenging then verifying a TOTP code.
   */
  async verifyEnrollment(factorId: string, code: string): Promise<void> {
    const { data: challengeData, error: challengeError } = await getSupabase().auth.mfa.challenge({
      factorId,
    });

    if (challengeError) throw new Error(challengeError.message);

    const { error: verifyError } = await getSupabase().auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) throw new Error(verifyError.message);
  }

  /**
   * Verify TOTP code during login to elevate session to AAL2.
   */
  async verifyLogin(code: string): Promise<void> {
    const { data: factorsData, error: factorsError } = await getSupabase().auth.mfa.listFactors();

    if (factorsError) throw new Error(factorsError.message);

    const totpFactor = factorsData.totp.find((f: { status: string }) => f.status === 'verified');

    if (!totpFactor) {
      throw new Error('No verified TOTP factor found');
    }

    const { data: challengeData, error: challengeError } = await getSupabase().auth.mfa.challenge({
      factorId: totpFactor.id,
    });

    if (challengeError) throw new Error(challengeError.message);

    const { error: verifyError } = await getSupabase().auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code,
    });

    if (verifyError) throw new Error(verifyError.message);
  }

  /**
   * Redeem a backup code via Edge Function to recover a session that cannot
   * clear the TOTP challenge.
   *
   * SEMANTIC (owner-approved 2026-08-26): a successful redemption RESETS the
   * user's 2FA server-side — every TOTP factor and remaining code is deleted.
   * There is deliberately no "keep using backup codes" path. Callers must
   * therefore refresh auth state after success so `twoFactorRequired`
   * re-resolves false, let the login complete, and leave re-enrollment to the
   * `RequireTwoFactorEnrolled` gate.
   *
   * Failure messages are deliberately uniform (wrong / malformed / used / none
   * enrolled all read the same) and must be surfaced verbatim, including the
   * rate-limit answer.
   *
   * DO NOT branch on `remaining`: deletion is consumption, so a successful
   * redemption always leaves 0. `recovered` is the flag that means "2FA was
   * reset, send this user to re-enrollment".
   */
  async verifyBackupCode(code: string): Promise<BackupCodeRedemption> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'verify', code },
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error || 'Invalid backup code');

    return { remaining: data.remaining ?? 0, recovered: data.recovered === true };
  }

  /**
   * Unenroll a TOTP factor.
   */
  async unenroll(factorId: string): Promise<void> {
    const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message);
  }

  /**
   * Generate backup codes via Edge Function. First-issue only — the server
   * answers 409 when a live set already exists (see `BackupCodesError`).
   *
   * Requires an aal2 session; the session right after a successful enrollment
   * verify is aal2, which is why the setup wizard can mint codes inline.
   */
  async generateBackupCodes(): Promise<string[]> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'generate' },
    });

    if (error) throw await toBackupCodesError(error, 'Could not generate backup codes');
    return data.codes;
  }

  /**
   * Regenerate backup codes (requires current TOTP code for verification).
   */
  async regenerateBackupCodes(totpCode: string): Promise<string[]> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'regenerate', totpCode },
    });

    if (error) throw await toBackupCodesError(error, 'Could not regenerate backup codes');
    return data.codes;
  }

  /**
   * Check if the current session needs 2FA verification.
   * Returns true if session is AAL1 but user has a TOTP factor (nextLevel=aal2).
   */
  async needsVerification(): Promise<boolean> {
    const { data, error } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) throw new Error(error.message);

    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
  }
}

export const twoFactorService = new TwoFactorService();
export default twoFactorService;
