/**
 * Companion Error Classification
 *
 * Maps raw fetch/WebSocket failures to structured CompanionError instances
 * with human-readable messages, severity, and suggested recovery actions.
 */

import {
  CompanionError,
  type CompanionErrorSeverity,
  type CompanionErrorSource,
  type CompanionRecovery,
} from '../types/companion';

// ---------------------------------------------------------------------------
// HTTP status classification map
// ---------------------------------------------------------------------------

interface HttpClassification {
  title: string;
  message: string;
  severity: CompanionErrorSeverity;
  recovery: CompanionRecovery;
}

const HTTP_STATUS_MAP: Record<number, HttpClassification> = {
  400: {
    title: 'Invalid request',
    message: 'The companion rejected the request parameters. Check gate settings and folder selection.',
    severity: 'error',
    recovery: 'retry',
  },
  404: {
    title: 'Endpoint not found',
    message: 'The companion does not support this operation. You may need a newer version.',
    severity: 'error',
    recovery: 'restart-companion',
  },
  // 499 = client closed / AbortError (maps to HTTP-level abort pattern)
  499: {
    title: 'Request cancelled',
    message: 'The request was cancelled before the companion responded.',
    severity: 'info',
    recovery: null,
  },
  500: {
    title: 'Companion internal error',
    message: 'The companion encountered an unexpected error. Try the operation again.',
    severity: 'error',
    recovery: 'retry',
  },
  503: {
    title: 'Companion unavailable',
    message: 'The companion is busy or starting up. Wait a moment and try again.',
    severity: 'warning',
    recovery: 'retry',
  },
};

// ---------------------------------------------------------------------------
// WebSocket close code classification map
// ---------------------------------------------------------------------------

interface WsClassification {
  title: string;
  message: string;
  severity: CompanionErrorSeverity;
  recovery: CompanionRecovery;
}

const WS_CLOSE_MAP: Record<number, WsClassification> = {
  1000: {
    // Normal closure — not an error, should not trigger a notification
    title: 'Connection closed',
    message: 'WebSocket connection closed normally.',
    severity: 'info',
    recovery: null,
  },
  1006: {
    title: 'Companion connection lost',
    message: 'The real-time connection to the companion dropped unexpectedly. Attempting to reconnect.',
    severity: 'warning',
    recovery: 'restart-companion',
  },
  1011: {
    title: 'Companion crashed',
    message: 'The companion reported an internal server error and closed the connection.',
    severity: 'critical',
    recovery: 'restart-companion',
  },
};

// ---------------------------------------------------------------------------
// Helper: extract HTTP status from an error message thrown by companion-service
// ---------------------------------------------------------------------------

function extractHttpStatus(message: string): number | null {
  // Matches patterns like "failed: 503", "failed: 503 Service Unavailable"
  const match = message.match(/:\s*(\d{3})\b/);
  if (match) return parseInt(match[1], 10);
  return null;
}

// ---------------------------------------------------------------------------
// Public: classifyCompanionError
// ---------------------------------------------------------------------------

/**
 * Classify any thrown value from companion-service functions into a
 * structured CompanionError with title, message, severity, and recovery.
 *
 * @param err   The raw error (may be Error, DOMException, or unknown)
 * @param operation  The high-level operation name (e.g. "create-composite")
 */
export function classifyCompanionError(err: unknown, operation: string): CompanionError {
  // Already classified — pass through
  if (err instanceof CompanionError) return err;

  const rawMessage = err instanceof Error ? err.message : String(err);

  // --- Abort / cancellation ---
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new CompanionError({
      message: 'Request cancelled.',
      source: 'timeout',
      severity: 'info',
      recovery: null,
      operation,
      cause: err,
    });
  }

  // --- Timeout (AbortSignal.timeout fires a TimeoutError) ---
  if (
    (err instanceof DOMException && err.name === 'TimeoutError') ||
    rawMessage.toLowerCase().includes('timeout') ||
    rawMessage.toLowerCase().includes('timed out')
  ) {
    return new CompanionError({
      message: 'The companion did not respond in time. It may be busy processing — please try again.',
      source: 'timeout',
      severity: 'warning',
      recovery: 'retry',
      operation,
      cause: err,
    });
  }

  // --- Binary payload / Zod parse failure ---
  if (
    rawMessage.includes('Binary payload size mismatch') ||
    rawMessage.includes('Missing X-') ||
    rawMessage.includes('ZodError') ||
    rawMessage.toLowerCase().includes('parse')
  ) {
    return new CompanionError({
      message: 'The companion returned data in an unexpected format. Check for version compatibility.',
      source: 'parse',
      severity: 'error',
      recovery: 'restart-companion',
      operation,
      cause: err,
    });
  }

  // --- Version / app-identity mismatch ---
  if (rawMessage.toLowerCase().includes('version') || rawMessage.includes('not companion')) {
    return new CompanionError({
      message: 'The companion app version is incompatible with this web client. Please update the companion.',
      source: 'version',
      severity: 'error',
      recovery: 'restart-companion',
      operation,
      cause: err,
    });
  }

  // --- HTTP status embedded in message ---
  const status = extractHttpStatus(rawMessage);
  if (status !== null) {
    const entry = HTTP_STATUS_MAP[status];
    if (entry) {
      return new CompanionError({
        message: entry.message,
        source: 'http',
        severity: entry.severity,
        recovery: entry.recovery,
        operation,
        cause: err,
      });
    }
    // Unknown HTTP status
    return new CompanionError({
      message: `The companion returned an unexpected HTTP ${status} response.`,
      source: 'http',
      severity: 'error',
      recovery: 'retry',
      operation,
      cause: err,
    });
  }

  // --- Network / fetch failure (TypeError: Failed to fetch) ---
  if (
    err instanceof TypeError ||
    rawMessage.toLowerCase().includes('failed to fetch') ||
    rawMessage.toLowerCase().includes('network')
  ) {
    return new CompanionError({
      message: 'Could not reach the companion. Verify it is running and try again.',
      source: 'network',
      severity: 'error',
      recovery: 'restart-companion',
      operation,
      cause: err,
    });
  }

  // --- Fallback ---
  return new CompanionError({
    message: rawMessage || 'An unknown companion error occurred.',
    source: 'network',
    severity: 'error',
    recovery: 'retry',
    operation,
    cause: err,
  });
}

// ---------------------------------------------------------------------------
// Public: classifyWsClose
// ---------------------------------------------------------------------------

/**
 * Classify a WebSocket close event into a CompanionError.
 * Code 1000 (normal) returns an info-level error so callers can decide
 * whether to surface it.
 */
export function classifyWsClose(code: number, operation: string): CompanionError {
  const entry = WS_CLOSE_MAP[code];

  if (entry) {
    return new CompanionError({
      message: entry.message,
      source: 'websocket' as CompanionErrorSource,
      severity: entry.severity,
      recovery: entry.recovery,
      operation,
    });
  }

  // Generic fallback for unmapped codes
  return new CompanionError({
    message: `The real-time connection closed unexpectedly (code ${code}). Attempting to reconnect.`,
    source: 'websocket',
    severity: 'warning',
    recovery: 'restart-companion',
    operation,
  });
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export type { CompanionErrorSeverity, CompanionErrorSource, CompanionRecovery };
