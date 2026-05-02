"""
Latency benchmarks for companion app endpoints.

Measures actual render times for:
  1. B-scan render (Pillow) — end-to-end
  2. A-scan render (Pillow) — end-to-end
  3. Composite generation — for varying file counts
  4. Binary transfer size — for the composite

Run:  python tests/benchmark_latency.py <nde_folder_path>
"""

import os
import sys
import time

import numpy as np

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.composite import create_composite
from engine.models import GateControlParams
from engine.nde_reader import index_file, index_folder
from engine.pillow_renderer import render_ascan_pillow, render_bscan_pillow


def fmt_ms(ms: float) -> str:
    if ms < 1:
        return f"{ms * 1000:.0f}us"
    return f"{ms:.1f}ms"


def benchmark_indexing(folder_path: str):
    """Benchmark file indexing speed."""
    nde_files = sorted(
        os.path.join(folder_path, f)
        for f in os.listdir(folder_path)
        if f.lower().endswith(".nde")
    )
    print(f"\n{'='*60}")
    print(f"INDEXING BENCHMARK — {len(nde_files)} files")
    print(f"{'='*60}")

    times = []
    indexed = []
    for path in nde_files:
        t0 = time.perf_counter()
        fi = index_file(path)
        elapsed = (time.perf_counter() - t0) * 1000
        times.append(elapsed)
        if fi:
            indexed.append(fi)
        name = os.path.basename(path)
        status = "OK" if fi else "FAIL"
        print(f"  {name[:50]:<50} {elapsed:>8.1f}ms  {status}")

    print(f"\n  Total: {sum(times):.0f}ms | Mean: {np.mean(times):.1f}ms | "
          f"Files indexed: {len(indexed)}/{len(nde_files)}")
    return indexed


def benchmark_bscan(indexed_files: list):
    """Benchmark B-scan Pillow rendering."""
    print(f"\n{'='*60}")
    print("B-SCAN RENDER BENCHMARK (Pillow)")
    print(f"{'='*60}")

    results = {"axial": [], "index": []}

    for fi in indexed_files[:3]:  # Test first 3 files
        sr = fi.scan_axis.range_mm
        ir = fi.index_axis.range_mm
        scan_mid = (sr[0] + sr[1]) / 2
        index_mid = (ir[0] + ir[1]) / 2

        for axis in ("axial", "index"):
            times = []
            for _ in range(5):  # 5 renders each
                try:
                    _, render_ms = render_bscan_pillow(fi, axis, scan_mid, index_mid, 600, 300)
                    times.append(render_ms)
                except Exception as e:
                    print(f"  ERROR ({fi.filename}, {axis}): {e}")
                    break

            if times:
                results[axis].extend(times)
                print(f"  {fi.filename[:40]:<40} {axis:<6} "
                      f"mean={np.mean(times):>6.1f}ms  "
                      f"min={np.min(times):>6.1f}ms  "
                      f"max={np.max(times):>6.1f}ms")

    for axis in ("axial", "index"):
        if results[axis]:
            all_t = results[axis]
            print(f"\n  {axis} overall: mean={np.mean(all_t):.1f}ms  "
                  f"p50={np.median(all_t):.1f}ms  p95={np.percentile(all_t, 95):.1f}ms")


def benchmark_ascan(indexed_files: list):
    """Benchmark A-scan Pillow rendering."""
    print(f"\n{'='*60}")
    print("A-SCAN RENDER BENCHMARK (Pillow)")
    print(f"{'='*60}")

    times = []
    for fi in indexed_files[:3]:
        sr = fi.scan_axis.range_mm
        ir = fi.index_axis.range_mm
        scan_mid = (sr[0] + sr[1]) / 2
        index_mid = (ir[0] + ir[1]) / 2

        for _ in range(5):
            try:
                _, render_ms = render_ascan_pillow(fi, scan_mid, index_mid, 400, 200)
                times.append(render_ms)
            except Exception as e:
                print(f"  ERROR ({fi.filename}): {e}")
                break

        if times:
            print(f"  {fi.filename[:40]:<40} "
                  f"mean={np.mean(times[-5:]):>6.1f}ms  "
                  f"min={np.min(times[-5:]):>6.1f}ms")

    if times:
        print(f"\n  A-scan overall: mean={np.mean(times):.1f}ms  "
              f"p50={np.median(times):.1f}ms  p95={np.percentile(times, 95):.1f}ms")


def benchmark_composite(folder_path: str, indexed_files: list):
    """Benchmark composite generation with varying file counts."""
    print(f"\n{'='*60}")
    print("COMPOSITE GENERATION BENCHMARK")
    print(f"{'='*60}")

    # The composite engine expects folder names relative to a base directory.
    # Since all files are in one folder, we use the parent as base and folder name.
    base_dir = os.path.dirname(folder_path)
    folder_name = os.path.basename(folder_path)

    gate_params = GateControlParams()

    # Test with all files (single folder)
    t0 = time.perf_counter()
    result = create_composite(base_dir, [folder_name], gate_params)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    total_points = result.width * result.height
    valid_points = result.stats.get("validCount", 0)

    print(f"  Files:        {len(result.source_files)}")
    print(f"  Grid size:    {result.width} x {result.height} = {total_points:,} points")
    print(f"  Valid points: {valid_points:,} ({result.stats.get('coveragePct', 0):.1f}%)")
    print(f"  Generation:   {elapsed_ms:.0f}ms")
    print(f"  Warnings:     {len(result.warnings)}")
    if result.warnings:
        for w in result.warnings:
            print(f"    - {w['filename']}: {w['reason']}")

    # Measure binary encoding + gzip
    import gzip
    raw_matrix = result.matrix.astype("<f4").tobytes()
    raw_x = result.x_axis.astype("<f4").tobytes()
    raw_y = result.y_axis.astype("<f4").tobytes()
    raw_total = len(raw_matrix) + len(raw_x) + len(raw_y)

    t0 = time.perf_counter()
    compressed = gzip.compress(raw_matrix + raw_x + raw_y, compresslevel=6)
    gzip_ms = (time.perf_counter() - t0) * 1000

    print(f"\n  Binary transfer:")
    print(f"    Raw size:        {raw_total / 1024 / 1024:.2f} MB")
    print(f"    Gzip size:       {len(compressed) / 1024 / 1024:.2f} MB")
    print(f"    Compression:     {raw_total / max(len(compressed), 1):.1f}x")
    print(f"    Gzip time:       {gzip_ms:.1f}ms")
    print(f"    Total (gen+gz):  {elapsed_ms + gzip_ms:.0f}ms")

    # Stats
    print(f"\n  Thickness stats:")
    for k in ("min", "max", "mean", "std"):
        v = result.stats.get(k, 0)
        print(f"    {k:>5}: {v:.3f} mm")


def main():
    if len(sys.argv) < 2:
        print("Usage: python tests/benchmark_latency.py <nde_folder_path>")
        sys.exit(1)

    folder_path = sys.argv[1]
    if not os.path.isdir(folder_path):
        print(f"ERROR: Not a directory: {folder_path}")
        sys.exit(1)

    print(f"NDT Companion — Latency Benchmark")
    print(f"Folder: {folder_path}")

    indexed = benchmark_indexing(folder_path)
    if not indexed:
        print("No files could be indexed. Exiting.")
        sys.exit(1)

    benchmark_bscan(indexed)
    benchmark_ascan(indexed)
    benchmark_composite(folder_path, indexed)

    print(f"\n{'='*60}")
    print("DONE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
