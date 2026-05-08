import type { WallLossGroupConfig } from '../types';
import { SubSection } from './SliderRow';

export interface WallLossConfigSectionProps {
  config: WallLossGroupConfig | undefined;
  onUpdate: (config: WallLossGroupConfig) => void;
}

const DEFAULTS: WallLossGroupConfig = {
  enabled: false,
  nominalThickness: 10,
  binCount: 5,
};

export function WallLossConfigSection({ config, onUpdate }: WallLossConfigSectionProps) {
  const c = config ?? DEFAULTS;

  const change = (updates: Partial<WallLossGroupConfig>) => {
    onUpdate({ ...c, ...updates });
  };

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
          <div className="vm-control-group">
            <div className="vm-label"><span>Nominal thickness (mm)</span></div>
            <input
              type="number"
              className="vm-input"
              value={c.nominalThickness}
              min={0.1}
              step={0.1}
              onChange={e => change({ nominalThickness: Math.max(0.1, Number(e.target.value)) })}
            />
          </div>
          <div className="vm-control-group">
            <div className="vm-label"><span>Number of bins</span></div>
            <input
              type="number"
              className="vm-input"
              value={c.binCount}
              min={2}
              max={20}
              step={1}
              onChange={e => change({ binCount: Math.max(2, Math.min(20, Math.round(Number(e.target.value)))) })}
            />
          </div>
        </>
      )}
    </SubSection>
  );
}
