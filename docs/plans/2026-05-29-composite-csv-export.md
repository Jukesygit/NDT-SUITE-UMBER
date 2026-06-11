# Composite CSV Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Download CSV" export option to the C-Scan visualizer that writes the current scan/composite data back out as a regular tab-delimited CSV in the same metadata header format as input files.

**Architecture:** One new utility function in `src/components/CscanVisualizer/utils/csvExport.ts` that serializes `CscanData` to CSV string and triggers download. One new handler + menu item in `CscanVisualizer.tsx`.

**Tech Stack:** TypeScript, existing `CscanData` type, existing `downloadBlob` from `streamedExport.ts`.

---

### Task 1: Create CSV export utility

**Files:**
- Create: `src/components/CscanVisualizer/utils/csvExport.ts`

**Step 1: Write the export function**

```typescript
import { CscanData } from '../types';
import { downloadBlob } from './streamedExport';

export function exportCscanToCsv(data: CscanData): void {
  const lines: string[] = [];

  // Metadata header — match instrument CSV format
  const statsMin = data.stats?.min;
  const statsMax = data.stats?.max;
  if (statsMin !== undefined) lines.push(`Min Thickness (mm)=${statsMin}`);
  if (statsMax !== undefined) lines.push(`Max Thickness (mm)=${statsMax}`);
  lines.push(`IndexStart (mm)=${data.yAxis[0]}`);
  lines.push(`ScanStart (mm)=${data.xAxis[0]}`);

  // Column header: "mm" then X axis values
  lines.push('mm\t' + data.xAxis.map(v => String(v)).join('\t'));

  // Data rows: Y value then thickness values
  for (let row = 0; row < data.height; row++) {
    const yVal = data.yAxis[row];
    const rowData = data.data[row];
    const cells = rowData.map(v => (v === null || v === undefined) ? 'ND' : String(v));
    lines.push(String(yVal) + '\t' + cells.join('\t'));
  }

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

  const filename = data.isComposite
    ? 'composite_cscan.csv'
    : `${data.filename?.replace(/\.[^/.]+$/, '') || 'cscan'}_export.csv`;

  downloadBlob(blob, filename);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run typecheck`
Expected: PASS — no new errors

---

### Task 2: Add CSV export button to export menu

**Files:**
- Modify: `src/components/CscanVisualizer/CscanVisualizer.tsx`

**Step 1: Add import**

Add to the existing imports near `streamedExport`:
```typescript
import { exportCscanToCsv } from './utils/csvExport';
```

**Step 2: Add handler**

Add next to the other export handlers (after `handleExportCleanHeatmap`):
```typescript
const handleExportCsv = useCallback(() => {
  if (!scanData) return;
  exportCscanToCsv(scanData);
  setShowExportMenu(false);
}, [scanData]);
```

**Step 3: Add menu item**

In the export dropdown menu (the `showExportMenu && scanData` block), add a new button after the "Export Heatmap" button. Import `Table` from lucide-react for the icon:
```tsx
<button
  onClick={handleExportCsv}
  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2"
>
  <Table className="w-4 h-4" />
  Export CSV Data
</button>
```

**Step 4: Verify build**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Manual test**

1. Open C-Scan visualizer
2. Load CSV files and create composite
3. Click export menu → "Export CSV Data"
4. Verify downloaded file opens correctly and can be re-imported into the tool

---
