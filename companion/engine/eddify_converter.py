"""
Eddify/Gekko .capture_acq  ➜  Evident .nde converter.

This module provides parsers for the three core file types inside a
.capture_acq directory:

  1. root.xml           — XML configuration (probe, wedge, specimen, gates, axes)
  2. data_peaks_*.bin   — Per-gate peak amplitude + sound-path tables
  3. data.bin           — Raw A-scan waveform frames

And converter functions to produce Evident-compatible .nde (HDF5) files:

  4. build_setup_json   — Create the Public/Setup JSON structure
  5. build_rawcscan_for_scan — Convert one scan line of peak data to RawCScan
  6. convert_capture_acq — Full end-to-end conversion
"""

from __future__ import annotations

import json
import logging
import re
import struct
from pathlib import Path
from typing import Any, Optional
from xml.etree import ElementTree as ET

import h5py
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FRAME_HEADER_SIZE = 136          # bytes at the start of beam-0 in each frame
FRAME_MAGIC = 0xFFCEACEA         # magic uint32 at offset 0 of every frame
BEAM_SLOT_SIZE = 3848            # bytes per beam slot (header+waveform or waveform)
PEAK_HEADER_SIZE = 20            # bytes in the data_peaks header
PEAK_RECORD_SIZE = 8             # float32 sound_path + float32 amplitude

# ---------------------------------------------------------------------------
# XML helpers
# ---------------------------------------------------------------------------

XSI = "{http://www.w3.org/2001/XMLSchema-instance}"


def _text(el: Optional[ET.Element], path: str, default: str = "") -> str:
    """Return stripped text of a sub-element, or *default* if missing."""
    if el is None:
        return default
    node = el.find(path)
    if node is None or node.text is None:
        return default
    return node.text.strip()


def _float(el: Optional[ET.Element], path: str, default: float = 0.0) -> float:
    """Return float value of a sub-element, or *default*."""
    raw = _text(el, path)
    if not raw:
        return default
    try:
        return float(raw)
    except (ValueError, TypeError):
        return default


def _int(el: Optional[ET.Element], path: str, default: int = 0) -> int:
    """Return int value of a sub-element, or *default*."""
    raw = _text(el, path)
    if not raw:
        return default
    try:
        return int(float(raw))
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# Task 1 — XML parser
# ---------------------------------------------------------------------------

