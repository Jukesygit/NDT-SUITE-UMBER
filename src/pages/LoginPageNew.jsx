import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authManager from '../auth-manager.js';
import supabase from '../supabase-client.js';
import { LogoGradientShift } from '../components/MatrixLogoAnimated';
import { RandomMatrixSpinner } from '../components/MatrixSpinners';
import { useAuth } from '../contexts/AuthContext';

// Storage key for tracking password reset mode
const PASSWORD_RESET_KEY = 'ndt_password_reset_pending';

// Check for recovery mode before component mounts (synchronous check)
const getInitialMode = () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);

    // Check for explicit type=recovery parameter (our redirect URL includes this)
    if (params.get('type') === 'recovery') {
      console.log('Initial mode: update-password (type=recovery parameter detected)');
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Check hash-based recovery (older Supabase flow)
    if (hash && hash.includes('type=recovery')) {
      console.log('Initial mode: update-password (recovery token in hash)');
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Check for code parameter WITH type=recovery (PKCE flow - both may be present)
    // Note: We no longer assume any code param is password reset - it could be email confirmation
    if (params.get('code') && params.get('type') === 'recovery') {
      console.log('Initial mode: update-password (code + recovery type detected)');
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      return 'update-password';
    }

    // Don't trust sessionStorage alone on fresh page loads - it may be stale
    // The sessionStorage flag is only used to prevent redirects during the password update flow,
    // not to determine the initial mode. Clear any stale flag.
    if (sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true') {
      console.log('Clearing stale password reset flag from sessionStorage');
      sessionStorage.removeItem(PASSWORD_RESET_KEY);
    }
  }
  return 'login';
};

