/**
 * Tests for the login page's handling of a forced-expiry redirect.
 *
 * A session the server ends mid-work redirects to /login?reason=session-expired
 * (with a sessionStorage marker as fallback). The page must explain that, and
 * must stay silent for a deliberate sign-out — the difference between the two is
 * the whole point of the reason parameter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../auth-manager.js', () => ({
  default: {
    login: vi.fn(),
    isLoggedIn: () => false,
    complete2FALogin: vi.fn(),
  },
}));

vi.mock('../supabase-client', () => ({
  default: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, twoFactorRequired: false }),
}));

vi.mock('../services/two-factor-service', () => ({
  twoFactorService: { verifyLogin: vi.fn() },
}));

vi.mock('../components/two-factor/TwoFactorChallenge', () => ({
  TwoFactorChallenge: () => <div data-testid="two-factor-challenge" />,
}));

import LoginPageNew from './LoginPageNew';
import { markSessionEndedByExpiry } from '../lib/session-timebox';
import { useMemoryStorage } from '../test/helpers/memory-storage';

const EXPIRED_TEXT = /Your session has expired/i;

function renderLogin(search = '') {
  window.history.replaceState({}, '', `/login${search}`);
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <LoginPageNew />
    </MemoryRouter>
  );
}

describe('LoginPageNew — session expiry notice', () => {
  useMemoryStorage();

  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
  });

  it('explains the redirect when the session expired', () => {
    renderLogin('?reason=session-expired');

    expect(screen.getByText(EXPIRED_TEXT)).toBeInTheDocument();
    expect(screen.getByText(EXPIRED_TEXT).textContent).toBe(
      'Your session has expired — please sign in again.'
    );
  });

  it('says nothing after a deliberate sign-out', () => {
    renderLogin();

    expect(screen.queryByText(EXPIRED_TEXT)).toBeNull();
  });

  it('ignores an unrelated reason parameter', () => {
    renderLogin('?reason=something-else');

    expect(screen.queryByText(EXPIRED_TEXT)).toBeNull();
  });

  it('still explains when only the storage marker survived the redirect', () => {
    // The hard navigation can be cancelled (a dirty scan viewer's beforeunload
    // prompt), leaving ProtectedRoute to land the user on a bare /login.
    markSessionEndedByExpiry();

    renderLogin();

    expect(screen.getByText(EXPIRED_TEXT)).toBeInTheDocument();
  });

  it('renders the notice as a status, not an error', () => {
    renderLogin('?reason=session-expired');

    const notice = screen.getByText(EXPIRED_TEXT);
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice.className).toContain('lg-alert');
  });
});
