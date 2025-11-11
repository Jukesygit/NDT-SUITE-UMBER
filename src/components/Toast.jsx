/**
 * Toast Notification System
 * Professional toast notifications matching the Unified Design System v2.0
 *
 * Usage:
 * import { showToast } from '@components/Toast';
 *
 * showToast.success('Operation completed!');
 * showToast.error('Something went wrong');
 * showToast.warning('Please be careful');
 * showToast.info('Did you know...');
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// Toast Store (Simple State Management)
// ============================================================================

let toastListeners = [];
let toastId = 0;

const toastStore = {
  toasts: [],

  subscribe(listener) {
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  },

  notify() {
    toastListeners.forEach(listener => listener(this.toasts));
  },

  addToast(toast) {
    const id = ++toastId;
    const newToast = { id, ...toast, createdAt: Date.now() };
    this.toasts = [...this.toasts, newToast];
    this.notify();

    // Auto-remove after duration
    if (toast.duration !== Infinity) {
      setTimeout(() => {
        this.removeToast(id);
      }, toast.duration || 5000);
    }

    return id;
  },

  removeToast(id) {
    this.toasts = this.toasts.filter(t => t.id !== id);
    this.notify();
  },

  clearAll() {
    this.toasts = [];
    this.notify();
  }
};

// ============================================================================
// Toast Component
// ============================================================================

const Toast = ({ toast, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose(toast.id);
    }, 300); // Match animation duration
  }, [toast.id, onClose]);

  // Icon based on type
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  // Colors based on type (Design System compliant)
  const getColors = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.3)',
          icon: '#10b981',
          text: '#ffffff'
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.3)',
          icon: '#ef4444',
          text: '#ffffff'
        };
      case 'warning':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.3)',
          icon: '#f59e0b',
          text: '#ffffff'
        };
      case 'info':
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.15)',
          border: 'rgba(59, 130, 246, 0.3)',
          icon: '#3b82f6',
          text: '#ffffff'
        };
    }
  };

  const colors = getColors();

  return (
    <div
      className={`toast-item ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-lg, 12px)',
        padding: 'var(--space-4, 16px)',
        display: 'flex',
        alignItems: 'start',
        gap: 'var(--space-3, 12px)',
        minWidth: '300px',
        maxWidth: '500px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(10px)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Icon */}
      <div style={{ color: colors.icon, flexShrink: 0 }}>
        {getIcon()}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{
            fontWeight: '600',
            fontSize: '14px',
            color: colors.text,
            marginBottom: toast.message ? '4px' : 0
          }}>
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.8)',
            lineHeight: '1.4'
          }}>
            {toast.message}
          </div>
        )}

        {/* Action button */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action.onClick();
              handleClose();
            }}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              background: colors.icon,
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm, 6px)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'opacity 150ms'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255, 255, 255, 0.6)',
          cursor: 'pointer',
          padding: '4px',
          flexShrink: 0,
          transition: 'color 150ms'
        }}
        onMouseEnter={(e) => e.target.style.color = '#ffffff'}
        onMouseLeave={(e) => e.target.style.color = 'rgba(255, 255, 255, 0.6)'}
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Progress bar for auto-dismiss */}
      {toast.duration && toast.duration !== Infinity && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: colors.icon,
            opacity: 0.3,
            animation: `toast-progress ${toast.duration}ms linear`
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Toast Container Component
// ============================================================================

const ToastContainer = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = toastStore.subscribe(setToasts);
    return unsubscribe;
  }, []);

  const handleClose = useCallback((id) => {
    toastStore.removeToast(id);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="toast-container"
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3, 12px)',
        pointerEvents: 'none'
      }}
    >
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'auto' }}>
          <Toast toast={toast} onClose={handleClose} />
        </div>
      ))}

      <style>{`
        @keyframes toast-enter {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes toast-exit {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }

        @keyframes toast-progress {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }

        .toast-enter {
          animation: toast-enter 300ms ease-out;
        }

        .toast-exit {
          animation: toast-exit 300ms ease-in;
        }

        .toast-item {
          transform-origin: center right;
        }

        @media (max-width: 640px) {
          .toast-container {
            top: 16px;
            right: 16px;
            left: 16px;
          }

          .toast-item {
            min-width: auto;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// Initialize Toast Container
// ============================================================================

let toastContainerRoot = null;

const initToastContainer = () => {
  if (typeof window === 'undefined') return;
  if (toastContainerRoot) return;

  const container = document.createElement('div');
  container.id = 'toast-root';
  document.body.appendChild(container);

  toastContainerRoot = createRoot(container);
  toastContainerRoot.render(<ToastContainer />);
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Show a toast notification
 * @param {Object} options - Toast options
 * @param {string} options.type - Type of toast (success, error, warning, info)
 * @param {string} options.title - Toast title
 * @param {string} options.message - Toast message
 * @param {number} options.duration - Auto-dismiss duration in ms (default: 5000)
 * @param {Object} options.action - Action button { label: string, onClick: function }
 * @returns {number} Toast ID
 */
export const toast = (options) => {
  initToastContainer();
  return toastStore.addToast(options);
};

/**
 * Show a success toast
 * @param {string} message - Success message
 * @param {string} title - Optional title
 */
toast.success = (message, title = 'Success') => {
  return toast({
    type: 'success',
    title,
    message,
    duration: 5000
  });
};

/**
 * Show an error toast
 * @param {string} message - Error message
 * @param {string} title - Optional title
 */
toast.error = (message, title = 'Error') => {
  return toast({
    type: 'error',
    title,
    message,
    duration: 7000 // Errors stay longer
  });
};

/**
 * Show a warning toast
 * @param {string} message - Warning message
 * @param {string} title - Optional title
 */
toast.warning = (message, title = 'Warning') => {
  return toast({
    type: 'warning',
    title,
    message,
    duration: 6000
  });
};

/**
 * Show an info toast
 * @param {string} message - Info message
 * @param {string} title - Optional title
 */
toast.info = (message, title = 'Info') => {
  return toast({
    type: 'info',
    title,
    message,
    duration: 5000
  });
};

/**
 * Show a loading toast (doesn't auto-dismiss)
 * @param {string} message - Loading message
 * @returns {number} Toast ID (use to dismiss manually)
 */
toast.loading = (message, title = 'Loading') => {
  return toast({
    type: 'info',
    title,
    message,
    duration: Infinity
  });
};

/**
 * Dismiss a specific toast
 * @param {number} id - Toast ID
 */
toast.dismiss = (id) => {
  toastStore.removeToast(id);
};

/**
 * Clear all toasts
 */
toast.clearAll = () => {
  toastStore.clearAll();
};

/**
 * Promise-based toast (shows loading, then success/error)
 * @param {Promise} promise - Promise to track
 * @param {Object} messages - Messages for each state
 * @param {string} messages.loading - Loading message
 * @param {string} messages.success - Success message
 * @param {string} messages.error - Error message
 */
toast.promise = async (promise, messages) => {
  const loadingId = toast.loading(messages.loading);

  try {
    const result = await promise;
    toast.dismiss(loadingId);
    toast.success(messages.success);
    return result;
  } catch (error) {
    toast.dismiss(loadingId);
    toast.error(messages.error || error.message);
    throw error;
  }
};

// Alias for convenience
export const showToast = toast;

// Export for use in React components
export default toast;
