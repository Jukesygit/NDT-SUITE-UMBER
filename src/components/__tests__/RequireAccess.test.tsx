/**
 * Tests for RequireAccess component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RequireAccess from '../RequireAccess';

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
  requireAccessProps: Record<string, unknown>,
) {
  return render(
    <MemoryRouter initialEntries={['/page']}>
      <Routes>
        <Route
          path="/page"
          element={
            <RequireAccess {...requireAccessProps}>
              <div>Protected Content</div>
            </RequireAccess>
          }
        />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Role-based rendering ---

  it('should render children when user has the required admin role', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        isAdmin: true,
        user: { id: 'u1', role: 'admin' },
      }),
    );

    renderWithRouter({ requireAdmin: true });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect to / when user lacks the required admin role', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        isAdmin: false,
        user: { id: 'u1', role: 'viewer' },
      }),
    );

    renderWithRouter({ requireAdmin: true });

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should render children when user has elevated access and requireElevatedAccess is set', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        hasElevatedAccess: true,
        user: { id: 'u1', role: 'manager' },
      }),
    );

    renderWithRouter({ requireElevatedAccess: true });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect when user lacks elevated access and requireElevatedAccess is set', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        hasElevatedAccess: false,
        user: { id: 'u1', role: 'viewer' },
      }),
    );

    renderWithRouter({ requireElevatedAccess: true });

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // --- Super admin ---

  it('should render children when user is super admin and requireSuperAdmin is set', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        isSuperAdmin: true,
        isAdmin: true,
        user: { id: 'u1', role: 'super_admin' },
      }),
    );

    renderWithRouter({ requireSuperAdmin: true });

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect when regular admin tries to access requireSuperAdmin route', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        isSuperAdmin: false,
        isAdmin: true,
        user: { id: 'u1', role: 'admin' },
      }),
    );

    renderWithRouter({ requireSuperAdmin: true });

    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  // --- Loading state ---

  it('should show loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({ isLoading: true }),
    );

    renderWithRouter({ requireAdmin: true });

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText('Checking permissions...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument();
  });

  // --- No requirements ---

  it('should render children when no access requirements are specified', () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        user: { id: 'u1', role: 'viewer' },
      }),
    );

    renderWithRouter({});

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  // --- Multiple requirements combined ---

  it('should check requireSuperAdmin before requireAdmin', () => {
    // User is admin but not super_admin, with both flags set
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: true,
        isSuperAdmin: false,
        isAdmin: true,
        hasElevatedAccess: true,
        user: { id: 'u1', role: 'admin' },
      }),
    );

    renderWithRouter({ requireSuperAdmin: true, requireAdmin: true });

    // Should redirect because requireSuperAdmin fails first
    expect(screen.getByText('Home Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
