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
// =============================================================================

import type { VesselState } from '../types';

export function structuralHash(s: VesselState): string {
  return JSON.stringify({
    id: s.id,
    length: s.length,
    headRatio: s.headRatio,
    orientation: s.orientation,
    nozzles: s.nozzles,
    liftingLugs: s.liftingLugs,
    saddles: s.saddles,
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
    welds: s.welds,
    annotations: s.annotations.map((a) => ({
      ...a,
      labelOffset: undefined,
      leaderLength: undefined,
    })),
    rulers: s.rulers,
    coverageRects: s.coverageRects,
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
      colorScale: sc.colorScale,
      rangeMin: sc.rangeMin,
      rangeMax: sc.rangeMax,
      opacity: sc.opacity,
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
      colorScale: ds.colorScale,
      rangeMin: ds.rangeMin,
      rangeMax: ds.rangeMax,
      opacity: ds.opacity,
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
