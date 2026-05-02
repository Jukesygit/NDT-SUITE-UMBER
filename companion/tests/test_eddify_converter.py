"""Tests for engine/eddify_converter.py — Tasks 1-6."""

from __future__ import annotations

import json
import math
import os
import shutil
import struct
from pathlib import Path

import h5py
import numpy as np
import pytest

from engine.eddify_converter import (
    BEAM_SLOT_SIZE,
    EDDIFY_GATE_ORDER,
    FRAME_HEADER_SIZE,
    FRAME_MAGIC,
    NDE_GATE_COUNT,
    _float,
    _int,
    _text,
    _parse_acquisition_date,
    _parse_amplitude_ref,
    _parse_platform_info,
    build_raster_grid,
    build_rawcscan_for_scan,
    build_setup_json,
    convert_capture_acq,
    get_waveform_dimensions,
    parse_eddify_xml,
    read_frame_positions,
    read_peak_file,
    read_waveform_frame,
)

# ---------------------------------------------------------------------------
# Test data path
# ---------------------------------------------------------------------------

TEST_DIR = Path(
    r"C:/Users/jonas/Downloads/Eddify test fileset"
    r"/V0802A 0-784MM 1000-1500MM 1.capture_acq"
)

HAVE_TEST_DATA = TEST_DIR.is_dir()
requires_test_data = pytest.mark.skipif(
    not HAVE_TEST_DATA, reason="Eddify test data not found"
)


# ---------------------------------------------------------------------------
# XML helper unit tests
# ---------------------------------------------------------------------------

class TestXmlHelpers:
    """Quick checks for _text / _float / _int with synthetic XML."""

    def _el(self, xml_str: str):
        from xml.etree import ElementTree as ET
        return ET.fromstring(xml_str)

    def test_text_found(self):
        el = self._el("<a><b>hello</b></a>")
        assert _text(el, "b") == "hello"

    def test_text_missing(self):
        el = self._el("<a><c>x</c></a>")
        assert _text(el, "b", "default") == "default"

    def test_text_none_element(self):
        assert _text(None, "b", "fallback") == "fallback"

    def test_float_found(self):
        el = self._el("<a><v>3.14</v></a>")
        assert _float(el, "v") == pytest.approx(3.14)

    def test_float_missing(self):
        el = self._el("<a/>")
        assert _float(el, "v", 9.9) == pytest.approx(9.9)

    def test_int_found(self):
        el = self._el("<a><n>42</n></a>")
        assert _int(el, "n") == 42

    def test_int_from_float_string(self):
        el = self._el("<a><n>7.5</n></a>")
        assert _int(el, "n") == 7


# ---------------------------------------------------------------------------
# Task 1 — XML parser
# ---------------------------------------------------------------------------

@requires_test_data
class TestParseEddifyXml:
    """Validate parse_eddify_xml against the real root.xml."""

    @pytest.fixture(scope="class")
    def config(self):
        return parse_eddify_xml(str(TEST_DIR / "root.xml"))

    # -- Probe --
    def test_probe_model(self, config):
        assert config["probe"]["model"] == "I4-7.5L64_H24mm"

    def test_probe_frequency(self, config):
        assert config["probe"]["frequency"] == pytest.approx(7.5)

    def test_probe_elements(self, config):
        assert config["probe"]["elements"] == 64

    def test_probe_pitch(self, config):
        assert config["probe"]["pitch"] == pytest.approx(1.0)

    # -- Wedge --
    def test_wedge_name(self, config):
        assert config["wedge"]["name"] == "New wedge"

    def test_wedge_velocity(self, config):
        assert config["wedge"]["velocity"] == pytest.approx(1480.0)

    def test_wedge_angle_flat(self, config):
        assert config["wedge"]["angle"] == pytest.approx(0.0)

    # -- Specimen --
    def test_specimen_thickness(self, config):
        assert config["specimen"]["thickness"] == pytest.approx(42.0)

    def test_specimen_velocity_l(self, config):
        assert config["specimen"]["velocity_l"] == pytest.approx(5900.0)

    def test_specimen_velocity_t(self, config):
        assert config["specimen"]["velocity_t"] == pytest.approx(3230.0)

    def test_specimen_material(self, config):
        assert "Steel" in config["specimen"]["material"]

    def test_specimen_density(self, config):
        assert config["specimen"]["density"] == pytest.approx(7.8)

    # -- Gates --
    def test_gate_count(self, config):
        assert len(config["gates"]) == 3

    def test_gate_ids(self, config):
        ids = sorted(g["id"] for g in config["gates"])
        assert ids == [0, 1, 31]

    def test_gate_0_has_threshold(self, config):
        g0 = next(g for g in config["gates"] if g["id"] == 0)
        assert g0["threshold"] == pytest.approx(0.3)

    def test_gate_31_is_synchro(self, config):
        g31 = next(g for g in config["gates"] if g["id"] == 31)
        assert g31["type"] == "porteSynchro"

    def test_gate_31_threshold(self, config):
        g31 = next(g for g in config["gates"] if g["id"] == 31)
        assert g31["threshold"] == pytest.approx(0.8)

    def test_gate_range_populated(self, config):
        for g in config["gates"]:
            assert g["sound_path_start"] > 0
            assert g["sound_path_end"] > g["sound_path_start"]

    # -- Scan axis --
    def test_scan_start(self, config):
        assert config["scan_axis"]["start"] == pytest.approx(0.0)

    def test_scan_end(self, config):
        assert config["scan_axis"]["end"] == pytest.approx(784.0)

    # -- Index axis --
    def test_index_start(self, config):
        assert config["index_axis"]["start"] == pytest.approx(1000.0)

    def test_index_end(self, config):
        assert config["index_axis"]["end"] == pytest.approx(1500.0)

    # -- Sampling period --
    def test_sampling_period(self, config):
        assert config["sampling_period_ns"] == 20

    # -- Beam count --
    def test_beam_count(self, config):
        assert config["beam_count"] == 55

    # -- Encoder resolution --
    def test_encoder_resolution(self, config):
        assert config["encoder_resolution"] == pytest.approx(37.5)


