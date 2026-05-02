# Gate Filtering Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the companion app's C-scan export match OmniPC output by auto-reading thickness limits from NDE files and fixing gate metadata parsing.

**Architecture:** The NDE file's `Public/Setup` JSON contains a `thickness` process with `min`/`max` fields (in meters) that OmniPC uses to reject implausible readings. We add a `ThicknessProcessInfo` dataclass to `FileIndex`, parse it in `nde_reader.py`, and use it as the default for `GateControlParams.thickness_min/max`. We also fix the gate `synchronization` JSON parsing bug and update the batch window + API to auto-populate thickness limits.

**Tech Stack:** Python 3.13, h5py, numpy, pytest

**Companion app location:** `C:\Users\jonas\OneDrive\Desktop\ndt-companion\`

**Test NDE file:** `C:\Users\jonas\Downloads\OneDrive_1_08-04-2026\NEV H_0310-2 500-1000_2025_10_03 08h56m03s.nde`

**OmniPC reference CSV:** `C:\Users\jonas\Downloads\NEV H_0310-2 500-1000_2025_10_03 08h56m03s_2026_04_09 11h00m41s.txt`

---

## Background

Point-by-point comparison against the OmniPC CSV export revealed:

| Metric | Value |
|--------|-------|
| Spurious points (companion has value, OmniPC = ND) | 15,948 |
| Spurious thickness range | 25.4 – 28.0 mm |
| All spurious points Gate A status | 1 (saturated, amp=32767) |
| OmniPC thickness filter (from NDE file) | 10.0 – 22.0 mm |
| Spurious remaining after 10-22mm filter | **0** |
| Mean diff where both have values | 0.39 mm (peak fallback artifact) |

The NDE file's Setup JSON contains:
```json
{
  "thickness": {
    "min": 0.01,    // 10 mm
    "max": 0.022,   // 22 mm
    "gates": [
      {"id": 1, "gateDetection": "Crossing"},
      {"id": 0, "gateDetection": "Crossing"}
    ]
  }
}
```

The companion app currently defaults to `thickness_min=None, thickness_max=None`, which keeps all readings regardless of plausibility.

Additionally, `nde_reader.py` parses gate sync fields incorrectly — it looks for `syncMode`/`syncGateId` but the actual JSON structure uses `synchronization.mode`/`synchronization.gateId`.

---

## Task 1: Add ThicknessProcessInfo to models

**Files:**
- Modify: `engine/models.py`

**Step 1: Add the dataclass**

Add after the `GateInfo` dataclass (after line 28):

```python
@dataclass
class ThicknessProcessInfo:
    """Thickness measurement config from the NDE file's thickness process."""
    min_mm: Optional[float]   # Minimum valid thickness (mm), None if not set
    max_mm: Optional[float]   # Maximum valid thickness (mm), None if not set
    gate_ids: list[int]       # Gate IDs used [measurement, reference]
    gate_detection: str       # "Crossing" or "FirstPeak"
```

**Step 2: Add the field to FileIndex**

Add to the `FileIndex` dataclass (after `rawcscan_chunk_valid`, line 47):

```python
    thickness_process: Optional[ThicknessProcessInfo] = None
```

This requires importing `field` from dataclasses if not already imported (it is), and the `Optional` from typing (already imported).

**Step 3: Commit**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
git add engine/models.py
git commit -m "feat: add ThicknessProcessInfo dataclass to models"
```

---

## Task 2: Parse thickness process in nde_reader.py

**Files:**
- Modify: `engine/nde_reader.py`

**Step 1: Add thickness process parsing**

In `index_file()`, after the gate parsing loop (after line 76), add:

```python
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
```

**Step 2: Add import**

Add `ThicknessProcessInfo` to the import from models (line 17):

```python
from .models import AxisInfo, FileIndex, GateInfo, ThicknessProcessInfo
```

**Step 3: Pass to FileIndex constructor**

In the `return FileIndex(...)` call (around line 108), add:

```python
            thickness_process=thickness_process,
```

after `rawcscan_chunk_valid=rawcscan_chunk_valid,`.

**Step 4: Fix gate synchronization parsing**

The current gate parsing (lines 65-76) looks for `syncMode` and `syncGateId`, but the actual NDE JSON uses `synchronization.mode` and `synchronization.gateId`. Fix:

