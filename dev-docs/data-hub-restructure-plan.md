# Data Hub Restructure - Implementation Plan

## Objective
Transform the Data Hub from a legacy vanilla JS module into a modern React page with:
- Organization tabs for navigation
- Hierarchical drill-down: Org → Assets → Vessels → Inspections
- New Vessel Overview page
- Current vessel detail view becomes the Inspection page

## Current State Analysis

### Architecture Issues
1. **Legacy Module**: `src/tools/data-hub.js` is vanilla JS (~2000+ lines)
2. **ToolContainer Wrapper**: `DataHubPage.jsx` wraps the legacy module, causing visual inconsistency
3. **IndexedDB + Supabase Hybrid**: Uses `dataManager` for local state with Supabase sync
4. **No React Query**: Manual state management instead of modern patterns

### Existing Resources
- `assetService.js` - Already has methods: `getAssets()`, `getVessels()`, `getScans()`
- `useOrganizations` hook - Fetches orgs from Supabase
- `adminService.ts` - Has org fetching patterns
- Database schema: Assets have `organization_id` (relationship exists)

## Proposed Architecture

### Navigation Flow
```
[Org Tabs: Matrix | Demo Org | Other...]
         ↓ click org tab
[Assets Grid for selected org]
         ↓ click asset card
[Vessels List for that asset]
         ↓ click vessel card
[NEW: Vessel Overview Page]
  - Vessel details (name, 3D model preview)
  - Inspection history list
  - "Create New Inspection" button
         ↓ click inspection or create new
[Inspection Page (current vessel detail)]
  - Strakes/Zones
  - Scans grid
  - GA/Location drawings
  - Images
  - Reports
```

### File Structure
```
src/pages/data-hub/
├── index.tsx                    # Main DataHubPage (replaces legacy wrapper)
├── components/
│   ├── OrgTabs.tsx              # Organization tab navigation
│   ├── AssetGrid.tsx            # Grid of asset cards
│   ├── AssetCard.tsx            # Single asset card
│   ├── VesselList.tsx           # List of vessels for an asset
│   ├── VesselCard.tsx           # Single vessel card
│   └── InspectionCard.tsx       # Card for inspection history
├── VesselOverviewPage.tsx       # NEW: Vessel details + inspection list
└── InspectionPage.tsx           # Moved from legacy vessel detail

src/hooks/queries/
├── useDataHubOrganizations.ts   # Fetch orgs for data hub
├── useAssetsByOrg.ts            # Fetch assets filtered by org
├── useVesselsByAsset.ts         # Fetch vessels for an asset
├── useVesselDetails.ts          # Fetch vessel with inspection history
└── useInspectionData.ts         # Fetch full inspection data (scans, strakes, etc.)
```

## Implementation Phases

### Phase 1: Foundation (React Query Hooks)
**Files to create:**
1. `src/hooks/queries/useDataHubOrganizations.ts`
   - Fetch organizations user has access to
   - Filter out SYSTEM org

2. `src/hooks/queries/useAssetsByOrg.ts`
   - Fetch assets for a specific organization_id
   - Include vessel/scan counts for display

3. `src/hooks/queries/useVesselsByAsset.ts`
   - Fetch vessels for an asset
   - Include scan counts

**Approach:**
- Use existing `assetService.js` but add org filtering method
- Follow patterns from `useAdminOrganizations.ts`

### Phase 2: Core Page Structure
**Files to create/modify:**
1. `src/pages/data-hub/index.tsx` - New main page
   - Header (reuse `createModernHeader`)
   - Org tabs component
   - Content area with state management

2. `src/pages/data-hub/components/OrgTabs.tsx`
   - Horizontal tabs like Personnel/Admin pages
   - Selected org state passed up to parent

3. `src/pages/data-hub/components/AssetGrid.tsx`
   - Grid of compact asset cards
   - Uses `useAssetsByOrg` hook
   - Click handler to drill into asset

4. `src/pages/data-hub/components/AssetCard.tsx`
   - Compact card (matches new compact style)
   - Shows: name, vessel count, scan count
   - Icon with building/asset icon

### Phase 3: Vessel Layer
1. `src/pages/data-hub/components/VesselList.tsx`
   - List/grid of vessels for selected asset
   - Uses `useVesselsByAsset` hook
   - Back button to return to assets

2. `src/pages/data-hub/components/VesselCard.tsx`
   - Shows: name, 3D preview, scan count
   - Click navigates to Vessel Overview

