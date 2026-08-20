import { describe, it, expect } from 'vitest';
import {
  describeHover,
  findEntityUserData,
  hoverLabelFor,
  isComposedVisible,
  thicknessAtUv,
  type HoverNode,
} from '../readonly-hover';
import type { VesselState } from '../../types';

// Pure hover resolution for the read-only viewport. Two rules carry the weight:
// THREE's raycaster returns hits under HIDDEN branches (so composed visibility
// must be re-checked by walking up), and the mesh actually hit is usually a
// child of the entity (so the entity is the nearest ancestor carrying a `type`).

/** Minimal parent-linked node tree; `visible` omitted ⇒ visible. */
function node(userData?: Record<string, unknown>, parent: HoverNode | null = null): HoverNode {
  return { userData, parent };
}

const state = {
  nozzles: [
    { id: 'noz-1', name: 'N1' },
    { id: 'noz-2', name: 'N2' },
  ],
  liftingLugs: [{ name: 'Lug A' }],
  saddles: [{ pos: 100 }],
  welds: [{ name: 'W-01' }],
  textures: [{ id: 7, name: 'Nameplate' }],
  annotations: [{ id: 3, name: 'Pitting' }],
  rulers: [{ id: 5, name: 'Span' }],
  coverageRects: [{ id: 11, name: 'Rect A' }],
  inspectionImages: [],
  scanComposites: [{ id: 'sc-1', name: 'Shell scan' }],
  domeScanComposites: [{ id: 'ds-1', name: 'Top head' }],
  appendages: [{ id: 'app-1', name: 'Boot 1' }],
  pipelines: [],
} as unknown as VesselState;

describe('isComposedVisible', () => {
  it('accepts a node whose whole chain up to the root is visible', () => {
    const root = node();
    expect(isComposedVisible(node({}, node({}, root)), root)).toBe(true);
  });

  it('rejects a node hidden by an ancestor (the layer/body term lives there)', () => {
    const root = node();
    const hiddenGroup: HoverNode = { userData: {}, parent: root, visible: false };
    expect(isComposedVisible(node({}, hiddenGroup), root)).toBe(false);
  });

  it('rejects a node hidden on itself', () => {
    const root = node();
    expect(isComposedVisible({ userData: {}, parent: root, visible: false }, root)).toBe(false);
  });

  it('ignores visibility of the root and anything above it', () => {
    const above: HoverNode = { parent: null, visible: false };
    const root: HoverNode = { parent: above, visible: false };
    expect(isComposedVisible(node({}, root), root)).toBe(true);
  });
});

describe('findEntityUserData', () => {
  it('resolves the entity from a child mesh (e.g. a weld segment)', () => {
    const root = node();
    const weld = node({ type: 'weld', weldIdx: 0 }, root);
    expect(findEntityUserData(node(undefined, weld), root)).toEqual({ type: 'weld', weldIdx: 0 });
  });

  it('prefers the nearest typed ancestor', () => {
    const root = node();
    const outer = node({ type: 'appendage', bodyId: 'app-1' }, root);
    const inner = node({ type: 'nozzle', nozzleIdx: 1 }, outer);
    expect(findEntityUserData(inner, root)?.type).toBe('nozzle');
  });

  it('returns null when nothing below the root names a type', () => {
    const root = node({ type: 'vesselGroup' });
    expect(findEntityUserData(node({ role: 'domeScan-border' }, root), root)).toBeNull();
  });
});

