"""
Batch Export Window — standalone tkinter UI for batch-exporting C-scan CSVs from NDE files.

Runs as a separate process via multiprocessing to avoid tkinter/asyncio thread-safety issues.
Does NOT share state with the API server.
"""

import logging
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# Ensure the project root is on sys.path when running as a subprocess
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from engine.cscan_export import cscan_to_csv, extract_cscan
from engine.models import GateControlParams
from engine.nde_reader import index_folder
from ui.theme import (
    SURFACE_RAISED, GLASS_PRIMARY, GLASS_SECONDARY,
    ACCENT_BLUE_DIM, GLASS_BORDER,
    TEXT_PRIMARY, TEXT_SECONDARY, TEXT_ACCENT,
    SUCCESS, DANGER,
    apply_theme,
)

logger = logging.getLogger(__name__)


class BatchExportWindow:
    """Tkinter-based batch export window styled to match the NDT Suite web app."""

    def __init__(self, root: tk.Tk, initial_folder: str = None, gate_defaults: GateControlParams = None):
        self.root = root
        self.root.title("Matrix NDT Companion \u2014 Batch Export")
        self.root.geometry("780x820")
        self.root.minsize(640, 640)

        # Apply the NDT Suite dark theme
        apply_theme(self.root)

        self.file_indices = []
        self.selected = {}  # filename -> BooleanVar
        self.exporting = False
        self.cancel_requested = False

        if gate_defaults is None:
            gate_defaults = GateControlParams()

        self._build_ui(gate_defaults)

        if initial_folder and os.path.isdir(initial_folder):
            self.folder_var.set(initial_folder)
            self._scan_folder()

    def _build_ui(self, defaults: GateControlParams):
        pad = {"padx": 10, "pady": 6}

        # --- Header bar ---
        header = tk.Frame(self.root, bg=SURFACE_RAISED, height=52)
        header.pack(fill="x")
        header.pack_propagate(False)

        tk.Label(header, text="\u25c8  Matrix NDT Companion", font=("Segoe UI", 13, "bold"),
                 bg=SURFACE_RAISED, fg=TEXT_PRIMARY).pack(side="left", padx=16)
        tk.Label(header, text="Batch Export", font=("Segoe UI", 10),
                 bg=SURFACE_RAISED, fg=TEXT_SECONDARY).pack(side="left", padx=(0, 16))

        # Thin accent line under header
        tk.Frame(self.root, bg=ACCENT_BLUE_DIM, height=1).pack(fill="x")

        # Main content area with padding
        content = ttk.Frame(self.root, style="TFrame")
        content.pack(fill="both", expand=True, padx=12, pady=8)

        # --- Folder selector ---
        folder_frame = ttk.LabelFrame(content, text="NDE Folder")
        folder_frame.pack(fill="x", **pad)

        folder_inner = ttk.Frame(folder_frame, style="Card.TFrame")
        folder_inner.pack(fill="x", padx=8, pady=8)

        self.folder_var = tk.StringVar()
        ttk.Entry(folder_inner, textvariable=self.folder_var, width=60).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(folder_inner, text="Browse\u2026", command=self._browse_folder).pack(side="left")

        # --- Gate settings ---
        gate_frame = ttk.LabelFrame(content, text="Gate Settings")
        gate_frame.pack(fill="x", **pad)

        gate_inner = ttk.Frame(gate_frame, style="Card.TFrame")
        gate_inner.pack(fill="x", padx=8, pady=8)

        # Measurement mode
        mode_frame = ttk.Frame(gate_inner, style="Card.TFrame")
        mode_frame.pack(fill="x", pady=(0, 4))
        ttk.Label(mode_frame, text="Measurement:", background=GLASS_PRIMARY).pack(side="left")
        self.gate_mode_var = tk.StringVar(value=defaults.gate_mode)
        ttk.Radiobutton(mode_frame, text="A\u2013I (interface to backwall)",
                        variable=self.gate_mode_var, value="A-I").pack(side="left", padx=12)
        ttk.Radiobutton(mode_frame, text="B\u2013A (echo-to-echo)",
                        variable=self.gate_mode_var, value="B-A").pack(side="left", padx=12)

        # Recovery settings row 1
        recovery_frame = ttk.Frame(gate_inner, style="Card.TFrame")
        recovery_frame.pack(fill="x", pady=2)

        ttk.Label(recovery_frame, text="Ref recovery:", background=GLASS_PRIMARY).pack(side="left")
        self.ref_recovery_var = tk.StringVar(value=defaults.ref_recovery)
        ttk.Combobox(recovery_frame, textvariable=self.ref_recovery_var,
                     values=["crossing_only", "peak_fallback"], width=16, state="readonly").pack(side="left", padx=8)

        ttk.Label(recovery_frame, text="Ref min amp (%):", background=GLASS_PRIMARY).pack(side="left", padx=(16, 0))
        self.ref_amp_var = tk.StringVar(value="0")
        ttk.Spinbox(recovery_frame, textvariable=self.ref_amp_var, from_=0, to=100, width=5).pack(side="left", padx=8)

        # Recovery settings row 2
        recovery_frame2 = ttk.Frame(gate_inner, style="Card.TFrame")
        recovery_frame2.pack(fill="x", pady=2)

        ttk.Label(recovery_frame2, text="Meas recovery:", background=GLASS_PRIMARY).pack(side="left")
        self.meas_recovery_var = tk.StringVar(value=defaults.meas_recovery)
        ttk.Combobox(recovery_frame2, textvariable=self.meas_recovery_var,
                     values=["crossing_only", "peak_fallback"], width=16, state="readonly").pack(side="left", padx=8)

        ttk.Label(recovery_frame2, text="Meas min amp (%):", background=GLASS_PRIMARY).pack(side="left", padx=(16, 0))
        self.meas_amp_var = tk.StringVar(value="0")
        ttk.Spinbox(recovery_frame2, textvariable=self.meas_amp_var, from_=0, to=100, width=5).pack(side="left", padx=8)

        # Thickness filter
        thick_frame = ttk.Frame(gate_inner, style="Card.TFrame")
        thick_frame.pack(fill="x", pady=(4, 0))
        ttk.Label(thick_frame, text="Thickness min (mm):", background=GLASS_PRIMARY).pack(side="left")
        self.thick_min_var = tk.StringVar(value="")
        ttk.Entry(thick_frame, textvariable=self.thick_min_var, width=8).pack(side="left", padx=8)
        ttk.Label(thick_frame, text="Max (mm):", background=GLASS_PRIMARY).pack(side="left", padx=(16, 0))
        self.thick_max_var = tk.StringVar(value="")
        ttk.Entry(thick_frame, textvariable=self.thick_max_var, width=8).pack(side="left", padx=8)

        # --- File list ---
        list_frame = ttk.LabelFrame(content, text="Files")
        list_frame.pack(fill="both", expand=True, **pad)

        columns = ("filename", "coverage")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="tree headings", height=8)
        self.tree.heading("#0", text="")
        self.tree.heading("filename", text="Filename")
        self.tree.heading("coverage", text="Coverage %")
        self.tree.column("#0", width=30, stretch=False)
        self.tree.column("filename", width=480)
        self.tree.column("coverage", width=100, anchor="center")

        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        scrollbar.pack(side="right", fill="y", padx=(0, 8), pady=8)

        # --- Output folder ---
        out_frame = ttk.LabelFrame(content, text="Output Folder")
        out_frame.pack(fill="x", **pad)

        out_inner = ttk.Frame(out_frame, style="Card.TFrame")
        out_inner.pack(fill="x", padx=8, pady=8)

        self.output_var = tk.StringVar()
        ttk.Entry(out_inner, textvariable=self.output_var, width=60).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(out_inner, text="Browse\u2026", command=self._browse_output).pack(side="left")

        # --- Action buttons ---
        btn_frame = ttk.Frame(content, style="TFrame")
        btn_frame.pack(fill="x", **pad)

        ttk.Button(btn_frame, text="Select All", command=self._select_all).pack(side="left", padx=(0, 6))
        ttk.Button(btn_frame, text="Deselect All", command=self._deselect_all).pack(side="left", padx=6)
        ttk.Button(btn_frame, text="Refresh Coverage", command=self._refresh_coverage).pack(side="left", padx=6)

        self.export_btn = ttk.Button(btn_frame, text="Export Selected",
                                     command=self._start_export, style="Primary.TButton")
        self.export_btn.pack(side="right", padx=(6, 0))
        self.cancel_btn = ttk.Button(btn_frame, text="Cancel",
                                     command=self._cancel_export, style="Danger.TButton", state="disabled")
        self.cancel_btn.pack(side="right", padx=6)

        # --- Progress ---
        progress_frame = ttk.Frame(content, style="TFrame")
        progress_frame.pack(fill="x", padx=10, pady=(4, 2))

        self.progress_var = tk.DoubleVar(value=0)
        self.progress_bar = ttk.Progressbar(progress_frame, variable=self.progress_var, maximum=100)
        self.progress_bar.pack(fill="x", pady=(0, 4))

        self.status_var = tk.StringVar(value="Ready")
        ttk.Label(progress_frame, textvariable=self.status_var, style="Secondary.TLabel").pack(anchor="w")

        # --- Log panel ---
        log_frame = ttk.LabelFrame(content, text="Log")
        log_frame.pack(fill="both", expand=False, **pad)

        self.log_text = tk.Text(log_frame, height=5, wrap="word", state="disabled",
                                font=("JetBrains Mono", 9),
                                bg=GLASS_SECONDARY, fg=TEXT_SECONDARY,
                                insertbackground=TEXT_PRIMARY,
                                selectbackground=ACCENT_BLUE_DIM,
                                selectforeground=TEXT_PRIMARY,
                                borderwidth=0, highlightthickness=1,
                                highlightcolor=GLASS_BORDER,
                                highlightbackground=GLASS_BORDER)
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        self.log_text.configure(yscrollcommand=log_scroll.set)
        self.log_text.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        log_scroll.pack(side="right", fill="y", padx=(0, 8), pady=8)

        # Log text tags
        self.log_text.tag_configure("error", foreground=DANGER)
        self.log_text.tag_configure("success", foreground=SUCCESS)
        self.log_text.tag_configure("accent", foreground=TEXT_ACCENT)

    def _log(self, message: str, tag: str = None):
        """Append a line to the log panel. Must be called from main thread or via root.after."""
        def _do():
            self.log_text.configure(state="normal")
            self.log_text.insert("end", message + "\n", tag)
            self.log_text.see("end")
            self.log_text.configure(state="disabled")
        self.root.after(0, _do)

    def _browse_folder(self):
        folder = filedialog.askdirectory(title="Select NDE Folder")
        if folder:
            self.folder_var.set(folder)
            self._scan_folder()

    def _browse_output(self):
        folder = filedialog.askdirectory(title="Select Output Folder")
        if folder:
            self.output_var.set(folder)

    def _scan_folder(self):
        folder = self.folder_var.get()
        if not folder or not os.path.isdir(folder):
            return

        self.status_var.set("Scanning folder\u2026")
        self.root.update_idletasks()

        self.file_indices = index_folder(folder)
        self._populate_file_list()

        # Keep export filters opt-in. Some field reports rely on sub-process-limit
        # readings, so silently applying NDE process limits can hide defects.
        for fi in self.file_indices:
            if fi.thickness_process:
                limits = []
                if fi.thickness_process.min_mm is not None:
                    limits.append(f"min {fi.thickness_process.min_mm:g} mm")
                if fi.thickness_process.max_mm is not None:
                    limits.append(f"max {fi.thickness_process.max_mm:g} mm")
                if limits:
                    self._log(
                        f"Detected NDE thickness-process limits ({', '.join(limits)}); "
                        "leave export filter fields blank for raw C-scan values.",
                        "accent",
                    )
                break

        # Default output folder
        if not self.output_var.get():
            self.output_var.set(os.path.join(folder, "csv"))

        self.status_var.set(f"Found {len(self.file_indices)} NDE files")

    def _populate_file_list(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        self.selected.clear()

        for fi in self.file_indices:
            var = tk.BooleanVar(value=True)
            self.selected[fi.filename] = var

            coverage = f"{fi.valid_point_count / (fi.scan_axis.quantity * fi.index_axis.quantity) * 100:.1f}%" if fi.scan_axis.quantity * fi.index_axis.quantity > 0 else "N/A"

            self.tree.insert("", "end", iid=fi.filename, text="\u2611",
                           values=(fi.filename, coverage))

        self.tree.bind("<ButtonRelease-1>", self._toggle_selection)

    def _toggle_selection(self, event):
        item = self.tree.identify_row(event.y)
        if item and item in self.selected:
            var = self.selected[item]
            var.set(not var.get())
            self.tree.item(item, text="\u2611" if var.get() else "\u2610")

    def _select_all(self):
        for filename, var in self.selected.items():
            var.set(True)
            self.tree.item(filename, text="\u2611")

    def _deselect_all(self):
        for filename, var in self.selected.items():
            var.set(False)
            self.tree.item(filename, text="\u2610")

    def _get_params(self) -> GateControlParams:
        thick_min = None
        thick_max = None
        try:
            if self.thick_min_var.get().strip():
                thick_min = float(self.thick_min_var.get())
        except ValueError:
            pass
        try:
            if self.thick_max_var.get().strip():
                thick_max = float(self.thick_max_var.get())
        except ValueError:
            pass

        ref_amp = 0
        meas_amp = 0
        try:
            ref_amp = float(self.ref_amp_var.get())
        except ValueError:
            pass
        try:
            meas_amp = float(self.meas_amp_var.get())
        except ValueError:
            pass

        return GateControlParams(
            gate_mode=self.gate_mode_var.get(),
            ref_recovery=self.ref_recovery_var.get(),
            meas_recovery=self.meas_recovery_var.get(),
            min_amplitude_ref=GateControlParams.pct_to_raw(ref_amp),
            min_amplitude_meas=GateControlParams.pct_to_raw(meas_amp),
            thickness_min=thick_min,
            thickness_max=thick_max,
        )

    def _refresh_coverage(self):
        """Refresh coverage percentages using current gate settings."""
        params = self._get_params()
        self.status_var.set("Refreshing coverage\u2026")
        self.root.update_idletasks()

        for fi in self.file_indices:
            try:
                result = extract_cscan(fi, params)
                pct = f"{result.valid_count / result.total_count * 100:.1f}%" if result.total_count > 0 else "N/A"
                self.tree.set(fi.filename, "coverage", pct)
            except Exception as e:
                self.tree.set(fi.filename, "coverage", f"Error")
                logger.warning("Coverage refresh failed for %s: %s", fi.filename, e)
            self.root.update_idletasks()

        self.status_var.set("Coverage refreshed")

    def _start_export(self):
        selected_files = [fi for fi in self.file_indices if self.selected.get(fi.filename, tk.BooleanVar(value=False)).get()]
        if not selected_files:
            messagebox.showinfo("No Files", "No files selected for export.")
            return

        output_dir = self.output_var.get()
        if not output_dir:
            messagebox.showinfo("No Output", "Please select an output folder.")
            return

        os.makedirs(output_dir, exist_ok=True)

        # Check for existing files
        existing = []
        for fi in selected_files:
            csv_name = os.path.splitext(fi.filename)[0] + ".csv"
            csv_path = os.path.join(output_dir, csv_name)
            if os.path.exists(csv_path):
                existing.append(csv_name)

        collision_policy = "overwrite"
        if existing:
            result = messagebox.askyesnocancel(
                "Files Exist",
                f"{len(existing)} output file(s) already exist.\n\n"
                "Yes = Overwrite all\nNo = Skip existing\nCancel = Abort export"
            )
            if result is None:
                return
            elif result:
                collision_policy = "overwrite"
            else:
                collision_policy = "skip"

        self.exporting = True
        self.cancel_requested = False
        self.export_btn.configure(state="disabled")
        self.cancel_btn.configure(state="normal")

        params = self._get_params()

        thread = threading.Thread(
            target=self._export_thread,
            args=(selected_files, output_dir, params, collision_policy),
            daemon=True,
        )
        thread.start()

    def _export_thread(self, files, output_dir, params, collision_policy):
        import traceback

        total = len(files)
        completed = 0
        failed = 0

        self._log(f"Starting export of {total} files to {output_dir}", "accent")
        self._log(f"Gate: {params.gate_mode}, ref={params.ref_recovery}, meas={params.meas_recovery}")

        for fi in files:
            if self.cancel_requested:
                self.root.after(0, lambda: self.status_var.set(f"Cancelled. {completed} exported, {failed} failed."))
                break

            csv_name = os.path.splitext(fi.filename)[0] + ".csv"
            csv_path = os.path.join(output_dir, csv_name)

            if collision_policy == "skip" and os.path.exists(csv_path):
                completed += 1
                self._update_progress(completed, total, fi.filename, "Skipped")
                self._log(f"  Skipped (exists): {fi.filename}")
                continue

            try:
                self._update_progress(completed, total, fi.filename, "Exporting\u2026")
                result = extract_cscan(fi, params)
                cscan_to_csv(result, csv_path, fi, params)
                completed += 1
                pct = f"{result.valid_count / result.total_count * 100:.1f}%" if result.total_count > 0 else "N/A"
                self._update_progress(completed, total, fi.filename, "Done")
                self._log(f"  OK: {fi.filename} ({pct} coverage)", "success")
            except Exception as e:
                failed += 1
                tb = traceback.format_exc()
                logger.warning("Export failed for %s: %s", fi.filename, e)
                self._update_progress(completed, total, fi.filename, f"Failed: {e}")
                self._log(f"  FAILED: {fi.filename}", "error")
                self._log(f"    {type(e).__name__}: {e}", "error")
                # Log relevant traceback lines (skip boilerplate)
                for line in tb.strip().split("\n"):
                    if "engine/" in line or "Error" in line or "assert" in line.lower():
                        self._log(f"    {line.strip()}", "error")

                # Mark file as failed in tree
                self.root.after(0, lambda fn=fi.filename: self.tree.set(fn, "coverage", "FAILED"))

        self.root.after(0, self._export_complete, completed, failed)

    def _update_progress(self, completed, total, filename, status):
        pct = completed / total * 100 if total > 0 else 0
        # Capture values for lambda closure
        _pct, _msg = pct, f"{completed}/{total} \u2014 {filename}: {status}"
        self.root.after(0, lambda: self.progress_var.set(_pct))
        self.root.after(0, lambda: self.status_var.set(_msg))

    def _export_complete(self, completed, failed):
        self.exporting = False
        self.export_btn.configure(state="normal")
        self.cancel_btn.configure(state="disabled")
        self.status_var.set(f"Export complete. {completed} exported, {failed} failed.")
        self.progress_var.set(100)

    def _cancel_export(self):
        self.cancel_requested = True
        self.status_var.set("Cancelling after current file\u2026")


def launch_batch_window(initial_folder: str = None, gate_defaults: GateControlParams = None):
    """Entry point for the batch export window. Called via multiprocessing.Process."""
    root = tk.Tk()
    BatchExportWindow(root, initial_folder, gate_defaults)
    root.mainloop()
