/**
 * Tests for personnel-service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockChain, mockIsConfigured, mockGetCurrentUser } = vi.hoisted(() => {
    function buildChain(resolved = { data: [], error: null }) {
        const chain: Record<string, any> = { _resolved: resolved };
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
vi.mock('../competency-service.ts', () => ({
    default: {
        getCompetencyDefinitions: vi.fn().mockResolvedValue([]),
        getExpiringCompetencies: vi.fn().mockResolvedValue([]),
    },
}));

import personnelService from '../personnel-service';

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

describe('getAllPersonnelWithCompetencies', () => {
    it('combines profiles with grouped competencies', async () => {
        let thenCount = 0;
        mockChain.then = function (resolve: any) {
            thenCount++;
            if (thenCount === 1) {
                return Promise.resolve({
                    data: [{ id: 'u1', username: 'alice' }], error: null,
                }).then(resolve);
            }
            return Promise.resolve({
                data: [{
                    user_id: 'u1', competency_definitions: {
                        id: 'd1', name: 'UT', competency_categories: { id: 'c1', name: 'NDT' },
                    },
                }], error: null,
            }).then(resolve);
        };
        const result = await personnelService.getAllPersonnelWithCompetencies();
        expect(result).toHaveLength(1);
        expect((result[0] as any).username).toBe('alice');
        expect((result[0] as any).competencies).toHaveLength(1);
    });

    it('throws when supabase not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(personnelService.getAllPersonnelWithCompetencies())
            .rejects.toThrow('Supabase not configured');
    });
});

describe('exportPersonnelToCSV', () => {
    it('generates CSV with competency columns', async () => {
        const personnel = [{
            username: 'alice', email: 'a@test.com', role: 'admin',
            organizations: { name: 'Acme' },
            competencies: [{
                value: 'valid', expiry_date: null, status: 'active',
                competency: { name: 'UT Level 2' },
            }],
        }];
        const csv = await personnelService.exportPersonnelToCSV(personnel);
        expect(csv).toContain('Name');
        expect(csv).toContain('UT Level 2');
        expect(csv).toContain('alice');
    });

    it('throws when no personnel data', async () => {
        await expect(personnelService.exportPersonnelToCSV([]))
            .rejects.toThrow('No personnel data to export');
    });

    it('throws when personnel is null', async () => {
        await expect(personnelService.exportPersonnelToCSV(null as any))
            .rejects.toThrow('No personnel data to export');
    });
});

describe('getOrganizationPersonnelStats', () => {
    it('calculates stats from profiles and competencies', async () => {
        mockChain._resolved = {
            data: [{
                id: 'u1', username: 'alice',
                competencies: [
                    { id: 'ec1', status: 'active', expiry_date: null },
                    { id: 'ec2', status: 'expired', expiry_date: '2020-01-01' },
                ],
            }], error: null,
        };
        const stats = await personnelService.getOrganizationPersonnelStats('org-1');
        expect(stats.totalPersonnel).toBe(1);
        expect(stats.totalCompetencies).toBe(2);
        expect(stats.activeCompetencies).toBe(1);
    });

    it('throws when supabase not configured', async () => {
        mockIsConfigured.mockReturnValueOnce(false);
        await expect(personnelService.getOrganizationPersonnelStats('org-1'))
            .rejects.toThrow('Supabase not configured');
    });
});

describe('bulkUpdateCompetencyStatus', () => {
    it('throws when user is not admin', async () => {
        mockGetCurrentUser.mockReturnValueOnce({ id: 'u1', role: 'viewer' });
        await expect(personnelService.bulkUpdateCompetencyStatus([]))
            .rejects.toThrow('Insufficient permissions');
    });

    it('processes updates and returns results', async () => {
        mockChain._resolved = { error: null };
        const result = await personnelService.bulkUpdateCompetencyStatus([
            { userId: 'u1', competencyId: 'c1', status: 'active' },
        ]);
        expect(result.success).toHaveLength(1);
        expect(result.failed).toHaveLength(0);
    });
});
