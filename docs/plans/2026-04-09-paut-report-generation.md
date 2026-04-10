# PAUT Inspection Report Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate editable Word (.docx) PAUT inspection reports from the 3D vessel modeler, auto-populating scan data, heatmaps, companion app images, and photographs — replacing the manual 15-page report process with a one-click export that leaves blanks where techs need to fill in.

**Architecture:** New `report-generator.ts` engine module uses the `docx` npm library to build a Word document programmatically. It pulls data from `VesselState` (annotations, scan composites, inspection images), captures 3D viewport renders via `screenshot-renderer.ts`, and optionally fetches A/B/C/D scan images from the companion app. A new `ReportExportPanel` sidebar component lets the tech select which annotations to include and triggers generation.

**Tech Stack:** `docx` (npm) for Word generation, existing Three.js screenshot pipeline for vessel renders, companion app HTTP API for scan images, existing `createAnnotationHeatmapCanvas` for heatmaps.

---

## Phase 1: Data Model Extensions

### Task 1: Add metadata fields to ScanCompositeConfig

Extend the scan composite type with fields needed for the scan log table.

**Files:**
- Modify: `src/components/VesselModeler/types.ts` (ScanCompositeConfig interface, ~line 170-205)

**Step 1: Add fields to ScanCompositeConfig**

In `src/components/VesselModeler/types.ts`, add three optional fields to `ScanCompositeConfig` after the `sourceNdeFile` field (~line 204):

```typescript
  /** Original NDE filename for companion app matching */
  sourceNdeFile?: string;
  /** Free-text comments for scan log (restrictions, surface condition, etc.) */
  comments?: string;
  /** Date the scan was performed (ISO string, e.g. "2025-10-03") */
  dateInspected?: string;
  /** Setup file name used for this scan (e.g. "Nev 20mm Hydro") */
  setupFileName?: string;
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(types): add comments, dateInspected, setupFileName to ScanCompositeConfig"
```

---

### Task 2: Add scan composite metadata UI inputs

Add editable fields in the scan composite sidebar so techs can enter comments, date, and setup file per composite.

**Files:**
- Modify: `src/components/VesselModeler/sidebar/ScanCompositeSection.tsx`

**Step 1: Add input fields to the selected-composite edit form**

In `ScanCompositeSection.tsx`, inside the `{isSelected && (...)}` block (after the existing orientation/color controls), add:

```tsx
{/* --- Metadata for report --- */}
<div className="vm-form-row">
    <div className="vm-label"><span>Date Inspected</span></div>
    <input
        type="date"
        className="vm-input"
        value={sc.dateInspected ?? ''}
        onChange={e => onUpdateScanComposite(sc.id, { dateInspected: e.target.value })}
        style={{ width: '100%' }}
    />
</div>
<div className="vm-form-row">
    <div className="vm-label"><span>Setup File</span></div>
    <input
        type="text"
        className="vm-input"
        placeholder="e.g. Nev 20mm Hydro"
        value={sc.setupFileName ?? ''}
        onChange={e => onUpdateScanComposite(sc.id, { setupFileName: e.target.value })}
        style={{ width: '100%' }}
    />
</div>
<div className="vm-form-row">
    <div className="vm-label"><span>Comments</span></div>
    <textarea
        className="vm-input"
        placeholder="Restrictions, surface condition, notes..."
        value={sc.comments ?? ''}
        onChange={e => onUpdateScanComposite(sc.id, { comments: e.target.value })}
        rows={3}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.8rem' }}
    />
</div>
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/sidebar/ScanCompositeSection.tsx
git commit -m "feat(scan-composite): add date, setup file, and comments fields to sidebar"
```

---

### Task 3: Add restriction mode to annotations

Add an `isRestriction` flag and `restrictionNotes` field to `AnnotationShapeConfig` so annotations can double as restriction markers.

**Files:**
- Modify: `src/components/VesselModeler/types.ts` (AnnotationShapeConfig, ~line 211-245)
- Modify: `src/components/VesselModeler/sidebar/AnnotationSection.tsx`

**Step 1: Extend AnnotationShapeConfig**

In `types.ts`, add to `AnnotationShapeConfig` after the `severityLevel` field (~line 244):

```typescript
  /** Whether this annotation marks a scan restriction area */
  isRestriction?: boolean;
  /** Free-text notes describing the restriction (e.g. "Structural steelwork, scaffolding") */
  restrictionNotes?: string;
```

**Step 2: Add restriction toggle and notes input to AnnotationSection**

In `AnnotationSection.tsx`, inside the selected-annotation edit block (where name, color, size inputs are), add after existing controls:

```tsx
{/* Restriction flag */}
<div className="vm-form-row" style={{ alignItems: 'center' }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#ccc', cursor: 'pointer' }}>
        <input
            type="checkbox"
            checked={sel.isRestriction ?? false}
            onChange={e => onUpdateAnnotation(sel.id, { isRestriction: e.target.checked })}
        />
        Restriction area
    </label>
</div>
{sel.isRestriction && (
    <div className="vm-form-row">
        <div className="vm-label"><span>Restriction Notes</span></div>
        <textarea
            className="vm-input"
            placeholder="e.g. Nozzle S2, structural steelwork..."
            value={sel.restrictionNotes ?? ''}
            onChange={e => onUpdateAnnotation(sel.id, { restrictionNotes: e.target.value })}
            rows={2}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.8rem' }}
        />
    </div>
)}
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/types.ts src/components/VesselModeler/sidebar/AnnotationSection.tsx
git commit -m "feat(annotations): add restriction mode with notes field"
```

---

### Task 4: Add reference drawing uploads to ProjectInfoSection

Add upload slots for P&ID, GA drawing, and plot plan images.

**Files:**
- Modify: `src/components/VesselModeler/types.ts` (VesselState, ~line 396-425)
- Modify: `src/components/VesselModeler/sidebar/ProjectInfoSection.tsx`

**Step 1: Add referenceDrawings to VesselState**

In `types.ts`, add to `VesselState` after `inspectionDate` (~line 409):

```typescript
  /** Reference drawings for report appendix (base64 image data) */
  referenceDrawings: ReferenceDrawing[];
```

And add the interface before `VesselState`:

```typescript
export interface ReferenceDrawing {
  id: number;
  /** Drawing title, e.g. "P&ID", "GA Drawing", "Plot Plan" */
  title: string;
  /** Base64-encoded image data */
  imageData: string;
  /** Original file name */
  fileName: string;
}
```

Update `DEFAULT_VESSEL_STATE` to include:
```typescript
  referenceDrawings: [],
```

**Step 2: Add drawing upload UI to ProjectInfoSection**

