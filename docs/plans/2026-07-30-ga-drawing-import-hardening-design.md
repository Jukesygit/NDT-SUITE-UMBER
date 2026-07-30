# GA Drawing Import Hardening — Design

**Date:** 2026-07-30
**Status:** Approved (chat, 2026-07-30)
**Owner:** Vessel Modeler / GA import flow

## Problem

The GA→3D import (`DrawingImportModal` → `engine/drawing-parser.ts` → Gemini → `handleDrawingApply`) works but cannot be relied on:

1. Single unverified VLM pass: free-text prompt, JSON scraped by regex, no `responseSchema`, no temperature/seed → maximal run-to-run variance.
2. `validateExtractionResult` silently substitutes hardcoded defaults (ID→1000, length→3000, size→50, pos→0) for any missing/invalid field — fabricated dimensions are indistinguishable from read ones. Worst possible failure mode for an inspection tool.
3. Result review is read-only — no per-field editing, no confidence, no indication of what was read vs. invented.
4. Apply path replaces `vessel.nozzles` wholesale, silently breaking `pipelines[].nozzleIndex` positional references; nozzle `proj`/`size` and saddle `pos` are never clamped.
5. Only PDF page 1 renders; multi-sheet GAs lose data.
6. `RegionSelector.tsx` and `DrawingResultView.tsx` are dead unreferenced duplicates of logic inlined in the modal.

Research (2026-07-30, see memory note `ga-drawing-import`): the crop-first design matches production best practice; the gap is that no reliable system uses one unverified pass. Standard layers = enforced schema, N-sample voting with agreement→confidence, a programmatic verifier ("reconciliation") stage, and confidence-gated human review.

## Goals

- No fabricated values: a field the model could not read is **missing**, visibly, never defaulted.
- Repeatable results: fixed decoding settings + reproducible ensemble.
- Per-field confidence surfaced to the user; user can edit every field before apply.
- Programmatic sanity/cross-view checks before the user sees results.
- Apply path cannot silently corrupt existing pipeline references or accept implausible geometry.

## Non-goals

- No CV pre-pass (line/arrow detection) — only if voting+verifier prove insufficient.
- No cross-model (Claude/GPT) second opinion in this iteration — architecture must not preclude it.
- No provider change: stay on Gemini Flash tier via the existing `gemini-proxy` key flow.

## Design

### Phase A — Extraction core (`engine/drawing-parser.ts` + new modules)

**Structured output.** Request body gains `generationConfig`:
`responseMimeType: "application/json"`, `responseSchema` describing the extraction JSON (all leaf fields **nullable** — the schema is how "couldn't read it" becomes `null` instead of a guess; prompt updated to say "use null when not legible/present"). Response parsed with `JSON.parse` only; regex fence-hunting deleted.

**Model ID resilience.** `const MODEL_CANDIDATES = ['gemini-3.5-flash']` exported from one place; the caller walks the list on model-not-found errors and caches the working index. (Current string is known-good; newer Flash releases get prepended after verifying against ListModels — do not guess IDs.)

**Ensemble voting (`engine/drawing-extraction-voting.ts`, pure + unit-tested).**
- 3 parallel calls per extraction, `temperature: 0.7`, seeds `[41, 42, 43]` → reproducible but diverse ensemble (self-consistency pattern).
- Per-field reconciliation: majority for strings/enums; median for numerics with tolerance-based agreement (values within 1% or 1mm, whichever larger, count as agreeing). Nozzles matched across samples by tag name (case/whitespace-insensitive); a nozzle present in ≥2 samples survives, its fields voted independently.
- Agreement → confidence: 3/3 `high`, 2/3 `medium`, else `low`; null-majority → `missing`.

**Result contract (consumed by Phase B UI; legacy `ExtractionResult` kept for apply):**

```ts
export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';
export interface ExtractedValue<T> {
  value: T | null;            // null iff confidence === 'missing'
  confidence: FieldConfidence;
  flags: string[];            // verifier flag codes, e.g. 'non-standard-size'
}
export interface ExtractionReview {
  id: ExtractedValue<number>;
  length: ExtractedValue<number>;
  headRatio: ExtractedValue<number>;
  orientation: ExtractedValue<Orientation>;
  nozzles: Array<{
    name: ExtractedValue<string>;
    pos: ExtractedValue<number>;
    proj: ExtractedValue<number>;
    angle: ExtractedValue<number>;
    size: ExtractedValue<number>;
  }>;
  saddles: Array<{ pos: ExtractedValue<number> }>;
}
export function toExtractionResult(review: ExtractionReview): ExtractionResult; // throws if any 'missing' remains
```

