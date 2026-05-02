from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class AxisInfo:
    offset: float      # meters
    quantity: int       # number of samples
    resolution: float   # meters per sample

    @property
    def range_mm(self) -> tuple[float, float]:
        start = self.offset * 1000
        end = start + (self.quantity - 1) * self.resolution * 1000
        return (start, end)


@dataclass
class GateInfo:
    id: int
    name: str
    sync_mode: str          # "Pulse" or "GateRelative"
    sync_gate_id: Optional[int]  # for GateRelative
    start: float            # seconds
    length: float           # seconds
    threshold: float        # percent (0-100)
    detection: str          # "Crossing" or "FirstPeak"


@dataclass
class ThicknessProcessInfo:
    """Thickness measurement config from the NDE file's thickness process."""
    min_mm: Optional[float]   # Minimum valid thickness (mm), None if not set
    max_mm: Optional[float]   # Maximum valid thickness (mm), None if not set
    gate_ids: list[int]       # Gate IDs used [measurement, reference]
    gate_detection: str       # "Crossing" or "FirstPeak"


@dataclass
class ProbeInfo:
    model: str           # e.g. "7.5L64-I4"
    serie: str           # e.g. "I4"
    frequency_mhz: float # e.g. 7.5

@dataclass
class WedgeInfo:
    model: str           # e.g. "HydroFORM"
    serie: str           # e.g. "SI4"

@dataclass
class EquipmentInfo:
    model: str           # e.g. "OmniScan X4 - 16:64PR"
    serial_number: str   # e.g. "QC-0096426"
    platform: str        # e.g. "OmniScan X4"

@dataclass
class SpecimenInfo:
    material_name: str           # e.g. "Steel_Mild"
    nominal_thickness_mm: float  # e.g. 20.0
    longitudinal_velocity: float # e.g. 5890.0
    transversal_velocity: Optional[float] = None
    density: Optional[float] = None

@dataclass
class ScannerInfo:
    name: str            # e.g. "HydroFORM2"
    encoder_mode: str    # e.g. "Quadrature"


@dataclass
class FileIndex:
    path: str
    filename: str
    size_mb: float
    scan_axis: AxisInfo
    index_axis: AxisInfo
    time_axis: AxisInfo
    gates: list[GateInfo]
    beam_count: int
    velocity: float
    wave_mode: str
    valid_point_count: int
    n_gates_in_rawcscan: int  # usually 3
    rawcscan_available: bool
    rawcscan_chunk_valid: bool  # True if chunks == (1, n_index, n_gates)
    thickness_process: Optional[ThicknessProcessInfo] = None

    # Rich metadata (from Properties + Setup)
    creation_date: Optional[str] = None      # ISO 8601 from Properties
    modification_date: Optional[str] = None  # ISO 8601 from Properties
    probe: Optional[ProbeInfo] = None
    wedge: Optional[WedgeInfo] = None
    equipment: Optional[EquipmentInfo] = None
    specimen: Optional[SpecimenInfo] = None
    scanner: Optional[ScannerInfo] = None


@dataclass
class GateControlParams:
    gate_mode: str = "A-I"                  # "A-I" or "B-A"
    ref_recovery: str = "peak_fallback"      # "crossing_only" or "peak_fallback"
    meas_recovery: str = "peak_fallback"
    min_amplitude_ref: int = 0              # raw int32 scale (0-32767)
    min_amplitude_meas: int = 0
    thickness_min: Optional[float] = None   # mm
    thickness_max: Optional[float] = None   # mm

    @staticmethod
    def pct_to_raw(pct: float) -> int:
        """Convert 0-100% amplitude to raw int32 scale (0-200% maps to 0-32767)."""
        return int(pct / 200.0 * 32767)

    @staticmethod
    def from_file_defaults(file_index) -> "GateControlParams":
        """Create GateControlParams matching OmniPC default behavior.

        OmniPC filters by gate status (rejects saturated measurement gate),
        not by thickness range. Thickness min/max from the file are available
        for optional user-applied filtering but not enabled by default.
        """
        return GateControlParams()


@dataclass
class CscanResult:
    data: np.ndarray            # (n_scans, n_index) float64, NaN = no data
    amplitude: np.ndarray       # (n_scans, n_index) float32, measurement gate amplitude % (0-200)
    scan_axis_mm: np.ndarray    # (n_scans,)
    index_axis_mm: np.ndarray   # (n_index,)
    velocity: float
    valid_count: int
    total_count: int
    gate_mode: str
    stats: dict                 # min, max, mean, std


@dataclass
class RegionData:
    waveforms: np.ndarray       # (scan_count, index_count, time_samples) int16
    status: np.ndarray          # (scan_count, index_count) uint8
    scan_axis_mm: np.ndarray
    index_axis_mm: np.ndarray
    time_axis_us: np.ndarray
    clipped: bool
    actual_bounds: dict         # scanStartMm, scanEndMm, indexStartMm, indexEndMm


@dataclass
class CompositeResult:
    """Multi-file composite thickness grid."""
    matrix: np.ndarray          # (height, width) float32, NaN = no data
    amplitude: np.ndarray       # (height, width) float32, meas gate amplitude % (0-200), NaN = no data
    envelope: np.ndarray        # (height, width, ENVELOPE_SAMPLES) uint8, rectified envelope
    time_start_us: float        # start of time axis in µs
    time_end_us: float          # end of time axis in µs
    velocity: float             # sound velocity in m/s
    x_axis: np.ndarray          # (width,) float32 — scan axis mm
    y_axis: np.ndarray          # (height,) float32 — index axis mm
    width: int
    height: int
    stats: dict                 # min, max, mean, std, validCount, totalCount, coveragePct
    source_files: list[dict]    # [{filename, minX, maxX, minY, maxY}, ...]
    warnings: list[dict]        # [{filename, reason}, ...]
