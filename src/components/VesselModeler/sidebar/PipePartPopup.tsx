import { useEffect, useRef } from 'react';
import type { PipeSegmentType } from '../types';

interface PipePartPopupProps {
    pipelineId: string;
    onSelect: (pipelineId: string, type: PipeSegmentType) => void;
    onClose: () => void;
}

const PARTS: { type: PipeSegmentType; label: string }[] = [
    { type: 'straight', label: 'Straight' },
    { type: 'elbow', label: 'Elbow' },
    { type: 'reducer', label: 'Reducer' },
    { type: 'flange', label: 'Flange' },
    { type: 'cap', label: 'Cap' },
];

export function PipePartPopup({ pipelineId, onSelect, onClose }: PipePartPopupProps) {
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            ref={ref}
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(30, 30, 30, 0.95)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                padding: '8px 4px',
                display: 'flex',
                gap: 4,
                zIndex: 100,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
        >
            {PARTS.map(({ type, label }) => (
                <button
                    key={type}
                    onClick={() => {
                        onSelect(pipelineId, type);
                        onClose();
                    }}
                    style={{
                        padding: '6px 14px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 4,
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                >
                    + {label}
                </button>
            ))}
        </div>
    );
}
