# Waveform-Based C-Scan Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a progressive LOD C-scan engine that computes thickness from raw A-scan waveforms, enabling live gate adjustment with instant C-scan updates in the browser — no companion round-trip during interaction.

**Architecture:** During composite generation, the companion reads each file's full AScanAmplitude dataset, max-pool downsamples the rectified envelope to 30 time samples, and stitches it onto the unified grid alongside the thickness matrix. This ~190 MB envelope is sent to the browser with the composite. A new Web Worker in the browser performs vectorized threshold crossing detection on the envelope data, with frustum culling (visible region only), temporal reprojection (skip unchanged points), and NaN occlusion culling. On gate release, the companion does a full-resolution Tier 2 pass from HDF5, streaming results as tiles.

**Tech Stack:** Python/NumPy (companion envelope generation), TypeScript Web Worker (browser-side thickness computation), existing WebSocket infrastructure, existing heatmap renderer pipeline.

---

## Phase 1: Companion — Envelope Generation

### Task 1: Max-Pool Downsample Utility

**Files:**
- Create: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\envelope.py`

**What it does:**

Create a utility module with the max-pool downsampling function and envelope extraction from HDF5.

```python
"""
Waveform envelope extraction for progressive C-scan computation.

Reads AScanAmplitude from HDF5, rectifies, and downsamples via max-pooling
to preserve peak amplitudes for threshold crossing detection.
"""

import numpy as np
import h5py
from .models import FileIndex

# Number of time samples in the downsampled envelope
ENVELOPE_SAMPLES = 30


def max_pool_1d(data: np.ndarray, n_bins: int) -> np.ndarray:
    """Downsample last axis via max-pooling. Preserves peak amplitudes.

    Args:
        data: Array with time axis as last dimension.
        n_bins: Number of output bins.

    Returns:
        Array with last axis reduced to n_bins.
    """
    n_time = data.shape[-1]
    if n_time <= n_bins:
        # No downsampling needed — pad with zeros
        result = np.zeros((*data.shape[:-1], n_bins), dtype=data.dtype)
        result[..., :n_time] = data
        return result

    bin_size = n_time // n_bins
    trimmed = data[..., :bin_size * n_bins]
    reshaped = trimmed.reshape(*data.shape[:-1], n_bins, bin_size)
    return reshaped.max(axis=-1)


def extract_envelope_chunk(
    file_index: FileIndex,
    scan_start: int,
    scan_end: int,
    n_bins: int = ENVELOPE_SAMPLES,
) -> np.ndarray:
    """Extract rectified, downsampled envelope for a chunk of scan lines.

    Args:
        file_index: Indexed NDE file.
        scan_start: First scan line index (inclusive).
        scan_end: Last scan line index (exclusive).
        n_bins: Number of output time bins.

    Returns:
        uint8 array of shape (scan_end - scan_start, n_index, n_bins).
        Values 0-255 represent 0-200% amplitude.
    """
    n_index = file_index.index_axis.quantity

    with h5py.File(file_index.path, "r") as f:
        amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]
        waveforms = amp_ds[scan_start:scan_end, :n_index, :]  # (chunk, n_index, n_time) int16

    # Rectify (absolute value) and convert to float32
    rectified = np.abs(waveforms.astype(np.float32))

    # Normalize to 0-255 (maps 0-32767 int16 range to 0-255 uint8)
    # 32767 = 200% amplitude in UT convention
    rectified = (rectified / 32767.0 * 255.0).clip(0, 255)

    # Max-pool downsample time axis
    pooled = max_pool_1d(rectified, n_bins)

    return pooled.astype(np.uint8)
```

**Step 1:** Create the `envelope.py` module with `max_pool_1d` and `extract_envelope_chunk`.

**Step 2:** Verify syntax: `python -c "import py_compile; py_compile.compile('engine/envelope.py', doraise=True)"`

**Step 3:** Commit.

---

### Task 2: Generate Envelope During Composite Creation

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\composite.py`
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\models.py`

**What it does:**

During `create_composite`, after stitching each file's thickness data onto the unified grid, also read the full AScanAmplitude and build the downsampled envelope grid. Store it in `CompositeResult`.

**models.py changes — add envelope fields to CompositeResult:**

```python
@dataclass
class CompositeResult:
    """Multi-file composite thickness grid."""
    matrix: np.ndarray          # (height, width) float32, NaN = no data
    amplitude: np.ndarray       # (height, width) float32, meas gate amplitude %
    envelope: np.ndarray        # (height, width, ENVELOPE_SAMPLES) uint8, rectified envelope
    time_start_us: float        # start of time axis in µs (from first file)
    time_end_us: float          # end of time axis in µs (from first file)
    velocity: float             # sound velocity in m/s (for thickness computation)
    x_axis: np.ndarray          # (width,) float32 — scan axis mm
    y_axis: np.ndarray          # (height,) float32 — index axis mm
    width: int
    height: int
    stats: dict
    source_files: list[dict]
    warnings: list[dict]
