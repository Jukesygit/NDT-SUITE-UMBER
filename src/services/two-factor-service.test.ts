import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted so mocks are available when vi.mock factory runs (hoisted)
const { mockMfa, mockFunctionsInvoke, mockSupabase } = vi.hoisted(() => {
  const mockMfa = {
    listFactors: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
    enroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unenroll: vi.fn(),
  };
  const mockFunctionsInvoke = vi.fn();
  const mockSupabase = {
    auth: { mfa: mockMfa },
    functions: { invoke: mockFunctionsInvoke },
  };
  return { mockMfa, mockFunctionsInvoke, mockSupabase };
});

vi.mock('../supabase-client', () => ({
  getSupabase: () => mockSupabase,
  supabase: mockSupabase,
  default: mockSupabase,
  isSupabaseConfigured: vi.fn(() => true),
}));

import { twoFactorService } from './two-factor-service.ts';

interface FakeFactor {
  id: string;
  status: 'verified' | 'unverified';
  factor_type?: string;
  friendly_name?: string | null;
}

/**
 * Build the EXACT payload auth-js returns from `listFactors()`.
 *
 * Verified against node_modules/@supabase/auth-js 2.78.0 `_listFactors`: every
 * factor is pushed to `data.all`, and only a factor with status 'verified' is
 * additionally pushed into its typed bucket (`data.totp` / `phone` /
 * `webauthn`). An unverified factor therefore NEVER appears in `data.totp`.
 *
 * Hand-written mocks that put unverified factors in `data.totp` describe a
 * shape the library cannot produce, and they hid a real bug: cleanup sourced
 * from `data.totp` matched nothing in production while passing its tests.
 * Every listFactors mock in this file goes through this helper.
 */
function listFactorsPayload(factors: FakeFactor[]) {
  const data: Record<string, FakeFactor[]> = { all: [], phone: [], totp: [], webauthn: [] };

  for (const input of factors) {
    const factor: FakeFactor = { factor_type: 'totp', friendly_name: null, ...input };
    data.all.push(factor);
    if (factor.status === 'verified') {
      data[factor.factor_type as string].push(factor);
    }
  }

  return { data, error: null };
}

