"""
C-scan extraction engine.

Reads RawCScan data from NDE/HDF5 files, applies gate control filters,
and produces thickness grids and CSV exports matching the NDT Suite webapp format.
"""

import logging
import os
from typing import Optional

import h5py
import numpy as np

from .models import CscanResult, FileIndex, GateControlParams

logger = logging.getLogger(__name__)

# Gate mode → (reference_gate_index, measurement_gate_index) in RawCScan
GATE_MODE_MAP = {
    "A-I": (0, 1),  # Gate I as reference, Gate A as measurement
    "B-A": (1, 2),  # Gate A as reference, Gate B as measurement
}


def get_gate_time(gate_bytes: bytes, recovery_mode: str, min_amplitude: int) -> Optional[float]:
    """Extract time from a 24-byte gate struct.

    Returns crossing/peak time in seconds, or None if rejected.

    Struct layout (little-endian):
      0-3:   int32   status (0=valid, 1=saturated, 2=no crossing, 4=dep failed, 16=no data)
      4-7:   int32   amplitude (0-32767)
      8-11:  float32 crossing_time (seconds)
      12-15: float32 peak_time (seconds)
      16-19: float32 gate_start (seconds)
      20-23: float32 gate_end (seconds)
    """
    status = np.frombuffer(gate_bytes[0:4], dtype=np.int32)[0]
    amp = np.frombuffer(gate_bytes[4:8], dtype=np.int32)[0]

    if amp < min_amplitude:
        return None

    if status in (0, 1):
        return float(np.frombuffer(gate_bytes[8:12], dtype=np.float32)[0])
    elif status == 2 and recovery_mode == "peak_fallback":
        return float(np.frombuffer(gate_bytes[12:16], dtype=np.float32)[0])

    return None


def extract_cscan(file_index: FileIndex, params: GateControlParams) -> CscanResult:
    """Extract thickness C-scan from RawCScan using vectorized numpy operations.

    Returns CscanResult with thickness grid, axis arrays, and stats.
    """
    if not file_index.rawcscan_available:
        raise ValueError(f"File {file_index.filename} does not contain RawCScan data")

    gate_ids = GATE_MODE_MAP.get(params.gate_mode)
    if gate_ids is None:
        raise ValueError(f"Unknown gate mode: {params.gate_mode}")

    ref_gate_id, meas_gate_id = gate_ids
    n_gates = file_index.n_gates_in_rawcscan

    if ref_gate_id >= n_gates or meas_gate_id >= n_gates:
        raise ValueError(
            f"Gate mode {params.gate_mode} requires gate indices {gate_ids}, "
            f"but file only has {n_gates} gates in RawCScan"
        )

    velocity = file_index.velocity
    n_scans = file_index.scan_axis.quantity
    n_index = file_index.index_axis.quantity

    thickness_grid = np.full((n_scans, n_index), np.nan, dtype=np.float64)
    amplitude_grid = np.full((n_scans, n_index), np.nan, dtype=np.float32)

    with h5py.File(file_index.path, "r") as f:
        ds = f["Private/MXU/RawCScan"]
        chunks = ds.chunks or (1, n_index, n_gates)
        scan_chunk_size = chunks[0]

        for chunk_start in range(0, n_scans, scan_chunk_size):
            chunk_end = min(chunk_start + scan_chunk_size, n_scans)
            try:
                _, raw_chunk = ds.id.read_direct_chunk((chunk_start, 0, 0))
            except RuntimeError:
                # Chunk not allocated — scanner didn't reach this position
                continue
            actual_scans = chunk_end - chunk_start
            # Chunk may be padded to full chunk_size even if fewer valid scan lines remain
            raw_arr = np.frombuffer(raw_chunk, dtype=np.uint8)
            chunk_scans_allocated = len(raw_arr) // (n_index * n_gates * 24)
            chunk_arr = raw_arr.reshape(chunk_scans_allocated, n_index, n_gates, 24)

            for local_i in range(actual_scans):
                scan_i = chunk_start + local_i
                scan_data = chunk_arr[local_i]

                # --- Reference gate (vectorized) ---
                ref = scan_data[:, ref_gate_id]
                ref_status = np.frombuffer(ref[:, 0:4].tobytes(), dtype=np.int32)
                ref_amp = np.frombuffer(ref[:, 4:8].tobytes(), dtype=np.int32)
                ref_crossing = np.frombuffer(ref[:, 8:12].tobytes(), dtype=np.float32)
                ref_peak = np.frombuffer(ref[:, 12:16].tobytes(), dtype=np.float32)

                ref_valid = ((ref_status == 0) | (ref_status == 1)) & (ref_amp >= params.min_amplitude_ref)
                ref_recovered = (
                    (ref_status == 2)
                    & (params.ref_recovery == "peak_fallback")
                    & (ref_amp >= params.min_amplitude_ref)
                )
                ref_time = np.where(ref_valid, ref_crossing, np.where(ref_recovered, ref_peak, np.nan))

                # --- Measurement gate (vectorized) ---
                meas = scan_data[:, meas_gate_id]
                meas_status = np.frombuffer(meas[:, 0:4].tobytes(), dtype=np.int32)
                meas_amp = np.frombuffer(meas[:, 4:8].tobytes(), dtype=np.int32)
                meas_crossing = np.frombuffer(meas[:, 8:12].tobytes(), dtype=np.float32)
                meas_peak = np.frombuffer(meas[:, 12:16].tobytes(), dtype=np.float32)

                meas_valid = (meas_status == 0) & (meas_amp >= params.min_amplitude_meas)
                meas_recovered = (
                    (meas_status == 2)
                    & (params.meas_recovery == "peak_fallback")
                    & (meas_amp >= params.min_amplitude_meas)
                )
                meas_time = np.where(meas_valid, meas_crossing, np.where(meas_recovered, meas_peak, np.nan))

                # --- Thickness computation ---
                thickness = (meas_time - ref_time) * velocity / 2.0 * 1000.0

                # Apply thickness range filters
                if params.thickness_min is not None:
                    thickness[thickness < params.thickness_min] = np.nan
                if params.thickness_max is not None:
                    thickness[thickness > params.thickness_max] = np.nan

                thickness_grid[scan_i, :] = thickness
                # Store measurement gate amplitude as percentage (0-200%)
                amplitude_grid[scan_i, :] = meas_amp.astype(np.float32) / 32767.0 * 200.0

    # Build axis arrays
    scan_axis_mm = np.array([
        file_index.scan_axis.offset * 1000 + i * file_index.scan_axis.resolution * 1000
        for i in range(n_scans)
    ])
    index_axis_mm = np.array([
        file_index.index_axis.offset * 1000 + i * file_index.index_axis.resolution * 1000
        for i in range(n_index)
    ])

    valid_mask = ~np.isnan(thickness_grid)
    valid_count = int(np.count_nonzero(valid_mask))
    total_count = n_scans * n_index

    valid_values = thickness_grid[valid_mask]
    stats = {}
    if valid_count > 0:
        stats = {
            "min": float(np.nanmin(valid_values)),
            "max": float(np.nanmax(valid_values)),
            "mean": float(np.nanmean(valid_values)),
            "std": float(np.nanstd(valid_values)),
        }
    else:
        stats = {"min": 0.0, "max": 0.0, "mean": 0.0, "std": 0.0}

    return CscanResult(
        data=thickness_grid,
        amplitude=amplitude_grid,
        scan_axis_mm=scan_axis_mm,
        index_axis_mm=index_axis_mm,
        velocity=velocity,
        valid_count=valid_count,
        total_count=total_count,
        gate_mode=params.gate_mode,
        stats=stats,
    )


