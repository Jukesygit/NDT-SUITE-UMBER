import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import authManager from '../auth-manager.js';
import supabase from '../supabase-client';
import { MATRIX_LOGO } from '../components/MatrixLogoAnimated';
import { RandomMatrixSpinner } from '../components/MatrixSpinners';
import { useAuth } from '../contexts/AuthContext';
import { twoFactorService } from '../services/two-factor-service';
import { TwoFactorChallenge } from '../components/two-factor/TwoFactorChallenge';
import { validatePasswordStrength } from '../config/security';
import { hasSessionExpiredReason, SESSION_EXPIRED_NOTICE } from '../lib/session-timebox';
import './login.css';

// Single-color brand mark; inherits its color from the surrounding text color
function BrandMark({ width = 56 }: { width?: number }) {
  const height = width * (1202 / 2256);
  return (
    <svg
      viewBox={MATRIX_LOGO.viewBox}
      width={width}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={MATRIX_LOGO.mainPath} />
      <path d={MATRIX_LOGO.circle1} />
      <path d={MATRIX_LOGO.circle2} />
    </svg>
  );
}

// Storage key for tracking password reset mode
const PASSWORD_RESET_KEY = 'ndt_password_reset_pending';

type LoginMode =
  | 'login'
  | 'register'
  | 'reset'
  | 'verify-code'
  | 'update-password'
  | 'processing'
  | 'verify-2fa';

/**
 * Why the user is looking at a login form.
 *
 * A session the server ended mid-work redirects here carrying
 * `?reason=session-expired` (plus a sessionStorage fallback for the case where
 * the hard navigation was cancelled) — see redirectToExpiredLogin. A deliberate
 * sign-out carries nothing and gets no message: telling someone their session
 * expired when they clicked Logout is a small lie the app should not tell.
 * The marker is retired by markSessionStart on the next successful sign-in.
 */
const getInitialSessionNotice = (): string => {
  if (typeof window === 'undefined') return '';
  return hasSessionExpiredReason(window.location.search) ? SESSION_EXPIRED_NOTICE : '';
};