# ---------------------------------------------------------------------------
# Task 2 — Peak data reader
# ---------------------------------------------------------------------------

@requires_test_data
class TestReadPeakFile:
    """Validate read_peak_file against data_peaks_0_0.bin."""

    @pytest.fixture(scope="class")
    def peaks(self):
        return read_peak_file(str(TEST_DIR / "data_peaks_0_0.bin"))

    def test_n_scans(self, peaks):
        assert peaks["n_scans"] == 7802

    def test_n_beams(self, peaks):
        assert peaks["n_beams"] == 55

    def test_sound_path_shape(self, peaks):
        assert peaks["sound_path"].shape == (7802, 55)

    def test_amplitude_shape(self, peaks):
        assert peaks["amplitude"].shape == (7802, 55)

    def test_file_size(self):
        fsize = (TEST_DIR / "data_peaks_0_0.bin").stat().st_size
        assert fsize == 20 + 7802 * 55 * 8

    def test_first_record_finite(self, peaks):
        """First scan position should have valid (finite) data."""
        assert np.isfinite(peaks["sound_path"][0, 0])
        assert peaks["amplitude"][0, 0] > 0.0

    def test_sentinel_values_exist(self, peaks):
        """Inf sentinel should appear somewhere (no-peak positions)."""
        assert np.any(np.isinf(peaks["sound_path"]))

    def test_all_peak_files(self):
        """All four peak files should parse with consistent dimensions."""
        for fname in ("data_peaks_0_0.bin", "data_peaks_0_1.bin",
                       "data_peaks_0_16.bin", "data_peaks_0_31.bin"):
            p = read_peak_file(str(TEST_DIR / fname))
            assert p["n_scans"] == 7802
            assert p["n_beams"] == 55


# ---------------------------------------------------------------------------
# Task 3 — Waveform reader
# ---------------------------------------------------------------------------

