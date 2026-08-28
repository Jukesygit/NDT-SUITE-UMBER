import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, ProbeSide } from '../types';
import { hazBand, teeGeometry, toPath, weldGeometry, type Pt } from '../geometry/weld';
import { traceFan } from '../physics/raytrace';
import { wedgeById } from '../physics/materials';
import { techniqueSheet, type SheetSection } from '../sheet';
import type { Theme } from '../BeamTool';

interface View {
  scale: number; // px per mm
  ox: number;
  oy: number;
}

/** CSS custom properties the SVG references; inlined on PNG export. */
const EXPORT_VARS = [
  '--bg',
  '--panel',
  '--panel-2',
  '--inset',
  '--line',
  '--line-soft',
  '--text',
  '--muted',
  '--faint',
  '--green',
  '--amber',
  '--steel',
  '--steel-edge',
  '--hatch-bg',
  '--hatch-line',
  '--haz-fill',
  '--spread-fill',
  '--fan-fill',
  '--ray-glow',
  '--font-mono',
];

/** S-scan ray gradient endpoints (green → cyan), per theme. */
const RAY_GRADIENT: Record<Theme, [[number, number, number], [number, number, number]]> = {
  dark: [
    [63, 224, 143],
    [79, 214, 232],
  ],
  light: [
    [11, 138, 83],
    [11, 124, 153],
  ],
};

