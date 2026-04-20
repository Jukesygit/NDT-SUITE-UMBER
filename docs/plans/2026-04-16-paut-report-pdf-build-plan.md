# PAUT PDF Report Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a beautifully formatted, print-to-PDF inspection report route that combines inspection detail DB data with vessel modeler visual assets (3D renders, 2D flattened projection, heatmaps), triggered from the "Generate Report" button on the inspection detail page.

**Architecture:** A new React route (`/projects/:projectId/vessels/:vesselId/report`) renders a print-optimized HTML document. The vessel modeler pre-captures 3D/2D images at save time and stores them in the model's `config` JSON. The report page fetches all DB records + the full vessel model config, then renders a `<ReportDocument>` component styled with `@media print` CSS. The user previews in-browser and uses `window.print()` or Ctrl+P to export as PDF.

**Tech Stack:** React 18 + TypeScript, `@media print` CSS for pixel-perfect PDF, existing React Query hooks for data, existing Three.js screenshot pipeline for pre-rendered images, `FlattenedViewport.exportImage()` for 2D projection.

---

## Phase 1: Pre-render Pipeline (Capture Images on Model Save)

### Task 1: Add reportAssets field to saved config

When saving a vessel model, we need to capture and store report images alongside the config. First, add the pre-render capture logic to the save flow.

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx` (lines 1498-1621)

**Step 1: Create the captureReportAssets helper function**

Add this function inside the VesselModeler component, after `buildSaveConfig` (after line 1587):

```typescript
/** Capture 3D + 2D images for PDF report generation */
const captureReportAssets = useCallback(async () => {
    const assets: Record<string, unknown> = {};

    // 1. Capture 3D viewport overviews
    const viewport = viewportRef.current;
    if (viewport) {
        const renderer = viewport.getRenderer();
        const scene = viewport.getScene();
        const camera = viewport.getCamera();
        const controls = viewport.getControls();
        const sceneManager = viewport.getSceneManager();
        if (renderer && scene && camera && controls && sceneManager) {
            try {
                const overviews = await captureVesselOverviews({
                    renderer, scene, camera, controls,
                    vesselState,
                    vesselGroup: sceneManager.getVesselGroup(),
                });
                assets.overviewRenders = overviews;
            } catch (err) {
                console.warn('Failed to capture vessel overviews:', err);
            }
        }
    }

    // 2. Capture 2D flattened projection
    const flatRef = flattenedViewportRef.current;
    if (flatRef) {
        try {
            const flatImage = flatRef.exportImage();
            if (flatImage) assets.flattenedView = flatImage;
        } catch (err) {
            console.warn('Failed to capture flattened view:', err);
        }
    }

    // 3. Capture per-annotation heatmaps and context images
    const annotationHeatmaps: Record<number, string> = {};
    for (const ann of vesselState.annotations) {
        if (!ann.includeInReport && ann.type !== 'scan') continue;
        const heatmap = captureAnnotationHeatmap(ann, vesselState);
        if (heatmap) annotationHeatmaps[ann.id] = heatmap;
    }
    if (Object.keys(annotationHeatmaps).length > 0) {
        assets.annotationHeatmaps = annotationHeatmaps;
    }

    // 4. Capture per-annotation 3D context images
    const viewport2 = viewportRef.current;
    if (viewport2) {
        const renderer = viewport2.getRenderer();
        const scene = viewport2.getScene();
        const camera = viewport2.getCamera();
        const controls = viewport2.getControls();
        const sceneManager = viewport2.getSceneManager();
        if (renderer && scene && camera && controls && sceneManager) {
            const contextImages: Record<number, string> = {};
            for (const ann of vesselState.annotations) {
                if (!ann.includeInReport && ann.type !== 'scan') continue;
                try {
                    const ctx = captureAnnotationContext(
                        { renderer, scene, camera, controls, vesselState, vesselGroup: sceneManager.getVesselGroup() },
                        ann,
                    );
                    contextImages[ann.id] = ctx;
                } catch (err) {
                    console.warn(`Failed to capture context for annotation ${ann.id}:`, err);
                }
            }
            if (Object.keys(contextImages).length > 0) {
                assets.annotationContextImages = contextImages;
            }
        }
    }

    return assets;
}, [vesselState]);
```

**Step 2: Add imports at top of VesselModeler.tsx**

Add near the existing report-image-capture import (or add if not present):

```typescript
import {
    captureVesselOverviews,
    captureAnnotationContext,
    captureAnnotationHeatmap,
} from './engine/report-image-capture';
```

**Step 3: Inject report assets into both save functions**

Modify `saveToProject` (line 1590) — insert report asset capture between `buildSaveConfig()` and the mutation call:

```typescript
const saveToProject = useCallback(async () => {
    if (!effectiveProjectVesselId) {
        setPickerMode('save');
        return;
    }
    if (!user) return;
    if (!vesselModelIdRef.current) {
        setPickerMode('save');
        return;
    }

    setSaveStatus('saving');
    try {
        const sanitized = buildSaveConfig();
        const modelName = vesselState.vesselName || 'Untitled Vessel';

        // Capture report images
        const reportAssets = await captureReportAssets();
        sanitized.reportAssets = reportAssets;

        await updateModelMutation.mutateAsync({
            id: vesselModelIdRef.current,
            config: sanitized,
            name: modelName,
        });

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
        console.error('Save to project failed:', err);
        alert(`Save failed: ${err?.message || 'Unknown error'}`);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
    }
}, [effectiveProjectVesselId, user, vesselState.vesselName, buildSaveConfig, updateModelMutation, captureReportAssets, saveModelType, saveModelTypeCustom]);
```

Apply the same pattern to `saveAsNewToProject` (line 1624) — add `const reportAssets = await captureReportAssets(); sanitized.reportAssets = reportAssets;` after `buildSaveConfig()`.

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(report): capture 3D/2D report images on vessel model save"
```

---

## Phase 2: Report Data Hook

### Task 2: Add service function to fetch full vessel model config

The existing `listProjectVesselModels` only returns summaries. We need the full `config` JSON for the report, and `getVesselModelByProjectVessel` in `vessel-model-service.ts` already does this. We just need a React Query hook.

**Files:**
- Create: `src/hooks/queries/useVesselModelForReport.ts`

**Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { getVesselModelByProjectVessel } from '../../services/vessel-model-service';

/**
 * Fetch the full vessel model config for a project vessel.
 * Used by the report page to access pre-rendered images and vessel state.
 */
export function useVesselModelForReport(projectVesselId: string | undefined) {
    return useQuery({
        queryKey: ['vesselModelForReport', projectVesselId],
        queryFn: () => getVesselModelByProjectVessel(projectVesselId!),
        enabled: !!projectVesselId,
        staleTime: 5 * 60 * 1000,
    });
}
```

**Step 2: Commit**

```bash
git add src/hooks/queries/useVesselModelForReport.ts
git commit -m "feat(report): add useVesselModelForReport hook for full model config"
```

---

## Phase 3: Report Page Route

### Task 3: Create the ReportPage route component

This is the data-fetching shell that loads everything the report needs, then passes it to `<ReportDocument />`.

**Files:**
- Create: `src/pages/projects/ReportPage.tsx`

**Step 1: Create ReportPage**

```tsx
// =============================================================================
// ReportPage — PAUT Inspection Report (print-to-PDF)
// =============================================================================
// Fetches all data needed for the report and renders <ReportDocument />.
// Opened in a new tab by the "Generate Report" button on InspectionDetailPage.
// User previews in-browser, then Ctrl+P or button → Save as PDF.
// =============================================================================

