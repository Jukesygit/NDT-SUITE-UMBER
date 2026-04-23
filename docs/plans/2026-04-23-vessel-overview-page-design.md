# Vessel Overview Page — Design Document

**Date:** 2026-04-23  
**Status:** Draft  
**Branch:** feature/vessel-overview-page

## Problem

Clicking a vessel currently navigates to `InspectionDetailPage` — a 512-line page orchestrating 12 collapsible sections (~3,951 lines of components). This page conflates two distinct activities:

1. **Managing a vessel** — status, scope, models, documents, images (frequent, throughout project)
2. **Building a report** — equipment, cal logs, scan logs, results, signoff (focused, at report time)

The page is structured to mirror the PAUT report output format, not the user's workflow. A technician checking scope coverage or uploading a photo lands in a 12-section scrollable form designed for report data entry.

## Solution

Introduce a **Vessel Overview Page** as the landing page when clicking a vessel. Rename the current `InspectionDetailPage` to **Report Builder Page** and slim it to report-specific sections only.

## Routing

| Route | Page | Purpose |
|---|---|---|
| `/projects/:pId/vessels/:vId` | **VesselOverviewPage** (NEW) | Dashboard — vessel identity, assets, progress, navigation |
| `/projects/:pId/vessels/:vId/report-builder` | **ReportBuilderPage** (renamed) | Focused report data entry |
| `/projects/:pId/vessels/:vId/report` | ReportPage (unchanged) | Print-ready PDF output |
| `/projects/:pId/vessels/:vId/viewer` | ScanViewerPage (unchanged) | Interactive C-scan viewer |

## Section Ownership

| Section | Overview | Report Builder | Lines |
|---|---|---|---|
| VesselDetails | Editable | Editable | 157 |
| Procedure | Editable | Editable | 141 |
| Equipment | — | Editable | 325 |
| Scope/Coverage | Stats + progress bar | — | 411 |
| Models | Links to modeler | — | 355 |
| Documents | Full management | — | 454 |
| Images | Full management | — | 482 |
| CalibrationLog | — | Editable | 508 |
| ScanLog | — | Editable | 298 |
| ResultsSummary | — | Editable | 45 |
| Signoff | — | Editable | 127 |
| ReportGeneration | Progress summary | Full checklist + generate | 172 |

### Rationale

- **Overview owns asset management** (documents, images, models) and **progress tracking** (scope/coverage) — things managed throughout the project lifecycle
- **Report builder owns data entry** (equipment, logs, results, signoff) — focused work done at report time
- **VesselDetails and Procedure** appear on both — vessel identity is set up early but may need tweaking during report building
- Both pages share the same React Query hooks/mutations, so edits on either page stay in sync automatically

## Vessel Overview Page

### Layout

Dashboard-style card grid, not a scrollable form. Two-column layout that collapses to single column on narrow viewports.

### Header

Reused pattern from current InspectionDetailPage:
- Back arrow → `/projects/:pId` (project detail page). **Note:** This is a deliberate change from the current behavior which navigates to `/projects` (list page). Navigating past the project you came from is disorienting — going back to the parent project detail page is the correct UX.
- Project context row: client, site, dates, contract/WO
- Vessel tag + name (inline editable)
- Status dropdown
- Companion populate button (when connected) — updates vessel details. The same `usePopulateFromCompanion` hook is used on both overview and report builder; React Query invalidation keeps both pages in sync.
- Open 3D Modeler dropdown (with saved models)

### Body — Card Grid

