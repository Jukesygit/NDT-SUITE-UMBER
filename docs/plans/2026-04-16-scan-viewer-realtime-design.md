# Scan Viewer Real-Time Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the scan viewer into a persistent, responsive UI with WebSocket-based live cursor tracking, browser-rendered A-scan with draggable gate overlays, client-side thickness filtering, and inline composite regeneration — no screen transitions.

**Architecture:** HTTP stays for discovery, folder listing, and composite generation trigger. A new WebSocket endpoint on the companion streams real-time cursor data (A-scan raw waveform + B/D-scan PNGs) as separate WebSocket frames. The A-scan is rendered client-side on canvas for instant gate interaction. Thickness min/max filtering is applied to the existing in-memory matrix without companion round-trips. Gate mode/recovery changes trigger inline regeneration with a loading overlay on the existing C-scan.

**Tech Stack:** FastAPI WebSocket (Starlette), React canvas rendering, existing heatmap worker, companion Pillow renderer for B/D-scans.

---

## Phase 1: WebSocket Infrastructure

### Task 1: Companion WebSocket Endpoint — Cursor Data Stream

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py` (inside `create_router()`)
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\server.py` (expose WS in CORS)

**What it does:**

Add a WebSocket endpoint at `/ws/cursor` inside `create_router()` (so it has access to `file_cache` and `_find_nearest_file`). The browser sends cursor position messages; the companion responds with multiple WebSocket frames containing metadata, A-scan waveform, B-scan PNG, and D-scan PNG.

**Protocol:**

Browser → Companion (JSON text frame):
```json
{
  "type": "cursor",
  "scanMm": 743.9,
  "indexMm": 109.6,
  "folders": ["Composite_12_files"],
  "gateSettings": { ... },
  "bscanWidth": 400,
  "bscanHeight": 150,
  "dscanWidth": 400,
  "dscanHeight": 150
}
```

Cursor messages are self-contained (folders + gateSettings included each time). This is stateless — no server-side config state to sync, no race conditions between config and cursor updates. The ~200 bytes of extra JSON per message is negligible on localhost.

Companion → Browser (sequence of frames per cursor response):
1. **Text frame** — JSON metadata:
```json
{
  "type": "cursor-data",
  "seq": 42,
  "binaryFrames": 3,
  "ascan": { "samples": 1024, "timeMinUs": 0.0, "timeMaxUs": 12.5, "amplitudeScale": 200.0 },
  "gates": [
    { "id": 0, "name": "Gate I", "startUs": 2.1, "endUs": 4.5, "thresholdPct": 40.0 },
    { "id": 1, "name": "Gate A", "startUs": 5.0, "endUs": 8.0, "thresholdPct": 50.0 }
  ],
  "renderMs": 15.2
}
```
2. **Binary frame** — A-scan waveform as Float32Array (amplitude %, 0-200 scale)
3. **Binary frame** — B-scan PNG bytes
4. **Binary frame** — D-scan PNG bytes

The `seq` ID + `binaryFrames` count lets the client group frames. WebSocket over TCP guarantees ordering, so frames always arrive in sequence.

**Server-side coalescing — reader/processor pattern:**

The companion uses a dedicated reader task that always captures the latest cursor message, and a processor task that renders and sends:

