---
tags:
  - plans/cscan
  - compositor
  - offset-repair
---

# C-Scan Compositor: BRT V-1001 MM-less Filename Arbitration Gap

**Date:** 2026-07-21
**Status:** Implemented (same day) — see "Implementation" section at the end

## Symptom

Compositing `C:\Users\jonas\Downloads\BRT V-1001 CSVs` (7 tab-delimited Evident
"C-Scan Thickness" `.txt` tiles, filenames like `0-500 0-1000.txt`) produces a
broken composite: scan-axis tiles scattered at 0–550 / 1000–1550 / 2000–3050 /
4000–5275 with dead gaps (true vessel is a contiguous 0–3225), and the top index
band either overlapping the bottom band (repair declined) or floating at
2001.5–2681.5 with a ~1300mm empty stripe (repair applied). True extent:
X 0–3275, Y 0–1680.

## Root Cause (proven by executing the real modules against the real files)

Same corrupted-export family as HP Sep NEV V-0201
(see [2026-06-11-cscan-offset-filename-arbitration.md](2026-06-11-cscan-offset-filename-arbitration.md)):
metadata `ScanStart` is **2× the true position** (500→1000, 1000→2000,
2000→4000) and `IndexStart` is 2×+1.5 (0→1.5, 1000→2001.5). The matrix
**column labels embed the same doubled absolute scan coords**; row labels are
local (span..0). Three compounding gaps:

1. **Filename rescue never engages.** The positional-token regex in
   `offsetExpectations.ts` (`/(\d+)\s*(?:MM)?\s*-\s*(\d+)\s*MM/gi`) requires a
   trailing `MM`. These filenames have none, so zero candidates parse and the
   corrupted metadata wins arbitration on both axes. This has been true since
   the arbitration was introduced (7f2048d, 2026-06-15) — never-worked case,
   not a regression.
2. **Scan axis is silently unfixable.** Doubled metadata exactly agrees with
   the doubled column labels, so `scanOffset = 0` on every file — no flag, no
   repair offered, and CsvRepairModal doesn't even render the "Fix Scan Axis"
   checkbox. Operator sees "3 files, Index only" and believes the scan axis is
   healthy.
3. **The "Prioritize filenames" toggle is a structural no-op here.** Pass 3
   only redistributes tokens that already parsed via the same MM-requiring
   regex; with zero tokens there is nothing to prefer (verified: detection
   output is byte-identical with the toggle on).

Meanwhile the true ranges sit unread in `metadata['Data File']`
(`BRT V-1001 500-1000MM 0-1000MM 1_…` — MM-suffixed, span-validates against
the data), which no code consults (grep: zero matches in src).

## Separate data-quality issue

`2000-3225 1000-1680.txt` is a **truncated export**: 391 of 681 rows (local
680 down to 290; physical 1290–1680 present, 1000–1290 absent) and the final
line is cut mid-row (496 of 1277 fields). It parses (missing cells → ND) but:
- its index span (390) fails span-validation against the nominal filename
  range (680), so even MM-suffixed naming falls back to metadata for that axis;
- repair anchors the shift to `actualIndexStart` (290), so any expected-start
  fix places the surviving rows 290mm too low. Correct placement needs either
  an anchor at local-zero or a filename naming the *surviving* range.

## Zero-code workaround (verified against the arbitration logic)

Rename to the MM convention, naming the truncated file for the data it
actually contains:

- `0-500 0-1000.txt` → `0-500MM 0-1000MM.txt` (same pattern for the 5 others)
- `2000-3225 1000-1680.txt` → `2000-3225MM 1290-1680MM.txt`

All ranges then span-validate, filename overrides doubled metadata on both
axes, and default repair places all 7 tiles correctly (composite X 0–3275,
Y 0–1680). Re-export the truncated file from the instrument regardless — 43%
of that tile's rows simply don't exist.

## Feasibility: positioning from overlap + metadata alone (tested 2026-07-21)

Question raised: could tiles be positioned without filenames, from overlap
registration + metadata? Tested empirically on the real dataset (full offset
sweeps, mean |thickness diff| over co-valid cells):