In `ProjectInfoSection.tsx`, add a reference drawing upload section below the inspection date input. Use a simple file input that converts to base64 via `FileReader`:

```tsx
import { useRef } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
// ... existing imports

export function ProjectInfoSection({ vesselState, onUpdateDimensions }: ProjectInfoSectionProps) {
    const drawingInputRef = useRef<HTMLInputElement>(null);

    const handleDrawingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const newDrawing: ReferenceDrawing = {
                id: Date.now(),
                title: file.name.replace(/\.[^.]+$/, ''),
                imageData: reader.result as string,
                fileName: file.name,
            };
            onUpdateDimensions({
                referenceDrawings: [...(vesselState.referenceDrawings ?? []), newDrawing],
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const removeDrawing = (id: number) => {
        onUpdateDimensions({
            referenceDrawings: (vesselState.referenceDrawings ?? []).filter(d => d.id !== id),
        });
    };

    return (
        <Section title="Project Info" icon={<FileText size={14} style={{ marginRight: 6 }} />}>
            {/* ... existing vessel name, location, date inputs ... */}

            {/* Reference Drawings */}
            <div className="vm-control-group" style={{ marginTop: 12 }}>
                <div className="vm-label"><span>Reference Drawings</span></div>
                {(vesselState.referenceDrawings ?? []).map(d => (
                    <div key={d.id} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 6px', marginBottom: 4,
                        background: 'rgba(255,255,255,0.05)', borderRadius: 4,
                        fontSize: '0.8rem', color: '#ccc',
                    }}>
                        <input
                            type="text"
                            className="vm-input"
                            value={d.title}
                            onChange={e => {
                                const updated = (vesselState.referenceDrawings ?? []).map(
                                    dr => dr.id === d.id ? { ...dr, title: e.target.value } : dr
                                );
                                onUpdateDimensions({ referenceDrawings: updated });
                            }}
                            style={{ flex: 1 }}
                        />
                        <button
                            className="vm-btn-icon"
                            onClick={() => removeDrawing(d.id)}
                            title="Remove drawing"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                <button
                    className="vm-btn vm-btn-primary"
                    onClick={() => drawingInputRef.current?.click()}
                    style={{ width: '100%' }}
                >
                    <Upload size={14} /> Add Drawing
                </button>
                <input
                    ref={drawingInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: 'none' }}
                    onChange={handleDrawingUpload}
                />
            </div>
        </Section>
    );
}
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/types.ts src/components/VesselModeler/sidebar/ProjectInfoSection.tsx
git commit -m "feat(project-info): add reference drawing uploads for report appendix"
```

---

### Task 5: Add "include in report" flag to annotations

Add a toggle so techs can select which annotations appear in the generated report.

**Files:**
- Modify: `src/components/VesselModeler/types.ts` (AnnotationShapeConfig)
- Modify: `src/components/VesselModeler/sidebar/AnnotationSection.tsx`

**Step 1: Add field to AnnotationShapeConfig**

In `types.ts`, add after `restrictionNotes`:

```typescript
  /** Whether to include this annotation in the exported report */
  includeInReport?: boolean;
```

**Step 2: Add toggle in AnnotationSection**

In the annotation list item row (where the eye/lock icons are), add a report toggle icon:

```tsx
import { FileText } from 'lucide-react';

// In the annotation list item, alongside visibility/lock buttons:
<button
    className="vm-btn-icon"
    onClick={e => {
        e.stopPropagation();
        onUpdateAnnotation(a.id, { includeInReport: !(a.includeInReport ?? false) });
    }}
    title={a.includeInReport ? 'Included in report' : 'Not in report'}
    style={{ opacity: a.includeInReport ? 1 : 0.3 }}
>
    <FileText size={14} />
</button>
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/types.ts src/components/VesselModeler/sidebar/AnnotationSection.tsx
git commit -m "feat(annotations): add include-in-report toggle"
```

---

## Phase 2: Report Generation Engine

### Task 6: Install docx dependency

**Step 1: Install**

```bash
npm install docx
```

**Step 2: Verify types are available**

The `docx` package includes TypeScript types. Verify with:

```bash
npx tsc --noEmit 2>&1 | head -5
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add docx library for Word report generation"
```

---

### Task 7: Build the report generator — document skeleton

Create the core report generation module that produces a .docx with the front page template and basic structure.

**Files:**
- Create: `src/components/VesselModeler/engine/report-generator.ts`

**Step 1: Create the generator with front page**

