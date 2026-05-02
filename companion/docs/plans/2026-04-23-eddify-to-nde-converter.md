# Eddify-to-NDE Converter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert eddify/Gekko `.capture_acq` directories into Evident-compatible `.nde` HDF5 files so the companion tool can process them with zero changes to its existing pipeline.

**Architecture:** A single `engine/eddify_converter.py` module that parses eddify XML/binary files, maps them to the Evident NDE data model, and writes an HDF5 file with the exact datasets the companion expects (`Public/Setup`, `Private/MXU/RawCScan`, `Public/Groups/0/Datasets/0-AScanAmplitude`, `1-AScanStatus`, `Properties`). An API route and CLI entry point trigger conversion.

**Tech Stack:** Python 3.13, h5py, numpy, xml.etree.ElementTree

---

## Reference: Eddify Format Summary

### File structure (`.capture_acq/` directory)
- `root.xml` — Master config (probe, wedge, specimen, gates, axes, beams)
- `data.bin` — Full A-scan waveform data (1.6GB for typical scan)
- `data_peaks_0_{gate_id}.bin` — Pre-computed gate peak data
- `data_frames_list.bin` — Frame validity index
- `acquisitionInfo.properties` — Acquisition date
- `hardwareInfo.properties` — Amplitude scaling
- `plateformInfo.properties` — Device model/serial
- `jobDetails.xml` — Job metadata

### data.bin structure
- Frame size: `n_beams * 3848 + 0` bytes (beam 0 slot includes 136-byte header)
- Per-frame: 136-byte header (magic `0xFFCEACEA`, frame_size, counter, n_beams) + waveform data
- Beam 0: 136 bytes header + 1856 int16 samples (3712 bytes)
- Beams 1-54: 1924 int16 samples each (3848 bytes)
- Values are rectified envelope amplitudes (positive int16)

### data_peaks_0_{id}.bin structure
- 20-byte header: uint32 n_scans, uint32 n_beams, float32 start_angle, float32 end_angle, float32 scale
- Data: n_scans × n_beams × 8 bytes (float32 sound_path_mm, float32 amplitude_fsh)
- No-peak sentinel: sound_path = +inf, amplitude = 0.0

### Gate mapping (eddify → NDE)
- Eddify Gate 31 (synchronisante) → NDE Gate I (id=0, sync_mode="Pulse") — reference/trigger
- Eddify Gate 0 (synchronisee to 31) → NDE Gate A (id=1, sync_mode="GateRelative") — measurement
- Eddify Gate 1 (independent) → NDE Gate B (id=2, sync_mode="GateRelative") — back wall

### Amplitude scaling
- Eddify: float FSH (0.0–1.4+), reference = 4095 ADC counts
- NDE RawCScan: int32 (0–32767), where 32767 = 200% FSH
- Conversion: `nde_amplitude = int(eddify_fsh * 100.0 / 200.0 * 32767)` = `int(eddify_fsh * 16383.5)`

### Waveform scaling
- Eddify data.bin: positive int16 envelope values (0–~12000 observed)
- NDE AScanAmplitude: int16 (companion takes abs() to rectify, so positive values work directly)
- Scaling: eddify values need mapping so that max maps to companion's 32767 range
- Use hardwareInfo.properties `PASumAmplitudeRefValue=4095` for scale factor: `nde_val = eddify_val * 32767 / 4095`

### Time/sound path conversion
- Gate times: `time_seconds = sound_path_mm / 1000.0 / velocity_m_s`
- Time axis: offset=0.0s, resolution=20e-9s (20ns sampling period), quantity=1924

---

## Task 1: XML Parser — Extract Configuration from root.xml

**Files:**
- Create: `engine/eddify_converter.py`
- Test: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
# tests/test_eddify_converter.py
import pytest
from engine.eddify_converter import parse_eddify_xml

def test_parse_eddify_xml_extracts_probe():
    """Parse root.xml and extract probe configuration."""
    # Use the test fileset
    xml_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/root.xml"
    config = parse_eddify_xml(xml_path)
    assert config["probe"]["model"] == "I4-7.5L64_H24mm"
    assert config["probe"]["frequency_mhz"] == 7.5
    assert config["probe"]["element_count"] == 64

def test_parse_eddify_xml_extracts_specimen():
    xml_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/root.xml"
    config = parse_eddify_xml(xml_path)
    assert config["specimen"]["thickness_mm"] == 42.0
    assert config["specimen"]["velocity_l"] == 5900.0
    assert config["specimen"]["velocity_t"] == 3230.0
    assert config["specimen"]["material"] == "Steel"

def test_parse_eddify_xml_extracts_gates():
    xml_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/root.xml"
    config = parse_eddify_xml(xml_path)
    gates = config["gates"]
    # Should have 3 recording gates (IDs 0, 1, 31)
    assert len(gates) == 3
    # Gate 31 is the sync gate
    sync_gate = [g for g in gates if g["id"] == 31][0]
    assert sync_gate["sync_mode"] == "synchronisante"
    assert sync_gate["threshold"] == 0.8

def test_parse_eddify_xml_extracts_axes():
    xml_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/root.xml"
    config = parse_eddify_xml(xml_path)
    assert config["scan_axis"]["start_mm"] == 0.0
    assert config["scan_axis"]["end_mm"] == 784.0
    assert config["index_axis"]["start_mm"] == 1000.0
    assert config["index_axis"]["end_mm"] == 1500.0
    assert config["sampling_period_ns"] == 20
