import { RotateCw } from 'lucide-react';
import type { VesselState, NozzleConfig, NozzleOrientationMode } from '../../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NozzleEditFormProps {
  nozzle: NozzleConfig;
  /** Flat-array index of the nozzle being edited. */
  index: number;
  vesselState: VesselState;
  onUpdateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
}

// ---------------------------------------------------------------------------
// NozzleEditForm — inline edit form for a plain-pipe connection point.
// ---------------------------------------------------------------------------

export function NozzleEditForm({
  nozzle,
  index,
  vesselState,
  onUpdateNozzle,
}: NozzleEditFormProps) {
  return (
    <div
      className="vm-form edit-mode"
      style={{ margin: '6px 0', position: 'relative', zIndex: 1 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="vm-control-group">
        <div className="vm-label">
          <span>Name</span>
        </div>
        <input
          className="vm-input"
          value={nozzle.name}
          onChange={(e) => onUpdateNozzle(index, { name: e.target.value })}
        />
      </div>
      <div className="vm-form-row">
        <div className="vm-control-group">
          <div className="vm-label">
            <span>Position</span>
          </div>
          <input
            type="number"
            className="vm-input"
            value={nozzle.pos}
            min={Math.round(-(vesselState.id / (2 * vesselState.headRatio)))}
            max={Math.round(vesselState.length + vesselState.id / (2 * vesselState.headRatio))}
            onChange={(e) => onUpdateNozzle(index, { pos: Number(e.target.value) })}
          />
        </div>
        <div className="vm-control-group">
          <div className="vm-label">
            <span>Angle</span>
          </div>
          <input
            type="number"
            className="vm-input"
            value={nozzle.angle}
            min={0}
            max={360}
            onChange={(e) => onUpdateNozzle(index, { angle: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="vm-form-row">
        <div className="vm-control-group">
          <div className="vm-label">
            <span>Projection</span>
          </div>
          <input
            type="number"
            className="vm-input"
            value={nozzle.proj}
            onChange={(e) => onUpdateNozzle(index, { proj: Number(e.target.value) })}
          />
        </div>
        <div className="vm-control-group">
          <div className="vm-label">
            <span>Size (ID)</span>
          </div>
          <input
            type="number"
            className="vm-input"
            value={nozzle.size}
            onChange={(e) => onUpdateNozzle(index, { size: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="vm-control-group">
        <div className="vm-label">
          <span>Orientation</span>
        </div>
        <div className="vm-toggle-group">
          {(
            [
              ['radial', 'Radial'],
              ['horizontal', 'Horiz'],
              ['vertical-up', '▲'],
              ['vertical-down', '▼'],
            ] as [NozzleOrientationMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              className={`vm-toggle-btn ${(nozzle.orientationMode || 'radial') === mode ? 'active' : ''}`}
              onClick={() => onUpdateNozzle(index, { orientationMode: mode })}
              title={
                mode === 'radial'
                  ? 'Radial (outward from center)'
                  : mode === 'horizontal'
                    ? 'Horizontal (fixed axis)'
                    : mode === 'vertical-up'
                      ? 'Vertical Up'
                      : 'Vertical Down'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="vm-control-group">
        <div className="vm-label">
          <span>Rotate (vert. axis)</span>
        </div>
        <button
          className={`vm-toggle-btn ${(nozzle.azimuthRotation ?? 0) !== 0 ? 'active' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
          }}
          onClick={() =>
            onUpdateNozzle(index, { azimuthRotation: ((nozzle.azimuthRotation ?? 0) + 90) % 360 })
          }
          title="Rotate the nozzle 90&deg; about the vertical axis. Click repeatedly to step it around so a dome-end nozzle points straight out the end."
        >
          <RotateCw size={13} />
          {nozzle.azimuthRotation ?? 0}&deg;
        </button>
      </div>
    </div>
  );
}