@requires_test_data
class TestWaveformReader:
    """Validate get_waveform_dimensions and read_waveform_frame."""

    @pytest.fixture(scope="class")
    def dims(self):
        return get_waveform_dimensions(str(TEST_DIR / "data.bin"))

    def test_n_frames(self, dims):
        assert dims["n_frames"] == 7802

    def test_n_beams(self, dims):
        assert dims["n_beams"] == 55

    def test_n_samples(self, dims):
        assert dims["n_samples"] == 1924

    def test_frame_size(self, dims):
        assert dims["frame_size"] == 211640

    def test_beam_size(self, dims):
        assert dims["beam_size"] == BEAM_SLOT_SIZE

    def test_read_first_frame_shape(self, dims):
        frame = read_waveform_frame(
            str(TEST_DIR / "data.bin"), 0, dims["n_beams"]
        )
        assert frame.shape == (55, 1924)
        assert frame.dtype == np.int16

    def test_beam0_left_aligned(self, dims):
        """Beam 0 has 1856 samples left-aligned; trailing 68 samples are zero."""
        frame = read_waveform_frame(
            str(TEST_DIR / "data.bin"), 0, dims["n_beams"]
        )
        beam0_samples = (BEAM_SLOT_SIZE - FRAME_HEADER_SIZE) // 2  # 1856
        # Trailing zeros
        assert np.all(frame[0, beam0_samples:] == 0)

    def test_beam0_has_signal(self, dims):
        """Beam 0 should have non-zero waveform data at the start."""
        frame = read_waveform_frame(
            str(TEST_DIR / "data.bin"), 0, dims["n_beams"]
        )
        pad = 0  # now left-aligned
        assert np.any(frame[0, pad:] != 0)

    def test_beam1_has_signal(self, dims):
        """Beam 1 should have non-zero waveform data."""
        frame = read_waveform_frame(
            str(TEST_DIR / "data.bin"), 0, dims["n_beams"]
        )
        assert np.any(frame[1, :] != 0)

    def test_read_last_frame(self, dims):
        """Should be able to read the last frame without error."""
        frame = read_waveform_frame(
            str(TEST_DIR / "data.bin"),
            dims["n_frames"] - 1,
            dims["n_beams"],
        )
        assert frame.shape == (55, 1924)

    def test_frame_magic_consistency(self):
        """The magic bytes should appear at the start of multiple frames."""
        path = str(TEST_DIR / "data.bin")
        dims = get_waveform_dimensions(path)
        with open(path, "rb") as f:
            for idx in (0, 1, 100):
                f.seek(idx * dims["frame_size"])
                magic = struct.unpack_from("<I", f.read(4))[0]
                assert magic == FRAME_MAGIC, f"Bad magic at frame {idx}"


# ---------------------------------------------------------------------------
# Raster grid tests
# ---------------------------------------------------------------------------


@requires_test_data
class TestReadFramePositions:
    """Validate read_frame_positions against real data.bin."""

    def test_returns_correct_shape(self):
        result = read_frame_positions(str(TEST_DIR / "data.bin"), 7802, 55)
        assert result["scan_ticks"].shape == (7802,)
        assert result["sweep_ids"].shape == (7802,)
        assert result["scan_ticks"].dtype == np.int32
        assert result["sweep_ids"].dtype == np.int32

    def test_sweep_ids_range(self):
        result = read_frame_positions(str(TEST_DIR / "data.bin"), 7802, 55)
        assert result["sweep_ids"].min() >= 0
        assert result["sweep_ids"].max() == 10  # 11 sweeps (0-10)

    def test_scan_positions_reasonable(self):
        result = read_frame_positions(str(TEST_DIR / "data.bin"), 7802, 55)
        scan_mm = result["scan_ticks"] / 37.5
        # Most scan positions should be within 0-784mm range
        assert scan_mm.max() < 800.0
        assert scan_mm.min() >= -1.0  # small negative from jitter is OK

    def test_full_sweeps_have_775_unique_bins(self):
        result = read_frame_positions(str(TEST_DIR / "data.bin"), 7802, 55)
        # Sweeps 2 and 3 are full sweeps — should have 775 unique scan bins
        scan_mm = result["scan_ticks"] / 37.5
        for sid in [2, 3]:
            mask = result["sweep_ids"] == sid
            bins = np.unique(np.round(scan_mm[mask] / 1.0133333))
            assert len(bins) >= 770


@requires_test_data
class TestBuildRasterGrid:
    """Validate build_raster_grid with real frame position data."""

    @pytest.fixture(scope="class")
    def raster(self):
        result = read_frame_positions(str(TEST_DIR / "data.bin"), 7802, 55)
        return build_raster_grid(
            scan_ticks=result["scan_ticks"],
            sweep_ids=result["sweep_ids"],
            encoder_resolution=37.5,
            scan_step_mm=1.0133333333333334,
            scan_length_mm=784.0,
            index_start_mm=1000.0,
            index_end_mm=1500.0,
            index_step_mm=50.0,
            n_beams=55,
            probe_pitch_mm=1.0,
        )

    def test_n_sweeps(self, raster):
        assert raster["n_sweeps"] == 11

    def test_n_scan_bins(self, raster):
        # 784 / 1.0133 ≈ 774, +1 = 775
        assert raster["n_scan_bins"] == 775

    def test_n_index(self, raster):
        # Clipped to 1000-1500mm at 1mm pitch = 501 positions
        assert raster["n_index"] == 501

    def test_frame_map_shape(self, raster):
        assert raster["frame_map"].shape == (775, 501)

    def test_beam_map_shape(self, raster):
        assert raster["beam_map"].shape == (775, 501)

    def test_maps_have_valid_entries(self, raster):
        filled = (raster["frame_map"] >= 0).sum()
        total = 775 * 501
        # Should be ~68% filled
        assert filled > total * 0.60

    def test_index_axis_range(self, raster):
        idx = raster["index_axis_mm"]
        assert idx[0] == pytest.approx(1000.0)
        assert idx[-1] == pytest.approx(1500.0)

    def test_scan_axis_starts_at_zero(self, raster):
        assert raster["scan_axis_mm"][0] == pytest.approx(0.0)


