import { useRef, useState, useCallback } from 'react';
import {
  Upload,
  Download,
  FolderOpen,
  Palette,
  Wrench,
  Box,
  Sun,
  ChevronDown,
} from 'lucide-react';
import { COLOR_SCALES } from '../../utils/colorscales';
import type { SurfaceOptions } from './types';

const colorScaleNames = Object.keys(COLOR_SCALES);

type SectionId = 'file' | 'surface' | 'processing' | 'geometry' | 'lighting';

interface TopologyToolbarProps {
  surfaceOptions: SurfaceOptions;
  onOptionsChange: (updates: Partial<SurfaceOptions>) => void;
  onFileUpload: (files: FileList) => void;
  onExport: () => void;
  hasData: boolean;
  autoNominal: number | null;
  lightAzimuth: number;
  lightElevation: number;
  onLightChange: (updates: { azimuth?: number; elevation?: number }) => void;
}

export default function TopologyToolbar({
  surfaceOptions,
  onOptionsChange,
  onFileUpload,
  onExport,
  hasData,
  autoNominal,
  lightAzimuth,
  lightElevation,
  onLightChange,
}: TopologyToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId | null>('surface');
  const toggle = useCallback((id: SectionId) => {
    setActiveSection(prev => (prev === id ? null : id));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="topo-sidebar">
      {/* Header */}
      <div style={{
        padding: '14px 15px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        flexShrink: 0,
      }}>
        <h2 style={{
          margin: 0, fontSize: '0.95rem', color: 'rgba(255,255,255,0.95)',
          fontWeight: 700, letterSpacing: '0.02em',
        }}>
          Topology Viewer
        </h2>
      </div>

      {/* Scrollable sections */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── File ── */}
        <TopoSection id="file" title="File" icon={<FolderOpen size={14} />} active={activeSection} onToggle={toggle}>
          <input ref={fileRef} type="file" accept=".csv,.nde" multiple onChange={handleFileChange} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="topo-toggle-btn active" onClick={() => fileRef.current?.click()} style={{ flex: 1 }}>
              <Upload size={13} /> Open
            </button>
            <button className={`topo-toggle-btn ${hasData ? 'active' : ''}`} onClick={onExport} disabled={!hasData} style={{ flex: 1, opacity: hasData ? 1 : 0.4 }}>
              <Download size={13} /> Export
            </button>
          </div>
        </TopoSection>

        {/* ── Surface ── */}
        <TopoSection id="surface" title="Surface" icon={<Palette size={14} />} active={activeSection} onToggle={toggle}>
          <div className="topo-control">
            <div className="topo-label">
              <span>Nominal (mm)</span>
              <span className="topo-val">
                {surfaceOptions.nominalThickness != null
                  ? surfaceOptions.nominalThickness.toFixed(1)
                  : autoNominal != null ? `${autoNominal.toFixed(1)} auto` : 'auto'}
              </span>
            </div>
            <input
              type="number"
              className="topo-input"
              min={0.01}
              step={0.1}
              value={surfaceOptions.nominalThickness ?? ''}
              onChange={e => {
                const raw = e.target.value.trim();
                onOptionsChange({ nominalThickness: raw === '' ? null : parseFloat(raw) || null });
              }}
              placeholder={autoNominal != null ? autoNominal.toFixed(1) : 'auto'}
            />
          </div>

          <TopoSlider label="Z-Scale" value={surfaceOptions.exaggeration} min={0.1} max={4} step={0.1} unit="x" onChange={v => onOptionsChange({ exaggeration: v })} />

          <div className="topo-control">
            <div className="topo-label"><span>Colorscale</span></div>
            <select className="topo-input" value={surfaceOptions.colorScale} onChange={e => onOptionsChange({ colorScale: e.target.value })} style={{ cursor: 'pointer' }}>
              {colorScaleNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>

          <div className="topo-control">
            <label className="topo-check">
              <input type="checkbox" checked={surfaceOptions.reverseScale} onChange={e => onOptionsChange({ reverseScale: e.target.checked })} />
              Reverse scale
            </label>
          </div>

          <div className="topo-control">
            <div className="topo-label"><span>Range (mm)</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" className="topo-input" step={0.1} value={surfaceOptions.rangeMin ?? ''} onChange={e => { const r = e.target.value.trim(); onOptionsChange({ rangeMin: r === '' ? null : parseFloat(r) }); }} placeholder="auto" style={{ flex: 1 }} />
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>&ndash;</span>
              <input type="number" className="topo-input" step={0.1} value={surfaceOptions.rangeMax ?? ''} onChange={e => { const r = e.target.value.trim(); onOptionsChange({ rangeMax: r === '' ? null : parseFloat(r) }); }} placeholder="auto" style={{ flex: 1 }} />
            </div>
          </div>
        </TopoSection>

        {/* ── Processing ── */}
        <TopoSection id="processing" title="Processing" icon={<Wrench size={14} />} active={activeSection} onToggle={toggle}>
          <div className="topo-control">
            <label className="topo-check">
              <input type="checkbox" checked={surfaceOptions.denoiseRadius != null} onChange={e => onOptionsChange({ denoiseRadius: e.target.checked ? 1 : null })} />
              Denoise
            </label>
            {surfaceOptions.denoiseRadius != null && (
              <select className="topo-input" value={surfaceOptions.denoiseRadius} onChange={e => onOptionsChange({ denoiseRadius: Number(e.target.value) })} style={{ marginTop: 6, cursor: 'pointer' }}>
                <option value={1}>3×3 kernel</option>
                <option value={2}>5×5 kernel</option>
              </select>
            )}
          </div>

          <TopoSlider label="Gap Fill" value={surfaceOptions.gapFillRadius} min={0} max={5} step={1} unit="" onChange={v => onOptionsChange({ gapFillRadius: v })} />

          <div className="topo-control">
            <label className="topo-check">
              <input type="checkbox" checked={surfaceOptions.displacementClampUpper != null} onChange={e => onOptionsChange({ displacementClampUpper: e.target.checked ? 2 : null })} />
              Clamp outliers
            </label>
            {surfaceOptions.displacementClampUpper != null && (
              <div style={{ marginTop: 6 }}>
                <div className="topo-label">
                  <span>Max displacement (mm)</span>
                  <span className="topo-val">{surfaceOptions.displacementClampUpper}</span>
                </div>
                <input type="number" className="topo-input" min={0.1} step={0.5} value={surfaceOptions.displacementClampUpper} onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) onOptionsChange({ displacementClampUpper: v }); }} />
              </div>
            )}
          </div>
        </TopoSection>

        {/* ── Geometry ── */}
        <TopoSection id="geometry" title="Geometry" icon={<Box size={14} />} active={activeSection} onToggle={toggle}>
          <div className="topo-control">
            <div className="topo-label"><span>View Mode</span></div>
            <div className="topo-toggle-group">
              {(['flat', 'cylinder'] as const).map(mode => (
                <button key={mode} className={`topo-toggle-btn ${surfaceOptions.viewMode === mode ? 'active' : ''}`} onClick={() => onOptionsChange({ viewMode: mode })}>
                  {mode === 'flat' ? 'Flat' : 'Cylinder'}
                </button>
              ))}
            </div>
          </div>
          {surfaceOptions.viewMode === 'cylinder' && (
            <div className="topo-control">
              <div className="topo-label">
                <span>Pipe OD (mm)</span>
                {surfaceOptions.pipeDiameter != null && <span className="topo-val">{surfaceOptions.pipeDiameter}</span>}
              </div>
              <input type="number" className="topo-input" min={1} step={1} value={surfaceOptions.pipeDiameter ?? ''} onChange={e => { const raw = e.target.value.trim(); if (raw === '') { onOptionsChange({ pipeDiameter: null }); } else { const v = parseFloat(raw); if (!isNaN(v) && v > 0) onOptionsChange({ pipeDiameter: v }); }}} placeholder="e.g. 323.9" />
            </div>
          )}
        </TopoSection>

        {/* ── Lighting ── */}
        <TopoSection id="lighting" title="Lighting" icon={<Sun size={14} />} active={activeSection} onToggle={toggle}>
          <TopoSlider label="Azimuth" value={lightAzimuth} min={0} max={360} step={5} unit="°" onChange={v => onLightChange({ azimuth: v })} />
          <TopoSlider label="Elevation" value={lightElevation} min={0} max={90} step={5} unit="°" onChange={v => onLightChange({ elevation: v })} />
        </TopoSection>

      </div>
    </div>
  );
}

/* ── Local components ── */

function TopoSection({ id, title, icon, active, onToggle, children }: {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  active: SectionId | null;
  onToggle: (id: SectionId) => void;
  children: React.ReactNode;
}) {
  const open = active === id;
  return (
    <div className={`topo-section ${open ? '' : 'collapsed'}`}>
      <div className="topo-section-header" onClick={() => onToggle(id)}>
        <h3 className="topo-section-title">{icon}<span style={{ marginLeft: 6 }}>{title}</span></h3>
        <ChevronDown size={14} className="topo-chevron" />
      </div>
      <div className="topo-section-content">{children}</div>
    </div>
  );
}

function TopoSlider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="topo-control">
      <div className="topo-label">
        <span>{label}</span>
        <span className="topo-val">{value}{unit}</span>
      </div>
      <div className="topo-slider-row">
        <input type="range" className="topo-slider" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
        <input type="number" className="topo-input" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      </div>
    </div>
  );
}
