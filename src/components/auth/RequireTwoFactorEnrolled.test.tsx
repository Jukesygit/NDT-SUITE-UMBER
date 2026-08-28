/**
 * Tests for RequireTwoFactorEnrolled — the mandatory 2FA enrollment gate.
 *
 * Covers the state map: unenrolled -> enrollment screen, enrolled -> app,
 * mid-challenge (twoFactorRequired) -> pass through to the existing login
 * challenge flow, and the sign-out escape hatch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequireTwoFactorEnrolled } from './RequireTwoFactorEnrolled';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock the two-factor service — the gate reads factors through it via React Query
const mockListFactors = vi.fn();
vi.mock('../../services/two-factor-service', () => ({
  twoFactorService: {
    listFactors: (...args: unknown[]) => mockListFactors(...args),
  },
}));

// Mock the setup wizard: the real one is a portal Modal that immediately calls
// enroll(). The close button stands in for the real modal's dismiss affordance.
vi.mock('../two-factor/TwoFactorSetupWizard', () => ({
  TwoFactorSetupWizard: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="setup-wizard">
        Setup Wizard
        <button type="button" onClick={onClose}>
          Close wizard
        </button>
      </div>
    ) : null,
}));

// Mock the spinner to avoid pulling animated Matrix spinner assets
vi.mock('../ui/LoadingSpinner', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>
      Loading...
    </div>
  ),
}));

const mockLogout = vi.fn();

function defaultAuthValues(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'user-1', role: 'editor' },
    profile: null,
    isLoading: false,
    isAuthenticated: true,
    twoFactorEnabled: false,
    twoFactorVerified: false,
    twoFactorRequired: false,
    hasRole: vi.fn(() => false),
    hasPermission: vi.fn(() => false),
    logout: mockLogout,
    refreshAuth: vi.fn(),
    ...overrides,
  };
}

function renderGate() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<RequireTwoFactorEnrolled />}>
            <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const verifiedFactor = { id: 'factor-1', status: 'verified' as const, friendlyName: null };
const unverifiedFactor = { id: 'factor-2', status: 'unverified' as const, friendlyName: null };

describe('RequireTwoFactorEnrolled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(defaultAuthValues());
  });

  it('shows a spinner while auth state is still loading', () => {
    mockUseAuth.mockReturnValue(defaultAuthValues({ isLoading: true, isAuthenticated: false }));
    mockListFactors.mockResolvedValue([]);

    renderGate();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('shows a spinner while factor state is loading — no flash of app content', () => {
    mockListFactors.mockReturnValue(new Promise(() => {})); // never resolves

    renderGate();

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
  });

  it('shows the enrollment screen when the user has no verified factor', async () => {
    mockListFactors.mockResolvedValue([]);

    renderGate();

    expect(
      await screen.findByText(/Two-factor authentication is now required for all accounts/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('paints the gate shell first, with both actions available', async () => {
    // The wizard is a portal Modal: opening it on first paint lays its overlay
    // over the shell and makes the Sign out escape hatch unclickable.
    mockListFactors.mockResolvedValue([]);

    renderGate();

    const setUpButton = await screen.findByRole('button', { name: /set up two-factor/i });
    expect(setUpButton).toBeEnabled();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled();
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
  });

  it('opens the wizard on demand and returns to the shell when it is closed', async () => {
    const user = userEvent.setup();
    mockListFactors.mockResolvedValue([]);

    renderGate();

    await user.click(await screen.findByRole('button', { name: /set up two-factor/i }));
    expect(await screen.findByTestId('setup-wizard')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close wizard/i }));

    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled();
    // Still gated — the gate blocks the app, not the modal.
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('treats an abandoned (unverified) enrollment as not enrolled', async () => {
    mockListFactors.mockResolvedValue([unverifiedFactor]);

    renderGate();

    expect(
      await screen.findByText(/Two-factor authentication is now required for all accounts/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('renders children when the user has a verified factor', async () => {
    mockListFactors.mockResolvedValue([verifiedFactor]);

    renderGate();

    expect(await screen.findByText('Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
  });

  it('signs the user out when the escape-hatch button is clicked', async () => {
    const user = userEvent.setup();
    mockListFactors.mockResolvedValue([]);

    renderGate();

    const signOutButton = await screen.findByRole('button', { name: /sign out/i });
    await user.click(signOutButton);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('passes through without enrollment UI when a challenge is pending (twoFactorRequired)', async () => {
    mockUseAuth.mockReturnValue(
      defaultAuthValues({
        isAuthenticated: false,
        twoFactorEnabled: true,
        twoFactorRequired: true,
      })
    );
    mockListFactors.mockResolvedValue([verifiedFactor]);

    renderGate();

    expect(await screen.findByText('Dashboard Content')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-wizard')).not.toBeInTheDocument();
    // The challenge path owns this state — the gate must not fetch or block.
    expect(mockListFactors).not.toHaveBeenCalled();
  });

  it('fails closed with a retry option when factor state cannot be read', async () => {
    mockListFactors.mockRejectedValue(new Error('network down'));

    renderGate();

    await waitFor(() => {
      expect(screen.getByText(/Unable to verify two-factor status/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
