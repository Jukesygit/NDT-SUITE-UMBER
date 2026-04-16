/**
 * VesselOverviewPage — displays pre-rendered 3D views of the vessel
 * in a 2-column grid (typically 6 views: front, back, top, bottom, left, right).
 */

import type { FigureCounter } from './ReportDocument';

export interface VesselOverviewPageProps {
    /** Array of pre-rendered 3D view image URLs (base64 data URIs or signed URLs) */
    overviewRenders: string[];
    figureCounter: FigureCounter;
}

const VIEW_LABELS = [
    'Front View',
    'Back View',
    'Top View',
    'Bottom View',
    'Left View',
    'Right View',
];

export default function VesselOverviewPage({
    overviewRenders,
    figureCounter,
}: VesselOverviewPageProps) {
    return (
        <div>
            <div className="report-section-header">3D Vessel Overview</div>
            <div className="report-image-grid">
                {overviewRenders.map((url, idx) => {
                    const label = VIEW_LABELS[idx] ?? `View ${idx + 1}`;
                    return (
                        <div key={idx} className="report-image-card">
                            <img src={url} alt={label} />
                            <div className="report-image-card__label">
                                Figure {figureCounter.next()} — {label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
