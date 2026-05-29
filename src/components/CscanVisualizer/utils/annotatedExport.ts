import type { CscanData, CscanStats, DisplaySettings, DistributionBin, DistributionConfig, DistributionResult } from '../types';
import { autoBoundaries } from './distributionEngine';
import { getColorscale, interpolateColor } from '../../../utils/colorscales';

const METRIC_HEIGHT = 86;
const METRIC_GAP = 14;
const TABLE_ROW_HEIGHT = 46;
const TABLE_HEADER_HEIGHT = 34;
const DISTRIBUTION_MAX_ROWS = 8;

interface AnnotatedExportOptions {
  data: CscanData;
  displaySettings: DisplaySettings;
  distributionConfig: DistributionConfig;
  plotDataUrl: string;
  notes: string;
}

interface EffectiveRange {
  min: number;
  max: number;
  rawMin?: number;
  rawMax?: number;
  clipped: boolean;
}

interface InspectionStats extends CscanStats {
  excludedInvalidPoints: number;
  excludedInvalidArea: number;
}

interface ExportPalette {
  page: string;
  panel: string;
  divider: string;
  metric: string;
  metricAlt: string;
  notes: string;
  text: string;
  muted: string;
  subtle: string;
  border: string;
  positive: string;
}

function getExportPalette(whiteBackground: boolean): ExportPalette {
  return whiteBackground
    ? {
        page: '#f8fafc',
        panel: '#f1f5f9',
        divider: '#cbd5e1',
        metric: '#e2e8f0',
        metricAlt: '#eef2f7',
        notes: '#fbfcfd',
        text: '#111827',
        muted: 'rgba(17,24,39,0.62)',
        subtle: 'rgba(17,24,39,0.46)',
        border: 'rgba(17,24,39,0.12)',
        positive: '#047857',
      }
    : {
        page: '#111827',
        panel: '#151a22',
        divider: '#0b0f15',
        metric: '#111827',
        metricAlt: '#101722',
        notes: '#0f141b',
        text: '#f5f4f2',
        muted: 'rgba(255,255,255,0.58)',
        subtle: 'rgba(255,255,255,0.42)',
        border: 'rgba(255,255,255,0.08)',
        positive: '#35a058',
      };
}

function getEffectiveRange(data: CscanData, displaySettings: DisplaySettings): EffectiveRange {
  const rawMin = data.stats?.min;
  const rawMax = data.stats?.max;
  const min = Math.max(0, displaySettings.range.min ?? rawMin ?? 0);
  const max = displaySettings.range.max ?? rawMax ?? 1;
  const clipped = (
    (rawMin !== undefined && min > rawMin) ||
    (rawMax !== undefined && max < rawMax)
  );

  return { min, max, rawMin, rawMax, clipped };
}

function getCellAreaMm2(data: CscanData): number {
  const xSpacing = data.xAxis.length > 1 ? Math.abs(data.xAxis[1] - data.xAxis[0]) : 1.0;
  const ySpacing = data.yAxis.length > 1 ? Math.abs(data.yAxis[1] - data.yAxis[0]) : 1.0;
  return xSpacing * ySpacing;
}

function getBoundaryRange(boundaries: number[]): { min: number; max: number } {
  const sorted = [...boundaries].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function isValidBinnedThickness(
  value: number | null,
  boundaries: number[],
): value is number {
  const boundaryRange = getBoundaryRange(boundaries);
  return value !== null
    && Number.isFinite(value)
    && value >= boundaryRange.min
    && value <= boundaryRange.max;
}

function computeInspectionStats(data: CscanData, boundaries: number[]): InspectionStats {
  const values: number[] = [];
  let excludedInvalidPoints = 0;
  const totalPoints = data.width * data.height;
  const cellAreaMm2 = getCellAreaMm2(data);

  for (const row of data.data) {
    for (const value of row) {
      if (isValidBinnedThickness(value, boundaries)) {
        values.push(value);
      } else if (value !== null && Number.isFinite(value)) {
        excludedInvalidPoints += 1;
      }
    }
  }

  const validPoints = values.length;
  const ndCount = totalPoints - validPoints;
  const totalArea = totalPoints * cellAreaMm2;
  const validArea = validPoints * cellAreaMm2;
  const ndArea = ndCount * cellAreaMm2;
  const ndPercent = totalPoints > 0 ? (ndCount / totalPoints) * 100 : 100;
  const excludedInvalidArea = excludedInvalidPoints * cellAreaMm2;

  if (validPoints === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      validPoints: 0,
      totalPoints,
      totalArea,
      validArea: 0,
      ndPercent,
      ndCount,
      ndArea,
      excludedInvalidPoints,
      excludedInvalidArea,
    };
  }

  values.sort((a, b) => a - b);
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / validPoints;
  const variance = values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / validPoints;

  return {
    min: values[0],
    max: values[values.length - 1],
    mean,
    median: values[Math.floor(values.length / 2)],
    stdDev: Math.sqrt(variance),
    validPoints,
    totalPoints,
    totalArea,
    validArea,
    ndPercent,
    ndCount,
    ndArea,
    excludedInvalidPoints,
    excludedInvalidArea,
  };
}

