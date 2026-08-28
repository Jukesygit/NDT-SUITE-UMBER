import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useMfaFactors, hasVerifiedTotpFactor, mfaFactorKeys } from './useMfaFactors.ts';

const mockListFactors = vi.fn();

vi.mock('../../services/two-factor-service.ts', () => ({
  twoFactorService: {
    listFactors: (...args: unknown[]) => mockListFactors(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useMfaFactors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user TOTP factors on success', async () => {
    const factors = [{ id: 'factor-1', status: 'verified', friendlyName: null }];
    mockListFactors.mockResolvedValue(factors);

    const { result } = renderHook(() => useMfaFactors('user-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(factors);
  });

  it('does not fetch without a user id', () => {
    mockListFactors.mockResolvedValue([]);

    const { result } = renderHook(() => useMfaFactors(undefined), { wrapper: createWrapper() });

    expect(mockListFactors).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not fetch when explicitly disabled', () => {
    mockListFactors.mockResolvedValue([]);

    renderHook(() => useMfaFactors('user-1', { enabled: false }), { wrapper: createWrapper() });

    expect(mockListFactors).not.toHaveBeenCalled();
  });

  it('surfaces errors instead of silently reporting no factors', async () => {
    mockListFactors.mockRejectedValue(new Error('Not authenticated'));

    const { result } = renderHook(() => useMfaFactors('user-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('scopes the cache key to the user so a session swap cannot reuse factors', () => {
    expect(mfaFactorKeys.byUser('user-1')).toEqual(['mfaFactors', 'user-1']);
    expect(mfaFactorKeys.byUser('user-2')).not.toEqual(mfaFactorKeys.byUser('user-1'));
    expect(mfaFactorKeys.all).toEqual(['mfaFactors']);
  });
});

describe('hasVerifiedTotpFactor', () => {
  it('is false for undefined, empty, and unverified-only factor lists', () => {
    expect(hasVerifiedTotpFactor(undefined)).toBe(false);
    expect(hasVerifiedTotpFactor([])).toBe(false);
    expect(hasVerifiedTotpFactor([{ id: 'f1', status: 'unverified', friendlyName: null }])).toBe(
      false
    );
  });

  it('is true when at least one factor is verified', () => {
    expect(
      hasVerifiedTotpFactor([
        { id: 'f1', status: 'unverified', friendlyName: null },
        { id: 'f2', status: 'verified', friendlyName: null },
      ])
    ).toBe(true);
  });
});
