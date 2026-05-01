import { useState, useCallback } from 'react';
import './scan-viewer-demos.css';

const DIR = 'C:\\Inspections\\2026\\Vessel-A\\Scans';

type ViewTab = 'nde' | 'eddify';

const NDE = [
  { name: 'Zone-A-01', files: 24, size: '48.2 MB', modified: '2026-04-28' },
  { name: 'Zone-A-02', files: 18, size: '36.1 MB', modified: '2026-04-28' },
  { name: 'Zone-A-03', files: 31, size: '62.4 MB', modified: '2026-04-27' },
  { name: 'Zone-A-04', files: 22, size: '44.0 MB', modified: '2026-04-27' },
  { name: 'Zone-A-05', files: 16, size: '32.8 MB', modified: '2026-04-26' },
  { name: 'Zone-A-06', files: 28, size: '55.9 MB', modified: '2026-04-26' },
  { name: 'Zone-A-07', files: 20, size: '40.3 MB', modified: '2026-04-25' },
  { name: 'Zone-A-08', files: 14, size: '28.7 MB', modified: '2026-04-25' },
];

const EDD = [
  { name: 'ZoneA-Scan001.capture_acq', size: '112.5 MB', modified: '2026-04-28' },
  { name: 'ZoneA-Scan002.capture_acq', size: '98.3 MB', modified: '2026-04-27' },
  { name: 'ZoneA-Scan003.capture_acq', size: '104.1 MB', modified: '2026-04-26' },
];

const RECENT = [
  { label: 'Vessel-A', active: true },
  { label: 'Vessel-B', active: false },
  { label: 'Tank-12', active: false },
];

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="ind-c__sidebar-icon">
      <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6L7.5 4.5H12.5C13.33 4.5 14 5.17 14 6V11.5C14 12.33 13.33 13 12.5 13H3.5C2.67 13 2 12.33 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="ind-c__sidebar-icon">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function ScanViewerDemoC() {
  const [selNde, setSelNde] = useState<string[]>([]);
  const [selEdd, setSelEdd] = useState<string[]>([]);
  const [outputName, setOutputName] = useState('');
  const [tab, setTab] = useState<ViewTab>('nde');

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

      <div className="ind-c__body">
        {/* Sidebar panel */}
        <div className="ind-plate ind-c__sidebar">
          <div className="ind-well ind-dirbar">
            <span className="ind-dirbar__icon"><FolderIcon /></span>
            <span className="ind-dirbar__path" title={DIR}>...\\Vessel-A\\Scans</span>
          </div>

          <button className="ind-btn ind-btn--sm ind-btn--full">Browse</button>

          <div className="ind-c__sidebar-section">
            <p className="ind-stamp">Recent</p>
            {RECENT.map(d => (
              <button
                key={d.label}
                className={`ind-c__sidebar-item ${d.active ? 'ind-c__sidebar-item--active' : ''}`}
              >
                <ClockIcon />
                {d.label}
              </button>
            ))}
          </div>

          <div className="ind-groove" />

          <div className="ind-c__sidebar-section">
            <p className="ind-stamp">View</p>
            <button
              className={`ind-c__sidebar-item ${tab === 'nde' ? 'ind-c__sidebar-item--active' : ''}`}
              onClick={() => setTab('nde')}
            >
              <div className={`ind-led ${tab === 'nde' ? 'ind-led--on' : 'ind-led--off'}`} />
              NDE Folders
              <span className="ind-count ind-count--zero ml-auto">{NDE.length}</span>
            </button>
            <button
              className={`ind-c__sidebar-item ${tab === 'eddify' ? 'ind-c__sidebar-item--active' : ''}`}
              onClick={() => setTab('eddify')}
            >
              <div className={`ind-led ${tab === 'eddify' ? 'ind-led--on' : 'ind-led--off'}`} />
              Eddify Files
              <span className="ind-count ind-count--zero ml-auto">{EDD.length}</span>
            </button>
          </div>
        </div>

        {/* Main content panel */}
        <div className="ind-plate ind-c__main">
          {tab === 'nde' ? (
            <>
              <div className="flex items-center justify-between">
                <p className="ind-stamp">NDE Folders ({NDE.length})</p>
                <button className="ind-btn ind-btn--sm">Refresh Index</button>
              </div>

              <div className="ind-c__table-head">
                <span />
                <span>Name</span>
                <span>Files</span>
                <span>Size</span>
                <span>Modified</span>
              </div>

              <div className="ind-well ind-c__table-list">
                {NDE.map(f => (
                  <div
                    key={f.name}
                    className={`ind-c__table-row ${selNde.includes(f.name) ? 'ind-c__table-row--selected' : ''}`}
                    onClick={() => toggleNde(f.name)}
                  >
                    <div className={`ind-led ${selNde.includes(f.name) ? 'ind-led--on' : 'ind-led--off'}`} />
                    <span className="ind-c__cell ind-c__cell--name">{f.name}</span>
                    <span className="ind-c__cell ind-c__cell--mono">{f.files}</span>
                    <span className="ind-c__cell ind-c__cell--mono">{f.size}</span>
                    <span className="ind-c__cell ind-c__cell--mono">{f.modified}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="ind-stamp">Eddify Files ({EDD.length})</p>
              </div>

              <div className="ind-c__table-head">
                <span />
                <span>Name</span>
                <span>Size</span>
                <span>Modified</span>
                <span />
              </div>

              <div className="ind-well ind-c__table-list">
                {EDD.map(f => (
                  <div
                    key={f.name}
                    className={`ind-c__table-row ${selEdd.includes(f.name) ? 'ind-c__table-row--selected' : ''}`}
                    onClick={() => toggleEdd(f.name)}
                  >
                    <div className={`ind-led ${selEdd.includes(f.name) ? 'ind-led--on' : 'ind-led--off'}`} />
                    <span className="ind-c__cell ind-c__cell--name">{f.name}</span>
                    <span className="ind-c__cell ind-c__cell--mono">{f.size}</span>
                    <span className="ind-c__cell ind-c__cell--mono">{f.modified}</span>
                    <span />
                  </div>
                ))}
              </div>

              {selEdd.length > 0 && (
                <div className="ind-c__convert-row">
                  <p className="ind-stamp">Output</p>
                  <input
                    className="ind-input"
                    value={outputName}
                    onChange={e => setOutputName(e.target.value)}
                    placeholder="Folder name"
                  />
                  <button className="ind-btn ind-btn--sm" disabled={!outputName}>
                    Convert {selEdd.length}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="ind-plate ind-c__action-bar">
          <div className="ind-c__action-info">
            <span className={`ind-count ${selNde.length > 0 ? 'ind-count--active' : 'ind-count--zero'}`}>
              {selNde.length}
            </span>
            <span>NDE folder{selNde.length !== 1 ? 's' : ''} selected</span>
          </div>
          <button className="ind-btn ind-btn--green" disabled={selNde.length === 0}>
            Generate Composite
          </button>
        </div>
      </div>

      <div className="ind-tag">C: File Commander</div>
    </div>
  );
}
