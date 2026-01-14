/**
 * Web Worker for memory-efficient C-scan file processing
 * Handles parsing and composite creation off the main thread
 *
 * Key features:
 * - Chunked/batched processing with GC breaks between batches
 * - TypedArray-based data structures
 * - Streaming composite algorithm (doesn't hold all sources in memory)
 * - Progress reporting with memory usage
 */

import type {
  EfficientCscanData,
  EfficientStats,
  SourceRegion,
  WorkerMessage,
  ProgressMessage,
  ParseCompleteMessage,
  CompositeCompleteMessage,
  ErrorMessage
} from '../utils/efficientTypes';

// Store parsed scans for composite creation
const parsedScans = new Map<string, EfficientCscanData>();

// Generate unique ID
const generateId = () => `cscan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Tolerance for detecting offset mismatch (in mm)
const OFFSET_TOLERANCE = 10;

/**
 * Post a progress message to main thread
 */
function postProgress(type: 'PARSE_PROGRESS' | 'COMPOSITE_PROGRESS', current: number, total: number, message: string): void {
  const memoryUsage = (performance as any).memory?.usedJSHeapSize;
  const msg: ProgressMessage = {
    type,
    payload: { current, total, message, memoryUsage }
  };
  self.postMessage(msg);
}

/**
 * Post an error message
 */
function postError(message: string, filename?: string): void {
  const msg: ErrorMessage = {
    type: 'ERROR',
    payload: { message, filename }
  };
  self.postMessage(msg);
}

/**
 * Allow garbage collection between operations
 */
async function allowGC(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Calculate statistics from TypedArray data
 */
function calculateStats(
  values: Float32Array,
  nullMask: Uint8Array,
  width: number,
  height: number,
  xAxis: Float32Array,
  yAxis: Float32Array
): EfficientStats {
  const totalPoints = width * height;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;

  // Collect valid values for median calculation
  // Use a sampling approach for very large datasets
  const sampleForMedian: number[] = [];
  const sampleRate = totalPoints > 100000 ? Math.ceil(totalPoints / 50000) : 1;

  for (let i = 0; i < totalPoints; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = i % 8;
    const isNullVal = (nullMask[byteIdx] & (1 << bitIdx)) !== 0;

    if (!isNullVal) {
      const val = values[i];
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      validCount++;

      if (validCount % sampleRate === 0) {
        sampleForMedian.push(val);
      }
    }
  }

  const ndCount = totalPoints - validCount;

  if (validCount === 0) {
    return {
      min: 0, max: 0, mean: 0, median: 0, stdDev: 0,
      validPoints: 0, totalPoints, totalArea: 0,
      validArea: 0, ndPercent: 100, ndCount, ndArea: 0
    };
  }

  const mean = sum / validCount;

  // Median from sample
  sampleForMedian.sort((a, b) => a - b);
  const median = sampleForMedian[Math.floor(sampleForMedian.length / 2)] || mean;

  // Calculate variance in second pass
  let varianceSum = 0;
  for (let i = 0; i < totalPoints; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = i % 8;
    const isNullVal = (nullMask[byteIdx] & (1 << bitIdx)) !== 0;

    if (!isNullVal) {
      const diff = values[i] - mean;
      varianceSum += diff * diff;
    }
  }
  const stdDev = Math.sqrt(varianceSum / validCount);

  // Area calculations
  const xSpacing = xAxis.length > 1 ? Math.abs(xAxis[1] - xAxis[0]) : 1.0;
  const ySpacing = yAxis.length > 1 ? Math.abs(yAxis[1] - yAxis[0]) : 1.0;
  const pointArea = xSpacing * ySpacing;

  const totalArea = totalPoints * pointArea;
  const ndArea = ndCount * pointArea;
  const validArea = totalArea - ndArea;
  const ndPercent = (ndCount / totalPoints) * 100;

  return {
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    mean,
    median,
    stdDev,
    validPoints: validCount,
    totalPoints,
    totalArea,
    validArea,
    ndPercent,
    ndCount,
    ndArea
  };
}

/**
 * Parse a single C-scan file from ArrayBuffer to efficient format
 */
function parseSingleFile(buffer: ArrayBuffer, filename: string): EfficientCscanData {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split(/\r?\n/);

  let xAxisArr: number[] = [];
  let yAxisArr: number[] = [];
  const metadata: Record<string, unknown> = {};
  let dataStartIndex = -1;

  // First pass: find metadata and data start marker
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('mm')) {
      dataStartIndex = i;
      break;
    }

    const parts = line.split('=').map(p => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const value = parseFloat(parts[1]);
      metadata[parts[0]] = isNaN(value) ? parts[1] : value;
    }
  }

  // Handle generic format if no 'mm' marker
  if (dataStartIndex === -1) {
    return parseGenericFormat(buffer, filename, lines);
  }

  // Parse X coordinates from header
  // IMPORTANT: Must match original fileParser.ts logic exactly
  const headerLine = lines[dataStartIndex];
  const headerParts = headerLine.split(/[\t,]/);
  xAxisArr = headerParts.slice(1).map(v => {
    const num = parseFloat(v.trim());
    return isNaN(num) ? 0 : num;
  }).filter((_, idx) => !isNaN(headerParts[idx + 1] as unknown as number));

  // Parse data rows - first pass to count rows
  const dataRows: { y: number; values: (number | null)[] }[] = [];

  for (let i = dataStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rowValues = line.split(/[\t,]/);
    const yValue = parseFloat(rowValues[0]);

    if (isNaN(yValue)) continue;

    const rowData = rowValues.slice(1).map(val => {
      const trimmed = val.trim();
      if (trimmed === 'ND' || trimmed === '' || trimmed === '-') {
        return null;
      }
      const num = parseFloat(trimmed);
      return isNaN(num) ? null : num;
    });

    dataRows.push({ y: yValue, values: rowData });
    yAxisArr.push(yValue);
  }

  if (xAxisArr.length === 0 || yAxisArr.length === 0 || dataRows.length === 0) {
    throw new Error('Failed to parse C-Scan data matrix');
  }

  // Convert to efficient format
  const width = xAxisArr.length;
  const height = dataRows.length;
  const totalCells = width * height;

  const values = new Float32Array(totalCells);
  const nullMaskBytes = Math.ceil(totalCells / 8);
  const nullMask = new Uint8Array(nullMaskBytes);

  for (let row = 0; row < height; row++) {
    const rowData = dataRows[row].values;
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const val = rowData[col];

      if (val === null || isNaN(val as number) || !isFinite(val as number)) {
        // Set null bit
        const byteIdx = Math.floor(idx / 8);
        const bitIdx = idx % 8;
        nullMask[byteIdx] |= (1 << bitIdx);
        values[idx] = 0;
      } else {
        values[idx] = val;
      }
    }
  }

  const xAxis = Float32Array.from(xAxisArr);
  const yAxis = Float32Array.from(yAxisArr);
  const stats = calculateStats(values, nullMask, width, height, xAxis, yAxis);

  return {
    id: generateId(),
    filename,
    width,
    height,
    values,
    nullMask,
    xAxis,
    yAxis,
    stats,
    metadata,
    timestamp: Date.now()
  };
}

/**
 * Parse generic format (no metadata header)
 */
function parseGenericFormat(_buffer: ArrayBuffer, filename: string, lines: string[]): EfficientCscanData {
  const nonEmptyLines = lines.filter(line => line.trim());

  if (nonEmptyLines.length === 0) {
    throw new Error('Empty file');
  }

  const firstLine = nonEmptyLines[0];
  const delimiter = firstLine.includes('\t') ? '\t' :
                    firstLine.includes(',') ? ',' : /\s+/;

  const firstRow = firstLine.split(delimiter).map(v =>
    typeof v === 'string' ? v.trim() : String(v)
  );
  const firstCellEmpty = firstRow[0] === '' || firstRow[0] === 'mm';
  const hasAxisLabels = firstCellEmpty || isNaN(parseFloat(firstRow[0]));

  let xAxisArr: number[] = [];
  let yAxisArr: number[] = [];
  const dataRows: (number | null)[][] = [];
  let dataStartRow = 0;

  if (hasAxisLabels) {
    xAxisArr = firstRow.slice(1).map(v => {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    });
    dataStartRow = 1;
  }

  for (let i = dataStartRow; i < nonEmptyLines.length; i++) {
    const rowValues = nonEmptyLines[i].split(delimiter).map(v =>
      typeof v === 'string' ? v.trim() : String(v)
    );

    if (hasAxisLabels && rowValues.length > 0) {
      const yVal = parseFloat(rowValues[0]);
      if (!isNaN(yVal)) {
        yAxisArr.push(yVal);
        dataRows.push(rowValues.slice(1).map(v => {
          const num = parseFloat(v);
          return isNaN(num) ? null : num;
        }));
      }
    } else if (!hasAxisLabels) {
      dataRows.push(rowValues.map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
      }));
    }
  }

  // Generate axes if not present
  if (xAxisArr.length === 0 && dataRows[0]) {
    xAxisArr = Array.from({ length: dataRows[0].length }, (_, i) => i);
  }
  if (yAxisArr.length === 0) {
    yAxisArr = Array.from({ length: dataRows.length }, (_, i) => i);
  }

  // Convert to efficient format
  const width = xAxisArr.length;
  const height = dataRows.length;
  const totalCells = width * height;

  const values = new Float32Array(totalCells);
  const nullMaskBytes = Math.ceil(totalCells / 8);
  const nullMask = new Uint8Array(nullMaskBytes);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const val = dataRows[row]?.[col];

      if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
        const byteIdx = Math.floor(idx / 8);
        const bitIdx = idx % 8;
        nullMask[byteIdx] |= (1 << bitIdx);
        values[idx] = 0;
      } else {
        values[idx] = val;
      }
    }
  }

  const xAxis = Float32Array.from(xAxisArr);
  const yAxis = Float32Array.from(yAxisArr);
  const stats = calculateStats(values, nullMask, width, height, xAxis, yAxis);

  return {
    id: generateId(),
    filename,
    width,
    height,
    values,
    nullMask,
    xAxis,
    yAxis,
    stats,
    metadata: {},
    timestamp: Date.now()
  };
}

/**
 * Parse filename to extract expected Index and Scan ranges
 */
function parseFilenameOffsets(filename: string): {
  indexStart: number | null;
  scanStart: number | null;
} {
  const indexMatch = filename.match(/I-(\d+)-(\d+)/i);
  const scanMatch = filename.match(/S-(\d+)-(\d+)/i);

  return {
    indexStart: indexMatch ? parseInt(indexMatch[1], 10) : null,
    scanStart: scanMatch ? parseInt(scanMatch[1], 10) : null
  };
}

/**
 * Detect if a scan has offset issues
 */
function hasOffsetIssues(scan: EfficientCscanData): boolean {
  const filenameOffsets = parseFilenameOffsets(scan.filename);
  const metadata = scan.metadata || {};

  const expectedIndexStart = (metadata['IndexStart (mm)'] as number) ?? filenameOffsets.indexStart;
  const expectedScanStart = (metadata['ScanStart (mm)'] as number) ?? filenameOffsets.scanStart;

  const actualIndexStart = scan.yAxis.length > 0 ? Math.min(...Array.from(scan.yAxis)) : 0;
  const actualScanStart = scan.xAxis.length > 0 ? Math.min(...Array.from(scan.xAxis)) : 0;

  const indexOffset = expectedIndexStart !== null ? expectedIndexStart - actualIndexStart : 0;
  const scanOffset = expectedScanStart !== null ? expectedScanStart - actualScanStart : 0;

  return Math.abs(indexOffset) > OFFSET_TOLERANCE || Math.abs(scanOffset) > OFFSET_TOLERANCE;
}

/**
 * Process files in batches with memory cleanup
 */
async function processFilesInBatches(
  buffers: ArrayBuffer[],
  filenames: string[],
  batchSize: number
): Promise<{ scans: EfficientCscanData[]; hasOffsetIssues: boolean }> {
  const results: EfficientCscanData[] = [];
  let anyOffsetIssues = false;
  const total = buffers.length;

  for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, total);

    postProgress(
      'PARSE_PROGRESS',
      batchStart,
      total,
      `Processing batch ${Math.floor(batchStart / batchSize) + 1}...`
    );

    // Process batch
    for (let i = batchStart; i < batchEnd; i++) {
      try {
        const scan = parseSingleFile(buffers[i], filenames[i]);

        // Store for potential composite creation
        parsedScans.set(scan.id, scan);
        results.push(scan);

        // Check for offset issues
        if (hasOffsetIssues(scan)) {
          anyOffsetIssues = true;
        }

        postProgress(
          'PARSE_PROGRESS',
          i + 1,
          total,
          `Parsed ${filenames[i]} (${i + 1}/${total})`
        );
      } catch (error) {
        postError(`Failed to parse: ${(error as Error).message}`, filenames[i]);
      }
    }

    // Clear the processed buffers to help GC
    for (let i = batchStart; i < batchEnd; i++) {
      buffers[i] = null as any;
    }

    // Allow GC between batches
    await allowGC();
  }

  return { scans: results, hasOffsetIssues: anyOffsetIssues };
}

/**
 * Create composite using streaming algorithm
 * Processes scans one at a time without holding all in memory
 */
async function createCompositeStreaming(scanIds: string[]): Promise<EfficientCscanData | null> {
  const scans = scanIds.map(id => parsedScans.get(id)).filter(Boolean) as EfficientCscanData[];

  if (scans.length < 2) {
    postError('Need at least 2 scans to create composite');
    return null;
  }

  postProgress('COMPOSITE_PROGRESS', 0, scans.length + 2, 'Calculating grid bounds...');

  // Step 1: Find global extent and minimum spacing
  let gMinX = Infinity, gMaxX = -Infinity;
  let gMinY = Infinity, gMaxY = -Infinity;
  let minSpacing = Infinity;
  const sourceRegions: SourceRegion[] = [];

  for (const scan of scans) {
    const xArr = Array.from(scan.xAxis);
    const yArr = Array.from(scan.yAxis);

    const minX = Math.min(...xArr);
    const maxX = Math.max(...xArr);
    const minY = Math.min(...yArr);
    const maxY = Math.max(...yArr);

    sourceRegions.push({
      filename: scan.filename,
      minX, maxX, minY, maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    });

    if (minX < gMinX) gMinX = minX;
    if (maxX > gMaxX) gMaxX = maxX;
    if (minY < gMinY) gMinY = minY;
    if (maxY > gMaxY) gMaxY = maxY;

    if (scan.xAxis.length > 1) {
      const spacing = Math.abs(scan.xAxis[1] - scan.xAxis[0]);
      if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
    }
    if (scan.yAxis.length > 1) {
      const spacing = Math.abs(scan.yAxis[1] - scan.yAxis[0]);
      if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
    }
  }

  const resolution = minSpacing !== Infinity ? minSpacing : 1.0;
  const gridWidth = Math.ceil((gMaxX - gMinX) / resolution) + 1;
  const gridHeight = Math.ceil((gMaxY - gMinY) / resolution) + 1;
  const totalCells = gridWidth * gridHeight;

  postProgress('COMPOSITE_PROGRESS', 1, scans.length + 2,
    `Allocating ${gridWidth}x${gridHeight} grid (${(totalCells * 8 / 1024 / 1024).toFixed(1)} MB)...`);

  // Step 2: Allocate accumulator grids (streaming approach)
  const compositeGrid = new Float32Array(totalCells);
  const weightGrid = new Float32Array(totalCells);

  await allowGC();

  // Step 3: Accumulate from each scan (streaming - one at a time)
  for (let scanIdx = 0; scanIdx < scans.length; scanIdx++) {
    const scan = scans[scanIdx];

    postProgress('COMPOSITE_PROGRESS', scanIdx + 2, scans.length + 2,
      `Accumulating ${scan.filename} (${scanIdx + 1}/${scans.length})...`);

    const xArr = scan.xAxis;
    const yArr = scan.yAxis;

    for (let row = 0; row < scan.height; row++) {
      for (let col = 0; col < scan.width; col++) {
        const srcIdx = row * scan.width + col;

        // Check if null
        const byteIdx = Math.floor(srcIdx / 8);
        const bitIdx = srcIdx % 8;
        const isNullVal = (scan.nullMask[byteIdx] & (1 << bitIdx)) !== 0;

        if (!isNullVal) {
          const val = scan.values[srcIdx];
          const x = xArr[col];
          const y = yArr[row];

          const gridX = Math.round((x - gMinX) / resolution);
          const gridY = Math.round((y - gMinY) / resolution);

          if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
            const dstIdx = gridY * gridWidth + gridX;
            compositeGrid[dstIdx] += val;
            weightGrid[dstIdx] += 1;
          }
        }
      }
    }

    // Allow GC after processing each scan
    await allowGC();
  }

  // Step 4: Finalize - compute weighted averages and create result
  postProgress('COMPOSITE_PROGRESS', scans.length + 1, scans.length + 2, 'Finalizing composite...');

  const resultValues = new Float32Array(totalCells);
  const resultNullMask = new Uint8Array(Math.ceil(totalCells / 8));

  // First pass: compute weighted averages
  for (let i = 0; i < totalCells; i++) {
    if (weightGrid[i] > 0) {
      resultValues[i] = compositeGrid[i] / weightGrid[i];
    }
  }

  // Second pass: fill ONLY thin line gaps caused by aliasing
  // Only fill if the cell has valid data on OPPOSITE sides (indicating a 1-pixel gap)
  // This preserves legitimate holes in the data
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const idx = row * gridWidth + col;

      if (weightGrid[idx] === 0) {
        // Check for valid data on opposite sides
        const topIdx = row > 0 ? (row - 1) * gridWidth + col : -1;
        const bottomIdx = row < gridHeight - 1 ? (row + 1) * gridWidth + col : -1;
        const leftIdx = col > 0 ? row * gridWidth + (col - 1) : -1;
        const rightIdx = col < gridWidth - 1 ? row * gridWidth + (col + 1) : -1;

        const hasTop = topIdx >= 0 && weightGrid[topIdx] > 0;
        const hasBottom = bottomIdx >= 0 && weightGrid[bottomIdx] > 0;
        const hasLeft = leftIdx >= 0 && weightGrid[leftIdx] > 0;
        const hasRight = rightIdx >= 0 && weightGrid[rightIdx] > 0;

        // Only fill if we have data on OPPOSITE sides (horizontal OR vertical gap)
        // This indicates a thin 1-pixel aliasing gap, not a legitimate hole
        const isHorizontalGap = hasLeft && hasRight;
        const isVerticalGap = hasTop && hasBottom;

        if (isHorizontalGap || isVerticalGap) {
          let sum = 0;
          let count = 0;

          if (hasTop) { sum += resultValues[topIdx]; count++; }
          if (hasBottom) { sum += resultValues[bottomIdx]; count++; }
          if (hasLeft) { sum += resultValues[leftIdx]; count++; }
          if (hasRight) { sum += resultValues[rightIdx]; count++; }

          resultValues[idx] = sum / count;
          weightGrid[idx] = 1; // Mark as filled
        }
      }
    }
  }

  // Third pass: mark remaining empty cells as null
  for (let i = 0; i < totalCells; i++) {
    if (weightGrid[i] === 0) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      resultNullMask[byteIdx] |= (1 << bitIdx);
    }
  }

  // Create axis arrays
  const xAxis = new Float32Array(gridWidth);
  const yAxis = new Float32Array(gridHeight);
  for (let i = 0; i < gridWidth; i++) {
    xAxis[i] = gMinX + i * resolution;
  }
  for (let i = 0; i < gridHeight; i++) {
    yAxis[i] = gMinY + i * resolution;
  }

  const stats = calculateStats(resultValues, resultNullMask, gridWidth, gridHeight, xAxis, yAxis);

  const composite: EfficientCscanData = {
    id: generateId(),
    filename: `Composite_${scans.length}_files`,
    width: gridWidth,
    height: gridHeight,
    values: resultValues,
    nullMask: resultNullMask,
    xAxis,
    yAxis,
    stats,
    metadata: {
      Type: 'Composite',
      'Source Files': scans.length,
      sourceFileNames: scans.map(s => s.filename),
      compositeType: 'weighted_average',
      gridResolution: resolution
    },
    isComposite: true,
    sourceRegions,
    timestamp: Date.now()
  };

  // Store composite for potential further operations
  parsedScans.set(composite.id, composite);

  postProgress('COMPOSITE_PROGRESS', scans.length + 2, scans.length + 2, 'Composite complete!');

  return composite;
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'PARSE_FILES': {
        const { files, filenames, batchSize } = payload as {
          files: ArrayBuffer[];
          filenames: string[];
          batchSize: number;
        };

        const result = await processFilesInBatches(files, filenames, batchSize);

        const response: ParseCompleteMessage = {
          type: 'PARSE_COMPLETE',
          payload: {
            scans: result.scans,
            hasOffsetIssues: result.hasOffsetIssues
          }
        };
        self.postMessage(response);
        break;
      }

      case 'CREATE_COMPOSITE': {
        const { scanIds } = payload as { scanIds: string[] };
        const composite = await createCompositeStreaming(scanIds);

        if (composite) {
          const response: CompositeCompleteMessage = {
            type: 'COMPOSITE_COMPLETE',
            payload: { composite }
          };
          self.postMessage(response);
        }
        break;
      }

      case 'CREATE_COMPOSITE_FROM_DATA': {
        // Create composite directly from scan data passed from main thread
        // This is used when scans have been repaired and cache is stale
        const { scans } = payload as {
          scans: Array<{
            id: string;
            filename: string;
            width: number;
            height: number;
            data: (number | null)[][];
            xAxis: number[];
            yAxis: number[];
          }>;
        };

        if (scans.length < 2) {
          postError('Need at least 2 scans to create composite');
          break;
        }

        // Convert to efficient format and create composite
        const efficientScans: EfficientCscanData[] = [];

        for (let i = 0; i < scans.length; i++) {
          const scan = scans[i];
          postProgress('COMPOSITE_PROGRESS', i, scans.length + 2, `Converting ${scan.filename}...`);

          const totalCells = scan.width * scan.height;
          const values = new Float32Array(totalCells);
          const nullMaskBytes = Math.ceil(totalCells / 8);
          const nullMask = new Uint8Array(nullMaskBytes);

          for (let row = 0; row < scan.height; row++) {
            for (let col = 0; col < scan.width; col++) {
              const idx = row * scan.width + col;
              const val = scan.data[row]?.[col];

              if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
                const byteIdx = Math.floor(idx / 8);
                const bitIdx = idx % 8;
                nullMask[byteIdx] |= (1 << bitIdx);
                values[idx] = 0;
              } else {
                values[idx] = val;
              }
            }
          }

          efficientScans.push({
            id: scan.id,
            filename: scan.filename,
            width: scan.width,
            height: scan.height,
            values,
            nullMask,
            xAxis: Float32Array.from(scan.xAxis),
            yAxis: Float32Array.from(scan.yAxis),
            stats: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0, validPoints: 0, totalPoints: totalCells, totalArea: 0, validArea: 0, ndPercent: 0, ndCount: 0, ndArea: 0 },
            timestamp: Date.now()
          });

          // Allow GC
          await allowGC();
        }

        // Now run the streaming composite on these scans
        // Store temporarily in parsedScans for the composite function
        parsedScans.clear();
        efficientScans.forEach(s => parsedScans.set(s.id, s));

        const composite = await createCompositeStreaming(efficientScans.map(s => s.id));

        if (composite) {
          const response: CompositeCompleteMessage = {
            type: 'COMPOSITE_COMPLETE',
            payload: { composite }
          };
          self.postMessage(response);
        }
        break;
      }

      case 'CLEAR_CACHE': {
        parsedScans.clear();
        self.postMessage({ type: 'CACHE_CLEARED' });
        break;
      }

      default:
        postError(`Unknown message type: ${type}`);
    }
  } catch (error) {
    postError((error as Error).message);
  }
};

// Signal ready
self.postMessage({ type: 'READY' });
