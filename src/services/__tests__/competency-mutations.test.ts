/**
 * Tests for competency-mutations service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockChain, mockIsConfigured, mockGetCurrentUser } = vi.hoisted(() => {
    function buildChain(resolved = { data: [], error: null }) {
        const chain: Record<string, any> = { _resolved: resolved };
        chain.resolveWith = (v: any) => { chain._resolved = v; return chain; };
        const self = () => chain;
        for (const m of [
            'from','select','insert','update','upsert','delete',
            'eq','neq','in','not','gte','lte','order','limit',
        ]) { chain[m] = vi.fn(self); }
        chain.single = vi.fn(() => Promise.resolve(chain._resolved));
        chain.maybeSingle = vi.fn(() => Promise.resolve(chain._resolved));
        chain.rpc = vi.fn(() => Promise.resolve(chain._resolved));
        chain.storage = {
            from: vi.fn(() => ({
                upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
                remove: vi.fn(() => Promise.resolve({ data: {}, error: null })),
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
        mockGetCurrentUser: vi.fn((): any => ({ id: 'user-1', role: 'admin', organizationId: 'org-1' })),
    };
});

vi.mock('../../supabase-client.js', () => ({
    default: mockChain, supabase: mockChain, isSupabaseConfigured: mockIsConfigured,
}));
vi.mock('../../auth-manager.js', () => ({ default: { getCurrentUser: mockGetCurrentUser } }));
vi.mock('../activity-log-service.ts', () => ({ logActivity: vi.fn() }));
vi.mock('../competency-queries.ts', () => ({
    getCompetencyDefinitions: vi.fn().mockResolvedValue([
        { id: 'def-1', name: 'UT Level 2', field_type: 'text' },
    ]),
}));

import {
    upsertCompetency, deleteCompetency, verifyCompetency, requestChanges,
    uploadDocument, deleteDocument, bulkCreateCompetencies, bulkImportCompetencies,
} from '../competency-mutations';

function resetChain() {
    mockChain._resolved = { data: [], error: null };
    mockChain.then = (resolve: any, reject?: any) =>
        Promise.resolve(mockChain._resolved).then(resolve, reject);
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
    mockGetCurrentUser.mockReturnValue({ id: 'user-1', role: 'admin', organizationId: 'org-1' });
});

describe('upsertCompetency', () => {
    it('upserts with pending_approval status when document is provided', async () => {
        const result = {
            id: 'ec1', created_at: '2024-01-01', updated_at: '2024-01-01',
            competency: { name: 'UT Level 2' },
        };
        mockChain.single.mockResolvedValueOnce({ data: result, error: null });
        const data = await upsertCompetency('u1', 'comp-1', { value: 'valid', documentUrl: 'doc.pdf' });
        expect(data).toEqual(result);
        expect(mockChain.from).toHaveBeenCalledWith('employee_competencies');
        expect(mockChain.upsert).toHaveBeenCalled();
    });

    it('uses active status when no document URL is provided', async () => {
        mockChain.single.mockResolvedValueOnce({
            data: { id: 'ec1', created_at: 't', updated_at: 't', competency: { name: 'X' } }, error: null,
        });
        await upsertCompetency('u1', 'comp-1', { value: 'yes' });
        const upsertCall = mockChain.upsert.mock.calls[0][0];
        expect(upsertCall.status).toBe('active');
    });

    it('throws when supabase not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(upsertCompetency('u1', 'c1', {})).rejects.toThrow('Supabase not configured');
    });

    it('throws on supabase error', async () => {
        mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'conflict' } });
        await expect(upsertCompetency('u1', 'c1', {})).rejects.toEqual({ message: 'conflict' });
    });
});

describe('deleteCompetency', () => {
    it('deletes a competency and returns true', async () => {
        mockChain.single.mockResolvedValueOnce({ data: { competency: { name: 'RT' } }, error: null });
        mockChain._resolved = { error: null };
        const result = await deleteCompetency('ec1');
        expect(result).toBe(true);
    });
});

describe('verifyCompetency', () => {
    it('approves a competency', async () => {
        mockChain.single.mockResolvedValueOnce({
            data: { id: 'ec1', status: 'active', competency: { name: 'MT' } }, error: null,
        });
        const result = await verifyCompetency('ec1', true);
        expect(result.status).toBe('active');
    });

    it('rejects a competency with reason', async () => {
        mockChain.single.mockResolvedValueOnce({
            data: { id: 'ec1', status: 'rejected', competency: { name: 'MT' } }, error: null,
        });
        const result = await verifyCompetency('ec1', false, 'expired cert');
        expect(result.status).toBe('rejected');
    });

    it('throws when not authenticated', async () => {
        mockGetCurrentUser.mockReturnValueOnce(null);
        await expect(verifyCompetency('ec1', true)).rejects.toThrow('Not authenticated');
    });
});

describe('requestChanges', () => {
    it('updates status to changes_requested', async () => {
        mockChain.single.mockResolvedValueOnce({
            data: { id: 'ec1', status: 'changes_requested', competency: { name: 'PT' } }, error: null,
        });
        const result = await requestChanges('ec1', 'Please re-upload');
        expect(result.status).toBe('changes_requested');
    });

    it('throws when not authenticated', async () => {
        mockGetCurrentUser.mockReturnValueOnce(null);
        await expect(requestChanges('ec1', 'fix')).rejects.toThrow('Not authenticated');
    });
});

describe('uploadDocument', () => {
    it('uploads file and returns path info', async () => {
        const file = new File(['content'], 'cert.pdf', { type: 'application/pdf' });
        const result = await uploadDocument(file, 'u1', 'UT Level 2');
        expect(result).toHaveProperty('url');
        expect(result).toHaveProperty('name', 'cert.pdf');
        expect(result).toHaveProperty('path');
    });
});

describe('deleteDocument', () => {
    it('removes a document and returns true', async () => {
        const result = await deleteDocument('docs/file.pdf');
        expect(result).toBe(true);
    });
});

describe('bulkCreateCompetencies', () => {
    it('upserts an array of competencies', async () => {
        mockChain._resolved = { data: [{ id: 'ec1' }], error: null };
        const result = await bulkCreateCompetencies([{ user_id: 'u1', competency_id: 'c1' }]);
        expect(result).toEqual([{ id: 'ec1' }]);
    });

    it('throws when array is empty', async () => {
        await expect(bulkCreateCompetencies([])).rejects.toThrow('Competencies array is required');
    });

    it('throws when argument is not an array', async () => {
        await expect(bulkCreateCompetencies(null as any)).rejects.toThrow('Competencies array is required');
    });
});

describe('bulkImportCompetencies', () => {
    it('matches CSV field names to definitions and imports', async () => {
        mockChain._resolved = { data: [{ id: 'ec1' }], error: null };
        const result = await bulkImportCompetencies('u1', { 'UT Level 2': 'valid' });
        expect(result).toEqual([{ id: 'ec1' }]);
    });

    it('throws when no matching competencies found', async () => {
        await expect(
            bulkImportCompetencies('u1', { 'NonExistent': 'value' }),
        ).rejects.toThrow('No matching competencies found');
    });
});