```python
# Inside create_router(), after existing endpoints:
from fastapi import WebSocket, WebSocketDisconnect
import asyncio, json

@router.websocket("/ws/cursor")
async def cursor_stream(ws: WebSocket):
    await ws.accept()
    latest: asyncio.Queue = asyncio.Queue(maxsize=1)
    seq = 0

    async def reader():
        try:
            async for raw in ws.iter_text():
                msg = json.loads(raw)
                if msg.get("type") != "cursor":
                    continue
                # Replace queued message with newest
                while not latest.empty():
                    try:
                        latest.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                await latest.put(msg)
        except WebSocketDisconnect:
            pass

    async def processor():
        nonlocal seq
        while True:
            msg = await latest.get()
            seq += 1
            # HDF5 reads are blocking — run in thread pool
            result = await asyncio.to_thread(
                _render_cursor_data, msg, seq
            )
            if result is None:
                continue
            header_json, waveform_bytes, bscan_png, dscan_png = result
            await ws.send_text(header_json)
            await ws.send_bytes(waveform_bytes)
            await ws.send_bytes(bscan_png)
            await ws.send_bytes(dscan_png)

    reader_task = asyncio.create_task(reader())
    processor_task = asyncio.create_task(processor())
    try:
        # Wait for reader to finish (client disconnect)
        await reader_task
    finally:
        processor_task.cancel()

def _render_cursor_data(msg: dict, seq: int):
    """Render A-scan + B-scan + D-scan for a cursor position.

    Runs in a thread pool (blocking HDF5 I/O).
    Returns (header_json, waveform_bytes, bscan_png, dscan_png) or None.
    """
    import time, struct, numpy as np
    t0 = time.perf_counter()

    folders = msg.get("folders", [])
    scan_mm = msg["scanMm"]
    index_mm = msg["indexMm"]
    gate_settings = msg.get("gateSettings", {})
    bscan_w = msg.get("bscanWidth", 400)
    bscan_h = msg.get("bscanHeight", 150)
    dscan_w = msg.get("dscanWidth", 400)
    dscan_h = msg.get("dscanHeight", 150)

    fi = _find_nearest_file(folders, scan_mm, index_mm)
    if fi is None:
        return None

    # A-scan: raw waveform
    import h5py
    sa, ia = fi.scan_axis, fi.index_axis
    scan_i = _mm_to_index(scan_mm, sa)
    idx_i = _mm_to_index(index_mm, ia)

    with h5py.File(fi.path, "r") as f:
        waveform = f["Public/Groups/0/Datasets/0-AScanAmplitude"][scan_i, idx_i, :]

    waveform_pct = waveform.astype(np.float32) / 32767.0 * 200.0
    waveform_bytes = waveform_pct.tobytes()

    # Time axis
    ta = fi.time_axis
    time_min_us = ta.offset * 1e6
    time_max_us = (ta.offset + (ta.quantity - 1) * ta.resolution) * 1e6

    # Gate info
    gates = [
        {
            "id": g.id,
            "name": g.name,
            "startUs": g.start * 1e6,
            "endUs": (g.start + g.length) * 1e6,
            "thresholdPct": g.threshold,
        }
        for g in fi.gates
    ]

    # B-scan and D-scan as PNG
    bscan_png, _ = render_bscan_pillow(fi, "index", scan_mm, index_mm, bscan_w, bscan_h)
    dscan_png, _ = render_bscan_pillow(fi, "axial", scan_mm, index_mm, dscan_w, dscan_h)

    render_ms = (time.perf_counter() - t0) * 1000

    header = json.dumps({
        "type": "cursor-data",
        "seq": seq,
        "binaryFrames": 3,
        "ascan": {
            "samples": len(waveform_pct),
            "timeMinUs": round(time_min_us, 3),
            "timeMaxUs": round(time_max_us, 3),
            "amplitudeScale": 200.0,
        },
        "gates": gates,
        "renderMs": round(render_ms, 1),
    })

    return header, waveform_bytes, bscan_png, dscan_png
```

Note: `_mm_to_index` helper is already defined in `pillow_renderer.py`. Import it or inline it. `_find_nearest_file` and `render_bscan_pillow` are already in scope inside `create_router()`.

**Step 1:** Add the `_render_cursor_data` helper function.

**Step 2:** Add the WebSocket endpoint with reader/processor pattern.

**Step 3:** Test manually with a simple WebSocket client.

**Step 4:** Commit.

---

### Task 2: Webapp WebSocket Hook — useCompanionWebSocket

**Files:**
- Create: `src/hooks/useCompanionWebSocket.ts`

**What it does:**

A React hook that manages a single WebSocket connection to the companion. Provides `sendCursor(...)` function and exposes the latest parsed response (A-scan data, B-scan blob URL, D-scan blob URL, gate info). On disconnect, updates the existing companion connection status so the header indicator reflects it immediately (not waiting for the 10s HTTP poll).

