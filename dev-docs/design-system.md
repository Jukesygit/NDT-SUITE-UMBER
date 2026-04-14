# Matrix Portal Design System Reference

> **For Claude / future engineers:** Read this before writing ANY UI code.
> Do not invent styles. Use existing classes and tokens documented here.

---

## Quick Rules

1. **Never use raw `rgba()` values** — use CSS custom properties (`var(--text-secondary)`, `var(--accent-blue-subtle)`, etc.)
2. **Never invent inline styles for common patterns** — check this doc for the right class
3. **Never use raw Tailwind for colors/spacing** when a design token or CSS class exists
4. **Always check `src/styles/`** before writing new styles
5. **Always check `src/components/ui/`** before building new UI primitives

---

## Page Layout Pattern

Every page follows this structure:

```tsx
// Scrollable page (Personnel, Downloads, Documents)
<div className="h-full overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
    <PageHeader title="..." subtitle="..." icon={<svg>...</svg>} />
    {/* Page content */}
</div>

// Full-bleed tool page (Vessel Modeler, C-Scan Visualizer)
<div className="tool-container" style={{ height: 'calc(100vh - var(--header-height, 4rem))' }}>
    <ToolComponent />
</div>
```

- **Scrollable pages**: `h-full overflow-y-auto glass-scrollbar` + `padding: 32px 40px`
- **Full-bleed tools**: `tool-container` class removes padding/max-width constraints

---

## Page Header

Use the shared `PageHeader` component from `src/components/ui/PageHeader.tsx`:

```tsx
import { PageHeader } from '../components/ui/PageHeader';

<PageHeader
    title="Page Title"
    subtitle="Description of what this page does"
    icon={
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="..." />
        </svg>
    }
/>
```

- `icon` is optional but recommended — renders a 48px gradient badge (matches Personnel, Admin, Downloads)
- Title: 28px, weight 600, `rgba(255, 255, 255, 0.95)`
- Subtitle: 14px, weight 300, `rgba(255, 255, 255, 0.75)`

---

## Cards

### `glass-card` (primary — use for content cards)
Glassmorphic card with backdrop blur, subtle border, hover lift effect.
```tsx
<div className="glass-card" style={{ padding: '24px' }}>
    {/* content */}
</div>
```
- Source: `glassmorphic.css`
- Background: `var(--card-bg)` — `rgba(30, 41, 59, 0.85)`
- Border: `var(--glass-border)` — `rgba(255, 255, 255, 0.12)`
- Hover: lifts 2px + blue border tint

### `card` (secondary — use for structured data containers)
Simpler raised surface card with header/body/footer slots.
```tsx
<div className="card card--elevated">
    <div className="card__header">
        <h3 className="card__title">Title</h3>
        <p className="card__subtitle">Subtitle</p>
    </div>
    <div className="card__body">Content</div>
    <div className="card__footer">Actions</div>
</div>
```
- Source: `components-new.css`
- Modifiers: `card--elevated` (shadow), `card--interactive` (cursor + hover lift)

### `glass-panel` (tertiary — use for toolbars, tab bars, sidebars)
```tsx
<div className="glass-panel">...</div>
```
- Source: `glassmorphic.css`
- Like `glass-card` but with `var(--glass-bg-primary)` and standard radius

---

## Buttons

Two button systems exist. Use the one that matches surrounding code.

### System 1: BEM classes (`components-new.css`)
```tsx
<button className="btn btn--primary">Primary</button>
<button className="btn btn--secondary">Secondary</button>
<button className="btn btn--ghost">Ghost</button>
<button className="btn btn--danger">Danger</button>
<button className="btn btn--success">Success</button>
```
- Sizes: `btn--sm`, `btn--md`, `btn--lg`
- Icon slot: `<span className="btn__icon">...</span>`

### System 2: Glass classes (`glassmorphic.css`)
```tsx
<button className="btn-primary">Primary</button>
<button className="btn-secondary">Secondary</button>
<button className="btn-success">Success</button>
<button className="btn-danger">Danger</button>
```
- Sizes: `btn-sm`, `btn-xs`
- These use `!important` overrides — used in glassmorphic contexts (modals, sidebars)

### When to use which
- **New standalone pages**: use `btn btn--primary` (BEM system)
- **Inside glass panels/modals/sidebars**: use `btn-primary` (glass system)
- **When in doubt**: match what surrounding code uses

---

## Badges

```tsx
<span className="badge badge--primary">v1.0.0</span>     {/* Blue — versions, primary info */}
<span className="badge badge--success">Active</span>      {/* Green — positive status */}
<span className="badge badge--warning">Expiring</span>    {/* Orange — caution */}
<span className="badge badge--danger">Expired</span>      {/* Red — error/critical */}
<span className="badge badge--neutral">Windows</span>     {/* Gray — metadata, tags */}
```
- Source: `components-new.css`
- All badges are pill-shaped (`border-radius: 9999px`), with colored background + border

---

## Inputs

### BEM system (`components-new.css`)
```tsx
<div className="input-group">
    <label className="input-group__label">Label</label>
    <input className="input" placeholder="..." />
    <span className="input-group__hint">Helper text</span>
    <span className="input-group__error">Error message</span>
</div>
```
- Sizes: `input--sm`, `input--md`, `input--lg`
- Error state: `input--error`

### Glass system (`glassmorphic.css`)
```tsx
<input className="glass-input" placeholder="..." />
```
- Used inside glassmorphic contexts (sidebars, modals)

---

## React UI Components (`src/components/ui/`)

