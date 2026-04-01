/**
 * Tests for useAdminUsers React Query hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../../test/test-utils';

vi.mock('../../services/admin-service', () => ({
    adminService: {
        getUsers: vi.fn(),
        getUser: vi.fn(),
    },
}));

import { useAdminUsers, useAdminUser, userKeys } from '../queries/useAdminUsers';
import { adminService } from '../../services/admin-service';

beforeEach(() => {
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
describe('userKeys', () => {
    it('generates correct key structure', () => {
        expect(userKeys.all).toEqual(['admin', 'users']);
        expect(userKeys.list()).toEqual(['admin', 'users', 'list']);
        expect(userKeys.detail('u1')).toEqual(['admin', 'users', 'detail', 'u1']);
    });
});

// ---------------------------------------------------------------------------
// useAdminUsers
// ---------------------------------------------------------------------------
describe('useAdminUsers', () => {
    it('fetches all users', async () => {
        vi.mocked(adminService.getUsers).mockResolvedValueOnce([
            { id: 'u1', username: 'alice' },
        ] as any);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useAdminUsers(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toHaveLength(1);
    });

    it('handles error state', async () => {
        vi.mocked(adminService.getUsers).mockRejectedValueOnce(new Error('fetch failed'));
        const wrapper = createWrapper();
        const { result } = renderHook(() => useAdminUsers(), { wrapper });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toBeInstanceOf(Error);
    });
});

// ---------------------------------------------------------------------------
// useAdminUser
// ---------------------------------------------------------------------------
describe('useAdminUser', () => {
    it('does not fetch when userId is undefined', () => {
        const wrapper = createWrapper();
        const { result } = renderHook(() => useAdminUser(undefined), { wrapper });
        expect(result.current.fetchStatus).toBe('idle');
    });

    it('fetches a single user by ID', async () => {
        vi.mocked(adminService.getUser).mockResolvedValueOnce({
            id: 'u1', username: 'bob', email: 'bob@test.com',
        } as any);
        const wrapper = createWrapper();
        const { result } = renderHook(() => useAdminUser('u1'), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.username).toBe('bob');
    });
});
