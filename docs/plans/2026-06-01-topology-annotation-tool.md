# Topology Annotation Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a click-to-annotate tool to the topology viewer that places persistent thickness/position labels on the scan surface, with a collapsible management panel.

**Architecture:** Annotations store grid coordinates (row, col) and raw thickness so they survive surface rebuilds. The viewport recomputes each annotation's 3D Y position from current exaggeration/options on every rebuild. CSS2DRenderer renders HTML labels that auto-track 3D positions. A leader line (sphere + white line) connects each label to its surface point.

**Tech Stack:** Three.js CSS2DRenderer, React state, existing topology viewer infrastructure.

---

### Task 1: Add annotation types and tool type

**Files:**
- Modify: `src/components/TopologyViewer/types.ts`

**What to do:**

Add `'annotate'` to the `TopologyTool` union type:

```typescript
export type TopologyTool = 'orbit' | 'crossSection' | 'measure' | 'annotate';
```

Add the annotation data model after the `MeasurementResult` interface:

```typescript
export interface TopologyAnnotation {
  id: string;
  row: number;
  col: number;
  scanMm: number;
  indexMm: number;
  thickness: number | null;
  label: string;
}
```

---

### Task 2: Add CSS2DRenderer to TopologySceneManager

**Files:**
- Modify: `src/components/TopologyViewer/engine/topology-scene.ts`

**What to do:**

1. Add import at top:
```typescript
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
```

2. Add private field:
```typescript
private css2DRenderer: CSS2DRenderer;
```

3. In the constructor, after creating `this.renderer`, create the CSS2DRenderer:
```typescript
this.css2DRenderer = new CSS2DRenderer();
this.css2DRenderer.setSize(w, h);
this.css2DRenderer.domElement.style.position = 'absolute';
this.css2DRenderer.domElement.style.top = '0';
this.css2DRenderer.domElement.style.left = '0';
this.css2DRenderer.domElement.style.pointerEvents = 'none';
```

4. In `init()`, after `this.container.appendChild(this.renderer.domElement)`, add:
```typescript
this.container.appendChild(this.css2DRenderer.domElement);
```

5. In the `animate` render block (inside `if (this.needsRender)`), after `this.renderer.render(...)`, add:
```typescript
this.css2DRenderer.render(this.scene, this.camera);
```

6. In `onResize()`, after `this.renderer.setSize(w, h)`, add:
```typescript
this.css2DRenderer.setSize(w, h);
```

7. In `dispose()`, before removing `this.renderer.domElement`, add:
```typescript
if (this.css2DRenderer.domElement.parentNode === this.container) {
  this.container.removeChild(this.css2DRenderer.domElement);
}
```

**Important:** The container div that holds the canvas must have `position: relative` for the CSS2DRenderer's absolute positioning to work. The viewport already wraps in a relative-positioned div.

---

### Task 3: Add annotate button to toolbar

**Files:**
- Modify: `src/components/TopologyViewer/TopologyToolbar.tsx`

**What to do:**

Add `MapPin` to the lucide-react import:
```typescript
import { Upload, Download, Move3d, ScissorsLineDashed, Ruler, RotateCcw, MapPin } from 'lucide-react';
```

Add the annotate tool to `TOOL_DEFS`:
```typescript
const TOOL_DEFS: { id: TopologyTool; icon: typeof Move3d; label: string }[] = [
  { id: 'orbit', icon: Move3d, label: 'Orbit' },
  { id: 'crossSection', icon: ScissorsLineDashed, label: 'Cross-Section' },
  { id: 'measure', icon: Ruler, label: 'Measure' },
  { id: 'annotate', icon: MapPin, label: 'Annotate' },
];
```

---

### Task 4: Add annotation state to TopologyViewer

**Files:**
- Modify: `src/components/TopologyViewer/TopologyViewer.tsx`

**What to do:**

1. Add import of `TopologyAnnotation` from `./types`.

2. Add state:
```typescript
const [annotations, setAnnotations] = useState<TopologyAnnotation[]>([]);
```

3. Add handler for new annotations (placed after existing handlers):
```typescript
const handleAddAnnotation = useCallback((annotation: TopologyAnnotation) => {
  setAnnotations(prev => [...prev, annotation]);
}, []);

const handleDeleteAnnotation = useCallback((id: string) => {
  setAnnotations(prev => prev.filter(a => a.id !== id));
}, []);
```

4. Pass `annotations` and `onAddAnnotation={handleAddAnnotation}` to `TopologyViewport`.

5. Pass `annotations`, `onDeleteAnnotation={handleDeleteAnnotation}` to a new `TopologyAnnotationPanel` (created in Task 6), rendered inside `topology-viewer__main` alongside the info panel.

---

### Task 5: Handle annotate clicks and render annotations in viewport

