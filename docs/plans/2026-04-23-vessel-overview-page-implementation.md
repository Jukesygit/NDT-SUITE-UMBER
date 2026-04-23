# Vessel Overview Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce a Vessel Overview dashboard page as the landing page when clicking a vessel, and slim down the current InspectionDetailPage into a focused Report Builder.

**Architecture:** New `VesselOverviewPage` takes the existing route (`/projects/:pId/vessels/:vId`). Current `InspectionDetailPage` moves to `/report-builder` sub-route with overview-managed sections removed. Both pages share React Query hooks — no data layer changes.

**Tech Stack:** React 18.3, TypeScript 5.9, React Router 6, React Query 5 (`@tanstack/react-query`), existing design system tokens + `glass-card` CSS class, `CollapsibleSection` component pattern.

**Design doc:** `docs/plans/2026-04-23-vessel-overview-page-design.md`

---

## Task 1: Extract Coverage Calculation Utility

Extract the coverage calculation logic from `ScopeSection.tsx` into a shared utility so both `ScopeSection` and the new `ScopeProgressCard` can use it.

**Files:**
- Create: `src/utils/coverage-calc.ts`
- Modify: `src/components/projects/inspection-detail/ScopeSection.tsx:265-299`

**Step 1: Create the shared utility**

Create `src/utils/coverage-calc.ts`:

```typescript
import { computeCoverage } from '../components/VesselModeler/engine/coverage-calculator';
import type { CoverageRectConfig, VesselState } from '../components/VesselModeler/types';

interface ModelGeometry {
    id: number;       // inner diameter mm
    length: number;   // tan-tan length mm
    headRatio: number;
}

export interface VesselModelWithGeometry {
    id: string;
    name: string;
    model_type?: string | null;
    updated_at: string;
    project_vessel_id: string | null;
    geometry: ModelGeometry | null;
    coverageRects: CoverageRectConfig[];
}

export interface CoverageResult {
    shellAreaSqm: number | null;
    scopedAreaSqm: number;
    scopedPct: number;
    scanAreaSqm: number;
    achievedPct: number;
    regionBreakdown: ReturnType<typeof computeCoverage> | null;
}

function toVesselState(geo: ModelGeometry): VesselState {
    return {
        innerDiameter: geo.id,
        length: geo.length,
        headRatio: geo.headRatio,
    } as VesselState;
}

/**
 * Calculate coverage metrics from vessel models and composites.
 * Extracted from ScopeSection for reuse by ScopeProgressCard.
 */
export function calculateCoverage(
    vesselModels: VesselModelWithGeometry[],
    vesselId: string,
    composites: { stats: any }[],
): CoverageResult {
    const linkedModels = vesselModels.filter(
        m => m.project_vessel_id === vesselId && m.geometry != null,
    );
    const coverageModel = linkedModels.find(m => m.model_type === 'coverage') ?? linkedModels[0] ?? null;

    const modelCoverage = coverageModel?.geometry
        ? computeCoverage(coverageModel.coverageRects ?? [], toVesselState(coverageModel.geometry))
        : null;

    const shellAreaSqm = modelCoverage?.total.total ?? null;
    const scopedAreaSqm = modelCoverage?.total.covered ?? 0;
    const scopedPct = modelCoverage?.total.percent ?? 0;

    let scanAreaSqm = 0;
    for (const comp of composites) {
        const s = comp.stats;
        if (s && typeof s === 'object' && typeof s.validArea === 'number' && s.validArea > 0) {
            scanAreaSqm += s.validArea / 1_000_000;
        }
    }

    const achievedPct =
        shellAreaSqm && shellAreaSqm > 0 && scanAreaSqm > 0
            ? (scanAreaSqm / shellAreaSqm) * 100
            : 0;

    return {
        shellAreaSqm,
        scopedAreaSqm,
        scopedPct,
        scanAreaSqm,
        achievedPct,
        regionBreakdown: modelCoverage,
    };
}
```

**Step 2: Update ScopeSection to use the shared utility**

In `src/components/projects/inspection-detail/ScopeSection.tsx`, replace the inline calculation logic (lines 0-6 imports, lines 265-299 calculation) with an import from the new utility:

- Remove the `ModelGeometry`, `VesselModelWithGeometry` interfaces (lines 8-22) — import `VesselModelWithGeometry` from `../../utils/coverage-calc`
- Remove the `toVesselState` helper function
- Remove the `computeCoverage` import from VesselModeler
- Replace the `linkedModels`, `coverageModel`, `modelCoverage`, `shellAreaSqm`, `scopedAreaSqm`, `scopedPct`, `scanAreaSqm`, `achievedPct` calculations (lines 265-299) with:

