# Piping Dome End Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Dome End" part to the piping tool — a terminal semi-ellipsoidal head with adjustable head ratio (default 2:1).

**Architecture:** New `'dome'` member of the `PipeSegmentType` union with an optional `headRatio` field; a `buildDomeMesh()` geometry builder following the elbow's outer+inner merged-shell pattern; terminal semantics centralised in a new `isTerminalSegment()` helper replacing scattered `type === 'cap'` checks. UI is declarative additions to the existing parts lists plus one `SliderRow` per edit form.

**Tech Stack:** React 18 + TypeScript (strict), Three.js, Vitest. Design doc: `docs/plans/2026-07-21-piping-dome-end-design.md`.

**Working directory:** `.claude/worktrees/piping-dome-end` (branch `feature/piping-dome-end`).

**Baseline note:** the full local suite shows one known worker crash from `useLayoutMode.test.ts` (documented in `vitest.config.js`, excluded in CI). 737 passed / 3 skipped is the local green baseline.

---

### Task 1: `'dome'` segment type, `headRatio` field, `isTerminalSegment()`

**Files:**
- Modify: `src/components/VesselModeler/types.ts:927` (union), `:944-946` (interface), append helper after `PipeSegment`
- Test: `src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts` (create)

**Step 1: Write the failing test**

Create `src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

import { isTerminalSegment, type PipeSegmentType } from '../../types';

// ---------------------------------------------------------------------------
// isTerminalSegment — single source of truth for "this part closes the run".
// Cap and dome end a pipeline; everything else keeps the chain open.
// ---------------------------------------------------------------------------

describe('isTerminalSegment', () => {
  it('treats cap and dome as terminal', () => {
    expect(isTerminalSegment('cap')).toBe(true);
    expect(isTerminalSegment('dome')).toBe(true);
  });

  it('treats all pass-through parts as non-terminal', () => {
    const open: PipeSegmentType[] = ['straight', 'elbow', 'reducer', 'tee', 'valve', 'flange'];
    for (const type of open) {
      expect(isTerminalSegment(type)).toBe(false);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: FAIL — `isTerminalSegment` is not exported / `'dome'` not assignable to `PipeSegmentType`.

**Step 3: Write minimal implementation**

In `src/components/VesselModeler/types.ts`:

Change line 927:

```ts
export type PipeSegmentType = 'straight' | 'elbow' | 'reducer' | 'tee' | 'valve' | 'flange' | 'cap' | 'dome';
```

In `PipeSegment`, after the `style?: string;` field:

```ts
  /** Head ratio D/2h for dome ends (2.0 = 2:1 semi-ellipsoidal, 1.0 = hemispherical) */
  headRatio?: number;
```

Directly after the `PipeSegment` interface:

```ts
/** Segment types that close a pipe run — nothing can be added after them. */
export function isTerminalSegment(type: PipeSegmentType): boolean {
  return type === 'cap' || type === 'dome';
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add src/components/VesselModeler/types.ts src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts
git commit -m "feat(vessel-modeler): add dome pipe segment type with terminal semantics"
```

---

### Task 2: `buildDomeMesh()` + terminal `advanceFrame`

**Files:**
- Modify: `src/components/VesselModeler/engine/pipeline-geometry.ts:160` (advanceFrame), append builder after `buildCapMesh` (~line 362)
- Test: `src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`

**Step 1: Write the failing tests**

Append to the test file (extend the existing imports rather than duplicating):

```ts
import * as THREE from 'three';

import type { PipeFrame } from '../pipeline-geometry';
import { advanceFrame, buildDomeMesh } from '../pipeline-geometry';
import { SCALE } from '../materials';
import type { PipeSegment } from '../../types';

function frameAtOrigin(): PipeFrame {
  return {
    origin: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, 0, 1),
  };
}

describe('advanceFrame — dome', () => {
  it('is terminal: output frame equals input frame', () => {
    const frame = frameAtOrigin();
    const seg: PipeSegment = { id: 'd1', type: 'dome', rotation: 0, headRatio: 2 };
    const out = advanceFrame(frame, seg, 100);
    expect(out.origin.equals(frame.origin)).toBe(true);
    expect(out.direction.equals(frame.direction)).toBe(true);
    expect(out.up.equals(frame.up)).toBe(true);
  });
});

