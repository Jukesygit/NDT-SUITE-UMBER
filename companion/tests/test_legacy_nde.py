"""
Tests for legacy NDE 3.0.1 format support (engine/nde_format.py).

Legacy files (MXU 5.12 beta, e.g. Ninian Dec 2023) use Domain/Applications
HDF5 layout and a groups[].paut Setup JSON schema. See
docs/plans/2026-07-12-legacy-nde-301-support.md.
"""

import json
import os
import struct
import sys

import h5py
import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Synthetic fixture builders
# ---------------------------------------------------------------------------

_GATE_STRUCT = struct.Struct("<iiffff")  # status, amplitude, crossing, peak, gate_start, gate_end

N_SCANS, N_INDEX, N_GATES = 2, 4, 3
VELOCITY = 5890.0
CR0 = 1.0e-05  # reference gate crossing time used across the fixture


def _gate(status=0, amp=20000, crossing=0.0, peak=0.0, gstart=0.0, gend=0.0) -> bytes:
    return _GATE_STRUCT.pack(status, amp, crossing, peak, gstart, gend)


NO_DATA = _gate(status=16, amp=0)


def _amplitude_ramp() -> np.ndarray:
    """Deterministic A-scan amplitude data: distinct value per (scan, index, sample)."""
    return (np.arange(N_SCANS * N_INDEX * 8, dtype=np.int16) * 100 % 20000).reshape(
        N_SCANS, N_INDEX, 8
    )


def _legacy_setup_json() -> dict:
    """Minimal Setup JSON in the 3.0.1 schema (groups[].dataset + groups[].paut)."""
    return {
        "$schema": "./schema.json",
        "version": "3.0.1",
        "scenario": "General Mapping",
        "acquisitionUnits": [{
            "id": 0, "model": "X3-64", "name": "unit", "platform": "X3",
            "serialNumber": "SN-1", "acquisitionRate": 60.0,
        }],
        "motionDevices": [{"id": 0, "name": "Encoder1", "encoder": {"mode": "Quadrature"}}],
        "probes": [{
            "id": 0, "model": "5L64", "serie": "A32",
            "phasedArrayLinear": {"centralFrequency": 5000000.0},
            "wedgeAssociation": 0,
        }],
        "wedges": [{"id": 0, "model": "SA32", "serie": "N55S"}],
        "specimens": [{
            "id": 0,
            "plateGeometry": {
                "thickness": 0.02,
                "material": {
                    "name": "Steel",
                    "longitudinalWave": {"nominalVelocity": 5890.0},
                    "transversalVerticalWave": {"nominalVelocity": 3240.0},
                    "density": 7.8,
                },
            },
        }],
        "dataEncodings": [{"discreteGrid": {"dimensions": []}}],
        "groups": [{
            "id": 0,
            "name": "GR-1",
            "dataset": {
                "storageMode": "Paintbrush",
                "ascan": {
                    "velocity": VELOCITY,
                    "amplitude": {
                        "path": "/Domain/DataGroups/0/Datasets/0/Amplitude",
                        "dimensions": [
                            {"axis": "UCoordinate", "offset": 0.0, "quantity": N_SCANS, "resolution": 0.001},
                            {"axis": "VCoordinate", "offset": 0.0, "quantity": N_INDEX, "resolution": 0.001},
                            {"axis": "Ultrasound", "offset": 0.0, "quantity": 8, "resolution": 1e-08},
                        ],
                    },
                    "status": {
                        "path": "/Domain/DataGroups/0/Datasets/0/Status",
                        "dimensions": [
                            {"axis": "UCoordinate", "offset": 0.0, "quantity": N_SCANS, "resolution": 0.001},
                            {"axis": "VCoordinate", "offset": 0.0, "quantity": N_INDEX, "resolution": 0.001},
                        ],
                    },
                },
            },
            "paut": {
                "velocity": VELOCITY,
                "waveMode": "Longitudinal",
                "beams": [{}, {}, {}],
                "gates": [
                    {"id": 0, "name": "Gate I", "start": 3.86e-05, "length": 6.79e-06,
                     "threshold": 20.0, "synchronization": {"mode": "Pulse"}},
                    {"id": 1, "name": "Gate A", "start": 4.41e-06, "length": 1.019e-05,
                     "threshold": 17.0,
                     "synchronization": {"mode": "GateRelative", "triggeringEvent": "Crossing", "gateId": 0}},
                    {"id": 2, "name": "Gate B", "start": 1.935e-05, "length": 1.091e-05,
                     "threshold": 15.0,
                     "synchronization": {"mode": "GateRelative", "triggeringEvent": "Crossing", "gateId": 0}},
                ],
                "softwareProcess": {
                    "thickness": {
                        "min": 0.005,
                        "max": 0.05,
                        "gates": [
                            {"id": 1, "timeSelection": "Peak"},
                            {"id": 0, "timeSelection": "Crossing"},
                        ],
                    },
                },
            },
        }],
    }


