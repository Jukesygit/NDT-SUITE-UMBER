/**
 * Tests for competency-comments service module.
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
        mockGetCurrentUser: vi.fn((): any => ({ id: 'user-1', role: 'admin' })),
    };
});

vi.mock('../../supabase-client.js', () => ({
    default: mockChain, supabase: mockChain, isSupabaseConfigured: mockIsConfigured,
}));
vi.mock('../../auth-manager.js', () => ({ default: { getCurrentUser: mockGetCurrentUser } }));

import {
    getCompetencyComments, getCompetenciesWithComments,
    addCompetencyComment, updateCompetencyComment,
    deleteCompetencyComment, pinCompetencyComment,
} from '../competency-comments';

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
    mockGetCurrentUser.mockReturnValue({ id: 'user-1', role: 'admin' });
});

describe('getCompetencyComments', () => {
    it('returns comments for a competency', async () => {
        const comments = [{ id: 'cm1', comment_text: 'looks good' }];
        mockChain._resolved = { data: comments, error: null };
        const result = await getCompetencyComments('ec1');
        expect(result).toEqual(comments);
        expect(mockChain.from).toHaveBeenCalledWith('competency_comments');
        expect(mockChain.eq).toHaveBeenCalledWith('employee_competency_id', 'ec1');
    });

    it('returns empty array when data is null', async () => {
        mockChain._resolved = { data: null, error: null };
        const result = await getCompetencyComments('ec1');
        expect(result).toEqual([]);
    });

    it('throws when supabase not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(getCompetencyComments('ec1')).rejects.toThrow('Supabase not configured');
    });
});

describe('getCompetenciesWithComments', () => {
    it('calls RPC with correct parameters', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: [{ id: 'x' }], error: null });
        const result = await getCompetenciesWithComments('u1', 14);
        expect(mockChain.rpc).toHaveBeenCalledWith('get_competencies_with_comments', {
            p_user_id: 'u1', p_days_back: 14,
        });
        expect(result).toEqual([{ id: 'x' }]);
    });

    it('throws on error', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc fail' } });
        await expect(getCompetenciesWithComments(null)).rejects.toEqual({ message: 'rpc fail' });
    });
});

describe('addCompetencyComment', () => {
    it('inserts a comment with current user as author', async () => {
        const comment = { id: 'cm1', comment_text: 'hello' };
        mockChain.single.mockResolvedValueOnce({ data: comment, error: null });
        const result = await addCompetencyComment('ec1', 'hello', 'general', false, null);
        expect(result).toEqual(comment);
        expect(mockChain.insert).toHaveBeenCalled();
    });

    it('throws when not authenticated', async () => {
        mockGetCurrentUser.mockReturnValueOnce(null);
        await expect(addCompetencyComment('ec1', 'text')).rejects.toThrow('Not authenticated');
    });

    it('throws when supabase not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(addCompetencyComment('ec1', 'text')).rejects.toThrow('Supabase not configured');
    });
});

describe('updateCompetencyComment', () => {
    it('updates comment fields', async () => {
        const updated = { id: 'cm1', comment_text: 'updated' };
        mockChain.single.mockResolvedValueOnce({ data: updated, error: null });
        const result = await updateCompetencyComment('cm1', { comment_text: 'updated' });
        expect(result).toEqual(updated);
    });
});

describe('deleteCompetencyComment', () => {
    it('deletes a comment and returns true', async () => {
        mockChain._resolved = { error: null };
        const result = await deleteCompetencyComment('cm1');
        expect(result).toBe(true);
    });

    it('throws on error', async () => {
        mockChain._resolved = { error: { message: 'not found' } };
        await expect(deleteCompetencyComment('cm1')).rejects.toEqual({ message: 'not found' });
    });
});

describe('pinCompetencyComment', () => {
    it('delegates to updateCompetencyComment with is_pinned', async () => {
        const pinned = { id: 'cm1', is_pinned: true };
        mockChain.single.mockResolvedValueOnce({ data: pinned, error: null });
        const result = await pinCompetencyComment('cm1', true);
        expect(result).toEqual(pinned);
        expect(mockChain.update).toHaveBeenCalledWith({ is_pinned: true });
    });
});
