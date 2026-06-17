import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { VesselState, VesselCallbacks, AnnotationShapeType, AnnotationShapeConfig, CoverageRectConfig, RulerConfig } from './types';
import { MATERIAL_PRESETS } from './types';
import { SceneManager } from './engine/scene-manager';
import { buildVesselScene, type BuildSceneResult } from './engine/vessel-geometry';
import { InteractionManager } from './engine/interaction-manager';
import { createAnnotationShape, createRectOutline, createRectFill, createRulerLine } from './engine/annotation-geometry';
import { createAnnotationLabel, createAnnotationLeaderLine, createRulerLabel, getAnnotationShellPoint, type LabelDragContext } from './engine/annotation-labels';
import { createAllInspectionImageLabels, type InspectionImageClickHandler } from './engine/inspection-image-labels';
import { createAllInspectionImageMarkers } from './engine/inspection-image-geometry';
import { createWeldGeometry } from './engine/weld-geometry';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { updateCameraAnimation } from './engine/camera-animation';
import {
    createShellMaterial,
    createNozzleMaterial,
    createHighlightMaterial,
    createSaddleHighlightMaterial,
    createLugMaterial,
    createLugHighlightMaterial,
    createWeldMaterial,
    createWeldHighlightMaterial,
    createWeldGlowMaterial,
    createPipelineMaterial,
    createConnectionPointMaterial,
    SCALE,
} from './engine/materials';
import { buildPipelineGroup, computeNozzleTipY } from './engine/pipeline-geometry';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Structural hash — only geometry-affecting properties. When this changes,
// the full scene must be rebuilt.  Selection / preview changes do NOT alter it.
// ---------------------------------------------------------------------------
function structuralHash(s: VesselState): string {
    return JSON.stringify({
        id: s.id, length: s.length, headRatio: s.headRatio, orientation: s.orientation,
        nozzles: s.nozzles, liftingLugs: s.liftingLugs, saddles: s.saddles,
        textures: s.textures.map(t => ({ id: t.id, pos: t.pos, angle: t.angle, scaleX: t.scaleX, scaleY: t.scaleY, rotation: t.rotation, flipH: t.flipH, flipV: t.flipV })),
        welds: s.welds,
        annotations: s.annotations.map(a => ({ ...a, labelOffset: undefined, leaderLength: undefined })),
        rulers: s.rulers,
        coverageRects: s.coverageRects,
        inspectionImages: s.inspectionImages.map(i => ({ ...i, labelOffset: undefined, leaderLength: undefined })),
        scanComposites: s.scanComposites.map(sc => ({ id: sc.id, hasData: sc.data.length > 0, indexStartMm: sc.indexStartMm, datumAngleDeg: sc.datumAngleDeg, scanDirection: sc.scanDirection, indexDirection: sc.indexDirection, orientationConfirmed: sc.orientationConfirmed, colorScale: sc.colorScale, rangeMin: sc.rangeMin, rangeMax: sc.rangeMax, opacity: sc.opacity })),
        domeScanComposites: (s.domeScanComposites ?? []).map(ds => ({
            id: ds.id, hasData: ds.data.length > 0, head: ds.head,
            centerPhi: ds.centerPhi, centerTheta: ds.centerTheta,
            scanDirection: ds.scanDirection, indexDirection: ds.indexDirection,
            orientationConfirmed: ds.orientationConfirmed,
            colorScale: ds.colorScale, rangeMin: ds.rangeMin, rangeMax: ds.rangeMax, opacity: ds.opacity,
        })),
        pipelines: s.pipelines,
        hasModel: s.hasModel, vesselShape: s.vesselShape,
        showNozzleLabels: s.visuals.showNozzleLabels,
        showWeldLabels: s.visuals.showWeldLabels,
    });
}

export interface ThreeViewportHandle {
    resetCamera: () => void;
    getSceneManager: () => SceneManager | null;
    getRenderer: () => THREE.WebGLRenderer | null;
    getScene: () => THREE.Scene | null;
    getCamera: () => THREE.PerspectiveCamera | null;
    getControls: () => import('three/addons/controls/OrbitControls.js').OrbitControls | null;
}

interface ThreeViewportProps {
    vesselState: VesselState;
    selectedNozzleIndex: number;
    selectedLugIndex: number;
    selectedSaddleIndex: number;
    selectedTextureId: number;
    selectedAnnotationId: number;
    textureObjects: Record<number, THREE.Texture>;
    callbacks: VesselCallbacks;
    nozzlesLocked: boolean;
    saddlesLocked: boolean;
    texturesLocked: boolean;
    lugsLocked: boolean;
    weldsLocked: boolean;
    pipelinesLocked: boolean;
    selectedWeldIndex: number;
    selectedInspectionImageId: number;
    onInspectionImageThumbnailClick: (id: number) => void;
    drawMode: AnnotationShapeType | null;
    coverageDrawMode: boolean;
    previewAnnotation: AnnotationShapeConfig | null;
    previewCoverageRect: CoverageRectConfig | null;
    rulerDrawMode: boolean;
    previewRuler: RulerConfig | null;
    selectedScanCompositeId?: string;
    selectedDomeScanId?: string;
    selectedPipelineId?: string;
    selectedPipeSegmentIdx?: number;
    inspectingAnnotationId?: number | null;
}

