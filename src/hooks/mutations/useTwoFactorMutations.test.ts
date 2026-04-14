import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useEnrollTwoFactor,
  useVerifyTwoFactorEnrollment,
  useVerifyTwoFactorLogin,
  useGenerateBackupCodes,
  useRegenerateBackupCodes,
} from './useTwoFactorMutations.ts';

// Use vi.hoisted so mocks are available when vi.mock factory runs (hoisted)
const { mockService } = vi.hoisted(() => {
  const mockService = {
    enroll: vi.fn(),
    verifyEnrollment: vi.fn(),
    verifyLogin: vi.fn(),
    generateBackupCodes: vi.fn(),
    regenerateBackupCodes: vi.fn(),
  };
  return { mockService };
});

vi.mock('../../services/two-factor-service.ts', () => ({
  twoFactorService: mockService,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTwoFactorMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useEnrollTwoFactor', () => {
    it('should call twoFactorService.enroll on mutate', async () => {
      const enrollData = {
        factorId: 'factor-new',
        qr_code: '<svg>...</svg>',
        secret: 'SECRET',
        uri: 'otpauth://...',
      };
      mockService.enroll.mockResolvedValue(enrollData);

      const { result } = renderHook(() => useEnrollTwoFactor(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toEqual(enrollData);
    });
  });

  describe('useVerifyTwoFactorEnrollment', () => {
    it('should call verifyEnrollment with factorId and code', async () => {
      mockService.verifyEnrollment.mockResolvedValue(undefined);

      const { result } = renderHook(() => useVerifyTwoFactorEnrollment(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({ factorId: 'factor-123', code: '123456' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(mockService.verifyEnrollment).toHaveBeenCalledWith('factor-123', '123456');
    });
  });

  describe('useVerifyTwoFactorLogin', () => {
    it('should call verifyLogin with the code', async () => {
      mockService.verifyLogin.mockResolvedValue(undefined);

      const { result } = renderHook(() => useVerifyTwoFactorLogin(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate('654321');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(mockService.verifyLogin).toHaveBeenCalledWith('654321');
    });
  });

  describe('useGenerateBackupCodes', () => {
    it('should return generated backup codes', async () => {
      const codes = ['ABCD-EFGH', 'IJKL-MNOP'];
      mockService.generateBackupCodes.mockResolvedValue(codes);

      const { result } = renderHook(() => useGenerateBackupCodes(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate();
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(result.current.data).toEqual(codes);
    });
  });

  describe('useRegenerateBackupCodes', () => {
    it('should call regenerateBackupCodes with TOTP code', async () => {
      const codes = ['NEWC-ODE1', 'NEWC-ODE2'];
      mockService.regenerateBackupCodes.mockResolvedValue(codes);

      const { result } = renderHook(() => useRegenerateBackupCodes(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate('123456');
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });
      expect(mockService.regenerateBackupCodes).toHaveBeenCalledWith('123456');
      expect(result.current.data).toEqual(codes);
    });
  });

});