export function Canvas(props: {
  state: AppState;
  theme: Theme;
  onStandoff: (v: number) => void;
  onSide: (v: ProbeSide) => void;
}) {
  const { state, theme, onStandoff, onSide } = props;
  const { part, weld, probe, beam } = state;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 6, ox: 400, oy: 200 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{
    mode: 'pan' | 'probe';
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  // horizontal extents either side of x = 0 (weld CL / joint face)
  const tee = weld.joint === 'tee-fillet';
  const extentLeft = part.halfWidth;
  const extentRight = tee ? Math.max(weld.chordThickness, 2) + 10 : part.halfWidth;

  const fitScale = useCallback(() => {
    const el = wrapRef.current;
    if (!el || el.clientWidth < 40 || el.clientHeight < 40) return 0;
    return Math.min(
      (el.clientWidth * 0.82) / (extentLeft + extentRight),
      (el.clientHeight * 0.42) / part.thickness
    );
  }, [extentLeft, extentRight, part.thickness]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    const scale = fitScale();
    if (!el || scale <= 0) return; // container not laid out yet (e.g. hidden pane)
    const margin = (el.clientWidth - (extentLeft + extentRight) * scale) / 2;
    setView({ scale, ox: margin + extentLeft * scale, oy: el.clientHeight * 0.4 });
  }, [fitScale, extentLeft, extentRight]);

  // the observer must always call the LATEST fit, not the mount-time closure
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    fitRef.current();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const M = useCallback(
    (p: Pt): Pt => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy }),
    [view]
  );
  const path = useCallback((pts: Pt[], close = true) => toPath(pts.map(M), close), [M]);

  // ---------- interaction ----------
  const onWheel = (e: React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0012);
    setView((v) => {
      // wide parts fit below the usual floor — never block zooming back out to fitted
      const floor = Math.min(0.8, fitScale() || 0.8);
      const scale = Math.min(60, Math.max(floor, v.scale * factor));
      const k = scale / v.scale;
      return { scale, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
    setPanning(true);
  };

  const onProbeDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode: 'probe', sx: e.clientX, sy: e.clientY, ox: 0, oy: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'pan') {
      setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.sx), oy: d.oy + (e.clientY - d.sy) }));
    } else {
      const rect = svgRef.current!.getBoundingClientRect();
      const xmm = (e.clientX - rect.left - view.ox) / view.scale;
      const dir = probe.side === 'A' ? 1 : -1;
      const raw = -dir * xmm;
      // crossing the centreline flips the probe to the other side
      // (small dead-band so it doesn't flap right at zero); on a T-joint
      // the chord blocks side B, so the probe stays on the branch
      if (raw < -2 && weld.joint === 'butt') onSide(probe.side === 'A' ? 'B' : 'A');
      const so = Math.min(part.halfWidth - 5, Math.max(2, Math.abs(raw)));
      onStandoff(Math.round(so * 10) / 10);
    }
  };

  const onPointerUp = () => {
    drag.current = null;
    setPanning(false);
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    // serialize a sized clone with the CSS variables inlined — the live
    // stylesheet doesn't travel with the blob, and unresolved var() paints black
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // the CSS custom properties live on the tool's own `.nbt-page` root, not on
    // documentElement — custom props inherit, so the SVG resolves them
    const cs = getComputedStyle(svg);
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `:root{${EXPORT_VARS.map((v) => `${v}:${cs.getPropertyValue(v)};`).join('')}}`;
    clone.insertBefore(style, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onerror = () => URL.revokeObjectURL(url);
    img.onload = () => {
      URL.revokeObjectURL(url);
      drawSheet(img, w, h, state, cs);
    };
    img.src = url;
  };

  // ---------- geometry ----------
  const geo = tee ? null : weldGeometry(weld, part.thickness);
  const tg = tee ? teeGeometry(weld, part.thickness) : null;
  const fan = traceFan(state);
  const dir = probe.side === 'A' ? 1 : -1;
  const indexX = dir * -probe.standoff;
  const contact = wedgeById(probe.wedgeId).velocity <= 0;

  const surface = M({ x: 0, y: 0 });
  const backwall = M({ x: 0, y: part.thickness });
  const plateL = M({ x: -part.halfWidth, y: 0 });
  const plateR = M({ x: tee ? 0 : part.halfWidth, y: 0 });

  // fills between two equal-length polylines must be built per leg —
  // one polygon across all legs self-intersects at every bounce (bow-ties)
  const legFill = (a: { points: Pt[] }, b: { points: Pt[] }): string =>
    a.points
      .slice(0, -1)
      .map((_, i) => toPath([a.points[i], a.points[i + 1], b.points[i + 1], b.points[i]].map(M)))
      .join(' ');

  let fanFill = '';
  if (beam.mode === 'sectorial' && fan.center.length > 1) {
    fanFill = legFill(fan.center[0], fan.center[fan.center.length - 1]);
  }
  let spreadFill = '';
  if (fan.spreadLower && fan.spreadUpper) {
    spreadFill = legFill(fan.spreadLower, fan.spreadUpper);
  }

  const wedgeFrontX = indexX + dir * 8;
  const weldEdge = tg ? -tg.toeX : geo!.capHalfWidth;
  const probeOverCap = dir === 1 ? wedgeFrontX > -weldEdge : wedgeFrontX < weldEdge;

  return (
    <div className="nbt-canvas-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className={panning ? 'nbt-panning' : ''}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        <defs>
          <pattern
            id="hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--hatch-bg)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch-line)" strokeWidth="1" />
          </pattern>
          {/* on a T-joint the beam display stops at the joint face */}
          <clipPath id="branchClip">
            <rect
              x={plateL.x}
              y={-10000}
              width={Math.max(surface.x - plateL.x, 0)}
              height={30000}
            />
          </clipPath>
        </defs>

        <Grid view={view} wrap={wrapRef} />

        {/* plate */}
        <rect
          x={plateL.x}
          y={plateL.y}
          width={plateR.x - plateL.x}
          height={backwall.y - surface.y}
          fill="var(--steel)"
          stroke="var(--steel-edge)"
          strokeWidth="1"
        />

        {geo && (
          <>
            {/* HAZ */}
            {weld.showHaz && (
              <>
                <path d={path(hazBand(geo.fusionLeft, weld.hazWidth, -1))} fill="var(--haz-fill)" />
                <path d={path(hazBand(geo.fusionRight, weld.hazWidth, 1))} fill="var(--haz-fill)" />
              </>
            )}

            {/* weld groove + caps */}
            <path d={path(geo.groove)} fill="url(#hatch)" />
            {geo.caps.map((c, i) => (
              <path
                key={i}
                d={path(c)}
                fill="url(#hatch)"
                stroke="var(--amber)"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            ))}
            <path
              d={path(geo.fusionLeft, false)}
              fill="none"
              stroke="var(--amber)"
              strokeOpacity="0.8"
              strokeWidth="1.2"
            />
            <path
              d={path(geo.fusionRight, false)}
              fill="none"
              stroke="var(--amber)"
              strokeOpacity="0.8"
              strokeWidth="1.2"
            />
          </>
        )}

        {tg && (
          <>
            {/* chord plate */}
            <path
              d={path(tg.chord)}
              fill="var(--steel)"
              stroke="var(--steel-edge)"
              strokeWidth="1"
            />

            {/* HAZ */}
            {weld.showHaz && (
              <path d={tg.haz.map((p) => path(p)).join(' ')} fill="var(--haz-fill)" />
            )}

            {/* fillet welds + root */}
            {tg.fillets.map((f, i) => (
              <path
                key={i}
                d={path(f)}
                fill="url(#hatch)"
                stroke="var(--amber)"
                strokeOpacity="0.8"
                strokeWidth="1.2"
              />
            ))}
            <path
              d={path(tg.rootLine, false)}
              fill="none"
              stroke="var(--amber)"
              strokeOpacity="0.6"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
          </>
        )}

        {/* centreline / joint face */}
        <line
          x1={surface.x}
          y1={
            tg
              ? M({ x: 0, y: -tg.chordExtent - 8 }).y
              : surface.y - 30 - weld.capHeight * view.scale
          }
          x2={backwall.x}
          y2={tg ? M({ x: 0, y: part.thickness + tg.chordExtent + 8 }).y : backwall.y + 30}
          stroke="var(--faint)"
          strokeWidth="1"
          strokeDasharray="10 4 2 4"
        />

        {/* beam display (clipped to the branch plate on a T-joint) */}
        <g clipPath={tee ? 'url(#branchClip)' : undefined}>
          {/* beam spread envelope */}
          {spreadFill && <path d={spreadFill} fill="var(--spread-fill)" />}
          {fan.spreadLower && (
            <path
              d={path(fan.spreadLower.points, false)}
              fill="none"
              stroke="var(--green)"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}
          {fan.spreadUpper && (
            <path
              d={path(fan.spreadUpper.points, false)}
              fill="none"
              stroke="var(--green)"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* sectorial fan */}
          {fanFill && <path d={fanFill} fill="var(--fan-fill)" />}
          {beam.mode === 'sectorial' &&
            fan.center.map((r, i) => {
              const t = fan.center.length > 1 ? i / (fan.center.length - 1) : 0;
              const color = lerpColor(RAY_GRADIENT[theme][0], RAY_GRADIENT[theme][1], t);
              return (
                <path
                  key={i}
                  d={path(r.points, false)}
                  fill="none"
                  stroke={color}
                  strokeOpacity="0.75"
                  strokeWidth="1.1"
                />
              );
            })}

          {/* conventional centre ray */}
          {beam.mode === 'conventional' &&
            fan.center.map((r, i) => (
              <g key={i}>
                <path
                  d={path(r.points, false)}
                  fill="none"
                  stroke="var(--ray-glow)"
                  strokeWidth="4"
                />
                <path
                  d={path(r.points, false)}
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth="1.6"
                />
              </g>
            ))}

          {/* skip markers */}
          {beam.showSkipMarkers &&
            beam.mode === 'conventional' &&
            fan.center[0]?.points.slice(1).map((p, i) => {
              const sp = M(p);
              const label = `${((i + 1) / 2).toFixed(1).replace('.0', '')}S`;
              const above = p.y === 0;
              return (
                <g key={i}>
                  <path
                    d={`M${sp.x},${sp.y - 4} L${sp.x + 4},${sp.y} L${sp.x},${sp.y + 4} L${sp.x - 4},${sp.y} Z`}
                    fill="var(--bg)"
                    stroke="var(--green)"
                    strokeWidth="1.2"
                  />
                  <text
                    x={sp.x}
                    y={above ? sp.y - 10 : sp.y + 16}
                    textAnchor="middle"
                    fill="var(--green)"
                    fillOpacity="0.85"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
        </g>

        {/* probe + wedge */}
        <ProbeGlyph
          M={M}
          indexX={indexX}
          dir={dir}
          incident={fan.incidentAngle}
          warn={probeOverCap}
          contact={contact}
          onPointerDown={onProbeDown}
        />

        {/* dimensions */}
        <Dimension
          a={M({ x: tee ? -part.halfWidth - 6 : part.halfWidth + 6, y: 0 })}
          b={M({ x: tee ? -part.halfWidth - 6 : part.halfWidth + 6, y: part.thickness })}
          label={`T ${part.thickness.toFixed(1)}`}
        />
        <Dimension
          a={M({ x: indexX, y: -((tg ? weld.filletLeg : weld.capHeight) + 6) })}
          b={M({ x: 0, y: -((tg ? weld.filletLeg : weld.capHeight) + 6) })}
          label={`SO ${probe.standoff.toFixed(1)}`}
        />
      </svg>

      <div className="nbt-canvas-tools">
        <button className="nbt-btn" onClick={fit}>
          FIT
        </button>
        <button className="nbt-btn" onClick={exportPng}>
          PNG
        </button>
      </div>
      <div className="nbt-canvas-hint">
        DRAG PROBE · SCROLL ZOOM · DRAG BACKGROUND PAN · MM GRID
      </div>
    </div>
  );
}

/* ---------- PNG technique sheet ---------- */

/**
 * Compose the exported PNG: header, the scene image, then every input
 * variable and computed readout as labelled panels (2x scale throughout).
 */
function drawSheet(
  scene: HTMLImageElement,
  w: number,
  h: number,
  state: AppState,
  cs: CSSStyleDeclaration
) {
  const col = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
  const mono = (size: number, weight = 400) => `${weight} ${size}px "Spline Sans Mono", monospace`;
  const { sections, caveat } = techniqueSheet(state);

  const W = w * 2;
  const sceneH = h * 2;
  const headerH = 76;
  const pad = 48;
  const gap = 24;
  const lineH = 34;
  const titleH = 48;
  const rowGap = 26;

  // grid layout: as many columns as fit at ~420px each
  const cols = Math.max(2, Math.min(sections.length, Math.floor((W - 2 * pad) / 420)));
  const colW = (W - 2 * pad - (cols - 1) * gap) / cols;
  const rows: SheetSection[][] = [];
  for (let i = 0; i < sections.length; i += cols) rows.push(sections.slice(i, i + cols));
  const rowHs = rows.map(
    (r) => titleH + Math.max(...r.map((s) => s.lines.length)) * lineH + rowGap
  );
  const caveatH = caveat ? 52 : 0;
  const panelH = 28 + rowHs.reduce((a, b) => a + b, 0) + caveatH + 20;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = headerH + sceneH + panelH;
  const ctx = c.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  const bg = col('--bg', '#0a0d10');
  const panel = col('--panel', '#11161b');
  const line = col('--line', '#232c35');
  const text = col('--text', '#d7dee5');
  const muted = col('--muted', '#8b98a5');
  const green = col('--green', '#3fe08f');
  const amber = col('--amber', '#ffb454');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);

  // header
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = line;
  ctx.fillRect(0, headerH - 2, W, 2);
  ctx.font = '700 30px "Chakra Petch", sans-serif';
  ctx.fillStyle = amber;
  ctx.fillText('NOT', pad, 48);
  const notW = ctx.measureText('NOT').width;
  ctx.fillStyle = text;
  ctx.fillText('BEAMTOOL', pad + notW, 48);
  ctx.font = mono(17, 500);
  ctx.fillStyle = muted;
  ctx.textAlign = 'right';
  ctx.fillText(`UT TECHNIQUE SHEET · ${new Date().toISOString().slice(0, 10)}`, W - pad, 46);
  ctx.textAlign = 'left';

  // scene
  ctx.drawImage(scene, 0, headerH, W, sceneH);
  ctx.fillStyle = line;
  ctx.fillRect(0, headerH + sceneH, W, 2);

  // parameter panels
  let y = headerH + sceneH + 28;
  rows.forEach((row, ri) => {
    row.forEach((s, ci) => {
      const x = pad + ci * (colW + gap);
      ctx.font = mono(16, 600);
      ctx.fillStyle = green;
      ctx.fillText(s.title.toUpperCase(), x, y + 18);
      ctx.fillStyle = line;
      ctx.fillRect(x, y + 30, colW, 1);
      s.lines.forEach((ln, li) => {
        const ly = y + titleH + li * lineH + 12;
        ctx.font = mono(18);
        ctx.fillStyle = muted;
        ctx.fillText(ln.k, x, ly);
        ctx.font = mono(18, 600);
        ctx.fillStyle = ln.cls === 'warn' ? amber : ln.cls === 'plain' ? text : green;
        ctx.textAlign = 'right';
        ctx.fillText(ln.v, x + colW, ly);
        ctx.textAlign = 'left';
      });
    });
    y += rowHs[ri];
  });

  if (caveat) {
    ctx.font = mono(18, 600);
    ctx.fillStyle = amber;
    ctx.fillText(`CAVEAT — ${caveat}`, pad, y + 10);
  }

  const a = document.createElement('a');
  a.download = 'notbeamtool-technique.png';
  a.href = c.toDataURL('image/png');
  a.click();
}

/* ---------- sub-glyphs ---------- */

function ProbeGlyph(props: {
  M: (p: Pt) => Pt;
  indexX: number;
  dir: 1 | -1;
  incident: number;
  warn: boolean;
  contact: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const { M, indexX, dir, incident, warn, contact, onPointerDown } = props;
  const d = dir;
  const idx = M({ x: indexX, y: 0 });
  const scale = M({ x: 1, y: 0 }).x - M({ x: 0, y: 0 }).x;
  const color = warn ? 'var(--amber)' : 'var(--green)';

  if (contact) {
    // flat contact shoe, casing straight up — no wedge to draw
    const shoe: Pt[] = [
      { x: indexX - 11, y: 0 },
      { x: indexX + 11, y: 0 },
      { x: indexX + 11, y: -8 },
      { x: indexX - 11, y: -8 },
    ];
    const c = M({ x: indexX, y: -8 });
    return (
      <g style={{ cursor: 'ew-resize' }} onPointerDown={onPointerDown}>
        <path d={toPath(shoe.map(M))} fill="var(--panel-2)" stroke={color} strokeWidth="1.4" />
        <rect
          x={c.x - 7 * scale}
          y={c.y - 16 * scale}
          width={14 * scale}
          height={16 * scale}
          fill="var(--inset)"
          stroke={color}
          strokeWidth="1.4"
        />
        <line
          x1={idx.x}
          y1={idx.y - 6}
          x2={idx.x}
          y2={idx.y + 6}
          stroke={color}
          strokeWidth="1.4"
        />
        <text
          x={idx.x + 6}
          y={idx.y - 12}
          textAnchor="start"
          fill={color}
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {warn ? 'OVER CAP' : 'IDX'}
        </text>
      </g>
    );
  }

  // wedge outline in part mm, y negative above surface
  const wedgePts: Pt[] = [
    { x: indexX + d * 8, y: 0 },
    { x: indexX - d * 26, y: 0 },
    { x: indexX - d * 26, y: -17 },
    { x: indexX + d * 8, y: -8 },
  ];
  const casingBase: Pt = { x: indexX - d * 12, y: -12 };
  const cb = M(casingBase);
  const rot = Number.isNaN(incident) ? 0 : -d * incident;

  return (
    <g style={{ cursor: 'ew-resize' }} onPointerDown={onPointerDown}>
      <path d={toPath(wedgePts.map(M))} fill="var(--panel-2)" stroke={color} strokeWidth="1.4" />
      {/* probe casing, tilted to the incident angle */}
      <g transform={`rotate(${rot} ${cb.x} ${cb.y})`}>
        <rect
          x={cb.x - 7 * scale}
          y={cb.y - 16 * scale}
          width={14 * scale}
          height={16 * scale}
          fill="var(--inset)"
          stroke={color}
          strokeWidth="1.4"
        />
        <rect
          x={cb.x - 3 * scale}
          y={cb.y - 22 * scale}
          width={6 * scale}
          height={6 * scale}
          fill="var(--inset)"
          stroke={color}
          strokeWidth="1.2"
        />
      </g>
      {/* index point */}
      <line x1={idx.x} y1={idx.y - 6} x2={idx.x} y2={idx.y + 6} stroke={color} strokeWidth="1.4" />
      <text
        x={idx.x + d * 6}
        y={idx.y - 8}
        textAnchor={d === 1 ? 'start' : 'end'}
        fill={color}
        fontSize="10"
        fontFamily="var(--font-mono)"
      >
        {warn ? 'OVER CAP' : 'IDX'}
      </text>
    </g>
  );
}

function Dimension(props: { a: Pt; b: Pt; label: string }) {
  const { a, b, label } = props;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const vertical = Math.abs(a.x - b.x) < 1;
  return (
    <g stroke="var(--muted)" strokeWidth="1">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {vertical ? (
        <>
          <line x1={a.x - 4} y1={a.y} x2={a.x + 4} y2={a.y} />
          <line x1={b.x - 4} y1={b.y} x2={b.x + 4} y2={b.y} />
        </>
      ) : (
        <>
          <line x1={a.x} y1={a.y - 4} x2={a.x} y2={a.y + 4} />
          <line x1={b.x} y1={b.y - 4} x2={b.x} y2={b.y + 4} />
        </>
      )}
      <text
        x={vertical ? mid.x + 8 : mid.x}
        y={vertical ? mid.y : mid.y - 6}
        textAnchor={vertical ? 'start' : 'middle'}
        fill="var(--muted)"
        stroke="none"
        fontSize="11"
        fontFamily="var(--font-mono)"
      >
        {label}
      </text>
    </g>
  );
}

// the suite ships @types/react 19, where useRef<T>(null) yields RefObject<T | null>
function Grid(props: { view: View; wrap: React.RefObject<HTMLDivElement | null> }) {
  const { view, wrap } = props;
  const el = wrap.current;
  if (!el) return null;
  const w = el.clientWidth;
  const h = el.clientHeight;
  const x0 = -view.ox / view.scale;
  const x1 = (w - view.ox) / view.scale;
  const y0 = -view.oy / view.scale;
  const y1 = (h - view.oy) / view.scale;
  const minor = view.scale > 3 ? 10 : 50;
  const lines: React.ReactElement[] = [];
  for (let x = Math.floor(x0 / minor) * minor; x <= x1; x += minor) {
    const major = Math.abs(x % 50) < 0.01;
    lines.push(
      <line
        key={'v' + x}
        x1={x * view.scale + view.ox}
        y1={0}
        x2={x * view.scale + view.ox}
        y2={h}
        stroke="var(--line-soft)"
        strokeOpacity={major ? 0.55 : 0.22}
        strokeWidth="1"
      />
    );
  }
  for (let y = Math.floor(y0 / minor) * minor; y <= y1; y += minor) {
    const major = Math.abs(y % 50) < 0.01;
    lines.push(
      <line
        key={'h' + y}
        x1={0}
        y1={y * view.scale + view.oy}
        x2={w}
        y2={y * view.scale + view.oy}
        stroke="var(--line-soft)"
        strokeOpacity={major ? 0.55 : 0.22}
        strokeWidth="1"
      />
    );
  }
  return <g>{lines}</g>;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
