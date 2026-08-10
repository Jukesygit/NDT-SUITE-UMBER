import { type Dispatch, type SetStateAction, type RefObject } from 'react';
import type {
  VesselState,
  VesselCallbacks,
  DomeScanHoverInfo,
  NozzleConfig,
  AppendageConfig,
  SaddleConfig,
  LiftingLugConfig,
  WeldConfig,
  TextureConfig,
  CoverageRectConfig,
  RulerConfig,
  InspectionImageConfig,
  AnnotationShapeConfig,
  ScanCompositeConfig,
  DomeScanConfig,
} from '../types';
import type { VesselAction } from '../engine/vessel-reducer';

interface UseViewportCallbacksParams {
  vesselState: VesselState;
  dispatch: Dispatch<VesselAction>;
  // Entity CRUD callbacks composed from the D1 action hooks (threaded in
  // explicitly — no context). Identities are the hooks' own useCallback results.
  updateAppendage: (index: number, updates: Partial<AppendageConfig>) => void;
  addAnnotation: (annotation: AnnotationShapeConfig) => void;
  updateAnnotation: (id: number, updates: Partial<AnnotationShapeConfig>) => void;
  getNextAnnotationId: () => number;
  addRuler: (ruler: RulerConfig) => void;
  getNextRulerId: () => number;
  addCoverageRect: (rect: CoverageRectConfig) => void;
  updateCoverageRect: (id: number, updates: Partial<CoverageRectConfig>) => void;
  getNextCoverageRectId: () => number;
  updateInspectionImage: (id: number, updates: Partial<InspectionImageConfig>) => void;
  updateWeld: (index: number, updates: Partial<WeldConfig>) => void;
  updateNozzle: (index: number, updates: Partial<NozzleConfig>) => void;
  updateSaddle: (index: number, updates: Partial<SaddleConfig>) => void;
  updateLug: (index: number, updates: Partial<LiftingLugConfig>) => void;
  updateTexture: (id: number, updates: Partial<TextureConfig>) => void;
  handleUpdateScanComposite: (id: string, updates: Partial<ScanCompositeConfig>) => void;
  handleUpdateDomeScan: (id: string, updates: Partial<DomeScanConfig>) => void;
  cursorTooltipRef: RefObject<HTMLDivElement | null>;
  setDomeScanHoverInfo: Dispatch<SetStateAction<DomeScanHoverInfo | null>>;
  setPipePartPopup: Dispatch<SetStateAction<{ pipelineId: string; x: number; y: number } | null>>;
}

/**
 * Builds the single `VesselCallbacks` object consumed by ThreeViewport (D3).
 * Body extracted verbatim from VesselModeler.tsx — every callback closes over
 * the same dispatch / entity callbacks / vessel state it did inline.
 *
 * Memoization is deliberately absent: the original site built this object as a
 * plain literal on every render (no `useMemo`), so ThreeViewport received a new
 * `callbacks` prop each render. This hook reproduces that exactly by returning a
 * fresh literal per call — do NOT wrap the result in `useMemo`, or ThreeViewport
 * would re-render less often than today (a behavior change).
 */