**Interface:**
```typescript
interface CursorResponse {
  ascan: {
    waveform: Float32Array;  // amplitude % (0-200)
    timeMinUs: number;
    timeMaxUs: number;
    amplitudeScale: number;
  };
  bscanBlobUrl: string | null;
  dscanBlobUrl: string | null;
  gates: GateOverlay[];
  renderMs: number;
}

interface GateOverlay {
  id: number;
  name: string;
  startUs: number;
  endUs: number;
  thresholdPct: number;
}

interface CursorParams {
  scanMm: number;
  indexMm: number;
  folders: string[];
  gateSettings: GateSettings;
  bscanWidth: number;
  bscanHeight: number;
  dscanWidth: number;
  dscanHeight: number;
}

interface UseCompanionWebSocketResult {
  connected: boolean;
  cursorData: CursorResponse | null;
  sendCursor: (params: CursorParams) => void;
}
```

**Implementation notes:**
- Opens WebSocket on mount when `port` is provided, closes on unmount or port change.
- `sendCursor` is throttled internally (~50ms) — only the latest call within the window is sent.
- Multi-frame parsing: on text frame, parse JSON metadata and note expected `binaryFrames` count. Collect subsequent binary frames. When all frames received, parse: frame 1 → Float32Array waveform, frame 2 → B-scan blob URL, frame 3 → D-scan blob URL.
- Revokes previous blob URLs on each new response.
- Reconnects automatically on disconnect (exponential backoff, max 5s).
- On disconnect, invalidate the React Query `['companion-status']` cache so the header connection indicator updates immediately.

**Step 1:** Create the hook with connection lifecycle (open/close/reconnect).

**Step 2:** Add `sendCursor` with throttling.

**Step 3:** Add multi-frame response parser.

**Step 4:** Commit.

---

## Phase 2: Live Cursor Tracking

### Task 3: CscanHeatmap — Mousemove Cursor

**Files:**
- Modify: `src/components/projects/scan-viewer/CscanHeatmap.tsx`

**What it does:**

Add mousemove cursor tracking. The crosshair and data panels follow the mouse in real time as it hovers over the C-scan. Click is kept for touch/accessibility. Cursor only updates when hovering (no button pressed) and stops tracking on mouse leave.

**Changes:**
- Add `onMouseMove` handler on the container div. When `e.buttons === 0` (no drag in progress), compute data coordinates and call `onCursorMove` with ~50ms throttle.
- Add `onMouseLeave` — no action needed (cursor stays at last position, panels keep showing that data).
- Keep the existing `onClick` handler as fallback for touch devices.
- The existing crosshair overlay already renders at `cursorScanMm/cursorIndexMm`, so it follows automatically.

**Key detail:** The existing `useZoomPan.onMouseMove` fires on every mousemove but early-returns when `draggingRef.current === false`, so there's no conflict. The cursor update handler checks `e.buttons === 0` — during a pan drag, buttons > 0 so cursor doesn't update.

**Step 1:** Add throttled mousemove handler that checks `e.buttons === 0` and calls onCursorMove.

**Step 2:** Commit.

---

### Task 4: Wire WebSocket to Page — Replace HTTP Image Fetching

**Files:**
- Modify: `src/pages/ScanViewerLandingPage.tsx`
- Modify: `src/components/projects/scan-viewer/BscanStrip.tsx`
- Modify: `src/components/projects/scan-viewer/AscanWaveform.tsx`

**What it does:**

Replace the three `useCompanionImage` HTTP hooks with a single `useCompanionWebSocket` connection. The page passes cursor data down to B-scan/A-scan components as props instead of each component fetching independently.

**ScanViewerLandingPage changes:**
- Add `useCompanionWebSocket(port)` hook.
- On `handleCursorMove`, call `ws.sendCursor(...)` with current folders, gate settings, and panel sizes.
- Panel sizes: the parent knows the layout (three `flex: 1` children at `height: 150`). Compute `panelWidth = Math.floor(containerWidth / 3)` from the main content area width. No need for child components to report sizes back up.
- Pass `ws.cursorData.bscanBlobUrl`, `ws.cursorData.dscanBlobUrl`, `ws.cursorData.ascan` as props to child components.