describe('TwoFactorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return disabled status when no TOTP factors exist', async () => {
      mockMfa.listFactors.mockResolvedValue(listFactorsPayload([]));
      mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
        error: null,
      });

      const status = await twoFactorService.getStatus();

      expect(status.isEnabled).toBe(false);
      expect(status.factorId).toBeNull();
      expect(status.currentLevel).toBe('aal1');
      expect(status.nextLevel).toBe('aal1');
    });

    it('should return enabled status when a verified TOTP factor exists', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([{ id: 'factor-123', status: 'verified' }])
      );
      mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      });

      const status = await twoFactorService.getStatus();

      expect(status.isEnabled).toBe(true);
      expect(status.factorId).toBe('factor-123');
      expect(status.currentLevel).toBe('aal1');
      expect(status.nextLevel).toBe('aal2');
    });

    it('should throw on listFactors error', async () => {
      mockMfa.listFactors.mockResolvedValue({
        data: null,
        error: { message: 'Not authenticated' },
      });

      await expect(twoFactorService.getStatus()).rejects.toThrow('Not authenticated');
    });
  });

  describe('cleanupUnverifiedFactors', () => {
    it('should unenroll abandoned unverified factors and never touch verified ones', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([
          { id: 'stale-1', status: 'unverified' },
          { id: 'live-1', status: 'verified' },
          { id: 'stale-2', status: 'unverified' },
        ])
      );
      mockMfa.unenroll.mockResolvedValue({ data: {}, error: null });

      const removed = await twoFactorService.cleanupUnverifiedFactors();

      expect(removed).toBe(2);
      expect(mockMfa.unenroll).toHaveBeenCalledTimes(2);
      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-2' });
      expect(mockMfa.unenroll).not.toHaveBeenCalledWith({ factorId: 'live-1' });
    });

    it('should do nothing when every factor is verified', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([{ id: 'live-1', status: 'verified' }])
      );

      const removed = await twoFactorService.cleanupUnverifiedFactors();

      expect(removed).toBe(0);
      expect(mockMfa.unenroll).not.toHaveBeenCalled();
    });

    it('REGRESSION: must read data.all — unverified factors never reach data.totp', async () => {
      // The exact payload auth-js produces for one abandoned enrollment:
      // data.totp is EMPTY because the factor is unverified. Sourcing cleanup
      // from data.totp made it dead code that silently removed nothing.
      mockMfa.listFactors.mockResolvedValue({
        data: {
          all: [{ id: 'stale-1', factor_type: 'totp', status: 'unverified', friendly_name: null }],
          totp: [],
          phone: [],
          webauthn: [],
        },
        error: null,
      });
      mockMfa.unenroll.mockResolvedValue({ data: {}, error: null });

      const removed = await twoFactorService.cleanupUnverifiedFactors();

      expect(removed).toBe(1);
      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
    });

    it('should ignore non-TOTP factors in data.all', async () => {
      mockMfa.listFactors.mockResolvedValue({
        data: {
          all: [
            { id: 'phone-1', factor_type: 'phone', status: 'unverified', friendly_name: null },
            { id: 'stale-1', factor_type: 'totp', status: 'unverified', friendly_name: null },
          ],
          totp: [],
          phone: [],
          webauthn: [],
        },
        error: null,
      });
      mockMfa.unenroll.mockResolvedValue({ data: {}, error: null });

      const removed = await twoFactorService.cleanupUnverifiedFactors();

      expect(removed).toBe(1);
      expect(mockMfa.unenroll).toHaveBeenCalledTimes(1);
      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
    });

    it('should swallow a listFactors failure — cleanup must never block setup', async () => {
      mockMfa.listFactors.mockResolvedValue({ data: null, error: { message: 'boom' } });

      await expect(twoFactorService.cleanupUnverifiedFactors()).resolves.toBe(0);
    });

    it('should keep clearing after one unenroll fails', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([
          { id: 'stale-1', status: 'unverified' },
          { id: 'stale-2', status: 'unverified' },
        ])
      );
      mockMfa.unenroll
        .mockResolvedValueOnce({ data: null, error: { message: 'nope' } })
        .mockResolvedValueOnce({ data: {}, error: null });

      const removed = await twoFactorService.cleanupUnverifiedFactors();

      expect(removed).toBe(1);
      expect(mockMfa.unenroll).toHaveBeenCalledTimes(2);
    });
  });

  describe('enroll', () => {
    it('should clear abandoned unverified factors before enrolling a new one', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([{ id: 'stale-1', status: 'unverified' }])
      );
      mockMfa.unenroll.mockResolvedValue({ data: {}, error: null });
      mockMfa.enroll.mockResolvedValue({
        data: {
          id: 'factor-new',
          type: 'totp',
          totp: { qr_code: '<svg/>', secret: 'S', uri: 'otpauth://' },
        },
        error: null,
      });

      await twoFactorService.enroll();

      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
      expect(mockMfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
    });

    it('should still enroll when cleanup fails', async () => {
      mockMfa.listFactors.mockRejectedValue(new Error('offline'));
      mockMfa.enroll.mockResolvedValue({
        data: {
          id: 'factor-new',
          type: 'totp',
          totp: { qr_code: '<svg/>', secret: 'S', uri: 'otpauth://' },
        },
        error: null,
      });

      const result = await twoFactorService.enroll();

      expect(result.factorId).toBe('factor-new');
    });

    it('should call mfa.enroll with totp factorType and return enrollment data', async () => {
      const enrollData = {
        id: 'factor-new',
        type: 'totp',
        totp: {
          qr_code: '<svg>...</svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/...',
        },
      };
      mockMfa.enroll.mockResolvedValue({ data: enrollData, error: null });

      const result = await twoFactorService.enroll();

      expect(mockMfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
      expect(result.factorId).toBe('factor-new');
      expect(result.qr_code).toBe('<svg>...</svg>');
      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.uri).toBe('otpauth://totp/...');
    });

    it('should throw on enroll error', async () => {
      mockMfa.enroll.mockResolvedValue({
        data: null,
        error: { message: 'Enrollment failed' },
      });

      await expect(twoFactorService.enroll()).rejects.toThrow('Enrollment failed');
    });
  });

  describe('verifyEnrollment', () => {
    it('should challenge then verify to activate the factor', async () => {
      mockMfa.challenge.mockResolvedValue({
        data: { id: 'challenge-1' },
        error: null,
      });
      mockMfa.verify.mockResolvedValue({
        data: { access_token: 'new-token', refresh_token: 'new-refresh' },
        error: null,
      });

      await twoFactorService.verifyEnrollment('factor-123', '123456');

      expect(mockMfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-123' });
      expect(mockMfa.verify).toHaveBeenCalledWith({
        factorId: 'factor-123',
        challengeId: 'challenge-1',
        code: '123456',
      });
    });

    it('should throw on challenge error', async () => {
      mockMfa.challenge.mockResolvedValue({
        data: null,
        error: { message: 'Challenge failed' },
      });

      await expect(twoFactorService.verifyEnrollment('factor-123', '123456')).rejects.toThrow(
        'Challenge failed'
      );
    });

    it('should throw on verify error', async () => {
      mockMfa.challenge.mockResolvedValue({
        data: { id: 'challenge-1' },
        error: null,
      });
      mockMfa.verify.mockResolvedValue({
        data: null,
        error: { message: 'Invalid code' },
      });

      await expect(twoFactorService.verifyEnrollment('factor-123', '123456')).rejects.toThrow(
        'Invalid code'
      );
    });
  });

  describe('verifyLogin', () => {
    it('should find TOTP factor, challenge, and verify to elevate to AAL2', async () => {
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([{ id: 'factor-123', status: 'verified' }])
      );
      mockMfa.challenge.mockResolvedValue({
        data: { id: 'challenge-1' },
        error: null,
      });
      mockMfa.verify.mockResolvedValue({
        data: { access_token: 'aal2-token' },
        error: null,
      });

      await twoFactorService.verifyLogin('654321');

      expect(mockMfa.listFactors).toHaveBeenCalled();
      expect(mockMfa.challenge).toHaveBeenCalledWith({ factorId: 'factor-123' });
      expect(mockMfa.verify).toHaveBeenCalledWith({
        factorId: 'factor-123',
        challengeId: 'challenge-1',
        code: '654321',
      });
    });

    it('should throw when no TOTP factor is found', async () => {
      mockMfa.listFactors.mockResolvedValue(listFactorsPayload([]));

      await expect(twoFactorService.verifyLogin('654321')).rejects.toThrow();
    });

    it('should throw when the only factor is an unverified enrollment', async () => {
      // data.totp is empty for an unverified factor — verifyLogin must not
      // treat an abandoned enrollment as a usable second factor.
      mockMfa.listFactors.mockResolvedValue(
        listFactorsPayload([{ id: 'stale-1', status: 'unverified' }])
      );

      await expect(twoFactorService.verifyLogin('654321')).rejects.toThrow();
    });
  });

  describe('verifyBackupCode', () => {
    it('should call manage-backup-codes edge function with verify action', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, remaining: 9 },
        error: null,
      });

      const result = await twoFactorService.verifyBackupCode('ABCD-EFGH');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('manage-backup-codes', {
        body: { action: 'verify', code: 'ABCD-EFGH' },
      });
      expect(result.remaining).toBe(9);
    });

    it('should surface the recovered flag — redemption resets 2FA server-side', async () => {
      // Deletion is consumption: remaining is 0 on the recovery path, so
      // `recovered` is the only trustworthy signal.
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, remaining: 0, recovered: true },
        error: null,
      });

      const result = await twoFactorService.verifyBackupCode('ABCD-EFGH');

      expect(result).toEqual({ remaining: 0, recovered: true });
    });

    it('should default recovered to false and remaining to 0 when absent', async () => {
      mockFunctionsInvoke.mockResolvedValue({ data: { success: true }, error: null });

      const result = await twoFactorService.verifyBackupCode('ABCD-EFGH');

      expect(result).toEqual({ remaining: 0, recovered: false });
    });

    it('should throw on invalid backup code', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: false, error: 'Invalid or used backup code' },
        error: null,
      });

      await expect(twoFactorService.verifyBackupCode('XXXX-YYYY')).rejects.toThrow();
    });
  });

  describe('unenroll', () => {
    it('should call mfa.unenroll with the factor id', async () => {
      mockMfa.unenroll.mockResolvedValue({ data: {}, error: null });

      await twoFactorService.unenroll('factor-123');

      expect(mockMfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-123' });
    });

    it('should throw on unenroll error', async () => {
      mockMfa.unenroll.mockResolvedValue({
        data: null,
        error: { message: 'Unenroll failed' },
      });

      await expect(twoFactorService.unenroll('factor-123')).rejects.toThrow('Unenroll failed');
    });
  });

  describe('generateBackupCodes', () => {
    it('should call manage-backup-codes edge function with generate action', async () => {
      const codes = ['ABCD-EFGH', 'IJKL-MNOP', 'QRST-UVWX'];
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, codes },
        error: null,
      });

      const result = await twoFactorService.generateBackupCodes();

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('manage-backup-codes', {
        body: { action: 'generate' },
      });
      expect(result).toEqual(codes);
    });

    it('should throw on edge function error', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Server error' },
      });

      await expect(twoFactorService.generateBackupCodes()).rejects.toThrow();
    });

    it('should surface a 409 as a BackupCodesError the wizard can branch on', async () => {
      // supabase-js flattens a non-2xx invoke: the real body lives on
      // `.context`, a raw Response. Without reading it, "codes already exist"
      // is indistinguishable from a server failure.
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: new Response(
            JSON.stringify({ error: 'Backup codes already exist for this account.' }),
            { status: 409 }
          ),
        },
      });

      await expect(twoFactorService.generateBackupCodes()).rejects.toMatchObject({
        name: 'BackupCodesError',
        status: 409,
        message: 'Backup codes already exist for this account.',
      });
    });

    it('should surface the 403 aal2 message instead of the generic non-2xx string', async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: new Response(
            JSON.stringify({
              error: 'Two-factor verification is required before managing backup codes',
            }),
            { status: 403 }
          ),
        },
      });

      await expect(twoFactorService.generateBackupCodes()).rejects.toThrow(
        'Two-factor verification is required before managing backup codes'
      );
    });

    it('should still detect a conflict from the message when no status is readable', async () => {
      // Defensive: supabase-js shape drift could leave `.context` unusable.
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Backup codes already exist for this account.' },
      });

      await expect(twoFactorService.generateBackupCodes()).rejects.toMatchObject({
        status: null,
        codesAlreadyExist: true,
      });
    });
  });

  describe('regenerateBackupCodes', () => {
    it('should call manage-backup-codes edge function with regenerate action and TOTP code', async () => {
      const codes = ['NEWC-ODE1', 'NEWC-ODE2'];
      mockFunctionsInvoke.mockResolvedValue({
        data: { success: true, codes },
        error: null,
      });

      const result = await twoFactorService.regenerateBackupCodes('123456');

      expect(mockFunctionsInvoke).toHaveBeenCalledWith('manage-backup-codes', {
        body: { action: 'regenerate', totpCode: '123456' },
      });
      expect(result).toEqual(codes);
    });
  });

  describe('needsVerification', () => {
    it('should return true when currentLevel is aal1 and nextLevel is aal2', async () => {
      mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      });

      const result = await twoFactorService.needsVerification();
      expect(result).toBe(true);
    });

    it('should return false when already at aal2', async () => {
      mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null,
      });

      const result = await twoFactorService.needsVerification();
      expect(result).toBe(false);
    });

    it('should return false when no 2FA factor enrolled', async () => {
      mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
        error: null,
      });

      const result = await twoFactorService.needsVerification();
      expect(result).toBe(false);
    });
  });
});