// Check for recovery mode before component mounts (synchronous check)
const getInitialMode = (): LoginMode => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    // Check for explicit type=recovery parameter (our redirect URL includes this)
    if (params.get('type') === 'recovery') {
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Check hash-based recovery (older Supabase flow)
    if (hash && hash.includes('type=recovery')) {
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Check for code parameter WITH type=recovery (PKCE flow - both may be present)
    // Note: We no longer assume any code param is password reset - it could be email confirmation
    if (params.get('code') && params.get('type') === 'recovery') {
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Don't trust sessionStorage alone on fresh page loads - it may be stale
    // The sessionStorage flag is only used to prevent redirects during the password update flow,
    // not to determine the initial mode. Clear any stale flag.
    if (sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true') {
      sessionStorage.removeItem(PASSWORD_RESET_KEY);
    }
  }
  return 'login';
};

function LoginPageNew() {
  const navigate = useNavigate();
  const { isAuthenticated, twoFactorRequired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetEmail, setResetEmail] = useState(''); // Store email for code verification
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sessionNotice, setSessionNotice] = useState(getInitialSessionNotice);
  const [mode, setMode] = useState<LoginMode>(getInitialMode); // 'login', 'register', 'reset', 'verify-code', 'update-password'
  const isRedirectingRef = useRef(false); // Track if we're in the process of redirecting
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');

  /**
   * Finish a login that was held at the 2FA challenge.
   *
   * `complete2FALogin` dispatches `userLoggedIn`, which makes AuthContext
   * re-read the 2FA status — that is the auth-state refresh both paths need.
   * After a backup-code redemption the server has deleted the user's factors,
   * so the re-read reports 2FA disabled, `twoFactorRequired` resolves false,
   * the login completes, and RequireTwoFactorEnrolled then forces enrollment of
   * a new authenticator.
   */
  const completeTwoFactorLogin = () => {
    authManager.complete2FALogin();
    isRedirectingRef.current = true;
    navigate('/');
    setTimeout(() => {
      if (window.location.pathname === '/login') {
        window.location.href = '/';
      }
    }, 1000);
  };

  const handle2FAVerify = async (code: string) => {
    setTwoFALoading(true);
    setTwoFAError('');
    try {
      await twoFactorService.verifyLogin(code);
      completeTwoFactorLogin();
    } catch (err: unknown) {
      setTwoFAError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setTwoFALoading(false);
    }
  };

  // Auto-switch to 2FA verify when context detects pending 2FA (e.g. page refresh with AAL1 session)
  useEffect(() => {
    if (twoFactorRequired && mode === 'login') {
      setMode('verify-2fa');
    }
  }, [twoFactorRequired, mode]);

  useEffect(() => {
    // Check if we're in password reset mode (from sessionStorage)
    const isPasswordResetMode = sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true';

    // Note: We don't force mode to 'update-password' here anymore.
    // getInitialMode() handles the initial mode, and we allow explicit mode changes
    // (like clicking "Back to sign in") to take precedence.

    // Listen for password recovery event from auth-manager
    const handlePasswordRecovery = () => {
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      setMode('update-password');
      // Clean up URL but keep type=recovery for page reloads
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      window.history.replaceState(null, '', url.toString());
    };
    window.addEventListener('passwordRecoveryMode', handlePasswordRecovery);

    // Listen only for USER_UPDATED during password reset flow.
    // All other auth events (SIGNED_IN, PASSWORD_RECOVERY, etc.) are handled by
    // auth-manager's single Supabase listener + custom events above.
    // Avoiding duplicate onAuthStateChange listeners prevents race conditions.
    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((event, _session) => {
      const currentPasswordResetMode = sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true';

      if (event === 'USER_UPDATED' && currentPasswordResetMode) {
        // Password was updated successfully - this fires faster than the promise resolves
        window.history.replaceState(null, '', window.location.pathname);
        setSuccessMessage(
          'Password updated successfully! You can now sign in with your new password.'
        );
        setNewPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        setMode('login');
        // Sign out and THEN clear the password reset flag (prevents redirect while still logged in)
        supabase!.auth
          .signOut()
          .then(() => {
            sessionStorage.removeItem(PASSWORD_RESET_KEY);
          })
          .catch(() => {
            setTimeout(() => sessionStorage.removeItem(PASSWORD_RESET_KEY), 2000);
          });
      }
    });

    // Only redirect if logged in and NOT in password reset or 2FA verify mode
    if (
      isAuthenticated &&
      !isPasswordResetMode &&
      mode !== 'update-password' &&
      mode !== 'verify-2fa'
    ) {
      navigate('/');
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('passwordRecoveryMode', handlePasswordRecovery);
    };
  }, [navigate, mode, isAuthenticated]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setSessionNotice(''); // the explanation has been read; don't stack it under an error
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const result = await authManager.login(email, password);
        if (result.error) {
          // Handle both string errors and object errors
          const errorMsg =
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || 'Login failed';
          setError(errorMsg);
          setIsLoading(false);
          return;
        }
        // Check if 2FA verification is required
        if (result.requires2FA) {
          setMode('verify-2fa');
          setError('');
          setIsLoading(false);
          return;
        }
        // Login succeeded - navigate to home
        // Mark that we're redirecting to prevent finally block from clearing isLoading
        isRedirectingRef.current = true;
        // Use React Router navigation first (faster, no page reload)
        navigate('/');
        // Also schedule a hard redirect as fallback in case React Router navigation fails
        // This ensures the user gets to the home page even if there's a timing issue
        setTimeout(() => {
          // Only redirect if we're still on the login page
          if (window.location.pathname === '/login') {
            window.location.href = '/';
          }
        }, 1000);
        // Keep isLoading true while redirect is pending
        return;
      } else if (mode === 'register') {
        const result = await authManager.signUp(email, password);
        if (result.error) {
          const errorMsg =
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || 'Registration failed';
          setError(errorMsg);
        } else {
          setError('');
          setMode('login');
          alert(
            'Registration successful! Please check your email to verify your account, then log in.'
          );
        }
      } else if (mode === 'reset') {
        const result = await authManager.resetPassword(email);
        if (result.error) {
          const errorMsg =
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || 'Password reset failed';

          // Check for rate limit error
          if (
            errorMsg.includes('rate limit') ||
            errorMsg.includes('429') ||
            errorMsg.includes('wait')
          ) {
            setError(errorMsg);
          } else {
            setError(errorMsg);
          }
        } else {
          setError('');
          // Store email for the verify step and switch to code entry mode
          setResetEmail(email);
          setSuccessMessage('A 6-digit code has been sent to your email. Please check your inbox.');
          setMode('verify-code');
        }
      } else if (mode === 'verify-code') {
        // Verify the reset code and set new password
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }

        // Mirror ALL server-side checks (length, case, number, special, common-password
        // and email-local-part) via the shared validator. The user-info/common-password
        // checks live only in feedback (not in `isValid`), so gate on feedback presence.
        const passwordResult = validatePasswordStrength(newPassword, { email: resetEmail });
        if (passwordResult.feedback.length > 0) {
          setError(passwordResult.feedback[0] || 'Password does not meet requirements');
          setIsLoading(false);
          return;
        }

        if (!resetCode || resetCode.length !== 6) {
          setError('Please enter the 6-digit code from your email');
          setIsLoading(false);
          return;
        }

        const result = await authManager.verifyResetCode(resetEmail, resetCode, newPassword);
        if (result.error) {
          setError(
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || 'Failed to verify code'
          );
        } else {
          setError('');
          setSuccessMessage(
            result.message || 'Password updated successfully! You can now sign in.'
          );
          setResetCode('');
          setNewPassword('');
          setConfirmPassword('');
          setResetEmail('');
          setMode('login');
        }
      } else if (mode === 'update-password') {
        // Handle password update after clicking reset link
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match');
          setIsLoading(false);
          return;
        }

        // Mirror ALL server-side checks (length, case, number, special, common-password
        // and email-local-part) via the shared validator. The user-info/common-password
        // checks live only in feedback (not in `isValid`), so gate on feedback presence.
        const passwordResult = validatePasswordStrength(newPassword, {
          email: email || resetEmail,
        });
        if (passwordResult.feedback.length > 0) {
          setError(passwordResult.feedback[0] || 'Password does not meet requirements');
          setIsLoading(false);
          return;
        }

        // Check if we have a session (the code should have been exchanged for a session)
        let {
          data: { session },
        } = await supabase!.auth.getSession();
        if (!session) {
          // Try to exchange the code if it's still in the URL
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          if (code) {
            const { data: exchangeData, error: exchangeError } =
              await supabase!.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              setError('Your password reset link has expired. Please request a new one.');
              setIsLoading(false);
              return;
            }
            session = exchangeData?.session;
          } else {
            setError(
              'Your password reset session has expired. Please request a new password reset link.'
            );
            setIsLoading(false);
            return;
          }
        }

        // Use Edge Function to update password AND confirm email
        // This is necessary because clicking the reset link proves email ownership
        try {
          const { data, error: updateError } = await supabase!.functions.invoke(
            'update-password-confirm-email',
            {
              body: {
                newPassword,
                accessToken: session?.access_token,
              },
            }
          );

          if (updateError) {
            setError('Error updating password: ' + updateError.message);
          } else if (data?.error) {
            setError('Error updating password: ' + data.error);
          } else {
            // Success - show message and redirect to login
            setSuccessMessage(
              data?.message || 'Password updated successfully. You can now sign in.'
            );
            setNewPassword('');
            setConfirmPassword('');
            // Sign out the recovery session and redirect to login
            await supabase!.auth.signOut();
            setMode('login');
          }
        } catch (updateErr) {
          setError('Error updating password: ' + ((updateErr as Error).message || 'Unknown error'));
        }
      }
    } catch (err) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      // Don't clear isLoading if we're in the process of redirecting
      // This keeps the "Processing..." spinner visible until the page reloads
      if (!isRedirectingRef.current) {
        setIsLoading(false);
      }
    }
  };

  const heading =
    mode === 'login'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create an account'
        : mode === 'reset'
          ? 'Reset your password'
          : mode === 'verify-code'
            ? 'Check your email'
            : mode === 'update-password'
              ? 'Set a new password'
              : mode === 'verify-2fa'
                ? 'Two-factor authentication'
                : '';

  const subheading =
    mode === 'register'
      ? "We'll send you a verification email."
      : mode === 'reset'
        ? "We'll email you a 6-digit code to reset it."
        : mode === 'verify-code'
          ? `Enter the code we sent to ${resetEmail || 'your email'} and choose a new password.`
          : mode === 'update-password'
            ? 'Choose a new password for your account.'
            : mode === 'verify-2fa'
              ? 'Enter the 6-digit code from your authenticator app.'
              : '';

  return (
    <div className="lg-page">
      <div className="lg-shell">
        <header className="lg-brand">
          <BrandMark width={56} />
          <h1 className="lg-brand-name">Matrix Portal</h1>
        </header>

        <div className="lg-card">
          {mode !== 'processing' && (
            <div className="lg-card-head">
              <h2 className="lg-heading">{heading}</h2>
              {subheading && <p className="lg-sub">{subheading}</p>}
            </div>
          )}

          {sessionNotice && (
            <div className="lg-alert warning" role="status">
              {sessionNotice}
            </div>
          )}

          {error && (
            <div className="lg-alert error" role="alert">
              {error}
            </div>
          )}

          {successMessage && <div className="lg-alert success">{successMessage}</div>}

          {mode === 'processing' && (
            <div className="lg-processing">
              <RandomMatrixSpinner size={48} />
              <p>Verifying your reset link...</p>
            </div>
          )}

          {mode === 'verify-2fa' && (
            <TwoFactorChallenge
              onSubmitCode={handle2FAVerify}
              isVerifying={twoFALoading}
              verifyError={twoFAError}
              onBackupCodeAccepted={completeTwoFactorLogin}
              onBackToSignIn={() => {
                setMode('login');
                setTwoFAError('');
              }}
            />
          )}

          <form
            onSubmit={handleSubmit}
            className="lg-form"
            style={{ display: mode === 'processing' || mode === 'verify-2fa' ? 'none' : undefined }}
          >
            {/* Email field - shown for login, register, reset modes */}
            {mode !== 'update-password' && mode !== 'verify-code' && (
              <div className="lg-field">
                <label htmlFor="email" className="lg-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="lg-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Password field - shown for login and register modes */}
            {(mode === 'login' || mode === 'register') && (
              <div className="lg-field">
                <div className="lg-label-row">
                  <label htmlFor="password" className="lg-label">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="lg-link sm"
                      onClick={() => setMode('reset')}
                      disabled={isLoading}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  className="lg-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Reset code field - shown for verify-code mode */}
            {mode === 'verify-code' && (
              <div className="lg-field">
                <label htmlFor="reset-code" className="lg-label">
                  6-digit code
                </label>
                <input
                  id="reset-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="lg-input code"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                  autoComplete="one-time-code"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* New password fields - shown for verify-code and update-password modes */}
            {(mode === 'verify-code' || mode === 'update-password') && (
              <>
                <div className="lg-field">
                  <label htmlFor="new-password" className="lg-label">
                    New password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="lg-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <p className="lg-hint">
                    At least 12 characters, with uppercase, lowercase, a number and a special
                    character.
                  </p>
                </div>

                <div className="lg-field">
                  <label htmlFor="confirm-password" className="lg-label">
                    Confirm password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="lg-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            <button type="submit" className="lg-submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <RandomMatrixSpinner size={18} />
                  Processing...
                </>
              ) : (
                <>
                  {mode === 'login' && 'Sign in'}
                  {mode === 'register' && 'Create account'}
                  {mode === 'reset' && 'Send reset code'}
                  {mode === 'verify-code' && 'Reset password'}
                  {mode === 'update-password' && 'Update password'}
                </>
              )}
            </button>
          </form>

          {mode !== 'processing' && mode !== 'verify-2fa' && (
            <div className="lg-footer">
              {mode === 'login' && (
                <span>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => setMode('register')}
                    disabled={isLoading}
                  >
                    Sign up
                  </button>
                </span>
              )}

              {mode === 'register' && (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => setMode('login')}
                    disabled={isLoading}
                  >
                    Sign in
                  </button>
                </span>
              )}

              {mode === 'reset' && (
                <span>
                  Remember your password?{' '}
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => setMode('login')}
                    disabled={isLoading}
                  >
                    Sign in
                  </button>
                </span>
              )}

              {mode === 'verify-code' && (
                <span>
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => {
                      setMode('reset');
                      setResetCode('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setError('');
                      setSuccessMessage('');
                    }}
                    disabled={isLoading}
                  >
                    Request a new code
                  </button>
                  {' · '}
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => {
                      setMode('login');
                      setResetCode('');
                      setNewPassword('');
                      setConfirmPassword('');
                      setResetEmail('');
                      setError('');
                      setSuccessMessage('');
                    }}
                    disabled={isLoading}
                  >
                    Back to sign in
                  </button>
                </span>
              )}

              {mode === 'update-password' && (
                <span>
                  Changed your mind?{' '}
                  <button
                    type="button"
                    className="lg-link"
                    onClick={() => {
                      // Update UI immediately
                      window.history.replaceState(null, '', window.location.pathname);
                      setMode('login');
                      setError('');
                      setSuccessMessage('');
                      // Sign out and THEN clear flag (prevents redirect while still logged in)
                      supabase!.auth
                        .signOut()
                        .then(() => {
                          sessionStorage.removeItem(PASSWORD_RESET_KEY);
                        })
                        .catch(() => {
                          setTimeout(() => sessionStorage.removeItem(PASSWORD_RESET_KEY), 2000);
                        });
                    }}
                    disabled={isLoading}
                  >
                    Back to sign in
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Version + privacy (GDPR Art. 13/14) */}
        <div className="lg-meta">
          <span>NDT Suite v2.0</span>
          <span aria-hidden="true">·</span>
          <a href="/privacy">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

export default LoginPageNew;