def _rawcscan_cells() -> list[list[bytes]]:
    """Per-(scan, index) gate structs. Flat list: scan-major, index-minor.

    Expected thickness (A-I, ref=gate0, meas=gate1, peak_fallback):
      (0,0) 17.67   (0,1) 20.615 via peak recovery   (0,2) ND   (0,3) 23.56
      (1,*) 14.725
    """
    cells = []
    # scan 0
    cells.append([_gate(0, 20000, CR0), _gate(0, 10000, CR0 + 6.0e-06), NO_DATA])
    cells.append([_gate(0, 20000, CR0), _gate(2, 15000, 0.0, peak=CR0 + 7.0e-06), NO_DATA])
    cells.append([NO_DATA, NO_DATA, NO_DATA])
    cells.append([_gate(0, 20000, CR0), _gate(0, 30000, CR0 + 8.0e-06), NO_DATA])
    # scan 1
    for _ in range(N_INDEX):
        cells.append([_gate(0, 20000, CR0), _gate(0, 25000, CR0 + 5.0e-06), NO_DATA])
    return cells


def make_legacy_nde(path: str) -> str:
    """Write a minimal format-3.0.1 NDE file (Domain/Applications layout)."""
    setup_bytes = json.dumps(_legacy_setup_json(), separators=(",", ":")).encode("utf-8")

    raw = np.zeros((N_SCANS, N_INDEX * N_GATES, 24), dtype=np.uint8)
    for cell_i, gates in enumerate(_rawcscan_cells()):
        scan_i, idx_i = divmod(cell_i, N_INDEX)
        for g_i, packed in enumerate(gates):
            raw[scan_i, idx_i * N_GATES + g_i, :] = np.frombuffer(packed, dtype=np.uint8)

    status = np.array([[3, 3, 0, 3], [3, 3, 3, 3]], dtype=np.uint8)

    with h5py.File(path, "w") as f:
        f.attrs["Format version"] = np.bytes_(b"3.0.1")
        f.attrs["Application version"] = np.bytes_(b"5.12.1.11")
        f.attrs["Date created"] = np.bytes_(b"2023-11-27T07:59:49-0000")

        f.create_dataset("Domain/Setup", data=np.bytes_(setup_bytes))
        f.create_dataset(
            "Domain/DataGroups/0/Datasets/0/Amplitude",
            data=_amplitude_ramp(),
        )
        f.create_dataset("Domain/DataGroups/0/Datasets/0/Status", data=status)

        # Contiguous (no chunks), 2D flattened, opaque V24 — matches MXU 5.12 output
        ds = f.create_dataset(
            "Applications/MXU/RawCScan",
            shape=(N_SCANS, N_INDEX * N_GATES),
            dtype=np.dtype("V24"),
        )
        ds[...] = raw.view(np.dtype("V24")).reshape(N_SCANS, N_INDEX * N_GATES)

    return path


