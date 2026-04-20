# PAUT Inspection Report — PDF Generation Design

> **Date:** 2026-04-16
> **Status:** Approved
> **Goal:** Replace the placeholder "Generate Report" button with a production-grade, beautifully formatted PDF report that combines inspection detail data with vessel modeler visual assets.

---

## Architecture

### Approach: Browser Print-to-PDF

The report is a dedicated React route (`/projects/:projectId/vessels/:vesselId/report`) styled with `@media print` CSS. The "Generate Report" button opens this route in a new tab and triggers `window.print()`. The browser's built-in PDF engine (Chromium Skia) produces pixel-perfect output with proper fonts, vector text, and sharp images. Zero external dependencies.

### Data Sources

The report combines data from two sources:

1. **Inspection Detail DB records** — project metadata, vessel details, procedures, equipment config, beamset configuration, scan log entries, calibration log entries, uploaded files/photos, results summary, sign-off details
2. **Vessel Model state** (stored as JSON in `vessel_models.config`) — annotations with thickness stats, scan composites, pre-rendered images (3D overviews, 2D flattened projection, annotation heatmaps)

### Pre-rendered Image Pipeline

When the tech saves a vessel model in the modeler, the following images are captured and stored in the `config` JSON alongside the vessel state:

- **`overviewRenders`**: 6 standard 3D viewport captures (Platform N/E/S/W, Top, Isometric) — 1600×1000 PNG data URLs
- **`flattenedView`**: 2D unwrapped projection from `FlattenedViewport.exportImage()` — full vessel shell with thickness overlay, nozzle/weld/saddle markers, color legend
- **`flattenedDomeViews`**: dome-end projections if present
- **`annotationHeatmaps`**: Map of annotation ID → heatmap PNG data URL (from `createAnnotationHeatmapCanvas`)
- **`annotationContextImages`**: Map of annotation ID → 3D context screenshot showing the annotation's position on the vessel

These are captured via the existing `report-image-capture.ts` pipeline functions (`captureVesselOverviews`, `captureAnnotationContext`, `captureAnnotationHeatmap`) and the `FlattenedViewport` ref's `exportImage()` method.

### Data Flow

```
"Generate Report" button clicked on InspectionDetailPage
  → window.open('/projects/:projectId/vessels/:vesselId/report')

Report route loads:
  1. useProject(projectId)           → InspectionProject (client, location, report #, etc.)
  2. useProjectVessel(vesselId)      → ProjectVessel (component details, equipment, sign-off)
  3. useProjectProcedures(projectId) → InspectionProcedure[]
  4. useScanLogEntries(vesselId)     → ScanLogEntry[]
  5. useCalibrationLogEntries(vesselId) → CalibrationLogEntry[]
  6. useVesselFiles(vesselId)        → ProjectFile[] (GA drawings, P&IDs, photos)
  7. useProjectImages(vesselId)      → InspectionImage[] (site photographs)
  8. Fetch full vessel model config  → VesselState + pre-rendered images

  → All data passed to <ReportDocument /> component
  → Pure HTML/CSS, print-optimized
  → User sees live preview → Ctrl+P or button → PDF
```

---

## Page Structure

### Page 1 — Cover Page

