/**
 * Confirmation Dialog Component
 * Professional confirmation dialogs matching the Unified Design System v2.0
 *
 * Usage:
 * import { confirmDialog } from '@components/ConfirmDialog';
 *
 * const confirmed = await confirmDialog({
 *   title: 'Delete User?',
 *   message: 'This action cannot be undone.',
 *   confirmText: 'Delete',
 *   cancelText: 'Cancel',
 *   destructive: true
 * });
 *
 * if (confirmed) {
 *   // User clicked confirm
 * }
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// Confirmation Dialog Component
// ============================================================================

const ConfirmDialog = ({ config, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    setTimeout(() => setIsVisible(true), 10);
  }, []);

  const handleConfirm = () => {
    setIsVisible(false);
    setTimeout(() => onClose(true), 200);
  };

  const handleCancel = () => {
    setIsVisible(false);
    setTimeout(() => onClose(false), 200);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  // Icon based on type
  const getIcon = () => {
    if (config.destructive) {
      return (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      );
    }
    return (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  };

  return (
    <div
      className="confirm-dialog-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: isVisible ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0)',
        backdropFilter: isVisible ? 'blur(4px)' : 'blur(0)',
        transition: 'all 200ms ease-out'
      }}
      onClick={handleOverlayClick}
    >
      <div
        className="confirm-dialog"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: 'var(--radius-xl, 16px)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          maxWidth: '480px',
          width: '100%',
          overflow: 'hidden',
          transform: isVisible ? 'scale(1)' : 'scale(0.95)',
          opacity: isVisible ? 1 : 0,
          transition: 'all 200ms ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div style={{
          padding: '24px 24px 16px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)'
        }}>
          <div style={{
            display: 'inline-flex',
            padding: '12px',
            borderRadius: 'var(--radius-lg, 12px)',
            background: config.destructive
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(59, 130, 246, 0.15)',
            color: config.destructive ? '#ef4444' : '#3b82f6',
            marginBottom: '16px'
          }}>
            {getIcon()}
          </div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#ffffff',
            margin: 0
          }}>
            {config.title || 'Confirm Action'}
          </h2>
        </div>

        {/* Body */}
        <div style={{
          padding: '24px',
          color: 'rgba(255, 255, 255, 0.8)',
          fontSize: '15px',
          lineHeight: '1.6',
          textAlign: 'center'
        }}>
          {config.message || 'Are you sure you want to proceed?'}
        </div>

        {/* Footer with buttons */}
        <div style={{
          padding: '16px 24px 24px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              borderRadius: 'var(--radius-md, 10px)',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 150ms',
              minWidth: '100px'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(148, 163, 184, 0.1)';
              e.target.style.borderColor = 'rgba(148, 163, 184, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'transparent';
              e.target.style.borderColor = 'rgba(148, 163, 184, 0.2)';
            }}
          >
            {config.cancelText || 'Cancel'}
          </button>

          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              background: config.destructive
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              border: 'none',
              borderRadius: 'var(--radius-md, 10px)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 150ms',
              minWidth: '100px',
              boxShadow: config.destructive
                ? '0 4px 20px rgba(239, 68, 68, 0.3)'
                : '0 4px 20px rgba(59, 130, 246, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = config.destructive
                ? '0 6px 24px rgba(239, 68, 68, 0.4)'
                : '0 6px 24px rgba(59, 130, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = config.destructive
                ? '0 4px 20px rgba(239, 68, 68, 0.3)'
                : '0 4px 20px rgba(59, 130, 246, 0.3)';
            }}
            autoFocus
          >
            {config.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Show a confirmation dialog
 * @param {Object} config - Dialog configuration
 * @param {string} config.title - Dialog title
 * @param {string} config.message - Dialog message
 * @param {string} config.confirmText - Confirm button text
 * @param {string} config.cancelText - Cancel button text
 * @param {boolean} config.destructive - Whether this is a destructive action (shows red)
 * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
 */
export const confirmDialog = (config = {}) => {
  return new Promise((resolve) => {
    // Create container
    const container = document.createElement('div');
    container.id = `confirm-dialog-${Date.now()}`;
    document.body.appendChild(container);

    // Create root and render
    const root = createRoot(container);

    const handleClose = (confirmed) => {
      // Clean up
      root.unmount();
      document.body.removeChild(container);
      resolve(confirmed);
    };

    root.render(<ConfirmDialog config={config} onClose={handleClose} />);
  });
};

/**
 * Show a destructive confirmation dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} confirmText - Confirm button text (default: "Delete")
 * @returns {Promise<boolean>}
 */
confirmDialog.destructive = (title, message, confirmText = 'Delete') => {
  return confirmDialog({
    title,
    message,
    confirmText,
    cancelText: 'Cancel',
    destructive: true
  });
};

/**
 * Show a simple yes/no confirmation
 * @param {string} message - Question to ask
 * @returns {Promise<boolean>}
 */
confirmDialog.yesNo = (message) => {
  return confirmDialog({
    title: 'Confirm',
    message,
    confirmText: 'Yes',
    cancelText: 'No',
    destructive: false
  });
};

/**
 * Shorthand for common delete confirmation
 * @param {string} itemName - Name of item being deleted
 * @returns {Promise<boolean>}
 */
confirmDialog.delete = (itemName) => {
  return confirmDialog({
    title: `Delete ${itemName}?`,
    message: `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    destructive: true
  });
};

export default confirmDialog;
