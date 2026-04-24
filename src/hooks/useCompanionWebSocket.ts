import { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GateSettings } from '../types/companion';
import type { GateOverlay } from '../components/projects/scan-viewer/AscanCanvas';

// ---------------------------------------------------------------------------
// Debug logger — prefix all companion WebSocket logs
// ---------------------------------------------------------------------------

const DEBUG = true;
function log(...args: unknown[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`%c[companion:ws ${ts}]`, 'color: #4caf50; font-weight: bold', ...args);
}
function warn(...args: unknown[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`[companion:ws ${ts}]`, ...args);
}
function error(...args: unknown[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[companion:ws ${ts}]`, ...args);
}

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
    /** Interface echo crossing time in µs — probe delay / wedge delay reference. */
    delayUs: number | null;
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
    delayUs?: number | null;
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

/**
 * Backpressure: when true, a cursor request is in-flight and we should NOT
 * send another until the response arrives.  The latest pending params are
 * stored in pendingParamsRef and flushed as soon as the response lands.
 */

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

  // Throttle + backpressure state
  const lastSendRef = useRef(0);
  const pendingParamsRef = useRef<CursorParams | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingResponseRef = useRef(false);
  const cursorSeqRef = useRef(0);

  // Keep port in a ref so callbacks always see latest value
  const portRef = useRef(port);
  portRef.current = port;

  // Track connection lifetime for debugging
  const connectTimeRef = useRef<number>(0);
  const messageCountRef = useRef(0);

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
      // Drop stale responses — if a newer cursor request was sent after this
      // one, the response is for an outdated position.
      if (header.seq < cursorSeqRef.current) {
        log(`dropping stale cursor response (seq=${header.seq}, current=${cursorSeqRef.current})`);
        // Still release backpressure so the latest pending params can flush
        awaitingResponseRef.current = false;
        if (pendingParamsRef.current) flushSend();
        return;
      }

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
          delayUs: header.ascan.delayUs ?? null,
        },
        bscanBlobUrl,
        dscanBlobUrl,
        gates: header.gates,
        renderMs: header.renderMs,
      });

      // Release backpressure — if there are pending params, flush immediately
      awaitingResponseRef.current = false;
      if (pendingParamsRef.current) {
        log(`backpressure released (renderMs=${header.renderMs}) — flushing pending cursor`);
        flushSend();
      }
    },
    [revokeBlobUrls],
  );

  // ------------------------------------------------------------------
  // WebSocket connect / reconnect
  // ------------------------------------------------------------------

  const connect = useCallback(() => {
    const currentPort = portRef.current;
    if (currentPort === null) {
      warn('connect() called but port is null — aborting');
      return;
    }

    clearReconnectTimer();

    const url = `ws://localhost:${currentPort}/ws/cursor`;
    log(`opening WebSocket to ${url}`);

    const ws = new WebSocket(url);
    wsRef.current = ws;
    connectTimeRef.current = performance.now();
    messageCountRef.current = 0;

    ws.onopen = () => {
      const elapsed = (performance.now() - connectTimeRef.current).toFixed(1);
      log(`✓ WebSocket OPEN (handshake: ${elapsed}ms, port: ${currentPort})`);
      setConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;
      // Reset backpressure on new connection
      awaitingResponseRef.current = false;
    };

    ws.onclose = (event: CloseEvent) => {
      const lifetime = ((performance.now() - connectTimeRef.current) / 1000).toFixed(1);
      const closeInfo = {
        code: event.code,
        reason: event.reason || '(empty)',
        wasClean: event.wasClean,
        lifetimeSec: lifetime,
        messagesReceived: messageCountRef.current,
      };
      warn('WebSocket CLOSED:', closeInfo);

      // Log well-known close codes
      const codeDescriptions: Record<number, string> = {
        1000: 'Normal closure',
        1001: 'Going away (page navigation or server shutdown)',
        1002: 'Protocol error',
        1003: 'Unsupported data type',
        1005: 'No status code present (abnormal)',
        1006: 'Abnormal closure (no close frame received — network drop or crash)',
        1007: 'Invalid payload data',
        1008: 'Policy violation',
        1009: 'Message too big',
        1010: 'Missing expected extension',
        1011: 'Internal server error',
        1012: 'Service restart',
        1013: 'Try again later',
        1015: 'TLS handshake failure',
      };
      const desc = codeDescriptions[event.code];
      if (desc) {
        warn(`close code ${event.code} = "${desc}"`);
      }

      setConnected(false);
      wsRef.current = null;
      awaitingResponseRef.current = false; // Reset backpressure
      log('invalidating companion-status query to trigger rediscovery');
      queryClient.invalidateQueries({ queryKey: ['companion-status'] });
      scheduleReconnect();
    };

    ws.onerror = (event: Event) => {
      error('WebSocket ERROR event:', {
        type: event.type,
        wsReadyState: ws.readyState,
        wsReadyStateLabel: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
        port: currentPort,
        messagesReceived: messageCountRef.current,
      });
      // onclose will fire after onerror — reconnect is handled there
    };

    ws.onmessage = (event: MessageEvent) => {
      messageCountRef.current++;

      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data);
          const msgType = parsed.type;

          if (msgType === 'cursor-data') {
            log(`← cursor-data (seq=${parsed.seq}, binaryFrames=${parsed.binaryFrames}, renderMs=${parsed.renderMs})`);
            pendingHeaderRef.current = parsed as ParsedHeader;
            binaryFramesRef.current = [];
          } else if (msgType === 'cscan-tile' || msgType === 'cscan-complete') {
            log(`← ${msgType}`, msgType === 'cscan-tile'
              ? `file ${parsed.fileIndex + 1}/${parsed.totalFiles} (${(parsed.progress * 100).toFixed(0)}%)`
              : `computeMs=${parsed.computeMs}`);
            pendingTileHeaderRef.current = parsed as TileHeader | CompleteHeader;
          } else if (msgType === 'error') {
            error('← server error message:', parsed);
          } else {
            warn(`← unknown message type: "${msgType}"`, parsed);
          }
        } catch (e) {
          error('← failed to parse JSON message:', event.data, e);
        }
      } else if (event.data instanceof Blob) {
        // Binary frame — route to the correct parser
        const blobSize = event.data.size;
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
          if (!header) {
            warn(`← binary frame (${blobSize} bytes) with no pending header — dropped`);
            return;
          }

          binaryFramesRef.current.push(buffer);
          const frameNum = binaryFramesRef.current.length;
          const totalFrames = header.binaryFrames;

          if (frameNum === totalFrames) {
            const totalBytes = binaryFramesRef.current.reduce((sum, b) => sum + b.byteLength, 0);
            log(`← assembled ${totalFrames} binary frames (${(totalBytes / 1024).toFixed(1)} KB) for seq=${header.seq}`);
            assembleResponse(header, binaryFramesRef.current);
            pendingHeaderRef.current = null;
            binaryFramesRef.current = [];
          }
        });
      } else {
        warn('← unexpected message data type:', typeof event.data, event.data);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assembleResponse, clearReconnectTimer, queryClient]);

  const scheduleReconnect = useCallback(() => {
    // Only reconnect if port is still set
    if (portRef.current === null) {
      warn('scheduleReconnect: port is null — not scheduling');
      return;
    }

    clearReconnectTimer();
    const delay = backoffRef.current;
    backoffRef.current = Math.min(delay * 2, MAX_BACKOFF_MS);

    log(`scheduling reconnect in ${delay}ms (next backoff: ${backoffRef.current}ms)`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      log('reconnect timer fired — attempting reconnect');
      connect();
    }, delay);
  }, [clearReconnectTimer, connect]);

  // ------------------------------------------------------------------
  // sendCursor (throttled, stable identity)
  // ------------------------------------------------------------------

  const sendCursor = useCallback((params: CursorParams) => {
    pendingParamsRef.current = params;

    // Backpressure: if we're still waiting for the companion to respond,
    // just store the params — they'll be flushed when the response arrives.
    if (awaitingResponseRef.current) return;

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
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      warn('sendGateAdjust: WebSocket not open, dropping message');
      return;
    }
    log('→ gate-adjust sent');
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

    // Don't send if still waiting for previous response
    if (awaitingResponseRef.current) return;

    cursorSeqRef.current++;
    const seq = cursorSeqRef.current;
    ws.send(JSON.stringify({ type: 'cursor', seq, ...params }));
    lastSendRef.current = Date.now();
    pendingParamsRef.current = null;
    awaitingResponseRef.current = true;
  }

  // ------------------------------------------------------------------
  // Effect: open / close WebSocket when port changes
  // ------------------------------------------------------------------

  useEffect(() => {
    if (port === null) {
      log('effect: port is null — tearing down WebSocket');
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
        log('effect: WebSocket closed (intentional, handlers removed)');
      }
      setConnected(false);
      return;
    }

    log(`effect: port changed to ${port} — connecting`);
    connect();

    return () => {
      log(`effect cleanup: port was ${port} — tearing down`);
      clearReconnectTimer();
      clearThrottleTimer();
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        wsRef.current = null;
        log('effect cleanup: WebSocket closed (handlers removed)');
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