- **Metadata self-consistency inversion: works, sub-mm.** The doubled pattern
  is detectable from metadata alone: raw starts leave span-scale gaps
  (450–1000mm), halved starts (scan /2 → 0/500/1000/2000; index /2 →
  0.75/1000.75) produce a contiguous 0–3275 tiling with uniform 50mm strip
  overlaps. A "halving" repair candidate (source: `metadata/2`,
  operator-confirmed) would fix both axes — including the scan axis that can
  never be flagged today.
- **Overlap registration as primary placement: unreliable.** Results of the
  blind sweep: 3 of 5 same-band pairs hit the true offset within 1–2mm
  (score margins ×1.2–1.43); one pair found 494 vs nominal 500 (plausible
  real probe-placement offset — indistinguishable from error without ground
  truth); the pair involving the truncated file slid to 959 vs true 1000 with
  a nearly flat score surface (margin ×1.06) — a silent 41mm placement error.
  Band-to-band (index axis) is worse: the physical overlap is one all-ND edge
  row, so the true offset (dy=1000) has ZERO co-valid cells; the sweep's
  optimum (995, ×1.30) is structurally biased toward oversized overlap.
  Registration also only yields relative offsets — a global anchor still
  needs metadata/filename.
- **Registration as a verification layer: valuable.** At correct placements,
  overlap agreement is 0.06–0.10mm (vs 0.24–0.30mm at wrong offsets) — a
  cheap confidence score that would have flagged today's broken placements
  and can badge repaired ones as "confirmed by overlap data".

Recommended hierarchy: filename / `Data File` header (exact intent) →
metadata self-consistency inversion (halving) → overlap registration as
cross-check only, surfaced with per-pair confidence, never a silent
auto-shift (measurement-truth constraint).

## Proposed fix (not yet implemented)

1. Run `parseFilenameCandidates` over `metadata['Data File']` as a fallback
   (or union) source — it carries MM-suffixed true ranges in these exports and
   survives OS-level renames. Lowest risk; keeps span-validation gating.
2. Optionally relax the positional regex to bare `{a}-{b}` tokens, gated on
   span-validation (guards against false tokens like `V-1001`).
3. Surface a parse-time "file appears truncated (391/681 rows, final row cut
   mid-line)" warning; decide anchor semantics for truncated strips
   (expected-start ↔ local-zero rather than actual-min) before shifting them.
4. Keep the standing constraint: never shift without a validated,
   source-surfaced expected position.

## Implementation (2026-07-21)

Arbitration v2, per the hierarchy above. All layers are operator-confirmed
via CsvRepairModal; nothing shifts silently.

- **`utils/offsetExpectations.ts` (rewritten):** one token grammar for
  MM-suffixed and bare `{a}-{b}` ranges (bare requires `end > start`, so date
  fragments never parse; labelled `S-`/`I-` text is stripped before positional
  matching). New per-axis sources: `datafile` (same grammar over
  `metadata['Data File']`, never subject to the preferFilename override) and
  `metadata-halved`. New `ResolveOptions { extents, halvedAxes }` and per-axis
  anchors: `validateToken` tail-validates head-truncated local strips
  (token span ≈ data max while data min > tolerance) → `localZero` anchor, so
  offsets apply as `expected - 0` instead of `expected - actualMin`.
- **`utils/metadataHalving.ts` (new):** `detectHalvedMetadataPattern` — pure
  interval-union check: raw starts leave > 200mm of holes AND halved starts
  tile within 100mm. Batch-level; per-file guard `metaStart/2 > 10mm`.
- **`utils/fileParser.ts`:** `halvedAxesForScans` (batch mapper), extents +
  halving threaded through `detectOffsets`/`applyOffsetCorrection(s)`/
  `hasOffsetsToCorrect`; anchor-aware offset math; `_truncatedRows` metadata
  stamp when parsed rows < `Index Qty. (sample)`.
- **`workers/cscanProcessor.worker.ts`:** same truncation stamp; offset
  flagging moved to a post-batch pass (halving is a batch signal);
  `halvedAxesForParsedScans` mirrors the fileParser mapper.
- **`utils/overlapConfidence.ts` (new):** `checkOverlapAgreement` — scores
  mean |thickness diff| over co-valid cells in tile-overlap windows at the
  proposed placement. Verification only, never a placement source. Thresholds
  from the BRT experiment (confirm ≤ 0.15mm, min 500 points).