import { useParams } from 'react-router-dom';
import { useProject, useProjectVessel, useProjectProcedures, useVesselFiles, useScanLogEntries, useCalibrationLogEntries } from '../../hooks/queries/useInspectionProjects';
import { useProjectImages } from '../../hooks/queries/useInspectionProjects';
import { useVesselModelForReport } from '../../hooks/queries/useVesselModelForReport';
import ReportDocument from '../../components/report/ReportDocument';
import '../../components/report/report.css';

export default function ReportPage() {
    const { projectId, vesselId } = useParams<{ projectId: string; vesselId: string }>();

    const { data: project, isLoading: loadingProject } = useProject(projectId);
    const { data: vessel, isLoading: loadingVessel } = useProjectVessel(vesselId);
    const { data: procedures = [] } = useProjectProcedures(projectId);
    const { data: files = [] } = useVesselFiles(vesselId);
    const { data: scanLogEntries = [] } = useScanLogEntries(vesselId);
    const { data: calLogEntries = [] } = useCalibrationLogEntries(vesselId);
    const { data: images = [] } = useProjectImages(vesselId);
    const { data: vesselModel } = useVesselModelForReport(vesselId);

    const isLoading = loadingProject || loadingVessel;

    if (isLoading) {
        return (
            <div className="report-loading">
                <div className="report-loading__spinner" />
                <p>Loading report data...</p>
            </div>
        );
    }

    if (!project || !vessel) {
        return (
            <div className="report-loading">
                <p>Report data not found.</p>
            </div>
        );
    }

    // Extract vessel model config and pre-rendered assets
    const modelConfig = vesselModel?.config as Record<string, any> | undefined;
    const reportAssets = modelConfig?.reportAssets as Record<string, any> | undefined;

    return (
        <>
            {/* Floating print button — hidden in print */}
            <div className="report-print-bar no-print">
                <button className="report-print-btn" onClick={() => window.print()}>
                    Save as PDF
                </button>
            </div>

            <ReportDocument
                project={project}
                vessel={vessel}
                procedures={procedures}
                files={files}
                scanLogEntries={scanLogEntries}
                calLogEntries={calLogEntries}
                images={images}
                modelConfig={modelConfig}
                reportAssets={reportAssets}
            />
        </>
    );
}
```

**Step 2: Commit**

```bash
git add src/pages/projects/ReportPage.tsx
git commit -m "feat(report): create ReportPage route with data fetching"
```

---

### Task 4: Register the route in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add lazy import at line 32 (after InspectionDetailPage)**

```typescript
const ReportPage = lazy(() => import('./pages/projects/ReportPage'));
```

**Step 2: Add route after line 175 (after the InspectionDetailPage route)**

```tsx
<Route path="/projects/:projectId/vessels/:vesselId/report" element={
    <ProtectedRoute>
        <ErrorBoundary><ReportPage /></ErrorBoundary>
    </ProtectedRoute>
} />
```

Note: This route intentionally does NOT use `<Layout>` or `<RequireTabVisible>` — the report page is a standalone print document without the app shell.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(report): register /report route in App.tsx"
```

---

### Task 5: Wire the Generate Report button

**Files:**
- Modify: `src/components/projects/inspection-detail/ReportGenerationSection.tsx` (line 149)

**Step 1: Add projectId and vesselId to props**

Add to the `ReportGenerationSectionProps` interface (line 11):

```typescript
interface ReportGenerationSectionProps {
    vessel: ProjectVessel;
    project: InspectionProject;
    procedures: InspectionProcedure[];
    files: ProjectFile[];
    scanLogEntries: ScanLogEntry[];
    calLogEntries: CalibrationLogEntry[];
    compositeCount: number;
}
```

No change needed — we already have `project` and `vessel` in props.

**Step 2: Add onClick handler to the button (line 149)**

Replace the button (lines 149-161) with:

```tsx
<button
    type="button"
    disabled={!allReady}
    className={allReady ? 'btn btn--primary' : 'btn btn--secondary'}
    style={{
        marginTop: 16,
        width: '100%',
        opacity: allReady ? 1 : 0.5,
        cursor: allReady ? 'pointer' : 'not-allowed',
    }}
    onClick={() => {
        if (allReady) {
            window.open(
                `/projects/${_project.id}/vessels/${vessel.id}/report`,
                '_blank',
            );
        }
    }}
>
    Generate Report
</button>
```

Note: `_project` is currently unused (renamed with underscore at line 43). Change it back to `project`:

Line 43: Change `project: _project,` to `project,`

**Step 3: Commit**

```bash
git add src/components/projects/inspection-detail/ReportGenerationSection.tsx
git commit -m "feat(report): wire Generate Report button to open report route"
```

---

## Phase 4: Report CSS

### Task 6: Create report.css with print-optimized styles

**Files:**
- Create: `src/components/report/report.css`

**Step 1: Create the full stylesheet**

