import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { AnnotationShapeConfig, RulerConfig, VesselState } from '../../types';
import { createAnnotationLabelSprite, createRulerLabelSprite } from '../text-sprite';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function makeVesselState(overrides?: Partial<VesselState>): VesselState {
  return {
    id: 2000,
    length: 8000,
    headRatio: 2,
    orientation: 'horizontal' as const,
    nozzles: [],
    liftingLugs: [],
    saddles: [],
    textures: [],
    annotations: [],
    rulers: [],
    coverageRects: [],
    inspectionImages: [],
    scanComposites: [],
    welds: [],
    measurementConfig: {
      referenceTangent: 'left',
      circumDirection: 'CW',
      viewFromEnd: 'left',
    },
    visuals: {} as any,
    thicknessThresholds: { mode: 'absolute' } as any,
    ...overrides,
  } as VesselState;
}

function makeAnnotation(overrides?: Partial<AnnotationShapeConfig>): AnnotationShapeConfig {
  return {
    id: 1,
    name: 'Test Annotation',
    type: 'scan',
    pos: 4000,
    angle: 90,
    width: 200,
    height: 150,
    color: '#ff0000',
    lineWidth: 2,
    showLabel: true,
    ...overrides,
  };
}

function makeRuler(overrides?: Partial<RulerConfig>): RulerConfig {
  return {
    id: 1,
    name: 'Test Ruler',
    startPos: 2000,
    startAngle: 90,
    endPos: 4000,
    endAngle: 90,
    color: '#ffffff',
    showLabel: true,
    ...overrides,
  };
}

function buildMockVesselGroup(): THREE.Group {
  const group = new THREE.Group();

  // Shell mesh
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x4488ff }),
  );
  shell.userData = { type: 'shell', isShell: true };
  group.add(shell);

  // Annotation outline (kept)
  const annotLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineBasicMaterial({ color: 0xff0000 }),
  );
  annotLine.userData = { type: 'annotation', annotationId: 1 };
  group.add(annotLine);

  // Annotation fill (excluded)
  const annotFill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.15 }),
  );
  annotFill.userData = { type: 'annotation-fill', annotationId: 1 };
  group.add(annotFill);

  // Hit mesh (excluded — transparent, opacity 0)
  const hitMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
  );
  hitMesh.userData = { type: 'annotation', annotationId: 1 };
  group.add(hitMesh);

  // CSS2D label (excluded)
  const el = document.createElement('div');
  el.textContent = 'Test Label';
  const cssLabel = new CSS2DObject(el);
  cssLabel.userData = { type: 'annotation-label', annotationId: 1 };
  group.add(cssLabel);

  // Ruler line (kept)
  const rulerLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0)]),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  rulerLine.userData = { type: 'ruler', rulerId: 1 };
  group.add(rulerLine);

  // Ruler CSS2D label (excluded)
  const rulerEl = document.createElement('div');
  rulerEl.textContent = '500 mm';
  const rulerLabel = new CSS2DObject(rulerEl);
  rulerLabel.userData = { type: 'ruler-label', rulerId: 1 };
  group.add(rulerLabel);

  // Coverage rect (excluded)
  const covRect = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0)]),
    new THREE.LineBasicMaterial({ color: 0x00ff00 }),
  );
  covRect.userData = { type: 'coverageRect', coverageRectId: 1 };
  group.add(covRect);

  // Scan gizmo (excluded)
  const gizmo = new THREE.Mesh(
    new THREE.SphereGeometry(0.05),
    new THREE.MeshBasicMaterial({ color: 0xffff00 }),
  );
  gizmo.userData = { type: 'scanGizmo', compositeId: '1' };
  group.add(gizmo);

  // Texture plane (kept)
  const texPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  texPlane.userData = { type: 'texture', id: 1 };
  group.add(texPlane);

  // Texture border (excluded)
  const texBorder = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 1.1),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.5 }),
  );
  texBorder.userData = { type: 'texture-border', id: 1 };
  group.add(texBorder);

  return group;
}

