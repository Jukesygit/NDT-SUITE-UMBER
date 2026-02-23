# Lifting Lug Library - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lifting lug library to the 3D Vessel Modeler with pad-eye and trunnion styles, SWL-based sizing, and drag-and-drop placement - mirroring the existing nozzle library UX.

**Architecture:** Lifting lugs follow the exact same pattern as nozzles: type definitions in `types.ts`, a dedicated geometry module that builds Three.js meshes along +Y axis, integration into `buildVesselScene()` for rendering, `InteractionManager` for drag interactions, `SidebarPanel` for the library UI, and `VesselModeler.tsx` for state management. Lugs position on the cylindrical shell (and ellipsoidal heads) using the same pos/angle coordinate system as nozzles.

**Tech Stack:** Three.js (CylinderGeometry, TorusGeometry, BoxGeometry), React 18, TypeScript

---

## Task 1: Add Type Definitions

**Files:**
- Modify: `src/components/VesselModeler/types.ts`

**Step 1: Add LiftingLugConfig and LiftingLugSize interfaces after NozzleConfig (line 63)**

After the closing `}` of `NozzleConfig` (line 63), add:

```typescript
export type LiftingLugStyle = 'padEye' | 'trunnion';

export interface LiftingLugConfig {
  name: string;
  /** Distance from left tangent line in mm */
  pos: number;
  /** Degrees: 90 = Top, 270 = Bottom, 0 = Right, 180 = Left */
  angle: number;
  /** Lug style */
  style: LiftingLugStyle;
  /** Safe Working Load key (e.g. '1t', '5t') */
  swl: string;
  /** Optional plate width override in mm (pad eye) */
  width?: number;
  /** Optional plate height override in mm (pad eye) */
  height?: number;
  /** Optional plate thickness override in mm */
  thickness?: number;
  /** Optional hole diameter override in mm */
  holeDiameter?: number;
}

export interface LiftingLugSize {
  /** Display label */
  label: string;
  /** Safe Working Load in tonnes */
  swlTonnes: number;
  /** Plate width in mm (pad eye) or pipe OD (trunnion) */
  width: number;
  /** Plate height in mm (pad eye) or stub length (trunnion) */
  height: number;
  /** Plate / pipe thickness in mm */
  thickness: number;
  /** Hole diameter in mm */
  holeDiameter: number;
  /** Base plate diameter in mm */
  baseDiameter: number;
}
```

**Step 2: Add LIFTING_LUG_SIZES lookup table after PIPE_SIZES (line 370)**

After the `PIPE_SIZES` array closing `];` (line 370), add:

```typescript
export const LIFTING_LUG_SIZES: LiftingLugSize[] = [
  { label: '1t',  swlTonnes: 1,  width: 80,  height: 100, thickness: 12, holeDiameter: 25, baseDiameter: 120 },
  { label: '2t',  swlTonnes: 2,  width: 100, height: 120, thickness: 16, holeDiameter: 30, baseDiameter: 150 },
  { label: '5t',  swlTonnes: 5,  width: 120, height: 150, thickness: 20, holeDiameter: 35, baseDiameter: 180 },
  { label: '10t', swlTonnes: 10, width: 150, height: 180, thickness: 25, holeDiameter: 42, baseDiameter: 220 },
  { label: '20t', swlTonnes: 20, width: 180, height: 220, thickness: 32, holeDiameter: 50, baseDiameter: 260 },
  { label: '50t', swlTonnes: 50, width: 220, height: 280, thickness: 40, holeDiameter: 65, baseDiameter: 320 },
];

export function findLiftingLugSize(swl: string): LiftingLugSize {
  return LIFTING_LUG_SIZES.find(s => s.label === swl) || LIFTING_LUG_SIZES[0];
}
```

**Step 3: Update VesselState to include liftingLugs (line 94-107)**

Add `liftingLugs: LiftingLugConfig[];` after the `nozzles` field (line 102):

```typescript
export interface VesselState {
  id: number;
  length: number;
  headRatio: number;
  orientation: Orientation;
  nozzles: NozzleConfig[];
  liftingLugs: LiftingLugConfig[];
  saddles: SaddleConfig[];
  textures: TextureConfig[];
  hasModel: boolean;
  visuals: VisualSettings;
}
```

**Step 4: Update DragType (line 16)**

Change `export type DragType = 'nozzle' | 'saddle' | 'texture';` to:

```typescript
export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture';
```

**Step 5: Update DragState - add selectedLugIdx and lugsLocked (lines 113-127)**

Add after `selectedTextureIdx` (line 118):
```typescript
  selectedLugIdx: number;
```

Add after `texturesLocked` (line 126):
```typescript
  lugsLocked: boolean;
```

**Step 6: Update VesselCallbacks (lines 418-427)**

Add lug callbacks:
```typescript
export interface VesselCallbacks {
  onNozzleMoved?: (index: number, newPos: number, newAngle: number) => void;
  onSaddleMoved?: (index: number, newPos: number) => void;
  onTextureMoved?: (id: number, newPos: number, newAngle: number) => void;
  onNozzleSelected?: (index: number) => void;
  onSaddleSelected?: (index: number) => void;
  onTextureSelected?: (id: number) => void;
  onLugSelected?: (index: number) => void;
  onLugMoved?: (index: number, newPos: number, newAngle: number) => void;
  onDeselect?: () => void;
  onDragEnd?: () => void;
}
```