```

**composite.py changes — add envelope generation to `create_composite`:**

After the existing spatial mapping loop (lines 119-134), add envelope extraction for each file:

```python
from .envelope import extract_envelope_chunk, ENVELOPE_SAMPLES

# Inside create_composite, before Phase 2:
# Allocate envelope grid
envelope = np.zeros((n_index, n_scan, ENVELOPE_SAMPLES), dtype=np.uint8)
time_start_us = 0.0
time_end_us = 1.0
velocity = all_files[0].velocity if all_files else 5900.0

# Get time axis from first file
if all_files:
    ta = all_files[0].time_axis
    time_start_us = ta.offset * 1e6
    time_end_us = (ta.offset + (ta.quantity - 1) * ta.resolution) * 1e6
    velocity = all_files[0].velocity

# Inside the per-file loop (after the existing thickness stitching):
CHUNK_SIZE = 50  # scan lines per chunk to limit RAM

for chunk_start in range(0, fi.scan_axis.quantity, CHUNK_SIZE):
    if abort_flag and abort_flag.is_set():
        raise _AbortedError()
    
    chunk_end = min(chunk_start + CHUNK_SIZE, fi.scan_axis.quantity)
    env_chunk = extract_envelope_chunk(fi, chunk_start, chunk_end)
    
    # Map into unified grid (same spatial mapping as thickness)
    for si in range(chunk_end - chunk_start):
        scan_mm = file_scan_start_mm + (chunk_start + si) * fi.scan_axis.resolution * 1000
        gi_x = int(round((scan_mm - scan_min_mm) / scan_res_mm))
        if gi_x < 0 or gi_x >= n_scan:
            continue
        for ii in range(fi.index_axis.quantity):
            idx_mm = file_index_start_mm + ii * fi.index_axis.resolution * 1000
            gi_y = int(round((idx_mm - index_min_mm) / index_res_mm))
            if gi_y < 0 or gi_y >= n_index:
                continue
            envelope[gi_y, gi_x, :] = env_chunk[si, ii, :]
```

Update the return statement to include new fields.

**Step 1:** Update `CompositeResult` in models.py with envelope, time_start_us, time_end_us, velocity fields.

**Step 2:** Update `create_composite` to allocate envelope grid, extract envelopes per file, and stitch spatially.

**Step 3:** Update the return statement in `create_composite`.

**Step 4:** Verify syntax: `python -c "import py_compile; py_compile.compile('engine/composite.py', doraise=True)"`

**Step 5:** Commit.

---

### Task 3: Send Envelope in Binary Response

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py` (function `_composite_to_binary`)
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\server.py` (expose new headers)

**What it does:**

Extend the binary response format to include the envelope data, time axis info, and velocity. The new format:

```
Body = gzip(concat(
    float32_matrix,           # width * height floats
    float32_amplitude,        # width * height floats
    uint8_envelope,           # width * height * ENVELOPE_SAMPLES bytes
    float32_xAxis,            # width floats
    float32_yAxis             # height floats
))
```

New response headers:
- `X-Has-Envelope: true`
- `X-Envelope-Samples: 30`
- `X-Time-Start-Us: 0.0`
- `X-Time-End-Us: 12.5`
- `X-Velocity: 5900.0`

**routes.py changes to `_composite_to_binary`:**

```python
body_parts = [
    result.matrix.astype("<f4").tobytes(),
    result.amplitude.astype("<f4").tobytes(),
    result.envelope.tobytes(),                    # uint8, already correct endianness
    result.x_axis.astype("<f4").tobytes(),
    result.y_axis.astype("<f4").tobytes(),
]
```

Add headers:
```python
"X-Has-Envelope": "true",
"X-Envelope-Samples": str(result.envelope.shape[-1]),
"X-Time-Start-Us": str(round(result.time_start_us, 3)),
"X-Time-End-Us": str(round(result.time_end_us, 3)),
"X-Velocity": str(round(result.velocity, 1)),
```

**server.py changes — expose new headers in CORS:**

Add to `expose_headers` list:
```python
"X-Has-Envelope", "X-Envelope-Samples",
"X-Time-Start-Us", "X-Time-End-Us", "X-Velocity",
```

**Step 1:** Update `_composite_to_binary` to include envelope in body and new headers.

**Step 2:** Update CORS expose_headers in server.py.

**Step 3:** Verify syntax.

**Step 4:** Commit.

---

## Phase 2: Browser — Parse Envelope + Thickness Worker

### Task 4: Parse Envelope from Composite Response

**Files:**
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\types\companion.ts`
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\services\companion-service.ts`

**What it does:**

Update the `CompositeData` type and binary parser to include the envelope, time axis, and velocity.

**companion.ts — extend CompositeData:**

```typescript
export interface CompositeData {
  matrix: Float32Array;
  amplitude: Float32Array | null;
  envelope: Uint8Array | null;        // (height * width * envelopeSamples) uint8, row-major
  envelopeSamples: number;            // samples per point (30)
  timeStartUs: number;                // start of time axis in µs
  timeEndUs: number;                  // end of time axis in µs
  velocity: number;                   // sound velocity in m/s
  width: number;
  height: number;
  xAxis: Float32Array;
  yAxis: Float32Array;
  stats: CompositeStats;
  sourceFiles: SourceFile[];
  warnings: Warning[];
}
```

**companion-service.ts — update parseCompositeResponse:**

After parsing amplitude, before xAxis:
```typescript
const hasEnvelope = response.headers.get('X-Has-Envelope') === 'true';
const envelopeSamples = parseInt(response.headers.get('X-Envelope-Samples') ?? '0', 10);
const timeStartUs = parseFloat(response.headers.get('X-Time-Start-Us') ?? '0');
const timeEndUs = parseFloat(response.headers.get('X-Time-End-Us') ?? '1');
const velocity = parseFloat(response.headers.get('X-Velocity') ?? '5900');