function LoginPageNew() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetEmail, setResetEmail] = useState(''); // Store email for code verification
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [mode, setMode] = useState(getInitialMode); // 'login', 'register', 'reset', 'verify-code', 'update-password'

  useEffect(() => {
    // Check if we're in password reset mode (from sessionStorage)
    const isPasswordResetMode = sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true';

    // Note: We don't force mode to 'update-password' here anymore.
    // getInitialMode() handles the initial mode, and we allow explicit mode changes
    // (like clicking "Back to sign in") to take precedence.

    // Listen for password recovery event from auth-manager
    const handlePasswordRecovery = () => {
      console.log('passwordRecoveryMode event received');
      sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
      setMode('update-password');
    };
    window.addEventListener('passwordRecoveryMode', handlePasswordRecovery);

    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Login page auth event:', event);

      // Re-check sessionStorage in case it was set by another handler
      const currentPasswordResetMode = sessionStorage.getItem(PASSWORD_RESET_KEY) === 'true';

      if (event === 'PASSWORD_RECOVERY') {
        console.log('PASSWORD_RECOVERY event received');
        sessionStorage.setItem(PASSWORD_RESET_KEY, 'true');
        setMode('update-password');
        // Clean up URL but keep type=recovery for page reloads
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        window.history.replaceState(null, '', url.toString());
      } else if (event === 'USER_UPDATED' && currentPasswordResetMode) {
        // Password was updated successfully - this fires faster than the promise resolves
        console.log('USER_UPDATED: Password update confirmed, switching to login');
        window.history.replaceState(null, '', window.location.pathname);
        setSuccessMessage('Password updated successfully! You can now sign in with your new password.');
        setNewPassword('');
        setConfirmPassword('');
        setIsLoading(false);
        setMode('login');
        // Sign out and THEN clear the password reset flag (prevents redirect while still logged in)
        supabase.auth.signOut()
          .then(() => {
            console.log('Sign out complete, clearing password reset flag');
            sessionStorage.removeItem(PASSWORD_RESET_KEY);
          })
          .catch(err => {
            console.log('Sign out error:', err);
            // Clear flag anyway after a delay to prevent stuck state
            setTimeout(() => sessionStorage.removeItem(PASSWORD_RESET_KEY), 2000);
          });
      } else if (event === 'SIGNED_IN') {
        // Don't navigate here - let the isAuthenticated check in useEffect handle it
        // This ensures AuthContext has updated before we try to navigate
        if (!currentPasswordResetMode && mode !== 'update-password') {
          console.log('SIGNED_IN: Auth context will handle redirect');
        } else {
          console.log('SIGNED_IN: In password reset mode, staying on login page');
        }
      }
    });

    // Only redirect if logged in and NOT in password reset mode
    if (isAuthenticated && !isPasswordResetMode && mode !== 'update-password') {
      console.log('User already logged in, redirecting to home');
      navigate('/');
    }

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('passwordRecoveryMode', handlePasswordRecovery);
    };
  }, [navigate, mode, isAuthenticated]);

  const handleSubmit = async (e) => {
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
        }
        // Don't navigate here and keep loading state - let the isAuthenticated useEffect handle redirect
        // This ensures AuthContext has updated before we try to navigate
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
          const errorMsg = result.error.message || 'Password reset failed';

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

        if (newPassword.length < 6) {
          setError('Password must be at least 6 characters');
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
          setError(result.error.message || 'Failed to verify code');
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

        if (newPassword.length < 6) {
          setError('Password must be at least 6 characters');
          setIsLoading(false);
          return;
        }

        // Check if we have a session (the code should have been exchanged for a session)
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Try to exchange the code if it's still in the URL
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          if (code) {
            console.log('No session found, attempting to exchange code...');
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('Code exchange failed:', exchangeError);
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
          const { data, error: updateError } = await supabase.functions.invoke('update-password-confirm-email', {
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
            console.log('Password updated successfully via Edge Function');
            setSuccessMessage(data?.message || 'Password updated successfully. You can now sign in.');
            setNewPassword('');
            setConfirmPassword('');
            // Sign out the recovery session and redirect to login
            await supabase.auth.signOut();
            setMode('login');
          }
        } catch (updateErr) {
          console.error('Password update error:', updateErr);
          setError('Error updating password: ' + (updateErr.message || 'Unknown error'));
        }
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background Elements */}
      <div className="login-page__bg"></div>

      {/* Content */}
      <div className="login-page__content">
        <div className="login-card animate-scaleIn">
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-card__form" style={{ display: mode === 'processing' ? 'none' : 'block' }}>
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
                    style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.25rem', fontFamily: 'monospace' }}
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
                    minLength={6}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
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
                    minLength={6}
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
                    minLength={6}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
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
                    minLength={6}
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
          <div className="login-card__footer">
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
                    supabase.auth.signOut()
                      .then(() => {
                        console.log('Sign out complete, clearing password reset flag');
                        sessionStorage.removeItem(PASSWORD_RESET_KEY);
                      })
                      .catch(err => {
                        console.log('Sign out error:', err);
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
        </div>
      </div>

      <style>{`
        .login-page {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: var(--surface-base);
        }

        .login-page__bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(99, 102, 241, 0.06) 0%, transparent 50%),
            radial-gradient(circle at 50% 80%, rgba(59, 130, 246, 0.06) 0%, transparent 50%);
          pointer-events: none;
        }

        .login-page__content {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 28rem;
          padding: var(--spacing-6);
        }

        .login-card {
          background: var(--surface-raised);
          border: var(--border-width-thin) solid var(--border-default);
          border-radius: var(--radius-2xl);
          padding: var(--spacing-10);
          box-shadow: var(--shadow-2xl);
        }

        .login-card__header {
          text-align: center;
          margin-bottom: var(--spacing-8);
        }

        .login-card__logo {
          margin: 0 auto var(--spacing-4);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .login-card__title {
          font-size: var(--text-3xl);
          font-weight: var(--font-bold);
          color: var(--text-primary);
          margin-bottom: var(--spacing-2);
          letter-spacing: var(--tracking-tight);
        }

        .login-card__subtitle {
          font-size: var(--text-base);
          color: var(--text-tertiary);
          margin: 0;
        }

        .login-card__form {
          margin-bottom: var(--spacing-6);
        }

        .login-card__processing {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-8) 0;
        }

        .login-card__footer {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-4);
          align-items: center;
          padding-top: var(--spacing-6);
          border-top: var(--border-width-thin) solid var(--border-subtle);
        }

        @media (max-width: 640px) {
          .login-card {
            padding: var(--spacing-8) var(--spacing-6);
          }
        }
      `}</style>
    </div>
  );
}

export default LoginPageNew;
