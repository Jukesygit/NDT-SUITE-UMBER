/**
 * Thickness computation Web Worker.
 *
 * Receives envelope data (Uint8Array, transferred) plus gate positions,
 * computes wall thickness for each point on the C-scan grid using
 * threshold-crossing detection. Supports frustum culling, temporal
 * reprojection, and NaN occlusion culling for interactive performance.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

interface GatePosition {
  startUs: number;
  endUs: number;
  thresholdPct: number; // 0-200 amplitude %
}

interface ThicknessRequest {
  id: number;
  envelope: Uint8Array; // flat: height * width * envelopeSamples
  width: number;
  height: number;
  envelopeSamples: number;
  timeStartUs: number;
  timeEndUs: number;
  velocity: number; // m/s

  refGate: GatePosition;
  measGate: GatePosition;

  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };

  previousResult?: Float32Array;
  previousRefGate?: GatePosition;
  previousMeasGate?: GatePosition;
}

interface ThicknessResponse {
  id: number;
  thickness: Float32Array; // height * width, NaN for no-data or outside visible
  computedCount: number;
  computeMs: number;
}

// ---------------------------------------------------------------------------
// Gate helpers
// ---------------------------------------------------------------------------

function gatesEqual(a: GatePosition, b: GatePosition): boolean {
  return a.startUs === b.startUs && a.endUs === b.endUs && a.thresholdPct === b.thresholdPct;
}

function toSampleIndex(timeUs: number, timeStartUs: number, sampleDurUs: number, max: number, floor: boolean): number {
  const raw = (timeUs - timeStartUs) / sampleDurUs;
  const idx = floor ? Math.floor(raw) : Math.ceil(raw);
  return Math.max(0, Math.min(max, idx));
}

function toThresholdU8(pct: number): number {
  return Math.round((pct / 200) * 255);
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function computeThickness(msg: ThicknessRequest): ThicknessResponse {
  const t0 = performance.now();
  const { envelope, width, height, envelopeSamples, timeStartUs, timeEndUs, velocity } = msg;
  const { refGate, measGate, visibleRegion } = msg;

  const timeSpanUs = timeEndUs - timeStartUs;
  const sampleDurUs = timeSpanUs / (envelopeSamples - 1);
  const thickness = new Float32Array(width * height).fill(NaN);

  // Frustum culling — only compute visible region
  let x0 = 0, y0 = 0, x1 = width, y1 = height;
  if (visibleRegion) {
    x0 = Math.max(0, Math.floor(visibleRegion.x0));
    y0 = Math.max(0, Math.floor(visibleRegion.y0));
    x1 = Math.min(width, Math.ceil(visibleRegion.x1));
    y1 = Math.min(height, Math.ceil(visibleRegion.y1));
  }

  // Convert gate times to sample indices
  const refI0 = toSampleIndex(refGate.startUs, timeStartUs, sampleDurUs, envelopeSamples, true);
  const refI1 = toSampleIndex(refGate.endUs, timeStartUs, sampleDurUs, envelopeSamples, false);
  const measI0 = toSampleIndex(measGate.startUs, timeStartUs, sampleDurUs, envelopeSamples, true);
  const measI1 = toSampleIndex(measGate.endUs, timeStartUs, sampleDurUs, envelopeSamples, false);

  const refThresh = toThresholdU8(refGate.thresholdPct);
  const measThresh = toThresholdU8(measGate.thresholdPct);

  // Temporal reprojection — reuse previous result when gates unchanged
  const { previousResult, previousRefGate, previousMeasGate } = msg;
  const canReproject =
    previousResult &&
    previousRefGate &&
    previousMeasGate &&
    gatesEqual(previousRefGate, refGate) &&
    gatesEqual(previousMeasGate, measGate);

  if (canReproject) {
    // Gates identical — copy previous visible region directly
    for (let row = y0; row < y1; row++) {
      const rowOff = row * width;
      for (let col = x0; col < x1; col++) {
        thickness[rowOff + col] = previousResult![rowOff + col];
      }
    }
    return { id: msg.id, thickness, computedCount: 0, computeMs: performance.now() - t0 };
  }

  let computedCount = 0;

  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const pointIdx = row * width + col;
      const envOffset = pointIdx * envelopeSamples;

      // NaN occlusion: skip points with no envelope data in gate regions
      if (envelope[envOffset + refI0] === 0 && envelope[envOffset + measI0] === 0) {
        let hasData = false;
        for (let s = refI0; s < refI1 && !hasData; s++) {
          if (envelope[envOffset + s] > 0) hasData = true;
        }
        if (!hasData) {
          for (let s = measI0; s < measI1 && !hasData; s++) {
            if (envelope[envOffset + s] > 0) hasData = true;
          }
        }
        if (!hasData) continue; // thickness stays NaN
      }

      computedCount++;

      // Find reference gate crossing (first sample >= threshold)
      let refTimeUs = NaN;
      for (let s = refI0; s < refI1; s++) {
        if (envelope[envOffset + s] >= refThresh) {
          refTimeUs = timeStartUs + s * sampleDurUs;
          break;
        }
      }

      // Find measurement gate crossing
      let measTimeUs = NaN;
      for (let s = measI0; s < measI1; s++) {
        if (envelope[envOffset + s] >= measThresh) {
          measTimeUs = timeStartUs + s * sampleDurUs;
          break;
        }
      }

      if (isNaN(refTimeUs) || isNaN(measTimeUs)) continue; // stays NaN

      // thickness = deltaT * velocity / 2, converted to mm
      const deltaS = (measTimeUs - refTimeUs) * 1e-6;
      thickness[pointIdx] = (deltaS * velocity * 1000.0) / 2.0;
    }
  }

  return { id: msg.id, thickness, computedCount, computeMs: performance.now() - t0 };
}

// ---------------------------------------------------------------------------
// Worker message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<ThicknessRequest>) => {
  const result = computeThickness(e.data);
  (self as unknown as Worker).postMessage(
    result,
    [result.thickness.buffer] as unknown as Transferable[],
  );
};
