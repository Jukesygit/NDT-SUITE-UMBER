/**
 * Shared resolution of "expected" axis start positions for offset detection.
 *
 * Scanner exports often store the data matrix in local coordinates (rows
 * labelled 0..span) while the true strip position lives in the metadata
 * header and/or the filename. Some instruments write corrupted metadata
 * (e.g. starts doubled on merged exports), so range sources are arbitrated:
 * a range whose span matches the actual data span is treated as more
 * trustworthy than metadata that disagrees with it.
 *
 * Range sources, in precedence order per axis:
 *  1. filename — token grammar in rangeTokens.ts; span-validated tokens
 *     override disagreeing metadata.
 *  2. datafile — the same grammar applied to the export's internal
 *     `Data File =` header line, which carries the true MM-suffixed ranges
 *     even when the on-disk filename was renamed or lacks the MM suffix.
 *  3. metadata-halved — batch-level detection (metadataHalving.ts) flagged
 *     this axis as doubled; expected start is metadata/2. Vetoed when a
 *     validated range CORROBORATES the raw metadata (two independent
 *     agreeing sources prove the position).
 *  4. metadata — the raw header value.
 *
 * Anchoring is a property of the DATA, not of the winning source: when an
 * axis carries the head-truncation signature (`truncatedLocalAxis` — the
 * header promises more samples than the data holds, labels still top out at
 * the nominal local span, and the label minimum sits above zero), the
 * expected start describes local zero (`localZero`), so surviving rows keep
 * their true positions no matter which source supplied the start. All other
 * axes anchor at the data minimum (`dataMin`).
 *
 * Used by both the main-thread fileParser and the cscanProcessor worker so
 * detection and repair stay consistent.
 */

import {
  parseCandidates,
  AxisFacts,
  AxisCandidate,
  OFFSET_TOLERANCE,
  SPAN_TOLERANCE,
  ExpectedStartAnchor,
} from './rangeTokens';
import type { HalvedAxes } from './metadataHalving';

export { OFFSET_TOLERANCE, SPAN_TOLERANCE } from './rangeTokens';
export type { ExpectedStartAnchor } from './rangeTokens';

export type ExpectedStartSource = 'metadata' | 'filename' | 'datafile' | 'metadata-halved';

export interface AxisExtents {
  scanMin: number;
  scanMax: number;
  indexMin: number;
  indexMax: number;
}

export interface ResolveOptions {
  /** Actual axis extents; enables truncation-aware (localZero) anchoring */
  extents?: AxisExtents;
  /** Batch-level doubled-metadata detection result (metadataHalving.ts) */
  halvedAxes?: HalvedAxes;
}

export interface ExpectedStarts {
  indexStart: number | null;
  scanStart: number | null;
  indexSource: ExpectedStartSource | null;
  scanSource: ExpectedStartSource | null;
  indexAnchor: ExpectedStartAnchor;
  scanAnchor: ExpectedStartAnchor;
}

export const numericOrNull = (value: unknown): number | null =>
  typeof value === 'number' && isFinite(value) ? value : null;

/**
 * Head-truncation signature for one axis, corroborated by metadata: the
 * header sample count promises a nominal local span the label maximum still
 * matches, while the label minimum sits above zero and the data span falls
 * short. Absolute-positioned data cannot satisfy this (its max reflects the
 * absolute position, not the nominal span), so tail validation gated on this
 * never relocates a healthy strip.
 */
const truncatedLocalAxis = (
  qty: number | null,
  resol: number | null,
  min: number | null,
  max: number | null
): boolean => {
  if (qty === null || min === null || max === null) return false;
  const nominalSpan = (qty - 1) * (resol ?? 1);
  if (nominalSpan <= 0) return false;
  return (
    min > OFFSET_TOLERANCE &&
    Math.abs(max - nominalSpan) <= SPAN_TOLERANCE &&
    max - min < nominalSpan - OFFSET_TOLERANCE
  );
};

/**
 * Flag truncated exports on parse: the header promises more rows than the
 * file holds (seen on interrupted instrument exports/copies — BRT V-1001
 * 2026-07). Shared by the main-thread parser and the worker.
 */
export const flagTruncatedRows = (metadata: Record<string, unknown>, rowCount: number): void => {
  const expected = metadata['Index Qty. (sample)'];
  if (typeof expected === 'number' && isFinite(expected) && rowCount < expected) {
    metadata._truncatedRows = { expected, actual: rowCount };
  }
};

/**
 * Offset that moves a scan's axis values to the expected position, honoring
 * the anchor. Shared by fileParser.detectOffsets and the worker's
 * hasOffsetIssues so the modal's repairs and the worker's gate agree.
 */
export const offsetFromExpected = (
  expected: number | null,
  anchor: ExpectedStartAnchor,
  actualMin: number
): number => (expected === null ? 0 : expected - (anchor === 'localZero' ? 0 : actualMin));

interface AxisResolution {
  value: number | null;
  source: ExpectedStartSource | null;
  anchor: ExpectedStartAnchor;
}

