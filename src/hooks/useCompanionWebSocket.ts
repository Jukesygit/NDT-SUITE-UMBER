import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GateSettings } from '../types/companion';
import type { GateOverlay } from '../components/projects/scan-viewer/AscanCanvas';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CursorParams {
  scanMm: number;
  indexMm: number;
  folders: string[];
  gateSettings: GateSettings;
  bscanWidth: number;
  bscanHeight: number;
  dscanWidth: number;
  dscanHeight: number;
}

export interface CursorResponse {
  ascan: {
    waveform: Float32Array;
    timeMinUs: number;
    timeMaxUs: number;
    amplitudeScale: number;
  };
  bscanBlobUrl: string | null;
  dscanBlobUrl: string | null;
  gates: GateOverlay[];
  renderMs: number;
}

export interface GateAdjustParams {
  tier: 2;
  gates: {
    ref: { startUs: number; endUs: number; thresholdPct: number };
    meas: { startUs: number; endUs: number; thresholdPct: number };
  };
  folders: string[];
}

export interface TierTwoProgress {
  fileIndex: number;
  totalFiles: number;
  progress: number;
  filename: string;
}

export interface UseCompanionWebSocketResult {
  connected: boolean;
  cursorData: CursorResponse | null;
  sendCursor: (params: CursorParams) => void;
  sendGateAdjust: (params: GateAdjustParams) => void;
  tierTwoThickness: Float32Array | null;
  tierTwoProgress: TierTwoProgress | null;
  tierTwoComplete: boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ParsedHeader {
  type: string;
  seq: number;
  binaryFrames: number;
  ascan: {
    timeMinUs: number;
    timeMaxUs: number;
    amplitudeScale: number;
  };
  gates: GateOverlay[];
  renderMs: number;
}

interface TileHeader {
  type: 'cscan-tile';
  fileIndex: number;
  totalFiles: number;
  progress: number;
  filename: string;
}

interface CompleteHeader {
  type: 'cscan-complete';
  computeMs: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THROTTLE_MS = 50;
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 5_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCompanionWebSocket(
  port: number | null,
): UseCompanionWebSocketResult {
  const queryClient = useQueryClient();

  // --- Render state (triggers UI updates) ---
  const [connected, setConnected] = useState(false);
  const [cursorData, setCursorData] = useState<CursorResponse | null>(null);
  const [tierTwoThickness, setTierTwoThickness] = useState<Float32Array | null>(null);
  const [tierTwoProgress, setTierTwoProgress] = useState<TierTwoProgress | null>(null);
  const [tierTwoComplete, setTierTwoComplete] = useState(false);

  // --- Refs (internal, no re-renders) ---
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);

  // Multi-frame parser state
  const pendingHeaderRef = useRef<ParsedHeader | null>(null);
  const binaryFramesRef = useRef<ArrayBuffer[]>([]);

  // Tier 2 tile parser state
  const pendingTileHeaderRef = useRef<TileHeader | CompleteHeader | null>(null);

  // Blob URLs to revoke on next update / unmount
  const blobUrlsRef = useRef<string[]>([]);

  // Throttle state
  const lastSendRef = useRef(0);
  const pendingParamsRef = useRef<CursorParams | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep port in a ref so callbacks always see latest value
  const portRef = useRef(port);
  portRef.current = port;

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const revokeBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    blobUrlsRef.current = [];
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearThrottleTimer = useCallback(() => {
    if (throttleTimerRef.current !== null) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
  }, []);

  // ------------------------------------------------------------------
  // Assemble a complete CursorResponse from header + binary frames
  // ------------------------------------------------------------------

  const assembleResponse = useCallback(
    (header: ParsedHeader, buffers: ArrayBuffer[]) => {
      // Revoke previous blob URLs before creating new ones
      revokeBlobUrls();

      const waveform = new Float32Array(buffers[0]);

      const bscanBlob = new Blob([buffers[1]], { type: 'image/png' });
      const bscanBlobUrl = URL.createObjectURL(bscanBlob);

      const dscanBlob = new Blob([buffers[2]], { type: 'image/png' });
      const dscanBlobUrl = URL.createObjectURL(dscanBlob);

      blobUrlsRef.current = [bscanBlobUrl, dscanBlobUrl];

      setCursorData({
        ascan: {
          waveform,
          timeMinUs: header.ascan.timeMinUs,
          timeMaxUs: header.ascan.timeMaxUs,
          amplitudeScale: header.ascan.amplitudeScale,
        },
        bscanBlobUrl,
        dscanBlobUrl,
        gates: header.gates,
        renderMs: header.renderMs,
      });
    },
    [revokeBlobUrls],
  );

