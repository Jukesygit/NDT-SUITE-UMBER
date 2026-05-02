"""
Waveform envelope extraction for progressive C-scan computation.

Reads AScanAmplitude from HDF5, rectifies, and downsamples via max-pooling
to preserve peak amplitudes for threshold crossing detection.
"""

import numpy as np
import h5py
from .models import FileIndex

# Number of time samples in the downsampled envelope
ENVELOPE_SAMPLES = 30


def max_pool_1d(data: np.ndarray, n_bins: int) -> np.ndarray:
    """Downsample last axis via max-pooling. Preserves peak amplitudes.

    Args:
        data: Array with time axis as last dimension.
        n_bins: Number of output bins.

    Returns:
        Array with last axis reduced to n_bins.
    """
    n_time = data.shape[-1]
    if n_time <= n_bins:
        result = np.zeros((*data.shape[:-1], n_bins), dtype=data.dtype)
        result[..., :n_time] = data
        return result

    bin_size = n_time // n_bins
    trimmed = data[..., :bin_size * n_bins]
    reshaped = trimmed.reshape(*data.shape[:-1], n_bins, bin_size)
    return reshaped.max(axis=-1)


def extract_envelope_chunk(
    file_index: FileIndex,
    scan_start: int,
    scan_end: int,
    n_bins: int = ENVELOPE_SAMPLES,
) -> np.ndarray:
    """Extract rectified, downsampled envelope for a chunk of scan lines.

    Args:
        file_index: Indexed NDE file.
        scan_start: First scan line index (inclusive).
        scan_end: Last scan line index (exclusive).
        n_bins: Number of output time bins.

    Returns:
        uint8 array of shape (scan_end - scan_start, n_index, n_bins).
        Values 0-255 represent rectified amplitude (0-255 maps to 0-200%).
    """
    n_index = file_index.index_axis.quantity

    with h5py.File(file_index.path, "r") as f:
        amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]
        waveforms = amp_ds[scan_start:scan_end, :n_index, :]  # (chunk, n_index, n_time) int16

    # Rectify (absolute value) and convert to float32
    rectified = np.abs(waveforms.astype(np.float32))

    # Normalize to 0-255 (maps full int16 range to uint8)
    rectified = (rectified / 32767.0 * 255.0).clip(0, 255)

    # Max-pool downsample time axis
    pooled = max_pool_1d(rectified, n_bins)

    return pooled.astype(np.uint8)
