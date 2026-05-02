"""
NDE file reader/indexer for HDF5-based NDE files from Evident HydroFORM instruments.

Reads Public/Setup JSON metadata and Private/MXU/RawCScan datasets to build
a FileIndex describing the file's structure, axes, gates, and data availability.
"""

import glob
import json
import logging
import os
from typing import Optional

import h5py
import numpy as np

from .models import AxisInfo, FileIndex, GateInfo, ThicknessProcessInfo

logger = logging.getLogger(__name__)


def _parse_properties(f: h5py.File) -> tuple[Optional[str], Optional[str]]:
    """Extract creation/modification dates from Properties dataset."""
    try:
        raw = f["Properties"][()]
        if isinstance(raw, bytes):
            props = json.loads(raw.decode("utf-8"))
        elif isinstance(raw, np.ndarray):
            props = json.loads(raw.tobytes().decode("utf-8"))
        else:
            props = json.loads(str(raw))
        file_info = props.get("file", {})
        return file_info.get("creationDate"), file_info.get("modificationDate")
    except Exception:
        logger.debug("Could not parse Properties dataset", exc_info=True)
        return None, None


def _parse_probe(setup: dict) -> Optional["ProbeInfo"]:
    from .models import ProbeInfo
    probes = setup.get("probes", [])
    if not probes:
        return None
    p = probes[0]
    model = p.get("model", "")
    serie = p.get("serie", "")
    freq_hz = 0.0
    for key in ("phasedArrayLinear", "phasedArrayMatrix", "conventional"):
        if key in p:
            freq_hz = p[key].get("centralFrequency", 0.0)
            break
    return ProbeInfo(model=model, serie=serie, frequency_mhz=round(freq_hz / 1e6, 2))


def _parse_wedge(setup: dict) -> Optional["WedgeInfo"]:
    from .models import WedgeInfo
    wedges = setup.get("wedges", [])
    if not wedges:
        return None
    w = wedges[0]
    return WedgeInfo(model=w.get("model", ""), serie=w.get("serie", ""))


def _parse_equipment(setup: dict) -> Optional["EquipmentInfo"]:
    from .models import EquipmentInfo
    units = setup.get("acquisitionUnits", [])
    if not units:
        return None
    u = units[0]
    return EquipmentInfo(
        model=u.get("model", ""),
        serial_number=u.get("serialNumber", ""),
        platform=u.get("platform", ""),
    )


def _parse_specimen(setup: dict) -> Optional["SpecimenInfo"]:
    from .models import SpecimenInfo
    specimens = setup.get("specimens", [])
    if not specimens:
        return None
    s = specimens[0]
    geom = s.get("plateGeometry") or s.get("cylinderGeometry") or {}
    material = geom.get("material", {})
    thickness_m = geom.get("thickness", 0.0)
    long_vel = material.get("longitudinalWave", {}).get("nominalVelocity", 0.0)
    trans_vel = material.get("transversalVerticalWave", {}).get("nominalVelocity")
    density = material.get("density")
    return SpecimenInfo(
        material_name=material.get("name", ""),
        nominal_thickness_mm=round(thickness_m * 1000, 2),
        longitudinal_velocity=long_vel,
        transversal_velocity=trans_vel,
        density=density,
    )


def _parse_scanner(setup: dict) -> Optional["ScannerInfo"]:
    from .models import ScannerInfo
    devices = setup.get("motionDevices", [])
    if not devices:
        return None
    d = devices[0]
    encoder = d.get("encoder", {})
    return ScannerInfo(name=d.get("name", ""), encoder_mode=encoder.get("mode", ""))


