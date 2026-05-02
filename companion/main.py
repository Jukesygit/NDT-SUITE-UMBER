"""
Matrix NDT Companion App — main entry point.

Starts the FastAPI server in a daemon thread and the system tray on the main thread.
"""

import logging
import multiprocessing
import threading

from api.cache import FileCache
from config import load_config
from engine.nde_reader import index_folder

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    config = load_config()
    cache = FileCache()

    last_dir = config.get("lastDirectory", "")
    cal_dir = config.get("calibrationDirectory", "")

    files = []
    cal_files = []

    if last_dir:
        logger.info("Auto-indexing last directory: %s", last_dir)
        try:
            files = index_folder(last_dir)
            logger.info("Indexed %d files from %s", len(files), last_dir)
        except Exception:
            logger.warning("Failed to auto-index %s", last_dir, exc_info=True)
            last_dir = ""

    if cal_dir:
        logger.info("Auto-indexing calibration directory: %s", cal_dir)
        try:
            cal_files = index_folder(cal_dir)
            logger.info("Indexed %d calibration files from %s", len(cal_files), cal_dir)
        except Exception:
            logger.warning("Failed to auto-index calibration dir %s", cal_dir, exc_info=True)
            cal_dir = ""

    if last_dir or cal_dir:
        cache.initialize(
            directory=last_dir,
            files=files if last_dir else None,
            calibration_directory=cal_dir,
            calibration_files=cal_files if cal_dir else None,
        )

    # Start API in daemon thread
    from api.server import start_server

    api_thread = threading.Thread(
        target=start_server,
        args=(cache, config),
        daemon=True,
    )
    api_thread.start()
    logger.info("API server thread started")

    # Run tray on main thread (required by pystray on Windows)
    from ui.tray import run_tray

    run_tray(cache, config)


if __name__ == "__main__":
    multiprocessing.freeze_support()  # Required for PyInstaller
    main()