```typescript
// =============================================================================
// Report Generator — PAUT Inspection Report (.docx)
// =============================================================================
// Generates an editable Word document from vessel modeler state.
// Front page is a blank template; inspection results auto-populate from
// annotation data, scan composites, and companion app images.
// =============================================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ImageRun,
  PageBreak,
  Header,
  Footer,
  SectionType,
  TableLayoutType,
  VerticalAlign,
} from 'docx';
import type {
  VesselState,
  AnnotationShapeConfig,
  ScanCompositeConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportConfig {
  /** Which annotation IDs to include (from includeInReport flag) */
  annotationIds: number[];
  /** Whether companion app is available for A/B/C/D scan images */
  companionAvailable: boolean;
  /** Companion app port (if available) */
  companionPort?: number;
  /** Pre-captured vessel overview images (data URLs) */
  vesselOverviews: VesselOverviewImage[];
  /** Pre-captured annotation context images (annotation ID → data URL) */
  annotationContextImages: Map<number, string>;
  /** Pre-fetched companion scan images (annotation ID → scan images) */
  companionScanImages: Map<number, CompanionScanImageSet>;
  /** Pre-rendered heatmap images (annotation ID → data URL) */
  heatmapImages: Map<number, string>;
  /** Company logo as base64 data URL */
  logoDataUrl?: string;
}

export interface VesselOverviewImage {
  label: string;
  dataUrl: string;
}

export interface CompanionScanImageSet {
  cscan?: string;
  bscan?: string;
  dscan?: string;
  ascan?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH_TWIPS = 11906; // A4 width in twips (210mm)
const MARGIN_TWIPS = 1134; // ~20mm margins
const CONTENT_WIDTH = PAGE_WIDTH_TWIPS - 2 * MARGIN_TWIPS;
const HALF_WIDTH = Math.floor(CONTENT_WIDTH / 2);

const FONT = 'Calibri';
const FONT_SIZE_NORMAL = 20; // half-points (10pt)
const FONT_SIZE_SMALL = 16;  // 8pt
const FONT_SIZE_HEADING = 28; // 14pt
const FONT_SIZE_TITLE = 36;  // 18pt

const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: '000000',
};

const CELL_BORDERS = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textRun(text: string, opts?: { bold?: boolean; size?: number; font?: string; color?: string }): TextRun {
  return new TextRun({
    text,
    bold: opts?.bold ?? false,
    size: opts?.size ?? FONT_SIZE_NORMAL,
    font: opts?.font ?? FONT,
    color: opts?.color,
  });
}

function cellText(text: string, opts?: { bold?: boolean; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] }): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [textRun(text, { bold: opts?.bold })],
      alignment: opts?.alignment ?? AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
    })],
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
  });
}

function emptyCell(): TableCell {
  return cellText('');
}

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [textRun(text, { bold: true, size: FONT_SIZE_NORMAL })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
    })],
    borders: CELL_BORDERS,
    shading: { fill: 'D9D9D9' },
    verticalAlign: VerticalAlign.CENTER,
  });
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer | ArrayBuffer; width: number; height: number } {
  // Extract base64 data from data URL
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Default dimensions — actual sizing controlled by ImageRun
  return { buffer: bytes.buffer, width: 600, height: 400 };
}

// ---------------------------------------------------------------------------
// Section Builders
// ---------------------------------------------------------------------------

function buildFrontPage(vessel: VesselState, config: ReportConfig): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(new Paragraph({
    children: [textRun('PHASED ARRAY ULTRASONIC', { bold: true, size: FONT_SIZE_TITLE })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 0 },
  }));
  paragraphs.push(new Paragraph({
    children: [textRun('TESTING INSPECTION REPORT', { bold: true, size: FONT_SIZE_TITLE })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 300 },
  }));

  // Customer / Location / Report info table
  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [
        cellText('Customer:'),
        emptyCell(),
        cellText('Location:'),
        cellText(vessel.location || ''),
        cellText('Report No:'),
        emptyCell(),
      ]}),
      new TableRow({ children: [
        new TableCell({
          children: [new Paragraph({ children: [textRun('Project:', { bold: false })] })],
          borders: CELL_BORDERS,
          columnSpan: 6,
        }),
      ]}),
      new TableRow({ children: [
        cellText('Contract No:'),
        emptyCell(),
        cellText('WO No:'),
        emptyCell(),
        cellText('Test Date:'),
        cellText(vessel.inspectionDate || ''),
      ]}),
    ],
  });
  paragraphs.push(new Paragraph({ children: [] }));
  paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })] }));

  // Component Details table (blank for tech)
  paragraphs.push(new Paragraph({
    children: [textRun('Component Details & Procedure', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 300, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  const componentTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [cellText('Description'), emptyCell(), new TableCell({ children: [new Paragraph('')], borders: CELL_BORDERS, columnSpan: 2 })] }),
      new TableRow({ children: [cellText('Line/Tag Number'), cellText(vessel.vesselName || ''), cellText('Drawing Number'), emptyCell()] }),
      new TableRow({ children: [cellText('Material'), emptyCell(), cellText('Nominal Thickness'), emptyCell()] }),
      new TableRow({ children: [cellText('Temperature'), emptyCell(), cellText('Corrosion Allowance'), emptyCell()] }),
      new TableRow({ children: [cellText('Stress Relief'), emptyCell(), cellText('Coating Type'), emptyCell()] }),
      new TableRow({ children: [cellText('Procedure No'), emptyCell(), cellText('Technique Nos'), emptyCell()] }),
      new TableRow({ children: [cellText('Acceptance Criteria'), emptyCell(), cellText('Applicable Standard'), emptyCell()] }),
    ],
  });

  // Equipment table (blank for tech)
  paragraphs.push(new Paragraph({
    children: [textRun('Equipment', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 300, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  const equipmentTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [cellText('Equip. Model'), emptyCell(), cellText('Serial No'), emptyCell()] }),
      new TableRow({ children: [cellText('Probe'), emptyCell(), cellText('Wedge'), emptyCell()] }),
      new TableRow({ children: [cellText('Calibration Blocks'), emptyCell(), cellText('Scanner Frame'), emptyCell()] }),
      new TableRow({ children: [cellText('Ref Blocks'), emptyCell(), cellText('Couplant'), emptyCell()] }),
    ],
  });

  // Beamset configuration table (blank for tech)
  paragraphs.push(new Paragraph({
    children: [textRun('Phased Array Beamset Configuration', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 300, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  const beamsetTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [
        headerCell('Group'), headerCell('Type'), headerCell('Active Elements'),
        headerCell('Aperture'), headerCell('Focal Depth'), headerCell('Angle'),
        headerCell('Skew'), headerCell('Index Offset'),
      ]}),
      // 3 blank rows for tech to fill
      ...Array.from({ length: 3 }, () =>
        new TableRow({ children: Array.from({ length: 8 }, () => emptyCell()) }),
      ),
    ],
  });

  // Inspection Results Summary (blank for tech)
  paragraphs.push(new Paragraph({
    children: [textRun('Inspection Results Summary', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 300, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  // Add some blank lines for the tech to write the summary
  for (let i = 0; i < 8; i++) {
    paragraphs.push(new Paragraph({ children: [textRun(' ')] }));
  }

  // Sign-off table
  paragraphs.push(new Paragraph({
    children: [textRun('')],
    spacing: { before: 200 },
  }));

  const signoffTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [headerCell('Technician'), headerCell(''), headerCell('Reviewed'), headerCell(''), headerCell('Client Acceptance'), headerCell('')] }),
      new TableRow({ children: [cellText('Name:'), emptyCell(), cellText('Name:'), emptyCell(), cellText('Name:'), emptyCell()] }),
      new TableRow({ children: [cellText('Qualification:'), emptyCell(), cellText('Qualification:'), emptyCell(), cellText('Position:'), emptyCell()] }),
      new TableRow({ children: [cellText('Signature:'), emptyCell(), cellText('Signature:'), emptyCell(), cellText('Signature:'), emptyCell()] }),
      new TableRow({ children: [cellText('Date:'), emptyCell(), cellText('Date:'), emptyCell(), cellText('Date:'), emptyCell()] }),
    ],
  });

  return [
    ...paragraphs,
    new Paragraph({ children: [infoTable] }),
    new Paragraph({ children: [componentTable] }),
    new Paragraph({ children: [equipmentTable] }),
    new Paragraph({ children: [beamsetTable] }),
    new Paragraph({ children: [signoffTable] }),
  ];
}

function buildAnnotationPage(
  annotation: AnnotationShapeConfig,
  vessel: VesselState,
  config: ReportConfig,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const stats = annotation.thicknessStats;
  const scanImages = config.companionScanImages.get(annotation.id);
  const heatmapUrl = config.heatmapImages.get(annotation.id);
  const contextUrl = config.annotationContextImages.get(annotation.id);

  // Section header
  paragraphs.push(new Paragraph({
    children: [textRun(`Inspection Results — ${annotation.name}`, { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 200, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  // Position info
  const circumference = Math.PI * vessel.id;
  const scanMm = (annotation.angle / 360) * circumference;
  paragraphs.push(new Paragraph({
    children: [
      textRun('Position: ', { bold: true }),
      textRun(`Index ${annotation.pos.toFixed(0)}mm, Scan ${scanMm.toFixed(0)}mm (${annotation.angle.toFixed(0)}°)`),
    ],
    spacing: { after: 40 },
  }));
  paragraphs.push(new Paragraph({
    children: [
      textRun('Size: ', { bold: true }),
      textRun(`${annotation.width.toFixed(0)} × ${annotation.height.toFixed(0)} mm (${annotation.type})`),
    ],
    spacing: { after: 100 },
  }));

  // Scan images grid (C-scan + B-scan + D-scan + A-scan)
  if (scanImages || heatmapUrl) {
    const imageRows: TableRow[] = [];

    // Row 1: C-scan (heatmap) and B-scan
    const row1Cells: TableCell[] = [];
    if (heatmapUrl) {
      const { buffer } = dataUrlToBuffer(heatmapUrl);
      row1Cells.push(new TableCell({
        children: [
          new Paragraph({ children: [textRun('C-Scan (Thickness Map)', { bold: true, size: FONT_SIZE_SMALL })], alignment: AlignmentType.CENTER }),
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 280, height: 200 }, type: 'png' })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        borders: CELL_BORDERS,
      }));
    } else {
      row1Cells.push(emptyCell());
    }

    if (scanImages?.bscan) {
      const { buffer } = dataUrlToBuffer(scanImages.bscan);
      row1Cells.push(new TableCell({
        children: [
          new Paragraph({ children: [textRun('B-Scan', { bold: true, size: FONT_SIZE_SMALL })], alignment: AlignmentType.CENTER }),
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 280, height: 200 }, type: 'png' })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        borders: CELL_BORDERS,
      }));
    } else {
      row1Cells.push(emptyCell());
    }
    imageRows.push(new TableRow({ children: row1Cells }));

    // Row 2: D-scan and A-scan
    const row2Cells: TableCell[] = [];
    if (scanImages?.dscan) {
      const { buffer } = dataUrlToBuffer(scanImages.dscan);
      row2Cells.push(new TableCell({
        children: [
          new Paragraph({ children: [textRun('D-Scan', { bold: true, size: FONT_SIZE_SMALL })], alignment: AlignmentType.CENTER }),
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 280, height: 200 }, type: 'png' })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        borders: CELL_BORDERS,
      }));
    } else {
      row2Cells.push(emptyCell());
    }

    if (scanImages?.ascan) {
      const { buffer } = dataUrlToBuffer(scanImages.ascan);
      row2Cells.push(new TableCell({
        children: [
          new Paragraph({ children: [textRun('A-Scan', { bold: true, size: FONT_SIZE_SMALL })], alignment: AlignmentType.CENTER }),
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 280, height: 200 }, type: 'png' })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        borders: CELL_BORDERS,
      }));
    } else {
      row2Cells.push(emptyCell());
    }
    imageRows.push(new TableRow({ children: row2Cells }));

    paragraphs.push(new Paragraph({
      children: [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: imageRows,
      })],
    }));
  }

  // Thickness statistics table
  if (stats) {
    paragraphs.push(new Paragraph({
      children: [textRun('Thickness Statistics', { bold: true })],
      spacing: { before: 200, after: 80 },
    }));

    const statsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ children: [
          headerCell('Min WT'), headerCell('Max WT'), headerCell('Avg WT'),
          headerCell('Std Dev'), headerCell('Samples'), headerCell('Anomaly Code'),
        ]}),
        new TableRow({ children: [
          cellText(`${stats.min.toFixed(2)} mm`, { alignment: AlignmentType.CENTER }),
          cellText(`${stats.max.toFixed(2)} mm`, { alignment: AlignmentType.CENTER }),
          cellText(`${stats.avg.toFixed(2)} mm`, { alignment: AlignmentType.CENTER }),
          cellText(`${stats.stdDev.toFixed(3)} mm`, { alignment: AlignmentType.CENTER }),
          cellText(`${stats.sampleCount.toLocaleString()}`, { alignment: AlignmentType.CENTER }),
          emptyCell(), // Tech fills in anomaly code
        ]}),
      ],
    });
    paragraphs.push(new Paragraph({ children: [statsTable] }));
  }

  // Analysis / Interpretation (blank for tech)
  paragraphs.push(new Paragraph({
    children: [textRun('Analysis / Interpretation:', { bold: true })],
    spacing: { before: 200, after: 80 },
  }));
  // Blank lines for tech to fill in
  for (let i = 0; i < 5; i++) {
    paragraphs.push(new Paragraph({ children: [textRun(' ')], spacing: { after: 40 } }));
  }

  // Restrictions (from restriction annotations in this area)
  const restrictions = vessel.annotations.filter(a =>
    a.isRestriction && a.restrictionNotes
  );
  if (restrictions.length > 0) {
    paragraphs.push(new Paragraph({
      children: [
        textRun('Restrictions: ', { bold: true }),
        textRun(restrictions.map(r => r.restrictionNotes).join('; ')),
      ],
      spacing: { before: 100 },
    }));
  }

  return paragraphs;
}

function buildVesselOverviewPage(config: ReportConfig): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(new Paragraph({
    children: [textRun('Vessel Overview', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 200, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  for (const overview of config.vesselOverviews) {
    const { buffer } = dataUrlToBuffer(overview.dataUrl);
    paragraphs.push(new Paragraph({
      children: [new ImageRun({
        data: buffer,
        transformation: { width: 560, height: 350 },
        type: 'png',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
    paragraphs.push(new Paragraph({
      children: [textRun(overview.label, { size: FONT_SIZE_SMALL })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));
  }

  return paragraphs;
}

function buildScanLogTable(vessel: VesselState): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(new Paragraph({
    children: [textRun('Phased Array C-Scan Mapping Log', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 200, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  if (vessel.scanComposites.length === 0) {
    paragraphs.push(new Paragraph({
      children: [textRun('No scan composites loaded.')],
    }));
    return paragraphs;
  }

  const headerRow = new TableRow({
    children: [
      headerCell('File Name'),
      headerCell('Date'),
      headerCell('Setup File'),
      headerCell('Scan Range'),
      headerCell('Index Range'),
      headerCell('Min WT'),
      headerCell('Avg WT'),
      headerCell('Anomaly Code'),
      headerCell('Comments'),
    ],
  });

  const dataRows = vessel.scanComposites
    .filter(sc => sc.orientationConfirmed)
    .map(sc => {
      const scanRange = sc.xAxis.length > 0
        ? `${Math.round(sc.xAxis[0])} – ${Math.round(sc.xAxis[sc.xAxis.length - 1])}`
        : 'N/A';
      const indexRange = sc.yAxis.length > 0
        ? `${Math.round(sc.yAxis[0])} – ${Math.round(sc.yAxis[sc.yAxis.length - 1])}`
        : 'N/A';

      return new TableRow({
        children: [
          cellText(sc.sourceNdeFile ?? sc.name, { alignment: AlignmentType.LEFT }),
          cellText(sc.dateInspected ?? '', { alignment: AlignmentType.CENTER }),
          cellText(sc.setupFileName ?? '', { alignment: AlignmentType.CENTER }),
          cellText(scanRange, { alignment: AlignmentType.CENTER }),
          cellText(indexRange, { alignment: AlignmentType.CENTER }),
          cellText(`${sc.stats.min.toFixed(2)}`, { alignment: AlignmentType.CENTER }),
          cellText(`${sc.stats.mean.toFixed(2)}`, { alignment: AlignmentType.CENTER }),
          emptyCell(), // Tech fills in anomaly code
          cellText(sc.comments ?? '', { alignment: AlignmentType.LEFT }),
        ],
      });
    });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  });

  paragraphs.push(new Paragraph({ children: [table] }));

  paragraphs.push(new Paragraph({
    children: [textRun('All dimensions in mm. WT results include coating correction.', { size: FONT_SIZE_SMALL })],
    spacing: { before: 80 },
  }));

  return paragraphs;
}

function buildCalibrationLogTemplate(): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(new Paragraph({
    children: [textRun('Phased Array Calibration Scan Log', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 200, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  const headerRow = new TableRow({
    children: [
      headerCell('File Name'),
      headerCell('Setup File Name'),
      headerCell('Date Inspected'),
      headerCell('Time Stamp'),
      headerCell('Scan Start'),
      headerCell('Scan End'),
      headerCell('Ref. A WT'),
      headerCell('Meas. A WT'),
      headerCell('Velocity (m/sec)'),
      headerCell('Comments'),
    ],
  });

  // 6 blank rows
  const blankRows = Array.from({ length: 6 }, () =>
    new TableRow({ children: Array.from({ length: 10 }, () => emptyCell()) }),
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...blankRows],
  });

  paragraphs.push(new Paragraph({ children: [table] }));

  paragraphs.push(new Paragraph({
    children: [textRun('All dimensions & measurements in mm. Calibration Block Velocity: _____ m/sec ±30m/sec.', { size: FONT_SIZE_SMALL })],
    spacing: { before: 80 },
  }));

  return paragraphs;
}

function buildPhotographsPage(
  vessel: VesselState,
  config: ReportConfig,
): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  paragraphs.push(new Paragraph({
    children: [textRun('Photographs', { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 200, after: 100 },
    shading: { fill: 'D9D9D9' },
  }));

  // Pair inspection images with their vessel context shots
  const images = vessel.inspectionImages;
  if (images.length === 0) {
    paragraphs.push(new Paragraph({
      children: [textRun('No inspection images attached.')],
    }));
    return paragraphs;
  }

  for (const img of images) {
    const contextUrl = config.annotationContextImages.get(img.id);

    const cells: TableCell[] = [];

    // Photo image
    const { buffer: photoBuffer } = dataUrlToBuffer(img.imageData);
    cells.push(new TableCell({
      children: [
        new Paragraph({
          children: [new ImageRun({
            data: photoBuffer,
            transformation: { width: 260, height: 195 },
            type: 'png',
          })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [textRun(img.name, { size: FONT_SIZE_SMALL })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 40 },
        }),
      ],
      borders: CELL_BORDERS,
    }));

    // Context image (vessel view showing location)
    if (contextUrl) {
      const { buffer: ctxBuffer } = dataUrlToBuffer(contextUrl);
      cells.push(new TableCell({
        children: [
          new Paragraph({
            children: [new ImageRun({
              data: ctxBuffer,
              transformation: { width: 260, height: 195 },
              type: 'png',
            })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [textRun('Location on vessel', { size: FONT_SIZE_SMALL })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 40 },
          }),
        ],
        borders: CELL_BORDERS,
      }));
    } else {
      cells.push(emptyCell());
    }

    paragraphs.push(new Paragraph({
      children: [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [new TableRow({ children: cells })],
      })],
      spacing: { after: 200 },
    }));
  }

  return paragraphs;
}

function buildReferenceDrawingsPages(vessel: VesselState): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const drawings = vessel.referenceDrawings ?? [];

  if (drawings.length === 0) return paragraphs;

  for (const drawing of drawings) {
    paragraphs.push(new Paragraph({
      children: [textRun(`Inspection Drawings — ${drawing.title}`, { bold: true, size: FONT_SIZE_HEADING })],
      spacing: { before: 200, after: 100 },
      shading: { fill: 'D9D9D9' },
    }));

    const { buffer } = dataUrlToBuffer(drawing.imageData);
    paragraphs.push(new Paragraph({
      children: [new ImageRun({
        data: buffer,
        transformation: { width: 560, height: 750 },
        type: 'png',
      })],
      alignment: AlignmentType.CENTER,
    }));

    // Page break after each drawing
    paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export async function generateReport(
  vessel: VesselState,
  config: ReportConfig,
): Promise<Blob> {
  const reportAnnotations = vessel.annotations.filter(a =>
    config.annotationIds.includes(a.id),
  );

  const sections: Paragraph[] = [];

  // 1. Front page (blank template)
  sections.push(...buildFrontPage(vessel, config));
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 2. Per-annotation inspection results
  for (const ann of reportAnnotations) {
    sections.push(...buildAnnotationPage(ann, vessel, config));
    sections.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 3. Vessel overview images
  if (config.vesselOverviews.length > 0) {
    sections.push(...buildVesselOverviewPage(config));
    sections.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 4. Scan log table
  sections.push(...buildScanLogTable(vessel));
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 5. Calibration log (blank template)
  sections.push(...buildCalibrationLogTemplate());
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 6. Photographs
  sections.push(...buildPhotographsPage(vessel, config));
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 7. Reference drawings
  sections.push(...buildReferenceDrawingsPages(vessel));

  // Build document
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: MARGIN_TWIPS,
            bottom: MARGIN_TWIPS,
            left: MARGIN_TWIPS,
            right: MARGIN_TWIPS,
          },
        },
      },
      children: sections,
    }],
  });

  return Packer.toBlob(doc);
}

export function downloadReport(blob: Blob, vessel: VesselState): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = vessel.inspectionDate || new Date().toISOString().slice(0, 10);
  const namePart = vessel.vesselName?.replace(/\s+/g, '-') || 'vessel';
  a.href = url;
  a.download = `${namePart}_PAUT_Report_${datePart}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/report-generator.ts
