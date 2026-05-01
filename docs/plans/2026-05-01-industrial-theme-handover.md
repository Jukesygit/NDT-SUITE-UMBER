# Industrial Instrument Theme - Site-Wide Conversion Handover

## Goal

Convert all remaining pages from the legacy glassmorphic style to the **industrial instrument** design language. The three main section pages (Projects, Personnel, Documents) are already converted. Everything else still uses the old `glass-card`, `backdrop-filter`, `--accent-primary` (blue) approach and needs to match.

---

## The Design Language (Non-Negotiable)

### Physical Metaphor: Chassis > Panel > Well

Every page is a **physical instrument panel**. The hierarchy:

1. **Chassis** -- dark outer frame. `border-radius: 14px`, dark gradient, heavy drop shadow.
2. **Panel** -- brushed-metal surface inside the chassis. Light warm-gray gradient (`--panel-top` to `--panel-bot`). Has a `::before` for subtle vertical grain texture and `::after` for a specular bloom (radial gradient highlight at top center).
3. **Display Wells** -- recessed LCD-screen areas sunk into the panel. Dark gradient (`--well-mid` to `--well-floor`), heavy inset shadows. Green-on-dark monospace text. These are for data readouts.
4. **Controls** -- raised buttons, dropdowns, toggles sitting ON the panel surface. Use `--ctrl` / `--ctrl-hi` gradients with 3D shadow treatment.

Content lives either **on the panel surface** (labels, metadata, controls) or **inside wells** (data, tables, readouts). Never floating in between.

### Groove Dividers

Grooves separate zones on the panel surface. They are 2px-tall 3-stop gradients simulating a machined line:
```css
height: 2px;
background: linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 50%, rgba(255,255,255,0.40) 100%);
box-shadow: 0 1px 0 rgba(255,255,255,0.18), 0 -1px 0 rgba(0,0,0,0.06);
```

### LED Indicators

Status dots use radial gradients with glow box-shadows:
- **Active/success**: green (`--green-bright`, `--green-glow`)
- **Warning**: amber (`--amber`)
- **Danger**: red (`--red`)
- **Neutral**: gray
- **Info**: blue (used sparingly)

### Color Rules

