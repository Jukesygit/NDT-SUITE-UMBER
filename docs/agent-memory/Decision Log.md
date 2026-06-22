---
tags:
  - agent-memory/decisions
  - ndt-suite
aliases:
  - Decision Log
---

# Decision Log

Use this for durable decisions that affect future work. Keep entries short and link to fuller notes when needed.

## 2026-05-07 - Obsidian Memory Layer

Decision: maintain a small agent-facing memory layer in `AGENTS.md` and `docs/agent-memory/`.

Reasoning: future agents should get project orientation from curated notes before searching the whole repository. The notes are a map, not a replacement for reading source code.

Consequences:

- `AGENTS.md` is the first file for agents to read.
- `docs/agent-memory/Project Brief.md` stores stable project context.
- `docs/agent-memory/Module Map.md` stores feature-to-file ownership.
- `docs/agent-memory/Decision Log.md` stores durable decisions.
- Temporary session state belongs in dated handoff notes under `docs/plans/`.

## 2026-05-07 - Memory-First Agent Instructions

Decision: make the memory-first workflow explicit in both Codex and Claude instruction files.

Reasoning: the memory layer only saves context if agents reliably read it before broad repository search. The practice should be part of the agent operating contract, not a one-off prompt.

Consequences:

- Codex-style agents start from `AGENTS.md`.
- Claude agents start from root `CLAUDE.md`, then `.claude/CLAUDE.md` when present locally.
- Both instruction files require agents to read `Project Brief`, `Module Map`, and `Engineering Log` before non-trivial work.
- Agents should update memory or a dated handoff note when a task changes project shape or leaves important unfinished context.

## 2026-05-08 - Companion CSV Exports Use Explicit Thickness Filters

Decision: companion C-scan CSV export paths should not implicitly apply the NDE file's thickness-process `min`/`max` limits. Those limits remain metadata and may be applied only when a user or API request explicitly supplies export filter values.

Reasoning: a May 2026 Judy SO2 data check showed the NDE `RawCScan` contained sub-5 mm readings, while exported CSVs hid them because the batch/API export paths silently applied the file's 6.25-28.0 mm thickness process range and converted lower readings to `ND`.

Consequences:

- Batch export leaves thickness filter fields blank by default and logs detected NDE process limits as guidance.
- The `/cscan-export` API uses only request-provided `thicknessMin`/`thicknessMax`.
- Future OmniPC-match workflows that need process-limit filtering must opt in explicitly.

## 2026-06-22 - Flattened (2D) View Circumferential Convention

Decision: the developed/flattened vessel view (`FlattenedView/`) is cut at TDC — circumferential Y = 0 is 12 o'clock at the top, increasing clockwise (3 o'clock = ¼, 6 o'clock = ½, 9 o'clock = ¾). All circumferential placement flows through `geometry-projection.ts`:

- `angleToCircumMm(vesselAngle)` takes the **vessel** convention (90° = TDC). Feed geometry feature angles (nozzle/weld/saddle/lug `.angle`, which are already 90° = TDC) straight in — do NOT subtract 90.
- `datumToCircumMm(datumAngleDeg)` takes the **user** convention (0° = TDC) and adds +90 internally — the same conversion the 3D path uses (`datumAngleDeg + 90` in texture-manager, scan-gizmo, scan-sampling, wall-loss). Use it for scan composites.

Reasoning: scan-0 was rendering 90° (¼ circumference) off from 12 o'clock in the 2D view while correct in 3D. Two earlier "fixes" (`13a4196` removed the heatmap +90, `328c24f` shifted feature angles -90 to match) made heatmap and geometry mutually consistent but rotated the whole axis so TDC sat ¼ of the way down instead of at the top. Root cause was the call sites feeding `angleToCircumMm` a user-convention angle when it expects a vessel angle.

Consequences:

- A datum-0 scan and a 12-o'clock nozzle both land at Y = 0 (verified by `geometry-projection.test.ts`).
- Any new flattened overlay must use these two helpers, never re-introduce a manual ±90 shift.
- Regression guard: `geometry-projection.test.ts` asserts TDC/scan-datum-0 → Y = 0 and bottom → Y = circumference/2.

## 2026-06-22 - Flattened (2D) View Feature Marker Rendering

