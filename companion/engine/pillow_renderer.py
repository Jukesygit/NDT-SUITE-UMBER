"""
Fast image renderer for B-scan and A-scan views using Pillow.

Designed for the Scan Viewer's interactive cursors — target 5-15ms render time.
Uses Pillow (PIL) instead of matplotlib for 10-50x faster rendering.

B-scans are rendered as color-mapped images from waveform amplitude data.
A-scans are rendered as waveform line plots on a transparent background.
"""

import io
import logging
import time

import h5py
import numpy as np
from PIL import Image, ImageDraw

from .models import FileIndex

logger = logging.getLogger(__name__)

# Jet colormap LUT (256 entries, RGB)
_JET_LUT = None


def _get_jet_lut() -> np.ndarray:
    """Build a 256-entry jet colormap as (256, 3) uint8 array."""
    global _JET_LUT
    if _JET_LUT is not None:
        return _JET_LUT

    lut = np.zeros((256, 3), dtype=np.uint8)
    for i in range(256):
        t = i / 255.0
        # Approximate jet colormap
        r = np.clip(1.5 - abs(4.0 * t - 3.0), 0, 1)
        g = np.clip(1.5 - abs(4.0 * t - 2.0), 0, 1)
        b = np.clip(1.5 - abs(4.0 * t - 1.0), 0, 1)
        lut[i] = [int(r * 255), int(g * 255), int(b * 255)]

    _JET_LUT = lut
    return _JET_LUT


def _linearize_bscan(
    slice_data: np.ndarray,
    gates: list,
    time_axis_offset: float,
    time_axis_resolution: float,
) -> np.ndarray:
    """Apply per-beam delay correction to straighten B-scan signals.

    Finds the interface echo (Gate I / Pulse-sync gate) in each beam's
    waveform and shifts all beams to align them.  This corrects for the
    per-beam geometric path differences visible as slanted echoes in the
    raw B-scan.

    Args:
        slice_data: (n_spatial, n_time_samples) int16 waveform slice.
        gates: list of GateInfo from the FileIndex.
        time_axis_offset: time axis offset in seconds.
        time_axis_resolution: time axis resolution in seconds per sample.

    Returns:
        Corrected slice_data with same shape, or the original if no
        sync gate is found or correction isn't applicable.
    """
    # Find the Pulse-sync gate (Gate I) — this marks the interface echo
    sync_gate = None
    for g in gates:
        if g.sync_mode == "Pulse":
            sync_gate = g
            break
    if sync_gate is None:
        return slice_data

    n_spatial, n_samples = slice_data.shape
    rectified = np.abs(slice_data.astype(np.float32))

    # Gate window in sample indices
    t_start_us = time_axis_offset * 1e6
    t_res_us = time_axis_resolution * 1e6
    g_start_us = sync_gate.start * 1e6
    g_end_us = (sync_gate.start + sync_gate.length) * 1e6
    i0 = max(0, int((g_start_us - t_start_us) / t_res_us))
    i1 = min(n_samples, int((g_end_us - t_start_us) / t_res_us))

    if i1 <= i0:
        return slice_data

    # Find crossing position per beam (use 20% threshold for envelope data)
    thresh = 20.0 / 200.0 * 32767.0
    crossing_indices = np.full(n_spatial, -1, dtype=np.int32)

    for s in range(n_spatial):
        for i in range(i0, i1):
            if rectified[s, i] >= thresh:
                crossing_indices[s] = i
                break

    # Compute shifts relative to the median crossing position
    valid = crossing_indices[crossing_indices >= 0]
    if len(valid) < n_spatial * 0.3:
        logger.warning(
            "Linearize: only %d/%d beams crossed (%.0f%%), skipping correction",
            len(valid), n_spatial, len(valid) / n_spatial * 100,
        )
        return slice_data

    ref_index = int(np.median(valid))
    shifts = np.where(crossing_indices >= 0, crossing_indices - ref_index, 0)
    max_shift = int(np.max(np.abs(shifts)))

    logger.info(
        "Linearize: %d/%d beams crossed, ref=%d, max_shift=%d samples",
        len(valid), n_spatial, ref_index, max_shift,
    )

    # Apply shifts (roll each row)
    corrected = np.zeros_like(slice_data)
    for s in range(n_spatial):
        if shifts[s] != 0:
            corrected[s, :] = np.roll(slice_data[s, :], -shifts[s])
        else:
            corrected[s, :] = slice_data[s, :]

    return corrected


