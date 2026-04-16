/**
 * DashboardPage — Executive dashboard (Page 2) of the PAUT inspection report.
 *
 * Shows at-a-glance stat cards, min WT location reference,
 * inspection results summary, and sign-off section.
 */

import type { ProjectVessel, ScanLogEntry, SignoffDetails } from '../../types/inspection-project';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardPageProps {
    vessel: ProjectVessel;
    scanLogEntries: ScanLogEntry[];
    annotations: Record<string, unknown>[];
    thresholds?: ThresholdConfig;
}

interface ThresholdConfig {
    mode?: 'absolute' | 'percentage';
    redBelow?: number;
    yellowBelow?: number;
    redBelowPct?: number;
    yellowBelowPct?: number;
    nominalThickness?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getThresholdClass(value: number, thresholds?: ThresholdConfig): string {
    if (!thresholds) return 'report-stat-card--neutral';
    if (thresholds.mode === 'absolute') {
        if (thresholds.redBelow != null && value <= thresholds.redBelow)
            return 'report-stat-card--danger';
        if (thresholds.yellowBelow != null && value <= thresholds.yellowBelow)
            return 'report-stat-card--warning';
        return 'report-stat-card--safe';
    }
    if (thresholds.mode === 'percentage' && thresholds.nominalThickness) {
        const pct = (value / thresholds.nominalThickness) * 100;
        if (thresholds.redBelowPct != null && pct <= thresholds.redBelowPct)
            return 'report-stat-card--danger';
        if (thresholds.yellowBelowPct != null && pct <= thresholds.yellowBelowPct)
            return 'report-stat-card--warning';
        return 'report-stat-card--safe';
    }
    return 'report-stat-card--neutral';
}

function computeStats(
    scanLogEntries: ScanLogEntry[],
    annotations: Record<string, unknown>[]
) {
    const scansPerformed = scanLogEntries.length;

    // Global minimum wall thickness
    const wtValues = scanLogEntries
        .map((e) => e.min_wt)
        .filter((v): v is number => v != null);
    const globalMinWt = wtValues.length > 0 ? Math.min(...wtValues) : null;

    // Which scan file had the lowest reading
    let minWtFilename: string | null = null;
    if (globalMinWt != null) {
        const entry = scanLogEntries.find((e) => e.min_wt === globalMinWt);
        minWtFilename = entry?.filename ?? null;
    }

    // Findings: annotations with includeInReport === true OR type === 'scan'
    const findings = annotations.filter(
        (a) => a.includeInReport === true || a.type === 'scan'
    ).length;

    // Restrictions: annotations that have a non-empty restrictionNotes
    const restrictions = annotations.filter((a) => {
        const notes = a.restrictionNotes;
        return typeof notes === 'string' && notes.trim().length > 0;
    }).length;

    return { scansPerformed, globalMinWt, minWtFilename, findings, restrictions };
}

// ---------------------------------------------------------------------------
// Sign-off sub-component
// ---------------------------------------------------------------------------

function SignoffColumn({ title, person }: { title: string; person?: {
    name?: string;
    qualification?: string;
    position?: string;
    date?: string;
} }) {
    return (
        <div className="report-signoff__col">
            <div className="report-signoff__title">{title}</div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Name:</span>
                <span>{person?.name || '—'}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Qualification:</span>
                <span>{person?.qualification || '—'}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Position:</span>
                <span>{person?.position || '—'}</span>
            </div>
            <div className="report-signoff__row">
                <span className="report-signoff__label">Date:</span>
                <span>{person?.date || '—'}</span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardPage({
    vessel,
    scanLogEntries,
    annotations,
    thresholds,
}: DashboardPageProps) {
    const { scansPerformed, globalMinWt, minWtFilename, findings, restrictions } =
        computeStats(scanLogEntries, annotations);

    const signoff: SignoffDetails = vessel.signoff_details ?? {};

    const minWtClass =
        globalMinWt != null
            ? getThresholdClass(globalMinWt, thresholds)
            : 'report-stat-card--neutral';

    return (
        <div>
            <div className="report-section-header report-section-header--dark">
                Executive Dashboard
            </div>

            {/* Stat cards */}
            <div className="report-dashboard">
                <div className="report-stat-card report-stat-card--neutral">
                    <div className="report-stat-card__value">{scansPerformed}</div>
                    <div className="report-stat-card__label">Scans Performed</div>
                </div>

                <div className={`report-stat-card ${minWtClass}`}>
                    <div className="report-stat-card__value">
                        {globalMinWt != null ? `${globalMinWt.toFixed(2)} mm` : 'N/A'}
                    </div>
                    <div className="report-stat-card__label">Min Wall Thickness</div>
                </div>

                <div className="report-stat-card report-stat-card--neutral">
                    <div className="report-stat-card__value">{findings}</div>
                    <div className="report-stat-card__label">Findings</div>
                </div>

                <div
                    className={`report-stat-card ${restrictions > 0 ? 'report-stat-card--warning' : 'report-stat-card--neutral'}`}
                >
                    <div className="report-stat-card__value">{restrictions}</div>
                    <div className="report-stat-card__label">Restrictions</div>
                </div>
            </div>

            {/* Min WT location reference */}
            {globalMinWt != null && minWtFilename && (
                <p
                    style={{
                        fontSize: '9pt',
                        color: 'var(--report-text-light)',
                        marginBottom: '16px',
                    }}
                >
                    <strong>Minimum reading location:</strong> {globalMinWt.toFixed(2)} mm
                    recorded in scan file <em>{minWtFilename}</em>
                </p>
            )}

            {/* Inspection Results Summary */}
            {vessel.results_summary && (
                <>
                    <div className="report-section-header">Inspection Results Summary</div>
                    <div className="report-analysis">{vessel.results_summary}</div>
                </>
            )}

            {/* Sign-off */}
            <div className="report-section-header">Sign-off</div>
            <div className="report-signoff">
                <SignoffColumn title="Technician" person={signoff.technician} />
                <SignoffColumn title="Reviewer" person={signoff.reviewer} />
                <SignoffColumn title="Client Acceptance" person={signoff.client} />
            </div>
        </div>
    );
}
