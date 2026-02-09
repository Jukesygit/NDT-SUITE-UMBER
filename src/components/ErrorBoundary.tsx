/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the component tree
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error, errorInfo);
    }

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // In production, send error to error reporting service
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }
  }

  logErrorToService(_error: Error, _errorInfo: ErrorInfo) {
    // Placeholder — integrate with Sentry or similar when ready.
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          }}
        >
          <div
            style={{
              maxWidth: '600px',
              margin: '0 auto',
              padding: '40px',
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <h1
              style={{
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#1a202c',
                marginBottom: '16px',
              }}
            >
              Oops! Something went wrong
            </h1>
            <p
              style={{
                fontSize: '16px',
                color: '#4a5568',
                marginBottom: '24px',
              }}
            >
              We encountered an unexpected error. The error has been logged and our team will look into it.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details
                style={{
                  marginBottom: '24px',
                  padding: '16px',
                  background: '#f7fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    fontWeight: '600',
                    color: '#2d3748',
                    marginBottom: '8px',
                  }}
                >
                  Error Details (Development Only)
                </summary>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#e53e3e',
                    whiteSpace: 'pre-wrap',
                    overflowX: 'auto',
                  }}
                >
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Message:</strong> {this.state.error.message}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Stack:</strong>
                    <pre style={{ margin: '4px 0' }}>{this.state.error.stack}</pre>
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Component Stack:</strong>
                      <pre style={{ margin: '4px 0' }}>{this.state.errorInfo.componentStack}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '12px 24px',
                  background: 'white',
                  color: '#4a5568',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#cbd5e0';
                  e.currentTarget.style.background = '#f7fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = 'white';
                }}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;