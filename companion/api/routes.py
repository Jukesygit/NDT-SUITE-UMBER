"""
API route definitions for Matrix NDT Companion.

All endpoints are thin wrappers around the engine functions.
"""

import asyncio
import base64
import gzip
import hashlib
import json
import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from .auth import create_session_token, get_startup_token, validate_token
from .cache import CacheSnapshot, FileCache

from engine.calibration import extract_calibration
from engine.composite import create_composite
from engine.cscan_export import cscan_to_csv, extract_cscan
from engine.image_renderer import render_ascan, render_bscan
from engine.models import FileIndex, GateControlParams
from engine.nde_reader import index_calibration_folder, index_file, index_folder
from engine.pillow_renderer import render_ascan_pillow, render_bscan_pillow
from engine.region_extract import extract_region
from engine.waveform_thickness import compute_thickness_full_res

logger = logging.getLogger(__name__)

# API version — increment when breaking changes are made
API_VERSION = 2

FEATURES = [
    "directory-params",
    "session-cache",
    "ws-backpressure",
    "auth-token",
    "content-hash",
    "list-directory",
]


# --- Request/Response Models ---

class SetDirectoryRequest(BaseModel):
    path: str


class ConvertEddifyRequest(BaseModel):
    capture_dirs: list[str]
    output_folder: str


class CscanExportRequest(BaseModel):
    filename: str
    directory: Optional[str] = None
    gateMode: str = "A-I"
    refRecovery: str = "peak_fallback"
    measRecovery: str = "crossing_only"
    minAmplitudeRef: float = 0
    minAmplitudeMeas: float = 0
    thicknessMin: Optional[float] = None
    thicknessMax: Optional[float] = None


class RenderRegionRequest(BaseModel):
    filename: str
    directory: Optional[str] = None
    scanStartMm: float
    scanEndMm: float
    indexStartMm: float
    indexEndMm: float
    views: list[str] = ["bscan_axial", "bscan_index", "ascan_center"]
    showGates: Optional[list[int]] = None
    scanLineMm: Optional[float] = None   # Slice position for index B-scan (default: center)
    indexLineMm: Optional[float] = None  # Slice position for axial B-scan (default: center)
    gateMode: str = "A-I"
    refRecovery: str = "peak_fallback"
    measRecovery: str = "crossing_only"


class RenderAscanRequest(BaseModel):
    filename: str
    directory: Optional[str] = None
    scanMm: float
    indexMm: float


class CreateCompositeRequest(BaseModel):
    folders: list[str]
    directory: Optional[str] = None
    gateSettings: dict = {}


class ViewerRenderRequest(BaseModel):
    """Shared request model for B-scan and A-scan viewer endpoints."""
    folders: list[str]
    directory: Optional[str] = None
    scanMm: float
    indexMm: float
    width: int = 600
    height: Optional[int] = None
    gateSettings: dict = {}


# --- Active request tracking ---

class ActiveRequestTracker:
    """Thread-safe counter for in-flight processing requests."""

    def __init__(self):
        self._count = 0
        self._lock = threading.Lock()

    @property
    def count(self) -> int:
        return self._count

    def increment(self):
        with self._lock:
            self._count += 1

    def decrement(self):
        with self._lock:
            self._count = max(0, self._count - 1)


# --- Route factory ---

