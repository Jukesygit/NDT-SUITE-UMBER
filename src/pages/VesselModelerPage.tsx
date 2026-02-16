import { lazy, Suspense } from 'react';
import { PageSpinner } from '../components/ui/LoadingSpinner';

const VesselModeler = lazy(() => import('../components/VesselModeler/VesselModeler'));

/**
 * VesselModelerPage - Full-bleed page wrapper for the 3D Vessel Modeler tool
 * Uses .tool-container class to trigger full-width layout (removes padding and max-width constraints)
 */
function VesselModelerPage() {
    return (
        <div
            className="tool-container vessel-modeler-page-wrapper"
            style={{ height: 'calc(100vh - var(--header-height, 4rem))' }}
        >
            <Suspense fallback={<PageSpinner message="Loading Vessel Modeler..." />}>
                <VesselModeler />
            </Suspense>
        </div>
    );
}

export default VesselModelerPage;
