"""
NDE format compatibility layer.

The engine natively targets the NDE 4.x layout (Public/Private groups,
groups[].datasets/processes Setup JSON). Legacy 3.0.1 files written by
MXU 5.12 (e.g. format version root attr "3.0.1") use a Domain/Applications
layout and a groups[].dataset/paut JSON schema.

This module resolves dataset paths across both layouts and normalizes legacy
Setup JSON to the 4.x shape so downstream parsing is format-agnostic.
See docs/plans/2026-07-12-legacy-nde-301-support.md.
"""

import json
import logging
from typing import Optional

import h5py
import numpy as np

logger = logging.getLogger(__name__)

_SETUP_PATHS = ("Public/Setup", "Domain/Setup")
_AMPLITUDE_PATHS = (
    "Public/Groups/0/Datasets/0-AScanAmplitude",
    "Domain/DataGroups/0/Datasets/0/Amplitude",
)
_STATUS_PATHS = (
    "Public/Groups/0/Datasets/1-AScanStatus",
    "Domain/DataGroups/0/Datasets/0/Status",
)
_RAWCSCAN_PATHS = ("Private/MXU/RawCScan", "Applications/MXU/RawCScan")


def _resolve(f: h5py.File, candidates: tuple[str, ...]) -> Optional[str]:
    for path in candidates:
        if path in f:
            return path
    return None


def resolve_setup_path(f: h5py.File) -> str:
    path = _resolve(f, _SETUP_PATHS)
    if path is None:
        raise KeyError(f"No Setup dataset found (tried {', '.join(_SETUP_PATHS)})")
    return path


def resolve_amplitude_path(f: h5py.File) -> str:
    path = _resolve(f, _AMPLITUDE_PATHS)
    if path is None:
        raise KeyError(f"No AScanAmplitude dataset found (tried {', '.join(_AMPLITUDE_PATHS)})")
    return path


def resolve_status_path(f: h5py.File) -> Optional[str]:
    return _resolve(f, _STATUS_PATHS)


def resolve_rawcscan_path(f: h5py.File) -> Optional[str]:
    return _resolve(f, _RAWCSCAN_PATHS)


def normalize_setup(setup: dict) -> dict:
    """Convert a legacy (3.x) Setup dict to the 4.x schema; 4.x passes through.

    Legacy groups carry `dataset` (singular) and `paut`; 4.x carries
    `datasets[]` and `processes[]`. The inner PAUT/gate/thickness shapes are
    identical except thickness gates use `timeSelection` instead of
    `gateDetection`.
    """
    groups = setup.get("groups", [])
    if not any("paut" in g for g in groups):
        return setup

    normalized = dict(setup)
    normalized["groups"] = [_normalize_group(g) for g in groups]
    return normalized


def _normalize_group(group: dict) -> dict:
    if "paut" not in group:
        return group

    g = dict(group)
    paut = g.pop("paut")
    legacy_dataset = g.pop("dataset", {})

    datasets = []
    ascan = legacy_dataset.get("ascan", {})
    amplitude = ascan.get("amplitude")
    if amplitude:
        datasets.append({
            "dataClass": "AScanAmplitude",
            "path": amplitude.get("path", ""),
            "dimensions": amplitude.get("dimensions", []),
        })

    processes = [{"ultrasonicPhasedArray": paut}]
    thickness = paut.get("softwareProcess", {}).get("thickness")
    if thickness:
        tp = dict(thickness)
        tp["gates"] = [
            {**tg, "gateDetection": tg.get("timeSelection", "Crossing")}
            for tg in thickness.get("gates", [])
        ]
        processes.append({"thickness": tp})

    g["datasets"] = datasets
    g["processes"] = processes
    return g


def load_setup(f: h5py.File) -> dict:
    """Read the Setup JSON from either layout, normalized to the 4.x schema."""
    raw = f[resolve_setup_path(f)][()]
    if isinstance(raw, bytes):
        setup_str = raw.decode("utf-8")
    elif isinstance(raw, np.ndarray):
        setup_str = raw.tobytes().decode("utf-8")
    else:
        setup_str = str(raw)
    return normalize_setup(json.loads(setup_str))


def read_file_dates(f: h5py.File) -> tuple[Optional[str], Optional[str]]:
    """Return (creation, modification) dates from Properties or root attrs."""
    if "Properties" in f:
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

    created = f.attrs.get("Date created")
    if isinstance(created, bytes):
        return created.decode("utf-8"), None
    if created is not None:
        return str(created), None
    return None, None


def read_opaque_2d(ds: h5py.Dataset) -> np.ndarray:
    """Read a 2D opaque (V-typed) dataset as raw bytes.

    Legacy RawCScan is contiguous opaque data that h5py's high-level slicing
    cannot convert; reading with memory type == file type bypasses conversion.
    Returns uint8 array of shape (*ds.shape, itemsize).
    """
    itemsize = ds.dtype.itemsize
    arr = np.empty(ds.shape, dtype=np.dtype(f"V{itemsize}"))
    ds.id.read(h5py.h5s.ALL, h5py.h5s.ALL, arr, mtype=ds.id.get_type())
    return np.frombuffer(arr.tobytes(), dtype=np.uint8).reshape(*ds.shape, itemsize)
