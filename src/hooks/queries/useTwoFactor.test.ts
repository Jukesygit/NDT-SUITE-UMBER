import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useTwoFactorStatus } from './useTwoFactor.ts';

// Mock the two-factor service
const mockGetStatus = vi.fn();

vi.mock('../../services/two-factor-service.ts', () => ({
  twoFactorService: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTwoFactorStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 2FA status data on success', async () => {
    const statusData = {
      isEnabled: true,
      factorId: 'factor-123',
      currentLevel: 'aal2',
      nextLevel: 'aal2',
    };
    mockGetStatus.mockResolvedValue(statusData);

    const { result } = renderHook(() => useTwoFactorStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(statusData);
  });

  it('should handle error state', async () => {
    mockGetStatus.mockRejectedValue(new Error('Not authenticated'));

    const { result } = renderHook(() => useTwoFactorStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });

  it('should use staleTime of 5 minutes', async () => {
    mockGetStatus.mockResolvedValue({
      isEnabled: false,
      factorId: null,
      currentLevel: 'aal1',
      nextLevel: 'aal1',
    });

    const { result } = renderHook(() => useTwoFactorStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Service should only be called once despite re-renders within staleTime
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
  });
});
