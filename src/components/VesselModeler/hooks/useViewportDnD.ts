import { useCallback, type RefObject } from 'react';
import * as THREE from 'three';
import {
  type NozzleConfig,
  type LiftingLugConfig,
  type WeldConfig,
  type Pipeline,
  type PipeSegment,
  type PipeSegmentType,
  type VesselState,
  PIPE_SIZES,
} from '../types';
import type { ThreeViewportHandle } from '../ThreeViewport';
import { nextNozzleId } from '../engine/nozzle-id';
import { resolveBodyFrame } from '../engine/body-frame';
import type { UpdateVessel } from '../engine/vessel-reducer';

/** Walk up from a hit mesh to the appendage body it belongs to (undefined = main shell). */
function hitBodyId(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData?.bodyId;
    if (id !== undefined) return id as string;
    current = current.parent;
  }
  return undefined;
}

/**
 * Cursor-first drop placement (R2): resolve the (pos, angle, bodyId) for a palette
 * drop from the nearest shell hit. The hit's body wins — main shell OR a boot — and
 * the point is inverted through THAT body's frame, so a drop on a boot lands on the
 * boot (previously it computed a garbage main-frame position and stayed on the main
 * shell). For a main-shell hit the frame inverse reproduces the legacy inline math
 * exactly, so single-body models are byte-identical.
 */
function resolveDropPlacement(
  state: VesselState,
  hit: THREE.Intersection
): { pos: number; angle: number; bodyId: string | undefined } {
  const bodyId = hitBodyId(hit.object);
  const frame = resolveBodyFrame(state, bodyId);
  const local = frame.toLocal(hit.point);
  const pos =
    bodyId === undefined
      ? Math.max(
          -(state.id / (2 * state.headRatio)),
          Math.min(state.length + state.id / (2 * state.headRatio), local.pos)
        )
      : Math.max(0, Math.min(frame.axialLength, local.pos));
  return { pos, angle: local.angle, bodyId };
}

interface UseViewportDnDParams {
  vesselState: VesselState;
  addNozzle: (nozzle: Omit<NozzleConfig, 'id'>) => void;
  addLug: (lug: LiftingLugConfig) => void;
  addWeld: (weld: WeldConfig) => void;
  updateVessel: UpdateVessel;
  /** Stable pipe-segment factory from usePipingActions — the pipe-part drop reuses it. */
  createDefaultSegment: (type: PipeSegmentType, pipeDiameter: number) => PipeSegment;
  viewportRef: RefObject<ThreeViewportHandle | null>;
}

/**
 * Drag-and-drop handlers for the 3D canvas (D3). Bodies extracted verbatim from
 * VesselModeler.tsx — the four typed drops (nozzle-pipe / lifting-lug / weld /
 * pipe-part) plus the dragover guard and the combined dispatcher. Each handler
 * keeps its original `useCallback` dependency array (adjusted only for the new
 * closure scope), so callback identities churn exactly as before.
 */
