# Legacy NDE 3.0.1 Format Support

**Date:** 2026-07-12
**Status:** Approved (user requested; CSV export prioritized)
**Problem:** Files written by MXU 5.12.1.11 (beta, format version 3.0.1 — e.g. Ninian Dec 2023 job data) fail to index. The engine is hardcoded to the NDE 4.x layout; `f["Public/Setup"]` raises `KeyError` and every file is skipped.

## Format differences (verified empirically against AB1.nde)

| Item | Format 3.0.1 (legacy) | Format 4.x (current) |
|---|---|---|
| Root attrs | `Format version`, `Application version`, `Date created` | empty |
| Setup JSON | `Domain/Setup` | `Public/Setup` |
| Amplitude | `Domain/DataGroups/0/Datasets/0/Amplitude` (3D int16, same axes order) | `Public/Groups/0/Datasets/0-AScanAmplitude` |
| Status | `Domain/DataGroups/0/Datasets/0/Status` (uint8, bit0 = valid, same) | `Public/Groups/0/Datasets/1-AScanStatus` |
| RawCScan | `Applications/MXU/RawCScan` — **2D flattened** `(n_scans, n_index*n_gates)`, interleaved index-major/gate-minor, **contiguous** (no chunks) | `Private/MXU/RawCScan` — 3D `(n_scans, n_index, n_gates)`, chunked `(1, n_index, n_gates)` |
| Properties | absent — creation date in root attr `Date created` | `/Properties` JSON |
| JSON: group children | `groups[].dataset` (singular) + `groups[].paut` | `groups[].datasets[]` + `groups[].processes[]` |
| JSON: axes | `groups[].dataset.ascan.amplitude.dimensions` (self-describing `path`) | `groups[].datasets[].dimensions` |
| JSON: PAUT | `groups[].paut` — same inner schema as `ultrasonicPhasedArray` | `processes[].ultrasonicPhasedArray` |
| JSON: thickness | `groups[].paut.softwareProcess.thickness`; gates use `timeSelection` | `processes[].thickness`; gates use `gateDetection` |
| 24-byte gate struct | identical (status/amp/crossing/peak/gate start/end) | identical |
| probes/wedges/specimens/acquisitionUnits/motionDevices | identical | identical |

**h5py caveat:** legacy RawCScan is opaque V24 *contiguous*; `read_direct_chunk` (used by the 4.x fast path) requires chunked datasets, and high-level slicing fails with a type-conversion error. The working raw access is `ds.id.read(h5s.ALL, h5s.ALL, arr, mtype=ds.id.get_type())` (memory type = file type, no conversion). Contiguous datasets are fully allocated, so the "skip unallocated chunk" concern of the 4.x path does not apply.

## Design

New module `engine/nde_format.py` — single place that knows both layouts. Content-based detection (existence checks / JSON shape), not version sniffing:

- `resolve_setup_path(f)`, `resolve_amplitude_path(f)`, `resolve_status_path(f)`, `resolve_rawcscan_path(f)` — try 4.x path, fall back to 3.0.1 path, raise `KeyError` with both candidates if neither exists (amplitude/status/rawcscan resolvers may return `None` where callers treat absence as optional).
- `load_setup(f)` — read JSON from resolved path and **normalize legacy schema to the 4.x shape**, so all downstream parsing stays unchanged:
  - `groups[].dataset.ascan.amplitude` → `groups[].datasets[0]` (`path`, `dimensions`, `dataClass: "AScanAmplitude"`)
  - `groups[].paut` → `processes[].ultrasonicPhasedArray`
  - `groups[].paut.softwareProcess.thickness` → `processes[].thickness`, mapping gate `timeSelection` → `gateDetection`
- `read_file_dates(f)` — `/Properties` JSON if present, else root attr `Date created`.
- `read_opaque_2d(ds)` — low-level opaque read for legacy RawCScan, returns raw bytes array.

Consumers switch hardcoded paths to resolvers:

1. `nde_reader.py` — `load_setup`, `read_file_dates`, resolved status/rawcscan paths; 2D RawCScan: `n_gates = shape[1] // n_index`; `rawcscan_chunk_valid = True` for contiguous 2D (whole-read path needs no chunk layout).
2. `cscan_export.py` (**priority — CSV export**) — resolved path + 2D branch: whole-dataset opaque read, reshape `(n_scans, n_index, n_gates, 24)`, reuse the existing per-scan vectorized gate logic (extracted into a shared helper).
3. `envelope.py`, `pillow_renderer.py` (2 call sites), `region_extract.py`, `waveform_thickness.py` — amplitude/status resolvers.
4. `calibration.py` — `load_setup`.
5. `api/routes.py:691` — amplitude resolver.

`eddify_converter.py` keeps writing 4.x (unchanged).

## Testing

`tests/test_legacy_nde.py`:
- Synthetic minimal 3.0.1 fixture builder (tiny dims, known gate structs → exact expected thickness grid) — always runs.
- Schema normalization unit tests (legacy → 4.x shape; 4.x passthrough).
- `index_file` + `extract_cscan` + `cscan_to_csv` against the synthetic legacy file.
- Real-file integration test against Ninian AB1.nde, `skipif` the D: path is absent (same pattern as `test_cscan_accuracy.py`).
- Regression: existing `test_eddify_converter.py` + `test_cscan_accuracy.py` cover the 4.x path.
