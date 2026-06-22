/**
 * Shared resolution of "expected" axis start positions for offset detection.
 *
 * Scanner exports often store the data matrix in local coordinates (rows
 * labelled 0..span) while the true strip position lives in the metadata
 * header and/or the filename. Some instruments write corrupted metadata
 * (e.g. IndexStart doubled on merged exports), so a filename range whose
 * span matches the actual data span is treated as more trustworthy than
 * metadata that disagrees with it.
 *
 * Used by both the main-thread fileParser and the cscanProcessor worker so
 * detection and repair stay consistent.
 */

// Tolerance for detecting offset mismatch (in mm)
export const OFFSET_TOLERANCE = 10;

// Tolerance for matching a filename range's span against the actual data
// span (in mm). Deliberately looser than OFFSET_TOLERANCE: operators name
// files with nominal ranges (e.g. "8160-8990MM" for an 800mm-wide scan), so
// the span only needs to identify which axis a range describes — adjacent
// axis spans differ by far more than this.
export const SPAN_TOLERANCE = 100;

export type ExpectedStartSource = 'metadata' | 'filename';

export interface ExpectedStarts {
  indexStart: number | null;
  scanStart: number | null;
  indexSource: ExpectedStartSource | null;
  scanSource: ExpectedStartSource | null;
}

interface RangeToken {
  start: number;
  end: number;
}

interface AxisCandidate {
  start: number;
  /** True when the token's span matches the actual data span */
  validated: boolean;
}

const spanMatches = (token: RangeToken, dataSpan: number): boolean =>
  Math.abs(Math.abs(token.end - token.start) - dataSpan) <= SPAN_TOLERANCE;

/**
 * Extract axis range candidates from a filename.
 *
 * Supports two conventions:
 * - Labelled: `S-{start}-{end}` (scan axis) and `I-{start}-{end}` (index axis)
 * - Positional: `{start}-{end}MM` tokens (e.g. "0-800MM 1000-2000MM",
 *   "3000MM-4000MM"), assigned to axes by matching each token's span
 *   against the actual data spans; ambiguous tokens fall back to the
 *   conventional order of scan range first, index range second.
 *
 * When `preferFilename` is set (operator placement override), a final pass
 * assigns any still-unassigned positional tokens to empty axis slots in
 * conventional order even when their span does not match the data — so the
 * filename can drive placement for loosely-named ranges. Such candidates are
 * marked `validated: false`, which `resolveAxis` honors only under the override.
 */