def cscan_to_csv(
    result: CscanResult,
    output_path: str,
    file_index: FileIndex,
    params: GateControlParams,
) -> None:
    """Write C-scan thickness data as a tab-delimited CSV matching webapp format.

    Format:
        Min Thickness (mm)=X.X
        Max Thickness (mm)=X.X
        IndexStart (mm)=X.X
        ScanStart (mm)=X.X
        Velocity (m/s)=X.X
        Gate=A (Crossing)
        mm\t0.0\t1.0\t2.0\t...
        4000.0\t15.2\t15.3\tND\t...
    """
    # Build gate description for header
    gate_ids = GATE_MODE_MAP[params.gate_mode]
    meas_gate_id = gate_ids[1]
    if meas_gate_id < len(file_index.gates):
        gate = file_index.gates[meas_gate_id]
        gate_desc = f"{gate.name} ({gate.detection})"
    else:
        gate_desc = f"Gate {meas_gate_id}"

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with open(output_path, "w", encoding="utf-8", newline="") as f:
        # Header
        f.write(f"Min Thickness (mm)={result.stats['min']:.1f}\n")
        f.write(f"Max Thickness (mm)={result.stats['max']:.1f}\n")
        f.write(f"IndexStart (mm)={result.index_axis_mm[0]:.1f}\n")
        f.write(f"ScanStart (mm)={result.scan_axis_mm[0]:.1f}\n")
        f.write(f"Velocity (m/s)={result.velocity:.1f}\n")
        f.write(f"Gate={gate_desc}\n")

        # Column header row: "mm" followed by scan axis values
        scan_headers = "\t".join(f"{v:.1f}" for v in result.scan_axis_mm)
        f.write(f"mm\t{scan_headers}\n")

        # Data rows: index value, then thickness values
        for idx_i in range(len(result.index_axis_mm)):
            row_values = []
            for scan_i in range(len(result.scan_axis_mm)):
                val = result.data[scan_i, idx_i]
                if np.isnan(val):
                    row_values.append("ND")
                else:
                    row_values.append(f"{val:.1f}")
            row_str = "\t".join(row_values)
            f.write(f"{result.index_axis_mm[idx_i]:.1f}\t{row_str}\n")

    logger.info("Exported C-scan CSV to %s (%d/%d valid)", output_path, result.valid_count, result.total_count)
