import type { CscanData } from '../types';
import { downloadBlob } from './streamedExport';

function formatValue(value: number | null): string {
  if (value === null || value === undefined || isNaN(value)) return 'ND';
  return String(value);
}

export function serializeCscanToCsv(scan: CscanData): string {
  const TAB = '\t';

  const minThickness = scan.stats?.min ?? 0;
  const maxThickness = scan.stats?.max ?? 0;
  const indexStart = scan.yAxis[0] ?? 0;
  const scanStart = scan.xAxis[0] ?? 0;

  const lines: string[] = [
    `Min Thickness (mm)=${minThickness}`,
    `Max Thickness (mm)=${maxThickness}`,
    `IndexStart (mm)=${indexStart}`,
    `ScanStart (mm)=${scanStart}`,
    `mm${TAB}${scan.xAxis.join(TAB)}`,
  ];

  for (let row = 0; row < scan.data.length; row++) {
    const yLabel = scan.yAxis[row] ?? row;
    const cells = scan.data[row].map(formatValue);
    lines.push(`${yLabel}${TAB}${cells.join(TAB)}`);
  }

  return lines.join('\n') + '\n';
}

export function exportCscanAsCsv(scan: CscanData): void {
  const csv = serializeCscanToCsv(scan);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });

  const filename = scan.isComposite
    ? 'composite_cscan.csv'
    : `${scan.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_export.csv`;

  downloadBlob(blob, filename);
}
