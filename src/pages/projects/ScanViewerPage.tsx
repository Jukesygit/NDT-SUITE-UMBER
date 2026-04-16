/**
 * ScanViewerPage — interactive C-scan viewer with B-scan/A-scan cursors.
 *
 * State is managed via useReducer; child components read state and dispatch actions.
 * Composite data is loaded from the companion (if connected) or from Supabase.
 */

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useProjectVessel, useProjectScanComposites } from '../../hooks/queries/useInspectionProjects';
import { useCompanionApp } from '../../hooks/queries/useCompanionApp';
import { useAuth } from '../../contexts/AuthContext';
import { useScanViewerDirty } from '../../hooks/useScanViewerDirty';
import { getScanCompositeData } from '../../services/scan-composite-service';
import CscanHeatmap from '../../components/projects/scan-viewer/CscanHeatmap';
import BscanStrip from '../../components/projects/scan-viewer/BscanStrip';
import AscanWaveform from '../../components/projects/scan-viewer/AscanWaveform';
import GateControlsSidebar from '../../components/projects/scan-viewer/GateControlsSidebar';
import ScanViewerToolbar from '../../components/projects/scan-viewer/ScanViewerToolbar';
import type { CompositeData, GateSettings } from '../../types/companion';
import { DEFAULT_GATE_SETTINGS } from '../../types/companion';

// ---------------------------------------------------------------------------
// State & Reducer
// ---------------------------------------------------------------------------

interface ScanViewerState {
  selectedSection: string | null;
  composite: CompositeData | null;
  isLoading: boolean;
  error: string | null;
  cursorScanMm: number;
  cursorIndexMm: number;
  gateSettings: GateSettings;
  savedGateSettings: GateSettings;
  colormap: string;
  companionPort: number | null;
  folders: string[];
}

type ScanViewerAction =
  | { type: 'SELECT_SECTION'; section: string }
  | { type: 'SET_COMPOSITE'; data: CompositeData }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'UPDATE_CURSOR'; scanMm: number; indexMm: number }
  | { type: 'UPDATE_GATE_SETTINGS'; settings: Partial<GateSettings> }
  | { type: 'SET_COLORMAP'; colormap: string }
  | { type: 'MARK_SAVED' }
  | { type: 'SET_COMPANION'; port: number | null; folders: string[] };

function reducer(state: ScanViewerState, action: ScanViewerAction): ScanViewerState {
  switch (action.type) {
    case 'SELECT_SECTION':
      return { ...state, selectedSection: action.section, composite: null, isLoading: true, error: null };
    case 'SET_COMPOSITE': {
      const d = action.data;
      const midX = d.xAxis.length > 0 ? d.xAxis[Math.floor(d.xAxis.length / 2)] : 0;
      const midY = d.yAxis.length > 0 ? d.yAxis[Math.floor(d.yAxis.length / 2)] : 0;
      return { ...state, composite: d, isLoading: false, error: null, cursorScanMm: midX, cursorIndexMm: midY };
    }
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };
    case 'UPDATE_CURSOR':
      return { ...state, cursorScanMm: action.scanMm, cursorIndexMm: action.indexMm };
    case 'UPDATE_GATE_SETTINGS':
      return { ...state, gateSettings: { ...state.gateSettings, ...action.settings } };
    case 'SET_COLORMAP':
      return { ...state, colormap: action.colormap };
    case 'MARK_SAVED':
      return { ...state, savedGateSettings: { ...state.gateSettings } };
    case 'SET_COMPANION':
      return { ...state, companionPort: action.port, folders: action.folders };
    default:
      return state;
  }
}

