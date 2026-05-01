import { useState, useCallback } from 'react';
import './scan-viewer-demos.css';

const DIR = 'C:\\Inspections\\2026\\Vessel-A\\Scans';

const NDE = [
  { name: 'Zone-A-01', files: 24, size: '48.2 MB' },
  { name: 'Zone-A-02', files: 18, size: '36.1 MB' },
  { name: 'Zone-A-03', files: 31, size: '62.4 MB' },
  { name: 'Zone-A-04', files: 22, size: '44.0 MB' },
  { name: 'Zone-A-05', files: 16, size: '32.8 MB' },
  { name: 'Zone-A-06', files: 28, size: '55.9 MB' },
  { name: 'Zone-A-07', files: 20, size: '40.3 MB' },
  { name: 'Zone-A-08', files: 14, size: '28.7 MB' },
];

const EDD = [
  { name: 'ZoneA-Scan001.capture_acq', size: '112.5 MB' },
  { name: 'ZoneA-Scan002.capture_acq', size: '98.3 MB' },
  { name: 'ZoneA-Scan003.capture_acq', size: '104.1 MB' },
];

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6L7.5 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function ScanViewerDemoA() {
  const [selNde, setSelNde] = useState<string[]>([]);
  const [selEdd, setSelEdd] = useState<string[]>(['ZoneA-Scan001.capture_acq', 'ZoneA-Scan002.capture_acq']);
  const [outputName, setOutputName] = useState('ZoneA-Scan');

  const toggleNde = useCallback((n: string) => {
    setSelNde(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]);
  }, []);

  const toggleEdd = useCallback((n: string) => {
    setSelEdd(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]);
  }, []);

  return (
    <div className="ind">
      <div className="ind-header">
        <div className="ind-header__led" />
        <div>
          <h1 className="ind-header__title">Scan Viewer</h1>
          <p className="ind-header__sub">Select NDE folders to generate a composite view</p>
        </div>
      </div>

      <div className="ind-a__body">
        {/* Left plate: directory + NDE folders */}
        <div className="ind-plate ind-a__panel">
          <div className="ind-well ind-dirbar">
            <span className="ind-dirbar__icon"><FolderIcon /></span>
            <span className="ind-dirbar__path">{DIR}</span>
            <div className="ind-dirbar__actions">
              <button className="ind-btn ind-btn--sm">Browse</button>
              <button className="ind-btn ind-btn--sm">Refresh</button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="ind-stamp">NDE Folders</p>
            <span className={`ind-count ${selNde.length > 0 ? 'ind-count--active' : 'ind-count--zero'}`}>
              {selNde.length}
            </span>
          </div>

          <div className="ind-well ind-a__list">
            {NDE.map(f => (
              <div
                key={f.name}
                className={`ind-folder ${selNde.includes(f.name) ? 'ind-folder--selected' : ''}`}
                onClick={() => toggleNde(f.name)}
              >
                <div className={`ind-led ${selNde.includes(f.name) ? 'ind-led--on' : 'ind-led--off'}`} />
                <span className="ind-folder__name">{f.name}</span>
                <span className="ind-badge ind-badge--nde">NDE</span>
                <span className="ind-folder__meta">{f.files} files</span>
                <span className="ind-folder__meta">{f.size}</span>
              </div>
            ))}
          </div>

          <div className="ind-a__footer">
            <span className="ind-a__footer-text">
              {selNde.length === 0
                ? 'No folders selected'
                : `${selNde.length} folder${selNde.length > 1 ? 's' : ''} selected`}
            </span>
            <button className="ind-btn ind-btn--green" disabled={selNde.length === 0}>
              Generate Composite
            </button>
          </div>
        </div>

        {/* Seam between plates */}
        <div className="ind-a__seam" />

        {/* Right plate: eddify files + conversion */}
        <div className="ind-plate ind-a__panel--right">
          <div className="flex items-center justify-between">
            <p className="ind-stamp">Eddify Files</p>
            <span className="ind-badge ind-badge--eddify">{EDD.length} available</span>
          </div>

          <div className="ind-well ind-a__list">
            {EDD.map(f => (
              <div
                key={f.name}
                className={`ind-folder ${selEdd.includes(f.name) ? 'ind-folder--selected' : ''}`}
                onClick={() => toggleEdd(f.name)}
              >
                <div className={`ind-led ${selEdd.includes(f.name) ? 'ind-led--on' : 'ind-led--off'}`} />
                <span className="ind-folder__name">{f.name}</span>
                <span className="ind-folder__meta">{f.size}</span>
              </div>
            ))}
          </div>

          {selEdd.length > 0 && (
            <>
              <div className="ind-groove" />
              <div className="flex flex-col gap-3">
                <p className="ind-stamp">Convert to NDE</p>
                <div className="flex items-center gap-3">
                  <input
                    className="ind-input flex-1"
                    value={outputName}
                    onChange={e => setOutputName(e.target.value)}
                    placeholder="Output folder name"
                  />
                  <button className="ind-btn ind-btn--green" disabled={!outputName}>
                    Convert
                  </button>
                </div>
                <span className="ind-text-meta">
                  {selEdd.length} file{selEdd.length > 1 ? 's' : ''} selected for conversion
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ind-tag">A: Split Panel</div>
    </div>
  );
}