def make_modern_min_nde(path: str) -> str:
    """Minimal 4.x-layout file for resolver passthrough tests."""
    setup = {"version": "4.1.0", "groups": [{"id": 0, "datasets": [], "processes": []}]}
    with h5py.File(path, "w") as f:
        f.create_dataset("Public/Setup", data=np.bytes_(json.dumps(setup).encode()))
        f.create_dataset("Properties", data=np.bytes_(
            b'{"file":{"creationDate":"2026-02-20T14:45:20","modificationDate":"2026-02-20T15:00:00"}}'
        ))
        f.create_dataset("Public/Groups/0/Datasets/0-AScanAmplitude",
                         data=np.zeros((1, 2, 4), dtype=np.int16))
        f.create_dataset("Public/Groups/0/Datasets/1-AScanStatus",
                         data=np.zeros((1, 2), dtype=np.uint8))
        f.create_dataset("Private/MXU/RawCScan", shape=(1, 2, 3),
                         dtype=np.dtype("V24"), chunks=(1, 2, 3))
    return path


@pytest.fixture
def legacy_file(tmp_path):
    return make_legacy_nde(str(tmp_path / "legacy.nde"))


@pytest.fixture
def modern_file(tmp_path):
    return make_modern_min_nde(str(tmp_path / "modern.nde"))


# ---------------------------------------------------------------------------
# nde_format: setup schema normalization
# ---------------------------------------------------------------------------

class TestNormalizeSetup:
    def test_legacy_groups_gain_datasets_and_processes(self):
        from engine.nde_format import normalize_setup

        normalized = normalize_setup(_legacy_setup_json())
        group = normalized["groups"][0]

        ds = group["datasets"][0]
        assert ds["path"] == "/Domain/DataGroups/0/Datasets/0/Amplitude"
        assert ds["dataClass"] == "AScanAmplitude"
        axes = [d["axis"] for d in ds["dimensions"]]
        assert axes == ["UCoordinate", "VCoordinate", "Ultrasound"]

        upa = next(p["ultrasonicPhasedArray"] for p in group["processes"]
                   if "ultrasonicPhasedArray" in p)
        assert upa["velocity"] == VELOCITY
        assert len(upa["gates"]) == 3
        assert len(upa["beams"]) == 3

    def test_legacy_thickness_maps_time_selection_to_gate_detection(self):
        from engine.nde_format import normalize_setup

        normalized = normalize_setup(_legacy_setup_json())
        group = normalized["groups"][0]
        tp = next(p["thickness"] for p in group["processes"] if "thickness" in p)

        assert tp["min"] == 0.005
        assert tp["max"] == 0.05
        assert tp["gates"][0]["gateDetection"] == "Peak"
        assert tp["gates"][1]["gateDetection"] == "Crossing"

    def test_modern_setup_passes_through_unchanged(self):
        from engine.nde_format import normalize_setup

        modern = {"version": "4.1.0", "groups": [{"id": 0, "datasets": [{"path": "x"}],
                                                  "processes": [{"thickness": {}}]}]}
        assert normalize_setup(modern) is modern


# ---------------------------------------------------------------------------
# nde_format: path resolvers + dates + raw reads
# ---------------------------------------------------------------------------

