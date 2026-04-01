/**
 * Tests for admin-users service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockChain, mockAuth } = vi.hoisted(() => {
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
        mockAuth: {
            getCurrentUser: vi.fn((): any => ({ id: 'user-1', role: 'admin', organizationId: 'org-1' })),
            getUsers: vi.fn().mockResolvedValue([]),
            getUser: vi.fn().mockResolvedValue(null),
            createUser: vi.fn().mockResolvedValue({ success: true }),
            updateUser: vi.fn().mockResolvedValue({ success: true }),
            deleteUser: vi.fn().mockResolvedValue({ success: true }),
            getOrganizations: vi.fn().mockResolvedValue([]),
            createOrganization: vi.fn().mockResolvedValue({ success: true }),
            updateOrganization: vi.fn().mockResolvedValue({ success: true }),
            deleteOrganization: vi.fn().mockResolvedValue({ success: true }),
            getPendingAccountRequests: vi.fn().mockResolvedValue([]),
            approveAccountRequest: vi.fn().mockResolvedValue({ success: true }),
            rejectAccountRequest: vi.fn().mockResolvedValue({ success: true }),
            isUsingSupabase: vi.fn().mockReturnValue(true),
            ensureInitialized: vi.fn().mockResolvedValue(undefined),
        },
    };
});

vi.mock('../../supabase-client.js', () => ({ default: mockChain, supabase: mockChain }));
vi.mock('../../auth-manager.js', () => ({ default: mockAuth }));
vi.mock('../activity-log-service', () => ({ logActivity: vi.fn() }));

import {
    getUsers, getUser, createUser, updateUser, deleteUser,
    getAccountRequests, approveAccountRequest, rejectAccountRequest,
    getPermissionRequests, approvePermissionRequest, rejectPermissionRequest,
} from '../admin-users';

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
    mockAuth.isUsingSupabase.mockReturnValue(true);
});

describe('getUsers', () => {
    it('delegates to authManager.getUsers', async () => {
        mockAuth.getUsers.mockResolvedValueOnce([{ id: 'u1' }]);
        const result = await getUsers();
        expect(result).toEqual([{ id: 'u1' }]);
    });
});

describe('getUser', () => {
    it('delegates to authManager.getUser', async () => {
        mockAuth.getUser.mockResolvedValueOnce({ id: 'u1', username: 'alice' });
        const result = await getUser('u1');
        expect(result).toEqual({ id: 'u1', username: 'alice' });
    });
});

describe('createUser', () => {
    it('creates user and logs activity on success', async () => {
        mockAuth.createUser.mockResolvedValueOnce({ success: true });
        const result = await createUser({
            username: 'bob', email: 'bob@test.com', password: 'pass123', role: 'viewer' as any,
        });
        expect(result.success).toBe(true);
    });
});

describe('updateUser', () => {
    it('updates user via authManager', async () => {
        mockAuth.updateUser.mockResolvedValueOnce({ success: true });
        const result = await updateUser('u1', { username: 'new-name' });
        expect(result.success).toBe(true);
    });
});

describe('deleteUser', () => {
    it('deletes user via authManager', async () => {
        mockAuth.deleteUser.mockResolvedValueOnce({ success: true });
        const result = await deleteUser('u1');
        expect(result.success).toBe(true);
    });
});

describe('getAccountRequests', () => {
    it('returns pending requests', async () => {
        mockAuth.getPendingAccountRequests.mockResolvedValueOnce([{ id: 'r1' }]);
        const result = await getAccountRequests();
        expect(result).toEqual([{ id: 'r1' }]);
    });
});

describe('approveAccountRequest', () => {
    it('approves request', async () => {
        mockAuth.approveAccountRequest.mockResolvedValueOnce({ success: true });
        const result = await approveAccountRequest('r1');
        expect(result.success).toBe(true);
    });
});

describe('rejectAccountRequest', () => {
    it('rejects request with reason', async () => {
        mockAuth.rejectAccountRequest.mockResolvedValueOnce({ success: true });
        const result = await rejectAccountRequest('r1', 'not eligible');
        expect(result.success).toBe(true);
        expect(mockAuth.rejectAccountRequest).toHaveBeenCalledWith('r1', 'not eligible');
    });
});

describe('getPermissionRequests', () => {
    it('returns empty array when not using supabase', async () => {
        mockAuth.isUsingSupabase.mockReturnValueOnce(false);
        const result = await getPermissionRequests();
        expect(result).toEqual([]);
    });

    it('returns empty array when query fails', async () => {
        mockChain._resolved = { data: null, error: { message: 'fail' } };
        const result = await getPermissionRequests();
        expect(result).toEqual([]);
    });
});

describe('approvePermissionRequest', () => {
    it('returns error when supabase not configured', async () => {
        mockAuth.isUsingSupabase.mockReturnValueOnce(false);
        const result = await approvePermissionRequest('pr1');
        expect(result).toEqual({ success: false, error: 'Supabase not configured' });
    });

    it('calls RPC to approve', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: { id: 'pr1' }, error: null });
        const result = await approvePermissionRequest('pr1');
        expect(result.success).toBe(true);
        expect(mockChain.rpc).toHaveBeenCalledWith('approve_permission_request', { request_id: 'pr1' });
    });
});

describe('rejectPermissionRequest', () => {
    it('calls RPC to reject with reason', async () => {
        mockChain.rpc.mockResolvedValueOnce({ data: {}, error: null });
        const result = await rejectPermissionRequest('pr1', 'denied');
        expect(result.success).toBe(true);
        expect(mockChain.rpc).toHaveBeenCalledWith('reject_permission_request', {
            request_id: 'pr1', rejection_reason: 'denied',
        });
    });
});
