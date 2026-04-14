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

describe('TwoFactorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getStatus', () => {
    it('should return disabled status when no TOTP factors exist', async () => {
      mockMfa.listFactors.mockResolvedValue({
        data: { totp: [], phone: [] },
        error: null,
      });
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
      mockMfa.listFactors.mockResolvedValue({
        data: {
          totp: [{ id: 'factor-123', factor_type: 'totp', status: 'verified' }],
          phone: [],
        },
        error: null,
      });
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

  describe('enroll', () => {
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
      mockMfa.listFactors.mockResolvedValue({
        data: {
          totp: [{ id: 'factor-123', factor_type: 'totp', status: 'verified' }],
          phone: [],
        },
        error: null,
      });
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
      mockMfa.listFactors.mockResolvedValue({
        data: { totp: [], phone: [] },
        error: null,
      });

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
