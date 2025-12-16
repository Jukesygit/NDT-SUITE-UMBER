# Inspection Page Redesign - Strategic Plan

## Objective
Redesign the inspection page to be a comprehensive inspection workflow tool that prioritizes:
1. **Inspection description/notes** as the main content
2. **Strakes with coverage tracking** as the primary data organization
3. **Defect/findings logging** with Code A-E severity classification
4. **Auto-generated professional reports** suitable for client delivery
5. **Reference materials** (GA, location drawings, photos) as sidebar content

---

## Current State Analysis

### Existing Data Model
- `inspections`: name, status, inspector_id, inspection_date, notes, metadata
- `strakes`: name, vessel_id, total_area, required_coverage, metadata
- `scans`: name, vessel_id, tool_type, strake_id, inspection_id, data
- `vessel_images`: name, image_url, vessel_id, inspection_id
- `vessels`: location_drawing, ga_drawing (with annotations)

### Current Layout Issues
1. GA/Location drawings take up too much visual real estate
2. No prominent description/notes area
3. Strakes hidden inside ScansGrid component
4. No defect/findings tracking
5. No automatic report generation

---

## Proposed New Layout

```
+--------------------------------------------------------------------------------+
| HEADER: Inspection Name | Status Badge | Last Updated                          |
+--------------------------------------------------------------------------------+
| Breadcrumb: Data Hub / Asset / Vessel / Inspection                             |
+---------------------------------------------+----------------------------------+
|                                             |                                  |
|  MAIN CONTENT (70%)                         |  SIDEBAR (30%)                   |
|  ═══════════════════                        |  ════════════                    |
|                                             |                                  |
|  ┌─────────────────────────────────────┐   |  ┌────────────────────────────┐ |
|  │ INSPECTION SUMMARY                   │   |  │ REFERENCE IMAGES           │ |
|  │ ─────────────────────               │   |  │ ────────────────           │ |
|  │ Inspector: John Doe (+ assign more) │   |  │                            │ |
|  │ Date: 2024-01-15                    │   |  │ [Location Drawing]         │ |
|  │ Client Ref: ABC-123                 │   |  │ (click to annotate)        │ |
|  │                                      │   |  │                            │ |
|  │ Description:                         │   |  │ [GA Drawing]               │ |
|  │ ┌──────────────────────────────────┐│   |  │ (click to annotate)        │ |
|  │ │ Rich text area for detailed      ││   |  │                            │ |
|  │ │ inspection notes, scope,         ││   |  │ [Strake Diagram]           │ |
|  │ │ methodology, etc.                ││   |  │ (from GA or uploaded)      │ |
|  │ └──────────────────────────────────┘│   |  │                            │ |
|  └─────────────────────────────────────┘   |  │ [Vessel Photos] (grid)     │ |
|                                             |  │ + Add Photos               │ |
|  ┌─────────────────────────────────────┐   |  └────────────────────────────┘ |
|  │ STRAKES & COVERAGE                   │   |                                  |
|  │ ─────────────────────               │   |  ┌────────────────────────────┐ |
|  │                                      │   |  │ QUICK ACTIONS              │ |
|  │ [+ Add Strake] [Use GA as Diagram]  │   |  │ ────────────────           │ |
|  │                                      │   |  │ [Generate Report]          │ |
|  │ ┌────────────────────────────────┐  │   |  │ [Export Data]              │ |
|  │ │ Strake 1: Bottom Shell         │  │   |  │ [Share Link]               │ |
|  │ │ ████████░░ 80% coverage        │  │   |  │ [Print Summary]            │ |
|  │ │ 12.5 m² / 15.6 m² required     │  │   |  └────────────────────────────┘ |
|  │ │                                 │  │   |                                  |
|  │ │ Scans: [thumb][thumb][thumb]    │  │   |  ┌────────────────────────────┐ |
|  │ │ Findings: 2 (Code C, Code D)    │  │   |  │ INSPECTION STATS           │ |
|  │ │ [+ Add Scan] [+ Log Finding]    │  │   |  │ ────────────────           │ |
|  │ └────────────────────────────────┘  │   |  │ Total Scans: 24            │ |
|  │                                      │   |  │ Total Strakes: 6           │ |
|  │ ┌────────────────────────────────┐  │   |  │ Coverage: 72%              │ |
|  │ │ Strake 2: Side Shell Port      │  │   |  │ Findings: 5                │ |
|  │ │ ████░░░░░░ 40% coverage        │  │   |  │   Code A: 1                │ |
|  │ │ ...                             │  │   |  │   Code B: 2                │ |
|  │ └────────────────────────────────┘  │   |  │   Code C: 1                │ |
|  │                                      │   |  │   Code D: 1                │ |
|  │ ┌────────────────────────────────┐  │   |  └────────────────────────────┘ |
|  │ │ Unassigned Scans (dashed)      │  │   |                                  |
|  │ │ [thumb][thumb]                  │  │   |                                  |
|  │ └────────────────────────────────┘  │   |                                  |
|  └─────────────────────────────────────┘   |                                  |
|                                             |                                  |
|  ┌─────────────────────────────────────┐   |                                  |
|  │ FINDINGS REGISTER                    │   |                                  |
|  │ ─────────────────────               │   |                                  |
|  │                                      │   |                                  |
|  │ [+ Log Finding]  Filter: [All ▼]    │   |                                  |
|  │                                      │   |                                  |
|  │ ┌──────────────────────────────────┐│   |                                  |
|  │ │ #1 | Code D | Strake 1 | Scan 3  ││   |                                  |
|  │ │ Wall loss detected at 45% depth  ││   |                                  |
|  │ │ [View Scan] [Edit] [Photo]       ││   |                                  |
|  │ └──────────────────────────────────┘│   |                                  |
|  │                                      │   |                                  |
|  │ ┌──────────────────────────────────┐│   |                                  |
|  │ │ #2 | Code C | Strake 1 | Scan 5  ││   |                                  |
|  │ │ Minor pitting observed           ││   |                                  |
|  │ │ [View Scan] [Edit] [Photo]       ││   |                                  |
|  │ └──────────────────────────────────┘│   |                                  |
|  └─────────────────────────────────────┘   |                                  |
|                                             |                                  |
+---------------------------------------------+----------------------------------+
```