const resolveAxis = (
  metadataStart: number | null,
  fileCandidate: AxisCandidate | null,
  dataFileCandidate: AxisCandidate | null,
  axisHalved: boolean,
  preferFilename: boolean,
  anchor: ExpectedStartAnchor
): AxisResolution => {
  // Operator override: a parseable filename range drives placement regardless
  // of span-validation or metadata agreement. Metadata still fills axes the
  // filename has no range for (the fallbacks below).
  if (preferFilename && fileCandidate !== null) {
    return { value: fileCandidate.start, source: 'filename', anchor };
  }

  // Only halve when it moves the start by more than the offset tolerance —
  // sub-tolerance starts (e.g. a 1.5mm probe offset) are not doubled values.
  const halvedValue =
    axisHalved && metadataStart !== null && metadataStart / 2 > OFFSET_TOLERANCE
      ? metadataStart / 2
      : null;

  if (metadataStart !== null) {
    // A span-validated range overrides metadata that disagrees with it —
    // instruments are known to write corrupted absolute starts, while a
    // range whose span matches the data demonstrably describes this strip.
    if (
      fileCandidate?.validated &&
      Math.abs(metadataStart - fileCandidate.start) > OFFSET_TOLERANCE
    ) {
      return { value: fileCandidate.start, source: 'filename', anchor };
    }
    if (
      dataFileCandidate?.validated &&
      Math.abs(metadataStart - dataFileCandidate.start) > OFFSET_TOLERANCE
    ) {
      return { value: dataFileCandidate.start, source: 'datafile', anchor };
    }
    // A validated range AGREEING with metadata corroborates it — two
    // independent sources prove the position, which vetoes the batch-level
    // halving heuristic for this file.
    const corroborated =
      (fileCandidate?.validated === true &&
        Math.abs(metadataStart - fileCandidate.start) <= OFFSET_TOLERANCE) ||
      (dataFileCandidate?.validated === true &&
        Math.abs(metadataStart - dataFileCandidate.start) <= OFFSET_TOLERANCE);
    if (halvedValue !== null && !corroborated) {
      return { value: halvedValue, source: 'metadata-halved', anchor };
    }
    return { value: metadataStart, source: 'metadata', anchor };
  }

  if (fileCandidate !== null) {
    return { value: fileCandidate.start, source: 'filename', anchor };
  }
  if (dataFileCandidate !== null) {
    return { value: dataFileCandidate.start, source: 'datafile', anchor };
  }
  return { value: null, source: null, anchor };
};

export const resolveExpectedStarts = (
  filename: string,
  metadata: Record<string, unknown> | undefined,
  xSpan: number,
  ySpan: number,
  preferFilename = false,
  options?: ResolveOptions
): ExpectedStarts => {
  const metaIndex = numericOrNull(metadata?.['IndexStart (mm)']);
  const metaScan = numericOrNull(metadata?.['ScanStart (mm)']);
  const ext = options?.extents;

  const scanTruncatedLocal = truncatedLocalAxis(
    numericOrNull(metadata?.['Scan Qty.(sample)']),
    numericOrNull(metadata?.['Scan Resol. (mm)']),
    ext?.scanMin ?? null,
    ext?.scanMax ?? null
  );
  const indexTruncatedLocal = truncatedLocalAxis(
    numericOrNull(metadata?.['Index Qty. (sample)']),
    numericOrNull(metadata?.['Index Resol. (mm)']),
    ext?.indexMin ?? null,
    ext?.indexMax ?? null
  );

  const scanAxis: AxisFacts = {
    span: xSpan,
    max: ext?.scanMax ?? null,
    truncatedLocal: scanTruncatedLocal,
  };
  const indexAxis: AxisFacts = {
    span: ySpan,
    max: ext?.indexMax ?? null,
    truncatedLocal: indexTruncatedLocal,
  };

  const fromFilename = parseCandidates(filename, scanAxis, indexAxis, preferFilename);

  // The export's internal "Data File" header carries the true MM-suffixed
  // ranges even when the on-disk name was renamed or lacks the MM suffix.
  // Never subject to the preferFilename override — that names the filename.
  const dataFileText = metadata?.['Data File'];
  const fromDataFile =
    typeof dataFileText === 'string' && dataFileText.length > 0
      ? parseCandidates(dataFileText, scanAxis, indexAxis, false)
      : { scan: null, index: null };

  const index = resolveAxis(
    metaIndex,
    fromFilename.index,
    fromDataFile.index,
    options?.halvedAxes?.index ?? false,
    preferFilename,
    indexTruncatedLocal ? 'localZero' : 'dataMin'
  );
  const scan = resolveAxis(
    metaScan,
    fromFilename.scan,
    fromDataFile.scan,
    options?.halvedAxes?.scan ?? false,
    preferFilename,
    scanTruncatedLocal ? 'localZero' : 'dataMin'
  );

  return {
    indexStart: index.value,
    scanStart: scan.value,
    indexSource: index.source,
    scanSource: scan.source,
    indexAnchor: index.anchor,
    scanAnchor: scan.anchor,
  };
};