def create_router(cache: FileCache) -> APIRouter:
    """Create the API router with access to the thread-safe file cache."""
    router = APIRouter()
    active_requests = ActiveRequestTracker()

    def _find_file(filename: str, files: tuple) -> Optional[FileIndex]:
        """Find a FileIndex by filename in the given files tuple."""
        for fi in files:
            if fi.filename == filename:
                return fi
        return None

    def _get_gate_overlays(file_index, show_gates):
        """Get gate overlays filtered by show_gates list."""
        if show_gates is None:
            return file_index.gates
        return [g for g in file_index.gates if g.id in show_gates]

    def _resolve_directory(req_directory: Optional[str], snap: CacheSnapshot) -> str:
        """Use per-request directory if provided, otherwise fall back to cache snapshot."""
        if req_directory:
            if not os.path.isdir(req_directory):
                raise HTTPException(status_code=400, detail=f"Directory not found: {req_directory}")
            return req_directory
        if not snap.directory:
            raise HTTPException(status_code=400, detail="No directory set. Call POST /set-directory first.")
        return snap.directory

    @router.get("/status")
    def get_status():
        snap = cache.get_snapshot()
        return {
            "app": "matrix-ndt-companion",
            "version": "1.0.0",
            "apiVersion": API_VERSION,
            "apiVersionLegacy": API_VERSION,
            "features": FEATURES,
            "token": get_startup_token(),
            "running": True,
            "activeRequests": active_requests.count,
            "directory": snap.directory or None,
            "fileCount": len(snap.files),
            "calibrationDirectory": snap.calibration_directory or None,
            "calibrationFileCount": len(snap.calibration_files),
        }

    @router.post("/auth/session")
    def auth_session():
        """Generate a new session token."""
        token, error = create_session_token()
        if error:
            raise HTTPException(status_code=429, detail=error)
        return {"token": token}

    @router.post("/set-directory")
    def set_directory(req: SetDirectoryRequest):
        if not os.path.isdir(req.path):
            raise HTTPException(status_code=400, detail=f"Directory not found: {req.path}")

        files = index_folder(req.path)
        snap = cache.set_directory(req.path, files)

        return {
            "fileCount": len(snap.files),
            "files": [_serialize_file(fi) for fi in snap.files],
        }

    @router.get("/folders")
    def get_folders(query: Optional[str] = None, limit: int = 100, offset: int = 0):
        """List subfolders containing .nde files in the current base directory."""
        snap = cache.get_snapshot()
        if not snap.directory:
            raise HTTPException(status_code=400, detail="No directory set. Call POST /set-directory first.")

        folders = _scan_subfolders(snap.directory, query)
        total = len(folders)
        page = folders[offset : offset + limit]

        return {"folders": page, "total": total}

    @router.post("/create-composite")
    async def create_composite_endpoint(req: CreateCompositeRequest, request: Request):
        """Generate a multi-file thickness composite from specified folders.

        Returns binary (gzip'd float32) by default, or JSON if Accept: application/json.
        Supports cooperative cancellation: if the client disconnects (AbortController),
        the processing loop stops between files.
        """
        import asyncio
        import concurrent.futures

        snap = cache.get_snapshot()
        base_dir = _resolve_directory(req.directory, snap)

        if not req.folders:
            raise HTTPException(status_code=400, detail="No folders specified")

        # Build gate params from request
        gs = req.gateSettings
        gate_params = GateControlParams(
            gate_mode=gs.get("gateMode", "A-I"),
            ref_recovery=gs.get("refRecovery", "peak_fallback"),
            meas_recovery=gs.get("measRecovery", "crossing_only"),
            min_amplitude_ref=GateControlParams.pct_to_raw(gs.get("minAmplitudeRef", 0)),
            min_amplitude_meas=GateControlParams.pct_to_raw(gs.get("minAmplitudeMeas", 0)),
            thickness_min=gs.get("thicknessMin"),
            thickness_max=gs.get("thicknessMax"),
        )

        # Abort flag for cooperative cancellation — checked between files
        abort_flag = threading.Event()

        cache.set_composite_progress({"stage": "starting", "pct": 0, "file": "", "fileIndex": 0, "totalFiles": 0})

        def on_progress(info: dict):
            cache.set_composite_progress(info)

        async def poll_disconnect():
            """Poll for client disconnect every 500ms and set abort flag."""
            while not abort_flag.is_set():
                if await request.is_disconnected():
                    abort_flag.set()
                    return
                await asyncio.sleep(0.5)

        active_requests.increment()
        loop = asyncio.get_event_loop()
        disconnect_task = asyncio.ensure_future(poll_disconnect())

        try:
            result = await loop.run_in_executor(
                None, create_composite, base_dir, req.folders, gate_params, abort_flag, on_progress
            )
        except Exception as e:
            if "Aborted" in type(e).__name__:
                raise HTTPException(status_code=499, detail="Client disconnected")
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            abort_flag.set()
            disconnect_task.cancel()
            active_requests.decrement()
            cache.set_composite_progress(None)

        accept = request.headers.get("accept", "application/octet-stream")
        if "application/json" in accept:
            return _composite_to_json(result)
        else:
            return _composite_to_binary(result)

    @router.get("/composite-progress")
    def get_composite_progress():
        """Get the current composite generation progress."""
        snap = cache.get_snapshot()
        progress = snap.composite_progress
        if progress is None:
            return {"active": False}
        return {"active": True, **progress}

    @router.get("/files")
    def get_files():
        snap = cache.get_snapshot()
        return {"files": [_serialize_file(fi) for fi in snap.files]}

    @router.get("/file-info/{filename}")
    def get_file_info(filename: str):
        snap = cache.get_snapshot()
        fi = _find_file(filename, snap.files)
        if fi is None:
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")
        return _serialize_file_full(fi)

    @router.post("/cscan-export")
    def cscan_export(req: CscanExportRequest):
        snap = cache.get_snapshot()
        fi = _find_file(req.filename, snap.files)
        if fi is None:
            raise HTTPException(status_code=404, detail=f"File not found: {req.filename}")

        params = GateControlParams(
            gate_mode=req.gateMode,
            ref_recovery=req.refRecovery,
            meas_recovery=req.measRecovery,
            min_amplitude_ref=GateControlParams.pct_to_raw(req.minAmplitudeRef),
            min_amplitude_meas=GateControlParams.pct_to_raw(req.minAmplitudeMeas),
            # NDE thickness-process limits are metadata, not implicit export filters.
            # Apply thickness filters only when explicitly supplied by the request.
            thickness_min=req.thicknessMin,
            thickness_max=req.thicknessMax,
        )

        try:
            result = extract_cscan(fi, params)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        csv_name = os.path.splitext(fi.filename)[0] + "_cscan.csv"
        tmp_path = os.path.join(tempfile.gettempdir(), csv_name)
        cscan_to_csv(result, tmp_path, fi, params)

        return FileResponse(
            tmp_path,
            media_type="text/csv",
            filename=csv_name,
        )

    @router.post("/render-region")
    def render_region(req: RenderRegionRequest):
        snap = cache.get_snapshot()
        fi = _find_file(req.filename, snap.files)
        if fi is None:
            raise HTTPException(status_code=404, detail=f"File not found: {req.filename}")

        try:
            region = extract_region(fi, req.scanStartMm, req.scanEndMm, req.indexStartMm, req.indexEndMm)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        gate_overlays = _get_gate_overlays(fi, req.showGates)

        response = {
            "clipped": region.clipped,
            "actualBounds": region.actual_bounds,
            "metadata": {
                "timeRangeUs": [float(region.time_axis_us[0]), float(region.time_axis_us[-1])],
                "gatesShown": [g.id for g in gate_overlays],
            },
        }

        scan_line = req.scanLineMm if req.scanLineMm is not None else (req.scanStartMm + req.scanEndMm) / 2
        index_line = req.indexLineMm if req.indexLineMm is not None else (req.indexStartMm + req.indexEndMm) / 2

        if "bscan_axial" in req.views:
            png = render_bscan(region, "axial", index_line, gate_overlays)
            response["bscanAxial"] = _to_data_uri(png)
            response["metadata"]["indexLineMm"] = index_line

        if "bscan_index" in req.views:
            png = render_bscan(region, "index", scan_line, gate_overlays)
            response["bscanIndex"] = _to_data_uri(png)
            response["metadata"]["scanLineMm"] = scan_line

        if "ascan_center" in req.views:
            png = render_ascan(region, scan_line, index_line, gate_overlays)
            response["ascanCenter"] = _to_data_uri(png)

        return response

    @router.post("/set-calibration-directory")
    def set_calibration_directory(req: SetDirectoryRequest):
        if not os.path.isdir(req.path):
            raise HTTPException(status_code=400, detail=f"Directory not found: {req.path}")

        cal_files = index_calibration_folder(req.path)
        snap = cache.set_calibration(req.path, cal_files)

        return {
            "fileCount": len(snap.calibration_files),
            "files": [_serialize_file(fi) for fi in snap.calibration_files],
        }

    @router.get("/calibration-files")
    def get_calibration_files():
        snap = cache.get_snapshot()
        results = []
        for fi in snap.calibration_files:
            cal = extract_calibration(fi)
            if cal is not None:
                results.append(_serialize_calibration(cal))
        return {"files": results}

    @router.post("/render-ascan")
    def render_ascan_endpoint(req: RenderAscanRequest):
        snap = cache.get_snapshot()
        fi = _find_file(req.filename, snap.files)
        if fi is None:
            raise HTTPException(status_code=404, detail=f"File not found: {req.filename}")

        try:
            region = extract_region(fi, req.scanMm, req.scanMm + 1, req.indexMm, req.indexMm + 1)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        png = render_ascan(region, req.scanMm, req.indexMm, fi.gates)

        import numpy as np
        waveform = region.waveforms[0, 0, :]
        status_val = int(region.status[0, 0])
        peak_amp_pct = float(np.max(np.abs(waveform))) / 32767.0 * 200.0

        return {
            "image": _to_data_uri(png),
            "metadata": {
                "peakAmplitudePct": round(peak_amp_pct, 1),
                "hasData": bool(status_val & 1),
                "saturated": bool(status_val & 2),
            },
        }

    # --- Scan Viewer endpoints (Pillow-based, fast rendering) ---

    def _find_nearest_file(folders: list[str], scan_mm: float, index_mm: float, snap: CacheSnapshot, directory_override: Optional[str] = None) -> Optional[FileIndex]:
        """Find the indexed file whose spatial range covers the given position.

        Searches across all files in the specified folders. Returns the first match.
        """
        base_dir = directory_override or snap.directory
        for folder_name in folders:
            folder_path = os.path.join(base_dir, folder_name)
            if not os.path.isdir(folder_path):
                continue
            for nde_name in sorted(os.listdir(folder_path)):
                if not nde_name.lower().endswith(".nde"):
                    continue
                full_path = os.path.join(folder_path, nde_name)
                fi = _find_file_by_path(full_path, snap.files)
                if fi is None:
                    continue
                sr = fi.scan_axis.range_mm
                ir = fi.index_axis.range_mm
                if sr[0] <= scan_mm <= sr[1] and ir[0] <= index_mm <= ir[1]:
                    return fi
        return None

    def _find_file_by_path(path: str, files: tuple) -> Optional[FileIndex]:
        """Find a FileIndex by full path in the given files tuple."""
        for fi in files:
            if fi.path == path:
                return fi
        return index_file(path)

    @router.post("/bscan-axial")
    def bscan_axial(req: ViewerRenderRequest):
        """Render an axial B-scan (D-scan) at the cursor's index position."""
        snap = cache.get_snapshot()
        fi = _find_nearest_file(req.folders, req.scanMm, req.indexMm, snap, req.directory)
        if fi is None:
            raise HTTPException(status_code=404, detail="No file covers the specified position")

        h = req.height or max(200, req.width // 2)
        try:
            png_bytes, render_ms = render_bscan_pillow(fi, "axial", req.scanMm, req.indexMm, req.width, h)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-Scan-Line-Mm": str(req.scanMm),
                "X-Index-Line-Mm": str(req.indexMm),
                "X-Render-Ms": f"{render_ms:.1f}",
            },
        )

    @router.post("/bscan-index")
    def bscan_index(req: ViewerRenderRequest):
        """Render an index B-scan at the cursor's scan position."""
        snap = cache.get_snapshot()
        fi = _find_nearest_file(req.folders, req.scanMm, req.indexMm, snap, req.directory)
        if fi is None:
            raise HTTPException(status_code=404, detail="No file covers the specified position")

        h = req.height or max(200, req.width // 2)
        try:
            png_bytes, render_ms = render_bscan_pillow(fi, "index", req.scanMm, req.indexMm, req.width, h)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-Scan-Line-Mm": str(req.scanMm),
                "X-Index-Line-Mm": str(req.indexMm),
                "X-Render-Ms": f"{render_ms:.1f}",
            },
        )

    @router.post("/ascan")
    def ascan_viewer(req: ViewerRenderRequest):
        """Render an A-scan waveform at the cursor position."""
        snap = cache.get_snapshot()
        fi = _find_nearest_file(req.folders, req.scanMm, req.indexMm, snap, req.directory)
        if fi is None:
            raise HTTPException(status_code=404, detail="No file covers the specified position")

        h = req.height or max(150, req.width // 3)
        try:
            png_bytes, render_ms = render_ascan_pillow(fi, req.scanMm, req.indexMm, req.width, h)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "Cache-Control": "no-store",
                "X-Scan-Line-Mm": str(req.scanMm),
                "X-Index-Line-Mm": str(req.indexMm),
                "X-Render-Ms": f"{render_ms:.1f}",
            },
        )

    # --- Index management ---

    @router.post("/refresh-index")
    def refresh_index():
        """Force-rescan the current directory for new/removed NDE files."""
        snap = cache.get_snapshot()
        if not snap.directory:
            raise HTTPException(status_code=400, detail="No directory set. Call POST /set-directory first.")

        new_snap = cache.refresh(index_folder)

        folders = _scan_subfolders(new_snap.directory)
        indexed_at = datetime.now(timezone.utc).isoformat()

        return {
            "folders": folders,
            "total": len(folders),
            "indexedAt": indexed_at,
        }

    # --- Tier 2: full-resolution thickness computation ---

    def _compute_tier2(msg: dict, snap: CacheSnapshot) -> list[tuple[str, bytes]]:
        """Compute full-resolution thickness for all files in the composite.

        Returns a list of (header_json, matrix_bytes) tuples — one per file
        (tile) plus a final complete result.
        """
        import time
        import numpy as np
        t0 = time.perf_counter()

        base_dir = snap.directory
        folders = msg.get("folders", [])
        gates = msg.get("gates", {})
        ref = gates.get("ref", {})
        meas = gates.get("meas", {})

        ref_start = ref.get("startUs", 0)
        ref_end = ref.get("endUs", 1)
        ref_thresh = ref.get("thresholdPct", 40)
        meas_start = meas.get("startUs", 0)
        meas_end = meas.get("endUs", 1)
        meas_thresh = meas.get("thresholdPct", 50)

        all_files: list[FileIndex] = []
        for folder_name in folders:
            folder_path = os.path.join(base_dir, folder_name)
            if not os.path.isdir(folder_path):
                continue
            for nde_name in sorted(os.listdir(folder_path)):
                if not nde_name.lower().endswith(".nde"):
                    continue
                fi = _find_file_by_path(os.path.join(folder_path, nde_name), snap.files)
                if fi and fi.rawcscan_available:
                    all_files.append(fi)

        if not all_files:
            return []

        scan_res_m = min(fi.scan_axis.resolution for fi in all_files)
        index_res_m = min(fi.index_axis.resolution for fi in all_files)
        scan_min_mm = min(fi.scan_axis.range_mm[0] for fi in all_files)
        scan_max_mm = max(fi.scan_axis.range_mm[1] for fi in all_files)
        index_min_mm = min(fi.index_axis.range_mm[0] for fi in all_files)
        index_max_mm = max(fi.index_axis.range_mm[1] for fi in all_files)
        scan_res_mm = scan_res_m * 1000
        index_res_mm = index_res_m * 1000
        n_scan = max(1, int(round((scan_max_mm - scan_min_mm) / scan_res_mm)) + 1)
        n_index = max(1, int(round((index_max_mm - index_min_mm) / index_res_mm)) + 1)

        unified_thickness = np.full((n_index, n_scan), np.nan, dtype=np.float32)
        total_files = len(all_files)
        tiles: list[tuple[str, bytes]] = []

        for file_idx, fi in enumerate(all_files):
            thickness, _amplitude = compute_thickness_full_res(
                fi,
                ref_start, ref_end, ref_thresh,
                meas_start, meas_end, meas_thresh,
            )

            file_scan_start_mm = fi.scan_axis.offset * 1000
            file_index_start_mm = fi.index_axis.offset * 1000

            for si in range(thickness.shape[0]):
                scan_mm = file_scan_start_mm + si * fi.scan_axis.resolution * 1000
                gi_x = int(round((scan_mm - scan_min_mm) / scan_res_mm))
                if gi_x < 0 or gi_x >= n_scan:
                    continue
                for ii in range(thickness.shape[1]):
                    idx_mm = file_index_start_mm + ii * fi.index_axis.resolution * 1000
                    gi_y = int(round((idx_mm - index_min_mm) / index_res_mm))
                    if gi_y < 0 or gi_y >= n_index:
                        continue
                    val = thickness[si, ii]
                    if not np.isnan(val):
                        unified_thickness[gi_y, gi_x] = val

            progress = (file_idx + 1) / total_files
            tile_header = json.dumps({
                "type": "cscan-tile",
                "fileIndex": file_idx,
                "totalFiles": total_files,
                "progress": round(progress, 3),
                "filename": fi.filename,
            })
            tile_matrix = unified_thickness.astype("<f4").tobytes()
            tiles.append((tile_header, tile_matrix))

        compute_ms = (time.perf_counter() - t0) * 1000
        complete_header = json.dumps({
            "type": "cscan-complete",
            "computeMs": round(compute_ms, 1),
            "width": n_scan,
            "height": n_index,
        })
        complete_matrix = unified_thickness.astype("<f4").tobytes()
        tiles.append((complete_header, complete_matrix))

        return tiles

    # --- WebSocket cursor stream ---

    def _render_cursor_data(msg: dict, seq: int, snap: CacheSnapshot, queue_depth: int = 0):
        """Render A/B/D-scan data for a cursor position. Runs in thread pool."""
        import time
        import numpy as np
        import h5py
        t0 = time.perf_counter()

        folders = msg.get("folders", [])
        scan_mm = msg["scanMm"]
        index_mm = msg["indexMm"]
        bscan_w = msg.get("bscanWidth", 400)
        bscan_h = msg.get("bscanHeight", 150)
        dscan_w = msg.get("dscanWidth", 400)
        dscan_h = msg.get("dscanHeight", 150)

        fi = _find_nearest_file(folders, scan_mm, index_mm, snap)
        if fi is None:
            return None

        sa, ia, ta = fi.scan_axis, fi.index_axis, fi.time_axis
        scan_i = max(0, min(sa.quantity - 1, round((scan_mm / 1000.0 - sa.offset) / sa.resolution))) if sa.resolution else 0
        idx_i = max(0, min(ia.quantity - 1, round((index_mm / 1000.0 - ia.offset) / ia.resolution))) if ia.resolution else 0

        with h5py.File(fi.path, "r") as f:
            amp_ds = f["Public/Groups/0/Datasets/0-AScanAmplitude"]
            waveform = amp_ds[scan_i, idx_i, :]

            sync_gate = None
            for g in fi.gates:
                if g.sync_mode == "Pulse":
                    sync_gate = g
                    break

            if sync_gate is not None:
                all_beams = amp_ds[scan_i, :, :]
                n_beams, n_samples = all_beams.shape
                rectified_all = np.abs(all_beams.astype(np.float32))

                t_start_us = ta.offset * 1e6
                t_res_us = ta.resolution * 1e6
                g_start_us = sync_gate.start * 1e6
                g_end_us = (sync_gate.start + sync_gate.length) * 1e6
                i0 = max(0, int((g_start_us - t_start_us) / t_res_us))
                i1 = min(n_samples, int((g_end_us - t_start_us) / t_res_us))

                if i1 > i0:
                    thresh = 20.0 / 200.0 * 32767.0
                    crossing_indices = np.full(n_beams, -1, dtype=np.int32)
                    for b in range(n_beams):
                        for s in range(i0, i1):
                            if rectified_all[b, s] >= thresh:
                                crossing_indices[b] = s
                                break

                    valid = crossing_indices[crossing_indices >= 0]
                    if len(valid) >= n_beams * 0.3:
                        ref_index = int(np.median(valid))
                        beam_crossing = crossing_indices[idx_i]
                        if beam_crossing >= 0:
                            shift = beam_crossing - ref_index
                            if shift != 0:
                                waveform = np.roll(waveform, -shift)

        waveform_pct = waveform.astype(np.float32) / 32767.0 * 200.0
        waveform_bytes = waveform_pct.tobytes()

        time_min_us = ta.offset * 1e6
        time_max_us = (ta.offset + (ta.quantity - 1) * ta.resolution) * 1e6

        rectified = np.abs(waveform.astype(np.float32))
        time_axis = np.arange(len(rectified)) * (ta.resolution * 1e6) + time_min_us

        gate_crossings: dict[int, float] = {}
        VISUAL_FALLBACK_THRESH = 20.0 / 200.0 * 32767.0

        for g in fi.gates:
            if g.sync_mode == "Pulse":
                g_start_us = g.start * 1e6
                g_end_us = (g.start + g.length) * 1e6
                thresh = g.threshold / 200.0 * 32767.0
                i0 = max(0, int(np.searchsorted(time_axis, g_start_us)))
                i1 = min(len(rectified), int(np.searchsorted(time_axis, g_end_us)))

                crossed = False
                for i in range(i0, i1):
                    if rectified[i] >= thresh:
                        gate_crossings[g.id] = float(time_axis[i])
                        crossed = True
                        break

                if not crossed:
                    for i in range(i0, i1):
                        if rectified[i] >= VISUAL_FALLBACK_THRESH:
                            gate_crossings[g.id] = float(time_axis[i])
                            break

        gates = []
        for g in fi.gates:
            if g.sync_mode == "GateRelative" and g.sync_gate_id is not None:
                sync_crossing = gate_crossings.get(g.sync_gate_id)
                if sync_crossing is not None:
                    abs_start_us = sync_crossing + g.start * 1e6
                    abs_end_us = abs_start_us + g.length * 1e6
                    gates.append({
                        "id": g.id,
                        "name": g.name,
                        "startUs": round(abs_start_us, 3),
                        "endUs": round(abs_end_us, 3),
                        "thresholdPct": g.threshold,
                    })
                else:
                    sync_gate = next((sg for sg in fi.gates if sg.id == g.sync_gate_id), None)
                    if sync_gate is not None:
                        nominal_us = (sync_gate.start + sync_gate.length / 2) * 1e6
                        abs_start_us = nominal_us + g.start * 1e6
                        abs_end_us = abs_start_us + g.length * 1e6
                    else:
                        abs_start_us = g.start * 1e6
                        abs_end_us = (g.start + g.length) * 1e6
                    gates.append({
                        "id": g.id,
                        "name": g.name,
                        "startUs": round(abs_start_us, 3),
                        "endUs": round(abs_end_us, 3),
                        "thresholdPct": g.threshold,
                    })
            else:
                gates.append({
                    "id": g.id,
                    "name": g.name,
                    "startUs": round(g.start * 1e6, 3),
                    "endUs": round((g.start + g.length) * 1e6, 3),
                    "thresholdPct": g.threshold,
                })

        bscan_png, _ = render_bscan_pillow(fi, "index", scan_mm, index_mm, bscan_w, bscan_h)
        dscan_png, _ = render_bscan_pillow(fi, "axial", scan_mm, index_mm, dscan_w, dscan_h)

        render_ms = (time.perf_counter() - t0) * 1000

        delay_us = None
        sync_gate_obj = next((g for g in fi.gates if g.sync_mode == "Pulse"), None)
        if sync_gate_obj is not None:
            delay_us = gate_crossings.get(sync_gate_obj.id)

        header = json.dumps({
            "type": "cursor-data",
            "seq": seq,
            "binaryFrames": 3,
            "ascan": {
                "samples": len(waveform_pct),
                "timeMinUs": round(time_min_us, 3),
                "timeMaxUs": round(time_max_us, 3),
                "amplitudeScale": 200.0,
                "delayUs": round(delay_us, 3) if delay_us is not None else None,
            },
            "gates": gates,
            "renderMs": round(render_ms, 1),
            "processingMs": round(render_ms, 1),
            "queueDepth": queue_depth,
        })

        return header, waveform_bytes, bscan_png, dscan_png

    @router.websocket("/ws/cursor")
    async def cursor_stream(ws: WebSocket):
        await ws.accept()

        # Auth: accept optional auth message as first frame within 2s
        try:
            first_msg = await asyncio.wait_for(ws.receive_text(), timeout=2.0)
            parsed_first = json.loads(first_msg)
            if parsed_first.get("type") == "auth":
                token = parsed_first.get("token", "")
                if token and not validate_token(token):
                    await ws.close(code=4001, reason="Invalid token")
                    return
        except (asyncio.TimeoutError, json.JSONDecodeError):
            pass  # No auth message — backward compat, proceed without auth

        cursor_queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        gate_queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        seq_counter = [0]

        async def reader():
            try:
                async for raw in ws.iter_text():
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    msg_type = msg.get("type")
                    if msg_type == "auth":
                        continue  # Already handled above, ignore subsequent auth messages
                    if msg_type == "cursor":
                        while not cursor_queue.empty():
                            try:
                                cursor_queue.get_nowait()
                            except asyncio.QueueEmpty:
                                break
                        await cursor_queue.put(msg)
                    elif msg_type == "gate-adjust":
                        while not gate_queue.empty():
                            try:
                                gate_queue.get_nowait()
                            except asyncio.QueueEmpty:
                                break
                        await gate_queue.put(msg)
            except WebSocketDisconnect:
                pass

        async def cursor_processor():
            while True:
                msg = await cursor_queue.get()
                seq_counter[0] += 1
                seq = seq_counter[0]
                snap = cache.get_snapshot()
                q_depth = cursor_queue.qsize()
                try:
                    result = await asyncio.to_thread(
                        _render_cursor_data, msg, seq, snap, q_depth
                    )
                except Exception as e:
                    logger.warning("cursor render error: %s", e)
                    continue
                if result is None:
                    continue
                header_json, waveform_bytes, bscan_png, dscan_png = result
                try:
                    await ws.send_text(header_json)
                    await ws.send_bytes(waveform_bytes)
                    await ws.send_bytes(bscan_png)
                    await ws.send_bytes(dscan_png)
                except Exception:
                    break

        async def gate_processor():
            """Handle Tier 2 gate-adjust requests — full-res thickness from HDF5."""
            while True:
                msg = await gate_queue.get()
                if msg.get("tier") != 2:
                    continue

                snap = cache.get_snapshot()
                if not snap.directory:
                    continue

                try:
                    tiles = await asyncio.to_thread(_compute_tier2, msg, snap)
                except Exception as e:
                    logger.warning("tier2 compute error: %s", e)
                    try:
                        await ws.send_text(json.dumps({
                            "type": "cscan-error",
                            "error": str(e),
                        }))
                    except Exception:
                        break
                    continue

                for header_json, matrix_bytes in tiles:
                    try:
                        await ws.send_text(header_json)
                        await ws.send_bytes(matrix_bytes)
                    except Exception:
                        return

        reader_task = asyncio.create_task(reader())
        cursor_task = asyncio.create_task(cursor_processor())
        gate_task = asyncio.create_task(gate_processor())
        try:
            await reader_task
        finally:
            cursor_task.cancel()
            gate_task.cancel()
            for task in (cursor_task, gate_task):
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    @router.post("/browse-directory")
    def browse_directory():
        """Open a native folder picker dialog and set the directory."""
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(title="Select NDE / Eddify Folder")
        root.destroy()

        if not folder or not os.path.isdir(folder):
            return {"path": None, "fileCount": 0}

        files = index_folder(folder)
        snap = cache.set_directory(folder, files)

        return {"path": folder, "fileCount": len(snap.files)}

    @router.post("/convert-eddify")
    def convert_eddify(req: ConvertEddifyRequest):
        """Convert one or more eddify .capture_acq directories to .nde files in a named output folder."""
        from engine.eddify_converter import convert_capture_acq

        snap = cache.get_snapshot()
        base_dir = snap.directory
        if not base_dir:
            raise HTTPException(status_code=400, detail="No directory set")

        output_dir = os.path.join(base_dir, req.output_folder)
        os.makedirs(output_dir, exist_ok=True)

        results = []
        for cap_name in req.capture_dirs:
            capture_path = os.path.join(base_dir, cap_name)
            if not os.path.isdir(capture_path):
                results.append({"name": cap_name, "status": "error", "detail": "Directory not found"})
                continue

            nde_name = cap_name
            if nde_name.lower().endswith(".capture_acq"):
                nde_name = nde_name[:-len(".capture_acq")]
            nde_name = nde_name.strip() + ".nde"
            output_path = os.path.join(output_dir, nde_name)

            try:
                convert_capture_acq(capture_path, output_path)
                size_mb = os.path.getsize(output_path) / (1024 * 1024)
                results.append({"name": cap_name, "status": "ok", "output": nde_name, "sizeMb": round(size_mb, 1)})
            except Exception as e:
                logger.exception("Failed to convert %s", cap_name)
                results.append({"name": cap_name, "status": "error", "detail": str(e)})

        # Re-index to pick up new files
        cache.refresh(index_folder)

        return {
            "output_folder": req.output_folder,
            "results": results,
            "files_converted": sum(1 for r in results if r["status"] == "ok"),
            "files_failed": sum(1 for r in results if r["status"] == "error"),
        }

    @router.get("/list-directory")
    def list_directory(path: str = ""):
        """List directories at a path for web-native directory browsing."""
        import string as _string

        if not path:
            if os.name == "nt":
                drives = []
                for letter in _string.ascii_uppercase:
                    dp = f"{letter}:\\"
                    if os.path.exists(dp):
                        drives.append({"name": dp, "isDir": True})
                return {"entries": drives, "path": ""}
            path = "/"

        if not os.path.isdir(path):
            raise HTTPException(status_code=404, detail=f"Directory not found: {path}")

        entries = []
        try:
            for entry in os.scandir(path):
                try:
                    if entry.is_dir(follow_symlinks=False):
                        entries.append({"name": entry.name, "isDir": True})
                except PermissionError:
                    continue
        except PermissionError:
            raise HTTPException(status_code=403, detail=f"Permission denied: {path}")

        entries.sort(key=lambda e: e["name"].lower())
        return {"entries": entries, "path": path}

    return router


