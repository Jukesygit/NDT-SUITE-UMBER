/**
 * FlattenedProjectionPage — displays the 2D unwrapped vessel projection
 * as a full-width image with a figure caption.
 */

import type { FigureCounter } from './ReportDocument';

export interface FlattenedProjectionPageProps {
    /** Pre-rendered flattened view image URL (base64 data URI or signed URL) */
    flattenedView: string;
    figureCounter: FigureCounter;
}

export default function FlattenedProjectionPage({
    flattenedView,
    figureCounter,
}: FlattenedProjectionPageProps) {
    return (
        <div>
            <div className="report-section-header">Flattened Projection</div>
            <img
                className="report-full-image"
                src={flattenedView}
                alt="Flattened vessel projection"
            />
            <div className="report-figure-caption">
                Figure {figureCounter.next()} — 2D Unwrapped Vessel Projection
            </div>
        </div>
    );
}