```css
/* =============================================================================
   PAUT Inspection Report — Print-optimized CSS
   =============================================================================
   Designed for browser print-to-PDF (Ctrl+P → Save as PDF).
   Uses @media print for pixel-perfect A4 output.
   ============================================================================= */

/* ---------------------------------------------------------------------------
   CSS Custom Properties (Report Design Tokens)
   --------------------------------------------------------------------------- */

:root {
    --report-navy: #0a1628;
    --report-brand: #00875a;
    --report-brand-light: #e6f4ee;
    --report-accent: #0ea5e9;
    --report-danger: #ef4444;
    --report-danger-bg: #fef2f2;
    --report-warning: #f59e0b;
    --report-warning-bg: #fffbeb;
    --report-safe: #22c55e;
    --report-safe-bg: #f0fdf4;
    --report-text: #334155;
    --report-text-muted: #94a3b8;
    --report-text-light: #64748b;
    --report-border: #e2e8f0;
    --report-border-dark: #cbd5e1;
    --report-row-alt: #f8fafc;
    --report-header-bg: #f1f5f9;
    --report-white: #ffffff;
    --report-page-bg: #ffffff;
}

/* ---------------------------------------------------------------------------
   Base / Reset
   --------------------------------------------------------------------------- */

.report-document {
    font-family: 'Inter', 'Calibri', 'Segoe UI', sans-serif;
    font-size: 10pt;
    line-height: 1.5;
    color: var(--report-text);
    background: var(--report-page-bg);
    max-width: 210mm;
    margin: 0 auto;
    padding: 0;
}

.report-document * {
    box-sizing: border-box;
}

/* ---------------------------------------------------------------------------
   Print Rules
   --------------------------------------------------------------------------- */

@media print {
    @page {
        size: A4 portrait;
        margin: 18mm 18mm 22mm 18mm;
    }

    html, body {
        margin: 0;
        padding: 0;
        background: white;
    }

    body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    .report-document {
        max-width: none;
        padding: 0;
    }

    .no-print {
        display: none !important;
    }

    .page-break {
        page-break-after: always;
        break-after: page;
    }

    .no-break {
        page-break-inside: avoid;
        break-inside: avoid;
    }

    .page-break-before {
        page-break-before: always;
        break-before: page;
    }

    thead {
        display: table-header-group;
    }
}

/* ---------------------------------------------------------------------------
   Screen Preview
   --------------------------------------------------------------------------- */

@media screen {
    .report-document {
        padding: 20mm;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
    }

    .page-break {
        border-bottom: 2px dashed var(--report-border);
        padding-bottom: 20mm;
        margin-bottom: 20mm;
    }
}

/* ---------------------------------------------------------------------------
   Print Toolbar (screen only)
   --------------------------------------------------------------------------- */

.report-print-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    display: flex;
    justify-content: center;
    padding: 12px;
    background: var(--report-navy);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.report-print-btn {
    padding: 10px 32px;
    background: var(--report-brand);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}

.report-print-btn:hover {
    background: #006d49;
}

/* ---------------------------------------------------------------------------
   Loading State
   --------------------------------------------------------------------------- */

.report-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-family: 'Inter', sans-serif;
    color: var(--report-text-muted);
}

.report-loading__spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--report-border);
    border-top-color: var(--report-brand);
    border-radius: 50%;
    animation: report-spin 0.8s linear infinite;
    margin-bottom: 16px;
}

@keyframes report-spin {
    to { transform: rotate(360deg); }
}

/* ---------------------------------------------------------------------------
   Page Header (repeating)
   --------------------------------------------------------------------------- */

.report-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--report-navy);
    margin-bottom: 16px;
}

.report-page-header__logo {
    height: 36px;
}

.report-page-header__title {
    font-size: 9pt;
    font-weight: 700;
    color: var(--report-navy);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.report-page-header__meta {
    font-size: 8pt;
    color: var(--report-text-muted);
    text-align: right;
}

/* ---------------------------------------------------------------------------
   Page Footer
   --------------------------------------------------------------------------- */

.report-page-footer {
    display: flex;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid var(--report-border);
    margin-top: auto;
    font-size: 8pt;
    color: var(--report-text-muted);
}

/* ---------------------------------------------------------------------------
   Cover Page
   --------------------------------------------------------------------------- */

.report-cover {
    position: relative;
}

.report-cover__header {
    background: var(--report-navy);
    color: white;
    padding: 24px 28px;
    margin: -18mm -18mm 24px -18mm;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

@media screen {
    .report-cover__header {
        margin: -20mm -20mm 24px -20mm;
        border-radius: 0;
    }
}

.report-cover__header-logo {
    height: 48px;
}

.report-cover__header-title {
    font-size: 16pt;
    font-weight: 800;
    line-height: 1.2;
    text-align: right;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* ---------------------------------------------------------------------------
   Section Headers
   --------------------------------------------------------------------------- */

.report-section-header {
    background: var(--report-brand);
    color: white;
    padding: 8px 14px;
    font-size: 11pt;
    font-weight: 700;
    margin: 20px 0 12px;
    letter-spacing: 0.02em;
}

.report-section-header--dark {
    background: var(--report-navy);
}

/* ---------------------------------------------------------------------------
   Tables
   --------------------------------------------------------------------------- */

.report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    margin-bottom: 16px;
}

.report-table th {
    background: var(--report-header-bg);
    font-weight: 600;
    text-align: left;
    padding: 7px 10px;
    border: 1px solid var(--report-border);
    color: var(--report-text);
}

.report-table td {
    padding: 6px 10px;
    border: 1px solid var(--report-border);
    vertical-align: top;
}

.report-table tr:nth-child(even) td {
    background: var(--report-row-alt);
}

.report-table--branded th {
    background: var(--report-brand);
    color: white;
    border-color: var(--report-brand);
}

/* Label-value pair table (e.g. Component Details) */
.report-table--pairs td:nth-child(odd) {
    font-weight: 600;
    background: var(--report-header-bg);
    width: 25%;
    white-space: nowrap;
}

/* ---------------------------------------------------------------------------
   Executive Dashboard
   --------------------------------------------------------------------------- */

.report-dashboard {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 16px 0 24px;
}

.report-stat-card {
    border: 1px solid var(--report-border);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    page-break-inside: avoid;
}

.report-stat-card__value {
    font-size: 22pt;
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
}

.report-stat-card__label {
    font-size: 8pt;
    color: var(--report-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
}

.report-stat-card--danger {
    border-color: var(--report-danger);
    background: var(--report-danger-bg);
}

.report-stat-card--danger .report-stat-card__value {
    color: var(--report-danger);
}

.report-stat-card--warning {
    border-color: var(--report-warning);
    background: var(--report-warning-bg);
}

.report-stat-card--warning .report-stat-card__value {
    color: var(--report-warning);
}

.report-stat-card--safe {
    border-color: var(--report-safe);
    background: var(--report-safe-bg);
}

.report-stat-card--safe .report-stat-card__value {
    color: var(--report-safe);
}

.report-stat-card--neutral {
    border-color: var(--report-accent);
    background: #f0f9ff;
}

.report-stat-card--neutral .report-stat-card__value {
    color: var(--report-accent);
}

/* ---------------------------------------------------------------------------
   Threshold Badge (inline colored pill for WT values in tables)
   --------------------------------------------------------------------------- */

.report-wt-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 8.5pt;
    font-variant-numeric: tabular-nums;
}

.report-wt-badge--danger {
    background: var(--report-danger-bg);
    color: var(--report-danger);
    border: 1px solid var(--report-danger);
}

.report-wt-badge--warning {
    background: var(--report-warning-bg);
    color: var(--report-warning);
    border: 1px solid var(--report-warning);
}

.report-wt-badge--safe {
    background: var(--report-safe-bg);
    color: var(--report-safe);
    border: 1px solid var(--report-safe);
}

/* ---------------------------------------------------------------------------
   Inspection Result Page (per-annotation)
   --------------------------------------------------------------------------- */

.report-result-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
}

.report-result-header__file {
    font-size: 9pt;
    color: var(--report-text-light);
}

.report-result-header__feature {
    font-size: 10pt;
    font-weight: 600;
}

.report-result-images {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 16px;
}

.report-result-image {
    border: 1px solid var(--report-border);
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
}

.report-result-image img {
    width: 100%;
    display: block;
}

.report-result-image__caption {
    font-size: 8pt;
    color: var(--report-text-muted);
    padding: 4px 8px;
    text-align: center;
    background: var(--report-header-bg);
}

/* Stats callout box */
.report-stats-box {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1px;
    background: var(--report-border);
    border: 1px solid var(--report-border);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 16px;
}

.report-stats-box__item {
    background: white;
    padding: 8px 10px;
    text-align: center;
}

.report-stats-box__item--highlight {
    background: var(--report-danger-bg);
}

.report-stats-box__value {
    font-size: 12pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.report-stats-box__label {
    font-size: 7pt;
    color: var(--report-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

/* Analysis text block */
.report-analysis {
    margin: 12px 0;
    padding: 10px 14px;
    background: var(--report-header-bg);
    border-left: 3px solid var(--report-brand);
    font-size: 9.5pt;
    line-height: 1.6;
}

/* ---------------------------------------------------------------------------
   Image Pages (Flattened, 3D Overview, Photographs)
   --------------------------------------------------------------------------- */

.report-full-image {
    width: 100%;
    border: 1px solid var(--report-border);
    border-radius: 4px;
}

.report-image-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.report-image-card {
    border: 1px solid var(--report-border);
    border-radius: 4px;
    overflow: hidden;
    page-break-inside: avoid;
}

.report-image-card img {
    width: 100%;
    display: block;
}

.report-image-card__label {
    font-size: 8pt;
    color: var(--report-text-muted);
    padding: 4px 8px;
    text-align: center;
    background: var(--report-header-bg);
    font-weight: 600;
}

/* Figure caption */
.report-figure-caption {
    font-size: 8pt;
    color: var(--report-text-muted);
    text-align: center;
    margin-top: 6px;
    font-style: italic;
}

/* ---------------------------------------------------------------------------
   Sign-off Section
   --------------------------------------------------------------------------- */

.report-signoff {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0;
    border: 1px solid var(--report-border);
    margin-top: 20px;
}

.report-signoff__col {
    padding: 10px 14px;
    border-right: 1px solid var(--report-border);
}

.report-signoff__col:last-child {
    border-right: none;
}

.report-signoff__title {
    font-weight: 700;
    font-size: 9pt;
    background: var(--report-header-bg);
    margin: -10px -14px 10px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--report-border);
}

.report-signoff__row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 9pt;
}

.report-signoff__label {
    font-weight: 600;
    min-width: 80px;
}

/* ---------------------------------------------------------------------------
   Restriction highlight
   --------------------------------------------------------------------------- */

.report-restriction {
    background: var(--report-warning-bg);
    border: 1px solid var(--report-warning);
    border-radius: 4px;
    padding: 8px 12px;
    margin-top: 8px;
    font-size: 9pt;
}

.report-restriction__label {
    font-weight: 700;
    color: var(--report-warning);
    margin-bottom: 2px;
}
```