**Step 7: Update DEFAULT_VESSEL_STATE (lines 395-412)**

Add `liftingLugs: [],` after the `nozzles` field (line 400):

```typescript
export const DEFAULT_VESSEL_STATE: VesselState = {
  id: 3000,
  length: 8000,
  headRatio: 2.0,
  orientation: 'horizontal',
  nozzles: [],
  liftingLugs: [],
  saddles: [
    { pos: 1500, color: '#2244ff' },
    { pos: 6500, color: '#2244ff' },
  ],
  textures: [],
  hasModel: true,
  visuals: {
    material: 'cs',
    shellOpacity: 1.0,
    nozzleOpacity: 1.0,
  },
};
```

**Step 8: Commit**

```bash
git add src/components/VesselModeler/types.ts
git commit -m "feat(vessel-modeler): add lifting lug type definitions and SWL size table"
```

---

## Task 2: Create Lifting Lug Geometry Module

**Files:**
- Create: `src/components/VesselModeler/engine/lifting-lug-geometry.ts`

**Step 1: Create the geometry module**

This file creates both pad-eye and trunnion lug meshes. Both are built along the +Y axis starting at the origin (shell surface), just like nozzles. Orientation is handled by the caller.

```typescript
// =============================================================================
// Vessel Modeler - Lifting Lug Geometry Module
// =============================================================================
// Creates lifting lug geometry for pressure vessel visualization.
// Supports two styles:
//   1. Pad Eye  - Flat vertical plate with a circular hole, welded to a base plate
//   2. Trunnion - Cylindrical pipe stub with a cross-pin hole
// =============================================================================

import * as THREE from 'three';
import { type LiftingLugConfig, findLiftingLugSize } from '../types';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Pad Eye Lug
// ---------------------------------------------------------------------------

/**
 * Build a pad-eye lifting lug as a THREE.Group.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (curved disc on shell surface)
 *   2. Vertical plate (flat box rising from base)
 *   3. Eye ring (torus at top of plate for shackle/hook)
 *   4. Gusset plates (2x triangular reinforcements on each side)
 */
function createPadEyeLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const width = (lug.width || size.width) * SCALE;
  const height = (lug.height || size.height) * SCALE;
  const thickness = (lug.thickness || size.thickness) * SCALE;
  const holeDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate (flat cylinder on shell surface) --
  const baseThk = thickness * 0.6;
  const baseGeom = new THREE.CylinderGeometry(baseDia / 2, baseDia / 2, baseThk, 32);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Vertical plate (the main lug body) --
  const plateGeom = new THREE.BoxGeometry(thickness, height, width);
  const plate = new THREE.Mesh(plateGeom, material);
  plate.position.y = baseThk + height / 2;
  group.add(plate);

  // -- 3. Eye ring (torus at top of plate) --
  const eyeOuterRadius = holeDia / 2 + thickness * 0.6;
  const eyeTubeRadius = thickness * 0.55;
  const eyeGeom = new THREE.TorusGeometry(eyeOuterRadius, eyeTubeRadius, 16, 32);
  const eye = new THREE.Mesh(eyeGeom, material);
  eye.position.y = baseThk + height + eyeOuterRadius * 0.3;
  // Torus is built in XY plane, rotate to stand upright in XY
  eye.rotation.x = Math.PI / 2;
  group.add(eye);

  // -- 4. Gusset plates (triangular reinforcement on each side) --
  const gussetHeight = height * 0.5;
  const gussetLength = width * 0.35;
  const gussetThk = thickness * 0.5;

  const gussetShape = new THREE.Shape();
  gussetShape.moveTo(0, 0);
  gussetShape.lineTo(gussetLength, 0);
  gussetShape.lineTo(0, gussetHeight);
  gussetShape.closePath();

  const extrudeSettings = { depth: gussetThk, bevelEnabled: false };
  const gussetGeom = new THREE.ExtrudeGeometry(gussetShape, extrudeSettings);

  // Left gusset
  const gussetL = new THREE.Mesh(gussetGeom, material);
  gussetL.position.set(thickness / 2, baseThk, -gussetThk / 2);
  gussetL.rotation.y = 0;
  group.add(gussetL);

  // Right gusset (mirrored)
  const gussetR = new THREE.Mesh(gussetGeom, material);
  gussetR.position.set(-thickness / 2, baseThk, gussetThk / 2);
  gussetR.rotation.y = Math.PI;
  group.add(gussetR);

  return group;
}

// ---------------------------------------------------------------------------
// Trunnion Lug
// ---------------------------------------------------------------------------

/**
 * Build a trunnion-style lifting lug as a THREE.Group.
 *
 * Components (from shell surface outward along +Y):
 *   1. Base plate (flat cylinder on shell surface)
 *   2. Main pipe stub (vertical cylinder)
 *   3. Cap plate (flat disc on top)
 *   4. Cross-pin sleeve (horizontal cylinder through the stub near the top)
 */
function createTrunnionLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  const group = new THREE.Group();
  const size = findLiftingLugSize(lug.swl);

  const pipeOD = (lug.width || size.width) * SCALE;
  const stubHeight = (lug.height || size.height) * SCALE;
  const wallThk = (lug.thickness || size.thickness) * SCALE;
  const pinDia = (lug.holeDiameter || size.holeDiameter) * SCALE;
  const baseDia = size.baseDiameter * SCALE;

  // -- 1. Base plate --
  const baseThk = wallThk * 0.6;
  const baseGeom = new THREE.CylinderGeometry(baseDia / 2, baseDia / 2, baseThk, 32);
  const basePlate = new THREE.Mesh(baseGeom, material);
  basePlate.position.y = baseThk / 2;
  group.add(basePlate);

  // -- 2. Main pipe stub (outer cylinder) --
  const stubGeom = new THREE.CylinderGeometry(
    pipeOD / 2,
    pipeOD / 2 * 1.05, // Slight taper at base
    stubHeight,
    32,
  );
  const stub = new THREE.Mesh(stubGeom, material);
  stub.position.y = baseThk + stubHeight / 2;
  group.add(stub);

  // -- 3. Cap plate --
  const capThk = wallThk * 0.5;
  const capGeom = new THREE.CylinderGeometry(pipeOD / 2 * 1.1, pipeOD / 2, capThk, 32);
  const cap = new THREE.Mesh(capGeom, material);
  cap.position.y = baseThk + stubHeight + capThk / 2;
  group.add(cap);

  // -- 4. Cross-pin sleeve (horizontal cylinder through stub) --
  const pinLength = pipeOD * 1.4;
  const pinGeom = new THREE.CylinderGeometry(pinDia / 2 + wallThk * 0.3, pinDia / 2 + wallThk * 0.3, pinLength, 16);
  const pin = new THREE.Mesh(pinGeom, material);
  pin.position.y = baseThk + stubHeight * 0.75;
  pin.rotation.x = Math.PI / 2; // Horizontal
  group.add(pin);

  return group;
}

// ---------------------------------------------------------------------------
// Public Factory
// ---------------------------------------------------------------------------

/**
 * Create a lifting lug mesh group based on configuration.
 *
 * The lug is built along +Y axis starting at origin (shell surface).
 * Positioning and orientation on the vessel is handled by the caller
 * (vessel-geometry.ts) using quaternion rotation, identical to nozzles.
 *
 * @param lug      - Lifting lug configuration
 * @param material - Material to apply to all sub-meshes
 * @returns A THREE.Group containing the complete lug geometry
 */
export function createLiftingLug(
  lug: LiftingLugConfig,
  material: THREE.MeshPhongMaterial,
): THREE.Group {
  if (lug.style === 'trunnion') {
    return createTrunnionLug(lug, material);
  }
  return createPadEyeLug(lug, material);
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/lifting-lug-geometry.ts
git commit -m "feat(vessel-modeler): add lifting lug geometry (pad eye + trunnion styles)"
```

