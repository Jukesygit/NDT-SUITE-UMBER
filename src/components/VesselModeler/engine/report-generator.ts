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

  BorderStyle,
  ImageRun,
  PageBreak,
  TableLayoutType,
  VerticalAlign,
} from 'docx';
import type {
  VesselState,
  AnnotationShapeConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Inspection page data for populating the report front page */
export interface InspectionReportData {
  // Front page header
  customerName?: string;
  reportNumber?: string;
  contractNumber?: string;
  workOrderNumber?: string;
  projectName?: string;
  // Component details
  description?: string;
  drawingNumber?: string;
  lineTagNumber?: string;
  nominalThickness?: string;
  material?: string;
  operatingTemperature?: string;
  stressRelief?: string;
  corrosionAllowance?: string;
  coatingType?: string;
  // Procedure
  procedureNumber?: string;
  techniqueNumbers?: string;
  acceptanceCriteria?: string;
  applicableStandard?: string;
  // Equipment
  equipmentModel?: string;
  serialNo?: string;
  probe?: string;
  wedge?: string;
  calibrationBlocks?: string;
  scannerFrame?: string;
  refBlocks?: string;
  couplant?: string;
  equipmentChecksRef?: string;
  beamsetConfig?: { group: string; type: string; active_elements: string; aperture: string; focal_depth: string; angle: string; skew: string; index_offset: string }[];
  // Results + sign-off
  resultsSummary?: string;
  signoff?: {
    technician?: { name?: string; qualification?: string; date?: string };
    reviewer?: { name?: string; qualification?: string; date?: string };
    client?: { name?: string; position?: string; date?: string };
  };
  // Scan log (enriched entries from DB)
  scanLogEntries?: { filename: string; dateInspected?: string; setupFileName?: string; scanStartX?: number; scanEndX?: number; indexStartY?: number; indexEndY?: number; scanIndexDatum?: string; coatingCorrection?: string; minWt?: number; comments?: string }[];
  // Calibration log (entries from DB)
  calibrationLogEntries?: { filename: string; setupFile?: string; calDate?: string; scanStart?: string; scanEnd?: string; refAWt?: number; measAWt?: number; velocity?: number; comments?: string }[];
}

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
  /** Optional inspection page data for populating front page fields */
  inspectionData?: InspectionReportData;
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

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [textRun(text, { bold: true, size: FONT_SIZE_HEADING })],
    spacing: { before: 300, after: 100 },
    shading: { fill: 'D9D9D9' },
  });
}

// ---------------------------------------------------------------------------
// Section Builders
// ---------------------------------------------------------------------------

