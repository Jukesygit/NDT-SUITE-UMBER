/**
 * InspectionResultPage — per-annotation inspection result page for PAUT report.
 *
 * Displays scan images, heatmaps, thickness statistics, and restriction notes
 * for a single annotation shape on the vessel model.
 */

import type { FigureCounter } from './ReportDocument';
import type {
    AnnotationShapeConfig,
    AnnotationThicknessStats,
    ThicknessThresholds,
} from '../VesselModeler/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InspectionResultPageProps {
    /** The annotation shape config (cast from Record<string, unknown>) */
    annotation: AnnotationShapeConfig;
    /** Fallback label if annotation.name is empty */
    index: number;
    /** Pre-rendered heatmap image (base64 data URI) */
    annotationHeatmap?: string;
    /** Pre-rendered 3D context image (base64 data URI) */
    annotationContextImage?: string;
    /** Threshold config for color-coding WT values */
    thresholds?: ThicknessThresholds;
    /** Figure numbering counter */
    figureCounter: FigureCounter;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWtColor(value: number, thresholds?: ThicknessThresholds): string {
    if (!thresholds) return 'var(--report-safe)';
    if (thresholds.mode === 'absolute') {
        if (thresholds.redBelow != null && value <= thresholds.redBelow)
            return 'var(--report-danger)';
        if (thresholds.yellowBelow != null && value <= thresholds.yellowBelow)
            return 'var(--report-warning)';
    }
    if (thresholds.mode === 'percentage' && thresholds.nominalThickness) {
        const pct = (value / thresholds.nominalThickness) * 100;
        if (thresholds.redBelowPct != null && pct <= thresholds.redBelowPct)
            return 'var(--report-danger)';
        if (thresholds.yellowBelowPct != null && pct <= thresholds.yellowBelowPct)
            return 'var(--report-warning)';
    }
    return 'var(--report-safe)';
}

function getWtBadgeClass(value: number, thresholds?: ThicknessThresholds): string {
    const color = getWtColor(value, thresholds);
    if (color === 'var(--report-danger)') return 'report-wt-badge report-wt-badge--danger';
    if (color === 'var(--report-warning)') return 'report-wt-badge report-wt-badge--warning';
    return 'report-wt-badge report-wt-badge--safe';
}

function formatNum(value: number, decimals = 2): string {
    return value.toFixed(decimals);
}

function typeLabel(type: string): string {
    if (type === 'scan') return 'Scan Area';
    if (type === 'restriction') return 'Restriction Zone';
    return type;
}

// ---------------------------------------------------------------------------
// Companion Scan Attachment Helper
// ---------------------------------------------------------------------------

function getCompanionScanAttachment(
    annotation: AnnotationShapeConfig
): { storagePath: string; caption?: string } | undefined {
    if (!annotation.attachments?.length) return undefined;
    return annotation.attachments.find((a) => a.type === 'scan-capture');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureInfo({ annotation }: { annotation: AnnotationShapeConfig }) {
    return (
        <table className="report-table report-table--pairs" style={{ marginBottom: 12 }}>
            <tbody>
                <tr>
                    <td>Name</td>
                    <td>{annotation.name}</td>
                    <td>Type</td>
                    <td>{typeLabel(annotation.type)}</td>
                </tr>
                <tr>
                    <td>Position</td>
                    <td>
                        {formatNum(annotation.pos, 0)} mm axial, {formatNum(annotation.angle, 1)}°
                    </td>
                    <td>Size</td>
                    <td>
                        {formatNum(annotation.width, 0)} × {formatNum(annotation.height, 0)} mm
                    </td>
                </tr>
            </tbody>
        </table>
    );
}

function ThicknessStatsBox({
    stats,
    thresholds,
}: {
    stats: AnnotationThicknessStats;
    thresholds?: ThicknessThresholds;
}) {
    return (
        <div className="report-stats-box no-break">
            <div className="report-stats-box__item report-stats-box__item--highlight">
                <div className="report-stats-box__value">
                    <span className={getWtBadgeClass(stats.min, thresholds)}>
                        {formatNum(stats.min)}
                    </span>
                </div>
                <div className="report-stats-box__label">Min WT (mm)</div>
            </div>
            <div className="report-stats-box__item">
                <div className="report-stats-box__value">{formatNum(stats.max)}</div>
                <div className="report-stats-box__label">Max WT (mm)</div>
            </div>
            <div className="report-stats-box__item">
                <div className="report-stats-box__value">{formatNum(stats.avg)}</div>
                <div className="report-stats-box__label">Avg WT (mm)</div>
            </div>
            <div className="report-stats-box__item">
                <div className="report-stats-box__value">{formatNum(stats.stdDev)}</div>
                <div className="report-stats-box__label">Std Dev</div>
            </div>
            <div className="report-stats-box__item">
                <div className="report-stats-box__value">{stats.sampleCount}</div>
                <div className="report-stats-box__label">Samples</div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InspectionResultPage({
    annotation,
    index,
    annotationHeatmap,
    annotationContextImage,
    thresholds,
    figureCounter,
}: InspectionResultPageProps) {
    const label = annotation.name || `Area ${index + 1}`;
    const stats = annotation.thicknessStats;
    const companionAttachment = getCompanionScanAttachment(annotation);

    return (
        <div className="report-result-page">
            {/* Section header */}
            <div className="report-section-header">Inspection Results — {label}</div>

            {/* Feature info */}
            <FeatureInfo annotation={annotation} />

            {/* Images grid: heatmap + 3D context (2-up) */}
            {(annotationHeatmap || annotationContextImage) && (
                <div className="report-result-images">
                    {annotationHeatmap && (
                        <div className="report-result-image no-break">
                            <img src={annotationHeatmap} alt={`Heatmap — ${label}`} />
                            <div className="report-result-image__caption">
                                Figure {figureCounter.next()} — Thickness Heatmap
                            </div>
                        </div>
                    )}
                    {annotationContextImage && (
                        <div className="report-result-image no-break">
                            <img src={annotationContextImage} alt={`3D context — ${label}`} />
                            <div className="report-result-image__caption">
                                Figure {figureCounter.next()} — 3D Context View
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Companion scan image (full-width) */}
            {companionAttachment && (
                <div className="report-result-image no-break" style={{ marginBottom: 16 }}>
                    <img
                        src={companionAttachment.storagePath}
                        alt={companionAttachment.caption ?? `Companion scan — ${label}`}
                    />
                    <div className="report-result-image__caption">
                        Figure {figureCounter.next()} —{' '}
                        {companionAttachment.caption ?? 'Companion Scan Image'}
                    </div>
                </div>
            )}

            {/* Thickness statistics */}
            {stats && <ThicknessStatsBox stats={stats} thresholds={thresholds} />}

            {/* Restriction notes */}
            {annotation.restrictionNotes && (
                <div className="report-restriction no-break">
                    <div className="report-restriction__label">Restriction Notes</div>
                    <div>{annotation.restrictionNotes}</div>
                </div>
            )}
        </div>
    );
}