**BscanStrip changes:**
- Accept `blobUrl: string | null` as prop instead of using `useCompanionImage` internally.
- Remove internal fetch logic and ResizeObserver (parent controls sizes now).
- Becomes a pure display component: image + label + loading state.

**AscanWaveform changes:**
- Will be replaced by AscanCanvas in Phase 3. For now, accept `blobUrl` as prop (same simplification as BscanStrip).

**Step 1:** Update ScanViewerLandingPage to use WebSocket hook and pass data as props.

**Step 2:** Simplify BscanStrip to accept `blobUrl` prop, remove internal fetching.

**Step 3:** Simplify AscanWaveform to accept `blobUrl` prop temporarily.

**Step 4:** Test live cursor tracking end-to-end.

**Step 5:** Commit.

---

## Phase 3: Browser-Rendered A-Scan with Gate Overlays

### Task 5: AscanCanvas Component — Waveform Rendering

**Files:**
- Create: `src/components/projects/scan-viewer/AscanCanvas.tsx`

**What it does:**

Replaces the image-based AscanWaveform with a canvas-drawn waveform that renders raw Float32Array data directly. This is the foundation for gate overlays.

**Props:**
```typescript
interface AscanCanvasProps {
  waveform: Float32Array | null;  // amplitude % (0-200)
  timeMinUs: number;
  timeMaxUs: number;
  gates: GateOverlay[];
  onGateChange?: (gateId: number, updates: Partial<GateOverlay>) => void;
}
```

