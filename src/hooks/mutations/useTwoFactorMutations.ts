import { useMutation, useQueryClient } from '@tanstack/react-query';
import { twoFactorService } from '../../services/two-factor-service';

export function useEnrollTwoFactor() {
  return useMutation({
    mutationFn: () => twoFactorService.enroll(),
  });
}

export function useVerifyTwoFactorEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ factorId, code }: { factorId: string; code: string }) =>
      twoFactorService.verifyEnrollment(factorId, code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['two-factor', 'status'] });
    },
  });
}

export function useVerifyTwoFactorLogin() {
  return useMutation({
    mutationFn: (code: string) => twoFactorService.verifyLogin(code),
  });
}

/**
 * Redeem a backup code to recover a login that cannot clear the TOTP challenge.
 *
 * A successful redemption resets the user's 2FA server-side (all factors and
 * remaining codes are deleted), so callers must refresh auth state afterwards
 * and let the enrollment gate take over.
 */
export function useVerifyBackupCode() {
  return useMutation({
    mutationFn: (code: string) => twoFactorService.verifyBackupCode(code),
  });
}

export function useGenerateBackupCodes() {
  return useMutation({
    mutationFn: () => twoFactorService.generateBackupCodes(),
  });
}

export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: (totpCode: string) => twoFactorService.regenerateBackupCodes(totpCode),
  });
}
