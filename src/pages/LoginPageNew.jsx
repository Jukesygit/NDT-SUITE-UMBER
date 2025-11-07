import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import authManager from '../auth-manager.js';

function LoginPageNew({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login'); // 'login', 'register', 'reset'

  useEffect(() => {
    // Check if already logged in
    const checkSession = async () => {
      const session = await authManager.getSession();
      if (session) {
        navigate('/');
      }
    };
    checkSession();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const result = await authManager.login(email, password);
        if (result.error) {
          setError(result.error.message || 'Login failed');
        } else {
          if (onLogin) onLogin();
          navigate('/');
        }
      } else if (mode === 'register') {
        const result = await authManager.signUp(email, password);
        if (result.error) {
          setError(result.error.message || 'Registration failed');
        } else {
          setError('');
          setMode('login');
          alert('Registration successful! Please check your email to verify your account, then log in.');
        }
      } else if (mode === 'reset') {
        const result = await authManager.resetPassword(email);
        if (result.error) {
          setError(result.error.message || 'Password reset failed');
        } else {
          setError('');
          alert('Password reset email sent! Please check your inbox.');
          setMode('login');
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
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h1 className="login-card__title">NDT Suite</h1>
            <p className="login-card__subtitle">
              {mode === 'login' && 'Sign in to your account'}
              {mode === 'register' && 'Create a new account'}
              {mode === 'reset' && 'Reset your password'}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="alert alert--danger animate-slideDown">
              <div className="alert__message">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-card__form">
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

            {mode !== 'reset' && (
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

            <button
              type="submit"
              className="btn btn--primary btn--lg w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner spinner--sm"></span>
                  Processing...
                </>
              ) : (
                <>
                  {mode === 'login' && 'Sign In'}
                  {mode === 'register' && 'Create Account'}
                  {mode === 'reset' && 'Send Reset Link'}
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
          width: 4rem;
          height: 4rem;
          margin: 0 auto var(--spacing-4);
          background: rgba(59, 130, 246, 0.1);
          border: var(--border-width-thin) solid rgba(59, 130, 246, 0.3);
          border-radius: var(--radius-xl);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary-400);
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
