/**
 * CompanionScanPanel — folder pairing + composite generation + inline preview.
 *
 * Shown in the ScopeSection when a companion app is connected.
 * Allows techs to map companion folders to vessel sections, generate
 * composites, preview results, and save to cloud.
 */

import { useCallback, useRef, useState } from 'react';
import { useCompanionApp } from '../../../hooks/queries/useCompanionApp';
import { useCompanionFolders } from '../../../hooks/queries/useCompanionFolders';
import {
  useCompanionComposite,
  useSaveScanCompositeBinary,
  useRefreshCompanionIndex,
} from '../../../hooks/mutations/useCompanionMutations';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import { useAuth } from '../../../contexts/AuthContext';
import type { ProjectVessel } from '../../../types/inspection-project';
import type { CompositeData } from '../../../types/companion';
import { DEFAULT_GATE_SETTINGS } from '../../../types/companion';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTION_TYPES = ['Shell', 'Dome End', 'Nozzle'] as const;

interface CompanionScanPanelProps {
  vessel: ProjectVessel;
  projectId: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CompanionScanPanel({ vessel, projectId }: CompanionScanPanelProps) {
  const { connected, port } = useCompanionApp();
  const { data: foldersData, isLoading: foldersLoading } = useCompanionFolders(port);
  const refreshIndex = useRefreshCompanionIndex();
  const generateComposite = useCompanionComposite();
  const saveBinary = useSaveScanCompositeBinary();
  const updateVessel = useUpdateProjectVessel();
  const { profile } = useAuth();
  const canEdit = !!profile && !['viewer'].includes(profile.role ?? '');

  // Local state for folder selections (mirrors vessel.section_folder_map)
  const [folderMap, setFolderMap] = useState<Record<string, string[]>>(
    vessel.section_folder_map ?? {},
  );
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [lastComposite, setLastComposite] = useState<CompositeData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const folders = foldersData?.folders ?? [];

  // Persist folder map to DB
  const persistFolderMap = useCallback(
    (updated: Record<string, string[]>) => {
      setFolderMap(updated);
      updateVessel.mutate({
        id: vessel.id,
        projectId,
        params: { sectionFolderMap: updated },
      });
    },
    [vessel.id, projectId, updateVessel],
  );

  // Toggle a folder for a section
  const toggleFolder = useCallback(
    (section: string, folderName: string) => {
      const current = folderMap[section] ?? [];
      const next = current.includes(folderName)
        ? current.filter(f => f !== folderName)
        : [...current, folderName];
      persistFolderMap({ ...folderMap, [section]: next });
    },
    [folderMap, persistFolderMap],
  );

  // Generate composite for a section
  const handleGenerate = useCallback(
    async (section: string) => {
      if (!port || !canEdit) return;
      const sectionFolders = folderMap[section];
      if (!sectionFolders?.length) return;

      setActiveSection(section);
      setLastComposite(null);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      generateComposite.mutate(
        { port, folders: sectionFolders, gateSettings: DEFAULT_GATE_SETTINGS, signal: abortRef.current.signal },
        {
          onSuccess: (data) => {
            setLastComposite(data);
            setActiveSection(null);
          },
          onError: () => setActiveSection(null),
        },
      );
    },
    [port, canEdit, folderMap, generateComposite],
  );

  // Save last composite to cloud
  const handleSave = useCallback(
    async (section: string) => {
      if (!lastComposite || !profile?.organization_id) return;

      // Build the binary payload: matrix + xAxis + yAxis (same layout as companion)
      const matrixBytes = lastComposite.matrix.byteLength;
      const xBytes = lastComposite.xAxis.byteLength;
      const yBytes = lastComposite.yAxis.byteLength;
      const buffer = new ArrayBuffer(matrixBytes + xBytes + yBytes);
      const view = new Uint8Array(buffer);
      view.set(new Uint8Array(lastComposite.matrix.buffer, lastComposite.matrix.byteOffset, matrixBytes), 0);
      view.set(new Uint8Array(lastComposite.xAxis.buffer, lastComposite.xAxis.byteOffset, xBytes), matrixBytes);
      view.set(new Uint8Array(lastComposite.yAxis.buffer, lastComposite.yAxis.byteOffset, yBytes), matrixBytes + xBytes);

      saveBinary.mutate({
        binaryData: buffer,
        stats: lastComposite.stats,
        width: lastComposite.width,
        height: lastComposite.height,
        xAxis: lastComposite.xAxis,
        yAxis: lastComposite.yAxis,
        sourceFiles: lastComposite.sourceFiles,
        name: `${vessel.vessel_name} — ${section}`,
        organizationId: profile.organization_id,
        userId: profile.id,
        projectVesselId: vessel.id,
        sectionType: section,
      });
    },
    [lastComposite, profile, vessel, saveBinary],
  );

  // Cancel in-flight composite generation
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setActiveSection(null);
  }, []);

  // ----- Disconnected state -----
  if (!connected) {
    return (
      <div style={{
        padding: '14px 16px',
        background: 'var(--clean-surface-secondary)',
        border: '1px solid var(--clean-border)',
        borderRadius: '6px',
        opacity: 0.6,
      }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--clean-text-tertiary)' }}>
          Connect companion app to enable scan controls
        </div>
      </div>
    );
  }

  // ----- Connected state -----
  return (
    <div style={{
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header + refresh button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--clean-text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Companion scan folders
        </span>
        <button
          onClick={() => port && refreshIndex.mutate(port)}
          disabled={refreshIndex.isPending}
          style={{
            fontSize: '0.72rem',
            color: '#60a5fa',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            opacity: refreshIndex.isPending ? 0.5 : 1,
          }}
        >
          {refreshIndex.isPending ? 'Refreshing...' : 'Refresh folders'}
        </button>
      </div>

      {/* Per-section folder mapping */}
      {SECTION_TYPES.map(section => {
        const mapped = folderMap[section] ?? [];
        const isGenerating = activeSection === section;
        const staleFolders = mapped.filter(f => !folders.some(cf => cf.name === f));

        return (
          <div
            key={section}
            style={{
              padding: '10px 14px',
              background: 'var(--clean-surface-secondary)',
              border: '1px solid var(--clean-border)',
              borderRadius: '6px',
            }}
          >
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--clean-text-secondary)', fontWeight: 500 }}>
                {section}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--clean-text-quaternary)' }}>
                {mapped.length} folder{mapped.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Stale mapping warning */}
            {staleFolders.length > 0 && (
              <div style={{
                fontSize: '0.72rem',
                color: '#f59e0b',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{ fontSize: '0.85rem' }}>!</span>
                {staleFolders.length} mapped folder{staleFolders.length !== 1 ? 's' : ''} not found — refresh or re-map
              </div>
            )}

            {/* Folder chips */}
            {canEdit && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: mapped.length > 0 ? 8 : 0 }}>
                {foldersLoading ? (
                  <span style={{ fontSize: '0.72rem', color: 'var(--clean-text-quaternary)' }}>Loading folders...</span>
                ) : (
                  folders.map(f => {
                    const selected = mapped.includes(f.name);
                    return (
                      <button
                        key={f.name}
                        onClick={() => toggleFolder(section, f.name)}
                        style={{
                          fontSize: '0.72rem',
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: `1px solid ${selected ? '#3b82f6' : 'var(--clean-border)'}`,
                          background: selected ? 'rgba(59,130,246,0.15)' : 'transparent',
                          color: selected ? '#93c5fd' : 'var(--clean-text-tertiary)',
                          cursor: 'pointer',
                        }}
                      >
                        {f.name} ({f.fileCount})
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* Generate + Save actions */}
            {canEdit && mapped.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isGenerating ? (
                  <button
                    onClick={handleCancel}
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: '1px solid #ef4444',
                      background: 'rgba(239,68,68,0.1)',
                      color: '#f87171',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => handleGenerate(section)}
                    disabled={generateComposite.isPending}
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: '1px solid var(--clean-border)',
                      background: 'rgba(59,130,246,0.1)',
                      color: '#93c5fd',
                      cursor: 'pointer',
                      opacity: generateComposite.isPending ? 0.5 : 1,
                    }}
                  >
                    Generate Composite
                  </button>
                )}

                {lastComposite && !isGenerating && (
                  <button
                    onClick={() => handleSave(section)}
                    disabled={saveBinary.isPending}
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: '1px solid #22c55e',
                      background: 'rgba(34,197,94,0.1)',
                      color: '#4ade80',
                      cursor: 'pointer',
                      opacity: saveBinary.isPending ? 0.5 : 1,
                    }}
                  >
                    {saveBinary.isPending ? 'Saving...' : 'Save to Cloud'}
                  </button>
                )}
              </div>
            )}

            {/* Inline preview after generation */}
            {lastComposite && !isGenerating && (
              <CompositePreview data={lastComposite} section={section} projectId={projectId} vesselId={vessel.id} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline composite preview
// ---------------------------------------------------------------------------

function CompositePreview({
  data,
  section,
  projectId,
  vesselId,
}: {
  data: CompositeData;
  section: string;
  projectId: string;
  vesselId: string;
}) {
  return (
    <div style={{
      marginTop: 8,
      padding: '8px 10px',
      background: 'rgba(59,130,246,0.05)',
      borderRadius: 4,
      border: '1px solid rgba(59,130,246,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--clean-text-tertiary)' }}>
          {data.width} x {data.height} — {data.sourceFiles.length} file{data.sourceFiles.length !== 1 ? 's' : ''}
        </span>
        <a
          href={`/projects/${projectId}/vessels/${vesselId}/viewer?section=${encodeURIComponent(section)}`}
          style={{ fontSize: '0.72rem', color: '#60a5fa', textDecoration: 'none' }}
        >
          Open in Viewer
        </a>
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: '0.72rem', color: 'var(--clean-text-quaternary)' }}>
        <span>Min: {data.stats.min.toFixed(2)} mm</span>
        <span>Max: {data.stats.max.toFixed(2)} mm</span>
        <span>Mean: {data.stats.mean.toFixed(2)} mm</span>
        <span>Coverage: {data.stats.coveragePct.toFixed(1)}%</span>
      </div>
      {data.warnings.length > 0 && (
        <div style={{ marginTop: 4, fontSize: '0.7rem', color: '#f59e0b' }}>
          {data.warnings.length} warning{data.warnings.length !== 1 ? 's' : ''}: {data.warnings[0].reason}
          {data.warnings.length > 1 && ` (+${data.warnings.length - 1} more)`}
        </div>
      )}
    </div>
  );
}
