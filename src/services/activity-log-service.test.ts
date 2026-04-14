import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockSupabase } = vi.hoisted(() => {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  return {
    mockSupabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn().mockReturnValue(mockQueryBuilder),
      rpc: vi.fn().mockReturnValue({
        then: vi.fn().mockReturnValue(undefined),
      }),
    },
    mockQueryBuilder,
  };
});

vi.mock('../supabase-client', () => ({
  supabase: mockSupabase,
  default: mockSupabase,
}));

import {
  logActivity,
  createActivityLogger,
  getActivityLogs,
  getActivityUsers,
  getActivityStats,
  authLogger,
  profileLogger,
  adminLogger,
} from './activity-log-service';

describe('Activity Log Service - supabase null guards', () => {
  it('getActivityLogs should throw when supabase is null', async () => {
    vi.resetModules();
    vi.doMock('../supabase-client', () => ({ supabase: null, default: null }));
    const { getActivityLogs: fn } = await import('./activity-log-service');
    await expect(fn()).rejects.toThrow('Supabase not configured');
  });

  it('getActivityUsers should throw when supabase is null', async () => {
    vi.resetModules();
    vi.doMock('../supabase-client', () => ({ supabase: null, default: null }));
    const { getActivityUsers: fn } = await import('./activity-log-service');
    await expect(fn()).rejects.toThrow('Supabase not configured');
  });

  it('getActivityStats should throw when supabase is null', async () => {
    vi.resetModules();
    vi.doMock('../supabase-client', () => ({ supabase: null, default: null }));
    const { getActivityStats: fn } = await import('./activity-log-service');
    await expect(fn()).rejects.toThrow('Supabase not configured');
  });
});