class TestResolvers:
    def test_legacy_paths(self, legacy_file):
        from engine import nde_format

        with h5py.File(legacy_file, "r") as f:
            assert nde_format.resolve_setup_path(f) == "Domain/Setup"
            assert nde_format.resolve_amplitude_path(f) == "Domain/DataGroups/0/Datasets/0/Amplitude"
            assert nde_format.resolve_status_path(f) == "Domain/DataGroups/0/Datasets/0/Status"
            assert nde_format.resolve_rawcscan_path(f) == "Applications/MXU/RawCScan"

    def test_modern_paths(self, modern_file):
        from engine import nde_format

        with h5py.File(modern_file, "r") as f:
            assert nde_format.resolve_setup_path(f) == "Public/Setup"
            assert nde_format.resolve_amplitude_path(f) == "Public/Groups/0/Datasets/0-AScanAmplitude"
            assert nde_format.resolve_status_path(f) == "Public/Groups/0/Datasets/1-AScanStatus"
            assert nde_format.resolve_rawcscan_path(f) == "Private/MXU/RawCScan"

    def test_missing_paths(self, tmp_path):
        from engine import nde_format

        p = str(tmp_path / "bare.nde")
        with h5py.File(p, "w") as f:
            f.create_dataset("Domain/Setup", data=np.bytes_(b"{}"))
        with h5py.File(p, "r") as f:
            # amplitude is required by every consumer — raises
            with pytest.raises(KeyError):
                nde_format.resolve_amplitude_path(f)
            # status / rawcscan are optional at index time — None
            assert nde_format.resolve_status_path(f) is None
            assert nde_format.resolve_rawcscan_path(f) is None

    def test_setup_missing_raises_keyerror(self, tmp_path):
        from engine import nde_format

        p = str(tmp_path / "empty.nde")
        with h5py.File(p, "w"):
            pass
        with h5py.File(p, "r") as f:
            with pytest.raises(KeyError):
                nde_format.resolve_setup_path(f)

    def test_load_setup_legacy_is_normalized(self, legacy_file):
        from engine.nde_format import load_setup

        with h5py.File(legacy_file, "r") as f:
            setup = load_setup(f)
        assert "datasets" in setup["groups"][0]
        assert "processes" in setup["groups"][0]

    def test_read_file_dates_legacy_from_root_attrs(self, legacy_file):
        from engine.nde_format import read_file_dates

        with h5py.File(legacy_file, "r") as f:
            creation, modification = read_file_dates(f)
        assert creation == "2023-11-27T07:59:49-0000"
        assert modification is None

    def test_read_file_dates_modern_from_properties(self, modern_file):
        from engine.nde_format import read_file_dates

        with h5py.File(modern_file, "r") as f:
            creation, modification = read_file_dates(f)
        assert creation == "2026-02-20T14:45:20"
        assert modification == "2026-02-20T15:00:00"

    def test_read_opaque_2d_roundtrip(self, legacy_file):
        from engine.nde_format import read_opaque_2d

        with h5py.File(legacy_file, "r") as f:
            raw = read_opaque_2d(f["Applications/MXU/RawCScan"])

        assert raw.shape == (N_SCANS, N_INDEX * N_GATES, 24)
        assert raw.dtype == np.uint8
        # (0,0) gate 0: status=0, amp=20000, crossing=CR0
        entry = raw[0, 0]
        status, amp, crossing, _, _, _ = _GATE_STRUCT.unpack(entry.tobytes())
        assert status == 0
        assert amp == 20000
        assert crossing == pytest.approx(CR0)


# ---------------------------------------------------------------------------
# nde_reader: indexing legacy files
# ---------------------------------------------------------------------------

class TestIndexFileLegacy:
    def test_axes_gates_and_paut(self, legacy_file):
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        assert idx.scan_axis.quantity == N_SCANS
        assert idx.index_axis.quantity == N_INDEX
        assert idx.time_axis.quantity == 8
        assert idx.velocity == VELOCITY
        assert idx.wave_mode == "Longitudinal"
        assert idx.beam_count == 3
        assert [g.name for g in idx.gates] == ["Gate I", "Gate A", "Gate B"]
        assert idx.gates[1].sync_mode == "GateRelative"
        assert idx.gates[1].sync_gate_id == 0

    def test_rawcscan_metadata_2d(self, legacy_file):
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        assert idx.rawcscan_available
        assert idx.n_gates_in_rawcscan == N_GATES
        assert idx.rawcscan_chunk_valid  # legacy whole-read path needs no chunk layout

    def test_thickness_process_gate_detection(self, legacy_file):
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        assert idx.thickness_process is not None
        assert idx.thickness_process.min_mm == 5.0
        assert idx.thickness_process.max_mm == 50.0
        assert idx.thickness_process.gate_ids == [1, 0]
        assert idx.thickness_process.gate_detection == "Peak"

    def test_valid_points_dates_and_metadata(self, legacy_file):
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        assert idx.valid_point_count == 7  # status bytes with bit0 set
        assert idx.creation_date == "2023-11-27T07:59:49-0000"
        assert idx.probe is not None and idx.probe.model == "5L64"
        assert idx.specimen is not None
        assert idx.specimen.nominal_thickness_mm == 20.0


