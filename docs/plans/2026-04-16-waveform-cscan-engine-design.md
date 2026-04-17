# Waveform-Based C-Scan Engine — Design Document

## Problem

The current C-scan composite is generated from `RawCScan` — pre-computed gate results baked into the NDE files by the OmniScan instrument. The user cannot adjust gate positions or thresholds interactively because the companion would need to reprocess the raw A-scan waveforms, which is too slow for interactive use (5-15s for 12 files).

OmniPC solves this by keeping waveform data in memory and recomputing thickness live. We need the same experience for a multi-file composite.

## Architecture

### Core Idea: Progressive Tiered Rendering

During composite generation, cache downsampled rectified waveform envelopes for the full time axis. When the user adjusts gates, recompute thickness from the cached data instantly. Refine progressively with higher resolution tiers.

### Data Flow

```
Initial Generation (one-time, 15-25s):
  1. Read each file's AScanAmplitude from HDF5
  2. Stitch onto unified composite grid (same as today)
  3. For each point on the grid, compute rectified envelope of full time axis
  4. Downsample into Tier 0 (8 samples) and Tier 1 (30 samples)
  5. Cache in companion RAM (~500 MB)
  6. Compute initial thickness with default gates
  7. Send composite to browser (same as today)

Gate Adjustment (interactive):
  1. User drags gate on A-scan canvas
  2. Browser sends new gate positions via WebSocket
  3. Companion recomputes thickness from Tier 0 cache (~20ms)
  4. Sends updated thickness matrix to browser
  5. If drag pauses >100ms, recompute from Tier 1 (~80ms), send update
  6. On mouse release, recompute from HDF5 at full resolution (3-5s)
  7. Send final thickness matrix — C-scan silently sharpens

Threshold Adjustment (instant):
  1. User drags gate threshold up/down
  2. Companion applies amplitude filter on cached peak amplitudes
  3. ~10ms recomputation, sends updated matrix
  4. No tiered refinement needed — amplitude data is already exact
```

### What Gets Cached

For each point on the unified composite grid (n_index × n_scan):

**Tier 0 — 8 samples per point, full time axis:**
```
n_points × 8 × 1 byte (uint8, rectified 0-255) = ~50 MB for 6.3M points
```
- Covers full time axis (e.g., 0-15µs), each sample spans ~2µs
- Resolution: sufficient for coarse gate placement during drag
- Recompute time: ~20ms (vectorized NumPy)

**Tier 1 — 30 samples per point, full time axis:**
```
n_points × 30 × 1 byte = ~189 MB for 6.3M points
```
- Each sample spans ~0.5µs
- Resolution: sufficient for accurate gate placement
- Recompute time: ~80ms

**Per-point metadata — 8 bytes per point:**
```
n_points × 8 bytes = ~50 MB
```
- time_axis_start (float16): start of time axis in µs
- time_axis_end (float16): end of time axis in µs  
- peak_amplitude (uint8 × 3 gates): peak amplitude within each file's original gate
- file_index (uint8): which source file this point came from

**Total cached: ~290 MB for a 6.3M point composite**

**Tier 2 — full resolution from HDF5 (no cache, read on demand)**
- Only triggered on gate release (final render)
- Reads time slices within the gate window from each HDF5 file
- Full int16 precision, all original time samples

### Companion Cache Lifecycle

```python
class CompositeCache:
    """Holds downsampled waveform data for interactive gate adjustment."""
    
    tier0: np.ndarray        # (n_index, n_scan, 8) uint8 — rectified envelope
    tier1: np.ndarray        # (n_index, n_scan, 30) uint8 — rectified envelope
    time_start_us: float     # start of time axis
    time_end_us: float       # end of time axis
    velocity: float          # sound velocity for thickness computation
    
    # Source file info for Tier 2 full-resolution reads
    file_map: list[FileMapping]  # which file covers which grid region
```

- Created during `create_composite` (adds ~5-10s to generation time)
- Held in `file_cache["composite_cache"]` (one active composite at a time)
- Replaced on next composite generation
- ~290 MB RAM footprint

### Threshold Crossing Algorithm (Vectorized)

For Tier 0/1, finding the crossing time for all points simultaneously:

```python
def compute_thickness_vectorized(
    envelope: np.ndarray,      # (n_points, n_samples) uint8
    time_start: float,         # µs
    time_end: float,           # µs
    gate_start: float,         # µs  
    gate_end: float,           # µs
    threshold: int,            # 0-255 (uint8 scale)
    velocity: float,           # m/s
) -> np.ndarray:               # (n_points,) float32 thickness in mm
    
    n_samples = envelope.shape[1]
    sample_duration = (time_end - time_start) / (n_samples - 1)
    
    # Convert gate times to sample indices
    i_start = max(0, int((gate_start - time_start) / sample_duration))
    i_end = min(n_samples, int((gate_end - time_start) / sample_duration) + 1)
    
    # Slice to gate window
    window = envelope[:, i_start:i_end]  # (n_points, gate_samples)
    
    # Find first crossing: where amplitude >= threshold
    above = window >= threshold
    
    # argmax on a boolean array returns index of first True (or 0 if none)
    first_crossing = np.argmax(above, axis=1)
    has_crossing = np.any(above, axis=1)
    
    # Convert sample index back to time
    crossing_time_us = time_start + (i_start + first_crossing) * sample_duration
    crossing_time_us = np.where(has_crossing, crossing_time_us, np.nan)
    
    return crossing_time_us
```

Thickness from two gates:
```python
ref_time = compute_crossing(envelope, ..., ref_gate_start, ref_gate_end, ref_threshold)
meas_time = compute_crossing(envelope, ..., meas_gate_start, meas_gate_end, meas_threshold)
thickness = (meas_time - ref_time) * velocity / 2.0  # in mm (if times in seconds)
```

