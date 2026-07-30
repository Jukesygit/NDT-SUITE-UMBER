/**
 * ActivityLogDetails - presentational helpers for the admin activity-log tab.
 *
 * Extracted from ActivityLogTab so that tab keeps within the max-lines budget.
 * `titleCase` is shared with the tab's column renderers; `DetailsView` renders
 * the per-row drill-down (before/after diff, delete snapshot, or key/value pairs).
 */

import { Fragment } from 'react';

/** Title-case a snake_case or space-separated token for display. */
export function titleCase(value: string): string {
    return value
        .split(/[_\s]+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
        .join(' ');
}

export function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Render the captured details: a before/after diff, a delete snapshot, or key/value pairs. */
export function DetailsView({ details }: { details: Record<string, unknown> | null }) {
    if (!details || Object.keys(details).length === 0) {
        return <span style={{ color: 'rgba(53, 160, 88, 0.45)', fontSize: '13px' }}>No additional details.</span>;
    }

    const changes = (details as { changes?: Record<string, { old?: unknown; new?: unknown; changed?: boolean; pii_redacted?: boolean }> }).changes;

    if (changes && typeof changes === 'object') {
        return (
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ color: 'rgba(53, 160, 88, 0.45)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>Field</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Before</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>After</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(changes).map(([field, change]) => {
                        const redacted = change?.pii_redacted;
                        const bulkOnly = change?.changed && change.old === undefined && change.new === undefined;
                        return (
                            <tr key={field} style={{ borderTop: '1px solid rgba(53, 160, 88, 0.15)' }}>
                                <td style={{ padding: '4px 12px 4px 0', color: 'var(--green)' }}>{titleCase(field)}</td>
                                {redacted || bulkOnly ? (
                                    <td colSpan={2} style={{ padding: '4px 12px', color: 'rgba(53, 160, 88, 0.45)', fontStyle: 'italic' }}>
                                        {redacted ? 'changed (value redacted)' : 'changed'}
                                    </td>
                                ) : (
                                    <>
                                        <td style={{ padding: '4px 12px', color: 'rgba(245, 158, 11, 0.85)', fontFamily: 'monospace' }}>{formatValue(change?.old)}</td>
                                        <td style={{ padding: '4px 12px', color: 'var(--green-bright)', fontFamily: 'monospace' }}>{formatValue(change?.new)}</td>
                                    </>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    }

    // Generic key/value rendering (edge-function details, delete snapshots, etc.)
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: '13px' }}>
            {Object.entries(details).map(([key, value]) => (
                <Fragment key={key}>
                    <span style={{ color: 'var(--green)' }}>{titleCase(key)}</span>
                    <span style={{ color: 'rgba(53, 160, 88, 0.70)', fontFamily: 'monospace', wordBreak: 'break-word' }}>{formatValue(value)}</span>
                </Fragment>
            ))}
        </div>
    );
}
