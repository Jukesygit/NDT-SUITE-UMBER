// =============================================================================
// Camera Animation System for Inspection Mode
// =============================================================================
// Provides smooth camera transitions for flying to/from annotation inspection
// positions on the vessel surface.
// =============================================================================

import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnnotationShapeConfig, VesselState } from '../types';
import { shellPoint } from './annotation-geometry';
import { SCALE } from './materials';

// ---------------------------------------------------------------------------
// Module-level animation state
// ---------------------------------------------------------------------------

interface AnimationState {
    startPosition: THREE.Vector3;
    endPosition: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    startTime: number;
    duration: number;
    onComplete?: () => void;
}

let currentAnimation: AnimationState | null = null;

// ---------------------------------------------------------------------------
// computeInspectionCameraTarget
// ---------------------------------------------------------------------------

/**
 * Computes the ideal camera position and look-at target for viewing an
 * annotation front-on from the vessel surface.
 *
 * The camera is placed along the surface normal at a distance that fills
 * ~70% of the viewport with the annotation footprint.
 */
export function computeInspectionCameraTarget(
    ann: AnnotationShapeConfig,
    vesselState: VesselState,
    camera: THREE.PerspectiveCamera,
): { position: THREE.Vector3; target: THREE.Vector3 } {
    // Convert annotation angle (degrees, 90=TDC) to internal radians (0=3-o'clock)
    const angleRad = (ann.angle - 90) * Math.PI / 180;

    // Get the surface point at the annotation center
    const target = shellPoint(ann.pos, angleRad, vesselState, 0);

    // Compute surface normal (radially outward from vessel axis)
    const isVertical = vesselState.orientation === 'vertical';
    let normal: THREE.Vector3;
    if (isVertical) {
        normal = new THREE.Vector3(Math.cos(angleRad), 0, Math.sin(angleRad));
    } else {
        normal = new THREE.Vector3(0, Math.cos(angleRad), Math.sin(angleRad));
    }
    normal.normalize();

    // Calculate distance so the annotation footprint fills ~70% of viewport
    const footprint = Math.max(ann.width, ann.height) * SCALE;
    const hFovRad = (camera.fov * Math.PI) / 180; // vertical FOV in radians
    const distance = (footprint / 0.7) / (2 * Math.tan(hFovRad / 2));

    // Position camera along the normal at the computed distance
    const position = target.clone().add(normal.multiplyScalar(distance));

    return { position, target: target.clone() };
}

// ---------------------------------------------------------------------------
// animateCamera
// ---------------------------------------------------------------------------

/**
 * Starts a smooth camera animation from the current position to a target.
 * Any currently running animation is cancelled before starting.
 */
export function animateCamera(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    targetPosition: THREE.Vector3,
    targetLookAt: THREE.Vector3,
    duration = 500,
    onComplete?: () => void,
): void {
    currentAnimation = {
        startPosition: camera.position.clone(),
        endPosition: targetPosition.clone(),
        startTarget: (controls.target as THREE.Vector3).clone(),
        endTarget: targetLookAt.clone(),
        startTime: performance.now(),
        duration,
        onComplete,
    };
}

// ---------------------------------------------------------------------------
// updateCameraAnimation
// ---------------------------------------------------------------------------

/**
 * Call in the render loop each frame. Returns true if an animation is active.
 * Interpolates camera position and controls target using ease-in-out cubic.
 */
export function updateCameraAnimation(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
): boolean {
    if (!currentAnimation) return false;

    const elapsed = performance.now() - currentAnimation.startTime;
    let t = Math.min(elapsed / currentAnimation.duration, 1);

    // Ease-in-out cubic
    t = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

    camera.position.lerpVectors(
        currentAnimation.startPosition,
        currentAnimation.endPosition,
        t,
    );
    (controls.target as THREE.Vector3).lerpVectors(
        currentAnimation.startTarget,
        currentAnimation.endTarget,
        t,
    );
    controls.update();

    // Check if animation is complete
    if (elapsed >= currentAnimation.duration) {
        const onComplete = currentAnimation.onComplete;
        currentAnimation = null;
        onComplete?.();
    }

    return true;
}

// ---------------------------------------------------------------------------
// cancelCameraAnimation
// ---------------------------------------------------------------------------

/**
 * Cancels any running camera animation immediately.
 */
export function cancelCameraAnimation(): void {
    currentAnimation = null;
}