function computeInspectionDistribution(
  data: CscanData,
  boundaries: number[],
): DistributionResult | null {
  if (boundaries.length < 2) return null;

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
  const boundaryRange = getBoundaryRange(sortedBoundaries);
  const bins: DistributionBin[] = Array.from({ length: sortedBoundaries.length - 1 }, (_, index) => ({
    min: sortedBoundaries[index],
    max: sortedBoundaries[index + 1],
    area: 0,
    areaPercent: 0,
    count: 0,
  }));

  const cellAreaM2 = getCellAreaMm2(data) / 1e6;
  let measuredArea = 0;
  let measuredPoints = 0;

  for (const row of data.data) {
    for (const value of row) {
      if (value === null || !Number.isFinite(value)) continue;

      measuredArea += cellAreaM2;
      measuredPoints += 1;

      if (value < boundaryRange.min || value > boundaryRange.max) continue;

      for (let index = 0; index < bins.length; index += 1) {
        const bin = bins[index];
        const inBin = index === bins.length - 1
          ? value >= bin.min && value <= bin.max
          : value >= bin.min && value < bin.max;

        if (inBin) {
          bin.area += cellAreaM2;
          bin.count += 1;
          break;
        }
      }
    }
  }

  if (measuredPoints === 0) return null;

  for (const bin of bins) {
    bin.areaPercent = measuredArea > 0 ? (bin.area / measuredArea) * 100 : 0;
  }

  return {
    bins,
    totalArea: measuredArea,
    totalPoints: measuredPoints,
    mode: 'thickness',
    unit: 'mm',
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load graph image'));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode annotated image'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatNumber(value: number | undefined, decimals = 2): string {
  if (value === undefined || Number.isNaN(value)) return 'N/A';
  return value.toFixed(decimals);
}

function formatCount(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return '0';
  return value.toLocaleString();
}

function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return y;

  let line = '';
  let lineCount = 0;
  let cursorY = y;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        ctx.fillText(`${line.replace(/\s+$/, '')}...`, x, cursorY);
        return cursorY + lineHeight;
      }
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = candidate;
    }
  }

  if (line) {
    ctx.fillText(line, x, cursorY);
    cursorY += lineHeight;
  }

  return cursorY;
}

function drawMetric(
  ctx: CanvasRenderingContext2D,
  palette: ExportPalette,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  ctx.fillStyle = palette.metric;
  drawRoundRect(ctx, x, y, width, METRIC_HEIGHT, 6);
  ctx.fillStyle = palette.subtle;
  ctx.font = '700 18px JetBrains Mono, Consolas, monospace';
  ctx.fillText(label.toUpperCase(), x + 18, y + 30);
  ctx.fillStyle = palette.text;
  ctx.font = '700 34px JetBrains Mono, Consolas, monospace';
  ctx.fillText(value, x + 18, y + 67);
}

