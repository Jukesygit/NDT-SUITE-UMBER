import { vi } from 'vitest';

export function createMockSupabase() {
  // Build a chainable query builder where each method returns `this`
  // and the terminal methods (single, maybeSingle) resolve with { data, error }

  const createQueryBuilder = (defaults = {}) => {
    const builder = {
      _data: defaults.data ?? null,
      _error: defaults.error ?? null,
      _count: defaults.count ?? null,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(function () {
        return Promise.resolve({ data: builder._data, error: builder._error });
      }),
      maybeSingle: vi.fn().mockImplementation(function () {
        return Promise.resolve({ data: builder._data, error: builder._error });
      }),
      then: function (resolve) {
        return resolve({ data: builder._data, error: builder._error, count: builder._count });
      },
    };
    // Make every chainable method return builder
    [
      'select',
      'eq',
      'neq',
      'in',
      'not',
      'or',
      'gte',
      'lte',
      'like',
      'ilike',
      'order',
      'limit',
      'range',
      'insert',
      'update',
      'delete',
    ].forEach((m) => {
      builder[m].mockReturnValue(builder);
    });
    return builder;
  };

  const mockSupabase = {
    from: vi.fn().mockImplementation(() => createQueryBuilder()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    _createQueryBuilder: createQueryBuilder,
  };

  return mockSupabase;
}

export const mockSupabase = createMockSupabase();

export default mockSupabase;