function buildFrontPage(vessel: VesselState, config: ReportConfig): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const d = config.inspectionData; // shorthand, may be undefined

  // Title
  children.push(new Paragraph({
    children: [textRun('PHASED ARRAY ULTRASONIC', { bold: true, size: FONT_SIZE_TITLE })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 0 },
  }));
  children.push(new Paragraph({
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
        cellText('Customer:'), cellText(d?.customerName || ''),
        cellText('Location:'), cellText(vessel.location || ''),
        cellText('Report No:'), cellText(d?.reportNumber || ''),
      ]}),
      new TableRow({ children: [
        cellText('Project:'), cellText(d?.projectName || ''),
      ]}),
      new TableRow({ children: [
        cellText('Contract No:'), cellText(d?.contractNumber || ''),
        cellText('WO No:'), cellText(d?.workOrderNumber || ''),
        cellText('Test Date:'), cellText(vessel.inspectionDate || ''),
      ]}),
    ],
  });
  children.push(infoTable);

  // Component Details
  children.push(sectionHeading('Component Details & Procedure'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [cellText('Description'), cellText(d?.description || ''), cellText('Drawing Number'), cellText(d?.drawingNumber || '')] }),
      new TableRow({ children: [cellText('Line/Tag Number'), cellText(d?.lineTagNumber || vessel.vesselName || ''), cellText('Nominal Thickness'), cellText(d?.nominalThickness || '')] }),
      new TableRow({ children: [cellText('Material'), cellText(d?.material || ''), cellText('Temperature'), cellText(d?.operatingTemperature || '')] }),
      new TableRow({ children: [cellText('Stress Relief'), cellText(d?.stressRelief || ''), cellText('Coating Type'), cellText(d?.coatingType || '')] }),
      new TableRow({ children: [cellText('Procedure No'), cellText(d?.procedureNumber || ''), cellText('Technique Nos'), cellText(d?.techniqueNumbers || '')] }),
      new TableRow({ children: [cellText('Acceptance Criteria'), cellText(d?.acceptanceCriteria || ''), cellText('Applicable Standard'), cellText(d?.applicableStandard || '')] }),
    ],
  }));

  // Equipment
  children.push(sectionHeading('Equipment'));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [cellText('Equip. Model'), cellText(d?.equipmentModel || ''), cellText('Serial No'), cellText(d?.serialNo || '')] }),
      new TableRow({ children: [cellText('Probe'), cellText(d?.probe || ''), cellText('Wedge'), cellText(d?.wedge || '')] }),
      new TableRow({ children: [cellText('Calibration Blocks'), cellText(d?.calibrationBlocks || ''), cellText('Scanner Frame'), cellText(d?.scannerFrame || '')] }),
      new TableRow({ children: [cellText('Ref Blocks'), cellText(d?.refBlocks || ''), cellText('Couplant'), cellText(d?.couplant || '')] }),
    ],
  }));

  // Equipment checks note
  if (d?.equipmentChecksRef) {
    children.push(new Paragraph({
      children: [textRun(`Equipment Checks in accordance with ${d.equipmentChecksRef} Equipment Checks completed: ☑`, { size: FONT_SIZE_SMALL })],
      spacing: { before: 40, after: 40 },
    }));
  }

  // Beamset configuration
  children.push(sectionHeading('Phased Array Beamset Configuration'));
  const beamsetRows = d?.beamsetConfig?.length
    ? d.beamsetConfig.map(row =>
        new TableRow({ children: [
          cellText(row.group, { alignment: AlignmentType.CENTER }),
          cellText(row.type, { alignment: AlignmentType.CENTER }),
          cellText(row.active_elements, { alignment: AlignmentType.CENTER }),
          cellText(row.aperture, { alignment: AlignmentType.CENTER }),
          cellText(row.focal_depth, { alignment: AlignmentType.CENTER }),
          cellText(row.angle, { alignment: AlignmentType.CENTER }),
          cellText(row.skew, { alignment: AlignmentType.CENTER }),
          cellText(row.index_offset, { alignment: AlignmentType.CENTER }),
        ]}),
      )
    : Array.from({ length: 3 }, () =>
        new TableRow({ children: Array.from({ length: 8 }, () => emptyCell()) }),
      );

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [
        headerCell('Group'), headerCell('Type'), headerCell('Active Elements'),
        headerCell('Aperture'), headerCell('Focal Depth'), headerCell('Angle'),
        headerCell('Skew'), headerCell('Index Offset'),
      ]}),
      ...beamsetRows,
    ],
  }));

  // Inspection Results Summary
  children.push(sectionHeading('Inspection Results Summary'));
  if (d?.resultsSummary) {
    const lines = d.resultsSummary.split('\n');
    for (const line of lines) {
      children.push(new Paragraph({ children: [textRun(line)], spacing: { after: 40 } }));
    }
  } else {
    for (let i = 0; i < 8; i++) {
      children.push(new Paragraph({ children: [textRun(' ')] }));
    }
  }

  // Sign-off table
  const tech = d?.signoff?.technician;
  const rev = d?.signoff?.reviewer;
  const client = d?.signoff?.client;

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ children: [headerCell('Technician'), headerCell(''), headerCell('Reviewed'), headerCell(''), headerCell('Client Acceptance'), headerCell('')] }),
      new TableRow({ children: [cellText('Name:'), cellText(tech?.name || ''), cellText('Name:'), cellText(rev?.name || ''), cellText('Name:'), cellText(client?.name || '')] }),
      new TableRow({ children: [cellText('Qualification:'), cellText(tech?.qualification || ''), cellText('Qualification:'), cellText(rev?.qualification || ''), cellText('Position:'), cellText(client?.position || '')] }),
      new TableRow({ children: [cellText('Signature:'), emptyCell(), cellText('Signature:'), emptyCell(), cellText('Signature:'), emptyCell()] }),
      new TableRow({ children: [cellText('Date:'), cellText(tech?.date || ''), cellText('Date:'), cellText(rev?.date || ''), cellText('Date:'), cellText(client?.date || '')] }),
    ],
  }));

  return children;
}

