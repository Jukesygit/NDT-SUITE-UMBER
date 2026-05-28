import { useRef } from 'react';
import {
  Upload,
  Move3d,
  ScissorsLineDashed,
  Ruler,
  RotateCcw,
} from 'lucide-react';
import { COLOR_SCALES } from '../../utils/colorscales';
import type { SurfaceOptions, TopologyTool } from './types';

interface TopologyToolbarProps {
  surfaceOptions: SurfaceOptions;
  onOptionsChange: (updates: Partial<SurfaceOptions>) => void;
  activeTool: TopologyTool;
  onToolChange: (tool: TopologyTool) => void;
  onFileUpload: (files: FileList) => void;
  autoNominal: number | null;
}

const TOOL_DEFS: {
  id: TopologyTool;
  icon: typeof Move3d;
  label: string;
}[] = [
  { id: 'orbit', icon: Move3d, label: 'Orbit' },
  { id: 'crossSection', icon: ScissorsLineDashed, label: 'Cross-Section' },
  { id: 'measure', icon: Ruler, label: 'Measure' },
];

const colorScaleNames = Object.keys(COLOR_SCALES);

export default function TopologyToolbar({
  surfaceOptions,
  onOptionsChange,
  activeTool,
  onToolChange,
  onFileUpload,
  autoNominal,
}: TopologyToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files);
      // Reset so re-selecting the same file triggers onChange
      e.target.value = '';
    }
  };

  const handleNominalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onOptionsChange({ nominalThickness: null });
    } else {
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) {
        onOptionsChange({ nominalThickness: v });
      }
    }
  };

  const handleRangeChange = (
    field: 'rangeMin' | 'rangeMax',
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value.trim();
    if (raw === '') {
      onOptionsChange({ [field]: null });
    } else {
      const v = parseFloat(raw);
      if (!isNaN(v)) {
        onOptionsChange({ [field]: v });
      }
    }
  };

  return (
    <div
      style={{
        background: 'var(--ctrl)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '6px 12px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        {/* ── File upload ── */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.nde"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => fileRef.current?.click()}
          title="Load scan file (.csv, .nde)"
        >
          <Upload className="w-4 h-4" />
          Open
        </button>

        {/* ── Separator ── */}
        <Separator />

        {/* ── Nominal wall ── */}
        <ControlGroup label="Nominal (mm)">
          <input
            type="number"
            min={0.01}
            step={0.1}
            value={surfaceOptions.nominalThickness ?? ''}
            onChange={handleNominalChange}
            placeholder={autoNominal != null ? autoNominal.toFixed(1) : 'auto'}
            title="Nominal wall thickness — leave blank for auto-detect"
            style={inputStyle(64)}
          />
        </ControlGroup>

        <Separator />

        {/* ── Z-Scale slider ── */}
        <ControlGroup label={`Z-Scale: ${surfaceOptions.exaggeration}x`}>
          <input
            type="range"
            min={1}
            max={50}
            value={surfaceOptions.exaggeration}
            onChange={(e) => onOptionsChange({ exaggeration: Number(e.target.value) })}
            style={{ width: 90, accentColor: 'var(--accent-primary)' }}
          />
        </ControlGroup>

        <button
          className="btn btn--sm btn--ghost"
          onClick={() => onOptionsChange({ exaggeration: 1 })}
          title="Reset to true scale (1:1)"
        >
          <RotateCcw className="w-4 h-4" />
          1:1
        </button>

        <Separator />

        {/* ── Colorscale dropdown ── */}
        <ControlGroup label="Color">
          <select
            value={surfaceOptions.colorScale}
            onChange={(e) => onOptionsChange({ colorScale: e.target.value })}
            style={selectStyle()}
          >
            {colorScaleNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </ControlGroup>

        {/* ── Reverse toggle ── */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title="Reverse colorscale direction"
        >
          <input
            type="checkbox"
            checked={surfaceOptions.reverseScale}
            onChange={(e) => onOptionsChange({ reverseScale: e.target.checked })}
            style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rev</span>
        </label>

        <Separator />

        {/* ── Range inputs ── */}
        <ControlGroup label="Range">
          <input
            type="number"
            step={0.1}
            value={surfaceOptions.rangeMin ?? ''}
            onChange={(e) => handleRangeChange('rangeMin', e)}
            placeholder="auto"
            title="Minimum colorscale value — leave blank for auto"
            style={inputStyle(56)}
          />
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9a968f)' }}>&ndash;</span>
          <input
            type="number"
            step={0.1}
            value={surfaceOptions.rangeMax ?? ''}
            onChange={(e) => handleRangeChange('rangeMax', e)}
            placeholder="auto"
            title="Maximum colorscale value — leave blank for auto"
            style={inputStyle(56)}
          />
        </ControlGroup>

        <Separator />

        {/* ── Denoise toggle ── */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title="Apply median filter to remove isolated spike noise before rendering"
        >
          <input
            type="checkbox"
            checked={surfaceOptions.denoiseRadius != null}
            onChange={(e) =>
              onOptionsChange({
                denoiseRadius: e.target.checked ? 1 : null,
              })
            }
            style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Denoise
          </span>
        </label>
        {surfaceOptions.denoiseRadius != null && (
          <select
            value={surfaceOptions.denoiseRadius}
            onChange={(e) => onOptionsChange({ denoiseRadius: Number(e.target.value) })}
            title="Median filter kernel size"
            style={selectStyle()}
          >
            <option value={1}>3×3</option>
            <option value={2}>5×5</option>
          </select>
        )}

        <Separator />

        {/* ── Clamp outliers toggle ── */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          title="Clamp positive displacement outliers in geometry only — values stay raw"
        >
          <input
            type="checkbox"
            checked={surfaceOptions.displacementClampUpper != null}
            onChange={(e) =>
              onOptionsChange({
                displacementClampUpper: e.target.checked ? 2 : null,
              })
            }
            style={{ width: 14, height: 14, accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Clamp outliers
          </span>
        </label>
        {surfaceOptions.displacementClampUpper != null && (
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={surfaceOptions.displacementClampUpper}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) {
                onOptionsChange({ displacementClampUpper: v });
              }
            }}
            title="Max displacement above nominal (mm, pre-exaggeration)"
            style={inputStyle(52)}
          />
        )}

        <Separator />

        {/* ── Tool buttons (radio-style) ── */}
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden' }}>
          {TOOL_DEFS.map(({ id, icon: Icon, label }) => {
            const active = activeTool === id;
            return (
              <button
                key={id}
                onClick={() => onToolChange(id)}
                title={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  background: active ? 'var(--accent-primary)' : 'var(--ctrl-lo, #c4c1bb)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Tiny layout helpers ── */

function Separator() {
  return (
    <div
      style={{
        width: 1,
        height: 22,
        background: 'var(--glass-border)',
        flexShrink: 0,
      }}
    />
  );
}

function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {label}:
      </span>
      {children}
    </div>
  );
}

/* ── Shared inline-style builders ── */

function inputStyle(width: number): React.CSSProperties {
  return {
    width,
    padding: '4px 6px',
    fontSize: 12,
    color: 'var(--text-primary)',
    background: 'var(--ctrl-lo, #c4c1bb)',
    border: '1px solid var(--glass-border)',
    borderRadius: 4,
    outline: 'none',
  };
}

function selectStyle(): React.CSSProperties {
  return {
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--text-primary)',
    background: 'var(--ctrl-lo, #c4c1bb)',
    border: '1px solid var(--glass-border)',
    borderRadius: 4,
    outline: 'none',
    cursor: 'pointer',
  };
}
