# Industrial Instrument Style — Handover Brief

## Context

We're pivoting the NDT Suite (Matrix Portal) design language away from flat dark tonal layering ("The Dark Forge") toward a physically-grounded, skeuomorphic style inspired by professional audio hardware and industrial machinery. The user confirmed this direction through a full impeccable shape workflow.

## What exists

Three demo pages were built at `src/pages/demos/` (routes `/demos/scan-viewer-a`, `/demos/scan-viewer-b`, `/demos/scan-viewer-c`) with a shared CSS file. They demonstrate the design system mechanically (beveled panels, recessed wells, LED indicators, stamped text, green accent) but **the result reads too retro** — more Windows-95-bevel than the smooth, modern, physically-grounded feel of the references.

The CSS file at `src/pages/demos/scan-viewer-demos.css` contains the full token system, bevel primitives, and 3 layout variations. Use it as a starting vocabulary but push the visual execution significantly.

## The reference images (critical — study these)

The user provided 3 images. The originals aren't saved as files, but here's what they depict:

### 1. Mackie Big Knob (PRIMARY reference)
- **NOT** sharp-edged, flat bevels. The bevels are **smooth, rounded transitions** — surfaces flow into recessed wells with soft gradients, not hard border steps
- Brushed aluminum surface with subtle directional grain
- Deep circular wells for knobs where the surface curves smoothly inward — the transition from flat panel to deep recess is a continuous gradient, not a border
- Strong directional lighting from above creating natural highlight/shadow
- LED indicators are the ONLY color (small, precise, glowing)
- Dark gray chassis/frame surrounding the lighter aluminum panel
- Overall feel: premium hardware you'd find in a professional studio

### 2. Softube FXR-805 synthesizer
- Cream/off-white tone — warmer and lighter than the Big Knob
- Very soft, subtle depth. Raised buttons barely lift off the surface
- Inset slider channels with smooth inner curves
- Consistent single light source creating gentle shadows
- Almost photorealistic material rendering
- Feel: refined, quiet, modern skeuomorphism (not retro)

### 3. Ian McQue / NortRelink robot concept art
- Muted sage/olive/cream/rust palette
- Industrial, weathered, mechanical texture
- "Built not designed" ethos
- Informs both COLOR PALETTE (muted, natural, industrial) and MOOD (tactile, mechanical, purposeful)

## What the user likes and doesn't like

**LIKES:**
- Smooth 3D bevel transitions (surfaces flowing into recesses, not hard border edges)
- Physical depth through realistic light/shadow simulation
- Green accent color (replacing the previous blue)
- Light base with warm industrial neutrals
- Industrial typography (Barlow + Barlow Condensed + JetBrains Mono)
- LED indicators for selection state
- The overall concept of panels, wells, and controls

**DOESN'T LIKE:**
- The current demos look "more retro than the references"
- Hard bevel borders (1px solid with 4 different edge colors = Windows 3.1 feel)
- Flat box-shadow stacks that read as CSS tricks rather than physical material
- Anything that looks like it was made with early-2000s CSS techniques

## The gap: retro vs modern skeuomorphism

The key difference between retro and modern skeuomorphism:

| Retro (what we built) | Modern (what references show) |
|---|---|
| Hard 1px border bevels with 4 edge colors | Soft multi-stop gradients that simulate curvature |
| Flat background + box-shadow stacks | Smooth gradient transitions between depth levels |
| Sharp corners on depth transitions | Rounded, flowing transitions |
| Uniform shadow intensity | Nuanced shadow with falloff (gaussian, layered) |
| Border-based depth cues | Gradient-based depth cues |
| Obvious CSS technique | Looks like a photograph of a real object |

Modern skeuomorphism achieves depth through:
- **Multi-stop gradients** on surfaces that simulate subtle curvature (convex panels, concave wells)
- **Layered, diffused shadows** (multiple box-shadows with different blur radii and opacities, not sharp borders)
- **Smooth inner shadows** with large blur radius for wells (not tight 2px inset shadows)
- **Specular highlights** as soft gradient overlays, not hard 1px inset borders
- **Material simulation** where surfaces feel like they have real thickness and mass

## Your task

Create **new demo HTML pages** (not React components — standalone HTML files) that explore this industrial instrument style with more visual fidelity. The demos should:

1. **Fix the retro problem.** Replace hard border bevels with smooth gradient-based depth. Make surfaces feel like photographed aluminum, not CSS borders.
2. **Vary the content.** Don't just rebuild the scan viewer folder selection. Try different surfaces: a settings panel with controls, a data readout display, a toolbar, a status dashboard — whatever showcases the design language across different UI patterns.
3. **Use the confirmed palette** (green accent, warm industrial neutrals, Barlow typography) but push the material rendering much further.
4. **Be standalone HTML files.** Each page should be a single `.html` file with embedded CSS. No React, no build step. Drop them in `src/pages/demos/` or a new `demos/` folder at project root. The user wants to open them directly in a browser.
5. **Reference the Big Knob image above all else.** The smooth, flowing bevel transitions and brushed metal surface are the north star. The FXR-805's softer cream palette is the secondary influence. The robot art informs the color mood (muted, industrial, olive/sage undertones).

## Design tokens to carry forward

```
Chassis:        #706c66 (dark frame / page background)
Panel surface:  #ccc8c2 to #d8d4ce (brushed aluminum range)
Well recess:    #b4b0aa to #a29e98 (recessed areas)
Control raised: #dedad4 to #e6e2dc (buttons, raised elements)

Green accent:   #2d8a4e (primary), #35a058 (bright), #206b3a (dark)
Green glow:     rgba(45, 138, 78, 0.45)

Text dark:      #1c1b18
Text mid:       #4a4845
Text light:     #7a7672

Font display:   Barlow (400/500/600/700)
Font label:     Barlow Condensed (600/700, uppercase, tracked)
Font mono:      JetBrains Mono (data, paths, measurements)
```

## Techniques to explore

- `background: radial-gradient(...)` on panels for subtle convexity
- Large-radius `box-shadow: inset 0 8px 16px rgba(0,0,0,0.15)` for soft wells instead of tight 2px inset
- Multiple overlapping gradients for brushed metal texture
- `border-radius` on wells that's larger than the panel's corners to create the "routed out" look
- CSS `filter: drop-shadow()` for more realistic object shadows vs `box-shadow`
- Pseudo-elements (`::before`, `::after`) for highlight strips and edge effects
- Subtle `backdrop-filter: blur()` sparingly for glass-over-metal on specific elements

## Project context

- Tech stack: React 18.3 + TypeScript 5.9 + Vite 6.4 + Tailwind CSS 4
- But for these demos: **standalone HTML is preferred** so they can be opened directly
- The project has PRODUCT.md and DESIGN.md at root describing the current (soon-to-be-replaced) design system
- The `$impeccable` skill is available for design workflows
- Run `node .claude/skills/impeccable/scripts/load-context.mjs` to load full design context if needed
- CLAUDE.md at project root has all coding conventions

## Success criteria

Someone should look at the demo pages and think "this looks like a photograph of real hardware UI" rather than "this looks like CSS bevels." The Big Knob reference is the bar. The demos don't need to be interactive (static HTML is fine) but should show enough variety to prove the design language works across different UI patterns.
