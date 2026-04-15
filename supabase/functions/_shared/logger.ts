import {
  sanitizeLogMessage,
  stripPiiFromObject,
} from './pii-sanitizer.ts';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface EdgeLogEntry {
  level: Level;
  function: string;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface EdgeLogger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
  setRequestId(id: string): void;
  setUserId(id: string): void;
}

export function createEdgeLogger(functionName: string): EdgeLogger {
  let requestId: string | undefined;
  let userId: string | undefined;

  function emit(level: Level, message: string, extra?: Record<string, unknown>): void {
    const entry: EdgeLogEntry = {
      level,
      function: functionName,
      message: sanitizeLogMessage(message),
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId }),
      ...(userId && { userId }),
      ...(extra && stripPiiFromObject(extra)),
    };

    const output = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (msg, extra) => emit('DEBUG', msg, extra),
    info: (msg, extra) => emit('INFO', msg, extra),
    warn: (msg, extra) => emit('WARN', msg, extra),
    error: (msg, extra) => emit('ERROR', msg, extra),
    setRequestId(id: string) { requestId = id; },
    setUserId(id: string) { userId = id; },
  };
}