const initialState: ScanViewerState = {
  selectedSection: null,
  composite: null,
  isLoading: false,
  error: null,
  cursorScanMm: 0,
  cursorIndexMm: 0,
  gateSettings: { ...DEFAULT_GATE_SETTINGS },
  savedGateSettings: { ...DEFAULT_GATE_SETTINGS },
  colormap: 'viridis',
  companionPort: null,
  folders: [],
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ScanViewerPage() {
  const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const { profile } = useAuth();
  const canEdit = !!profile && !['viewer'].includes(profile.role ?? '');

  const { data: vessel } = useProjectVessel(vesselId);
  const { data: composites } = useProjectScanComposites(vesselId ? [vesselId] : []);
  const { connected, port } = useCompanionApp();

  const [state, dispatch] = useReducer(reducer, initialState);

  const dirty = useScanViewerDirty({
    projectId: projectId ?? '',
    vesselId: vesselId ?? '',
    section: state.selectedSection,
    gateSettings: state.gateSettings,
    savedGateSettings: state.savedGateSettings,
  });

  // Sections that have composites
  const sections = useMemo(() => {
    if (!composites) return [];
    const seen = new Set<string>();
    for (const c of composites) {
      if (c.section_type) seen.add(c.section_type);
    }
    return Array.from(seen);
  }, [composites]);

  // Default to ?section param or first available section
  useEffect(() => {
    if (state.selectedSection) return;
    const target = sectionParam && sections.includes(sectionParam) ? sectionParam : sections[0];
    if (target) dispatch({ type: 'SELECT_SECTION', section: target });
  }, [sections, sectionParam, state.selectedSection]);

  // Track companion connection
  useEffect(() => {
    if (!vessel) return;
    const folderMap = vessel.section_folder_map ?? {};
    const sectionFolders = state.selectedSection ? folderMap[state.selectedSection] ?? [] : [];
    dispatch({ type: 'SET_COMPANION', port: connected ? port : null, folders: sectionFolders });
  }, [connected, port, vessel, state.selectedSection]);

  // Load composite data when section changes
  useEffect(() => {
    if (!state.selectedSection || !composites) return;

    const match = composites.find(c => c.section_type === state.selectedSection);
    if (!match) {
      dispatch({ type: 'SET_ERROR', error: `No composite found for section "${state.selectedSection}"` });
      return;
    }

    let cancelled = false;
    dispatch({ type: 'SET_LOADING', loading: true });

    getScanCompositeData(match.id)
      .then(data => { if (!cancelled) dispatch({ type: 'SET_COMPOSITE', data }); })
      .catch(err => { if (!cancelled) dispatch({ type: 'SET_ERROR', error: err.message }); });

    return () => { cancelled = true; };
  }, [state.selectedSection, composites]);

  const handleCursorMove = useCallback((scanMm: number, indexMm: number) => {
    dispatch({ type: 'UPDATE_CURSOR', scanMm, indexMm });
  }, []);

  if (!projectId || !vesselId) {
    return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Invalid route parameters</div>;
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '260px 1fr',
      gridTemplateRows: 'auto 1fr auto',
      height: '100vh',
      background: 'var(--surface-base)',
      color: 'var(--text-primary)',
    }}>
      {/* Header */}
      <div style={{
        gridColumn: '1 / -1',
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a
            href={`/projects/${projectId}/vessels/${vesselId}`}
            style={{ fontSize: '0.8rem', color: '#60a5fa', textDecoration: 'none' }}
          >
            Back to inspection
          </a>
          <span style={{ color: 'var(--text-quaternary)' }}>/</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            {vessel?.vessel_name ?? 'Scan Viewer'}
          </span>
        </div>

        {/* Section selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sections.map(s => (
            <button
              key={s}
              onClick={() => dispatch({ type: 'SELECT_SECTION', section: s })}
              style={{
                fontSize: '0.75rem',
                padding: '4px 12px',
                borderRadius: 4,
                border: `1px solid ${s === state.selectedSection ? '#3b82f6' : 'var(--border-subtle)'}`,
                background: s === state.selectedSection ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: s === state.selectedSection ? '#93c5fd' : 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Left sidebar — gate controls */}
      <div style={{
        gridRow: '2',
        borderRight: '1px solid var(--border-subtle)',
        padding: 12,
        overflowY: 'auto',
      }}>
        <GateControlsSidebar
          gateSettings={state.gateSettings}
          onChange={settings => dispatch({ type: 'UPDATE_GATE_SETTINGS', settings })}
          readOnly={!canEdit}
        />
      </div>

      {/* Main content area */}
      <div style={{ gridRow: '2', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Draft restore banner */}
        {dirty.hasDraft && (
          <div style={{
            padding: '6px 16px',
            background: 'rgba(59,130,246,0.1)',
            borderBottom: '1px solid rgba(59,130,246,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
          }}>
            <span style={{ color: '#93c5fd' }}>
              Unsaved draft found{dirty.draftTimestamp ? ` (${new Date(dirty.draftTimestamp).toLocaleString()})` : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  const draft = dirty.restoreDraft();
                  if (draft) dispatch({ type: 'UPDATE_GATE_SETTINGS', settings: draft });
                }}
                style={{ fontSize: '0.72rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Restore
              </button>
              <button
                onClick={dirty.discardDraft}
                style={{ fontSize: '0.72rem', color: 'var(--text-quaternary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {state.isLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Loading composite...
          </div>
        )}
        {state.error && (
          <div style={{ padding: 24, textAlign: 'center', color: '#ef4444' }}>
            {state.error}
          </div>
        )}
        {state.composite && !state.isLoading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, padding: 8, overflow: 'auto' }}>
            {/* C-scan heatmap */}
            <div style={{ flex: 2, minHeight: 300 }}>
              <CscanHeatmap
                composite={state.composite}
                cursorScanMm={state.cursorScanMm}
                cursorIndexMm={state.cursorIndexMm}
                colormap={state.colormap}
                onCursorMove={handleCursorMove}
              />
            </div>

            {/* B-scan strips */}
            <div style={{ display: 'flex', gap: 4 }}>
              <BscanStrip
                type="bscan-axial"
                port={state.companionPort}
                folders={state.folders}
                scanMm={state.cursorScanMm}
                indexMm={state.cursorIndexMm}
                gateSettings={state.gateSettings}
              />
              <BscanStrip
                type="bscan-index"
                port={state.companionPort}
                folders={state.folders}
                scanMm={state.cursorScanMm}
                indexMm={state.cursorIndexMm}
                gateSettings={state.gateSettings}
              />
            </div>

            {/* A-scan */}
            <AscanWaveform
              port={state.companionPort}
              folders={state.folders}
              scanMm={state.cursorScanMm}
              indexMm={state.cursorIndexMm}
              gateSettings={state.gateSettings}
            />
          </div>
        )}
      </div>

      {/* Footer toolbar */}
      <div style={{
        gridColumn: '1 / -1',
        padding: '8px 16px',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <ScanViewerToolbar
          colormap={state.colormap}
          onColormapChange={colormap => dispatch({ type: 'SET_COLORMAP', colormap })}
          isDirty={dirty.isDirty}
          companionConnected={!!state.companionPort}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