export function useViewportDnD({
  vesselState,
  addNozzle,
  addLug,
  addWeld,
  updateVessel,
  createDefaultSegment,
  viewportRef,
}: UseViewportDnDParams) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/x-nozzle-pipe') ||
      e.dataTransfer.types.includes('application/x-lifting-lug') ||
      e.dataTransfer.types.includes('application/x-weld') ||
      e.dataTransfer.types.includes('application/x-pipe-part')
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const SCALE = 0.001; // Matches vessel-geometry scale

  const handleNozzleDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-nozzle-pipe');
      if (!data) return;
      e.preventDefault();

      const pipe = JSON.parse(data);
      const cam = viewportRef.current?.getCamera();
      const rendererEl = viewportRef.current?.getRenderer()?.domElement;
      const sceneManager = viewportRef.current?.getSceneManager();
      if (!cam || !rendererEl || !sceneManager) return;

      const vesselGroup = sceneManager.getVesselGroup();
      if (!vesselGroup) return;

      // Raycast from drop position
      const rect = rendererEl.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cam);

      // Find shell meshes to intersect
      const shells: THREE.Object3D[] = [];
      vesselGroup.traverse((child: THREE.Object3D) => {
        if (child.userData.isShell) shells.push(child);
      });
      const intersects = raycaster.intersectObjects(shells);

      if (intersects.length > 0) {
        // Cursor-first: the nozzle mounts on whatever body surface is under the drop.
        const {
          pos: newPos,
          angle: deg,
          bodyId,
        } = resolveDropPlacement(vesselState, intersects[0]);

        // Find a unique name
        const namePrefix = pipe.style === 'plain-pipe' ? 'P' : 'N';
        let nozzleNum = vesselState.nozzles.length + 1;
        let name = namePrefix + nozzleNum;
        while (vesselState.nozzles.some((n) => n.name === name)) {
          nozzleNum++;
          name = namePrefix + nozzleNum;
        }

        const defaultProj = vesselState.id / 2 + 200;

        addNozzle({
          name,
          pos: Math.round(newPos),
          proj: defaultProj,
          angle: Math.round(deg),
          size: pipe.id,
          flangeOD: pipe.flangeOD,
          flangeThk: pipe.flangeThk,
          pipeOD: pipe.od,
          ...(pipe.style ? { style: pipe.style } : {}),
          ...(bodyId !== undefined ? { bodyId } : {}),
        });
      } else {
        // Dropped on canvas but missed the vessel - add at center
        const namePrefix = pipe.style === 'plain-pipe' ? 'P' : 'N';
        let nozzleNum = vesselState.nozzles.length + 1;
        let name = namePrefix + nozzleNum;
        while (vesselState.nozzles.some((n) => n.name === name)) {
          nozzleNum++;
          name = namePrefix + nozzleNum;
        }
        addNozzle({
          name,
          pos: vesselState.length / 2,
          proj: pipe.od * 2,
          angle: 90,
          size: pipe.id,
          flangeOD: pipe.flangeOD,
          flangeThk: pipe.flangeThk,
          pipeOD: pipe.od,
          ...(pipe.style ? { style: pipe.style } : {}),
        });
      }
    },
    [vesselState, addNozzle]
  );

  // --- Lifting lug drag-and-drop onto 3D canvas ---
  const handleLugDrop = useCallback(
    (e: React.DragEvent) => {
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
      let bodyId: string | undefined;

      if (intersects.length > 0) {
        // Cursor-first: the lug mounts on whatever body surface is under the drop.
        ({ pos: newPos, angle: deg, bodyId } = resolveDropPlacement(vesselState, intersects[0]));
      } else {
        newPos = vesselState.length / 2;
        deg = 90;
        bodyId = undefined;
      }

      let lugNum = vesselState.liftingLugs.length + 1;
      let name = 'L' + lugNum;
      while (vesselState.liftingLugs.some((l) => l.name === name)) {
        lugNum++;
        name = 'L' + lugNum;
      }

      addLug({
        name,
        pos: Math.round(newPos),
        angle: Math.round(deg),
        style: lugData.style || 'padEye',
        swl: lugData.label,
        ...(bodyId !== undefined ? { bodyId } : {}),
      });
    },
    [vesselState, addLug]
  );

  // --- Weld drag-and-drop onto 3D canvas ---
  const handleWeldDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-weld');
      if (!data) return;
      e.preventDefault();

      const { type: wType } = JSON.parse(data) as { type: 'circumferential' | 'longitudinal' };
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
      let bodyId: string | undefined;

      if (intersects.length > 0) {
        // Cursor-first: the weld mounts on whatever body surface is under the drop.
        ({ pos: newPos, angle: deg, bodyId } = resolveDropPlacement(vesselState, intersects[0]));
      } else {
        newPos = vesselState.length / 2;
        deg = 90;
        bodyId = undefined;
      }

      let weldNum = vesselState.welds.length + 1;
      let name = 'W' + weldNum;
      while (vesselState.welds.some((w) => w.name === name)) {
        weldNum++;
        name = 'W' + weldNum;
      }
      const bodyField = bodyId !== undefined ? { bodyId } : {};

      if (wType === 'circumferential') {
        addWeld({
          name,
          type: 'circumferential',
          pos: Math.round(newPos),
          color: '#888888',
          ...bodyField,
        });
      } else {
        // Longitudinal welds run along the axis; clamp the extent to the body's span
        // when dropped on a boot (its cylinder is short) rather than the main length.
        const bodyLength =
          bodyId === undefined
            ? vesselState.length
            : resolveBodyFrame(vesselState, bodyId).axialLength;
        const halfLen = bodyLength * 0.25;
        addWeld({
          name,
          type: 'longitudinal',
          pos: Math.round(newPos - halfLen),
          endPos: Math.round(newPos + halfLen),
          angle: Math.round(deg),
          color: '#888888',
          ...bodyField,
        });
      }
    },
    [vesselState, addWeld]
  );

  // --- Pipe part drag-and-drop ---
  const handlePipePartDrop = useCallback(
    (e: React.DragEvent) => {
      const data = e.dataTransfer.getData('application/x-pipe-part');
      if (!data) return;
      e.preventDefault();

      const { type: segmentType } = JSON.parse(data) as { type: PipeSegmentType };

      // Raycast the shell — same pattern as nozzle drop
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

      // Compute pos/angle from hit point (mirrors nozzle drop logic)
      const isVertical = vesselState.orientation === 'vertical';
      const headDepth = vesselState.id / (2 * vesselState.headRatio);
      let newPos: number;
      let deg: number;

      if (intersects.length > 0) {
        const point = intersects[0].point;
        newPos = isVertical
          ? point.y / SCALE + vesselState.length / 2
          : point.x / SCALE + vesselState.length / 2;
        newPos = Math.max(-headDepth, Math.min(vesselState.length + headDepth, newPos));

        const rad = isVertical ? Math.atan2(point.z, point.x) : Math.atan2(point.y, point.z);
        deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
      } else {
        // Missed the vessel — place at center top
        newPos = vesselState.length / 2;
        deg = 90;
      }

      // Default pipe size for the stub nozzle
      const defaultPipeSize = PIPE_SIZES[2]; // 4" NPS
      const defaultProj = vesselState.id / 2 + 150;

      // Find unique nozzle name
      let nozzleNum = vesselState.nozzles.length + 1;
      let name = 'P' + nozzleNum;
      while (vesselState.nozzles.some((n) => n.name === name)) {
        nozzleNum++;
        name = 'P' + nozzleNum;
      }

      // Create plain-pipe nozzle + pipeline with first segment in one atomic update.
      // Mint the nozzle id up front so the pipeline can anchor to it by id.
      const nozzleId = nextNozzleId(vesselState.nozzles);
      const nozzle: NozzleConfig = {
        id: nozzleId,
        name,
        pos: Math.round(newPos),
        proj: defaultProj,
        angle: Math.round(deg),
        size: defaultPipeSize.id,
        pipeOD: defaultPipeSize.od,
        style: 'plain-pipe',
      };

      const newPipeline: Pipeline = {
        id: crypto.randomUUID(),
        nozzleId,
        pipeDiameter: defaultPipeSize.od,
        segments: [createDefaultSegment(segmentType, defaultPipeSize.od)],
      };

      updateVessel((prev) => ({
        ...prev,
        nozzles: [...prev.nozzles, nozzle],
        pipelines: [...prev.pipelines, newPipeline],
        hasModel: true,
      }));
    },
    [vesselState, updateVessel, createDefaultSegment]
  );

  // --- Combined drop handler ---
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('application/x-nozzle-pipe')) {
        handleNozzleDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-lifting-lug')) {
        handleLugDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-weld')) {
        handleWeldDrop(e);
      } else if (e.dataTransfer.types.includes('application/x-pipe-part')) {
        handlePipePartDrop(e);
      }
    },
    [handleNozzleDrop, handleLugDrop, handleWeldDrop, handlePipePartDrop]
  );

  return { handleDragOver, handleDrop };
}