function sampleBinColor(
  bin: { min: number; max: number },
  dataMin: number,
  dataMax: number,
  colorScale: string,
  reverseScale: boolean,
  mode: 'thickness' | 'wallLoss',
  nominalThickness: number,
): string {
  const mid = (bin.min + bin.max) / 2;
  const thicknessMid = mode === 'wallLoss'
    ? nominalThickness * (1 - mid / 100)
    : mid;
  const range = dataMax - dataMin;
  const t = range > 0 ? (thicknessMid - dataMin) / range : 0.5;
  const scale = getColorscale(colorScale);
  const [r, g, b] = interpolateColor(Math.max(0, Math.min(1, t)), scale, reverseScale);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function drawDistributionTable(
  ctx: CanvasRenderingContext2D,
  result: DistributionResult,
  options: AnnotatedExportOptions,
  palette: ExportPalette,
  x: number,
  y: number,
  width: number,
): void {
  const { data, displaySettings, distributionConfig } = options;
  const displayMin = displaySettings.range.min ?? data.stats?.min ?? 0;
  const displayMax = displaySettings.range.max ?? data.stats?.max ?? 100;
  const tableWidth = Math.min(width, 1080);
  const rangeX = x + 26;
  const areaX = x + tableWidth - 390;
  const pctX = x + tableWidth - 230;
  const pointsX = x + tableWidth - 104;

  ctx.fillStyle = palette.subtle;
  ctx.font = '700 22px JetBrains Mono, Consolas, monospace';
  ctx.fillText('RANGE', rangeX, y);
  ctx.fillText('AREA', areaX, y);
  ctx.fillText('%', pctX, y);
  ctx.fillText('POINTS', pointsX, y);

  const maxRows = Math.min(result.bins.length, DISTRIBUTION_MAX_ROWS);
  for (let i = 0; i < maxRows; i += 1) {
    const bin = result.bins[i];
    const rowTop = y + TABLE_HEADER_HEIGHT + i * TABLE_ROW_HEIGHT;
    const rowTextY = rowTop + 31;
    ctx.fillStyle = i % 2 === 0 ? palette.metric : palette.metricAlt;
    drawRoundRect(ctx, x, rowTop, tableWidth, TABLE_ROW_HEIGHT - 5, 5);

    ctx.fillStyle = sampleBinColor(
      bin,
      displayMin,
      displayMax,
      displaySettings.colorScale,
      displaySettings.reverseScale,
      distributionConfig.mode,
      distributionConfig.nominalThickness,
    );
    drawRoundRect(ctx, x + 10, rowTop + 13, 14, 14, 3);

    const rangeLabel = `${formatNumber(bin.min, 1)}-${formatNumber(bin.max, 1)} ${result.unit}`;

    ctx.fillStyle = palette.muted;
    ctx.font = '28px JetBrains Mono, Consolas, monospace';
    ctx.fillText(rangeLabel, rangeX, rowTextY);
    ctx.fillText(`${formatArea(bin.area)} m2`, areaX, rowTextY);
    ctx.fillStyle = palette.positive;
    ctx.fillText(`${formatPct(bin.areaPercent)}%`, pctX, rowTextY);
    ctx.fillStyle = palette.muted;
    ctx.fillText(formatCount(bin.count), pointsX, rowTextY);
  }

  if (result.bins.length > maxRows) {
    ctx.fillStyle = palette.subtle;
    ctx.font = '22px JetBrains Mono, Consolas, monospace';
    ctx.fillText(`+ ${result.bins.length - maxRows} more bins`, rangeX, y + TABLE_HEADER_HEIGHT + maxRows * TABLE_ROW_HEIGHT + 30);
  }

  const excludedArea = Math.max(0, result.totalArea - result.bins.reduce((sum, bin) => sum + bin.area, 0));
  const excludedPoints = Math.max(0, result.totalPoints - result.bins.reduce((sum, bin) => sum + bin.count, 0));
  if (excludedPoints > 0) {
    const moreRowsNotice = result.bins.length > maxRows ? 1 : 0;
    const rowTop = y + TABLE_HEADER_HEIGHT + (maxRows + moreRowsNotice) * TABLE_ROW_HEIGHT + 8;
    const rowTextY = rowTop + 31;
    ctx.fillStyle = palette.notes;
    drawRoundRect(ctx, x, rowTop, tableWidth, TABLE_ROW_HEIGHT - 5, 5);
    ctx.fillStyle = palette.subtle;
    drawRoundRect(ctx, x + 10, rowTop + 13, 14, 14, 3);
    ctx.fillStyle = palette.muted;
    ctx.font = '28px JetBrains Mono, Consolas, monospace';
    ctx.fillText('Spurious data', rangeX, rowTextY);
    ctx.fillText(`${formatArea(excludedArea)} m2`, areaX, rowTextY);
    ctx.fillText(`${formatPct(result.totalArea > 0 ? (excludedArea / result.totalArea) * 100 : 0)}%`, pctX, rowTextY);
    ctx.fillText(formatCount(excludedPoints), pointsX, rowTextY);
  }
}

export async function exportAnnotatedScanImage(options: AnnotatedExportOptions): Promise<void> {
  const { data, displaySettings, distributionConfig, notes, plotDataUrl } = options;
  const palette = getExportPalette(displaySettings.whiteBackground);
  const effectiveRange = getEffectiveRange(data, displaySettings);
  const rangeBoundaries = distributionConfig.mode === 'thickness' && distributionConfig.customBoundaries
    ? distributionConfig.customBoundaries
    : autoBoundaries(effectiveRange.min, effectiveRange.max, distributionConfig.binCount);
  const thicknessDistributionConfig: DistributionConfig = {
    ...distributionConfig,
    enabled: true,
    mode: 'thickness',
    customBoundaries: rangeBoundaries,
  };
  const inspectionStats = computeInspectionStats(data, rangeBoundaries);
  const distribution = computeInspectionDistribution(data, rangeBoundaries);
  const distributionOptions: AnnotatedExportOptions = {
    ...options,
    distributionConfig: thicknessDistributionConfig,
  };
  const plotImage = await loadImage(plotDataUrl);
  const graphWidth = plotImage.naturalWidth || plotImage.width;
  const graphHeight = plotImage.naturalHeight || plotImage.height;
  const visibleDistributionRows = distribution ? Math.min(distribution.bins.length, DISTRIBUTION_MAX_ROWS) : 0;
  const excludedDistributionRows = inspectionStats.excludedInvalidPoints > 0 ? 1 : 0;
  const distributionTableHeight = distribution
    ? TABLE_HEADER_HEIGHT
      + (visibleDistributionRows + excludedDistributionRows) * TABLE_ROW_HEIGHT
      + (distribution.bins.length > visibleDistributionRows ? 32 : 0)
    : 72;
  const metricBlockHeight = 3 * METRIC_HEIGHT + 2 * METRIC_GAP + (effectiveRange.clipped || inspectionStats.excludedInvalidPoints > 0 ? 64 : 0);
  const detailBlockHeight = Math.max(metricBlockHeight, distributionTableHeight + 30, 300);
  const panelHeaderHeight = 78;
  const panelHeight = panelHeaderHeight + detailBlockHeight + 36;
  const canvas = document.createElement('canvas');
  canvas.width = graphWidth;
  canvas.height = graphHeight + panelHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  ctx.fillStyle = palette.page;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(plotImage, 0, 0, graphWidth, graphHeight);

  const panelY = graphHeight;
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, panelY, graphWidth, panelHeight);
  ctx.fillStyle = palette.divider;
  ctx.fillRect(0, panelY, graphWidth, 2);

  const pad = Math.max(32, Math.round(graphWidth * 0.012));
  const gap = Math.max(28, Math.round(graphWidth * 0.009));
  const contentWidth = graphWidth - pad * 2;
  let summaryWidth = Math.min(1040, Math.max(760, Math.round(contentWidth * 0.27)));
  let notesWidth = Math.min(1180, Math.max(760, Math.round(contentWidth * 0.3)));
  let distributionWidth = contentWidth - summaryWidth - notesWidth - gap * 2;
  if (distributionWidth < 720) {
    summaryWidth = Math.floor((contentWidth - gap * 2) * 0.31);
    distributionWidth = Math.floor((contentWidth - gap * 2) * 0.38);
    notesWidth = contentWidth - summaryWidth - distributionWidth - gap * 2;
  }
  const summaryX = pad;
  const distributionX = summaryX + summaryWidth + gap;
  const notesX = distributionX + distributionWidth + gap;
  const sectionTop = panelY + panelHeaderHeight;

  ctx.fillStyle = palette.text;
  ctx.font = '700 20px Barlow, system-ui, sans-serif';
  ctx.fillText('Thickness Summary', pad, panelY + 36);
  ctx.fillStyle = palette.muted;
  ctx.font = '13px Barlow, system-ui, sans-serif';
  ctx.fillText(data.filename || 'C-scan', pad, panelY + 58);

  ctx.fillStyle = palette.text;
  ctx.font = '700 16px Barlow, system-ui, sans-serif';
  ctx.fillText('Scan Stats', summaryX, sectionTop + 18);
  const metricY = sectionTop + 34;
  const metricWidth = Math.floor((summaryWidth - 10) / 2);
  drawMetric(ctx, palette, summaryX, metricY, metricWidth, 'Mean', `${formatNumber(inspectionStats.mean)} mm`);
  drawMetric(ctx, palette, summaryX + metricWidth + 10, metricY, metricWidth, 'Median', `${formatNumber(inspectionStats.median)} mm`);
  drawMetric(ctx, palette, summaryX, metricY + METRIC_HEIGHT + METRIC_GAP, metricWidth, 'Valid Area', `${formatNumber(inspectionStats.validArea / 1e6, 4)} m2`);
  drawMetric(ctx, palette, summaryX + metricWidth + 10, metricY + METRIC_HEIGHT + METRIC_GAP, metricWidth, 'Points', formatCount(inspectionStats.validPoints));
  drawMetric(ctx, palette, summaryX, metricY + (METRIC_HEIGHT + METRIC_GAP) * 2, metricWidth, 'Not Used', `${formatNumber(inspectionStats.ndPercent, 1)} %`);
  drawMetric(ctx, palette, summaryX + metricWidth + 10, metricY + (METRIC_HEIGHT + METRIC_GAP) * 2, metricWidth, 'Spurious', formatCount(inspectionStats.excludedInvalidPoints));

  if (effectiveRange.clipped || inspectionStats.excludedInvalidPoints > 0) {
    ctx.fillStyle = palette.subtle;
    ctx.font = '20px Barlow, system-ui, sans-serif';
    ctx.fillText(
      `Bin span: ${formatNumber(rangeBoundaries[0], 3)}-${formatNumber(rangeBoundaries[rangeBoundaries.length - 1], 3)} mm. Spurious readings: ${formatCount(inspectionStats.excludedInvalidPoints)}.`,
      summaryX,
      metricY + (METRIC_HEIGHT + METRIC_GAP) * 3 + 22,
    );
  }

  ctx.fillStyle = palette.text;
  ctx.font = '700 16px Barlow, system-ui, sans-serif';
  ctx.fillText('Thickness Distribution', distributionX, sectionTop + 18);
  if (distribution) {
    drawDistributionTable(ctx, distribution, distributionOptions, palette, distributionX, sectionTop + 44, distributionWidth);
  } else {
    ctx.fillStyle = palette.subtle;
    ctx.font = '14px Barlow, system-ui, sans-serif';
    ctx.fillText('No valid thickness distribution available.', distributionX, sectionTop + 48);
  }

  ctx.fillStyle = palette.text;
  ctx.font = '700 16px Barlow, system-ui, sans-serif';
  ctx.fillText('Scan Notes', notesX, sectionTop + 18);
  ctx.fillStyle = palette.notes;
  drawRoundRect(ctx, notesX, sectionTop + 34, notesWidth, detailBlockHeight - 4, 8);
  ctx.fillStyle = notes.trim() ? palette.text : palette.subtle;
  ctx.font = '28px Barlow, system-ui, sans-serif';
  drawWrappedText(
    ctx,
    notes.trim() || 'No notes entered.',
    notesX + 18,
    sectionTop + 66,
    notesWidth - 36,
    38,
    Math.max(4, Math.floor((detailBlockHeight - 80) / 38)),
  );

  const blob = await canvasToBlob(canvas);
  const baseName = data.isComposite
    ? 'composite_cscan'
    : data.filename?.replace(/\.[^/.]+$/, '') || 'cscan';
  downloadBlob(blob, `${baseName}_annotated.png`);
}