**Rendering (canvas 2D):**
1. Measure parent via ResizeObserver (same pattern as CscanHeatmap).
2. Clear to dark background (`rgb(20, 20, 30)`).
3. Draw grid lines at 25%, 50%, 100%, 150%, 200% amplitude.
4. Draw time axis ticks.
5. Plot waveform as a polyline (blue `#50a0ff`, 1px) — map sample index to x-pixel via time range, amplitude to y-pixel.
6. Draw gate overlays as semi-transparent colored rectangles (colors: `#ff4444`, `#44aa44`, `#4444ff`, `#ff8800`, `#8800ff` — matching companion's `GATE_COLORS`).
7. Draw threshold lines within each gate (dashed horizontal line at threshold amplitude).
8. Draw gate labels (gate name, top-left of each gate region).

**Step 1:** Create AscanCanvas with waveform rendering (no gates yet).

**Step 2:** Add gate overlay rendering (colored rectangles + threshold lines).

**Step 3:** Commit.

---

### Task 6: Draggable Gate Interaction

**Files:**
- Modify: `src/components/projects/scan-viewer/AscanCanvas.tsx`

**What it does:**

Makes gate boundaries and threshold lines draggable. Dragging a gate edge adjusts its start/end time; dragging the threshold line adjusts the amplitude threshold.

**Interaction model:**
- Hover over gate edge → cursor changes to `ew-resize`.
- Hover over threshold line → cursor changes to `ns-resize`.
- Mouse down + drag → update gate property in real-time (local state, redraws canvas immediately).
- Mouse up → fire `onGateChange(gateId, { startUs, endUs, thresholdPct })`.

**Hit testing:** For each gate, define hit zones:
- Left edge: 4px-wide zone at gate start time.
- Right edge: 4px-wide zone at gate end time.
- Threshold: 4px-tall zone at threshold amplitude, within gate time range.

**Step 1:** Add hit-test logic for gate edges and threshold lines.

**Step 2:** Add drag handlers (mousedown/mousemove/mouseup) with local state updates.

**Step 3:** Fire `onGateChange` on drag end.

**Step 4:** Commit.

---

### Task 7: Wire AscanCanvas into Page

**Files:**
- Modify: `src/pages/ScanViewerLandingPage.tsx`
- Keep: `src/components/projects/scan-viewer/AscanWaveform.tsx` (used by project viewer)

**What it does:**

Replace the A-scan panel in the landing page with AscanCanvas, passing waveform data from WebSocket.

**Step 1:** Replace AscanWaveform usage with AscanCanvas in landing page.

**Step 2:** Pass `ws.cursorData.ascan.waveform`, `ws.cursorData.gates`, time range, and `onGateChange` handler.

**Step 3:** Commit.

---

## Phase 4: Client-Side Thickness Filtering

### Task 8: Client-Side Min/Max Filter on C-Scan Matrix

**Files:**
- Modify: `src/components/projects/scan-viewer/CscanHeatmap.tsx`
- Modify: `src/pages/ScanViewerLandingPage.tsx`

**What it does:**

When the user adjusts thickness min/max in the sidebar, the C-scan updates instantly without a companion round-trip. The existing Float32Array matrix is filtered (values outside range → NaN) and re-rendered by the heatmap worker.

**CscanHeatmap changes:**
- Accept new props: `thicknessMin: number | null`, `thicknessMax: number | null`.
- Before sending matrix to the worker, apply the filter:
  ```typescript
  const filtered = useMemo(() => {
    if (thicknessMin === null && thicknessMax === null) return composite.matrix;
    const out = new Float32Array(composite.matrix);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (isNaN(v)) continue;
      if (thicknessMin !== null && v < thicknessMin) out[i] = NaN;
      if (thicknessMax !== null && v > thicknessMax) out[i] = NaN;
    }
    return out;
  }, [composite.matrix, thicknessMin, thicknessMax]);
  ```
- Pass `filtered` to the worker instead of `composite.matrix`.

**ScanViewerLandingPage changes:**
- Pass `gateSettings.thicknessMin` and `gateSettings.thicknessMax` to CscanHeatmap.
- Remove `thicknessMin`/`thicknessMax` from the gate settings sent to `/create-composite` (they're now client-side only).

**Stats note:** The color range (rangeMin/rangeMax) and the stats panel continue to use `stats.min`/`stats.max` from the full unfiltered data. Stats describe the dataset, not the view — the user set the filter, they know the filter bounds. This is intentional.

**Step 1:** Add thicknessMin/Max props to CscanHeatmap with client-side filtering via useMemo.

**Step 2:** Update landing page to pass the filter props.

**Step 3:** Test: change thickness min/max in sidebar → C-scan updates instantly.

**Step 4:** Commit.

---

## Phase 5: Persistent UI with Inline Regeneration

### Task 9: Inline Composite Regeneration

**Files:**
- Modify: `src/pages/ScanViewerLandingPage.tsx`

**What it does:**

When gate mode or recovery settings change (settings that require companion reprocessing), the viewer stays on screen with a loading overlay while the composite regenerates in the background. The existing C-scan remains visible and interactive during regeneration.

**Changes to ScanViewerLandingPage:**
- Split gate settings into two categories:
  - **Client-side** (instant): `thicknessMin`, `thicknessMax` → handled by Task 8.
  - **Server-side** (needs regeneration): `gateMode`, `refRecovery`, `measRecovery`, `minAmplitudeRef`, `minAmplitudeMeas`.
- When a server-side setting changes, auto-trigger `handleGenerate()` after a 500ms debounce.
- The `handleGenerate` function already uses `abortRef` to cancel in-flight HTTP requests. Add: when a new generation starts, abort the previous one. The companion's `create_composite` function accepts an `abort_flag` (threading.Event) — wire this through the HTTP handler so aborted requests actually cancel CPU-bound work on the companion, not just the HTTP response.
- During regeneration, show a semi-transparent overlay on the C-scan with a spinner/progress text.
- When the new composite arrives, swap it in seamlessly. Preserve cursor position if it falls within the new data bounds; otherwise re-center.

**Loading overlay (on CscanHeatmap container):**
```tsx
{isRegenerating && (
  <div style={{
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10, pointerEvents: 'none',
  }}>
    <span style={{ color: '#93c5fd', fontSize: '0.85rem' }}>Regenerating...</span>
  </div>
)}
```

**Companion abort wiring** (in `routes.py` `/create-composite` endpoint):
- Store the current `abort_flag` in a shared variable.
- On new request, set the previous flag before creating a new one.
- This cancels the in-progress composite generation, not just the HTTP response.

**Step 1:** Add debounced auto-regeneration when server-side gate settings change.

**Step 2:** Add loading overlay to C-scan area during regeneration.

**Step 3:** Preserve cursor position across regeneration.

**Step 4:** Wire abort flag in companion for composite cancellation.

**Step 5:** Commit.

---

### Task 10: Folder Selection Without Navigation (DEFERRED)

**Status:** Deferred until Tasks 1-9 are complete and working. The persistent UI goal is achieved by Tasks 8-9 (no navigation on setting changes). Folder selection is infrequent enough that the current screen transition is acceptable for now.

**When implemented:**
- Move folder selection into a collapsible panel in the sidebar (below gate controls).
- Wire folder changes to debounced regeneration (same pattern as Task 9).
- Remove the `setComposite(null)` navigation pattern.

---

## Implementation Order & Dependencies

```
Phase 1: WebSocket Infrastructure
  Task 1 (companion WS endpoint) ← no dependencies
  Task 2 (webapp WS hook)        ← depends on Task 1

Phase 2: Live Cursor
  Task 3 (mousemove cursor)      ← no dependencies
  Task 4 (wire WS to page)       ← depends on Tasks 1, 2, 3

Phase 3: Browser A-Scan
  Task 5 (AscanCanvas render)    ← no dependencies
  Task 6 (draggable gates)       ← depends on Task 5
  Task 7 (wire into page)        ← depends on Tasks 4, 5, 6

Phase 4: Client-Side Filtering
  Task 8 (thickness filter)      ← no dependencies (can parallel with Phase 1-3)

Phase 5: Persistent UI
  Task 9 (inline regen + abort)  ← depends on Task 8
  Task 10 (inline folders)       ← DEFERRED
```

**Parallelizable:** Tasks 1+3+5+8 can all be worked on independently.

---

## Testing Strategy

- **Task 1:** Manual WebSocket test with a Python script or `websocat`.
- **Task 2:** Unit test for multi-frame response parser (mock WebSocket with known frames).
- **Task 3:** Manual test — hover over C-scan, verify crosshair follows; leave C-scan area, verify cursor stops; pan-drag, verify cursor doesn't jump.
- **Task 4:** End-to-end — cursor moves, B/D-scan panels update live.
- **Task 5:** Visual inspection — canvas renders waveform matching companion's A-scan output.
- **Task 6:** Manual test — drag gate edges, verify visual feedback and cursor changes.
- **Task 7:** End-to-end — A-scan shows waveform + gates from WebSocket data.
- **Task 8:** Unit test — filter Float32Array, verify NaN insertion. Manual test — adjust slider, C-scan updates instantly, stats remain unchanged.
- **Task 9:** Manual test — change gate mode, verify overlay appears, new C-scan loads, old generation is cancelled.

## Notes

- The `useCompanionImage` hook and HTTP endpoints (`/bscan-axial`, `/bscan-index`, `/ascan`) are kept for backward compatibility with `ScanViewerPage` (project-integrated viewer). The landing page migrates to WebSocket.
- The companion's existing `render_bscan_pillow` is reused inside the WebSocket handler — no new rendering code needed for B/D-scans.
- Gate overlay colors match the companion's `GATE_COLORS = ["#ff4444", "#44aa44", "#4444ff", "#ff8800", "#8800ff"]`.
- Cursor messages are self-contained (include folders + gateSettings each time). This avoids server-side config state and eliminates race conditions between config updates and cursor position updates. The ~200 bytes overhead per message is negligible on localhost.
- Panel sizes are computed by the parent (it controls the layout), not reported by child components. BscanStrip becomes a pure display component.
- Stats (min/max/mean/std) always reflect the full unfiltered dataset. Thickness filtering is a visual tool — stats describe the data, not the view.
