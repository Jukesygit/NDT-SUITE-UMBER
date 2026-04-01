import { useState } from 'react';
import type { ThicknessThresholds } from '../types';
import { SubSection } from './SliderRow';

export interface ThresholdSectionProps {
    thresholds: ThicknessThresholds | undefined;
    onUpdate: (thresholds: ThicknessThresholds) => void;
}

const DEFAULTS: ThicknessThresholds = {
    mode: 'absolute',
    redBelow: 5,
    yellowBelow: 8,
    nominalThickness: 10,
    redBelowPct: 50,
    yellowBelowPct: 80,
};

export function ThresholdSection({ thresholds, onUpdate }: ThresholdSectionProps) {
    const t = thresholds ?? DEFAULTS;
    const [mode, setMode] = useState<'absolute' | 'percentage'>(t.mode);

    const change = (updates: Partial<ThicknessThresholds>) => {
        onUpdate({ ...t, ...updates });
    };

    const switchMode = (m: 'absolute' | 'percentage') => {
        setMode(m);
        change({ mode: m });
    };

    return (
        <SubSection title="Thickness Thresholds">
            {/* Mode toggle */}
            <div className="vm-toggle-group" style={{ marginBottom: 10 }}>
                <button
                    className={`vm-toggle-btn ${mode === 'absolute' ? 'active' : ''}`}
                    onClick={() => switchMode('absolute')}
                >
                    Absolute (mm)
                </button>
                <button
                    className={`vm-toggle-btn ${mode === 'percentage' ? 'active' : ''}`}
                    onClick={() => switchMode('percentage')}
                >
                    % of Nominal
                </button>
            </div>

            {mode === 'absolute' ? (
                <>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Red below (mm)</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            value={t.redBelow ?? ''}
                            min={0}
                            step={0.1}
                            onChange={e => change({ redBelow: Number(e.target.value) })}
                        />
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Yellow below (mm)</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            value={t.yellowBelow ?? ''}
                            min={0}
                            step={0.1}
                            onChange={e => change({ yellowBelow: Number(e.target.value) })}
                        />
                    </div>
                </>
            ) : (
                <>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Nominal thickness (mm)</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            value={t.nominalThickness ?? ''}
                            min={0}
                            step={0.1}
                            onChange={e => change({ nominalThickness: Number(e.target.value) })}
                        />
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Red below %</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            value={t.redBelowPct ?? ''}
                            min={0}
                            max={100}
                            step={1}
                            onChange={e => change({ redBelowPct: Number(e.target.value) })}
                        />
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Yellow below %</span></div>
                        <input
                            type="number"
                            className="vm-input"
                            value={t.yellowBelowPct ?? ''}
                            min={0}
                            max={100}
                            step={1}
                            onChange={e => change({ yellowBelowPct: Number(e.target.value) })}
                        />
                    </div>
                </>
            )}
        </SubSection>
    );
}
