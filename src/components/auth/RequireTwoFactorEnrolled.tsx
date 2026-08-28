/**
 * RequireTwoFactorEnrolled — mandatory 2FA enrollment gate.
 *
 * Owner decision 2026-08-26: immediate hard gate for ALL roles, no grace
 * period. A signed-in user with no *verified* TOTP factor is routed into
 * enrollment and cannot reach any app content until enrolled.
 *
 * State map (deliberately non-overlapping with the login challenge flow):
 *   a. no verified factor            -> this enrollment gate
 *   b. verified factor + aal1        -> `twoFactorRequired`; the login page's
 *                                       challenge flow owns it, we pass through
 *   c. verified factor + aal2        -> children render
 *
 * Mounted inside ProtectedRoute, so `isAuthenticated` is already true here and
 * case (b) has normally been redirected to /login by ProtectedRoute. The
 * explicit `twoFactorRequired` pass-through exists so a user can never be
 * bounced between the challenge screen and this enrollment screen.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { Spinner } from '../ui/LoadingSpinner';
import { TwoFactorSetupWizard } from '../two-factor/TwoFactorSetupWizard';
import {
  useMfaFactors,
  hasVerifiedTotpFactor,
  mfaFactorKeys,
} from '../../hooks/queries/useMfaFactors';

interface RequireTwoFactorEnrolledProps {
  /** Optional children; omit to use as a layout route with <Outlet />. */
  children?: ReactNode;
}

function GateShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ padding: 'var(--spacing-lg)' }}
    >
      <div
        className="glass-card"
        style={{ padding: 'var(--spacing-xl)', maxWidth: '560px', width: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}

function GateSpinner({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>
      </div>
    </div>
  );
}

export function RequireTwoFactorEnrolled({ children }: RequireTwoFactorEnrolledProps) {
  const { user, isAuthenticated, isLoading, twoFactorRequired, logout } = useAuth();
  const queryClient = useQueryClient();
  // Closed on first paint. The wizard is a portal Modal whose overlay covers
  // the gate shell, so auto-opening it puts the overlay on top of the Sign out
  // button and a real click lands on wizard content instead — the escape hatch
  // has to be reachable before enrollment starts, not just after closing.
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // The gate only has an opinion for a fully signed-in session that is not
  // mid-challenge. Everything else is somebody else's guard.
  const gateApplies = isAuthenticated && !twoFactorRequired && !!user?.id;

  const factors = useMfaFactors(user?.id, { enabled: gateApplies });

  const handleEnrollmentComplete = useCallback(() => {
    setIsWizardOpen(false);
    // Opens the gate: the refetch now sees a verified factor.
    queryClient.invalidateQueries({ queryKey: mfaFactorKeys.all });
  }, [queryClient]);

  const handleSignOut = useCallback(() => {
    void logout();
  }, [logout]);

  const renderPassThrough = () => (children ? <>{children}</> : <Outlet />);

  if (isLoading) {
    return <GateSpinner message="Verifying session..." />;
  }

  if (!gateApplies) {
    return renderPassThrough();
  }

  if (factors.isPending) {
    return <GateSpinner message="Checking two-factor authentication..." />;
  }

  // Fail closed: if factor state cannot be read we must not assume enrollment,
  // but we also must not force a possibly-enrolled user through setup again.
  if (factors.isError) {
    return (
      <GateShell>
        <h1 style={{ marginBottom: 'var(--spacing-sm)' }}>Unable to verify two-factor status</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-lg)' }}>
          We could not confirm whether your account has two-factor authentication set up. Check your
          connection and try again.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" onClick={() => void factors.refetch()}>
            Try again
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </GateShell>
    );
  }

  if (hasVerifiedTotpFactor(factors.data)) {
    return renderPassThrough();
  }

  // (a) Enrolled? No. Nothing behind this screen is reachable.
  //
  // The shell paints first with both actions clickable; the wizard opens on
  // demand and is intentionally NOT `mandatory` (a mandatory modal traps focus
  // with no close affordance). Closing it returns here — the gate itself, not
  // the modal, is what blocks the app.
  return (
    <>
      <GateShell>
        <h1 style={{ marginBottom: 'var(--spacing-sm)' }}>Two-factor authentication required</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
          Two-factor authentication is now required for all accounts. Set it up with an
          authenticator app to continue to NDT Suite.
        </p>
        <p
          className="text-sm"
          style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--spacing-lg)' }}
        >
          You will need an authenticator app such as Google Authenticator, Microsoft Authenticator,
          or 1Password.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setIsWizardOpen(true)}
            disabled={isWizardOpen}
          >
            Set up two-factor authentication
          </button>
          <button type="button" className="btn btn--ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </GateShell>

      <TwoFactorSetupWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleEnrollmentComplete}
      />
    </>
  );
}

export default RequireTwoFactorEnrolled;
