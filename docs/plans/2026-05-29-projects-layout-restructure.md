# Projects Layout Restructure — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Projects page hierarchy from a 3-toolbar list + tabbed detail page into a 2-toolbar list + single-scroll campaign dashboard.

**Architecture:** Three levels of change. List page merges its toolbar rows. Detail page replaces its tab shell with four stacked zones (summary strip, attention queue, vessel list, collapsible files). Vessel page gets a breadcrumb cleanup. Three new leaf components. All changes within existing route structure.

**Tech Stack:** React 18 + TypeScript, existing `projects.css` design system with `--clean-*` tokens, Lucide icons, React Router 6.

**Design doc:** `docs/plans/2026-05-29-projects-layout-restructure-design.md`

---

### Task 1: Add CSS for new dashboard components

**Files:**
- Modify: `src/pages/projects/projects.css` (append new sections)

**Step 1: Add summary strip styles**

Append to `projects.css`:

```css
/* ---- Summary Strip ---- */
.pj-summary-strip {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.pj-summary-stat {
  flex: 1;
  background: var(--clean-surface);
  border: 1px solid var(--clean-border);
  border-radius: 12px;
  padding: 14px 16px;
  min-width: 0;
}

.pj-summary-stat-label {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--clean-text-tertiary);
  margin-bottom: 4px;
}

.pj-summary-stat-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
  color: var(--clean-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.pj-summary-progress {
  margin-bottom: 24px;
}

@media (max-width: 640px) {
  .pj-summary-strip {
    flex-wrap: wrap;
  }
  .pj-summary-stat {
    flex: 1 1 calc(50% - 6px);
  }
}
```

**Step 2: Add attention queue styles**

```css
/* ---- Attention Queue ---- */
.pj-attention {
  margin-bottom: 24px;
}

.pj-attention-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--clean-badge-amber-text);
  margin-bottom: 8px;
}

.pj-attention-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pj-attention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--clean-badge-amber-bg);
  border: 1px solid var(--clean-border);
  border-radius: 10px;
  cursor: pointer;
  transition: background 150ms ease;
  width: 100%;
  text-align: left;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--clean-text-primary);
}

.pj-attention-item:hover {
  background: var(--clean-hover-bg);
}

.pj-attention-item-icon {
  color: var(--clean-badge-amber-text);
  flex-shrink: 0;
}

.pj-attention-item-reason {
  font-size: 12px;
  color: var(--clean-text-tertiary);
  margin-left: auto;
  white-space: nowrap;
}
```

**Step 3: Add dashboard vessel list styles**

```css
/* ---- Dashboard Vessel List ---- */
.pj-vessel-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.pj-vessel-list-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--clean-text-tertiary);
}

.pj-dash-vessel-row {
  display: grid;
  grid-template-columns: minmax(200px, 2fr) 1fr 120px 100px 28px;
  gap: 12px;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid var(--clean-divider);
  cursor: pointer;
  transition: background 120ms ease;
  font-family: var(--font-sans);
}

.pj-dash-vessel-row:first-child {
  border-top: 1px solid var(--clean-border);
}

.pj-dash-vessel-row:hover {
  background: var(--clean-hover-bg);
}

.pj-dash-vessel-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pj-dash-vessel-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--clean-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pj-dash-vessel-type {
  font-size: 12px;
  color: var(--clean-text-tertiary);
  margin-top: 1px;
}

.pj-dash-vessel-scans {
  font-size: 13px;
  color: var(--clean-text-secondary);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 768px) {
  .pj-dash-vessel-row {
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    padding: 12px 16px;
  }
  .pj-dash-vessel-scans,
  .pj-dash-vessel-row > .pj-progress-wrap {
    display: none;
  }
}
```

**Step 4: Add collapsible files section styles**

