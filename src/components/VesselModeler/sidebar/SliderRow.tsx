import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// SliderRow - Slider + number input
// ---------------------------------------------------------------------------

export function SliderRow({ label, value, min, max, step = 1, unit = 'mm', onChange }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (v: number) => void;
}) {
    return (
        <div className="vm-control-group">
            <div className="vm-label">
                <span>{label}</span>
                <span className="vm-val-display">{value}{unit}</span>
            </div>
            <div className="vm-slider-input-row">
                <input
                    type="range"
                    className="vm-slider"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                />
                <input
                    type="number"
                    className="vm-input"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

export function Section({ title, icon, count, defaultOpen = true, children }: {
    title: string;
    icon?: React.ReactNode;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`vm-section ${open ? '' : 'collapsed'}`}>
            <div className="vm-section-header" onClick={() => setOpen(o => !o)}>
                <h3 className="vm-section-title">
                    {icon}{title}
                    {count != null && count > 0 && <span className="vm-section-count">{count}</span>}
                </h3>
                <ChevronDown size={14} className="vm-chevron" />
            </div>
            <div className="vm-section-content">{children}</div>
        </div>
    );
}

export function SubSection({ title, count, defaultOpen = false, children }: {
    title: string;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`vm-subsection ${open ? '' : 'collapsed'}`}>
            <div className="vm-subsection-header" onClick={() => setOpen(o => !o)}>
                <span className="vm-subsection-title">
                    {title}
                    {count != null && count > 0 && <span className="vm-subsection-count">{count}</span>}
                </span>
                <ChevronDown size={12} className="vm-chevron" />
            </div>
            <div className="vm-subsection-content">{children}</div>
        </div>
    );
}
