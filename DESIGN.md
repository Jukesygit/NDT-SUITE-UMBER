---
name: Matrix Portal
description: Clean, content-first interface for NDT inspection visualization and reporting
colors:
  green: "#2d8a4e"
  green-bright: "#35a058"
  green-dark: "#206b3a"
  amber: "#d4981e"
  red: "#c0392b"
  bg: "#f5f4f0"
  surface: "#ffffff"
  surface-secondary: "#fafaf8"
  border: "#e5e3de"
  border-strong: "#d5d3ce"
  text-primary: "#1c1b18"
  text-secondary: "#4a4845"
  text-tertiary: "#7a7672"
  text-quaternary: "#9a968f"
  dark-bg: "#1a1917"
  dark-surface: "#252422"
  dark-surface-secondary: "#2a2926"
  dark-border: "#3a3835"
  dark-text-primary: "#e8e6e1"
  dark-text-secondary: "#a8a49d"
  dark-text-tertiary: "#7a7672"
typography:
  body:
    fontFamily: "Barlow, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Barlow, -apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Barlow, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    textTransform: "uppercase"
    letterSpacing: "0.06em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, Consolas, Monaco, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  card:
    background: "var(--clean-surface)"
    border: "1px solid var(--clean-border)"
    borderRadius: "14px"
    padding: "20px"
  badge:
    borderRadius: "9999px"
    padding: "2px 10px"
    fontSize: "11px"
    fontWeight: 500
  button-primary:
    background: "var(--clean-green)"
    color: "#ffffff"
    borderRadius: "10px"
    padding: "8px 16px"
  button-secondary:
    background: "var(--clean-surface)"
    border: "1px solid var(--clean-border)"
    borderRadius: "10px"
    padding: "8px 16px"
  tab:
    background: "var(--clean-tab-track-bg)"
    borderRadius: "10px"
    activeBackground: "var(--clean-tab-active-bg)"
  divider:
    height: "1px"
    background: "var(--clean-divider)"
---

# Design System: Matrix Portal

## 1. Overview

**Creative North Star: "Content-First Clarity"**

Matrix Portal's interface is clean, warm, and professional. The aesthetic draws from modern productivity tools (Notion, Linear, Figma) adapted for industrial inspection workflows. Surfaces are simple and honest: white cards on warm off-white backgrounds, separated by subtle borders. The work (scans, models, reports, data) dominates the viewport. UI chrome recedes.