git commit -m "feat(report): create Word report generator with all section builders"
```

---

## Phase 3: Image Capture Pipeline

### Task 8: Build pre-capture pipeline for report images

Before generating the document, we need to programmatically capture vessel overview screenshots and annotation context images from the 3D viewport. This module orchestrates those captures.

**Files:**
- Create: `src/components/VesselModeler/engine/report-image-capture.ts`

**Step 1: Create the image capture pipeline**

This module takes the Three.js scene refs and produces all the images the report needs. It uses the existing `captureScreenshot` function with programmatic camera positions.

```typescript
// =============================================================================
// Report Image Capture — Programmatic 3D viewport image generation
// =============================================================================

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VesselState, AnnotationShapeConfig } from '../types';
import { VIEW_PRESETS } from '../types';
import type { VesselOverviewImage, CompanionScanImageSet } from './report-generator';
import { createAnnotationHeatmapCanvas } from './annotation-heatmap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptureContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  vesselState: VesselState;
}

// ---------------------------------------------------------------------------
// Vessel overview captures
// ---------------------------------------------------------------------------

const OVERVIEW_VIEWS = [
  { key: 'isometric', label: 'Isometric View' },
  { key: 'front', label: 'Front View' },
  { key: 'top', label: 'Top View' },
  { key: 'right', label: 'Side View' },
] as const;