- **Green** (#2d8a4e / #35a058) is the primary accent. No blue (`--accent-primary` is banned).
- **Amber** (#d4981e) for warnings only.
- **Red** (#c0392b) for danger/destructive only.
- Panel-surface text uses `--color-neutral-*` tokens (400/500/600/700). NEVER `--text-primary` or `--text-secondary` on the panel -- those are near-black and designed for dark wells.
- LCD/well text uses `rgba(53, 160, 88, *)` greens with `text-shadow: 0 0 6px var(--green-glow-soft)`.
- Every neutral must be warm-tinted (the `--color-neutral-*` scale already is). No pure `#000` or `#fff`.

### Typography

| Context | Font | Size | Color |
|---------|------|------|-------|
| Panel labels | `var(--font-label)` (Barlow Condensed) | 9-11px, uppercase, letter-spacing 0.10-0.14em | `--color-neutral-500` with `text-shadow: 0 1px 0 rgba(255,255,255,0.45)` |
| Panel values | `var(--font-mono)` (JetBrains Mono) | 11-13px | `--color-neutral-700` |
| LCD readout text | `var(--font-mono)` | 9-13px | `rgba(53, 160, 88, 0.55-0.70)` with green glow shadow |
| Big readout numbers | `var(--font-mono)` | 28px, weight 600 | `var(--green-bright)` with `text-shadow: 0 0 12px var(--green-glow)` |
| Body/description | `var(--font-sans)` (Barlow) | 12-13px | `--color-neutral-600` on panel, green on dark |

### Absolute Bans

- `backdrop-filter: blur()` -- glassmorphic, not industrial
- `--accent-primary` -- that's blue, we use green
- `--surface-elevated`, `--glass-border`, `glass-card`, `glass-input`, `glass-panel` -- all legacy
- Side-stripe borders (`border-left > 1px` as accent) -- DESIGN.md ban
- Gradient text (`background-clip: text`) -- DESIGN.md ban
- `#000` or `#fff` raw -- tint toward brand hue
- Inline `rgba()` for colors that have tokens

---

## CSS Architecture

### Prefix Convention

Each page section owns a CSS prefix. Never cross prefixes:

| Prefix | Page | CSS File |
|--------|------|----------|
| `pj-` | Projects (all sub-pages) | `src/pages/projects/projects.css` |
| `pm-` | Personnel | `src/pages/personnel/personnel.css` |
| `dc-` | Documents | `src/pages/documents/document-control.css` |
| `pf-` | Profile (NEEDS CONVERSION) | `src/pages/profile/profile.css` |

New pages being converted should get their own prefix OR reuse an existing one if they're a sub-page of a converted section.

### Reusable Patterns (copy from existing, don't reinvent)

These CSS blocks are identical across projects.css, personnel.css, and document-control.css. When converting a new page, copy the pattern from one of these files:

- **Chassis + Panel** -- the outer frame and metal surface
- **Display Well** -- recessed dark LCD area
- **Groove** -- horizontal and vertical dividers
- **LED dots** -- status indicators with glow
- **Buttons** -- raised primary/secondary/ghost
- **Section labels** -- uppercase panel-surface labels
- **Nameplate bar** -- bottom bar with product name

### Don't Create Inline Styles For These

The following have existing CSS classes. Use them:

| Need | Class(es) | Don't Do |
|------|-----------|----------|
| Page frame | `xx-chassis` > `xx-panel` | `style={{ background: 'linear-gradient...' }}` |
| Data area | `xx-display-well` > `xx-display` | Inline dark background |
| Divider | `xx-groove` | `style={{ borderTop: '1px solid...' }}` |
| Status dot | `xx-led active/warning/danger/neutral` | Inline colored circles |
| Button | `xx-btn primary/secondary` | `style={{ background: 'rgba(53,160,88,...)', ... }}` |
| Section title | `xx-section-label` | Inline font styling |
| Empty state | `xx-empty` > `xx-empty-text` | Inline centered text |
| Progress bar | `xx-progress-track` > `xx-progress-fill` | Inline width/background |

---

## What's Already Converted (DO NOT TOUCH)

| Page | File | Status |
|------|------|--------|
| Project List | `src/pages/projects/ProjectListPage.tsx` | Done -- full industrial |
| Project Setup | `src/pages/projects/ProjectSetupPage.tsx` | Done -- full industrial |
| Project Detail / Trip View | `src/pages/projects/ProjectDetailPage.tsx` | Done -- full industrial |
| Vessel Overview | `src/pages/projects/VesselOverviewPage.tsx` | Done -- panel-surface metadata + LCD readouts + collapsible wells |
| Vessel Overview sub-components | `src/components/projects/vessel-overview/*.tsx` | Done |
| Vessel Overview collapsible sections | `src/components/projects/inspection-detail/*.tsx` | Done |
| Personnel | `src/pages/personnel/PersonnelPage.tsx` | Done -- full industrial |
| Documents | `src/pages/documents/DocumentsPage.tsx` | Done -- full industrial |

---

## What Needs Converting (YOUR WORK)

### Priority 1: Full Page Conversions

#### Profile Page (`src/pages/profile/`)
- **CSS**: `src/pages/profile/profile.css` (736 lines, prefix `pf-`)
- **Component**: `src/pages/profile/ProfilePage.tsx` (611 lines)
- **Current state**: Full glassmorphic -- `glass-card`, `backdrop-filter`, `--accent-primary`, `--surface-elevated`
- **Sub-components**: Check `src/pages/profile/` for tab components
- **Approach**: Rewrite `profile.css` to industrial theme. Use `pf-chassis` > `pf-panel` > `pf-display-well`. Profile fields can be panel-surface metadata (like vessel identity). Security/2FA settings can be in wells.
- **Suggested prefix**: `pf-`

#### Admin Page (`src/pages/admin/`)
- **Entry**: `src/pages/admin/AdminPage.tsx` (135 lines)
- **Tabs**: `src/pages/admin/tabs/` -- UsersTab, OverviewTab, ActivityLogTab, ConfigurationTab, OrganizationsTab, NotificationsTab, CompetencyTypesTab
- **Modals**: `src/pages/admin/modals/` -- OrganizationDetailModal, NotificationDetailModal
- **Components**: `src/pages/admin/components/` -- CustomNotifications, PersonnelSelector, NotificationHistory, ExpiryRemindersSettings
- **Current state**: Mix of shared UI components + inline styles + glassmorphic classes
- **Approach**: Create `src/pages/admin/admin.css` with `ad-` prefix. The admin page is a tabbed dashboard -- tabs sit on the panel surface, tab content lives in a display well. Data tables already use `DataTable` component which will need its own well treatment.
- **Suggested prefix**: `ad-`

#### Login Page (`src/pages/LoginPageNew.tsx`)
- **Size**: 851 lines
- **Current state**: Heavy inline styles, custom one-off design
- **Approach**: This is a standalone page. Use chassis > panel for the login card. The login form inputs should look like recessed input wells. Keep it simple -- single centered panel.
- **Suggested prefix**: `lg-` or inline within a single file since it's self-contained

#### Downloads Page (`src/pages/DownloadsPage.tsx`)
- **Size**: 143 lines
- **Current state**: Uses `PageHeader` + glassmorphic cards
- **Approach**: Wrap in chassis > panel. Download items in a display well or card grid.

#### Legal Pages (`src/pages/legal/`)
- **Files**: `PrivacyPolicyPage.tsx` and likely others
- **Current state**: Uses `--surface-elevated`, glassmorphic tokens
- **Approach**: Wrap in chassis > panel. Long-form text in a display well.

### Priority 2: Modals & Shared Components

#### Document Modals (`src/pages/documents/modals/`)
- `CreateDocumentModal.tsx`, `CreateRevisionModal.tsx`
- Currently use glassmorphic styling
- Convert to industrial modal: dark overlay + panel-styled dialog with well for form content

#### Personnel Modals (`src/pages/personnel/`)
- `CompetencyPickerModal.tsx`
- Same treatment as document modals

#### Shared UI Components (`src/components/ui/`)
- `InlineEditField.tsx` -- uses `--surface-elevated`, `--text-tertiary`, `--border-default`. These are semantic tokens that map to light-theme values. On industrial pages we've replaced this with custom panel-field components (see `VesselIdentityCard.tsx` for the pattern). Consider whether to add a `variant` prop or leave page-specific implementations.
- `PageHeader.tsx` -- uses `--surface-elevated`. May need an industrial variant or to be replaced with the panel header pattern on converted pages.
- `Modal.tsx` -- uses `glass-card`. Needs industrial variant for use on converted pages.

### Priority 3: Scan Viewer & Report Builder

#### Scan Viewer Landing (`src/pages/ScanViewerLandingPage.tsx`)
- **Size**: 797 lines
- **Current state**: Custom components, likely mixed styling
- **Approach**: Wrap in chassis > panel. Directory browser in a well, file lists in wells.

#### Report Builder (`src/pages/projects/ReportBuilderPage.tsx`)
- **Current state**: Uses `glass-card`
- **Approach**: Already within the projects section, so use `pj-` prefix and the existing projects.css. Report editing area in a large display well.

---

## Conversion Checklist (Per Page)

For each page you convert, follow this sequence:

1. **Read the existing page** -- understand the layout zones, data flow, and interactions
2. **Create or extend the CSS file** -- use the page's prefix, copy chassis/panel/well/groove patterns from `projects.css`
3. **Wrap in chassis > panel** -- the outermost structure
4. **Identify zones** -- what's panel-surface content (labels, controls, metadata) vs. well content (data, tables, readouts)
5. **Add grooves** between zones
6. **Add section labels** above each zone
7. **Convert buttons** -- raised controls on panel, green ghost buttons in wells
8. **Convert status indicators** -- LED dots with glow
9. **Add nameplate bar** at the bottom
10. **Remove ALL glassmorphic references** -- grep for `glass-`, `--accent-primary`, `backdrop-filter`, `--surface-elevated` in the converted files
11. **Verify panel text colors** -- must use `--color-neutral-*` on panel, green `rgba()` in wells. Never `--text-primary` on the panel surface.
12. **Test build** -- `npm run build` must pass clean

---

## Reference Files

Read these before starting:

| File | Why |
|------|-----|
| `src/pages/projects/projects.css` | Most complete industrial CSS reference (2100+ lines). Copy patterns from here. |
| `src/pages/projects/VesselOverviewPage.tsx` | Best example of mixed panel-surface + well layout with visual hierarchy zones |
| `src/pages/personnel/PersonnelPage.tsx` | Good example of stats panel + table in well |
| `src/pages/documents/DocumentsPage.tsx` | Good example of document grid in well |
| `src/styles/design-tokens.css` | All CSS custom properties -- chassis, panel, well, ctrl, neutral, green tokens |
| `src/styles/industrial-theme.css` | Global industrial overrides (header, sidebar integration) |
| `dev-docs/design-system.md` | Full design system reference |
| `DESIGN.md` (project root) | Design principles, absolute bans, color strategy |

---

## Common Mistakes to Avoid

1. **Don't inline what has a class.** If you're writing `style={{ background: 'linear-gradient(180deg, var(--well-mid)...' }}`, stop -- use the well class.
2. **Don't use `--text-primary` on the panel surface.** It's `#1c1b18` (near-black), designed for dark wells. Panel surface text is `--color-neutral-500` (labels) or `--color-neutral-700` (values).
3. **Don't nest wells inside wells.** Inner items inside a well use `rgba(0, 0, 0, 0.20)` + `border: 1px solid rgba(53, 160, 88, 0.10)`. Light containment, not another full well.
4. **Don't use blue anywhere.** The accent is green. If you see `--accent-primary`, replace it. If you need a secondary color, use amber.
5. **Don't forget the `::before` and `::after` on panels.** The grain texture and specular bloom are what make the metal surface feel real.
6. **Don't create new design tokens.** Everything you need is in `design-tokens.css`. Use the existing `--green-*`, `--color-neutral-*`, `--well-*`, `--panel-*`, `--ctrl-*` variables.
7. **Don't put 20 inline styles on a div.** If you need more than 3-4 style properties, create a CSS class in the page's CSS file.
8. **Don't forget z-index: 1 on content.** The panel's `::after` (specular bloom) covers content without it.
9. **Don't animate layout properties.** Use `transform` and `opacity` only.
10. **Don't skip the nameplate bar.** Every page gets one at the bottom: product name + page identifier.

---

## Design Token Quick Reference

```
Chassis:     --chassis, --chassis-inner
Panel:       --panel-top, --panel-mid, --panel-bot
Wells:       --well-rim, --well-mid, --well-deep, --well-floor
Controls:    --ctrl, --ctrl-hi, --ctrl-lo
Greens:      --green, --green-bright, --green-dark, --green-glow, --green-glow-soft
Amber:       --amber
Red:         --red
Neutrals:    --color-neutral-400 through --color-neutral-700 (panel text)
Fonts:       --font-label (Barlow Condensed), --font-mono (JetBrains Mono), --font-sans (Barlow)
```
