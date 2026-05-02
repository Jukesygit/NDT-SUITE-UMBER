"""
Full-resolution thickness computation from raw A-scan waveforms.

Reads AScanAmplitude from HDF5, applies gate windows and thresholds,
and computes crossing-time-based thickness at full sample rate.
This is the Tier 2 computation — accurate final result after the user
releases a gate drag in the browser.
"""

import numpy as np
import h5py
from .models import FileIndex

CHUNK_SIZE = 50  # scan lines per chunk to limit RAM


def compute_thickness_full_res(
    file_index: FileIndex,
    ref_gate_start_us: float,
    ref_gate_end_us: float,
    ref_threshold_pct: float,
    meas_gate_start_us: float,
    meas_gate_end_us: float,
    meas_threshold_pct: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute thickness from raw waveforms at full time resolution.

    Args:
        file_index: Indexed NDE file with path and axis info.
        ref_gate_start_us: Reference gate start in microseconds.
        ref_gate_end_us: Reference gate end in microseconds.
        ref_threshold_pct: Reference gate threshold (0-200%).
        meas_gate_start_us: Measurement gate start in microseconds.
        meas_gate_end_us: Measurement gate end in microseconds.
        meas_threshold_pct: Measurement gate threshold (0-200%).

    Returns:
        Tuple of (thickness_grid, amplitude_grid) both (n_scans, n_index) float32.
        NaN where no crossing is found.
    """
    sa = file_index.scan_axis
    ia = file_index.index_axis
    ta = file_index.time_axis
    n_scans = sa.quantity
    n_index = ia.quantity
    n_time = ta.quantity
    velocity = file_index.velocity

    # Time axis in microseconds
    time_us = np.arange(n_time, dtype=np.float64) * (ta.resolution * 1e6) + (ta.offset * 1e6)

    # Gate sample ranges (clamped to valid indices)
    ref_i0 = max(0, int(np.searchsorted(time_us, ref_gate_start_us)))
    ref_i1 = min(n_time, int(np.searchsorted(time_us, ref_gate_end_us)))
    meas_i0 = max(0, int(np.searchsorted(time_us, meas_gate_start_us)))
    meas_i1 = min(n_time, int(np.searchsorted(time_us, meas_gate_end_us)))

    # Threshold in int16 scale (0-200% maps to 0-32767)
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

            # --- Reference gate crossing (vectorized) ---
            if ref_i1 > ref_i0:
                ref_window = rectified[:, :, ref_i0:ref_i1]
                ref_above = ref_window >= ref_thresh
                ref_first = np.argmax(ref_above, axis=2)  # first True index
                ref_has = np.any(ref_above, axis=2)
                ref_time = np.where(ref_has, time_us[ref_i0 + ref_first], np.nan)
            else:
                ref_time = np.full((chunk_end - chunk_start, n_index), np.nan)

            # --- Measurement gate crossing (vectorized) ---
            if meas_i1 > meas_i0:
                meas_window = rectified[:, :, meas_i0:meas_i1]
                meas_above = meas_window >= meas_thresh
                meas_first = np.argmax(meas_above, axis=2)
                meas_has = np.any(meas_above, axis=2)
                meas_time = np.where(meas_has, time_us[meas_i0 + meas_first], np.nan)

                # Peak amplitude in measurement window (for filtering)
                meas_peak = meas_window.max(axis=2) / 32767.0 * 200.0
            else:
                meas_time = np.full((chunk_end - chunk_start, n_index), np.nan)
                meas_peak = np.full((chunk_end - chunk_start, n_index), np.nan, dtype=np.float32)

            # Thickness = (meas_time - ref_time) * velocity / 2
            # times in µs, velocity in m/s → result in mm
            delta_us = meas_time - ref_time
            chunk_thickness = (delta_us * 1e-6) * velocity / 2.0 * 1000.0

            thickness_grid[chunk_start:chunk_end, :] = chunk_thickness.astype(np.float32)
            amplitude_grid[chunk_start:chunk_end, :] = meas_peak.astype(np.float32)

    return thickness_grid, amplitude_grid
