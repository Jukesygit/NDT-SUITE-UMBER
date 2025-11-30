import React from 'react';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            errorCount: 0
        };
    }

    static getDerivedStateFromError(error) {
        // Update state to show fallback UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // Log error to console in development
        console.error('Global Error Boundary caught:', error, errorInfo);

        // Track error count to prevent infinite loops
        this.setState(prevState => ({
            error,
            errorInfo,
            errorCount: prevState.errorCount + 1
        }));

        // Report to error tracking service in production
        if (process.env.NODE_ENV === 'production') {
            this.reportErrorToService(error, errorInfo);
        }
    }

    reportErrorToService(error, errorInfo) {
        // TODO: Integrate with error tracking service
        // Example: Sentry, LogRocket, etc.
        const errorData = {
            message: error.toString(),
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        // For now, store in localStorage for debugging
        try {
            const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
            errors.push(errorData);
            // Keep only last 10 errors
            if (errors.length > 10) {
                errors.shift();
            }
            localStorage.setItem('app_errors', JSON.stringify(errors));
        } catch (e) {
            console.error('Failed to store error:', e);
        }
    }

    handleReset = () => {
        // Clear error state
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });

        // Optionally reload the page if errors persist
        if (this.state.errorCount > 3) {
            window.location.reload();
        }
    };

    render() {
        if (this.state.hasError) {
            // Check if we're in an error loop
            if (this.state.errorCount > 5) {
                return (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        backgroundColor: '#0a0a0a',
                        color: '#ffffff',
                        padding: '20px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                        <h1 style={{ fontSize: '24px', marginBottom: '16px' }}>Critical Error</h1>
                        <p style={{ marginBottom: '24px', textAlign: 'center' }}>
                            The application has encountered multiple errors and cannot recover.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '12px 24px',
                                backgroundColor: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '16px'
                            }}
                        >
                            Reload Application
                        </button>
                    </div>
                );
            }

            // Fallback UI for recoverable errors
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    backgroundColor: '#0a0a0a',
                    color: '#ffffff',
                    padding: '20px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                    <div style={{
                        maxWidth: '600px',
                        width: '100%',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '12px',
                        padding: '40px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
                    }}>
                        <h1 style={{
                            fontSize: '28px',
                            marginBottom: '16px',
                            color: '#ef4444'
                        }}>
                            Oops! Something went wrong
                        </h1>

                        <p style={{
                            marginBottom: '24px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            lineHeight: '1.6'
                        }}>
                            We encountered an unexpected error. The issue has been logged and our team will investigate.
                        </p>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details style={{
                                marginBottom: '24px',
                                padding: '16px',
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}>
                                <summary style={{
                                    cursor: 'pointer',
                                    marginBottom: '12px',
                                    fontWeight: '600'
                                }}>
                                    Error Details (Development Only)
                                </summary>
                                <pre style={{
                                    fontSize: '12px',
                                    overflow: 'auto',
                                    color: '#ff6b6b',
                                    margin: 0
                                }}>
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}

                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={this.handleReset}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '500',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = '#10b981'}
                            >
                                Try Again
                            </button>

                            <button
                                onClick={() => window.location.href = '/'}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                    color: 'white',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: '500',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'}
                                onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
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

export default GlobalErrorBoundary;