---

## Defect/Finding Severity Codes

Based on user requirements, using industry-standard corrosion grading:

| Code | Name | Description | Color |
|------|------|-------------|-------|
| **A** | Excellent | No significant corrosion or defects. Coating intact. | Green |
| **B** | Good | Minor surface defects, no structural concern. Light surface rust. | Blue |
| **C** | Fair | Moderate defects requiring monitoring. Localized breakdown <20%. | Yellow |
| **D** | Poor | Significant defects requiring attention. General breakdown >20%. | Orange |
| **E** | Critical | Severe degradation requiring immediate action. Hard scale >10%. | Red |

---

## Database Schema Changes Required

### New Table: `findings`
```sql
CREATE TABLE findings (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    strake_id TEXT REFERENCES strakes(id) ON DELETE SET NULL,
    scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,

    -- Classification
    severity_code TEXT NOT NULL CHECK (severity_code IN ('A', 'B', 'C', 'D', 'E')),
    finding_type TEXT, -- 'corrosion', 'crack', 'pitting', 'wall_loss', 'coating_breakdown', 'other'

    -- Details
    description TEXT NOT NULL,
    location_description TEXT, -- Text description of location

    -- Measurements
    depth_percentage DOUBLE PRECISION, -- Wall loss as % of original
    area_affected DOUBLE PRECISION, -- Area in mm² or cm²

    -- Visual reference
    image_url TEXT, -- Photo of the defect
    scan_annotation JSONB, -- Coordinates/markup on the scan image
    drawing_annotation JSONB, -- Marker on GA/location drawing

    -- Recommendations
    recommendation TEXT,
    action_required BOOLEAN DEFAULT FALSE,

    -- Tracking
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    metadata JSONB DEFAULT '{}'::jsonb
);
```

### Updates to `inspections` table
```sql
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS client_reference TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS methodology TEXT;
```

### Updates to `vessels` table
```sql
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS strake_diagram JSONB;
-- Format: { image_url: string, annotations?: [...] }
-- Can be copied from GA drawing or uploaded separately
```

### New Junction Table: `inspection_inspectors`
```sql
CREATE TABLE inspection_inspectors (
    inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'inspector', -- 'lead', 'inspector', 'reviewer'
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (inspection_id, inspector_id)
);
```

---

## Auto-Generated Report Structure

### Report Sections (configurable)

1. **Cover Page**
   - Company logo
   - Report title (Inspection name)
   - Client name/reference
   - Vessel/Asset name
   - Inspection date
   - Inspector names and certifications
   - Report reference number

2. **Executive Summary**
   - Overall condition assessment
   - Key findings summary (count by severity)
   - Recommendations summary
   - Coverage achieved vs required

3. **Scope & Methodology**
   - Inspection scope (from inspection.scope)
   - Equipment used
   - Standards applied (ASME, ISO, etc.)
   - Reference to applicable codes

4. **Asset Information**
   - Asset details
   - Vessel details
   - GA Drawing (with annotations if present)
   - Location Drawing (with annotations)

5. **Strake Coverage Summary**
   - Table: Strake | Area | Required | Achieved | Status
   - Visual strake diagram with coverage indicators

6. **Findings Register**
   - Table of all findings sorted by severity
   - For each finding:
     - Finding number
     - Location (strake, coordinates)
     - Severity code
     - Description
     - Measurements
     - Photo evidence
     - Recommendation

7. **Detailed Scan Data**
   - For each strake:
     - Strake overview
     - Individual scan images/data
     - Thickness readings table
     - Min/max/average values

8. **Supporting Images**
   - Vessel photographs
   - Additional documentation