// Envelope is uint8, not float32
const envelopeBytes = hasEnvelope ? matrixSize * envelopeSamples : 0;

// Update expected size calculation
const expectedBytes = (matrixSize + amplitudeFloats + width + height) * 4 + envelopeBytes;
```

Slice the envelope from the buffer (note: uint8 not float32):
```typescript
// After amplitude, before xAxis:
let envelope: Uint8Array | null = null;
if (hasEnvelope && envelopeSamples > 0) {
  const byteOffset = (matrixSize + amplitudeFloats) * 4;  // bytes, not floats
  envelope = new Uint8Array(buffer, byteOffset, envelopeBytes);
  // xAxis/yAxis start after envelope bytes
}
```

The tricky part: the buffer contains mixed types (float32 for matrix/amplitude/axes, uint8 for envelope). Use byte offsets instead of Float32Array subarray for the post-envelope data.

**Step 1:** Update CompositeData interface with envelope fields.

**Step 2:** Update parseCompositeResponse to parse envelope from binary and new headers.

**Step 3:** Update getScanCompositeData in scan-composite-service.ts to set envelope: null, envelopeSamples: 0, timeStartUs: 0, timeEndUs: 1, velocity: 5900.

**Step 4:** Run `npm run typecheck` — fix any type errors from the new required fields.

**Step 5:** Run `npm run test`.

**Step 6:** Commit.

---

### Task 5: Thickness Computation Web Worker

**Files:**
- Create: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\workers\thickness-engine.worker.ts`

**What it does:**

A Web Worker that computes thickness from envelope data using vectorized operations. Supports frustum culling (visible region), temporal reprojection (dirty mask), and NaN occlusion culling.

**Worker message protocol:**

**Request (main → worker):**
```typescript
interface ThicknessRequest {
  id: number;
  type: 'compute';

  // Envelope data (transferred once, then referenced)
  envelope: Uint8Array;           // (height * width * samples) — flat
  width: number;
  height: number;
  envelopeSamples: number;
  timeStartUs: number;
  timeEndUs: number;
  velocity: number;               // m/s

  // Gate positions
  refGate: { startUs: number; endUs: number; thresholdPct: number };
  measGate: { startUs: number; endUs: number; thresholdPct: number };

  // Optimizations
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };  // frustum culling
  previousThickness?: Float32Array;  // for temporal reprojection
  previousRefGate?: { startUs: number; endUs: number; thresholdPct: number };
  previousMeasGate?: { startUs: number; endUs: number; thresholdPct: number };
}
```

**Response (worker → main):**
```typescript
interface ThicknessResponse {
  id: number;
  thickness: Float32Array;    // (height * width) — full grid, NaN outside visible
  computedCount: number;      // number of points actually computed (for perf tracking)
  computeMs: number;
}
```

