// =============================================================================
// Viewport Screenshot — High-res capture with native Canvas2D label rendering
// =============================================================================
// Captures the Three.js viewport at a configurable multiplier by rendering to
// an off-screen WebGLRenderTarget, then composites CSS2D labels by projecting
// their 3D positions and drawing them with Canvas2D. Avoids html2canvas and its
// limitations (backdrop-filter, transform positioning, text centering).
//
// Gamma correction: render targets output linear color space, so we apply
// linear→sRGB conversion so brightness matches the on-screen appearance.
// =============================================================================

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture the viewport and return a data URL. The returned promise resolves
 * after any restriction images in the annotation table have been drawn.
 */
export async function captureViewportScreenshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  multiplier: number,
): Promise<string> {
  const origSize = renderer.getSize(new THREE.Vector2());
  const w = Math.round(origSize.x * multiplier);
  const h = Math.round(origSize.y * multiplier);

  // 1) Render 3D scene to off-screen target
  const rt = new THREE.WebGLRenderTarget(w, h, { format: THREE.RGBAFormat });
  const tempCam = camera.clone();
  tempCam.aspect = w / h;
  tempCam.updateProjectionMatrix();
  renderer.setRenderTarget(rt);
  renderer.render(scene, tempCam);

  // Read pixels and flip vertically (WebGL reads bottom-up)
  const pixels = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
  renderer.setRenderTarget(null);
  rt.dispose();

  flipPixelsVertically(pixels, w, h);

  // Apply linear → sRGB gamma so brightness matches on-screen appearance
  applyGammaCorrection(pixels);

  // 2) Composite onto a 2D canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = new ImageData(new Uint8ClampedArray(pixels.buffer), w, h);
  ctx.putImageData(imageData, 0, 0);

  // 3) Draw CSS2D labels by projecting 3D positions to 2D
  const css2dObjects = collectCSS2DObjects(scene);
  const tableDrawPromises: Promise<void>[] = [];

  for (const obj of css2dObjects) {
    // Respect Three.js visibility (occlusion culling for back-facing labels)
    if (!obj.visible) continue;

    const screenPos = projectToScreen(obj, tempCam, w, h);
    if (!screenPos) continue;

    const el = obj.element as HTMLElement;
    if (!el) continue;

    const className = el.className || '';

    if (className.includes('vm-annotation-table-label')) {
      // Table drawing may be async (loading restriction images)
      tableDrawPromises.push(drawAnnotationTable(ctx, el, screenPos.x, screenPos.y, multiplier));
    } else {
      drawCSS2DElement(ctx, el, screenPos.x, screenPos.y, multiplier);
    }
  }

  // Wait for any table images to finish loading
  await Promise.all(tableDrawPromises);

  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Pixel manipulation
// ---------------------------------------------------------------------------

function flipPixelsVertically(pixels: Uint8Array, w: number, h: number): void {
  const rowSize = w * 4;
  const tempRow = new Uint8Array(rowSize);
  for (let y = 0; y < Math.floor(h / 2); y++) {
    const topOff = y * rowSize;
    const botOff = (h - 1 - y) * rowSize;
    tempRow.set(pixels.subarray(topOff, topOff + rowSize));
    pixels.copyWithin(topOff, botOff, botOff + rowSize);
    pixels.set(tempRow, botOff);
  }
}

/** Convert linear RGB values to sRGB so brightness matches screen output. */
function applyGammaCorrection(pixels: Uint8Array): void {
  // Build a lookup table for the 256 possible byte values
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const linear = i / 255;
    const srgb = linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    lut[i] = Math.round(Math.min(1, Math.max(0, srgb)) * 255);
  }

  // Apply to R, G, B channels (skip Alpha at offset +3)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i]     = lut[pixels[i]];
    pixels[i + 1] = lut[pixels[i + 1]];
    pixels[i + 2] = lut[pixels[i + 2]];
  }
}

// ---------------------------------------------------------------------------
// CSS2DObject collection
// ---------------------------------------------------------------------------

function collectCSS2DObjects(scene: THREE.Scene): CSS2DObject[] {
  const objects: CSS2DObject[] = [];
  scene.traverse((obj) => {
    if (obj instanceof CSS2DObject) {
      objects.push(obj);
    }
  });
  return objects;
}

// ---------------------------------------------------------------------------
// 3D → 2D projection
// ---------------------------------------------------------------------------