def index_file(path: str) -> Optional[FileIndex]:
    """Open one .nde file and return a FileIndex describing its contents.

    Returns None for corrupt or unreadable files.
    """
    try:
        size_mb = os.path.getsize(path) / (1024 * 1024)

        with h5py.File(path, "r") as f:
            # --- Parse Setup JSON ---
            raw = f["Public/Setup"][()]
            if isinstance(raw, bytes):
                setup_str = raw.decode("utf-8")
            elif isinstance(raw, np.ndarray):
                setup_str = raw.tobytes().decode("utf-8")
            else:
                setup_str = str(raw)

            setup = json.loads(setup_str)

            # --- Properties metadata ---
            creation_date, modification_date = _parse_properties(f)

            # --- Rich setup metadata ---
            probe = _parse_probe(setup)
            wedge = _parse_wedge(setup)
            equipment = _parse_equipment(setup)
            specimen = _parse_specimen(setup)
            scanner = _parse_scanner(setup)

            group = setup["groups"][0]
            dataset = group["datasets"][0]
            dimensions = dataset["dimensions"]

            # --- Axes ---
            scan_axis = _parse_axis(dimensions, "UCoordinate")
            index_axis = _parse_axis(dimensions, "VCoordinate")
            time_axis = _parse_axis(dimensions, "Ultrasound")

            # --- Find the process with ultrasonicPhasedArray ---
            upa = None
            for process in group.get("processes", []):
                if "ultrasonicPhasedArray" in process:
                    upa = process["ultrasonicPhasedArray"]
                    break

            if upa is None:
                logger.warning("No ultrasonicPhasedArray process found in %s", path)
                return None

            # --- Gates ---
            gates = []
            for g in upa.get("gates", []):
                sync = g.get("synchronization", {})
                gates.append(
                    GateInfo(
                        id=g["id"],
                        name=g.get("name", ""),
                        sync_mode=sync.get("mode", "Pulse"),
                        sync_gate_id=sync.get("gateId"),
                        start=g.get("start", 0.0),
                        length=g.get("length", 0.0),
                        threshold=g.get("threshold", 0.0),
                        detection=sync.get("triggeringEvent", "Crossing"),
                    )
                )

            # --- Thickness process ---
            thickness_process = None
            for process in group.get("processes", []):
                if "thickness" in process:
                    tp = process["thickness"]
                    tp_min = tp.get("min")  # meters or None
                    tp_max = tp.get("max")  # meters or None
                    tp_gates = tp.get("gates", [])
                    tp_gate_ids = [g["id"] for g in tp_gates]
                    tp_detection = tp_gates[0].get("gateDetection", "Crossing") if tp_gates else "Crossing"
                    thickness_process = ThicknessProcessInfo(
                        min_mm=round(tp_min * 1000, 2) if tp_min is not None else None,
                        max_mm=round(tp_max * 1000, 2) if tp_max is not None else None,
                        gate_ids=tp_gate_ids,
                        gate_detection=tp_detection,
                    )
                    break

            # --- Beams ---
            beam_count = len(upa.get("beams", []))

            # --- Velocity & wave mode ---
            velocity = upa.get("velocity", 0.0)
            wave_mode = upa.get("waveMode", "Unknown")

            # --- RawCScan ---
            rawcscan_available = "Private/MXU/RawCScan" in f
            rawcscan_chunk_valid = False
            n_gates_in_rawcscan = 0

            if rawcscan_available:
                ds = f["Private/MXU/RawCScan"]
                shape = ds.shape
                chunks = ds.chunks
                n_gates_in_rawcscan = shape[2] if len(shape) >= 3 else 0
                n_index = shape[1] if len(shape) >= 2 else 0
                if chunks is not None and len(shape) >= 3:
                    rawcscan_chunk_valid = chunks == (1, n_index, n_gates_in_rawcscan)

            # --- Valid point count from AScanStatus ---
            valid_point_count = 0
            status_path = "Public/Groups/0/Datasets/1-AScanStatus"
            if status_path in f:
                status_data = f[status_path][()]
                valid_point_count = int(np.count_nonzero(
                    (status_data.astype(np.uint8) & 1) > 0
                ))

        return FileIndex(
            path=path,
            filename=os.path.basename(path),
            size_mb=round(size_mb, 2),
            scan_axis=scan_axis,
            index_axis=index_axis,
            time_axis=time_axis,
            gates=gates,
            beam_count=beam_count,
            velocity=velocity,
            wave_mode=wave_mode,
            valid_point_count=valid_point_count,
            n_gates_in_rawcscan=n_gates_in_rawcscan,
            rawcscan_available=rawcscan_available,
            rawcscan_chunk_valid=rawcscan_chunk_valid,
            thickness_process=thickness_process,
            creation_date=creation_date,
            modification_date=modification_date,
            probe=probe,
            wedge=wedge,
            equipment=equipment,
            specimen=specimen,
            scanner=scanner,
        )

    except Exception:
        logger.warning("Failed to index file: %s", path, exc_info=True)
        return None


def index_folder(folder_path: str) -> list[FileIndex]:
    """Glob *.nde files in a folder, index each, and return successful results."""
    pattern = os.path.join(folder_path, "*.nde")
    nde_files = sorted(glob.glob(pattern))

    results: list[FileIndex] = []
    for filepath in nde_files:
        idx = index_file(filepath)
        if idx is not None:
            results.append(idx)
        else:
            logger.warning("Skipped file (could not index): %s", filepath)

    return results


def index_calibration_folder(folder_path: str) -> list[FileIndex]:
    """Glob *.nde files in a calibration folder and index each.

    Identical to index_folder — separate function for clarity in call sites.
    """
    return index_folder(folder_path)


def _parse_axis(dimensions: list[dict], axis_name: str) -> AxisInfo:
    """Extract an AxisInfo from the dimensions list by axis name."""
    for dim in dimensions:
        if dim.get("axis") == axis_name:
            return AxisInfo(
                offset=dim.get("offset", 0.0),
                quantity=dim.get("quantity", 0),
                resolution=dim.get("resolution", 0.0),
            )
    logger.warning("Axis '%s' not found in dimensions, using defaults", axis_name)
    return AxisInfo(offset=0.0, quantity=0, resolution=0.0)
