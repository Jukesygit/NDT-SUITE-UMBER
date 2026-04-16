/**
 * ScanLogPage — displays the C-Scan mapping log as a table
 * with color-coded Min WT badges based on threshold values.
 */

import type { ScanLogEntry } from '@/types/inspection-project';

export interface ScanLogPageProps {
    entries: ScanLogEntry[];
    thresholds?: { mode?: string; redBelow?: number; yellowBelow?: number };
}

function getWtBadgeClass(value: number, thresholds?: ScanLogPageProps['thresholds']): string {
    if (!thresholds) return 'report-wt-badge report-wt-badge--safe';
    if (thresholds.mode === 'absolute') {
        if (thresholds.redBelow != null && value <= thresholds.redBelow)
            return 'report-wt-badge report-wt-badge--danger';
        if (thresholds.yellowBelow != null && value <= thresholds.yellowBelow)
            return 'report-wt-badge report-wt-badge--warning';
    }
    return 'report-wt-badge report-wt-badge--safe';
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
}

function formatNum(value: number | null): string {
    if (value == null) return '—';
    return value.toFixed(1);
}

export default function ScanLogPage({ entries, thresholds }: ScanLogPageProps) {
    return (
        <div>
            <div className="report-section-header">C-Scan Mapping Log</div>
            <table className="report-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Date Inspected</th>
                        <th>Setup File</th>
                        <th>Scan Start (x)</th>
                        <th>Scan End (x)</th>
                        <th>Index Start (y)</th>
                        <th>Index End (y)</th>
                        <th>Datum</th>
                        <th>Coating Corr.</th>
                        <th>Min WT</th>
                        <th>Comments</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.id}>
                            <td>{entry.filename}</td>
                            <td>{formatDate(entry.date_inspected)}</td>
                            <td>{entry.setup_file_name ?? '—'}</td>
                            <td>{formatNum(entry.scan_start_x)}</td>
                            <td>{formatNum(entry.scan_end_x)}</td>
                            <td>{formatNum(entry.index_start_y)}</td>
                            <td>{formatNum(entry.index_end_y)}</td>
                            <td>{entry.scan_index_datum ?? '—'}</td>
                            <td>{entry.coating_correction ?? '—'}</td>
                            <td>
                                {entry.min_wt != null ? (
                                    <span className={getWtBadgeClass(entry.min_wt, thresholds)}>
                                        {entry.min_wt.toFixed(2)}
                                    </span>
                                ) : (
                                    '—'
                                )}
                            </td>
                            <td>{entry.comments ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p
                style={{
                    fontSize: '8pt',
                    color: 'var(--report-text-muted)',
                    fontStyle: 'italic',
                    marginTop: 4,
                }}
            >
                All dimensions in mm. WT results include coating correction.
            </p>
        </div>
    );
}
