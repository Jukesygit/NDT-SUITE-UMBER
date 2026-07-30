/**
 * Range-token grammar shared by offset arbitration sources (the OS filename
 * and the export's internal `Data File =` header line).
 *
 * Grammar: labelled `S-{a}-{b}` / `I-{a}-{b}` ranges, positional MM-suffixed
 * `{a}-{b}MM` / `{a}MM-{b}MM` tokens, and bare `{a}-{b}` tokens. Bare tokens
 * are the loosest form, so they carry two structural guards:
 *   - end > start (date fragments like "2026-07" never become ranges), and
 *   - a bare range PAIR must be present ("{a}-{b} {c}-{d}" convention) —
 *     a lone bare token (e.g. a "07-21" date next to an MM range) is ignored.
 * Numbers may be decimal ("1237.5-2037.5MM").
 */

// Tolerance for detecting offset mismatch (in mm)
export const OFFSET_TOLERANCE = 10;

// Tolerance for matching a range's span against the actual data span (in
// mm). Deliberately looser than OFFSET_TOLERANCE: operators name files with
// nominal ranges (e.g. "8160-8990MM" for an 800mm-wide scan), so the span
// only needs to identify which axis a range describes — adjacent axis spans
// differ by far more than this.
export const SPAN_TOLERANCE = 100;

export type ExpectedStartAnchor = 'dataMin' | 'localZero';

export interface RangeToken {
  start: number;
  end: number;
  /** Token had no MM suffix on either number */
  bare: boolean;
}

/**
 * Facts about one data axis, used to validate tokens against it.
 * `truncatedLocal` is the metadata-corroborated head-truncation signature
 * (see offsetExpectations.ts) — it gates tail validation so tokens can never
 * tail-match absolute-positioned data.
 */
export interface AxisFacts {
  span: number;
  max: number | null;
  truncatedLocal: boolean;
}

export interface AxisCandidate {
  start: number;
  /** True when the token's span matches the actual data (span or local tail) */
  validated: boolean;
}

/**
 * Validate a token against one axis. Normal validation matches the token's
 * span against the data span. Tail validation covers head-truncated local
 * exports (labels still reach the nominal span but leading rows are
 * missing): the token's span matches the data max instead. It only applies
 * when the axis carries the metadata-corroborated truncation signature.
 */
export const validateToken = (token: RangeToken, axis: AxisFacts): boolean => {
  const tokenSpan = Math.abs(token.end - token.start);
  if (Math.abs(tokenSpan - axis.span) <= SPAN_TOLERANCE) return true;
  return (
    axis.truncatedLocal &&
    axis.max !== null &&
    Math.abs(tokenSpan - axis.max) <= SPAN_TOLERANCE
  );
};

/**
 * Extract `{a}-{b}` range tokens. MM-suffixed tokens are accepted as-is;
 * bare tokens require end > start AND at least one other bare token (the
 * bare-pair rule) so date/serial fragments never become ranges.
 */
export const collectTokens = (text: string): RangeToken[] => {
  // Labelled S-/I- ranges are handled separately — remove them so their
  // digits are not re-read as positional tokens.
  const positional = text.replace(/[SI]-\d+(?:\.\d+)?-\d+(?:\.\d+)?/gi, ' ');
  const tokens: RangeToken[] = [];
  for (const match of positional.matchAll(
    /(\d+(?:\.\d+)?)\s*(MM)?\s*-\s*(\d+(?:\.\d+)?)\s*(MM)?/gi
  )) {
    const start = parseFloat(match[1]);
    const end = parseFloat(match[3]);
    const bare = !match[2] && !match[4];
    if (bare && end <= start) continue;
    tokens.push({ start, end, bare });
  }
  const bareCount = tokens.filter(t => t.bare).length;
  return bareCount >= 2 ? tokens : tokens.filter(t => !t.bare);
};

/**
 * Extract axis range candidates from a filename-like text. Tokens are
 * assigned to axes by validating each token's span against the actual data;
 * ambiguous tokens fall back to the conventional order of scan range first,
 * index range second.
 *
 * When `preferSource` is set (operator placement override), a final pass
 * assigns any still-unassigned tokens to empty axis slots in conventional
 * order even when their span does not match, marked `validated: false`.
 */
export const parseCandidates = (
  text: string,
  scanAxis: AxisFacts,
  indexAxis: AxisFacts,
  preferSource = false
): { scan: AxisCandidate | null; index: AxisCandidate | null } => {
  // Labelled convention takes priority when present
  const scanLabelled = text.match(/S-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/i);
  const indexLabelled = text.match(/I-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/i);

  const labelledCandidate = (
    m: RegExpMatchArray | null,
    axis: AxisFacts
  ): AxisCandidate | null => {
    if (!m) return null;
    const token: RangeToken = { start: parseFloat(m[1]), end: parseFloat(m[2]), bare: false };
    return { start: token.start, validated: validateToken(token, axis) };
  };

  let scan = labelledCandidate(scanLabelled, scanAxis);
  let index = labelledCandidate(indexLabelled, indexAxis);
  if (scan && index) return { scan, index };

  // Validate each positional token once against both axes
  const pool = collectTokens(text).map(token => ({
    token,
    fitsScan: validateToken(token, scanAxis),
    fitsIndex: validateToken(token, indexAxis),
  }));
  const unassigned = [...pool];
  const consume = (entry: (typeof pool)[number]) => {
    const at = unassigned.indexOf(entry);
    if (at >= 0) unassigned.splice(at, 1);
  };

  // Pass 1: tokens that validate against exactly one axis
  for (let i = unassigned.length - 1; i >= 0; i--) {
    const entry = unassigned[i];
    if (entry.fitsScan && !entry.fitsIndex && !scan) {
      scan = { start: entry.token.start, validated: true };
      unassigned.splice(i, 1);
    } else if (entry.fitsIndex && !entry.fitsScan && !index) {
      index = { start: entry.token.start, validated: true };
      unassigned.splice(i, 1);
    }
  }

  // Pass 2: ambiguous tokens (validating on both axes) by order convention —
  // scan range appears before index range. Only assign when unambiguous:
  // a single leftover token with both slots open is skipped.
  const ambiguous = unassigned.filter(entry => entry.fitsScan && entry.fitsIndex);
  if (ambiguous.length >= 2 && !scan && !index) {
    scan = { start: ambiguous[0].token.start, validated: true };
    index = { start: ambiguous[1].token.start, validated: true };
    consume(ambiguous[0]);
    consume(ambiguous[1]);
  } else if (ambiguous.length >= 1) {
    if (!scan && index) {
      scan = { start: ambiguous[0].token.start, validated: true };
      consume(ambiguous[0]);
    } else if (!index && scan) {
      index = { start: ambiguous[0].token.start, validated: true };
      consume(ambiguous[0]);
    }
  }

  // Pass 3 (operator override): the source text is authoritative, so fill
  // any still-empty axis from the remaining tokens in conventional order
  // even when the span does not match.
  if (preferSource) {
    for (const entry of [...unassigned]) {
      if (!scan) scan = { start: entry.token.start, validated: entry.fitsScan };
      else if (!index) index = { start: entry.token.start, validated: entry.fitsIndex };
      else break;
    }
  }

  return { scan, index };
};
