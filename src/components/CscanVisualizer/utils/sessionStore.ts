import type { CscanData, DisplaySettings, DistributionConfig } from '../types';

const DB_NAME = 'matrix-cscan-sessions';
const DB_VERSION = 2;
const SUMMARY_STORE = 'sessionSummaries';
const PAYLOAD_STORE = 'sessionPayloads';

export interface CscanSessionRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scans: CscanData[];
  currentScanId: string | null;
  selectedScanIds: string[];
  displaySettings: DisplaySettings;
  distributionConfig: DistributionConfig;
  scanNotesById: Record<string, string>;
  showStats: boolean;
}

export type CscanSessionSummary = Pick<
  CscanSessionRecord,
  'id' | 'name' | 'createdAt' | 'updatedAt' | 'currentScanId'
> & {
  scanCount: number;
};

function ensureIndexedDb(): IDBFactory {
  if (!window.indexedDB) {
    throw new Error('IndexedDB is not available in this browser');
  }
  return window.indexedDB;
}

function createId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return `cscan-session-${crypto.randomUUID()}`;
  }
  return `cscan-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = ensureIndexedDb().open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        db.createObjectStore(SUMMARY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PAYLOAD_STORE)) {
        db.createObjectStore(PAYLOAD_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open session store'));
  });
}

export async function listCscanSessions(): Promise<CscanSessionSummary[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SUMMARY_STORE, 'readonly');
    const store = tx.objectStore(SUMMARY_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const summaries = (request.result as CscanSessionSummary[])
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(summaries);
    };
    request.onerror = () => reject(request.error ?? new Error('Failed to list sessions'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to list sessions'));
    };
  });
}

export async function saveCscanSession(
  session: Omit<CscanSessionRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
): Promise<CscanSessionRecord> {
  const db = await openDatabase();
  const now = new Date().toISOString();
  const record: CscanSessionRecord = {
    ...session,
    id: session.id ?? createId(),
    createdAt: session.createdAt ?? now,
    updatedAt: now,
  };
  const summary: CscanSessionSummary = {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    currentScanId: record.currentScanId,
    scanCount: record.scans.length,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([SUMMARY_STORE, PAYLOAD_STORE], 'readwrite');
    tx.objectStore(SUMMARY_STORE).put(summary);
    tx.objectStore(PAYLOAD_STORE).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve(record);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to save session'));
    };
  });
}

export async function loadCscanSession(id: string): Promise<CscanSessionRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAYLOAD_STORE, 'readonly');
    const store = tx.objectStore(PAYLOAD_STORE);
    const request = store.get(id);

    request.onsuccess = () => resolve((request.result as CscanSessionRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Failed to load session'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to load session'));
    };
  });
}

export async function deleteCscanSession(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SUMMARY_STORE, PAYLOAD_STORE], 'readwrite');
    tx.objectStore(SUMMARY_STORE).delete(id);
    tx.objectStore(PAYLOAD_STORE).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Failed to delete session'));
    };
  });
}
