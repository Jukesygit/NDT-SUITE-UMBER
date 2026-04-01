import React, { useEffect, useState } from 'react';
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
  const [screen, setScreen] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!camera || !container || !annotation.thicknessStats) return;

    const stats = annotation.thicknessStats;
    const point = hoveredStat === 'min' ? stats.minPoint : stats.maxPoint;

    // Convert vessel-surface coords to 3D world position
    const angleRad = (point.angle * Math.PI) / 180;
    const worldPt = shellPoint(point.pos, angleRad, vesselState, 2);

    // shellPoint already applies SCALE internally, but we need the final Three.js coords
    const projected = worldPt.clone().project(camera);

    const w = container.clientWidth;
    const h = container.clientHeight;
    const sx = (projected.x * 0.5 + 0.5) * w;
    const sy = (-projected.y * 0.5 + 0.5) * h;

    // Behind camera check
    if (projected.z > 1) {
      setScreen(null);
      return;
    }

    setScreen({ x: sx, y: sy });
  });

  if (!screen) return null;

  const container = containerRef.current;
  if (!container) return null;

  const w = container.clientWidth;
  const h = container.clientHeight;

  // Source point: right edge of viewport (panel boundary), vertically offset per stat
  const srcX = w - 360;
  const srcY = hoveredStat === 'min' ? h * 0.4 : h * 0.45;

  const color = hoveredStat === 'min' ? '#ef4444' : '#22c55e';

  return (
    <svg
      className="absolute inset-0 z-30 transition-opacity duration-200"
      width={w}
      height={h}
      style={{ pointerEvents: 'none' }}
    >
      <line
        x1={srcX} y1={srcY} x2={screen.x} y2={screen.y}
        stroke={color} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8}
      />
      <circle cx={screen.x} cy={screen.y} r={8} fill="none" stroke={color} strokeWidth={2} opacity={0.9}>
        <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx={screen.x} cy={screen.y} r={3} fill={color} opacity={0.9} />
    </svg>
  );
}
