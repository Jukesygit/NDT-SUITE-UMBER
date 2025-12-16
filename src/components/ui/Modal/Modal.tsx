/**
 * Modal - Glassmorphic modal/dialog component
 *
 * Uses CSS variables from glassmorphic.css for consistent styling
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
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    size?: ModalSize;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    footer?: ReactNode;
    className?: string;
    showCloseButton?: boolean;
    id?: string;
}

function getMaxWidth(size: ModalSize): string {
    switch (size) {
        case 'small':
            return '400px';
        case 'medium':
            return '500px';
        case 'large':
            return '640px';
        case 'xl':
            return '800px';
        case 'full':
            return '95vw';
        default:
            return '500px';
    }
}

function useFocusTrap(isOpen: boolean, modalRef: React.RefObject<HTMLDivElement | null>) {
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;

        const modal = modalRef.current;
        const focusableElements = modal.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const previouslyFocused = document.activeElement as HTMLElement;

        if (firstElement) {
            firstElement.focus();
        }

        function handleTabKey(e: globalThis.KeyboardEvent) {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement?.focus();
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement?.focus();
                }
            }
        }

        modal.addEventListener('keydown', handleTabKey);

        return () => {
            modal.removeEventListener('keydown', handleTabKey);
            previouslyFocused?.focus();
        };
    }, [isOpen, modalRef]);
}

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

    useFocusTrap(isOpen, modalRef);

    const handleKeyDown = useCallback(
        (e: ReactKeyboardEvent) => {
            if (closeOnEscape && e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        },
        [closeOnEscape, onClose]
    );

    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (closeOnBackdropClick && e.target === e.currentTarget) {
                onClose();
            }
        },
        [closeOnBackdropClick, onClose]
    );

    useEffect(() => {
        if (!isOpen) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
            onKeyDown={handleKeyDown}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(4px)',
                }}
                onClick={handleBackdropClick}
                aria-hidden="true"
            />

            {/* Modal Panel */}
            <div
                ref={modalRef}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? `${id || 'modal'}-title` : undefined}
                className={`glass-panel relative w-full flex flex-col ${className}`}
                style={{
                    maxWidth: getMaxWidth(size),
                    maxHeight: '90vh',
                    animation: 'scaleIn 0.2s ease-out',
                }}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div
                        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
                        style={{ borderBottom: '1px solid var(--glass-border)' }}
                    >
                        {title && (
                            <h2
                                id={`${id || 'modal'}-title`}
                                className="text-lg font-semibold"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {title}
                            </h2>
                        )}
                        {showCloseButton && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-lg transition-colors hover:bg-white/10"
                                style={{ color: 'var(--text-dim)', marginRight: '-8px' }}
                                aria-label="Close modal"
                            >
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
                            </button>
                        )}
                    </div>
                )}

                {/* Body */}
                <div
                    className="flex-1 overflow-y-auto px-6 py-4 glass-scrollbar"
                    style={{ color: 'var(--text-primary)' }}
                >
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div
                        className="flex items-center justify-end gap-3 px-6 py-4 flex-shrink-0"
                        style={{ borderTop: '1px solid var(--glass-border)' }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}

export default Modal;
