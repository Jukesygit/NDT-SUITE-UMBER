# Inspection Page Frontend Rebuild Guide

## Overview

This document outlines the design philosophy, root causes of UI issues, and best practices for rebuilding the Inspection Page frontend to avoid recurring styling problems.

---

## Design Philosophy

### 1. Glassmorphic Design System

The NDT Suite uses a **glassmorphic** design system characterized by:

- **Semi-transparent backgrounds** with blur effects (`backdrop-filter: blur()`)
- **Subtle borders** using `rgba(255, 255, 255, 0.12)` style colors
- **Soft shadows** for depth
- **White/light text** on dark backgrounds
- **Blue accent color** (`rgba(100, 150, 255, 0.9)`) for primary actions
- **Semantic colors** for status: green (success), yellow (warning), red (danger)

### 2. Core Design Tokens

All styling should reference CSS variables from `glassmorphic.css`:

```css
/* Text Colors */
--text-primary: #ffffff;
--text-secondary: rgba(255, 255, 255, 0.85);
--text-tertiary: rgba(255, 255, 255, 0.7);
--text-dim: rgba(255, 255, 255, 0.55);

/* Glass Backgrounds */
--glass-bg-primary: rgba(20, 25, 35, 0.75);
--glass-bg-secondary: rgba(30, 35, 45, 0.65);
--glass-bg-tertiary: rgba(35, 40, 50, 0.7);

/* Borders */
--glass-border: rgba(255, 255, 255, 0.12);
--glass-border-strong: rgba(255, 255, 255, 0.18);

/* Accent */
--accent-primary: rgba(100, 150, 255, 0.9);
```

---

## Root Causes of UI Issues

### Problem 1: CSS Architecture Conflicts

**What happened:**
- Multiple CSS systems existed: Tailwind, `components-new.css` (BEM), `glassmorphic.css` (flat)
- Conflicting selectors for the same classes (e.g., `.btn-primary`)
- Reset styles stripping button backgrounds before glassmorphic could apply

**Solution:**
- Use **ONLY** `glassmorphic.css` for component styling
- Button classes now use `!important` to override Tailwind's preflight
- Single source of truth for all UI components

### Problem 2: Inline Style Overrides

**What happened:**
```tsx
// BAD - inline styles override CSS classes
<button className="btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }}>
```

**Why it's bad:**
- Inline styles have highest specificity - they ALWAYS override CSS classes
- Creates inconsistency - some buttons look different than others
- Makes global style changes impossible

**Solution:**
```tsx
// GOOD - use modifier classes
<button className="btn-primary btn-sm">

// CSS provides the size variant
.btn-sm {
    padding: 6px 12px !important;
    font-size: var(--text-xs) !important;
}
```

### Problem 3: CSS Variable Concatenation

**What happened:**
```tsx
// BAD - produces invalid CSS "var(--warning)20"
style={{ background: `${cssVariable}20` }}
```

CSS variables are strings like `var(--warning)`, not hex values. Appending `20` for alpha doesn't work.

**Solution:**
```tsx
// GOOD - use explicit RGBA values
const STATUS_OPTIONS = [
    {
        value: 'in_progress',
        color: 'rgba(251, 191, 36, 1)',      // Full color
        bgColor: 'rgba(251, 191, 36, 0.15)', // 15% alpha background
        borderColor: 'rgba(251, 191, 36, 0.3)' // 30% alpha border
    },
];
```

### Problem 4: Tailwind Class Conflicts

**What happened:**
- Mixing Tailwind utilities (`text-xs`, `flex`, `gap-1`) with custom classes (`btn-primary`)
- Tailwind's reset (`@tailwind base`) strips button backgrounds
- Order of CSS imports matters for specificity

**Solution:**
- Custom button classes now use `!important` for key properties
- Avoid mixing Tailwind sizing utilities with glassmorphic buttons
- Use CSS-based size variants (`btn-sm`, `btn-xs`) instead

---

## Correct Button Usage

### Available Button Classes

```css
/* Primary (Blue gradient) */
.btn-primary { }

/* Secondary (Glass background) */
.btn-secondary { }

/* Success (Green gradient) */
.btn-success { }

/* Danger (Red gradient) */
.btn-danger { }
```

### Size Modifiers

```css
/* Default - 11px padding, 15px font */
.btn-primary { }

/* Small - 6px 12px padding, 11px font */
.btn-primary.btn-sm { }

/* Extra Small - 4px 8px padding, 11px font */
.btn-primary.btn-xs { }
```

