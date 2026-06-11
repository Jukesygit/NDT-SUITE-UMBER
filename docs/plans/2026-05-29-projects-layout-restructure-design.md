# Projects Layout Restructure

## Problem

The Projects page hierarchy has three structural weaknesses:

1. **List page** — 3 horizontal toolbar bands push content down ~160px. Controls-to-content ratio is wrong.
2. **Detail page** — Flat tab shell (Overview/Vessels/Files) where "Overview" just re-renders vessel cards. No campaign health summary, no attention-directing hierarchy.
3. **Vessel page** — Structurally sound but breadcrumb/context strip is scattered.

## Design

### Level 1: List Page Toolbar Consolidation

Merge 3 rows into 2:

- **Row 1:** Page title ("Projects") + "New Project" button
- **Row 2:** Unified toolbar — view toggle (Trips/Assets) on the left, filter chips + search + sort on the right. One continuous bar with a visual gap between view toggle and filter controls.

Reclaims ~40px vertical space. Groups all "how am I viewing this list" controls into one logical band.

### Level 2: Project Detail Page — Campaign Dashboard

Kill the tabs. Replace with a single-scroll page containing four zones:

**Zone 1 — Summary Strip:**
3-4 compact stat counters (total vessels, completed, in progress, needs attention) plus overall campaign progress bar. Answers "is this on track?" without scrolling.

**Zone 2 — Attention Queue:**
Conditionally rendered. Shows vessels that need action:
- Status stalled (no change in N days, status not terminal)
- Missing required data (no GA drawing, no scans when status is past setup)
- Zero logic complexity needed: compare vessel status vs data presence

If everything is healthy, this section doesn't render. Zero noise.

**Zone 3 — Vessel List:**
Compact row-based list (not cards). Each row: tag, name, status badge, scan count, chevron. Click navigates to vessel workspace. Replaces both Overview and Vessels tabs. Always visible.

Includes "Add Vessel" button in the section header.

**Zone 4 — Files Section:**
Collapsible at bottom. Same file table component, just not behind a tab. Default collapsed if vessel list is long (>5 vessels), expanded otherwise.

### Level 3: Vessel Page — Breadcrumb Tightening

Consolidate scattered meta into a compact single-line breadcrumb:
```
← Project Name  ·  Client  ·  Site
```
No structural changes to the body.

## Implementation Notes

- All changes within existing route structure (no new routes)
- `ProjectDetailPage.tsx` gets the biggest rewrite
- `ProjectListPage.tsx` is a layout rearrangement (merge toolbar rows)
- `VesselOverviewPage.tsx` is a minor breadcrumb cleanup
- Summary strip and attention queue are new components
- Vessel list replaces both Overview tab content and the VesselsTab component for the default view
- Reuse existing CSS classes from projects.css where possible
- New CSS only for summary strip and attention queue

## Files Affected

- `src/pages/projects/ProjectListPage.tsx` — toolbar consolidation
- `src/pages/projects/ProjectDetailPage.tsx` — full rewrite to dashboard layout
- `src/pages/projects/VesselOverviewPage.tsx` — breadcrumb cleanup
- `src/pages/projects/projects.css` — new styles for summary strip, attention queue
- New: `src/components/projects/ProjectSummaryStrip.tsx`
- New: `src/components/projects/ProjectAttentionQueue.tsx`
- New: `src/components/projects/ProjectVesselList.tsx`