describe('buildDomeMesh', () => {
  const material = new THREE.MeshStandardMaterial();

  it('squashes depth along the pipe axis by 1/headRatio (2:1)', () => {
    const seg: PipeSegment = { id: 'd1', type: 'dome', rotation: 0, headRatio: 2 };
    const mesh = buildDomeMesh(frameAtOrigin(), seg, 100, material);
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const r = 50 * SCALE;
    expect(bb.max.x).toBeCloseTo(r, 5);      // full radius across
    expect(bb.min.x).toBeCloseTo(-r, 5);
    expect(bb.max.z).toBeCloseTo(r, 5);
    expect(bb.max.y).toBeCloseTo(r / 2, 5);  // depth = r / ratio
    expect(bb.min.y).toBeCloseTo(0, 5);
  });

  it('defaults to 2:1 when headRatio is unset', () => {
    const seg: PipeSegment = { id: 'd2', type: 'dome', rotation: 0 };
    const mesh = buildDomeMesh(frameAtOrigin(), seg, 100, material);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo((50 * SCALE) / 2, 5);
  });

  it('is hemispherical at ratio 1', () => {
    const seg: PipeSegment = { id: 'd3', type: 'dome', rotation: 0, headRatio: 1 };
    const mesh = buildDomeMesh(frameAtOrigin(), seg, 100, material);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(50 * SCALE, 5);
  });

  it('tags userData for selection like other segments', () => {
    const seg: PipeSegment = { id: 'd4', type: 'dome', rotation: 0 };
    const mesh = buildDomeMesh(frameAtOrigin(), seg, 100, material);
    expect(mesh.userData).toEqual({ type: 'pipeSegment', segmentId: 'd4' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: FAIL — `buildDomeMesh` not exported. (The `advanceFrame` dome test may pass already via the `default:` branch — that is fine; it pins the behaviour.)

**Step 3: Write minimal implementation**

In `pipeline-geometry.ts`, make the cap case explicitly shared (line 160):

```ts
    case 'cap':
    case 'dome':
      // Terminal — no further connection
      return { origin: origin.clone(), direction: direction.clone(), up: up.clone() };
```

Append after `buildCapMesh`:

```ts
/**
 * Build a dome end segment — a semi-ellipsoidal head closing the pipe run.
 * headRatio is D/2h: 2.0 = 2:1 ellipsoidal (vessel-head profile), 1.0 = hemi.
 */
export function buildDomeMesh(
  frame: PipeFrame,
  segment: PipeSegment,
  pipeDiameter: number,
  material: THREE.Material,
): THREE.Mesh {
  const radius = (pipeDiameter / 2) * SCALE;
  const ratio = segment.headRatio ?? 2.0;
  const wallThickness = radius * WALL_RATIO;

  // Outer + inner flipped shell, same pattern as the elbow torus pair
  const outer = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const inner = new THREE.SphereGeometry(radius - wallThickness, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  inner.scale(1, 1, -1);
  const geom = mergeGeometries([outer, inner]) ?? outer;
  geom.scale(1, 1 / ratio, 1);

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(frame.origin);

  const defaultDir = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(defaultDir, frame.direction);

  mesh.userData = { type: 'pipeSegment', segmentId: segment.id };
  return mesh;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add src/components/VesselModeler/engine/pipeline-geometry.ts src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts
git commit -m "feat(vessel-modeler): dome end geometry builder"
```

---

### Task 3: Wire dome into `buildPipelineGroup` + `getConnectionPoints`

**Files:**
- Modify: `src/components/VesselModeler/engine/pipeline-geometry.ts:11` (import), `:416` (switch), `:437` (ring), `:513` (skip)
- Test: `src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`

**Step 1: Write the failing tests**

Append (add `buildPipelineGroup`, `getConnectionPoints` to the pipeline-geometry import; add `Pipeline`, `NozzleConfig` to the types import):

```ts
describe('buildPipelineGroup — dome-terminated chain', () => {
  const material = new THREE.MeshStandardMaterial();
  const ringMaterial = new THREE.MeshBasicMaterial();

  function freePipeline(segments: PipeSegment[]): Pipeline {
    return {
      id: 'pl-1',
      nozzleIndex: -1,
      pipeDiameter: 100,
      segments,
      freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] },
    };
  }

  it('builds a dome mesh and suppresses the end connection ring', () => {
    const group = buildPipelineGroup(
      freePipeline([
        { id: 's-1', type: 'straight', rotation: 0, length: 300 },
        { id: 's-2', type: 'dome', rotation: 0, headRatio: 2 },
      ]),
      null, null, 0, material, ringMaterial,
    );
    const dome = group.children.find(c => c.userData?.segmentId === 's-2');
    const ring = group.children.find(c => c.userData?.isConnectionPoint);
    expect(dome).toBeDefined();
    expect(ring).toBeUndefined();
  });

  it('still adds the connection ring on an open chain', () => {
    const group = buildPipelineGroup(
      freePipeline([{ id: 's-1', type: 'straight', rotation: 0, length: 300 }]),
      null, null, 0, material, ringMaterial,
    );
    expect(group.children.find(c => c.userData?.isConnectionPoint)).toBeDefined();
  });

  it('positions the dome at the end of the preceding segment', () => {
    const group = buildPipelineGroup(
      freePipeline([
        { id: 's-1', type: 'straight', rotation: 0, length: 300 },
        { id: 's-2', type: 'dome', rotation: 0 },
      ]),
      null, null, 0, material, ringMaterial,
    );
    const dome = group.children.find(c => c.userData?.segmentId === 's-2') as THREE.Mesh;
    expect(dome.position.y).toBeCloseTo(300 * SCALE, 5);
  });
});

describe('getConnectionPoints — dome-terminated pipeline offers no endpoint', () => {
  function nozzleSetup() {
    const vesselGroup = new THREE.Group();
    const nozzleGroup = new THREE.Group();
    nozzleGroup.userData = { type: 'nozzle', nozzleIdx: 0 };
    vesselGroup.add(nozzleGroup);
    const nozzle: NozzleConfig = {
      name: 'P1', pos: 0, proj: 500, angle: 90, size: 100, style: 'plain-pipe',
    };
    return { vesselGroup, nozzle };
  }

  function attachedPipeline(segments: PipeSegment[]): Pipeline {
    return { id: 'pl-n', nozzleIndex: 0, pipeDiameter: 100, segments };
  }

  it('yields an endpoint for an open pipeline', () => {
    const { vesselGroup, nozzle } = nozzleSetup();
    const points = getConnectionPoints(
      [attachedPipeline([{ id: 's-1', type: 'straight', rotation: 0, length: 300 }])],
      [nozzle], vesselGroup, 100,
    );
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe('pipeline');
  });

  it('yields nothing after a dome end (parity with cap)', () => {
    const { vesselGroup, nozzle } = nozzleSetup();
    const points = getConnectionPoints(
      [attachedPipeline([
        { id: 's-1', type: 'straight', rotation: 0, length: 300 },
        { id: 's-2', type: 'dome', rotation: 0 },
      ])],
      [nozzle], vesselGroup, 100,
    );
    expect(points).toHaveLength(0);
  });
});
```

Note: if `NozzleConfig` requires more fields under strict TS, add the minimal missing ones — check the interface in `types.ts` rather than casting.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: the dome-chain test FAILS (no dome mesh built — unknown type is skipped; ring present because `lastSegment.type !== 'cap'`), and the dome `getConnectionPoints` test FAILS (1 point returned).

**Step 3: Write minimal implementation**

In `pipeline-geometry.ts`:

Line 11 — add `isTerminalSegment` to the types import:

```ts
import { type FreeOrigin, type NozzleConfig, type Pipeline, type PipeSegment, findClosestPipeSize, isTerminalSegment } from '../types';
```

In `buildPipelineGroup`'s switch (after `case 'cap':`):

```ts
      case 'dome':
        mesh = buildDomeMesh(frame, segment, currentDiameter, material);
        break;
```

Ring suppression (line ~437):

```ts
  if (!lastSegment || !isTerminalSegment(lastSegment.type)) {
```

`getConnectionPoints` skip (line ~513):

```ts
    if (lastSeg && isTerminalSegment(lastSeg.type)) continue; // closed — no connection point
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts`
Expected: PASS (12 tests).

**Step 5: Commit**

```bash
git add src/components/VesselModeler/engine/pipeline-geometry.ts src/components/VesselModeler/engine/__tests__/pipeline-geometry.test.ts
git commit -m "feat(vessel-modeler): wire dome end into pipeline chain and connection points"
```

---

### Task 4: Defaults + cloud-import mapping (`VesselModeler.tsx`)

No unit test — this component has no test harness; covered by typecheck now and the manual drive in Task 6.

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx:818-828` (createDefaultSegment), `:622-628` and `:2234-2240` (both import maps)

**Step 1: Add the default**

In `createDefaultSegment`, after the `'cap'` case:

```ts
            case 'dome': return { ...base, headRatio: 2.0 };
```

**Step 2: Add `headRatio` to BOTH segment import whitelists**

Both maps currently end with:

```ts
                    endDiameter: s.endDiameter, branchDiameter: s.branchDiameter, style: s.style,
```

Change to (in **both** places — ~line 627 and ~line 2239):

```ts
                    endDiameter: s.endDiameter, branchDiameter: s.branchDiameter, style: s.style,
                    headRatio: s.headRatio,
```

Missing either site silently strips saved ratios on cloud load.

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat(vessel-modeler): dome end defaults and cloud-import mapping"
```

---

### Task 5: UI — parts lists + Head Ratio slider

No unit test (declarative list/config additions; VesselModeler sidebar has no RTL harness) — verified by typecheck + manual drive in Task 6.

**Files:**
- Modify: `src/components/VesselModeler/sidebar/PipingSection.tsx:38-57` (SEGMENT_TYPES + segmentLabel), `:427-437` (vessel-attached edit form), `:708-718` (free-pipe edit form)
- Modify: `src/components/VesselModeler/sidebar/PipePartPopup.tsx:10-16` (PARTS)

**Step 1: Add the part to both lists**

`PipingSection.tsx` `SEGMENT_TYPES` and `PipePartPopup.tsx` `PARTS` both gain:

```ts
    { type: 'dome', label: 'Dome End' },
```

**Step 2: Label**

In `segmentLabel`, after the `'cap'` case:

```ts
        case 'dome': return `Dome End ${Number((seg.headRatio ?? 2).toFixed(1))}:1`;
```

**Step 3: Head Ratio slider — vessel-attached form**

After the `{seg.type === 'flange' && (...)}` block (~line 437):

```tsx
                                                            {seg.type === 'dome' && (
                                                                <SliderRow
                                                                    label="Head Ratio"
                                                                    value={seg.headRatio ?? 2}
                                                                    min={1}
                                                                    max={3}
                                                                    step={0.1}
                                                                    unit=":1"
                                                                    onChange={(v) => onUpdateSegment(pl.id, seg.id, { headRatio: v })}
                                                                />
                                                            )}
```

**Step 4: Head Ratio slider — free-pipe form**

Same block after the free-pipe flange case (~line 718), with `fp.id`:

```tsx
                                                        {seg.type === 'dome' && (
                                                            <SliderRow
                                                                label="Head Ratio"
                                                                value={seg.headRatio ?? 2}
                                                                min={1}
                                                                max={3}
                                                                step={0.1}
                                                                unit=":1"
                                                                onChange={(v) => onUpdateSegment(fp.id, seg.id, { headRatio: v })}
                                                            />
                                                        )}
```

**Step 5: Typecheck + lint, commit**

Run: `npm run typecheck && npm run lint`
Expected: clean (lint may surface pre-existing warnings only).

```bash
git add src/components/VesselModeler/sidebar/PipingSection.tsx src/components/VesselModeler/sidebar/PipePartPopup.tsx
git commit -m "feat(vessel-modeler): dome end in piping UI (library, popup, head-ratio slider)"
```

---

### Task 6: Full verification + manual drive

**Step 1: Engine tests + full suite**

```bash
npx vitest run src/components/VesselModeler
npx vitest run
```

Expected: engine tests all pass; full suite ≥ 737 passed + the 12 new, 3 skipped, and only the known `useLayoutMode` worker crash.

**Step 2: Build**

Run: `npm run build`
Expected: clean production build.

**Step 3: Manual drive (superpowers:verification-before-completion / verify skill)**

Start `npm run dev`, open the Vessel Modeler:
1. Piping section → library shows "Dome End".
2. Add a free pipe → add Straight → add Dome End → dome renders at the pipe end, no cyan connection ring.
3. Select the dome segment → Head Ratio slider 1.0–3.0 works, geometry updates live, label reads "Dome End 2:1".
4. Vessel mode: connection point + pipeline → Dome End from the 3D popup.
5. Save model, reload → dome + ratio persist.

**Step 4: Final commit if fixes were needed, then finishing-a-development-branch**

Use superpowers:finishing-a-development-branch for merge/PR decision.
