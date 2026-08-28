/**
 * Working in-memory Storage stubs for tests.
 *
 * `src/test/setup.js` replaces localStorage/sessionStorage with bare `vi.fn()`
 * objects — every `setItem` is recorded and every `getItem` returns undefined.
 * That is fine for asserting "was it written?", but useless for code whose
 * behaviour depends on reading back what it wrote (session time-box tracking,
 * dismissal state). Call `useMemoryStorage()` in a suite that needs real
 * round-trips; it stubs both globals with a genuine Map-backed Storage and
 * restores them afterwards.
 */
import { afterEach, beforeEach, vi } from 'vitest';

export function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  } as Storage;
}

/** Install fresh, empty localStorage + sessionStorage around every test. */
export function useMemoryStorage(): void {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('sessionStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
}