**Step 2: Commit**

```bash
git add src/components/report/report.css
git commit -m "feat(report): create print-optimized report stylesheet"
```

---

## Phase 5: Report Components

### Task 7: Create ReportDocument and CoverPage

**Files:**
- Create: `src/components/report/ReportDocument.tsx`
- Create: `src/components/report/CoverPage.tsx`

**Step 1: Create ReportDocument.tsx**

This is the top-level layout that assembles all report pages.

```tsx
// =============================================================================
// ReportDocument — Top-level report layout
// =============================================================================

import type { InspectionProject, ProjectVessel, InspectionProcedure, ProjectFile, ScanLogEntry, CalibrationLogEntry, ProjectImage } from '../../types/inspection-project';
import CoverPage from './CoverPage';
import DashboardPage from './DashboardPage';
import PhotographsPage from './PhotographsPage';
import InspectionResultPage from './InspectionResultPage';
import FlattenedProjectionPage from './FlattenedProjectionPage';
import VesselOverviewPage from './VesselOverviewPage';
import ScanLogPage from './ScanLogPage';
import CalibrationLogPage from './CalibrationLogPage';
import ReferenceDrawingPage from './ReferenceDrawingPage';
import ReportHeader from './ReportHeader';

export interface ReportDocumentProps {
    project: InspectionProject;
    vessel: ProjectVessel;
    procedures: InspectionProcedure[];
    files: ProjectFile[];
    scanLogEntries: ScanLogEntry[];
    calLogEntries: CalibrationLogEntry[];
    images: ProjectImage[];
    modelConfig?: Record<string, any>;
    reportAssets?: Record<string, any>;
}

export default function ReportDocument({
    project,
    vessel,
    procedures,
    files,
    scanLogEntries,
    calLogEntries,
    images,
    modelConfig,
    reportAssets,
}: ReportDocumentProps) {
    // Extract model state
    const vesselModelState = modelConfig?.vessel as Record<string, any> | undefined;
    const annotations = (modelConfig?.annotations ?? []) as any[];
    const scanComposites = (modelConfig?.scanComposites ?? []) as any[];
    const thicknessThresholds = (modelConfig?.vessel as any)?.thicknessThresholds ?? vesselModelState?.thicknessThresholds;

    // Extract pre-rendered images
    const overviewRenders = (reportAssets?.overviewRenders ?? []) as Array<{ label: string; dataUrl: string }>;
    const flattenedView = reportAssets?.flattenedView as string | undefined;
    const annotationHeatmaps = (reportAssets?.annotationHeatmaps ?? {}) as Record<string, string>;
    const annotationContextImages = (reportAssets?.annotationContextImages ?? {}) as Record<string, string>;

    // Report annotations (those with includeInReport or all scan-type)
    const reportAnnotations = annotations.filter((a: any) =>
        a.includeInReport || a.type === 'scan'
    );

    // Reference drawings from files
    const referenceDrawings = files.filter(f =>
        f.file_type === 'ga_drawing' || f.file_type === 'pid' || f.file_type === 'location_drawing' || f.file_type === 'plot_plan'
    );

    // Site photos
    const sitePhotos = images.filter(img => img.image_url);

    // Figure counter
    let figureNum = 0;
    const nextFigure = () => ++figureNum;

    return (
        <div className="report-document">
            {/* Page 1: Cover */}
            <CoverPage project={project} vessel={vessel} procedures={procedures} />
            <div className="page-break" />

            {/* Page 2: Executive Dashboard */}
            <ReportHeader project={project} vessel={vessel} />
            <DashboardPage
                project={project}
                vessel={vessel}
                scanLogEntries={scanLogEntries}
                annotations={annotations}
                scanComposites={scanComposites}
                thicknessThresholds={thicknessThresholds}
                modelConfig={modelConfig}
            />
            <div className="page-break" />

            {/* Page 3: Photographs */}
            {sitePhotos.length > 0 && (
                <>
                    <ReportHeader project={project} vessel={vessel} />
                    <PhotographsPage images={sitePhotos} nextFigure={nextFigure} />
                    <div className="page-break" />
                </>
            )}

            {/* Pages 4-N: Inspection Results */}
            {reportAnnotations.map((ann: any) => (
                <div key={ann.id}>
                    <ReportHeader project={project} vessel={vessel} />
                    <InspectionResultPage
                        annotation={ann}
                        heatmapUrl={annotationHeatmaps[ann.id]}
                        contextImageUrl={annotationContextImages[ann.id]}
                        thicknessThresholds={thicknessThresholds}
                        nextFigure={nextFigure}
                    />
                    <div className="page-break" />
                </div>
            ))}

            {/* 2D Flattened Projection */}
            {flattenedView && (
                <>
                    <ReportHeader project={project} vessel={vessel} />
                    <FlattenedProjectionPage imageUrl={flattenedView} nextFigure={nextFigure} />
                    <div className="page-break" />
                </>
            )}

            {/* 3D Vessel Overview */}
            {overviewRenders.length > 0 && (
                <>
                    <ReportHeader project={project} vessel={vessel} />
                    <VesselOverviewPage renders={overviewRenders} nextFigure={nextFigure} />
                    <div className="page-break" />
                </>
            )}

            {/* Scan Log */}
            {scanLogEntries.length > 0 && (
                <>
                    <ReportHeader project={project} vessel={vessel} />
                    <ScanLogPage entries={scanLogEntries} thicknessThresholds={thicknessThresholds} />
                    <div className="page-break" />
                </>
            )}

            {/* Calibration Log */}
            {calLogEntries.length > 0 && (
                <>
                    <ReportHeader project={project} vessel={vessel} />
                    <CalibrationLogPage entries={calLogEntries} />
                    <div className="page-break" />
                </>
            )}

            {/* Reference Drawings */}
            {referenceDrawings.map((file) => (
                <div key={file.id}>
                    <ReportHeader project={project} vessel={vessel} />
                    <ReferenceDrawingPage file={file} nextFigure={nextFigure} />
                    <div className="page-break" />
                </div>
            ))}
        </div>
    );
}
```