```css
/* ---- Dashboard Files Section ---- */
.pj-files-section {
  margin-top: 24px;
}

.pj-files-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 0;
  border: none;
  background: none;
  cursor: pointer;
  border-top: 1px solid var(--clean-divider);
}

.pj-files-toggle-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pj-files-toggle-label {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--clean-text-tertiary);
}

.pj-files-toggle-count {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--clean-hover-bg);
  color: var(--clean-text-quaternary);
}

.pj-files-toggle-chevron {
  color: var(--clean-text-quaternary);
  transition: transform 200ms ease;
}

.pj-files-toggle-chevron.open {
  transform: rotate(180deg);
}
```

**Step 5: Commit**

```
git add src/pages/projects/projects.css
git commit -m "style: add CSS for dashboard summary strip, attention queue, vessel list, and files section"
```

---

### Task 2: Create ProjectSummaryStrip component

**Files:**
- Create: `src/components/projects/ProjectSummaryStrip.tsx`

**Step 1: Create the component**

```tsx
import type { ProjectVessel } from '../../types/inspection-project';

interface ProjectSummaryStripProps {
    vessels: ProjectVessel[];
}

export function ProjectSummaryStrip({ vessels }: ProjectSummaryStripProps) {
    const total = vessels.length;
    const completed = vessels.filter(v => v.status === 'completed').length;
    const inProgress = vessels.filter(v =>
        ['scanning', 'annotating', 'setup'].includes(v.status)
    ).length;
    const notStarted = vessels.filter(v => v.status === 'not_started').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const stats = [
        { label: 'Vessels', value: total },
        { label: 'Completed', value: completed },
        { label: 'In Progress', value: inProgress },
        { label: 'Not Started', value: notStarted },
    ];

    return (
        <>
            <div className="pj-summary-strip">
                {stats.map(s => (
                    <div key={s.label} className="pj-summary-stat">
                        <div className="pj-summary-stat-label">{s.label}</div>
                        <div className="pj-summary-stat-value">{s.value}</div>
                    </div>
                ))}
            </div>
            {total > 0 && (
                <div className="pj-summary-progress">
                    <div className="pj-progress-wrap">
                        <div className="pj-progress-track" style={{ flex: 1 }}>
                            <div
                                className={`pj-progress-fill ${pct >= 100 ? 'complete' : ''}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <span className="pj-progress-label">{pct}%</span>
                    </div>
                </div>
            )}
        </>
    );
}
```

**Step 2: Commit**

```
git add src/components/projects/ProjectSummaryStrip.tsx
git commit -m "feat: add ProjectSummaryStrip component for campaign dashboard"
```

---

### Task 3: Create ProjectAttentionQueue component

**Files:**
- Create: `src/components/projects/ProjectAttentionQueue.tsx`

**Step 1: Create the component**

The attention queue flags vessels with issues. Logic:
- Status is past `setup` but vessel has zero scan composites → "No scans uploaded"
- Status is `not_started` and project status is `in_progress` → "Not started"
- Missing GA drawing when status is past `not_started` → "Missing GA drawing"

```tsx
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ProjectVessel } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';

interface AttentionItem {
    vessel: ProjectVessel;
    reason: string;
}

interface ProjectAttentionQueueProps {
    projectId: string;
    vessels: ProjectVessel[];
    compositeCountByVessel: Map<string, number>;
    projectStatus: string;
}

function getAttentionItems(
    vessels: ProjectVessel[],
    compositeCountByVessel: Map<string, number>,
    projectStatus: string,
): AttentionItem[] {
    const items: AttentionItem[] = [];

    for (const v of vessels) {
        if (v.status === 'completed' || v.status === 'report_ready') continue;

        const scanCount = compositeCountByVessel.get(v.id) ?? 0;
        const pastSetup = ['scanning', 'annotating'].includes(v.status);

        if (pastSetup && scanCount === 0) {
            items.push({ vessel: v, reason: 'No scans uploaded' });
        } else if (v.status === 'not_started' && projectStatus === 'in_progress') {
            items.push({ vessel: v, reason: 'Not started' });
        } else if (v.status !== 'not_started' && !v.ga_drawing) {
            items.push({ vessel: v, reason: 'Missing GA drawing' });
        }
    }

    return items;
}