```typescript
import { calculateCoverage, type VesselModelWithGeometry } from '../../../utils/coverage-calc';

// Inside component:
const coverage = useMemo(
    () => calculateCoverage(vesselModels, vessel.id, composites),
    [vesselModels, vessel.id, composites],
);
const { shellAreaSqm, scopedAreaSqm, scopedPct, scanAreaSqm, achievedPct, regionBreakdown: modelCoverage } = coverage;
```

Update all references to these variables in the rest of the component — they should still work since the variable names match.

**Step 3: Verify build**

Run: `npm run typecheck`
Expected: No new type errors.

**Step 4: Commit**

```bash
git add src/utils/coverage-calc.ts src/components/projects/inspection-detail/ScopeSection.tsx
git commit -m "refactor: extract coverage calculation to shared utility"
```

---

## Task 2: Create Vessel Overview Page Components

Create the three new card components for the overview page.

**Files:**
- Create: `src/components/projects/vessel-overview/VesselIdentityCard.tsx`
- Create: `src/components/projects/vessel-overview/ScopeProgressCard.tsx`
- Create: `src/components/projects/vessel-overview/ReportReadinessCard.tsx`

### Step 1: Create VesselIdentityCard

This card shows vessel identity fields (material, thickness, drawing #, etc.) in a compact editable grid. It reuses the same `InlineEditField` and `useUpdateProjectVessel` pattern from `VesselDetailsSection`.

Create `src/components/projects/vessel-overview/VesselIdentityCard.tsx`:

```typescript
import { useCallback } from 'react';
import { InlineEditField } from '../../ui/InlineEditField';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel, ProjectFile } from '../../../types/inspection-project';

interface VesselIdentityCardProps {
    vessel: ProjectVessel;
    projectId: string;
    files?: ProjectFile[];
    procedures?: { id: string; procedure_number?: string | null }[];
}

const FIELDS: { label: string; key: keyof ProjectVessel; paramKey: string }[] = [
    { label: 'Material', key: 'material', paramKey: 'material' },
    { label: 'Nominal Thickness', key: 'nominal_thickness', paramKey: 'nominalThickness' },
    { label: 'Drawing Number', key: 'drawing_number', paramKey: 'drawingNumber' },
    { label: 'Description', key: 'description', paramKey: 'description' },
];

export default function VesselIdentityCard({ vessel, projectId, files, procedures }: VesselIdentityCardProps) {
    const updateVessel = useUpdateProjectVessel();

    const saveField = useCallback(
        (paramKey: string, value: string) => {
            updateVessel.mutate({
                id: vessel.id,
                params: { [paramKey]: value || null },
                projectId,
            });
        },
        [updateVessel, vessel.id, projectId],
    );

    const linkedProcedure = procedures?.find(p => p.id === vessel.procedure_id);

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
                Vessel Identity
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
                {FIELDS.map(f => (
                    <InlineEditField
                        key={f.key}
                        label={f.label}
                        value={(vessel[f.key] as string) ?? ''}
                        onSave={v => saveField(f.paramKey, v)}
                    />
                ))}
            </div>

            {linkedProcedure && (
                <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    Procedure: <span style={{ color: 'var(--text-secondary)' }}>
                        {linkedProcedure.procedure_number ?? 'Unnamed'}
                    </span>
                </div>
            )}
        </div>
    );
}
```

### Step 2: Create ScopeProgressCard

Compact coverage stats card with progress bar and "Open Modeler" link.

Create `src/components/projects/vessel-overview/ScopeProgressCard.tsx`:

```typescript
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateCoverage, type VesselModelWithGeometry } from '../../../utils/coverage-calc';

interface ScopeProgressCardProps {
    vesselId: string;
    projectId: string;
    composites: { stats: any }[];
    vesselModels: VesselModelWithGeometry[];
}

export default function ScopeProgressCard({ vesselId, projectId, composites, vesselModels }: ScopeProgressCardProps) {
    const navigate = useNavigate();

    const coverage = useMemo(
        () => calculateCoverage(vesselModels, vesselId, composites),
        [vesselModels, vesselId, composites],
    );

    const hasModel = vesselModels.some(m => m.project_vessel_id === vesselId && m.geometry != null);
    const linkedModel = vesselModels.find(m => m.project_vessel_id === vesselId);

    if (!hasModel) {
        return (
            <div className="glass-card" style={{ padding: 20 }}>
                <h3 style={{
                    fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                    margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                    Scope & Coverage
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
                    Link a 3D model to track coverage
                </p>
                <button
                    onClick={() => navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}`)}
                    className="btn btn--primary btn--sm"
                >
                    Open Modeler
                </button>
            </div>
        );
    }

    const pct = Math.min(100, Math.round(coverage.achievedPct));

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
                Scope & Coverage
            </h3>

            {/* Percentage + bar */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem' }}>
                        {pct}%
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>achieved</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: pct >= (coverage.scopedPct || 100) ? '#22c55e' : '#3b82f6',
                        transition: 'width 0.3s',
                    }} />
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: 12 }}>
                {coverage.shellAreaSqm != null && (
                    <span>Shell: {coverage.shellAreaSqm.toFixed(2)} m\u00B2</span>
                )}
                {coverage.scanAreaSqm > 0 && (
                    <span>Scanned: {coverage.scanAreaSqm.toFixed(2)} m\u00B2</span>
                )}
                <span>Composites: {composites.length}</span>
            </div>

            <button
                onClick={() => {
                    const modelParam = linkedModel ? `&model=${linkedModel.id}` : '';
                    navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}${modelParam}`);
                }}
                className="btn btn--secondary btn--sm"
                style={{ width: '100%' }}
            >
                Open in Modeler
            </button>
        </div>
    );
}
```

### Step 3: Create ReportReadinessCard

Progress summary with collapsible detail view. Only checks locally available data; defers report-builder items.

Create `src/components/projects/vessel-overview/ReportReadinessCard.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { ProjectVessel, ProjectFile } from '../../../types/inspection-project';

interface ReportReadinessCardProps {
    vessel: ProjectVessel;
    projectId: string;
    files: ProjectFile[];
    compositeCount: number;
}

interface CheckItem {
    label: string;
    ready: boolean;
    location: 'overview' | 'report-builder';
}

export default function ReportReadinessCard({ vessel, projectId, files, compositeCount }: ReportReadinessCardProps) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(false);

    const overviewUrl = `/projects/${projectId}/vessels/${vessel.id}`;
    const builderUrl = `/projects/${projectId}/vessels/${vessel.id}/report-builder`;

    const checks: CheckItem[] = [
        { label: 'Component Details', ready: !!(vessel.description || vessel.material), location: 'overview' },
        { label: 'Procedure', ready: !!vessel.procedure_id, location: 'overview' },
        { label: 'Equipment', ready: !!vessel.equipment_config?.model, location: 'report-builder' },
        { label: 'Calibration Log', ready: false, location: 'report-builder' }, // Can't check without query
        { label: 'Scan Log', ready: false, location: 'report-builder' },       // Can't check without query
        { label: 'Annotations', ready: compositeCount > 0, location: 'overview' },
        { label: 'Documents', ready: files.length > 0, location: 'overview' },
        { label: 'Results Summary', ready: !!vessel.results_summary, location: 'report-builder' },
        { label: 'Sign-off', ready: !!vessel.signoff_details?.technician?.name, location: 'report-builder' },
    ];

    // Count only items we can reliably check (overview-owned + vessel-field checks)
    const checkableItems = checks.filter(c => c.location === 'overview' || ['Equipment', 'Results Summary', 'Sign-off'].includes(c.label));
    const readyCount = checkableItems.filter(c => c.ready).length;
    const unknownCount = checks.filter(c => c.location === 'report-builder' && !['Equipment', 'Results Summary', 'Sign-off'].includes(c.label)).length;

    return (
        <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{
                fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
                Report Readiness
            </h3>

            {/* Progress */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 6 }}>
                    {readyCount} of {checkableItems.length} sections ready
                    {unknownCount > 0 && (
                        <span style={{ color: 'var(--text-quaternary)', fontSize: '0.78rem' }}>
                            {' '}(+{unknownCount} check in report builder)
                        </span>
                    )}
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{
                        width: `${(readyCount / checkableItems.length) * 100}%`,
                        height: '100%',
                        borderRadius: 3,
                        background: readyCount === checkableItems.length ? '#22c55e' : '#3b82f6',
                        transition: 'width 0.3s',
                    }} />
                </div>
            </div>

            {/* Expand toggle */}
            <button
                onClick={() => setExpanded(prev => !prev)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', color: 'var(--text-tertiary)',
                    fontSize: '0.78rem', cursor: 'pointer', padding: '4px 0',
                    marginBottom: expanded ? 10 : 0,
                }}
            >
                <ChevronDown size={12} style={{
                    transition: 'transform 0.2s',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                }} />
                {expanded ? 'Hide details' : 'Show details'}
            </button>

            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                    {checks.map(item => (
                        <div
                            key={item.label}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 10px',
                                background: 'var(--surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                borderRadius: 6,
                                fontSize: '0.8rem',
                            }}
                        >
                            <span style={{
                                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                background: item.location === 'report-builder' && ['Calibration Log', 'Scan Log'].includes(item.label)
                                    ? 'var(--text-quaternary)'
                                    : item.ready ? '#22c55e' : 'var(--border-default)',
                            }} />
                            <span style={{ flex: 1, color: item.ready ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                {item.label}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-quaternary)' }}>
                                {item.location === 'report-builder' && ['Calibration Log', 'Scan Log'].includes(item.label)
                                    ? 'Check in builder'
                                    : item.ready ? 'Ready' : 'Not filled'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* CTA */}
            <button
                onClick={() => navigate(builderUrl)}
                className="btn btn--primary btn--sm"
                style={{ width: '100%' }}
            >
                Open Report Builder
            </button>
        </div>
    );
}
```

### Step 4: Verify build

Run: `npm run typecheck`
Expected: No new type errors (components not yet mounted anywhere, but types should resolve).

### Step 5: Commit

```bash
git add src/components/projects/vessel-overview/
git commit -m "feat: add vessel overview card components — identity, scope progress, report readiness"
```

---

## Task 3: Create VesselOverviewPage

The main overview page composing the header, cards, and reused section components.

**Files:**
- Create: `src/pages/projects/VesselOverviewPage.tsx`

**Step 1: Create the page**

Create `src/pages/projects/VesselOverviewPage.tsx`:

```typescript
/**
 * VesselOverviewPage - Dashboard hub for a vessel within a project.
 * Shows vessel identity, scope/coverage, documents, images, models, and report readiness.
 * The report builder page handles detailed data entry (equipment, logs, signoff).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, MapPin, Calendar, Pencil, Radio, Box, ChevronDown,
    ClipboardList, Eye, Cuboid,
} from 'lucide-react';
import { useUpdateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import { usePopulateFromCompanion } from '../../hooks/mutations/usePopulateFromCompanion';
import {
    useProject,
    useProjectVessel,
    useProjectProcedures,
    useVesselFiles,
    useProjectScanComposites,
    useProjectVesselModels,
    useProjectImages,
} from '../../hooks/queries/useInspectionProjects';
import { PageSpinner } from '../../components/ui/LoadingSpinner';
import { VESSEL_STATUS_LABELS, VESSEL_STATUS_COLORS } from '../../types/inspection-project';
import type { VesselStatus } from '../../types/inspection-project';

import VesselIdentityCard from '../../components/projects/vessel-overview/VesselIdentityCard';
import ScopeProgressCard from '../../components/projects/vessel-overview/ScopeProgressCard';
import ReportReadinessCard from '../../components/projects/vessel-overview/ReportReadinessCard';
import DocumentsSection from '../../components/projects/inspection-detail/DocumentsSection';
import ImagePoolSection from '../../components/projects/inspection-detail/ImagePoolSection';
import ModelsSection from '../../components/projects/inspection-detail/ModelsSection';

export default function VesselOverviewPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();
    const navigate = useNavigate();

    // --- Data ---
    const { data: project, isLoading: projectLoading } = useProject(projectId);
    const { data: vessel, isLoading: vesselLoading } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: images = [] } = useProjectImages(vesselId);
    const vesselIds = vesselId ? [vesselId] : [];
    const { data: composites = [] } = useProjectScanComposites(vesselIds);
    const { data: vesselModels = [] } = useProjectVesselModels(vesselIds);

    const updateVessel = useUpdateProjectVessel();

    // --- Companion ---
    const {
        populate: populateFromCompanion,
        populating,
        connected: companionConnected,
        fileCount: companionFileCount,
    } = usePopulateFromCompanion();

    const [populateMsg, setPopulateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handlePopulateFromCompanion = useCallback(async () => {
        if (!vessel || !projectId) return;
        try {
            const result = await populateFromCompanion(vessel, projectId, [], []);
            const parts: string[] = [];
            if (result.equipmentUpdated) parts.push('equipment');
            if (result.vesselDetailsUpdated) parts.push('vessel details');
            if (result.scanLogAdded > 0) parts.push(`${result.scanLogAdded} scan log entries`);
            if (result.calLogAdded > 0) parts.push(`${result.calLogAdded} calibration entries`);
            if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);
            setPopulateMsg({
                type: 'success',
                text: parts.length === 0
                    ? 'Nothing new to populate — all data already present.'
                    : `Populated: ${parts.join(', ')}`,
            });
        } catch (err) {
            setPopulateMsg({ type: 'error', text: err instanceof Error ? err.message : 'Population failed' });
        }
        setTimeout(() => setPopulateMsg(null), 6000);
    }, [vessel, projectId, populateFromCompanion]);

    // --- Inline editing for vessel name/tag ---
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [editingTag, setEditingTag] = useState(false);
    const [tagDraft, setTagDraft] = useState('');

    const startEditName = useCallback(() => { setNameDraft(vessel?.vessel_name ?? ''); setEditingName(true); }, [vessel?.vessel_name]);
    const commitName = useCallback(() => {
        setEditingName(false);
        const trimmed = nameDraft.trim();
        if (trimmed && trimmed !== vessel?.vessel_name) {
            updateVessel.mutate({ id: vesselId!, params: { vesselName: trimmed }, projectId: projectId! });
        }
    }, [nameDraft, vessel?.vessel_name, vesselId, projectId, updateVessel]);

    const startEditTag = useCallback(() => { setTagDraft(vessel?.vessel_tag ?? ''); setEditingTag(true); }, [vessel?.vessel_tag]);
    const commitTag = useCallback(() => {
        setEditingTag(false);
        const trimmed = tagDraft.trim();
        if (trimmed !== (vessel?.vessel_tag ?? '')) {
            updateVessel.mutate({ id: vesselId!, params: { vesselTag: trimmed || undefined }, projectId: projectId! });
        }
    }, [tagDraft, vessel?.vessel_tag, vesselId, projectId, updateVessel]);

    // --- Status dropdown ---
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const statusMenuRef = useRef<HTMLDivElement>(null);

    const handleStatusChange = useCallback((newStatus: VesselStatus) => {
        setStatusMenuOpen(false);
        if (newStatus !== vessel?.status) {
            updateVessel.mutate({ id: vesselId!, params: { status: newStatus }, projectId: projectId! });
        }
    }, [vessel?.status, vesselId, projectId, updateVessel]);

    // --- Modeler dropdown ---
    const [modelerMenuOpen, setModelerMenuOpen] = useState(false);
    const modelerMenuRef = useRef<HTMLDivElement>(null);
    const linkedModels = vesselModels.filter(m => m.project_vessel_id === vesselId);

    // Close dropdowns on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
            if (modelerMenuRef.current && !modelerMenuRef.current.contains(e.target as Node)) setModelerMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // --- Loading / error ---
    if (projectLoading || vesselLoading) return <PageSpinner message="Loading vessel overview..." />;

    if (!project || !vessel) {
        return (
            <div style={{ padding: '32px 40px' }}>
                <div style={{ color: '#ef4444', padding: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                    Project or vessel not found.
                </div>
            </div>
        );
    }

    const formatDate = (d: string | null) => {
        if (!d) return null;
        return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const tripDateRange = project.start_date || project.end_date
        ? [formatDate(project.start_date), formatDate(project.end_date)].filter(Boolean).join(' – ')
        : null;

    return (
        <div className="h-full overflow-y-auto glass-scrollbar">
            {/* ─── Header ─── */}
            <div style={{
                padding: '24px 40px 20px',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--surface-raised)',
            }}>
                {/* Back nav */}
                <button
                    onClick={() => navigate(`/projects/${projectId}`)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', color: 'var(--text-tertiary)',
                        fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: 8,
                        transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >
                    <ArrowLeft size={14} />
                    {project.name}
                </button>

                {/* Trip context */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    fontSize: '0.78rem', color: 'var(--text-tertiary)',
                    marginBottom: 10, flexWrap: 'wrap',
                }}>
                    {project.client_name && (
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {project.client_name}
                        </span>
                    )}
                    {(project.site_name || project.location_description) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} />
                            {project.site_name || project.location_description}
                        </span>
                    )}
                    {tripDateRange && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={12} />
                            {tripDateRange}
                        </span>
                    )}
                    {project.contract_number && <span>Contract: {project.contract_number}</span>}
                    {project.work_order_number && <span>WO: {project.work_order_number}</span>}
                </div>

                {/* Vessel name + actions row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                            {/* Editable tag */}
                            {editingTag ? (
                                <input
                                    autoFocus value={tagDraft}
                                    onChange={e => setTagDraft(e.target.value)}
                                    onBlur={commitTag}
                                    onKeyDown={e => { if (e.key === 'Enter') commitTag(); if (e.key === 'Escape') setEditingTag(false); }}
                                    placeholder="Tag"
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        background: 'var(--surface-elevated)', border: '1px solid var(--border-default)',
                                        borderRadius: 'var(--radius-sm)', padding: '2px 8px', width: 120, outline: 'none',
                                    }}
                                />
                            ) : (
                                vessel.vessel_tag && (
                                    <span
                                        onClick={startEditTag} title="Click to edit tag"
                                        style={{
                                            fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                            cursor: 'pointer', borderBottom: '1px dashed transparent', transition: 'border-color 0.15s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.borderBottomColor = 'var(--text-tertiary)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
                                    >
                                        {vessel.vessel_tag} —{' '}
                                    </span>
                                )
                            )}

                            {/* Editable name */}
                            {editingName ? (
                                <input
                                    autoFocus value={nameDraft}
                                    onChange={e => setNameDraft(e.target.value)}
                                    onBlur={commitName}
                                    onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        background: 'var(--surface-elevated)', border: '1px solid var(--border-default)',
                                        borderRadius: 'var(--radius-sm)', padding: '2px 8px', flex: 1, minWidth: 200, outline: 'none',
                                    }}
                                />
                            ) : (
                                <h1
                                    onClick={startEditName} title="Click to edit vessel name"
                                    style={{
                                        fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)',
                                        margin: 0, cursor: 'pointer', borderBottom: '1px dashed transparent',
                                        transition: 'border-color 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderBottomColor = 'var(--text-tertiary)';
                                        (e.currentTarget.querySelector('.edit-icon') as HTMLElement)?.style.setProperty('opacity', '1');
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderBottomColor = 'transparent';
                                        (e.currentTarget.querySelector('.edit-icon') as HTMLElement)?.style.setProperty('opacity', '0');
                                    }}
                                >
                                    {vessel.vessel_name}
                                    <Pencil className="edit-icon" size={14} style={{ opacity: 0, color: 'var(--text-tertiary)', transition: 'opacity 0.15s' }} />
                                </h1>
                            )}

                            {!vessel.vessel_tag && !editingTag && (
                                <button
                                    onClick={startEditTag}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--text-quaternary)',
                                        fontSize: '0.78rem', cursor: 'pointer', padding: '0 4px', transition: 'color 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-quaternary)'; }}
                                    title="Add vessel tag"
                                >
                                    + add tag
                                </button>
                            )}
                        </div>
                        {vessel.description && (
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                {vessel.description}
                            </p>
                        )}
                    </div>

                    {/* Right side — status + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* Status dropdown */}
                        <div ref={statusMenuRef} style={{ position: 'relative' }}>
                            <button
                                onClick={() => setStatusMenuOpen(prev => !prev)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '5px 10px 5px 14px', borderRadius: 'var(--radius-full)',
                                    fontSize: '0.8rem', fontWeight: 500,
                                    background: `${VESSEL_STATUS_COLORS[vessel.status]}20`,
                                    color: VESSEL_STATUS_COLORS[vessel.status],
                                    border: `1px solid ${VESSEL_STATUS_COLORS[vessel.status]}30`,
                                    cursor: 'pointer',
                                }}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: VESSEL_STATUS_COLORS[vessel.status] }} />
                                {VESSEL_STATUS_LABELS[vessel.status]}
                                <ChevronDown size={12} style={{ opacity: 0.6 }} />
                            </button>

                            {statusMenuOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                                    background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
                                    borderRadius: 8, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                }}>
                                    {(Object.keys(VESSEL_STATUS_LABELS) as VesselStatus[]).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => handleStatusChange(s)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                padding: '7px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                                                background: s === vessel.status ? `${VESSEL_STATUS_COLORS[s]}15` : 'transparent',
                                                color: s === vessel.status ? VESSEL_STATUS_COLORS[s] : 'var(--text-secondary)',
                                                fontSize: '0.8rem', textAlign: 'left',
                                            }}
                                            onMouseEnter={e => { if (s !== vessel.status) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                                            onMouseLeave={e => { if (s !== vessel.status) e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: VESSEL_STATUS_COLORS[s], flexShrink: 0 }} />
                                            {VESSEL_STATUS_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {companionConnected && (
                            <button
                                onClick={handlePopulateFromCompanion}
                                disabled={populating || companionFileCount === 0}
                                className="btn btn--secondary btn--sm"
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                title={`${companionFileCount} NDE file${companionFileCount !== 1 ? 's' : ''} available`}
                            >
                                <Radio size={14} style={{ color: '#22c55e' }} />
                                {populating ? 'Populating...' : `Populate from Companion (${companionFileCount})`}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Body ─── */}
            <div style={{ padding: '24px 40px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {populateMsg && (
                    <div style={{
                        padding: '10px 16px', marginBottom: 8,
                        background: populateMsg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        border: `1px solid ${populateMsg.type === 'success' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                        borderRadius: 8,
                        color: populateMsg.type === 'success' ? '#4ade80' : '#f87171',
                        fontSize: '0.84rem',
                    }}>
                        {populateMsg.text}
                    </div>
                )}

                {/* Row 1: Identity + Quick Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <VesselIdentityCard vessel={vessel} projectId={projectId!} files={files} procedures={procedures} />

                    {/* Quick Actions card */}
                    <div className="glass-card" style={{ padding: 20 }}>
                        <h3 style={{
                            fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)',
                            margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em',
                        }}>
                            Quick Actions
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}/report-builder`)}
                                className="btn btn--primary"
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-start' }}
                            >
                                <ClipboardList size={16} />
                                Report Builder
                            </button>
                            <button
                                onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}/viewer`)}
                                className="btn btn--secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-start' }}
                            >
                                <Eye size={16} />
                                Scan Viewer
                            </button>
                            <button
                                onClick={() => {
                                    const modelParam = linkedModels[0] ? `&model=${linkedModels[0].id}` : '';
                                    navigate(`/vessel-modeler?project=${projectId}&vessel=${vesselId}${modelParam}`);
                                }}
                                className="btn btn--secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-start' }}
                            >
                                <Cuboid size={16} />
                                3D Modeler
                            </button>
                        </div>
                    </div>
                </div>

                {/* Row 2: Scope + Readiness */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <ScopeProgressCard
                        vesselId={vesselId!}
                        projectId={projectId!}
                        composites={composites}
                        vesselModels={vesselModels}
                    />
                    <ReportReadinessCard
                        vessel={vessel}
                        projectId={projectId!}
                        files={files}
                        compositeCount={composites.length}
                    />
                </div>

                {/* Full-width sections */}
                <DocumentsSection vessel={vessel} projectId={projectId!} files={files} />
                <ImagePoolSection vesselId={vesselId!} projectId={projectId!} images={images} />
                <ModelsSection vessel={vessel} projectId={projectId!} composites={composites} vesselModels={vesselModels} />
            </div>
        </div>
    );
}
```

**Step 2: Verify build**

Run: `npm run typecheck`
Expected: No new type errors.

**Step 3: Commit**

```bash
git add src/pages/projects/VesselOverviewPage.tsx
git commit -m "feat: create VesselOverviewPage — dashboard hub for vessel management"
```

---

## Task 4: Update Routing in App.tsx

Wire up the new overview page and move the current inspection detail to `/report-builder`.

**Files:**
- Modify: `src/App.tsx:28-33` (lazy imports) and `src/App.tsx:179-183` (route definitions)

**Step 1: Update lazy imports**

In `src/App.tsx`, replace line 31:
```typescript
const InspectionDetailPage = lazy(() => import('./pages/projects/InspectionDetailPage'));
```

With:
```typescript
const VesselOverviewPage = lazy(() => import('./pages/projects/VesselOverviewPage'));
const ReportBuilderPage = lazy(() => import('./pages/projects/ReportBuilderPage'));
```

**Step 2: Update route definitions**

Replace the current vessel route (line 179-183):
```typescript
<Route path="/projects/:projectId/vessels/:vesselId" element={
    <RequireTabVisible tabId="tools">
        <ErrorBoundary><InspectionDetailPage /></ErrorBoundary>
    </RequireTabVisible>
} />
```

With two routes:
```typescript
<Route path="/projects/:projectId/vessels/:vesselId" element={
    <RequireTabVisible tabId="tools">
        <ErrorBoundary><VesselOverviewPage /></ErrorBoundary>
    </RequireTabVisible>
} />
<Route path="/projects/:projectId/vessels/:vesselId/report-builder" element={
    <RequireTabVisible tabId="tools">
        <ErrorBoundary><ReportBuilderPage /></ErrorBoundary>
    </RequireTabVisible>
} />
```

**Step 3: Verify build**

Run: `npm run typecheck`
Expected: Error — `ReportBuilderPage` file doesn't exist yet. That's expected; we rename it in the next task.

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add vessel overview route, add report-builder route"
```

