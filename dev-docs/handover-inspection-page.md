# Inspection Page Redesign - Handover Document

## Current Status: Phase 1 COMPLETED

### Project Overview
Redesigning the InspectionPage for an NDT (Non-Destructive Testing) PAUT inspection tool. The goal is a professional inspection workflow with:
- 70/30 split layout (main content + sidebar)
- Inline-editable description/notes
- Strakes with coverage tracking
- Findings system with Code A-E severity (future phase)
- Auto-generated professional reports (future phase)

### Strategic Documents
- **Plan**: `dev-docs/inspection-page-plan.md` - Full strategic plan with 5 phases
- **Tasks**: `dev-docs/inspection-page-tasks.md` - Checklist with completion status

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | **COMPLETED** | Layout restructure - 70/30 grid, 3 new components |
| Phase 2 | Not Started | Findings system (DB + UI with Code A-E severity) |
| Phase 3 | Not Started | Strake diagram feature |
| Phase 4 | Not Started | Multiple inspectors |
| Phase 5 | Not Started | Report generation with @react-pdf/renderer |

---

## Phase 1 Components Created

1. **InspectionSummary.tsx** (`src/pages/data-hub/components/`)
   - Displays inspection metadata (date, status, client ref)
   - Inline-editable description textarea (blur-to-save)
   - Status dropdown with typed union: `'planned' | 'in_progress' | 'completed' | 'on_hold'`

2. **InspectionSidebar.tsx** (`src/pages/data-hub/components/`)
   - CompactDrawingCard for GA/Location drawings
   - PhotosGrid for vessel images
   - QuickActions panel
   - StatsPanel showing inspection statistics

3. **StrakesSection.tsx** (`src/pages/data-hub/components/`)
   - Main content with strake cards
   - Coverage progress bars
   - Scan thumbnails per strake
   - Unassigned scans section

4. **InspectionPage.tsx** (Modified)
   - CSS Grid layout: `gridTemplateColumns: '1fr 320px'`
   - Uses React Query for all data fetching
   - Handles all CRUD operations via mutation hooks

---

## UI Issues Resolved

### 1. Layout Not Working (Full-Width Stacking)
**Problem**: Tailwind flex classes weren't creating the 70/30 split - components stacked vertically.
**Solution**: Changed to CSS Grid with inline styles:
```tsx
style={{
    display: 'grid',
    gridTemplateColumns: '1fr 320px',
    gap: '24px',
    alignItems: 'start',
}}
```

### 2. Missing CSS Variable `--accent-primary`
**Problem**: Used in 42 places but never defined.
**Solution**: Added to `src/styles/glassmorphic.css`:
```css
--accent-primary: rgba(100, 150, 255, 0.9);
```

### 3. Hardcoded White Text Colors
**Problem**: `color: 'white'` was hardcoded instead of using CSS variables.
**Solution**: Changed to `color: 'var(--text-primary)'` in InspectionSummary and InspectionSidebar.

### 4. SVG Icons Massively Oversized
**Problem**: Tailwind sizing classes (`w-3 h-3`, `w-12 h-12`) weren't working on SVGs in upload dialogs. Icons were expanding to fill their containers.

**Root Cause**: In `src/styles/reset.css`, the CSS reset had:
```css
svg {
  max-width: 100%;  /* This caused SVGs to expand */
  display: block;
}
```

**Solution**: Modified reset.css to:
```css
svg {
  display: block;
  flex-shrink: 0;
}
```

This allows Tailwind sizing utilities to work correctly on all SVGs throughout the app.

### 5. Button Styles Not Applying (CRITICAL FIX)
**Problem**: Buttons in dialogs and popouts had no styling - they appeared as plain unstyled buttons.

**Root Cause**: The codebase had THREE conflicting button systems:
1. `components-new.css`: BEM style `.btn.btn--primary` (requires base `.btn` class)
2. `glassmorphic.css`: Flat style `.btn-primary` (no base class needed)
3. `index.css`: `.btn-primary:not(.btn)` legacy compatibility selector