Replace lines 65-76:

```python
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
```

Note: `detection` should come from `synchronization.triggeringEvent`, not a top-level `detection` field. The NDE JSON stores "Crossing" as the triggeringEvent. Gate I (synchro=Pulse) won't have this, so default "Crossing" is correct.

**Step 5: Verify**

Run standalone:

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
python -c "
from engine.nde_reader import index_file
fi = index_file(r'C:\Users\jonas\Downloads\OneDrive_1_08-04-2026\NEV H_0310-2 500-1000_2025_10_03 08h56m03s.nde')
print(f'Thickness process: min={fi.thickness_process.min_mm}mm, max={fi.thickness_process.max_mm}mm')
print(f'Gate IDs: {fi.thickness_process.gate_ids}, detection: {fi.thickness_process.gate_detection}')
for g in fi.gates:
    print(f'Gate {g.id} ({g.name}): sync={g.sync_mode}, syncGate={g.sync_gate_id}, detection={g.detection}')
"
```

Expected output:
```
Thickness process: min=10.0mm, max=22.0mm
Gate IDs: [1, 0], detection: Crossing
Gate 0 (Gate I): sync=Pulse, syncGate=None, detection=Crossing
Gate 1 (Gate A): sync=GateRelative, syncGate=0, detection=Crossing
Gate 2 (Gate B): sync=GateRelative, syncGate=1, detection=Crossing
```

**Step 6: Commit**

```bash
git add engine/nde_reader.py
git commit -m "feat: parse thickness process limits and fix gate sync parsing"
```

---

## Task 3: Use file defaults in GateControlParams

**Files:**
- Modify: `engine/models.py`

**Step 1: Add a factory method to GateControlParams**

Add after the `pct_to_raw` static method (after line 62):

```python
    @staticmethod
    def from_file_defaults(file_index) -> "GateControlParams":
        """Create GateControlParams using the NDE file's thickness process limits.
        
        Uses crossing_only for ref recovery (matching OmniPC default behavior),
        and populates thickness_min/max from the file's thickness process.
        """
        params = GateControlParams()
        tp = getattr(file_index, "thickness_process", None)
        if tp is not None:
            params.thickness_min = tp.min_mm
            params.thickness_max = tp.max_mm
        return params
```

**Step 2: Commit**

```bash
git add engine/models.py
git commit -m "feat: add from_file_defaults factory for GateControlParams"
```

---

## Task 4: Update batch window to auto-populate thickness limits

**Files:**
- Modify: `ui/batch_window.py`

**Step 1: Auto-populate thickness fields when folder is scanned**

In `_scan_folder()` (around line 168), after `self._populate_file_list()` (line 177), add logic to read the first file's thickness process and populate the UI fields if they're empty:

```python
        # Auto-populate thickness limits from first file's thickness process
        if self.file_indices and not self.thick_min_var.get().strip() and not self.thick_max_var.get().strip():
            for fi in self.file_indices:
                if fi.thickness_process:
                    if fi.thickness_process.min_mm is not None:
                        self.thick_min_var.set(str(fi.thickness_process.min_mm))
                    if fi.thickness_process.max_mm is not None:
                        self.thick_max_var.set(str(fi.thickness_process.max_mm))
                    break
```

Add this between `self._populate_file_list()` (line 177) and the output folder default logic (line 180).

**Step 2: Verify**

Launch the batch window, select the Downloads folder containing NDE files. The thickness min/max fields should auto-populate to 10.0 and 22.0.

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
python -c "
from ui.batch_window import launch_batch_window
launch_batch_window(initial_folder=r'C:\Users\jonas\Downloads\OneDrive_1_08-04-2026')
"
```

Expected: Thickness min field shows "10.0", max shows "22.0".

**Step 3: Commit**

```bash
git add ui/batch_window.py
git commit -m "feat: auto-populate thickness limits from NDE file metadata"
```

---

## Task 5: Update API to include thickness process in file info

**Files:**
- Modify: `api/routes.py`

**Step 1: Add thickness process to file serialization**

In `_serialize_file()` (line 226), add after `"validPointCount"`:

