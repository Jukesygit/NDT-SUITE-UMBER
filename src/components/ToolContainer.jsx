import React, { useEffect, useRef } from 'react';

/**
 * ToolContainer - Wrapper component for legacy JS tools
 * Ensures global styles are properly applied to dynamically generated content
 */
function ToolContainer({ toolModule, className = '', ...props }) {
    const containerRef = useRef(null);
    const cleanupRef = useRef(null);

    useEffect(() => {
        if (containerRef.current && toolModule) {
            // Initialize the tool
            if (toolModule.init) {
                toolModule.init(containerRef.current, props);

                // Store cleanup function
                cleanupRef.current = () => {
                    if (toolModule.destroy) {
                        toolModule.destroy(containerRef.current);
                    }
                };
            }

            // Create a MutationObserver to ensure styles are applied to dynamic content
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        // Apply global styles to new elements
                        applyGlobalStyles(containerRef.current);
                    }
                });
            });

            // Start observing
            observer.observe(containerRef.current, {
                childList: true,
                subtree: true
            });

            // Initial style application
            applyGlobalStyles(containerRef.current);

            return () => {
                observer.disconnect();
                if (cleanupRef.current) {
                    cleanupRef.current();
                }
            };
        }
    }, [toolModule, props]);

    // Apply global styles to dynamically generated content
    const applyGlobalStyles = (container) => {
        if (!container) return;

        // Update glass panels
        container.querySelectorAll('.glass-panel').forEach(el => {
            if (!el.classList.contains('styled')) {
                el.classList.add('styled');
                // Ensure proper glass effect
                el.style.backdropFilter = 'blur(16px)';
                el.style.WebkitBackdropFilter = 'blur(16px)';
            }
        });

        // Update all buttons to use new button classes
        container.querySelectorAll('button').forEach(button => {
            // Ensure all buttons can be clicked
            button.style.cursor = 'pointer';
            button.style.pointerEvents = 'auto';

            if (!button.classList.contains('btn')) {
                const text = button.textContent.toLowerCase();
                const isPrimary = button.classList.contains('btn-primary') ||
                                 text.includes('add') ||
                                 text.includes('create') ||
                                 text.includes('new') ||
                                 text.includes('save');

                const isDanger = button.classList.contains('btn-danger') ||
                                text.includes('delete') ||
                                text.includes('remove');

                // Remove old classes
                button.classList.remove('btn-primary', 'btn-secondary', 'btn-danger');

                // Add new classes
                button.classList.add('btn');

                if (isDanger) {
                    button.classList.add('btn-danger');
                } else if (isPrimary) {
                    button.classList.add('btn-primary');
                } else {
                    button.classList.add('btn-secondary');
                }

                // Add size class if needed
                if (button.classList.contains('text-xs')) {
                    button.classList.add('btn-sm');
                }
            }
        });

        // Update input fields
        container.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="password"], textarea, select').forEach(input => {
            if (!input.classList.contains('input')) {
                input.classList.add('input');
                // Remove inline styles that conflict
                input.style.removeProperty('background-color');
                input.style.removeProperty('border');
                input.style.removeProperty('color');
            }
        });

        // Update cards
        container.querySelectorAll('[class*="rounded-"][class*="bg-"]').forEach(card => {
            if (!card.classList.contains('card') && !card.classList.contains('glass-panel')) {
                card.classList.add('card');
                // Remove conflicting inline styles
                card.style.removeProperty('background');
                card.style.removeProperty('background-color');
                card.style.removeProperty('border');
            }
        });

        // Update badges
        container.querySelectorAll('.badge, [class*="px-"][class*="py-"][class*="rounded-full"]').forEach(badge => {
            if (!badge.classList.contains('glass-badge')) {
                badge.classList.add('glass-badge');
                // Determine badge type
                const text = badge.textContent.toLowerCase();
                if (text.includes('success') || text.includes('complete')) {
                    badge.classList.add('badge-green');
                } else if (text.includes('warning') || text.includes('pending')) {
                    badge.classList.add('badge-yellow');
                } else if (text.includes('error') || text.includes('fail')) {
                    badge.classList.add('badge-red');
                } else if (text.includes('info')) {
                    badge.classList.add('badge-blue');
                }
            }
        });

        // Fix text colors
        container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
            heading.classList.add('text-primary');
        });

        // Ensure all interactive elements can be clicked
        container.querySelectorAll('a, [role="button"], [onclick]').forEach(el => {
            el.style.cursor = 'pointer';
            el.style.pointerEvents = 'auto';
        });

        container.querySelectorAll('p, span, div').forEach(el => {
            // Only update if it doesn't have a color class
            if (!el.className.includes('text-')) {
                el.classList.add('text-secondary');
            }
        });

        // Update stat badges
        container.querySelectorAll('.stat-badge').forEach(badge => {
            if (!badge.classList.contains('styled')) {
                badge.classList.add('styled');
                // Ensure proper glass effect
                badge.style.backdropFilter = 'blur(12px)';
                badge.style.WebkitBackdropFilter = 'blur(12px)';
            }
        });

        // Apply hover effects to interactive elements
        container.querySelectorAll('button, a, [role="button"]').forEach(el => {
            if (!el.classList.contains('hover-styled')) {
                el.classList.add('hover-styled');
                el.style.transition = 'all var(--transition-base)';
            }
        });
    };

    return (
        <div
            ref={containerRef}
            className={`tool-container w-full h-full relative ${className}`}
            style={{ minHeight: '100vh' }}
        />
    );
}

export default ToolContainer;