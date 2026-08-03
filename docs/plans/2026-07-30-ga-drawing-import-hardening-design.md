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

### Phase F — Deterministic angle convention (field test 2: uniform 90° rotation)

Field test showed every feature applied rotated 90° around the vessel: the prompt asked the model to *convert* end-view angles (drawing convention: 0° = TDC, increasing clockwise as labelled) into the engine convention (90° = top, 0° = right) and the model fails that conversion systematically. Same failure class as the flattened-view TDC regressions — the standing rule applies: one canonical conversion, in code.

- Prompt/schema: nozzle `angle` is now **drawing-native** — "degrees exactly as labelled in the end view: 0 = top (12 o'clock), increasing clockwise". The model must transcribe, never convert.
- The drawing-native angle flows unchanged through voting, verifier (0–360 normalization only), and the review UI — the user can check cells directly against the drawing. Review column header says "Angle (° from top, CW)".
- Single conversion site: `drawingClockToVesselAngle(deg) = (90 − deg) mod 360`, applied inside `placeExtractedNozzle` (the one mapper every applied nozzle already passes through — shell and head mounts alike; head-mount azimuth sign resolution uses the *converted* angle). Unit-tested at the cardinal points.
- Review escape hatch: a compact "Rotate all" control in the nozzle-table header (+90° / −90° / 180° / mirror) that bulk-adjusts every nozzle's angle cell (marks them edited), for drawings whose end view is taken from the opposite end or uses a non-standard zero.

### Phase F postscript — detection regression + recovery (field test 3)

The Phase F prompt edit ("exactly as labelled / transcribe" + a verbose per-leaf ANGLE schema description) coincided with total nozzle-detection loss on the same drawing that had just extracted well. Recovery, keeping angles drawing-native + the code-side conversion:

- Prompt restored toward the proven-good shape: angle instruction asks for clock position measured clockwise from top, **explicitly permitting geometric estimation from the drawn position** (the "transcribe labels only" wording invited omission where no per-nozzle label exists); ANGLE schema leaf back to a plain nullable number (comment in the file warns against re-adding a description).
- Naming pinned: `name` must be the nozzle TAG, never the schedule item number, consistent across views — inconsistent naming across ensemble passes defeats cross-sample matching.
- Voting no longer silently discards singleton nozzles: present-in-1-of-3 nozzles are appended after voted ones with confidence `low` + flag `single-pass` (review-visible), so a naming-mismatch wipeout degrades to reviewable low-confidence rows instead of an empty list. ≥2-sample nozzles vote exactly as before.

### Phase G — Horizontal nozzles with elevation (field test 4)

GA convention (seen on BRT1-VA1 VIEW A-A): horizontally-oriented nozzles (level bridles, instrument connections, side manways) are drawn clustered at the 3/9 o'clock positions with **EL** labels (elevation from vessel centerline — the view declares "REF. EL +0.0"); they face that side and sit on the shell where a horizontal line at EL meets it. They carry no clock angle. Current extraction forces an angle → they pile up at 90°/270° mid-height.

- Schema/prompt: nozzle gains `nozzleOrientation: 'radial' | 'horizontal'` (**required classification — the drawing shows it unambiguously; null → missing → gates apply**, per user decision 2026-07-30: no assumed-radial default) and `elevation` (signed mm from vessel centerline, horizontal nozzles only; null when the EL reference is unclear). Horizontal nozzles report `angle` as the side they face (90 or 270, drawing convention); prompt teaches the cluster convention explicitly.
- Placement (single site, `placeExtractedNozzle`): horizontal → engine angle = asin(clamp(2·EL/id, −1, 1)) for facing-right (drawing 90), 180° − asin(...) for facing-left (drawing 270); `orientationMode: 'horizontal'`; facing sign falls out of the engine's cos(angle) convention; `pos` from side elevation unchanged. Radial → today's path. Field named `nozzleOrientation` in the extraction contract to avoid colliding with the vessel-level `orientation`.
- Voting: enum vote (like mount); `elevation` numeric-median, gate-relevant only when the voted/edited nozzleOrientation is 'horizontal' (sentinel pattern identical to radialOffset/mount).
- Verifier: horizontal with |EL| > id/2 → 'out-of-range'; horizontal missing elevation stays missing (gates).
- Review grid: orientation select (Radial/Horizontal) per row; when Horizontal the angle cell is constrained/paired with an EL cell ("EL from CL"); rotate-all skips horizontal nozzles' facing sides only when mirroring is meaningless — Mirror swaps 90↔270 facing.
- **Projection semantics (user clarification 2026-07-30):** a horizontal nozzle's projection/OUTSTAND is the horizontal distance from the vessel's vertical **center plane** to the flange face at elevation EL — not an axis distance (that would be √(proj²+EL²)) and not shell stick-out (that is proj − √(R²−EL²)). Placement must ensure the engine receives whatever value lands the flange at that horizontal distance (verify engine `orientationMode:'horizontal'` proj consumption in vessel-geometry; correct in `placeExtractedNozzle` if semantics differ). Radial nozzles keep axis-referenced proj. The same plane-referenced logic applies mirrored to vertical nozzles if those are ever modeled explicitly.

## Future (explicitly deferred)

- Cross-model second opinion on low-agreement fields (Claude Opus 4.8 high-res vision or GPT-5.x).
- CV pre-pass for leader-line association.
- Multi-region-per-page or multi-page region sets.
- Persist extraction provenance (source crop per field) for report traceability.