```python
        "thicknessProcess": {
            "minMm": fi.thickness_process.min_mm,
            "maxMm": fi.thickness_process.max_mm,
            "gateIds": fi.thickness_process.gate_ids,
            "gateDetection": fi.thickness_process.gate_detection,
        } if fi.thickness_process else None,
```

**Step 2: Update cscan-export defaults**

In `cscan_export()` route (line 121), when `thicknessMin`/`thicknessMax` are None in the request, fall back to the file's thickness process limits. Replace lines 127-135:

```python
        # Fall back to file's thickness process limits if not specified in request
        t_min = req.thicknessMin
        t_max = req.thicknessMax
        if t_min is None and fi.thickness_process:
            t_min = fi.thickness_process.min_mm
        if t_max is None and fi.thickness_process:
            t_max = fi.thickness_process.max_mm

        params = GateControlParams(
            gate_mode=req.gateMode,
            ref_recovery=req.refRecovery,
            meas_recovery=req.measRecovery,
            min_amplitude_ref=GateControlParams.pct_to_raw(req.minAmplitudeRef),
            min_amplitude_meas=GateControlParams.pct_to_raw(req.minAmplitudeMeas),
            thickness_min=t_min,
            thickness_max=t_max,
        )
```

**Step 3: Commit**

```bash
git add api/routes.py
git commit -m "feat: expose thickness process in API and use file defaults for export"
```

---

## Task 6: Validation test — compare against OmniPC CSV

**Files:**
- Create: `tests/test_cscan_accuracy.py`

**Step 1: Create tests directory**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
mkdir -p tests
```

**Step 2: Write the validation test**

```python
"""
Validation test: compare companion app C-scan extraction against OmniPC CSV export.

Uses the actual NDE file and OmniPC reference CSV to verify:
1. Zero spurious points after applying file thickness limits
2. Matching values within acceptable tolerance
"""

import os

import numpy as np
import pytest

# Skip if test files not available
NDE_PATH = r"C:\Users\jonas\Downloads\OneDrive_1_08-04-2026\NEV H_0310-2 500-1000_2025_10_03 08h56m03s.nde"
CSV_PATH = r"C:\Users\jonas\Downloads\NEV H_0310-2 500-1000_2025_10_03 08h56m03s_2026_04_09 11h00m41s.txt"

skip_if_no_files = pytest.mark.skipif(
    not (os.path.exists(NDE_PATH) and os.path.exists(CSV_PATH)),
    reason="Test NDE/CSV files not available"
)


def parse_omnipc_csv(path: str) -> tuple[np.ndarray, int, int]:
    """Parse OmniPC CSV, return (grid, n_scans, n_index).

    Grid values: float for valid, NaN for ND, None-masked for '---'.
    Returns grid[scan_idx, nde_index_idx] where nde_index_idx is the CSV row label.
    """
    with open(path, "r") as f:
        lines = [l.strip("\r\n") for l in f.readlines()]

    header_idx = next(i for i, l in enumerate(lines) if l.startswith("mm\t"))
    scan_cols = [float(x) for x in lines[header_idx].split("\t")[1:]]
    n_scans = len(scan_cols)

    # Determine n_index from data rows
    data_lines = lines[header_idx + 1:]
    n_index = len(data_lines)

    # Build grid: omni[scan_idx, nde_array_index]
    omni = np.full((n_scans, 502), np.nan)
    has_data = np.zeros((n_scans, 502), dtype=bool)  # False for '---'

    for line in data_lines:
        parts = line.split("\t")
        try:
            nde_idx = int(float(parts[0]))
        except (ValueError, IndexError):
            continue
        if nde_idx < 0 or nde_idx >= 502:
            continue
        for j, val_str in enumerate(parts[1:]):
            if j >= n_scans:
                break
            if val_str == "---":
                continue
            has_data[j, nde_idx] = True
            if val_str != "ND":
                try:
                    omni[j, nde_idx] = float(val_str)
                except ValueError:
                    pass

    return omni, has_data