# ---------------------------------------------------------------------------
# cscan_export: legacy 2D flattened RawCScan (CSV export priority)
# ---------------------------------------------------------------------------

# thickness mm = delta_crossing_seconds * VELOCITY / 2 * 1000
_MM_PER_S = VELOCITY / 2.0 * 1000.0
TH_00 = 6.0e-06 * _MM_PER_S   # 17.67
TH_01 = 7.0e-06 * _MM_PER_S   # 20.615 (meas peak recovery)
TH_03 = 8.0e-06 * _MM_PER_S   # 23.56
TH_1X = 5.0e-06 * _MM_PER_S   # 14.725


class TestExtractCscanLegacy:
    @staticmethod
    def _extract(legacy_file, **overrides):
        from engine.cscan_export import extract_cscan
        from engine.models import GateControlParams
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        return extract_cscan(idx, GateControlParams(**overrides)), idx

    def test_thickness_grid_peak_fallback(self, legacy_file):
        result, _ = self._extract(legacy_file)

        assert result.data.shape == (N_SCANS, N_INDEX)
        assert result.data[0, 0] == pytest.approx(TH_00, abs=1e-3)
        assert result.data[0, 1] == pytest.approx(TH_01, abs=1e-3)
        assert np.isnan(result.data[0, 2])
        assert result.data[0, 3] == pytest.approx(TH_03, abs=1e-3)
        np.testing.assert_allclose(result.data[1, :], TH_1X, atol=1e-3)
        assert result.valid_count == 7
        assert result.total_count == N_SCANS * N_INDEX

    def test_crossing_only_rejects_peak_recovery_point(self, legacy_file):
        result, _ = self._extract(legacy_file, meas_recovery="crossing_only")

        assert np.isnan(result.data[0, 1])
        assert result.valid_count == 6

    def test_amplitude_grid_is_meas_gate_percent(self, legacy_file):
        result, _ = self._extract(legacy_file)

        assert result.amplitude[0, 0] == pytest.approx(10000 / 32767 * 200, abs=1e-2)
        assert result.amplitude[1, 0] == pytest.approx(25000 / 32767 * 200, abs=1e-2)

    def test_thickness_range_filter(self, legacy_file):
        result, _ = self._extract(legacy_file, thickness_min=15.0, thickness_max=21.0)

        assert result.data[0, 0] == pytest.approx(TH_00, abs=1e-3)  # 17.67 in range
        assert np.isnan(result.data[0, 3])                          # 23.56 > max
        assert np.isnan(result.data[1, 0])                          # 14.725 < min

    def test_csv_export(self, legacy_file, tmp_path):
        from engine.cscan_export import cscan_to_csv

        result, idx = self._extract(legacy_file)
        out = str(tmp_path / "out.csv")
        cscan_to_csv(result, out, idx, __import__("engine.models", fromlist=["GateControlParams"]).GateControlParams())

        with open(out, "r", encoding="utf-8") as fh:
            content = fh.read()
        lines = content.splitlines()

        assert f"Velocity (m/s)={VELOCITY:.1f}" in lines
        assert any(line.startswith("Gate=Gate A") for line in lines)
        header_i = next(i for i, line in enumerate(lines) if line.startswith("mm\t"))
        # rows are per index position: index_mm, then one thickness per scan
        first_row = lines[header_i + 1].split("\t")
        assert first_row[1] == f"{TH_00:.1f}"
        third_row = lines[header_i + 3].split("\t")
        assert third_row[1] == "ND"  # (0,2) no data


# ---------------------------------------------------------------------------
# Remaining engine modules on legacy files (waveform readers, calibration)
# ---------------------------------------------------------------------------