**Header bar:** Full-width dark navy (#0a1628) background with Matrix logo (left) and report title (right).

**Title:** "PHASED ARRAY ULTRASONIC TESTING INSPECTION REPORT"

**Metadata cards:** Clean card layout with:
- Customer / Location / Report No
- Project name (full width)
- Contract No / WO No / Test Date

**Component Details & Procedure table:**
- Styled with colored header row (#00875a on white)
- Fields: Description, Line/Tag Number, Drawing Number, Material, Nominal Thickness, Temperature, Corrosion Allowance, Stress Relief, Coating Type, Procedure No, Technique Nos, Acceptance Criteria, Applicable Standard

**Equipment table:**
- Same visual style
- Fields: Equip. Model, Serial No, Probe, Wedge, Calibration Blocks, Scanner Frame, Ref Blocks, Couplant
- Equipment checks reference line with checkbox

**Beamset Configuration table:**
- Columns: Group, Type, Active Elements, Aperture, Focal Depth, Angle, Skew, Index Offset
- Grey header row, clean grid

### Page 2 — Executive Dashboard

**At-a-glance stat cards (3-4 across):**
- **Total Scan Coverage** — area in m² + percentage of vessel surface, with progress indicator
- **Minimum Wall Thickness** — large bold number, color-coded (green/amber/red based on threshold), location reference
- **Scans Performed** — count of scan log entries
- **Findings** — count of annotations, with breakdown (restrictions vs normal)

**Inspection Results Summary:**
- The tech's written summary text (`vessel.results_summary`)
- Clean typography, generous line height

**Sign-off Section:**
- 3-column layout: Technician / Reviewer / Client Acceptance
- Each with: Name, Qualification/Position, Signature line, Date
- Populated from `vessel.signoff_details`

### Page 3 — Site Photograph(s)

- Full-width primary inspection area photo with caption
- If multiple photos uploaded, 2-up layout (side by side)
- Figure numbering: "Figure 1 — [photo caption]"
- Subtle card border and shadow

### Pages 4–N — Inspection Results (one per annotation)

Each annotation with `includeInReport: true` gets a full page:

**Header strip:** Scan file name + feature/description

**Companion scan image:** Large screenshot from companion app (A/B/C/D scan quadrants) — this is the equivalent of pages 3-6 in the reference PDF. If companion images are not available, show the generated heatmap at full width instead.

**Generated heatmap:** Thickness heatmap from the modeler's annotation data, with integrated color scale bar. Shown alongside companion image if both available.

**Thickness statistics callout box:**
- Styled card with colored left border
- Min WT (large, bold, color-coded), Max WT, Avg WT, Std Dev, Sample Count
- Anomaly code field

**Analysis / Interpretation:**
- Text block from annotation data or tech input
- Remaining WT calculation with coating correction noted
- Code + position (scan mm, index mm)

**Restriction notes:** If the annotation is flagged as a restriction area, display restriction description prominently with amber highlight.

### Next Page — 2D Flattened Projection

**Full-width unwrapped vessel shell view:**
- Pre-rendered from `FlattenedViewport.exportImage()`
- Shows thickness heatmap overlay across entire vessel
- Nozzle, weld, saddle, and lifting lug markers visible
- Axial and circumferential dimension scales
- Color legend bar with min/max thickness range
- Metadata header (installation, item no, P&ID no, location)

**If dome views exist:** Second page with dome-end projections side by side, same visual treatment as reference PDF page 8.

### Next Page — 3D Vessel Overview

**2×3 grid of pre-rendered 3D views:**
- Platform North, Platform East, Platform South, Platform West, Top View, Isometric View
- Each in a card with figure caption
- Shows annotations, scan composites, nozzles, welds visible

### Next Pages — Scan Log Table

**Redesigned table with visual hierarchy:**
- Colored header row (#00875a text on light background)
- Alternating row shading: white / #f8fafc
- Columns: File Name, Date Inspected, Setup File Name, Scan Start(x), Scan End(x), Index Start(y), Index End(y), Scan/Index Datum, Coating Correction, Min WT, Comments
- Min WT values: bold + color-coded pill badge (green/amber/red)
- Comments column: wider, wrapping text
- Automatic page breaks with repeated header row (`thead { display: table-header-group }`)
- Footer note: "All dimensions in mm. WT results include coating correction."

### Next Page — Calibration Log

**Same visual treatment as scan log:**
- Columns: File Name, Setup File, Date, Scan Start, Scan End, Ref A WT, Meas A WT, Velocity (m/sec), Comments
- If no data available, show blank template rows for manual entry

### Final Pages — Reference Drawings

Each uploaded document/drawing gets a full page:
- **P&ID** — full-page image with header
- **GA Drawing** — full-page image with header
- **Plot Plan** — full-page image with test location highlighted
- Document title in section header bar
- Figure numbering continues from earlier pages

---

## Visual Design System

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--report-navy` | `#0a1628` | Header bar, cover page background |
| `--report-brand` | `#00875a` | Section headers, table header accents |
| `--report-accent` | `#0ea5e9` | Stat callout boxes, links |
| `--report-danger` | `#ef4444` | Below-threshold WT values |
| `--report-warning` | `#f59e0b` | Near-threshold WT values |
| `--report-safe` | `#22c55e` | Acceptable WT values |
| `--report-text` | `#334155` | Body text (softer than pure black) |
| `--report-text-muted` | `#94a3b8` | Captions, footer text |
| `--report-border` | `#e2e8f0` | Table borders, card borders |
| `--report-row-alt` | `#f8fafc` | Alternating table row background |
| `--report-header-bg` | `#f1f5f9` | Table header background |

### Typography

- **Headings:** Inter (fallback: Calibri, sans-serif), bold, letter-spacing 0.02em
- **Body:** Inter, regular, 10pt equivalent (13px at 96dpi print)
- **Data tables:** 9pt, tabular-nums for number alignment
- **Monospace data:** JetBrains Mono or Consolas for measurements/coordinates
- **Page footers:** 8pt, `--report-text-muted`

### Table Styling

- No heavy black borders — subtle 1px `--report-border` lines
- Header row: `--report-header-bg` background, bold text
- Section header rows (e.g. "Component Details & Procedure"): `--report-brand` background, white text
- Alternating rows: white / `--report-row-alt`
- Cell padding: 8px 12px (generous for readability)
- Min WT values: bold + color-coded inline badge

### Image Treatment

- Scan screenshots: subtle card with 1px `--report-border` and 2px drop shadow
- Figure numbering below each: "Figure 3.1 — C-Scan, Strake 2&3"
- Heatmaps: integrated color legend bar rendered within the image
- 3D renders: clean card grid layout

### Page Layout

- **Margins:** 20mm all sides
- **Header (every page):** Logo left, "PAUT Inspection Report" center, report metadata (report no, date) right, thin 1px separator line below
- **Footer (every page):** Document reference number left, "Page X of Y" right
- **Section dividers:** Full-width colored bar with section title in white text

### Print CSS

```css
@media print {
  @page {
    size: A4 portrait;
    margin: 20mm;
  }
  @page :first {
    margin-top: 0; /* Cover page bleeds to top */
  }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page-break { page-break-after: always; }
  .no-break { page-break-inside: avoid; }
  thead { display: table-header-group; } /* Repeat table headers */
  .no-print { display: none; } /* Hide print button, nav elements */
}
```

---

## File Structure

```
src/
├── pages/
│   └── projects/
│       └── ReportPage.tsx              # Route component — data fetching + loading state
├── components/
│   └── report/
│       ├── ReportDocument.tsx           # Main report layout (receives all data as props)
│       ├── ReportHeader.tsx             # Repeating page header (logo + metadata)
│       ├── ReportFooter.tsx             # Page numbering (CSS counters)
│       ├── CoverPage.tsx                # Page 1: metadata tables
│       ├── DashboardPage.tsx            # Page 2: executive summary + stats
│       ├── PhotographsPage.tsx          # Page 3: site photos
│       ├── InspectionResultPage.tsx     # Pages 4-N: per-annotation results
│       ├── FlattenedProjectionPage.tsx  # 2D unwrapped vessel view
│       ├── VesselOverviewPage.tsx       # 3D render grid
│       ├── ScanLogPage.tsx              # Scan log tables
│       ├── CalibrationLogPage.tsx       # Calibration log table
│       ├── ReferenceDrawingPage.tsx     # P&ID, GA, plot plan pages
│       ├── StatCard.tsx                 # Reusable dashboard stat card
│       ├── ReportTable.tsx              # Styled table component for print
│       ├── ThresholdBadge.tsx           # Color-coded WT value badge
│       └── report.css                   # All print-optimized styles
├── hooks/
│   └── queries/
│       └── useVesselModelFull.ts        # Fetch full config JSON for report
└── services/
    └── inspection-project-service.ts    # Add getVesselModelFull() function
```

---

## Pre-render Pipeline (Model Save)

When the tech clicks "Save" in the vessel modeler, after persisting the `VesselState` JSON to the `vessel_models.config` column, we additionally capture and store:

```typescript
interface PreRenderedReportAssets {
  /** 3D viewport captures from standard angles */
  overviewRenders: Array<{
    label: string;       // e.g. "Isometric View"
    dataUrl: string;     // PNG data URL
  }>;
  /** 2D unwrapped projection from FlattenedViewport */
  flattenedView: string | null;  // PNG data URL
  /** Per-annotation heatmap images */
  annotationHeatmaps: Record<number, string>;  // annotation ID → PNG data URL
  /** Per-annotation 3D context screenshots */
  annotationContextImages: Record<number, string>;  // annotation ID → PNG data URL
}
```

These are stored in the same `config` JSON column (they're data URLs, so they serialize naturally). The report route reads them directly — no runtime Three.js rendering needed.

**Capture functions used:**
- `captureVesselOverviews()` from `report-image-capture.ts` (already exists)
- `captureAnnotationContext()` from `report-image-capture.ts` (already exists)
- `captureAnnotationHeatmap()` from `report-image-capture.ts` (already exists)
- `flattenedViewRef.current.exportImage()` from `FlattenedViewport` (already exists)

---

## Threshold Logic

Wall thickness values are color-coded throughout the report:

```typescript
function getThresholdColor(value: number, thresholds: ThicknessThresholds): string {
  if (value <= thresholds.critical) return '--report-danger';   // red
  if (value <= thresholds.warning) return '--report-warning';   // amber
  return '--report-safe';                                        // green
}
```

Thresholds come from `VesselState.thicknessThresholds` (already defined in types).

---

## Entry Point Wiring

### Inspection Detail Page

The existing `ReportGenerationSection` button navigates to the report route:

```tsx
<button
  onClick={() => window.open(
    `/projects/${project.id}/vessels/${vessel.id}/report`,
    '_blank'
  )}
  disabled={!allReady}
  className={allReady ? 'btn btn--primary' : 'btn btn--secondary'}
>
  Generate Report
</button>
```

### Report Route

Add to `App.tsx` as a lazy-loaded route:

```tsx
const ReportPage = lazy(() => import('./pages/projects/ReportPage'));

// Inside router:
<Route path="/projects/:projectId/vessels/:vesselId/report" element={
  <ProtectedRoute>
    <ReportPage />
  </ProtectedRoute>
} />
```

### Print Trigger

The report page shows a floating "Print / Save as PDF" button (hidden in print) that calls `window.print()`. The user can also just use Ctrl+P.

---

## What's Auto-Populated vs Blank

| Report Section | Auto-populated from data | Tech fills in (editable in Word if needed) |
|---|---|---|
| Cover page metadata | Customer, location, report no, project, contract, WO, date, component details, equipment, beamset | — (all from DB) |
| Executive dashboard | Coverage %, min WT, scan count, findings count, results summary | — |
| Sign-off | Names, qualifications, dates from DB | Client acceptance (if not yet entered) |
| Photographs | Uploaded images with captions | — |
| Inspection results | Scan images, heatmaps, thickness stats, position, restrictions | Analysis/interpretation, anomaly code (from DB if entered) |
| 2D projection | Pre-rendered flattened view | — |
| 3D overview | Pre-rendered 3D captures | — |
| Scan log | All fields from DB entries | Anomaly codes (from DB if entered) |
| Calibration log | All fields from DB entries | — |
| Reference drawings | Uploaded P&ID, GA, plot plan images | — |

---

## Implementation Phases

### Phase 1: Pre-render pipeline
- Add image capture on vessel model save
- Store `PreRenderedReportAssets` in config JSON
- Add `getVesselModelFull()` service function

### Phase 2: Report route + data loading
- Create `ReportPage.tsx` route with all data queries
- Add route to `App.tsx`
- Create `useVesselModelFull` hook

### Phase 3: Report components + CSS
- Build all page components (Cover, Dashboard, Results, etc.)
- Create `report.css` with print-optimized styles
- Build reusable components (StatCard, ReportTable, ThresholdBadge)

### Phase 4: Wire entry point
- Update `ReportGenerationSection` button to navigate to report route
- Add print trigger button on report page

### Phase 5: Polish + testing
- Test with real data (vessel model + inspection records)
- Verify PDF output quality across browsers
- Adjust page breaks, image sizing, table overflow handling