**Core algorithm:**

```typescript
function computeThickness(msg: ThicknessRequest): ThicknessResponse {
  const t0 = performance.now();
  const { envelope, width, height, envelopeSamples, timeStartUs, timeEndUs, velocity } = msg;
  const { refGate, measGate, visibleRegion } = msg;

  const sampleDurationUs = (timeEndUs - timeStartUs) / (envelopeSamples - 1);
  const thickness = new Float32Array(width * height).fill(NaN);

  // Determine region to compute (frustum culling)
  let x0 = 0, y0 = 0, x1 = width, y1 = height;
  if (visibleRegion) {
    x0 = Math.max(0, Math.floor(visibleRegion.x0));
    y0 = Math.max(0, Math.floor(visibleRegion.y0));
    x1 = Math.min(width, Math.ceil(visibleRegion.x1));
    y1 = Math.min(height, Math.ceil(visibleRegion.y1));
  }

  // Convert gate times to sample indices
  const refI0 = Math.max(0, Math.floor((refGate.startUs - timeStartUs) / sampleDurationUs));
  const refI1 = Math.min(envelopeSamples, Math.ceil((refGate.endUs - timeStartUs) / sampleDurationUs));
  const measI0 = Math.max(0, Math.floor((measGate.startUs - timeStartUs) / sampleDurationUs));
  const measI1 = Math.min(envelopeSamples, Math.ceil((measGate.endUs - timeStartUs) / sampleDurationUs));

  // Threshold in uint8 scale (0-255)
  const refThresh = Math.round(refGate.thresholdPct / 200 * 255);
  const measThresh = Math.round(measGate.thresholdPct / 200 * 255);

  // Temporal reprojection: determine which points need recomputation
  const { previousThickness, previousRefGate, previousMeasGate } = msg;
  const hasPrevious = previousThickness && previousRefGate && previousMeasGate;

  let computedCount = 0;

  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const pointIdx = row * width + col;
      const envOffset = pointIdx * envelopeSamples;

      // NaN occlusion: skip if no envelope data (all zeros = no scan data)
      // Check first sample — if the point had data, it won't be all zero
      if (envelope[envOffset] === 0 && envelope[envOffset + envelopeSamples - 1] === 0) {
        // Quick check: if first and last are zero, likely no data
        // Full check only if needed
        let hasData = false;
        for (let s = refI0; s < refI1; s++) {
          if (envelope[envOffset + s] > 0) { hasData = true; break; }
        }
        if (!hasData) {
          thickness[pointIdx] = NaN;
          continue;
        }
      }

      // Temporal reprojection: skip if gate didn't change for this point
      if (hasPrevious) {
        // Check if this point's crossing was in the interior of both gates
        // (not near edges that moved)
        const canSkip = canSkipPoint(
          previousThickness!, pointIdx,
          previousRefGate!, refGate,
          previousMeasGate!, measGate,
          envelope, envOffset, envelopeSamples,
          sampleDurationUs, timeStartUs,
        );
        if (canSkip) {
          thickness[pointIdx] = previousThickness![pointIdx];
          continue;
        }
      }

      computedCount++;

      // Find reference gate crossing
      let refTimeUs = NaN;
      for (let s = refI0; s < refI1; s++) {
        if (envelope[envOffset + s] >= refThresh) {
          refTimeUs = timeStartUs + s * sampleDurationUs;
          break;
        }
      }

      // Find measurement gate crossing
      let measTimeUs = NaN;
      for (let s = measI0; s < measI1; s++) {
        if (envelope[envOffset + s] >= measThresh) {
          measTimeUs = timeStartUs + s * sampleDurationUs;
          break;
        }
      }

      if (isNaN(refTimeUs) || isNaN(measTimeUs)) {
        thickness[pointIdx] = NaN;
      } else {
        // thickness = (meas - ref) * velocity / 2 * 1000 (mm)
        // times in µs, velocity in m/s
        const deltaUs = measTimeUs - refTimeUs;
        thickness[pointIdx] = (deltaUs * 1e-6) * velocity / 2.0 * 1000.0;
      }
    }
  }

  return {
    id: msg.id,
    thickness,
    computedCount,
    computeMs: performance.now() - t0,
  };
}

function canSkipPoint(
  prevThickness: Float32Array, idx: number,
  prevRef: { startUs: number; endUs: number; thresholdPct: number },
  newRef: { startUs: number; endUs: number; thresholdPct: number },
  prevMeas: { startUs: number; endUs: number; thresholdPct: number },
  newMeas: { startUs: number; endUs: number; thresholdPct: number },
  envelope: Uint8Array, envOffset: number, samples: number,
  sampleDurUs: number, timeStartUs: number,
): boolean {
  // If previous result was NaN, can't skip (might have data now with wider gate)
  if (isNaN(prevThickness[idx])) return false;

  // If thresholds changed, can't skip
  if (prevRef.thresholdPct !== newRef.thresholdPct) return false;
  if (prevMeas.thresholdPct !== newMeas.thresholdPct) return false;

  // If gate edges moved, check if this point's crossing was in the
  // region that's unchanged (interior of both old and new gates)
  const refSafe = prevRef.startUs <= newRef.startUs && prevRef.endUs >= newRef.endUs;
  const measSafe = prevMeas.startUs <= newMeas.startUs && prevMeas.endUs >= newMeas.endUs;

  // If new gates are within old gates (shrinking), check if crossing
  // was inside the new (smaller) window — if yes, result unchanged
  if (refSafe && measSafe) return true;

  // If gates expanded, the crossing from before is still valid
  // (it was found in the old window which is inside the new one)
  const refExpand = newRef.startUs <= prevRef.startUs && newRef.endUs >= prevRef.endUs;
  const measExpand = newMeas.startUs <= prevMeas.startUs && newMeas.endUs >= prevMeas.endUs;

  if (refExpand && measExpand) {
    // But: expanding might reveal an earlier crossing before the old gate start
    // We can only skip if no signal exists in the expanded region
    // This is a conservative check — some points will be recomputed unnecessarily
    return false;
  }

  return false;
}
```