**Step 2: Create CoverPage.tsx**

```tsx
// =============================================================================
// CoverPage — Page 1: Branded header + metadata tables
// =============================================================================

import type { InspectionProject, ProjectVessel, InspectionProcedure } from '../../types/inspection-project';

interface CoverPageProps {
    project: InspectionProject;
    vessel: ProjectVessel;
    procedures: InspectionProcedure[];
}

export default function CoverPage({ project, vessel, procedures }: CoverPageProps) {
    const equipment = vessel.equipment_config ?? {};
    const beamsets = vessel.beamset_config ?? [];
    const signoff = vessel.signoff_details ?? {};
    const procedure = procedures.find(p => p.id === vessel.procedure_id);

    return (
        <div className="report-cover">
            {/* Branded header bar */}
            <div className="report-cover__header">
                <div>
                    <div className="report-cover__header-title">
                        Phased Array Ultrasonic<br />Testing Inspection Report
                    </div>
                </div>
                {/* Logo placeholder — replace with actual logo */}
                <div style={{ fontSize: '24pt', fontWeight: 800, letterSpacing: '0.05em' }}>
                    MATRIX
                </div>
            </div>

            {/* Project metadata table */}
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Customer</td>
                        <td>{project.client_name || ''}</td>
                        <td>Location</td>
                        <td>{project.site_name || vessel.location || ''}</td>
                    </tr>
                    <tr>
                        <td>Project</td>
                        <td colSpan={3}>{project.name || ''}</td>
                    </tr>
                    <tr>
                        <td>Contract No</td>
                        <td>{project.contract_number || ''}</td>
                        <td>WO No</td>
                        <td>{project.work_order_number || ''}</td>
                    </tr>
                    <tr>
                        <td>Report No</td>
                        <td>{project.report_number || ''}</td>
                        <td>Test Date</td>
                        <td>{project.start_date || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Component Details & Procedure */}
            <div className="report-section-header">Component Details &amp; Procedure</div>
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Description</td>
                        <td colSpan={3}>{vessel.description || ''}</td>
                    </tr>
                    <tr>
                        <td>Line/Tag Number</td>
                        <td>{vessel.line_tag_number || vessel.vessel_tag || ''}</td>
                        <td>Drawing Number</td>
                        <td>{vessel.drawing_number || ''}</td>
                    </tr>
                    <tr>
                        <td>Material</td>
                        <td>{vessel.material || ''}</td>
                        <td>Nominal Thickness</td>
                        <td>{vessel.nominal_thickness || ''}</td>
                    </tr>
                    <tr>
                        <td>Temperature</td>
                        <td>{vessel.operating_temperature || ''}</td>
                        <td>Corrosion Allowance</td>
                        <td>{vessel.corrosion_allowance || ''}</td>
                    </tr>
                    <tr>
                        <td>Stress Relief</td>
                        <td>{vessel.stress_relief || ''}</td>
                        <td>Coating Type</td>
                        <td>{vessel.coating_type || ''}</td>
                    </tr>
                    <tr>
                        <td>Procedure No</td>
                        <td>{procedure?.procedure_number || ''}</td>
                        <td>Technique Nos</td>
                        <td>{procedure?.technique_numbers || ''}</td>
                    </tr>
                    <tr>
                        <td>Acceptance Criteria</td>
                        <td>{procedure?.acceptance_criteria || ''}</td>
                        <td>Applicable Standard</td>
                        <td>{procedure?.applicable_standard || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Equipment */}
            <div className="report-section-header">Equipment</div>
            <table className="report-table report-table--pairs">
                <tbody>
                    <tr>
                        <td>Equip. Model</td>
                        <td>{equipment.model || ''}</td>
                        <td>Serial No</td>
                        <td>{equipment.serial_number || ''}</td>
                    </tr>
                    <tr>
                        <td>Probe</td>
                        <td>{equipment.probe || ''}</td>
                        <td>Wedge</td>
                        <td>{equipment.wedge || ''}</td>
                    </tr>
                    <tr>
                        <td>Calibration Blocks</td>
                        <td>{equipment.calibration_blocks || ''}</td>
                        <td>Scanner Frame</td>
                        <td>{equipment.scanner_frame || ''}</td>
                    </tr>
                    <tr>
                        <td>Ref Blocks</td>
                        <td>{equipment.ref_blocks || ''}</td>
                        <td>Couplant</td>
                        <td>{equipment.couplant || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Beamset Configuration */}
            {beamsets.length > 0 && (
                <>
                    <div className="report-section-header">Phased Array Beamset Configuration</div>
                    <table className="report-table report-table--branded">
                        <thead>
                            <tr>
                                <th>Group</th>
                                <th>Type</th>
                                <th>Active Elements</th>
                                <th>Aperture</th>
                                <th>Focal Depth</th>
                                <th>Angle</th>
                                <th>Skew</th>
                                <th>Index Offset</th>
                            </tr>
                        </thead>
                        <tbody>
                            {beamsets.map((row: any, i: number) => (
                                <tr key={i}>
                                    <td>{row.group ?? ''}</td>
                                    <td>{row.type ?? ''}</td>
                                    <td>{row.active_elements ?? ''}</td>
                                    <td>{row.aperture ?? ''}</td>
                                    <td>{row.focal_depth ?? ''}</td>
                                    <td>{row.angle ?? ''}</td>
                                    <td>{row.skew ?? ''}</td>
                                    <td>{row.index_offset ?? ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {/* Results Summary */}
            <div className="report-section-header">Inspection Results Summary</div>
            <div className="report-analysis">
                {vessel.results_summary || <span style={{ color: 'var(--report-text-muted)' }}>No summary provided.</span>}
            </div>

            {/* Sign-off */}
            <div className="report-signoff">
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Technician</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.technician?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Qualification:</span> {signoff.technician?.qualification || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Signature:</span></div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.technician?.date || ''}</div>
                </div>
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Reviewed</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.reviewer?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Qualification:</span> {signoff.reviewer?.qualification || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Signature:</span></div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.reviewer?.date || ''}</div>
                </div>
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Client Acceptance</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.client?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Position:</span> {signoff.client?.position || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Signature:</span></div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.client?.date || ''}</div>
                </div>
            </div>
        </div>
    );
}
```