@skip_if_no_files
def test_zero_spurious_with_file_defaults():
    """After applying the NDE file's thickness limits, there should be zero
    spurious points (where companion has a value but OmniPC shows ND)."""
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    assert fi is not None
    assert fi.thickness_process is not None
    assert fi.thickness_process.min_mm == 10.0
    assert fi.thickness_process.max_mm == 22.0

    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)
    companion = result.data  # (1001, 502)

    # Within OmniPC's data region, count spurious points
    omni_nd = np.isnan(omni) & has_data
    comp_valid = ~np.isnan(companion) & has_data
    spurious = omni_nd & comp_valid

    assert np.sum(spurious) == 0, (
        f"Found {np.sum(spurious)} spurious points where companion has value but OmniPC = ND"
    )


@skip_if_no_files
def test_matching_values_within_tolerance():
    """Where both companion and OmniPC have values, they should match
    within 2mm (accounting for peak fallback offset)."""
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)
    companion = result.data

    both_valid = ~np.isnan(omni) & ~np.isnan(companion) & has_data
    diffs = np.abs(companion[both_valid] - omni[both_valid])

    # All diffs should be under 2mm
    assert np.all(diffs < 2.0), f"Max diff = {np.max(diffs):.2f}mm, expected < 2.0mm"

    # Mean diff should be under 0.5mm (peak fallback introduces ~0.4mm)
    assert np.mean(diffs) < 0.5, f"Mean diff = {np.mean(diffs):.4f}mm, expected < 0.5mm"

    # At least 95% should match within 1mm
    pct_within_1mm = np.sum(diffs < 1.0) / len(diffs) * 100
    assert pct_within_1mm > 95, f"Only {pct_within_1mm:.1f}% within 1mm, expected > 95%"


@skip_if_no_files
def test_coverage_matches_omnipc():
    """Companion coverage should be within 5% of OmniPC coverage."""
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)

    omni_valid = np.sum(~np.isnan(omni) & has_data)
    comp_valid = result.valid_count
    region_size = np.sum(has_data)

    omni_pct = omni_valid / region_size * 100
    comp_pct = comp_valid / region_size * 100

    # Coverage should be within 5 percentage points
    assert abs(comp_pct - omni_pct) < 5.0, (
        f"Coverage mismatch: companion={comp_pct:.1f}%, OmniPC={omni_pct:.1f}%"
    )
```

**Step 3: Install pytest if needed and run**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
pip install pytest
python -m pytest tests/test_cscan_accuracy.py -v
```

Expected: All 3 tests PASS.

**Step 4: Commit**

```bash
git add tests/test_cscan_accuracy.py
git commit -m "test: add OmniPC CSV comparison validation tests"
```

---

## Task 7: Update config defaults to use crossing_only

**Files:**
- Modify: `config.py`

**Step 1: Change default ref recovery to crossing_only**

The data shows OmniPC uses crossing detection (not peak fallback) by default. The current config default `refRecovery: "peak_fallback"` introduces 0.39mm systematic offset. Change to match OmniPC:

In `DEFAULTS` dict (line 24), change:

```python
        "refRecovery": "crossing_only",
```

This means the default behavior matches OmniPC. Users who want higher coverage can opt into peak_fallback via the UI.

**Step 2: Update GateControlParams default**

In `engine/models.py`, line 52, change:

```python
    ref_recovery: str = "crossing_only"     # "crossing_only" or "peak_fallback"
```

**Step 3: Commit**

```bash
git add config.py engine/models.py
git commit -m "fix: default to crossing_only to match OmniPC behavior"
```

---

## Summary of Changes

| File | Change | Why |
|------|--------|-----|
| `engine/models.py` | Add `ThicknessProcessInfo`, add `thickness_process` to `FileIndex`, add `from_file_defaults()`, change default to `crossing_only` | Data model for thickness limits |
| `engine/nde_reader.py` | Parse thickness process from Setup JSON, fix gate `synchronization` parsing | Read limits from NDE file |
| `ui/batch_window.py` | Auto-populate thickness min/max fields from first file | UI shows correct defaults |
| `api/routes.py` | Include thickness process in API responses, use file defaults when not specified | API exports use correct filters |
| `config.py` | Change default ref recovery to `crossing_only` | Match OmniPC default behavior |
| `tests/test_cscan_accuracy.py` | Point-by-point validation against OmniPC CSV | Prove the fix works |

**Expected outcome after all tasks:** Companion app exports produce 0 spurious points when using the NDE file's built-in thickness limits, matching OmniPC output.
