/**
 * Global Style Enforcer
 * Ensures all dynamically generated content inherits the design system
 */

class GlobalStyleEnforcer {
    constructor() {
        this.observer = null;
        this.styleSheet = null;
        this.init();
    }

    init() {
        try {
            // Inject critical override styles
            this.injectOverrideStyles();

            // Start observing DOM changes
            this.startObserving();

            // Apply initial styles
            this.enforceStyles();
        } catch (error) {
            console.warn('GlobalStyleEnforcer initialization error:', error);
            // Don't let styling errors break the app
        }
    }

    injectOverrideStyles() {
        // Create a style element with important overrides
        const styleEl = document.createElement('style');
        styleEl.id = 'global-style-enforcer';
        styleEl.textContent = `
            /* Force all elements to inherit our design system */

            /* Reset inline styles on common elements */
            .tool-container button:not(.custom-styled) {
                background: var(--glass-bg-secondary) !important;
                color: var(--text-primary) !important;
                border: 1px solid var(--glass-border) !important;
                padding: var(--space-3) var(--space-5) !important;
                border-radius: var(--radius-lg) !important;
                font-size: var(--text-sm) !important;
                font-weight: var(--font-medium) !important;
                transition: all var(--transition-base) !important;
                backdrop-filter: blur(10px) !important;
                -webkit-backdrop-filter: blur(10px) !important;
                cursor: pointer !important;
                pointer-events: auto !important;
            }

            .tool-container button:hover:not(.custom-styled) {
                background: var(--glass-bg-hover) !important;
                border-color: var(--glass-border-hover) !important;
                transform: translateY(-1px) !important;
            }

            /* Ensure all buttons and interactive elements can receive clicks */
            button, .btn, [role="button"], a {
                cursor: pointer !important;
                pointer-events: auto !important;
            }

            button:disabled, .btn:disabled, [role="button"][disabled] {
                cursor: not-allowed !important;
                pointer-events: none !important;
            }

            /* Primary buttons */
            .tool-container .btn-primary:not(.custom-styled),
            .tool-container button[class*="primary"]:not(.custom-styled) {
                background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600)) !important;
                color: white !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                box-shadow: 0 4px 12px rgba(9, 103, 210, 0.3) !important;
            }

            .tool-container .btn-primary:hover:not(.custom-styled),
            .tool-container button[class*="primary"]:hover:not(.custom-styled) {
                background: linear-gradient(135deg, var(--color-primary-400), var(--color-primary-500)) !important;
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 20px rgba(9, 103, 210, 0.4) !important;
            }

            /* Glass panels */
            .tool-container .glass-panel {
                background: var(--glass-bg-primary) !important;
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
                border: 1px solid var(--glass-border) !important;
            }

            /* Cards */
            .tool-container [class*="rounded-"][class*="bg-"]:not(.custom-styled) {
                background: var(--glass-bg) !important;
                backdrop-filter: blur(20px) !important;
                -webkit-backdrop-filter: blur(20px) !important;
                border: 1px solid var(--glass-border) !important;
                box-shadow: var(--shadow-glass) !important;
            }

            /* Input fields */
            .tool-container input:not([type="checkbox"]):not([type="radio"]):not(.custom-styled),
            .tool-container textarea:not(.custom-styled),
            .tool-container select:not(.custom-styled) {
                background: var(--glass-bg) !important;
                color: var(--text-primary) !important;
                border: 1px solid var(--glass-border) !important;
                padding: var(--space-3) var(--space-4) !important;
                border-radius: var(--radius-lg) !important;
                font-size: var(--text-base) !important;
                transition: all var(--transition-base) !important;
            }

            .tool-container input:focus:not(.custom-styled),
            .tool-container textarea:focus:not(.custom-styled),
            .tool-container select:focus:not(.custom-styled) {
                border-color: var(--color-primary-500) !important;
                background: var(--glass-bg-active) !important;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                outline: none !important;
            }

            /* Text hierarchy */
            .tool-container h1,
            .tool-container h2,
            .tool-container h3,
            .tool-container h4,
            .tool-container h5,
            .tool-container h6 {
                color: var(--text-primary) !important;
                font-weight: var(--font-semibold) !important;
                line-height: var(--leading-tight) !important;
            }

            .tool-container p,
            .tool-container span:not(.custom-styled),
            .tool-container div:not(.custom-styled) {
                color: var(--text-secondary);
            }

            /* Stat badges */
            .tool-container .stat-badge {
                background: linear-gradient(135deg,
                    rgba(255,255,255,0.15) 0%,
                    rgba(255,255,255,0.08) 100%),
                    rgba(30, 30, 40, 0.6) !important;
                border: 1.5px solid rgba(255, 255, 255, 0.2) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                color: var(--text-secondary) !important;
            }

            /* Remove conflicting Tailwind utilities that break our design */
            .tool-container [class*="bg-gray-"],
            .tool-container [class*="bg-slate-"],
            .tool-container [class*="bg-white"],
            .tool-container [class*="bg-black"] {
                background: var(--glass-bg) !important;
            }

            /* Scrollbar styling */
            .tool-container ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }

            .tool-container ::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
            }

            .tool-container ::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
            }

            .tool-container ::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        `;

        // Only add if not already present
        if (!document.getElementById('global-style-enforcer')) {
            document.head.appendChild(styleEl);
        }
    }