### WebSocket Protocol Extension

Add a new message type for gate adjustment:

**Browser → Companion:**
```json
{
  "type": "gate-adjust",
  "gates": {
    "I": { "startUs": 2.1, "endUs": 4.5, "thresholdPct": 40.0 },
    "A": { "startUs": 5.0, "endUs": 8.0, "thresholdPct": 50.0 },
    "B": { "startUs": 9.0, "endUs": 12.0, "thresholdPct": 30.0 }
  },
  "tier": 0
}
```

The `tier` field indicates which resolution to use:
- `0` — sent during active drag (fast, coarse)
- `1` — sent when drag pauses (medium, accurate)
- `2` — sent on mouse release (full resolution, async)

**Companion → Browser:**

For Tier 0/1 (fast, in-memory):
```json
{ "type": "cscan-update", "tier": 0, "seq": 123 }
```
Followed by a binary frame: the recomputed thickness matrix as gzipped float32 (same format as composite, ~2-5 MB compressed for 6.3M points).

For Tier 2 (slow, from disk):
```json
{ "type": "cscan-update", "tier": 2, "seq": 124 }
```
Followed by the same binary format. Browser replaces the composite matrix in place.

### Browser-Side Handling

The browser treats each `cscan-update` as a replacement for `composite.matrix`:
1. Decompress the float32 matrix
2. Replace `composite.matrix` in state (keep existing axes, stats recalculate)
3. CscanHeatmap re-renders via existing pipeline
4. If a Tier 0 update arrives while Tier 2 is in flight, the Tier 0 is applied immediately; when Tier 2 finishes, it replaces the Tier 0 result (seq ordering prevents stale updates)

### Envelope Generation During Composite Creation

During `create_composite`, after stitching each file's thickness data:

```python
# For each file, read the full amplitude dataset and build envelope
with h5py.File(fi.path, "r") as f:
    amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]
    n_scan, n_index_file, n_time = amp_ds.shape
    
    # Process in scan-line chunks to limit RAM
    for chunk_start in range(0, n_scan, CHUNK_SIZE):
        chunk_end = min(chunk_start + CHUNK_SIZE, n_scan)
        waveforms = amp_ds[chunk_start:chunk_end, :, :]  # (chunk, n_index, n_time)
        
        # Rectify
        rectified = np.abs(waveforms.astype(np.float32))
        
        # Normalize to 0-255
        max_val = rectified.max()
        if max_val > 0:
            rectified = (rectified / max_val * 255).astype(np.uint8)
        
        # Downsample time axis via max-pooling (preserves peaks)
        tier0_chunk = max_pool_1d(rectified, 8)   # (chunk, n_index, 8)
        tier1_chunk = max_pool_1d(rectified, 30)   # (chunk, n_index, 30)
        
        # Place into unified grid (same spatial mapping as thickness)
        for si in range(chunk_end - chunk_start):
            scan_mm = file_scan_start + (chunk_start + si) * scan_res
            gi_x = round((scan_mm - grid_scan_min) / grid_scan_res)
            for ii in range(n_index_file):
                idx_mm = file_index_start + ii * index_res
                gi_y = round((idx_mm - grid_index_min) / grid_index_res)
                tier0_grid[gi_y, gi_x, :] = tier0_chunk[si, ii, :]
                tier1_grid[gi_y, gi_x, :] = tier1_chunk[si, ii, :]
```

**Max-pool downsampling** preserves peak amplitudes (critical for threshold crossing):
```python
def max_pool_1d(data: np.ndarray, n_bins: int) -> np.ndarray:
    """Downsample last axis via max-pooling. Shape: (..., time) → (..., n_bins)."""
    n_time = data.shape[-1]
    bin_size = n_time // n_bins
    trimmed = data[..., :bin_size * n_bins]
    reshaped = trimmed.reshape(*data.shape[:-1], n_bins, bin_size)
    return reshaped.max(axis=-1)
```

### Performance Budget

| Operation | Time | Notes |
|-----------|------|-------|
| Initial composite + envelope cache | 15-25s | One-time, adds ~5-10s to current generation |
| Gate drag (Tier 0, 20ms) | ~20ms | During active drag, 50fps feel |
| Gate pause (Tier 1, 80ms) | ~80ms | Swap after 100ms pause |
| Gate release (Tier 2) | 3-5s | Full resolution from HDF5, background |
| Threshold drag | ~10ms | Amplitude filter on peak cache, instant |
| Send compressed matrix | ~50ms | Gzip float32 6.3M points = ~5 MB |

### Limitations

- **~290 MB RAM** for the composite cache. Acceptable for a desktop companion app.
- **Tier 0 precision**: ~2µs per sample means crossing time accuracy is ±1µs. At 5900 m/s (steel), that's ±3mm thickness error. Visually acceptable during drag; corrected at Tier 1 (±0.25µs = ±0.7mm) and Tier 2 (exact).
- **Tier 2 takes 3-5s**: user sees a brief "Refining..." state after releasing the gate. Could be reduced by caching more data (trade RAM for speed).
- **One composite at a time**: the cache is replaced on each new composite generation. Switching between composites requires regeneration.

### Implementation Phases

1. **Cache infrastructure** — Add `CompositeCache` to companion, generate Tier 0/1 envelopes during `create_composite`
2. **Gate adjustment endpoint** — Add `gate-adjust` WebSocket message handling, vectorized thickness recomputation
3. **Browser integration** — Wire gate drag events to WebSocket, handle progressive `cscan-update` responses
4. **Tier 2 refinement** — Background full-resolution recomputation on gate release
