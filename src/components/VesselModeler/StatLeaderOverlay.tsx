import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { AnnotationShapeConfig, VesselState } from './types';
import { shellPoint } from './engine/annotation-geometry';

interface StatLeaderOverlayProps {
  hoveredStat: 'min' | 'max';
  annotation: AnnotationShapeConfig;
  vesselState: VesselState;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function StatLeaderOverlay({
  hoveredStat,
  annotation,
  vesselState,
  cameraRef,
  containerRef,
}: StatLeaderOverlayProps) {
  const camera = cameraRef.current;
  const container = containerRef.current;

  const screen = useMemo(() => {
    if (!camera || !container || !annotation.thicknessStats) return null;

    const stats = annotation.thicknessStats;
    const point = hoveredStat === 'min' ? stats.minPoint : stats.maxPoint;

    const angleRad = (point.angle * Math.PI) / 180;
    const worldPt = shellPoint(point.pos, angleRad, vesselState, 2);

    const projected = worldPt.clone().project(camera);

    // Behind camera check
    if (projected.z > 1) return null;

    const w = container.clientWidth;
    const h = container.clientHeight;
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
    };
  }, [hoveredStat, annotation, vesselState, camera, container]);

  if (!screen || !container) return null;

  const w = container.clientWidth;
  const h = container.clientHeight;
  const color = hoveredStat === 'min' ? '#ef4444' : '#22c55e';

  return (
    <svg
      className="absolute inset-0 z-30"
      width={w}
      height={h}
      style={{ pointerEvents: 'none' }}
    >
      <circle cx={screen.x} cy={screen.y} r={8} fill="none" stroke={color} strokeWidth={2} opacity={0.9}>
        <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx={screen.x} cy={screen.y} r={3} fill={color} opacity={0.9} />
    </svg>
  );
}
