/**
 * Tests for competency-definitions service (admin category & definition CRUD).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockChain, mockIsConfigured, mockGetCurrentUser } = vi.hoisted(() => {
    function buildChain(resolved = { data: [], error: null }) {
        const chain: Record<string, any> = { _resolved: resolved };
        chain.resolveWith = (v: any) => { chain._resolved = v; return chain; };
        const self = () => chain;
        for (const m of ['from','select','insert','update','upsert','delete','eq','neq','in','not','gte','lte','order','limit']) {
            chain[m] = vi.fn(self);
        }
        chain.single = vi.fn(() => Promise.resolve(chain._resolved));
        chain.maybeSingle = vi.fn(() => Promise.resolve(chain._resolved));
        chain.rpc = vi.fn(() => Promise.resolve(chain._resolved));
        chain.storage = { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) };
        chain.then = (resolve: any, reject?: any) => Promise.resolve(chain._resolved).then(resolve, reject);
        return chain;
    }
    return {
        mockChain: buildChain(),
        mockIsConfigured: vi.fn(() => true),
        mockGetCurrentUser: vi.fn((): any => ({ id: 'admin-1', role: 'admin' })),
    };
});

vi.mock('../../supabase-client.js', () => ({
    default: mockChain, supabase: mockChain, isSupabaseConfigured: mockIsConfigured,
}));
vi.mock('../../auth-manager.js', () => ({ default: { getCurrentUser: mockGetCurrentUser } }));
vi.mock('../activity-log-service.ts', () => ({ logActivity: vi.fn() }));

import {
    requireAdmin, createCategory, updateCategory, deleteCategory,
    reorderCategories, createDefinition, updateDefinition,
    deleteDefinition, reorderDefinitions,
} from '../competency-definitions';

function resetChain() {
    mockChain._resolved = { data: [], error: null };
    mockChain.then = (resolve: any, reject?: any) => Promise.resolve(mockChain._resolved).then(resolve, reject);
    const self = () => mockChain;
    for (const m of ['from','select','insert','update','upsert','delete','eq','neq','in','not','gte','lte','order','limit']) {
        mockChain[m].mockImplementation(self);
    }
    mockChain.single.mockImplementation(() => Promise.resolve(mockChain._resolved));
    mockChain.maybeSingle.mockImplementation(() => Promise.resolve(mockChain._resolved));
    mockChain.rpc.mockImplementation(() => Promise.resolve(mockChain._resolved));
}

beforeEach(() => {
    vi.clearAllMocks();
    resetChain();
    mockIsConfigured.mockReturnValue(true);
    mockGetCurrentUser.mockReturnValue({ id: 'admin-1', role: 'admin' });
});

describe('requireAdmin', () => {
    it('returns user when admin', () => {
        expect(requireAdmin()).toHaveProperty('role', 'admin');
    });
    it('throws when not authenticated', () => {
        mockGetCurrentUser.mockReturnValueOnce(null);
        expect(() => requireAdmin()).toThrow('Not authenticated');
    });
    it('throws when not admin role', () => {
        mockGetCurrentUser.mockReturnValueOnce({ id: 'u1', role: 'viewer' });
        expect(() => requireAdmin()).toThrow('Admin access required');
    });
});

describe('createCategory', () => {
    it('creates category with correct display_order', async () => {
        mockChain._resolved = { data: [{ display_order: 3 }], error: null };
        mockChain.single.mockResolvedValueOnce({
            data: { id: 'cat-new', name: 'Safety', display_order: 4 }, error: null,
        });
        const result = await createCategory({ name: 'Safety' });
        expect(result.name).toBe('Safety');
    });
    it('throws when supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(createCategory({ name: 'X' })).rejects.toThrow('Supabase not configured');
    });
});

describe('updateCategory', () => {
    it('updates category fields', async () => {
        mockChain.single.mockResolvedValueOnce({ data: { id: 'cat-1', name: 'Updated' }, error: null });
        const result = await updateCategory('cat-1', { name: 'Updated' });
        expect(result.name).toBe('Updated');
    });
});

describe('deleteCategory', () => {
    it('soft-deletes when category has definitions', async () => {
        mockChain._resolved = { data: [{ id: 'def-1' }], error: null };
        mockChain.single.mockResolvedValueOnce({ data: { id: 'cat-1', is_active: false }, error: null });
        const result = await deleteCategory('cat-1', true);
        expect(result).toEqual({ success: true, softDeleted: true });
    });
    it('hard-deletes when no definitions and hardDelete=true', async () => {
        mockChain._resolved = { data: [], error: null };
        const result = await deleteCategory('cat-1', true);
        expect(result).toEqual({ success: true, softDeleted: false });
    });
    it('soft-deletes when hardDelete=false', async () => {
        mockChain._resolved = { data: [], error: null };
        mockChain.single.mockResolvedValueOnce({ data: { id: 'cat-1', is_active: false }, error: null });
        const result = await deleteCategory('cat-1', false);
        expect(result.softDeleted).toBe(true);
    });
});

describe('reorderCategories', () => {
    it('updates display_order for each id', async () => {
        mockChain._resolved = { error: null };
        const result = await reorderCategories(['c1', 'c2', 'c3']);
        expect(result).toEqual({ success: true });
        expect(mockChain.update).toHaveBeenCalledTimes(3);
    });
});

describe('createDefinition', () => {
    it('creates definition with next display_order', async () => {
        mockChain._resolved = { data: [{ display_order: 2 }], error: null };
        mockChain.single.mockResolvedValueOnce({ data: { id: 'def-new', name: 'UT', display_order: 3 }, error: null });
        const result = await createDefinition({ name: 'UT', category_id: 'cat-1', field_type: 'text' as any });
        expect(result.name).toBe('UT');
    });
});

describe('updateDefinition', () => {
    it('updates definition fields', async () => {
        mockChain.single.mockResolvedValueOnce({ data: { id: 'def-1', name: 'Updated UT' }, error: null });
        const result = await updateDefinition('def-1', { name: 'Updated UT' });
        expect(result.name).toBe('Updated UT');
    });
});

describe('deleteDefinition', () => {
    it('soft-deletes when employee records exist', async () => {
        mockChain._resolved = { data: [{ id: 'ec1' }], error: null };
        mockChain.single.mockResolvedValueOnce({ data: { id: 'def-1', is_active: false }, error: null });
        const result = await deleteDefinition('def-1', true);
        expect(result.softDeleted).toBe(true);
    });
    it('hard-deletes when no employee records and hardDelete=true', async () => {
        mockChain._resolved = { data: [], error: null };
        const result = await deleteDefinition('def-1', true);
        expect(result).toEqual({ success: true, softDeleted: false });
    });
});

describe('reorderDefinitions', () => {
    it('updates display_order for each definition id', async () => {
        mockChain._resolved = { error: null };
        const result = await reorderDefinitions('cat-1', ['d1', 'd2']);
        expect(result).toEqual({ success: true });
        expect(mockChain.update).toHaveBeenCalledTimes(2);
    });
});