**Worker message handler:**
```typescript
self.onmessage = (e: MessageEvent<ThicknessRequest>) => {
  const result = computeThickness(e.data);
  (self as unknown as Worker).postMessage(result, [result.thickness.buffer]);
};
```

**Step 1:** Create the worker file with the thickness computation algorithm.

**Step 2:** Run `npm run typecheck`.

**Step 3:** Commit.

---

### Task 6: useThicknessEngine Hook

**Files:**
- Create: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\hooks\useThicknessEngine.ts`

**What it does:**

React hook that manages the thickness computation worker. Accepts envelope data and gate positions, returns the computed thickness matrix. Handles frustum culling by accepting a visible region, and temporal reprojection by caching the previous computation.

**Interface:**

```typescript
interface GatePosition {
  startUs: number;
  endUs: number;
  thresholdPct: number;
}

interface UseThicknessEngineParams {
  envelope: Uint8Array | null;
  width: number;
  height: number;
  envelopeSamples: number;
  timeStartUs: number;
  timeEndUs: number;
  velocity: number;
  refGate: GatePosition | null;
  measGate: GatePosition | null;
  visibleRegion?: { x0: number; y0: number; x1: number; y1: number };
}

interface UseThicknessEngineResult {
  thickness: Float32Array | null;
  isComputing: boolean;
  computeMs: number;
  computedCount: number;
}
```

**Implementation pattern:** Same as `useHeatmapRenderer` — lazy worker creation, incrementing IDs for stale result discarding, buffer transfer.

Key additions:
- Stores previous thickness + gate positions in refs for temporal reprojection
- Debounces computation requests during rapid gate changes (~16ms, one per animation frame)
- On first computation (no previous), skips temporal reprojection

**Step 1:** Create the hook.

**Step 2:** Run `npm run typecheck`.

**Step 3:** Commit.

---

## Phase 3: Browser — Wire Gate Drags to Thickness Engine

### Task 7: CscanHeatmap — Accept External Thickness Matrix

**Files:**
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\components\projects\scan-viewer\CscanHeatmap.tsx`

**What it does:**

Add an optional `thicknessOverride` prop. When provided, use it instead of `composite.matrix` for rendering. This lets the parent swap in the worker-computed thickness during gate adjustment without replacing the entire composite.

**Changes:**

Add prop:
```typescript
interface CscanHeatmapProps {
  // ... existing props ...
  /** Worker-computed thickness matrix from gate adjustment. Overrides composite.matrix when set. */
  thicknessOverride?: Float32Array | null;
}
```

In the filtered useMemo, use `thicknessOverride ?? composite.matrix` as the source:
```typescript
const sourceMatrix = thicknessOverride ?? composite.matrix;
const filtered = useMemo(() => {
  // ... existing filter logic but on sourceMatrix instead of composite.matrix ...
}, [sourceMatrix, composite.amplitude, thicknessMin, thicknessMax, amplitudeMin]);
```

