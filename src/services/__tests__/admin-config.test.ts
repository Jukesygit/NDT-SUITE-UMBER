/**
 * Tests for admin-config service module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockChain, mockAuth, mockConfigManager } = vi.hoisted(() => {
    function buildChain(resolved = { data: null, error: null }) {
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
        mockAuth: {
            getCurrentUser: vi.fn((): any => ({ id: 'user-1', role: 'admin' })),
            isUsingSupabase: vi.fn().mockReturnValue(true),
        },
        mockConfigManager: {
            ensureInitialized: vi.fn().mockResolvedValue(undefined),
            getAllConfig: vi.fn().mockReturnValue({ procedureNumbers: ['P001'] }),
            getListMetadata: vi.fn().mockReturnValue({ procedureNumbers: { label: 'Procedures', icon: 'doc' } }),
            addItem: vi.fn().mockResolvedValue({ success: true }),
            updateItem: vi.fn().mockResolvedValue({ success: true }),
            removeItem: vi.fn().mockResolvedValue({ success: true }),
            resetList: vi.fn().mockResolvedValue({ success: true }),
            resetAllToDefaults: vi.fn().mockResolvedValue({ success: true }),
            exportConfig: vi.fn().mockReturnValue('{"procedureNumbers":["P001"]}'),
            importConfig: vi.fn().mockResolvedValue({ success: true }),
        },
    };
});

vi.mock('../../supabase-client.js', () => ({ default: mockChain, supabase: mockChain }));
vi.mock('../../auth-manager.js', () => ({ default: mockAuth }));
vi.mock('../../admin-config.js', () => ({ default: mockConfigManager }));

import {
    getConfig, getConfigMetadata, addConfigItem, updateConfigItem,
    removeConfigItem, resetConfigList, resetAllConfig,
    exportConfig, importConfig,
    getActiveAnnouncement, updateAnnouncement, clearAnnouncement,
} from '../admin-config';

function resetChain() {
    mockChain._resolved = { data: null, error: null };
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
    mockAuth.getCurrentUser.mockReturnValue({ id: 'user-1', role: 'admin' });
});

describe('getConfig', () => {
    it('returns all config after initialization', async () => {
        const result = await getConfig();
        expect(mockConfigManager.ensureInitialized).toHaveBeenCalled();
        expect(result).toEqual({ procedureNumbers: ['P001'] });
    });
});

describe('getConfigMetadata', () => {
    it('returns metadata from config manager', () => {
        expect(getConfigMetadata()).toHaveProperty('procedureNumbers');
    });
});

describe('addConfigItem', () => {
    it('delegates to config manager', async () => {
        const result = await addConfigItem('procedureNumbers', 'P002');
        expect(result.success).toBe(true);
    });
});

describe('updateConfigItem', () => {
    it('delegates to config manager', async () => {
        const result = await updateConfigItem('procedureNumbers', 'P001', 'P001-v2');
        expect(result.success).toBe(true);
    });
});

describe('removeConfigItem', () => {
    it('delegates to config manager', async () => {
        const result = await removeConfigItem('procedureNumbers', 'P001');
        expect(result.success).toBe(true);
    });
});

describe('resetConfigList', () => {
    it('resets a single list', async () => {
        const result = await resetConfigList('procedureNumbers');
        expect(result.success).toBe(true);
    });
});

describe('resetAllConfig', () => {
    it('resets all to defaults', async () => {
        const result = await resetAllConfig();
        expect(result.success).toBe(true);
    });
});

describe('exportConfig', () => {
    it('returns JSON string', () => {
        expect(exportConfig()).toContain('procedureNumbers');
    });
});

describe('importConfig', () => {
    it('imports JSON config string', async () => {
        const result = await importConfig('{"procedureNumbers":["P002"]}');
        expect(result.success).toBe(true);
    });
});

describe('getActiveAnnouncement', () => {
    it('returns null when supabase not configured', async () => {
        mockAuth.isUsingSupabase.mockReturnValueOnce(false);
        expect(await getActiveAnnouncement()).toBeNull();
    });

    it('returns announcement from database', async () => {
        const announcement = { id: 'a1', message: 'hello', type: 'info', is_active: true };
        mockChain.maybeSingle.mockResolvedValueOnce({ data: announcement, error: null });
        expect(await getActiveAnnouncement()).toEqual(announcement);
    });

    it('returns null on error', async () => {
        mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
        expect(await getActiveAnnouncement()).toBeNull();
    });
});

describe('updateAnnouncement', () => {
    it('returns error when supabase not configured', async () => {
        mockAuth.isUsingSupabase.mockReturnValueOnce(false);
        const result = await updateAnnouncement({
            message: 'hi', type: 'info', is_active: true, is_dismissible: true,
        });
        expect(result.success).toBe(false);
    });

    it('returns error when user not authenticated', async () => {
        mockAuth.getCurrentUser.mockReturnValueOnce(null);
        const result = await updateAnnouncement({
            message: 'hi', type: 'info', is_active: true, is_dismissible: true,
        });
        expect(result.success).toBe(false);
    });

    it('creates new announcement when none exists', async () => {
        mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        mockChain.single.mockResolvedValueOnce({ data: { id: 'a1', message: 'new' }, error: null });
        const result = await updateAnnouncement({
            message: 'new', type: 'info', is_active: true, is_dismissible: true,
        });
        expect(result.success).toBe(true);
    });

    it('updates existing announcement', async () => {
        mockChain.maybeSingle.mockResolvedValueOnce({ data: { id: 'a1' }, error: null });
        mockChain.single.mockResolvedValueOnce({ data: { id: 'a1', message: 'updated' }, error: null });
        const result = await updateAnnouncement({
            message: 'updated', type: 'warning', is_active: true, is_dismissible: false,
        });
        expect(result.success).toBe(true);
    });
});

describe('clearAnnouncement', () => {
    it('returns error when supabase not configured', async () => {
        mockAuth.isUsingSupabase.mockReturnValueOnce(false);
        expect((await clearAnnouncement()).success).toBe(false);
    });

    it('deactivates all active announcements', async () => {
        mockChain._resolved = { error: null };
        expect((await clearAnnouncement()).success).toBe(true);
    });
});
