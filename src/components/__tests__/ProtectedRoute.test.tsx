/**
 * Tests for ProtectedRoute component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock LoadingStates to avoid importing real Spinner styles/assets
vi.mock('../LoadingStates', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>Loading...</div>
  ),
}));

function defaultAuthValues(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    profile: null,
    isLoading: false,
    isAuthenticated: false,
    isSuperAdmin: false,
    isAdmin: false,
    isManager: false,
    isOrgAdmin: false,
    isEditor: false,
    hasElevatedAccess: false,
    twoFactorEnabled: false,
    twoFactorVerified: false,
    twoFactorRequired: false,
    hasRole: vi.fn(() => false),
    hasPermission: vi.fn(() => false),
    logout: vi.fn(),
    refreshAuth: vi.fn(),
    ...overrides,
  };
}

function renderWithRouter(
  initialEntry: string,
  protectedRouteProps: Record<string, unknown> = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute {...protectedRouteProps}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({ isAuthenticated: false }),
    );

    renderWithRouter('/protected');

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when authenticated', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@test.com', role: 'viewer' },
      }),
    );

    renderWithRouter('/protected');

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('should show loading state while auth is loading', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({ isLoading: true }),
    );

    renderWithRouter('/protected');

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Verifying session...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('should redirect to / when requireAdmin is set and user is not admin', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@test.com', role: 'viewer' },
        isAdmin: false,
      }),
    );

    renderWithRouter('/protected', { requireAdmin: true });

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when requireAdmin is set and user is admin', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'admin@test.com', role: 'admin' },
        isAdmin: true,
      }),
    );

    renderWithRouter('/protected', { requireAdmin: true });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect to / when requireElevatedAccess is set and user lacks elevated access', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'viewer@test.com', role: 'viewer' },
        hasElevatedAccess: false,
      }),
    );

    renderWithRouter('/protected', { requireElevatedAccess: true });

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when requireElevatedAccess is set and user has elevated access', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'manager@test.com', role: 'manager' },
        hasElevatedAccess: true,
      }),
    );

    renderWithRouter('/protected', { requireElevatedAccess: true });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should render Outlet when no children are provided', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', email: 'test@test.com', role: 'viewer' },
      }),
    );

    render(
      <MemoryRouter initialEntries={['/protected/child']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected/child" element={<div>Outlet Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Outlet Content')).toBeInTheDocument();
  });
});