function buildAnnotationPage(
  annotation: AnnotationShapeConfig,
  vessel: VesselState,
  config: ReportConfig,
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const stats = annotation.thicknessStats;
  const scanImages = config.companionScanImages.get(annotation.id);
  const heatmapUrl = config.heatmapImages.get(annotation.id);

  // Section header
  children.push(sectionHeading(`Inspection Results — ${annotation.name}`));

  // Position info (offset by global coordinate origin)
  const origin = vessel.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };
  const circumference = Math.PI * vessel.id;
  const scanMm = (annotation.angle / 360) * circumference - origin.scanMm;
  const indexMm = annotation.pos - origin.indexMm;
  children.push(new Paragraph({
    children: [
      textRun('Position: ', { bold: true }),
      textRun(`Index ${indexMm.toFixed(0)}mm, Scan ${scanMm.toFixed(0)}mm (${annotation.angle.toFixed(0)}°)`),
    ],
    spacing: { after: 40 },
  }));
  children.push(new Paragraph({
    children: [
      textRun('Size: ', { bold: true }),
      textRun(`${annotation.width.toFixed(0)} × ${annotation.height.toFixed(0)} mm`),
    ],
    spacing: { after: 100 },
  }));

  // Scan images grid (C-scan + B-scan + D-scan + A-scan)
  if (scanImages || heatmapUrl) {
    const imageRows: TableRow[] = [];

    // Row 1: C-scan (heatmap) and B-scan
    const row1Cells: TableCell[] = [];
    if (heatmapUrl) {
      const buffer = dataUrlToBuffer(heatmapUrl);
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
      const buffer = dataUrlToBuffer(scanImages.bscan);
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
      const buffer = dataUrlToBuffer(scanImages.dscan);
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
      const buffer = dataUrlToBuffer(scanImages.ascan);
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

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: imageRows,
    }));
  }

  // Thickness statistics table
  if (stats) {
    children.push(new Paragraph({
      children: [textRun('Thickness Statistics', { bold: true })],
      spacing: { before: 200, after: 80 },
    }));

    children.push(new Table({
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
    }));
  }

  // Analysis / Interpretation (blank for tech)
  children.push(new Paragraph({
    children: [textRun('Analysis / Interpretation:', { bold: true })],
    spacing: { before: 200, after: 80 },
  }));
  for (let i = 0; i < 5; i++) {
    children.push(new Paragraph({ children: [textRun(' ')], spacing: { after: 40 } }));
  }

  // Restrictions
  const restrictions = vessel.annotations.filter(a =>
    a.type === 'restriction' && a.restrictionNotes
  );
  if (restrictions.length > 0) {
    children.push(new Paragraph({
      children: [
        textRun('Restrictions: ', { bold: true }),
        textRun(restrictions.map(r => r.restrictionNotes).join('; ')),
      ],
      spacing: { before: 100 },
    }));
  }

  return children;
}

