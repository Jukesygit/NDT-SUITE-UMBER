"""
Region extraction module.

Slices A-scan waveform data from HDF5 NDE files for a given spatial region,
returning waveform arrays and status for B-scan/A-scan rendering.
"""

import logging

import h5py
import numpy as np

from .models import FileIndex, RegionData

logger = logging.getLogger(__name__)

MAX_REGION_MM = 300.0


def extract_region(
    file_index: FileIndex,
    scan_start_mm: float,
    scan_end_mm: float,
    index_start_mm: float,
    index_end_mm: float,
) -> RegionData:
    """Extract A-scan waveforms for a spatial region from the NDE file.

    Raises ValueError if region exceeds 300x300mm.
    """
    scan_span = scan_end_mm - scan_start_mm
    index_span = index_end_mm - index_start_mm

    if scan_span > MAX_REGION_MM or index_span > MAX_REGION_MM:
        raise ValueError(
            f"Region too large for detailed analysis ({scan_span:.0f}x{index_span:.0f}mm). "
            f"Maximum is {MAX_REGION_MM}x{MAX_REGION_MM}mm. "
            "Draw a smaller annotation or zoom in."
        )

    # Convert mm to array indices
    sa = file_index.scan_axis
    ia = file_index.index_axis
    ta = file_index.time_axis

    scan_i0 = _mm_to_index(scan_start_mm, sa.offset, sa.resolution)
    scan_i1 = _mm_to_index(scan_end_mm, sa.offset, sa.resolution)
    idx_i0 = _mm_to_index(index_start_mm, ia.offset, ia.resolution)
    idx_i1 = _mm_to_index(index_end_mm, ia.offset, ia.resolution)

    # Clamp to valid range
    clipped = False
    scan_i0_c = max(0, min(scan_i0, sa.quantity - 1))
    scan_i1_c = max(0, min(scan_i1, sa.quantity))
    idx_i0_c = max(0, min(idx_i0, ia.quantity - 1))
    idx_i1_c = max(0, min(idx_i1, ia.quantity))

    if scan_i0_c != scan_i0 or scan_i1_c != scan_i1 or idx_i0_c != idx_i0 or idx_i1_c != idx_i1:
        clipped = True

    scan_i0, scan_i1 = scan_i0_c, scan_i1_c
    idx_i0, idx_i1 = idx_i0_c, idx_i1_c

    # Ensure we have at least 1 point in each dimension
    if scan_i1 <= scan_i0:
        scan_i1 = scan_i0 + 1
    if idx_i1 <= idx_i0:
        idx_i1 = idx_i0 + 1

    with h5py.File(file_index.path, "r") as f:
        waveforms = f["Public/Groups/0/Datasets/0-AScanAmplitude"][scan_i0:scan_i1, idx_i0:idx_i1, :]
        status = f["Public/Groups/0/Datasets/1-AScanStatus"][scan_i0:scan_i1, idx_i0:idx_i1]

    # Build axis arrays from actual indices
    n_scans = scan_i1 - scan_i0
    n_idx = idx_i1 - idx_i0
    n_time = ta.quantity

    scan_axis_mm = np.array([
        (sa.offset + i * sa.resolution) * 1000 for i in range(scan_i0, scan_i1)
    ])
    index_axis_mm = np.array([
        (ia.offset + i * ia.resolution) * 1000 for i in range(idx_i0, idx_i1)
    ])
    time_axis_us = np.array([
        ta.offset * 1e6 + i * ta.resolution * 1e6 for i in range(n_time)
    ])

    actual_bounds = {
        "scanStartMm": float(scan_axis_mm[0]) if len(scan_axis_mm) > 0 else scan_start_mm,
        "scanEndMm": float(scan_axis_mm[-1]) if len(scan_axis_mm) > 0 else scan_end_mm,
        "indexStartMm": float(index_axis_mm[0]) if len(index_axis_mm) > 0 else index_start_mm,
        "indexEndMm": float(index_axis_mm[-1]) if len(index_axis_mm) > 0 else index_end_mm,
    }

    return RegionData(
        waveforms=waveforms,
        status=status,
        scan_axis_mm=scan_axis_mm,
        index_axis_mm=index_axis_mm,
        time_axis_us=time_axis_us,
        clipped=clipped,
        actual_bounds=actual_bounds,
    )


def _mm_to_index(mm: float, offset: float, resolution: float) -> int:
    """Convert a position in mm to an array index."""
    if resolution == 0:
        return 0
    return round((mm / 1000.0 - offset) / resolution)