**Step 1:** Add `thicknessOverride` prop.

**Step 2:** Update the filter useMemo to use it.

**Step 3:** Run `npm run typecheck`.

**Step 4:** Commit.

---

### Task 8: Landing Page — Wire Gate Drags to Thickness Engine

**Files:**
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\pages\ScanViewerLandingPage.tsx`

**What it does:**

When the user drags a gate on the A-scan, compute a new thickness matrix from the envelope data using the thickness engine worker. Pass the result to CscanHeatmap as `thicknessOverride`.

**Changes:**

1. Import and use `useThicknessEngine`:
```typescript
const { thickness: workerThickness, isComputing } = useThicknessEngine({
  envelope: composite?.envelope ?? null,
  width: composite?.width ?? 0,
  height: composite?.height ?? 0,
  envelopeSamples: composite?.envelopeSamples ?? 0,
  timeStartUs: composite?.timeStartUs ?? 0,
  timeEndUs: composite?.timeEndUs ?? 1,
  velocity: composite?.velocity ?? 5900,
  refGate: deriveRefGate(effectiveGates, gateSettings),
  measGate: deriveMeasGate(effectiveGates, gateSettings),
  visibleRegion: currentVisibleRegion,  // from CscanHeatmap
});
```

2. Derive gate positions from effective gates:
```typescript
function deriveRefGate(gates: GateOverlay[], settings: GateSettings): GatePosition | null {
  const refId = settings.gateMode === 'B-A' ? 1 : 0;  // Gate I or Gate A
  const gate = gates.find(g => g.id === refId);
  if (!gate) return null;
  return { startUs: gate.startUs, endUs: gate.endUs, thresholdPct: gate.thresholdPct };
}

function deriveMeasGate(gates: GateOverlay[], settings: GateSettings): GatePosition | null {
  const measId = settings.gateMode === 'B-A' ? 2 : 1;  // Gate B or Gate A
  const gate = gates.find(g => g.id === measId);
  if (!gate) return null;
  return { startUs: gate.startUs, endUs: gate.endUs, thresholdPct: gate.thresholdPct };
}
```

3. Pass to CscanHeatmap:
```typescript
<CscanHeatmap
  composite={composite}
  thicknessOverride={workerThickness}
  // ... other props ...
/>
```

4. To get the visible region from CscanHeatmap, add an `onVisibleRegionChange` callback prop to CscanHeatmap that reports the current viewport bounds in data coordinates. The useZoomPan hook already has this info.

**Step 1:** Add `onVisibleRegionChange` callback to CscanHeatmap that fires when zoom/pan changes.

**Step 2:** Add `useThicknessEngine` to the landing page, wired to effective gates.

**Step 3:** Add gate derivation helpers.

**Step 4:** Pass `thicknessOverride` to CscanHeatmap.

**Step 5:** Run `npm run typecheck`.

**Step 6:** Test: drag a gate on A-scan → C-scan updates live.

**Step 7:** Commit.

---

## Phase 4: Companion — Tier 2 Full Resolution

### Task 9: Full-Resolution Thickness from HDF5

**Files:**
- Create: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\waveform_thickness.py`

**What it does:**

A new module that computes thickness from raw AScanAmplitude waveforms at full time resolution. This is the Tier 2 computation — accurate final result after the user releases a gate.