function projectToScreen(
  obj: CSS2DObject,
  camera: THREE.PerspectiveCamera,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } | null {
  const worldPos = new THREE.Vector3();
  obj.getWorldPosition(worldPos);

  const ndc = worldPos.clone().project(camera);

  // Behind camera
  if (ndc.z < -1 || ndc.z > 1) return null;

  const x = (ndc.x * 0.5 + 0.5) * canvasW;
  const y = (-ndc.y * 0.5 + 0.5) * canvasH;

  return { x, y };
}

// ---------------------------------------------------------------------------
// Canvas2D drawing for CSS2D elements (non-table)
// ---------------------------------------------------------------------------

function drawCSS2DElement(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  x: number,
  y: number,
  scale: number,
): void {
  const className = el.className || '';

  if (className.includes('vm-nozzle-label')) {
    drawPillLabel(ctx, el, x, y, scale, {
      bg: 'rgba(0, 0, 0, 0.9)',
      border: 'rgba(255, 255, 255, 0.2)',
      color: '#ffffff',
    });
  } else if (className.includes('vm-weld-label')) {
    drawPillLabel(ctx, el, x, y, scale, {
      bg: 'rgba(0, 0, 0, 0.9)',
      border: 'rgba(255, 200, 60, 0.4)',
      color: '#ffd966',
    });
  } else if (className.includes('vm-annotation-pill')) {
    const annType = el.dataset.annType;
    const colors = annType === 'restriction'
      ? { bg: 'rgba(180, 80, 0, 0.85)', border: 'rgba(255, 160, 50, 0.6)', color: '#ffe0b0' }
      : annType === 'scan'
        ? { bg: 'rgba(20, 120, 50, 0.85)', border: 'rgba(80, 200, 100, 0.6)', color: '#c0ffd0' }
        : { bg: 'rgba(10, 14, 20, 0.85)', border: 'rgba(255, 255, 255, 0.25)', color: '#ffffff' };
    drawPillLabel(ctx, el, x, y, scale, colors);
  } else if (className.includes('vm-annotation-label')) {
    drawAnnotationCard(ctx, el, x, y, scale);
  }
}

// ---------------------------------------------------------------------------
// Pill label (nozzle labels + annotation pills)
// ---------------------------------------------------------------------------

interface PillColors {
  bg: string;
  border: string;
  color: string;
}

function drawPillLabel(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  x: number,
  y: number,
  scale: number,
  colors: PillColors,
): void {
  const text = el.textContent?.trim() || '';
  if (!text) return;

  const fontSize = Math.round(10 * scale);
  const paddingX = Math.round(10 * scale);
  const paddingY = Math.round(3 * scale);
  const borderWidth = Math.round(1 * scale);

  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const textH = fontSize;

  const w = textW + paddingX * 2;
  const h = textH + paddingY * 2;
  const radius = h / 2;

  // CSS transform: translate(-50%, -100%) — centered horizontally, above the point
  const drawX = x - w / 2;
  const drawY = y - h;

  // Background
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, w, h, radius);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // Text — centered in the pill
  ctx.fillStyle = colors.color;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.toUpperCase(), drawX + w / 2, drawY + h / 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Annotation card (flyout label with name, scan/index, area)
// ---------------------------------------------------------------------------