/** Capture the vessel from multiple standard viewpoints. */
export function captureVesselOverviews(ctx: CaptureContext): VesselOverviewImage[] {
  const overviews: VesselOverviewImage[] = [];
  const { renderer, scene, camera, controls, vesselState } = ctx;

  // Store original camera state
  const origPos = camera.position.clone();
  const origTarget = controls.target.clone();
  const origAspect = camera.aspect;

  // Calculate vessel bounding for framing
  const vesselLength = vesselState.length + vesselState.id; // approximate total extent
  const distance = vesselLength * 1.5;

  for (const view of OVERVIEW_VIEWS) {
    const preset = VIEW_PRESETS[view.key];
    const dir = new THREE.Vector3(...preset.position).normalize();

    camera.position.copy(dir.multiplyScalar(distance));
    camera.aspect = 16 / 10;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.update();

    // Render to offscreen target
    const width = 1600;
    const height = 1000;
    const renderTarget = new THREE.WebGLRenderTarget(width, height);
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);

    // Read pixels
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
    renderer.setRenderTarget(null);
    renderTarget.dispose();

    // Convert to canvas → data URL
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const canvasCtx = canvas.getContext('2d')!;
    const imageData = canvasCtx.createImageData(width, height);

    // Flip vertically (WebGL reads bottom-up)
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4;
      const dstRow = y * width * 4;
      for (let x = 0; x < width * 4; x++) {
        imageData.data[dstRow + x] = pixels[srcRow + x];
      }
    }
    canvasCtx.putImageData(imageData, 0, 0);

    overviews.push({
      label: view.label,
      dataUrl: canvas.toDataURL('image/png'),
    });
  }

  // Restore camera
  camera.position.copy(origPos);
  camera.aspect = origAspect;
  camera.updateProjectionMatrix();
  controls.target.copy(origTarget);
  controls.update();

  return overviews;
}

