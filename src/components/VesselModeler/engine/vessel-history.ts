// =============================================================================
// vessel-history — snapshot (memento) undo/redo over the vessel document slice
// =============================================================================
// Pure, React-free history model for the Vessel Modeler. Because the reducer is
// immutable with structural sharing, each snapshot only holds references to the
// slices that actually changed, so recording is O(1) and cheap to retain.
//
// Timestamps are supplied by the dispatcher (HistoryMeta.at), never read from
// Date.now() inside these functions — keeping them pure and StrictMode-safe
// (double-invoked reducers produce identical results).
//
// See docs/plans/2026-07-29-vessel-modeler-undo-redo-design.md.
// =============================================================================

import type { VesselState } from '../types';

/** Undo/redo stacks plus the coalescing bookkeeping for the latest record. */
export interface VesselHistoryState {
  /** Oldest → newest pre-change snapshots (undo stack). */
  past: VesselState[];
  /** Redo stack (newest redo target at the end). */
  future: VesselState[];
  /** Coalescing group of the most recent record, or null for a discrete push. */
  lastKey: string | null;
  /** Timestamp (ms) of the most recent record, supplied by the dispatcher. */
  lastAt: number;
}

/** Per-record metadata, produced by action creators (never inside the reducer). */
export interface HistoryMeta {
  /** Coalescing group, e.g. 'drag:nozzle:3' or 'field:diameter'. */
  key?: string;
  /** Date.now() captured by the DISPATCHER, keeping the reducer pure. */
  at: number;
}

/** Maximum retained undo snapshots; oldest are dropped past this. */
export const MAX_HISTORY = 50;

/** Two keyed records in the same group within this window coalesce into one. */
export const COALESCE_WINDOW_MS = 1000;

/** Fresh, empty history — also used to clear history at a document boundary. */
export function createEmptyHistory(): VesselHistoryState {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

/**
 * Record `prevVessel` (the pre-change document) onto the undo stack.
 *
 * Coalescing: if `meta.key` is set, matches the last record's key, and lands
 * within COALESCE_WINDOW_MS of the last record, the pre-gesture snapshot already
 * captured at gesture start is enough — nothing is pushed, only `lastAt` is
 * refreshed. Otherwise a real push clears the redo stack and caps the undo stack
 * at MAX_HISTORY (dropping the oldest). A missing `meta` is a plain discrete
 * push that resets the coalescing group.
 */
export function recordCheckpoint(
  history: VesselHistoryState,
  prevVessel: VesselState,
  meta?: HistoryMeta
): VesselHistoryState {
  if (
    meta &&
    meta.key &&
    meta.key === history.lastKey &&
    meta.at - history.lastAt < COALESCE_WINDOW_MS
  ) {
    return { ...history, lastAt: meta.at };
  }

  const appended = [...history.past, prevVessel];
  const past =
    appended.length > MAX_HISTORY ? appended.slice(appended.length - MAX_HISTORY) : appended;

  return {
    past,
    future: [],
    lastKey: meta?.key ?? null,
    lastAt: meta?.at ?? 0,
  };
}

/**
 * Undo one step: pop the newest past snapshot as the vessel to restore, and push
 * `currentVessel` onto the redo stack. Returns null when the undo stack is empty.
 * The coalescing group is reset so a fresh edit after undo starts a new group.
 */
export function undoStep(
  history: VesselHistoryState,
  currentVessel: VesselState
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (history.past.length === 0) return null;
  const vessel = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, currentVessel],
      lastKey: null,
      lastAt: 0,
    },
    vessel,
  };
}

/**
 * Redo one step: pop the newest redo snapshot as the vessel to restore, and push
 * `currentVessel` back onto the undo stack. Returns null when the redo stack is
 * empty. The coalescing group is reset.
 */
export function redoStep(
  history: VesselHistoryState,
  currentVessel: VesselState
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (history.future.length === 0) return null;
  const vessel = history.future[history.future.length - 1];
  return {
    history: {
      past: [...history.past, currentVessel],
      future: history.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    },
    vessel,
  };
}

/**
 * End the current coalescing group (a gesture boundary such as pointer-up) so
 * the next keyed record starts a new undo entry. Returns the same reference when
 * already broken, to avoid a pointless re-render.
 */
export function breakGroup(history: VesselHistoryState): VesselHistoryState {
  if (history.lastKey === null) return history;
  return { ...history, lastKey: null };
}