**Files:**
- Modify: `src/components/TopologyViewer/TopologyViewport.tsx`

This is the core task. Multiple changes:

**5a. Add props for annotations:**

Add to `TopologyViewportProps`:
```typescript
annotations: TopologyAnnotation[];
onAddAnnotation: (annotation: TopologyAnnotation) => void;
```

Import `CSS2DObject` from `three/addons/renderers/CSS2DRenderer.js` and `TopologyAnnotation` from `./types`.

**5b. Add click handler for annotate tool:**

In the existing `handleClick` function (which currently only handles 'measure'), add a branch for 'annotate':

```typescript
if (activeToolRef.current === 'annotate') {
  const point = raycastSurface(e.clientX, e.clientY);
  if (!point) return;

  const col = findNearestIndex(cs.xAxis, point.x);
  const row = findNearestIndex(cs.yAxis, point.z);
  const thickness = cs.data[row]?.[col] ?? null;

  onAddAnnotationRef.current({
    id: crypto.randomUUID(),
    row,
    col,
    scanMm: cs.xAxis[col],
    indexMm: cs.yAxis[row],
    thickness,
    label: thickness != null ? `${thickness.toFixed(1)} mm` : 'ND',
  });
}
```

Add a ref for the callback: `const onAddAnnotationRef = useRef(onAddAnnotation); onAddAnnotationRef.current = onAddAnnotation;`

**5c. Add annotation rendering effect:**

Add a new `useEffect` that creates/updates 3D annotation visuals whenever `annotations` or `surfaceOptions` change. For each annotation:

1. Compute the display Y from the stored row/col using `clampDisplayDisplacement`.
2. Create a small sphere (radius 1.5, cyan) at the surface point.
3. Create a white line from the sphere up to a label offset position (e.g. +20 units in Y).
4. Create a `CSS2DObject` wrapping an HTML div that shows:
   - Thickness value (bold)
   - Scan / Index position
5. Group all three objects per annotation in a `THREE.Group`, add to scene.

Track all annotation groups in a ref (`annotationGroupsRef`). On each run, clear old groups and rebuild — this ensures Y positions update when exaggeration changes.

The HTML label styling should match the info panel's glassmorphic style:
```typescript
div.style.cssText = `
  background: rgba(20, 25, 35, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  pointer-events: none;
`;
```

**5d. Add 'annotate' to cursor/controls handling:**

In the tool change effect, add a case for `'annotate'`:
```typescript
} else if (activeTool === 'annotate') {
  controls.enabled = true;
  canvas.style.cursor = 'crosshair';
}
```

**5e. Do NOT clear annotations on surface rebuild:**

The existing surface rebuild effect calls `clearHelperObjects()` which removes measurement visuals. Annotation groups are tracked in their own ref and rebuilt by their own effect — they must not be removed by `clearHelperObjects`.

---

### Task 6: Create the annotation management panel

**Files:**
- Create: `src/components/TopologyViewer/TopologyAnnotationPanel.tsx`

**What to do:**

Create a collapsible panel (positioned absolute, right side) that lists annotations and allows deletion. Style to match the existing `TopologyInfoPanel` glassmorphic look.

```typescript
interface TopologyAnnotationPanelProps {
  annotations: TopologyAnnotation[];
  onDelete: (id: string) => void;
}
```

Panel structure:
- Header row: "Annotations" title + collapse toggle (ChevronDown/ChevronUp from lucide)
- When expanded: list of annotation cards, each showing:
  - Thickness value (bold, green accent)
  - Position: `Scan: X.X mm | Index: Y.Y mm`
  - Delete button (Trash2 icon, red on hover)
- When no annotations: "Click surface to annotate" hint text
- Positioned: `position: absolute; top: 12px; right: 12px;`
- Same glass card styling as the info panel

---

### Task 7: Wire everything together in TopologyViewer

**Files:**
- Modify: `src/components/TopologyViewer/TopologyViewer.tsx`

**What to do:**

1. Import `TopologyAnnotationPanel` from `./TopologyAnnotationPanel`.
2. Pass `annotations` and `onAddAnnotation` to `TopologyViewport`.
3. Render `TopologyAnnotationPanel` inside `.topology-viewer__main`, after the info panel:

```tsx
<TopologyAnnotationPanel
  annotations={annotations}
  onDelete={handleDeleteAnnotation}
/>
```

---

### Task 8: TypeScript check and manual test

Run `npm run typecheck` and fix any issues. Then test manually:
1. Load a scan file
2. Select the Annotate tool
3. Click a point on the surface — verify a label appears with thickness + position
4. Change exaggeration — verify annotations move with the surface
5. Add multiple annotations — verify the panel lists them all
6. Delete one via the panel — verify it disappears from the 3D view
7. Switch back to Orbit tool — verify annotations remain visible