class TestBuildRasterGridSynthetic:
    """Validate build_raster_grid with synthetic data."""

    def test_simple_two_sweeps(self):
        # 2 sweeps of 3 beams, 100mm scan, step=10mm → 11 bins
        # Sweep 0: frames at scan positions 5, 15, 25, ..., 95
        # Sweep 1: frames at scan positions 5, 15, 25, ..., 95
        scan_ticks = np.array([5, 15, 25, 35, 45, 55, 65, 75, 85, 95,
                               5, 15, 25, 35, 45, 55, 65, 75, 85, 95],
                              dtype=np.int32)
        sweep_ids = np.array([0]*10 + [1]*10, dtype=np.int32)
        result = build_raster_grid(
            scan_ticks=scan_ticks,
            sweep_ids=sweep_ids,
            encoder_resolution=1.0,
            scan_step_mm=10.0,
            scan_length_mm=100.0,
            index_start_mm=0.0,
            index_end_mm=20.0,
            index_step_mm=10.0,
            n_beams=2,
            probe_pitch_mm=1.0,
        )
        assert result["n_sweeps"] == 2
        assert result["n_scan_bins"] == 11
        # Index clipped to 0-20mm at 1mm pitch = 21 positions
        assert result["n_index"] == 21
        # Frame 0 (scan 5mm → bin round(5/10)=0) sweep 0, beam 0 → idx_bin 0
        assert result["frame_map"][0, 0] == 0
        assert result["beam_map"][0, 0] == 0
        # Frame 10 (scan 5mm → bin 0) sweep 1, beam 0 → idx_bin 10
        assert result["frame_map"][0, 10] == 10
        assert result["beam_map"][0, 10] == 0

    def test_overlap_later_frame_wins(self):
        """When beams from adjacent sweeps overlap, later frame takes priority."""
        # 2 sweeps, step=2mm, 3 beams, pitch=2mm
        # Sweep 0: beams at 0, 2, 4
        # Sweep 1: beams at 2, 4, 6
        # Overlap at positions 2 (sweep0 beam1 vs sweep1 beam0)
        # and 4 (sweep0 beam2 vs sweep1 beam1)
        scan_ticks = np.array([50, 50], dtype=np.int32)  # 2 frames at same scan pos
        sweep_ids = np.array([0, 1], dtype=np.int32)
        result = build_raster_grid(
            scan_ticks=scan_ticks,
            sweep_ids=sweep_ids,
            encoder_resolution=1.0,
            scan_step_mm=100.0,
            scan_length_mm=100.0,
            index_start_mm=0.0,
            index_end_mm=6.0,
            index_step_mm=2.0,
            n_beams=3,
            probe_pitch_mm=2.0,
        )
        # Index: 0, 2, 4, 6 → 4 positions at 2mm pitch
        assert result["n_index"] == 4
        scan_bin = round(50 / 100)  # = 0 (banker's rounding)
        # At idx position 2mm (idx_bin=1): sweep 1 (frame 1) overwrites sweep 0 (frame 0)
        assert result["frame_map"][scan_bin, 1] == 1  # later frame wins
        assert result["beam_map"][scan_bin, 1] == 0   # beam 0 of sweep 1
        # At idx_bin=2 (position 4mm): sweep 1 overwrites sweep 0
        assert result["frame_map"][scan_bin, 2] == 1  # later sweep wins
        assert result["beam_map"][scan_bin, 2] == 1   # beam 1 of sweep 1


# ---------------------------------------------------------------------------
# Task 4 — build_setup_json
# ---------------------------------------------------------------------------

