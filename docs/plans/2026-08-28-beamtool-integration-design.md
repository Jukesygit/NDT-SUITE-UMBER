# NotBeamTool Integration — Design

**Date:** 2026-08-28
**Status:** Approved (owner request: "add Notbeamtool as a tool in the tools section")
**Source:** `C:\Users\jonas\OneDrive\Documents\Notbeamtool` — standalone Vite + React 18 + TS app, a BeamTool-style UT angle-beam technique designer (weld cross-section, probe/wedge, skip legs, −6 dB spread, S-scan fan, PNG technique-sheet export). ~1.7k lines across 10 source files, zero runtime deps beyond React. Self-contained maths in `physics/` + `geometry/`, plain-SVG renderer.

## Goal

Port the tool into the suite as a Tools-tab page, byte-equivalent behavior, with the suite's auth/tab gating, theme system, and CSP intact. No backend, no persistence — the tool is purely client-side.

## Placement

| Piece | Destination |
|---|---|
| Tool internals | `src/components/BeamTool/` (`BeamTool.tsx`, `components/`, `physics/`, `geometry/`, `types.ts`, `sheet.ts`, `beam-tool.css`) |
| Page wrapper | `src/pages/BeamToolPage.tsx` — full-bleed wrapper, same shape as `TopologyViewerPage.tsx` |
| Route | `/beam-tool` in `App.tsx`: lazy import + `RequireTabVisible tabId="tools"` + `ErrorBoundary`, placed beside `/topology` |
| Nav | New child in the Tools group of `LayoutNew.tsx`: id `beam-tool`, label `NotBeamTool`, description "UT angle-beam technique designer — weld cross-section, skip legs, sectorial scan" |

Not copied: `main.tsx`, `index.html`, `vite.config.ts`, `package.json`, `.claude/`, `dist/`, `node_modules/`. The standalone repo stays untouched.

## Design decisions

**Scope revision (owner, 2026-08-28):** styling integration is DEFERRED — port the tool with its current styling verbatim. Only the mechanical containment needed so that loading `/beam-tool` cannot clobber the rest of the suite (Vite injects a lazy chunk's CSS globally and it stays for the session). No class renames, no suite-token/font remapping, the tool keeps its own dark/light toggle, header, and localStorage key.

1. **CSS containment (not restyling).** `styles.css` → `beam-tool.css`, selectors kept, classes kept, values kept, but:
   - `:root { … }` custom props move to `.nbt-page { … }`; `:root[data-theme='light']` becomes `.nbt-page[data-theme='light']` (identical rendering inside the tool subtree).
   - The global `* { box-sizing…; margin:0; padding:0 }` reset is scoped: `.nbt-page, .nbt-page *, .nbt-page *::before, .nbt-page *::after { … }`.
   - `body` / `#root` rules dropped (page wrapper owns sizing).
   - Every other rule gets a `.nbt-page ` ancestor prefix — nothing else changes.
   - Known accepted consequence: suite globals (`.app`, `.header`, `.btn`, `input[type=…]`) can still bleed INTO the tool's identically-named elements where the tool doesn't set a property; cosmetic only, fixed in the deferred styling pass.

2. **Theme attribute (still blocking, kept minimal).** The tool writes `document.documentElement.dataset.theme` — the attribute the suite's `ThemeContext.applyToDOM` owns; left as-is it would fight the app theme globally. Minimal fix preserving current behavior: the toggle, `notbeamtool-theme` localStorage, and dark/light default stay exactly as they are, but the attribute is stamped on the tool's own root `<div className="nbt-page" data-theme={theme}>` instead of `documentElement`.

3. **PNG export computed-style source.** `Canvas.tsx` reads export colors via `getComputedStyle(document.documentElement)`; with vars moved to `.nbt-page` that returns empty strings. Read `getComputedStyle` from the SVG element itself instead (custom props inherit). The one behavioral touch inside `Canvas.tsx`.

4. **Fonts.** No Google-Fonts link is added to the suite (prod CSP forbids the hosts). `--font-ui`/`--font-mono` declarations stay verbatim; the families simply fall back until the deferred styling pass decides the mapping.

5. **Deferred to the styling pass:** `nbt-` class prefixing, suite-token/font mapping, ThemeContext binding, 300-line splits of `Canvas.tsx` (653) / `Sidebar.tsx` (343) — `max-lines` is warn-only.

6. **No new tab id.** The route reuses `tabId="tools"`; admin tab-visibility config needs no change.

## Verification gate

`npm run typecheck`, `npm run lint`, `npm run build`, `npm run test` all green; Prettier run on the new/changed files only (repo gotcha: never whole-repo format churn). Smoke test: render `BeamTool`, assert the brand and a readout render, flip the theme toggle and assert the root's `data-theme` flips (and `documentElement` is untouched).
