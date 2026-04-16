/**
 * CalibrationLogPage — displays the calibration log as a table
 * for the PAUT inspection report.
 */

import type { CalibrationLogEntry } from '../../types/inspection-project';

export interface CalibrationLogPageProps {
    entries: CalibrationLogEntry[];
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

function formatNum(value: number | null, decimals = 2): string {
    if (value == null) return '—';
    return value.toFixed(decimals);
}

export default function CalibrationLogPage({ entries }: CalibrationLogPageProps) {
    return (
        <div>
            <div className="report-section-header">Calibration Log</div>
            <table className="report-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Setup File</th>
                        <th>Date</th>
                        <th>Scan Start</th>
                        <th>Scan End</th>
                        <th>Ref A WT</th>
                        <th>Meas A WT</th>
                        <th>Velocity (m/sec)</th>
                        <th>Comments</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.id}>
                            <td>{entry.filename}</td>
                            <td>{entry.setup_file ?? '—'}</td>
                            <td>{formatDate(entry.cal_date)}</td>
                            <td>{entry.scan_start ?? '—'}</td>
                            <td>{entry.scan_end ?? '—'}</td>
                            <td>{formatNum(entry.ref_a_wt)}</td>
                            <td>{formatNum(entry.meas_a_wt)}</td>
                            <td>{formatNum(entry.velocity, 0)}</td>
                            <td>{entry.comments ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
