import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import authManager from '../auth-manager.js';
import supabase from '../supabase-client';
import { LogoGradientShift } from '../components/MatrixLogoAnimated';
import { RandomMatrixSpinner } from '../components/MatrixSpinners';
import { useAuth } from '../contexts/AuthContext';
import { twoFactorService } from '../services/two-factor-service';
import { TwoFactorVerifyInput } from '../components/two-factor/TwoFactorVerifyInput';

// Storage key for tracking password reset mode
const PASSWORD_RESET_KEY = 'ndt_password_reset_pending';

type LoginMode = 'login' | 'register' | 'reset' | 'verify-code' | 'update-password' | 'processing' | 'verify-2fa';

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
  const [mode, setMode] = useState<LoginMode>(getInitialMode); // 'login', 'register', 'reset', 'verify-code', 'update-password'
  const isRedirectingRef = useRef(false); // Track if we're in the process of redirecting
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [twoFAError, setTwoFAError] = useState('');

  const handle2FAVerify = async (code: string) => {
    setTwoFALoading(true);
    setTwoFAError('');
    try {
      await twoFactorService.verifyLogin(code);
      // 2FA verified — complete the login
      authManager.complete2FALogin();
      isRedirectingRef.current = true;
      navigate('/');
      setTimeout(() => {
        if (window.location.pathname === '/login') {
          window.location.href = '/';
        }
      }, 1000);
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
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, _session) => {
      const currentPasswordResetMode = sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true';

      if (event === 'USER_UPDATED' && currentPasswordResetMode) {
        // Password was updated successfully - this fires faster than the promise resolves
        window.history.replaceState(null, '', window.location.pathname);
        setSuccessMessage('Password updated successfully! You can now sign in with your new password.');
        setNewPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        setMode('login');
        // Sign out and THEN clear the password reset flag (prevents redirect while still logged in)
        supabase!.auth.signOut()
          .then(() => {
            sessionStorage.removeItem(PASSWORD_RESET_KEY);
          })
          .catch(() => {
            setTimeout(() => sessionStorage.removeItem(PASSWORD_RESET_KEY), 2000);
          });
      }
    });

    // Only redirect if logged in and NOT in password reset or 2FA verify mode
    if (isAuthenticated && !isPasswordResetMode && mode !== 'update-password' && mode !== 'verify-2fa') {
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
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const result = await authManager.login(email, password);
        if (result.error) {
          // Handle both string errors and object errors
          const errorMsg = typeof result.error === 'string' ? result.error : (result.error?.message || 'Login failed');
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
          const errorMsg = typeof result.error === 'string' ? result.error : (result.error?.message || 'Registration failed');
          setError(errorMsg);
        } else {
          setError('');
          setMode('login');
          alert('Registration successful! Please check your email to verify your account, then log in.');
        }
      } else if (mode === 'reset') {
        const result = await authManager.resetPassword(email);
        if (result.error) {
          const errorMsg = typeof result.error === 'string' ? result.error : result.error?.message || 'Password reset failed';

          // Check for rate limit error
          if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('wait')) {
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

        // Validate password meets server requirements (must match password-validation.ts)
        if (newPassword.length < 12) {
          setError('Password must be at least 12 characters');
          setIsLoading(false);
          return;
        }
        if (!/[A-Z]/.test(newPassword)) {
          setError('Password must contain at least one uppercase letter');
          setIsLoading(false);
          return;
        }
        if (!/[a-z]/.test(newPassword)) {
          setError('Password must contain at least one lowercase letter');
          setIsLoading(false);
          return;
        }
        if (!/[0-9]/.test(newPassword)) {
          setError('Password must contain at least one number');
          setIsLoading(false);
          return;
        }
        // eslint-disable-next-line no-useless-escape
        if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) {
          setError('Password must contain at least one special character (!@#$%^&*)');
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
          setError(typeof result.error === 'string' ? result.error : result.error?.message || 'Failed to verify code');
        } else {
          setError('');
          setSuccessMessage(result.message || 'Password updated successfully! You can now sign in.');
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

        // Validate password meets server requirements (must match password-validation.ts)
        if (newPassword.length < 12) {
          setError('Password must be at least 12 characters');
          setIsLoading(false);
          return;
        }
        if (!/[A-Z]/.test(newPassword)) {
          setError('Password must contain at least one uppercase letter');
          setIsLoading(false);
          return;
        }
        if (!/[a-z]/.test(newPassword)) {
          setError('Password must contain at least one lowercase letter');
          setIsLoading(false);
          return;
        }
        if (!/[0-9]/.test(newPassword)) {
          setError('Password must contain at least one number');
          setIsLoading(false);
          return;
        }
        // eslint-disable-next-line no-useless-escape
        if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) {
          setError('Password must contain at least one special character (!@#$%^&*)');
          setIsLoading(false);
          return;
        }

        // Check if we have a session (the code should have been exchanged for a session)
        let { data: { session } } = await supabase!.auth.getSession();
        if (!session) {
          // Try to exchange the code if it's still in the URL
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          if (code) {
            const { data: exchangeData, error: exchangeError } = await supabase!.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              setError('Your password reset link has expired. Please request a new one.');
              setIsLoading(false);
              return;
            }
            session = exchangeData?.session;
          } else {
            setError('Your password reset session has expired. Please request a new password reset link.');
            setIsLoading(false);
            return;
          }
        }

        // Use Edge Function to update password AND confirm email
        // This is necessary because clicking the reset link proves email ownership
        try {
          const { data, error: updateError } = await supabase!.functions.invoke('update-password-confirm-email', {
            body: {
              newPassword,
              accessToken: session?.access_token
            }
          });

          if (updateError) {
            setError('Error updating password: ' + updateError.message);
          } else if (data?.error) {
            setError('Error updating password: ' + data.error);
          } else {
            // Success - show message and redirect to login
            setSuccessMessage(data?.message || 'Password updated successfully. You can now sign in.');
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

  return (
    <div className="login-page">
      {/* Background Elements */}
      <div className="login-page__bg"></div>

      {/* Content */}
      <div className="login-page__content">
        <div className="login-card animate-scaleIn">
         <div className="login-card__panel">
          {/* Logo */}
          <div className="login-card__header">
            <div className="login-card__logo">
              <LogoGradientShift size={90} />
            </div>
            <h1 className="login-card__title">Matrix Portal</h1>
            <p className="login-card__subtitle">
              {mode === 'login' && 'Sign in to your account'}
              {mode === 'register' && 'Create a new account'}
              {mode === 'reset' && 'Reset your password'}
              {mode === 'verify-code' && 'Enter code and new password'}
              {mode === 'update-password' && 'Enter your new password'}
              {mode === 'processing' && 'Processing your request...'}
              {mode === 'verify-2fa' && 'Two-factor authentication'}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert--danger animate-slideDown">
              <div className="alert__message">{error}</div>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="alert alert--success animate-slideDown">
              <div className="alert__message">{successMessage}</div>
            </div>
          )}

          {/* Processing state - show loading spinner */}
          {mode === 'processing' && (
            <div className="login-card__processing">
              <RandomMatrixSpinner size={60} />
              <p className="text-sm text-tertiary mt-4">Verifying your reset link...</p>
            </div>
          )}

          {/* 2FA Verify Mode */}
          {mode === 'verify-2fa' && (
            <div className="login-card__form">
              <p style={{ color: 'var(--color-neutral-400)', fontSize: '12px', marginBottom: '20px', textAlign: 'center', fontFamily: 'var(--font-label)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', textShadow: '0 1px 0 rgba(255,255,255,0.35)' }}>
                Enter the 6-digit code from your authenticator app
              </p>
              <TwoFactorVerifyInput
                onSubmit={handle2FAVerify}
                isLoading={twoFALoading}
                error={twoFAError}
              />
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode('login');
                    setTwoFAError('');
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-neutral-400)', fontSize: '11px', fontFamily: 'var(--font-label)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', textShadow: '0 1px 0 rgba(255,255,255,0.30)' }}
                >
                  Back to sign in
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-card__form" style={{ display: (mode === 'processing' || mode === 'verify-2fa') ? 'none' : 'block' }}>
            {/* Email field - shown for login, register, reset modes */}
            {mode !== 'update-password' && mode !== 'verify-code' && (
              <div className="input-group">
                <label htmlFor="email" className="input-group__label">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  className="input input--md"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Password field - shown for login and register modes */}
            {(mode === 'login' || mode === 'register') && (
              <div className="input-group">
                <label htmlFor="password" className="input-group__label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="input input--md"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Verify code fields - shown for verify-code mode */}
            {mode === 'verify-code' && (
              <>
                <div className="input-group">
                  <label htmlFor="reset-code" className="input-group__label">
                    6-Digit Code
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="input input--md"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    autoComplete="one-time-code"
                    disabled={isLoading}
                    style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.25rem', fontFamily: 'var(--font-mono)' }}
                  />
                  <p className="text-xs text-tertiary mt-1">Check your email for the code</p>
                </div>

                <div className="input-group">
                  <label htmlFor="new-password" className="input-group__label">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="input input--md"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-tertiary mt-1">Min 12 chars with uppercase, lowercase, number & special char</p>
                </div>

                <div className="input-group">
                  <label htmlFor="confirm-password" className="input-group__label">
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="input input--md"
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

            {/* New password fields - shown for update-password mode (legacy link flow) */}
            {mode === 'update-password' && (
              <>
                <div className="input-group">
                  <label htmlFor="new-password" className="input-group__label">
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    className="input input--md"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-tertiary mt-1">Min 12 chars with uppercase, lowercase, number & special char</p>
                </div>

                <div className="input-group">
                  <label htmlFor="confirm-password" className="input-group__label">
                    Confirm Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    className="input input--md"
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

            <button
              type="submit"
              className="btn btn--primary btn--lg w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <RandomMatrixSpinner size={20} />
                  Processing...
                </span>
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'register' && 'Create Account'}
                  {mode === 'reset' && 'Send Reset Code'}
                  {mode === 'verify-code' && 'Reset Password'}
                  {mode === 'update-password' && 'Update Password'}
                </>
              )}
            </button>
          </form>

          {/* Footer Links */}
          <div className="login-card__footer" style={{ display: mode === 'verify-2fa' ? 'none' : undefined }}>
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setMode('reset')}
                  disabled={isLoading}
                >
                  Forgot password?
                </button>
                <div className="text-sm text-tertiary">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    className="text-primary font-medium hover:underline"
                    onClick={() => setMode('register')}
                    disabled={isLoading}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    Sign up
                  </button>
                </div>
              </>
            )}

            {mode === 'register' && (
              <div className="text-sm text-tertiary text-center">
                Already have an account?{' '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => setMode('login')}
                  disabled={isLoading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Sign in
                </button>
              </div>
            )}

            {mode === 'reset' && (
              <div className="text-sm text-tertiary text-center">
                Remember your password?{' '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => setMode('login')}
                  disabled={isLoading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Sign in
                </button>
              </div>
            )}

            {mode === 'verify-code' && (
              <div className="text-sm text-tertiary text-center">
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    setMode('reset');
                    setResetCode('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setError('');
                    setSuccessMessage('');
                  }}
                  disabled={isLoading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Request a new code
                </button>
                {' | '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
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
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Back to sign in
                </button>
              </div>
            )}

            {mode === 'update-password' && (
              <div className="text-sm text-tertiary text-center">
                Changed your mind?{' '}
                <button
                  type="button"
                  className="text-primary font-medium hover:underline"
                  onClick={() => {
                    // Update UI immediately
                    window.history.replaceState(null, '', window.location.pathname);
                    setMode('login');
                    setError('');
                    setSuccessMessage('');
                    // Sign out and THEN clear flag (prevents redirect while still logged in)
                    supabase!.auth.signOut()
                      .then(() => {
                        sessionStorage.removeItem(PASSWORD_RESET_KEY);
                      })
                      .catch(() => {
                        setTimeout(() => sessionStorage.removeItem(PASSWORD_RESET_KEY), 2000);
                      });
                  }}
                  disabled={isLoading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  Back to sign in
                </button>
              </div>
            )}
          </div>

          {/* Privacy Policy Link - always visible, GDPR Art. 13/14 */}
          <div className="login-card__privacy">
            <a href="/privacy">Privacy Policy</a>
          </div>
         </div>{/* end .login-card__panel */}

          {/* Nameplate bar */}
          <div className="login-card__nameplate-bar">
            <span className="login-card__nameplate">Matrix</span>
            <span className="login-card__nameplate-model">NDT Suite v2.0</span>
          </div>
        </div>
      </div>

      <style>{`
        /* ---- Chassis background (full page) ---- */
        .login-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: linear-gradient(180deg, var(--chassis-inner) 0%, var(--chassis) 100%);
        }

        .login-page__bg {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(90deg,
            transparent 0px, transparent 1px,
            rgba(255, 255, 255, 0.008) 1px, rgba(255, 255, 255, 0.008) 2px,
            transparent 2px, transparent 3px
          );
          pointer-events: none;
        }

        .login-page__content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 28rem;
          padding: var(--spacing-6);
        }

        /* ---- Panel card (brushed metal surface) ---- */
        .login-card {
          border-radius: 14px;
          padding: 10px;
          background: linear-gradient(180deg, var(--chassis-inner) 0%, var(--chassis) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            inset 0 -1px 0 rgba(0, 0, 0, 0.20),
            0 12px 40px rgba(0, 0, 0, 0.45),
            0 2px 8px rgba(0, 0, 0, 0.25);
        }

        .login-card__panel {
          border-radius: 8px;
          padding: 32px 36px 24px;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(180deg, var(--panel-top) 0%, var(--panel-mid) 45%, var(--panel-bot) 100%);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.45),
            inset 0 -1px 0 rgba(0, 0, 0, 0.08);
        }

        /* Brushed metal grain */
        .login-card__panel::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 8px;
          background: repeating-linear-gradient(90deg,
            transparent 0px, transparent 1px,
            rgba(255, 255, 255, 0.004) 1px, rgba(255, 255, 255, 0.004) 2px,
            transparent 2px, transparent 3px
          );
          pointer-events: none;
        }

        /* Specular highlight */
        .login-card__panel::after {
          content: '';
          position: absolute;
          top: -80px;
          left: 50%;
          transform: translateX(-50%);
          width: 70%;
          height: 200px;
          border-radius: 50%;
          background: radial-gradient(ellipse at 50% 50%,
            rgba(255, 255, 255, 0.55) 0%,
            rgba(255, 255, 255, 0.35) 20%,
            rgba(255, 255, 255, 0.14) 40%,
            rgba(255, 255, 255, 0.04) 60%,
            transparent 80%);
          pointer-events: none;
          z-index: 0;
        }

        .login-card__header {
          text-align: center;
          margin-bottom: var(--spacing-6);
          position: relative;
          z-index: 1;
        }

        .login-card__logo {
          margin: 0 auto var(--spacing-4);
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.50));
          opacity: 0.70;
        }

        .login-card__title {
          font-family: var(--font-label);
          font-size: 22px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--color-neutral-700);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45);
          margin-bottom: var(--spacing-2);
        }

        .login-card__subtitle {
          font-family: var(--font-label);
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-neutral-400);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
          margin: 0;
        }

        /* ---- Form area ---- */
        .login-card__form {
          margin-bottom: var(--spacing-4);
          position: relative;
          z-index: 1;
        }

        /* ---- Input wells (recessed LCD look) ---- */
        .login-card__form .input-group__label {
          font-family: var(--font-label);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-neutral-500);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
        }

        .login-card__form .input {
          background:
            radial-gradient(ellipse at 50% 95%, rgba(255, 255, 255, 0.02) 0%, transparent 50%),
            linear-gradient(180deg, var(--well-mid) 0%, var(--well-deep) 30%, var(--well-floor) 100%);
          border: 1px solid rgba(0, 0, 0, 0.25);
          border-radius: 6px;
          color: rgba(53, 160, 88, 0.70);
          -webkit-text-fill-color: rgba(53, 160, 88, 0.70);
          caret-color: rgba(53, 160, 88, 0.70);
          font-family: var(--font-mono);
          font-size: 14px;
          text-shadow: 0 0 6px var(--green-glow-soft);
          box-shadow:
            inset 0 5px 14px rgba(0, 0, 0, 0.38),
            inset 0 2px 4px rgba(0, 0, 0, 0.28),
            inset 0 -2px 5px rgba(255, 255, 255, 0.03),
            0 1px 0 rgba(255, 255, 255, 0.32);
        }

        .login-card__form .input::placeholder {
          color: rgba(53, 160, 88, 0.25);
          -webkit-text-fill-color: rgba(53, 160, 88, 0.25);
          text-shadow: none;
        }

        .login-card__form .input:focus {
          border-color: var(--green);
          box-shadow:
            inset 0 5px 14px rgba(0, 0, 0, 0.38),
            inset 0 2px 4px rgba(0, 0, 0, 0.28),
            inset 0 -2px 5px rgba(255, 255, 255, 0.03),
            0 1px 0 rgba(255, 255, 255, 0.32),
            0 0 0 3px rgba(45, 138, 78, 0.12);
          color: rgba(53, 160, 88, 0.85);
          -webkit-text-fill-color: rgba(53, 160, 88, 0.85);
          caret-color: rgba(53, 160, 88, 0.85);
        }

        .login-card__form .input:-webkit-autofill,
        .login-card__form .input:-webkit-autofill:hover,
        .login-card__form .input:-webkit-autofill:focus {
          -webkit-text-fill-color: rgba(53, 160, 88, 0.70) !important;
          -webkit-box-shadow: 0 0 0 1000px var(--well-floor) inset !important;
          box-shadow: 0 0 0 1000px var(--well-floor) inset !important;
          caret-color: rgba(53, 160, 88, 0.70);
        }

        /* ---- Submit button (raised green control) ---- */
        .login-card__form .btn--primary {
          background:
            linear-gradient(180deg, var(--green-bright) 0%, var(--green) 50%, var(--green-dark) 100%);
          color: #fff;
          border: 1px solid rgba(0, 0, 0, 0.18);
          border-top: 1px solid rgba(255, 255, 255, 0.20);
          border-radius: 6px;
          font-family: var(--font-label);
          font-weight: 700;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          box-shadow:
            0 3px 8px rgba(0, 0, 0, 0.20),
            0 1px 2px rgba(0, 0, 0, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.20);
          text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.25);
        }

        .login-card__form .btn--primary:hover {
          background:
            linear-gradient(180deg, #3db668 0%, var(--green-bright) 50%, var(--green) 100%);
          box-shadow:
            0 4px 12px rgba(45, 138, 78, 0.30),
            0 1px 3px rgba(0, 0, 0, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }

        .login-card__form .btn--primary:active {
          transform: translateY(0);
          box-shadow:
            0 1px 4px rgba(0, 0, 0, 0.20),
            inset 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .login-card__processing {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-8) 0;
          position: relative;
          z-index: 1;
        }

        /* ---- Footer links ---- */
        .login-card__footer {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-4);
          align-items: center;
          padding-top: var(--spacing-5);
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          position: relative;
          z-index: 1;
        }

        .login-card__footer .btn--ghost {
          font-family: var(--font-label);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-neutral-400);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.30);
        }

        .login-card__footer .btn--ghost:hover {
          color: var(--green);
          text-shadow: none;
        }

        /* ---- Nameplate bar ---- */
        .login-card__nameplate-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px;
          margin-top: 14px;
          position: relative;
          z-index: 1;
        }

        .login-card__nameplate {
          font-family: var(--font-label);
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.18em;
          color: var(--color-neutral-500);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.40);
        }

        .login-card__nameplate-model {
          font-family: var(--font-label);
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--color-neutral-400);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
        }

        /* ---- Alerts ---- */
        .login-card .alert--danger {
          background:
            linear-gradient(180deg, var(--well-mid) 0%, var(--well-deep) 40%, var(--well-floor) 100%);
          border: 1px solid rgba(192, 57, 43, 0.30);
          border-radius: 6px;
          color: rgba(239, 83, 80, 0.85);
          font-family: var(--font-mono);
          font-size: 12px;
          text-shadow: 0 0 6px rgba(192, 57, 43, 0.30);
          box-shadow:
            inset 0 3px 10px rgba(0, 0, 0, 0.30),
            inset 0 1px 3px rgba(0, 0, 0, 0.20),
            0 1px 0 rgba(255, 255, 255, 0.25);
        }

        .login-card .alert--success {
          background:
            linear-gradient(180deg, var(--well-mid) 0%, var(--well-deep) 40%, var(--well-floor) 100%);
          border: 1px solid rgba(45, 138, 78, 0.30);
          border-radius: 6px;
          color: rgba(53, 160, 88, 0.85);
          font-family: var(--font-mono);
          font-size: 12px;
          text-shadow: 0 0 6px var(--green-glow-soft);
          box-shadow:
            inset 0 3px 10px rgba(0, 0, 0, 0.30),
            inset 0 1px 3px rgba(0, 0, 0, 0.20),
            0 1px 0 rgba(255, 255, 255, 0.25);
        }

        /* ---- Privacy link ---- */
        .login-card__privacy {
          text-align: center;
          padding-top: 12px;
          margin-top: 6px;
          position: relative;
          z-index: 1;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .login-card__privacy a {
          font-family: var(--font-label);
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-neutral-400);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.30);
          text-decoration: none;
        }

        .login-card__privacy a:hover {
          color: var(--green);
          text-shadow: none;
        }

        /* ---- Link buttons (green accented) ---- */
        .login-card .text-primary {
          color: var(--green) !important;
          text-shadow: none;
        }

        .login-card .text-primary:hover {
          color: var(--green-bright) !important;
        }

        .login-card .text-tertiary,
        .login-card .text-sm.text-tertiary {
          color: var(--color-neutral-400) !important;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.30);
          font-family: var(--font-sans);
          font-size: 12px;
        }

        /* ---- Hint text under inputs ---- */
        .login-card .text-xs.text-tertiary {
          color: var(--color-neutral-400) !important;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.30);
          font-size: 10px;
        }

        @media (max-width: 640px) {
          .login-card__panel {
            padding: 24px 20px 20px;
          }
        }
      `}</style>
    </div>
  );
}

export default LoginPageNew;