| Component | Import | Usage |
|-----------|--------|-------|
| `PageHeader` | `import { PageHeader } from '../components/ui'` | Page title with icon badge |
| `Spinner` / `PageSpinner` / `SectionSpinner` | `import { PageSpinner } from '../components/ui'` | Loading states |
| `ErrorDisplay` / `InlineError` | `import { ErrorDisplay } from '../components/ui'` | Error display |
| `EmptyState` / `NoSearchResults` | `import { EmptyState } from '../components/ui'` | Empty states |
| `DataTable` | `import { DataTable } from '../components/ui'` | Sortable data tables |
| `Modal` / `ConfirmDialog` | `import { Modal } from '../components/ui'` | Modal dialogs |
| `FormField` / `FormSelect` / `FormTextarea` | `import { FormField } from '../components/ui'` | Form inputs |

Always check if a UI component exists before building a new one.

---

## Design Tokens

### Colors — use these, not raw values

| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` | `rgba(255, 255, 255, 0.95)` | Headings, important text |
| `--text-secondary` | `rgba(255, 255, 255, 0.75)` | Body text, descriptions |
| `--text-tertiary` | `rgba(255, 255, 255, 0.55)` | Muted text, hints |
| `--text-quaternary` | `rgba(255, 255, 255, 0.38)` | Placeholders |
| `--text-disabled` | `rgba(255, 255, 255, 0.25)` | Disabled state |
| `--accent-primary` | `rgba(100, 150, 255, 0.9)` | Primary accent |
| `--accent-blue-bright` | `rgba(140, 190, 255, 1)` | Bright blue for icons |
| `--accent-blue-subtle` | `rgba(100, 150, 255, 0.15)` | Blue tint backgrounds |
| `--accent-blue-glow` | `rgba(100, 150, 255, 0.3)` | Blue border glow |

### Surfaces

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-base` | `#0a0f1a` | Page background |
| `--surface-raised` | `#121825` | Card backgrounds |
| `--surface-elevated` | `#1a2332` | Elevated surfaces |
| `--surface-overlay` | `#222b3d` | Overlay/modal backgrounds |
| `--glass-bg-primary` | `rgba(20, 25, 35, 0.75)` | Glass panel background |
| `--glass-bg-secondary` | `rgba(30, 35, 45, 0.65)` | Glass input/secondary bg |
| `--card-bg` | `rgba(30, 41, 59, 0.85)` | Glass card background |

### Borders

| Token | Usage |
|-------|-------|
| `--border-subtle` | Faint separators |
| `--border-default` | Standard borders |
| `--border-strong` | Emphasized borders |
| `--border-accent` | Blue accent borders |
| `--glass-border` | Glass component borders |

### Spacing

| Token | Value |
|-------|-------|
| `--spacing-xs` | 4px |
| `--spacing-sm` | 8px |
| `--spacing-md` | 16px |
| `--spacing-lg` | 24px |
| `--spacing-xl` | 32px |
| `--spacing-2xl` | 48px |
| `--spacing-3xl` | 64px |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 8px | Small elements |
| `--radius-md` | 12px | Inputs, panels |
| `--radius-lg` | 16px | Cards |
| `--radius-xl` | 20px | Large cards |
| `--radius-full` | 9999px | Pills, badges |

### Typography

| Token | Value |
|-------|-------|
| `--text-xs` | 0.75rem (12px) |
| `--text-sm` | 0.875rem (14px) |
| `--text-base` | 1rem (16px) |
| `--text-lg` | 1.125rem (18px) |
| `--text-xl` | 1.25rem (20px) |
| `--text-2xl` | 1.5rem (24px) |
| `--text-3xl` | 1.875rem (30px) |
| `--font-normal` | 400 |
| `--font-medium` | 500 |
| `--font-semibold` | 600 |
| `--font-bold` | 700 |

---

## Anti-Patterns (DO NOT)

```tsx
// BAD: Raw rgba values
style={{ color: 'rgba(255, 255, 255, 0.75)' }}
// GOOD: Design token
style={{ color: 'var(--text-secondary)' }}

// BAD: Inventing card styles
<div className="rounded-xl p-6" style={{ background: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
// GOOD: Use glass-card
<div className="glass-card" style={{ padding: '24px' }}>

// BAD: Custom button styling
<button className="px-5 py-2.5 rounded-lg" style={{ background: 'linear-gradient(...)' }}>
// GOOD: Use button class
<button className="btn btn--primary">

// BAD: Custom badge
<span className="inline-flex text-xs text-slate-500">v1.0</span>
// GOOD: Use badge class
<span className="badge badge--primary">v1.0</span>

// BAD: Inventing page header
<div style={{ background: 'linear-gradient(135deg, rgba(15,23,42,0.95)...)', borderBottom: '1px solid ...' }}>
// GOOD: Use PageHeader component
<PageHeader title="..." subtitle="..." icon={...} />
```

---

## Source Files

| File | Purpose |
|------|---------|
| `src/styles/design-tokens.css` | CSS custom properties (colors, spacing, typography, shadows) |
| `src/styles/glassmorphic.css` | Glass effects, glass-card, glass-panel, glass buttons/inputs |
| `src/styles/components-new.css` | BEM component classes (btn, card, badge, input, etc.) |
| `src/styles/layout.css` | Layout utilities |
| `src/styles/utilities.css` | Helper classes |
| `src/styles/base.css` | Element defaults |
| `src/styles/reset.css` | CSS reset |
| `src/components/ui/` | React UI components (PageHeader, Modal, DataTable, Form, etc.) |
