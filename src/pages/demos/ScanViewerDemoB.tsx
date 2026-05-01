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

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ScanViewerDemoB() {
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

      <div className="ind-b__body">
        <div className="ind-plate ind-b__panel">
          {/* Directory bar */}
          <div className="ind-b__section">
            <div className="ind-well ind-dirbar">
              <span className="ind-dirbar__icon"><FolderIcon /></span>
              <span className="ind-dirbar__path">{DIR}</span>
              <div className="ind-dirbar__actions">
                <button className="ind-btn ind-btn--sm">Browse</button>
                <button className="ind-btn ind-btn--sm">Refresh</button>
              </div>
            </div>
          </div>

          {/* NDE folder selection */}
          <div className="ind-b__section">
            <div className="ind-b__section-head">
              <p className="ind-stamp">NDE Folders</p>
              <span className={`ind-count ${selNde.length > 0 ? 'ind-count--active' : 'ind-count--zero'}`}>
                {selNde.length}
              </span>
            </div>

            <div className="ind-well ind-b__grid">
              {NDE.map(f => (
                <div
                  key={f.name}
                  className={`ind-b__card ${selNde.includes(f.name) ? 'ind-b__card--selected' : ''}`}
                  onClick={() => toggleNde(f.name)}
                >
                  <div className={`ind-led ${selNde.includes(f.name) ? 'ind-led--on' : 'ind-led--off'}`} />
                  <div className="ind-b__card-info">
                    <span className="ind-folder__name">{f.name}</span>
                    <span className="ind-folder__meta">{f.files} files, {f.size}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate CTA */}
          <button
            className="ind-btn ind-btn--green ind-btn--lg ind-btn--full"
            disabled={selNde.length === 0}
          >
            {selNde.length === 0
              ? 'Select folders to generate'
              : `Generate Composite from ${selNde.length} folder${selNde.length > 1 ? 's' : ''}`}
            {selNde.length > 0 && <ArrowIcon />}
          </button>

          <div className="ind-groove" />

          {/* Eddify conversion */}
          <div className="ind-b__section">
            <div className="ind-b__section-head">
              <p className="ind-stamp">Eddify Conversion</p>
              <span className="ind-badge ind-badge--eddify">{EDD.length} files</span>
            </div>

            <div className="ind-well ind-b__eddify-well">
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

              {selEdd.length > 0 && (
                <>
                  <div className="ind-groove" />
                  <div className="ind-b__convert-row">
                    <input
                      className="ind-input"
                      value={outputName}
                      onChange={e => setOutputName(e.target.value)}
                      placeholder="Output folder name"
                    />
                    <button className="ind-btn ind-btn--green" disabled={!outputName}>
                      Convert {selEdd.length}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="ind-tag">B: Focused Sequence</div>
    </div>
  );
}
