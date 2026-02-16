/**
 * RegionSelector - Canvas-based region selection tool for engineering drawings.
 *
 * Displays a rendered PDF image and lets the user draw rectangles to mark
 * "Side View", "End View", and "Table" regions. Supports zoom/pan.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { Region, RegionTool } from './types';
import type { DrawingRegions } from './engine/drawing-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REGION_COLORS: Record<RegionTool, string> = {
  side: '#3b82f6',  // blue
  end: '#22c55e',   // green
  table: '#f59e0b', // amber
};

const REGION_LABELS: Record<RegionTool, string> = {
  side: 'Side View',
  end: 'End View',
  table: 'Nozzle Table',
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.15;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RegionSelectorProps {
  imageDataUrl: string;
  regions: DrawingRegions;
  onRegionsChange: (regions: DrawingRegions) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegionSelector({
  imageDataUrl,
  regions,
  onRegionsChange,
}: RegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing state
  const [activeTool, setActiveTool] = useState<RegionTool>('side');
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  // Pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const lastPanRef = useRef({ x: 0, y: 0 });

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Fit image to canvas on first load
      const canvas = canvasRef.current;
      if (canvas) {
        const fitZoom = Math.min(
          canvas.width / img.naturalWidth,
          canvas.height / img.naturalHeight,
        );
        setZoom(fitZoom);
        setPan({ x: 0, y: 0 });
      }
      redraw();
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);  

  // Resize canvas to fill container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);  

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image with pan/zoom
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0);
    ctx.restore();

    // Draw existing regions
    for (const key of ['side', 'end', 'table'] as RegionTool[]) {
      const region = regions[key];
      if (!region) continue;
      drawRegionRect(ctx, region, REGION_COLORS[key], REGION_LABELS[key]);
    }

    // Draw in-progress selection
    if (isDrawing) {
      const x = Math.min(startRef.current.x, currentRef.current.x);
      const y = Math.min(startRef.current.y, currentRef.current.y);
      const w = Math.abs(currentRef.current.x - startRef.current.x);
      const h = Math.abs(currentRef.current.y - startRef.current.y);
      if (w > 2 && h > 2) {
        drawRegionRect(ctx, { x, y, width: w, height: h }, REGION_COLORS[activeTool], REGION_LABELS[activeTool]);
      }
    }
  }, [pan, zoom, regions, isDrawing, activeTool]);

  // Redraw when state changes
  useEffect(() => {
    redraw();
  }, [redraw]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function drawRegionRect(
    ctx: CanvasRenderingContext2D,
    region: Region,
    color: string,
    label: string,
  ) {
    // Fill
    ctx.fillStyle = color + '20';
    ctx.fillRect(region.x, region.y, region.width, region.height);
    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.strokeRect(region.x, region.y, region.width, region.height);
    ctx.setLineDash([]);
    // Label
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, region.x + 6, region.y + 18);
  }

  function canvasCoords(e: React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  /** Convert canvas pixel coords to image coords (accounting for zoom/pan) */
  function toImageCoords(cx: number, cy: number) {
    return {
      x: (cx - pan.x) / zoom,
      y: (cy - pan.y) / zoom,
    };
  }

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle button or ctrl+click = pan
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        setIsPanning(true);
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }

      if (e.button !== 0) return;

      const pos = canvasCoords(e);
      startRef.current = pos;
      currentRef.current = pos;
      setIsDrawing(true);
    },
    [],  
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - lastPanRef.current.x;
        const dy = e.clientY - lastPanRef.current.y;
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        return;
      }

      if (!isDrawing) return;
      currentRef.current = canvasCoords(e);
      redraw();
    },
    [isPanning, isDrawing, redraw],  
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setIsPanning(false);
        return;
      }

      if (!isDrawing) return;
      setIsDrawing(false);

      const end = canvasCoords(e);
      const x = Math.min(startRef.current.x, end.x);
      const y = Math.min(startRef.current.y, end.y);
      const w = Math.abs(end.x - startRef.current.x);
      const h = Math.abs(end.y - startRef.current.y);

      // Ignore tiny accidental clicks
      if (w < 10 || h < 10) return;

      // Store region in image coordinates
      const topLeft = toImageCoords(x, y);
      const bottomRight = toImageCoords(x + w, y + h);

      const newRegion: Region = {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      };

      onRegionsChange({ ...regions, [activeTool]: newRegion });
    },
    [isDrawing, isPanning, activeTool, regions, onRegionsChange, zoom, pan],  
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)));
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const regionCount = [regions.side, regions.end, regions.table].filter(Boolean).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Tool buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['side', 'end', 'table'] as RegionTool[]).map((tool) => (
          <button
            key={tool}
            className={`vm-toggle-btn ${activeTool === tool ? 'active' : ''}`}
            onClick={() => setActiveTool(tool)}
            style={{ flex: '1 1 0', minWidth: 80, position: 'relative' }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: regions[tool] ? REGION_COLORS[tool] : 'transparent',
                border: `2px solid ${REGION_COLORS[tool]}`,
                flexShrink: 0,
              }}
            />
            {REGION_LABELS[tool]}
          </button>
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
        <button className="vm-btn" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}>-</button>
        <span style={{ minWidth: 50, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="vm-btn" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}>+</button>
        <span style={{ marginLeft: 'auto' }}>{regionCount}/3 regions | Ctrl+drag to pan | Scroll to zoom</span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: isPanning ? 'grabbing' : isDrawing ? 'crosshair' : 'crosshair',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