---

## Task 5: Rename and Slim Down InspectionDetailPage → ReportBuilderPage

Rename the file, remove overview-managed sections, and update header navigation.

**Files:**
- Rename: `src/pages/projects/InspectionDetailPage.tsx` → `src/pages/projects/ReportBuilderPage.tsx`
- Modify: the renamed file

**Step 1: Rename the file**

```bash
git mv "src/pages/projects/InspectionDetailPage.tsx" "src/pages/projects/ReportBuilderPage.tsx"
```

**Step 2: Update the component**

In `src/pages/projects/ReportBuilderPage.tsx`, make these changes:

1. **Rename the component** — change `export default function InspectionDetailPage()` to `export default function ReportBuilderPage()`.

2. **Remove section imports** — delete the imports for:
   - `ScopeSection` (line 29)
   - `ModelsSection` (line 30)
   - `DocumentsSection` (line 31)
   - `ImagePoolSection` (line 32)

3. **Remove unused data hooks** — the overview page now owns files, composites, models. But the report builder still needs `files` for `ReportGenerationSection`, `composites` for composite count, and `images` for the checklist. Keep all hooks for now; we'll only remove what's truly unused after the ReportGenerationSection update.

4. **Remove section renders** — in the body (lines 489-497 area), remove:
   - `<ScopeSection ... />`
   - `<ModelsSection ... />`
   - `<DocumentsSection ... />`
   - `<ImagePoolSection ... />`

