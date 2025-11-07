# Design Tokens Quick Reference

## 🎨 Colors

### Primary (Blue - Technical)
```css
--color-primary-500: #3b82f6  /* Main brand color */
--color-primary-400: #60a5fa  /* Hover state */
--color-primary-600: #2563eb  /* Active state */
```

### Semantic Colors
```css
/* Success */
--color-success: #22c55e
--color-success-light: #4ade80
--color-success-dark: #15803d

/* Warning */
--color-warning: #f97316
--color-warning-light: #fb923c
--color-warning-dark: #c2410c

/* Danger */
--color-danger: #ef4444
--color-danger-light: #f87171
--color-danger-dark: #b91c1c
```

### Surfaces (Dark Theme)
```css
--surface-base: #0a0f1a      /* Page background */
--surface-raised: #121825    /* Cards, panels */
--surface-elevated: #1a2332  /* Modals, dropdowns */
--surface-overlay: #222b3d   /* Overlays */
```

### Text Colors
```css
--text-primary: rgba(255, 255, 255, 0.95)    /* Headings */
--text-secondary: rgba(255, 255, 255, 0.75)  /* Body text */
--text-tertiary: rgba(255, 255, 255, 0.55)   /* Labels */
--text-quaternary: rgba(255, 255, 255, 0.38) /* Placeholders */
```

### Borders
```css
--border-subtle: rgba(255, 255, 255, 0.06)
--border-default: rgba(255, 255, 255, 0.1)
--border-strong: rgba(255, 255, 255, 0.15)
```

## 📐 Spacing (8px Grid)

```css
--spacing-1: 0.25rem   /* 4px  - Tiny gaps */
--spacing-2: 0.5rem    /* 8px  - Small gaps */
--spacing-3: 0.75rem   /* 12px - Form fields */
--spacing-4: 1rem      /* 16px - Standard */
--spacing-5: 1.25rem   /* 20px - Medium */
--spacing-6: 1.5rem    /* 24px - Large */
--spacing-8: 2rem      /* 32px - Sections */
--spacing-12: 3rem     /* 48px - Page margins */
```

## 🔤 Typography

### Font Sizes
```css
--text-xs: 0.75rem     /* 12px - Captions */
--text-sm: 0.875rem    /* 14px - Labels */
--text-base: 1rem      /* 16px - Body */
--text-lg: 1.125rem    /* 18px - Subheadings */
--text-xl: 1.25rem     /* 20px - Card titles */
--text-2xl: 1.5rem     /* 24px - Section titles */
--text-3xl: 1.875rem   /* 30px - Page titles */
--text-4xl: 2.25rem    /* 36px - Hero text */
```

### Font Weights
```css
--font-normal: 400     /* Body text */
--font-medium: 500     /* Labels, buttons */
--font-semibold: 600   /* Headings */
--font-bold: 700       /* Emphasis */
```

## 🎯 Border Radius

```css
--radius-sm: 0.25rem   /* 4px  - Small elements */
--radius-md: 0.375rem  /* 6px  - Inputs, buttons */
--radius-lg: 0.5rem    /* 8px  - Cards */
--radius-xl: 0.75rem   /* 12px - Large cards */
--radius-2xl: 1rem     /* 16px - Modals */
--radius-full: 9999px  /* Pills, circles */
```

## 💫 Shadows

```css
--shadow-sm: 0 2px 4px -1px rgba(0, 0, 0, 0.1)
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.15)
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.2)
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.25)
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.35)
```

### Colored Shadows (for focus/hover)
```css
--shadow-primary: 0 4px 12px rgba(59, 130, 246, 0.15)
--shadow-success: 0 4px 12px rgba(34, 197, 94, 0.15)
--shadow-danger: 0 4px 12px rgba(239, 68, 68, 0.15)
```

## ⏱️ Transitions

```css
--duration-fast: 150ms     /* Hovers, micro-interactions */
--duration-normal: 250ms   /* Standard transitions */
--duration-slow: 350ms     /* Complex animations */

--ease-out: cubic-bezier(0, 0, 0.2, 1)
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
```