function drawAnnotationCard(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  x: number,
  y: number,
  scale: number,
): void {
  const nameEl = el.querySelector('.vm-annotation-label-name');
  const posEl = el.querySelector('.vm-annotation-label-pos');
  const areaEl = el.querySelector('.vm-annotation-label-area');
  const notesEl = el.querySelector('.vm-annotation-label-notes');

  const lines: { text: string; color: string; bold: boolean }[] = [];
  if (nameEl?.textContent) lines.push({ text: nameEl.textContent, color: '#ffffff', bold: true });
  if (posEl?.textContent) lines.push({ text: posEl.textContent, color: 'rgba(255,255,255,0.65)', bold: false });
  if (areaEl?.textContent) lines.push({ text: areaEl.textContent, color: 'rgba(77,184,255,0.9)', bold: false });
  if (notesEl?.textContent) lines.push({ text: notesEl.textContent, color: 'rgba(255,200,100,0.85)', bold: false });

  if (lines.length === 0) return;

  const fontSize = Math.round(11 * scale);
  const lineH = Math.round(16 * scale);
  const padX = Math.round(10 * scale);
  const padY = Math.round(8 * scale);
  const borderR = Math.round(6 * scale);
  const borderW = Math.round(1 * scale);

  // Measure max width
  let maxW = 0;
  for (const line of lines) {
    ctx.font = `${line.bold ? 'bold ' : ''}${fontSize}px monospace`;
    maxW = Math.max(maxW, ctx.measureText(line.text).width);
  }

  const w = maxW + padX * 2;
  const h = lines.length * lineH + padY * 2;

  const drawX = x;
  const drawY = y - h / 2;

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(drawX, drawY, w, h, borderR);
  ctx.fillStyle = 'rgba(10, 14, 20, 0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = borderW;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    ctx.font = `${line.bold ? 'bold ' : ''}${fontSize}px monospace`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, drawX + padX, drawY + padY + i * lineH);
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Annotation summary table (async — loads restriction images)
// ---------------------------------------------------------------------------

async function drawAnnotationTable(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  x: number,
  y: number,
  scale: number,
): Promise<void> {
  const fontSize = Math.round(10 * scale);
  const headerFontSize = Math.round(9 * scale);
  const rowH = Math.round(18 * scale);
  const padX = Math.round(10 * scale);
  const padY = Math.round(8 * scale);
  const borderR = Math.round(6 * scale);
  const borderW = Math.round(1 * scale);
  const colGap = Math.round(12 * scale);
  const imgMaxW = Math.round(180 * scale);
  const imgMaxH = Math.round(100 * scale);
  const imgPad = Math.round(6 * scale);

  // Extract data from the DOM table
  interface TableRow {
    cells: string[];
    severityColor: string | null;
    imageUrl: string | null;
  }
  interface TableSection {
    header: string;
    columns: string[];
    rows: TableRow[];
  }

  const sections: TableSection[] = [];

  const headerEls = el.querySelectorAll('.vm-annotation-table-header');
  const tableEls = el.querySelectorAll('.vm-annotation-table');

  headerEls.forEach((headerEl, i) => {
    const table = tableEls[i];
    if (!table) return;

    const columns: string[] = [];
    table.querySelectorAll('thead th').forEach((th) => {
      columns.push(th.textContent?.trim() || '');
    });

    const rows: TableRow[] = [];
    const bodyRows = table.querySelectorAll('tbody tr');
    for (let r = 0; r < bodyRows.length; r++) {
      const tr = bodyRows[r] as HTMLElement;
      if (tr.classList.contains('vm-annotation-table-img-row')) {
        // This is an image row — attach to the previous data row if visible
        if (tr.style.display !== 'none' && rows.length > 0) {
          const img = tr.querySelector('img') as HTMLImageElement | null;
          rows[rows.length - 1].imageUrl = img?.src || null;
        }
        continue;
      }

      const cells: string[] = [];
      tr.querySelectorAll('td').forEach((td) => {
        cells.push(td.textContent?.trim() || '');
      });
      if (cells.length > 0) {
        const dot = tr.querySelector('.vm-severity-dot') as HTMLElement | null;
        rows.push({
          cells,
          severityColor: dot?.style.backgroundColor || null,
          imageUrl: null,
        });
      }
    }

    sections.push({
      header: headerEl.textContent?.trim() || '',
      columns,
      rows,
    });
  });

  if (sections.length === 0) return;

  // Detect light/dark mode
  const isLight = el.classList.contains('light');
  const theme = isLight
    ? {
        bg: 'rgba(255, 255, 255, 0.97)',
        border: 'rgba(0, 0, 0, 0.2)',
        headerColor: 'rgba(0, 0, 0, 0.65)',
        thColor: 'rgba(0, 0, 0, 0.65)',
        thBg: 'rgba(0, 0, 0, 0.04)',
        tdColor: '#1a1a1a',
        separatorColor: 'rgba(0, 0, 0, 0.12)',
        rowSeparatorColor: 'rgba(0, 0, 0, 0.08)',
      }
    : {
        bg: 'rgba(10, 14, 20, 0.95)',
        border: 'rgba(255, 255, 255, 0.12)',
        headerColor: 'rgba(255, 255, 255, 0.5)',
        thColor: 'rgba(255, 255, 255, 0.4)',
        thBg: 'transparent',
        tdColor: 'rgba(255, 255, 255, 0.85)',
        separatorColor: 'rgba(255, 255, 255, 0.08)',
        rowSeparatorColor: 'rgba(255, 255, 255, 0.04)',
      };

  // Preload any visible restriction images
  const imageMap = new Map<string, HTMLImageElement>();
  const imagePromises: Promise<void>[] = [];
  for (const section of sections) {
    for (const row of section.rows) {
      if (row.imageUrl && !imageMap.has(row.imageUrl)) {
        const url = row.imageUrl;
        const promise = new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { imageMap.set(url, img); resolve(); };
          img.onerror = () => { resolve(); }; // skip failed images
          img.src = url;
        });
        imagePromises.push(promise);
        imageMap.set(url, null!); // placeholder to avoid duplicate loads
      }
    }
  }
  await Promise.all(imagePromises);

  // Measure column widths
  const allColumns = sections[0]?.columns.length || 4;
  const colWidths = new Array(allColumns).fill(0);

  ctx.font = `bold ${headerFontSize}px monospace`;
  for (const section of sections) {
    for (let c = 0; c < section.columns.length; c++) {
      colWidths[c] = Math.max(colWidths[c], ctx.measureText(section.columns[c]).width);
    }
    ctx.font = `${fontSize}px monospace`;
    for (const row of section.rows) {
      for (let c = 0; c < row.cells.length; c++) {
        colWidths[c] = Math.max(colWidths[c], ctx.measureText(row.cells[c]).width);
      }
    }
  }

  const tableW = colWidths.reduce((s, w) => s + w + colGap, 0) + padX * 2;

  // Calculate total height including image rows
  let totalH = padY * 2;
  for (const section of sections) {
    totalH += rowH * 2; // section header + column headers
    for (const row of section.rows) {
      totalH += rowH;
      if (row.imageUrl && imageMap.get(row.imageUrl)) {
        totalH += imgMaxH + imgPad * 2;
      }
    }
  }

  // CSS transform: translate(0, -50%)
  const drawX = x;
  const drawY = y - totalH / 2;

  ctx.save();

  // Background
  ctx.beginPath();
  ctx.roundRect(drawX, drawY, tableW, totalH, borderR);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = borderW;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let curY = drawY + padY;

  for (const section of sections) {
    // Section header
    ctx.font = `bold ${headerFontSize}px monospace`;
    ctx.fillStyle = theme.headerColor;
    ctx.fillText(section.header.toUpperCase(), drawX + padX, curY + rowH / 2);
    curY += rowH;

    // Separator
    ctx.strokeStyle = theme.separatorColor;
    ctx.lineWidth = Math.round(scale);
    ctx.beginPath();
    ctx.moveTo(drawX + padX, curY);
    ctx.lineTo(drawX + tableW - padX, curY);
    ctx.stroke();

    // Column header background (light mode)
    if (theme.thBg !== 'transparent') {
      ctx.fillStyle = theme.thBg;
      ctx.fillRect(drawX, curY, tableW, rowH);
    }

    // Column headers
    ctx.font = `bold ${headerFontSize}px monospace`;
    ctx.fillStyle = theme.thColor;
    let colX = drawX + padX;
    for (let c = 0; c < section.columns.length; c++) {
      ctx.fillText(section.columns[c].toUpperCase(), colX, curY + rowH / 2);
      colX += colWidths[c] + colGap;
    }
    curY += rowH;

    // Data rows
    ctx.font = `${fontSize}px monospace`;
    for (const row of section.rows) {
      colX = drawX + padX;
      for (let c = 0; c < row.cells.length; c++) {
        // Severity dot before name
        if (c === 0 && row.severityColor) {
          const dotR = Math.round(3.5 * scale);
          ctx.fillStyle = row.severityColor;
          ctx.beginPath();
          ctx.arc(colX + dotR, curY + rowH / 2, dotR, 0, Math.PI * 2);
          ctx.fill();
          colX += dotR * 2 + Math.round(4 * scale);
        }

        ctx.fillStyle = theme.tdColor;
        ctx.fillText(row.cells[c], colX, curY + rowH / 2);
        colX += colWidths[c] + colGap;
      }
      curY += rowH;

      // Row separator
      ctx.strokeStyle = theme.rowSeparatorColor;
      ctx.lineWidth = Math.round(scale);
      ctx.beginPath();
      ctx.moveTo(drawX + padX, curY);
      ctx.lineTo(drawX + tableW - padX, curY);
      ctx.stroke();

      // Restriction image (if visible and loaded)
      if (row.imageUrl) {
        const img = imageMap.get(row.imageUrl);
        if (img) {
          const aspect = img.naturalWidth / img.naturalHeight;
          let drawW = imgMaxW;
          let drawH = drawW / aspect;
          if (drawH > imgMaxH) {
            drawH = imgMaxH;
            drawW = drawH * aspect;
          }
          const imgX = drawX + padX + imgPad;
          const imgY = curY + imgPad;
          ctx.drawImage(img, imgX, imgY, drawW, drawH);
          curY += imgMaxH + imgPad * 2;
        }
      }
    }
  }

  ctx.restore();
}