```
┌─────────────────────────────────────────────────────────┐
│  ← Project Name          Status: [Scanning ▾]          │
│  V-101 — Feed Water Heater                              │
│  Client · Site · 12 Mar – 18 Mar 2026                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ Vessel Identity ──┐  ┌─ Quick Actions ───────────┐ │
│  │ Material: CS       │  │ [Report Builder]           │ │
│  │ Nom. Thick: 12mm   │  │ [Scan Viewer]              │ │
│  │ Drawing: DWG-4401  │  │ [3D Modeler]               │ │
│  │ Procedure: PROC-01 │  │ [Populate from Companion]  │ │
│  │ (inline editable)  │  │                            │ │
│  └────────────────────┘  └────────────────────────────┘ │
│                                                         │
│  ┌─ Scope & Coverage ─┐  ┌─ Report Readiness ────────┐ │
│  │ Coverage: 78%      │  │ Progress bar + count       │ │
│  │ ████████████░░░░   │  │ "6/9 sections ready"       │ │
│  │ 12 of 15 zones     │  │ ▸ Expand for details       │ │
│  │ [Open Modeler →]   │  │ [Open Report Builder →]    │ │
│  └────────────────────┘  └────────────────────────────┘ │
│                                                         │
│  ┌─ Documents ────────────────────────────────────────┐ │
│  │ Full management (reuse DocumentsSection)           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ Images ───────────────────────────────────────────┐ │
│  │ Full management (reuse ImagePoolSection)           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 3D Models ────────────────────────────────────────┐ │
│  │ Linked models list (reuse ModelsSection)           │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Report Readiness Card

Always shows a progress bar with count ("6 of 9 sections ready") and an "Open Report Builder" link. A collapsible detail view (user-toggled, using the existing `CollapsibleSection` pattern) expands to show the full 9-item checklist.

**Data approach:** The readiness card only checks items available on the overview page without additional queries:
- **Checked locally:** vessel description/material, vessel procedure_id, documents (files), images (composites count)
- **Shown as "Check in Report Builder":** equipment, cal log, scan log, results summary, signoff

This avoids loading scan log entries, calibration log entries, and procedures on the overview page just for the readiness card. The report builder's `ReportGenerationSection` remains the authoritative full checklist.

### Empty States

Each card handles the empty/new-vessel case with actionable guidance using the existing `EmptyState` component pattern from `src/components/ui/`:
- **Vessel Identity:** "Set up vessel details" with inline edit CTAs
- **Scope & Coverage:** "Link a 3D model to track coverage" with "Open Modeler" link
- **Documents:** Drag-drop upload prompt (already built into DocumentsSection)
- **Images:** Drag-drop upload prompt (already built into ImagePoolSection)
- **3D Models:** "No models linked" with "Open Modeler" link
- **Report Readiness:** "0 of 9 ready — Open Report Builder to get started"

## Report Builder Page

### Changes from Current InspectionDetailPage

1. **Rename** `InspectionDetailPage.tsx` → `ReportBuilderPage.tsx`
2. **Simplify header** — back arrow points to overview (`/projects/:pId/vessels/:vId`), vessel name displayed read-only (overview handles identity editing)
3. **Remove sections** that moved to overview:
   - ScopeSection
   - ModelsSection
   - DocumentsSection
   - ImagePoolSection
4. **Keep sections:**
   - VesselDetailsSection (editable)
   - ProcedureSection (editable)
   - EquipmentSection (editable)
   - CalibrationLogSection (editable)
   - ScanLogSection (editable)
   - ResultsSummarySection (editable)
   - SignoffSection (editable)
   - ReportGenerationSection (full checklist + generate)
5. **Keep** Companion populate button — primarily populates equipment + logs. Also appears on overview for vessel details. Both use the same `usePopulateFromCompanion` hook; React Query invalidation keeps both pages in sync.
6. **Modify ReportGenerationSection** — split checklist items into "local" (editable on this page) and "external" (managed on overview). External items show their status as read-only with a link back to the overview if incomplete. Add an optional `overviewUrl` prop to render these links.

## Data Flow

No changes to data layer. Both pages use the same hooks:

```
VesselOverviewPage                    ReportBuilderPage
       │                                     │
       ├─ useProject(projectId)               ├─ useProject(projectId)
       ├─ useProjectVessel(vesselId)          ├─ useProjectVessel(vesselId)
       ├─ useProjectProcedures(projectId)     ├─ useProjectProcedures(projectId)
       ├─ useVesselFiles(vesselId)            ├─ useVesselFiles(vesselId)
       ├─ useProjectScanComposites(ids)       ├─ useScanLogEntries(vesselId)
       ├─ useProjectVesselModels(ids)         ├─ useCalibrationLogEntries(vesselId)
       ├─ useProjectImages(vesselId)          ├─ useProjectImages(vesselId)
       │                                     ├─ useProjectScanComposites(ids)
       └─ useUpdateProjectVessel()            ├─ useProjectVesselModels(ids)
                                              └─ useUpdateProjectVessel()