---

## Task 3: Add Lug Materials

**Files:**
- Modify: `src/components/VesselModeler/engine/materials.ts`

**Step 1: Add lug material factory functions**

After `createSaddleHighlightMaterial()` (line 111), add:

```typescript
// ---------------------------------------------------------------------------
// Lifting Lug Materials
// ---------------------------------------------------------------------------

/**
 * Create a material for lifting lugs.
 * Uses a slightly warmer tone to distinguish from nozzles.
 */
export function createLugMaterial(
  preset: MaterialKey = 'cs',
): THREE.MeshPhongMaterial {
  const p = MATERIAL_PRESETS[preset];
  return new THREE.MeshPhongMaterial({
    color: p.color,
    emissive: p.emissive,
    shininess: p.shininess,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Create a highlight material for the currently selected lifting lug.
 */
export function createLugHighlightMaterial(): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color: 0xff8844,
    emissive: 0x553311,
    shininess: 80,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 1.0,
  });
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/materials.ts
git commit -m "feat(vessel-modeler): add lifting lug material factories"
```

---

## Task 4: Integrate Lugs into Vessel Scene Build

**Files:**
- Modify: `src/components/VesselModeler/engine/vessel-geometry.ts`

**Step 1: Add import for lug geometry (after line 15)**

```typescript
import { createLiftingLug } from './lifting-lug-geometry';
```

**Step 2: Update BuildSceneResult interface (lines 20-26)**

Add `lugMeshes`:
```typescript
export interface BuildSceneResult {
  vesselGroup: THREE.Group;
  nozzleMeshes: THREE.Object3D[];
  lugMeshes: THREE.Object3D[];
  saddleMeshes: THREE.Mesh[];
  textureMeshes: THREE.Mesh[];
}
```

**Step 3: Update buildVesselScene function signature (lines 318-328)**

Add lug material parameters and selectedLugIndex:
```typescript
export function buildVesselScene(
  state: VesselState,
  shellMaterial: THREE.MeshPhongMaterial,
  nozzleMaterial: THREE.MeshPhongMaterial,
  nozzleHighlightMaterial: THREE.MeshPhongMaterial,
  lugMaterial: THREE.MeshPhongMaterial,
  lugHighlightMaterial: THREE.MeshPhongMaterial,
  saddleHighlightMaterial: THREE.MeshPhongMaterial,
  textureObjects: Record<number, THREE.Texture>,
  selectedNozzleIndex: number,
  selectedLugIndex: number,
  selectedSaddleIndex: number,
  selectedTextureId: number,
): BuildSceneResult {
```

**Step 4: Initialize lugMeshes array (after line 332)**

