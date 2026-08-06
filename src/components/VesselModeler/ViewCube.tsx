import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Home } from 'lucide-react';
import type { ThreeViewportHandle } from './ThreeViewport';
import type { VesselState } from './types';
import { canonicalPose, type CanonicalViewId } from './engine/canonical-views';
import { computeVesselBounds } from './engine/report-image-capture';
import { animateCamera } from './engine/camera-animation';

interface ViewCubeProps {
  viewportRef: React.RefObject<ThreeViewportHandle | null>;
  vesselState: VesselState;
}

/** Faces on the cube — label + the canonical view a click flies to. */
const FACES: { id: CanonicalViewId; label: string; cls: string }[] = [
  { id: 'n', label: 'N', cls: 'vm-viewcube__face--n' },
  { id: 's', label: 'S', cls: 'vm-viewcube__face--s' },
  { id: 'e', label: 'E', cls: 'vm-viewcube__face--e' },
  { id: 'w', label: 'W', cls: 'vm-viewcube__face--w' },
  { id: 'top', label: 'Top', cls: 'vm-viewcube__face--top' },
  { id: 'bottom', label: 'Bot', cls: 'vm-viewcube__face--bottom' },
];

/**
 * View-cube overlay (rendered by VesselModeler only in viewMode === '3d').
 *
 * The cube orientation is synced from the live camera every frame via a
 * self-managed rAF loop writing a `transform` to a ref'd DOM node — NO React
 * state per frame (PERF RULE, StatLeaderOverlay pattern). Clicking a face (or
 * the home / iso button) flies the camera to the matching canonical pose.
 */
export default function ViewCube({ viewportRef, vesselState }: ViewCubeProps) {
  const cubeRef = useRef<HTMLDivElement>(null);

  // Per-frame orientation sync (rAF, no React state). Reads the live camera and
  // writes a CSS transform; skips the write when the string is unchanged.
  useEffect(() => {
    let raf = 0;
    let last = '';
    const offset = new THREE.Vector3();
    const origin = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const node = cubeRef.current;
      const cam = viewportRef.current?.getCamera();
      if (!node || !cam) return;
      const ctrl = viewportRef.current?.getControls();
      const target = ctrl ? (ctrl.target as THREE.Vector3) : origin;

      offset.copy(cam.position).sub(target);
      const r = offset.length() || 1;
      const yaw = Math.atan2(offset.x, offset.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(offset.y / r, -1, 1));

      const transform =
        `rotateX(${THREE.MathUtils.radToDeg(pitch).toFixed(1)}deg) ` +
        `rotateY(${(-THREE.MathUtils.radToDeg(yaw)).toFixed(1)}deg)`;
      if (transform !== last) {
        node.style.transform = transform;
        last = transform;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [viewportRef]);

  const flyTo = (viewId: CanonicalViewId) => {
    const handle = viewportRef.current;
    const cam = handle?.getCamera();
    const ctrl = handle?.getControls();
    if (!handle || !cam || !ctrl) return;
    const boundsTarget = handle.getSceneManager()?.getVesselGroup() ?? handle.getScene();
    if (!boundsTarget) return;
    const bounds = computeVesselBounds(boundsTarget);
    const { position, target } = canonicalPose(viewId, vesselState, bounds);
    animateCamera(cam, ctrl, position, target, 400);
  };

  return (
    <div className="vm-viewcube">
      <div className="vm-viewcube__stage">
        <div className="vm-viewcube__cube" ref={cubeRef}>
          {FACES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`vm-viewcube__face ${f.cls}`}
              onClick={() => flyTo(f.id)}
              title={`View ${f.label}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="vm-viewcube__home"
        onClick={() => flyTo('iso')}
        title="Isometric view"
      >
        <Home size={13} />
      </button>
    </div>
  );
}
