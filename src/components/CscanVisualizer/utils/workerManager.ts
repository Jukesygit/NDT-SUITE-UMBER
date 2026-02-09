/**
 * Worker Manager - Clean Promise-based API for C-scan processing
 *
 * Provides:
 * - Automatic worker lifecycle management
 * - Progress callbacks
 * - Memory-efficient data transfer using Transferables
 * - Fallback to main thread if Workers unavailable
 */

import type {
  EfficientCscanData,
  WorkerMessage,
  ProgressMessage,
  ParseCompleteMessage,
  CompositeCompleteMessage,
} from './efficientTypes';
import { toLegacyFormat } from './efficientTypes';
import type { CscanData } from '../types';

export interface ProcessingProgress {
  current: number;
  total: number;
  message: string;
  memoryUsage?: number;
}

export interface ProcessFilesOptions {
  batchSize?: number;
  onProgress?: (progress: ProcessingProgress) => void;
}

export interface CreateCompositeOptions {
  onProgress?: (progress: ProcessingProgress) => void;
}

/**
 * Result of file processing
 */
export interface ProcessFilesResult {
  scans: CscanData[];
  efficientScans: EfficientCscanData[];
  hasOffsetIssues: boolean;
}

/**
 * CscanWorkerManager - Manages web worker for C-scan processing
 */
