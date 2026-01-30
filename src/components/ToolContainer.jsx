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
    // IMPORTANT: This function should be MINIMAL and only fix specific issues.
    // Tools should handle their own styling. This is only for legacy compatibility.
    const applyGlobalStyles = (container) => {
        if (!container) return;

        // Classes that indicate an element has its own styling - skip these
        const toolStyledClasses = [
            'action-btn', 'mode-btn', 'upload-label', 'control-panel', 'panel-header',
            'panel-content', 'arrow-icon', 'layer-item', 'scan-card', 'scan-thumbnail',
            'visualizer-', 'calculator-', 'tool-'
        ];

        // Check if element or its parent has tool-specific styling
        const hasToolStyling = (el) => {
            const className = el.className || '';
            if (typeof className !== 'string') return false;
            return toolStyledClasses.some(cls => className.includes(cls)) ||
                   el.closest('.control-panel, .panel-content, [data-tool-styled]');
        };

        // Only apply glass effect to explicitly marked glass panels
        container.querySelectorAll('.glass-panel').forEach(el => {
            if (!el.classList.contains('styled')) {
                el.classList.add('styled');
                el.style.backdropFilter = 'blur(16px)';
                el.style.WebkitBackdropFilter = 'blur(16px)';
            }
        });

        // Only style buttons that explicitly opt-in with data-apply-global-style
        // or are in legacy tool areas without their own styling
        container.querySelectorAll('button[data-apply-global-style]').forEach(button => {
            if (!button.classList.contains('btn')) {
                button.classList.add('btn', 'btn-secondary');
            }
        });

        // Ensure interactive elements are clickable (safe, doesn't change appearance)
        container.querySelectorAll('button, a, [role="button"]').forEach(el => {
            el.style.cursor = 'pointer';
            el.style.pointerEvents = 'auto';
        });

        // Only apply stat-badge styling to explicitly marked elements
        container.querySelectorAll('.stat-badge').forEach(badge => {
            if (!badge.classList.contains('styled')) {
                badge.classList.add('styled');
                badge.style.backdropFilter = 'blur(12px)';
                badge.style.WebkitBackdropFilter = 'blur(12px)';
            }
        });
    };

    return (
        <div
            ref={containerRef}
            className={`tool-container w-full relative ${className}`}
            style={{
                height: 'calc(100vh - 140px)', // Use viewport units, account for header + banner
                minHeight: '500px'
            }}
        />
    );
}

export default ToolContainer;