Add `const lugMeshes: THREE.Object3D[] = [];` alongside the other mesh arrays.

**Step 5: Update early return (line 338)**

Change to include `lugMeshes`:
```typescript
return { vesselGroup, nozzleMeshes, lugMeshes, saddleMeshes, textureMeshes };
```

**Step 6: Add lifting lug rendering block**

After the nozzles block (after line 507, `});`), add:

```typescript
  // -- Lifting Lugs -----------------------------------------------------------
  state.liftingLugs.forEach((lug, idx) => {
    const mat = idx === selectedLugIndex ? lugHighlightMaterial : lugMaterial;
    const lugGroup = createLiftingLug(lug, mat);

    // Same position/orientation logic as nozzles (pos/angle on shell surface)
    let r_local = RADIUS;
    const normal = new THREE.Vector3();
    const rad = (lug.angle * Math.PI) / 180;

    if (isVertical) {
      const y_global = (lug.pos - TAN_TAN / 2) * SCALE;

      if (lug.pos < 0) {
        const y_local = lug.pos;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (lug.pos > TAN_TAN) {
        const y_local = lug.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(y_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
            y_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        normal.set(Math.cos(rad), 0, Math.sin(rad)).normalize();
      }

      const x = r_local * SCALE * Math.cos(rad);
      const z = r_local * SCALE * Math.sin(rad);
      lugGroup.position.set(x, y_global, z);
    } else {
      const x_global = (lug.pos - TAN_TAN / 2) * SCALE;

      if (lug.pos < 0) {
        const x_local = lug.pos;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else if (lug.pos > TAN_TAN) {
        const x_local = lug.pos - TAN_TAN;
        const ratio = Math.min(1, Math.abs(x_local / HEAD_DEPTH));
        r_local = RADIUS * Math.sqrt(1 - ratio * ratio);
        normal
          .set(
            x_local / (HEAD_DEPTH * HEAD_DEPTH),
            r_local * Math.sin(rad) / (RADIUS * RADIUS),
            r_local * Math.cos(rad) / (RADIUS * RADIUS),
          )
          .normalize();
      } else {
        normal.set(0, Math.sin(rad), Math.cos(rad)).normalize();
      }

      const y = r_local * SCALE * Math.sin(rad);
      const z = r_local * SCALE * Math.cos(rad);
      lugGroup.position.set(x_global, y, z);
    }

    // Orient lug normal to surface (same as nozzles)
    const defaultDir = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDir, normal);
    lugGroup.quaternion.copy(quaternion);

    lugGroup.userData = { type: 'liftingLug', lugIdx: idx };
    vesselGroup.add(lugGroup);
    lugMeshes.push(lugGroup);
  });
```

**Step 7: Update the return statement (line ~559)**

Change to include `lugMeshes`:
```typescript
return { vesselGroup, nozzleMeshes, lugMeshes, saddleMeshes, textureMeshes };
```

**Step 8: Commit**

```bash
git add src/components/VesselModeler/engine/vessel-geometry.ts
git commit -m "feat(vessel-modeler): render lifting lugs in 3D vessel scene"
```

---

## Task 5: Update Interaction Manager for Lug Drag

**Files:**
- Modify: `src/components/VesselModeler/engine/interaction-manager.ts`

**Step 1: Update DragType (line 28)**

```typescript
export type DragType = 'nozzle' | 'liftingLug' | 'saddle' | 'texture' | null;
```

**Step 2: Add lug callbacks to InteractionCallbacks (lines 30-40)**

```typescript
export interface InteractionCallbacks {
  onNozzleSelected: (index: number) => void;
  onSaddleSelected: (index: number) => void;
  onTextureSelected: (id: number) => void;
  onLugSelected: (index: number) => void;
  onDeselect: () => void;
  onNozzleMoved: (index: number, pos: number, angle: number) => void;
  onSaddleMoved: (index: number, pos: number) => void;
  onTextureMoved: (id: number, pos: number, angle: number) => void;
  onLugMoved: (index: number, pos: number, angle: number) => void;
  onDragEnd: () => void;
  onNeedRebuild: () => void;
}
```

**Step 3: Add lug state to InteractionManager class (after line 59)**

```typescript
  private selectedLugIdx = -1;
```

**Step 4: Add lugMeshes and lugsLocked (after line 69 and 65)**

After `saddleMeshes`:
```typescript
  lugMeshes: THREE.Object3D[] = [];
```

After `texturesLocked`:
```typescript
  lugsLocked = false;
```

**Step 5: Add lug raycast priority in onPointerDown (after nozzle block, before saddle block ~line 194)**

Insert between the nozzle and saddle priority blocks:

```typescript
    // ----- Priority 3: Lifting lug meshes (groups - recursive) ----- //
    if (!this.lugsLocked && this.lugMeshes.length > 0) {
      const lugHits = this.raycaster.intersectObjects(this.lugMeshes, true);
      if (lugHits.length > 0) {
        let obj: THREE.Object3D | null = lugHits[0].object;
        let lugIdx: number | undefined;
        while (obj) {
          lugIdx = obj.userData.lugIdx as number | undefined;
          if (lugIdx !== undefined) break;
          obj = obj.parent;
        }
        if (lugIdx !== undefined) {
          this.startDrag('liftingLug', -1, -1, -1, lugIdx);
          this.callbacks.onLugSelected(lugIdx);
          return;
        }
      }
    }
```

