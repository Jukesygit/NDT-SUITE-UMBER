/**
 * Tests for admin-orgs service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuth } = vi.hoisted(() => ({
    mockAuth: {
        getCurrentUser: vi.fn((): any => ({ id: 'user-1', role: 'admin' })),
        getUsers: vi.fn().mockResolvedValue([]),
        getUser: vi.fn().mockResolvedValue(null),
        getOrganizations: vi.fn().mockResolvedValue([]),
        createOrganization: vi.fn().mockResolvedValue({ success: true }),
        updateOrganization: vi.fn().mockResolvedValue({ success: true }),
        deleteOrganization: vi.fn().mockResolvedValue({ success: true }),
        getPendingAccountRequests: vi.fn().mockResolvedValue([]),
        isUsingSupabase: vi.fn().mockReturnValue(true),
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../auth-manager.js', () => ({ default: mockAuth }));
vi.mock('../activity-log-service', () => ({ logActivity: vi.fn() }));
vi.mock('../admin-users', () => ({ getPermissionRequests: vi.fn().mockResolvedValue([]) }));

import {
    getDashboardStats, getOrganizations, getOrganizationsWithStats,
    createOrganization, updateOrganization, deleteOrganization,
} from '../admin-orgs';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getDashboardStats', () => {
    it('returns aggregated stats', async () => {
        mockAuth.getOrganizations.mockResolvedValueOnce([
            { id: 'o1', name: 'Acme' }, { id: 'o2', name: 'SYSTEM' },
        ]);
        mockAuth.getUsers.mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }]);
        mockAuth.getPendingAccountRequests.mockResolvedValueOnce([{ id: 'r1' }]);
        const stats = await getDashboardStats();
        expect(stats.totalOrganizations).toBe(1);
        expect(stats.totalUsers).toBe(2);
        expect(stats.pendingAccountRequests).toBe(1);
    });

    it('returns zeros on error', async () => {
        mockAuth.ensureInitialized.mockRejectedValueOnce(new Error('init fail'));
        const stats = await getDashboardStats();
        expect(stats.totalOrganizations).toBe(0);
    });
});

describe('getOrganizations', () => {
    it('filters out SYSTEM organization', async () => {
        mockAuth.getOrganizations.mockResolvedValueOnce([
            { id: 'o1', name: 'Acme' }, { id: 'o2', name: 'SYSTEM' },
        ]);
        const result = await getOrganizations();
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('Acme');
    });
});

describe('getOrganizationsWithStats', () => {
    it('returns orgs with userCount=0', async () => {
        mockAuth.getOrganizations.mockResolvedValueOnce([{ id: 'o1', name: 'Corp' }]);
        const result = await getOrganizationsWithStats();
        expect(result).toEqual([{ organization: { id: 'o1', name: 'Corp' }, userCount: 0 }]);
    });
});

describe('createOrganization', () => {
    it('creates org and logs activity', async () => {
        mockAuth.createOrganization.mockResolvedValueOnce({ success: true, data: { id: 'o1' } });
        const result = await createOrganization('NewOrg');
        expect(result.success).toBe(true);
    });
});

describe('updateOrganization', () => {
    it('updates org name', async () => {
        mockAuth.updateOrganization.mockResolvedValueOnce({ success: true });
        const result = await updateOrganization('o1', { name: 'Renamed' });
        expect(result.success).toBe(true);
    });
});

describe('deleteOrganization', () => {
    it('deletes org', async () => {
        mockAuth.deleteOrganization.mockResolvedValueOnce({ success: true });
        const result = await deleteOrganization('o1');
        expect(result.success).toBe(true);
    });
});