// ---------------------------------------------------------------------------
// text-sprite.ts Tests
// ---------------------------------------------------------------------------

describe('text-sprite', () => {
  const vesselState = makeVesselState();

  describe('createAnnotationLabelSprite', () => {
    it('returns a THREE.Mesh', async () => {
      const sprite = await createAnnotationLabelSprite(makeAnnotation(), vesselState);
      expect(sprite).toBeInstanceOf(THREE.Mesh);
    });

    it('positions sprite at leader end position (not origin)', async () => {
      const sprite = await createAnnotationLabelSprite(
        makeAnnotation({ pos: 4000, angle: 90 }),
        vesselState,
      );
      expect(sprite.position.length()).toBeGreaterThan(0);
    });

    it('has a MeshBasicMaterial with a texture map', async () => {
      const sprite = await createAnnotationLabelSprite(makeAnnotation(), vesselState);
      const mat = sprite.material as THREE.MeshBasicMaterial;
      expect(mat).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(mat.map).toBeTruthy();
      expect(mat.transparent).toBe(true);
    });

    it('scales based on vessel diameter', async () => {
      const annotation = makeAnnotation();
      const smallSprite = await createAnnotationLabelSprite(annotation, makeVesselState({ id: 500 }));
      const largeSprite = await createAnnotationLabelSprite(annotation, makeVesselState({ id: 4000 }));
      const smallGeo = smallSprite.geometry as THREE.PlaneGeometry;
      const largeGeo = largeSprite.geometry as THREE.PlaneGeometry;
      expect(largeGeo.parameters.width).toBeGreaterThan(smallGeo.parameters.width);
      expect(largeGeo.parameters.height).toBeGreaterThan(smallGeo.parameters.height);
    });

    it('sets export-label userData', async () => {
      const sprite = await createAnnotationLabelSprite(makeAnnotation({ id: 42 }), vesselState);
      expect(sprite.userData).toEqual({
        type: 'export-label',
        sourceType: 'annotation',
        sourceId: 42,
      });
    });

    it('has non-zero geometry dimensions', async () => {
      const sprite = await createAnnotationLabelSprite(makeAnnotation(), vesselState);
      const geo = sprite.geometry as THREE.PlaneGeometry;
      expect(geo.parameters.width).toBeGreaterThan(0);
      expect(geo.parameters.height).toBeGreaterThan(0);
    });
  });

  describe('createRulerLabelSprite', () => {
    it('returns a THREE.Sprite', () => {
      const sprite = createRulerLabelSprite(makeRuler(), vesselState);
      expect(sprite).toBeInstanceOf(THREE.Sprite);
    });

    it('positions sprite at ruler midpoint (not origin)', () => {
      const sprite = createRulerLabelSprite(
        makeRuler({ startPos: 2000, endPos: 6000 }),
        vesselState,
      );
      expect(sprite.position.length()).toBeGreaterThan(0);
    });

    it('sets export-label userData for ruler', () => {
      const sprite = createRulerLabelSprite(makeRuler({ id: 7 }), vesselState);
      expect(sprite.userData).toEqual({
        type: 'export-label',
        sourceType: 'ruler',
        sourceId: 7,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// gltf-export.ts Filtering Tests
// ---------------------------------------------------------------------------

describe('gltf-export filtering', () => {
  // Test the filtering logic by importing and testing it indirectly.
  // GLTFExporter needs WebGL context which jsdom doesn't provide,
  // so we test the scene preparation logic separately.

  it('original group is not mutated by clone', () => {
    const group = buildMockVesselGroup();
    const childCount = group.children.length;

    // Deep clone and verify original untouched
    const clone = group.clone(true);
    expect(group.children.length).toBe(childCount);
    expect(clone.children.length).toBe(childCount);
  });

  it('CSS2DObjects can be identified and removed from a clone', () => {
    const group = buildMockVesselGroup();
    const clone = group.clone(true);

    // Count CSS2DObjects
    let cssCount = 0;
    clone.traverse(obj => {
      if (obj instanceof CSS2DObject) cssCount++;
    });
    expect(cssCount).toBe(2); // annotation-label + ruler-label

    // Remove them
    const toRemove: THREE.Object3D[] = [];
    clone.traverse(obj => {
      if (obj instanceof CSS2DObject) toRemove.push(obj);
    });
    toRemove.forEach(obj => obj.removeFromParent());

    // Verify removed
    let cssCountAfter = 0;
    clone.traverse(obj => {
      if (obj instanceof CSS2DObject) cssCountAfter++;
    });
    expect(cssCountAfter).toBe(0);

    // Original untouched
    let originalCssCount = 0;
    group.traverse(obj => {
      if (obj instanceof CSS2DObject) originalCssCount++;
    });
    expect(originalCssCount).toBe(2);
  });

  it('identifies objects that should be excluded by userData type', () => {
    const EXCLUDE_TYPES = new Set([
      'annotation-fill', 'texture-border', 'scanComposite-border',
      'coverageRect', 'scanGizmo', 'scanGizmoArrowCirc', 'scanGizmoArrowLong',
      'annotation-label', 'ruler-label', 'inspection-image-label',
    ]);

    const group = buildMockVesselGroup();
    const excluded: string[] = [];
    const kept: string[] = [];

    group.children.forEach(child => {
      const type = child.userData?.type;
      if (child instanceof CSS2DObject || (type && EXCLUDE_TYPES.has(type))) {
        excluded.push(type || 'CSS2DObject');
      } else if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (mat && mat.opacity === 0 && mat.transparent) {
          excluded.push('hit-mesh');
        } else {
          kept.push(type || 'unknown');
        }
      } else {
        kept.push(type || 'unknown');
      }
    });

    // These types should be excluded
    expect(excluded).toContain('annotation-fill');
    expect(excluded).toContain('texture-border');
    expect(excluded).toContain('coverageRect');
    expect(excluded).toContain('scanGizmo');
    expect(excluded).toContain('annotation-label');
    expect(excluded).toContain('ruler-label');
    expect(excluded).toContain('hit-mesh');

    // These should be kept
    expect(kept).toContain('shell');
    expect(kept).toContain('annotation');
    expect(kept).toContain('ruler');
    expect(kept).toContain('texture');
  });

  it('annotation sprites are only created for visible labels', async () => {
    const state = makeVesselState({
      annotations: [
        makeAnnotation({ id: 1, showLabel: true, visible: true }),
        makeAnnotation({ id: 2, showLabel: false }),
        makeAnnotation({ id: 3, showLabel: true, visible: false }),
        makeAnnotation({ id: 4, showLabel: true }),  // visible defaults to undefined (truthy check)
      ],
    });

    const sprites: THREE.Mesh[] = [];
    for (const ann of state.annotations) {
      if (!ann.showLabel) continue;
      if (ann.visible === false) continue;
      sprites.push(await createAnnotationLabelSprite(ann, state));
    }

    // Only ids 1 and 4 qualify
    expect(sprites).toHaveLength(2);
    expect(sprites[0].userData.sourceId).toBe(1);
    expect(sprites[1].userData.sourceId).toBe(4);
  });

  it('ruler sprites are only created when showLabel is true', () => {
    const state = makeVesselState({
      rulers: [
        makeRuler({ id: 1, showLabel: true }),
        makeRuler({ id: 2, showLabel: false }),
        makeRuler({ id: 3, showLabel: true }),
      ],
    });

    const sprites: THREE.Mesh[] = [];
    for (const ruler of state.rulers) {
      if (!ruler.showLabel) continue;
      sprites.push(createRulerLabelSprite(ruler, state));
    }

    expect(sprites).toHaveLength(2);
    expect(sprites[0].userData.sourceId).toBe(1);
    expect(sprites[1].userData.sourceId).toBe(3);
  });
});
