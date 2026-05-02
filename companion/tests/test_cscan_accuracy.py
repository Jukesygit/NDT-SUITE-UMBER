"""
Validation test: compare companion app C-scan extraction against OmniPC CSV export.

Uses the actual NDE file and OmniPC reference CSV to verify:
1. Zero spurious points (companion has value where OmniPC shows ND)
2. Zero gap points (OmniPC has value where companion shows NaN)
3. Matching values within acceptable tolerance
"""

import os
import sys

import numpy as np
import pytest

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Skip if test files not available
NDE_PATH = r"C:\Users\jonas\Downloads\OneDrive_1_08-04-2026\NEV H_0310-2 500-1000_2025_10_03 08h56m03s.nde"
CSV_PATH = r"C:\Users\jonas\Downloads\NEV H_0310-2 500-1000_2025_10_03 08h56m03s_2026_04_09 11h00m41s.txt"

skip_if_no_files = pytest.mark.skipif(
    not (os.path.exists(NDE_PATH) and os.path.exists(CSV_PATH)),
    reason="Test NDE/CSV files not available"
)


def parse_omnipc_csv(path: str):
    """Parse OmniPC CSV, return (grid, has_data).

    grid[scan_idx, nde_index_idx] = thickness float or NaN.
    has_data[scan_idx, nde_index_idx] = True if not '---' (within scan coverage).
    """
    with open(path, "r") as f:
        lines = [l.strip("\r\n") for l in f.readlines()]

    header_idx = next(i for i, l in enumerate(lines) if l.startswith("mm\t"))
    scan_cols = [float(x) for x in lines[header_idx].split("\t")[1:]]
    n_scans = len(scan_cols)

    omni = np.full((n_scans, 502), np.nan)
    has_data = np.zeros((n_scans, 502), dtype=bool)

    for line in lines[header_idx + 1:]:
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
def test_zero_spurious_with_defaults():
    """Companion should have no values where OmniPC shows ND.

    OmniPC rejects measurement gate saturated (status=1) and dependent gate
    failed (status=4). Our extraction must reject the same points.
    """
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    assert fi is not None

    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)
    companion = result.data

    omni_nd = np.isnan(omni) & has_data
    comp_valid = ~np.isnan(companion) & has_data
    spurious = omni_nd & comp_valid

    assert np.sum(spurious) == 0, (
        f"Found {np.sum(spurious)} spurious points where companion has value but OmniPC = ND"
    )


@skip_if_no_files
def test_zero_gap_with_defaults():
    """Companion should have a value everywhere OmniPC does.

    No points where OmniPC has a thickness reading but companion shows NaN.
    """
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)
    companion = result.data

    omni_valid = ~np.isnan(omni) & has_data
    comp_nd = np.isnan(companion) & has_data
    gap = omni_valid & comp_nd

    assert np.sum(gap) == 0, (
        f"Found {np.sum(gap)} gap points where OmniPC has value but companion = NaN"
    )


@skip_if_no_files
def test_exact_coverage_match():
    """Companion coverage should exactly match OmniPC within the data region."""
    from engine.models import GateControlParams
    from engine.nde_reader import index_file
    from engine.cscan_export import extract_cscan

    fi = index_file(NDE_PATH)
    params = GateControlParams.from_file_defaults(fi)
    result = extract_cscan(fi, params)

    omni, has_data = parse_omnipc_csv(CSV_PATH)
    companion = result.data

    omni_valid_count = np.sum(~np.isnan(omni) & has_data)
    comp_valid_count = np.sum(~np.isnan(companion) & has_data)

    assert comp_valid_count == omni_valid_count, (
        f"Coverage mismatch: companion={comp_valid_count}, OmniPC={omni_valid_count}"
    )


@skip_if_no_files
def test_matching_values_within_tolerance():
    """Where both have values, they should match within 2mm.

    Peak fallback on Gate I introduces ~0.4mm systematic offset for status=2
    points (crossing failed, using peak_time instead). This is expected.
    """
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

    assert np.all(diffs < 2.0), f"Max diff = {np.max(diffs):.2f}mm, expected < 2.0mm"
    assert np.mean(diffs) < 0.5, f"Mean diff = {np.mean(diffs):.4f}mm, expected < 0.5mm"

    pct_within_1mm = np.sum(diffs < 1.0) / len(diffs) * 100
    assert pct_within_1mm > 95, f"Only {pct_within_1mm:.1f}% within 1mm, expected > 95%"
