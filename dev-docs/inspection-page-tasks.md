# Inspection Page Redesign - Task Checklist

## Phase 1: Layout Restructure [COMPLETED]
- [x] Restructure InspectionPage.tsx to 70/30 layout
- [x] Create InspectionSummary.tsx component
  - [x] Display inspection metadata (date, status, client ref)
  - [x] Inline editable description textarea
  - [x] Inspector list with "+ Assign" button (placeholder)
- [x] Create InspectionSidebar.tsx component
  - [x] ReferenceDrawings (GA, Location drawings - compact)
  - [x] Strake diagram section (placeholder for Phase 3)
  - [x] VesselPhotosGrid (compact thumbnails)
  - [x] QuickActions panel
  - [x] InspectionStats summary
- [x] Refactor StrakesSection.tsx for main content
  - [x] Prominent strake cards with progress bars
  - [x] Inline scan thumbnails per strake
  - [x] "+ Add Strake" button
  - [x] Findings count per strake (placeholder for Phase 2)

## Phase 2: Findings System

### Database
- [ ] Create findings table migration SQL
- [ ] Add RLS policies for findings
- [ ] Run migration in Supabase

### Service Layer
- [ ] Add findings methods to asset-service.js
  - [ ] getFindings(inspectionId)
  - [ ] getFinding(findingId)
  - [ ] createFinding(data)
  - [ ] updateFinding(findingId, data)
  - [ ] deleteFinding(findingId)

### React Query Hooks
- [ ] Create src/hooks/queries/useFindings.ts
- [ ] Create src/hooks/mutations/useFindingMutations.ts

### UI Components
- [ ] Create FindingsSection.tsx
- [ ] Create FindingCard.tsx with severity badge
- [ ] Create FindingSeverityBadge.tsx (color-coded A-E)
- [ ] Create CreateFindingDialog.tsx
  - [ ] Severity selector
  - [ ] Strake/scan linking
  - [ ] Description field
  - [ ] Measurements fields
  - [ ] Photo upload
  - [ ] Recommendation field

### Scan Annotation
- [ ] Create ScanAnnotationDialog.tsx
  - [ ] Load scan image
  - [ ] Draw markers/boxes
  - [ ] Save annotation to finding

## Phase 3: Strake Diagram Feature

### Database
- [ ] Add strake_diagram column to vessels table

### UI
- [ ] Add "Use GA as Strake Diagram" button
  - [ ] Copy GA drawing + annotations to strake_diagram
  - [ ] Prompt for confirmation
- [ ] Add strake diagram upload option
- [ ] Display strake diagram in sidebar
- [ ] Allow annotation of strake diagram

## Phase 4: Multiple Inspectors

### Database
- [ ] Create inspection_inspectors junction table
- [ ] Add RLS policies

### Service Layer
- [ ] Add inspector assignment methods
  - [ ] getInspectionInspectors(inspectionId)
  - [ ] assignInspector(inspectionId, userId, role)
  - [ ] removeInspector(inspectionId, userId)

### UI
- [ ] Create AssignInspectorsDialog.tsx
- [ ] Show inspector list in InspectionSummary
- [ ] Add inspector roles (lead, inspector, reviewer)

## Phase 5: Report Generation

### Report Data Aggregation
- [ ] Create useReportData.ts hook
  - [ ] Aggregate all inspection data
  - [ ] Calculate totals and summaries
  - [ ] Format for report template

### Report Templates
- [ ] Install react-pdf or similar library
- [ ] Create report template components
  - [ ] ReportCoverPage.tsx
  - [ ] ReportExecutiveSummary.tsx
  - [ ] ReportScopeMethodology.tsx
  - [ ] ReportAssetInformation.tsx
  - [ ] ReportStrakeCoverage.tsx
  - [ ] ReportFindingsTable.tsx
  - [ ] ReportScanData.tsx
  - [ ] ReportAppendices.tsx

### Report Generator
- [ ] Create GenerateReportDialog.tsx
  - [ ] Template selection
  - [ ] Section toggles
  - [ ] Branding options
- [ ] Create ReportPreview.tsx
- [ ] Implement PDF export
- [ ] Add company logo upload/management

## Testing & Polish
- [ ] Test all CRUD operations for findings
- [ ] Test report generation with real data
- [ ] Test with large inspection (many scans/findings)
- [ ] Mobile responsiveness check
- [ ] Keyboard accessibility
- [ ] Error handling for all mutations
- [ ] Loading states

## Documentation
- [ ] Update CLAUDE.md with new patterns
- [ ] Document findings data model
- [ ] Document report template customization

---

## Progress Tracking

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | **COMPLETED** | Layout restructured, 3 new components created |
| Phase 2 | Not Started | Findings system (DB + UI) |
| Phase 3 | Not Started | Strake diagram feature |
| Phase 4 | Not Started | Multiple inspectors |
| Phase 5 | Not Started | Report generation |

---

## Dependencies

- react-pdf or @react-pdf/renderer for PDF generation
- Possibly a rich text editor for description (optional)

---

## Estimated Effort

| Phase | Components | Estimated |
|-------|------------|-----------|
| Phase 1 | 5-6 | Medium |
| Phase 2 | 6-8 | Large |
| Phase 3 | 2-3 | Small |
| Phase 4 | 3-4 | Small |
| Phase 5 | 8-10 | Large |

**Total: Large effort, recommend incremental delivery**