5. **Update back navigation** — change the back button (line 176-188) from:
   ```typescript
   onClick={() => navigate('/projects')}
   ```
   To:
   ```typescript
   onClick={() => navigate(`/projects/${projectId}/vessels/${vesselId}`)}
   ```
   And update the label from `{project.name}` to `← Back to Vessel Overview`.

6. **Update page comment** — change the file header comment to:
   ```typescript
   /**
    * ReportBuilderPage - Focused report data entry for a vessel inspection.
    * Handles equipment, logs, results, signoff, and report generation.
    * Vessel management (scope, models, documents, images) is on VesselOverviewPage.
    */
   ```

**Step 3: Verify build**

Run: `npm run typecheck`
Expected: No type errors.

**Step 4: Run tests**

Run: `npm run test`
Expected: All existing tests pass.

**Step 5: Commit**

```bash
git add src/pages/projects/ReportBuilderPage.tsx
git commit -m "refactor: rename InspectionDetailPage to ReportBuilderPage, remove overview-managed sections"
```

---

## Task 6: Update ReportGenerationSection for External Items

Add `overviewUrl` prop to distinguish between local and external checklist items.

**Files:**
- Modify: `src/components/projects/inspection-detail/ReportGenerationSection.tsx`

**Step 1: Update the component**