Note: The saddle priority becomes 4 (was 3). Adjust the comment accordingly.

**Step 6: Handle lug drag in onPointerMove (after the nozzle/texture block ~line 261)**

In the `if (this.dragType === 'nozzle' || this.dragType === 'texture')` block, add `|| this.dragType === 'liftingLug'` to the condition.

Then inside that block, after the texture moved callback, add:
```typescript
      } else if (this.dragType === 'liftingLug') {
        this.callbacks.onLugMoved(this.selectedLugIdx, newPos, deg);
```

**Step 7: Update startDrag to accept lugIdx**

```typescript
  private startDrag(
    type: 'nozzle' | 'liftingLug' | 'saddle' | 'texture',
    nozzleIdx: number,
    saddleIdx: number,
    textureIdx: number,
    lugIdx: number = -1,
  ): void {
    this.isDown = true;
    this.isDragging = true;
    this.dragType = type;
    this.selectedNozzleIdx = nozzleIdx;
    this.selectedSaddleIdx = saddleIdx;
    this.selectedTextureIdx = textureIdx;
    this.selectedLugIdx = lugIdx;
    this.controls.enabled = false;
  }
```

**Step 8: Update onPointerDown miss block to reset selectedLugIdx**

Add `this.selectedLugIdx = -1;` alongside the other resets.

**Step 9: Commit**

```bash
git add src/components/VesselModeler/engine/interaction-manager.ts
git commit -m "feat(vessel-modeler): add lifting lug drag interaction support"
```

---

## Task 6: Add Lifting Lug Sidebar Section

**Files:**
- Modify: `src/components/VesselModeler/SidebarPanel.tsx`

**Step 1: Update imports (line 3-11)**

Add `LiftingLugConfig` and `LIFTING_LUG_SIZES` to the imports:

```typescript
import type {
    VesselState,
    NozzleConfig,
    SaddleConfig,
    TextureConfig,
    LiftingLugConfig,
    LiftingLugStyle,
    MaterialKey,
    Orientation,
} from './types';
import { MATERIAL_PRESETS, PIPE_SIZES, LIFTING_LUG_SIZES, findClosestPipeSize, findLiftingLugSize } from './types';
```

**Step 2: Update SidebarPanelProps (lines 19-39)**

Add lug-related props after the nozzle props:

```typescript
    // Lifting lug props
    selectedLugIndex: number;
    onAddLug: (lug: LiftingLugConfig) => void;
    onUpdateLug: (index: number, updates: Partial<LiftingLugConfig>) => void;
    onRemoveLug: (index: number) => void;
    onSelectLug: (index: number) => void;
```

**Step 3: Add LiftingLugSection to SidebarPanel render (after NozzleSection, line 124)**

```tsx
                <LiftingLugSection {...props} />
```

**Step 4: Add the LiftingLugSection component (after NozzleSection function, before SaddleSection)**

```tsx
// ---------------------------------------------------------------------------
// Lifting Lug Section
// ---------------------------------------------------------------------------

function LiftingLugSection({
    vesselState, selectedLugIndex,
    onAddLug, onUpdateLug, onRemoveLug, onSelectLug,
}: SidebarPanelProps) {
    const [lugStyle, setLugStyle] = useState<LiftingLugStyle>('padEye');
    const sel = selectedLugIndex >= 0 ? vesselState.liftingLugs[selectedLugIndex] : null;

    const addFromLibrary = (swl: string) => {
        const size = findLiftingLugSize(swl);
        onAddLug({
            name: `L${vesselState.liftingLugs.length + 1}`,
            pos: vesselState.length / 2,
            angle: 90,
            style: lugStyle,
            swl,
        });
    };

    return (
        <Section title="Lifting Lugs">
            {/* Style toggle */}
            <div className="vm-control-group">
                <div className="vm-label"><span>Style</span></div>
                <div className="vm-toggle-group">
                    <button
                        className={`vm-toggle-btn ${lugStyle === 'padEye' ? 'active' : ''}`}
                        onClick={() => setLugStyle('padEye')}
                    >
                        Pad Eye
                    </button>
                    <button
                        className={`vm-toggle-btn ${lugStyle === 'trunnion' ? 'active' : ''}`}
                        onClick={() => setLugStyle('trunnion')}
                    >
                        Trunnion
                    </button>
                </div>
            </div>

            {/* Library grid - drag onto 3D canvas or click to add */}
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 8px 0' }}>
                Drag a lug size onto the vessel
            </p>
            <div className="vm-library-grid" style={{ marginBottom: 10 }}>
                {LIFTING_LUG_SIZES.map(s => (
                    <div
                        key={s.label}
                        className="vm-library-item"
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-lifting-lug', JSON.stringify({ ...s, style: lugStyle }));
                            e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => addFromLibrary(s.label)}
                        title={`Drag or click to add ${s.swlTonnes}t SWL ${lugStyle} lug`}
                        style={{ userSelect: 'none' }}
                    >
                        <div className="size-label">{s.label}</div>
                        <div className="size-mm">{s.swlTonnes}t SWL</div>
                    </div>
                ))}
            </div>

            {/* Lug list */}
            {vesselState.liftingLugs.map((l, i) => (
                <div
                    key={i}
                    className={`vm-list-item ${i === selectedLugIndex ? 'selected' : ''}`}
                    onClick={() => onSelectLug(i)}
                >
                    <div className="vm-list-item-info">
                        <strong>{l.name}</strong> &mdash; {l.swl} {l.style === 'trunnion' ? 'Trunnion' : 'Pad Eye'} @ {Math.round(l.pos)}mm, {Math.round(l.angle)}&deg;
                    </div>
                    <button className="vm-btn-icon" onClick={e => { e.stopPropagation(); onRemoveLug(i); }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}

            {/* Edit selected lug */}
            {sel && (
                <div className="vm-form edit-mode" style={{ marginTop: 8 }}>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Name</span></div>
                        <input
                            className="vm-input"
                            value={sel.name}
                            onChange={e => onUpdateLug(selectedLugIndex, { name: e.target.value })}
                        />
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>Style</span></div>
                        <div className="vm-toggle-group">
                            <button
                                className={`vm-toggle-btn ${sel.style === 'padEye' ? 'active' : ''}`}
                                onClick={() => onUpdateLug(selectedLugIndex, { style: 'padEye' })}
                            >
                                Pad Eye
                            </button>
                            <button
                                className={`vm-toggle-btn ${sel.style === 'trunnion' ? 'active' : ''}`}
                                onClick={() => onUpdateLug(selectedLugIndex, { style: 'trunnion' })}
                            >
                                Trunnion
                            </button>
                        </div>
                    </div>
                    <div className="vm-form-row">
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Position</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.pos}
                                onChange={e => onUpdateLug(selectedLugIndex, { pos: Number(e.target.value) })}
                            />
                        </div>
                        <div className="vm-control-group">
                            <div className="vm-label"><span>Angle</span></div>
                            <input
                                type="number"
                                className="vm-input"
                                value={sel.angle}
                                min={0}
                                max={360}
                                onChange={e => onUpdateLug(selectedLugIndex, { angle: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="vm-control-group">
                        <div className="vm-label"><span>SWL</span></div>
                        <select
                            className="vm-select"
                            value={sel.swl}
                            onChange={e => onUpdateLug(selectedLugIndex, { swl: e.target.value })}
                        >
                            {LIFTING_LUG_SIZES.map(s => (
                                <option key={s.label} value={s.label}>{s.label} ({s.swlTonnes}t)</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </Section>
    );
}
```