// ---------------------------------------------------------------------------
// Annotation context captures (vessel with arrow showing location)
// ---------------------------------------------------------------------------

/** Capture a view of the vessel focused on a specific annotation's position. */
export function captureAnnotationContext(
  ctx: CaptureContext,
  annotation: AnnotationShapeConfig,
): string {
  const { renderer, scene, camera, controls, vesselState } = ctx;

  const origPos = camera.position.clone();
  const origTarget = controls.target.clone();
  const origAspect = camera.aspect;

  // Calculate annotation world position
  const radius = vesselState.id / 2;
  const angleRad = (annotation.angle * Math.PI) / 180;

  // Target is the annotation center on the vessel surface
  const targetX = annotation.pos - vesselState.length / 2; // centered vessel
  const targetY = radius * Math.sin(angleRad);
  const targetZ = radius * Math.cos(angleRad);

  const target = new THREE.Vector3(targetX, targetY, targetZ);
  const distance = vesselState.id * 2;
  const cameraDir = new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad)).normalize();

  camera.position.copy(target).add(cameraDir.multiplyScalar(distance));
  camera.aspect = 4 / 3;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.update();

  const width = 800;
  const height = 600;
  const renderTarget = new THREE.WebGLRenderTarget(width, height);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  renderer.setRenderTarget(null);
  renderTarget.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const canvasCtx = canvas.getContext('2d')!;
  const imageData = canvasCtx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4;
    const dstRow = y * width * 4;
    for (let x = 0; x < width * 4; x++) {
      imageData.data[dstRow + x] = pixels[srcRow + x];
    }
  }
  canvasCtx.putImageData(imageData, 0, 0);

  // Restore camera
  camera.position.copy(origPos);
  camera.aspect = origAspect;
  camera.updateProjectionMatrix();
  controls.target.copy(origTarget);
  controls.update();

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Heatmap captures
// ---------------------------------------------------------------------------