Add an optional `overviewUrl` prop:

```typescript
interface ReportGenerationSectionProps {
    vessel: ProjectVessel;
    project: InspectionProject;
    procedures: InspectionProcedure[];
    files: ProjectFile[];
    scanLogEntries: ScanLogEntry[];
    calLogEntries: CalibrationLogEntry[];
    compositeCount: number;
    overviewUrl?: string;  // NEW — when set, external items link here
}
```

Update the `CheckItem` interface:
```typescript
interface CheckItem {
    label: string;
    ready: boolean;
    info?: string;
    external?: boolean;  // NEW — managed on overview page
}
```

Mark external items in the checks array:
```typescript
const checks: CheckItem[] = [
    { label: 'Component Details', ready: !!(vessel.description || vessel.material) },
    { label: 'Procedure', ready: !!vessel.procedure_id && procedures.length > 0 },
    { label: 'Equipment', ready: !!vessel.equipment_config?.model },
    { label: 'Calibration Log', ready: calLogEntries.length > 0 },
    { label: 'Scan Log', ready: scanLogEntries.length > 0 },
    { label: 'Annotations', ready: true, info: `${compositeCount} composite${compositeCount !== 1 ? 's' : ''}`, external: true },
    { label: 'Documents', ready: files.length > 0, external: true },
    { label: 'Results Summary', ready: !!vessel.results_summary },
    { label: 'Sign-off', ready: !!vessel.signoff_details?.technician?.name },
];
```

