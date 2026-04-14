import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppError,
  ErrorType,
  ErrorSeverity,
  handleError,
  createAsyncHandler,
  setupGlobalErrorHandlers,
} from './errorHandler';

describe('Error Handler', () => {
  describe('AppError', () => {
    it('should create with message, type, and severity', () => {
      const error = new AppError('test error', ErrorType.AUTH, ErrorSeverity.HIGH);
      expect(error.message).toBe('test error');
      expect(error.type).toBe(ErrorType.AUTH);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
    });

    it('should have correct defaults', () => {
      const error = new AppError('test');
      expect(error.type).toBe(ErrorType.UNKNOWN);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.recoverable).toBe(true);
    });

    it('should have timestamp as Date instance', () => {
      const error = new AppError('test');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should have stack trace', () => {
      const error = new AppError('test');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should have name set to AppError', () => {
      const error = new AppError('test');
      expect(error.name).toBe('AppError');
    });

    it('should extend Error', () => {
      const error = new AppError('test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should support recoverable flag', () => {
      const error = new AppError('fatal', ErrorType.SERVER, ErrorSeverity.CRITICAL, false);
      expect(error.recoverable).toBe(false);
    });
  });

  describe('handleError', () => {
    it('should not throw for AppError', () => {
      expect(() => handleError(new AppError('test'))).not.toThrow();
    });

    it('should not throw for TypeError', () => {
      expect(() => handleError(new TypeError('bad type'))).not.toThrow();
    });

    it('should not throw for ReferenceError', () => {
      expect(() => handleError(new ReferenceError('not defined'))).not.toThrow();
    });

    it('should not throw for generic Error', () => {
      expect(() => handleError(new Error('generic'))).not.toThrow();
    });

    it('should not throw for non-Error values', () => {
      expect(() => handleError('string error')).not.toThrow();
      expect(() => handleError(42)).not.toThrow();
      expect(() => handleError(null)).not.toThrow();
    });
  });

  describe('Error classification (via createAsyncHandler)', () => {
    it('should handle TypeError and return fallback', async () => {
      const fn = async () => {
        throw new TypeError('bad type');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'default' });
      const result = await handler();
      expect(result).toBe('default');
    });

    it('should handle ReferenceError and return fallback', async () => {
      const fn = async () => {
        throw new ReferenceError('not defined');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'default' });
      const result = await handler();
      expect(result).toBe('default');
    });

    it('should handle Error with timeout in message', async () => {
      const fn = async () => {
        throw new Error('request timeout exceeded');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'timed_out' });
      const result = await handler();
      expect(result).toBe('timed_out');
    });

    it('should handle generic Error', async () => {
      const fn = async () => {
        throw new Error('something went wrong');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: null });
      const result = await handler();
      expect(result).toBeNull();
    });

    it('should handle non-Error thrown values', async () => {
      const fn = async () => {
        throw 'string error';
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'caught' });
      const result = await handler();
      expect(result).toBe('caught');
    });
  });

  describe('createAsyncHandler', () => {
    it('should return result on success', async () => {
      const fn = async () => 'success';
      const handler = createAsyncHandler(fn);
      const result = await handler();
      expect(result).toBe('success');
    });

    it('should return fallbackValue on error', async () => {
      const fn = async () => {
        throw new Error('fail');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'fallback' });
      const result = await handler();
      expect(result).toBe('fallback');
    });

    it('should rethrow error when rethrow is true', async () => {
      const fn = async () => {
        throw new Error('must rethrow');
      };
      const handler = createAsyncHandler(fn, { rethrow: true });
      await expect(handler()).rejects.toThrow('must rethrow');
    });

    it('should pass arguments through', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const handler = createAsyncHandler(fn);
      await handler('a', 'b');
      expect(fn).toHaveBeenCalledWith('a', 'b');
    });

    it('should return a function', () => {
      const fn = async () => {};
      const handler = createAsyncHandler(fn);
      expect(typeof handler).toBe('function');
    });

    it('should return undefined fallback by default', async () => {
      const fn = async () => {
        throw new Error('fail');
      };
      const handler = createAsyncHandler(fn);
      const result = await handler();
      expect(result).toBeUndefined();
    });
  });

  describe('classifyError - offline branch', () => {
    it('should classify as NETWORK when navigator.onLine is false', async () => {
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const fn = async () => {
        throw new Error('some error');
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'offline' });
      const result = await handler();
      expect(result).toBe('offline');

      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
    });
  });

  describe('handleError - production reportError branch', () => {
    it('should run without error when NODE_ENV is production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => handleError(new Error('prod error'))).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('classifyError - Error with empty message', () => {
    it('should use fallback message for Error with empty string message', async () => {
      const err = new Error('');
      // Error with empty message should hit `error.message || ERROR_MESSAGES.UNKNOWN_ERROR`
      const fn = async () => {
        throw err;
      };
      const handler = createAsyncHandler(fn, { fallbackValue: 'caught' });
      const result = await handler();
      expect(result).toBe('caught');
    });
  });

  describe('setupGlobalErrorHandlers', () => {
    let addEventListenerSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    });

    afterEach(() => {
      addEventListenerSpy.mockRestore();
    });

    it('should register unhandledrejection listener', () => {
      setupGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('should register error listener', () => {
      setupGlobalErrorHandlers();
      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should call preventDefault on unhandledrejection', () => {
      setupGlobalErrorHandlers();
      const calls = addEventListenerSpy.mock.calls;
      const rejectionHandler = calls.find((c: unknown[]) => c[0] === 'unhandledrejection')?.[1] as (
        ...args: unknown[]
      ) => void;
      const event = { preventDefault: vi.fn() };
      rejectionHandler(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should call preventDefault on error event with error.message', () => {
      setupGlobalErrorHandlers();
      const calls = addEventListenerSpy.mock.calls;
      const errorHandler = calls.find((c: unknown[]) => c[0] === 'error')?.[1] as (
        ...args: unknown[]
      ) => void;
      const event = { error: { message: 'runtime error' }, preventDefault: vi.fn() };
      errorHandler(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should handle error event without error property', () => {
      setupGlobalErrorHandlers();
      const calls = addEventListenerSpy.mock.calls;
      const errorHandler = calls.find((c: unknown[]) => c[0] === 'error')?.[1] as (
        ...args: unknown[]
      ) => void;
      const event = { error: null, preventDefault: vi.fn() };
      errorHandler(event);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });
});