```python
"""
Full-resolution thickness computation from raw A-scan waveforms.

Reads AScanAmplitude from HDF5, applies gate windows and thresholds,
and computes crossing-time-based thickness at full sample rate.
"""

import numpy as np
import h5py
from .models import FileIndex

CHUNK_SIZE = 50  # scan lines per chunk


def compute_thickness_full_res(
    file_index: FileIndex,
    ref_gate_start_us: float,
    ref_gate_end_us: float,
    ref_threshold_pct: float,
    meas_gate_start_us: float,
    meas_gate_end_us: float,
    meas_threshold_pct: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute thickness from raw waveforms at full resolution.

    Returns:
        Tuple of (thickness_grid, amplitude_grid) both (n_scans, n_index) float32.
    """
    sa = file_index.scan_axis
    ia = file_index.index_axis
    ta = file_index.time_axis
    n_scans = sa.quantity
    n_index = ia.quantity
    n_time = ta.quantity
    velocity = file_index.velocity

    # Time axis in µs
    time_us = np.arange(n_time) * (ta.resolution * 1e6) + (ta.offset * 1e6)

    # Gate sample ranges
    ref_i0 = max(0, np.searchsorted(time_us, ref_gate_start_us))
    ref_i1 = min(n_time, np.searchsorted(time_us, ref_gate_end_us))
    meas_i0 = max(0, np.searchsorted(time_us, meas_gate_start_us))
    meas_i1 = min(n_time, np.searchsorted(time_us, meas_gate_end_us))

    # Threshold in int16 scale
    ref_thresh = ref_threshold_pct / 200.0 * 32767.0
    meas_thresh = meas_threshold_pct / 200.0 * 32767.0

    thickness_grid = np.full((n_scans, n_index), np.nan, dtype=np.float32)
    amplitude_grid = np.full((n_scans, n_index), np.nan, dtype=np.float32)

    with h5py.File(file_index.path, "r") as f:
        amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]

        for chunk_start in range(0, n_scans, CHUNK_SIZE):
            chunk_end = min(chunk_start + CHUNK_SIZE, n_scans)
            waveforms = amp_ds[chunk_start:chunk_end, :n_index, :]  # (chunk, n_index, n_time)

            # Rectify
            rectified = np.abs(waveforms.astype(np.float32))

            # Reference gate crossing
            ref_window = rectified[:, :, ref_i0:ref_i1]
            ref_above = ref_window >= ref_thresh
            ref_first = np.argmax(ref_above, axis=2)
            ref_has = np.any(ref_above, axis=2)
            ref_time = np.where(ref_has, time_us[ref_i0 + ref_first], np.nan)

            # Measurement gate crossing
            meas_window = rectified[:, :, meas_i0:meas_i1]
            meas_above = meas_window >= meas_thresh
            meas_first = np.argmax(meas_above, axis=2)
            meas_has = np.any(meas_above, axis=2)
            meas_time = np.where(meas_has, time_us[meas_i0 + meas_first], np.nan)

            # Thickness
            delta_us = meas_time - ref_time
            chunk_thickness = (delta_us * 1e-6) * velocity / 2.0 * 1000.0

            # Peak amplitude in measurement window (for filtering)
            meas_peak = meas_window.max(axis=2) / 32767.0 * 200.0

            thickness_grid[chunk_start:chunk_end, :] = chunk_thickness
            amplitude_grid[chunk_start:chunk_end, :] = meas_peak

    return thickness_grid, amplitude_grid
```

**Step 1:** Create the module.

**Step 2:** Verify syntax.

**Step 3:** Commit.

---

### Task 10: WebSocket Gate-Adjust Endpoint with Tile Streaming

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py`

**What it does:**

Add handling for `gate-adjust` messages on the existing WebSocket. When the browser sends a `gate-adjust` with `tier: 2`, the companion computes full-resolution thickness from HDF5 for all files in the composite and streams results as tiles.

**Protocol:**

Browser → Companion:
```json
{
  "type": "gate-adjust",
  "tier": 2,
  "gates": {
    "ref": { "startUs": 2.1, "endUs": 4.5, "thresholdPct": 40.0 },
    "meas": { "startUs": 5.0, "endUs": 8.0, "thresholdPct": 50.0 }
  },
  "folders": ["Composite_12_files"],
  "gateSettings": { "gateMode": "A-I", ... }
}
```

Companion → Browser (streamed tiles):

For each file processed, send a tile update:
```json
{ "type": "cscan-tile", "seq": 42, "fileIndex": 3, "totalFiles": 12, "progress": 0.25 }
```
Followed by a binary frame: the partial thickness matrix (full grid, only the file's region updated, rest NaN).

After all files:
```json
{ "type": "cscan-complete", "seq": 42, "computeMs": 4500.0 }
```
Followed by a binary frame: the final complete thickness matrix.

**Implementation — add to the reader/processor in cursor_stream:**

In the reader task, also accept `gate-adjust` messages:
```python
if msg.get("type") == "gate-adjust":
    await gate_adjust_queue.put(msg)
```

Add a separate processor or handle in the existing one:
```python
if msg.get("type") == "gate-adjust" and msg.get("tier") == 2:
    result = await asyncio.to_thread(
        _compute_tier2, msg, file_cache, composite_cache
    )
    # Stream tiles as they complete
    for tile in result:
        await ws.send_text(tile.header_json)
        await ws.send_bytes(tile.matrix_bytes)
