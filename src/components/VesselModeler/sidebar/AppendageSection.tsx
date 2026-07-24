import React from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { VesselState, AppendageConfig, AppendageEndClosure } from '../types';
import { createAppendage } from '../engine/appendage-config';
import { SubSection } from './SliderRow';

export interface AppendageSectionProps {
  vesselState: VesselState;
  selectedAppendageIndex: number;
  onAddAppendage: (appendage: AppendageConfig) => void;
  onUpdateAppendage: (index: number, updates: Partial<AppendageConfig>) => void;
  onRemoveAppendage: (index: number) => void;
  onSelectAppendage: (index: number) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const END_CLOSURES: [AppendageEndClosure, string][] = [
  ['dished', 'Dished'],
  ['flat', 'Flat'],
  ['open', 'Open'],
];

export function AppendageSection({
  vesselState,
  selectedAppendageIndex,
  onAddAppendage,
  onUpdateAppendage,
  onRemoveAppendage,
  onSelectAppendage,
  isOpen,
  onToggle,
}: AppendageSectionProps) {
  const appendages = vesselState.appendages;
  const sel = selectedAppendageIndex >= 0 ? appendages[selectedAppendageIndex] : null;

  return (
    <SubSection title="Appendages" count={appendages.length} isOpen={isOpen} onToggle={onToggle}>
      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
        Secondary bodies (sumps, boots, risers) mounted on the shell
      </p>
      <button
        className="vm-btn-add"
        onClick={() => onAddAppendage(createAppendage(appendages))}
        style={{ marginBottom: 10 }}
      >
        <Plus size={14} /> Add Appendage
      </button>

      {appendages.map((a, i) => (
        <React.Fragment key={a.id}>
          <div
            className={`vm-list-item ${i === selectedAppendageIndex ? 'selected' : ''}`}
            onClick={() => onSelectAppendage(i)}
          >
            <div className="vm-list-item-info">
              <strong>{a.name}</strong>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                &Oslash;{Math.round(a.diameter)} &times; {Math.round(a.length)} @{' '}
                {Math.round(a.mountAngle)}&deg;
              </div>
            </div>
            <button
              className="vm-btn-icon"
              type="button"
              aria-label={`Delete ${a.name}`}
              title={`Delete ${a.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveAppendage(i);
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {i === selectedAppendageIndex && sel && (
            <div
              className="vm-form edit-mode"
              style={{ marginTop: 8, position: 'relative', zIndex: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="vm-control-group">
                <div className="vm-label">
                  <span>Name</span>
                </div>
                <input
                  className="vm-input"
                  value={sel.name}
                  onChange={(e) =>
                    onUpdateAppendage(selectedAppendageIndex, { name: e.target.value })
                  }
                />
              </div>
              <div className="vm-form-row">
                <div className="vm-control-group">
                  <div className="vm-label">
                    <span>Mount Position</span>
                  </div>
                  <input
                    type="number"
                    className="vm-input"
                    value={sel.mountPos}
                    onChange={(e) =>
                      onUpdateAppendage(selectedAppendageIndex, {
                        mountPos: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="vm-control-group">
                  <div className="vm-label">
                    <span>Mount Angle</span>
                  </div>
                  <input
                    type="number"
                    className="vm-input"
                    value={sel.mountAngle}
                    min={0}
                    max={360}
                    onChange={(e) =>
                      onUpdateAppendage(selectedAppendageIndex, {
                        mountAngle: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="vm-form-row">
                <div className="vm-control-group">
                  <div className="vm-label">
                    <span>Diameter (mm)</span>
                  </div>
                  <input
                    type="number"
                    className="vm-input"
                    value={sel.diameter}
                    onChange={(e) =>
                      onUpdateAppendage(selectedAppendageIndex, {
                        diameter: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="vm-control-group">
                  <div className="vm-label">
                    <span>Length (mm)</span>
                  </div>
                  <input
                    type="number"
                    className="vm-input"
                    value={sel.length}
                    onChange={(e) =>
                      onUpdateAppendage(selectedAppendageIndex, { length: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="vm-control-group">
                <div className="vm-label">
                  <span>End Closure</span>
                </div>
                <div className="vm-toggle-group">
                  {END_CLOSURES.map(([mode, label]) => (
                    <button
                      key={mode}
                      className={`vm-toggle-btn ${sel.endClosure === mode ? 'active' : ''}`}
                      onClick={() =>
                        onUpdateAppendage(selectedAppendageIndex, { endClosure: mode })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {sel.endClosure === 'dished' && (
                <div className="vm-control-group">
                  <div className="vm-label">
                    <span>Head Ratio</span>
                  </div>
                  <input
                    type="number"
                    className="vm-input"
                    value={sel.headRatio ?? 2}
                    step={0.1}
                    min={1}
                    onChange={(e) =>
                      onUpdateAppendage(selectedAppendageIndex, {
                        headRatio: Number(e.target.value),
                      })
                    }
                  />
                </div>
              )}
              <label className="vm-checkbox-row">
                <input
                  type="checkbox"
                  checked={sel.flangeJoint?.show ?? false}
                  onChange={(e) =>
                    onUpdateAppendage(selectedAppendageIndex, {
                      flangeJoint: { ...sel.flangeJoint, show: e.target.checked },
                    })
                  }
                />
                <span>Girth Flange Joint</span>
              </label>
              {sel.flangeJoint?.show && (
                <div className="vm-form-row">
                  <div className="vm-control-group">
                    <div className="vm-label">
                      <span>Flange OD (mm)</span>
                    </div>
                    <input
                      type="number"
                      className="vm-input"
                      value={sel.flangeJoint?.od ?? Math.round(sel.diameter * 1.2)}
                      onChange={(e) =>
                        onUpdateAppendage(selectedAppendageIndex, {
                          flangeJoint: {
                            ...sel.flangeJoint,
                            show: true,
                            od: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="vm-control-group">
                    <div className="vm-label">
                      <span>Flange Thk (mm)</span>
                    </div>
                    <input
                      type="number"
                      className="vm-input"
                      value={sel.flangeJoint?.thickness ?? 20}
                      onChange={(e) =>
                        onUpdateAppendage(selectedAppendageIndex, {
                          flangeJoint: {
                            ...sel.flangeJoint,
                            show: true,
                            thickness: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}
              <div className="vm-control-group">
                <div className="vm-label">
                  <span>Nominal Thickness (mm)</span>
                </div>
                <input
                  type="number"
                  className="vm-input"
                  value={sel.nominalThickness ?? ''}
                  placeholder="shell default"
                  onChange={(e) =>
                    onUpdateAppendage(selectedAppendageIndex, {
                      nominalThickness: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
              <button
                className="vm-btn-sm"
                onClick={() => onRemoveAppendage(selectedAppendageIndex)}
                title="Delete this appendage"
                style={{
                  fontSize: '0.7rem',
                  padding: '3px 8px',
                  marginTop: 8,
                  color: 'var(--color-danger, #ef4444)',
                  width: '100%',
                }}
              >
                Delete Appendage
              </button>
            </div>
          )}
        </React.Fragment>
      ))}
    </SubSection>
  );
}
