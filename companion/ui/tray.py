"""
System tray icon for Matrix NDT Companion using pystray.

Provides a tray icon with menu items to open batch export,
set NDE folder, show status, and quit.
"""

import logging
import multiprocessing
import os
import threading
import tkinter as tk
from tkinter import filedialog

import pystray
from PIL import Image, ImageDraw

from api.cache import FileCache
from config import save_config
from engine.nde_reader import index_folder
from ui.theme import TRAY_ACTIVE, TRAY_IDLE

logger = logging.getLogger(__name__)


def _create_icon_image(active: bool = True) -> Image.Image:
    """Create a tray icon matching the NDT Suite teal accent palette."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    fill = TRAY_ACTIVE if active else TRAY_IDLE
    draw.ellipse([2, 2, size - 2, size - 2], fill=None, outline=fill, width=3)
    draw.ellipse([10, 10, size - 10, size - 10], fill=fill)

    return img


def _set_folder_dialog(cache: FileCache, config: dict, icon: pystray.Icon):
    """Open a folder dialog to set the NDE directory. Runs in a thread."""
    root = tk.Tk()
    root.withdraw()
    folder = filedialog.askdirectory(title="Select NDE Folder")
    root.destroy()

    if folder and os.path.isdir(folder):
        files = index_folder(folder)
        cache.set_directory(folder, files)
        config["lastDirectory"] = folder
        save_config(config)

        icon.icon = _create_icon_image(active=True)
        icon.notify(f"Indexed {len(files)} NDE files from:\n{folder}", "Matrix NDT Companion")
        logger.info("Set directory to %s, indexed %d files", folder, len(files))


def _open_batch_export(cache: FileCache, config: dict):
    """Launch the batch export window in a separate process."""
    from ui.batch_window import launch_batch_window
    from config import get_gate_defaults

    snap = cache.get_snapshot()
    initial_folder = snap.directory or config.get("lastDirectory")
    gate_defaults = get_gate_defaults()

    proc = multiprocessing.Process(
        target=launch_batch_window,
        args=(initial_folder, gate_defaults),
        daemon=True,
    )
    proc.start()
    logger.info("Launched batch export window (PID %d)", proc.pid)


def _set_calibration_folder_dialog(cache: FileCache, config: dict, icon: pystray.Icon):
    """Open a folder dialog to set the calibration NDE directory. Runs in a thread."""
    root = tk.Tk()
    root.withdraw()
    folder = filedialog.askdirectory(title="Select Calibration Folder")
    root.destroy()

    if folder and os.path.isdir(folder):
        files = index_folder(folder)
        cache.set_calibration(folder, files)
        config["calibrationDirectory"] = folder
        save_config(config)

        icon.notify(
            f"Indexed {len(files)} calibration files from:\n{folder}",
            "Matrix NDT Companion",
        )
        logger.info("Set calibration directory to %s, indexed %d files", folder, len(files))


def _show_status(cache: FileCache, config: dict, icon: pystray.Icon):
    """Show status notification."""
    snap = cache.get_snapshot()
    directory = snap.directory or "Not set"
    file_count = len(snap.files)
    cal_directory = snap.calibration_directory or "Not set"
    cal_count = len(snap.calibration_files)
    port = config.get("port", "unknown")

    icon.notify(
        f"Port: {port}\nNDE Folder: {directory}\nFiles: {file_count}\n"
        f"Cal Folder: {cal_directory}\nCal Files: {cal_count}",
        "Matrix NDT Companion Status",
    )


def run_tray(cache: FileCache, config: dict):
    """Run the system tray icon on the main thread (required by pystray on Windows)."""
    snap = cache.get_snapshot()
    has_files = len(snap.files) > 0

    icon = pystray.Icon(
        "matrix-ndt-companion",
        _create_icon_image(active=has_files),
        "Matrix NDT Companion",
    )

    def on_set_folder(icon_ref, item):
        t = threading.Thread(target=_set_folder_dialog, args=(cache, config, icon_ref), daemon=True)
        t.start()

    def on_set_cal_folder(icon_ref, item):
        t = threading.Thread(target=_set_calibration_folder_dialog, args=(cache, config, icon_ref), daemon=True)
        t.start()

    def on_batch_export(icon_ref, item):
        _open_batch_export(cache, config)

    def on_status(icon_ref, item):
        _show_status(cache, config, icon_ref)

    def on_quit(icon_ref, item):
        icon_ref.stop()

    icon.menu = pystray.Menu(
        pystray.MenuItem("Open Batch Export", on_batch_export),
        pystray.MenuItem("Set NDE Folder…", on_set_folder),
        pystray.MenuItem("Set Calibration Folder…", on_set_cal_folder),
        pystray.MenuItem("Status", on_status),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", on_quit),
    )

    logger.info("Starting system tray icon")
    icon.run()
