import { useCallback, useState, useEffect } from 'react';
import type { WallLossGroupConfig, WallLossBinMode } from '../types';
import { SubSection } from './SliderRow';

export interface WallLossConfigSectionProps {
  config: WallLossGroupConfig | undefined;
  onUpdate: (config: WallLossGroupConfig) => void;
  corrosionAllowance?: number;
  shellNominalThickness?: number;
  domeNominalThickness?: number;
}

const DEFAULTS: WallLossGroupConfig = {
  enabled: false,
  nominalThickness: 10,
  binCount: 5,
  binMode: 'equal',
};

function defaultBinNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Bin ${i + 1}`);
}

function defaultBoundaries(nwt: number, count: number): number[] {
  const step = nwt / count;
  return Array.from({ length: count + 1 }, (_, i) => +(nwt - i * step).toFixed(2));
}

export function WallLossConfigSection({
  config, onUpdate,
  corrosionAllowance, shellNominalThickness, domeNominalThickness,
}: WallLossConfigSectionProps) {
  const c = config ?? DEFAULTS;
  const mode = c.binMode ?? 'equal';
  const binNames = c.binNames ?? defaultBinNames(c.binCount);

  const [localNominal, setLocalNominal] = useState(String(c.nominalThickness));

  useEffect(() => {
    setLocalNominal(String(c.nominalThickness));
  }, [c.nominalThickness]);

  const change = useCallback(
    (updates: Partial<WallLossGroupConfig>) => {
      onUpdate({ ...c, ...updates });
    },
    [c, onUpdate],
  );

  const handleBinCountChange = useCallback(
    (newCount: number) => {
      const clamped = Math.max(2, Math.min(20, Math.round(newCount)));
      const existing = c.binNames ?? defaultBinNames(c.binCount);
      const names = Array.from({ length: clamped }, (_, i) => existing[i] ?? `Bin ${i + 1}`);
      const updates: Partial<WallLossGroupConfig> = { binCount: clamped, binNames: names };
      if (mode === 'custom') {
        updates.customBoundaries = defaultBoundaries(c.nominalThickness, clamped);
      }
      change(updates);
    },
    [c.binNames, c.binCount, c.nominalThickness, mode, change],
  );

  const handleBinNameChange = useCallback(
    (index: number, name: string) => {
      const names = [...binNames];
      names[index] = name;
      change({ binNames: names });
    },
    [binNames, change],
  );

  const handleNominalBlur = useCallback(() => {
    const val = Math.max(0.1, Number(localNominal) || 0.1);
    setLocalNominal(String(val));
    change({ nominalThickness: val });
  }, [localNominal, change]);

  const handleNominalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleNominalBlur();
    },
    [handleNominalBlur],
  );

  const handleModeChange = useCallback(
    (newMode: WallLossBinMode) => {
      const updates: Partial<WallLossGroupConfig> = { binMode: newMode };
      if (newMode === 'ca-based') {
        updates.binCount = 5;
        updates.binNames = [
          '≥ NWT',
          '≥ NWT-33%CA',
          '≥ NWT-67%CA',
          '≥ NWT-100%CA',
          '< NWT-100%CA',
        ];
      } else if (newMode === 'custom') {
        if (!c.customBoundaries || c.customBoundaries.length < 2) {
          updates.customBoundaries = defaultBoundaries(c.nominalThickness, c.binCount);
        }
      }
      change(updates);
    },
    [c.customBoundaries, c.nominalThickness, c.binCount, change],
  );

  const handleBoundaryChange = useCallback(
    (index: number, value: number) => {
      const boundaries = [...(c.customBoundaries ?? [])];
      boundaries[index] = value;
      change({ customBoundaries: boundaries });
    },
    [c.customBoundaries, change],
  );

  const handleAddBoundary = useCallback(() => {
    const boundaries = [...(c.customBoundaries ?? [])];
    const last = boundaries[boundaries.length - 1] ?? 0;
    const secondLast = boundaries[boundaries.length - 2] ?? last + 1;
    const newVal = +((last + secondLast) / 2).toFixed(2);
    boundaries.splice(boundaries.length - 1, 0, newVal);
    const newCount = boundaries.length - 1;
    const names = Array.from({ length: newCount }, (_, i) =>
      (c.binNames ?? [])[i] ?? `Bin ${i + 1}`
    );
    change({ customBoundaries: boundaries, binCount: newCount, binNames: names });
  }, [c.customBoundaries, c.binNames, change]);

  const handleRemoveBoundary = useCallback(
    (index: number) => {
      const boundaries = [...(c.customBoundaries ?? [])];
      if (boundaries.length <= 2) return;
      boundaries.splice(index, 1);
      const newCount = boundaries.length - 1;
      const names = Array.from({ length: newCount }, (_, i) =>
        (c.binNames ?? [])[i] ?? `Bin ${i + 1}`
      );
      change({ customBoundaries: boundaries, binCount: newCount, binNames: names });
    },
    [c.customBoundaries, c.binNames, change],
  );

  const ca = corrosionAllowance ?? 0;
  const shellNwt = shellNominalThickness ?? c.nominalThickness;
  const domeNwt = domeNominalThickness ?? shellNwt;

  return (
    <SubSection title="Wall Loss Stats">
      <div className="vm-control-group" style={{ marginBottom: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={c.enabled}
            onChange={e => change({ enabled: e.target.checked })}
          />
          <span className="vm-label" style={{ margin: 0 }}>Show wall-loss panel</span>
        </label>
      </div>

      {c.enabled && (
        <>
          {/* Nominal thickness (used by equal mode; also a fallback for other modes) */}
          <div className="vm-control-group">
            <div className="vm-label"><span>Nominal thickness (mm)</span></div>
            <input
              type="number"
              className="vm-input"
              value={localNominal}
              min={0.1}
              step={0.1}
              onChange={e => setLocalNominal(e.target.value)}
              onBlur={handleNominalBlur}
              onKeyDown={handleNominalKeyDown}
            />
          </div>

          {/* Bin mode selector */}
          <div className="vm-control-group">
            <div className="vm-label"><span>Bin mode</span></div>
            <select
              className="vm-select"
              value={mode}
              onChange={e => handleModeChange(e.target.value as WallLossBinMode)}
            >
              <option value="equal">Equal % bins</option>
              <option value="ca-based">CA-based bins</option>
              <option value="custom">Custom boundaries (mm)</option>
            </select>
          </div>

          {/* ── Equal mode ── */}
          {mode === 'equal' && (
            <>
              <div className="vm-control-group">
                <div className="vm-label"><span>Number of bins</span></div>
                <input
                  type="number"
                  className="vm-input"
                  value={c.binCount}
                  min={2}
                  max={20}
                  step={1}
                  onChange={e => handleBinCountChange(Number(e.target.value))}
                />
              </div>
              <div className="vm-control-group" style={{ marginTop: 8 }}>
                <div className="vm-label"><span>Bin names</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {binNames.slice(0, c.binCount).map((name, i) => {
                    const binWidth = 100 / c.binCount;
                    const minPct = (i * binWidth).toFixed(0);
                    const maxPct = (i === c.binCount - 1 ? 100 : (i + 1) * binWidth).toFixed(0);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, opacity: 0.6, minWidth: 48, textAlign: 'right' }}>
                          {minPct}–{maxPct}%
                        </span>
                        <input
                          type="text"
                          className="vm-input"
                          style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
                          value={name}
                          placeholder={`Bin ${i + 1}`}
                          onChange={e => handleBinNameChange(i, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── CA-based mode ── */}
          {mode === 'ca-based' && (
            <div className="vm-control-group" style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.5 }}>
                <div>Shell NWT: <strong>{shellNwt.toFixed(1)} mm</strong></div>
                {domeNwt !== shellNwt && <div>Dome NWT: <strong>{domeNwt.toFixed(1)} mm</strong></div>}
                <div>CA: <strong>{ca.toFixed(1)} mm</strong></div>
                {ca <= 0 && (
                  <div style={{ color: '#f59e0b', marginTop: 4 }}>
                    Set Corrosion Allowance in Vessel Details to use CA-based bins.
                  </div>
                )}
                <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6 }}>
                  <div>Bin 1: RWT ≥ {shellNwt.toFixed(1)} mm</div>
                  <div>Bin 2: RWT ≥ {(shellNwt - 0.33 * ca).toFixed(1)} mm</div>
                  <div>Bin 3: RWT ≥ {(shellNwt - 0.67 * ca).toFixed(1)} mm</div>
                  <div>Bin 4: RWT ≥ {(shellNwt - ca).toFixed(1)} mm</div>
                  <div>Bin 5: RWT &lt; {(shellNwt - ca).toFixed(1)} mm</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Custom boundaries mode ── */}
          {mode === 'custom' && (
            <div className="vm-control-group" style={{ marginTop: 8 }}>
              <div className="vm-label"><span>Boundaries (mm, high → low)</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(c.customBoundaries ?? []).map((val, i) => (
                  <BoundaryRow
                    key={i}
                    value={val}
                    index={i}
                    canRemove={(c.customBoundaries ?? []).length > 2}
                    onChange={handleBoundaryChange}
                    onRemove={handleRemoveBoundary}
                  />
                ))}
              </div>
              <button
                className="vm-btn vm-btn-primary"
                style={{ width: '100%', marginTop: 6 }}
                onClick={handleAddBoundary}
              >
                + Add boundary
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                <div className="vm-label"><span>Bin names</span></div>
                {Array.from({ length: (c.customBoundaries ?? []).length - 1 }, (_, i) => {
                  const boundaries = c.customBoundaries ?? [];
                  const hi = boundaries[i] ?? 0;
                  const lo = boundaries[i + 1] ?? 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, opacity: 0.6, minWidth: 68, textAlign: 'right' }}>
                        {lo.toFixed(1)}–{hi.toFixed(1)}
                      </span>
                      <input
                        type="text"
                        className="vm-input"
                        style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
                        value={binNames[i] ?? ''}
                        placeholder={`Bin ${i + 1}`}
                        onChange={e => handleBinNameChange(i, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </SubSection>
  );
}

function BoundaryRow({
  value, index, canRemove, onChange, onRemove,
}: {
  value: number;
  index: number;
  canRemove: boolean;
  onChange: (index: number, value: number) => void;
  onRemove: (index: number) => void;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const num = parseFloat(local);
    if (!isNaN(num)) onChange(index, +num.toFixed(2));
  }, [local, index, onChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        className="vm-input"
        style={{ flex: 1, fontSize: 12, padding: '2px 6px' }}
        value={local}
        step={0.1}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      />
      {canRemove && (
        <button
          className="vm-btn-icon"
          onClick={() => onRemove(index)}
          title="Remove boundary"
          style={{ fontSize: 14, padding: 2, opacity: 0.6 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