**Verifier (`engine/drawing-verifier.ts`, pure + unit-tested).** Runs on the voted `ExtractionReview`, appends `flags` and may demote confidence to `low`:
- Vessel plausibility: id 100–20000mm, length 100–50000mm, headRatio 1.5–4.0 → `out-of-range`.
- Nozzle size vs standard NPS/DN bore list (½"–48″ mm IDs): >5% off nearest standard → `non-standard-size` (flag only, never snap).
- Nozzle pos within `[-headDepth, length+headDepth]`, proj in `(0, 3×id]` → `out-of-range`.
- Duplicate tag names → `duplicate-tag` on both.
- Cross-view: when the table region was provided, tags present in only one source → `unmatched-tag`.

**PDF paging.** `getPdfPageCount(file)` added; `renderPdfPage(file, pageNum)` already supports a page arg.

### Phase B — Review UI (`DrawingImportModal.tsx`)

- Upload phase: when a PDF has >1 page, show "Page x of y" with prev/next; region selection operates on the rendered page.
- Result phase becomes an **editable review**: every field an inline input pre-filled with the voted value; confidence badge per field (`badge--*` classes per design system): high = plain, medium = amber, low/flagged = red with flag tooltip text, missing = empty input highlighted "not read from drawing".
- Per-nozzle remove row; "Apply to Model" disabled while any field is `missing` and unedited (user filling a value clears it).
- Apply converts via `toExtractionResult` (user edits are authoritative; edited fields display as such).
- Loading copy updated ("running 3 extraction passes…").

### Phase C — Apply path + hygiene (`VesselModeler.tsx`, cleanup)

- `validateVesselState`: clamp nozzle `proj` to [0, 50000], `size` to [10, 3000], saddle `pos` to [0, length].
- `handleDrawingApply`: before replacing `vessel.nozzles`, remap `pipelines[].nozzleIndex` by exact old-nozzle-name → new-nozzle-name match. Pipelines whose anchor cannot be remapped are removed — but never silently: surface the count/names via the modeler's existing notification mechanism (ConfirmDialog or equivalent) before commit.
- Extract remap logic into a pure helper (`engine/nozzle-ref-remap.ts` or similar) with unit tests.
- Delete dead `RegionSelector.tsx` and `DrawingResultView.tsx`.
- Fix `cropRegion` parameter naming (`sourceWidth/sourceHeight`) so future callers aren't invited to pass display dimensions.

### Phasing & dependencies

- A ∥ C (disjoint files), then B (needs A's types). Each phase leaves the app buildable; A alone keeps the modal working by having `extractVesselFromDrawing` return both `ExtractionReview` and a voted legacy `ExtractionResult` until B lands.

## Verification

- `npm run test` — new unit tests: voting reconciliation, verifier rules, `toExtractionResult` missing-field throw, nozzle-ref remap.
- `npm run build`, `npm run lint` clean.
- Manual: import a real GA PDF via /verify recipe; confirm missing fields render as missing (not 1000/3000 defaults), re-running extraction twice gives identical voted output.

## Addendum 2026-07-30 (post-implementation feedback, BRT1-VA1 GA)

Field test against `BRT1_VA1_VA_P3_01_01001_C5` (horizontal HP separator, 3900 ID, 13650 T/T, 24" manways M1/M3 mounted axially on both dome ends) surfaced two gaps:

### Phase D — Head-mounted nozzles

The extraction schema cannot express a nozzle on a vessel head, so end manways get placed as shell nozzles at a wrong axial position. The engine already supports dome-end nozzles (`NozzleConfig.orientationMode` + `azimuthRotation` + `pos` beyond the tangent line).

- Extraction nozzle gains `mount: 'shell' | 'head-left' | 'head-right'` (enum, voted; null → missing, blocks apply like any field) and `radialOffset` (mm from vessel centerline as seen in the end view; required only when mount is a head — for shell mounts it is absent and never gates apply). Prompt updated: identify head/end-mounted nozzles (manways on dished ends), report their offset from centerline; `pos` stays tangent-line-referenced for shell nozzles only.
- Pure helper `engine/head-nozzle-placement.ts`: `placeExtractedNozzle(nozzle, vessel {id, length, headRatio})` → `Pick<NozzleConfig, 'pos'|'proj'|'angle'|'size'|'orientationMode'|'azimuthRotation'>`. Head mapping: headDepth = id/(2·headRatio); axial depth d = headDepth·√(1−(r/R)²); pos = −d (left) or length+d (right); orientation = axial (per the manual dome-end recipe in NozzleSection — implementer must read NozzleSection.tsx + nozzle-geometry.ts and mirror the exact convention, reporting the derived mapping). Shell mapping unchanged.
- Verifier: `radialOffset` must be < id/2 (`out-of-range`); a head-mounted nozzle also carrying a shell `pos` is not an error (models may emit both) — placement ignores `pos` for head mounts.
- `handleDrawingApply` uses the helper for every nozzle.

### Phase E — Compact review UI

The stacked per-field list is overwhelming on real drawings (20+ nozzles × 5-7 fields). Replace with a dense editable grid:

- Vessel scalars: one compact row (4 inline inputs).
- Nozzles: table, one row per nozzle — columns name/mount/pos-or-offset/proj/angle/size + remove. Cells are inline inputs. Confidence surfaces only where it matters: missing/low cells get the warning/danger treatment (tinted cell + dot/tooltip); high/medium cells stay visually quiet; edited cells get the success tint. Header shows an aggregate ("34 of 38 fields read cleanly — 4 need attention") and a "show issues only" toggle filtering to rows with missing/low/flagged cells.
- Saddles: same dense treatment, one row each.
- Apply gating unchanged (no missing fields, where `radialOffset` only counts for head mounts).

## Future (explicitly deferred)

- Cross-model second opinion on low-agreement fields (Claude Opus 4.8 high-res vision or GPT-5.x).
- CV pre-pass for leader-line association.
- Multi-region-per-page or multi-page region sets.
- Persist extraction provenance (source crop per field) for report traceability.