- **`CsvRepairModal.tsx` + `CsvRepairOverlapPanel.tsx` (new):** overlap
  cross-check section (live re-scored as axis checkboxes toggle), truncated-
  export warnings, Source column labels for the new sources.
- **`CscanVisualizer.tsx`:** load-complete message calls out truncated files
  on the no-repair paths.
- **`vitest.config.js`:** exclude `**/.claude/**` — stale agent worktrees
  were swept into the suite and failed it.

Verified: 3-scenario end-to-end against the real files (real names → filename
source; renamed → datafile; renamed+stripped → halving) all reassemble
X 0–3275, Y 0–1680, truncated tile correctly placed in ALL three (range
sources: Y 1290–1680; halving: Y 1290.75–1680.75). New unit tests: bare
tokens, datafile, halving, anchors, overlap verdicts, BRT batch regression.

### Adversarial review round (same day)

8-angle review; all confirmed findings reproduced as failing tests first,
then fixed:

- **Anchoring is now a property of the data, not the winning source.**
  `truncatedLocalAxis` (header sample count promises a nominal local span the
  label max still matches, label min > tolerance, data span short) drives the
  `localZero` anchor for whichever source wins — including metadata and
  halving. Fixes: metadata-agreeing tail-validated tokens losing the anchor;
  metadata/halving-sourced truncated strips min-anchored ~290mm low; and
  tail-validation false-positives on absolute-positioned data (the old
  token-span heuristic could relocate a healthy strip).
- **Corroboration veto:** a validated range AGREEING with raw metadata proves
  the position and vetoes batch halving for that file.
- **Bare-pair rule:** bare `{a}-{b}` tokens are only eligible when a bare
  range PAIR is present; plus decimal-number support so `1237.5-2037.5MM`
  parses as one token instead of a bogus fragment.
- **`Number` (not `parseFloat`) metadata coercion in both parsers** — a
  digit-leading `Data File = 0-800MM …` value was being stored as the number
  0, silently killing the datafile source for range-first export names.
- **Worker post-batch detection wrapped per-scan try/catch** so one
  undetectable file can't drop a whole parsed batch; all extents computation
  moved to loop-based `axisMath.axisExtents` (no spread RangeError, computed
  once per scan).
- **Structure:** token grammar extracted to `rangeTokens.ts`; shared
  `halvedAxesFromScans` (metadataHalving.ts), `offsetFromExpected`,
  `flagTruncatedRows` (offsetExpectations.ts) so fileParser and the worker
  are thin consistent adapters; `detectionShift` shared by the repair path
  and the modal's overlap preview; TopologyViewer (same worker pipeline) now
  surfaces truncation warnings too; modal warns when any placement rests on
  halving. Halving's residual false-positive class (disjoint layout whose
  gap coincidentally closes under halving) documented in metadataHalving.ts —
  mitigated by the corroboration veto, operator confirmation, and the
  overlap cross-check.

## Verification trail

- Executed the repo's real `detectOffsets` / `applyOffsetCorrections` (esbuild
  bundle, node) against the 7 real files: all axes resolve `source=metadata`;
  `preferFilename=true` output identical; post-repair extents X 0..5275,
  Y 0..2681.5 (both wrong).
- Adversarial verification workflow (3 agents): regexes executed in node
  against all 14 basename variants — zero matches; `Data File` unread;
  layout-mode/session-restore/SHIFT_SCAN_AXES confirmed as no automatic
  rescue; git history confirms never-worked.
- Orientation verified empirically (reverse-scan hypothesis refuted): tile
  overlap regions agree only in forward orientation. Scan axis:
  `1000-2000`↔`2000-3225` overlap r=+0.83 / mean|diff| 0.064mm as-is vs
  r=+0.24 mirrored, r=+0.08 control. Index axis: bottom row true-995 vs top
  band forward true-1005 r=+0.87 / 0.093mm vs r=−0.04 control. Metadata also
  fits `2×start` exactly, not `strip end` (2000-3225 → 4000 ≠ 3225). Data
  needs repositioning only — never flipping. Band-edge rows are all-ND
  (probe lift-off), and these exports use `---` as the ND marker (JS parser
  already nulls it via parseFloat→NaN).
