import { useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Debug logger — prefix all companion discovery logs
// ---------------------------------------------------------------------------

const DEBUG = true;
function log(...args: unknown[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  console.log(`%c[companion:discovery ${ts}]`, 'color: #00bcd4; font-weight: bold', ...args);
}
function warn(...args: unknown[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.warn(`[companion:discovery ${ts}]`, ...args);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompanionStatusResponse {
  app: string;
  running: boolean;
  port: number;
  directory: string | null;
  fileCount: number;
  [key: string]: unknown;
}

interface CompanionStatus {
  connected: boolean;
  port: number | null;
  directory: string | null;
  fileCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT_START = 18923;
const PORT_END = 18932;
const PROBE_TIMEOUT_MS = 3000;

// Poll faster when disconnected, slower when connected
const POLL_CONNECTED_MS = 15_000;
const POLL_DISCONNECTED_MS = 3_000;
const POLL_DISCONNECTED_BACKOFF_MS = 10_000;
// After this many consecutive disconnected polls, back off from 3s to 10s
const BACKOFF_AFTER_FAILURES = 5;

// Number of consecutive failed health checks before declaring companion dead.
// Prevents a single GIL-blocked timeout from killing a healthy connection.
const GRACE_FAILURES_BEFORE_DISCONNECT = 3;

// Track consecutive null (disconnected) results for backoff
let consecutiveDisconnects = 0;

// ---------------------------------------------------------------------------
// Discovery helpers
// ---------------------------------------------------------------------------

/** Probe a single port. Resolves with status+port on success, rejects otherwise. */
async function probePort(port: number): Promise<CompanionStatusResponse> {
  const t0 = performance.now();
  try {
    const res = await fetch(`http://localhost:${port}/status`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const data = await res.json();
    const elapsed = (performance.now() - t0).toFixed(1);
    if (data.app !== 'matrix-ndt-companion') {
      log(`port ${port}: responded in ${elapsed}ms but app="${data.app}" — not companion`);
      throw new Error('not companion');
    }
    log(`port ${port}: ✓ found companion in ${elapsed}ms (files=${data.fileCount}, dir="${data.directory}")`);
    return { ...data, port };
  } catch (err) {
    const elapsed = (performance.now() - t0).toFixed(1);
    const reason = err instanceof Error ? err.message : String(err);
    // Only log non-connection-refused errors (those are expected on empty ports)
    if (!reason.includes('Failed to fetch') && !reason.includes('not companion')) {
      warn(`port ${port}: failed in ${elapsed}ms — ${reason}`);
    }
    throw err;
  }
}

/**
 * Discover the companion by trying a cached port first, then scanning all
 * ports in parallel. Returns the full status response (no second fetch).
 */
async function discoverCompanion(
  cachedPort: number | null,
): Promise<CompanionStatusResponse | null> {
  const t0 = performance.now();

  // Fast path: try the last-known port first
  if (cachedPort !== null) {
    log(`trying cached port ${cachedPort} first...`);
    try {
      const result = await probePort(cachedPort);
      log(`cached port hit — total discovery: ${(performance.now() - t0).toFixed(1)}ms`);
      return result;
    } catch {
      warn(`cached port ${cachedPort} failed — falling through to full scan`);
    }
  }

  // Parallel scan of all ports
  log(`parallel scanning ports ${PORT_START}-${PORT_END}...`);
  const probes = [];
  for (let port = PORT_START; port <= PORT_END; port++) {
    probes.push(probePort(port));
  }

  try {
    const result = await Promise.any(probes);
    log(`parallel scan found companion on port ${result.port} — total: ${(performance.now() - t0).toFixed(1)}ms`);
    return result;
  } catch {
    warn(`parallel scan: ALL ${PORT_END - PORT_START + 1} ports failed — companion not running (took ${(performance.now() - t0).toFixed(1)}ms)`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCompanionApp(): CompanionStatus {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['companion-status'],
    queryFn: async () => {
      const cached = queryClient.getQueryData<CompanionStatusResponse>(['companion-status']);
      log(`queryFn fired — cached port: ${cached?.port ?? 'none'}, consecutiveDisconnects: ${consecutiveDisconnects}`);
      const result = await discoverCompanion(cached?.port ?? null);

      if (result?.running) {
        if (consecutiveDisconnects > 0) {
          log(`reconnected after ${consecutiveDisconnects} failed polls — port ${result.port}`);
        }
        consecutiveDisconnects = 0;
        return result;
      }

      // Discovery failed — but don't immediately drop a known-good connection.
      // The companion may just be GIL-blocked (rendering, indexing).
      consecutiveDisconnects++;
      warn(`disconnect #${consecutiveDisconnects} — companion not found`);

      if (cached?.running && consecutiveDisconnects < GRACE_FAILURES_BEFORE_DISCONNECT) {
        warn(`grace period: keeping cached connection (${consecutiveDisconnects}/${GRACE_FAILURES_BEFORE_DISCONNECT} failures before disconnect)`);
        return cached;
      }

      // Exceeded grace period — companion is genuinely gone
      if (consecutiveDisconnects === GRACE_FAILURES_BEFORE_DISCONNECT) {
        warn(`grace period expired — declaring companion disconnected`);
      }
      return null;
    },
    retry: 1,
    retryDelay: 500,
    refetchInterval: (query) => {
      if (query.state.data?.running) return POLL_CONNECTED_MS;
      const interval = consecutiveDisconnects > BACKOFF_AFTER_FAILURES
        ? POLL_DISCONNECTED_BACKOFF_MS
        : POLL_DISCONNECTED_MS;
      return interval;
    },
    staleTime: 5_000,
  });

  return {
    connected: !!data?.running,
    port: data?.port ?? null,
    directory: data?.directory ?? null,
    fileCount: data?.fileCount ?? 0,
  };
}
