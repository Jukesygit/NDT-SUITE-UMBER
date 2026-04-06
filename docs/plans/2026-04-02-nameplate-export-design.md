# Nameplate GLB Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Project Info" sidebar section (vessel name, location, inspection date) and render a nameplate mesh in the GLB export, positioned flat on the ground plane to the front-right of the vessel.

**Architecture:** Three new metadata fields on VesselState flow through the existing text-sprite canvas rendering system to produce a nameplate Mesh during the export pipeline. No live viewport changes - nameplate only appears in exported GLB.

**Tech Stack:** Three.js (PlaneGeometry + CanvasTexture), React sidebar component, existing gltf-export pipeline.

---

### Task 1: Add metadata fields to VesselState

**Files:**
- Modify: `src/components/VesselModeler/types.ts:386-408` (VesselState interface)
- Modify: `src/components/VesselModeler/types.ts:712-748` (DEFAULT_VESSEL_STATE)

**Step 1: Add fields to VesselState interface**

In `types.ts`, add three fields after `orientation` (line 393):

```typescript
export interface VesselState {
  /** Inner diameter in mm */
  id: number;
  /** Tan-tan length in mm */
  length: number;
  /** Head ratio (e.g., 2.0 for 2:1 Ellipsoidal) */
  headRatio: number;
  orientation: Orientation;
  /** Display name for the vessel (e.g., "V-2401") */
  vesselName: string;
  /** Site/facility location (e.g., "Karstoe Terminal") */
  location: string;
  /** Inspection date as ISO string (e.g., "2026-04-02") */
  inspectionDate: string;
  // ... rest unchanged
```

**Step 2: Add defaults to DEFAULT_VESSEL_STATE**

After `orientation: 'horizontal',` add:

```typescript
vesselName: '',
location: '',
inspectionDate: '',
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(vessel-modeler): add vesselName, location, inspectionDate to VesselState"
```

---

### Task 2: Create ProjectInfoSection sidebar component

**Files:**
- Create: `src/components/VesselModeler/sidebar/ProjectInfoSection.tsx`
- Modify: `src/components/VesselModeler/sidebar/index.ts`

**Step 1: Create ProjectInfoSection**

```tsx
import { FileText } from 'lucide-react';
import type { VesselState } from '../types';
import { Section } from './SliderRow';

export interface ProjectInfoSectionProps {
    vesselState: VesselState;
    onUpdateDimensions: (updates: Partial<VesselState>) => void;
}

export function ProjectInfoSection({ vesselState, onUpdateDimensions }: ProjectInfoSectionProps) {
    return (
        <Section title="Project Info" icon={<FileText size={14} style={{ marginRight: 6 }} />}>
            <div className="vm-control-group">
                <div className="vm-label"><span>Vessel Name</span></div>
                <input
                    type="text"
                    className="vm-input"
                    placeholder="e.g. V-2401"
                    value={vesselState.vesselName}
                    onChange={e => onUpdateDimensions({ vesselName: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
            <div className="vm-control-group">
                <div className="vm-label"><span>Location</span></div>
                <input
                    type="text"
                    className="vm-input"
                    placeholder="e.g. Karstoe Terminal"
                    value={vesselState.location}
                    onChange={e => onUpdateDimensions({ location: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
            <div className="vm-control-group">
                <div className="vm-label"><span>Inspection Date</span></div>
                <input
                    type="date"
                    className="vm-input"
                    value={vesselState.inspectionDate}
                    onChange={e => onUpdateDimensions({ inspectionDate: e.target.value })}
                    style={{ width: '100%' }}
                />
            </div>
        </Section>
    );
}
```

**Step 2: Export from sidebar/index.ts**

Add: `export { ProjectInfoSection } from './ProjectInfoSection';`

**Step 3: Commit**

```bash
git add src/components/VesselModeler/sidebar/ProjectInfoSection.tsx src/components/VesselModeler/sidebar/index.ts
git commit -m "feat(vessel-modeler): add ProjectInfoSection sidebar component"
```

---

### Task 3: Wire ProjectInfoSection into SidebarPanel

**Files:**
- Modify: `src/components/VesselModeler/SidebarPanel.tsx:17-30` (imports)
- Modify: `src/components/VesselModeler/SidebarPanel.tsx:135-139` (render, before DimensionsSection)

**Step 1: Add import**

Add `ProjectInfoSection` to the import from `'./sidebar'`.

**Step 2: Render above DimensionsSection**

Insert before the `<DimensionsSection>` block (line 136):

```tsx
<ProjectInfoSection
    vesselState={vesselState}
    onUpdateDimensions={props.onUpdateDimensions}
/>
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/SidebarPanel.tsx
git commit -m "feat(vessel-modeler): wire ProjectInfoSection into sidebar"
```

---

