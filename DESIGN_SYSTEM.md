# NDT Suite - Unified Design System

**Version:** 2.0
**Last Updated:** November 2025
**Status:** ✅ Active

---

## 📚 Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Design Tokens](#design-tokens)
4. [Components](#components)
5. [Best Practices](#best-practices)
6. [Migration Guide](#migration-guide)

---

## Overview

The NDT Suite Unified Design System provides a consistent, scalable, and professional foundation for building interfaces. It consolidates three previous design systems into one cohesive solution.

### Key Principles

- **Minimal & Professional** - Clean aesthetics that project professionalism
- **Consistent** - Predictable patterns across all components
- **Scalable** - Easy to extend and maintain
- **Accessible** - WCAG 2.1 AA compliant focus states and contrast

### Architecture

```
src/styles/
├── design-system-unified.css  ← Design tokens & foundation
├── components-unified.css      ← Component library
└── index.css                   ← Main entry point + legacy compatibility
```

---

## Getting Started

### Installation

The design system is already integrated. Simply import components and use classes:

```jsx
import React from 'react';

function MyComponent() {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Hello World</h3>
      </div>
      <div className="card-body">
        <p>This uses the unified design system</p>
        <button className="btn btn-primary">Click Me</button>
      </div>
    </div>
  );
}
```

### Design Tokens

All tokens are available as CSS custom properties:

```css
/* Typography */
var(--text-base)      /* 16px */
var(--font-semibold)  /* 600 */

/* Spacing */
var(--space-4)        /* 16px */

/* Colors */
var(--color-primary-500)
var(--text-primary)

/* Effects */
var(--transition-base)
var(--shadow-lg)
```

---

## Design Tokens

### Typography Scale

Based on a **1.25 modular scale** with 16px base:

| Token | Size | Usage |
|-------|------|-------|
| `--text-2xs` | 10px | Fine print, badges |
| `--text-xs` | 12px | Labels, captions |
| `--text-sm` | 14px | Body text (secondary) |
| `--text-base` | **16px** | Body text (primary) |
| `--text-lg` | 18px | Subheadings |
| `--text-xl` | 20px | Section titles |
| `--text-2xl` | 24px | Page titles |
| `--text-3xl` | 30px | Hero headlines |
| `--text-4xl` | 36px | Display text |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--font-light` | 300 | Decorative only |
| `--font-normal` | 400 | Body text |
| `--font-medium` | 500 | Emphasis |
| `--font-semibold` | 600 | Headings, labels |
| `--font-bold` | 700 | Strong emphasis |

### Spacing System (8px Grid)

| Token | Size | Example Use |
|-------|------|-------------|
| `--space-1` | 4px | Icon gaps |
| `--space-2` | 8px | Tight spacing |
| `--space-3` | 12px | Input padding |
| `--space-4` | 16px | Standard gap |
| `--space-6` | 24px | Card padding |
| `--space-8` | 32px | Section spacing |
| `--space-12` | 48px | Large sections |

### Color System

#### Primary Colors

```css
--color-primary-500: #0967d2  /* Main brand color */
--color-primary-400: #2186eb  /* Hover state */
--color-primary-600: #0552b5  /* Active state */
```

#### Semantic Colors

```css
--color-success: #10b981  /* Green - Success states */
--color-warning: #f59e0b  /* Amber - Warning states */
--color-danger: #ef4444   /* Red - Error/delete actions */
--color-info: #3b82f6     /* Blue - Informational */
```

#### Text Colors (Dark Theme)

```css
--text-primary: #ffffff     /* Headings, important text */
--text-secondary: #e5e9ed   /* Body text */
--text-tertiary: #a8b5c1    /* Secondary info */
--text-muted: #7b8794       /* Placeholders */
--text-disabled: #5a6772    /* Disabled states */
```

#### Glass Morphism

```css
--glass-bg: rgba(255, 255, 255, 0.03)
--glass-border: rgba(255, 255, 255, 0.08)
```

### Border Radius

| Token | Size | Usage |
|-------|------|-------|
| `--radius-sm` | 6px | Badges, tags |
| `--radius-md` | 10px | Inputs, buttons |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-xl` | 16px | Modals |
| `--radius-2xl` | 20px | Hero sections |

### Shadows

```css
--shadow-sm   /* Subtle elevation */
--shadow-md   /* Standard depth */
--shadow-lg   /* Prominent elevation */
--shadow-xl   /* Modal/overlay */
--shadow-glass /* Glassmorphic cards */
```

### Transitions

```css
--transition-fast: 150ms  /* Hover states */
--transition-base: 250ms  /* Standard animations */
--transition-slow: 350ms  /* Complex transitions */
```

---

## Components

### Buttons

#### Usage

```jsx
<button className="btn btn-primary">Primary Action</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-ghost">Tertiary</button>
<button className="btn btn-success">Save</button>
<button className="btn btn-danger">Delete</button>
```

#### Sizes

```jsx
<button className="btn btn-primary btn-sm">Small</button>
<button className="btn btn-primary">Default</button>
<button className="btn btn-primary btn-lg">Large</button>
```

#### Icon Button

```jsx
<button className="btn btn-icon btn-secondary">
  <IconComponent />
</button>
```

#### Variants & States

| Class | Appearance | Usage |
|-------|------------|-------|
| `.btn-primary` | Blue gradient | Primary CTAs, submit actions |
| `.btn-secondary` | Glass effect | Secondary actions |
| `.btn-ghost` | Transparent | Tertiary/cancel actions |
| `.btn-success` | Green gradient | Confirmation, save |
| `.btn-danger` | Red gradient | Delete, destructive actions |

**States:**
- Hover: `translateY(-2px)` + enhanced shadow
- Active: Return to base position
- Disabled: 50% opacity, no pointer events

---

### Inputs

#### Basic Input

```jsx
<input
  type="text"
  className="input"
  placeholder="Enter text..."
/>
```

#### With Icon

```jsx
<div className="input-group">
  <input
    type="email"
    className="input input-with-icon"
    placeholder="Email"
  />
  <span className="input-icon">
    <IconEmail />
  </span>
</div>
```

#### Textarea

```jsx
<textarea
  className="textarea"
  placeholder="Enter description..."
  rows="4"
/>
```

#### Select

```jsx
<select className="select">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

#### States

```jsx
<input className="input input-error" />   /* Error state */
<input className="input input-success" /> /* Success state */
<input className="input" disabled />      /* Disabled */
```

---

### Cards

#### Basic Card

```jsx
<div className="card">
  <div className="card-header">
    <h3 className="card-title">Card Title</h3>
    <p className="card-subtitle">Optional subtitle</p>
  </div>
  <div className="card-body">
    <p>Card content goes here</p>
  </div>
  <div className="card-footer">
    <button className="btn btn-primary">Action</button>
  </div>
</div>
```

#### Variants

```jsx
<div className="card card-compact">
  <!-- Less padding -->
</div>

<div className="card card-elevated">
  <!-- Enhanced shadow & gradient -->
</div>
```

**Features:**
- Auto glass effect with backdrop blur
- Top highlight line for polish
- Hover elevation (`translateY(-2px)`)

---

### Badges

#### Usage

```jsx
<span className="badge">Default</span>
<span className="badge badge-primary">Primary</span>
<span className="badge badge-success">Active</span>
<span className="badge badge-warning">Pending</span>
<span className="badge badge-danger">Error</span>
```

#### Sizes

```jsx
<span className="badge badge-sm">Small</span>
<span className="badge">Default</span>
<span className="badge badge-lg">Large</span>
```

---

### Modals

#### Structure

```jsx
<div className="modal-overlay">
  <div className="modal">
    <div className="modal-header">
      <h2 className="modal-title">Modal Title</h2>
    </div>
    <div className="modal-body">
      <p>Modal content...</p>
    </div>
    <div className="modal-footer">
      <button className="btn btn-ghost">Cancel</button>
      <button className="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

**Features:**
- Backdrop blur overlay
- Center-aligned with max 90% viewport
- Scale-in animation
- Proper scrolling for overflow content

---

### Loading States

#### Spinner

```jsx
<div className="spinner"></div>
<div className="spinner spinner-sm"></div>
<div className="spinner spinner-lg"></div>
```

#### Skeleton Loading

```jsx
<div className="skeleton skeleton-text"></div>
<div className="skeleton skeleton-title"></div>
<div className="skeleton skeleton-button"></div>
<div className="skeleton skeleton-card"></div>
```

---

### Navigation

#### Nav Item

```jsx
<a href="/page" className="nav-item">
  <IconComponent />
  <span>Page Name</span>
</a>

<a href="/active" className="nav-item active">
  <IconComponent />
  <span>Active Page</span>
</a>
```

**Features:**
- Hover background transition
- Active state with left border accent
- Icon + text layout

---

## Best Practices

### Do's ✅

1. **Use Design Tokens**
   ```css
   /* Good */
   padding: var(--space-4);

   /* Avoid */
   padding: 16px;
   ```

2. **Semantic Component Classes**
   ```jsx
   /* Good */
   <button className="btn btn-danger">Delete</button>

   /* Avoid */
   <button style={{ background: 'red' }}>Delete</button>
   ```

3. **Consistent Spacing**
   ```jsx
   /* Good - uses 8px grid */
   <div className="gap-4 p-6">

   /* Avoid - arbitrary values */
   <div style={{ gap: '13px', padding: '19px' }}>
   ```

4. **Interactive States**
   ```css
   /* Always include hover states */
   .custom-element:hover {
     transform: translateY(-2px);
   }
   ```

### Don'ts ❌

1. **Don't Override Core Tokens**
   ```css
   /* Bad - creates inconsistency */
   :root {
     --text-base: 18px; /* Don't change */
   }
   ```

2. **Don't Use Fixed Heights on Flex Children**
   ```css
   /* Bad - breaks responsiveness */
   .tool-container {
     min-height: 100vh; /* Use height: 100% instead */
   }
   ```

3. **Don't Mix Old and New Classes**
   ```jsx
   /* Bad - confusing */
   <button className="btn-primary glass-card">

   /* Good - use unified system */
   <button className="btn btn-primary">
   ```

4. **Don't Skip Accessibility**
   ```jsx
   /* Bad */
   <div onClick={handleClick}>Click me</div>

   /* Good */
   <button onClick={handleClick}>Click me</button>
   ```

---

## Migration Guide

### From Old Classes to New

| Old Class | New Class | Notes |
|-----------|-----------|-------|
| `.glass-card` | `.card` | Auto-aliased for compatibility |
| `.glass-panel` | `.card` | Same component |
| `.glass-input` | `.input` | |
| `.glass-textarea` | `.textarea` | |
| `.glass-select` | `.select` | |
| `.glass-badge` | `.badge` | |
| `.btn-primary` (old) | `.btn .btn-primary` | Must include `.btn` base |
| `.badge-blue` | `.badge-primary` | |
| `.badge-green` | `.badge-success` | |

### Step-by-Step Migration

1. **Identify Components Using Old Classes**
   ```bash
   # Search for old patterns
   grep -r "glass-card" src/
   grep -r "btn-primary" src/ --exclude="*.css"
   ```

2. **Update Incrementally**
   ```jsx
   // Before
   <div className="glass-card">
     <button className="btn-primary">Save</button>
   </div>

   // After
   <div className="card">
     <button className="btn btn-primary">Save</button>
   </div>
   ```

3. **Test Each Component**
   - Visual regression check
   - Hover states work
   - Responsive behavior intact

4. **Remove Legacy Compatibility**
   Once migration is complete, remove from `index.css`:
   ```css
   /* Remove these after full migration */
   .glass-card { @apply card; }
   ```

---

## Component Checklist

When creating new components:

- [ ] Uses design tokens for sizing
- [ ] Has hover states (where applicable)
- [ ] Has focus states (keyboard navigation)
- [ ] Uses semantic colors (success/danger/warning)
- [ ] Follows 8px spacing grid
- [ ] Respects typography scale
- [ ] Has disabled state (for interactive elements)
- [ ] Works at mobile viewport (320px+)
- [ ] Properly handles overflow content
- [ ] Tested in Firefox, Chrome, Safari

---

## Resources

- **Design Tokens:** `src/styles/design-system-unified.css`
- **Components:** `src/styles/components-unified.css`
- **Examples:** See existing pages (DataHubPage, PersonnelManagementPage)
- **Support:** Check IMPLEMENTATION_GUIDE.md for general architecture

---

## Changelog

### Version 2.0 (November 2025)
- ✅ Consolidated three design systems into one
- ✅ Standardized spacing to 8px grid
- ✅ Unified typography scale (1.25 ratio)
- ✅ Created comprehensive component library
- ✅ Fixed layout container height issues
- ✅ Added Tailwind integration
- ✅ Improved accessibility (focus states)

### Version 1.0 (Original)
- Initial glassmorphic design
- Multiple competing systems

---

**Questions?** Check the inline comments in the CSS files or review existing component usage in the codebase.