function buildVesselOverviewPage(config: ReportConfig): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(sectionHeading('Vessel Overview'));

  for (const overview of config.vesselOverviews) {
    const buffer = dataUrlToBuffer(overview.dataUrl);
    children.push(new Paragraph({
      children: [new ImageRun({
        data: buffer,
        transformation: { width: 560, height: 350 },
        type: 'png',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }));
    children.push(new Paragraph({
      children: [textRun(overview.label, { size: FONT_SIZE_SMALL })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));
  }

  return children;
}

function buildScanLogTable(vessel: VesselState, config: ReportConfig): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(sectionHeading('Phased Array C-Scan Mapping Log'));

  const scanLogEntries = config.inspectionData?.scanLogEntries;

  // Use enriched scan log entries from inspection page if available
  if (scanLogEntries && scanLogEntries.length > 0) {
    const headerRow = new TableRow({
      children: [
        headerCell('File Name'), headerCell('Date Inspected'), headerCell('Setup File'),
        headerCell('Scan Start(x)'), headerCell('Scan End(x)'), headerCell('Index Start(y)'), headerCell('Index End(y)'),
        headerCell('Scan/Index Datum'), headerCell('Coating Correction'), headerCell('Min WT'), headerCell('Comments'),
      ],
    });

    const dataRows = scanLogEntries.map(entry =>
      new TableRow({
        children: [
          cellText(entry.filename, { alignment: AlignmentType.LEFT }),
          cellText(entry.dateInspected || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.setupFileName || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.scanStartX?.toString() || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.scanEndX?.toString() || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.indexStartY?.toString() || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.indexEndY?.toString() || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.scanIndexDatum || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.coatingCorrection || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.minWt?.toFixed(1) || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.comments || '', { alignment: AlignmentType.LEFT }),
        ],
      }),
    );

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [headerRow, ...dataRows],
    }));
  } else {
    // Fallback: use scan composites directly (original behavior)
    const confirmed = vessel.scanComposites.filter(sc => sc.orientationConfirmed);
    if (confirmed.length === 0) {
      children.push(new Paragraph({ children: [textRun('No scan composites loaded.')] }));
      return children;
    }

    const headerRow = new TableRow({
      children: [
        headerCell('File Name'), headerCell('Scan Range'), headerCell('Index Range'),
        headerCell('Min WT'), headerCell('Avg WT'), headerCell('Anomaly Code'), headerCell('Comments'),
      ],
    });

    const dataRows = confirmed.map(sc => {
      const scanRange = sc.xAxis.length > 0
        ? `${Math.round(sc.xAxis[0])} – ${Math.round(sc.xAxis[sc.xAxis.length - 1])}`
        : 'N/A';
      const indexRange = sc.yAxis.length > 0
        ? `${Math.round(sc.yAxis[0])} – ${Math.round(sc.yAxis[sc.yAxis.length - 1])}`
        : 'N/A';

      return new TableRow({
        children: [
          cellText(sc.sourceNdeFile ?? sc.name, { alignment: AlignmentType.LEFT }),
          cellText(scanRange, { alignment: AlignmentType.CENTER }),
          cellText(indexRange, { alignment: AlignmentType.CENTER }),
          cellText(`${sc.stats.min.toFixed(2)}`, { alignment: AlignmentType.CENTER }),
          cellText(`${sc.stats.mean.toFixed(2)}`, { alignment: AlignmentType.CENTER }),
          emptyCell(),
          emptyCell(),
        ],
      });
    });

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [headerRow, ...dataRows],
    }));
  }

  children.push(new Paragraph({
    children: [textRun('All dimensions in mm. WT results include coating correction.', { size: FONT_SIZE_SMALL })],
    spacing: { before: 80 },
  }));

  return children;
}

function buildCalibrationLogTemplate(config: ReportConfig): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(sectionHeading('Phased Array Calibration Scan Log'));

  const calEntries = config.inspectionData?.calibrationLogEntries;

  const headerRow = new TableRow({ children: [
    headerCell('File Name'), headerCell('Setup File'), headerCell('Date'),
    headerCell('Scan Start'), headerCell('Scan End'), headerCell('Ref. A WT'),
    headerCell('Meas. A WT'), headerCell('Velocity'), headerCell('Comments'),
  ]});

  const dataRows = calEntries && calEntries.length > 0
    ? calEntries.map(entry =>
        new TableRow({ children: [
          cellText(entry.filename, { alignment: AlignmentType.LEFT }),
          cellText(entry.setupFile || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.calDate || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.scanStart || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.scanEnd || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.refAWt?.toFixed(2) || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.measAWt?.toFixed(2) || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.velocity?.toFixed(0) || '', { alignment: AlignmentType.CENTER }),
          cellText(entry.comments || '', { alignment: AlignmentType.LEFT }),
        ]}),
      )
    : Array.from({ length: 6 }, () =>
        new TableRow({ children: Array.from({ length: 9 }, () => emptyCell()) }),
      );

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
  }));

  children.push(new Paragraph({
    children: [textRun('All dimensions & measurements in mm. Calibration Block Velocity: _____ m/sec ±30m/sec.', { size: FONT_SIZE_SMALL })],
    spacing: { before: 80 },
  }));

  return children;
}