**Key Characteristics:**
- Warm off-white background (#f5f4f0) with white card surfaces, never cold blue-gray
- Typography and spacing create hierarchy, not simulated materials
- Green accent (#2d8a4e / #35a058) used sparingly for interactive elements and healthy status
- Colored badge pills for status: green (complete), blue (in progress), amber (review/warning), neutral (not started)
- Full light/dark mode support via CSS custom properties (--clean-* namespace)
- System preference detection with manual toggle override

## 2. Surfaces

### Background
Warm off-white (#f5f4f0 light, #1a1917 dark). This is the page canvas.

### Cards
White surfaces (#ffffff light, #252422 dark) with 1px border (--clean-border) and 14px radius. Cards contain related content groups. No shadows by default; optional subtle shadow for elevated elements (dropdowns, modals).

### Dividers
1px solid lines using --clean-divider. Used between major content sections. No grooves, no dual-tone tricks.

## 3. Colors

### Warm Neutrals
Every neutral carries warm umber undertones, never cool blue-gray:

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| --clean-bg | #f5f4f0 | #1a1917 | Page background |
| --clean-surface | #ffffff | #252422 | Card/panel surfaces |
| --clean-surface-secondary | #fafaf8 | #2a2926 | Nested surfaces, hover states |
| --clean-border | #e5e3de | #3a3835 | Card borders, dividers |
| --clean-text-primary | #1c1b18 | #e8e6e1 | Headings, primary content |
| --clean-text-secondary | #4a4845 | #a8a49d | Body text, descriptions |
| --clean-text-tertiary | #7a7672 | #7a7672 | Metadata, timestamps |
| --clean-text-quaternary | #9a968f | #5a5754 | Placeholders, disabled |

### Semantic Accents
Color is functional, never decorative:

| Meaning | Color | Badge BG (light) | Badge Text (light) |
|---------|-------|-------------------|---------------------|
| Active / Complete | Green #2d8a4e | #e6f4ec | #1a6b3a |
| In Progress | Blue #3b82f6 | #e6eef9 | #1e5bb8 |
| Warning / Review | Amber #d4981e | #faf0d8 | #8a6210 |
| Error / Critical | Red #c0392b | #fde8e8 | #9b2c2c |
| Neutral | Gray | #f0efec | #5a5754 |

### Named Rules

**The Warm Neutral Rule.** No neutral is cool-tinted. Every gray carries umber warmth.

**The Accent Budget.** Green accent appears on primary buttons, active status indicators, and progress fills. It occupies less than 10% of any viewport. Other colors appear only inside status badges or error states.

## 4. Typography

**Body:** Barlow (400/500, 14px) for all flowing text
**Headings:** Barlow (600, 18-24px) for page and section titles
**Labels:** Barlow (600, 11px, uppercase, 0.06em tracking) for section labels and chip text
**Data:** JetBrains Mono (400, 13px) for numeric values, code, and data that users compare or copy

### Hierarchy

| Element | Font | Size | Weight | Notes |
|---------|------|------|--------|-------|
| Page title | Barlow | 24px | 600 | One per page |
| Section label | Barlow | 11px | 600 | Uppercase, wide tracking, --clean-text-tertiary |
| Card heading | Barlow | 15px | 600 | Inside cards |
| Body text | Barlow | 14px | 400 | Default |
| Small text | Barlow | 12px | 400 | Metadata, timestamps |
| Data value | JetBrains Mono | 24px | 600 | Stat readouts |
| Data label | JetBrains Mono | 11px | 400 | Below stat values |
| Badge | Barlow | 11px | 500 | Inside status pills |

## 5. Components

### Cards (.pj-card)
White surface, 1px border, 14px radius. Interior padding 20px. No nesting cards inside cards. Group related content; separate groups with dividers or new cards.

### Buttons (.pj-btn)
Flat, 10px radius. Three variants:
- **Primary**: Green background (#2d8a4e), white text. For the main action on a page.
- **Secondary**: White/surface background, border. For supporting actions.
- **Danger**: Red background for destructive actions (delete, remove).

All buttons: 13px Barlow 500, 8px 16px padding, no gradients, no text-shadows. Disabled state reduces opacity to 0.5.

### Badges (.pj-badge)
Pill-shaped (border-radius: 9999px). Tinted background with matching text color per semantic meaning. 2px 10px padding. Optional LED dot prefix (6px solid circle) for status.

### Tabs (.pj-tab)
Segmented control inside a rounded track (--clean-tab-track-bg, 10px radius). Active tab pops to white/surface with subtle shadow. 10px 16px padding. Tab counts in a smaller muted chip.

### Filter Chips (.pj-filter-chip)
Pill border buttons. Active state fills dark (--clean-chip-active-bg) with white text. Inactive has border and surface background. 6px 14px padding.

### Progress Bars (.pj-progress-track)
4px tall rounded track. Fill uses green. Complete state uses full green. Animated width transition.

### Dropdowns (.pj-status-menu, .pj-dropdown-menu)
White/surface card with border and shadow. 8px radius. Items are full-width buttons with hover highlight. Positioned absolutely below trigger.

### Forms (.pj-form-card)
Card wrapper around form groups. Labels are 11px uppercase Barlow 600. Inputs have 1px border, 8px radius, 9px 12px padding. Focus adds green ring.

### Alerts (.pj-alert)
Full-width banners. Success: green-tinted background. Error: red-tinted background. 12px radius, 12px 16px padding.

## 6. Layout

### Page Container (.pj-page)
Max-width 1200px, centered, 32px padding. Background is --clean-bg.

### Content Sections
Separated by dividers (1px --clean-divider). Section labels (11px uppercase) precede content groups.

### Grids
Cards in responsive grids. 16px gap default. Two-column for readout cards, single-column for lists.

## 7. Dark Mode

Implemented via CSS custom properties with `data-theme` attribute on `<html>`:
- `data-theme="light"` forces light
- `data-theme="dark"` forces dark
- No attribute: follows `prefers-color-scheme`

ThemeProvider (React context) manages state with localStorage persistence. The toggle cycles: system -> light -> dark -> system.

All component styles use `var(--clean-*)` tokens, making them automatically theme-aware. No component needs conditional class names for theme.

## 8. Do's and Don'ts

### Do:
- **Do** use --clean-* CSS custom properties for all colors. Never hardcode hex in components.
- **Do** let whitespace create hierarchy. Generous padding, clear sections.
- **Do** use typography scale for hierarchy. Size and weight differences, not color tricks.
- **Do** keep badges small and pill-shaped. Status is communicated, not shouted.
- **Do** test both light and dark modes for every new component.
- **Do** use the card component for content groups, dividers between sections.

### Don't:
- **Don't** add shadows to cards unless they're elevated (dropdowns, modals).
- **Don't** use gradients on surfaces or buttons. Flat, solid colors.
- **Don't** nest cards inside cards. Use dividers or spacing instead.
- **Don't** use glow effects, text-shadows, neumorphic shadows, or faux-material textures.
- **Don't** use blue as a decorative accent. Blue appears only in "in progress" status badges.
- **Don't** create new CSS classes when a --clean-* token handles it.
- **Don't** use inline rgba() color values. Map them to tokens.
