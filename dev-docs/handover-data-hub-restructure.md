# Handover: Data Hub Restructure

**Date:** 2025-11-28 (Updated)
**Previous Session:** Data Hub modernization - InspectionPage implementation

---

## Executive Summary

The Data Hub has been restructured from a legacy vanilla JS module (`src/tools/data-hub.js`) into a modern React page architecture with organization-based navigation tabs. The **InspectionPage** is now fully implemented with React Query hooks and modular components for scans, drawings, and images.

---

## What Was Accomplished

### 1. New React Pages Created

| File | Purpose | Status |
|------|---------|--------|
| `src/pages/data-hub/index.tsx` | Main Data Hub page with org tabs, asset grid, vessel list | COMPLETE |
| `src/pages/data-hub/VesselOverviewPage.tsx` | Vessel details + inspection history + "New Inspection" button | COMPLETE |
| `src/pages/data-hub/InspectionPage.tsx` | Full inspection workflow with scans, drawings, images | COMPLETE |

### 2. InspectionPage Components Created

| File | Purpose |
|------|---------|
| `src/pages/data-hub/components/ScansGrid.tsx` | Displays scan cards, supports strake grouping |
| `src/pages/data-hub/components/DrawingsSection.tsx` | Location and GA drawings with upload/annotate actions |
| `src/pages/data-hub/components/VesselImagesSection.tsx` | Vessel images grid with view/rename/delete actions |

### 3. React Query Hooks

| File | Hooks |
|------|-------|
| `src/hooks/queries/useDataHub.ts` | `useDataHubOrganizations`, `useAssetsByOrg`, `useVesselsByAsset`, `useVesselDetails`, `useVesselScans`, `useVesselStrakes`, `useVesselImages` |

### 4. Types Defined

```typescript
// In useDataHub.ts
interface Scan {
    id: string;
    name: string;
    vessel_id: string;
    tool_type: 'pec' | 'cscan' | '3dview';
    thumbnail: string | null;
    strake_id?: string | null;
    created_at: string;
    updated_at: string;
}

interface Strake {
    id: string;
    name: string;
    vessel_id: string;
    total_area: number;
    required_coverage: number;
    created_at: string;
    updated_at: string;
}

interface VesselImage {
    id: string;
    name: string;
    image_url: string;
    vessel_id: string;
    created_at: string;
}
```

### 5. Routing

Routes in `App.jsx`:
```jsx
<Route path="/" element={<DataHubPage />} />
<Route path="/vessel/:assetId/:vesselId" element={<VesselOverviewPage />} />
<Route path="/inspection/:assetId/:vesselId" element={<InspectionPage />} />
```

---

## Current Navigation Flow

```
[Org Tabs: Matrix | Demo Org | ...]
         ↓ click org tab
[Assets Grid - compact cards showing vessel counts]
         ↓ click asset card
[Vessels List - cards with scan counts]
         ↓ click vessel card
[Vessel Overview Page]
  ├─ Vessel info (name, 3D preview placeholder, stats)
  ├─ Inspection history grouped by date
  └─ "New Inspection" button
         ↓ click inspection or "New Inspection"
[Inspection Page - FULLY IMPLEMENTED]
  ├─ Scans grid (grouped by strake if strakes exist)
  ├─ Location & GA drawings section
  ├─ Vessel images gallery
  └─ Generate Report button
```

---

## InspectionPage Features

### Current (Implemented)
- **Scans Grid**: Displays scans with thumbnails, tool type badges, grouped by strake
- **Strake Support**: Shows scans organized by strake, unassigned scans separately
- **Drawings Section**: Location and GA drawings with upload/annotate/remove actions
- **Images Gallery**: Vessel images with view/rename/delete actions
- **Stats Bar**: Shows scan/image/strake counts
- **Report Button**: Generate report action (placeholder)
- **Breadcrumb Navigation**: Full path back to Data Hub

### Pending (TODOs in code)
The following features have placeholder handlers that show alerts:

1. **Scan Upload Dialog** - `handleAddScans`
2. **Scan Viewer** - `handleScanClick` (open PEC/C-Scan/3D viewer)
3. **Scan Delete** - `handleDeleteScan` (needs mutation)
4. **Strake Reassignment Dialog** - `handleReassignScan`
5. **Strake Management Dialog** - `handleManageStrakes`
6. **Image Upload Dialog** - `handleUploadImage`
7. **Image Rename** - `handleRenameImage` (needs mutation)
8. **Image Delete** - `handleDeleteImage` (needs mutation)
9. **Drawing Upload** - `handleUploadLocation`, `handleUploadGA`
10. **Drawing Annotation** - `handleAnnotateLocation`, `handleAnnotateGA`
11. **Report Generation Dialog** - `handleGenerateReport`

---

## Key Files Reference

### New Architecture
```
src/pages/data-hub/
├── index.tsx                   # Main page with org tabs (COMPLETE)
├── VesselOverviewPage.tsx      # Vessel details (COMPLETE)
├── InspectionPage.tsx          # Inspection workflow (COMPLETE)
└── components/
    ├── ScansGrid.tsx           # Scans display component (COMPLETE)
    ├── DrawingsSection.tsx     # Drawings component (COMPLETE)
    └── VesselImagesSection.tsx # Images component (COMPLETE)

src/hooks/queries/
└── useDataHub.ts               # All data fetching hooks (COMPLETE)
```

### Legacy Code (Reference Only)
```
src/tools/data-hub.js           # ~2000 lines, vanilla JS, DO NOT MODIFY
src/data-manager.js             # IndexedDB + Supabase sync layer
```

### Services
```
src/services/asset-service.js   # Asset/Vessel/Scan CRUD operations
```

---

## What Still Needs To Be Done

### Priority 1: Mutations
Create React Query mutation hooks for CRUD operations:
1. `useDeleteScan` - Delete a scan
2. `useReassignScan` - Change scan's strake assignment
3. `useCreateStrake` / `useUpdateStrake` / `useDeleteStrake`
4. `useUploadImage` / `useRenameImage` / `useDeleteImage`
5. `useUploadDrawing` / `useRemoveDrawing`

### Priority 2: Dialogs
1. **Scan Upload Dialog** - File picker, tool type selection, strake assignment
2. **Strake Management Dialog** - CRUD for strakes with area/coverage settings
3. **Image Upload Dialog** - Multi-file picker for vessel photos
4. **Report Generation Dialog** - Report options, format selection

### Priority 3: Scan Viewers
Connect scan clicks to appropriate visualizers:
- PEC → `/pec-visualizer?scanId=...`
- C-Scan → `/cscan-visualizer?scanId=...`
- 3D View → `/3d-viewer?scanId=...`

### Priority 4: Drawing Annotation
Implement canvas-based annotation tool for drawings.

---

## Technical Notes

### Data Fetching Pattern
```typescript
// Always use React Query, never useState + useEffect for data
const { data: scans, isLoading } = useVesselScans(vesselId);
```

### Component Props Pattern
```typescript
interface ScansGridProps {
    scans: Scan[];
    strakes: Strake[];
    onScanClick: (scan: Scan) => void;
    onDeleteScan: (scan: Scan) => void;
    onReassignScan?: (scan: Scan) => void;
    onAddScans?: () => void;
    onManageStrakes?: () => void;
}
```

### Styling
- Use existing CSS classes: `glass-card`, `glass-panel`, `list-item-hover`
- Buttons: `btn btn-primary`, `btn btn-secondary`, `btn btn-success`
- Badges: `glass-badge`, `badge-yellow`, `badge-blue`, `badge-purple`

---

## Quick Commands

```bash
# Build and check for errors
npm run build

# Run dev server
npm run dev

# Type check only
npm run typecheck
```

---

## Next Session Suggested Starting Point

1. Create mutation hooks in `src/hooks/mutations/useInspectionMutations.ts`
2. Start with `useDeleteScan` mutation (simplest)
3. Update `InspectionPage.tsx` to use the mutation
4. Create dialog components for scan upload and strake management

---

## Project Rules Reminder

From `.claude/CLAUDE.md`:
1. **React Query for ALL data fetching** - no useState + useEffect patterns
2. **Max 300 lines per component** - split large components
3. **Use existing UI components** from `src/components/ui/`
4. **Run `/build-and-fix`** after significant changes

---

## Contact Points

- Plan document: `dev-docs/data-hub-restructure-plan.md`
- Modernization tasks: `dev-docs/modernization-tasks.md`
- This handover: `dev-docs/handover-data-hub-restructure.md`

Good luck!
