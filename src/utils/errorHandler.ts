/**
 * Global Error Handler
 * Centralized error handling and reporting
 */

// Error types
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  NOT_FOUND = 'NOT_FOUND',
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  UNKNOWN = 'UNKNOWN',
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Custom error class
export class AppError extends Error {
  public type: ErrorType;
  public severity: ErrorSeverity;
  public code?: string;
  public details?: Record<string, any>;
  public timestamp: Date;
  public recoverable: boolean;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    recoverable = true
  ) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.severity = severity;
    this.timestamp = new Date();
    this.recoverable = recoverable;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// Error messages for common scenarios
const ERROR_MESSAGES: Record<string, string> = {
  // Network errors
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  OFFLINE: 'You appear to be offline. Please check your connection.',

  // Auth errors
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  SESSION_EXPIRED: 'Your session has expired. Please login again.',
  INVALID_CREDENTIALS: 'Invalid username or password.',
  ACCOUNT_LOCKED: 'Account has been locked due to too many failed attempts.',

  // Validation errors
  INVALID_INPUT: 'Please check your input and try again.',
  REQUIRED_FIELD: 'Required fields are missing.',
  INVALID_FORMAT: 'Invalid format. Please check and try again.',

  // Server errors
  SERVER_ERROR: 'Server error occurred. Please try again later.',
  MAINTENANCE: 'System is under maintenance. Please try again later.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable.',

  // Default
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
};

/**
 * Main error handler function
 */
export function handleError(error: unknown): void {
  // Determine error type and severity
  const errorInfo = classifyError(error);

  // Log error based on severity
  logError(errorInfo);

  // Show user notification
  notifyUser(errorInfo);

  // Report to error service in production
  if (process.env.NODE_ENV === 'production') {
    reportError(errorInfo);
  }
}

/**
 * Classify error and determine type/severity
 */
interface ClassifiedError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: unknown;
  recoverable: boolean;
}

function classifyError(error: unknown): ClassifiedError {
  // Already classified AppError
  if (error instanceof AppError) {
    return {
      type: error.type,
      severity: error.severity,
      message: error.message,
      details: error.details,
      recoverable: error.recoverable,
    };
  }

  // JavaScript runtime errors
  if (error instanceof TypeError || error instanceof ReferenceError) {
    return {
      type: ErrorType.CLIENT,
      severity: ErrorSeverity.HIGH,
      message: process.env.NODE_ENV === 'development'
        ? error.message
        : ERROR_MESSAGES.UNKNOWN_ERROR,
      details: { stack: error.stack },
      recoverable: false,
    };
  }

  if (!navigator.onLine) {
    return {
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.LOW,
      message: ERROR_MESSAGES.OFFLINE,
      recoverable: true,
    };
  }

  // Standard Error instances
  if (error instanceof Error) {
    if (error.message?.includes('timeout')) {
      return {
        type: ErrorType.NETWORK,
        severity: ErrorSeverity.LOW,
        message: ERROR_MESSAGES.TIMEOUT,
        recoverable: true,
      };
    }

    return {
      type: ErrorType.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      message: error.message || ERROR_MESSAGES.UNKNOWN_ERROR,
      recoverable: true,
    };
  }

  // Default for non-Error values
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    message: ERROR_MESSAGES.UNKNOWN_ERROR,
    recoverable: true,
  };
}

/**
 * Log error based on severity.
 * Placeholder — wire up structured logging when ready.
 */
function logError(_errorInfo: ClassifiedError): void {
  // No-op until a structured logging service is configured
}

/**
 * Show notification to user.
 * Placeholder — integrate with a toast/notification library when ready.
 */
function notifyUser(_errorInfo: unknown): void {
  // No-op until a toast system is wired up
}

/**
 * Report error to external service.
 * Placeholder — integrate with Sentry, LogRocket, or similar when ready.
 */
function reportError(_errorInfo: unknown): void {
  // No-op until an error reporting service is configured
}

/**
 * Create error handler for async functions
 */
export function createAsyncHandler<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: {
    fallbackValue?: unknown;
    showNotification?: boolean;
    rethrow?: boolean;
  }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);

      if (options?.rethrow) {
        throw error;
      }

      return options?.fallbackValue;
    }
  }) as T;
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    handleError(new AppError(
      'An unexpected error occurred',
      ErrorType.CLIENT,
      ErrorSeverity.HIGH
    ));
    event.preventDefault();
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    handleError(new AppError(
      event.error?.message || 'An unexpected error occurred',
      ErrorType.CLIENT,
      ErrorSeverity.HIGH
    ));
    event.preventDefault();
  });
}

export default {
  handleError,
  createAsyncHandler,
  setupGlobalErrorHandlers,
  AppError,
  ErrorType,
  ErrorSeverity,
};