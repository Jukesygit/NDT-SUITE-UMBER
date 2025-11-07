/**
 * Global Error Handler
 * Centralized error handling and reporting
 */

import { store } from '../store';
import { showNotification } from '../store/slices/uiSlice';
import { AuthError } from '../types/auth.types';

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
export function handleError(error: any): void {
  console.error('Error handled:', error);

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
function classifyError(error: any): {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  recoverable: boolean;
} {
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

  // Network errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return {
      type: ErrorType.NETWORK,
      severity: ErrorSeverity.LOW,
      message: ERROR_MESSAGES.TIMEOUT,
      recoverable: true,
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

  // HTTP status based errors
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;

    switch (status) {
      case 400:
        return {
          type: ErrorType.VALIDATION,
          severity: ErrorSeverity.LOW,
          message: data?.message || ERROR_MESSAGES.INVALID_INPUT,
          details: data,
          recoverable: true,
        };

      case 401:
        return {
          type: ErrorType.AUTH,
          severity: ErrorSeverity.MEDIUM,
          message: ERROR_MESSAGES.UNAUTHORIZED,
          recoverable: false,
        };

      case 403:
        return {
          type: ErrorType.PERMISSION,
          severity: ErrorSeverity.MEDIUM,
          message: ERROR_MESSAGES.UNAUTHORIZED,
          recoverable: false,
        };

      case 404:
        return {
          type: ErrorType.NOT_FOUND,
          severity: ErrorSeverity.LOW,
          message: 'Requested resource not found.',
          recoverable: true,
        };

      case 500:
      case 502:
      case 503:
        return {
          type: ErrorType.SERVER,
          severity: ErrorSeverity.HIGH,
          message: ERROR_MESSAGES.SERVER_ERROR,
          recoverable: true,
        };

      default:
        return {
          type: ErrorType.UNKNOWN,
          severity: ErrorSeverity.MEDIUM,
          message: data?.message || ERROR_MESSAGES.UNKNOWN_ERROR,
          details: data,
          recoverable: true,
        };
    }
  }

  // JavaScript errors
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

  // Default
  return {
    type: ErrorType.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    message: error.message || ERROR_MESSAGES.UNKNOWN_ERROR,
    recoverable: true,
  };
}

/**
 * Log error based on severity
 */
function logError(errorInfo: any): void {
  const logData = {
    ...errorInfo,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  switch (errorInfo.severity) {
    case ErrorSeverity.CRITICAL:
    case ErrorSeverity.HIGH:
      console.error('Critical Error:', logData);
      break;
    case ErrorSeverity.MEDIUM:
      console.warn('Warning:', logData);
      break;
    case ErrorSeverity.LOW:
      console.info('Info:', logData);
      break;
  }
}

/**
 * Show notification to user
 */
function notifyUser(errorInfo: any): void {
  const notificationType =
    errorInfo.severity === ErrorSeverity.CRITICAL || errorInfo.severity === ErrorSeverity.HIGH
      ? 'error'
      : errorInfo.severity === ErrorSeverity.MEDIUM
      ? 'warning'
      : 'info';

  store.dispatch(
    showNotification({
      type: notificationType as any,
      message: errorInfo.message,
      duration: errorInfo.recoverable ? 5000 : 10000,
    })
  );
}

/**
 * Report error to external service
 */
function reportError(errorInfo: any): void {
  // TODO: Implement error reporting service
  // Example: Sentry, LogRocket, Rollbar

  const reportData = {
    ...errorInfo,
    timestamp: new Date().toISOString(),
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
    },
    page: {
      url: window.location.href,
      referrer: document.referrer,
    },
    user: store.getState().auth.user?.id || 'anonymous',
  };

  // Send to error reporting service
  // fetch('/api/errors', { method: 'POST', body: JSON.stringify(reportData) });
}

/**
 * Create error handler for async functions
 */
export function createAsyncHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: {
    fallbackValue?: any;
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
    console.error('Unhandled promise rejection:', event.reason);
    handleError(new AppError(
      'An unexpected error occurred',
      ErrorType.CLIENT,
      ErrorSeverity.HIGH
    ));
    event.preventDefault();
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
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