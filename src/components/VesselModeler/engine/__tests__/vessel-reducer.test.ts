import { describe, it, expect } from 'vitest';
import { vesselReducer, INITIAL_STATE } from '../vessel-reducer';
import type { VesselState } from '../../types';

// Unit coverage for the reducer moved out of VesselModeler.tsx (T2-D / D1).
// These assert the existing document/history semantics — nothing here changes
// behavior; they pin it down now that the reducer is independently importable.

describe('vesselReducer', () => {
  it('UPDATE_VESSEL_FN with history meta applies the updater and records a checkpoint', () => {
    const next = vesselReducer(INITIAL_STATE, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 4321 }),
      history: { key: 'dimensions::id', at: 1000 },
    });

    expect(next.vessel.id).toBe(4321);
    // The pre-change vessel is pushed onto the undo stack; future is cleared.
    expect(next.history.past).toHaveLength(1);
    expect(next.history.past[0].vessel).toBe(INITIAL_STATE.vessel);
    expect(next.history.future).toHaveLength(0);
    expect(next.history.lastKey).toBe('dimensions::id');
    expect(next.history.lastAt).toBe(1000);

    // A second same-key edit inside the coalesce window does NOT push again.
    const coalesced = vesselReducer(next, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 5555 }),
      history: { key: 'dimensions::id', at: 1500 },
    });
    expect(coalesced.vessel.id).toBe(5555);
    expect(coalesced.history.past).toHaveLength(1);
    expect(coalesced.history.lastAt).toBe(1500);

    // Same key, but outside the window → a fresh discrete undo entry.
    const separated = vesselReducer(coalesced, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 6789 }),
      history: { key: 'dimensions::id', at: 3000 },
    });
    expect(separated.history.past).toHaveLength(2);
  });

  it('SELECT_NOZZLE updates selection only, leaving vessel and history untouched', () => {
    const next = vesselReducer(INITIAL_STATE, { type: 'SELECT_NOZZLE', index: 3 });

    expect(next.selection.nozzleIndex).toBe(3);
    expect(next.selection.appendageIndex).toBe(-1);
    expect(next.selection.saddleIndex).toBe(-1);
    // Document + history slices are shared by reference (no undo entry, no change).
    expect(next.vessel).toBe(INITIAL_STATE.vessel);
    expect(next.history).toBe(INITIAL_STATE.history);
  });

  it('HISTORY_BREAK resets the coalescing group without touching the undo stack', () => {
    const edited = vesselReducer(INITIAL_STATE, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 999 }),
      history: { key: 'drag:nozzle:0', at: 1000 },
    });
    expect(edited.history.lastKey).toBe('drag:nozzle:0');

    const broken = vesselReducer(edited, { type: 'HISTORY_BREAK' });
    expect(broken.history.lastKey).toBeNull();
    expect(broken.history.past).toHaveLength(1);
    expect(broken.history.past).toBe(edited.history.past);
  });

  it('SET_VIEW_MODE switches the viewport mode as pure UI, leaving vessel and history untouched', () => {
    // 2D
    const flattened = vesselReducer(INITIAL_STATE, { type: 'SET_VIEW_MODE', mode: 'flattened' });
    expect(flattened.ui.viewMode).toBe('flattened');
    // Topo is a first-class mode alongside 3d/flattened.
    const topo = vesselReducer(flattened, { type: 'SET_VIEW_MODE', mode: 'topo' });
    expect(topo.ui.viewMode).toBe('topo');
    // Back to 3D.
    const three = vesselReducer(topo, { type: 'SET_VIEW_MODE', mode: '3d' });
    expect(three.ui.viewMode).toBe('3d');
    // View mode is transient UI — no undo entry, document + history untouched.
    expect(topo.vessel).toBe(INITIAL_STATE.vessel);
    expect(topo.history).toBe(INITIAL_STATE.history);
  });

  it('undo/redo preserves the current view mode (topo is not part of the document)', () => {
    const edited = vesselReducer(INITIAL_STATE, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 777 }),
      history: { key: 'dimensions::id', at: 1000 },
    });
    const inTopo = vesselReducer(edited, { type: 'SET_VIEW_MODE', mode: 'topo' });
    const undone = vesselReducer(inTopo, { type: 'UNDO' });
    // Restoring a vessel snapshot keeps the viewport mode the user is looking at.
    expect(undone.ui.viewMode).toBe('topo');
    const redone = vesselReducer(undone, { type: 'REDO' });
    expect(redone.ui.viewMode).toBe('topo');
  });

  it('UNDO_TO resets the transient slices exactly like UNDO', () => {
    const edited = vesselReducer(INITIAL_STATE, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 4242 }),
      history: { key: 'k', at: 1000, label: 'Edit vessel k' },
    });
    // Dirty every transient slice that a restore is meant to clear.
    const dirty = {
      ...edited,
      selection: { ...edited.selection, nozzleIndex: 5, weldIndex: 2 },
      drawMode: { annotation: null, coverage: true, ruler: true },
      ui: {
        ...edited.ui,
        inspectingAnnotationId: 7,
        viewingInspectionImageId: 3,
        hoverData: { thickness: 1, scanMm: 2, indexMm: 3 },
      },
    };

    const viaUndo = vesselReducer(dirty, { type: 'UNDO' });
    // For a single-entry stack, UNDO_TO index 0 folds exactly one step.
    const viaUndoTo = vesselReducer(dirty, { type: 'UNDO_TO', index: 0 });

    // Byte-for-byte identical result: same document restore + same transient reset.
    expect(viaUndoTo).toEqual(viaUndo);
    expect(viaUndoTo.vessel).toBe(INITIAL_STATE.vessel);
    expect(viaUndoTo.selection.nozzleIndex).toBe(-1);
    expect(viaUndoTo.selection.weldIndex).toBe(-1);
    expect(viaUndoTo.drawMode.coverage).toBe(false);
    expect(viaUndoTo.drawMode.ruler).toBe(false);
    expect(viaUndoTo.ui.inspectingAnnotationId).toBeNull();
    expect(viaUndoTo.ui.viewingInspectionImageId).toBe(-1);
    expect(viaUndoTo.ui.hoverData).toBeNull();
  });

  it('SET_VESSEL clears history — undo never crosses a load boundary', () => {
    const edited = vesselReducer(INITIAL_STATE, {
      type: 'UPDATE_VESSEL_FN',
      updater: (v: VesselState) => ({ ...v, id: 111 }),
      history: { key: 'dimensions::id', at: 1000 },
    });
    expect(edited.history.past).toHaveLength(1);

    const loadedVessel: VesselState = { ...INITIAL_STATE.vessel, id: 2222 };
    const loaded = vesselReducer(edited, { type: 'SET_VESSEL', vessel: loadedVessel });

    expect(loaded.vessel).toBe(loadedVessel);
    expect(loaded.history.past).toHaveLength(0);
    expect(loaded.history.future).toHaveLength(0);
    expect(loaded.history.lastKey).toBeNull();
  });

  it('TOGGLE_OUTLINER flips ui.outlinerOpen transiently, recording no history', () => {
    expect(INITIAL_STATE.ui.outlinerOpen).toBe(false);

    const opened = vesselReducer(INITIAL_STATE, { type: 'TOGGLE_OUTLINER' });
    expect(opened.ui.outlinerOpen).toBe(true);
    // Transient UI only: document + history slices untouched (shared by reference).
    expect(opened.vessel).toBe(INITIAL_STATE.vessel);
    expect(opened.history).toBe(INITIAL_STATE.history);

    const closed = vesselReducer(opened, { type: 'TOGGLE_OUTLINER' });
    expect(closed.ui.outlinerOpen).toBe(false);
    expect(closed.history).toBe(INITIAL_STATE.history);
  });

  it('SET_PALETTE_OPEN sets ui.paletteOpen transiently, recording no history', () => {
    expect(INITIAL_STATE.ui.paletteOpen).toBe(false);

    const opened = vesselReducer(INITIAL_STATE, { type: 'SET_PALETTE_OPEN', open: true });
    expect(opened.ui.paletteOpen).toBe(true);
    // Transient UI only: document + history slices untouched (shared by reference).
    expect(opened.vessel).toBe(INITIAL_STATE.vessel);
    expect(opened.history).toBe(INITIAL_STATE.history);

    const closed = vesselReducer(opened, { type: 'SET_PALETTE_OPEN', open: false });
    expect(closed.ui.paletteOpen).toBe(false);
    expect(closed.history).toBe(INITIAL_STATE.history);
  });

  it('SET_CLIP merges into ui.clip transiently, recording no history', () => {
    expect(INITIAL_STATE.ui.clip).toEqual({
      enabled: false,
      mode: 'transverse',
      offsetMm: 0,
      flip: false,
      showHelper: false,
    });

    const enabled = vesselReducer(INITIAL_STATE, { type: 'SET_CLIP', clip: { enabled: true } });
    expect(enabled.ui.clip.enabled).toBe(true);
    // Untouched fields survive the partial merge.
    expect(enabled.ui.clip.mode).toBe('transverse');
    expect(enabled.ui.clip.offsetMm).toBe(0);
    // Transient UI only: document + history slices untouched (shared by reference).
    expect(enabled.vessel).toBe(INITIAL_STATE.vessel);
    expect(enabled.history).toBe(INITIAL_STATE.history);
    // The initial config object is never mutated in place.
    expect(INITIAL_STATE.ui.clip.enabled).toBe(false);

    const moved = vesselReducer(enabled, {
      type: 'SET_CLIP',
      clip: { mode: 'longitudinal-h', offsetMm: -250, flip: true, showHelper: true },
    });
    expect(moved.ui.clip).toEqual({
      enabled: true,
      mode: 'longitudinal-h',
      offsetMm: -250,
      flip: true,
      showHelper: true,
    });
    expect(moved.history).toBe(INITIAL_STATE.history);
  });

  it('SET_LAYERS merges into ui.layers transiently, recording no history', () => {
    // Sparse by default: no key present ⇒ everything visible.
    expect(INITIAL_STATE.ui.layers).toEqual({});

    const hidden = vesselReducer(INITIAL_STATE, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': false },
    });
    expect(hidden.ui.layers).toEqual({ 'main/coverage': false });
    // Transient UI only: document + history slices untouched (shared by reference).
    expect(hidden.vessel).toBe(INITIAL_STATE.vessel);
    expect(hidden.history).toBe(INITIAL_STATE.history);
    // The initial map is never mutated in place.
    expect(INITIAL_STATE.ui.layers).toEqual({});

    // Partial merge: a second key joins the first rather than replacing it.
    const both = vesselReducer(hidden, {
      type: 'SET_LAYERS',
      layers: { 'app-1/scans': false },
    });
    expect(both.ui.layers).toEqual({ 'main/coverage': false, 'app-1/scans': false });
    expect(both.history).toBe(INITIAL_STATE.history);

    // Re-showing flips the stored value, leaving the sibling key alone.
    const reshown = vesselReducer(both, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': true },
    });
    expect(reshown.ui.layers).toEqual({ 'main/coverage': true, 'app-1/scans': false });
  });

  it('SET_LAYERS keeps state identity when no layer resolves differently', () => {
    // ABSENT and `true` both mean visible, so patching an absent key to `true` is
    // a no-op — identity must NOT churn (the viewport effect keys on it).
    const noop = vesselReducer(INITIAL_STATE, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': true, 'app-1/welds': true },
    });
    expect(noop).toBe(INITIAL_STATE);

    const hidden = vesselReducer(INITIAL_STATE, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': false },
    });
    // Re-hiding an already-hidden layer is likewise a no-op.
    const again = vesselReducer(hidden, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': false },
    });
    expect(again).toBe(hidden);
    expect(again.ui.layers).toBe(hidden.ui.layers);

    // A mixed patch where at least one key genuinely flips DOES produce a new map.
    const mixed = vesselReducer(hidden, {
      type: 'SET_LAYERS',
      layers: { 'main/coverage': false, 'main/scans': false },
    });
    expect(mixed).not.toBe(hidden);
    expect(mixed.ui.layers).toEqual({ 'main/coverage': false, 'main/scans': false });
  });
});
