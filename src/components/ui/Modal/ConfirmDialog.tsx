/**
 * ConfirmDialog - Pre-styled confirmation modal for dangerous actions
 *
 * Features:
 * - Destructive action styling (red confirm button)
 * - Loading state support
 * - Customizable confirm/cancel text
 * - Warning icon
 */

import { ReactNode } from 'react';
import { Modal, ModalSize } from './Modal';
import { RandomMatrixSpinner } from '../../MatrixSpinners';

export interface ConfirmDialogProps {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Callback when dialog should close */
    onClose: () => void;
    /** Callback when confirmed */
    onConfirm: () => void;
    /** Dialog title */
    title: string;
    /** Message or content to display */
    message: ReactNode;
    /** Confirm button text */
    confirmText?: string;
    /** Cancel button text */
    cancelText?: string;
    /** Whether confirm action is in progress */
    isLoading?: boolean;
    /** Variant - affects confirm button styling */
    variant?: 'danger' | 'warning' | 'info';
    /** Size of the dialog */
    size?: ModalSize;
}

/**
 * Warning icon for destructive actions
 */
function WarningIcon({ variant }: { variant: 'danger' | 'warning' | 'info' }) {
    const colors = {
        danger: 'text-red-500',
        warning: 'text-amber-500',
        info: 'text-blue-500',
    };

    return (
        <svg
            className={`w-12 h-12 ${colors[variant]} mb-4`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            {variant === 'info' ? (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
            ) : (
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
            )}
        </svg>
    );
}

/**
 * Spinner for loading state - uses Matrix logo spinner
 */
function Spinner() {
    return <RandomMatrixSpinner size={16} />;
}

/**
 * ConfirmDialog component
 *
 * @example
 * // Basic delete confirmation
 * <ConfirmDialog
 *     isOpen={showDeleteConfirm}
 *     onClose={() => setShowDeleteConfirm(false)}
 *     onConfirm={handleDelete}
 *     title="Delete User"
 *     message="Are you sure you want to delete this user? This action cannot be undone."
 *     confirmText="Delete"
 *     variant="danger"
 * />
 *
 * @example
 * // With loading state
 * <ConfirmDialog
 *     isOpen={showConfirm}
 *     onClose={handleClose}
 *     onConfirm={handleConfirm}
 *     title="Confirm Action"
 *     message="This will apply the changes."
 *     isLoading={isSubmitting}
 *     variant="warning"
 * />
 */
export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isLoading = false,
    variant = 'danger',
    size = 'small',
}: ConfirmDialogProps) {
    const confirmButtonStyles = {
        danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
        info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size={size}
            showCloseButton={false}
            closeOnBackdropClick={!isLoading}
            closeOnEscape={!isLoading}
        >
            <div className="text-center py-2">
                <div className="flex justify-center">
                    <WarningIcon variant={variant} />
                </div>

                <h3 className="text-lg font-semibold text-white mb-2">
                    {title}
                </h3>

                <div className="text-white/70 text-sm mb-6">
                    {message}
                </div>

                <div className="flex gap-3 justify-center">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="
                            px-4 py-2 rounded-lg
                            bg-white/10 hover:bg-white/20
                            text-white font-medium text-sm
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                        "
                    >
                        {cancelText}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`
                            px-4 py-2 rounded-lg
                            ${confirmButtonStyles[variant]}
                            text-white font-medium text-sm
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900
                            flex items-center gap-2
                        `}
                    >
                        {isLoading && <Spinner />}
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default ConfirmDialog;
