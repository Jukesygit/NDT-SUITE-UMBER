---
tags:
  - plans/cscan
  - compositor
  - offset-repair
---

# C-Scan Offset Repair: Filename vs Metadata Arbitration

**Date:** 2026-06-11
**Status:** Implemented

## Problem

Compositing the HP Sep NEV V-0201 dataset (22 strip files, 4 grids) produced
garbage: strips either stacked on top of each other (repair skipped) or were
flung to doubled positions — index strips at 2000/4000/6000/8000 instead of
1000/2000/3000/4000, and Grid 4 scan patches at 16320mm instead of 8160mm.

## Root Cause

These Evident/Olympus thickness exports (merged exports with two timestamps in
the filename) write the data matrix in **local coordinates** (rows 0..span) and
record **corrupted absolute starts in metadata**: `IndexStart (mm)` and
`ScanStart (mm)` are exactly 2x the true position (+4.5mm probe offset on the
index axis). The true strip position only exists in the filename
(`{scanStart}-{scanEnd}MM {indexStart}-{indexEnd}MM`).

Offset detection (`detectOffsets` in fileParser.ts, `hasOffsetIssues` in
cscanProcessor.worker.ts) preferred metadata over filename, and the filename
parser only understood the `S-a-b` / `I-a-b` convention — so repair shifted
strips to the doubled metadata positions.

## Fix

New shared module `src/components/CscanVisualizer/utils/offsetExpectations.ts`
(`resolveExpectedStarts`), used by both the main-thread parser and the worker:

- Parses both filename conventions: labelled `S-a-b`/`I-a-b` and positional
  `{a}-{b}MM` tokens (incl. `3000MM-4000MM` variants).
- Assigns positional tokens to axes by matching token span against the actual
  data span (`SPAN_TOLERANCE` = 100mm — operators name ranges nominally, e.g.
  `8160-8990MM` for an 800mm-wide scan); ambiguous tokens fall back to order
  convention (scan range first, index range second).
- **A span-validated filename range overrides metadata that disagrees with it**
  (> `OFFSET_TOLERANCE` = 10mm). Metadata still wins when they agree or when
  the filename can't be validated.
- `OffsetDetection` gained `indexSource`/`scanSource`; CsvRepairModal shows the
  source column and now defaults "Fix Scan Axis" to checked.

## Verification

- 13 unit tests in `utils/__tests__/offsetExpectations.test.ts`.
- End-to-end against the real 22-file dataset (temporary script, removed):
  every strip placed at its filename position; Grid 1 composite spans a
  contiguous 0-4901mm with empty rows only where source data is all-ND.
- Full suite passes (pre-existing vitest fork OOM flake unrelated); tsc and
  production build clean.

## Constraint To Remember

Scan repair must preserve measurement truth: never resample or shift data
without a validated expected position, and always surface which source
(filename/metadata) supplied it.