class TestBuildSetupJson:
    """Validate build_setup_json with synthetic config."""

    @pytest.fixture
    def config(self):
        return {
            "probe": {"model": "TestProbe-5L64", "frequency": 5.0, "elements": 64, "pitch": 0.6},
            "wedge": {"name": "TestWedge", "velocity": 2330.0, "angle": 0.0, "height": 10.0},
            "specimen": {
                "material": "Steel", "thickness": 20.0,
                "velocity_l": 5900.0, "velocity_t": 3200.0, "density": 7800.0,
            },
            "gates": [
                {"id": 31, "type": "porteSynchro", "sound_path_start": 5.0,
                 "sound_path_end": 40.0, "threshold": 0.5, "detection": "pic",
                 "sync_mode": "synchronisante", "synchro_id": 0},
                {"id": 0, "type": "porte", "sound_path_start": 10.0,
                 "sound_path_end": 30.0, "threshold": 0.3, "detection": "pic",
                 "sync_mode": "synchronisee", "synchro_id": 31},
                {"id": 1, "type": "porte", "sound_path_start": 20.0,
                 "sound_path_end": 50.0, "threshold": 0.4, "detection": "pic",
                 "sync_mode": "non", "synchro_id": 0},
            ],
            "scan_axis": {"start": 0.0, "end": 784.0, "step": 1.0},
            "index_axis": {"start": 0.0, "end": 500.0, "step": 1.0},
            "sampling_period_ns": 20,
            "beam_count": 64,
        }

    def test_top_level_keys(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        for key in ("probes", "wedges", "specimens", "acquisitionUnits",
                     "motionDevices", "groups"):
            assert key in setup

    def test_probe_fields(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        probe = setup["probes"][0]
        assert probe["model"] == "TestProbe-5L64"
        assert probe["phasedArrayLinear"]["centralFrequency"] == 5e6  # 5.0 MHz * 1e6

    def test_specimen_thickness_in_meters(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        geom = setup["specimens"][0]["plateGeometry"]
        assert geom["thickness"] == pytest.approx(0.020, abs=1e-6)

    def test_material_velocities(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        mat = setup["specimens"][0]["plateGeometry"]["material"]
        assert mat["longitudinalWave"]["nominalVelocity"] == 5900.0
        assert mat["transversalVerticalWave"]["nominalVelocity"] == 3200.0

    def test_gate_mapping(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        upa = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]
        gates = upa["gates"]
        assert len(gates) == 3
        assert gates[0]["name"] == "Gate I"
        assert gates[0]["synchronization"]["mode"] == "Pulse"
        assert gates[1]["name"] == "Gate A"
        assert gates[1]["synchronization"]["mode"] == "GateRelative"
        assert gates[1]["synchronization"]["gateId"] == 0
        assert gates[2]["name"] == "Gate B"
        assert gates[2]["synchronization"]["mode"] == "Pulse"

    def test_gate_time_conversion(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        upa = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]
        gate_i = upa["gates"][0]
        expected_start = 5.0 * 1e-6  # values are in microseconds
        assert gate_i["start"] == pytest.approx(expected_start, rel=1e-6)

    def test_gate_threshold_percent(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        upa = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]
        assert upa["gates"][0]["threshold"] == pytest.approx(50.0)
        assert upa["gates"][1]["threshold"] == pytest.approx(30.0)

    def test_dimensions(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        dims = setup["groups"][0]["datasets"][0]["dimensions"]
        assert len(dims) == 3

        u = next(d for d in dims if d["axis"] == "UCoordinate")
        assert u["quantity"] == 100
        assert u["offset"] == pytest.approx(0.0)

        v = next(d for d in dims if d["axis"] == "VCoordinate")
        assert v["quantity"] == 64  # beam_count
        assert v["resolution"] == pytest.approx(0.0006, abs=1e-6)  # pitch=0.6mm

        us = next(d for d in dims if d["axis"] == "Ultrasound")
        assert us["quantity"] == 1924
        assert us["resolution"] == pytest.approx(20e-9)

    def test_beam_count(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        upa = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]
        assert len(upa["beams"]) == 64

    def test_velocity(self, config):
        setup = build_setup_json(config, n_scans=100, n_samples=1924)
        upa = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]
        assert upa["velocity"] == 5900.0


# ---------------------------------------------------------------------------
# Task 5 — build_rawcscan_for_scan
# ---------------------------------------------------------------------------

class TestBuildRawcscanForScan:
    """Validate RawCScan struct packing."""

    @pytest.fixture
    def peaks(self):
        n_scans, n_beams = 4, 8
        result = {}
        for eid in EDDIFY_GATE_ORDER:
            sp = np.full((n_scans, n_beams), 15.0, dtype=np.float32)
            amp = np.full((n_scans, n_beams), 0.8, dtype=np.float32)
            sp[:, -1] = np.inf
            amp[:, -1] = 0.0
            result[eid] = {"n_scans": n_scans, "n_beams": n_beams,
                           "sound_path": sp, "amplitude": amp}
        return result

    def test_shape(self, peaks):
        out = build_rawcscan_for_scan(peaks, 0, 8, 5900.0)
        assert out.shape == (8, 3, 24)
        assert out.dtype == np.uint8

    def test_valid_beam_values(self, peaks):
        out = build_rawcscan_for_scan(peaks, 0, 8, 5900.0)
        gate_bytes = out[0, 0, :].tobytes()
        status = struct.unpack_from("<i", gate_bytes, 0)[0]
        amp = struct.unpack_from("<i", gate_bytes, 4)[0]
        crossing = struct.unpack_from("<f", gate_bytes, 8)[0]
        assert status == 0
        assert amp == int(0.8 * 16383.5)  # 13106
        assert crossing == pytest.approx(15.0 * 1e-6, rel=1e-4)  # values are in microseconds

    def test_nodata_beam(self, peaks):
        out = build_rawcscan_for_scan(peaks, 0, 8, 5900.0)
        gate_bytes = out[7, 0, :].tobytes()
        status = struct.unpack_from("<i", gate_bytes, 0)[0]
        amp = struct.unpack_from("<i", gate_bytes, 4)[0]
        assert status == 16
        assert amp == 0

    def test_all_gates_present(self, peaks):
        out = build_rawcscan_for_scan(peaks, 1, 8, 5900.0)
        for g in range(3):
            status = struct.unpack_from("<i", out[0, g, :].tobytes(), 0)[0]
            assert status == 0

    def test_missing_gate(self):
        peaks = {31: {
            "n_scans": 2, "n_beams": 4,
            "sound_path": np.full((2, 4), 10.0, dtype=np.float32),
            "amplitude": np.full((2, 4), 0.5, dtype=np.float32),
        }}
        out = build_rawcscan_for_scan(peaks, 0, 4, 5900.0)
        assert struct.unpack_from("<i", out[0, 0, :].tobytes(), 0)[0] == 0
        assert struct.unpack_from("<i", out[0, 1, :].tobytes(), 0)[0] == 16
        assert struct.unpack_from("<i", out[0, 2, :].tobytes(), 0)[0] == 16


# ---------------------------------------------------------------------------
# Property file parsers
# ---------------------------------------------------------------------------

class TestPropertyParsers:
    def test_parse_acquisition_date(self, tmp_path):
        p = tmp_path / "acq.properties"
        p.write_text("date=2026-03-22 at 12\\:05\\:16\n")
        assert _parse_acquisition_date(str(p)) == "2026-03-22T12:05:16"

    def test_parse_platform_info(self, tmp_path):
        p = tmp_path / "plat.properties"
        p.write_text("productType=MANTIS_16x64\nsn=MANTIS-1128\n")
        info = _parse_platform_info(str(p))
        assert info["productType"] == "MANTIS_16x64"
        assert info["sn"] == "MANTIS-1128"

    def test_parse_amplitude_ref(self, tmp_path):
        p = tmp_path / "hw.properties"
        p.write_text("PASumAmplitudeRefValue=4095.0\n")
        assert _parse_amplitude_ref(str(p)) == pytest.approx(4095.0)

    def test_parse_amplitude_ref_default(self, tmp_path):
        p = tmp_path / "hw.properties"
        p.write_text("SomeOtherKey=123\n")
        assert _parse_amplitude_ref(str(p)) == pytest.approx(4095.0)

    @requires_test_data
    def test_real_acquisition_date(self):
        result = _parse_acquisition_date(str(TEST_DIR / "acquisitionInfo.properties"))
        assert result is not None and "2026" in result

    @requires_test_data
    def test_real_platform_info(self):
        info = _parse_platform_info(str(TEST_DIR / "plateformInfo.properties"))
        assert info["productType"] == "MANTIS_16x64"
        assert info["sn"] == "MANTIS-1128"


# ---------------------------------------------------------------------------
# Task 6 — convert_capture_acq (synthetic, no waveforms)
# ---------------------------------------------------------------------------

def _make_synthetic_capture(tmp_path):
    """Create a minimal .capture_acq directory with synthetic data."""
    cap = tmp_path / "test.capture_acq"
    cap.mkdir()

    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<capture>
  <transducer>
    <idNom>TestProbe-5L64</idNom>
    <sonde>
      <freqCentrale>5000000.0</freqCentrale>
      <decoupage><nbElements>64</nbElements><pitch>0.6</pitch></decoupage>
    </sonde>
    <sabot>
      <idNom>TestWedge</idNom>
      <geometrieSabot xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="typePlat">
        <vitesse>2330.0</vitesse><hauteur>10.0</hauteur>
      </geometrieSabot>
    </sabot>
  </transducer>
  <piece>
    <geometrie><epaisseur>20.0</epaisseur></geometrie>
    <materiau>
      <idNom>Steel</idNom>
      <vitesseOndeL>5900.0</vitesseOndeL>
      <vitesseOndeT>3200.0</vitesseOndeT>
      <density>7800.0</density>
    </materiau>
  </piece>
  <calibration><rafales><rafale><portes>
    <porteSynchro>
      <id>31</id><enregistrement>pic</enregistrement>
      <range><start>5.0</start><end>40.0</end></range>
      <threshold><level>0.5</level></threshold>
      <detection>pic</detection><synchronisation>synchronisante</synchronisation>
      <synchroId>0</synchroId>
    </porteSynchro>
    <porte>
      <id>0</id><enregistrement>pic</enregistrement>
      <range><start>10.0</start><end>30.0</end></range>
      <threshold><level>0.3</level></threshold>
      <detection>pic</detection><synchronisation>synchronisee</synchronisation>
      <synchroId>31</synchroId>
    </porte>
    <porte>
      <id>1</id><enregistrement>pic</enregistrement>
      <range><start>20.0</start><end>50.0</end></range>
      <threshold><level>0.4</level></threshold>
      <detection>pic</detection><synchronisation>non</synchronisation>
      <synchroId>0</synchroId>
    </porte>
  </portes></rafale></rafales></calibration>
  <trajectory>
    <firstAxis xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="typeEncoded">
      <start>0.0</start><end>100.0</end><step>1.0</step>
    </firstAxis>
    <secondAxis xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="typeIncrement">
      <start>0.0</start><end>10.0</end><step>1.0</step>
    </secondAxis>
  </trajectory>
  <samplingPeriod>20</samplingPeriod>
  <beamCharacteristics/><beamCharacteristics/><beamCharacteristics/><beamCharacteristics/>
</capture>"""
    (cap / "root.xml").write_text(xml_content, encoding="utf-8")

    # Peak files: 10 scans, 4 beams
    n_scans, n_beams = 10, 4
    for eid in EDDIFY_GATE_ORDER:
        header = struct.pack("<IIfff", n_scans, n_beams, 0.0, 0.0, 1.0)
        records = bytearray()
        for s in range(n_scans):
            for b in range(n_beams):
                if b == n_beams - 1:
                    records += struct.pack("<ff", float("inf"), 0.0)
                else:
                    sp = 15.0 + s * 0.1
                    records += struct.pack("<ff", sp, 0.7)
        (cap / f"data_peaks_0_{eid}.bin").write_bytes(header + records)

    (cap / "acquisitionInfo.properties").write_text(
        "date=2026-03-22 at 12\\:05\\:16\n", encoding="utf-8")
    (cap / "plateformInfo.properties").write_text(
        "productType=MANTIS_16x64\nsn=TEST-001\n", encoding="utf-8")
    (cap / "hardwareInfo.properties").write_text(
        "PASumAmplitudeRefValue=4095.0\n", encoding="utf-8")

    return str(cap)


class TestConvertSynthetic:
    """Conversion tests with synthetic data (no data.bin)."""

    def test_converts_to_nde(self, tmp_path):
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        result = convert_capture_acq(cap, out)
        assert os.path.isfile(result)

    def test_nde_datasets(self, tmp_path):
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        with h5py.File(out, "r") as f:
            assert "Public/Setup" in f
            assert "Properties" in f
            assert "Private/MXU/RawCScan" in f
            assert "Public/Groups/0/Datasets/1-AScanStatus" in f

    def test_setup_json_valid(self, tmp_path):
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        with h5py.File(out, "r") as f:
            raw = f["Public/Setup"][()]
            text = raw.tobytes().decode("utf-8") if hasattr(raw, "tobytes") else raw.decode("utf-8")
            setup = json.loads(text)
            gates = setup["groups"][0]["processes"][0]["ultrasonicPhasedArray"]["gates"]
            assert len(gates) == 3

    def test_rawcscan_shape_and_chunks(self, tmp_path):
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        with h5py.File(out, "r") as f:
            ds = f["Private/MXU/RawCScan"]
            assert ds.shape == (10, 4, 3)
            assert ds.chunks == (1, 4, 3)
            assert ds.dtype == np.dtype("V24")

    def test_rawcscan_chunk_readable_like_cscan_export(self, tmp_path):
        """Verify read_direct_chunk works the same way cscan_export.py does."""
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        with h5py.File(out, "r") as f:
            ds = f["Private/MXU/RawCScan"]
            _, raw_chunk = ds.id.read_direct_chunk((0, 0, 0))
            raw_arr = np.frombuffer(raw_chunk, dtype=np.uint8)
            chunk_scans = len(raw_arr) // (4 * 3 * 24)
            assert chunk_scans == 1
            chunk_arr = raw_arr.reshape(chunk_scans, 4, 3, 24)
            status = struct.unpack_from("<i", chunk_arr[0, 0, 0, :].tobytes(), 0)[0]
            assert status == 0  # valid

    def test_index_file_succeeds(self, tmp_path):
        from engine.nde_reader import index_file
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        idx = index_file(out)
        assert idx is not None
        assert idx.rawcscan_available
        assert idx.rawcscan_chunk_valid
        assert idx.n_gates_in_rawcscan == 3
        assert idx.beam_count == 4
        assert idx.velocity == pytest.approx(5900.0)
        assert idx.scan_axis.quantity == 10
        assert idx.specimen is not None
        assert idx.specimen.nominal_thickness_mm == pytest.approx(20.0)

    def test_properties_dates(self, tmp_path):
        from engine.nde_reader import index_file
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        idx = index_file(out)
        assert idx.creation_date is not None
        assert "2026" in idx.creation_date

    def test_extract_cscan(self, tmp_path):
        from engine.cscan_export import extract_cscan
        from engine.models import GateControlParams
        from engine.nde_reader import index_file
        cap = _make_synthetic_capture(tmp_path)
        out = str(tmp_path / "output.nde")
        convert_capture_acq(cap, out)
        idx = index_file(out)
        assert idx is not None
        params = GateControlParams(gate_mode="A-I")
        result = extract_cscan(idx, params)
        assert result.valid_count > 0
        assert result.data.shape[0] == 10


# ---------------------------------------------------------------------------
# Task 6 — convert_capture_acq (real data, peaks only)
# ---------------------------------------------------------------------------

@requires_test_data
class TestConvertRealData:
    """End-to-end with real Eddify data (skips waveforms for speed)."""

    def test_convert_peaks_only(self, tmp_path):
        """Peaks-only mode (no data.bin) uses single-strip fallback."""
        cap = tmp_path / "test.capture_acq"
        cap.mkdir()
        src = TEST_DIR
        for item in src.iterdir():
            if item.name == "data.bin":
                continue
            if item.is_file():
                shutil.copy2(str(item), str(cap / item.name))

        out = str(tmp_path / "output.nde")
        convert_capture_acq(str(cap), out)

        from engine.nde_reader import index_file
        idx = index_file(out)
        assert idx is not None
        assert idx.rawcscan_available
        assert idx.rawcscan_chunk_valid
        assert idx.n_gates_in_rawcscan == 3
        assert idx.velocity > 0
        # Fallback mode: n_scans=7802, n_index=55 (single strip)
        assert idx.scan_axis.quantity == 7802
        assert idx.index_axis.quantity == 55

    def test_real_cscan_extraction(self, tmp_path):
        cap = tmp_path / "test.capture_acq"
        cap.mkdir()
        src = TEST_DIR
        for item in src.iterdir():
            if item.name == "data.bin":
                continue
            if item.is_file():
                shutil.copy2(str(item), str(cap / item.name))

        out = str(tmp_path / "output.nde")
        convert_capture_acq(str(cap), out)

        from engine.cscan_export import extract_cscan
        from engine.models import GateControlParams
        from engine.nde_reader import index_file
        idx = index_file(out)
        assert idx is not None
        params = GateControlParams(gate_mode="A-I")
        result = extract_cscan(idx, params)
        assert result.valid_count > 0
        assert result.stats["max"] > 0
        assert result.stats["max"] > result.stats["min"]

    def test_convert_full_raster(self, tmp_path):
        """Full conversion with data.bin produces merged raster grid dimensions."""
        out = str(tmp_path / "raster_output.nde")
        convert_capture_acq(str(TEST_DIR), out)

        from engine.nde_reader import index_file
        idx = index_file(out)
        assert idx is not None
        assert idx.rawcscan_available
        assert idx.rawcscan_chunk_valid
        assert idx.n_gates_in_rawcscan == 3

        # Raster dimensions: 775 scan bins × 501 index positions (clipped to config range)
        assert idx.scan_axis.quantity == 775
        assert idx.index_axis.quantity == 501

        # Scan axis range: 0 to ~784mm
        scan_range = idx.scan_axis.range_mm
        assert scan_range[0] == pytest.approx(0.0, abs=1.0)
        assert 780 <= scan_range[1] <= 790

        # Index axis range: 1000 to 1500mm (clipped to configured range)
        idx_range = idx.index_axis.range_mm
        assert idx_range[0] == pytest.approx(1000.0, abs=1.0)
        assert idx_range[1] == pytest.approx(1500.0, abs=1.0)