```

React Query's cache ensures edits on one page are immediately reflected if the user navigates to the other (2-minute staleTime, instant invalidation on mutation).

## Navigation Map

```
ProjectListPage ──→ ProjectDetailPage ──→ VesselOverviewPage
                                              │
                         ┌────────────────────┼────────────────────┐
                         ↓                    ↓                    ↓
                  ReportBuilderPage    ScanViewerPage      VesselModelerPage
                         │
                         ↓
                    ReportPage (new tab)
```

**Entry points to VesselOverviewPage (3 total — verified, no others exist):**
- `VesselCard.tsx` line 35: click handler in ProjectDetailPage overview tab
- `TripView.tsx` line 68: vessel row click in trip-grouped view
- `AssetView.tsx` line 107: trip row click in asset-grouped view
- ReportBuilderPage back arrow (new)

**Exit points from VesselOverviewPage:**
- Back arrow → `/projects/:pId` (ProjectDetailPage)
- Quick Action: Report Builder → `/projects/:pId/vessels/:vId/report-builder`
- Quick Action: Scan Viewer → `/projects/:pId/vessels/:vId/viewer`
- Quick Action: 3D Modeler → `/vessel-modeler?project=:pId&vessel=:vId`
- Companion populate → stays on page

## Implementation Scope

### New Files (~4-5)
- `src/pages/projects/VesselOverviewPage.tsx` — main page (~200-250 lines), lazy-loaded in App.tsx
- `src/components/projects/vessel-overview/VesselIdentityCard.tsx` — editable vessel identity card
- `src/components/projects/vessel-overview/ScopeProgressCard.tsx` — coverage stats + progress bar
- `src/components/projects/vessel-overview/ReportReadinessCard.tsx` — progress summary with collapsible checklist
- `src/utils/coverage-calc.ts` — coverage calculation logic extracted from ScopeSection (lines 266-295) for reuse by both ScopeSection and ScopeProgressCard

### Modified Files (~5-6)
- `src/App.tsx` — add `const VesselOverviewPage = lazy(...)` import, add overview route at `/projects/:pId/vessels/:vId`, move current vessel route to `/report-builder`
- `src/pages/projects/InspectionDetailPage.tsx` → rename to `ReportBuilderPage.tsx`, remove ScopeSection/ModelsSection/DocumentsSection/ImagePoolSection, update header to back-link to overview, simplify vessel name to read-only
- `src/components/projects/VesselCard.tsx` — navigation target unchanged (route path stays the same, overview page now lives there)
- `src/components/projects/TripView.tsx` — navigation target unchanged (same reason)
- `src/components/projects/AssetView.tsx` — navigation target unchanged (same reason)
- `src/components/projects/inspection-detail/ReportGenerationSection.tsx` — add `overviewUrl` prop, split checklist into local vs external items, render links for external items managed on overview
- `src/components/projects/inspection-detail/ScopeSection.tsx` — extract coverage calculation to shared `coverage-calc.ts` util, import from there

### Untouched
- Remaining inspection-detail section components (VesselDetailsSection, ProcedureSection, EquipmentSection, CalibrationLogSection, ScanLogSection, ResultsSummarySection, SignoffSection — reused as-is on report builder)
- DocumentsSection, ImagePoolSection, ModelsSection — reused as-is on overview page
- All query hooks and mutation hooks
- All services
- ReportPage, ScanViewerPage, VesselModelerPage
- Report generation flow
- Companion integration logic (`usePopulateFromCompanion`)
- Database schema — no migrations needed

### Note on Navigation Targets

Because the overview page takes the existing route path (`/projects/:pId/vessels/:vId`), the three navigation entry points (VesselCard, TripView, AssetView) do not need URL changes — they already navigate to the correct path. Only the component rendered at that route changes (from InspectionDetailPage to VesselOverviewPage).

## Design Principles

1. **Overview is a dashboard, not a form** — card grid layout, status at a glance, quick actions
2. **Report builder is a focused tool** — sequential data entry for report output
3. **No data locked to one page** — shared fields (vessel details, procedure) editable on both
4. **Lightweight by default** — overview avoids loading report-specific data (logs, equipment). Readiness card shows what it can check locally, defers the rest to report builder
5. **Additive change** — new page + navigation updates, minimal modification to existing components
6. **Empty states guide action** — new vessels show actionable prompts, not blank cards
