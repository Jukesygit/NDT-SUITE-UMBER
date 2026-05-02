"""
Config persistence for Matrix NDT Companion app.

Loads/saves settings from %APPDATA%/MatrixNDTCompanion/config.json.
"""

import json
import logging
import os
from pathlib import Path

from engine.models import GateControlParams

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(os.environ.get("APPDATA", "~")) / "MatrixNDTCompanion"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "port": 18923,
    "lastDirectory": None,
    "calibrationDirectory": None,
    "csvOutputSubfolder": "csv",
    "gateDefaults": {
        "mode": "A-I",
        "refRecovery": "peak_fallback",
        "measRecovery": "peak_fallback",
        "refMinAmplitude": 0,
        "measMinAmplitude": 0,
        "thicknessMin": None,
        "thicknessMax": None,
    },
}


def load_config() -> dict:
    """Load config from disk, merging with defaults for any missing keys."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if not CONFIG_FILE.exists():
        return dict(DEFAULTS)

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            stored = json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.warning("Corrupt config file, using defaults")
        return dict(DEFAULTS)

    merged = dict(DEFAULTS)
    for key, default_val in DEFAULTS.items():
        if key in stored:
            if isinstance(default_val, dict) and isinstance(stored[key], dict):
                merged[key] = {**default_val, **stored[key]}
            else:
                merged[key] = stored[key]

    return merged


def save_config(config: dict) -> None:
    """Write config to disk."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def get_gate_defaults() -> GateControlParams:
    """Load config and return GateControlParams from gateDefaults section."""
    config = load_config()
    gd = config.get("gateDefaults", DEFAULTS["gateDefaults"])

    return GateControlParams(
        gate_mode=gd.get("mode", "A-I"),
        ref_recovery=gd.get("refRecovery", "peak_fallback"),
        meas_recovery=gd.get("measRecovery", "crossing_only"),
        min_amplitude_ref=GateControlParams.pct_to_raw(gd.get("refMinAmplitude", 0)),
        min_amplitude_meas=GateControlParams.pct_to_raw(gd.get("measMinAmplitude", 0)),
        thickness_min=gd.get("thicknessMin"),
        thickness_max=gd.get("thicknessMax"),
    )
