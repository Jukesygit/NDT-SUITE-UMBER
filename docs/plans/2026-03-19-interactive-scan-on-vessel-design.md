# Interactive C-Scan Composites on Vessel Shell

## Objective

Replace the current PNG-based workflow for mapping C-scan composites onto the 3D vessel model with a structured data pipeline that:

1. Preserves thickness data through the entire workflow (enabling interactive hover)
2. Auto-sizes and auto-places scans using real axis coordinates
3. Stores composites and vessel models in Supabase (minimizing data transfer over poor offshore connections)

## Current Workflow (Problem)

1. User creates composite in CscanVisualizer (2D Plotly heatmap)
2. Exports composite as PNG
3. Opens VesselModeler, imports PNG as image texture
4. Manually drags, scales, and rotates the image to approximate position
5. **All thickness data is lost** - the 3D view is just a picture

## New Workflow (Solution)

1. User creates composite in CscanVisualizer
2. Clicks **"Save to Cloud"** - structured data uploads to Supabase
3. Opens VesselModeler, clicks **"Import Scan Composite"**
4. Selects composite from list, enters placement parameters:
   - **Index start position (mm)** - longitudinal position on vessel
   - **Scan direction** - Clockwise or Counterclockwise from TDC (12 o'clock)
   - **Index direction** - Forward or Reverse along vessel axis
5. Scan auto-sizes from axis data and renders as interactive heatmap texture
6. **Mouseover shows thickness** at any point on the scan

---

## Data Model

### Table: `scan_composites`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Primary key |
| name | text | User-given name |
| organization_id | uuid (FK) | RLS / multi-tenant isolation |
| created_by | uuid (FK) | User who created it |
| thickness_data | jsonb | 2D thickness matrix with null representation |
| x_axis | jsonb | Scan axis coordinates in mm (circumferential) |
| y_axis | jsonb | Index axis coordinates in mm (longitudinal) |
| stats | jsonb | Min, max, mean, median, std dev, valid points |
| width | int | Number of scan axis points |
| height | int | Number of index axis points |
| source_files | jsonb | Original CSV filenames and regions |
| created_at | timestamptz | |

### Table: `vessel_models`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Primary key |
| name | text | User-given name |
| organization_id | uuid (FK) | RLS |
| created_by | uuid (FK) | |
| config | jsonb | Full vessel state (dimensions, orientation, annotations, welds, textures, etc.) |
| created_at | timestamptz | |

### Table: `vessel_scan_placements`

| Column | Type | Purpose |
|--------|------|---------|
| id | uuid (PK) | Primary key |
| vessel_model_id | uuid (FK) | FK to vessel_models |
| scan_composite_id | uuid (FK) | FK to scan_composites |
| index_start_mm | float | Longitudinal start position on vessel |
| scan_direction | text | 'cw' or 'ccw' from TDC |
| index_direction | text | 'forward' or 'reverse' |
| created_at | timestamptz | |

### Future extensibility

Tables are independent now. Later, add columns:
- `asset_id` on vessel_models (Asset > Vessel > Inspection hierarchy)
- `inspection_id` on vessel_scan_placements (tie placements to inspection dates)

### RLS policies

All tables use `organization_id` matching and `auth.uid()` checks, consistent with existing patterns.

---

## Coordinate Mapping

### Axis semantics

- **Scan axis (x_axis)** = circumferential distance around vessel (mm)
- **Index axis (y_axis)** = longitudinal distance along vessel (mm)

### Mapping to vessel surface

- Scan axis values convert to **degrees**: `angle = scan_mm / (pi * diameter) * 360`
- Index axis values map directly to **axial position** (mm from placement origin)
- Scan direction (CW/CCW) determines angle sign
- Index direction (forward/reverse) determines axial offset sign

### Placement origin

- **Circumferential**: TDC (top dead center / 12 o'clock) = 90 degrees in vessel modeler coordinate system
- **Longitudinal**: User-specified `index_start_mm` from tangent line

### Auto-sizing

Physical dimensions come directly from axis data:
- Width (circumferential) = `max(x_axis) - min(x_axis)` mm → degrees on vessel
- Height (longitudinal) = `max(y_axis) - min(y_axis)` mm

No manual scaling required.

---

## Rendering Approach

### Canvas-generated texture (Option 1 - recommended)

1. Create offscreen HTML5 Canvas sized to thickness matrix dimensions
2. For each cell in the matrix:
   - Normalize value: `t = (value - min) / (max - min)`
   - Map to RGB using selected colorscale (Jet, Viridis, etc.)
   - Null values → transparent pixels
3. Create `THREE.CanvasTexture` from the canvas
4. Apply to the curved mesh from `createTexturePlane()` (existing geometry code)

This reuses the entire existing texture pipeline. The only difference from current PNG textures is that the image is generated from data instead of loaded from a file.

### Colorscale controls (on placed scan)

- Colorscale selection: Jet, Viridis, Plasma, etc.
- Min/max range sliders (for adjusting contrast)
- Opacity slider
- Changes re-render the canvas texture (near-instant for typical scan sizes)

---

## Interactive Hover

### Raycasting

The vessel modeler already raycasts for annotation placement. Extend this:

1. `THREE.Raycaster` intersects scan mesh on mousemove
2. Intersection provides UV coordinates
3. Map UVs to matrix indices: `col = u * width`, `row = v * height`
4. Look up `thickness_data[row][col]`

### Tooltip display

On hover over a scan area, show:
- **Thickness value** (mm) with decimal precision
- **Position**: axial distance (mm) + circumferential angle (degrees)
- **Color indicator** matching the heatmap color at that value
- Optional: pass/fail against nominal thickness (if configured)

### Tooltip positioning

Use screen-space overlay (HTML div positioned via `THREE.Vector3.project()`), not a 3D object, for crisp text rendering.

---

## UI Changes

### CscanVisualizer - new elements

- **"Save to Cloud" button** in toolbar (appears after composite is created)
- Name input dialog on save
- Success confirmation with link/reference to saved composite

### VesselModeler - new elements

- **"Import Scan Composite" button** in sidebar/toolbar
- **Composite list panel**: shows saved composites (name, date, dimensions)
- **Placement form** (shown after selecting a composite):
  - Index start position (mm) - numeric input
  - Scan direction - CW / CCW toggle
  - Index direction - Forward / Reverse toggle
  - Confirm / Cancel buttons
- **Scan properties panel** (for placed scans):
  - Colorscale dropdown
  - Min/max range sliders
  - Opacity slider
  - Remove button
- **Hover tooltip** overlay

---

## Implementation Phases

### Phase 1: Database & Cloud Storage
- Create Supabase tables with RLS
- Create service layer (`scan-composite-service.ts`, `vessel-model-service.ts`)
- Create React Query hooks for CRUD operations
- Add "Save to Cloud" to CscanVisualizer
- Add "Save/Load Model" to VesselModeler (cloud-based)

### Phase 2: Import & Auto-Placement
- "Import Scan Composite" UI in VesselModeler
- Coordinate mapping (scan axes → vessel surface position)
- Auto-sizing from axis data
- Placement parameter inputs (index start, directions)
- Save placements to `vessel_scan_placements`

### Phase 3: Heatmap Texture Rendering
- Canvas-based heatmap texture generation from thickness matrix
- Colorscale implementation (Jet, Viridis, etc.)
- Integration with existing `createTexturePlane()` geometry
- Colorscale controls panel

### Phase 4: Interactive Hover
- Raycaster extension to detect scan mesh hits
- UV-to-matrix-index mapping
- Tooltip rendering (HTML overlay)
- Thickness value + position display

---

## Data Size Considerations

Typical composite sizes (estimated):
- Small scan: 100x100 = 10,000 values (~80KB JSON)
- Medium scan: 500x500 = 250,000 values (~2MB JSON)
- Large scan: 1000x1000 = 1,000,000 values (~8MB JSON)

Supabase jsonb handles these sizes well. For very large scans, consider:
- Storing thickness_data in Supabase Storage as a binary file instead of jsonb
- Downsampling for initial display, loading full resolution on zoom

For the initial implementation, jsonb is sufficient.

---

## Decisions

1. **Vessel model persistence**: Keep local JSON save/load AND add cloud save/load as an option
2. **Multiple composites**: Support multiple composites on a single vessel simultaneously
3. **Pass/fail coloring**: Not needed for initial implementation - just show thickness values