In the render, update the status text for external items:
```typescript
<span style={{
    fontSize: '0.78rem',
    color: item.info
        ? 'var(--text-tertiary)'
        : item.ready
          ? 'rgba(34,197,94,0.8)'
          : 'var(--text-quaternary)',
}}>
    {item.info ?? (item.ready ? 'Ready' : (
        item.external && overviewUrl
            ? <a href={overviewUrl} style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>Manage on overview</a>
            : 'Not filled'
    ))}
</span>
```

**Step 2: Update the caller in ReportBuilderPage**

In `src/pages/projects/ReportBuilderPage.tsx`, pass the `overviewUrl` prop:

```typescript
<ReportGenerationSection
    vessel={vessel}
    project={project}
    procedures={procedures}
    files={files}
    scanLogEntries={scanLogEntries}
    calLogEntries={calLogEntries}
    compositeCount={composites.length}
    overviewUrl={`/projects/${projectId}/vessels/${vesselId}`}
/>
```

**Step 3: Verify build**

Run: `npm run typecheck`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/components/projects/inspection-detail/ReportGenerationSection.tsx src/pages/projects/ReportBuilderPage.tsx
git commit -m "feat: add external item indicators to ReportGenerationSection"
```

---

## Task 7: Verify Full Build and Test

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass.

**Step 3: Manual verification checklist**

Start the dev server with `npm run dev` and verify:

- [ ] `/projects` — project list loads, clicking a project goes to project detail
- [ ] `/projects/:id` — vessel cards visible, clicking a vessel card goes to **vessel overview** (not report builder)
- [ ] Vessel overview page loads with: identity card, quick actions, scope progress, report readiness, documents, images, models sections
- [ ] Quick Actions: "Report Builder" button navigates to `/report-builder`
- [ ] Quick Actions: "Scan Viewer" and "3D Modeler" buttons navigate correctly
- [ ] Report builder page loads with: vessel details, procedure, equipment, cal log, scan log, results, signoff, report generation sections
- [ ] Report builder back arrow goes to vessel overview (not projects list)
- [ ] Vessel name/tag editing works on overview page
- [ ] Status dropdown works on overview page
- [ ] Document upload/delete works on overview page
- [ ] Image upload/delete works on overview page
- [ ] Report readiness card shows progress bar and expandable checklist
- [ ] Report generation section shows "Manage on overview" links for external items
- [ ] TripView vessel clicks go to overview
- [ ] AssetView vessel clicks go to overview
- [ ] Companion populate works on overview (if companion available)

**Step 4: Final commit**

If any fixes were needed during manual testing, commit them:

```bash
git add -A
git commit -m "fix: vessel overview page polish from manual testing"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Extract coverage calc utility | `coverage-calc.ts` | `ScopeSection.tsx` |
| 2 | Create overview card components | 3 cards in `vessel-overview/` | — |
| 3 | Create VesselOverviewPage | `VesselOverviewPage.tsx` | — |
| 4 | Update routing | — | `App.tsx` |
| 5 | Rename + slim InspectionDetailPage | — | rename + edit |
| 6 | Update ReportGenerationSection | — | `ReportGenerationSection.tsx`, `ReportBuilderPage.tsx` |
| 7 | Full build + manual test | — | any fixes |