### Phase 4: Vessel Overview Page (NEW)
1. `src/pages/data-hub/VesselOverviewPage.tsx`
   - Vessel header with name, asset breadcrumb
   - 3D model preview (larger)
   - Vessel metadata
   - **Inspection History** section:
     - List of past inspections (grouped scans by date?)
     - Or all scans with dates
   - "Create New Inspection" button
   - Click inspection → goes to Inspection page

### Phase 5: Inspection Page
1. `src/pages/data-hub/InspectionPage.tsx`
   - Extract current vessel detail view from `data-hub.js`
   - Convert to React component
   - Keep: Strakes, Scans grid, GA drawings, Images, Reports
   - This is the detailed work view

### Phase 6: Routing & Integration
1. Update `App.jsx` routes:
   ```jsx
   <Route path="/" element={<DataHubPage />} />
   <Route path="/vessel/:assetId/:vesselId" element={<VesselOverviewPage />} />
   <Route path="/inspection/:assetId/:vesselId/:inspectionId?" element={<InspectionPage />} />
   ```

2. Remove legacy files (after migration complete):
   - `src/tools/data-hub.js`
   - Update `DataHubPage.jsx` to use new component

## Key Decisions

### State Management
- **Selected Org**: URL query param or local state in DataHubPage
- **Selected Asset**: URL path param for VesselOverview
- **React Query**: All data fetching uses hooks with proper caching

### Breadcrumb Navigation
Keep breadcrumb but update for new flow:
```
Home > [Org Name] > [Asset Name] > [Vessel Name] > Inspection
```

### "Create New Inspection" Flow
For now: Route directly to InspectionPage with new inspection mode
Later: Could add inspection metadata (date, inspector, etc.)

### Removing Legacy Features
- ❌ Remove: Import/Export buttons (non-functional)
- ❌ Remove: Stat pills at top (replaced by org tabs)
- ✓ Keep: Breadcrumb navigation (updated)
- ✓ Keep: All inspection features (strakes, scans, etc.)

## Migration Strategy

### Incremental Approach
1. Create new React pages alongside legacy
2. Add routes for new pages
3. Test new flow independently
4. Once stable, update "/" route to use new DataHubPage
5. Remove legacy data-hub.js

### Data Layer
- Keep using `assetService.js` - it already works with Supabase
- Add new methods if needed (e.g., `getAssetsByOrg()`)
- Don't touch `dataManager.js` sync logic initially

## Task Checklist

### Phase 1: Foundation
- [ ] Create `useDataHubOrganizations.ts` hook
- [ ] Add `getAssetsByOrg(orgId)` to assetService.js
- [ ] Create `useAssetsByOrg.ts` hook
- [ ] Create `useVesselsByAsset.ts` hook

### Phase 2: Core Page
- [ ] Create `src/pages/data-hub/index.tsx`
- [ ] Create `OrgTabs.tsx` component
- [ ] Create `AssetGrid.tsx` component
- [ ] Create `AssetCard.tsx` component
- [ ] Wire up navigation between org → assets

### Phase 3: Vessel Layer
- [ ] Create `VesselList.tsx` component
- [ ] Create `VesselCard.tsx` component
- [ ] Add back navigation

### Phase 4: Vessel Overview
- [ ] Create `VesselOverviewPage.tsx`
- [ ] Add inspection history section
- [ ] Add "Create Inspection" button
- [ ] Add route in App.jsx

### Phase 5: Inspection Page
- [ ] Extract vessel detail from data-hub.js
- [ ] Convert to React component
- [ ] Create `InspectionPage.tsx`
- [ ] Add route in App.jsx

### Phase 6: Integration
- [ ] Update App.jsx routes
- [ ] Update breadcrumb component
- [ ] Test full navigation flow
- [ ] Remove legacy data-hub.js
- [ ] Update DataHubPage.jsx

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Large legacy file (~2000 lines) | Extract in phases, test each section |
| IndexedDB/Supabase sync complexity | Keep using existing sync service, don't modify |
| 3D viewer integration | Keep existing Three.js code, wrap in React |
| Report generation | Keep existing report-generator.js |

## Success Criteria
1. Org tabs display and filter assets correctly
2. Navigation: Org → Asset → Vessel → Inspection works
3. Vessel Overview shows details and inspection history
4. Inspection page has all current functionality
5. No visual inconsistency with other pages
6. Build passes with no errors
