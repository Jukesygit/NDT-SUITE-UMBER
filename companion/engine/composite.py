"""
Multi-file composite generation engine.

Reads NDE files from multiple folders, extracts thickness data from each,
and stitches them into a single unified grid using spatial coordinates.
Supports cooperative cancellation via an abort flag.
"""

import logging
import os
import threading
from typing import Optional

import numpy as np

from .cscan_export import extract_cscan, GATE_MODE_MAP
from .envelope import extract_envelope_chunk, ENVELOPE_SAMPLES
from .models import CompositeResult, FileIndex, GateControlParams
from .nde_reader import index_file

logger = logging.getLogger(__name__)


def create_composite(
    base_directory: str,
    folders: list[str],
    gate_params: GateControlParams,
    abort_flag: Optional[threading.Event] = None,
    progress_callback: Optional[callable] = None,
) -> CompositeResult:
    """Generate a composite thickness grid from NDE files across multiple folders.

    Each file's thickness grid is placed at its spatial coordinates in the
    unified output grid. Overlapping points use the last-written value.

    Args:
        base_directory: Root directory containing the subfolders.
        folders: List of subfolder names to process.
        gate_params: Gate control parameters for thickness extraction.
        abort_flag: Optional threading.Event; if set, processing stops early.

    Returns:
        CompositeResult with the unified thickness grid, axes, and metadata.

    Raises:
        ValueError: If no valid files are found or all folders are invalid.
    """
    # Phase 1: Index all files from all folders
    all_files: list[FileIndex] = []
    warnings: list[dict] = []

    for folder_name in folders:
        if abort_flag and abort_flag.is_set():
            raise _AbortedError()

        folder_path = os.path.join(base_directory, folder_name)
        if not os.path.isdir(folder_path):
            warnings.append({"filename": folder_name, "reason": "Folder not found"})
            continue

        nde_paths = sorted(
            f for f in os.listdir(folder_path) if f.lower().endswith(".nde")
        )
        for nde_name in nde_paths:
            if abort_flag and abort_flag.is_set():
                raise _AbortedError()

            fi = index_file(os.path.join(folder_path, nde_name))
            if fi is None:
                warnings.append({"filename": nde_name, "reason": "Could not index file"})
                continue
            if not fi.rawcscan_available:
                warnings.append({"filename": nde_name, "reason": "No RawCScan data"})
                continue
            all_files.append(fi)

    if not all_files:
        raise ValueError("No valid NDE files found in the specified folders")

    # Time axis info from first file (assumed consistent across files)
    _first_ta = all_files[0].time_axis
    time_start_us = _first_ta.offset * 1e6
    time_end_us = (_first_ta.offset + (_first_ta.quantity - 1) * _first_ta.resolution) * 1e6
    composite_velocity = all_files[0].velocity

    # Phase 2: Determine unified grid bounds and resolution
    # Use the finest resolution among all files
    scan_res_m = min(fi.scan_axis.resolution for fi in all_files)
    index_res_m = min(fi.index_axis.resolution for fi in all_files)

    scan_min_mm = min(fi.scan_axis.range_mm[0] for fi in all_files)
    scan_max_mm = max(fi.scan_axis.range_mm[1] for fi in all_files)
    index_min_mm = min(fi.index_axis.range_mm[0] for fi in all_files)
    index_max_mm = max(fi.index_axis.range_mm[1] for fi in all_files)

    scan_res_mm = scan_res_m * 1000
    index_res_mm = index_res_m * 1000

    # Build unified axis arrays
    n_scan = max(1, int(round((scan_max_mm - scan_min_mm) / scan_res_mm)) + 1)
    n_index = max(1, int(round((index_max_mm - index_min_mm) / index_res_mm)) + 1)

    x_axis = np.linspace(scan_min_mm, scan_max_mm, n_scan, dtype=np.float32)
    y_axis = np.linspace(index_min_mm, index_max_mm, n_index, dtype=np.float32)

    # Unified grids — NaN = no data
    matrix = np.full((n_index, n_scan), np.nan, dtype=np.float32)
    amplitude = np.full((n_index, n_scan), np.nan, dtype=np.float32)
    envelope = np.zeros((n_index, n_scan, ENVELOPE_SAMPLES), dtype=np.uint8)

    # Phase 3: Extract each file and place into grid
    source_files: list[dict] = []
    total_files = len(all_files)

    for file_idx, fi in enumerate(all_files):
        if abort_flag and abort_flag.is_set():
            raise _AbortedError()

        if progress_callback:
            progress_callback({
                "stage": "processing",
                "file": fi.filename,
                "fileIndex": file_idx,
                "totalFiles": total_files,
                "pct": round(file_idx / total_files * 100),
            })

        try:
            cscan = extract_cscan(fi, gate_params)
        except ValueError as e:
            warnings.append({"filename": fi.filename, "reason": str(e)})
            continue

        # Map file axes into unified grid indices
        file_scan_start_mm = fi.scan_axis.offset * 1000
        file_index_start_mm = fi.index_axis.offset * 1000

        for si in range(cscan.data.shape[0]):
            scan_mm = file_scan_start_mm + si * fi.scan_axis.resolution * 1000
            gi_x = int(round((scan_mm - scan_min_mm) / scan_res_mm))
            if gi_x < 0 or gi_x >= n_scan:
                continue

            for ii in range(cscan.data.shape[1]):
                idx_mm = file_index_start_mm + ii * fi.index_axis.resolution * 1000
                gi_y = int(round((idx_mm - index_min_mm) / index_res_mm))
                if gi_y < 0 or gi_y >= n_index:
                    continue

                val = cscan.data[si, ii]
                if not np.isnan(val):
                    matrix[gi_y, gi_x] = np.float32(val)
                    amplitude[gi_y, gi_x] = cscan.amplitude[si, ii]

        source_files.append({
            "filename": fi.filename,
            "minX": float(fi.scan_axis.range_mm[0]),
            "maxX": float(fi.scan_axis.range_mm[1]),
            "minY": float(fi.index_axis.range_mm[0]),
            "maxY": float(fi.index_axis.range_mm[1]),
        })

        # --- Envelope extraction (for interactive gate adjustment) ---
        if progress_callback:
            progress_callback({
                "stage": "envelope",
                "file": fi.filename,
                "fileIndex": file_idx,
                "totalFiles": total_files,
                "pct": round((file_idx + 0.5) / total_files * 100),
            })
        ENV_CHUNK = 50  # scan lines per chunk to limit RAM
        for env_start in range(0, fi.scan_axis.quantity, ENV_CHUNK):
            if abort_flag and abort_flag.is_set():
                raise _AbortedError()

            env_end = min(env_start + ENV_CHUNK, fi.scan_axis.quantity)
            try:
                env_chunk = extract_envelope_chunk(fi, env_start, env_end)
            except Exception as e:
                logger.warning("Envelope extraction failed for %s chunk %d: %s", fi.filename, env_start, e)
                continue

            # Map into unified grid (same spatial mapping as thickness)
            for si in range(env_end - env_start):
                scan_mm = file_scan_start_mm + (env_start + si) * fi.scan_axis.resolution * 1000
                gi_x = int(round((scan_mm - scan_min_mm) / scan_res_mm))
                if gi_x < 0 or gi_x >= n_scan:
                    continue
                for ii in range(fi.index_axis.quantity):
                    idx_mm = file_index_start_mm + ii * fi.index_axis.resolution * 1000
                    gi_y = int(round((idx_mm - index_min_mm) / index_res_mm))
                    if gi_y < 0 or gi_y >= n_index:
                        continue
                    envelope[gi_y, gi_x, :] = env_chunk[si, ii, :]

    # Phase 4: Compute stats
    valid_mask = ~np.isnan(matrix)
    valid_count = int(np.count_nonzero(valid_mask))
    total_count = n_scan * n_index

    if valid_count > 0:
        valid_values = matrix[valid_mask]
        stats = {
            "min": float(np.nanmin(valid_values)),
            "max": float(np.nanmax(valid_values)),
            "mean": float(np.nanmean(valid_values)),
            "std": float(np.nanstd(valid_values)),
            "validCount": valid_count,
            "totalCount": total_count,
            "coveragePct": round(valid_count / total_count * 100, 2),
        }
    else:
        stats = {
            "min": 0.0, "max": 0.0, "mean": 0.0, "std": 0.0,
            "validCount": 0, "totalCount": total_count, "coveragePct": 0.0,
        }

    return CompositeResult(
        matrix=matrix,
        amplitude=amplitude,
        envelope=envelope,
        time_start_us=time_start_us,
        time_end_us=time_end_us,
        velocity=composite_velocity,
        x_axis=x_axis,
        y_axis=y_axis,
        width=n_scan,
        height=n_index,
        stats=stats,
        source_files=source_files,
        warnings=warnings,
    )


class _AbortedError(Exception):
    """Raised when composite generation is cancelled via abort flag."""
    pass
