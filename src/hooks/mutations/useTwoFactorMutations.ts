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
