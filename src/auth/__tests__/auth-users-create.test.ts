/**
 * Tests for createUser — surfacing the edge function's real error message.
 *
 * Regression: supabase-js v2 wraps a non-2xx invoke in a FunctionsHttpError
 * whose `.context` is the raw fetch Response, so the old `.context?.error`
 * read was always undefined and users saw the generic status text instead of
 * the `{ "error": "<message>" }` body the edge function returns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.mock factories are hoisted — no top-level variable refs) ──────

vi.mock('../../supabase-client', () => {
    const sb = {
        functions: {
            invoke: vi.fn(),
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
import { createUser } from '../auth-users';

// Grab the mock supabase instance — same object returned by the factory
const sb = supabaseMod as any;

// Stub `this` context for createUser (bound via .call).
const adminStub = {
    hasPermission: () => true,
    isAdmin: () => true,
    currentUser: { role: 'admin', organizationId: 'org-1' },
};

const userData = {
    email: 'existing@example.com',
    username: 'newuser',
    password: 'Xk9#mQ2$vLp7Wz',
    role: 'viewer',
    organizationId: 'org-1',
};

describe('createUser — invoke error surfacing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('surfaces the JSON error body from a FunctionsHttpError Response context', async () => {
        sb.functions.invoke.mockResolvedValue({
            data: null,
            error: Object.assign(
                new Error('Edge Function returned a non-2xx status code'),
                {
                    name: 'FunctionsHttpError',
                    context: new Response(
                        JSON.stringify({ error: 'A user with this email already exists' }),
                        { status: 400, headers: { 'Content-Type': 'application/json' } },
                    ),
                },
            ),
        });

        const result = await createUser.call(adminStub, { ...userData });

        expect(result.success).toBe(false);
        expect(result.error).toBe('A user with this email already exists');
    });

    it('falls back to error.message when the error has no Response context', async () => {
        sb.functions.invoke.mockResolvedValue({
            data: null,
            error: new Error('Something went wrong upstream'),
        });

        const result = await createUser.call(adminStub, { ...userData });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Something went wrong upstream');
    });
});
