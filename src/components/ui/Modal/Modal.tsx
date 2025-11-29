/**
 * Modal - Reusable modal/dialog component with accessibility features
 *
 * Features:
 * - Size variants (small, medium, large, full)
 * - Close on backdrop click
 * - Close on Escape key
 * - Focus trap for accessibility
 * - Portal rendering (renders at document.body)
 * - Animation support
 * - Glass-morphic styling
 */

import {
    ReactNode,
    useEffect,
    useRef,
    useCallback,
    KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

export type ModalSize = 'small' | 'medium' | 'large' | 'xl' | 'full';

export interface ModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Callback when modal should close */
    onClose: () => void;
    /** Modal title (optional - if provided, renders header) */
    title?: string;
    /** Modal content */
    children: ReactNode;
    /** Size variant */
    size?: ModalSize;
    /** Whether clicking backdrop closes modal */
    closeOnBackdropClick?: boolean;
    /** Whether pressing Escape closes modal */
    closeOnEscape?: boolean;
    /** Footer content (buttons, etc.) */
    footer?: ReactNode;
    /** Additional class name for the modal content */
    className?: string;
    /** Whether to show the close button in header */
    showCloseButton?: boolean;
    /** ID for accessibility */
    id?: string;
}

/**
 * Get max-width class based on size
 */
function getSizeStyles(size: ModalSize): string {
    switch (size) {
        case 'small':
            return 'max-w-md'; // 28rem / 448px
        case 'medium':
            return 'max-w-lg'; // 32rem / 512px
        case 'large':
            return 'max-w-2xl'; // 42rem / 672px
        case 'xl':
            return 'max-w-4xl'; // 56rem / 896px
        case 'full':
            return 'max-w-[95vw]';
        default:
            return 'max-w-lg';
    }
}

/**
 * Focus trap hook - keeps focus within modal
 */
function useFocusTrap(isOpen: boolean, modalRef: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;

        const modal = modalRef.current;
        const focusableElements = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Store previously focused element
        const previouslyFocused = document.activeElement as HTMLElement;

        // Focus first element
        if (firstElement) {
            firstElement.focus();
        }

        function handleTabKey(e: globalThis.KeyboardEvent) {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement?.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement?.focus();
                }
            }
        }

        modal.addEventListener('keydown', handleTabKey);

        return () => {
            modal.removeEventListener('keydown', handleTabKey);
            // Restore focus when modal closes
            previouslyFocused?.focus();
        };
    }, [isOpen, modalRef]);
}

/**
 * Close button icon
 */
function CloseIcon() {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        >
            <path d="M15 5L5 15M5 5L15 15" />
        </svg>
    );
}

/**
 * Modal component
 *
 * @example
 * // Basic usage
 * <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm Action">
 *     <p>Are you sure you want to proceed?</p>
 * </Modal>
 *
 * @example
 * // With footer
 * <Modal
 *     isOpen={isOpen}
 *     onClose={handleClose}
 *     title="Edit Profile"
 *     size="large"
 *     footer={
 *         <>
 *             <button onClick={handleClose}>Cancel</button>
 *             <button onClick={handleSave}>Save</button>
 *         </>
 *     }
 * >
 *     <ProfileForm />
 * </Modal>
 */
export function Modal({
    isOpen,
    onClose,
    title,
    children,
    size = 'medium',
    closeOnBackdropClick = true,
    closeOnEscape = true,
    footer,
    className = '',
    showCloseButton = true,
    id,
}: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    // Focus trap
    useFocusTrap(isOpen, modalRef);

    // Handle Escape key
    const handleKeyDown = useCallback(
        (e: ReactKeyboardEvent) => {
            if (closeOnEscape && e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        },
        [closeOnEscape, onClose]
    );

    // Handle backdrop click
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (closeOnBackdropClick && e.target === e.currentTarget) {
                onClose();
            }
        },
        [closeOnBackdropClick, onClose]
    );

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (!isOpen) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // Don't render if not open
    if (!isOpen) return null;

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
            onKeyDown={handleKeyDown}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 backdrop-blur-sm"
                style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
                onClick={handleBackdropClick}
                aria-hidden="true"
            />

            {/* Modal */}
            <div
                ref={modalRef}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? `${id || 'modal'}-title` : undefined}
                className={`
                    relative w-full ${getSizeStyles(size)}
                    bg-slate-900/95 backdrop-blur-md
                    border border-white/10
                    rounded-xl shadow-2xl
                    max-h-[90vh] flex flex-col
                    ${className}
                `}
                style={{ animation: 'scaleIn 0.2s ease-out' }}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        {title && (
                            <h2
                                id={`${id || 'modal'}-title`}
                                className="text-lg font-semibold text-white"
                            >
                                {title}
                            </h2>
                        )}
                        {showCloseButton && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="
                                    p-2 rounded-lg
                                    text-white/60 hover:text-white
                                    hover:bg-white/10
                                    transition-colors
                                    -mr-2
                                "
                                aria-label="Close modal"
                            >
                                <CloseIcon />
                            </button>
                        )}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    // Render via portal to body
    return createPortal(modalContent, document.body);
}

export default Modal;