describe('Activity Log Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock chain
    const qb = mockSupabase.from();
    qb.select.mockReturnThis();
    qb.eq.mockReturnThis();
    qb.not.mockReturnThis();
    qb.gte.mockReturnThis();
    qb.lte.mockReturnThis();
    qb.or.mockReturnThis();
    qb.order.mockReturnThis();
    qb.range.mockReturnThis();
    qb.limit.mockReturnThis();
  });

  // =========================================================================
  // logActivity
  // =========================================================================
  describe('logActivity', () => {
    it('should call rpc with correct params', async () => {
      await logActivity({
        actionType: 'login_success',
        actionCategory: 'auth',
        description: 'User logged in',
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_action_type: 'login_success',
          p_action_category: 'auth',
          p_description: 'User logged in',
        })
      );
    });

    it('should use auth user id for p_user_id', async () => {
      await logActivity({
        actionType: 'login_success',
        actionCategory: 'auth',
        description: 'test',
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_user_id: 'user-1',
        })
      );
    });

    it('should pass optional details', async () => {
      await logActivity({
        actionType: 'user_created',
        actionCategory: 'admin',
        description: 'Created user',
        details: { role: 'manager', email: 'test@test.com' },
        entityType: 'user',
        entityId: 'u1',
        entityName: 'testuser',
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_details: { role: 'manager', email: 'test@test.com' },
          p_entity_type: 'user',
          p_entity_id: 'u1',
          p_entity_name: 'testuser',
        })
      );
    });

    it('should not throw on error', async () => {
      mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('auth fail'));
      await expect(
        logActivity({
          actionType: 'login_success',
          actionCategory: 'auth',
          description: 'test',
        })
      ).resolves.toBeUndefined();
    });

    it('should pass null for optional fields when not provided', async () => {
      await logActivity({
        actionType: 'logout',
        actionCategory: 'auth',
        description: 'logged out',
      });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_details: null,
          p_entity_type: null,
          p_entity_id: null,
          p_entity_name: null,
        })
      );
    });
  });

  // =========================================================================
  // createActivityLogger
  // =========================================================================
  describe('createActivityLogger', () => {
    it('should return a function', () => {
      const logger = createActivityLogger('auth');
      expect(typeof logger).toBe('function');
    });

    it('should create logger with preset category', async () => {
      const logger = createActivityLogger('admin');
      logger('user_created', 'Created user');
      // logActivity is async fire-and-forget, wait for microtasks
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_action_category: 'admin',
          p_action_type: 'user_created',
        })
      );
    });

    it('should pass additional options', async () => {
      const logger = createActivityLogger('auth');
      logger('login_success', 'Logged in', { entityType: 'session', entityId: 's1' });
      // logActivity is async fire-and-forget, wait for microtasks
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'log_activity',
        expect.objectContaining({
          p_entity_type: 'session',
          p_entity_id: 's1',
        })
      );
    });
  });

  // =========================================================================
  // Pre-configured loggers
  // =========================================================================
  describe('Pre-configured loggers', () => {
    it('authLogger should be a function', () => {
      expect(typeof authLogger).toBe('function');
    });

    it('profileLogger should be a function', () => {
      expect(typeof profileLogger).toBe('function');
    });

    it('adminLogger should be a function', () => {
      expect(typeof adminLogger).toBe('function');
    });
  });

  // =========================================================================
  // getActivityLogs
  // =========================================================================
  describe('getActivityLogs', () => {
    it('should query with default pagination', async () => {
      const qb = mockSupabase.from();
      // Mock the final result
      Object.assign(qb, {
        then: undefined,
        data: [{ id: '1', action_type: 'login_success' }],
        error: null,
        count: 1,
      });
      // Make range return the result object
      qb.range.mockResolvedValueOnce({
        data: [{ id: '1' }],
        error: null,
        count: 1,
      });

      const result = await getActivityLogs();
      expect(mockSupabase.from).toHaveBeenCalledWith('activity_log');
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
    });

    it('should apply userId filter', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ userId: 'u1' });
      expect(qb.eq).toHaveBeenCalledWith('user_id', 'u1');
    });

    it('should apply actionCategory filter', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ actionCategory: 'admin' });
      expect(qb.eq).toHaveBeenCalledWith('action_category', 'admin');
    });

    it('should apply date range filters', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ startDate: '2024-01-01', endDate: '2024-12-31' });
      expect(qb.gte).toHaveBeenCalledWith('created_at', '2024-01-01');
      expect(qb.lte).toHaveBeenCalledWith('created_at', '2024-12-31');
    });

    it('should sanitize search query', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ searchQuery: 'test<script>alert(1)</script>' });
      // Should have called or with sanitized query (no angle brackets)
      expect(qb.or).toHaveBeenCalledWith(expect.not.stringContaining('<script>'));
    });

    it('should throw on error', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await expect(getActivityLogs()).rejects.toEqual({ message: 'fail' });
    });

    it('should calculate totalPages correctly', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 50 });

      const result = await getActivityLogs({}, 1, 25);
      expect(result.totalPages).toBe(2);
    });

    it('should handle custom pagination', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 100 });

      const result = await getActivityLogs({}, 3, 10);
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(10);
    });

    it('should not call or() when search query sanitizes to empty string', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ searchQuery: '!!!###$$$' });
      expect(qb.or).not.toHaveBeenCalled();
    });

    it('should apply actionType filter', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ actionType: 'user_created' });
      expect(qb.eq).toHaveBeenCalledWith('action_type', 'user_created');
    });

    it('should apply entityType filter', async () => {
      const qb = mockSupabase.from();
      qb.range.mockResolvedValueOnce({ data: [], error: null, count: 0 });

      await getActivityLogs({ entityType: 'organization' });
      expect(qb.eq).toHaveBeenCalledWith('entity_type', 'organization');
    });
  });

  // =========================================================================
  // getActivityUsers
  // =========================================================================
  describe('getActivityUsers', () => {
    // Current implementation: queries activity_log for user_id, user_name, user_email
    // with .not('user_id', 'is', null).order('user_name'), then deduplicates in JS.

    it('should query activity_log and deduplicate unique users', async () => {
      const qb = mockSupabase.from();
      // Chain: select -> not -> order (terminal)
      qb.order.mockResolvedValueOnce({
        data: [
          { user_id: 'u1', user_name: 'Alice', user_email: 'a@t.com' },
          { user_id: 'u1', user_name: 'Alice', user_email: 'a@t.com' }, // duplicate
          { user_id: 'u2', user_name: 'Bob', user_email: 'b@t.com' },
        ],
        error: null,
      });

      const users = await getActivityUsers();
      expect(mockSupabase.from).toHaveBeenCalledWith('activity_log');
      expect(users).toHaveLength(2);
      expect(users[0].name).toBe('Alice');
      expect(users[1].name).toBe('Bob');
    });

    it('should use "Unknown" for null user_name', async () => {
      const qb = mockSupabase.from();
      qb.order.mockResolvedValueOnce({
        data: [{ user_id: 'u1', user_name: null, user_email: null }],
        error: null,
      });

      const users = await getActivityUsers();
      expect(users[0].name).toBe('Unknown');
      expect(users[0].email).toBe('');
    });

    it('should throw on query error', async () => {
      const qb = mockSupabase.from();
      qb.order.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await expect(getActivityUsers()).rejects.toEqual({ message: 'fail' });
    });

    it('should filter null user_ids via DB query', async () => {
      const qb = mockSupabase.from();
      qb.order.mockResolvedValueOnce({
        data: [
          { user_id: 'u1', user_name: 'Alice', user_email: 'a@t.com' },
          { user_id: 'u2', user_name: 'Bob', user_email: 'b@t.com' },
        ],
        error: null,
      });

      const users = await getActivityUsers();
      expect(qb.not).toHaveBeenCalledWith('user_id', 'is', null);
      expect(users).toHaveLength(2);
    });

    it('should return empty array when no users found', async () => {
      const qb = mockSupabase.from();
      qb.order.mockResolvedValueOnce({ data: [], error: null });

      const users = await getActivityUsers();
      expect(users).toHaveLength(0);
    });
  });

  // =========================================================================
  // getActivityStats
  // =========================================================================
  describe('getActivityStats', () => {
    it('should count categories', async () => {
      const qb = mockSupabase.from();
      // When no since date, select is the terminal call
      qb.select.mockResolvedValueOnce({
        data: [
          { action_category: 'auth' },
          { action_category: 'auth' },
          { action_category: 'admin' },
        ],
        error: null,
      });

      const stats = await getActivityStats();
      expect(stats.auth).toBe(2);
      expect(stats.admin).toBe(1);
      expect(stats.profile).toBe(0);
    });

    it('should apply since filter', async () => {
      const qb = mockSupabase.from();
      qb.gte.mockResolvedValueOnce({ data: [], error: null });

      const since = new Date('2024-01-01');
      await getActivityStats(since);
      expect(qb.gte).toHaveBeenCalledWith('created_at', since.toISOString());
    });

    it('should throw on error', async () => {
      const qb = mockSupabase.from();
      qb.select.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

      await expect(getActivityStats()).rejects.toEqual({ message: 'fail' });
    });

    it('should not count unknown action categories', async () => {
      const qb = mockSupabase.from();
      qb.select.mockResolvedValueOnce({
        data: [
          { action_category: 'auth' },
          { action_category: 'unknown_cat' },
          { action_category: 'unknown_cat' },
        ],
        error: null,
      });

      const stats = await getActivityStats();
      expect(stats.auth).toBe(1);
      expect(stats.profile).toBe(0);
      expect(stats.competency).toBe(0);
      expect(stats.admin).toBe(0);
      expect(stats.asset).toBe(0);
      expect(stats.config).toBe(0);
      expect(stats.document).toBe(0);
    });
  });
});