Decision: developed-view feature markers (nozzles today; lugs/annotations should follow) are drawn with **per-axis pixel radii** and **seam wrapping**, not as a single-radius circle.

- Per-axis radii: the view scales axial (X) and circumferential (Y) independently, so a round bore must use `rxPx` from `toCanvasX` and `ryPx` from `toCanvasY` and be drawn with `ctx.ellipse`. A single radius (the old `ctx.arc` using only the X scale) made nozzles bulge/shrink circumferentially — a display distortion of the true footprint.
- Seam wrapping: `geometry-projection.ts → wrapCircumCenters(cyMm, radiusMm, circumference)` returns the base centre plus a ±circumference copy when the marker crosses the TDC cut (Y=0 / Y=circumference). Draw the marker once per returned centre; the viewport clip trims each copy. This stops 12-o'clock nozzles being clipped to half-circles at the top boundary.

Reasoning: nozzles near TDC were clipped in half, and large nozzles overflowed their footprint because the circle was sized only by the axial scale. Both are correctness issues (see the no-display-distortion inspection-integrity constraint).

Consequences:

- `wrapCircumCenters` is pure and unit-tested in `geometry-projection.test.ts` (interior = no wrap; top/bottom seam = one wrapped copy; non-positive circumference = base only).
- The interactive marker and the selection glow in `FlattenedViewport.tsx` share this treatment; the report/export path reuses the same canvas via `exportImage()`, so no separate fix is needed there.

## 2026-06-22 - Flattened (2D) View Axial Axis Orientation

Decision: the developed view's horizontal axis is the **scan index** — 0 = scan start on the left, increasing right — not raw vessel axial position. Orientation comes from the first confirmed composite with data (`getAxialOrientation`), the same reference the colour legend uses.

- A **forward** scan keeps the natural left-tangent-on-the-left layout (no change).
- A **reverse** scan (index 0 at a high vessel position) **mirrors** the axis (`axialFrac` with `reversed`), so the scan start still lands on the left.
- Both the heatmap row→pixel mapping and `toCanvasX`/`fromCanvasX` apply the same mirror, so scan data and feature overlays move together.
- The axial scale labels show **index distance from the scan start** via `axialToIndexMm` (negative before the scan start); `drawAxialScale` takes an optional `labelFor` mapper.
- With no confirmed scan, the axis falls back to raw vessel position (0 = left tangent).

Reasoning: a reverse-direction scan put the scan start (e.g. nozzle N7) on the far right of the developed view while the 3D view and the inspector's reading have it at the index start. The 2D faithfully used vessel position (0 = left tangent), which is correct geometrically but not the C-scan reading convention. User chose "scan index, 0 on left."

Consequences:

- `getAxialOrientation`, `axialToIndexMm`, `axialFrac` are pure and unit-tested in `geometry-projection.test.ts`.
- Multi-composite vessels orient to the first confirmed composite; revisit if mixed forward/reverse scans need independent axes.

## 2026-06-22 - Flattened (2D) View Is To-Scale (1:1 Aspect)

Decision: the developed view uses **one pixel-per-mm scale on both axes** (`fitScale` → `min(drawWidth/length, drawHeight/circumference)`), letterboxing the looser axis (centred via `marginX`/`marginY`). It no longer stretches each axis independently to fill the canvas.

Reasoning: independent axis scaling rendered round nozzle bores as ovals (the per-axis ellipse markers were faithful to a distorted view) and geometrically distorted scan footprints — a display distortion. A to-scale view makes `rxPx === ryPx` (circles render round) and preserves true proportions, consistent with the no-display-distortion inspection principle.

Consequences:

- `toCanvasX`/`toCanvasY`/`fromCanvasX`/`fromCanvasY` and the heatmap row/col mapping all use the shared `pxPerMm` + margins; the wrap-skip threshold is now `circumference·pxPerMm·zoom/2`.
- The plot is centred with margins (does not fill the full width when aspect ratios differ) — intentional. Pan/zoom and Fit still work.
- Scale anchoring: the circumferential scale and the "12 o'clock (TDC)" label anchor to `Math.min(x0, x1)` (the true left edge) because a mirrored axial axis makes `toCanvasX(0)` the right edge.
- `fitScale` is pure and unit-tested in `geometry-projection.test.ts`.