const parseFilenameCandidates = (
  filename: string,
  xSpan: number,
  ySpan: number,
  preferFilename = false
): { scan: AxisCandidate | null; index: AxisCandidate | null } => {
  // Labelled convention takes priority when present
  const indexLabelled = filename.match(/I-(\d+)-(\d+)/i);
  const scanLabelled = filename.match(/S-(\d+)-(\d+)/i);

  let scan: AxisCandidate | null = scanLabelled
    ? {
        start: parseInt(scanLabelled[1], 10),
        validated: spanMatches(
          { start: parseInt(scanLabelled[1], 10), end: parseInt(scanLabelled[2], 10) },
          xSpan
        ),
      }
    : null;
  let index: AxisCandidate | null = indexLabelled
    ? {
        start: parseInt(indexLabelled[1], 10),
        validated: spanMatches(
          { start: parseInt(indexLabelled[1], 10), end: parseInt(indexLabelled[2], 10) },
          ySpan
        ),
      }
    : null;

  if (scan && index) return { scan, index };

  // Positional "{start}-{end}MM" convention
  const tokens: RangeToken[] = [];
  for (const match of filename.matchAll(/(\d+)\s*(?:MM)?\s*-\s*(\d+)\s*MM/gi)) {
    tokens.push({ start: parseInt(match[1], 10), end: parseInt(match[2], 10) });
  }

  const unassigned = [...tokens];

  // Pass 1: tokens that match exactly one axis span
  for (let i = unassigned.length - 1; i >= 0; i--) {
    const token = unassigned[i];
    const fitsX = spanMatches(token, xSpan);
    const fitsY = spanMatches(token, ySpan);
    if (fitsX && !fitsY && !scan) {
      scan = { start: token.start, validated: true };
      unassigned.splice(i, 1);
    } else if (fitsY && !fitsX && !index) {
      index = { start: token.start, validated: true };
      unassigned.splice(i, 1);
    }
  }

  // Pass 2: ambiguous tokens (matching both spans) by order convention —
  // scan range appears before index range. Only assign when unambiguous:
  // a single leftover token with both slots open is skipped.
  const ambiguous = unassigned.filter(
    token => spanMatches(token, xSpan) && spanMatches(token, ySpan)
  );
  const consume = (token: RangeToken) => {
    const at = unassigned.indexOf(token);
    if (at >= 0) unassigned.splice(at, 1);
  };
  if (ambiguous.length >= 2 && !scan && !index) {
    scan = { start: ambiguous[0].start, validated: true };
    index = { start: ambiguous[1].start, validated: true };
    consume(ambiguous[0]);
    consume(ambiguous[1]);
  } else if (ambiguous.length >= 1) {
    if (!scan && index) {
      scan = { start: ambiguous[0].start, validated: true };
      consume(ambiguous[0]);
    } else if (!index && scan) {
      index = { start: ambiguous[0].start, validated: true };
      consume(ambiguous[0]);
    }
  }

  // Pass 3 (operator override): the filename is authoritative, so fill any
  // still-empty axis from the remaining tokens in conventional order even when
  // the span does not match. Candidates are flagged validated/unvalidated so
  // callers can surface which placements rest on an unmatched span.
  if (preferFilename) {
    for (const token of [...unassigned]) {
      if (!scan) scan = { start: token.start, validated: spanMatches(token, xSpan) };
      else if (!index) index = { start: token.start, validated: spanMatches(token, ySpan) };
      else break;
    }
  }

  return { scan, index };
};

const resolveAxis = (
  metadataStart: number | null,
  candidate: AxisCandidate | null,
  preferFilename: boolean
): { value: number | null; source: ExpectedStartSource | null } => {
  // Operator override: a parseable filename range drives placement regardless
  // of span-validation or metadata agreement. Metadata still fills axes the
  // filename has no range for (the fallbacks below).
  if (preferFilename && candidate !== null) {
    return { value: candidate.start, source: 'filename' };
  }
  // A span-validated filename range overrides metadata that disagrees with
  // it — instruments are known to write corrupted absolute starts, while a
  // range whose span matches the data demonstrably describes this strip.
  if (
    metadataStart !== null &&
    candidate !== null &&
    candidate.validated &&
    Math.abs(metadataStart - candidate.start) > OFFSET_TOLERANCE
  ) {
    return { value: candidate.start, source: 'filename' };
  }
  if (metadataStart !== null) return { value: metadataStart, source: 'metadata' };
  if (candidate !== null) return { value: candidate.start, source: 'filename' };
  return { value: null, source: null };
};

const numericOrNull = (value: unknown): number | null =>
  typeof value === 'number' && isFinite(value) ? value : null;

export const resolveExpectedStarts = (
  filename: string,
  metadata: Record<string, unknown> | undefined,
  xSpan: number,
  ySpan: number,
  preferFilename = false
): ExpectedStarts => {
  const metaIndex = numericOrNull(metadata?.['IndexStart (mm)']);
  const metaScan = numericOrNull(metadata?.['ScanStart (mm)']);

  const candidates = parseFilenameCandidates(filename, xSpan, ySpan, preferFilename);

  const index = resolveAxis(metaIndex, candidates.index, preferFilename);
  const scan = resolveAxis(metaScan, candidates.scan, preferFilename);

  return {
    indexStart: index.value,
    scanStart: scan.value,
    indexSource: index.source,
    scanSource: scan.source,
  };
};
