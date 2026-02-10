import { lazy, Suspense } from 'react';
import { PageSpinner } from '../components/ui/LoadingSpinner';

const VesselModeler = lazy(() => import('../components/VesselModeler/VesselModeler'));

/**
 * VesselModelerPage - Full-bleed page wrapper for the 3D Vessel Modeler tool
 * Uses negative margins to break out of the layout container (same pattern as CscanVisualizerPage)
 */
function VesselModelerPage() {
    return (
        <div
            className="vessel-modeler-page-wrapper"
            style={{
                margin: 'calc(-1 * var(--spacing-8, 2rem))',
                width: 'calc(100% + 2 * var(--spacing-8, 2rem))',
                height: 'calc(100vh - var(--header-height, 4rem))',
                maxWidth: 'none',
            }}
        >
            <Suspense fallback={<PageSpinner message="Loading Vessel Modeler..." />}>
                <VesselModeler />
            </Suspense>
        </div>
    );
}

export default VesselModelerPage;
