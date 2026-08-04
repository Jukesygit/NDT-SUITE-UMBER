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
    expect(next.history.past[0]).toBe(INITIAL_STATE.vessel);
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
});
