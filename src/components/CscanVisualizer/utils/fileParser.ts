import { CscanData, CscanStats, SourceRegion, OffsetDetection } from '../types';

// Generate unique ID for files
const generateId = () => `cscan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Calculate statistics from data with area metrics
const calculateStats = (
  data: (number | null)[][],
  xCoords?: number[],
  yCoords?: number[]
): CscanStats => {
  const flatData: number[] = [];
  let totalPoints = 0;
  let ndCount = 0;

  for (const row of data) {
    for (const value of row) {
      totalPoints++;
      if (value !== null && !isNaN(value) && isFinite(value)) {
        flatData.push(value);
      } else {
        ndCount++;
      }
    }
  }

  const validPoints = flatData.length;

  if (validPoints === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      validPoints: 0,
      totalPoints,
      totalArea: 0,
      validArea: 0,
      ndPercent: 100,
      ndCount,
      ndArea: 0
    };
  }

  // Sort for median calculation
  const sorted = flatData.slice().sort((a, b) => a - b);

  // Calculate min, max, sum in single pass
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const value of flatData) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  const mean = sum / validPoints;
  const median = sorted[Math.floor(sorted.length / 2)];

  // Calculate variance
  let varianceSum = 0;
  for (const value of flatData) {
    varianceSum += Math.pow(value - mean, 2);
  }
  const stdDev = Math.sqrt(varianceSum / validPoints);

  // Calculate area metrics using point spacing
  const xSpacing = xCoords && xCoords.length > 1
    ? Math.abs(xCoords[1] - xCoords[0])
    : 1.0;
  const ySpacing = yCoords && yCoords.length > 1
    ? Math.abs(yCoords[1] - yCoords[0])
    : 1.0;
  const pointArea = xSpacing * ySpacing; // Area per data point in mm²

  const totalArea = totalPoints * pointArea;
  const ndArea = ndCount * pointArea;
  const validArea = totalArea - ndArea;
  const ndPercent = (ndCount / totalPoints) * 100;

  return {
    min,
    max,
    mean,
    median,
    stdDev,
    validPoints,
    totalPoints,
    totalArea,
    validArea,
    ndPercent,
    ndCount,
    ndArea
  };
};

// Parse C-scan file content - handles metadata header format
export const parseCscanFile = async (file: File): Promise<CscanData> => {
  const text = await file.text();
  const lines = text.split(/\r?\n/);

  let xAxis: number[] = [];
  const yAxis: number[] = [];
  const data: (number | null)[][] = [];
  const metadata: Record<string, any> = {};
  let dataStartIndex = -1;

  // First pass: find metadata and data start marker
  // C-Scan files have metadata as key=value pairs, then a line starting with "mm" marks data start
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for data start marker (line starting with "mm")
    if (line.startsWith('mm')) {
      dataStartIndex = i;
      break;
    }

    // Parse metadata as key=value pairs
    const parts = line.split('=').map(p => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const value = parseFloat(parts[1]);
      metadata[parts[0]] = isNaN(value) ? parts[1] : value;
    }
  }

  // If no "mm" marker found, try generic parsing
  if (dataStartIndex === -1) {
    return parseGenericFormat(file, text, lines);
  }

  // Parse X coordinates from the data header line (first row after marker)
  const headerLine = lines[dataStartIndex];
  const headerParts = headerLine.split(/[\t,]/);
  xAxis = headerParts.slice(1).map(v => {
    const num = parseFloat(v.trim());
    return isNaN(num) ? 0 : num;
  }).filter((_, idx) => !isNaN(headerParts[idx + 1] as any));

  // Parse data rows
  for (let i = dataStartIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rowValues = line.split(/[\t,]/);
    const yValue = parseFloat(rowValues[0]);

    if (isNaN(yValue)) continue;

    yAxis.push(yValue);

    // Parse thickness values, treating "ND" or empty as null
    const rowData = rowValues.slice(1).map(val => {
      const trimmed = val.trim();
      if (trimmed === 'ND' || trimmed === '' || trimmed === '-') {
        return null;
      }
      const num = parseFloat(trimmed);
      return isNaN(num) ? null : num;
    });

    data.push(rowData);
  }

  // Validate parsed data
  if (xAxis.length === 0 || yAxis.length === 0 || data.length === 0) {
    throw new Error('Failed to parse C-Scan data matrix');
  }

  // Calculate statistics with coordinate info for area metrics
  const stats = calculateStats(data, xAxis, yAxis);

  return {
    id: generateId(),
    filename: file.name,
    width: xAxis.length,
    height: yAxis.length,
    data,
    xAxis,
    yAxis,
    stats,
    metadata,
    validPoints: stats.validPoints,
    timestamp: new Date()
  };
};

// Fallback parser for generic formats without metadata header
const parseGenericFormat = async (
  file: File,
  _text: string,
  lines: string[]
): Promise<CscanData> => {
  void _text; // Reserved for future use
  let xAxis: number[] = [];
  let yAxis: number[] = [];
  const data: (number | null)[][] = [];
  const metadata: Record<string, any> = {};

  // Filter empty lines
  const nonEmptyLines = lines.filter(line => line.trim());

  if (nonEmptyLines.length === 0) {
    throw new Error('Empty file');
  }

  // Detect delimiter
  const firstLine = nonEmptyLines[0];
  const delimiter = firstLine.includes('\t') ? '\t' :
                    firstLine.includes(',') ? ',' : /\s+/;

  // Check if first row contains axis labels
  const firstRow = firstLine.split(delimiter).map(v =>
    typeof v === 'string' ? v.trim() : v
  );
  const firstCellEmpty = firstRow[0] === '' || firstRow[0] === 'mm';
  const hasAxisLabels = firstCellEmpty || isNaN(parseFloat(firstRow[0]));

  let dataStartRow = 0;

  if (hasAxisLabels) {
    // First row is X axis
    xAxis = firstRow.slice(1).map(v => {
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    });
    dataStartRow = 1;
  }

  // Parse data rows
  for (let i = dataStartRow; i < nonEmptyLines.length; i++) {
    const values = nonEmptyLines[i].split(delimiter).map(v =>
      typeof v === 'string' ? v.trim() : v
    );

    if (hasAxisLabels && values.length > 0) {
      const yVal = parseFloat(values[0]);
      if (!isNaN(yVal)) {
        yAxis.push(yVal);
        data.push(values.slice(1).map(v => {
          const num = parseFloat(v);
          return isNaN(num) ? null : num;
        }));
      }
    } else if (!hasAxisLabels) {
      data.push(values.map(v => {
        const num = parseFloat(v);
        return isNaN(num) ? null : num;
      }));
    }
  }

  // Generate axes if not present
  if (xAxis.length === 0 && data[0]) {
    xAxis = Array.from({ length: data[0].length }, (_, i) => i);
  }
  if (yAxis.length === 0) {
    yAxis = Array.from({ length: data.length }, (_, i) => i);
  }

  const stats = calculateStats(data, xAxis, yAxis);

  return {
    id: generateId(),
    filename: file.name,
    width: xAxis.length,
    height: yAxis.length,
    data,
    xAxis,
    yAxis,
    stats,
    metadata,
    validPoints: stats.validPoints,
    timestamp: new Date()
  };
};

// Process multiple files
export const processFiles = async (
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<CscanData[]> => {
  const results: CscanData[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const scanData = await parseCscanFile(files[i]);
      results.push(scanData);

      if (onProgress) {
        onProgress(i + 1, files.length);
      }
    } catch (error) {
      // Skip files that fail to parse
    }
  }

  return results;
};

// Create composite from multiple scans using global grid and weighted averaging
// This matches the original JS tool's composite generation logic
export const createComposite = (scans: CscanData[]): CscanData | null => {
  if (scans.length < 2) return null;

  // Step 1: Find global extent across all scans and track source regions
  let gMinX = Infinity, gMaxX = -Infinity;
  let gMinY = Infinity, gMaxY = -Infinity;

  const sourceRegions: SourceRegion[] = [];

  scans.forEach(scan => {
    const minX = Math.min(...scan.xAxis);
    const maxX = Math.max(...scan.xAxis);
    const minY = Math.min(...scan.yAxis);
    const maxY = Math.max(...scan.yAxis);

    // Track source region for filename overlay
    sourceRegions.push({
      filename: scan.filename,
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    });

    if (minX < gMinX) gMinX = minX;
    if (maxX > gMaxX) gMaxX = maxX;
    if (minY < gMinY) gMinY = minY;
    if (maxY > gMaxY) gMaxY = maxY;
  });

  // Step 2: Find minimum spacing (resolution) from all scans
  let minSpacing = Infinity;
  scans.forEach(scan => {
    if (scan.xAxis.length > 1) {
      const spacing = Math.abs(scan.xAxis[1] - scan.xAxis[0]);
      if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
    }
    if (scan.yAxis.length > 1) {
      const spacing = Math.abs(scan.yAxis[1] - scan.yAxis[0]);
      if (spacing > 0 && spacing < minSpacing) minSpacing = spacing;
    }
  });

  const resolution = minSpacing !== Infinity ? minSpacing : 1.0;

  // Step 3: Calculate grid dimensions
  const gridWidth = Math.ceil((gMaxX - gMinX) / resolution) + 1;
  const gridHeight = Math.ceil((gMaxY - gMinY) / resolution) + 1;

  // Step 4: Create composite and weight grids
  const compositeGrid = new Float32Array(gridHeight * gridWidth).fill(0);
  const weightGrid = new Float32Array(gridHeight * gridWidth).fill(0);

  // Step 5: Accumulate values from all scans
  scans.forEach(scan => {
    for (let i = 0; i < scan.yAxis.length; i++) {
      for (let j = 0; j < scan.xAxis.length; j++) {
        const val = scan.data[i]?.[j];
        if (val !== null && !isNaN(val) && isFinite(val)) {
          const x = scan.xAxis[j];
          const y = scan.yAxis[i];
          const gridX = Math.round((x - gMinX) / resolution);
          const gridY = Math.round((y - gMinY) / resolution);

          if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
            const idx = gridY * gridWidth + gridX;
            compositeGrid[idx] += val;
            weightGrid[idx] += 1;
          }
        }
      }
    }
  });

  // Step 6: Build the result matrix with weighted averages
  const matrix: (number | null)[][] = [];
  const xCoords = Array.from({ length: gridWidth }, (_, i) => gMinX + i * resolution);
  const yCoords = Array.from({ length: gridHeight }, (_, i) => gMinY + i * resolution);

  for (let i = 0; i < gridHeight; i++) {
    const row: (number | null)[] = [];
    for (let j = 0; j < gridWidth; j++) {
      const idx = i * gridWidth + j;
      if (weightGrid[idx] > 0) {
        row.push(compositeGrid[idx] / weightGrid[idx]);
      } else {
        row.push(null);
      }
    }
    matrix.push(row);
  }

  const stats = calculateStats(matrix, xCoords, yCoords);

  return {
    id: generateId(),
    filename: `Composite_${scans.length}_files`,
    width: gridWidth,
    height: gridHeight,
    data: matrix,
    xAxis: xCoords,
    yAxis: yCoords,
    stats,
    metadata: {
      Type: 'Composite',
      'Source Files': scans.length,
      sourceFileNames: scans.map(s => s.filename),
      compositeType: 'weighted_average',
      gridResolution: resolution
    },
    validPoints: stats.validPoints,
    timestamp: new Date(),
    isComposite: true,
    sourceRegions
  };
};

// =============================================================================
// CSV OFFSET DETECTION AND CORRECTION
// =============================================================================

// Tolerance for detecting offset mismatch (in mm)
const OFFSET_TOLERANCE = 10;

/**
 * Parse filename to extract expected Index and Scan ranges
 * Filename pattern: ... S-{start}-{end} I-{start}-{end} ...
 */
const parseFilenameOffsets = (filename: string): {
  indexStart: number | null;
  indexEnd: number | null;
  scanStart: number | null;
  scanEnd: number | null;
} => {
  // Match I-{start}-{end} pattern (Index axis)
  const indexMatch = filename.match(/I-(\d+)-(\d+)/i);
  // Match S-{start}-{end} pattern (Scan axis)
  const scanMatch = filename.match(/S-(\d+)-(\d+)/i);

  return {
    indexStart: indexMatch ? parseInt(indexMatch[1], 10) : null,
    indexEnd: indexMatch ? parseInt(indexMatch[2], 10) : null,
    scanStart: scanMatch ? parseInt(scanMatch[1], 10) : null,
    scanEnd: scanMatch ? parseInt(scanMatch[2], 10) : null
  };
};

/**
 * Detect if a scan file has incorrect axis offsets
 * Compares metadata/filename expected values against actual data values
 */
export const detectOffsets = (scan: CscanData): OffsetDetection => {
  const filenameOffsets = parseFilenameOffsets(scan.filename);

  // Get expected values from metadata (more reliable) or filename
  const expectedIndexStart = scan.metadata?.['IndexStart (mm)'] ?? filenameOffsets.indexStart;
  const expectedScanStart = scan.metadata?.['ScanStart (mm)'] ?? filenameOffsets.scanStart;

  // Get actual values from parsed data
  // yAxis is Index (rows), xAxis is Scan (columns)
  const actualIndexStart = scan.yAxis.length > 0 ? Math.min(...scan.yAxis) : 0;
  const actualScanStart = scan.xAxis.length > 0 ? Math.min(...scan.xAxis) : 0;

  // Calculate offsets needed
  const indexOffset = expectedIndexStart !== null
    ? expectedIndexStart - actualIndexStart
    : 0;
  const scanOffset = expectedScanStart !== null
    ? expectedScanStart - actualScanStart
    : 0;

  // Determine if correction is needed (with tolerance)
  const indexNeedsCorrection = Math.abs(indexOffset) > OFFSET_TOLERANCE;
  const scanNeedsCorrection = Math.abs(scanOffset) > OFFSET_TOLERANCE;

  return {
    fileId: scan.id,
    filename: scan.filename,
    expectedIndexStart,
    actualIndexStart,
    indexOffset,
    indexNeedsCorrection,
    expectedScanStart,
    actualScanStart,
    scanOffset,
    scanNeedsCorrection
  };
};

/**
 * Detect offsets for multiple scans
 * Returns only scans that need correction
 */
export const detectOffsetsForScans = (scans: CscanData[]): OffsetDetection[] => {
  return scans
    .filter(scan => !scan.isComposite) // Skip composite scans
    .map(scan => detectOffsets(scan))
    .filter(detection => detection.indexNeedsCorrection || detection.scanNeedsCorrection);
};

/**
 * Apply offset correction to a single scan
 * Returns a new CscanData with corrected axis values
 */
export const applyOffsetCorrection = (
  scan: CscanData,
  correctIndex: boolean,
  correctScan: boolean
): CscanData => {
  const detection = detectOffsets(scan);

  // Create new axis arrays with corrections applied
  const correctedYAxis = correctIndex && detection.indexNeedsCorrection
    ? scan.yAxis.map(y => y + detection.indexOffset)
    : [...scan.yAxis];

  const correctedXAxis = correctScan && detection.scanNeedsCorrection
    ? scan.xAxis.map(x => x + detection.scanOffset)
    : [...scan.xAxis];

  // Recalculate stats with new coordinates (for area calculations)
  const stats = calculateStats(scan.data, correctedXAxis, correctedYAxis);

  return {
    ...scan,
    xAxis: correctedXAxis,
    yAxis: correctedYAxis,
    stats,
    metadata: {
      ...scan.metadata,
      _correctionApplied: true,
      _indexOffsetApplied: correctIndex ? detection.indexOffset : 0,
      _scanOffsetApplied: correctScan ? detection.scanOffset : 0
    }
  };
};

/**
 * Apply offset corrections to multiple scans
 */
export const applyOffsetCorrections = (
  scans: CscanData[],
  correctIndex: boolean,
  correctScan: boolean
): CscanData[] => {
  return scans.map(scan => {
    if (scan.isComposite) return scan; // Don't correct composites

    const detection = detectOffsets(scan);
    const needsCorrection =
      (correctIndex && detection.indexNeedsCorrection) ||
      (correctScan && detection.scanNeedsCorrection);

    if (!needsCorrection) return scan;

    return applyOffsetCorrection(scan, correctIndex, correctScan);
  });
};

/**
 * Check if any scans in a collection need offset correction
 */
export const hasOffsetsToCorrect = (scans: CscanData[]): boolean => {
  return scans.some(scan => {
    if (scan.isComposite) return false;
    const detection = detectOffsets(scan);
    return detection.indexNeedsCorrection || detection.scanNeedsCorrection;
  });
};