class CscanWorkerManager {
  private worker: Worker | null = null;
  private _isReady = false;
  private readyPromise: Promise<void> | null = null;
  private pendingResolvers = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    onProgress?: (progress: ProcessingProgress) => void;
  }>();

  // Cache of efficient scans for composite creation
  private scanCache = new Map<string, EfficientCscanData>();

  constructor() {
    this.initWorker();
  }

  /**
   * Initialize the web worker
   */
  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      return;
    }

    try {
      // Vite-specific worker import
      this.worker = new Worker(
        new URL('../workers/cscanProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.readyPromise = new Promise((resolve) => {
        const onReady = (event: MessageEvent) => {
          if (event.data.type === 'READY') {
            this._isReady = true;
            this.worker?.removeEventListener('message', onReady);
            resolve();
          }
        };
        this.worker?.addEventListener('message', onReady);
      });

      this.worker.onmessage = this.handleMessage.bind(this);
      this.worker.onerror = this.handleError.bind(this);
    } catch (error) {
      this.worker = null;
    }
  }

  /**
   * Handle messages from worker
   */
  private handleMessage(event: MessageEvent<WorkerMessage>): void {
    const { type, payload } = event.data;

    switch (type) {
      case 'PARSE_PROGRESS':
      case 'COMPOSITE_PROGRESS': {
        const progressPayload = payload as ProgressMessage['payload'];
        // Notify all pending operations of progress
        this.pendingResolvers.forEach(({ onProgress }) => {
          onProgress?.(progressPayload);
        });
        break;
      }

      case 'PARSE_COMPLETE': {
        const { scans, hasOffsetIssues } = payload as ParseCompleteMessage['payload'];

        // Cache efficient scans
        scans.forEach(scan => this.scanCache.set(scan.id, scan));

        // Convert to legacy format for current UI compatibility
        const legacyScans = scans.map(scan => this.efficientToLegacy(scan));

        const resolver = this.pendingResolvers.get('parse');
        if (resolver) {
          resolver.resolve({ scans: legacyScans, efficientScans: scans, hasOffsetIssues });
          this.pendingResolvers.delete('parse');
        }
        break;
      }

      case 'COMPOSITE_COMPLETE': {
        const { composite } = payload as CompositeCompleteMessage['payload'];

        // Cache the composite
        this.scanCache.set(composite.id, composite);

        const legacyComposite = this.efficientToLegacy(composite);

        const resolver = this.pendingResolvers.get('composite');
        if (resolver) {
          resolver.resolve({ composite: legacyComposite, efficientComposite: composite });
          this.pendingResolvers.delete('composite');
        }
        break;
      }

      case 'ERROR': {
        // Don't reject - errors for individual files shouldn't stop the batch
        break;
      }
    }
  }

  /**
   * Handle worker errors
   */
  private handleError(error: ErrorEvent): void {
    this.pendingResolvers.forEach(({ reject }) => {
      reject(new Error(`Worker error: ${error.message}`));
    });
    this.pendingResolvers.clear();
  }

  /**
   * Convert efficient format to legacy CscanData
   */
  private efficientToLegacy(efficient: EfficientCscanData): CscanData {
    return {
      id: efficient.id,
      filename: efficient.filename,
      width: efficient.width,
      height: efficient.height,
      data: toLegacyFormat(efficient),
      xAxis: Array.from(efficient.xAxis),
      yAxis: Array.from(efficient.yAxis),
      stats: efficient.stats,
      metadata: efficient.metadata as Record<string, any>,
      validPoints: efficient.stats.validPoints,
      timestamp: efficient.timestamp ? new Date(efficient.timestamp) : new Date(),
      isComposite: efficient.isComposite,
      sourceRegions: efficient.sourceRegions
    };
  }

  /**
   * Check if worker is ready (synchronous check)
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Wait for worker to be ready
   */
  private async ensureReady(): Promise<void> {
    if (this._isReady) return;
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  /**
   * Process files using web worker
   */
  async processFiles(files: File[], options: ProcessFilesOptions = {}): Promise<ProcessFilesResult> {
    const { batchSize = 15, onProgress } = options;

    // If no worker, fall back to main thread
    if (!this.worker) {
      return this.processFilesMainThread(files, options);
    }

    await this.ensureReady();

    // Read files to ArrayBuffers
    onProgress?.({ current: 0, total: files.length, message: 'Reading files...' });

    const buffers: ArrayBuffer[] = [];
    const filenames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const buffer = await files[i].arrayBuffer();
      buffers.push(buffer);
      filenames.push(files[i].name);

      onProgress?.({
        current: i + 1,
        total: files.length,
        message: `Reading ${files[i].name}...`
      });
    }

    // Send to worker with Transferables
    return new Promise((resolve, reject) => {
      this.pendingResolvers.set('parse', { resolve: resolve as (v: unknown) => void, reject, onProgress });

      this.worker!.postMessage(
        {
          type: 'PARSE_FILES',
          payload: { files: buffers, filenames, batchSize }
        },
        buffers // Transfer ownership to avoid copying
      );
    });
  }

  /**
   * Fallback: Process files on main thread
   */
  private async processFilesMainThread(files: File[], options: ProcessFilesOptions = {}): Promise<ProcessFilesResult> {
    const { onProgress } = options;

    // Dynamic import to avoid loading parser if worker works
    const { processFiles: legacyProcessFiles, hasOffsetsToCorrect } = await import('./fileParser');

    const scans = await legacyProcessFiles(files, (current, total) => {
      onProgress?.({ current, total, message: `Processing ${current}/${total}...` });
    });

    return {
      scans,
      efficientScans: [], // Not available in fallback
      hasOffsetIssues: hasOffsetsToCorrect(scans)
    };
  }

  /**
   * Create composite using web worker (from cached scans)
   */
  async createComposite(
    scanIds: string[],
    options: CreateCompositeOptions = {}
  ): Promise<{ composite: CscanData; efficientComposite: EfficientCscanData } | null> {
    const { onProgress } = options;

    // Check if we have the scans cached
    const missingIds = scanIds.filter(id => !this.scanCache.has(id));
    if (missingIds.length > 0) {
      return null;
    }

    if (!this.worker) {
      return null;
    }

    await this.ensureReady();

    return new Promise((resolve, reject) => {
      this.pendingResolvers.set('composite', { resolve: resolve as (v: unknown) => void, reject, onProgress });

      this.worker!.postMessage({
        type: 'CREATE_COMPOSITE',
        payload: { scanIds }
      });
    });
  }

  /**
   * Create composite using web worker by sending scan data directly
   * This is used when scans have been repaired/modified and the worker cache is stale
   */
  async createCompositeFromData(
    scans: CscanData[],
    options: CreateCompositeOptions = {}
  ): Promise<{ composite: CscanData; efficientComposite: EfficientCscanData } | null> {
    const { onProgress } = options;

    if (scans.length < 2) {
      return null;
    }

    if (!this.worker) {
      return null;
    }

    await this.ensureReady();

    // Convert scans to serializable format for worker
    const scanDataForWorker = scans.map(scan => ({
      id: scan.id,
      filename: scan.filename,
      width: scan.width,
      height: scan.height,
      data: scan.data,
      xAxis: scan.xAxis,
      yAxis: scan.yAxis
    }));

    return new Promise((resolve, reject) => {
      this.pendingResolvers.set('composite', { resolve: resolve as (v: unknown) => void, reject, onProgress });

      this.worker!.postMessage({
        type: 'CREATE_COMPOSITE_FROM_DATA',
        payload: { scans: scanDataForWorker }
      });
    });
  }

  /**
   * Get cached efficient scan by ID
   */
  getCachedScan(id: string): EfficientCscanData | undefined {
    return this.scanCache.get(id);
  }

  /**
   * Cache a scan (useful when converting from legacy)
   */
  cacheScan(scan: EfficientCscanData): void {
    this.scanCache.set(scan.id, scan);
  }

  /**
   * Clear scan cache
   */
  clearCache(): void {
    this.scanCache.clear();
    this.worker?.postMessage({ type: 'CLEAR_CACHE' });
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this._isReady = false;
    this.scanCache.clear();
  }
}

// Singleton instance
let managerInstance: CscanWorkerManager | null = null;

/**
 * Get the singleton worker manager instance
 */
export function getCscanWorkerManager(): CscanWorkerManager {
  if (!managerInstance) {
    managerInstance = new CscanWorkerManager();
  }
  return managerInstance;
}

/**
 * Convenience function to process files
 */
export async function processFilesWithWorker(
  files: File[],
  options?: ProcessFilesOptions
): Promise<ProcessFilesResult> {
  return getCscanWorkerManager().processFiles(files, options);
}

/**
 * Convenience function to create composite from cached scans
 */
export async function createCompositeWithWorker(
  scanIds: string[],
  options?: CreateCompositeOptions
): Promise<{ composite: CscanData; efficientComposite: EfficientCscanData } | null> {
  return getCscanWorkerManager().createComposite(scanIds, options);
}

/**
 * Convenience function to create composite from scan data directly
 * Use when scans have been modified and worker cache is stale
 */
export async function createCompositeFromDataWithWorker(
  scans: CscanData[],
  options?: CreateCompositeOptions
): Promise<{ composite: CscanData; efficientComposite: EfficientCscanData } | null> {
  return getCscanWorkerManager().createCompositeFromData(scans, options);
}
