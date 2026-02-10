/**
 * DrawingImportModal - Modal for importing vessel dimensions from engineering
 * drawings (PDF or image) using AI-powered extraction (Gemini Vision).
 *
 * Phases: Upload -> Region Selection + Extraction -> Apply
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Check, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { RegionTool } from './types';
import {
  renderPdfPage, cropRegion, extractVesselFromDrawing,
  type DrawingRegions, type ExtractionResult,
} from './engine/drawing-parser';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

interface DrawingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (result: ExtractionResult) => void;
}

type Phase = 'upload' | 'select' | 'extracting' | 'result';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPTED_EXT = '.pdf,.png,.jpg,.jpeg';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.15;
const TOOLS: Record<RegionTool, { label: string; color: string }> = {
  side:  { label: 'Side View',    color: '#f97316' },
  end:   { label: 'End View',     color: '#06b6d4' },
  table: { label: 'Nozzle Table', color: '#d946ef' },
};

/** Draw a labeled, dashed region rectangle on the canvas. */
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string) {
  ctx.fillStyle = color + '25';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(label, x + 4, y + 16);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DrawingImportModal({ isOpen, onClose, onApply }: DrawingImportModalProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [regions, setRegions] = useState<DrawingRegions>({ side: null, end: null, table: null });
  const [activeTool, setActiveTool] = useState<RegionTool>('side');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const drawStart = useRef({ x: 0, y: 0 });
  const drawCur = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const panOrig = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Reset ---
  const reset = useCallback(() => {
    setPhase('upload'); setImageUrl(null); setActiveTool('side');
    setRegions({ side: null, end: null, table: null });
    setResult(null); setError(null); setZoom(1); setPanX(0); setPanY(0);
    imgRef.current = null;
  }, []);
  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // --- File handling ---
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) { setError('Unsupported file type. Use PDF, PNG, or JPG.'); return; }
    try {
      if (file.type === 'application/pdf') {
        setImageUrl(await renderPdfPage(file));
      } else {
        const url = await new Promise<string>((res) => {
          const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file);
        });
        setImageUrl(url);
      }
      setPhase('select');
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load file'); }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }, [handleFile]);
  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { e.target.files?.[0] && handleFile(e.target.files[0]); e.target.value = ''; }, [handleFile]);

  // --- Image loading & auto-fit ---
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current;
      if (c) { setZoom(Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight)); setPanX(0); setPanY(0); }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // --- Canvas resize ---
  useEffect(() => {
    const box = boxRef.current, c = canvasRef.current;
    if (!box || !c) return;
    const ro = new ResizeObserver(() => { c.width = box.clientWidth; c.height = box.clientHeight; });
    ro.observe(box);
    return () => ro.disconnect();
  }, [phase]);

  // --- Canvas redraw ---
  const redraw = useCallback(() => {
    const c = canvasRef.current, ctx = c?.getContext('2d'), img = imgRef.current;
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height);
    if (!img) return;
    ctx.save(); ctx.translate(panX, panY); ctx.scale(zoom, zoom); ctx.drawImage(img, 0, 0); ctx.restore();
    for (const key of ['side', 'end', 'table'] as RegionTool[]) {
      const r = regions[key]; if (!r) continue;
      const { color, label } = TOOLS[key];
      drawRect(ctx, panX + r.x * zoom, panY + r.y * zoom, r.width * zoom, r.height * zoom, color, label);
    }
    if (isDrawing) {
      const { color, label } = TOOLS[activeTool];
      const x = Math.min(drawStart.current.x, drawCur.current.x), y = Math.min(drawStart.current.y, drawCur.current.y);
      const w = Math.abs(drawCur.current.x - drawStart.current.x), h = Math.abs(drawCur.current.y - drawStart.current.y);
      if (w > 2 && h > 2) drawRect(ctx, x, y, w, h, color, label);
    }
  }, [panX, panY, zoom, regions, isDrawing, activeTool]);

  useEffect(() => { redraw(); }, [redraw]);

  // --- Coordinate helpers ---
  const cPos = useCallback((e: React.MouseEvent) => {
    const r = canvasRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  }, []);
  const toImg = useCallback((cx: number, cy: number) => ({ x: (cx - panX) / zoom, y: (cy - panY) / zoom }), [panX, panY, zoom]);

  // --- Mouse handlers ---
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 2 || e.button === 1) {
      e.preventDefault(); setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY }; panOrig.current = { x: panX, y: panY }; return;
    }
    if (e.button !== 0) return;
    const p = cPos(e); drawStart.current = p; drawCur.current = p; setIsDrawing(true);
  }, [cPos, panX, panY]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) { setPanX(panOrig.current.x + e.clientX - panStart.current.x); setPanY(panOrig.current.y + e.clientY - panStart.current.y); return; }
    if (!isDrawing) return;
    drawCur.current = cPos(e); redraw();
  }, [isPanning, isDrawing, cPos, redraw]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    if (!isDrawing) return;
    setIsDrawing(false);
    const end = cPos(e);
    const x = Math.min(drawStart.current.x, end.x), y = Math.min(drawStart.current.y, end.y);
    const w = Math.abs(end.x - drawStart.current.x), h = Math.abs(end.y - drawStart.current.y);
    if (w < 8 || h < 8) return;
    const tl = toImg(x, y), br = toImg(x + w, y + h);
    setRegions((prev) => ({ ...prev, [activeTool]: { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y } }));
  }, [isPanning, isDrawing, cPos, toImg, activeTool]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const p = cPos(e), f = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * f));
    setPanX(p.x - (p.x - panX) * (nz / zoom)); setPanY(p.y - (p.y - panY) * (nz / zoom)); setZoom(nz);
  }, [cPos, zoom, panX, panY]);

  const resetView = useCallback(() => {
    const img = imgRef.current, c = canvasRef.current;
    if (!img || !c) return;
    setZoom(Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight)); setPanX(0); setPanY(0);
  }, []);

  // --- Extraction ---
  const handleExtract = useCallback(async () => {
    if (!imageUrl || !regions.side) return;
    setError(null); setPhase('extracting');
    try {
      const { naturalWidth: cw, naturalHeight: ch } = imgRef.current!;
      const cropped: string[] = [await cropRegion(imageUrl, regions.side, cw, ch)];
      if (regions.end) cropped.push(await cropRegion(imageUrl, regions.end, cw, ch));
      if (regions.table) cropped.push(await cropRegion(imageUrl, regions.table, cw, ch));
      setResult(await extractVesselFromDrawing(cropped)); setPhase('result');
    } catch (err) { setError(err instanceof Error ? err.message : 'Extraction failed'); setPhase('select'); }
  }, [imageUrl, regions]);

  const handleApply = useCallback(() => { if (result) { onApply(result); handleClose(); } }, [result, onApply, handleClose]);

  if (!isOpen) return null;
  const hasSide = !!regions.side, hasEnd = !!regions.end, hasTable = !!regions.table;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
         onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="vm-drawing-modal flex flex-col bg-[rgba(20,25,35,0.97)] border border-white/10 rounded-lg w-[92%] max-w-[960px] h-[85%] max-h-[740px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <h3 className="text-[0.95rem] font-semibold text-white m-0">Import Engineering Drawing</h3>
          <button className="vm-btn-icon" onClick={handleClose}><X size={18} /></button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-2 text-[0.8rem] text-red-400 bg-red-500/10 border-b border-red-500/20">
            {error}
            <button className="vm-btn-icon ml-auto text-red-400" onClick={() => setError(null)}><X size={14} /></button>
          </div>
        )}

        {/* Upload phase */}
        {phase === 'upload' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
            <div className="vm-drawing-drop-zone vm-drop-zone w-full max-w-[440px] p-10"
                 onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => fileRef.current?.click()}>
              <Upload size={40} className="mb-2 opacity-40 text-white" />
              <div className="drop-text">Drop PDF or image here</div>
              <div className="drop-sub">Accepts .pdf, .png, .jpg, .jpeg</div>
              <input ref={fileRef} type="file" accept={ACCEPTED_EXT} onChange={onFileInput} className="hidden" />
            </div>
          </div>
        )}

        {/* Region selection phase */}
        {phase === 'select' && (
          <>
            <div className="vm-drawing-tools flex items-center gap-2 px-4 py-2 border-b border-white/[0.06]">
              {(['side', 'end', 'table'] as RegionTool[]).map((t) => (
                <button key={t}
                  className={`vm-drawing-tool-btn vm-toggle-btn ${activeTool === t ? 'active' : ''}`}
                  style={activeTool === t ? { background: TOOLS[t].color, borderColor: TOOLS[t].color, color: '#000' } : undefined}
                  onClick={() => setActiveTool(t)}>
                  <span className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: regions[t] ? TOOLS[t].color : 'transparent', border: `2px solid ${TOOLS[t].color}` }} />
                  {TOOLS[t].label}
                </button>
              ))}
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button className="vm-btn" style={{ width: 'auto', padding: '5px 8px' }} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_FACTOR))}><ZoomIn size={14} /></button>
              <button className="vm-btn" style={{ width: 'auto', padding: '5px 8px' }} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_FACTOR))}><ZoomOut size={14} /></button>
              <button className="vm-btn" style={{ width: 'auto', padding: '5px 8px' }} onClick={resetView}><RotateCcw size={14} /></button>
            </div>
            <div ref={boxRef} className="vm-drawing-canvas-container flex-1 overflow-hidden"
                 style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}>
              <canvas ref={canvasRef} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
                onContextMenu={(e) => e.preventDefault()}
                style={{ display: 'block', width: '100%', height: '100%' }} />
            </div>
            <div className="flex items-center justify-between px-4 py-2 text-[0.75rem] text-white/50 border-t border-white/[0.06]">
              <span>Zoom: {Math.round(zoom * 100)}%</span>
              <span className="flex gap-3">
                <span>Side {hasSide ? '\u2713' : '\u2717'}</span>
                <span>End {hasEnd ? '\u2713' : '\u2717'}</span>
                <span>Table {hasTable ? '\u2713' : '\u2717'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.08]">
              <button className="vm-btn vm-btn-primary flex-1" onClick={handleExtract}
                disabled={!hasSide} style={{ opacity: hasSide ? 1 : 0.4 }}>Extract Vessel Data</button>
              <button className="vm-btn" style={{ width: 'auto' }} onClick={handleClose}>Cancel</button>
            </div>
          </>
        )}

        {/* Extracting phase */}
        {phase === 'extracting' && (
          <div className="flex flex-col items-center justify-center flex-1 gap-4">
            <Loader2 size={40} className="animate-spin text-blue-400" />
            <div className="text-blue-400 font-mono">Analyzing drawing...</div>
            <div className="text-white/50 text-sm">Gemini is extracting vessel dimensions. This may take up to 30 seconds.</div>
          </div>
        )}

        {/* Result phase */}
        {phase === 'result' && result && (
          <div className="flex flex-col flex-1 overflow-auto p-4 gap-3">
            <div className="text-[0.8rem] text-white/55">Review extracted dimensions below.</div>
            <ResultSection title="Vessel">
              <ResultRow label="Inner Diameter" value={`${result.id} mm`} />
              <ResultRow label="Tan-Tan Length" value={`${result.length} mm`} />
              <ResultRow label="Head Ratio" value={`${result.headRatio}:1`} />
              <ResultRow label="Orientation" value={result.orientation} />
            </ResultSection>
            {result.nozzles.length > 0 && (
              <ResultSection title={`Nozzles (${result.nozzles.length})`}>
                {result.nozzles.map((n, i) => (
                  <div key={i} className="text-[0.75rem] text-white/70 py-0.5">
                    <strong className="text-white">{n.name}</strong> &mdash; pos {n.pos}mm, proj {n.proj}mm, {n.angle}&deg;, &empty;{n.size}mm
                  </div>
                ))}
              </ResultSection>
            )}
            {result.saddles.length > 0 && (
              <ResultSection title={`Saddles (${result.saddles.length})`}>
                {result.saddles.map((s, i) => (
                  <div key={i} className="text-[0.75rem] text-white/70 py-0.5">Saddle {i + 1} at {s.pos} mm</div>
                ))}
              </ResultSection>
            )}
            <div className="flex gap-2 mt-auto pt-3 border-t border-white/[0.06]">
              <button className="vm-btn flex-1" onClick={() => setPhase('select')}>Back</button>
              <button className="vm-btn vm-btn-success flex-1" onClick={handleApply}><Check size={14} /> Apply to Model</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vm-section rounded p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <h4 className="text-[0.85rem] text-white font-semibold m-0 mb-2">{title}</h4>
      {children}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[0.8rem] py-0.5">
      <span className="text-white/50">{label}</span>
      <span className="font-mono text-blue-400">{value}</span>
    </div>
  );
}