When components used `className="btn-primary"`:
- `index.css` had `.btn-primary:not(.btn)` which only matched elements WITHOUT `.btn` class
- `glassmorphic.css` was not imported globally, so it wasn't available on all pages
- These two CSS definitions had DIFFERENT padding, height, and appearance

**Solution (Multi-Part Fix)**:
1. **Import glassmorphic.css globally** in `src/styles/main.css`:
   ```css
   @import './glassmorphic.css';
   ```

2. **Remove conflicting button styles** from `src/index.css`:
   - Removed the `.btn-primary:not(.btn)` selector and related legacy button definitions
   - Added comment explaining that button classes are in glassmorphic.css

3. **Standardize button class usage**:
   - Use `className="btn-primary"` (not `btn btn-primary`)
   - Use `className="btn-secondary"` (not `btn btn-secondary`)
   - Use `className="btn-success"`, `className="btn-danger"` as needed

**CSS Architecture Rule (IMPORTANT FOR FUTURE)**:
```
✅ DO: Use single button class: className="btn-primary"
❌ DON'T: Use Bootstrap-style: className="btn btn-primary"
❌ DON'T: Add button styles to index.css - they go in glassmorphic.css ONLY
```

Button styles are defined in `glassmorphic.css` lines 226-354:
- `.btn-primary` - Blue gradient button
- `.btn-secondary` - Glass/transparent button
- `.btn-success` - Green gradient button
- `.btn-danger` - Red gradient button

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/pages/data-hub/InspectionPage.tsx` | Main page orchestrator |
| `src/pages/data-hub/components/InspectionSummary.tsx` | Metadata + editable description |
| `src/pages/data-hub/components/InspectionSidebar.tsx` | Drawings, photos, actions |
| `src/pages/data-hub/components/StrakesSection.tsx` | Strake cards with coverage |
| `src/pages/data-hub/components/ImageUploadDialog.tsx` | Multi-image upload dialog |
| `src/pages/data-hub/components/DrawingUploadDialog.tsx` | Drawing upload dialog |
| `src/hooks/mutations/useInspectionMutations.ts` | All mutation hooks |
| `src/hooks/queries/useDataHub.ts` | All query hooks |
| `src/styles/reset.css` | CSS reset (SVG fix is here) |
| `src/styles/glassmorphic.css` | Button styles, CSS variables, glass effects |
| `src/styles/main.css` | Main CSS entry point - imports glassmorphic.css |
| `src/index.css` | Tailwind + layout styles (NO button styles!) |

---

## Architecture Patterns (Follow These)

1. **React Query for ALL data fetching** - No useState + useEffect patterns
2. **CSS Variables for theming** - Use `var(--text-primary)`, `var(--accent-primary)`, etc.
3. **Inline styles for layout** - CSS Grid with inline styles is more reliable than Tailwind for complex layouts
4. **Tailwind for utilities** - Sizing, spacing, colors work correctly now that SVG reset is fixed
5. **TypeScript union types** - For status fields, use typed unions not strings

---

## Next Steps (Phase 2: Findings System)

According to `dev-docs/inspection-page-tasks.md`:

### Database
- [ ] Create findings table migration SQL
- [ ] Add RLS policies for findings
- [ ] Run migration in Supabase

### Service Layer
- [ ] Add findings methods to asset-service.js

### React Query Hooks
- [ ] Create `src/hooks/queries/useFindings.ts`
- [ ] Create `src/hooks/mutations/useFindingMutations.ts`

### UI Components
- [ ] FindingsSection.tsx
- [ ] FindingCard.tsx with severity badge
- [ ] FindingSeverityBadge.tsx (color-coded A-E)
- [ ] CreateFindingDialog.tsx

### Severity Codes
- **Code A**: Excellent condition (green)
- **Code B**: Good condition (blue)
- **Code C**: Acceptable, minor issues (yellow)
- **Code D**: Requires attention (orange)
- **Code E**: Critical, immediate action (red)

---

## Build Status
Last build: **SUCCESS** (no TypeScript or compilation errors)

Run `npm run build` to verify before making changes.
