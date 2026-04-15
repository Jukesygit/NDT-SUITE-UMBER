/**
 * InlineEditField - Reusable click-to-edit text field with optimistic display
 */

import { useState, useCallback, useEffect } from 'react';

interface InlineEditFieldProps {
    label: string;
    value: string;
    onSave: (value: string) => void;
    fullWidth?: boolean;
}

const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    fontWeight: 500,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
};

const inputStyle: React.CSSProperties = {
    fontSize: '0.875rem',
    color: 'var(--text-primary)',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    width: '100%',
    outline: 'none',
};

export function InlineEditField({ label, value, onSave, fullWidth }: InlineEditFieldProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => { setDisplayValue(value); }, [value]);

    const startEdit = useCallback(() => {
        setDraft(displayValue);
        setEditing(true);
    }, [displayValue]);

    const commit = useCallback(() => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed !== (displayValue ?? '').trim()) {
            setDisplayValue(trimmed);
            onSave(trimmed);
        }
    }, [draft, displayValue, onSave]);

    return (
        <div style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
            <div style={labelStyle}>{label}</div>
            {editing ? (
                <input
                    autoFocus
                    style={inputStyle}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                        if (e.key === 'Escape') setEditing(false);
                    }}
                />
            ) : (
                <div
                    style={{
                        fontSize: '0.875rem',
                        color: displayValue ? 'var(--text-primary)' : 'var(--text-quaternary)',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        minHeight: 36,
                        cursor: 'pointer',
                        border: '1px solid transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                        background: displayValue ? 'transparent' : 'rgba(255,255,255,0.03)',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                    onClick={startEdit}
                    title="Click to edit"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.borderBottomColor = 'var(--border-subtle)';
                        e.currentTarget.style.background = displayValue ? 'transparent' : 'rgba(255,255,255,0.03)';
                    }}
                >
                    {displayValue || '\u2014'}
                </div>
            )}
        </div>
    );
}