def _serialize_file(fi) -> dict:
    """Serialize FileIndex to JSON for file list."""
    return {
        "filename": fi.filename,
        "sizeMb": fi.size_mb,
        "indexRangeMm": list(fi.index_axis.range_mm),
        "scanRangeMm": list(fi.scan_axis.range_mm),
        "gates": [{"id": g.id, "name": g.name, "detection": g.detection} for g in fi.gates],
        "beamCount": fi.beam_count,
        "validPointCount": fi.valid_point_count,
        "thicknessProcess": {
            "minMm": fi.thickness_process.min_mm,
            "maxMm": fi.thickness_process.max_mm,
            "gateIds": fi.thickness_process.gate_ids,
            "gateDetection": fi.thickness_process.gate_detection,
        } if fi.thickness_process else None,
        "creationDate": fi.creation_date,
        "modificationDate": fi.modification_date,
        "probe": {"model": fi.probe.model, "serie": fi.probe.serie, "frequencyMhz": fi.probe.frequency_mhz} if fi.probe else None,
        "wedge": {"model": fi.wedge.model, "serie": fi.wedge.serie} if fi.wedge else None,
        "equipment": {"model": fi.equipment.model, "serialNumber": fi.equipment.serial_number, "platform": fi.equipment.platform} if fi.equipment else None,
        "specimen": {
            "materialName": fi.specimen.material_name,
            "nominalThicknessMm": fi.specimen.nominal_thickness_mm,
            "longitudinalVelocity": fi.specimen.longitudinal_velocity,
        } if fi.specimen else None,
        "scanner": {"name": fi.scanner.name, "encoderMode": fi.scanner.encoder_mode} if fi.scanner else None,
        "velocity": fi.velocity,
    }