def parse_eddify_xml(xml_path: str) -> dict[str, Any]:
    """Parse a root.xml from a .capture_acq directory.

    Returns a dict with keys:
        probe, wedge, specimen, gates, scan_axis, index_axis,
        sampling_period_ns, beam_count
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    # ---- Probe (transducer > sonde) ----
    transducer = root.find(".//transducer")
    sonde = transducer.find("sonde") if transducer is not None else None
    decoupage = sonde.find("decoupage") if sonde is not None else None

    probe = {
        "model": _text(transducer, "idNom"),
        "frequency": _float(sonde, "freqCentrale"),
        "elements": _int(decoupage, "nbElements"),
        "pitch": _float(decoupage, "pitch"),
    }

    # ---- Wedge (transducer > sabot) ----
    sabot = transducer.find("sabot") if transducer is not None else None
    geo_sabot = sabot.find("geometrieSabot") if sabot is not None else None
    wedge_type = (geo_sabot.attrib.get(f"{XSI}type", "") if geo_sabot is not None else "")

    wedge = {
        "name": _text(sabot, "idNom"),
        "velocity": _float(geo_sabot, "vitesse"),
        "angle": 0.0 if "Plat" in wedge_type or "plat" in wedge_type.lower() else _float(geo_sabot, "angle"),
        "height": _float(geo_sabot, "hauteur"),
    }

    # ---- Specimen (piece > geometrie / materiau) ----
    piece = root.find(".//piece")
    geometrie = piece.find("geometrie") if piece is not None else None
    materiau = piece.find("materiau") if piece is not None else None

    specimen = {
        "material": _text(materiau, "idNom"),
        "thickness": _float(geometrie, "epaisseur"),
        "velocity_l": _float(materiau, "vitesseOndeL"),
        "velocity_t": _float(materiau, "vitesseOndeT"),
        "density": _float(materiau, "density"),
    }

    # ---- Gates (calibration > rafales > rafale > portes) ----
    gates: list[dict[str, Any]] = []
    portes_el = root.find(".//calibration/rafales/rafale/portes")
    if portes_el is not None:
        for gate_el in portes_el:
            if gate_el.tag not in ("porte", "porteSynchro"):
                continue
            enr = _text(gate_el, "enregistrement")
            if enr != "pic":
                continue
            range_el = gate_el.find("range")
            threshold_el = gate_el.find("threshold")
            gate: dict[str, Any] = {
                "id": _int(gate_el, "id"),
                "type": gate_el.tag,
                "sound_path_start": _float(range_el, "start"),
                "sound_path_end": _float(range_el, "end"),
                "threshold": _float(threshold_el, "level"),
                "detection": _text(gate_el, "detection"),
                "sync_mode": _text(gate_el, "synchronisation"),
                "synchro_id": _int(gate_el, "synchroId"),
            }
            gates.append(gate)

    # ---- Scan axis (trajectory > firstAxis with type Encoded) ----
    scan_axis: dict[str, Any] = {}
    index_axis: dict[str, Any] = {}

    for traj in root.iter("trajectory"):
        first = traj.find("firstAxis")
        second = traj.find("secondAxis")

        if first is not None:
            ftype = first.attrib.get(f"{XSI}type", "")
            if "Encoded" in ftype:
                scan_axis = {
                    "start": _float(first, "start"),
                    "end": _float(first, "end"),
                    "step": _float(first, "step"),
                }
        if second is not None:
            stype = second.attrib.get(f"{XSI}type", "")
            if "Increment" in stype:
                index_axis = {
                    "start": _float(second, "start"),
                    "end": _float(second, "end"),
                    "step": _float(second, "step"),
                }

        # Take the first trajectory that has both axes populated
        if scan_axis and index_axis:
            break

    # ---- Sampling period ----
    sampling_period_ns = 0
    sp_el = root.find(".//samplingPeriod")
    if sp_el is not None and sp_el.text:
        try:
            sampling_period_ns = int(float(sp_el.text.strip()))
        except (ValueError, TypeError):
            pass

    # ---- Beam count ----
    beam_count = len(list(root.iter("beamCharacteristics")))

    # ---- Waveform time window (rafaleParamAcq) ----
    # depart = waveform start time in µs
    # profondeur = waveform depth (duration) in µs
    waveform_start_us = 0.0
    waveform_depth_us = 0.0
    rafale_acq = root.find(".//rafaleParamAcq")
    if rafale_acq is not None:
        waveform_start_us = _float(rafale_acq, "depart")
        waveform_depth_us = _float(rafale_acq, "profondeur")

    # ---- Encoder resolution (ticks per mm) ----
    encoder_resolution = 0.0
    # Primary: codeur > axe > resolution
    codeur_el = root.find(".//codeur")
    if codeur_el is not None:
        axe_el = codeur_el.find("axe")
        if axe_el is not None:
            encoder_resolution = _float(axe_el, "resolution")
    # Fallback: calibCodeur > resolution
    if encoder_resolution == 0.0:
        calib_codeur = root.find(".//calibCodeur")
        if calib_codeur is not None:
            encoder_resolution = _float(calib_codeur, "resolution")
    # Default
    if encoder_resolution == 0.0:
        encoder_resolution = 37.5

    return {
        "probe": probe,
        "wedge": wedge,
        "specimen": specimen,
        "gates": gates,
        "scan_axis": scan_axis,
        "index_axis": index_axis,
        "sampling_period_ns": sampling_period_ns,
        "beam_count": beam_count,
        "encoder_resolution": encoder_resolution,
        "waveform_start_us": waveform_start_us,
        "waveform_depth_us": waveform_depth_us,
    }


# ---------------------------------------------------------------------------
# Task 2 — Peak data reader
# ---------------------------------------------------------------------------

def read_peak_file(path: str) -> dict[str, Any]:
    """Read a data_peaks_*.bin file.

    Binary layout
    -------------
    Header (20 bytes):
        uint32  n_scans
        uint32  n_beams
        float32 start_angle
        float32 end_angle
        float32 scale

    Data (n_scans * n_beams * 8 bytes):
        Per record: float32 sound_path_mm, float32 amplitude_fsh
        No-peak sentinel: sound_path = +inf, amplitude = 0.0

    Returns
    -------
    dict with keys: n_scans, n_beams, start_angle, end_angle, scale,
                    sound_path (ndarray shape (n_scans, n_beams)),
                    amplitude  (ndarray shape (n_scans, n_beams))
    """
    data = Path(path).read_bytes()

    if len(data) < PEAK_HEADER_SIZE:
        raise ValueError(f"Peak file too small: {len(data)} bytes")

    n_scans, n_beams = struct.unpack_from("<II", data, 0)
    start_angle, end_angle, scale = struct.unpack_from("<fff", data, 8)

    expected = PEAK_HEADER_SIZE + n_scans * n_beams * PEAK_RECORD_SIZE
    if len(data) != expected:
        raise ValueError(
            f"Peak file size mismatch: expected {expected}, got {len(data)}"
        )

    # Parse interleaved (sound_path, amplitude) pairs
    raw = np.frombuffer(data, dtype="<f4", offset=PEAK_HEADER_SIZE)
    raw = raw.reshape(n_scans, n_beams, 2)

    return {
        "n_scans": n_scans,
        "n_beams": n_beams,
        "start_angle": start_angle,
        "end_angle": end_angle,
        "scale": scale,
        "sound_path": raw[:, :, 0].copy(),
        "amplitude": raw[:, :, 1].copy(),
    }


# ---------------------------------------------------------------------------
# Task 3 — Waveform reader
# ---------------------------------------------------------------------------

def get_waveform_dimensions(data_bin_path: str) -> dict[str, int]:
    """Read the first frame header of data.bin to determine dimensions.

    Returns
    -------
    dict with keys: n_frames, n_beams, n_samples, frame_size, beam_size
    """
    file_size = Path(data_bin_path).stat().st_size

    with open(data_bin_path, "rb") as f:
        header = f.read(FRAME_HEADER_SIZE)

    if len(header) < FRAME_HEADER_SIZE:
        raise ValueError("data.bin too small to contain a frame header")

    magic = struct.unpack_from("<I", header, 0)[0]
    if magic != FRAME_MAGIC:
        raise ValueError(
            f"Bad frame magic: expected 0x{FRAME_MAGIC:08X}, "
            f"got 0x{magic:08X}"
        )

    frame_size = struct.unpack_from("<I", header, 4)[0]
    n_beams = struct.unpack_from("<H", header, 76)[0]
    beam_size = BEAM_SLOT_SIZE

    # Uniform sample count: beam-0 header occupies FRAME_HEADER_SIZE bytes
    # which is 136/2 = 68 int16 values; remaining waveform is
    # (BEAM_SLOT_SIZE - FRAME_HEADER_SIZE) / 2 = 1856 samples.
    # Beams 1+ have BEAM_SLOT_SIZE / 2 = 1924 samples.
    # We zero-pad beam 0 so all beams yield 1924 samples.
    n_samples = beam_size // 2  # 1924

    if frame_size == 0:
        raise ValueError("Frame size is zero")

    n_frames = file_size // frame_size

    return {
        "n_frames": n_frames,
        "n_beams": n_beams,
        "n_samples": n_samples,
        "frame_size": frame_size,
        "beam_size": beam_size,
    }


def read_waveform_frame(
    data_bin_path: str,
    frame_idx: int,
    n_beams: int,
) -> np.ndarray:
    """Read a single waveform frame from data.bin.

    Parameters
    ----------
    data_bin_path : path to data.bin
    frame_idx     : 0-based frame index
    n_beams       : number of beams per frame

    Returns
    -------
    ndarray of shape (n_beams, 1924) with dtype int16
    """
    frame_size = n_beams * BEAM_SLOT_SIZE
    n_samples = BEAM_SLOT_SIZE // 2  # 1924

    with open(data_bin_path, "rb") as f:
        f.seek(frame_idx * frame_size)
        raw = f.read(frame_size)

    if len(raw) < frame_size:
        raise ValueError(
            f"Incomplete frame at index {frame_idx}: "
            f"got {len(raw)}, expected {frame_size}"
        )

    out = np.zeros((n_beams, n_samples), dtype=np.int16)

    # Beam 0: first 136 bytes are the frame header, remaining 3712 bytes = 1856 int16
    beam0_waveform_bytes = BEAM_SLOT_SIZE - FRAME_HEADER_SIZE  # 3712
    beam0_samples = beam0_waveform_bytes // 2  # 1856

    beam0_data = np.frombuffer(
        raw, dtype="<i2", count=beam0_samples, offset=FRAME_HEADER_SIZE
    )
    # Left-align beam 0 data (trailing zeros OK, avoids time misalignment)
    out[0, :beam0_samples] = beam0_data

    # Beams 1 .. n_beams-1: full 3848 bytes = 1924 int16 each
    for b in range(1, n_beams):
        offset = b * BEAM_SLOT_SIZE
        beam_data = np.frombuffer(raw, dtype="<i2", count=n_samples, offset=offset)
        out[b, :] = beam_data

    return out


# ---------------------------------------------------------------------------
# Raster grid helpers
# ---------------------------------------------------------------------------


def read_frame_positions(
    data_bin_path: str, n_frames: int, n_beams: int
) -> dict[str, np.ndarray]:
    """Read scan position and sweep ID from all frame headers in data.bin.

    Each frame header contains:
      - offset 20: int32 scan position in encoder ticks (within current sweep)
      - offset 36: int32 sweep/index number (0-based)

    Returns dict with:
        scan_ticks: int32 array (n_frames,) — scan position ticks per frame
        sweep_ids:  int32 array (n_frames,) — sweep number per frame
    """
    frame_size = n_beams * BEAM_SLOT_SIZE
    scan_ticks = np.zeros(n_frames, dtype=np.int32)
    sweep_ids = np.zeros(n_frames, dtype=np.int32)
    with open(data_bin_path, "rb") as f:
        for i in range(n_frames):
            f.seek(i * frame_size + 20)
            raw = f.read(20)  # bytes 20..39
            scan_ticks[i] = struct.unpack_from("<i", raw, 0)[0]   # offset 20
            sweep_ids[i] = struct.unpack_from("<i", raw, 16)[0]   # offset 36
    return {"scan_ticks": scan_ticks, "sweep_ids": sweep_ids}


def build_raster_grid(
    scan_ticks: np.ndarray,
    sweep_ids: np.ndarray,
    encoder_resolution: float,
    scan_step_mm: float,
    scan_length_mm: float,
    index_start_mm: float,
    index_end_mm: float,
    index_step_mm: float,
    n_beams: int,
    probe_pitch_mm: float = 1.0,
) -> dict[str, Any]:
    """Build a merged raster grid from frame header scan positions and sweep IDs.

    Each frame has a direct scan position (ticks within the current sweep)
    and a sweep ID indicating which index band it belongs to.  Beams within
    each sweep map to absolute index positions:
        index_mm = index_start + sweep_id * index_step + beam * probe_pitch

    The index axis is clipped to [index_start, index_end] (inclusive).
    Where sweeps overlap, later frames overwrite earlier ones.

    Returns dict with:
        n_scan_bins, n_sweeps, n_index,
        scan_axis_mm, index_axis_mm,
        frame_map  (n_scan_bins, n_index) of int — frame index or -1,
        beam_map   (n_scan_bins, n_index) of int — beam index or -1
    """
    scan_mm = scan_ticks.astype(np.float64) / encoder_resolution

    n_sweeps = int(sweep_ids.max()) + 1
    n_scan_bins = int(round(scan_length_mm / scan_step_mm)) + 1

    # Index axis: clip to configured range
    n_index = int(round((index_end_mm - index_start_mm) / probe_pitch_mm)) + 1

    scan_axis_mm = np.arange(n_scan_bins, dtype=np.float64) * scan_step_mm
    index_axis_mm = np.arange(n_index, dtype=np.float64) * probe_pitch_mm + index_start_mm

    frame_map = np.full((n_scan_bins, n_index), -1, dtype=np.int32)
    beam_map = np.full((n_scan_bins, n_index), -1, dtype=np.int32)

    for fi in range(len(scan_ticks)):
        sid = int(sweep_ids[fi])
        sp = scan_mm[fi]
        if sp < 0:
            continue

        scan_bin = int(round(sp / scan_step_mm))
        if scan_bin < 0 or scan_bin >= n_scan_bins:
            continue

        for beam in range(n_beams):
            idx_mm = index_start_mm + sid * index_step_mm + beam * probe_pitch_mm
            idx_bin = int(round((idx_mm - index_start_mm) / probe_pitch_mm))
            if 0 <= idx_bin < n_index:
                frame_map[scan_bin, idx_bin] = fi
                beam_map[scan_bin, idx_bin] = beam

    filled = int((frame_map >= 0).sum())
    logger.info(
        "Raster grid: %d scan bins × %d index positions "
        "(%d sweeps × %d beams), %d / %d cells filled (%.1f%%)",
        n_scan_bins, n_index, n_sweeps, n_beams,
        filled, n_scan_bins * n_index,
        100.0 * filled / max(n_scan_bins * n_index, 1),
    )

    return {
        "n_scan_bins": n_scan_bins,
        "n_sweeps": n_sweeps,
        "n_index": n_index,
        "scan_axis_mm": scan_axis_mm,
        "index_axis_mm": index_axis_mm,
        "frame_map": frame_map,
        "beam_map": beam_map,
    }


# ---------------------------------------------------------------------------
# Gate ordering: eddify gate IDs → NDE gate indices
# ---------------------------------------------------------------------------

# Eddify gate 31 (synchronisante) → NDE gate 0 (Gate I, sync=Pulse)
# Eddify gate  0 (synchronisee)   → NDE gate 1 (Gate A, sync=GateRelative to 0)
# Eddify gate  1 (non)            → NDE gate 2 (Gate B, sync=Pulse)
EDDIFY_GATE_ORDER = [31, 0, 1]
NDE_GATE_NAMES = ["Gate I", "Gate A", "Gate B"]
NDE_GATE_COUNT = 3

_RAWCSCAN_STRUCT = struct.Struct("<iiffff")  # 24 bytes


# ---------------------------------------------------------------------------
# Task 4 — Build Setup JSON
# ---------------------------------------------------------------------------

def build_setup_json(
    config: dict[str, Any],
    n_scans: int,
    n_samples: int,
    *,
    n_index: Optional[int] = None,
    scan_step_m: Optional[float] = None,
    index_offset_m: Optional[float] = None,
    probe_pitch_m: Optional[float] = None,
) -> dict[str, Any]:
    """Build an NDE-compatible Setup JSON from parsed eddify config.

    Parameters
    ----------
    config : dict from parse_eddify_xml()
    n_scans : number of scan position bins (UCoordinate quantity)
    n_samples : waveform samples per beam
    n_index : total index positions (VCoordinate quantity); defaults to beam_count
    scan_step_m : scan step in meters; defaults to computed from axis range
    index_offset_m : index axis offset in meters; defaults from index_axis
    probe_pitch_m : VCoordinate resolution in meters; defaults from probe pitch

    Returns
    -------
    dict suitable for JSON serialisation into Public/Setup
    """
    probe_cfg = config["probe"]
    wedge_cfg = config["wedge"]
    specimen_cfg = config["specimen"]
    scan_ax = config["scan_axis"]
    idx_ax = config["index_axis"]
    gates_cfg = config["gates"]
    beam_count = config["beam_count"]
    sampling_period_ns = config["sampling_period_ns"]

    # Velocity — use longitudinal velocity from specimen
    velocity = specimen_cfg["velocity_l"]

    # --- Build gate map by eddify ID ---
    gate_by_id: dict[int, dict] = {g["id"]: g for g in gates_cfg}

    # --- NDE gates ---
    nde_gates = []
    for nde_idx, eddify_id in enumerate(EDDIFY_GATE_ORDER):
        eg = gate_by_id.get(eddify_id)
        if eg is None:
            # Provide a default empty gate
            nde_gates.append({
                "id": nde_idx,
                "name": NDE_GATE_NAMES[nde_idx],
                "start": 0.0,
                "length": 0.0,
                "threshold": 50.0,
                "synchronization": {"mode": "Pulse"},
            })
            continue

        # Eddify "sound path" values are in microseconds, not mm
        start_time = eg["sound_path_start"] * 1e-6
        end_time = eg["sound_path_end"] * 1e-6
        length_time = end_time - start_time
        threshold_pct = eg["threshold"] * 100.0

        sync: dict[str, Any]
        if eg["sync_mode"] == "synchronisante":
            sync = {"mode": "Pulse"}
        elif eg["sync_mode"] == "synchronisee":
            sync = {"mode": "GateRelative", "gateId": 0, "triggeringEvent": "Crossing"}
        else:
            sync = {"mode": "Pulse"}

        nde_gates.append({
            "id": nde_idx,
            "name": NDE_GATE_NAMES[nde_idx],
            "start": start_time,
            "length": length_time,
            "threshold": threshold_pct,
            "synchronization": sync,
        })

    # --- Beams (just indices) ---
    beams = [{"id": i} for i in range(beam_count)]

    # --- Axes / dimensions ---
    scan_start_m = scan_ax.get("start", 0.0) / 1000.0

    if scan_step_m is None:
        scan_end_m = scan_ax.get("end", 0.0) / 1000.0
        scan_range_m = scan_end_m - scan_start_m
        scan_step_m = scan_range_m / max(n_scans - 1, 1)

    if index_offset_m is None:
        index_offset_m = idx_ax.get("start", 0.0) / 1000.0

    if probe_pitch_m is None:
        probe_pitch_m = probe_cfg.get("pitch", 1.0) / 1000.0

    if n_index is None:
        n_index = beam_count

    # Ultrasound axis: use waveform time window from rafaleParamAcq if available
    waveform_start_us = config.get("waveform_start_us", 0.0)
    waveform_depth_us = config.get("waveform_depth_us", 0.0)

    if waveform_depth_us > 0 and n_samples > 1:
        # Waveform covers depart → depart + profondeur in µs
        time_offset = waveform_start_us * 1e-6  # seconds
        time_resolution = (waveform_depth_us * 1e-6) / (n_samples - 1)
    else:
        time_offset = 0.0
        time_resolution = sampling_period_ns * 1e-9

    dimensions = [
        {
            "axis": "UCoordinate",
            "offset": scan_start_m,
            "quantity": n_scans,
            "resolution": scan_step_m,
        },
        {
            "axis": "VCoordinate",
            "offset": index_offset_m,
            "quantity": n_index,
            "resolution": probe_pitch_m,
        },
        {
            "axis": "Ultrasound",
            "offset": time_offset,
            "quantity": n_samples,
            "resolution": time_resolution,
        },
    ]

    # --- Specimen ---
    thickness_m = specimen_cfg["thickness"] / 1000.0
    material = {
        "name": specimen_cfg["material"],
        "longitudinalWave": {"nominalVelocity": specimen_cfg["velocity_l"]},
        "density": specimen_cfg["density"],
    }
    if specimen_cfg["velocity_t"]:
        material["transversalVerticalWave"] = {
            "nominalVelocity": specimen_cfg["velocity_t"],
        }

    setup: dict[str, Any] = {
        "probes": [
            {
                "model": probe_cfg["model"],
                "serie": "",
                "phasedArrayLinear": {
                    "centralFrequency": probe_cfg["frequency"] * 1e6,
                },
            }
        ],
        "wedges": [
            {
                "model": wedge_cfg["name"],
                "serie": "",
            }
        ],
        "specimens": [
            {
                "plateGeometry": {
                    "thickness": thickness_m,
                    "material": material,
                },
            }
        ],
        "acquisitionUnits": [
            {
                "model": "Eddify/Gekko (converted)",
                "serialNumber": "",
                "platform": "Eddify",
            }
        ],
        "motionDevices": [
            {
                "name": "Encoder",
                "encoder": {"mode": "Quadrature"},
            }
        ],
        "groups": [
            {
                "datasets": [
                    {
                        "dimensions": dimensions,
                    }
                ],
                "processes": [
                    {
                        "ultrasonicPhasedArray": {
                            "velocity": velocity,
                            "waveMode": "Longitudinal",
                            "gates": nde_gates,
                            "beams": beams,
                        },
                    }
                ],
            }
        ],
    }
    return setup


# ---------------------------------------------------------------------------
# Task 5 — Build RawCScan for one scan line
# ---------------------------------------------------------------------------

def build_rawcscan_for_scan(
    peaks: dict[int, dict[str, Any]],
    scan_idx: int,
    n_beams: int,
    velocity: float,
) -> np.ndarray:
    """Convert one scan line of eddify peak data into RawCScan format.

    Parameters
    ----------
    peaks : mapping of eddify gate ID (31, 0, 1) to read_peak_file() result
    scan_idx : scan line index
    n_beams : number of beams
    velocity : sound velocity in m/s

    Returns
    -------
    ndarray of shape (n_beams, 3, 24) dtype uint8
    """
    out = np.zeros((n_beams, NDE_GATE_COUNT, 24), dtype=np.uint8)

    # First pass: compute absolute times for the sync gate (eddify 31 → NDE gate 0)
    # so we can add it to the relative gate (eddify 0 → NDE gate 1)
    sync_peak = peaks.get(31)
    sync_times = np.zeros(n_beams, dtype=np.float64)
    if sync_peak is not None:
        for b in range(n_beams):
            sp_val = float(sync_peak["sound_path"][scan_idx, b])
            if np.isfinite(sp_val) and sync_peak["amplitude"][scan_idx, b] > 0:
                sync_times[b] = sp_val * 1e-6

    for gate_nde_idx, eddify_id in enumerate(EDDIFY_GATE_ORDER):
        peak = peaks.get(eddify_id)
        if peak is None:
            # Write no-data structs
            for b in range(n_beams):
                packed = _RAWCSCAN_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0)
                out[b, gate_nde_idx, :] = np.frombuffer(packed, dtype=np.uint8)
            continue

        sp = peak["sound_path"]   # (n_scans, n_beams)
        amp = peak["amplitude"]   # (n_scans, n_beams)

        # Eddify gate 0 (synchronisee) has relative sound paths —
        # add sync gate time to make absolute
        is_relative = (eddify_id == 0)

        for b in range(n_beams):
            sp_val = float(sp[scan_idx, b])
            amp_val = float(amp[scan_idx, b])

            if not np.isfinite(sp_val) or amp_val == 0.0:
                # No peak — mark as no_data
                packed = _RAWCSCAN_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0)
            else:
                status = 0
                nde_amp = int(amp_val * 16383.5)
                nde_amp = max(0, min(32767, nde_amp))
                time_s = sp_val * 1e-6
                if is_relative:
                    time_s += sync_times[b]
                packed = _RAWCSCAN_STRUCT.pack(
                    status,
                    nde_amp,
                    time_s,   # crossing_time
                    time_s,   # peak_time (same — eddify only has one)
                    0.0,      # gate_start
                    0.0,      # gate_end
                )
            out[b, gate_nde_idx, :] = np.frombuffer(packed, dtype=np.uint8)

    return out


# ---------------------------------------------------------------------------
# Task 6 — Helper: property-file parsers
# ---------------------------------------------------------------------------

def _parse_acquisition_date(props_path: str) -> Optional[str]:
    """Parse date from acquisitionInfo.properties.

    Format: date=2026-03-22 at 11\\:34\\:24
    Returns ISO 8601 string or None.
    """
    try:
        text = Path(props_path).read_text(encoding="utf-8-sig")
        for line in text.splitlines():
            if line.startswith("date="):
                raw = line[5:].replace("\\:", ":")
                # "2026-03-22 at 12:05:16" → "2026-03-22T12:05:16"
                raw = raw.replace(" at ", "T")
                return raw
    except Exception:
        pass
    return None


def _parse_platform_info(props_path: str) -> dict[str, str]:
    """Parse plateformInfo.properties.

    Returns dict with keys: productType, sn
    """
    result: dict[str, str] = {"productType": "", "sn": ""}
    try:
        text = Path(props_path).read_text(encoding="utf-8-sig")
        for line in text.splitlines():
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            if key == "productType":
                result["productType"] = val
            elif key == "sn":
                result["sn"] = val
    except Exception:
        pass
    return result


def _parse_amplitude_ref(props_path: str) -> float:
    """Parse PASumAmplitudeRefValue from hardwareInfo.properties.

    Returns the reference amplitude value (default 4095.0).
    """
    try:
        text = Path(props_path).read_text(encoding="utf-8-sig")
        for line in text.splitlines():
            if line.startswith("PASumAmplitudeRefValue="):
                return float(line.split("=", 1)[1].strip())
    except Exception:
        pass
    return 4095.0


# ---------------------------------------------------------------------------
# Task 6 — Full converter
# ---------------------------------------------------------------------------

def convert_capture_acq(capture_dir: str, output_path: str) -> str:
    """Convert an Eddify .capture_acq directory to an Evident .nde file.

    When data.bin is present, encoder positions are read to build a proper
    raster grid (scan_bins × sweeps × beams).  When data.bin is absent
    (peaks-only mode), the old single-strip layout is used as a fallback.

    Parameters
    ----------
    capture_dir : path to the .capture_acq directory
    output_path : desired output .nde file path

    Returns
    -------
    The output file path.
    """
    cap = Path(capture_dir)

    # 1. Parse root.xml
    config = parse_eddify_xml(str(cap / "root.xml"))
    velocity = config["specimen"]["velocity_l"]
    n_beams = config["beam_count"]
    probe_pitch_mm = config["probe"].get("pitch", 1.0)

    # 2. Read all peak files
    peaks: dict[int, dict[str, Any]] = {}
    for eid in EDDIFY_GATE_ORDER:
        peak_path = cap / f"data_peaks_0_{eid}.bin"
        if peak_path.exists():
            peaks[eid] = read_peak_file(str(peak_path))
            logger.info("Read peak file for gate %d: %d scans, %d beams",
                        eid, peaks[eid]["n_scans"], peaks[eid]["n_beams"])

    if not peaks:
        raise FileNotFoundError("No peak files found in capture directory")

    first_peak = next(iter(peaks.values()))
    n_raw_frames = first_peak["n_scans"]

    # 3. Get waveform dimensions and build raster grid
    data_bin_path = cap / "data.bin"
    has_waveforms = data_bin_path.exists()
    wf_dims: Optional[dict] = None
    raster: Optional[dict] = None

    if has_waveforms:
        wf_dims = get_waveform_dimensions(str(data_bin_path))
        n_samples = wf_dims["n_samples"]
        logger.info("Waveform dimensions: %d frames, %d beams, %d samples",
                     wf_dims["n_frames"], wf_dims["n_beams"], n_samples)

        # Read frame positions (scan ticks + sweep IDs) and build raster grid
        frame_pos = read_frame_positions(
            str(data_bin_path), wf_dims["n_frames"], wf_dims["n_beams"]
        )
        scan_ax = config["scan_axis"]
        idx_ax = config["index_axis"]
        scan_length_mm = scan_ax["end"] - scan_ax["start"]
        scan_step_mm = scan_ax.get("step", 1.0)
        index_start_mm = idx_ax.get("start", 0.0)
        index_end_mm = idx_ax.get("end", index_start_mm)
        index_step_mm = idx_ax.get("step", 1.0)

        raster = build_raster_grid(
            scan_ticks=frame_pos["scan_ticks"],
            sweep_ids=frame_pos["sweep_ids"],
            encoder_resolution=config["encoder_resolution"],
            scan_step_mm=scan_step_mm,
            scan_length_mm=scan_length_mm,
            index_start_mm=index_start_mm,
            index_end_mm=index_end_mm,
            index_step_mm=index_step_mm,
            n_beams=n_beams,
            probe_pitch_mm=probe_pitch_mm,
        )
    else:
        n_samples = 1924  # default

    # 4. Determine output dimensions
    if raster is not None:
        n_scan_bins = raster["n_scan_bins"]
        n_index = raster["n_index"]
        n_sweeps = raster["n_sweeps"]
        frame_map = raster["frame_map"]  # (n_scan_bins, n_index) of int
        beam_map = raster["beam_map"]    # (n_scan_bins, n_index) of int
        scan_step_m = config["scan_axis"].get("step", 1.0) / 1000.0
        index_offset_m = raster["index_axis_mm"][0] / 1000.0
    else:
        # Fallback: single-strip mode (no data.bin)
        n_scan_bins = n_raw_frames
        n_index = n_beams
        n_sweeps = 1
        # Build trivial frame_map / beam_map: each row is one frame, each column one beam
        frame_map = np.full((n_scan_bins, n_index), -1, dtype=np.int32)
        beam_map = np.full((n_scan_bins, n_index), -1, dtype=np.int32)
        for si in range(n_scan_bins):
            for b in range(n_beams):
                frame_map[si, b] = si
                beam_map[si, b] = b
        scan_step_m = None
        index_offset_m = None

    # 5. Build Setup JSON
    setup = build_setup_json(
        config, n_scan_bins, n_samples,
        n_index=n_index,
        scan_step_m=scan_step_m,
        index_offset_m=index_offset_m,
        probe_pitch_m=probe_pitch_mm / 1000.0,
    )

    # 6. Parse properties
    acq_date = _parse_acquisition_date(str(cap / "acquisitionInfo.properties"))
    platform = _parse_platform_info(str(cap / "plateformInfo.properties"))
    amp_ref = _parse_amplitude_ref(str(cap / "hardwareInfo.properties"))

    if platform["productType"] or platform["sn"]:
        setup["acquisitionUnits"][0]["model"] = platform["productType"]
        setup["acquisitionUnits"][0]["serialNumber"] = platform["sn"]

    # 7. Properties JSON
    date_str = acq_date or "2026-01-01T00:00:00"
    properties = {
        "file": {
            "creationDate": date_str,
            "modificationDate": date_str,
        }
    }

    # 8. Amplitude scale factor
    amp_scale = 16383.5 / amp_ref

    # 9. Write HDF5
    n_gates = NDE_GATE_COUNT
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with h5py.File(str(out_path), "w") as f:
        # --- Public/Setup ---
        setup_bytes = json.dumps(setup, separators=(",", ":")).encode("utf-8")
        f.create_dataset("Public/Setup", data=np.bytes_(setup_bytes))

        # --- Properties ---
        props_bytes = json.dumps(properties, separators=(",", ":")).encode("utf-8")
        f.create_dataset("Properties", data=np.bytes_(props_bytes))

        # --- Private/MXU/RawCScan ---
        # Shape: (n_scan_bins, n_index, n_gates)
        rawcscan_ds = f.create_dataset(
            "Private/MXU/RawCScan",
            shape=(n_scan_bins, n_index, n_gates),
            dtype=np.dtype("V24"),
            chunks=(1, n_index, n_gates),
        )

        # Pre-compute no-data bytes
        no_data_packed = _RAWCSCAN_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0)
        no_data_bytes = np.frombuffer(no_data_packed, dtype=np.uint8)

        sync_peak = peaks.get(31)

        # Pre-compute sync times for all raw frames (needed for relative gate)
        sync_times_cache: dict[int, np.ndarray] = {}

        for si in range(n_scan_bins):
            row = np.zeros((n_index, NDE_GATE_COUNT, 24), dtype=np.uint8)
            # Fill with no-data by default
            for idx_pos in range(n_index):
                for g in range(NDE_GATE_COUNT):
                    row[idx_pos, g, :] = no_data_bytes

            for idx_pos in range(n_index):
                fi = int(frame_map[si, idx_pos])
                if fi < 0:
                    continue
                bi = int(beam_map[si, idx_pos])
                if bi < 0:
                    continue

                # Get or compute sync time for this frame/beam
                if fi not in sync_times_cache:
                    st = np.zeros(n_beams, dtype=np.float64)
                    if sync_peak is not None:
                        for b in range(n_beams):
                            sp_val = float(sync_peak["sound_path"][fi, b])
                            if np.isfinite(sp_val) and sync_peak["amplitude"][fi, b] > 0:
                                st[b] = sp_val * 1e-6
                    sync_times_cache[fi] = st
                sync_time_b = sync_times_cache[fi][bi]

                for gate_nde_idx, eddify_id in enumerate(EDDIFY_GATE_ORDER):
                    peak = peaks.get(eddify_id)
                    if peak is None:
                        continue

                    sp_val = float(peak["sound_path"][fi, bi])
                    amp_val = float(peak["amplitude"][fi, bi])

                    if not np.isfinite(sp_val) or amp_val == 0.0:
                        packed = _RAWCSCAN_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0)
                    else:
                        nde_amp = int(amp_val * 16383.5)
                        nde_amp = max(0, min(32767, nde_amp))
                        time_s = sp_val * 1e-6
                        if eddify_id == 0:
                            time_s += sync_time_b
                        packed = _RAWCSCAN_STRUCT.pack(
                            0, nde_amp, time_s, time_s, 0.0, 0.0,
                        )
                    row[idx_pos, gate_nde_idx, :] = np.frombuffer(packed, dtype=np.uint8)

            row_v24 = row.view(np.dtype("V24")).reshape(n_index, n_gates)
            rawcscan_ds[si, :, :] = row_v24
            if si % 200 == 0 and si > 0:
                logger.info("RawCScan: wrote %d / %d scan bins", si, n_scan_bins)

        logger.info("RawCScan complete: %d scan bins × %d index positions",
                     n_scan_bins, n_index)

        # --- Public/Groups/0/Datasets/0-AScanAmplitude ---
        if has_waveforms and wf_dims is not None:
            wf_n_beams = wf_dims["n_beams"]

            ascan_ds = f.create_dataset(
                "Public/Groups/0/Datasets/0-AScanAmplitude",
                shape=(n_scan_bins, n_index, n_samples),
                dtype=np.int16,
                chunks=(1, n_index, n_samples),
                # No compression — matches Evident native NDE files.
                # Gzip forces full-chunk decompression on every random read,
                # making axial B-scan slices (which cross all 775 chunks) ~50x
                # slower. Uncompressed allows direct byte-offset seeks.
            )

            for si in range(n_scan_bins):
                row_frames = frame_map[si, :]
                row_beams = beam_map[si, :]
                # Find unique frames needed for this scan bin
                unique_frames = np.unique(row_frames[row_frames >= 0])
                if len(unique_frames) == 0:
                    continue

                # Read each unique frame once and scatter beams
                frame_cache: dict[int, np.ndarray] = {}
                for fi in unique_frames:
                    frame_cache[int(fi)] = read_waveform_frame(
                        str(data_bin_path), int(fi), wf_n_beams
                    )

                row_data = np.zeros((n_index, n_samples), dtype=np.int16)
                for ip in range(n_index):
                    fi = int(row_frames[ip])
                    bi = int(row_beams[ip])
                    if fi >= 0 and bi >= 0:
                        row_data[ip, :] = frame_cache[fi][bi, :]
                ascan_ds[si, :, :] = row_data

                if si % 200 == 0 and si > 0:
                    logger.info("AScan: wrote %d / %d scan bins", si, n_scan_bins)

            logger.info("AScan complete: %d scan bins", n_scan_bins)

        # --- Public/Groups/0/Datasets/1-AScanStatus ---
        status = np.zeros((n_scan_bins, n_index), dtype=np.uint8)
        if sync_peak is not None:
            for si in range(n_scan_bins):
                for ip in range(n_index):
                    fi = int(frame_map[si, ip])
                    bi = int(beam_map[si, ip])
                    if fi < 0 or bi < 0:
                        continue
                    sp_val = sync_peak["sound_path"][fi, bi]
                    amp_val = sync_peak["amplitude"][fi, bi]
                    if np.isfinite(sp_val) and amp_val > 0:
                        status[si, ip] = 1

        f.create_dataset(
            "Public/Groups/0/Datasets/1-AScanStatus",
            data=status,
            chunks=(1, n_index),
        )

    logger.info("Conversion complete: %s", output_path)
    return str(out_path)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if len(sys.argv) < 2:
        print("Usage: python -m engine.eddify_converter <capture_acq_dir> [output.nde]")
        sys.exit(1)

    capture_dir = sys.argv[1]
    if not Path(capture_dir).is_dir():
        print(f"Error: directory not found: {capture_dir}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        base = capture_dir.rstrip("/").rstrip("\\")
        if base.endswith(".capture_acq"):
            base = base[:-len(".capture_acq")]
        output_path = base + ".nde"

    result = convert_capture_acq(capture_dir, output_path)
    size_mb = Path(result).stat().st_size / (1024 * 1024)
    print(f"Done: {result} ({size_mb:.1f} MB)")
