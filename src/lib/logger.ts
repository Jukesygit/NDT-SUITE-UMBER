import { LogLevel, LOG_CONFIG } from '../config/logging';
import { sanitizeLogMessage, stripPiiFromObject } from '../utils/pii-sanitizer';

export interface LogEntry {
  level: keyof typeof LogLevel;
  message: string;
  timestamp: string;
  correlationId?: string;
  context?: Record<string, unknown>;
}

let correlationId: string | undefined;

/** Set once at login; included in every log entry. */
export function setCorrelationId(id: string): void {
  correlationId = id;
}

export function clearCorrelationId(): void {
  correlationId = undefined;
}

// Ring buffer
const buffer: LogEntry[] = [];

function push(entry: LogEntry): void {
  if (buffer.length >= LOG_CONFIG.bufferSize) {
    buffer.shift();
  }
  buffer.push(entry);
}

function shouldLog(level: LogLevel): boolean {
  return level >= LOG_CONFIG.level;
}

function write(
  level: LogLevel,
  levelName: keyof typeof LogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level: levelName,
    message: sanitizeLogMessage(message),
    timestamp: new Date().toISOString(),
    ...(correlationId && { correlationId }),
    ...(context && { context: stripPiiFromObject(context) }),
  };

  push(entry);

  // Mirror to console in dev — dead-code eliminated in prod by Vite
  if (import.meta.env.DEV) {
    const consoleFn =
      level >= LogLevel.ERROR ? console.error : level >= LogLevel.WARN ? console.warn : console.log;
    consoleFn(`[${levelName}]`, entry.message, entry.context ?? '');
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    write(LogLevel.DEBUG, 'DEBUG', message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    write(LogLevel.INFO, 'INFO', message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    write(LogLevel.WARN, 'WARN', message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    write(LogLevel.ERROR, 'ERROR', message, context);
  },
  /** Returns a shallow copy of the ring buffer for error boundary context. */
  getBuffer(): LogEntry[] {
    return [...buffer];
  },
};
