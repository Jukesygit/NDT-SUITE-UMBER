/**
 * Two-Factor Authentication Service
 * Wraps Supabase MFA SDK calls and backup code Edge Function calls.
 */

import { getSupabase } from '../supabase-client';

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

class TwoFactorService {
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
   * Start TOTP enrollment. Returns QR code SVG, secret, and URI.
   */
  async enroll(): Promise<EnrollmentData> {
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
   * Verify a backup code via Edge Function.
   */
  async verifyBackupCode(code: string): Promise<{ remaining: number }> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'verify', code },
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error || 'Invalid backup code');

    return { remaining: data.remaining };
  }

  /**
   * Unenroll a TOTP factor.
   */
  async unenroll(factorId: string): Promise<void> {
    const { error } = await getSupabase().auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message);
  }

  /**
   * Generate backup codes via Edge Function.
   */
  async generateBackupCodes(): Promise<string[]> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'generate' },
    });

    if (error) throw new Error(error.message);
    return data.codes;
  }

  /**
   * Regenerate backup codes (requires current TOTP code for verification).
   */
  async regenerateBackupCodes(totpCode: string): Promise<string[]> {
    const { data, error } = await getSupabase().functions.invoke('manage-backup-codes', {
      body: { action: 'regenerate', totpCode },
    });

    if (error) throw new Error(error.message);
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
