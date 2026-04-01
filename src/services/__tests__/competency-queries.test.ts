/**
 * Tests for competency-queries service module.
 * Mocks the Supabase client and auth manager to test query logic in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Hoisted mocks (available before vi.mock factories run) ----
const { mockChain, mockIsConfigured, mockGetCurrentUser } = vi.hoisted(() => {
    // Build a chainable Supabase query mock inline (cannot import before vi.mock)
    function buildChain(resolved = { data: [], error: null }) {
        const chain: Record<string, any> = { _resolved: resolved };
        chain.resolveWith = (v: any) => { chain._resolved = v; return chain; };
        const self = () => chain;
        for (const m of [
            'from','select','insert','update','upsert','delete',
            'eq','neq','in','not','gte','lte','order','limit',
        ]) {
            chain[m] = vi.fn(self);
        }
        chain.single = vi.fn(() => Promise.resolve(chain._resolved));
        chain.maybeSingle = vi.fn(() => Promise.resolve(chain._resolved));
        chain.rpc = vi.fn(() => Promise.resolve(chain._resolved));
        chain.storage = {
            from: vi.fn(() => ({
                upload: vi.fn(() => Promise.resolve(chain._resolved)),
                remove: vi.fn(() => Promise.resolve(chain._resolved)),
                createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://signed-url.test' }, error: null })),
            })),
        };
        chain.then = (resolve: any, reject?: any) =>
            Promise.resolve(chain._resolved).then(resolve, reject);
        return chain;
    }
    return {
        mockChain: buildChain(),
        mockIsConfigured: vi.fn(() => true),
        mockGetCurrentUser: vi.fn((): any => ({
            id: 'user-1', role: 'admin', organizationId: 'org-1',
        })),
    };
});

vi.mock('../../supabase-client.js', () => ({
    default: mockChain,
    supabase: mockChain,
    isSupabaseConfigured: mockIsConfigured,
}));
vi.mock('../../auth-manager.js', () => ({
    default: { getCurrentUser: mockGetCurrentUser },
}));

import {
    getCategories,
    getCompetencyDefinitions,
    getUserCompetencies,
    getUserCompetenciesByCategory,
    getCompetencyHistory,
    getDocumentUrl,
    canManageCompetencies,
    // getPendingApprovals - imported but currently unused in tests
    getExpiringCompetencies,
    getAllCategories,
    getAllDefinitions,
    getDefinitionUsageCount,
} from '../competency-queries';
function resetChain() {
    mockChain._resolved = { data: [], error: null };
    // Restore the default .then so it resolves _resolved
    mockChain.then = (resolve: any, reject?: any) =>
        Promise.resolve(mockChain._resolved).then(resolve, reject);
    // Restore chainable methods (clearAllMocks wipes implementations)
    const self = () => mockChain;
    for (const m of [
        'from','select','insert','update','upsert','delete',
        'eq','neq','in','not','gte','lte','order','limit',
    ]) {
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
    mockGetCurrentUser.mockReturnValue({ id: 'user-1', role: 'admin', organizationId: 'org-1' });
});

// ---------------------------------------------------------------------------
// getCategories
// ---------------------------------------------------------------------------
describe('getCategories', () => {
    it('returns categories on success', async () => {
        const cats = [{ id: 'c1', name: 'NDT Methods' }];
        mockChain.resolveWith({ data: cats, error: null });
        const result = await getCategories();
        expect(result).toEqual(cats);
        expect(mockChain.from).toHaveBeenCalledWith('competency_categories');
        expect(mockChain.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('throws when supabase returns error', async () => {
        mockChain.resolveWith({ data: null, error: { message: 'db error' } });
        // The chain.then resolves with error in data but getCategories does:
        // const { data, error } = await supabase.from(...)...
        // Since our mock resolves the chain, we need single/maybeSingle not called here.
        // getCategories awaits the chain directly (no .single()), so it resolves via .then
        await expect(getCategories()).rejects.toEqual({ message: 'db error' });
    });

    it('throws when supabase is not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(getCategories()).rejects.toThrow('Supabase not configured');
    });
});

// ---------------------------------------------------------------------------
// getCompetencyDefinitions
// ---------------------------------------------------------------------------
describe('getCompetencyDefinitions', () => {
    it('fetches all active definitions when no categoryId given', async () => {
        const defs = [{ id: 'd1', name: 'UT Level 2' }];
        mockChain.resolveWith({ data: defs, error: null });
        const result = await getCompetencyDefinitions();
        expect(result).toEqual(defs);
        expect(mockChain.from).toHaveBeenCalledWith('competency_definitions');
        expect(mockChain.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('filters by categoryId when provided', async () => {
        mockChain.resolveWith({ data: [], error: null });
        await getCompetencyDefinitions('cat-42');
        expect(mockChain.eq).toHaveBeenCalledWith('category_id', 'cat-42');
    });

    it('throws on error', async () => {
        mockChain.resolveWith({ data: null, error: { message: 'fail' } });
        await expect(getCompetencyDefinitions()).rejects.toEqual({ message: 'fail' });
    });
});

// ---------------------------------------------------------------------------
// getUserCompetencies
// ---------------------------------------------------------------------------
describe('getUserCompetencies', () => {
    it('queries employee_competencies for given userId', async () => {
        const comps = [{ id: 'ec1', user_id: 'u1' }];
        mockChain.resolveWith({ data: comps, error: null });
        const result = await getUserCompetencies('u1');
        expect(result).toEqual(comps);
        expect(mockChain.from).toHaveBeenCalledWith('employee_competencies');
        expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'u1');
    });
});

// ---------------------------------------------------------------------------
// getUserCompetenciesByCategory
// ---------------------------------------------------------------------------
describe('getUserCompetenciesByCategory', () => {
    it('groups competencies under their categories', async () => {
        // First call: getUserCompetencies -> employee_competencies
        // Second call: getCategories -> competency_categories
        // Both go through the same mock chain, so we control the ordering by call count.
        const categories = [
            { id: 'cat1', name: 'NDT', display_order: 1, is_active: true },
        ];
        const competencies = [
            { id: 'ec1', user_id: 'u1', competency: { category: { id: 'cat1' } } },
        ];

        let callCount = 0;
        mockChain.then = function (resolve: any) {
            callCount++;
            // call 1 = getUserCompetencies, call 2 = getCategories
            if (callCount === 1) {
                return Promise.resolve({ data: competencies, error: null }).then(resolve);
            }
            return Promise.resolve({ data: categories, error: null }).then(resolve);
        };

        const result = await getUserCompetenciesByCategory('u1');
        expect(Array.isArray(result)).toBe(true);
        expect(result[0]).toHaveProperty('category');
        expect(result[0]).toHaveProperty('competencies');
    });
});

// ---------------------------------------------------------------------------
// getCompetencyHistory
// ---------------------------------------------------------------------------
describe('getCompetencyHistory', () => {
    it('returns history capped at 50 entries', async () => {
        mockChain.resolveWith({ data: [{ id: 'h1' }], error: null });
        const result = await getCompetencyHistory('u1');
        expect(result).toEqual([{ id: 'h1' }]);
        expect(mockChain.limit).toHaveBeenCalledWith(50);
    });
});

// ---------------------------------------------------------------------------
// getDocumentUrl
// ---------------------------------------------------------------------------
describe('getDocumentUrl', () => {
    it('returns the URL directly if it starts with http', async () => {
        const url = await getDocumentUrl('https://example.com/doc.pdf');
        expect(url).toBe('https://example.com/doc.pdf');
    });

    it('creates a signed URL for storage paths', async () => {
        const result = await getDocumentUrl('competency-documents/file.pdf');
        expect(result).toBe('https://signed-url.test');
    });
});

// ---------------------------------------------------------------------------
// canManageCompetencies
// ---------------------------------------------------------------------------
describe('canManageCompetencies', () => {
    it('returns true for admin users', async () => {
        const result = await canManageCompetencies('any-user');
        expect(result).toBe(true);
    });

    it('returns true when user manages own competencies', async () => {
        mockGetCurrentUser.mockReturnValueOnce({
            id: 'u1', role: 'viewer', organizationId: 'org-1',
        });
        const result = await canManageCompetencies('u1');
        expect(result).toBe(true);
    });

    it('returns false when no user is logged in', async () => {
        mockGetCurrentUser.mockReturnValueOnce(null);
        const result = await canManageCompetencies('u1');
        expect(result).toBe(false);
    });

    it('checks org match for org_admin role', async () => {
        mockGetCurrentUser.mockReturnValueOnce({
            id: 'admin-1', role: 'org_admin', organizationId: 'org-1',
        });
        mockChain.single.mockResolvedValueOnce({
            data: { organization_id: 'org-1' }, error: null,
        });
        const result = await canManageCompetencies('target-user');
        expect(result).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// getExpiringCompetencies
// ---------------------------------------------------------------------------
describe('getExpiringCompetencies', () => {
    it('calls RPC function by default', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: [{ id: 'e1' }], error: null });
        const result = await getExpiringCompetencies(30);
        expect(mockChain.rpc).toHaveBeenCalledWith('get_expiring_competencies', { days_threshold: 30 });
        expect(result).toEqual([{ id: 'e1' }]);
    });

    it('calls with-comments RPC when includeComments=true', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: [], error: null });
        await getExpiringCompetencies(14, true);
        expect(mockChain.rpc).toHaveBeenCalledWith(
            'get_expiring_competencies_with_comments',
            { days_threshold: 14 },
        );
    });

    it('falls back to direct query when RPC function does not exist', async () => {
        mockChain.rpc.mockResolvedValueOnce({
            data: null,
            error: { message: 'function get_expiring_competencies does not exist' },
        });
        mockChain.resolveWith({ data: [], error: null });
        const result = await getExpiringCompetencies(30);
        expect(result).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// getAllCategories
// ---------------------------------------------------------------------------
describe('getAllCategories', () => {
    it('fetches all including inactive by default', async () => {
        mockChain.resolveWith({ data: [{ id: 'c1' }], error: null });
        const result = await getAllCategories();
        expect(result).toEqual([{ id: 'c1' }]);
        // Should NOT have called .eq('is_active', true) since includeInactive=true
    });

    it('filters to active only when includeInactive=false', async () => {
        mockChain.resolveWith({ data: [], error: null });
        await getAllCategories(false);
        expect(mockChain.eq).toHaveBeenCalledWith('is_active', true);
    });
});

// ---------------------------------------------------------------------------
// getAllDefinitions
// ---------------------------------------------------------------------------
describe('getAllDefinitions', () => {
    it('fetches definitions with optional category filter', async () => {
        mockChain.resolveWith({ data: [], error: null });
        await getAllDefinitions(true, 'cat-1');
        expect(mockChain.eq).toHaveBeenCalledWith('category_id', 'cat-1');
    });
});

// ---------------------------------------------------------------------------
// getDefinitionUsageCount
// ---------------------------------------------------------------------------
describe('getDefinitionUsageCount', () => {
    it('returns count from employee_competencies', async () => {
        mockChain.resolveWith({ count: 5, error: null });
        // getDefinitionUsageCount awaits the chain, which resolves via .then
        const result = await getDefinitionUsageCount('def-1');
        expect(result).toBe(5);
    });

    it('returns 0 when count is null', async () => {
        mockChain.resolveWith({ count: null, error: null });
        const result = await getDefinitionUsageCount('def-1');
        expect(result).toBe(0);
    });
});
