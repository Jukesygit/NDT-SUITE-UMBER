import React from 'react';
import CscanVisualizer from '../components/CscanVisualizer/CscanVisualizer';

/**
 * CscanVisualizerPage - Full-bleed page wrapper for the C-Scan tool
 * Uses negative margins and fixed height to break out of the layout container
 */
function CscanVisualizerPage() {
    return (
        <div
            className="cscan-page-wrapper"
            style={{
                // Break out of the main__container padding and max-width
                margin: 'calc(-1 * var(--spacing-8, 2rem))',
                width: 'calc(100% + 2 * var(--spacing-8, 2rem))',
                // Calculate height: viewport - header height (use CSS var)
                height: 'calc(100vh - var(--header-height, 4rem))',
                maxWidth: 'none',
            }}
        >
            <CscanVisualizer />
        </div>
    );
}

export default CscanVisualizerPage;