```

**Step 2: Run tests to verify they fail**

Run: `py -m pytest tests/test_eddify_converter.py -v`
Expected: FAIL with "cannot import name 'parse_eddify_xml'"

**Step 3: Write the implementation**

```python
# engine/eddify_converter.py
"""
Eddify/Gekko .capture_acq to Evident .nde (HDF5) converter.

Parses eddify XML configuration and binary data files, maps them to the
Evident NDE data model, and writes an HDF5 file compatible with the
companion tool's existing pipeline.
"""

import logging
import os
import struct
import xml.etree.ElementTree as ET
from typing import Any

import h5py
import numpy as np

logger = logging.getLogger(__name__)


def parse_eddify_xml(xml_path: str) -> dict[str, Any]:
    """Parse root.xml and extract all configuration needed for NDE conversion.

    Returns a dict with keys: probe, wedge, specimen, gates, scan_axis,
    index_axis, sampling_period_ns, n_beams, equipment, date.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    config: dict[str, Any] = {}

    # --- Probe ---
    probe_el = root.find(".//transducteur")
    if probe_el is not None:
        config["probe"] = {
            "model": _text(probe_el, "nom", ""),
            "frequency_mhz": _float(probe_el, ".//frequence", 0.0),
            "element_count": _int(probe_el, ".//nbElements", 0),
            "pitch_mm": _float(probe_el, ".//workedPitch", 0.0),
        }
    else:
        config["probe"] = {"model": "", "frequency_mhz": 0.0, "element_count": 0, "pitch_mm": 0.0}

    # --- Wedge ---
    wedge_el = root.find(".//sabot")
    if wedge_el is not None:
        config["wedge"] = {
            "model": _text(wedge_el, "nomSabot", ""),
            "velocity": _float(wedge_el, ".//vitesse", 0.0),
            "angle_deg": _float(wedge_el, ".//angle", 0.0),
        }
    else:
        config["wedge"] = {"model": "", "velocity": 0.0, "angle_deg": 0.0}

    # --- Specimen ---
    piece_el = root.find(".//piece")
    if piece_el is not None:
        config["specimen"] = {
            "material": _text(piece_el, ".//materiau", ""),
            "thickness_mm": _float(piece_el, ".//epaisseur", 0.0),
            "velocity_l": _float(piece_el, ".//vitesseOndeL", 0.0),
            "velocity_t": _float(piece_el, ".//vitesseOndeT", 0.0),
            "density": _float(piece_el, ".//densite", 0.0),
        }
    else:
        config["specimen"] = {"material": "", "thickness_mm": 0.0, "velocity_l": 0.0, "velocity_t": 0.0, "density": 0.0}

    # --- Gates (only recording gates: those with <enregistrement> tag) ---
    gates = []
    for porte in root.iter("porte"):
        enreg = porte.find("enregistrement")
        if enreg is None or enreg.text != "pic":
            continue
        gate_id = _int(porte, "id", -1)
        if gate_id == -1:
            continue
        range_el = porte.find("range")
        start_mm = _float(range_el, "start", 0.0) if range_el is not None else 0.0
        end_mm = _float(range_el, "end", 0.0) if range_el is not None else 0.0
        gates.append({
            "id": gate_id,
            "start_mm": start_mm,
            "end_mm": end_mm,
            "threshold": _float(porte, "seuilValeur", 0.0),
            "detection": _text(porte, "detection", "premierFront"),
            "sync_mode": _text(porte, "synchronisation", "non"),
            "synchro_id": _int(porte, "synchroId", 0),
        })
    # Also check porteSynchro elements
    for porte in root.iter("porteSynchro"):
        enreg = porte.find("enregistrement")
        if enreg is None or enreg.text != "pic":
            continue
        gate_id = _int(porte, "id", -1)
        if gate_id == -1:
            continue
        range_el = porte.find("range")
        start_mm = _float(range_el, "start", 0.0) if range_el is not None else 0.0
        end_mm = _float(range_el, "end", 0.0) if range_el is not None else 0.0
        gates.append({
            "id": gate_id,
            "start_mm": start_mm,
            "end_mm": end_mm,
            "threshold": _float(porte, "seuilValeur", 0.0),
            "detection": _text(porte, "detection", "premierFront"),
            "sync_mode": _text(porte, "synchronisation", "synchronisante"),
            "synchro_id": _int(porte, "synchroId", gate_id),
        })
    config["gates"] = gates

    # --- Scan axis ---
    axes = list(root.iter("axeTrajectoire"))
    scan_axis = {"start_mm": 0.0, "end_mm": 0.0, "step_mm": 0.0}
    index_axis = {"start_mm": 0.0, "end_mm": 0.0, "step_mm": 0.0}
    for ax in axes:
        ax_type = ax.get("{http://www.w3.org/2001/XMLSchema-instance}type", "")
        start = _float(ax, "start", 0.0)
        end = _float(ax, "end", 0.0)
        step = _float(ax, "step", 0.0)
        if "Encoded" in ax_type or "encodedAxis" in ax_type.lower():
            scan_axis = {"start_mm": start, "end_mm": end, "step_mm": step}
        elif "Increment" in ax_type or "incrementAxis" in ax_type.lower():
            index_axis = {"start_mm": start, "end_mm": end, "step_mm": step}
    config["scan_axis"] = scan_axis
    config["index_axis"] = index_axis

    # --- Sampling period ---
    config["sampling_period_ns"] = _int(root, ".//samplingPeriod", 20)

    # --- Beam count (from focal law definitions) ---
    # Count beam characteristics or focal point sets
    beam_chars = list(root.iter("beamCharacteristics"))
    config["n_beams"] = len(beam_chars) if beam_chars else 55

    return config


def _text(el: ET.Element, path: str, default: str) -> str:
    child = el.find(path)
    return child.text.strip() if child is not None and child.text else default


def _float(el: ET.Element, path: str, default: float) -> float:
    child = el.find(path)
    if child is not None and child.text:
        try:
            return float(child.text.strip())
        except ValueError:
            pass
    return default


def _int(el: ET.Element, path: str, default: int) -> int:
    child = el.find(path)
    if child is not None and child.text:
        try:
            return int(child.text.strip())
        except ValueError:
            pass
    return default
```

**Step 4: Run tests to verify they pass**

Run: `py -m pytest tests/test_eddify_converter.py -v`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: add eddify XML parser for capture_acq conversion"
```

---

## Task 2: Peak Data Reader — Parse data_peaks_*.bin Files

**Files:**
- Modify: `engine/eddify_converter.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
def test_read_peak_file():
    """Read a data_peaks binary file and extract sound path + amplitude arrays."""
    from engine.eddify_converter import read_peak_file
    peak_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/data_peaks_0_0.bin"
    result = read_peak_file(peak_path)
    assert result["n_scans"] == 7802
    assert result["n_beams"] == 55
    assert result["sound_path"].shape == (7802, 55)
    assert result["amplitude"].shape == (7802, 55)
    # Valid entries should have finite sound path
    valid = np.isfinite(result["sound_path"])
    assert valid.sum() > 0
    # Amplitudes for valid entries should be > 0
    assert (result["amplitude"][valid] > 0).all()
```

**Step 2: Run test to verify it fails**

Run: `py -m pytest tests/test_eddify_converter.py::test_read_peak_file -v`

**Step 3: Write the implementation**

Add to `engine/eddify_converter.py`:

```python
def read_peak_file(path: str) -> dict[str, Any]:
    """Read a data_peaks_0_{gate_id}.bin file.

    Returns dict with: n_scans, n_beams, start_angle, end_angle,
    sound_path (n_scans, n_beams) float32 in mm (inf = no peak),
    amplitude (n_scans, n_beams) float32 in FSH fraction.
    """
    data = open(path, "rb").read()
    n_scans = struct.unpack_from("<I", data, 0)[0]
    n_beams = struct.unpack_from("<I", data, 4)[0]
    start_angle = struct.unpack_from("<f", data, 8)[0]
    end_angle = struct.unpack_from("<f", data, 12)[0]

    peaks = np.frombuffer(data[20:], dtype="<f4").reshape(n_scans, n_beams, 2)
    return {
        "n_scans": n_scans,
        "n_beams": n_beams,
        "start_angle": start_angle,
        "end_angle": end_angle,
        "sound_path": peaks[:, :, 0].copy(),   # mm, inf = no peak
        "amplitude": peaks[:, :, 1].copy(),     # FSH fraction
    }
```

**Step 4: Run test, verify pass**

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: add eddify peak data binary reader"
```

---

## Task 3: Waveform Reader — Parse data.bin

**Files:**
- Modify: `engine/eddify_converter.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
def test_read_waveform_frame():
    """Read a single frame from data.bin and extract waveform data."""
    from engine.eddify_converter import read_waveform_frame
    data_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/data.bin"
    frame = read_waveform_frame(data_path, frame_idx=0, n_beams=55)
    # Should return (55, 1924) int16 array
    assert frame.shape == (55, 1924)
    assert frame.dtype == np.int16
    # Beam 1 should have recognizable echo (values > 1000 somewhere)
    assert frame[1].max() > 500
    # Beam 0 first 68 samples should be zero (header region, zero-padded)
    assert (frame[0, :68] == 0).all()

def test_get_waveform_dimensions():
    """Get n_frames and n_beams from data.bin without reading all data."""
    from engine.eddify_converter import get_waveform_dimensions
    data_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/data.bin"
    dims = get_waveform_dimensions(data_path)
    assert dims["n_frames"] == 7802
    assert dims["n_beams"] == 55
    assert dims["n_samples"] == 1924
    assert dims["frame_size"] == 211640
```

**Step 2: Run tests to verify they fail**

**Step 3: Write the implementation**

Add to `engine/eddify_converter.py`:

```python
FRAME_HEADER_SIZE = 136
FRAME_MAGIC = 0xFFCEACEA


def get_waveform_dimensions(data_bin_path: str) -> dict[str, int]:
    """Read data.bin header to determine frame layout without loading all data."""
    with open(data_bin_path, "rb") as f:
        header = f.read(FRAME_HEADER_SIZE)
        magic = struct.unpack_from("<I", header, 0)[0]
        if magic != FRAME_MAGIC:
            raise ValueError(f"Invalid data.bin magic: 0x{magic:08x}")
        frame_size = struct.unpack_from("<I", header, 4)[0]
        n_beams = struct.unpack_from("<H", header, 76)[0]
        file_size = os.path.getsize(data_bin_path)

    beam_size = frame_size // n_beams
    n_samples_full = beam_size // 2  # int16
    n_frames = file_size // frame_size

    return {
        "n_frames": n_frames,
        "n_beams": n_beams,
        "n_samples": n_samples_full,  # 1924 for beams 1+
        "frame_size": frame_size,
        "beam_size": beam_size,
    }


def read_waveform_frame(data_bin_path: str, frame_idx: int, n_beams: int) -> np.ndarray:
    """Read a single frame from data.bin, returning (n_beams, n_samples) int16.

    Beam 0 has a 136-byte per-frame header embedded in its slot;
    the first 68 samples are zero-padded to align with other beams.
    """
    beam_size = 3848  # bytes per beam slot
    frame_size = n_beams * beam_size
    n_samples = beam_size // 2  # 1924

    out = np.zeros((n_beams, n_samples), dtype=np.int16)

    with open(data_bin_path, "rb") as f:
        f.seek(frame_idx * frame_size)
        frame_bytes = f.read(frame_size)

    # Beam 0: skip 136-byte header, read remaining 3712 bytes (1856 samples)
    hdr_samples = FRAME_HEADER_SIZE // 2  # 68
    beam0_waveform = np.frombuffer(
        frame_bytes[FRAME_HEADER_SIZE:beam_size], dtype="<i2"
    )
    out[0, hdr_samples:] = beam0_waveform

    # Beams 1 to n_beams-1: full 3848 bytes each
    for b in range(1, n_beams):
        offset = b * beam_size
        out[b] = np.frombuffer(
            frame_bytes[offset:offset + beam_size], dtype="<i2"
        )

    return out
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: add eddify data.bin waveform reader"
```

---

## Task 4: Build Setup JSON — Map Eddify Config to Evident Format

**Files:**
- Modify: `engine/eddify_converter.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
def test_build_setup_json():
    """Build an Evident-compatible Setup JSON from eddify config."""
    from engine.eddify_converter import parse_eddify_xml, build_setup_json
    xml_path = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq/root.xml"
    config = parse_eddify_xml(xml_path)
    n_scans = 7802
    n_samples = 1924
    setup = build_setup_json(config, n_scans, n_samples)

    # Check structure matches what nde_reader.py expects
    assert "probes" in setup
    assert setup["probes"][0]["model"] == "I4-7.5L64_H24mm"
    assert setup["probes"][0]["phasedArrayLinear"]["centralFrequency"] == 7.5e6

    assert "specimens" in setup
    geom = setup["specimens"][0]["plateGeometry"]
    assert geom["thickness"] == 0.042  # meters
    assert geom["material"]["longitudinalWave"]["nominalVelocity"] == 5900.0

    assert "groups" in setup
    group = setup["groups"][0]
    dims = group["datasets"][0]["dimensions"]
    # Should have UCoordinate, VCoordinate, Ultrasound axes
    axis_names = [d["axis"] for d in dims]
    assert "UCoordinate" in axis_names
    assert "VCoordinate" in axis_names
    assert "Ultrasound" in axis_names

    # Ultrasound axis
    us_dim = [d for d in dims if d["axis"] == "Ultrasound"][0]
    assert us_dim["quantity"] == 1924
    assert us_dim["resolution"] == pytest.approx(20e-9, rel=1e-3)

    # Gates should be remapped to NDE IDs (0=I, 1=A, 2=B)
    upa = None
    for p in group["processes"]:
        if "ultrasonicPhasedArray" in p:
            upa = p["ultrasonicPhasedArray"]
    assert upa is not None
    assert len(upa["gates"]) == 3
    gate_ids = [g["id"] for g in upa["gates"]]
    assert gate_ids == [0, 1, 2]
```

**Step 2: Run test to verify it fails**

**Step 3: Write the implementation**

Add to `engine/eddify_converter.py`:

```python
# Eddify gate ID → NDE gate ID mapping
# Eddify gate 31 (sync/trigger) → NDE gate 0 (Gate I)
# Eddify gate 0 (interface, synced to 31) → NDE gate 1 (Gate A)
# Eddify gate 1 (backwall, independent) → NDE gate 2 (Gate B)
EDDIFY_TO_NDE_GATE = {31: 0, 0: 1, 1: 2}
GATE_NAMES = {0: "Gate I", 1: "Gate A", 2: "Gate B"}


def build_setup_json(config: dict, n_scans: int, n_samples: int) -> dict:
    """Build an Evident-compatible Setup JSON from parsed eddify config.

    The output JSON matches the structure that nde_reader.py expects:
    probes, wedges, specimens, acquisitionUnits, motionDevices,
    groups[0].datasets[0].dimensions, groups[0].processes.
    """
    velocity_l = config["specimen"]["velocity_l"]
    sampling_s = config["sampling_period_ns"] * 1e-9
    scan_ax = config["scan_axis"]
    idx_ax = config["index_axis"]

    # Compute actual scan resolution from raw frame count
    scan_range_mm = scan_ax["end_mm"] - scan_ax["start_mm"]
    scan_res_m = (scan_range_mm / 1000.0) / max(n_scans - 1, 1)

    # Index axis: number of positions
    idx_step_mm = idx_ax["step_mm"]
    idx_range_mm = idx_ax["end_mm"] - idx_ax["start_mm"]
    n_index = int(idx_range_mm / idx_step_mm) + 1 if idx_step_mm > 0 else 1

    # Build NDE gates from eddify gates
    nde_gates = []
    for g in config["gates"]:
        nde_id = EDDIFY_TO_NDE_GATE.get(g["id"])
        if nde_id is None:
            continue
        start_s = g["start_mm"] / 1000.0 / velocity_l
        length_s = (g["end_mm"] - g["start_mm"]) / 1000.0 / velocity_l
        threshold_pct = g["threshold"] * 100.0  # FSH fraction → percent

        if g["sync_mode"] == "synchronisante":
            sync_mode = "Pulse"
            sync_gate_id = None
        elif g["sync_mode"] == "synchronisee":
            sync_mode = "GateRelative"
            sync_gate_id = EDDIFY_TO_NDE_GATE.get(g["synchro_id"], 0)
        else:
            sync_mode = "Pulse"
            sync_gate_id = None

        nde_gates.append({
            "id": nde_id,
            "name": GATE_NAMES.get(nde_id, f"Gate {nde_id}"),
            "start": start_s,
            "length": length_s,
            "threshold": threshold_pct,
            "synchronization": {
                "mode": sync_mode,
                "gateId": sync_gate_id,
                "triggeringEvent": "Crossing",
            },
        })
    nde_gates.sort(key=lambda g: g["id"])

    # Build beams list (one entry per focal law)
    n_beams = config["n_beams"]
    beams = [{"id": i} for i in range(n_beams)]

    setup = {
        "probes": [{
            "model": config["probe"]["model"],
            "serie": "",
            "phasedArrayLinear": {
                "centralFrequency": config["probe"]["frequency_mhz"] * 1e6,
            },
        }],
        "wedges": [{
            "model": config["wedge"]["model"],
            "serie": "",
        }],
        "specimens": [{
            "plateGeometry": {
                "thickness": config["specimen"]["thickness_mm"] / 1000.0,
                "material": {
                    "name": config["specimen"]["material"],
                    "longitudinalWave": {"nominalVelocity": velocity_l},
                    "transversalVerticalWave": {"nominalVelocity": config["specimen"]["velocity_t"]},
                    "density": config["specimen"]["density"],
                },
            },
        }],
        "acquisitionUnits": [{
            "model": config.get("equipment", {}).get("model", "Gekko/Mantis"),
            "serialNumber": config.get("equipment", {}).get("serial", ""),
            "platform": "Eddyfi Capture",
        }],
        "motionDevices": [{
            "name": "Encoder",
            "encoder": {"mode": "Quadrature"},
        }],
        "groups": [{
            "datasets": [{
                "dimensions": [
                    {
                        "axis": "UCoordinate",
                        "offset": scan_ax["start_mm"] / 1000.0,
                        "quantity": n_scans,
                        "resolution": scan_res_m,
                    },
                    {
                        "axis": "VCoordinate",
                        "offset": idx_ax["start_mm"] / 1000.0,
                        "quantity": n_index,
                        "resolution": idx_step_mm / 1000.0 if idx_step_mm > 0 else 0.0,
                    },
                    {
                        "axis": "Ultrasound",
                        "offset": 0.0,
                        "quantity": n_samples,
                        "resolution": sampling_s,
                    },
                ],
            }],
            "processes": [
                {
                    "ultrasonicPhasedArray": {
                        "velocity": velocity_l,
                        "waveMode": "Longitudinal",
                        "gates": nde_gates,
                        "beams": beams,
                    },
                },
            ],
        }],
    }

    return setup
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: build Evident-compatible Setup JSON from eddify config"
```

---

## Task 5: Build RawCScan — Convert Peak Data to 24-byte Gate Structs

**Files:**
- Modify: `engine/eddify_converter.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
def test_build_rawcscan():
    """Convert eddify peak files into RawCScan-compatible binary data."""
    from engine.eddify_converter import read_peak_file, build_rawcscan_for_scan
    base = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq"
    peaks = {
        31: read_peak_file(os.path.join(base, "data_peaks_0_31.bin")),
        0: read_peak_file(os.path.join(base, "data_peaks_0_0.bin")),
        1: read_peak_file(os.path.join(base, "data_peaks_0_1.bin")),
    }
    velocity = 5900.0
    n_beams = 55
    # Build RawCScan data for scan position 0
    rawcscan_row = build_rawcscan_for_scan(peaks, scan_idx=0, n_beams=n_beams, velocity=velocity)
    # Should be (n_beams, 3, 24) bytes
    assert rawcscan_row.shape == (n_beams, 3, 24)

    # Check a valid entry: beam 0, gate 0 (NDE Gate I = eddify gate 31)
    gate_bytes = rawcscan_row[0, 0]
    status = np.frombuffer(gate_bytes[0:4], dtype=np.int32)[0]
    amplitude = np.frombuffer(gate_bytes[4:8], dtype=np.int32)[0]
    # If the peak was valid (finite sound path), status should be 0
    if np.isfinite(peaks[31]["sound_path"][0, 0]):
        assert status == 0
        assert amplitude > 0
```

**Step 2: Run test to verify it fails**

**Step 3: Write the implementation**

Add to `engine/eddify_converter.py`:

```python
# NDE RawCScan gate struct: 24 bytes per gate, little-endian
# int32 status | int32 amplitude | float32 crossing_time | float32 peak_time | float32 gate_start | float32 gate_end
GATE_STRUCT = struct.Struct("<iiffff")

# Gate order in RawCScan: [Gate I (eddify 31), Gate A (eddify 0), Gate B (eddify 1)]
RAWCSCAN_GATE_ORDER = [31, 0, 1]


def build_rawcscan_for_scan(
    peaks: dict[int, dict],
    scan_idx: int,
    n_beams: int,
    velocity: float,
    gate_defs: list[dict] | None = None,
) -> np.ndarray:
    """Build one scan line of RawCScan data from eddify peak data.

    Args:
        peaks: Dict mapping eddify gate ID to read_peak_file() result.
        scan_idx: Scan position index.
        n_beams: Number of beams.
        velocity: Sound velocity in m/s.
        gate_defs: Gate definitions for start/end times.

    Returns:
        uint8 array of shape (n_beams, 3, 24) — 3 gates, 24 bytes each.
    """
    n_gates = len(RAWCSCAN_GATE_ORDER)
    out = np.zeros((n_beams, n_gates, 24), dtype=np.uint8)

    for gate_idx, eddify_gate_id in enumerate(RAWCSCAN_GATE_ORDER):
        peak = peaks.get(eddify_gate_id)
        if peak is None:
            # No data for this gate — fill with no-data status
            for b in range(n_beams):
                out[b, gate_idx] = np.frombuffer(
                    GATE_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0), dtype=np.uint8
                )
            continue

        sp = peak["sound_path"][scan_idx]     # (n_beams,) mm
        amp = peak["amplitude"][scan_idx]     # (n_beams,) FSH fraction

        for b in range(n_beams):
            if not np.isfinite(sp[b]):
                # No peak detected
                packed = GATE_STRUCT.pack(16, 0, 0.0, 0.0, 0.0, 0.0)
            else:
                status = 0
                nde_amp = int(amp[b] * 16383.5)  # FSH → 0-32767 (100% FSH = 16383)
                time_s = sp[b] / 1000.0 / velocity
                packed = GATE_STRUCT.pack(
                    status, nde_amp, time_s, time_s, 0.0, 0.0
                )
            out[b, gate_idx] = np.frombuffer(packed, dtype=np.uint8)

    return out
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: convert eddify peak data to NDE RawCScan format"
```

---

## Task 6: Full Converter — Write HDF5 Output File

**Files:**
- Modify: `engine/eddify_converter.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
import tempfile

def test_convert_capture_acq_to_nde():
    """Full end-to-end conversion: .capture_acq → .nde HDF5."""
    from engine.eddify_converter import convert_capture_acq
    from engine.nde_reader import index_file

    capture_dir = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq"
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "converted.nde")
        convert_capture_acq(capture_dir, output_path)

        # Verify the output is a valid NDE file the companion can read
        assert os.path.exists(output_path)
        file_index = index_file(output_path)
        assert file_index is not None

        # Check key fields
        assert file_index.beam_count == 55
        assert file_index.velocity == 5900.0
        assert file_index.scan_axis.quantity == 7802
        assert file_index.rawcscan_available is True
        assert file_index.n_gates_in_rawcscan == 3
        assert len(file_index.gates) == 3

        # Check metadata
        assert file_index.probe is not None
        assert file_index.probe.frequency_mhz == 7.5
        assert file_index.specimen is not None
        assert file_index.specimen.nominal_thickness_mm == 42.0

        # Verify waveform data exists
        with h5py.File(output_path, "r") as f:
            ascan = f["Public/Groups/0/Datasets/0-AScanAmplitude"]
            assert ascan.shape[0] == 7802  # n_scans
            assert ascan.shape[1] == 55    # n_beams
            assert ascan.shape[2] == 1924  # n_samples
            assert ascan.dtype == np.int16

            status = f["Public/Groups/0/Datasets/1-AScanStatus"]
            assert status.shape == (7802, 55)
```

**Step 2: Run test to verify it fails**

**Step 3: Write the implementation**

Add to `engine/eddify_converter.py`:

```python
def convert_capture_acq(capture_dir: str, output_path: str) -> str:
    """Convert an eddify .capture_acq directory to an Evident .nde HDF5 file.

    Args:
        capture_dir: Path to the .capture_acq directory.
        output_path: Path for the output .nde file.

    Returns:
        Path to the written .nde file.
    """
    logger.info("Converting %s → %s", capture_dir, output_path)

    # --- Parse XML config ---
    xml_path = os.path.join(capture_dir, "root.xml")
    config = parse_eddify_xml(xml_path)
    velocity = config["specimen"]["velocity_l"]

    # --- Read peak data ---
    peaks: dict[int, dict] = {}
    for gate_id in RAWCSCAN_GATE_ORDER:
        peak_path = os.path.join(capture_dir, f"data_peaks_0_{gate_id}.bin")
        if os.path.exists(peak_path):
            peaks[gate_id] = read_peak_file(peak_path)
            logger.info("Read peaks for gate %d: %d scans × %d beams",
                        gate_id, peaks[gate_id]["n_scans"], peaks[gate_id]["n_beams"])

    # --- Get waveform dimensions ---
    data_bin_path = os.path.join(capture_dir, "data.bin")
    has_waveforms = os.path.exists(data_bin_path)
    if has_waveforms:
        wf_dims = get_waveform_dimensions(data_bin_path)
        n_scans = wf_dims["n_frames"]
        n_beams = wf_dims["n_beams"]
        n_samples = wf_dims["n_samples"]
    else:
        # Fall back to peak file dimensions
        first_peak = next(iter(peaks.values()))
        n_scans = first_peak["n_scans"]
        n_beams = first_peak["n_beams"]
        n_samples = 0

    # --- Build Setup JSON ---
    setup = build_setup_json(config, n_scans, n_samples)

    # --- Parse properties ---
    acq_props_path = os.path.join(capture_dir, "acquisitionInfo.properties")
    creation_date = _parse_acquisition_date(acq_props_path)

    plat_props_path = os.path.join(capture_dir, "plateformInfo.properties")
    equipment = _parse_platform_info(plat_props_path)
    if equipment:
        setup["acquisitionUnits"][0]["model"] = equipment.get("model", "")
        setup["acquisitionUnits"][0]["serialNumber"] = equipment.get("serial", "")

    # --- Index axis quantity ---
    idx_ax = config["index_axis"]
    idx_step_mm = idx_ax["step_mm"]
    idx_range_mm = idx_ax["end_mm"] - idx_ax["start_mm"]
    n_index = int(idx_range_mm / idx_step_mm) + 1 if idx_step_mm > 0 else 1

    # --- Amplitude scale factor ---
    hw_props_path = os.path.join(capture_dir, "hardwareInfo.properties")
    amp_ref = _parse_amplitude_ref(hw_props_path)

    # --- Write HDF5 ---
    n_gates = len(RAWCSCAN_GATE_ORDER)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with h5py.File(output_path, "w") as f:
        # Public/Setup
        import json
        setup_bytes = json.dumps(setup).encode("utf-8")
        f.create_dataset("Public/Setup", data=np.frombuffer(setup_bytes, dtype=np.uint8))

        # Properties
        props = {"file": {
            "creationDate": creation_date or "",
            "modificationDate": creation_date or "",
        }}
        props_bytes = json.dumps(props).encode("utf-8")
        f.create_dataset("Properties", data=np.frombuffer(props_bytes, dtype=np.uint8))

        # Private/MXU/RawCScan — (n_scans, n_beams, n_gates) × 24 bytes
        rawcscan_ds = f.create_dataset(
            "Private/MXU/RawCScan",
            shape=(n_scans, n_beams, n_gates),
            dtype=np.dtype([("data", np.uint8, 24)]),
            chunks=(1, n_beams, n_gates),
        )

        # Build RawCScan scan-by-scan
        for scan_i in range(n_scans):
            row = build_rawcscan_for_scan(peaks, scan_i, n_beams, velocity)
            rawcscan_ds[scan_i] = row.view(np.dtype([("data", np.uint8, 24)])).reshape(n_beams, n_gates)
            if scan_i % 1000 == 0:
                logger.info("RawCScan: %d/%d scans", scan_i, n_scans)

        # AScanAmplitude — (n_scans, n_beams, n_samples) int16
        if has_waveforms:
            ascan_ds = f.create_dataset(
                "Public/Groups/0/Datasets/0-AScanAmplitude",
                shape=(n_scans, n_beams, n_samples),
                dtype=np.int16,
                chunks=(1, n_beams, n_samples),
                compression="gzip",
                compression_opts=4,
            )

            # Scale factor: eddify uses 4095 ref, NDE uses 32767
            scale = 32767.0 / amp_ref if amp_ref > 0 else 1.0

            frame_size = n_beams * 3848
            with open(data_bin_path, "rb") as df:
                for scan_i in range(n_scans):
                    frame_bytes = df.read(frame_size)
                    frame = _parse_waveform_frame(frame_bytes, n_beams, n_samples)
                    # Scale amplitudes from eddify range to NDE range
                    scaled = np.clip(frame.astype(np.float32) * scale, -32767, 32767).astype(np.int16)
                    ascan_ds[scan_i] = scaled
                    if scan_i % 1000 == 0:
                        logger.info("AScan: %d/%d scans", scan_i, n_scans)

        # AScanStatus — (n_scans, n_beams) uint8
        # Derive from peak data: bit 0 = valid (any gate has a valid peak)
        status_data = np.zeros((n_scans, n_beams), dtype=np.uint8)
        for peak in peaks.values():
            valid = np.isfinite(peak["sound_path"][:n_scans, :n_beams])
            status_data[valid] |= 1
        f.create_dataset("Public/Groups/0/Datasets/1-AScanStatus", data=status_data)

    logger.info("Conversion complete: %s (%d scans, %d beams)", output_path, n_scans, n_beams)
    return output_path


def _parse_waveform_frame(frame_bytes: bytes, n_beams: int, n_samples: int) -> np.ndarray:
    """Parse a raw frame from data.bin into (n_beams, n_samples) int16."""
    beam_size = 3848
    out = np.zeros((n_beams, n_samples), dtype=np.int16)

    # Beam 0: skip 136-byte header
    hdr_samples = FRAME_HEADER_SIZE // 2
    beam0_data = np.frombuffer(frame_bytes[FRAME_HEADER_SIZE:beam_size], dtype="<i2")
    out[0, hdr_samples:hdr_samples + len(beam0_data)] = beam0_data

    # Beams 1+
    for b in range(1, n_beams):
        offset = b * beam_size
        out[b] = np.frombuffer(frame_bytes[offset:offset + beam_size], dtype="<i2")

    return out


def _parse_acquisition_date(props_path: str) -> str | None:
    """Parse date from acquisitionInfo.properties."""
    if not os.path.exists(props_path):
        return None
    try:
        with open(props_path, "r", encoding="utf-8-sig") as f:
            for line in f:
                if line.startswith("date="):
                    return line.split("=", 1)[1].strip().replace("\\:", ":")
    except Exception:
        pass
    return None


def _parse_platform_info(props_path: str) -> dict | None:
    """Parse equipment info from plateformInfo.properties."""
    if not os.path.exists(props_path):
        return None
    info = {}
    try:
        with open(props_path, "r", encoding="utf-8-sig") as f:
            for line in f:
                if "=" in line:
                    key, val = line.strip().split("=", 1)
                    if key == "productType":
                        info["model"] = val
                    elif key == "sn":
                        info["serial"] = val
    except Exception:
        pass
    return info if info else None


def _parse_amplitude_ref(props_path: str) -> float:
    """Parse PASumAmplitudeRefValue from hardwareInfo.properties."""
    if not os.path.exists(props_path):
        return 4095.0
    try:
        with open(props_path, "r", encoding="utf-8-sig") as f:
            for line in f:
                if line.startswith("PASumAmplitudeRefValue="):
                    return float(line.split("=", 1)[1].strip())
    except Exception:
        pass
    return 4095.0
```

**Step 4: Run tests, verify pass**

Run: `py -m pytest tests/test_eddify_converter.py::test_convert_capture_acq_to_nde -v`

Note: This test will take a while (~1-2 min) due to 1.6GB file processing.

**Step 5: Commit**

```bash
git add engine/eddify_converter.py tests/test_eddify_converter.py
git commit -m "feat: full eddify capture_acq to NDE HDF5 converter"
```

---

## Task 7: API Route — Expose Conversion Endpoint

**Files:**
- Modify: `api/routes.py`
- Modify: `tests/test_eddify_converter.py`

**Step 1: Write the failing test**

```python
def test_convert_api_endpoint(client):
    """Test the /convert-eddify API endpoint."""
    # This test depends on the API test client fixture
    # If no fixture exists, test via direct function call instead
    from engine.eddify_converter import convert_capture_acq
    import tempfile
    capture_dir = "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq"
    with tempfile.TemporaryDirectory() as tmpdir:
        output = os.path.join(tmpdir, "test.nde")
        result = convert_capture_acq(capture_dir, output)
        assert os.path.exists(result)
        assert os.path.getsize(result) > 1_000_000  # at least 1MB
```

**Step 2: Add API route**

Read `api/routes.py` to understand the existing pattern, then add:

```python
@app.post("/convert-eddify")
async def convert_eddify(request):
    """Convert an eddify .capture_acq directory to .nde format.

    Body JSON: { "capture_dir": "/path/to/file.capture_acq", "output_path": "/path/to/output.nde" }
    If output_path is omitted, writes to same directory with .nde extension.
    """
    body = await request.json()
    capture_dir = body["capture_dir"]
    output_path = body.get("output_path")
    if not output_path:
        base = capture_dir.rstrip("/").rstrip("\\")
        if base.endswith(".capture_acq"):
            base = base[:-len(".capture_acq")]
        output_path = base + ".nde"

    from engine.eddify_converter import convert_capture_acq
    result = convert_capture_acq(capture_dir, output_path)
    return {"output_path": result, "status": "ok"}
```

**Step 3: Commit**

```bash
git add api/routes.py tests/test_eddify_converter.py
git commit -m "feat: add /convert-eddify API endpoint"
```

---

## Task 8: CLI Entry Point

**Files:**
- Modify: `engine/eddify_converter.py` (add `__main__` block)

**Step 1: Add CLI to bottom of eddify_converter.py**

```python
if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if len(sys.argv) < 2:
        print("Usage: python -m engine.eddify_converter <capture_acq_dir> [output.nde]")
        sys.exit(1)

    capture_dir = sys.argv[1]
    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        base = capture_dir.rstrip("/").rstrip("\\")
        if base.endswith(".capture_acq"):
            base = base[:-len(".capture_acq")]
        output_path = base + ".nde"

    convert_capture_acq(capture_dir, output_path)
    print(f"Done: {output_path}")
```

**Step 2: Test CLI**

```bash
cd C:\Users\jonas\OneDrive\Desktop\ndt-companion
py -m engine.eddify_converter "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq"
```

Expected: Creates `.nde` file next to the `.capture_acq` directory.

**Step 3: Commit**

```bash
git add engine/eddify_converter.py
git commit -m "feat: add CLI entry point for eddify converter"
```

---

## Task 9: End-to-End Validation — Run Through Companion Pipeline

**Step 1: Convert the test file**

```bash
cd C:\Users\jonas\OneDrive\Desktop\ndt-companion
py -m engine.eddify_converter "C:/Users/jonas/Downloads/Eddify test fileset/V0802A 0-784MM 1000-1500MM 1.capture_acq" "C:/Users/jonas/Downloads/Eddify test fileset/V0802A_converted.nde"
```

**Step 2: Verify with companion indexer**

```bash
py -c "
from engine.nde_reader import index_file
idx = index_file('C:/Users/jonas/Downloads/Eddify test fileset/V0802A_converted.nde')
print(f'Filename: {idx.filename}')
print(f'Scan axis: {idx.scan_axis.range_mm}')
print(f'Index axis: {idx.index_axis.range_mm}')
print(f'Time axis: quantity={idx.time_axis.quantity}')
print(f'Beams: {idx.beam_count}')
print(f'Velocity: {idx.velocity}')
print(f'Gates: {len(idx.gates)}')
for g in idx.gates:
    print(f'  Gate {g.id} ({g.name}): start={g.start:.6f}s, length={g.length:.6f}s, threshold={g.threshold}%')
print(f'RawCScan: available={idx.rawcscan_available}, gates={idx.n_gates_in_rawcscan}')
print(f'Valid points: {idx.valid_point_count}')
print(f'Probe: {idx.probe}')
print(f'Specimen: {idx.specimen}')
"
```

**Step 3: Test C-scan extraction**

```bash
py -c "
from engine.nde_reader import index_file
from engine.cscan_export import extract_cscan
from engine.models import GateControlParams
idx = index_file('C:/Users/jonas/Downloads/Eddify test fileset/V0802A_converted.nde')
params = GateControlParams(gate_mode='A-I')
result = extract_cscan(idx, params)
print(f'Thickness grid: {result.data.shape}')
print(f'Valid: {result.valid_count}/{result.total_count}')
print(f'Stats: {result.stats}')
"
```

**Step 4: Test waveform extraction**

```bash
py -c "
from engine.nde_reader import index_file
from engine.region_extract import extract_region
idx = index_file('C:/Users/jonas/Downloads/Eddify test fileset/V0802A_converted.nde')
scan_mm = idx.scan_axis.range_mm
idx_mm = idx.index_axis.range_mm
# Extract a small region
region = extract_region(idx, scan_mm[0], scan_mm[0]+10, idx_mm[0], idx_mm[0]+50)
print(f'Waveforms: {region.waveforms.shape}')
print(f'Time axis: {region.time_axis_us[0]:.2f} to {region.time_axis_us[-1]:.2f} us')
print(f'Max amplitude: {region.waveforms.max()}')
"
```

**Step 5: Commit any fixes needed**

---

## Notes for Implementation

- The RawCScan dataset dtype is tricky. The companion reads it as raw bytes via `read_direct_chunk` then parses 24-byte structs. The HDF5 dataset should store raw uint8 data shaped so chunks are `(1, n_beams, n_gates)` with each element being 24 bytes.
- The `data.bin` processing is the bottleneck (1.6GB sequential read). Consider progress logging every 1000 frames.
- Beam 0's header region is zero-padded — those first 68 samples will appear as zero amplitude in the A-scan, which is fine since no real echo occurs at t=0.
- The amplitude scaling (×32767/4095 ≈ ×8) is critical for the companion's threshold logic to work correctly.
- Gate time conversion uses one-way sound path: `time = distance / velocity` (NOT divided by 2, since the eddify stores one-way sound path in the gate definitions).
