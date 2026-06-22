import { useState, useCallback, useRef, useEffect, memo, type PointerEvent as ReactPointerEvent } from 'react';
import type { VesselState, CoverageTargets } from './types';
import { CoverageStatsSection, WallLossStatsSection, ScanCoverageStatsSection } from './stats';

interface UnifiedStatsPanelProps {
  vesselState: VesselState;
  sidebarOpen: boolean;
  showCoverage: boolean;
  showWallLoss: boolean;
  showScanCoverage: boolean;
  onUpdateCoverageTargets: (targets: CoverageTargets) => void;
}

const MIN_WIDTH = 340;
const MIN_HEIGHT = 120;

const MemoedCoverage = memo(CoverageStatsSection);
const MemoedWallLoss = memo(WallLossStatsSection);
const MemoedScanCoverage = memo(ScanCoverageStatsSection);

export default function UnifiedStatsPanel({
  vesselState,
  sidebarOpen,
  showCoverage,
  showWallLoss,
  showScanCoverage,
  onUpdateCoverageTargets,
}: UnifiedStatsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const anyVisible = showCoverage || showWallLoss || showScanCoverage;

  useEffect(() => {
    if (!anyVisible) { setPos(null); setSize(null); }
  }, [anyVisible]);

  const onDragStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = parseFloat(el.style.left) || rect.left;
    const origY = parseFloat(el.style.top) || rect.top;
    dragRef.current = { startX, startY, origX, origY };

    el.style.transition = 'none';
    el.style.left = `${origX}px`;
    el.style.top = `${origY}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      el.style.left = `${dragRef.current.origX + dx}px`;
      el.style.top = `${dragRef.current.origY + dy}px`;
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      el.style.transition = '';
      if (dragRef.current) {
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
      }
      dragRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  const onResizeStart = useCallback((e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: rect.width, origH: rect.height };

    el.style.transition = 'none';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';

    const onMove = (ev: globalThis.PointerEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      el.style.width = `${Math.max(MIN_WIDTH, resizeRef.current.origW + dx)}px`;
      el.style.minHeight = `${Math.max(MIN_HEIGHT, resizeRef.current.origH + dy)}px`;
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      el.style.transition = '';
      if (resizeRef.current) {
        const dx = ev.clientX - resizeRef.current.startX;
        const dy = ev.clientY - resizeRef.current.startY;
        setPos(prev => prev ?? { x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
        setSize({
          w: Math.max(MIN_WIDTH, resizeRef.current.origW + dx),
          h: Math.max(MIN_HEIGHT, resizeRef.current.origH + dy),
        });
      }
      resizeRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  if (!anyVisible) return null;

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { left: sidebarOpen ? 350 : 16, bottom: 48 };

  const sizeStyle: React.CSSProperties = size
    ? { width: size.w, minHeight: size.h }
    : {};

  const sections: React.ReactNode[] = [];
  if (showCoverage) sections.push(<MemoedCoverage key="coverage" vesselState={vesselState} />);
  if (showWallLoss) sections.push(<MemoedWallLoss key="wallloss" vesselState={vesselState} />);
  if (showScanCoverage) {
    sections.push(
      <MemoedScanCoverage key="scancov" vesselState={vesselState} onUpdateTargets={onUpdateCoverageTargets} />,
    );
  }

  return (
    <div
      ref={panelRef}
      className="vm-unified-stats-panel"
      style={{ ...posStyle, ...sizeStyle }}
    >
      <div className="vm-scancov-titlebar" onPointerDown={onDragStart}>
        <span className="vm-scancov-drag-dots">⋮⋮</span>
        <span className="vm-scancov-title">Statistics</span>
      </div>

      {sections.reduce<React.ReactNode[]>((acc, section, i) => {
        if (i > 0) acc.push(<div key={`div-${i}`} className="vm-stats-section-divider" />);
        acc.push(section);
        return acc;
      }, [])}

      <div className="vm-scancov-resize-handle" onPointerDown={onResizeStart} />
    </div>
  );
}
