/**
 * Tests for assertActiveUser — the self-service write identity guard (H4).
 *
 * Mocks the supabase-client module the same way the auth-login-flow tests do,
 * so `getSupabase().auth.getUser()` is fully controlled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.mock factories are hoisted) ──────────────────────────────────
vi.mock('../../supabase-client', () => {
    const sb = {
        auth: {
            getUser: vi.fn(),
        },
    };
    return {
        default: sb,
        isSupabaseConfigured: () => true,
        getSupabase: () => sb,
    };
});

// ── Imports (after vi.mock) ─────────────────────────────────────────────────
import supabaseMod from '../../supabase-client';
import { assertActiveUser } from '../active-user-guard';

// Same object the factory returns from both `default` and `getSupabase`.
const sb = supabaseMod as any;

describe('assertActiveUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves when the live session user matches the expected id', async () => {
        sb.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
        await expect(assertActiveUser('user-1')).resolves.toBeUndefined();
        expect(sb.auth.getUser).toHaveBeenCalledTimes(1);
    });

    it('throws when the live session user id differs from the expected id', async () => {
        sb.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null });
        await expect(assertActiveUser('user-1')).rejects.toThrow(/session identity mismatch/i);
    });

    it('throws when there is no live session user', async () => {
        sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
        await expect(assertActiveUser('user-1')).rejects.toThrow(/session identity mismatch/i);
    });

    it('throws when getUser returns an error', async () => {
        sb.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'network down' } });
        await expect(assertActiveUser('user-1')).rejects.toThrow(/session identity mismatch/i);
    });

    it('throws when the getUser response is empty', async () => {
        sb.auth.getUser.mockResolvedValue({ data: {}, error: null });
        await expect(assertActiveUser('user-1')).rejects.toThrow(/session identity mismatch/i);
    });
});