### Task 4: Save/load metadata in project JSON

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx:845-923` (saveProject)
- Modify: `src/components/VesselModeler/VesselModeler.tsx:1001-1078` (loadProject newState)

**Step 1: Add fields to saveProject**

In `saveProject`, add to the `projectData` object inside the `vessel` key (after `orientation`):

```typescript
vessel: {
    id: vesselState.id,
    length: vesselState.length,
    headRatio: vesselState.headRatio,
    orientation: vesselState.orientation,
    vesselName: vesselState.vesselName,
    location: vesselState.location,
    inspectionDate: vesselState.inspectionDate,
},
```

**Step 2: Read fields in loadProject**

In the `newState` construction, add after `orientation`:

```typescript
vesselName: projectData.vessel.vesselName || '',
location: projectData.vessel.location || '',
inspectionDate: projectData.vessel.inspectionDate || '',
```

**Step 3: Update filename default to use vessel name if available**

In `saveProject`, update the default filename:

```typescript
const defaultName = vesselState.vesselName
    ? `${vesselState.vesselName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}`
    : `vessel_project_${new Date().toISOString().slice(0, 10)}`;
```

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): save/load project info metadata"
```

---

### Task 5: Create nameplate sprite function

**Files:**
- Modify: `src/components/VesselModeler/engine/text-sprite.ts` (add createNameplateSprite)

**Step 1: Add createNameplateSprite export**

Add at the bottom of `text-sprite.ts`:

```typescript
// ---------------------------------------------------------------------------
// Nameplate Sprite (for GLB export)
// ---------------------------------------------------------------------------

/**
 * Create a nameplate mesh with label-value pairs (Location, Vessel, Date).
 * Positioned flat on the ground plane to the front-right of the vessel.
 * Only rows with non-empty values are rendered. Returns null if all fields empty.
 */
export function createNameplateSprite(
  vesselState: VesselState,
): THREE.Mesh | null {
  // Collect non-empty rows
  const rows: { label: string; value: string }[] = [];
  if (vesselState.location) rows.push({ label: 'LOCATION', value: vesselState.location });
  if (vesselState.vesselName) rows.push({ label: 'VESSEL', value: vesselState.vesselName });
  if (vesselState.inspectionDate) rows.push({ label: 'DATE', value: vesselState.inspectionDate });

  if (rows.length === 0) return null;

  // Find the longest label for alignment
  const maxLabelLen = Math.max(...rows.map(r => r.label.length));

  const lines: TextLine[] = rows.map(row => ({
    text: `  ${row.label.padEnd(maxLabelLen + 2)}${row.value}  `,
    font: `bold ${FONT_SIZE_NAME}px monospace`,
    color: '#ffffff',
  }));

  // Scale: slightly larger than annotation labels for readability
  const worldScale = vesselState.id * SCALE * 0.0015;

  const mesh = createTextSprite(
    lines,
    'rgba(10, 14, 20, 0.92)',
    'rgba(100, 160, 255, 0.3)',
    worldScale,
  );

  // Position: flat on ground plane, to the front-right of the vessel
  const vesselRadius = (vesselState.id / 2) * SCALE;
  const vesselLength = vesselState.length * SCALE;

  if (vesselState.orientation === 'horizontal') {
    // Horizontal: vessel runs along X, radius in Y/Z
    mesh.position.set(
      vesselLength * 0.6,    // right of vessel center
      -vesselRadius * 0.1,   // ground level
      vesselRadius * 1.8,    // in front of vessel
    );
  } else {
    // Vertical: vessel runs along Y, radius in X/Z
    mesh.position.set(
      vesselRadius * 1.8,    // right of vessel
      -vesselRadius * 0.1,   // ground level
      vesselRadius * 1.8,    // in front of vessel
    );
  }

  // Rotate to lie flat on the ground plane (face up)
  mesh.rotation.x = -Math.PI / 2;

  mesh.userData = { type: 'export-nameplate' };
  return mesh;
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/text-sprite.ts
git commit -m "feat(vessel-modeler): add createNameplateSprite for GLB export"
```

---

### Task 6: Integrate nameplate into export pipeline

**Files:**
- Modify: `src/components/VesselModeler/engine/gltf-export.ts:14-15` (imports)
- Modify: `src/components/VesselModeler/engine/gltf-export.ts:150-156` (after ruler labels)

**Step 1: Add import**

Add `createNameplateSprite` to the imports from `'./text-sprite'`.

**Step 2: Add nameplate after ruler labels**

After the ruler label loop (line 156), add:

```typescript
  // 5. Add nameplate if project info is provided
  const nameplate = createNameplateSprite(vesselState);
  if (nameplate) {
    clone.add(nameplate);
  }
```

**Step 3: Update GLB filename to use vessel name if available**

Update the download filename (line 172):

```typescript
const baseName = vesselState.vesselName
    ? vesselState.vesselName.replace(/[^a-zA-Z0-9_-]/g, '_')
    : 'vessel_model';
a.download = `${baseName}_${new Date().toISOString().slice(0, 10)}.glb`;
```

**Step 4: Commit**

```bash
git add src/components/VesselModeler/engine/gltf-export.ts
git commit -m "feat(vessel-modeler): integrate nameplate into GLB export pipeline"
```

---

### Task 7: Build and verify

**Step 1: Run build**

```bash
npm run build
```

Expected: No TypeScript errors, clean build.

**Step 2: Fix any build errors**

If there are TypeScript errors, fix them.

**Step 3: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve build errors from nameplate feature"
```