export function ProjectAttentionQueue({
    projectId,
    vessels,
    compositeCountByVessel,
    projectStatus,
}: ProjectAttentionQueueProps) {
    const navigate = useNavigate();
    const items = getAttentionItems(vessels, compositeCountByVessel, projectStatus);

    if (items.length === 0) return null;

    return (
        <div className="pj-attention">
            <div className="pj-attention-label">Needs Attention</div>
            <div className="pj-attention-list">
                {items.map(item => (
                    <button
                        key={item.vessel.id}
                        className="pj-attention-item"
                        onClick={() => navigate(`/projects/${projectId}/vessels/${item.vessel.id}`)}
                    >
                        <AlertTriangle size={14} className="pj-attention-item-icon" />
                        <span>
                            {item.vessel.vessel_tag ? `${item.vessel.vessel_tag} — ` : ''}
                            {item.vessel.vessel_name}
                        </span>
                        <span className="pj-attention-item-reason">{item.reason}</span>
                        <ChevronRight size={14} style={{ color: 'var(--clean-text-quaternary)' }} />
                    </button>
                ))}
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```
git add src/components/projects/ProjectAttentionQueue.tsx
git commit -m "feat: add ProjectAttentionQueue component for campaign dashboard"
```

---

### Task 4: Create ProjectVesselList component

**Files:**
- Create: `src/components/projects/ProjectVesselList.tsx`

**Step 1: Create the component**

Compact row-based vessel list. Each row navigates to the vessel workspace on click. Includes an "Add Vessel" button that triggers the add modal from `ProjectVesselsTab`.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Ship } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useCreateProjectVessel } from '../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel } from '../../types/inspection-project';
import { VESSEL_STATUS_LABELS } from '../../types/inspection-project';

function getVesselStatusClass(status: string): string {
    switch (status) {
        case 'completed': return 'active';
        case 'report_ready': return 'active';
        case 'scanning': return 'info';
        case 'annotating': return 'info';
        case 'setup': return 'info';
        case 'not_started': return 'neutral';
        default: return 'neutral';
    }
}

interface ProjectVesselListProps {
    projectId: string;
    vessels: ProjectVessel[];
    compositeCountByVessel: Map<string, number>;
}

