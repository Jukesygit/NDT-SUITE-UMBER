// =============================================================================
// vessel-history — snapshot (memento) undo/redo over the vessel document slice
// =============================================================================
// Pure, React-free history model for the Vessel Modeler. Because the reducer is
// immutable with structural sharing, each snapshot only holds references to the
// slices that actually changed, so recording is O(1) and cheap to retain.
//
// Each undo/redo record is a HistoryEntry carrying the pre-change snapshot plus a
// human label ("Move nozzle 2") and its record time — undo/redo move whole
// entries so the UI can name the change being reverted/reapplied and stamp it
// with a relative time.
//
// Timestamps and labels are supplied by the dispatcher (HistoryMeta.at/.label),
// never read from Date.now() inside these functions — keeping them pure and
// StrictMode-safe (double-invoked reducers produce identical results).
//
// See docs/plans/2026-07-29-vessel-modeler-undo-redo-design.md and
// docs/plans/2026-08-06-t3-ux-batch-design.md (A3).
// =============================================================================

import type { VesselState } from '../types';

/** One undo/redo record: the pre-change snapshot plus its label and record time. */
export interface HistoryEntry {
  /** The document snapshot to restore when this entry is (un)applied. */
  vessel: VesselState;
  /** Human-facing name of the change this entry represents ("Move nozzle 2"). */
  label: string;
  /** Record time (ms), supplied by the dispatcher — used for relative-time UI. */
  at: number;
}

/** Undo/redo stacks plus the coalescing bookkeeping for the latest record. */
export interface VesselHistoryState {
  /** Oldest → newest pre-change entries (undo stack). */
  past: HistoryEntry[];
  /** Redo stack (newest redo target at the end). */
  future: HistoryEntry[];
  /** Coalescing group of the most recent record, or null for a discrete push. */
  lastKey: string | null;
  /** Timestamp (ms) of the most recent record, supplied by the dispatcher. */
  lastAt: number;
}

/** Per-record metadata, produced by action creators (never inside the reducer). */
export interface HistoryMeta {
  /** Coalescing group, e.g. 'drag:nozzle:3' or 'field:diameter'. */
  key?: string;
  /** Human-facing label for the change ("Move nozzle 2"). */
  label?: string;
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
 * Humanise a coalescing key into a fallback label when the dispatcher supplied
 * none. Keys are shaped `<entity>:<id>:<fields>` (see historyFor), so the entity
 * segment is enough: `nozzle:3:angle,pos` → "Edit nozzle". A missing key yields a
 * generic "Edit".
 */
function labelFromKey(key: string | undefined): string {
  if (!key) return 'Edit';
  const entity = key.split(':')[0] || 'item';
  // Keys carry the raw entity token; the label is user-facing (R3: "Boot").
  return `Edit ${entity === 'appendage' ? 'Boot' : entity}`;
}

/**
 * Record `prevVessel` (the pre-change document) onto the undo stack.
 *
 * Coalescing: if `meta.key` is set, matches the last record's key, and lands
 * within COALESCE_WINDOW_MS of the last record, the pre-gesture snapshot already
 * captured at gesture start is enough — nothing is pushed, only `lastAt` is
 * refreshed and the group keeps its FIRST label (a drag storm stays "Move nozzle
 * 2"). Otherwise a real push clears the redo stack and caps the undo stack at
 * MAX_HISTORY (dropping the oldest). A missing `meta` is a plain discrete push
 * that resets the coalescing group.
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
    // Keep the group's first entry (and thus its first label) untouched; only the
    // coalescing clock advances.
    return { ...history, lastAt: meta.at };
  }

  const entry: HistoryEntry = {
    vessel: prevVessel,
    label: meta?.label ?? labelFromKey(meta?.key),
    at: meta?.at ?? 0,
  };
  const appended = [...history.past, entry];
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
 * Undo one step: pop the newest past entry as the vessel to restore, and push
 * `currentVessel` onto the redo stack under the SAME label (redo announces the
 * same change). Returns null when the undo stack is empty. The coalescing group
 * is reset so a fresh edit after undo starts a new group.
 */
export function undoStep(
  history: VesselHistoryState,
  currentVessel: VesselState
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (history.past.length === 0) return null;
  const entry = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { vessel: currentVessel, label: entry.label, at: entry.at }],
      lastKey: null,
      lastAt: 0,
    },
    vessel: entry.vessel,
  };
}

/**
 * Redo one step: pop the newest redo entry as the vessel to restore, and push
 * `currentVessel` back onto the undo stack under the SAME label. Returns null
 * when the redo stack is empty. The coalescing group is reset.
 */
export function redoStep(
  history: VesselHistoryState,
  currentVessel: VesselState
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (history.future.length === 0) return null;
  const entry = history.future[history.future.length - 1];
  return {
    history: {
      past: [...history.past, { vessel: currentVessel, label: entry.label, at: entry.at }],
      future: history.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    },
    vessel: entry.vessel,
  };
}

/**
 * Undo repeatedly down to (and including) the past entry at `index`, folded into
 * a single state transition — exactly equivalent to `history.past.length - index`
 * sequential `undoStep`s, but as one atomic move for a dropdown jump. Restores
 * `past[index].vessel` (the pre-change snapshot of that change) and moves every
 * entry from `index` upward onto the redo stack, newest last. Returns null for an
 * out-of-range index.
 */
export function undoTo(
  history: VesselHistoryState,
  currentVessel: VesselState,
  index: number
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (index < 0 || index >= history.past.length) return null;
  const removed = history.past.slice(index); // entries index..end, oldest-first
  const past = history.past.slice(0, index);
  // Fold the pushes each undoStep would make: the topmost popped entry pairs with
  // the current document; every entry below it pairs with the vessel of the entry
  // that sat directly above it in `past`.
  const additions: HistoryEntry[] = [];
  for (let k = removed.length - 1; k >= 0; k--) {
    const above = k === removed.length - 1 ? currentVessel : removed[k + 1].vessel;
    additions.push({ vessel: above, label: removed[k].label, at: removed[k].at });
  }
  return {
    history: {
      past,
      future: [...history.future, ...additions],
      lastKey: null,
      lastAt: 0,
    },
    vessel: removed[0].vessel,
  };
}

/**
 * Redo repeatedly down to (and including) the future entry at `index`, folded
 * into a single state transition — the mirror of `undoTo`, equivalent to
 * `history.future.length - index` sequential `redoStep`s. Restores
 * `future[index].vessel` and moves every entry from `index` upward back onto the
 * undo stack. Returns null for an out-of-range index.
 */
export function redoTo(
  history: VesselHistoryState,
  currentVessel: VesselState,
  index: number
): { history: VesselHistoryState; vessel: VesselState } | null {
  if (index < 0 || index >= history.future.length) return null;
  const removed = history.future.slice(index); // entries index..end, oldest-first
  const future = history.future.slice(0, index);
  const additions: HistoryEntry[] = [];
  for (let k = removed.length - 1; k >= 0; k--) {
    const above = k === removed.length - 1 ? currentVessel : removed[k + 1].vessel;
    additions.push({ vessel: above, label: removed[k].label, at: removed[k].at });
  }
  return {
    history: {
      past: [...history.past, ...additions],
      future,
      lastKey: null,
      lastAt: 0,
    },
    vessel: removed[0].vessel,
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