const ThreeViewport = forwardRef<ThreeViewportHandle, ThreeViewportProps>(function ThreeViewport(
    { vesselState, selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId, selectedAnnotationId, textureObjects, callbacks, nozzlesLocked, saddlesLocked, texturesLocked, lugsLocked, weldsLocked, pipelinesLocked, selectedWeldIndex, selectedInspectionImageId, onInspectionImageThumbnailClick, drawMode, coverageDrawMode, previewAnnotation, previewCoverageRect, rulerDrawMode, previewRuler, selectedScanCompositeId = '', selectedDomeScanId = '', selectedPipelineId = '', selectedPipeSegmentIdx = -1, inspectingAnnotationId },
    ref
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneManagerRef = useRef<SceneManager | null>(null);
    const interactionRef = useRef<InteractionManager | null>(null);

    // Persistent materials (created once, updated when preset changes)
    const materialsRef = useRef<{
        shell: THREE.MeshStandardMaterial;
        nozzle: THREE.MeshStandardMaterial;
        nozzleHighlight: THREE.MeshStandardMaterial;
        saddleHighlight: THREE.MeshStandardMaterial;
        lug: THREE.MeshStandardMaterial;
        lugHighlight: THREE.MeshStandardMaterial;
        weld: THREE.MeshStandardMaterial;
        weldHighlight: THREE.MeshStandardMaterial;
        weldGlow: THREE.MeshBasicMaterial;
        pipeline: THREE.MeshStandardMaterial;
        connectionPoint: THREE.MeshStandardMaterial;
    } | null>(null);

    // --- Tier 1: structural hash to avoid redundant full rebuilds ---
    const structuralRef = useRef('');

    // --- Tier 2: cached mesh arrays from the last build result ---
    const buildResultRef = useRef<BuildSceneResult | null>(null);
    const weldMeshesRef = useRef<THREE.Object3D[]>([]);
    const weldGlowRef = useRef<THREE.Object3D | null>(null);
    const weldLabelsRef = useRef<{ label: CSS2DObject; weld: import('./types').WeldConfig }[]>([]);

    // --- Tier 1: track textureObjects identity for forced rebuild ---
    const textureObjectsRef = useRef<Record<number, THREE.Texture>>(textureObjects);

    // --- Tier 3: persistent preview group (never disposed with main vessel group) ---
    const previewGroupRef = useRef<THREE.Group>(new THREE.Group());

    // Track latest state for callbacks (avoid stale closures)
    const vesselStateRef = useRef(vesselState);
    const callbacksRef = useRef(callbacks);
    vesselStateRef.current = vesselState;
    callbacksRef.current = callbacks;

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
        resetCamera: () => sceneManagerRef.current?.resetCamera(),
        getSceneManager: () => sceneManagerRef.current,
        getRenderer: () => sceneManagerRef.current?.getRenderer() ?? null,
        getScene: () => sceneManagerRef.current?.getScene() ?? null,
        getCamera: () => sceneManagerRef.current?.getCamera() ?? null,
        getControls: () => sceneManagerRef.current?.getControls() ?? null,
    }), []);

    // Initialize Three.js scene on mount
    useEffect(() => {
        if (!containerRef.current) return;

        const manager = new SceneManager(containerRef.current);
        manager.init();
        sceneManagerRef.current = manager;

        // Hook camera animation + weld label tracking into the render loop
        manager.onBeforeRender = (cam, ctrl) => {
            updateCameraAnimation(cam, ctrl);
            updateWeldLabelPositions(cam);
        };

        // Add persistent preview group to scene (Tier 3)
        manager.getScene().add(previewGroupRef.current);

        // Create materials
        const shell = createShellMaterial(vesselStateRef.current.visuals.material);
        const nozzle = createNozzleMaterial(vesselStateRef.current.visuals.material);
        const nozzleHighlight = createHighlightMaterial();
        const saddleHighlight = createSaddleHighlightMaterial();
        const lug = createLugMaterial(vesselStateRef.current.visuals.material);
        const lugHighlight = createLugHighlightMaterial();
        const weld = createWeldMaterial(vesselStateRef.current.visuals.material);
        const weldHighlight = createWeldHighlightMaterial();
        const weldGlow = createWeldGlowMaterial();
        const pipeline = createPipelineMaterial(vesselStateRef.current.visuals.material);
        const connectionPoint = createConnectionPointMaterial();
        materialsRef.current = { shell, nozzle, nozzleHighlight, saddleHighlight, lug, lugHighlight, weld, weldHighlight, weldGlow, pipeline, connectionPoint };

        // Setup interaction manager
        const canvas = manager.getRenderer().domElement;
        const interaction = new InteractionManager(
            canvas,
            manager.getCamera(),
            manager.getControls(),
            vesselStateRef.current,
            {
                onNozzleSelected: (idx) => callbacksRef.current.onNozzleSelected?.(idx),
                onLugSelected: (idx) => callbacksRef.current.onLugSelected?.(idx),
                onSaddleSelected: (idx) => callbacksRef.current.onSaddleSelected?.(idx),
                onTextureSelected: (id) => callbacksRef.current.onTextureSelected?.(id),
                onDeselect: () => callbacksRef.current.onDeselect?.(),
                onNozzleMoved: (idx, pos, angle) => callbacksRef.current.onNozzleMoved?.(idx, pos, angle),
                onLugMoved: (idx, pos, angle) => callbacksRef.current.onLugMoved?.(idx, pos, angle),
                onSaddleMoved: (idx, pos) => callbacksRef.current.onSaddleMoved?.(idx, pos),
                onTextureMoved: (id, pos, angle) => callbacksRef.current.onTextureMoved?.(id, pos, angle),
                onAnnotationSelected: (id) => callbacksRef.current.onAnnotationSelected?.(id),
                onAnnotationMoved: (id, pos, angle) => callbacksRef.current.onAnnotationMoved?.(id, pos, angle),
                onAnnotationCreated: (type, pos, angle, w, h) => callbacksRef.current.onAnnotationCreated?.(type, pos, angle, w, h),
                onAnnotationPreview: (type, pos, angle, w, h) => callbacksRef.current.onAnnotationPreview?.(type, pos, angle, w, h),
                onRulerCreated: (sp, sa, ep, ea) => callbacksRef.current.onRulerCreated?.(sp, sa, ep, ea),
                onRulerPreview: (sp, sa, ep, ea) => callbacksRef.current.onRulerPreview?.(sp, sa, ep, ea),
                onCoverageRectCreated: (pos, angle, w, h) => callbacksRef.current.onCoverageRectCreated?.(pos, angle, w, h),
                onCoverageRectPreview: (pos, angle, w, h) => callbacksRef.current.onCoverageRectPreview?.(pos, angle, w, h),
                onCoverageRectSelected: (id) => callbacksRef.current.onCoverageRectSelected?.(id),
                onCoverageRectMoved: (id, pos, angle) => callbacksRef.current.onCoverageRectMoved?.(id, pos, angle),
                onInspectionImageSelected: (id) => callbacksRef.current.onInspectionImageSelected?.(id),
                onInspectionImageMoved: (id, pos, angle) => callbacksRef.current.onInspectionImageMoved?.(id, pos, angle),
                onWeldSelected: (idx) => callbacksRef.current.onWeldSelected?.(idx),
                onWeldMoved: (idx, pos, angle) => callbacksRef.current.onWeldMoved?.(idx, pos, angle),
                onScanCompositeHover: (id, thickness, scanMm, indexMm, screenX, screenY) => callbacksRef.current.onScanCompositeHover?.(id, thickness, scanMm, indexMm, screenX, screenY),
                onDomeScanHover: (info) => callbacksRef.current.onDomeScanHover?.(info),
                onScanGizmoDatumMoved: (compositeId, angleDeg, posMm) => callbacksRef.current.onScanGizmoDatumMoved?.(compositeId, angleDeg, posMm),
                onScanGizmoDirectionToggle: (compositeId, field) => callbacksRef.current.onScanGizmoDirectionToggle?.(compositeId, field),
                onDomeGizmoDatumMoved: (compositeId, phiDeg, thetaDeg) => callbacksRef.current.onDomeGizmoDatumMoved?.(compositeId, phiDeg, thetaDeg),
                onDomeGizmoDirectionToggle: (compositeId, field) => callbacksRef.current.onDomeGizmoDirectionToggle?.(compositeId, field),
                onDomeGizmoClicked: (compositeId) => callbacksRef.current.onDomeGizmoClicked?.(compositeId),
                onPipeSegmentSelected: (pipelineId, segmentIndex) => callbacksRef.current.onPipeSegmentSelected?.(pipelineId, segmentIndex),
                onPipeConnectionPointClicked: (pipelineId) => callbacksRef.current.onPipeConnectionPointClicked?.(pipelineId),
                onDragEnd: () => callbacksRef.current.onDragEnd?.(),
                onNeedRebuild: () => {
                    // Trigger rebuild by calling rebuild directly
                    rebuildScene();
                },
            }
        );
        interaction.init();
        interactionRef.current = interaction;

        // Rebuild scene when WebGL context is restored after loss
        manager.onContextRestored = () => {
            structuralRef.current = ''; // Force rebuild
            rebuildScene();
        };

        // Trigger initial scene build now that manager + materials are ready
        rebuildScene();

        return () => {
            interaction.dispose();
            interactionRef.current = null;

            // Dispose materials
            if (materialsRef.current) {
                materialsRef.current.shell.dispose();
                materialsRef.current.nozzle.dispose();
                materialsRef.current.nozzleHighlight.dispose();
                materialsRef.current.saddleHighlight.dispose();
                materialsRef.current.lug.dispose();
                materialsRef.current.lugHighlight.dispose();
                materialsRef.current.weld.dispose();
                materialsRef.current.weldHighlight.dispose();
                materialsRef.current.weldGlow.dispose();
                materialsRef.current.pipeline.dispose();
                materialsRef.current.connectionPoint.dispose();
                materialsRef.current = null;
            }

            // Clean up preview group
            const pg = previewGroupRef.current;
            while (pg.children.length > 0) {
                const ch = pg.children[0];
                manager.disposeObject(ch);
                pg.remove(ch);
            }

            manager.dispose();
            sceneManagerRef.current = null;
        };
    }, []); // Mount once

    // =========================================================================
    // Per-frame: slide weld labels around the shell to face the camera
    // =========================================================================
    const updateWeldLabelPositions = useCallback((cam: THREE.PerspectiveCamera) => {
        const labels = weldLabelsRef.current;
        if (labels.length === 0) return;

        const state = vesselStateRef.current;
        const radius = state.id / 2;
        const tanTan = state.length;
        const isVert = state.orientation === 'vertical';
        const vesselGroup = buildResultRef.current?.vesselGroup;
        if (!vesselGroup) return;

        // Camera position in vessel-group local space
        const invMatrix = new THREE.Matrix4().copy(vesselGroup.matrixWorld).invert();
        const camLocal = cam.position.clone().applyMatrix4(invMatrix);

        for (const { label, weld } of labels) {
            if (weld.type === 'circumferential') {
                const axial = (weld.pos - tanTan / 2) * SCALE;
                // Project camera onto the radial plane at this axial position
                // and find the angle the camera is looking from
                let angle: number;
                if (isVert) {
                    angle = Math.atan2(camLocal.z, camLocal.x);
                } else {
                    angle = Math.atan2(camLocal.y, camLocal.z);
                }
                const r = (radius + 30) * SCALE;
                if (isVert) {
                    label.position.set(r * Math.cos(angle), axial, r * Math.sin(angle));
                } else {
                    label.position.set(axial, r * Math.sin(angle), r * Math.cos(angle));
                }
            } else {
                // Longitudinal welds are fixed — they don't wrap circumferentially
                const midPos = (weld.pos + (weld.endPos ?? tanTan)) / 2;
                const axial = (midPos - tanTan / 2) * SCALE;
                const angleRad = ((weld.angle ?? 90) * Math.PI) / 180;
                const r = (radius + 30) * SCALE;
                if (isVert) {
                    label.position.set(r * Math.cos(angleRad), axial, r * Math.sin(angleRad));
                } else {
                    label.position.set(axial, r * Math.sin(angleRad), r * Math.cos(angleRad));
                }
            }
        }
    }, []);

    // =========================================================================
    // rebuildScene — full geometry disposal + recreation (expensive)
    // =========================================================================
    const rebuildScene = useCallback(() => {
        const manager = sceneManagerRef.current;
        const materials = materialsRef.current;
        if (!manager || !materials) return;

        const state = vesselStateRef.current;
        const scene = manager.getScene();

        // Remove old vessel group
        const oldGroup = manager.getVesselGroup();
        if (oldGroup) {
            manager.disposeObject(oldGroup);
            scene.remove(oldGroup);
        }

        // Build new scene (passes current selection for initial highlight)
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
            selectedTextureId,
            selectedScanCompositeId,
            selectedDomeScanId,
        );

        // -- Annotation shapes (outlines + hit meshes) --
        const annotationMeshes: THREE.Object3D[] = [];
        state.annotations.forEach((ann) => {
            if (ann.visible === false) return;
            const group = createAnnotationShape(ann, state, ann.id === selectedAnnotationId);
            result.vesselGroup.add(group);
            annotationMeshes.push(group);
        });

        // -- Coverage rect shapes (outlines + optional fill) --
        const coverageMeshes: THREE.Object3D[] = [];
        state.coverageRects.forEach((rect) => {
            const shapeConfig = {
                id: rect.id, name: rect.name, type: 'scan' as const,
                pos: rect.pos, angle: rect.angle,
                width: rect.width, height: rect.height,
                color: rect.color, lineWidth: rect.lineWidth, showLabel: false,
            };
            const surfaceOffset = 4;
            const outline = createRectOutline(shapeConfig, state, surfaceOffset);
            outline.userData = { type: 'coverageRect', coverageRectId: rect.id };
            const covGroup = new THREE.Group();
            covGroup.add(outline);

            if (rect.filled) {
                const fill = createRectFill(shapeConfig, state, surfaceOffset);
                (fill.material as THREE.MeshBasicMaterial).opacity = rect.fillOpacity;
                fill.userData = { type: 'coverageRect', coverageRectId: rect.id };
                covGroup.add(fill);
            }

            const hitMesh = createRectFill(shapeConfig, state, surfaceOffset);
            (hitMesh.material as THREE.MeshBasicMaterial).opacity = 0;
            hitMesh.userData = { type: 'coverageRect', coverageRectId: rect.id };
            covGroup.add(hitMesh);

            covGroup.userData = { type: 'coverageRect', coverageRectId: rect.id };
            result.vesselGroup.add(covGroup);
            coverageMeshes.push(covGroup);
        });

        // -- Weld geometry --
        const weldMeshes: THREE.Object3D[] = [];
        state.welds.forEach((weld, idx) => {
            const mat = idx === selectedWeldIndex ? materials.weldHighlight : materials.weld;
            const weldGroup = createWeldGeometry(weld, state, mat);
            weldGroup.userData = { type: 'weld', weldIdx: idx };
            weldGroup.traverse((child) => {
                child.userData = { ...child.userData, type: 'weld', weldIdx: idx };
            });
            result.vesselGroup.add(weldGroup);
            weldMeshes.push(weldGroup);
        });

        // -- Weld name labels (CSS2D) --
        const newWeldLabels: { label: CSS2DObject; weld: import('./types').WeldConfig }[] = [];
        if (state.visuals.showWeldLabels) {
            state.welds.forEach((weld, idx) => {
                if (!weld.name) return;

                const el = document.createElement('div');
                el.className = 'vm-weld-label';
                el.textContent = weld.name;

                const label = new CSS2DObject(el);
                label.userData = { type: 'weld-label', weldIdx: idx };
                result.vesselGroup.add(label);
                newWeldLabels.push({ label, weld });
            });
        }
        weldLabelsRef.current = newWeldLabels;

        // -- Nozzle name labels (CSS2D) --
        if (state.visuals.showNozzleLabels) {
            const shellRadius = state.id / 2;
            result.nozzleMeshes.forEach((nozzleGroup, idx) => {
                const nozzle = state.nozzles[idx];
                if (!nozzle?.name) return;

                const el = document.createElement('div');
                el.className = 'vm-nozzle-label';
                el.textContent = nozzle.name;

                const label = new CSS2DObject(el);
                // Position label at the flange end of the nozzle
                nozzleGroup.updateMatrixWorld(true);
                const tipY = computeNozzleTipY(nozzle, shellRadius);
                const tipWorld = new THREE.Vector3(0, tipY, 0)
                    .applyMatrix4(nozzleGroup.matrixWorld);
                label.position.copy(tipWorld);
                label.userData = { type: 'nozzle-label', nozzleIdx: idx };
                result.vesselGroup.add(label);
            });
        }

        // -- Inspection image dot markers --
        const inspectionImageDotMeshes: THREE.Object3D[] = [];
        if (state.inspectionImages.length > 0) {
            const imgMarkers = createAllInspectionImageMarkers(state, selectedInspectionImageId);
            result.vesselGroup.add(imgMarkers.group);
            inspectionImageDotMeshes.push(...imgMarkers.dotMeshes);
        }

        // Add CSS2D inspection image thumbnails
        if (state.inspectionImages.length > 0) {
            const clickHandler: InspectionImageClickHandler = {
                onThumbnailClick: (id) => onInspectionImageThumbnailClick(id),
            };
            const imgDragCtx: LabelDragContext | undefined = manager ? {
                canvas: manager.getRenderer().domElement,
                camera: manager.getCamera(),
                controls: manager.getControls(),
                getVesselState: () => vesselStateRef.current,
                getVesselGroup: () => sceneManagerRef.current?.getVesselGroup() ?? null,
                onAnnotationSelected: (id) => callbacksRef.current.onAnnotationSelected?.(id),
                onAnnotationMoved: (id, pos, angle) => callbacksRef.current.onAnnotationMoved?.(id, pos, angle),
                onAnnotationLabelOffsetChanged: (id, offset) => callbacksRef.current.onAnnotationLabelOffsetChanged?.(id, offset),
                onInspectionImageLabelOffsetChanged: (id, offset) => callbacksRef.current.onInspectionImageLabelOffsetChanged?.(id, offset),
                onDragEnd: () => callbacksRef.current.onDragEnd?.(),
            } : undefined;
            const imgLabels = createAllInspectionImageLabels(state, selectedInspectionImageId, clickHandler, imgDragCtx);
            imgLabels.forEach(label => result.vesselGroup.add(label));
        }

        // Add annotation leader lines + CSS2D labels
        {
            const dragCtx: LabelDragContext | undefined = manager ? {
                canvas: manager.getRenderer().domElement,
                camera: manager.getCamera(),
                controls: manager.getControls(),
                getVesselState: () => vesselStateRef.current,
                getVesselGroup: () => sceneManagerRef.current?.getVesselGroup() ?? null,
                onAnnotationSelected: (id) => callbacksRef.current.onAnnotationSelected?.(id),
                onAnnotationMoved: (id, pos, angle) => callbacksRef.current.onAnnotationMoved?.(id, pos, angle),
                onAnnotationLabelOffsetChanged: (id, offset) => callbacksRef.current.onAnnotationLabelOffsetChanged?.(id, offset),
                onInspectionImageLabelOffsetChanged: (id, offset) => callbacksRef.current.onInspectionImageLabelOffsetChanged?.(id, offset),
                onDragEnd: () => callbacksRef.current.onDragEnd?.(),
            } : undefined;

            state.annotations.forEach((ann) => {
                if (ann.visible === false) return;
                // Hide leader line + label for the annotation being inspected
                if (inspectingAnnotationId != null && ann.id === inspectingAnnotationId) return;

                const isSelected = ann.id === selectedAnnotationId;
                const effectiveMode = ann.labelMode ?? 'flyout';

                if (effectiveMode === 'table') {
                    // Table mode: small pill label on the vessel surface (like nozzle labels)
                    const shellPos = getAnnotationShellPoint(ann, state);
                    const el = document.createElement('div');
                    el.className = `vm-annotation-pill${isSelected ? ' selected' : ''}`;
                    el.dataset.annType = ann.type;
                    if (ann.severityLevel) el.dataset.severity = ann.severityLevel;
                    el.textContent = ann.name;
                    const label = new CSS2DObject(el);
                    // Compute outward surface normal for occlusion testing
                    const angleRad = (ann.angle * Math.PI) / 180;
                    const isVert = state.orientation === 'vertical';
                    let outward: THREE.Vector3;
                    if (isVert) {
                        outward = new THREE.Vector3(Math.cos(angleRad), 0, Math.sin(angleRad)).normalize();
                    } else {
                        outward = new THREE.Vector3(0, Math.sin(angleRad), Math.cos(angleRad)).normalize();
                    }
                    // Offset slightly above the shell surface
                    const nudge = 0.05;
                    label.position.set(
                        shellPos.x + nudge * outward.x,
                        shellPos.y + nudge * outward.y,
                        shellPos.z + nudge * outward.z,
                    );
                    label.userData = {
                        type: 'annotation-pill',
                        annotationId: ann.id,
                        outward: outward.toArray(),
                    };
                    result.vesselGroup.add(label);
                } else if (ann.showLabel) {
                    // Flyout mode: leader line + full card (original behavior)
                    const leaderGroup = createAnnotationLeaderLine(ann, state, isSelected);
                    result.vesselGroup.add(leaderGroup);
                    const label = createAnnotationLabel(ann, state, state.measurementConfig, isSelected, dragCtx);
                    result.vesselGroup.add(label);
                }
            });

            // Build annotation summary table as a CSS2D label in the scene
            {
                const tableAnnotations = state.annotations.filter(
                    (a) => a.labelMode === 'table' && a.visible !== false,
                );
                if (tableAnnotations.length > 0) {
                    const origin = state.coordinateOrigin ?? { indexMm: 0, scanMm: 0 };

                    // Group by type
                    const groups: Record<string, typeof tableAnnotations> = {};
                    for (const ann of tableAnnotations) {
                        (groups[ann.type] ??= []).push(ann);
                    }

                    const tableEl = document.createElement('div');
                    tableEl.className = 'vm-annotation-table-label';

                    const groupDefs = [
                        { key: 'restriction', label: 'Restrictions' },
                        { key: 'scan', label: 'Scan Areas' },
                    ];

                    for (const { key, label } of groupDefs) {
                        const items = groups[key];
                        if (!items || items.length === 0) continue;

                        const header = document.createElement('div');
                        header.className = 'vm-annotation-table-header';
                        header.textContent = label;
                        tableEl.appendChild(header);

                        const table = document.createElement('table');
                        table.className = 'vm-annotation-table';

                        // Header row
                        const thead = document.createElement('thead');
                        const headRow = document.createElement('tr');
                        for (const col of ['Name', 'Scan', 'Index', key === 'scan' ? 'Area' : 'Notes']) {
                            const th = document.createElement('th');
                            th.textContent = col;
                            headRow.appendChild(th);
                        }
                        thead.appendChild(headRow);
                        table.appendChild(thead);

                        // Body rows
                        const tbody = document.createElement('tbody');
                        for (const ann of items) {
                            const scanMm = Math.round(
                                (ann.angle / 360) * Math.PI * state.id - origin.scanMm,
                            );
                            const indexMm = Math.round(ann.pos - origin.indexMm);
                            const isSelected = ann.id === selectedAnnotationId;

                            const row = document.createElement('tr');
                            if (isSelected) row.className = 'selected';
                            row.addEventListener('pointerdown', (e) => {
                                e.stopPropagation();
                                callbacksRef.current.onAnnotationSelected?.(ann.id);
                            });

                            // Name cell (with severity dot)
                            const nameCell = document.createElement('td');
                            if (ann.severityLevel) {
                                const dot = document.createElement('span');
                                dot.className = 'vm-severity-dot';
                                dot.style.backgroundColor = { red: '#ff3333', yellow: '#ffaa00', green: '#33cc33' }[ann.severityLevel];
                                nameCell.appendChild(dot);
                            }
                            nameCell.appendChild(document.createTextNode(ann.name));
                            row.appendChild(nameCell);

                            // Scan / Index cells
                            const scanCell = document.createElement('td');
                            scanCell.textContent = `${scanMm}mm`;
                            row.appendChild(scanCell);

                            const indexCell = document.createElement('td');
                            indexCell.textContent = `${indexMm}mm`;
                            row.appendChild(indexCell);

                            // Area or Notes
                            const extraCell = document.createElement('td');
                            if (key === 'scan') {
                                extraCell.textContent = `${((ann.width * ann.height) / 1_000_000).toFixed(2)} m\u00b2`;
                            } else {
                                extraCell.className = 'vm-annotation-table-notes';
                                extraCell.textContent = ann.restrictionNotes || '\u2014';
                            }
                            row.appendChild(extraCell);

                            tbody.appendChild(row);

                            // Image row (hidden by default, toggled via button)
                            if (ann.restrictionImage) {
                                const imgRow = document.createElement('tr');
                                imgRow.className = 'vm-annotation-table-img-row';
                                imgRow.style.display = 'none';
                                const imgCell = document.createElement('td');
                                imgCell.colSpan = 4;
                                imgCell.className = 'vm-annotation-table-img-cell';

                                const img = document.createElement('img');
                                img.src = ann.restrictionImage;
                                img.className = 'vm-annotation-table-thumb';
                                imgCell.appendChild(img);

                                imgRow.appendChild(imgCell);
                                tbody.appendChild(imgRow);

                                // Add toggle icon to name cell
                                const toggleBtn = document.createElement('button');
                                toggleBtn.className = 'vm-annotation-table-img-toggle';
                                toggleBtn.textContent = '\u25B6'; // right triangle
                                toggleBtn.title = 'Show image';
                                toggleBtn.addEventListener('pointerdown', (e) => {
                                    e.stopPropagation();
                                    const visible = imgRow.style.display !== 'none';
                                    imgRow.style.display = visible ? 'none' : 'table-row';
                                    toggleBtn.textContent = visible ? '\u25B6' : '\u25BC';
                                    toggleBtn.title = visible ? 'Show image' : 'Hide image';
                                });
                                nameCell.insertBefore(toggleBtn, nameCell.firstChild);
                            }
                        }
                        table.appendChild(tbody);
                        tableEl.appendChild(table);
                    }

                    // Toolbar row (images toggle + light/dark toggle)
                    const toolbarRow = document.createElement('div');
                    toolbarRow.className = 'vm-annotation-table-toolbar';

                    const imgToggleAll = document.createElement('button');
                    imgToggleAll.className = 'vm-annotation-table-toolbar-btn';
                    imgToggleAll.textContent = '\uD83D\uDDBC Images';
                    imgToggleAll.title = 'Toggle all images';
                    let allImagesShown = false;
                    imgToggleAll.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        allImagesShown = !allImagesShown;
                        const imgRows = tableEl.querySelectorAll('.vm-annotation-table-img-row');
                        imgRows.forEach((r) => {
                            (r as HTMLElement).style.display = allImagesShown ? 'table-row' : 'none';
                        });
                        const toggleBtns = tableEl.querySelectorAll('.vm-annotation-table-img-toggle');
                        toggleBtns.forEach((btn) => {
                            btn.textContent = allImagesShown ? '\u25BC' : '\u25B6';
                        });
                        imgToggleAll.style.color = allImagesShown ? '#60a5fa' : '';
                    });
                    toolbarRow.appendChild(imgToggleAll);

                    const themeToggle = document.createElement('button');
                    themeToggle.className = 'vm-annotation-table-toolbar-btn';
                    themeToggle.textContent = '\u2600 Light';
                    themeToggle.title = 'Toggle light/dark mode';
                    themeToggle.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        const isLight = tableEl.classList.toggle('light');
                        themeToggle.textContent = isLight ? '\u263E Dark' : '\u2600 Light';
                    });
                    toolbarRow.appendChild(themeToggle);

                    tableEl.insertBefore(toolbarRow, tableEl.firstChild);

                    // Add a drag handle bar at the top for moving
                    const dragBar = document.createElement('div');
                    dragBar.className = 'vm-annotation-table-drag-bar';
                    dragBar.title = 'Drag to move';
                    tableEl.insertBefore(dragBar, tableEl.firstChild);

                    // Add a resize handle at the bottom-right corner
                    const resizeHandle = document.createElement('div');
                    resizeHandle.className = 'vm-annotation-table-resize-handle';
                    resizeHandle.title = 'Drag to resize';
                    tableEl.appendChild(resizeHandle);

                    // Restore saved table size if present
                    if (state.annotationTableSize) {
                        tableEl.style.width = `${state.annotationTableSize[0]}px`;
                        tableEl.style.maxHeight = `${state.annotationTableSize[1]}px`;
                        tableEl.style.overflow = 'auto';
                    }

                    const tableLabel = new CSS2DObject(tableEl);
                    // Restore saved position or compute default
                    if (state.annotationTablePosition) {
                        tableLabel.position.set(...state.annotationTablePosition);
                    } else {
                        const SCALE = 0.001;
                        const isVertical = state.orientation === 'vertical';
                        const vesselHalfLength = (state.length / 2) * SCALE;
                        const vesselRadius = (state.id / 2) * SCALE;
                        if (isVertical) {
                            tableLabel.position.set(vesselRadius + 1.5, 0, 0);
                        } else {
                            tableLabel.position.set(vesselHalfLength + vesselRadius + 0.5, 0, 0);
                        }
                    }
                    tableLabel.userData = { type: 'annotation-table' };
                    result.vesselGroup.add(tableLabel);

                    // --- Drag-to-move (camera-facing plane projection) ---
                    if (manager) {
                        const canvas = manager.getRenderer().domElement;
                        const camera = manager.getCamera();
                        const controls = manager.getControls();
                        const raycaster = new THREE.Raycaster();
                        const mouse = new THREE.Vector2();
                        const dragPlane = new THREE.Plane();
                        const intersection = new THREE.Vector3();
                        let dragging = false;

                        const onDragStart = (e: PointerEvent) => {
                            e.stopPropagation();
                            dragging = true;
                            dragBar.style.cursor = 'grabbing';
                            controls.enabled = false;

                            const cameraDir = camera.getWorldDirection(new THREE.Vector3());
                            dragPlane.setFromNormalAndCoplanarPoint(cameraDir, tableLabel.position.clone());

                            window.addEventListener('pointermove', onDragMove);
                            window.addEventListener('pointerup', onDragEnd);
                        };

                        const onDragMove = (e: PointerEvent) => {
                            if (!dragging) return;
                            const rect = canvas.getBoundingClientRect();
                            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                            raycaster.setFromCamera(mouse, camera);
                            if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
                                tableLabel.position.copy(intersection);
                            }
                        };

                        const onDragEnd = () => {
                            dragging = false;
                            dragBar.style.cursor = '';
                            controls.enabled = true;
                            window.removeEventListener('pointermove', onDragMove);
                            window.removeEventListener('pointerup', onDragEnd);
                            // Persist position
                            const p = tableLabel.position;
                            callbacksRef.current.onAnnotationTableMoved?.([p.x, p.y, p.z]);
                        };

                        dragBar.addEventListener('pointerdown', onDragStart);
                    }

                    // --- Resize handle ---
                    {
                        let resizing = false;
                        let startX = 0;
                        let startY = 0;
                        let startW = 0;
                        let startH = 0;

                        const onResizeStart = (e: PointerEvent) => {
                            e.stopPropagation();
                            resizing = true;
                            startX = e.clientX;
                            startY = e.clientY;
                            const rect = tableEl.getBoundingClientRect();
                            startW = rect.width;
                            startH = rect.height;
                            resizeHandle.style.cursor = 'nwse-resize';
                            if (manager) manager.getControls().enabled = false;

                            window.addEventListener('pointermove', onResizeMove);
                            window.addEventListener('pointerup', onResizeEnd);
                        };

                        const onResizeMove = (e: PointerEvent) => {
                            if (!resizing) return;
                            const dx = e.clientX - startX;
                            const dy = e.clientY - startY;
                            const newW = Math.max(200, startW + dx);
                            const newH = Math.max(80, startH + dy);
                            tableEl.style.width = `${newW}px`;
                            tableEl.style.maxHeight = `${newH}px`;
                            tableEl.style.overflow = 'auto';
                        };

                        const onResizeEnd = () => {
                            resizing = false;
                            resizeHandle.style.cursor = '';
                            if (manager) manager.getControls().enabled = true;
                            window.removeEventListener('pointermove', onResizeMove);
                            window.removeEventListener('pointerup', onResizeEnd);
                            // Persist size
                            const rect = tableEl.getBoundingClientRect();
                            callbacksRef.current.onAnnotationTableResized?.([rect.width, rect.height]);
                        };

                        resizeHandle.addEventListener('pointerdown', onResizeStart);
                    }
                }
            }

            state.rulers.forEach((ruler) => {
                const rulerGroup = createRulerLine(ruler, state);
                result.vesselGroup.add(rulerGroup);
                if (ruler.showLabel) {
                    const label = createRulerLabel(ruler, state);
                    result.vesselGroup.add(label);
                }
            });
        }

        scene.add(result.vesselGroup);
        manager.setVesselGroup(result.vesselGroup);

        // -- Pipeline geometry --
        // Build pipelines after vessel group is in the scene so nozzle world matrices are valid
        if (state.pipelines.length > 0) {
            const pipelineParent = new THREE.Group();
            pipelineParent.userData = { type: 'pipelineRoot' };

            for (const pl of state.pipelines) {
                if (pl.nozzleIndex >= 0) {
                    // Nozzle-attached pipeline
                    const nozzle = state.nozzles[pl.nozzleIndex];
                    if (!nozzle) continue;

                    let nozzleGroup: THREE.Group | null = null;
                    result.vesselGroup.traverse((child) => {
                        if (child.userData?.type === 'nozzle' && child.userData?.nozzleIdx === pl.nozzleIndex) {
                            nozzleGroup = child as THREE.Group;
                        }
                    });
                    if (!nozzleGroup) continue;

                    const plGroup = buildPipelineGroup(
                        pl,
                        nozzleGroup,
                        nozzle,
                        state.id / 2,
                        materials.pipeline,
                        materials.connectionPoint,
                    );
                    pipelineParent.add(plGroup);
                } else {
                    // Free-standing pipeline
                    const plGroup = buildPipelineGroup(
                        pl,
                        null,
                        null,
                        0,
                        materials.pipeline,
                        materials.connectionPoint,
                    );
                    pipelineParent.add(plGroup);
                }
            }

            manager.setPipelineGroup(pipelineParent);
        } else {
            manager.setPipelineGroup(null);
        }

        // Cache build result for Tier 2 (selection highlight fast-path)
        buildResultRef.current = result;
        weldMeshesRef.current = weldMeshes;

        // Update interaction manager mesh references
        if (interactionRef.current) {
            interactionRef.current.nozzleMeshes = result.nozzleMeshes;
            interactionRef.current.lugMeshes = result.lugMeshes;
            interactionRef.current.saddleMeshes = result.saddleMeshes;
            interactionRef.current.weldMeshes = weldMeshes;
            interactionRef.current.textureMeshes = result.textureMeshes;
            interactionRef.current.scanCompositeMeshes = result.scanCompositeMeshes;
            interactionRef.current.domeScanMeshes = result.domeScanMeshes;
            interactionRef.current.gizmoMeshes = result.gizmoMeshes;
            interactionRef.current.annotationMeshes = annotationMeshes;
            interactionRef.current.coverageMeshes = coverageMeshes;
            interactionRef.current.inspectionImageDotMeshes = inspectionImageDotMeshes;
            interactionRef.current.vesselGroup = result.vesselGroup;
        }
    }, [textureObjects, selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId, selectedScanCompositeId, selectedDomeScanId, selectedAnnotationId, selectedInspectionImageId, selectedWeldIndex, onInspectionImageThumbnailClick, inspectingAnnotationId]);

    // =========================================================================
    // Tier 2 — Selection highlight update (O(n) material swaps, no geometry)
    // =========================================================================
    const updateSelectionHighlights = useCallback(() => {
        const materials = materialsRef.current;
        const result = buildResultRef.current;
        if (!materials || !result) return;

        const state = vesselStateRef.current;

        // Nozzles: swap material on all child meshes
        result.nozzleMeshes.forEach((nozzleGroup) => {
            const idx = nozzleGroup.userData?.nozzleIdx as number | undefined;
            const mat = idx === selectedNozzleIndex ? materials.nozzleHighlight : materials.nozzle;
            nozzleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = mat;
                }
            });
        });

        // Lifting lugs: swap material on all child meshes
        result.lugMeshes.forEach((lugGroup) => {
            const idx = lugGroup.userData?.lugIdx as number | undefined;
            const mat = idx === selectedLugIndex ? materials.lugHighlight : materials.lug;
            lugGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = mat;
                }
            });
        });

        // Saddles: swap material on all child meshes
        result.saddleMeshes.forEach((saddleGroup) => {
            const idx = saddleGroup.userData?.saddleIdx as number | undefined;
            const isSelected = idx === selectedSaddleIndex;
            saddleGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    if (isSelected) {
                        child.material = materials.saddleHighlight;
                    } else if (typeof idx === 'number' && state.saddles[idx]) {
                        // Restore original saddle color from vesselState
                        const color = state.saddles[idx].color || '#2244ff';
                        child.material = new THREE.MeshStandardMaterial({
                            color: new THREE.Color(color),
                            roughness: 0.6,
                            metalness: 0.5,
                        });
                    }
                }
            });
        });

        // Welds: swap material + add/remove glow mesh
        // Remove previous glow mesh
        if (weldGlowRef.current) {
            weldGlowRef.current.parent?.remove(weldGlowRef.current);
            weldGlowRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
            weldGlowRef.current = null;
        }

        weldMeshesRef.current.forEach((weldGroup) => {
            const idx = weldGroup.userData?.weldIdx as number | undefined;
            const isSelected = idx === selectedWeldIndex;
            const mat = isSelected ? materials.weldHighlight : materials.weld;
            weldGroup.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.material = mat;
                }
            });

            // Add glow halo on the selected weld
            if (isSelected && idx !== undefined && idx >= 0 && idx < state.welds.length) {
                const glowGroup = createWeldGeometry(state.welds[idx], state, materials.weldGlow as unknown as THREE.MeshStandardMaterial);
                // Scale up slightly so it envelops the base weld
                glowGroup.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.material = materials.weldGlow;
                        child.scale.set(1.08, 1.08, 1.08);
                        child.renderOrder = -1;
                    }
                });
                weldGroup.parent?.add(glowGroup);
                weldGlowRef.current = glowGroup;
            }
        });

        // Pipe segments: highlight selected segment with gold material
        const pipelineGroup = sceneManagerRef.current?.getPipelineGroup();
        if (pipelineGroup && selectedPipelineId && selectedPipeSegmentIdx >= 0) {
            const pipeline = state.pipelines.find(p => p.id === selectedPipelineId);
            const selectedSegId = pipeline?.segments[selectedPipeSegmentIdx]?.id;
            pipelineGroup.traverse((child) => {
                if (child instanceof THREE.Mesh && child.userData?.type === 'pipeSegment') {
                    child.material = child.userData.segmentId === selectedSegId
                        ? materials.nozzleHighlight
                        : materials.pipeline;
                }
            });
        } else if (pipelineGroup) {
            pipelineGroup.traverse((child) => {
                if (child instanceof THREE.Mesh && child.userData?.type === 'pipeSegment') {
                    child.material = materials.pipeline;
                }
            });
        }

        // Textures: toggle border child mesh visibility
        result.textureMeshes.forEach((texMesh) => {
            const texId = texMesh.userData?.textureIdx as number | undefined;
            const isSelected = texId === selectedTextureId;
            texMesh.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.userData?.type === 'texture-border') {
                    child.visible = isSelected;
                }
            });
        });

        // Scan composites: toggle border child mesh visibility
        result.scanCompositeMeshes.forEach((scMesh) => {
            const scId = scMesh.userData?.id as string | undefined;
            const isSelected = scId === selectedScanCompositeId;
            scMesh.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.userData?.type === 'scanComposite-border') {
                    child.visible = isSelected;
                }
            });
        });

        // Dome scan composites: toggle border child mesh visibility
        if (result.domeScanMeshes) {
            result.domeScanMeshes.forEach((dsMesh) => {
                const dsId = dsMesh.userData?.id as string | undefined;
                const isSelected = dsId === selectedDomeScanId;
                dsMesh.children.forEach((child) => {
                    if (child instanceof THREE.Mesh && child.userData?.role === 'domeScan-border') {
                        child.visible = isSelected;
                    }
                });
            });
        }
    }, [selectedNozzleIndex, selectedLugIndex, selectedSaddleIndex, selectedTextureId, selectedScanCompositeId, selectedDomeScanId, selectedWeldIndex, selectedPipelineId, selectedPipeSegmentIdx]);

    // =========================================================================
    // Tier 3 — Preview overlay update (only touches preview group, never main vessel)
    // =========================================================================
    const updatePreviews = useCallback(() => {
        const state = vesselStateRef.current;
        const previewGroup = previewGroupRef.current;
        const manager = sceneManagerRef.current;

        // Dispose and remove all existing preview children
        while (previewGroup.children.length > 0) {
            const child = previewGroup.children[0];
            if (manager) manager.disposeObject(child);
            previewGroup.remove(child);
        }

        if (!state) return;

        // Add preview ruler during drawing
        if (previewRuler) {
            const rulerGroup = createRulerLine(previewRuler, state);
            previewGroup.add(rulerGroup);
            const rulerLabel = createRulerLabel(previewRuler, state);
            previewGroup.add(rulerLabel);
        }

        // Add preview annotation shape during drawing
        if (previewAnnotation) {
            const annGroup = createAnnotationShape(previewAnnotation, state, false);
            previewGroup.add(annGroup);
        }

        // Add preview coverage rect during drawing
        if (previewCoverageRect) {
            const previewOutline = createRectOutline(
                {
                    id: -1, name: 'Preview', type: 'scan',
                    pos: previewCoverageRect.pos, angle: previewCoverageRect.angle,
                    width: previewCoverageRect.width, height: previewCoverageRect.height,
                    color: previewCoverageRect.color, lineWidth: 2, showLabel: false,
                },
                state,
                4,
            );
            previewGroup.add(previewOutline);
        }
    }, [previewAnnotation, previewCoverageRect, previewRuler]);

    // =========================================================================
    // Tier 1 effect — Structural rebuild (only when geometry-affecting state changes)
    // =========================================================================
    useEffect(() => {
        const hash = structuralHash(vesselState);
        const hashChanged = hash !== structuralRef.current;
        const texturesChanged = textureObjects !== textureObjectsRef.current;

        if (hashChanged || texturesChanged) {
            structuralRef.current = hash;
            textureObjectsRef.current = textureObjects;
            rebuildScene();
            // After a full rebuild, previews also need to be re-added
            updatePreviews();
        }
    }, [vesselState, textureObjects, rebuildScene, updatePreviews]);

    // =========================================================================
    // Inspection mode — rebuild to hide/show leader line dot
    // =========================================================================
    const prevInspectingIdRef = useRef(inspectingAnnotationId);
    useEffect(() => {
        if (prevInspectingIdRef.current !== inspectingAnnotationId) {
            prevInspectingIdRef.current = inspectingAnnotationId;
            rebuildScene();
        }
    }, [inspectingAnnotationId, rebuildScene]);

    // =========================================================================
    // Tier 2 effect — Selection highlight fast-path (no geometry rebuild)
    // =========================================================================
    useEffect(() => {
        updateSelectionHighlights();
    }, [updateSelectionHighlights]);

    // =========================================================================
    // Tier 3 effect — Preview overlay fast-path (only preview group changes)
    // =========================================================================
    useEffect(() => {
        updatePreviews();
    }, [updatePreviews]);

    // Update interaction manager's vessel state reference
    useEffect(() => {
        interactionRef.current?.updateVesselState(vesselState);
    }, [vesselState]);

    // Sync lock flags to the interaction manager
    useEffect(() => {
        if (interactionRef.current) {
            interactionRef.current.nozzlesLocked = nozzlesLocked;
            interactionRef.current.saddlesLocked = saddlesLocked;
            interactionRef.current.texturesLocked = texturesLocked;
            interactionRef.current.lugsLocked = lugsLocked;
            interactionRef.current.weldsLocked = weldsLocked;
            interactionRef.current.pipelinesLocked = pipelinesLocked;
            interactionRef.current.drawMode = drawMode;
            interactionRef.current.coverageDrawMode = coverageDrawMode;
            interactionRef.current.rulerDrawMode = rulerDrawMode;
        }
    }, [nozzlesLocked, saddlesLocked, texturesLocked, lugsLocked, weldsLocked, pipelinesLocked, drawMode, coverageDrawMode, rulerDrawMode]);

    // Update material visuals when visual settings change
    useEffect(() => {
        const materials = materialsRef.current;
        if (!materials) return;

        const { material: matKey, shellOpacity, nozzleOpacity, roughness, metalness } = vesselState.visuals;
        const preset = MATERIAL_PRESETS[matKey];
        if (!preset) return;

        // Resolve roughness/metalness: user override or preset default
        const r = roughness ?? preset.roughness;
        const m = metalness ?? preset.metalness;

        materials.shell.color.setHex(preset.color);
        materials.shell.emissive.setHex(preset.emissive);
        materials.shell.roughness = r;
        materials.shell.metalness = m;
        materials.shell.opacity = shellOpacity;
        materials.shell.transparent = shellOpacity < 1.0;
        materials.shell.needsUpdate = true;

        materials.nozzle.color.setHex(preset.color);
        materials.nozzle.emissive.setHex(preset.emissive);
        materials.nozzle.roughness = r;
        materials.nozzle.metalness = m;
        materials.nozzle.opacity = nozzleOpacity;
        materials.nozzle.transparent = nozzleOpacity < 1.0;
        materials.nozzle.needsUpdate = true;

        materials.lug.color.setHex(preset.color);
        materials.lug.emissive.setHex(preset.emissive);
        materials.lug.roughness = r;
        materials.lug.metalness = m;
        materials.lug.needsUpdate = true;

        materials.weld.color.setHex(preset.color);
        materials.weld.emissive.setHex(preset.emissive);
        materials.weld.roughness = r;
        materials.weld.metalness = m;
        materials.weld.needsUpdate = true;

        materials.pipeline.color.setHex(preset.color);
        materials.pipeline.emissive.setHex(preset.emissive);
        materials.pipeline.roughness = r;
        materials.pipeline.metalness = m;
        materials.pipeline.needsUpdate = true;

        // Update scene background color
        const bgColor = vesselState.visuals.backgroundColor || '#111111';
        const manager = sceneManagerRef.current;
        if (manager) {
            manager.setBackgroundColor(bgColor);
            manager.setGridVisible(vesselState.visuals.showGrid);
            manager.updateGridColors(bgColor);
            manager.setAxesVisible(vesselState.visuals.showAxes);
            manager.setCardinalDirectionsVisible(vesselState.visuals.showCardinalDirections, vesselState.visuals.cardinalRotation ?? 0);
            manager.setEnvironmentMap(vesselState.visuals.useEnvironmentMap);
            manager.setShadowsEnabled(
                vesselState.visuals.enableShadows ?? true,
                vesselState.visuals.shadowIntensity ?? 0.35,
            );
        }
    }, [vesselState.visuals]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: `linear-gradient(to bottom, ${vesselState.visuals.backgroundColor || '#111111'}, #000000)` }}
        />
    );
});

export default ThreeViewport;