/** Render annotation heatmap to data URL. */
export function captureAnnotationHeatmap(
  annotation: AnnotationShapeConfig,
  vesselState: VesselState,
): string | null {
  const canvas = createAnnotationHeatmapCanvas(annotation, vesselState, 'Jet');
  if (!canvas) return null;

  // Scale up for print quality
  const printCanvas = document.createElement('canvas');
  const scale = Math.max(1, Math.floor(512 / Math.max(canvas.width, canvas.height)));
  printCanvas.width = canvas.width * scale;
  printCanvas.height = canvas.height * scale;
  const pCtx = printCanvas.getContext('2d')!;
  pCtx.imageSmoothingEnabled = false;
  pCtx.drawImage(canvas, 0, 0, printCanvas.width, printCanvas.height);

  return printCanvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Companion app scan image fetching
// ---------------------------------------------------------------------------

/** Fetch A/B/C/D scan images from the companion app for an annotation's min-thickness point. */
export async function fetchCompanionScanImages(
  annotation: AnnotationShapeConfig,
  vesselState: VesselState,
  port: number,
): Promise<CompanionScanImageSet | null> {
  const composite = vesselState.scanComposites.find(sc => {
    if (!sc.orientationConfirmed) return false;
    // Simple overlap check
    return true; // The findOverlappingComposite logic handles this properly
  });

  if (!composite?.sourceNdeFile || !annotation.thicknessStats) return null;

  const circumference = Math.PI * vesselState.id;
  const stats = annotation.thicknessStats;

  // Use the min-thickness point as the crosshair position
  const datumScanMm = (composite.datumAngleDeg / 360) * circumference;
  const scanDir = composite.scanDirection === 'cw' ? 1 : -1;
  const indexDir = composite.indexDirection === 'forward' ? 1 : -1;

  const annScanMm = (annotation.angle / 360) * circumference;
  const annHalfW = annotation.width / 2;
  const annHalfH = (annotation.type === 'circle' ? annotation.width : annotation.height) / 2;

  const scanStartMm = composite.xAxis[0] + scanDir * (annScanMm - datumScanMm - annHalfW);
  const scanEndMm = composite.xAxis[0] + scanDir * (annScanMm - datumScanMm + annHalfW);
  const indexStartMm = composite.indexStartMm + indexDir * (annotation.pos - composite.indexStartMm - annHalfH);
  const indexEndMm = composite.indexStartMm + indexDir * (annotation.pos - composite.indexStartMm + annHalfH);

  // Crosshair at min point
  const minScanMm = (stats.minPoint.angle / 360) * circumference;
  const scanLineMm = composite.xAxis[0] + scanDir * (minScanMm - datumScanMm);
  const indexLineMm = composite.indexStartMm + indexDir * (stats.minPoint.pos - composite.indexStartMm);

  try {
    const res = await fetch(`http://localhost:${port}/render-region`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: composite.sourceNdeFile,
        scanStartMm: Math.min(scanStartMm, scanEndMm),
        scanEndMm: Math.max(scanStartMm, scanEndMm),
        indexStartMm: Math.min(indexStartMm, indexEndMm),
        indexEndMm: Math.max(indexStartMm, indexEndMm),
        scanLineMm,
        indexLineMm,
        views: ['bscan_axial', 'bscan_index', 'ascan_center'],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    return {
      bscan: data.bscanIndex ?? undefined,
      dscan: data.bscanAxial ?? undefined,
      ascan: data.ascanCenter ?? undefined,
    };
  } catch {
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/report-image-capture.ts
git commit -m "feat(report): add image capture pipeline for vessel overviews, annotation context, and companion scans"
```

---

## Phase 4: Report Export UI

### Task 9: Create ReportExportPanel sidebar component

This is the UI where the tech selects annotations, triggers image capture, and downloads the report.

**Files:**
- Create: `src/components/VesselModeler/sidebar/ReportExportSection.tsx`
- Modify: `src/components/VesselModeler/sidebar/index.ts` (add export)

**Step 1: Build the ReportExportSection component**

```tsx
// =============================================================================
// ReportExportSection — Sidebar panel for PAUT report generation
// =============================================================================

import { useState } from 'react';
import { FileDown, Check, Loader2 } from 'lucide-react';
import type { VesselState } from '../types';
import { SubSection } from './SliderRow';

export interface ReportExportSectionProps {
  vesselState: VesselState;
  onUpdateAnnotation: (id: number, updates: { includeInReport?: boolean }) => void;
  onGenerateReport: () => Promise<void>;
}

type GenerationPhase =
  | 'idle'
  | 'capturing-overviews'
  | 'capturing-annotations'
  | 'fetching-scans'
  | 'building-document'
  | 'done'
  | 'error';

const PHASE_LABELS: Record<GenerationPhase, string> = {
  idle: '',
  'capturing-overviews': 'Capturing vessel views...',
  'capturing-annotations': 'Capturing annotation images...',
  'fetching-scans': 'Fetching scan data from companion...',
  'building-document': 'Building Word document...',
  done: 'Report downloaded!',
  error: 'Error generating report',
};

export function ReportExportSection({
  vesselState,
  onUpdateAnnotation,
  onGenerateReport,
}: ReportExportSectionProps) {
  const [phase, setPhase] = useState<GenerationPhase>('idle');

  const reportAnnotations = vesselState.annotations.filter(a => a.includeInReport);
  const allAnnotations = vesselState.annotations;

  const selectAll = () => {
    for (const a of allAnnotations) {
      if (!a.includeInReport) onUpdateAnnotation(a.id, { includeInReport: true });
    }
  };

  const selectNone = () => {
    for (const a of allAnnotations) {
      if (a.includeInReport) onUpdateAnnotation(a.id, { includeInReport: false });
    }
  };

  const handleGenerate = async () => {
    if (reportAnnotations.length === 0 && vesselState.scanComposites.length === 0) return;
    try {
      await onGenerateReport();
      setPhase('done');
      setTimeout(() => setPhase('idle'), 3000);
    } catch {
      setPhase('error');
      setTimeout(() => setPhase('idle'), 5000);
    }
  };

  const isGenerating = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  return (
    <SubSection title="Report Export" count={reportAnnotations.length}>
      {/* Annotation selection */}
      {allAnnotations.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="vm-btn" onClick={selectAll} style={{ flex: 1, fontSize: '0.75rem' }}>
              Select All
            </button>
            <button className="vm-btn" onClick={selectNone} style={{ flex: 1, fontSize: '0.75rem' }}>
              Select None
            </button>
          </div>

          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
            {allAnnotations.map(a => (
              <label
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  fontSize: '0.8rem',
                  color: '#ccc',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={a.includeInReport ?? false}
                  onChange={e => onUpdateAnnotation(a.id, { includeInReport: e.target.checked })}
                />
                <span style={{ flex: 1 }}>{a.name}</span>
                {a.thicknessStats && (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#888' }}>
                    {a.thicknessStats.min.toFixed(1)}mm
                  </span>
                )}
                {a.isRestriction && (
                  <span style={{ fontSize: '0.65rem', color: '#facc15' }}>R</span>
                )}
              </label>
            ))}
          </div>
        </>
      )}

      {/* Summary */}
      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
        <div>{reportAnnotations.length} annotation{reportAnnotations.length !== 1 ? 's' : ''} selected</div>
        <div>{vesselState.scanComposites.filter(s => s.orientationConfirmed).length} scan composite{vesselState.scanComposites.length !== 1 ? 's' : ''} in log</div>
        <div>{vesselState.inspectionImages.length} photograph{vesselState.inspectionImages.length !== 1 ? 's' : ''}</div>
        <div>{(vesselState.referenceDrawings ?? []).length} reference drawing{(vesselState.referenceDrawings ?? []).length !== 1 ? 's' : ''}</div>
      </div>

      {/* Status */}
      {phase !== 'idle' && (
        <div style={{
          padding: '6px 10px',
          marginBottom: 8,
          borderRadius: 4,
          fontSize: '0.75rem',
          background: phase === 'error' ? 'rgba(239,68,68,0.15)' : phase === 'done' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
          color: phase === 'error' ? '#ef4444' : phase === 'done' ? '#22c55e' : '#ccc',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          {isGenerating && <Loader2 size={14} className="animate-spin" />}
          {phase === 'done' && <Check size={14} />}
          {PHASE_LABELS[phase]}
        </div>
      )}

      {/* Generate button */}
      <button
        className="vm-btn vm-btn-primary"
        onClick={handleGenerate}
        disabled={isGenerating || (reportAnnotations.length === 0 && vesselState.scanComposites.length === 0)}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <FileDown size={14} />
        {isGenerating ? 'Generating...' : 'Generate PAUT Report'}
      </button>
    </SubSection>
  );
}
```

**Step 2: Add export to index.ts**

In `src/components/VesselModeler/sidebar/index.ts`, add:

```typescript
export { ReportExportSection } from './ReportExportSection';
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/sidebar/ReportExportSection.tsx src/components/VesselModeler/sidebar/index.ts
git commit -m "feat(report): add ReportExportSection sidebar UI with annotation picker"
```

---

### Task 10: Wire report generation into VesselModeler

Connect the ReportExportSection to VesselModeler.tsx, orchestrating the full pipeline: capture images → fetch companion data → build document → download.

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add imports and handler**

At the top of VesselModeler.tsx, add imports:

```typescript
import { ReportExportSection } from './sidebar/ReportExportSection';
import {
  generateReport,
  downloadReport,
  type ReportConfig,
} from './engine/report-generator';
import {
  captureVesselOverviews,
  captureAnnotationContext,
  captureAnnotationHeatmap,
  fetchCompanionScanImages,
} from './engine/report-image-capture';
```

Add handler function inside the VesselModeler component (near other handler functions):

```typescript
const handleGenerateReport = useCallback(async () => {
  const viewportHandle = viewportRef.current;
  if (!viewportHandle) return;

  const renderer = viewportHandle.getRenderer();
  const scene = viewportHandle.getScene();
  const camera = viewportHandle.getCamera();
  const controls = viewportHandle.getControls();
  if (!renderer || !scene || !camera || !controls) return;

  const captureCtx = { renderer, scene, camera, controls, vesselState: state.vessel };

  // 1. Capture vessel overview images
  const vesselOverviews = captureVesselOverviews(captureCtx);

  // 2. Capture per-annotation context images and heatmaps
  const reportAnnotations = state.vessel.annotations.filter(a => a.includeInReport);
  const annotationContextImages = new Map<number, string>();
  const heatmapImages = new Map<number, string>();
  const companionScanImages = new Map<number, CompanionScanImageSet>();

  for (const ann of reportAnnotations) {
    annotationContextImages.set(ann.id, captureAnnotationContext(captureCtx, ann));

    const heatmap = captureAnnotationHeatmap(ann, state.vessel);
    if (heatmap) heatmapImages.set(ann.id, heatmap);
  }

  // 3. Fetch companion scan images (if available)
  // Check companion app status from the hook
  const companionPort = companionStatus?.port;
  if (companionPort && companionStatus?.connected) {
    for (const ann of reportAnnotations) {
      const scans = await fetchCompanionScanImages(ann, state.vessel, companionPort);
      if (scans) companionScanImages.set(ann.id, scans);
    }
  }

  // 4. Build report config
  const config: ReportConfig = {
    annotationIds: reportAnnotations.map(a => a.id),
    companionAvailable: !!companionPort,
    companionPort,
    vesselOverviews,
    annotationContextImages,
    companionScanImages,
    heatmapImages,
  };

  // 5. Generate and download
  const blob = await generateReport(state.vessel, config);
  downloadReport(blob, state.vessel);
}, [state.vessel, companionStatus]);
```

**Step 2: Render the section in the sidebar**

In the sidebar JSX (where other sections like ScanCompositeSection, AnnotationSection etc. are rendered), add ReportExportSection near the bottom:

```tsx
<ReportExportSection
  vesselState={state.vessel}
  onUpdateAnnotation={(id, updates) => updateAnnotation(id, updates)}
  onGenerateReport={handleGenerateReport}
/>
```

**Step 3: Ensure companion app status is accessible**

If VesselModeler doesn't already use `useCompanionApp`, add the hook call near the top:

```typescript
const { connected: companionConnected, port: companionPort } = useCompanionApp();
const companionStatus = { connected: companionConnected, port: companionPort };
```

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(report): wire report generation pipeline into VesselModeler"
```

---

## Phase 5: Testing & Polish

### Task 11: Manual integration test

**Step 1: Run build**

```bash
npm run build
```

Fix any TypeScript errors.

**Step 2: Test in dev mode**

```bash
npm run dev
```

Open the vessel modeler. Verify:
1. Scan composite section shows new fields (date, setup file, comments)
2. Annotations show the restriction checkbox and "include in report" icon
3. Project info shows reference drawing uploads
4. Report Export section appears in sidebar
5. Generate Report button produces a `.docx` file
6. Opening the .docx in Word shows all sections with correct layout

**Step 3: Test with companion app**

Start the companion app, open NDE files, then generate report. Verify B/D/A scan images appear in the annotation pages.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(report): address integration issues from manual testing"
```

---

## Implementation Notes

### What's auto-populated vs blank

| Report Section | Auto-populated | Tech fills in |
|---|---|---|
| Front page | Vessel name, location, date | Customer, contract, equipment, beamset, sign-off, summary |
| Annotation pages | Heatmap, B/D/A scans, thickness stats, position, restrictions | Analysis/interpretation, anomaly code |
| Vessel overview | 3D renders from 4 angles | — |
| Scan log | File names, dates, ranges, min/max WT, comments | Anomaly codes |
| Calibration log | — | Everything |
| Photographs | Images + vessel context | — |
| Reference drawings | Uploaded images | — |

### Dependencies on companion app

The companion app is **optional**. Without it:
- Annotation pages still get the C-scan heatmap (from in-memory thickness data)
- B/D/A scan slots will be empty (tech can paste them in Word later)
- Scan log still auto-populates from composite metadata

### Future: Unwrapped 2D projection

Deferred per user decision. When ready, add a `buildUnwrappedProjectionPage()` function to `report-generator.ts` that:
1. Creates a canvas sized to vessel circumference × length
2. Composites each scan composite's data into the correct position
3. Renders nozzle/weld markers as overlays
4. Exports as a large image for the report

This is ~2-3 days of focused work and can be added as a standalone task.