  // ------------------------------------------------------------------
  // WebSocket connect / reconnect
  // ------------------------------------------------------------------

  const connect = useCallback(() => {
    const currentPort = portRef.current;
    if (currentPort === null) return;

    clearReconnectTimer();

    const ws = new WebSocket(`ws://localhost:${currentPort}/ws/cursor`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['companion-status'] });
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnect is handled there
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          const msgType = parsed.type;

          if (msgType === 'cursor-data') {
            // Cursor response — expect binary frames next
            pendingHeaderRef.current = parsed as ParsedHeader;
            binaryFramesRef.current = [];
          } else if (msgType === 'cscan-tile' || msgType === 'cscan-complete') {
            // Tier 2 tile/complete — expect one binary frame next
            pendingTileHeaderRef.current = parsed as TileHeader | CompleteHeader;
          }
        } catch {
          // Ignore malformed JSON
        }
      } else if (event.data instanceof Blob) {
        // Binary frame — route to the correct parser
        event.data.arrayBuffer().then((buffer) => {
          // Check tile parser first (it takes priority since cursor data has 3 frames)
          const tileHeader = pendingTileHeaderRef.current;
          if (tileHeader) {
            pendingTileHeaderRef.current = null;
            const matrix = new Float32Array(buffer);

            if (tileHeader.type === 'cscan-tile') {
              setTierTwoThickness(matrix);
              setTierTwoProgress({
                fileIndex: tileHeader.fileIndex,
                totalFiles: tileHeader.totalFiles,
                progress: tileHeader.progress,
                filename: tileHeader.filename,
              });
            } else {
              // cscan-complete
              setTierTwoThickness(matrix);
              setTierTwoProgress(null);
              setTierTwoComplete(true);
            }
            return;
          }

          // Cursor data frames
          const header = pendingHeaderRef.current;
          if (!header) return;

          binaryFramesRef.current.push(buffer);

          if (binaryFramesRef.current.length === header.binaryFrames) {
            assembleResponse(header, binaryFramesRef.current);
            pendingHeaderRef.current = null;
            binaryFramesRef.current = [];
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembleResponse, clearReconnectTimer, queryClient]);

  const scheduleReconnect = useCallback(() => {
    // Only reconnect if port is still set
    if (portRef.current === null) return;

    clearReconnectTimer();
    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [clearReconnectTimer, connect]);

  // ------------------------------------------------------------------
  // sendCursor (throttled, stable identity)
  // ------------------------------------------------------------------

  const sendCursor = useCallback((params: CursorParams) => {
    pendingParamsRef.current = params;

    const now = Date.now();
    const elapsed = now - lastSendRef.current;

    if (elapsed >= THROTTLE_MS) {
      flushSend();
    } else if (throttleTimerRef.current === null) {
      throttleTimerRef.current = setTimeout(
        () => {
          throttleTimerRef.current = null;
          flushSend();
        },
        THROTTLE_MS - elapsed,
      );
    }
    // If a timer is already pending, the latest params are stored in the ref
    // and will be sent when the timer fires.
  }, []);

  const sendGateAdjust = useCallback((params: GateAdjustParams) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Reset tier 2 state for new computation
    setTierTwoThickness(null);
    setTierTwoProgress(null);
    setTierTwoComplete(false);
    ws.send(JSON.stringify({ type: 'gate-adjust', ...params }));
  }, []);

  function flushSend() {
    const ws = wsRef.current;
    const params = pendingParamsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !params) return;

    ws.send(JSON.stringify({ type: 'cursor', ...params }));
    lastSendRef.current = Date.now();
    pendingParamsRef.current = null;
  }

  // ------------------------------------------------------------------
  // Effect: open / close WebSocket when port changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (port === null) {
      // No port — tear down everything
      clearReconnectTimer();
      clearThrottleTimer();
      if (wsRef.current) {
        // Prevent reconnect on intentional close
        const ws = wsRef.current;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }

    connect();

    return () => {
      clearReconnectTimer();
      clearThrottleTimer();
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        wsRef.current = null;
      }
      revokeBlobUrls();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  return {
    connected,
    cursorData,
    sendCursor,
    sendGateAdjust,
    tierTwoThickness,
    tierTwoProgress,
    tierTwoComplete,
  };
}
