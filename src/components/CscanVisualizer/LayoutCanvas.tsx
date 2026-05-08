import { useRef, useEffect, useCallback, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { CscanData } from './types';
import type { ScanPosition, ScanExtents } from './hooks/useLayoutMode';
import { findSnap, type SnapResult } from './hooks/layoutSnap';

const THUMBNAIL_MAX_WIDTH = 200;
const SNAP_GUIDE_COLOR = '#35a058';
const HIGHLIGHT_COLOR = '#2d8a4e';
const LABEL_BG = 'rgba(28, 27, 24, 0.75)';
const LABEL_TEXT = '#f5f4f2';
const CANVAS_BG = '#1c1b18';

interface LayoutCanvasProps {
  scans: CscanData[];
  scanPositions: Map<string, ScanPosition>;
  scanExtentsMap: Map<string, ScanExtents>;
  zOrder: string[];
  highlightedScanId: string | null;
  onPositionChange: (id: string, pos: ScanPosition) => void;
  onBringToFront: (id: string) => void;
  onApply: () => void;
  onReset: () => void;
  camera: { panX: number; panY: number; zoom: number };
  onCameraChange: (camera: { panX: number; panY: number; zoom: number }) => void;
}

export default function LayoutCanvas({
  scans,
  scanPositions,
  scanExtentsMap,
  zOrder,
  highlightedScanId,
  onPositionChange,
  onBringToFront,
  onApply,
  onReset,
  camera,
  onCameraChange,
}: LayoutCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailCache = useRef<Map<string, ImageBitmap>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);

  // Drag state
  const dragRef = useRef<{
    scanId: string;
    startMouse: { x: number; y: number };
    startPos: ScanPosition;
  } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<ScanPosition | null>(null);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const shiftRef = useRef(false);

  // Right-drag pan state
  const panDragRef = useRef<{
    startMouse: { x: number; y: number };
    startCamera: { panX: number; panY: number };
  } | null>(null);

  // Convert canvas pixel to mm-space
  const pixelToMm = useCallback(
    (px: number, py: number, canvasWidth: number, canvasHeight: number) => {
      const mmX = (px - canvasWidth / 2) / camera.zoom + camera.panX;
      const mmY = (py - canvasHeight / 2) / camera.zoom + camera.panY;
      return { x: mmX, y: mmY };
    },
    [camera],
  );

  // Convert mm-space to canvas pixel
  const mmToPixel = useCallback(
    (mmX: number, mmY: number, canvasWidth: number, canvasHeight: number) => {
      const px = (mmX - camera.panX) * camera.zoom + canvasWidth / 2;
      const py = (mmY - camera.panY) * camera.zoom + canvasHeight / 2;
      return { x: px, y: py };
    },
    [camera],
  );

  // Generate thumbnails via heatmap worker
  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/heatmap-renderer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    const pendingQueue = [...scans];

    worker.onmessage = async (e: MessageEvent<{ id: number; imageData: ImageData }>) => {
      const { imageData } = e.data;
      const scan = scans.find((_, idx) => idx === e.data.id);
      if (scan) {
        const bitmap = await createImageBitmap(imageData);
        thumbnailCache.current.set(scan.id, bitmap);
      }
      processNext();
    };

    function processNext() {
      if (pendingQueue.length === 0) return;
      const scan = pendingQueue.shift()!;
      const idx = scans.indexOf(scan);

      const totalCells = scan.width * scan.height;
      const matrix = new Float32Array(totalCells);
      for (let row = 0; row < scan.height; row++) {
        for (let col = 0; col < scan.width; col++) {
          const val = scan.data[row]?.[col];
          matrix[row * scan.width + col] = val === null || val === undefined ? NaN : val;
        }
      }

      const aspect = scan.height / scan.width;
      const viewportWidth = THUMBNAIL_MAX_WIDTH;
      const viewportHeight = Math.round(THUMBNAIL_MAX_WIDTH * aspect);

      worker.postMessage(
        {
          id: idx,
          matrix,
          width: scan.width,
          height: scan.height,
          viewportWidth,
          viewportHeight,
          colormap: 'Jet',
          reverseColormap: true,
        },
        [matrix.buffer],
      );
    }

    processNext();

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [scans]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function draw() {
      const cw = canvas!.width;
      const ch = canvas!.height;

      ctx!.clearRect(0, 0, cw, ch);
      ctx!.fillStyle = CANVAS_BG;
      ctx!.fillRect(0, 0, cw, ch);

      for (const scanId of zOrder) {
        const scan = scans.find((s) => s.id === scanId);
        if (!scan) continue;
        const extents = scanExtentsMap.get(scanId);
        if (!extents) continue;

        const isDragging = dragRef.current?.scanId === scanId;
        let pos = scanPositions.get(scanId);
        if (!pos) continue;
        if (isDragging && dragCurrent) {
          pos = dragCurrent;
        }

        const bitmap = thumbnailCache.current.get(scanId);
        if (!bitmap) continue;

        const topLeft = mmToPixel(pos.x, pos.y, cw, ch);
        const bottomRight = mmToPixel(pos.x + extents.width, pos.y + extents.height, cw, ch);
        const drawW = bottomRight.x - topLeft.x;
        const drawH = bottomRight.y - topLeft.y;

        ctx!.drawImage(bitmap, topLeft.x, topLeft.y, drawW, drawH);

        if (scanId === highlightedScanId) {
          ctx!.strokeStyle = HIGHLIGHT_COLOR;
          ctx!.lineWidth = 2;
          ctx!.strokeRect(topLeft.x, topLeft.y, drawW, drawH);
        }

        const label = scan.filename.replace(/\.[^/.]+$/, '');
        ctx!.font = '12px Barlow, sans-serif';
        const textMetrics = ctx!.measureText(label);
        const labelPadX = 6;
        const labelPadY = 3;
        const labelW = textMetrics.width + labelPadX * 2;
        const labelH = 16 + labelPadY * 2;
        const labelX = topLeft.x;
        const labelY = topLeft.y - labelH - 4;

        ctx!.fillStyle = LABEL_BG;
        ctx!.beginPath();
        ctx!.roundRect(labelX, labelY, labelW, labelH, 4);
        ctx!.fill();

        ctx!.fillStyle = LABEL_TEXT;
        ctx!.fillText(label, labelX + labelPadX, labelY + labelPadY + 12);
      }

      // Snap guides and ghost preview
      if (dragRef.current && snapResult && dragCurrent) {
        const scanId = dragRef.current.scanId;
        const extents = scanExtentsMap.get(scanId);
        const bitmap = thumbnailCache.current.get(scanId);

        if (extents && bitmap) {
          const ghostPos = snapResult.snappedPosition;
          const ghostTL = mmToPixel(ghostPos.x, ghostPos.y, cw, ch);
          const ghostBR = mmToPixel(
            ghostPos.x + extents.width,
            ghostPos.y + extents.height,
            cw,
            ch,
          );
          ctx!.globalAlpha = 0.5;
          ctx!.drawImage(
            bitmap,
            ghostTL.x,
            ghostTL.y,
            ghostBR.x - ghostTL.x,
            ghostBR.y - ghostTL.y,
          );
          ctx!.globalAlpha = 1.0;

          for (const guide of snapResult.guides) {
            ctx!.strokeStyle = SNAP_GUIDE_COLOR;
            ctx!.lineWidth = 2;
            ctx!.setLineDash([6, 4]);
            ctx!.beginPath();
            if (guide.axis === 'x') {
              const p1 = mmToPixel(guide.value, guide.start, cw, ch);
              const p2 = mmToPixel(guide.value, guide.end, cw, ch);
              ctx!.moveTo(p1.x, p1.y);
              ctx!.lineTo(p2.x, p2.y);
            } else {
              const p1 = mmToPixel(guide.start, guide.value, cw, ch);
              const p2 = mmToPixel(guide.end, guide.value, cw, ch);
              ctx!.moveTo(p1.x, p1.y);
              ctx!.lineTo(p2.x, p2.y);
            }
            ctx!.stroke();
            ctx!.setLineDash([]);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    scans,
    scanPositions,
    scanExtentsMap,
    zOrder,
    highlightedScanId,
    camera,
    dragCurrent,
    snapResult,
    mmToPixel,
  ]);

  // Resize canvas to container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx2 = canvas.getContext('2d');
      if (ctx2) ctx2.scale(devicePixelRatio, devicePixelRatio);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Hit test
  const hitTest = useCallback(
    (mmX: number, mmY: number): string | null => {
      for (let i = zOrder.length - 1; i >= 0; i--) {
        const id = zOrder[i];
        const pos = scanPositions.get(id);
        const ext = scanExtentsMap.get(id);
        if (!pos || !ext) continue;
        if (mmX >= pos.x && mmX <= pos.x + ext.width && mmY >= pos.y && mmY <= pos.y + ext.height) {
          return id;
        }
      }
      return null;
    },
    [zOrder, scanPositions, scanExtentsMap],
  );

  // Pointer events
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const mm = pixelToMm(px, py, rect.width, rect.height);

      if (e.button === 2) {
        panDragRef.current = {
          startMouse: { x: e.clientX, y: e.clientY },
          startCamera: { panX: camera.panX, panY: camera.panY },
        };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (e.button === 0) {
        const hitId = hitTest(mm.x, mm.y);
        if (hitId) {
          const pos = scanPositions.get(hitId)!;
          dragRef.current = {
            scanId: hitId,
            startMouse: { x: e.clientX, y: e.clientY },
            startPos: { ...pos },
          };
          setDragCurrent({ ...pos });
          onBringToFront(hitId);
          canvas.setPointerCapture(e.pointerId);
        }
      }
    },
    [camera, pixelToMm, hitTest, scanPositions, onBringToFront],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panDragRef.current) {
        const dx = (e.clientX - panDragRef.current.startMouse.x) / camera.zoom;
        const dy = (e.clientY - panDragRef.current.startMouse.y) / camera.zoom;
        onCameraChange({
          ...camera,
          panX: panDragRef.current.startCamera.panX - dx,
          panY: panDragRef.current.startCamera.panY - dy,
        });
        return;
      }

      if (!dragRef.current) return;
      const { scanId, startMouse, startPos } = dragRef.current;
      const dx = (e.clientX - startMouse.x) / camera.zoom;
      const dy = (e.clientY - startMouse.y) / camera.zoom;
      const proposedPos: ScanPosition = {
        x: startPos.x + dx,
        y: startPos.y + dy,
      };

      const extents = scanExtentsMap.get(scanId);
      if (!extents) return;

      const otherScans = zOrder
        .filter((id) => id !== scanId)
        .map((id) => ({
          id,
          position: scanPositions.get(id)!,
          extents: scanExtentsMap.get(id)!,
        }))
        .filter((s) => s.position && s.extents);

      const snap = findSnap(scanId, proposedPos, extents, otherScans, shiftRef.current);
      setSnapResult(snap);
      setDragCurrent(snap ? snap.snappedPosition : proposedPos);
    },
    [camera, scanPositions, scanExtentsMap, zOrder, onCameraChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (canvas) canvas.releasePointerCapture(e.pointerId);

      if (panDragRef.current) {
        panDragRef.current = null;
        return;
      }

      if (dragRef.current && dragCurrent) {
        onPositionChange(dragRef.current.scanId, dragCurrent);
      }
      dragRef.current = null;
      setDragCurrent(null);
      setSnapResult(null);
    },
    [dragCurrent, onPositionChange],
  );

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.05, Math.min(50, camera.zoom * factor));
      onCameraChange({ ...camera, zoom: newZoom });
    },
    [camera, onCameraChange],
  );

  // Keyboard: shift tracking + arrow nudge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = true;
      if (!highlightedScanId) return;
      const step = e.shiftKey ? 1 : 5;
      const pos = scanPositions.get(highlightedScanId);
      if (!pos) return;
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          onPositionChange(highlightedScanId, { x: pos.x - step, y: pos.y });
          break;
        case 'ArrowRight':
          e.preventDefault();
          onPositionChange(highlightedScanId, { x: pos.x + step, y: pos.y });
          break;
        case 'ArrowUp':
          e.preventDefault();
          onPositionChange(highlightedScanId, { x: pos.x, y: pos.y - step });
          break;
        case 'ArrowDown':
          e.preventDefault();
          onPositionChange(highlightedScanId, { x: pos.x, y: pos.y + step });
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [highlightedScanId, scanPositions, onPositionChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ backgroundColor: CANVAS_BG }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        className="w-full h-full"
        style={{ cursor: dragRef.current ? 'grabbing' : 'default', touchAction: 'none' }}
        tabIndex={0}
      />
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded transition-colors"
          style={{ backgroundColor: '#4a4845', color: '#f5f4f2' }}
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          onClick={onApply}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded font-medium transition-colors"
          style={{ backgroundColor: '#2d8a4e', color: '#f5f4f2' }}
        >
          <Check className="w-4 h-4" />
          Apply &amp; Composite
        </button>
      </div>
    </div>
  );
}