def render_bscan_pillow(
    file_index: FileIndex,
    axis: str,
    scan_mm: float,
    index_mm: float,
    width: int = 600,
    height: int = 300,
) -> tuple[bytes, float]:
    """Render a B-scan cross-section as PNG using Pillow.

    Args:
        file_index: Indexed NDE file.
        axis: "axial" or "index".
        scan_mm: Scan position in mm (used as slice position for index B-scan).
        index_mm: Index position in mm (used as slice position for axial B-scan).
        width: Output image width in pixels.
        height: Output image height in pixels.

    Returns:
        Tuple of (PNG bytes, render time in ms).
    """
    t0 = time.perf_counter()

    # Extract a thin region around the slice position
    sa = file_index.scan_axis
    ia = file_index.index_axis
    scan_range = sa.range_mm
    index_range = ia.range_mm

    if axis not in ("axial", "index"):
        raise ValueError(f"axis must be 'axial' or 'index', got '{axis}'")

    # Read a thin 1-sample-wide slice directly from HDF5 for maximum speed.
    # This bypasses extract_region's 300mm limit since B-scans span the full axis.
    with h5py.File(file_index.path, "r") as f:
        amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]

        if axis == "axial":
            # Slice at index_mm → one index row, all scan positions
            idx_i = _mm_to_index(index_mm, ia.offset, ia.resolution, ia.quantity)
            slice_data = amp_ds[:, idx_i, :]  # (n_scans, time_samples)
        else:
            # Slice at scan_mm → one scan row, all index positions
            scan_i = _mm_to_index(scan_mm, sa.offset, sa.resolution, sa.quantity)
            slice_data = amp_ds[scan_i, :, :]  # (n_index, time_samples)

    # Linearize: straighten per-beam delays for the index B-scan
    # (the axial B-scan slices one beam across scan positions — no beam delay)
    if axis == "index":
        slice_data = _linearize_bscan(
            slice_data,
            file_index.gates,
            file_index.time_axis.offset,
            file_index.time_axis.resolution,
        )

    # Rectify and normalize to 0-255
    display = np.abs(slice_data.astype(np.float32))
    max_val = display.max()
    if max_val > 0:
        display = display / max_val * 255.0
    display = display.astype(np.uint8)

    # Apply jet colormap
    lut = _get_jet_lut()
    # display shape: (spatial, time) → transpose to (time, spatial) for image (Y=time, X=spatial)
    display_t = display.T  # (time_samples, spatial_count)
    rgb = lut[display_t]   # (time_samples, spatial_count, 3)

    # Resize to target dimensions
    img = Image.fromarray(rgb, "RGB")
    img = img.resize((width, height), Image.BILINEAR)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)

    render_ms = (time.perf_counter() - t0) * 1000
    return buf.getvalue(), render_ms


def render_ascan_pillow(
    file_index: FileIndex,
    scan_mm: float,
    index_mm: float,
    width: int = 400,
    height: int = 200,
) -> tuple[bytes, float]:
    """Render an A-scan waveform as PNG using Pillow.

    Args:
        file_index: Indexed NDE file.
        scan_mm: Scan position in mm.
        index_mm: Index position in mm.
        width: Output image width in pixels.
        height: Output image height in pixels.

    Returns:
        Tuple of (PNG bytes, render time in ms).
    """
    t0 = time.perf_counter()

    sa = file_index.scan_axis
    ia = file_index.index_axis

    scan_i = _mm_to_index(scan_mm, sa.offset, sa.resolution, sa.quantity)
    idx_i = _mm_to_index(index_mm, ia.offset, ia.resolution, ia.quantity)

    with h5py.File(file_index.path, "r") as f:
        waveform = f["Public/Groups/0/Datasets/0-AScanAmplitude"][scan_i, idx_i, :]

    waveform = waveform.astype(np.float32)
    # Normalize to 0-200% scale (UT convention: 32767 = 200%)
    waveform_pct = waveform / 32767.0 * 200.0

    # Draw waveform on image
    img = Image.new("RGB", (width, height), (20, 20, 30))
    draw = ImageDraw.Draw(img)

    # Map waveform to pixel coordinates
    n_samples = len(waveform_pct)
    y_min, y_max = -10.0, 210.0  # amplitude range with padding
    y_range = y_max - y_min

    margin_x = 2
    plot_w = width - 2 * margin_x

    points = []
    for i in range(n_samples):
        x = margin_x + int(i / max(n_samples - 1, 1) * plot_w)
        y = height - int((waveform_pct[i] - y_min) / y_range * height)
        y = max(0, min(height - 1, y))
        points.append((x, y))

    # Draw zero line
    zero_y = height - int((0 - y_min) / y_range * height)
    draw.line([(margin_x, zero_y), (width - margin_x, zero_y)], fill=(60, 60, 80), width=1)

    # Draw waveform
    if len(points) > 1:
        draw.line(points, fill=(80, 160, 255), width=1)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=False)

    render_ms = (time.perf_counter() - t0) * 1000
    return buf.getvalue(), render_ms


def _mm_to_index(mm: float, offset: float, resolution: float, quantity: int) -> int:
    """Convert a position in mm to a clamped array index."""
    if resolution == 0:
        return 0
    idx = round((mm / 1000.0 - offset) / resolution)
    return max(0, min(quantity - 1, idx))
