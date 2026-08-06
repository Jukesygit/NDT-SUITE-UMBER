// =============================================================================
// Structural Hash
// =============================================================================
// Only geometry-affecting properties. When this string changes, ThreeViewport
// rebuilds the whole scene; selection / preview / cosmetic changes must NOT
// alter it. Kept as a pure, side-effect-free module (no renderer imports) so it
// can be unit-tested directly; ThreeViewport re-exports it.
//
// Appendages contribute STRUCTURAL fields only (design §7 / C6): id, mountPos,
// mountAngle, diameter, length, endClosure, headRatio, flangeJoint.show — never
// name/visible/locked/nominalThickness, which are cosmetic and would cause
// rebuild storms.
//
// Per-entity `visible` (C13) is the same kind of cosmetic flag on the wholesale-
// hashed collections (nozzles / liftingLugs / saddles / welds / rulers /
// coverageRects). It is stripped from each via `.map(x => ({ ...x, visible:
// undefined }))`: spread keeps key order and JSON.stringify drops the undefined
// value, so a legacy (visible-less) state hashes BYTE-IDENTICALLY while a
// visibility toggle no longer rebuilds — it is applied by ThreeViewport's Tier-2
// in-place effect (mirroring the appendage precedent). scan/dome composites are
// field-listed, so they simply omit `visible`. Annotations & inspection images
// KEEP `visible` in this hash on purpose: their visibility drives separately
// built, drag-enabled CSS2D leader labels/thumbnails (not children of the entity
// group), so they stay on the rebuild path until the outliner unifies label
// lifecycle with the toggle UX.
//
// Scan/dome composites likewise contribute STRUCTURAL fields only. The heatmap
// visual params (opacity, colorScale, rangeMin, rangeMax) are DELIBERATELY
// excluded (T2-B / review §4.4): they only change the baked heatmap texture, not
// the mesh geometry, so ThreeViewport repaints them via an in-place Tier-2
// texture swap. Folding them into this hash disposed and rebuilt every mesh on
// each opacity-slider tick (the "slider rebuild storm").
// =============================================================================

import type { VesselState } from '../types';

export function structuralHash(s: VesselState): string {
  return JSON.stringify({
    id: s.id,
    length: s.length,
    headRatio: s.headRatio,
    orientation: s.orientation,
    // `visible` is a COSMETIC per-entity flag (C13) — hidden entities keep
    // contributing to stats/coverage; only their render is toggled by a Tier-2
    // in-place effect, never a rebuild. It must NOT enter this hash. These
    // collections are hashed WHOLESALE, so strip `visible` via a mapped
    // projection: spread preserves key order and JSON.stringify omits an
    // `undefined` value, so a legacy (visible-less) state hashes byte-identically.
    nozzles: s.nozzles.map((n) => ({ ...n, visible: undefined })),
    liftingLugs: s.liftingLugs.map((l) => ({ ...l, visible: undefined })),
    saddles: s.saddles.map((sd) => ({ ...sd, visible: undefined })),
    textures: s.textures.map((t) => ({
      id: t.id,
      pos: t.pos,
      angle: t.angle,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      rotation: t.rotation,
      flipH: t.flipH,
      flipV: t.flipV,
    })),
    welds: s.welds.map((w) => ({ ...w, visible: undefined })),
    annotations: s.annotations.map((a) => ({
      ...a,
      labelOffset: undefined,
      leaderLength: undefined,
    })),
    rulers: s.rulers.map((r) => ({ ...r, visible: undefined })),
    coverageRects: s.coverageRects.map((c) => ({ ...c, visible: undefined })),
    inspectionImages: s.inspectionImages.map((i) => ({
      ...i,
      labelOffset: undefined,
      leaderLength: undefined,
    })),
    scanComposites: s.scanComposites.map((sc) => ({
      id: sc.id,
      hasData: (sc.data?.length ?? 0) > 0,
      indexStartMm: sc.indexStartMm,
      datumAngleDeg: sc.datumAngleDeg,
      scanDirection: sc.scanDirection,
      indexDirection: sc.indexDirection,
      orientationConfirmed: sc.orientationConfirmed,
      // colorScale / rangeMin / rangeMax / opacity are cosmetic — see header note.
    })),
    domeScanComposites: (s.domeScanComposites ?? []).map((ds) => ({
      id: ds.id,
      hasData: (ds.data?.length ?? 0) > 0,
      // bodyId selects the closure the scan drapes on (undefined = main head);
      // changing it re-parameterises the geometry, so it must rebuild.
      bodyId: ds.bodyId,
      head: ds.head,
      centerPhi: ds.centerPhi,
      centerTheta: ds.centerTheta,
      scanDirection: ds.scanDirection,
      indexDirection: ds.indexDirection,
      orientationConfirmed: ds.orientationConfirmed,
      // colorScale / rangeMin / rangeMax / opacity are cosmetic — see header note.
    })),
    appendages: (s.appendages ?? []).map((a) => ({
      id: a.id,
      mountPos: a.mountPos,
      mountAngle: a.mountAngle,
      diameter: a.diameter,
      length: a.length,
      endClosure: a.endClosure,
      headRatio: a.headRatio,
      flangeShow: a.flangeJoint?.show,
    })),
    pipelines: s.pipelines,
    hasModel: s.hasModel,
    vesselShape: s.vesselShape,
    showNozzleLabels: s.visuals.showNozzleLabels,
    showWeldLabels: s.visuals.showWeldLabels,
  });
}