**Step 3: Commit**

```bash
git add src/components/report/ReportDocument.tsx src/components/report/CoverPage.tsx
git commit -m "feat(report): create ReportDocument layout and CoverPage component"
```

---

### Task 8: Create ReportHeader component

**Files:**
- Create: `src/components/report/ReportHeader.tsx`

**Step 1: Create the repeating page header**

```tsx
import type { InspectionProject, ProjectVessel } from '../../types/inspection-project';

interface ReportHeaderProps {
    project: InspectionProject;
    vessel: ProjectVessel;
}

export default function ReportHeader({ project, vessel }: ReportHeaderProps) {
    return (
        <div className="report-page-header">
            <div className="report-page-header__title">
                PAUT Inspection Report
            </div>
            <div className="report-page-header__meta">
                <div>{project.report_number || project.name}</div>
                <div>{vessel.vessel_name} — {project.site_name || ''}</div>
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add src/components/report/ReportHeader.tsx
git commit -m "feat(report): create ReportHeader component"
```

---

### Task 9: Create DashboardPage (executive summary with stat cards)

**Files:**
- Create: `src/components/report/DashboardPage.tsx`

**Step 1: Create the dashboard component**

```tsx
// =============================================================================
// DashboardPage — Page 2: Executive summary with stat cards
// =============================================================================

import type { InspectionProject, ProjectVessel, ScanLogEntry } from '../../types/inspection-project';

interface DashboardPageProps {
    project: InspectionProject;
    vessel: ProjectVessel;
    scanLogEntries: ScanLogEntry[];
    annotations: any[];
    scanComposites: any[];
    thicknessThresholds?: any;
    modelConfig?: Record<string, any>;
}

function getThresholdClass(value: number, thresholds: any): string {
    if (!thresholds) return 'report-stat-card--neutral';
    if (thresholds.mode === 'absolute') {
        if (value <= thresholds.redBelow) return 'report-stat-card--danger';
        if (value <= thresholds.yellowBelow) return 'report-stat-card--warning';
        return 'report-stat-card--safe';
    }
    if (thresholds.mode === 'percentage' && thresholds.nominalThickness) {
        const pct = (value / thresholds.nominalThickness) * 100;
        if (pct <= thresholds.redBelowPct) return 'report-stat-card--danger';
        if (pct <= thresholds.yellowBelowPct) return 'report-stat-card--warning';
        return 'report-stat-card--safe';
    }
    return 'report-stat-card--neutral';
}

export default function DashboardPage({
    vessel,
    scanLogEntries,
    annotations,
    scanComposites,
    thicknessThresholds,
}: DashboardPageProps) {
    // Calculate stats
    const scanCount = scanLogEntries.length;
    const findingsCount = annotations.filter((a: any) => a.type === 'scan' || a.includeInReport).length;
    const restrictionCount = annotations.filter((a: any) => a.restrictionNotes).length;

    // Global min WT from scan log
    const minWtValues = scanLogEntries
        .map(e => e.min_wt)
        .filter((v): v is number => v != null && v > 0);
    const globalMinWt = minWtValues.length > 0 ? Math.min(...minWtValues) : null;

    // Min WT location
    const minEntry = globalMinWt != null
        ? scanLogEntries.find(e => e.min_wt === globalMinWt)
        : null;

    // Composite count
    const confirmedComposites = scanComposites.filter((sc: any) => sc.orientationConfirmed).length;

    const signoff = vessel.signoff_details ?? {};

    return (
        <div>
            <div className="report-section-header--dark report-section-header">Executive Summary</div>

            {/* Stat cards */}
            <div className="report-dashboard">
                <div className="report-stat-card report-stat-card--neutral">
                    <div className="report-stat-card__value">{scanCount}</div>
                    <div className="report-stat-card__label">Scans Performed</div>
                </div>

                <div className={`report-stat-card ${globalMinWt != null ? getThresholdClass(globalMinWt, thicknessThresholds) : 'report-stat-card--neutral'}`}>
                    <div className="report-stat-card__value">
                        {globalMinWt != null ? `${globalMinWt.toFixed(1)}mm` : '—'}
                    </div>
                    <div className="report-stat-card__label">Min Wall Thickness</div>
                </div>

                <div className="report-stat-card report-stat-card--neutral">
                    <div className="report-stat-card__value">{findingsCount}</div>
                    <div className="report-stat-card__label">Findings</div>
                </div>

                <div className={`report-stat-card ${restrictionCount > 0 ? 'report-stat-card--warning' : 'report-stat-card--neutral'}`}>
                    <div className="report-stat-card__value">{restrictionCount}</div>
                    <div className="report-stat-card__label">Restrictions</div>
                </div>
            </div>

            {/* Min WT location */}
            {minEntry && (
                <p style={{ fontSize: '9pt', color: 'var(--report-text-light)', marginBottom: '16px' }}>
                    Minimum reading: <strong>{globalMinWt?.toFixed(1)}mm</strong> at {minEntry.filename}
                    {minEntry.comments && ` — ${minEntry.comments}`}
                </p>
            )}

            {/* Results Summary */}
            <div className="report-section-header">Inspection Results Summary</div>
            <div className="report-analysis">
                {vessel.results_summary || <span style={{ color: 'var(--report-text-muted)' }}>No summary provided.</span>}
            </div>

            {/* Sign-off */}
            <div className="report-signoff" style={{ marginTop: '24px' }}>
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Technician</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.technician?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Qualification:</span> {signoff.technician?.qualification || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.technician?.date || ''}</div>
                </div>
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Reviewed</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.reviewer?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Qualification:</span> {signoff.reviewer?.qualification || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.reviewer?.date || ''}</div>
                </div>
                <div className="report-signoff__col">
                    <div className="report-signoff__title">Client Acceptance</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Name:</span> {signoff.client?.name || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Position:</span> {signoff.client?.position || ''}</div>
                    <div className="report-signoff__row"><span className="report-signoff__label">Date:</span> {signoff.client?.date || ''}</div>
                </div>
            </div>
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add src/components/report/DashboardPage.tsx
git commit -m "feat(report): create DashboardPage with stat cards and sign-off"
```

---