def _serialize_file_full(fi) -> dict:
    """Serialize FileIndex to full JSON for file info endpoint."""
    base = _serialize_file(fi)
    base.update({
        "velocity": fi.velocity,
        "waveMode": fi.wave_mode,
        "scanAxis": {"offset": fi.scan_axis.offset, "quantity": fi.scan_axis.quantity, "resolution": fi.scan_axis.resolution},
        "indexAxis": {"offset": fi.index_axis.offset, "quantity": fi.index_axis.quantity, "resolution": fi.index_axis.resolution},
        "timeAxis": {"offset": fi.time_axis.offset, "quantity": fi.time_axis.quantity, "resolution": fi.time_axis.resolution},
        "gates": [
            {
                "id": g.id, "name": g.name, "syncMode": g.sync_mode,
                "syncGateId": g.sync_gate_id, "start": g.start, "length": g.length,
                "threshold": g.threshold, "detection": g.detection,
            }
            for g in fi.gates
        ],
        "rawcscanAvailable": fi.rawcscan_available,
        "rawcscanChunkValid": fi.rawcscan_chunk_valid,
        "nGatesInRawcscan": fi.n_gates_in_rawcscan,
    })
    return base


def _serialize_calibration(cal) -> dict:
    """Serialize CalibrationResult to JSON for calibration files endpoint."""
    return {
        "filename": cal.filename,
        "setupFile": cal.setup_file,
        "calDate": cal.cal_date,
        "scanStartMm": cal.scan_start_mm,
        "scanEndMm": cal.scan_end_mm,
        "velocity": cal.velocity,
        "refAWt": cal.ref_a_wt,
        "measAWt": cal.meas_a_wt,
        "equipment": {
            "model": cal.equipment_model,
            "serial": cal.equipment_serial,
        } if cal.equipment_model else None,
        "probe": {
            "model": cal.probe_model,
            "frequencyMhz": cal.probe_frequency_mhz,
        } if cal.probe_model else None,
        "wedge": {"model": cal.wedge_model} if cal.wedge_model else None,
        "material": cal.material,
        "beamCount": cal.beam_count,
        "steps": [
            {
                "nominalMm": s.nominal_mm,
                "measuredMm": s.measured_mm,
                "stdMm": s.std_mm,
                "readingCount": s.reading_count,
                "isReference": s.is_reference,
            }
            for s in cal.steps
        ],
    }