export function useViewportCallbacks({
  vesselState,
  dispatch,
  updateAppendage,
  addAnnotation,
  updateAnnotation,
  getNextAnnotationId,
  addRuler,
  getNextRulerId,
  addCoverageRect,
  updateCoverageRect,
  getNextCoverageRectId,
  updateInspectionImage,
  updateWeld,
  updateNozzle,
  updateSaddle,
  updateLug,
  updateTexture,
  handleUpdateScanComposite,
  handleUpdateDomeScan,
  cursorTooltipRef,
  setDomeScanHoverInfo,
  setPipePartPopup,
}: UseViewportCallbacksParams): VesselCallbacks {
  const vesselCallbacks: VesselCallbacks = {
    onNozzleSelected: (idx) => dispatch({ type: 'SELECT_NOZZLE', index: idx }),
    onAppendageSelected: (idx) => dispatch({ type: 'SELECT_APPENDAGE', index: idx }),
    onAppendageMoved: (idx, mountPos, mountAngle) => {
      updateAppendage(idx, {
        mountPos: Math.round(mountPos),
        mountAngle: Math.round(mountAngle),
      });
    },
    onSaddleSelected: (idx) => dispatch({ type: 'SELECT_SADDLE', index: idx }),
    onTextureSelected: (id) => dispatch({ type: 'SELECT_TEXTURE', id }),
    onLugSelected: (idx) => dispatch({ type: 'SELECT_LUG', index: idx }),
    onAnnotationSelected: (id) => dispatch({ type: 'SELECT_ANNOTATION', id }),
    // Cross-body drag (R2): when the model has boots the mount is included every
    // frame so the coalesce key is stable across the drag AND a crossing rides the
    // same coalesced entry (one undo reverses position AND body). With no boots the
    // bodyId is always undefined, so we omit it — byte-identical `{ pos, angle }`
    // update and history key (`annotation:id:angle,pos`), zero single-body change.
    onAnnotationMoved: (id, pos, angle, bodyId) => {
      const base = { pos: Math.round(pos), angle: Math.round(angle) };
      updateAnnotation(id, vesselState.appendages.length > 0 ? { ...base, bodyId } : base);
    },
    onAnnotationLabelOffsetChanged: (id, offset) => {
      updateAnnotation(id, { labelOffset: offset });
    },
    // The active body (bodyId) is decided by the interaction layer from the
    // current selection — active body = the selected entity's body, main shell
    // (undefined) when nothing body-scoped is selected. See `activeDrawBodyId`.
    // A draw-created annotation is a plain add (no history key), so undo treats
    // it exactly like every other new annotation.
    onAnnotationCreated: (type, pos, angle, width, height, bodyId) => {
      const id = getNextAnnotationId();
      const isRestriction = type === 'restriction';
      const prefix = isRestriction ? 'R' : 'A';
      const count = vesselState.annotations.filter((a) => a.type === type).length + 1;
      addAnnotation({
        id,
        name: `${prefix}${count}`,
        type,
        pos: Math.round(pos),
        angle: Math.round(angle),
        width: Math.round(width),
        height: Math.round(height),
        color: isRestriction ? '#facc15' : '#ff3333',
        lineWidth: 2,
        showLabel: true,
        bodyId,
      });
      dispatch({ type: 'SELECT_ANNOTATION', id });
      dispatch({ type: 'SET_PREVIEW_ANNOTATION', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_ANNOTATION', mode: null });
    },
    onAnnotationPreview: (type, pos, angle, width, height, bodyId) => {
      dispatch({
        type: 'SET_PREVIEW_ANNOTATION',
        preview: {
          id: -1,
          name: 'Preview',
          type,
          pos: Math.round(pos),
          angle: Math.round(angle),
          width: Math.round(width),
          height: Math.round(height),
          color: type === 'restriction' ? '#facc15' : '#ff3333',
          lineWidth: 2,
          showLabel: false,
          bodyId,
        },
      });
    },
    onRulerCreated: (startPos, startAngle, endPos, endAngle) => {
      const id = getNextRulerId();
      const num = vesselState.rulers.length + 1;
      addRuler({
        id,
        name: `R${num}`,
        startPos: Math.round(startPos),
        startAngle: Math.round(startAngle),
        endPos: Math.round(endPos),
        endAngle: Math.round(endAngle),
        color: '#ffaa00',
        showLabel: true,
      });
      dispatch({ type: 'SET_PREVIEW_RULER', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_RULER', active: false });
    },
    onRulerPreview: (startPos, startAngle, endPos, endAngle) => {
      dispatch({
        type: 'SET_PREVIEW_RULER',
        preview: {
          id: -1,
          name: 'Preview',
          startPos: Math.round(startPos),
          startAngle: Math.round(startAngle),
          endPos: Math.round(endPos),
          endAngle: Math.round(endAngle),
          color: '#ffaa00',
          showLabel: true,
        },
      });
    },
    onCoverageRectCreated: (pos, angle, width, height, bodyId) => {
      const id = getNextCoverageRectId();
      const num = vesselState.coverageRects.length + 1;
      addCoverageRect({
        id,
        name: `C${num}`,
        pos: Math.round(pos),
        angle: Math.round(angle),
        width: Math.round(width),
        height: Math.round(height),
        color: '#00cc66',
        lineWidth: 2,
        filled: true,
        fillOpacity: 0.2,
        bodyId,
      });
      dispatch({ type: 'SELECT_COVERAGE_RECT', id });
      dispatch({ type: 'SET_PREVIEW_COVERAGE_RECT', preview: null });
      dispatch({ type: 'SET_DRAW_MODE_COVERAGE', active: false });
    },
    onCoverageRectPreview: (pos, angle, width, height, bodyId) => {
      dispatch({
        type: 'SET_PREVIEW_COVERAGE_RECT',
        preview: {
          id: -1,
          name: 'Preview',
          pos: Math.round(pos),
          angle: Math.round(angle),
          width: Math.round(width),
          height: Math.round(height),
          color: '#00cc66',
          lineWidth: 2,
          filled: false,
          fillOpacity: 0.2,
          bodyId,
        },
      });
    },
    onCoverageRectSelected: (id) => dispatch({ type: 'SELECT_COVERAGE_RECT', id }),
    onCoverageRectMoved: (id, pos, angle, bodyId) => {
      const base = { pos: Math.round(pos), angle: Math.round(angle) };
      updateCoverageRect(id, vesselState.appendages.length > 0 ? { ...base, bodyId } : base);
    },
    onInspectionImageSelected: (id) => dispatch({ type: 'SELECT_INSPECTION_IMAGE', id }),
    onInspectionImageMoved: (id, pos, angle) => {
      updateInspectionImage(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onInspectionImageLabelOffsetChanged: (id, offset) => {
      updateInspectionImage(id, { labelOffset: offset });
    },
    onWeldSelected: (idx) => dispatch({ type: 'SELECT_WELD', index: idx }),
    onWeldMoved: (idx, pos, angle, bodyId) => {
      const weld = vesselState.welds[idx];
      const hasBoots = vesselState.appendages.length > 0;
      if (weld?.type === 'circumferential') {
        const base = { pos: Math.round(pos) };
        updateWeld(idx, hasBoots ? { ...base, bodyId } : base);
      } else {
        const delta = Math.round(pos) - weld.pos;
        const base = {
          pos: Math.round(pos),
          endPos: (weld.endPos ?? vesselState.length) + delta,
          angle: Math.round(angle),
        };
        updateWeld(idx, hasBoots ? { ...base, bodyId } : base);
      }
    },
    onScanCompositeHover: (id, thickness, rawScanMm, rawIndexMm, screenX, screenY) => {
      const sc = vesselState.scanComposites.find((c) => c.id === id);
      let displayScan: number;
      let displayIndex: number;
      if (sc?.useGlobalOrigin) {
        // Convert scan-space coords to vessel-space, then subtract global origin
        const globalOrigin = vesselState.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };
        const indexDir = sc.indexDirection === 'forward' ? 1 : -1;
        const vesselIndex = sc.indexStartMm + (rawIndexMm - (sc.yAxis[0] ?? 0)) * indexDir;
        displayIndex = vesselIndex - globalOrigin.indexMm;
        displayScan = rawScanMm - globalOrigin.scanMm;
      } else {
        // Per-scan: relative to this scan's own axis start
        displayScan = rawScanMm - (sc?.xAxis[0] ?? 0);
        displayIndex = rawIndexMm - (sc?.yAxis[0] ?? 0);
      }
      dispatch({
        type: 'SET_HOVER_DATA',
        data: thickness !== null ? { thickness, scanMm: displayScan, indexMm: displayIndex } : null,
      });
      // Update cursor-follow tooltip position via ref (avoids re-render lag)
      if (cursorTooltipRef.current) {
        if (thickness !== null) {
          cursorTooltipRef.current.style.left = `${screenX + 16}px`;
          cursorTooltipRef.current.style.top = `${screenY - 12}px`;
        }
      }
    },
    onDomeScanHover: (info) => {
      setDomeScanHoverInfo(info);
    },
    onScanGizmoDatumMoved: (compositeId, angleDeg, posMm, bodyId) => {
      const base = { datumAngleDeg: angleDeg, indexStartMm: Math.round(posMm) };
      handleUpdateScanComposite(
        compositeId,
        vesselState.appendages.length > 0 ? { ...base, bodyId } : base
      );
    },
    onScanGizmoDirectionToggle: (compositeId, field) => {
      const sc = vesselState.scanComposites.find((c) => c.id === compositeId);
      if (!sc) return;
      if (field === 'scanDirection') {
        handleUpdateScanComposite(compositeId, {
          scanDirection: sc.scanDirection === 'cw' ? 'ccw' : 'cw',
        });
      } else {
        handleUpdateScanComposite(compositeId, {
          indexDirection: sc.indexDirection === 'forward' ? 'reverse' : 'forward',
        });
      }
    },
    onDomeGizmoDatumMoved: (compositeId, phiDeg, thetaDeg) => {
      handleUpdateDomeScan(compositeId, { centerPhi: phiDeg, centerTheta: thetaDeg });
    },
    onDomeGizmoDirectionToggle: (compositeId, field) => {
      const ds = vesselState.domeScanComposites?.find((d) => d.id === compositeId);
      if (!ds) return;
      if (field === 'scanDirection') {
        handleUpdateDomeScan(compositeId, {
          scanDirection: ds.scanDirection === 'cw' ? 'ccw' : 'cw',
        });
      } else {
        handleUpdateDomeScan(compositeId, {
          indexDirection: ds.indexDirection === 'outward' ? 'inward' : 'outward',
        });
      }
    },
    onDomeGizmoClicked: (compositeId) => {
      dispatch({ type: 'SELECT_DOME_SCAN', id: compositeId });
    },
    onPipeSegmentSelected: (pipelineId, segmentIndex) => {
      dispatch({ type: 'SELECT_PIPE_SEGMENT', pipelineId, segmentIndex });
    },
    onPipeConnectionPointClicked: (pipelineId) => {
      // Show the pipe part popup — handled via state
      setPipePartPopup((prev) => (prev ? null : { pipelineId, x: 0, y: 0 }));
    },
    onDeselect: () => dispatch({ type: 'DESELECT_ALL' }),
    onNozzleMoved: (idx, pos, angle, bodyId) => {
      const base = { pos: Math.round(pos), angle: Math.round(angle) };
      updateNozzle(idx, vesselState.appendages.length > 0 ? { ...base, bodyId } : base);
    },
    onSaddleMoved: (idx, pos) => {
      updateSaddle(idx, { pos: Math.round(pos) });
    },
    onTextureMoved: (id, pos, angle) => {
      updateTexture(id, { pos: Math.round(pos), angle: Math.round(angle) });
    },
    onLugMoved: (idx, pos, angle, bodyId) => {
      const base = { pos: Math.round(pos), angle: Math.round(angle) };
      updateLug(idx, vesselState.appendages.length > 0 ? { ...base, bodyId } : base);
    },
    onDragEnd: () => {
      // Gesture boundary: end the coalescing group so the next drag of the same
      // object is a separate undo step. Per-move state is already committed.
      dispatch({ type: 'HISTORY_BREAK' });
    },
    onAnnotationTableMoved: (position) => {
      dispatch({
        type: 'UPDATE_VESSEL_FN',
        updater: (v) => ({ ...v, annotationTablePosition: position }),
        history: { key: 'annotationTable:move', at: Date.now() },
      });
    },
    onAnnotationTableResized: (size) => {
      dispatch({
        type: 'UPDATE_VESSEL_FN',
        updater: (v) => ({ ...v, annotationTableSize: size }),
        history: { key: 'annotationTable:resize', at: Date.now() },
      });
    },
  };

  return vesselCallbacks;
}