### Task 10: Create InspectionResultPage (per-annotation)

**Files:**
- Create: `src/components/report/InspectionResultPage.tsx`

**Step 1: Create the component**

```tsx
// =============================================================================
// InspectionResultPage — Per-annotation inspection result page
// =============================================================================

interface InspectionResultPageProps {
    annotation: any;
    heatmapUrl?: string;
    contextImageUrl?: string;
    thicknessThresholds?: any;
    nextFigure: () => number;
}

function getWtBadgeClass(value: number, thresholds: any): string {
    if (!thresholds) return 'report-wt-badge--safe';
    if (thresholds.mode === 'absolute') {
        if (value <= thresholds.redBelow) return 'report-wt-badge--danger';
        if (value <= thresholds.yellowBelow) return 'report-wt-badge--warning';
        return 'report-wt-badge--safe';
    }
    if (thresholds.mode === 'percentage' && thresholds.nominalThickness) {
        const pct = (value / thresholds.nominalThickness) * 100;
        if (pct <= thresholds.redBelowPct) return 'report-wt-badge--danger';
        if (pct <= thresholds.yellowBelowPct) return 'report-wt-badge--warning';
        return 'report-wt-badge--safe';
    }
    return 'report-wt-badge--safe';
}

export default function InspectionResultPage({
    annotation,
    heatmapUrl,
    contextImageUrl,
    thicknessThresholds,
    nextFigure,
}: InspectionResultPageProps) {
    const stats = annotation.thicknessStats;
    const hasImages = heatmapUrl || contextImageUrl;
    const attachments = annotation.attachments ?? [];
    const companionImage = attachments.find((a: any) => a.type === 'companion_scan');

    return (
        <div>
            <div className="report-section-header">
                Inspection Results — {annotation.name}
            </div>

            {/* Feature info */}
            <div className="report-result-header">
                <div className="report-result-header__feature">
                    {annotation.name} — {annotation.type === 'scan' ? 'Scan Area' : 'Restriction'}
                </div>
                <div className="report-result-header__file">
                    Position: {annotation.pos?.toFixed(0)}mm axial, {annotation.angle?.toFixed(0)}°
                </div>
            </div>

            {/* Size info */}
            <p style={{ fontSize: '9pt', color: 'var(--report-text-light)', margin: '0 0 12px' }}>
                Size: {annotation.width?.toFixed(0)} × {annotation.height?.toFixed(0)} mm
            </p>

            {/* Images grid */}
            {hasImages && (
                <div className="report-result-images">
                    {heatmapUrl && (
                        <div className="report-result-image">
                            <img src={heatmapUrl} alt="C-Scan Thickness Map" />
                            <div className="report-result-image__caption">
                                Figure {nextFigure()} — C-Scan Thickness Map
                            </div>
                        </div>
                    )}
                    {contextImageUrl && (
                        <div className="report-result-image">
                            <img src={contextImageUrl} alt="Vessel Context" />
                            <div className="report-result-image__caption">
                                Figure {nextFigure()} — Location on Vessel
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Companion scan image (full-width if available) */}
            {companionImage?.dataUrl && (
                <div className="report-result-image" style={{ marginBottom: 16 }}>
                    <img src={companionImage.dataUrl} alt="Companion Scan" style={{ width: '100%' }} />
                    <div className="report-result-image__caption">
                        Figure {nextFigure()} — A/B/C/D Scan View
                    </div>
                </div>
            )}

            {/* Thickness statistics box */}
            {stats && (
                <div className="report-stats-box no-break">
                    <div className="report-stats-box__item report-stats-box__item--highlight">
                        <div className={`report-stats-box__value ${getWtBadgeClass(stats.min, thicknessThresholds).replace('report-wt-badge', 'report-stat-card').replace('--', ' ').includes('danger') ? '' : ''}`}
                             style={{ color: stats.min <= (thicknessThresholds?.redBelow ?? 0) ? 'var(--report-danger)' : stats.min <= (thicknessThresholds?.yellowBelow ?? 0) ? 'var(--report-warning)' : 'var(--report-safe)' }}>
                            {stats.min.toFixed(2)}mm
                        </div>
                        <div className="report-stats-box__label">Min WT</div>
                    </div>
                    <div className="report-stats-box__item">
                        <div className="report-stats-box__value">{stats.max.toFixed(2)}mm</div>
                        <div className="report-stats-box__label">Max WT</div>
                    </div>
                    <div className="report-stats-box__item">
                        <div className="report-stats-box__value">{stats.avg.toFixed(2)}mm</div>
                        <div className="report-stats-box__label">Avg WT</div>
                    </div>
                    <div className="report-stats-box__item">
                        <div className="report-stats-box__value">{stats.stdDev.toFixed(3)}mm</div>
                        <div className="report-stats-box__label">Std Dev</div>
                    </div>
                    <div className="report-stats-box__item">
                        <div className="report-stats-box__value">{stats.sampleCount?.toLocaleString() ?? '—'}</div>
                        <div className="report-stats-box__label">Samples</div>
                    </div>
                </div>
            )}

            {/* Restriction notes */}
            {annotation.restrictionNotes && (
                <div className="report-restriction no-break">
                    <div className="report-restriction__label">Restriction</div>
                    {annotation.restrictionNotes}
                </div>
            )}
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add src/components/report/InspectionResultPage.tsx
git commit -m "feat(report): create InspectionResultPage with heatmaps and stats"
```

---

### Task 11: Create remaining page components

**Files:**
- Create: `src/components/report/PhotographsPage.tsx`
- Create: `src/components/report/FlattenedProjectionPage.tsx`
- Create: `src/components/report/VesselOverviewPage.tsx`
- Create: `src/components/report/ScanLogPage.tsx`
- Create: `src/components/report/CalibrationLogPage.tsx`
- Create: `src/components/report/ReferenceDrawingPage.tsx`

**Step 1: Create PhotographsPage.tsx**

```tsx
import type { ProjectImage } from '../../types/inspection-project';

interface PhotographsPageProps {
    images: ProjectImage[];
    nextFigure: () => number;
}

export default function PhotographsPage({ images, nextFigure }: PhotographsPageProps) {
    return (
        <div>
            <div className="report-section-header">Photographs</div>
            <div className="report-image-grid">
                {images.map((img) => (
                    <div key={img.id} className="report-image-card no-break">
                        <img src={img.image_url} alt={img.caption || 'Inspection photo'} />
                        <div className="report-image-card__label">
                            Figure {nextFigure()} — {img.caption || 'Inspection photograph'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**Step 2: Create FlattenedProjectionPage.tsx**

```tsx
interface FlattenedProjectionPageProps {
    imageUrl: string;
    nextFigure: () => number;
}

export default function FlattenedProjectionPage({ imageUrl, nextFigure }: FlattenedProjectionPageProps) {
    const figNum = nextFigure();
    return (
        <div>
            <div className="report-section-header">Phased Array Mapped Vessel Shell</div>
            <img src={imageUrl} alt="2D Flattened Vessel Projection" className="report-full-image" />
            <div className="report-figure-caption">
                Figure {figNum} — 2D unwrapped vessel projection with thickness overlay
            </div>
        </div>
    );
}
```

**Step 3: Create VesselOverviewPage.tsx**

```tsx
interface VesselOverviewPageProps {
    renders: Array<{ label: string; dataUrl: string }>;
    nextFigure: () => number;
}