function buildPhotographsPage(
  vessel: VesselState,
  config: ReportConfig,
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  children.push(sectionHeading('Photographs'));

  const images = vessel.inspectionImages;
  if (images.length === 0) {
    children.push(new Paragraph({ children: [textRun('No inspection images attached.')] }));
    return children;
  }

  for (const img of images) {
    const contextUrl = config.annotationContextImages.get(img.id);
    const cells: TableCell[] = [];

    // Photo image
    const photoBuffer = dataUrlToBuffer(img.imageData);
    cells.push(new TableCell({
      children: [
        new Paragraph({
          children: [new ImageRun({ data: photoBuffer, transformation: { width: 260, height: 195 }, type: 'png' })],
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

    // Context image
    if (contextUrl) {
      const ctxBuffer = dataUrlToBuffer(contextUrl);
      cells.push(new TableCell({
        children: [
          new Paragraph({
            children: [new ImageRun({ data: ctxBuffer, transformation: { width: 260, height: 195 }, type: 'png' })],
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

    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ children: cells })],
    }));
  }

  return children;
}

function buildRestrictionsPage(vessel: VesselState): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const restrictions = vessel.annotations.filter(a => a.type === 'restriction');

  if (restrictions.length === 0) return children;

  children.push(sectionHeading('Scan Restrictions'));

  const origin = vessel.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };
  const circumference = Math.PI * vessel.id;

  for (const r of restrictions) {
    const scanMm = (r.angle / 360) * circumference - origin.scanMm;
    const indexMm = r.pos - origin.indexMm;

    // Name and position
    children.push(new Paragraph({
      children: [textRun(`\u26A0 ${r.name}`, { bold: true, size: FONT_SIZE_HEADING })],
      spacing: { before: 200, after: 40 },
    }));
    children.push(new Paragraph({
      children: [
        textRun('Position: ', { bold: true }),
        textRun(`Scan ${scanMm.toFixed(0)}mm, Index ${indexMm.toFixed(0)}mm`),
        textRun(`  |  Size: ${r.width.toFixed(0)} × ${r.height.toFixed(0)} mm`),
      ],
      spacing: { after: 40 },
    }));

    // Notes
    if (r.restrictionNotes) {
      children.push(new Paragraph({
        children: [textRun(r.restrictionNotes)],
        spacing: { after: 80 },
      }));
    }

    // Image
    if (r.restrictionImage) {
      const buffer = dataUrlToBuffer(r.restrictionImage);
      children.push(new Paragraph({
        children: [new ImageRun({
          data: buffer,
          transformation: { width: 400, height: 300 },
          type: 'png',
        })],
        spacing: { after: 200 },
      }));
    }
  }

  return children;
}

function buildReferenceDrawingsPages(vessel: VesselState): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  const drawings = vessel.referenceDrawings ?? [];

  if (drawings.length === 0) return children;

  for (const drawing of drawings) {
    children.push(sectionHeading(`Inspection Drawings — ${drawing.title}`));

    const buffer = dataUrlToBuffer(drawing.imageData);
    children.push(new Paragraph({
      children: [new ImageRun({
        data: buffer,
        transformation: { width: 560, height: 750 },
        type: 'png',
      })],
      alignment: AlignmentType.CENTER,
    }));

    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  return children;
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

  const sections: (Paragraph | Table)[] = [];

  // 1. Front page (populated from inspection data if available)
  sections.push(...buildFrontPage(vessel, config));
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 2. Per-annotation inspection results
  for (const ann of reportAnnotations) {
    sections.push(...buildAnnotationPage(ann, vessel, config));
    sections.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 3. Restrictions page
  const restrictionContent = buildRestrictionsPage(vessel);
  if (restrictionContent.length > 0) {
    sections.push(...restrictionContent);
    sections.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 4. Vessel overview images
  if (config.vesselOverviews.length > 0) {
    sections.push(...buildVesselOverviewPage(config));
    sections.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 4. Scan log table
  sections.push(...buildScanLogTable(vessel, config));
  sections.push(new Paragraph({ children: [new PageBreak()] }));

  // 5. Calibration log (populated from inspection data if available)
  sections.push(...buildCalibrationLogTemplate(config));
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
          margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
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
