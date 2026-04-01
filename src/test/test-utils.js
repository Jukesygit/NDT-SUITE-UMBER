/**
 * Shared test utilities for Matrix Portal test suite.
 * Provides mock factories for Supabase client, auth manager, and React Query wrapper.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Supabase chain-mock builder
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock that mimics the Supabase query builder API.
 * Every method returns `this` so calls like `.from().select().eq().order()`
 * can be chained.  Calling the terminal method resolves the configured data.
 *
 * Usage:
 *   const { supabase, mockChain } = createMockSupabase();
 *   mockChain.resolveWith({ data: [...], error: null });
 *   // now supabase.from('x').select('*').eq('id', 1) resolves that data
 */
export function createMockSupabaseChain(resolvedValue = { data: [], error: null }) {
  const chain = {
    _resolved: resolvedValue,
    resolveWith(value) {
      chain._resolved = value;
      return chain;
    },
    // query builder methods
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(function () { return Promise.resolve(chain._resolved); }),
    maybeSingle: vi.fn(function () { return Promise.resolve(chain._resolved); }),
    // rpc
    rpc: vi.fn(function () { return Promise.resolve(chain._resolved); }),
    // storage
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve(chain._resolved)),
        remove: vi.fn(() => Promise.resolve(chain._resolved)),
        createSignedUrl: vi.fn(() => Promise.resolve(chain._resolved)),
      })),
    },
  };

  // The terminal awaitable: when the chain is awaited directly (no .single())
  // we make the chain itself thenable.
  chain.then = function (resolve, reject) {
    return Promise.resolve(chain._resolved).then(resolve, reject);
  };

  return chain;
}

/**
 * High-level helper: returns a mock supabase default export plus the chain.
 */
export function createMockSupabase(resolvedValue) {
  const chain = createMockSupabaseChain(resolvedValue);
  // supabase default export is the client itself, which starts with .from()
  return { supabase: chain, mockChain: chain };
}

// ---------------------------------------------------------------------------
// Auth manager mock
// ---------------------------------------------------------------------------

export function createMockAuthManager(overrides = {}) {
  return {
    getCurrentUser: vi.fn().mockReturnValue({
      id: 'user-1',
      role: 'admin',
      organizationId: 'org-1',
      username: 'testadmin',
      email: 'admin@test.com',
      ...overrides,
    }),
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
  };
}

// ---------------------------------------------------------------------------
// React Query test wrapper
// ---------------------------------------------------------------------------

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function createWrapper() {
  const queryClient = createTestQueryClient();
  return function Wrapper({ children }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

export function renderWithProviders(ui, options = {}) {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