class TestWaveformModulesLegacy:
    @staticmethod
    def _index(legacy_file):
        from engine.nde_reader import index_file

        idx = index_file(legacy_file)
        assert idx is not None
        return idx

    def test_extract_region_reads_legacy_amplitude(self, legacy_file):
        from engine.region_extract import extract_region

        idx = self._index(legacy_file)
        region = extract_region(idx, 0.0, 2.0, 0.0, 4.0)

        assert region.waveforms.shape == (N_SCANS, N_INDEX, 8)
        np.testing.assert_array_equal(region.waveforms, _amplitude_ramp())
        assert region.status.shape == (N_SCANS, N_INDEX)

    def test_envelope_chunk_legacy(self, legacy_file):
        from engine.envelope import extract_envelope_chunk

        idx = self._index(legacy_file)
        env = extract_envelope_chunk(idx, 0, N_SCANS, n_bins=4)

        assert env.shape == (N_SCANS, N_INDEX, 4)
        assert env.max() > 0  # ramp data must survive the read

    def test_waveform_thickness_legacy(self, legacy_file):
        from engine.waveform_thickness import compute_thickness_full_res

        idx = self._index(legacy_file)
        thickness, amplitude = compute_thickness_full_res(
            idx, 0.0, 0.08, 10.0, 0.0, 0.08, 10.0
        )

        assert thickness.shape == (N_SCANS, N_INDEX)
        assert amplitude.shape == (N_SCANS, N_INDEX)

    def test_render_bscan_legacy(self, legacy_file):
        from engine.pillow_renderer import render_bscan_pillow

        idx = self._index(legacy_file)
        png, _ms = render_bscan_pillow(idx, "axial", 0.0, 1.0, width=80, height=40)
        assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def test_render_ascan_legacy(self, legacy_file):
        from engine.pillow_renderer import render_ascan_pillow

        idx = self._index(legacy_file)
        png, _ms = render_ascan_pillow(idx, 0.0, 1.0, width=80, height=40)
        assert png[:8] == b"\x89PNG\r\n\x1a\n"

    def test_calibration_scenario_legacy(self, legacy_file):
        from engine.calibration import _get_scenario

        idx = self._index(legacy_file)
        assert _get_scenario(idx) == "General Mapping"


# ---------------------------------------------------------------------------
# Real legacy file integration (Ninian Dec 2023, MXU 5.12.1.11, format 3.0.1)
# ---------------------------------------------------------------------------

NINIAN_NDE = r"D:\Work\Bilfinger Job Folders\2023\Ninians Dec 2023\3. Data\Row AB\AB1.nde"


@pytest.mark.skipif(not os.path.exists(NINIAN_NDE), reason="Ninian legacy NDE not available")
class TestRealNinianFile:
    def test_index_extract_and_csv_export(self, tmp_path):
        from engine.cscan_export import cscan_to_csv, extract_cscan
        from engine.models import GateControlParams
        from engine.nde_reader import index_file

        idx = index_file(NINIAN_NDE)
        assert idx is not None
        assert idx.scan_axis.quantity == 1481
        assert idx.index_axis.quantity == 513
        assert idx.n_gates_in_rawcscan == 3
        assert idx.velocity == 5890.0
        assert [g.name for g in idx.gates] == ["Gate I", "Gate A", "Gate B"]
        assert idx.thickness_process is not None
        assert idx.creation_date is not None and idx.creation_date.startswith("2023-")

        # Export using the file's own thickness window (18-30mm)
        params = GateControlParams(
            gate_mode="A-I",
            thickness_min=idx.thickness_process.min_mm,
            thickness_max=idx.thickness_process.max_mm,
        )
        result = extract_cscan(idx, params)

        assert result.valid_count > 0
        assert idx.thickness_process.min_mm <= result.stats["min"]
        assert result.stats["max"] <= idx.thickness_process.max_mm

        out = tmp_path / "ab1.csv"
        cscan_to_csv(result, str(out), idx, params)
        content = out.read_text(encoding="utf-8")
        assert "Velocity (m/s)=5890.0" in content
        assert content.count("\n") == 513 + 7  # 513 index rows + 6 header lines + column header
