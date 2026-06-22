---
tags:
  - plans/cscan
  - compositor
  - offset-repair
---

# C-Scan Repair: "Prioritize Filenames" Placement Toggle

**Date:** 2026-06-19
**Status:** Implemented

## Problem

The offset-repair arbitration (`resolveExpectedStarts` /
[`offsetExpectations.ts`](../../src/components/CscanVisualizer/utils/offsetExpectations.ts))
defaults to **metadata** for an axis's expected start, and only lets the
filename override when its range span matches the actual data span
(span-validated) *and* it disagrees with metadata by more than
`OFFSET_TOLERANCE` (10mm). See
[2026-06-11-cscan-offset-filename-arbitration.md](2026-06-11-cscan-offset-filename-arbitration.md).

That default is correct for most exports, but operators hit cases where the
filename carries the true strip position yet the range is *not* span-validated
(e.g. a nominal/loosely-typed range whose span lands outside `SPAN_TOLERANCE`,
or metadata that is wrong but not in the recognizable doubled pattern). In
those cases metadata wins and strips are placed at the wrong position with no
way to say "trust the filenames."

## Goal

Give the operator an explicit override **on the repair screen**
(`CsvRepairModal`): a **"Prioritize filenames for placement"** toggle that, when
on, uses a parseable filename range as the expected start for that axis
regardless of span-validation or metadata agreement.

## Design

### Arbitration (core)

`resolveExpectedStarts` and its helper `resolveAxis` gain an optional
`preferFilename` parameter (default `false`). New first branch in `resolveAxis`:

```ts
// Operator override: a parseable filename range drives placement regardless
// of span-validation or metadata agreement. Metadata still fills axes the
// filename has no range for.
if (preferFilename && candidate !== null) {
  return { value: candidate.start, source: 'filename' };
}
```

All existing logic below it is unchanged. Because the flag defaults `false`,
the default arbitration, the worker's `hasOffsetIssues`, and all 13 existing
resolver tests are unaffected.

Semantics when `preferFilename` is on:
- Filename range present for an axis → that range's start is used, `source: 'filename'`.
- Filename has **no** range for an axis → metadata fills it (unchanged fallback).
- Neither → `null` (unchanged).

### Threading

`preferFilename` is added as a trailing optional param (default `false`) to:
`detectOffsets`, `detectOffsetsForScans`, `applyOffsetCorrection`,
`applyOffsetCorrections` in
[`fileParser.ts`](../../src/components/CscanVisualizer/utils/fileParser.ts).
Each forwards it into `resolveExpectedStarts`. All call sites that omit it keep
today's behavior, so the **worker is left unchanged** — its parse-time
`hasOffsetIssues` heuristic (which decides whether the repair prompt is
surfaced) continues to use default arbitration.

### Modal UI

In [`CsvRepairModal.tsx`](../../src/components/CscanVisualizer/CsvRepairModal.tsx):
- New `preferFilename` state, default **off**, resets when the modal unmounts
  (no persistence — YAGNI).
- A toggle row above the two axis checkboxes: **"Prioritize filenames for
  placement."**
- The detection `useMemo` adds `preferFilename` to its deps and passes it to
  `detectOffsetsForScans`; `handleRepair` passes it to `applyOffsetCorrections`.
  Flipping the toggle live re-runs detection, so the file list, offsets, and the
  existing **Source** column update immediately. Turning it on can surface files
  that metadata-priority detection treated as fine.
- When the toggle is on, an amber inline note: *"Filenames are trusted for
  placement, including ranges whose span doesn't match the scan data. Verify the
  resulting positions."* The per-row Source column already shows
  `filename`/`metadata`, so the operator can see what drove each placement.

## Constraint To Remember

Scan repair must preserve measurement truth. This toggle can shift data using an
**unvalidated** expected position, which the default path deliberately avoids —
so it defaults off, is operator-initiated, and surfaces the warning plus the
per-row source. It never resamples data; it only changes which expected start
the existing offset shift targets.

## Verification

- New `resolveExpectedStarts` unit cases for `preferFilename` (unvalidated
  filename wins; filename-agrees-with-metadata still resolves to `filename`;
  no-filename falls back to metadata; flag-off unchanged).
- `npm run test`, `npm run typecheck`, `npm run build` clean.
