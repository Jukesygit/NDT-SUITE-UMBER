/**
 * GateControlsSidebar — collapsible gate settings panel.
 *
 * Read-only for viewer role. Dispatches UPDATE_GATE_SETTINGS to parent reducer.
 */

import type { GateSettings } from '../../../types/companion';

interface GateControlsSidebarProps {
  gateSettings: GateSettings;
  onChange: (updates: Partial<GateSettings>) => void;
  readOnly?: boolean;
}

export default function GateControlsSidebar({ gateSettings, onChange, readOnly = false }: GateControlsSidebarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.78rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Gate Settings
      </div>

      {/* Measurement mode */}
      <ControlGroup label="Mode">
        <select
          value={gateSettings.gateMode}
          onChange={e => onChange({ gateMode: e.target.value })}
          disabled={readOnly}
          style={selectStyle}
        >
          <option value="A-I">A-I (ToF difference)</option>
          <option value="B-A">B-A (ToF difference)</option>
        </select>
      </ControlGroup>

      {/* Recovery modes */}
      <ControlGroup label="Ref recovery">
        <select
          value={gateSettings.refRecovery}
          onChange={e => onChange({ refRecovery: e.target.value })}
          disabled={readOnly}
          style={selectStyle}
        >
          <option value="crossing_only">Crossing only</option>
          <option value="peak_fallback">Peak fallback</option>
        </select>
      </ControlGroup>

      <ControlGroup label="Meas recovery">
        <select
          value={gateSettings.measRecovery}
          onChange={e => onChange({ measRecovery: e.target.value })}
          disabled={readOnly}
          style={selectStyle}
        >
          <option value="crossing_only">Crossing only</option>
          <option value="peak_fallback">Peak fallback</option>
        </select>
      </ControlGroup>

      {/* Amplitude filters */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Amplitude filters
        </div>
        <ControlGroup label="Ref min %">
          <input
            type="number"
            value={gateSettings.minAmplitudeRef}
            onChange={e => onChange({ minAmplitudeRef: Number(e.target.value) })}
            disabled={readOnly}
            min={0}
            max={200}
            step={5}
            style={inputStyle}
          />
        </ControlGroup>
        <ControlGroup label="Meas min %">
          <input
            type="number"
            value={gateSettings.minAmplitudeMeas}
            onChange={e => onChange({ minAmplitudeMeas: Number(e.target.value) })}
            disabled={readOnly}
            min={0}
            max={200}
            step={5}
            style={inputStyle}
          />
        </ControlGroup>
      </div>

      {/* Thickness range */}
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Thickness range
        </div>
        <ControlGroup label="Min (mm)">
          <input
            type="number"
            value={gateSettings.thicknessMin ?? ''}
            onChange={e => onChange({ thicknessMin: e.target.value ? Number(e.target.value) : null })}
            disabled={readOnly}
            step={0.1}
            style={inputStyle}
            placeholder="—"
          />
        </ControlGroup>
        <ControlGroup label="Max (mm)">
          <input
            type="number"
            value={gateSettings.thicknessMax ?? ''}
            onChange={e => onChange({ thicknessMax: e.target.value ? Number(e.target.value) : null })}
            disabled={readOnly}
            step={0.1}
            style={inputStyle}
            placeholder="—"
          />
        </ControlGroup>
      </div>

      {readOnly && (
        <div style={{ fontSize: '0.7rem', color: 'var(--text-quaternary)', fontStyle: 'italic' }}>
          View-only mode
        </div>
      )}
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  padding: '3px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  color: 'var(--text-secondary)',
  flex: 1,
  maxWidth: 140,
};

const inputStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  padding: '3px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  color: 'var(--text-secondary)',
  width: 70,
  textAlign: 'right',
};
