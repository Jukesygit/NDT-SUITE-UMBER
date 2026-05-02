"""
Calibration file analysis for step-wedge NDE scans.

Extracts thickness grids from calibration NDE files, detects step-wedge
thickness steps via histogram peak detection, and assembles structured
calibration data for the web app's calibration scan log.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy.signal import find_peaks

from .cscan_export import extract_cscan
from .models import FileIndex, GateControlParams

logger = logging.getLogger(__name__)


@dataclass
class StepMeasurement:
    nominal_mm: float
    measured_mm: float
    std_mm: float
    reading_count: int
    is_reference: bool


@dataclass
class CalibrationResult:
    filename: str
    setup_file: str
    cal_date: Optional[str]
    scan_start_mm: float
    scan_end_mm: float
    velocity: float
    ref_a_wt: Optional[float]
    meas_a_wt: Optional[float]
    steps: list[StepMeasurement]
    # Equipment metadata
    equipment_model: Optional[str]
    equipment_serial: Optional[str]
    probe_model: Optional[str]
    probe_frequency_mhz: Optional[float]
    wedge_model: Optional[str]
    material: Optional[str]
    beam_count: int


def detect_steps(
    thickness_grid: np.ndarray,
    nominal_thickness_mm: Optional[float] = None,
    bin_width_mm: float = 0.25,
    min_peak_distance_mm: float = 3.0,
    min_reading_count: int = 50,
    cluster_radius_mm: float = 1.0,
) -> list[StepMeasurement]:
    """Detect step-wedge thickness steps from a thickness grid.

    1. Flatten valid (non-NaN) values
    2. Histogram with fine bins
    3. Find peaks in histogram
    4. For each peak: filter readings within cluster_radius, compute median + std
    5. Flag the step closest to nominal_thickness_mm as reference
    """
    valid = thickness_grid[~np.isnan(thickness_grid)]
    if len(valid) < min_reading_count:
        logger.warning("Too few valid readings (%d) for step detection", len(valid))
        return []

    # Build histogram
    lo = float(np.floor(valid.min()))
    hi = float(np.ceil(valid.max()))
    bins = np.arange(lo, hi + bin_width_mm, bin_width_mm)
    counts, edges = np.histogram(valid, bins=bins)
    bin_centers = (edges[:-1] + edges[1:]) / 2

    # Find peaks
    min_distance_bins = max(1, int(min_peak_distance_mm / bin_width_mm))
    peak_indices, properties = find_peaks(
        counts,
        distance=min_distance_bins,
        height=min_reading_count,
    )

    if len(peak_indices) == 0:
        logger.warning("No peaks found in thickness histogram")
        return []

    # Build step measurements from each peak
    steps: list[StepMeasurement] = []
    for idx in peak_indices:
        center = bin_centers[idx]
        cluster = valid[
            (valid >= center - cluster_radius_mm)
            & (valid <= center + cluster_radius_mm)
        ]
        if len(cluster) < min_reading_count:
            continue

        measured = float(np.median(cluster))
        # Round nominal to nearest common step (whole mm or 0.5mm)
        nominal = round(measured * 2) / 2  # round to nearest 0.5mm
        nominal = round(nominal)  # then to nearest whole mm

        steps.append(StepMeasurement(
            nominal_mm=nominal,
            measured_mm=round(measured, 3),
            std_mm=round(float(np.std(cluster)), 3),
            reading_count=len(cluster),
            is_reference=False,
        ))

    # Sort by nominal thickness
    steps.sort(key=lambda s: s.nominal_mm)

    # Flag reference step (closest to specimen nominal thickness)
    if nominal_thickness_mm is not None and steps:
        closest = min(steps, key=lambda s: abs(s.nominal_mm - nominal_thickness_mm))
        closest.is_reference = True

    return steps


def extract_calibration(file_index: FileIndex) -> Optional[CalibrationResult]:
    """Extract full calibration data from an NDE file.

    Runs C-scan thickness extraction, detects step-wedge steps, and
    assembles a CalibrationResult for the API response.
    """
    try:
        params = GateControlParams.from_file_defaults(file_index)
        cscan = extract_cscan(file_index, params)
    except (ValueError, Exception) as exc:
        logger.warning("Could not extract C-scan from %s: %s", file_index.filename, exc)
        return None

    # Specimen nominal thickness for reference step detection
    nominal_mm = None
    if file_index.specimen:
        nominal_mm = file_index.specimen.nominal_thickness_mm

    steps = detect_steps(cscan.data, nominal_thickness_mm=nominal_mm)

    # measAWt from reference step
    ref_step = next((s for s in steps if s.is_reference), None)
    meas_a_wt = ref_step.measured_mm if ref_step else None

    # Scan range
    scan_start = float(cscan.scan_axis_mm[0])
    scan_end = float(cscan.scan_axis_mm[-1])

    return CalibrationResult(
        filename=file_index.filename,
        setup_file=_get_scenario(file_index),
        cal_date=file_index.creation_date,
        scan_start_mm=round(scan_start, 1),
        scan_end_mm=round(scan_end, 1),
        velocity=file_index.velocity,
        ref_a_wt=nominal_mm,
        meas_a_wt=meas_a_wt,
        steps=steps,
        equipment_model=file_index.equipment.model if file_index.equipment else None,
        equipment_serial=file_index.equipment.serial_number if file_index.equipment else None,
        probe_model=file_index.probe.model if file_index.probe else None,
        probe_frequency_mhz=file_index.probe.frequency_mhz if file_index.probe else None,
        wedge_model=file_index.wedge.model if file_index.wedge else None,
        material=file_index.specimen.material_name if file_index.specimen else None,
        beam_count=file_index.beam_count,
    )


def _get_scenario(file_index: FileIndex) -> str:
    """Read scenario name from the NDE file's Setup JSON."""
    import json
    import h5py

    try:
        with h5py.File(file_index.path, "r") as f:
            raw = f["Public/Setup"][()]
            if isinstance(raw, bytes):
                setup = json.loads(raw.decode("utf-8"))
            else:
                setup = json.loads(raw.tobytes().decode("utf-8"))
            return setup.get("scenario", "")
    except Exception:
        return ""