    startObserving() {
        try {
            // Create mutation observer to watch for DOM changes
            this.observer = new MutationObserver((mutations) => {
                // Debounce to avoid excessive processing
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    try {
                        this.enforceStyles();
                    } catch (e) {
                        console.warn('Error enforcing styles:', e);
                    }
                }, 300);
            });

            // Start observing when DOM is ready
            if (document.body) {
                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class']
                });
            }
        } catch (error) {
            console.warn('Error starting style observer:', error);
        }
    }

    enforceStyles() {
        // Find all tool containers
        const containers = document.querySelectorAll('.tool-container');

        containers.forEach(container => {
            // Process buttons
            this.processButtons(container);

            // Process inputs
            this.processInputs(container);

            // Process cards
            this.processCards(container);

            // Process text elements
            this.processText(container);

            // Process badges
            this.processBadges(container);
        });
    }

    processButtons(container) {
        const buttons = container.querySelectorAll('button:not(.styled)');
        buttons.forEach(btn => {
            btn.classList.add('styled');

            // Determine button type
            const text = btn.textContent.toLowerCase();
            const classes = btn.className;

            if (!btn.classList.contains('btn')) {
                btn.classList.add('btn');

                if (classes.includes('primary') ||
                    text.includes('add') ||
                    text.includes('create') ||
                    text.includes('save') ||
                    text.includes('new')) {
                    btn.classList.add('btn-primary');
                } else if (classes.includes('danger') ||
                          text.includes('delete') ||
                          text.includes('remove')) {
                    btn.classList.add('btn-danger');
                } else if (classes.includes('success') ||
                          text.includes('confirm')) {
                    btn.classList.add('btn-success');
                } else {
                    btn.classList.add('btn-secondary');
                }
            }

            // Add size classes
            if (classes.includes('text-xs') || classes.includes('sm')) {
                btn.classList.add('btn-sm');
            } else if (classes.includes('text-lg') || classes.includes('lg')) {
                btn.classList.add('btn-lg');
            }
        });
    }

    processInputs(container) {
        const inputs = container.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not(.styled), textarea:not(.styled), select:not(.styled)');
        inputs.forEach(input => {
            input.classList.add('styled', 'input');
        });
    }

    processCards(container) {
        // Find elements that look like cards
        const cards = container.querySelectorAll('[class*="rounded-"][class*="p-"]:not(.styled)');
        cards.forEach(card => {
            if (!card.classList.contains('btn') &&
                !card.classList.contains('badge') &&
                !card.classList.contains('input')) {
                card.classList.add('styled', 'card');
            }
        });
    }

    processText(container) {
        // Ensure headings have proper colors
        const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(h => {
            if (!h.classList.contains('text-primary')) {
                h.classList.add('text-primary');
            }
        });
    }

    processBadges(container) {
        const badges = container.querySelectorAll('.badge:not(.styled), .stat-badge:not(.styled)');
        badges.forEach(badge => {
            badge.classList.add('styled');

            // Add glass effect classes
            if (!badge.classList.contains('glass-badge')) {
                badge.classList.add('glass-badge');
            }
        });
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }

        const styleEl = document.getElementById('global-style-enforcer');
        if (styleEl) {
            styleEl.remove();
        }
    }
}

// Create singleton instance
let instance = null;

export function initGlobalStyleEnforcer() {
    if (!instance) {
        instance = new GlobalStyleEnforcer();
    }
    return instance;
}

export function destroyGlobalStyleEnforcer() {
    if (instance) {
        instance.destroy();
        instance = null;
    }
}

// Don't auto-initialize - let App.jsx control when this runs
// This prevents interference with app initialization

export default { initGlobalStyleEnforcer, destroyGlobalStyleEnforcer };