export function ProjectVesselList({ projectId, vessels, compositeCountByVessel }: ProjectVesselListProps) {
    const navigate = useNavigate();
    const [showAddModal, setShowAddModal] = useState(false);
    const [vesselName, setVesselName] = useState('');
    const [vesselTag, setVesselTag] = useState('');
    const [vesselType, setVesselType] = useState('');
    const createMutation = useCreateProjectVessel();

    const handleAdd = async () => {
        if (!vesselName.trim()) return;
        await createMutation.mutateAsync({
            projectId,
            vesselName: vesselName.trim(),
            vesselTag: vesselTag.trim() || undefined,
            vesselType: vesselType.trim() || undefined,
        });
        setVesselName('');
        setVesselTag('');
        setVesselType('');
        setShowAddModal(false);
    };

    return (
        <div>
            <div className="pj-vessel-list-header">
                <span className="pj-vessel-list-label">Vessels</span>
                <button onClick={() => setShowAddModal(true)} className="pj-btn secondary sm">
                    <Plus size={13} />
                    Add Vessel
                </button>
            </div>

            {vessels.length === 0 ? (
                <div className="pj-card">
                    <div className="pj-empty">
                        <Ship size={28} style={{ color: 'var(--clean-text-quaternary)', marginBottom: 8 }} />
                        <div className="pj-empty-title">No vessels yet</div>
                        <div className="pj-empty-text">Add vessels to start setting up this inspection project.</div>
                        <button onClick={() => setShowAddModal(true)} className="pj-btn primary" style={{ marginTop: 16 }}>
                            <Plus size={14} />
                            Add Vessel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="pj-card" style={{ overflow: 'hidden' }}>
                    {vessels.map(v => {
                        const statusClass = getVesselStatusClass(v.status);
                        const scans = compositeCountByVessel.get(v.id) ?? 0;
                        const coveragePct = v.coverage_target_pct && v.coverage_actual_pct
                            ? Math.round((v.coverage_actual_pct / v.coverage_target_pct) * 100)
                            : null;

                        return (
                            <div
                                key={v.id}
                                className="pj-dash-vessel-row"
                                onClick={() => navigate(`/projects/${projectId}/vessels/${v.id}`)}
                            >
                                <div className="pj-dash-vessel-name">
                                    <span className="pj-dash-vessel-title">
                                        {v.vessel_tag ? `${v.vessel_tag} — ` : ''}{v.vessel_name}
                                    </span>
                                    {v.vessel_type && (
                                        <span className="pj-dash-vessel-type">{v.vessel_type}</span>
                                    )}
                                </div>

                                <span className={`pj-badge ${statusClass}`}>
                                    <span className={`pj-led ${statusClass}`} />
                                    {VESSEL_STATUS_LABELS[v.status]}
                                </span>

                                <span className="pj-dash-vessel-scans">
                                    {scans} scan{scans !== 1 ? 's' : ''}
                                </span>

                                {coveragePct !== null ? (
                                    <div className="pj-progress-wrap">
                                        <div className="pj-progress-track" style={{ flex: 1 }}>
                                            <div
                                                className={`pj-progress-fill ${coveragePct >= 100 ? 'complete' : ''}`}
                                                style={{ width: `${Math.min(100, coveragePct)}%` }}
                                            />
                                        </div>
                                        <span className="pj-progress-label">{coveragePct}%</span>
                                    </div>
                                ) : (
                                    <span />
                                )}

                                <ChevronRight size={14} style={{ color: 'var(--clean-text-quaternary)' }} />
                            </div>
                        );
                    })}
                </div>
            )}

            {showAddModal && (
                <Modal isOpen={true} title="Add Vessel" onClose={() => setShowAddModal(false)}>
                    <div className="pj-form-card" style={{ border: 'none', padding: 0, margin: 0 }}>
                        <div className="pj-form-grid">
                            <div className="pj-form-field">
                                <label className="pj-form-label">Vessel Name *</label>
                                <input
                                    value={vesselName}
                                    onChange={e => setVesselName(e.target.value)}
                                    placeholder="e.g. Knockout Drum"
                                    className="pj-form-input"
                                    autoFocus
                                />
                            </div>
                            <div className="pj-form-field">
                                <label className="pj-form-label">Tag</label>
                                <input
                                    value={vesselTag}
                                    onChange={e => setVesselTag(e.target.value)}
                                    placeholder="e.g. V-101"
                                    className="pj-form-input"
                                />
                            </div>
                            <div className="pj-form-field full-width">
                                <label className="pj-form-label">Vessel Type</label>
                                <input
                                    value={vesselType}
                                    onChange={e => setVesselType(e.target.value)}
                                    placeholder="e.g. Pressure Vessel, Heat Exchanger"
                                    className="pj-form-input"
                                />
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                        <button onClick={() => setShowAddModal(false)} className="pj-btn secondary">Cancel</button>
                        <button
                            onClick={handleAdd}
                            disabled={!vesselName.trim() || createMutation.isPending}
                            className="pj-btn primary"
                        >
                            {createMutation.isPending ? 'Adding...' : 'Add Vessel'}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
```

**Step 2: Commit**

```
git add src/components/projects/ProjectVesselList.tsx
git commit -m "feat: add ProjectVesselList component for campaign dashboard"
```

---

### Task 5: Rewrite ProjectDetailPage to dashboard layout

**Files:**
- Modify: `src/pages/projects/ProjectDetailPage.tsx` (full rewrite)

**Step 1: Rewrite the page**

Replace the entire component. Remove tabs. Use the three new components. Add collapsible files section using existing `ProjectFilesTab`.

The new structure:
1. Back button
2. Header (name, meta, status dropdown, settings, delete)
3. Divider
4. Summary strip
5. Attention queue (conditional)
6. Vessel list
7. Collapsible files section

See the code below for the full replacement. Key changes:
- Remove `Tab` type and `activeTab` state
- Remove tab bar JSX
- Remove conditional tab rendering
- Add `<ProjectSummaryStrip>`, `<ProjectAttentionQueue>`, `<ProjectVesselList>`
- Wrap `ProjectFilesTab` in a collapsible section with chevron toggle

**Step 2: Verify build**

```
npm run typecheck
```

**Step 3: Commit**

```
git add src/pages/projects/ProjectDetailPage.tsx
git commit -m "feat: rewrite ProjectDetailPage as single-scroll campaign dashboard"
```

---

### Task 6: Consolidate ProjectListPage toolbar

**Files:**
- Modify: `src/pages/projects/ProjectListPage.tsx`

**Step 1: Merge view toggle into filter/search/sort toolbar row**

The change: remove the standalone `pj-toolbar` div that wraps just `ProjectViewToggle`. Move the `ProjectViewToggle` into the left side of `pj-toolbar-row` alongside the filter chips.

Current structure (lines 122-169):
```tsx
{/* Tabs + View Toggle */}
<div className="pj-toolbar">
    <div className="pj-toolbar-left">
        <ProjectViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
    </div>
</div>

{/* Filter chips + Search + Sort */}
<div className="pj-toolbar-row">
    <div className="pj-filter-well">...</div>
    <div className="pj-toolbar-right-group">...</div>
</div>
```

New structure:
```tsx
{/* Unified toolbar: view toggle + filters + search + sort */}
<div className="pj-toolbar-row">
    <div className="pj-toolbar-left-group">
        <ProjectViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
        <div className="pj-filter-well">...</div>
    </div>
    <div className="pj-toolbar-right-group">...</div>
</div>
```

**Step 2: Add the new CSS class for the left group**

In `projects.css`, add:

```css
.pj-toolbar-left-group {
  display: flex;
  align-items: center;
  gap: 16px;
}
```

And update the responsive breakpoint at `@media (max-width: 920px)`:

```css
.pj-toolbar-left-group {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}
```

**Step 3: Verify build**

```
npm run typecheck
```

**Step 4: Commit**

```
git add src/pages/projects/ProjectListPage.tsx src/pages/projects/projects.css
git commit -m "style: consolidate list page toolbar from 3 rows to 2"
```

---

### Task 7: Tighten VesselOverviewPage breadcrumb

**Files:**
- Modify: `src/pages/projects/VesselOverviewPage.tsx`

**Step 1: Consolidate the breadcrumb area**

Current (lines 165-176): back button on its own line, then a `pj-page-meta` div with scattered spans and inline styles.

Replace with a single back-button line that includes the context:

```tsx
<button onClick={() => navigate(`/projects/${projectId}`)} className="pj-back-btn">
    <ArrowLeft size={14} />
    {project.name}
    {project.client_name && (
        <span className="pj-dot-sep" />
    )}
    {project.client_name && (
        <span>{project.client_name}</span>
    )}
    {project.site_name && (
        <>
            <span className="pj-dot-sep" />
            <span>{project.site_name}</span>
        </>
    )}
</button>
```

Remove the standalone `pj-page-meta` div that follows the back button (lines 170-176). The contract/WO numbers can remain on the vessel page body if needed, but don't belong in the breadcrumb.

**Step 2: Verify build**

```
npm run typecheck
```

**Step 3: Commit**

```
git add src/pages/projects/VesselOverviewPage.tsx
git commit -m "style: tighten vessel page breadcrumb into single-line context strip"
```

---

### Task 8: Final verification

**Step 1: Run full build**

```
npm run build
```

**Step 2: Run tests**

```
npm run test
```

**Step 3: Visual verification**

Start dev server, navigate through:
1. `/projects` — verify single toolbar row with view toggle + filters
2. Click a project — verify dashboard layout (summary strip, optional attention queue, vessel list, collapsible files)
3. Click a vessel — verify tightened breadcrumb
4. Test empty states (project with no vessels)
5. Test both light and dark mode

**Step 4: Final commit if any adjustments needed**
