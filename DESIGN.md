---
name: Matrix Portal
description: Industrial instrument interface for NDT inspection visualization and reporting
colors:
  green: "#2d8a4e"
  green-bright: "#35a058"
  green-dark: "#206b3a"
  amber: "#d4981e"
  red: "#c0392b"
  chassis: "#504e4a"
  chassis-inner: "#5a5854"
  panel-top: "#c6c5c2"
  panel-mid: "#b2b1ae"
  panel-bot: "#9e9d9a"
  ctrl: "#d6d3ce"
  ctrl-hi: "#e4e1dc"
  ctrl-lo: "#bcb9b4"
  well-rim: "#4a4844"
  well-mid: "#262420"
  well-deep: "#141310"
  well-floor: "#0a0908"
  text-primary: "#1c1b18"
  text-secondary: "#4a4845"
  text-tertiary: "#7a7672"
  text-quaternary: "#9a968f"
typography:
  body:
    fontFamily: "Barlow, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Condensed, Barlow, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "JetBrains Mono, Fira Code, Consolas, Monaco, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "5px"
  lg: "7px"
  xl: "8px"
  2xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  chassis:
    background: "linear-gradient(180deg, {colors.chassis-inner} 0%, {colors.chassis} 100%)"
    borderRadius: "{rounded.2xl}"
    padding: "10px"
  panel:
    background: "linear-gradient(180deg, {colors.panel-top} 0%, {colors.panel-mid} 45%, {colors.panel-bot} 100%)"
    borderRadius: "{rounded.xl}"
  display-well:
    background: "linear-gradient(180deg, {colors.well-mid} 0%, {colors.well-deep} 30%, {colors.well-floor} 100%)"
    borderRadius: "{rounded.lg}"
    padding: "4px"
  display:
    background: "linear-gradient(180deg, #131210 0%, #0c0b0a 100%)"
    borderRadius: "4px"
    textColor: "{colors.green-bright}"
    fontFamily: "{typography.mono.fontFamily}"
  button-raised:
    background: "linear-gradient(180deg, {colors.ctrl-hi} 0%, {colors.ctrl} 50%, {colors.ctrl-lo} 100%)"
    borderRadius: "{rounded.md}"
    textColor: "{colors.text-secondary}"
  groove:
    height: "1px"
    background: "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(255,255,255,0.25) 100%)"
---

# Design System: Matrix Portal

## 1. Overview

**Creative North Star: "The Precision Instrument"**

Matrix Portal's interface is a physical instrument, not a screen. Every surface has material properties: brushed-metal panels catch overhead light with specular blooms, data lives inside recessed LCD display wells, zones are separated by machined groove dividers, and buttons have mechanical travel with specular highlights. The metaphor is a high-end test & measurement instrument sitting on an engineer's workbench.

The aesthetic descends from professional measurement equipment (Keysight, Fluke, Olympus NDT) and high-end audio hardware (Universal Audio, SSL). Not from software UI frameworks, admin templates, or SaaS dashboards. If it looks like a website, it's wrong. If it looks like something you could pick up and hold, it's right.

**Key Characteristics:**
- Warm umber-gray brushed-metal surfaces; never cold blue-gray, never pure white or black
- Chassis > Panel > Display Well spatial hierarchy mimicking physical instrument construction
- All data content lives inside recessed dark LCD screens, never on the panel surface
- Labels and section titles are engraved into the panel surface (text-shadow rim-light effect)
- Green accent for active/healthy states; amber for warnings; red for critical. Color is functional, never decorative
- Monospaced type inside display wells (data voice); condensed uppercase labels on panel surface (instrument voice)

## 2. Spatial Hierarchy

The interface follows a strict physical construction metaphor with three depth layers:

### Chassis (outermost)
The dark outer frame that holds everything. Think of the metal enclosure of a rack-mounted instrument.
- Background: `linear-gradient(180deg, var(--chassis-inner) 0%, var(--chassis) 100%)` — warm dark gray (#5a5854 → #504e4a)
- Padding: 10px (the lip between chassis edge and panel)
- Border-radius: 14px
- Shadow: heavy drop shadow suggesting physical weight

### Panel (main surface)
The brushed-metal faceplate. All labels, controls, and section titles live ON this surface, engraved into it.
- Background: 3-stop gradient from `--panel-top` (#c6c5c2) through `--panel-mid` (#b2b1ae) to `--panel-bot` (#9e9d9a)
- Grain texture: `::before` pseudo-element with repeating-linear-gradient simulating fine horizontal brush marks
- Specular bloom: `::after` pseudo-element — large radial gradient positioned at top center, simulating overhead light catching the metal surface. This is what makes the panel feel "alive" rather than flat
- Inset shadow: `inset 0 1px 0 rgba(255,255,255,0.45)` for the top-lit edge, `inset 0 -1px 0 rgba(0,0,0,0.08)` for the shadowed bottom edge

### Display Well > Display (data screens)
Recessed dark areas where all data content appears. Two nested elements:
- **Well** (outer): The beveled recess machined into the panel. `--well-mid` → `--well-deep` → `--well-floor` gradient with heavy inset shadows creating depth
- **Display** (inner): The near-black LCD screen inside the well. `#131210` → `#0c0b0a` gradient. Text is `--green-bright` in monospace. This is where document lists, stats readouts, category meters, activity feeds, and all other data live

### Named Rules

**The Surface Rule.** Content type determines which surface it occupies. Labels, titles, and controls → panel surface (engraved). Data, lists, values, readouts → inside display wells (LCD green-on-dark). Mixing these (e.g., dark text on panel for data, or panel-colored text inside a display) breaks the instrument metaphor.

**The Well Rule.** Every distinct data group gets its own display well. The well provides visual containment and the LCD context. Wells never nest inside other wells.

## 3. Colors: The Instrument Palette

A warm, deliberately umber-tinted palette. Every neutral carries warm undertones, never cool blue-gray. Color is scarce and functional.

### Panel & Control Surfaces
- **Panel Top** (#c6c5c2): Lightest point of the brushed-metal gradient
- **Panel Mid** (#b2b1ae): Middle tone, the dominant surface color
- **Panel Bot** (#9e9d9a): Shadow edge at the panel's lower extent
- **Ctrl Hi/Mid/Lo** (#e4e1dc / #d6d3ce / #bcb9b4): Raised control surfaces (buttons, active tabs)

### Chassis & Wells
- **Chassis** (#504e4a) / **Chassis Inner** (#5a5854): Dark frame surrounding panels
- **Well Mid/Deep/Floor** (#262420 / #141310 / #0a0908): Progressive depth inside recessed display areas
- **Body background**: Dark workbench surface (#3a3836 or similar warm dark)

### Instrument Accents
- **Green** (#2d8a4e): Primary accent. Active states, healthy status, interactive affordances. Bright variant (#35a058) for LED indicators and LCD readouts
- **Amber** (#d4981e): Caution. Expiring certifications, pending reviews, approaching thresholds
- **Red** (#c0392b): Critical. Expired credentials, errors, destructive actions
- **Green Glow** (rgba(45,138,78,0.50)): LED halo effect around active indicators

### Text on Panel (engraved)
- **Primary** (#1c1b18): Page titles, section headers. With `text-shadow: 0 1px 0 rgba(255,255,255,0.50)` for engraved rim-light
- **Secondary** (#4a4845): Descriptions, subtitles. Same rim-light, lighter text-shadow
- **Tertiary** (#7a7672): Metadata labels, less critical information
- **Quaternary** (#9a968f): Timestamps, helper text, nameplate model text

### Text in Display Wells (LCD)
- **Green Bright** (#35a058): Primary data values, list item titles, strong readouts. With `text-shadow: 0 0 10px var(--green-glow)` for LCD glow
- **Green Dim** (rgba(53,160,88,0.42)): Labels, metadata, secondary information inside wells
- **White** (rgba(255,255,255,0.70-0.80)): Document titles, review item names inside wells
- **Amber/Red**: Status indicators, same semantic use as on panel but with glow variants

### Named Rules

**The Warm Neutral Rule.** No neutral is cool-tinted. Every gray carries umber warmth. Compare against pure gray (#808080) — if it could be mistaken for neutral gray, add warmth.

**The Glow Rule.** Inside display wells, colored text gets a matching `text-shadow` glow simulating LCD phosphor bleed. On the panel surface, text gets a white rim-light shadow simulating engraving. Never mix these: no glow on panel text, no rim-light inside wells.

## 4. Typography

**Body:** Barlow (with system-ui fallback)
**Labels:** Barlow Condensed — the instrument voice. Uppercase, wide letter-spacing, used for zone labels, section titles, button text, nameplates
**Data:** JetBrains Mono — the display voice. Used inside all LCD display wells for values, readouts, list items, and any data the user might compare or copy

### Hierarchy

- **Page Title** (Barlow Condensed 700, 17px, uppercase, 0.16em tracking): One per chassis. Engraved into panel surface
- **Section Label** (Barlow Condensed 700, 11px, uppercase, 0.14em tracking): Zone labels on panel. "Attention Required", "Categories", "Recent Activity"
- **Subtitle** (Barlow Condensed 600, 11px, uppercase, 0.12em tracking): Supporting text below page title
- **Display Value** (JetBrains Mono 600, 28px, tabular-nums): Large readout numbers inside stat wells
- **Display Label** (JetBrains Mono, 9px, uppercase, 0.12em tracking): Dim green labels inside stat wells
- **Display Body** (JetBrains Mono, 11-12px): List items, activity text, review items inside display wells
- **Nameplate** (Barlow Condensed 700, 15px, uppercase, 0.18em tracking): Product name on nameplate strip

### Named Rules

**The Voice Rule.** Font family signals the surface. Barlow Condensed = on the panel (instrument labels). JetBrains Mono = inside a display well (data readout). Barlow (regular) = flowing body text in modals, descriptions, prose. Breaking this mapping confuses the spatial hierarchy.

## 5. Physical Elements

### Groove Dividers
1px dual-tone lines separating functional zones on the panel surface. Top half is dark (`rgba(0,0,0,0.08)`), bottom half is light (`rgba(255,255,255,0.25)`), creating the illusion of a machined channel. Vertical variant for column separations.

### Specular Blooms
Large radial gradients positioned on the panel `::after` pseudo-element, simulating overhead light catching the brushed-metal surface. Centered horizontally, positioned near the top. White → transparent fade. This single element is responsible for making the panel feel "alive" versus flat.

### LED Indicators
Small radial-gradient circles (5-8px) with colored glow box-shadows. Used for status dots (sidebar), active nav indicators, and stat card icons. The LED has a specular highlight at top-left (`circle at 35% 30%`) and a matching glow halo (`box-shadow: 0 0 4px [color], 0 0 10px [color-soft]`).

### Engraved Text
Text pressed into the panel surface. Achieved with muted text color + `text-shadow: 0 1px 0 rgba(255,255,255,0.40)`. The white shadow below each letter simulates light catching the lower edge of the letter-shaped recess. Used for all text on the panel surface: titles, labels, nameplates, button labels.

### Raised Buttons
Three-layer gradient buttons (specular highlight radial at top + body gradient + base). Inset white top edge, dark bottom edge, drop shadow beneath. `:active` state inverts to inset shadows + 1px translateY to simulate mechanical press. Used for actions on the panel surface.

### Category Bars
Horizontal meters inside display wells showing document distribution. Well-within-well construction: outer bar uses `--well-mid/deep/floor`, inner fill uses green gradient with glow shadow. Animated width transition.

### Nameplate Strip
Bottom zone of each chassis, below the final groove. Product name left-aligned, model descriptor right-aligned. Both in Barlow Condensed uppercase with engraved text-shadow. Color is `--color-neutral-500` — visible but not prominent, like stamped metal identification.

## 6. Components

### Stat Cards
Individual display wells, each containing a single metric. LED indicator dot at top (color varies by type), large mono value with glow, dim mono label below. Grid of 6 across. Each is a complete well > display unit.

### Document List
Lives inside a display well. Each item has: recessed icon well (mini display), white title text, green-dim metadata, status badge (LED-style), review date indicator. Items separated by green-tinted borders (`rgba(53,160,88,0.08)`). Hover state is subtle green background tint.

### Status Badges
Recessed dark pills with LED dot prefix. The badge background is `--well-deep → --well-floor` gradient with inset shadow. LED dot uses the same radial-gradient + glow pattern as standalone LEDs. Text color matches the semantic meaning (green/amber/red).

### Tabs
Recessed well containing raised button tabs. The well provides the dark channel; the active tab pops up as a raised control surface with specular highlight. Inactive tabs are ghosted text inside the well.

### Search
Recessed channel (same well treatment as tabs). Monospace green input text with glow. Search icon in dim green. Focus state adds green ring glow around the well.

### Filter Chips
Inside display wells: flat toggle pills with green-tinted borders on dark background. Active state has green glow. On panel surface: raised button variant matching the standard button treatment.

### Sidebar
Zones within the panel, separated by grooves. Each zone has a panel-surface label (engraved) and a display well containing the data. The sidebar itself has no separate background — it IS the panel surface, separated from the main content by a vertical groove.

## 7. Global Shell

### Header Bar
Brushed-metal panel strip matching the page panel surface. Brand name and nav items are engraved text on the warm metal — `color: var(--color-neutral-400/500)` with `text-shadow: 0 1px 0 rgba(255,255,255,0.35)`. No raised buttons for nav; active state indicated by green LED dot below the item. The header is the top edge of the instrument, not a separate dark bar.

### Body Background
Dark workbench surface (#3a3836). The warm dark tone suggests the surface the instrument sits on. Subtle grain texture via `::after` pseudo-element on body.

## 8. Do's and Don'ts

### Do:
- **Do** use the chassis > panel > display well hierarchy for every page. The chassis is the frame, the panel is the working surface, display wells contain all data.
- **Do** add specular blooms to panel surfaces. Without them, the panel reads as flat colored rectangles instead of brushed metal.
- **Do** use grooves between functional zones. They are the structural joints of the instrument.
- **Do** use monospace type inside display wells and condensed uppercase labels on panel surfaces. The font signals the surface.
- **Do** give LED indicators a glow halo. A dot without glow looks like a CSS circle; a dot with glow looks like a physical LED.
- **Do** use the engraved text-shadow on all panel-surface text. Without it, text sits on top of the surface rather than being pressed into it.

### Don't:
- **Don't** put data content directly on the panel surface. All data, lists, values, and readouts go inside display wells.
- **Don't** use dark text on light backgrounds inside display wells. Wells are LCD screens: light text (green/white) on near-black.
- **Don't** use glassmorphism, backdrop-filter, or transparency effects. The instrument aesthetic is opaque materials: metal, plastic, glass screens. Not frosted glass.
- **Don't** use blue as an accent color anywhere. The instrument palette is green/amber/red. Blue was the old theme.
- **Don't** use gradient text, side-stripe borders, bounce animations, or hero-metric templates.
- **Don't** create flat cards floating on backgrounds. Use the chassis > panel construction. A "card" is a panel zone separated by grooves, not a floating rectangle with a border.
- **Don't** use raw hex values in component code. Reference design tokens (`var(--green)`, `var(--panel-mid)`, `var(--well-deep)`).