```

The `_compute_tier2` function:
1. For each file in the composite, call `compute_thickness_full_res` with the new gate positions
2. Stitch each file's result onto the unified grid (same spatial mapping as `create_composite`)
3. Yield tiles as each file completes

**Step 1:** Add `waveform_thickness` import to routes.py.

**Step 2:** Add `gate-adjust` message handling to the WebSocket reader.

**Step 3:** Implement `_compute_tier2` with per-file tile streaming.

**Step 4:** Verify syntax.

**Step 5:** Commit.

---

### Task 11: Browser — Handle Tier 2 Tile Updates

**Files:**
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\hooks\useCompanionWebSocket.ts`
- Modify: `c:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER\src\pages\ScanViewerLandingPage.tsx`

**What it does:**

Handle `cscan-tile` and `cscan-complete` WebSocket messages. Apply tile updates progressively to the thickness matrix. Show progress indicator during Tier 2 computation.

**useCompanionWebSocket changes:**

Add to the WebSocket message handler:
```typescript
if (parsed.type === 'cscan-tile' || parsed.type === 'cscan-complete') {
  // Next binary frame is the thickness matrix
  pendingTileHeaderRef.current = parsed;
}
```

Add a callback for tile updates:
```typescript
onTileUpdate?: (matrix: Float32Array, progress: number, complete: boolean) => void;
```

**Landing page changes:**

1. Add `sendGateAdjust` function that sends `gate-adjust` with `tier: 2` on gate release
2. In `handleGateChange`, after updating local overrides, also send `gate-adjust` to companion
3. Handle tile updates by merging into the composite matrix progressively
4. Show progress: "Refining: 3/12 files..." during Tier 2

**Step 1:** Add `cscan-tile` / `cscan-complete` handling to WebSocket hook.

**Step 2:** Add `sendGateAdjust` to the hook's public API.

**Step 3:** Update landing page to send Tier 2 request on gate release and handle progressive updates.

**Step 4:** Add progress indicator to C-scan overlay.

**Step 5:** Run `npm run typecheck`.

**Step 6:** Commit.

---

## Implementation Order & Dependencies

```
Phase 1: Companion Envelope Generation
  Task 1 (max-pool utility)           ← no dependencies
  Task 2 (envelope in composite)      ← depends on Task 1
  Task 3 (send envelope in response)  ← depends on Task 2

Phase 2: Browser Worker + Parsing
  Task 4 (parse envelope)             ← depends on Task 3
  Task 5 (thickness worker)           ← no dependencies (can parallel with Task 4)
  Task 6 (useThicknessEngine hook)    ← depends on Task 5

Phase 3: Wire It Up
  Task 7 (CscanHeatmap override prop) ← no dependencies
  Task 8 (landing page wiring)        ← depends on Tasks 4, 6, 7

Phase 4: Tier 2 Full Resolution
  Task 9 (full-res computation)       ← no dependencies
  Task 10 (WS gate-adjust + tiles)    ← depends on Task 9
  Task 11 (browser tile handling)     ← depends on Task 10
```

**Parallelizable:** Tasks 1+5+7+9 can all be worked on independently.

**Minimum viable demo:** Tasks 1-8 give you live gate dragging with Tier 1 precision. Tasks 9-11 add the final full-resolution refinement.

---

## Testing Strategy

- **Task 1:** Unit test max_pool_1d with known arrays (e.g., [1,2,3,4,5,6] with 2 bins → [2,5] via max pooling)
- **Task 2:** Integration test — generate a small composite, verify envelope shape matches grid dimensions
- **Task 3:** Test binary response size includes envelope bytes
- **Task 4:** Unit test parseCompositeResponse with a mock response containing envelope
- **Task 5:** Unit test worker with synthetic envelope — known gate crossing → known thickness
- **Task 6:** Integration test — hook receives envelope, returns thickness
- **Task 7:** Verify CscanHeatmap renders thicknessOverride when provided
- **Task 8:** End-to-end — drag gate, C-scan updates live
- **Task 9:** Unit test — compare full-res computation against known thickness values
- **Task 10:** WebSocket test — send gate-adjust, receive tiles
- **Task 11:** End-to-end — release gate, see progressive refinement

## Performance Targets

| Operation | Target | Method |
|-----------|--------|--------|
| Gate drag (visible region) | <5ms | Worker + frustum culling |
| Gate drag (full grid, Tier 1) | <100ms | Worker + temporal reprojection |
| Threshold drag | <5ms | Worker, most points unchanged |
| Tier 2 first tile | <1s | Stream first file result immediately |
| Tier 2 complete | <5s | All files processed, final result |
| Envelope cache RAM | <300 MB | uint8 × 30 samples per point |
| Initial generation overhead | +5-10s | Envelope extraction added to composite |