9. **Appendices**
   - Inspector certifications
   - Equipment calibration records
   - Standards referenced
   - Glossary of terms

### Report Templates
- **Full Report**: All sections, detailed
- **Summary Report**: Cover + Executive Summary + Findings only
- **Client Report**: Branded, professional, all sections
- **Internal Report**: Technical details, less formatting

---

## Component Architecture

```
src/pages/data-hub/
├── InspectionPage.tsx (main container, ~150 lines)
├── components/
│   ├── InspectionHeader.tsx (breadcrumb, status, actions)
│   ├── InspectionSummary.tsx (metadata, description)
│   ├── StrakesSection.tsx (strakes with coverage)
│   │   ├── StrakeCard.tsx
│   │   ├── StrakeProgressBar.tsx
│   │   └── ScanThumbnailGrid.tsx
│   ├── FindingsSection.tsx (findings register)
│   │   ├── FindingCard.tsx
│   │   ├── FindingForm.tsx (dialog)
│   │   └── FindingSeverityBadge.tsx
│   ├── InspectionSidebar.tsx
│   │   ├── ReferenceDrawings.tsx (GA, location, strake diagram)
│   │   ├── VesselPhotosGrid.tsx
│   │   ├── QuickActions.tsx
│   │   └── InspectionStats.tsx
│   ├── dialogs/
│   │   ├── CreateFindingDialog.tsx
│   │   ├── ScanAnnotationDialog.tsx
│   │   ├── AssignInspectorsDialog.tsx
│   │   └── GenerateReportDialog.tsx
│   └── report/
│       ├── ReportPreview.tsx
│       ├── ReportGenerator.ts (logic)
│       └── templates/
│           ├── FullReportTemplate.tsx
│           ├── SummaryTemplate.tsx
│           └── components/
│               ├── ReportCoverPage.tsx
│               ├── ReportFindingsTable.tsx
│               └── ...
└── hooks/
    ├── useInspectionDialogs.ts (existing)
    ├── useFindings.ts (new)
    └── useReportGeneration.ts (new)
```

---

## Implementation Phases

### Phase 1: Layout Restructure (3-4 components)
1. Restructure InspectionPage layout to 70/30 split
2. Create InspectionSummary component with inline editing
3. Move drawings/photos to sidebar
4. Enhance strakes to be main content focus

### Phase 2: Findings System (DB + UI)
1. Create findings table migration
2. Create findings service methods
3. Create React Query hooks for findings
4. Build FindingsSection and FindingCard components
5. Build CreateFindingDialog with scan annotation

### Phase 3: Strake Diagram Feature
1. Add strake_diagram column to vessels
2. Implement "Use GA as Strake Diagram" flow
3. Build strake diagram uploader
4. Show strake diagram in sidebar

### Phase 4: Multiple Inspectors
1. Create inspection_inspectors junction table
2. Update inspection queries to include inspectors
3. Build AssignInspectorsDialog
4. Show inspector list in summary

### Phase 5: Report Generation
1. Design report templates in React (PDF-ready)
2. Implement report data aggregation
3. Build GenerateReportDialog with options
4. Integrate PDF export (react-pdf or similar)
5. Add branding/template customization

---

## Questions Resolved

| Question | Answer |
|----------|--------|
| Primary action | Both review and actively add during inspection |
| Description editing | Inline |
| Drawing usage | Actively used for marking locations |
| Strake diagram | GA can be used, or upload custom |
| Scan display | Thumbnails inline under strakes |
| Status workflow | No formal workflow |
| Multiple inspectors | Yes |
| Offline support | No |
| Defect severity | Code A-E (A=good, E=critical) |
| Findings linking | Yes, to strakes and scans with annotation |
| Report format | Customizable template |
| Report generation | Auto-generated from inspection data |

---

## Technical Considerations

### Performance
- Lazy load scan images
- Virtualize long finding lists
- Cache report previews
- Optimize strake coverage calculations

### Security
- RLS policies for findings table
- Validate inspector assignment permissions
- Sanitize report content for PDF generation

### UX
- Inline editing saves automatically (debounced)
- Drag-and-drop scan assignment to strakes
- Keyboard shortcuts for common actions
- Print-friendly report preview

---

## Success Criteria

1. Inspector can create inspection, add description, and track strakes in <5 minutes
2. Findings can be logged with severity and linked to scans
3. Coverage progress is visually clear at a glance
4. Reports can be generated with one click
5. All reference materials accessible but not dominant

---

## References

- [PAUT Procedure Sample](https://ndtinspect.com/paut-procedure-sample/)
- [ClassNK Condition Evaluation Report](https://www.classnk.or.jp/hp/pdf/tech_info/tech_img/T1092e.pdf)
- [FHWA PAUT Implementation](https://highways.dot.gov/sites/fhwa.dot.gov/files/FHWA-HRT-24-010.pdf)
- [API Pressure Vessel Inspection Code](https://www.mactechonsite.com/wp-content/uploads/API-ASME-Pressure-Vessel-Inspection-Code.pdf)
