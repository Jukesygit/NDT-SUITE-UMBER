/**
 * Toast Notification Utility
 *
 * A minimal, DOM-based toast notification system that doesn't block the UI.
 * Uses Tailwind classes for styling to match the app's design system.
 */

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastOptions {
    type: ToastType;
    message: string;
    duration?: number;  // Auto-dismiss after this many ms (default: 5000)
    title?: string;     // Optional title
}

// Toast container ID
const TOAST_CONTAINER_ID = 'ndt-toast-container';

// Toast type configurations
const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: {
        bg: 'bg-emerald-900/90',
        border: 'border-emerald-500/50',
        icon: `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>`
    },
    warning: {
        bg: 'bg-amber-900/90',
        border: 'border-amber-500/50',
        icon: `<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>`
    },
    error: {
        bg: 'bg-red-900/90',
        border: 'border-red-500/50',
        icon: `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>`
    },
    info: {
        bg: 'bg-blue-900/90',
        border: 'border-blue-500/50',
        icon: `<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>`
    }
};

/**
 * Get or create the toast container
 */
function getToastContainer(): HTMLElement {
    let container = document.getElementById(TOAST_CONTAINER_ID);

    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none';
        container.style.maxWidth = '400px';
        document.body.appendChild(container);
    }

    return container;
}

/**
 * Show a toast notification
 */
export function showToast(options: ToastOptions): void {
    const { type, message, duration = 5000, title } = options;
    const styles = TOAST_STYLES[type];

    const container = getToastContainer();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `
        ${styles.bg} ${styles.border}
        border backdrop-blur-sm rounded-lg shadow-lg
        p-4 flex items-start gap-3
        pointer-events-auto
        transform translate-x-full opacity-0
        transition-all duration-300 ease-out
    `.replace(/\s+/g, ' ').trim();

    // Build toast content
    const titleHtml = title ? `<div class="font-semibold text-white text-sm">${escapeHtml(title)}</div>` : '';
    toast.innerHTML = `
        <div class="flex-shrink-0 mt-0.5">${styles.icon}</div>
        <div class="flex-1 min-w-0">
            ${titleHtml}
            <div class="text-gray-200 text-sm">${escapeHtml(message)}</div>
        </div>
        <button class="flex-shrink-0 text-gray-400 hover:text-white transition-colors" aria-label="Dismiss">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
    `;

    // Add dismiss handler
    const dismissBtn = toast.querySelector('button');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => dismissToast(toast));
    }

    // Add to container
    container.appendChild(toast);

    // Trigger enter animation
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
        toast.classList.add('translate-x-0', 'opacity-100');
    });

    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
    }
}

/**
 * Dismiss a toast with animation
 */
function dismissToast(toast: HTMLElement): void {
    // Exit animation
    toast.classList.remove('translate-x-0', 'opacity-100');
    toast.classList.add('translate-x-full', 'opacity-0');

    // Remove after animation
    setTimeout(() => {
        toast.remove();

        // Clean up container if empty
        const container = document.getElementById(TOAST_CONTAINER_ID);
        if (container && container.children.length === 0) {
            container.remove();
        }
    }, 300);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Convenience methods for common toast types
 */
export const toast = {
    success: (message: string, title?: string) => showToast({ type: 'success', message, title }),
    warning: (message: string, title?: string) => showToast({ type: 'warning', message, title }),
    error: (message: string, title?: string) => showToast({ type: 'error', message, title }),
    info: (message: string, title?: string) => showToast({ type: 'info', message, title }),
};

export default showToast;