def _to_data_uri(png_bytes: bytes) -> str:
    """Convert PNG bytes to a base64 data URI."""
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _scan_subfolders(base_dir: str, query: Optional[str] = None) -> list[dict]:
    """Scan base directory for subfolders containing .nde files and .capture_acq directories."""
    results = []
    try:
        entries = sorted(os.listdir(base_dir))
    except OSError:
        return []

    for name in entries:
        full_path = os.path.join(base_dir, name)
        if not os.path.isdir(full_path):
            continue

        if query and query.lower() not in name.lower():
            continue

        if name.lower().endswith(".capture_acq"):
            if os.path.isfile(os.path.join(full_path, "root.xml")):
                results.append({"name": name, "fileCount": 0, "type": "eddify"})
            continue

        nde_count = sum(
            1 for f in os.listdir(full_path) if f.lower().endswith(".nde")
        )
        if nde_count > 0:
            results.append({"name": name, "fileCount": nde_count, "type": "nde"})

    return results


def _composite_to_binary(result) -> Response:
    """Encode a CompositeResult as a gzip'd binary response.

    Body = gzip(concat(float32_matrix, float32_amplitude, float32_xAxis, float32_yAxis))
    Metadata in response headers.
    """
    body_parts = [
        result.matrix.astype("<f4").tobytes(),
        result.amplitude.astype("<f4").tobytes(),
        result.envelope.tobytes(),
        result.x_axis.astype("<f4").tobytes(),
        result.y_axis.astype("<f4").tobytes(),
    ]
    raw = b"".join(body_parts)
    content_hash = "sha256:" + hashlib.sha256(raw).hexdigest()
    compressed = gzip.compress(raw, compresslevel=6)

    return Response(
        content=compressed,
        media_type="application/octet-stream",
        headers={
            "Content-Encoding": "gzip",
            "X-Content-Hash": content_hash,
            "X-Matrix-Width": str(result.width),
            "X-Matrix-Height": str(result.height),
            "X-Matrix-Dtype": "float32",
            "X-Has-Amplitude": "true",
            "X-Has-Envelope": "true",
            "X-Envelope-Samples": str(result.envelope.shape[-1]),
            "X-Time-Start-Us": str(round(result.time_start_us, 3)),
            "X-Time-End-Us": str(round(result.time_end_us, 3)),
            "X-Velocity": str(round(result.velocity, 1)),
            "X-Stats": json.dumps(result.stats),
            "X-Source-Files": json.dumps(result.source_files),
            "X-Warnings": json.dumps(result.warnings),
        },
    )


def _composite_to_json(result) -> dict:
    """Encode a CompositeResult as JSON (for debugging with curl)."""
    import math
    data_list = []
    flat = result.matrix.flatten()
    for v in flat:
        data_list.append(None if math.isnan(v) else round(float(v), 3))

    return {
        "data": data_list,
        "xAxis": [round(float(v), 3) for v in result.x_axis],
        "yAxis": [round(float(v), 3) for v in result.y_axis],
        "width": result.width,
        "height": result.height,
        "stats": result.stats,
        "sourceFiles": result.source_files,
        "warnings": result.warnings,
    }
