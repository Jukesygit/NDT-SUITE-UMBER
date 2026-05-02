"""
Image renderer for B-scan and A-scan visualization.

Renders scan data as PNG images using matplotlib, returned as bytes.
All rendering is server-side; the webapp receives only PNG images.
"""

import io
import logging
from typing import Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from .models import GateInfo, RegionData

logger = logging.getLogger(__name__)

# Gate overlay colors
GATE_COLORS = ["#ff4444", "#44aa44", "#4444ff", "#ff8800", "#8800ff"]


def render_bscan(
    region: RegionData,
    axis: str,
    position_mm: float,
    gate_overlays: Optional[list[GateInfo]] = None,
) -> bytes:
    """Render a B-scan cross-section as a PNG image.

    Args:
        region: Extracted region data with waveforms.
        axis: "axial" (slice along index axis) or "index" (slice along scan axis).
        position_mm: Position in mm along the perpendicular axis for the slice.
        gate_overlays: Optional gate info for overlay annotations.

    Returns:
        PNG image bytes.
    """
    if axis == "axial":
        # Slice at a fixed index position, showing scan positions on X
        idx = _nearest_index(region.index_axis_mm, position_mm)
        slice_data = region.waveforms[:, idx, :]
        x_positions = region.scan_axis_mm
        x_label = "Scan position (mm)"
        title = f"D-scan at index {position_mm:.1f} mm"
    elif axis == "index":
        # Slice at a fixed scan position, showing index positions on X
        # This is the true B-scan (across probe width / index axis)
        idx = _nearest_index(region.scan_axis_mm, position_mm)
        slice_data = region.waveforms[idx, :, :]
        x_positions = region.index_axis_mm
        x_label = "Index position (mm)"
        title = f"B-scan at scan {position_mm:.1f} mm"
    else:
        raise ValueError(f"axis must be 'axial' or 'index', got '{axis}'")

    # Rectify signal (absolute value) and normalize to 0-100% amplitude
    # This matches how UT instruments display B-scans — envelope of the RF signal
    display_data = np.abs(slice_data.astype(np.float64))
    max_val = display_data.max()
    if max_val > 0:
        display_data = display_data / max_val * 100.0

    time_min = region.time_axis_us[0]
    time_max = region.time_axis_us[-1]
    x_start = x_positions[0]
    x_end = x_positions[-1]

    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
    ax.imshow(
        display_data.T,
        aspect="auto",
        cmap="jet",
        vmin=0,
        vmax=100,
        extent=[x_start, x_end, time_max, time_min],
        interpolation="bilinear",
    )
    ax.set_xlabel(x_label)
    ax.set_ylabel("Time (\u00b5s)")
    ax.set_title(title)

    # Gate overlays
    if gate_overlays:
        for i, gate in enumerate(gate_overlays):
            color = GATE_COLORS[i % len(GATE_COLORS)]
            gate_time_us = gate.start * 1e6
            gate_end_us = (gate.start + gate.length) * 1e6

            if time_min <= gate_time_us <= time_max:
                ax.axhline(y=gate_time_us, color=color, linewidth=1, linestyle="--", alpha=0.8)
                ax.text(x_end, gate_time_us, f" {gate.name}", color=color,
                        fontsize=8, va="center", ha="left", clip_on=False)
            elif time_min <= gate_end_us <= time_max:
                ax.axhline(y=gate_end_us, color=color, linewidth=1, linestyle="--", alpha=0.8)
                ax.text(x_end, gate_end_us, f" {gate.name} end", color=color,
                        fontsize=8, va="center", ha="left", clip_on=False)
            else:
                # Gate is off-screen — annotate at bottom edge
                ax.annotate(
                    f"{gate.name}: {gate_time_us:.1f} \u00b5s (off-screen)",
                    xy=(x_start + (x_end - x_start) * 0.02, time_max),
                    fontsize=7,
                    color=color,
                    va="top",
                    xytext=(0, -5 - i * 12),
                    textcoords="offset points",
                )

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150)
    plt.close(fig)
    return buf.getvalue()


def render_ascan(
    region: RegionData,
    scan_mm: float,
    index_mm: float,
    gate_overlays: Optional[list[GateInfo]] = None,
) -> bytes:
    """Render a single A-scan waveform as a PNG image.

    Args:
        region: Extracted region data with waveforms.
        scan_mm: Scan position in mm.
        index_mm: Index position in mm.
        gate_overlays: Optional gate info for shaded region overlays.

    Returns:
        PNG image bytes.
    """
    scan_idx = _nearest_index(region.scan_axis_mm, scan_mm)
    index_idx = _nearest_index(region.index_axis_mm, index_mm)

    waveform = region.waveforms[scan_idx, index_idx, :].astype(np.float64)
    # Normalize to percentage (0-200% scale, matching UT convention: 32767 = 200%)
    waveform_pct = waveform / 32767.0 * 200.0
    time_us = region.time_axis_us

    fig, ax = plt.subplots(figsize=(8, 3), dpi=150)
    ax.plot(time_us, waveform_pct, "b-", linewidth=0.5)
    ax.set_xlabel("Time (\u00b5s)")
    ax.set_ylabel("Amplitude (%)")
    ax.set_title(f"A-scan at scan={scan_mm:.1f}mm, index={index_mm:.1f}mm")

    # Gate overlays as shaded regions
    if gate_overlays:
        for i, gate in enumerate(gate_overlays):
            color = GATE_COLORS[i % len(GATE_COLORS)]
            gate_start_us = gate.start * 1e6
            gate_end_us = (gate.start + gate.length) * 1e6

            ax.axvspan(
                gate_start_us,
                gate_end_us,
                alpha=0.15,
                color=color,
                label=gate.name,
            )
            # Threshold line within the gate region (now in % scale)
            if gate.threshold > 0:
                threshold_amp = gate.threshold  # Already in percent
                ax.hlines(
                    threshold_amp,
                    gate_start_us,
                    gate_end_us,
                    colors=color,
                    linewidth=0.8,
                    linestyle=":",
                    alpha=0.6,
                )

        ax.legend(fontsize=7, loc="upper right")

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=150)
    plt.close(fig)
    return buf.getvalue()


def _nearest_index(axis_mm: np.ndarray, position_mm: float) -> int:
    """Find the index of the nearest value in an axis array."""
    return int(np.argmin(np.abs(axis_mm - position_mm)))