describe('hoverLabelFor', () => {
  it.each([
    [{ type: 'nozzle', nozzleIdx: 1 }, 'N2'],
    [{ type: 'liftingLug', lugIdx: 0 }, 'Lug A'],
    [{ type: 'weld', weldIdx: 0 }, 'W-01'],
    [{ type: 'texture', id: 7 }, 'Nameplate'],
    [{ type: 'texture', textureIdx: 7 }, 'Nameplate'],
    [{ type: 'scanComposite', id: 'sc-1' }, 'Shell scan'],
    [{ type: 'domeScan', id: 'ds-1' }, 'Top head'],
    [{ type: 'annotation', annotationId: 3 }, 'Pitting'],
    [{ type: 'coverageRect', coverageRectId: 11 }, 'Rect A'],
    [{ type: 'ruler', rulerId: 5 }, 'Span'],
    [{ type: 'appendage', bodyId: 'app-1' }, 'Boot 1'],
  ])('labels %o', (userData, expected) => {
    expect(hoverLabelFor(state, userData)).toBe(expected);
  });

  it('has no label for entities without a name in the schema', () => {
    expect(hoverLabelFor(state, { type: 'saddle', saddleIdx: 0 })).toBeUndefined();
    expect(hoverLabelFor(state, { type: 'shell', isShell: true })).toBeUndefined();
  });

  it('has no label for a stale id (mesh outliving its entity)', () => {
    expect(hoverLabelFor(state, { type: 'nozzle', nozzleIdx: 99 })).toBeUndefined();
    expect(hoverLabelFor(state, { type: 'scanComposite', id: 'gone' })).toBeUndefined();
  });
});

describe('describeHover', () => {
  const root = node();

  it('reports type, label, verbatim userData and the world point', () => {
    const ud = { type: 'scanComposite', id: 'sc-1', data: [[1, 2]] };
    const hit = describeHover(state, node(undefined, node(ud, root)), root, [1, 2, 3]);
    expect(hit).toMatchObject({
      type: 'scanComposite',
      label: 'Shell scan',
      userData: ud,
      point: [1, 2, 3],
    });
    // The grid rides through untouched — it is what powers hover thickness.
    expect(hit?.userData.data).toBe(ud.data);
  });

  it('rejects a hit under a hidden layer so the caller keeps scanning', () => {
    const hidden: HoverNode = { userData: { type: 'coverageRect' }, parent: root, visible: false };
    expect(describeHover(state, hidden, root, [0, 0, 0])).toBeNull();
  });

  it('rejects a visible hit that names no entity', () => {
    expect(
      describeHover(state, node({ role: 'domeScan-border' }, root), root, [0, 0, 0])
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Heatmap thickness readout
// ---------------------------------------------------------------------------
// The client page and the modeler read the same pixel and must report the same
// millimetre, so the index maths here is pinned against the shape
// `interaction-manager` uses: col from u, row from FLIPPED v, both clamped.

describe('thicknessAtUv', () => {
  const grid = {
    type: 'scanComposite',
    id: 'sc-1',
    width: 2,
    height: 2,
    // rows are top-to-bottom in the texture; v is bottom-up.
    data: [
      [10, 11],
      [12, null],
    ],
  };

  it('flips v, so the TOP row of the grid is the TOP of the texture', () => {
    expect(thicknessAtUv(grid, [0.25, 0.75])).toBe(10);
    expect(thicknessAtUv(grid, [0.75, 0.75])).toBe(11);
    expect(thicknessAtUv(grid, [0.25, 0.25])).toBe(12);
  });

  it('reports null for a cell with no reading — distinct from "not a heatmap"', () => {
    expect(thicknessAtUv(grid, [0.75, 0.25])).toBeNull();
  });

  it('clamps the edges instead of reading past the grid', () => {
    // u=1 would index col 2 in a 2-wide grid; v=1 is the top row.
    expect(thicknessAtUv(grid, [1, 1])).toBe(11);
    expect(thicknessAtUv(grid, [0, 0])).toBe(12);
  });

  it('is undefined when the hit is not a heatmap, or carries no uv', () => {
    expect(thicknessAtUv({ type: 'nozzle' }, [0.5, 0.5])).toBeUndefined();
    expect(thicknessAtUv(grid, undefined)).toBeUndefined();
  });

  it('is undefined when the mesh carries no usable grid', () => {
    expect(thicknessAtUv({ type: 'scanComposite' }, [0.5, 0.5])).toBeUndefined();
    expect(
      thicknessAtUv({ type: 'scanComposite', data: [], width: 0, height: 0 }, [0.5, 0.5])
    ).toBeUndefined();
  });

  it('works the same for dome scans', () => {
    expect(thicknessAtUv({ ...grid, type: 'domeScan' }, [0.25, 0.75])).toBe(10);
  });
});