**Step 5: Commit**

```bash
git add src/components/VesselModeler/SidebarPanel.tsx
git commit -m "feat(vessel-modeler): add lifting lug library sidebar section"
```

---

## Task 7: Wire State & Drag-Drop in VesselModeler

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add LiftingLugConfig to imports (line 10)**

Add `LiftingLugConfig` to the destructured import from `./types`.

**Step 2: Add selectedLugIndex state (after line 30)**

```typescript
const [selectedLugIndex, setSelectedLugIndex] = useState(-1);
```

**Step 3: Add lugsLocked state (after line 42)**

```typescript
const [lugsLocked, setLugsLocked] = useState(false);
```

**Step 4: Add lifting lug handlers (after saddle handlers, line 102)**

```typescript
    // --- Lifting lug handlers ---
    const addLug = useCallback((lug: LiftingLugConfig) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: [...prev.liftingLugs, lug],
            hasModel: true,
        }));
    }, []);

    const updateLug = useCallback((index: number, updates: Partial<LiftingLugConfig>) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: prev.liftingLugs.map((l, i) => i === index ? { ...l, ...updates } : l),
        }));
    }, []);

    const removeLug = useCallback((index: number) => {
        setVesselState(prev => ({
            ...prev,
            liftingLugs: prev.liftingLugs.filter((_, i) => i !== index),
        }));
        setSelectedLugIndex(-1);
    }, []);
```

**Step 5: Update vesselCallbacks (lines 140-173)**

Add lug callbacks:
```typescript
        onLugSelected: (idx) => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(idx);
        },
        onLugMoved: (idx, pos, angle) => {
            updateLug(idx, { pos: Math.round(pos), angle: Math.round(angle) });
        },
```

Also update `onNozzleSelected`, `onSaddleSelected`, `onTextureSelected` to reset lug selection:
```typescript
        onNozzleSelected: (idx) => {
            setSelectedNozzleIndex(idx);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
        },
```
(Same pattern for saddle and texture selected - add `setSelectedLugIndex(-1)`)

Update `onDeselect`:
```typescript
        onDeselect: () => {
            setSelectedNozzleIndex(-1);
            setSelectedSaddleIndex(-1);
            setSelectedTextureId(-1);
            setSelectedLugIndex(-1);
        },
```

**Step 6: Add lug drag-and-drop handlers (after handleNozzleDrop, ~line 421)**

Update `handleNozzleDragOver` to also accept lug MIME type:
```typescript
    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe') ||
            e.dataTransfer.types.includes('application/x-lifting-lug')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    }, []);
```