### Correct Examples

```tsx
// Standard button
<button className="btn-primary">
    Submit
</button>

// Small button with icon
<button className="btn-secondary btn-sm">
    <svg>...</svg>
    Add Item
</button>

// Danger button in dialog
<button className="btn-danger">
    Delete
</button>
```

### What NOT to Do

```tsx
// DON'T use inline styles for padding/font
<button className="btn-primary" style={{ padding: '6px 12px' }}>

// DON'T mix Tailwind sizing with button classes
<button className="btn-primary text-xs p-2">

// DON'T use old BEM-style classes
<button className="btn btn-primary btn--small">
```

---

## Component Structure Guidelines

### 1. Use Predefined Panels and Cards

```tsx
// Glass panel with standard padding
<div className="glass-panel" style={{ padding: 'var(--spacing-lg)' }}>

// Glass card for clickable items
<div className="glass-card">
```

### 2. Text Color Classes

```tsx
// Primary text (white)
<h2 style={{ color: 'var(--text-primary)' }}>

// Secondary text (85% white)
<p style={{ color: 'var(--text-secondary)' }}>

// Dim text (55% white)
<span style={{ color: 'var(--text-dim)' }}>
```

### 3. Status Badges

Use explicit RGBA colors, not CSS variable concatenation:

```tsx
const STATUS_COLORS = {
    planned: {
        color: 'rgba(59, 130, 246, 1)',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    in_progress: {
        color: 'rgba(251, 191, 36, 1)',
        bgColor: 'rgba(251, 191, 36, 0.15)',
        borderColor: 'rgba(251, 191, 36, 0.3)',
    },
    completed: {
        color: 'rgba(34, 197, 94, 1)',
        bgColor: 'rgba(34, 197, 94, 0.15)',
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
};
```

---

## File Structure for Rebuild

```
src/pages/data-hub/
├── InspectionPage.tsx          # Main page container
├── components/
│   ├── InspectionSidebar.tsx   # Left navigation sidebar
│   ├── InspectionSummary.tsx   # Header with metadata
│   ├── StrakesSection.tsx      # Main content - strakes grid
│   ├── DrawingsSection.tsx     # GA and Location drawings
│   └── dialogs/
│       ├── CreateInspectionDialog.tsx
│       ├── ImageUploadDialog.tsx
│       ├── DrawingUploadDialog.tsx
│       └── ScanReassignDialog.tsx
```

---

## Checklist for New Components

Before creating any new component:

- [ ] **NO inline style for padding, font-size, or colors** - use classes
- [ ] **Button classes:** Use `btn-primary`, `btn-secondary`, `btn-success`, `btn-danger`
- [ ] **Button sizing:** Use `btn-sm` or `btn-xs` modifier classes
- [ ] **Text colors:** Use `style={{ color: 'var(--text-primary)' }}` etc.
- [ ] **Backgrounds:** Use `var(--glass-bg-primary)` etc.
- [ ] **Borders:** Use `var(--glass-border)` etc.
- [ ] **Status colors:** Use explicit RGBA, never concatenate CSS variables

---

## CSS Import Order (Critical)

The order in `main.css` must be:

```css
@import './design-tokens.css';    /* 1. Variables */
@import './reset.css';            /* 2. Reset */
@import './base.css';             /* 3. Base elements */
@import './components-new.css';   /* 4. Legacy components */
@import './glassmorphic.css';     /* 5. Glassmorphic (FINAL - overrides all) */
@import './utilities.css';        /* 6. Utilities */
```

In `index.css`, Tailwind loads first:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

This means `glassmorphic.css` loads AFTER Tailwind, so its `!important` declarations will win.

---

## Testing Checklist

After making style changes:

1. **Build check:** `npm run build` - catches TypeScript errors
2. **Visual check:** Open the page and verify:
   - Buttons have visible backgrounds (not transparent)
   - Button text is white and readable
   - Hover states work (slight lift, glow)
   - Status badges have correct background colors
   - No browser console CSS errors

---

## Summary

**The golden rules:**

1. **Never use inline styles** for padding, font-size, or colors
2. **Use CSS class variants** (`btn-sm`) instead of inline overrides
3. **Use explicit RGBA colors** for dynamic status backgrounds
4. **Reference CSS variables** for all colors and spacing
5. **Test visually** after every style change

Following these guidelines will prevent the CSS specificity wars that caused the button styling issues.
