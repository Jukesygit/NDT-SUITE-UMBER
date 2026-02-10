import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { VesselState, VesselCallbacks } from './types';
import { MATERIAL_PRESETS } from './types';
import { SceneManager } from './engine/scene-manager';
import { buildVesselScene } from './engine/vessel-geometry';
import { InteractionManager } from './engine/interaction-manager';
import {
    createShellMaterial,
    createNozzleMaterial,
    createHighlightMaterial,
    createSaddleHighlightMaterial,
} from './engine/materials';
import type * as THREE from 'three';

export interface ThreeViewportHandle {
    resetCamera: () => void;
    getSceneManager: () => SceneManager | null;
    getRenderer: () => THREE.WebGLRenderer | null;
    getScene: () => THREE.Scene | null;
    getCamera: () => THREE.PerspectiveCamera | null;
}

interface ThreeViewportProps {
    vesselState: VesselState;
    selectedNozzleIndex: number;
    selectedSaddleIndex: number;
    selectedTextureId: number;
    textureObjects: Record<number, THREE.Texture>;
    callbacks: VesselCallbacks;
}

const ThreeViewport = forwardRef<ThreeViewportHandle, ThreeViewportProps>(function ThreeViewport(
    { vesselState, selectedNozzleIndex, selectedSaddleIndex, selectedTextureId, textureObjects, callbacks },
    ref
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneManagerRef = useRef<SceneManager | null>(null);
    const interactionRef = useRef<InteractionManager | null>(null);

    // Persistent materials (created once, updated when preset changes)
    const materialsRef = useRef<{
        shell: THREE.MeshPhongMaterial;
        nozzle: THREE.MeshPhongMaterial;
        nozzleHighlight: THREE.MeshPhongMaterial;
        saddleHighlight: THREE.MeshPhongMaterial;
    } | null>(null);

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
    }), []);

    // Initialize Three.js scene on mount
    useEffect(() => {
        if (!containerRef.current) return;

        const manager = new SceneManager(containerRef.current);
        manager.init();
        sceneManagerRef.current = manager;

        // Create materials
        const shell = createShellMaterial(vesselStateRef.current.visuals.material);
        const nozzle = createNozzleMaterial(vesselStateRef.current.visuals.material);
        const nozzleHighlight = createHighlightMaterial();
        const saddleHighlight = createSaddleHighlightMaterial();
        materialsRef.current = { shell, nozzle, nozzleHighlight, saddleHighlight };

        // Setup interaction manager
        const canvas = manager.getRenderer().domElement;
        const interaction = new InteractionManager(
            canvas,
            manager.getCamera(),
            manager.getControls(),
            vesselStateRef.current,
            {
                onNozzleSelected: (idx) => callbacksRef.current.onNozzleSelected?.(idx),
                onSaddleSelected: (idx) => callbacksRef.current.onSaddleSelected?.(idx),
                onTextureSelected: (id) => callbacksRef.current.onTextureSelected?.(id),
                onDeselect: () => callbacksRef.current.onDeselect?.(),
                onNozzleMoved: (idx, pos, angle) => callbacksRef.current.onNozzleMoved?.(idx, pos, angle),
                onSaddleMoved: (idx, pos) => callbacksRef.current.onSaddleMoved?.(idx, pos),
                onTextureMoved: (id, pos, angle) => callbacksRef.current.onTextureMoved?.(id, pos, angle),
                onDragEnd: () => callbacksRef.current.onDragEnd?.(),
                onNeedRebuild: () => {
                    // Trigger rebuild by calling rebuild directly
                    rebuildScene();
                },
            }
        );
        interaction.init();
        interactionRef.current = interaction;

        return () => {
            interaction.dispose();
            interactionRef.current = null;

            // Dispose materials
            if (materialsRef.current) {
                materialsRef.current.shell.dispose();
                materialsRef.current.nozzle.dispose();
                materialsRef.current.nozzleHighlight.dispose();
                materialsRef.current.saddleHighlight.dispose();
                materialsRef.current = null;
            }

            manager.dispose();
            sceneManagerRef.current = null;
        };
    }, []); // Mount once

    // Rebuild scene when vessel state changes
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

        // Build new scene
        const result = buildVesselScene(
            state,
            materials.shell,
            materials.nozzle,
            materials.nozzleHighlight,
            materials.saddleHighlight,
            textureObjects,
            selectedNozzleIndex,
            selectedSaddleIndex,
            selectedTextureId
        );

        scene.add(result.vesselGroup);
        manager.setVesselGroup(result.vesselGroup);

        // Update interaction manager mesh references
        if (interactionRef.current) {
            interactionRef.current.nozzleMeshes = result.nozzleMeshes;
            interactionRef.current.saddleMeshes = result.saddleMeshes;
            interactionRef.current.textureMeshes = result.textureMeshes;
            interactionRef.current.vesselGroup = result.vesselGroup;
        }
    }, [textureObjects, selectedNozzleIndex, selectedSaddleIndex, selectedTextureId]);

    // Rebuild when state changes
    useEffect(() => {
        rebuildScene();
    }, [vesselState, selectedNozzleIndex, selectedSaddleIndex, selectedTextureId, textureObjects, rebuildScene]);

    // Update interaction manager's vessel state reference
    useEffect(() => {
        interactionRef.current?.updateVesselState(vesselState);
    }, [vesselState]);

    // Update material visuals when visual settings change
    useEffect(() => {
        const materials = materialsRef.current;
        if (!materials) return;

        const { material: matKey, shellOpacity, nozzleOpacity } = vesselState.visuals;
        const preset = MATERIAL_PRESETS[matKey];
        if (!preset) return;

        materials.shell.color.setHex(preset.color);
        materials.shell.shininess = preset.shininess;
        materials.shell.emissive.setHex(preset.emissive);
        materials.shell.opacity = shellOpacity;
        materials.shell.transparent = shellOpacity < 1.0;
        materials.shell.needsUpdate = true;

        materials.nozzle.color.setHex(preset.color);
        materials.nozzle.shininess = preset.shininess;
        materials.nozzle.emissive.setHex(preset.emissive);
        materials.nozzle.opacity = nozzleOpacity;
        materials.nozzle.transparent = nozzleOpacity < 1.0;
        materials.nozzle.needsUpdate = true;
    }, [vesselState.visuals]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: '#111111' }}
        />
    );
});

export default ThreeViewport;