Add `handleLugDrop`:
```typescript
    const handleLugDrop = useCallback((e: React.DragEvent) => {
        const data = e.dataTransfer.getData('application/x-lifting-lug');
        if (!data) return;
        e.preventDefault();

        const lugData = JSON.parse(data);
        const cam = viewportRef.current?.getCamera();
        const rendererEl = viewportRef.current?.getRenderer()?.domElement;
        const sceneManager = viewportRef.current?.getSceneManager();
        if (!cam || !rendererEl || !sceneManager) return;

        const vesselGroup = sceneManager.getVesselGroup();
        if (!vesselGroup) return;

        const rect = rendererEl.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cam);

        const shells: THREE.Object3D[] = [];
        vesselGroup.traverse((child: THREE.Object3D) => {
            if (child.userData.isShell) shells.push(child);
        });
        const intersects = raycaster.intersectObjects(shells);

        let newPos: number;
        let deg: number;

        if (intersects.length > 0) {
            const point = intersects[0].point;
            const isVertical = vesselState.orientation === 'vertical';
            newPos = isVertical
                ? (point.y / SCALE) + (vesselState.length / 2)
                : (point.x / SCALE) + (vesselState.length / 2);
            const headDepth = vesselState.id / (2 * vesselState.headRatio);
            newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

            const rad = isVertical
                ? Math.atan2(point.z, point.x)
                : Math.atan2(point.y, point.z);
            deg = (rad * 180) / Math.PI;
            if (deg < 0) deg += 360;
        } else {
            newPos = vesselState.length / 2;
            deg = 90;
        }

        let lugNum = vesselState.liftingLugs.length + 1;
        let name = 'L' + lugNum;
        while (vesselState.liftingLugs.some(l => l.name === name)) {
            lugNum++;
            name = 'L' + lugNum;
        }

        addLug({
            name,
            pos: Math.round(newPos),
            angle: Math.round(deg),
            style: lugData.style || 'padEye',
            swl: lugData.label,
        });
    }, [vesselState, addLug]);
```

**Step 7: Update the combined drop handler**

Replace the two separate handlers with a combined one on the container div:

```typescript
    const handleDrop = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-nozzle-pipe')) {
            handleNozzleDrop(e);
        } else if (e.dataTransfer.types.includes('application/x-lifting-lug')) {
            handleLugDrop(e);
        }
    }, [handleNozzleDrop, handleLugDrop]);
```

Update the container div (line ~441):
```tsx
                onDragOver={handleDragOver}
                onDrop={handleDrop}
```

**Step 8: Pass lug props to SidebarPanel (lines 456-476)**

Add after existing props:
```tsx
                        selectedLugIndex={selectedLugIndex}
                        onAddLug={addLug}
                        onUpdateLug={updateLug}
                        onRemoveLug={removeLug}
                        onSelectLug={setSelectedLugIndex}
```

**Step 9: Add lock control button for lugs (after the T lock button, ~line 514)**

```tsx
                    <button
                        className={`vm-lock-btn ${lugsLocked ? 'locked' : ''}`}
                        onClick={() => setLugsLocked(l => !l)}
                        title={lugsLocked ? 'Unlock lifting lugs' : 'Lock lifting lugs'}
                    >
                        {lugsLocked ? <Lock size={12} /> : <Unlock size={12} />}
                        L
                    </button>
```

**Step 10: Update getHintText to include lugs**

```typescript
        if (lugsLocked) locked.push('Lugs');
```

**Step 11: Update save/load to include liftingLugs**

In `saveProject` (after the nozzles section in the projectData object):
```typescript
            liftingLugs: vesselState.liftingLugs.map(l => ({
                name: l.name, pos: l.pos, angle: l.angle,
                style: l.style, swl: l.swl,
            })),
```

In `loadProject`, add to the `newState` construction:
```typescript
                    liftingLugs: projectData.liftingLugs || [],
```

And add lug index reset:
```typescript
                setSelectedLugIndex(-1);
```

**Step 12: Update handleDrawingApply to reset lug selection**

Add `setSelectedLugIndex(-1);` after the other resets.

**Step 13: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): wire lifting lug state, drag-drop, and save/load"
```

---

## Task 8: Update ThreeViewport for Lug Rendering

**Files:**
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`

**Step 1: Update imports (line 8-12)**

Add `createLugMaterial` and `createLugHighlightMaterial`:
```typescript
import {
    createShellMaterial,
    createNozzleMaterial,
    createHighlightMaterial,
    createSaddleHighlightMaterial,
    createLugMaterial,
    createLugHighlightMaterial,
} from './engine/materials';
```

**Step 2: Update ThreeViewportProps (lines 23-30)**

Add `selectedLugIndex`:
```typescript
interface ThreeViewportProps {
    vesselState: VesselState;
    selectedNozzleIndex: number;
    selectedLugIndex: number;
    selectedSaddleIndex: number;
    selectedTextureId: number;
    textureObjects: Record<number, THREE.Texture>;
    callbacks: VesselCallbacks;
}
```

**Step 3: Update forwardRef destructure (line 33)**

Add `selectedLugIndex` to the destructured props.

**Step 4: Update materialsRef type (lines 41-46)**

Add lug materials:
```typescript
    const materialsRef = useRef<{
        shell: THREE.MeshPhongMaterial;
        nozzle: THREE.MeshPhongMaterial;
        nozzleHighlight: THREE.MeshPhongMaterial;
        saddleHighlight: THREE.MeshPhongMaterial;
        lug: THREE.MeshPhongMaterial;
        lugHighlight: THREE.MeshPhongMaterial;
    } | null>(null);
```

**Step 5: Create lug materials on mount (after line 75)**

```typescript
        const lug = createLugMaterial(vesselStateRef.current.visuals.material);
        const lugHighlight = createLugHighlightMaterial();
        materialsRef.current = { shell, nozzle, nozzleHighlight, saddleHighlight, lug, lugHighlight };
```