export default function VesselOverviewPage({ renders, nextFigure }: VesselOverviewPageProps) {
    return (
        <div>
            <div className="report-section-header">3D Vessel Overview</div>
            <div className="report-image-grid">
                {renders.map((r, i) => (
                    <div key={i} className="report-image-card no-break">
                        <img src={r.dataUrl} alt={r.label} />
                        <div className="report-image-card__label">
                            Figure {nextFigure()} — {r.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

**Step 4: Create ScanLogPage.tsx**

```tsx
import type { ScanLogEntry } from '../../types/inspection-project';

interface ScanLogPageProps {
    entries: ScanLogEntry[];
    thicknessThresholds?: any;
}

function getWtBadgeClass(value: number, thresholds: any): string {
    if (!thresholds) return 'report-wt-badge--safe';
    if (thresholds.mode === 'absolute') {
        if (value <= thresholds.redBelow) return 'report-wt-badge--danger';
        if (value <= thresholds.yellowBelow) return 'report-wt-badge--warning';
    }
    return 'report-wt-badge--safe';
}

export default function ScanLogPage({ entries, thicknessThresholds }: ScanLogPageProps) {
    return (
        <div>
            <div className="report-section-header">Phased Array C-Scan Mapping Log</div>
            <table className="report-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Date Inspected</th>
                        <th>Setup File</th>
                        <th>Scan Start (x)</th>
                        <th>Scan End (x)</th>
                        <th>Index Start (y)</th>
                        <th>Index End (y)</th>
                        <th>Datum</th>
                        <th>Coating Corr.</th>
                        <th>Min WT</th>
                        <th>Comments</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.id}>
                            <td style={{ fontSize: '8pt' }}>{entry.filename}</td>
                            <td>{entry.date_inspected || ''}</td>
                            <td>{entry.setup_file_name || ''}</td>
                            <td>{entry.scan_start_x ?? ''}</td>
                            <td>{entry.scan_end_x ?? ''}</td>
                            <td>{entry.index_start_y ?? ''}</td>
                            <td>{entry.index_end_y ?? ''}</td>
                            <td>{entry.scan_index_datum || ''}</td>
                            <td>{entry.coating_correction || ''}</td>
                            <td>
                                {entry.min_wt != null ? (
                                    <span className={`report-wt-badge ${getWtBadgeClass(entry.min_wt, thicknessThresholds)}`}>
                                        {entry.min_wt.toFixed(1)}
                                    </span>
                                ) : ''}
                            </td>
                            <td style={{ fontSize: '8pt', maxWidth: '150px' }}>{entry.comments || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{ fontSize: '8pt', color: 'var(--report-text-muted)', marginTop: '4px' }}>
                All dimensions in mm. WT results include coating correction.
            </p>
        </div>
    );
}
```

**Step 5: Create CalibrationLogPage.tsx**

```tsx
import type { CalibrationLogEntry } from '../../types/inspection-project';

interface CalibrationLogPageProps {
    entries: CalibrationLogEntry[];
}

export default function CalibrationLogPage({ entries }: CalibrationLogPageProps) {
    return (
        <div>
            <div className="report-section-header">Phased Array Calibration Scan Log</div>
            <table className="report-table">
                <thead>
                    <tr>
                        <th>File Name</th>
                        <th>Setup File</th>
                        <th>Date</th>
                        <th>Scan Start</th>
                        <th>Scan End</th>
                        <th>Ref A WT</th>
                        <th>Meas A WT</th>
                        <th>Velocity (m/sec)</th>
                        <th>Comments</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry) => (
                        <tr key={entry.id}>
                            <td style={{ fontSize: '8pt' }}>{entry.filename}</td>
                            <td>{entry.setup_file || ''}</td>
                            <td>{entry.cal_date || ''}</td>
                            <td>{entry.scan_start || ''}</td>
                            <td>{entry.scan_end || ''}</td>
                            <td>{entry.ref_a_wt ?? ''}</td>
                            <td>{entry.meas_a_wt ?? ''}</td>
                            <td>{entry.velocity ?? ''}</td>
                            <td style={{ fontSize: '8pt' }}>{entry.comments || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
```

**Step 6: Create ReferenceDrawingPage.tsx**

```tsx
import type { ProjectFile } from '../../types/inspection-project';

interface ReferenceDrawingPageProps {
    file: ProjectFile;
    nextFigure: () => number;
}

const FILE_TYPE_LABELS: Record<string, string> = {
    ga_drawing: 'General Arrangement Drawing',
    pid: 'P&ID',
    location_drawing: 'Location Drawing',
    plot_plan: 'Plot Plan',
};

export default function ReferenceDrawingPage({ file, nextFigure }: ReferenceDrawingPageProps) {
    const label = FILE_TYPE_LABELS[file.file_type ?? ''] || 'Reference Drawing';
    const figNum = nextFigure();

    return (
        <div>
            <div className="report-section-header">{label}</div>
            {file.file_url && (
                <>
                    <img
                        src={file.file_url}
                        alt={file.file_name || label}
                        className="report-full-image"
                    />
                    <div className="report-figure-caption">
                        Figure {figNum} — {file.file_name || label}
                    </div>
                </>
            )}
        </div>
    );
}
```

**Step 7: Commit**

```bash
git add src/components/report/PhotographsPage.tsx src/components/report/FlattenedProjectionPage.tsx src/components/report/VesselOverviewPage.tsx src/components/report/ScanLogPage.tsx src/components/report/CalibrationLogPage.tsx src/components/report/ReferenceDrawingPage.tsx
git commit -m "feat(report): create all report page components"
```

---

## Phase 6: Build & Verify

### Task 12: Fix TypeScript errors and build

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Fix any TypeScript errors — likely around:
- Type imports in ReportDocument (ensure `ProjectImage` is exported from `types/inspection-project.ts`)
- The `any` types used for model config (intentional — the config JSON is untyped)
- Missing optional chaining on nested properties

**Step 2: Run build**

```bash
npm run build
```

**Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix(report): resolve TypeScript and build errors"
```

---

### Task 13: Manual test + visual polish

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Test the flow**

1. Navigate to an inspection detail page with data filled in
2. Verify the "Generate Report" button opens a new tab
3. Check the report renders with all sections
4. Try Ctrl+P → verify the print preview looks correct
5. Save as PDF and inspect the output

**Step 3: Polish issues**

Common issues to fix:
- Page breaks falling in bad places (add `no-break` classes)
- Images too large/small for print
- Tables overflowing page width
- Colors not printing (ensure `print-color-adjust: exact`)
- Headers not repeating properly

**Step 4: Commit**

```bash
git add -A
git commit -m "fix(report): visual polish from manual testing"
```
