import { useState, useCallback, useEffect } from 'react';
import { Shield } from 'lucide-react';
import type { VesselState } from '../types';
import { Section } from './SliderRow';

export interface VesselDetailsSectionProps {
  vesselState: VesselState;
  onUpdateDimensions: (updates: Partial<VesselState>) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

function NumericInput({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  onCommit: (v: number | undefined) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');

  useEffect(() => {
    setLocal(value != null ? String(value) : '');
  }, [value]);

  const commit = useCallback(() => {
    const num = parseFloat(local);
    if (local.trim() === '' || isNaN(num)) {
      onCommit(undefined);
    } else {
      onCommit(Math.max(0, num));
    }
  }, [local, onCommit]);

  return (
    <div className="vm-control-group">
      <div className="vm-label"><span>{label}</span></div>
      <input
        type="number"
        className="vm-input"
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={local}
        min={0}
        step={0.1}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
      />
    </div>
  );
}

export function VesselDetailsSection({ vesselState, onUpdateDimensions, isOpen, onToggle }: VesselDetailsSectionProps) {
  return (
    <Section
      title="Vessel Details"
      icon={<Shield size={14} style={{ marginRight: 6 }} />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <NumericInput
        label="Corrosion Allowance (mm)"
        value={vesselState.corrosionAllowance}
        placeholder="e.g. 3.0"
        onCommit={v => onUpdateDimensions({ corrosionAllowance: v })}
      />
      <NumericInput
        label="Shell Nominal Thickness (mm)"
        value={vesselState.shellNominalThickness}
        placeholder="e.g. 12.0"
        onCommit={v => onUpdateDimensions({ shellNominalThickness: v })}
      />
      <NumericInput
        label="Dome Nominal Thickness (mm)"
        value={vesselState.domeNominalThickness}
        placeholder="e.g. 10.0"
        onCommit={v => onUpdateDimensions({ domeNominalThickness: v })}
      />
    </Section>
  );
}