## 📏 Component Sizes

### Buttons
```css
--button-height-sm: 2rem    /* 32px */
--button-height-md: 2.5rem  /* 40px */
--button-height-lg: 3rem    /* 48px */
```

### Inputs
```css
--input-height-sm: 2rem     /* 32px */
--input-height-md: 2.5rem   /* 40px */
--input-height-lg: 3rem     /* 48px */
```

## 🎨 Usage Examples

### Using Colors
```jsx
<div style={{
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)'
}}>
  Content
</div>
```

### Using Spacing
```jsx
<div style={{
  padding: 'var(--spacing-6)',
  marginBottom: 'var(--spacing-4)',
  gap: 'var(--spacing-3)'
}}>
  Content
</div>
```

### Using Typography
```jsx
<h2 style={{
  fontSize: 'var(--text-2xl)',
  fontWeight: 'var(--font-semibold)',
  color: 'var(--text-primary)'
}}>
  Heading
</h2>
```

## 🎯 Common Patterns

### Card Component
```css
background: var(--surface-raised);
border: 1px solid var(--border-subtle);
border-radius: var(--radius-xl);
padding: var(--spacing-6);
box-shadow: var(--shadow-md);
```

### Button (Primary)
```css
background: var(--color-primary-500);
color: white;
padding: var(--spacing-3) var(--spacing-6);
border-radius: var(--radius-md);
font-weight: var(--font-medium);
transition: all var(--duration-fast);
```

### Input Field
```css
background: var(--surface-raised);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
padding: var(--spacing-3) var(--spacing-4);
color: var(--text-primary);
height: var(--input-height-md);
```

### Badge
```css
background: rgba(59, 130, 246, 0.15);
color: var(--color-primary-300);
border: 1px solid rgba(59, 130, 246, 0.3);
padding: var(--spacing-1) var(--spacing-3);
border-radius: var(--radius-full);
font-size: var(--text-xs);
font-weight: var(--font-medium);
```

## 🎨 Color Combinations

### Success State
```css
background: rgba(34, 197, 94, 0.1);
color: var(--color-success-light);
border: 1px solid rgba(34, 197, 94, 0.3);
```

### Warning State
```css
background: rgba(249, 115, 22, 0.1);
color: var(--color-warning-light);
border: 1px solid rgba(249, 115, 22, 0.3);
```

### Danger State
```css
background: rgba(239, 68, 68, 0.1);
color: var(--color-danger-light);
border: 1px solid rgba(239, 68, 68, 0.3);
```

## 📱 Responsive Values

### Container Widths
```css
--container-sm: 640px   /* Small screens */
--container-md: 768px   /* Tablets */
--container-lg: 1024px  /* Laptops */
--container-xl: 1280px  /* Desktops */
--container-2xl: 1536px /* Large displays */
```

### Breakpoints
```css
/* Mobile First */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
```

## 🔧 Z-Index Scale

```css
--z-base: 0        /* Default */
--z-dropdown: 100  /* Dropdowns */
--z-sticky: 200    /* Sticky elements */
--z-fixed: 300     /* Fixed positioned */
--z-overlay: 400   /* Overlays */
--z-modal: 500     /* Modals */
--z-tooltip: 600   /* Tooltips */
--z-toast: 800     /* Notifications */
```

## 💡 Pro Tips

1. **Always use tokens** - Never hard-code colors or sizes
2. **Maintain consistency** - Use the same token for the same purpose
3. **Think in spacing units** - Use multiples of 8px (4px for fine-tuning)
4. **Layer with z-index** - Use the scale, don't make up numbers
5. **Semantic naming** - Use purpose-based classes, not style-based

## 📊 Accessibility

### Contrast Ratios (WCAG AA)
- Primary text: 7:1 minimum
- Secondary text: 4.5:1 minimum
- Interactive elements: 3:1 minimum

### Focus States
```css
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
```

---

**Tip**: Keep this reference open while developing for quick token lookup!