**Step 6: Add lug callbacks to interaction manager (after line 92)**

```typescript
                onLugSelected: (idx) => callbacksRef.current.onLugSelected?.(idx),
                onLugMoved: (idx, pos, angle) => callbacksRef.current.onLugMoved?.(idx, pos, angle),
```

**Step 7: Dispose lug materials on cleanup (after line 113)**

```typescript
                materialsRef.current.lug.dispose();
                materialsRef.current.lugHighlight.dispose();
```

**Step 8: Update buildVesselScene call in rebuildScene (lines 138-148)**

Add the lug materials and selectedLugIndex:
```typescript
        const result = buildVesselScene(
            state,
            materials.shell,
            materials.nozzle,
            materials.nozzleHighlight,
            materials.lug,
            materials.lugHighlight,
            materials.saddleHighlight,
            textureObjects,
            selectedNozzleIndex,
            selectedLugIndex,
            selectedSaddleIndex,
            selectedTextureId
        );
```

**Step 9: Pass lugMeshes to interaction manager (after line 157)**

```typescript
            interactionRef.current.lugMeshes = result.lugMeshes;
```

**Step 10: Update rebuildScene dependencies (line 160)**

Add `selectedLugIndex`:
```typescript
    }, [textureObjects, selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId]);
```

**Step 11: Update rebuild useEffect dependencies (line 165)**

Add `selectedLugIndex`:
```typescript
    }, [vesselState, selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId, textureObjects, rebuildScene]);
```

**Step 12: Update lug material visuals when preset changes (lines 173-194)**

After updating the nozzle material, add:
```typescript
        materials.lug.color.setHex(preset.color);
        materials.lug.shininess = preset.shininess;
        materials.lug.emissive.setHex(preset.emissive);
        materials.lug.opacity = nozzleOpacity; // Use same opacity as nozzles
        materials.lug.transparent = nozzleOpacity < 1.0;
        materials.lug.needsUpdate = true;
```

**Step 13: Commit**

```bash
git add src/components/VesselModeler/ThreeViewport.tsx
git commit -m "feat(vessel-modeler): integrate lifting lug materials and scene rebuild"
```

---

## Task 9: Pass selectedLugIndex Prop to ThreeViewport

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add selectedLugIndex to ThreeViewport JSX (line ~448)**

```tsx
                <ThreeViewport
                    ref={viewportRef}
                    vesselState={vesselState}
                    selectedNozzleIndex={selectedNozzleIndex}
                    selectedLugIndex={selectedLugIndex}
                    selectedSaddleIndex={selectedSaddleIndex}
                    selectedTextureId={selectedTextureId}
                    textureObjects={textureObjectsRef.current}
                    callbacks={vesselCallbacks}
                />
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): pass selectedLugIndex to ThreeViewport"
```

---

## Task 10: Build & Fix

**Step 1: Run the build**

```bash
npm run build
```

Expected: May have TypeScript errors from the interface changes cascading. Fix them.

**Step 2: Common fixes to expect**

- If `buildVesselScene` is called anywhere else (shouldn't be based on codebase), update those call sites too
- If `InteractionCallbacks` is instantiated somewhere else, add the two new callbacks
- Verify all `VesselState` usages handle the new `liftingLugs` array

**Step 3: Run lint**

```bash
npm run lint
```

Fix any lint errors.

**Step 4: Test in browser**

```bash
npm run dev
```

Open the Vessel Modeler page. Verify:
1. Lifting Lug section appears in sidebar between Nozzles and Supports
2. Style toggle (Pad Eye / Trunnion) works
3. Library grid shows 6 SWL sizes (1t through 50t)
4. Clicking a library item adds a lug to the vessel at center/top
5. Dragging a library item onto the 3D vessel places it at the drop point
6. Lug appears in the lug list with correct details
7. Clicking a lug in the list selects it (highlight color changes)
8. Edit form shows for selected lug (name, style, position, angle, SWL)
9. Editing fields updates the 3D lug in real-time
10. Dragging a lug on the 3D canvas moves it along the surface
11. Lock control (L button) prevents lug drag
12. Save project includes lugs, load project restores them
13. Both pad eye and trunnion styles render correctly

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(vessel-modeler): complete lifting lug library integration"
```

---

## Summary of Files Changed

| File | Action | Description |
|------|--------|-------------|
| `types.ts` | Modify | Add LiftingLugConfig, LiftingLugSize, LIFTING_LUG_SIZES, update VesselState/DragType/VesselCallbacks |
| `engine/lifting-lug-geometry.ts` | Create | Pad eye + trunnion lug Three.js mesh factories |
| `engine/materials.ts` | Modify | Add createLugMaterial + createLugHighlightMaterial |
| `engine/vessel-geometry.ts` | Modify | Render lugs in buildVesselScene, update BuildSceneResult |
| `engine/interaction-manager.ts` | Modify | Add lug raycast priority, drag handling, callbacks |
| `SidebarPanel.tsx` | Modify | Add LiftingLugSection with library grid + edit form |
| `VesselModeler.tsx` | Modify | Add lug state, handlers, drag-drop, lock, save/load |
| `ThreeViewport.tsx` | Modify | Add lug materials, pass to scene build, update rebuild deps |
