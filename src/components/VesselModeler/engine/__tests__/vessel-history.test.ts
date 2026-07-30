// =============================================================================
// vessel-history — pure undo/redo model tests
// =============================================================================
// Guards the snapshot-history primitives that back Vessel Modeler undo/redo:
// discrete push, redo-stack clearing, time+key coalescing, gesture breaks, the
// MAX_HISTORY cap, and reference-exact round-trips (structural sharing must be
// preserved — snapshots are shared by reference, never cloned).
// See docs/plans/2026-07-29-vessel-modeler-undo-redo-design.md.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { DEFAULT_VESSEL_STATE, type VesselState } from '../../types';
import {
  createEmptyHistory,
  recordCheckpoint,
  undoStep,
  redoStep,
  breakGroup,
  MAX_HISTORY,
  COALESCE_WINDOW_MS,
} from '../vessel-history';

// A minimal, uniquely-identifiable VesselState. `id` is the discriminator used
// by the reference/round-trip assertions.
function makeVessel(id: number): VesselState {
  return { ...DEFAULT_VESSEL_STATE, id };
}

describe('vessel-history', () => {
  describe('recordCheckpoint', () => {
    it('pushes the previous vessel on a discrete record', () => {
      const v0 = makeVessel(0);
      const h = recordCheckpoint(createEmptyHistory(), v0);
      expect(h.past).toHaveLength(1);
      expect(h.past[0]).toBe(v0);
      expect(h.future).toEqual([]);
      expect(h.lastKey).toBeNull();
    });

    it('clears the redo stack on a new record made after an undo', () => {
      // Build: v0 -> v1 recorded, then undo leaves a redo entry.
      let h = recordCheckpoint(createEmptyHistory(), makeVessel(0));
      const undone = undoStep(h, makeVessel(1))!;
      h = undone.history;
      expect(h.future).toHaveLength(1);

      // A fresh discrete record must wipe the redo stack.
      h = recordCheckpoint(h, makeVessel(2));
      expect(h.future).toEqual([]);
    });

    it('coalesces same-key records inside the window into one entry', () => {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), { key: 'drag:nozzle:0', at: 1000 });
      h = recordCheckpoint(h, makeVessel(1), { key: 'drag:nozzle:0', at: 1200 });
      h = recordCheckpoint(h, makeVessel(2), { key: 'drag:nozzle:0', at: 1500 });

      // Only the pre-gesture snapshot survives; lastAt tracks the latest move.
      expect(h.past).toHaveLength(1);
      expect(h.past[0].id).toBe(0);
      expect(h.lastAt).toBe(1500);
    });

    it('pushes again when the key differs', () => {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), { key: 'drag:nozzle:0', at: 1000 });
      h = recordCheckpoint(h, makeVessel(1), { key: 'drag:nozzle:1', at: 1100 });
      expect(h.past).toHaveLength(2);
      expect(h.lastKey).toBe('drag:nozzle:1');
    });

    it('pushes again when the coalesce window has elapsed', () => {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), { key: 'field:diameter', at: 1000 });
      h = recordCheckpoint(h, makeVessel(1), {
        key: 'field:diameter',
        at: 1000 + COALESCE_WINDOW_MS,
      });
      expect(h.past).toHaveLength(2);
    });

    it('caps the undo stack at MAX_HISTORY, dropping the oldest', () => {
      let h = createEmptyHistory();
      for (let i = 0; i < MAX_HISTORY + 5; i++) {
        h = recordCheckpoint(h, makeVessel(i));
      }
      expect(h.past).toHaveLength(MAX_HISTORY);
      // Oldest 5 dropped: the surviving front entry is index 5.
      expect(h.past[0].id).toBe(5);
      expect(h.past[MAX_HISTORY - 1].id).toBe(MAX_HISTORY + 4);
    });
  });

  describe('breakGroup', () => {
    it('ends a group so the next same-key record pushes again', () => {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), { key: 'drag:nozzle:0', at: 1000 });
      h = breakGroup(h);
      h = recordCheckpoint(h, makeVessel(1), { key: 'drag:nozzle:0', at: 1100 });
      // Same key + inside window, but the break forced a new entry.
      expect(h.past).toHaveLength(2);
    });

    it('returns the same reference when already broken', () => {
      const h = createEmptyHistory();
      expect(breakGroup(h)).toBe(h);
    });
  });

  describe('undoStep / redoStep', () => {
    it('round-trips restoring exact references (structural sharing)', () => {
      const v0 = makeVessel(0);
      const v1 = makeVessel(1);

      // Record v0 as the pre-change snapshot; current document is now v1.
      const recorded = recordCheckpoint(createEmptyHistory(), v0);

      const undone = undoStep(recorded, v1)!;
      expect(undone.vessel).toBe(v0); // exact reference, not a copy
      expect(undone.history.past).toEqual([]);
      expect(undone.history.future).toEqual([v1]);

      const redone = redoStep(undone.history, undone.vessel)!;
      expect(redone.vessel).toBe(v1); // exact reference restored
      expect(redone.history.past).toEqual([v0]);
      expect(redone.history.future).toEqual([]);
    });

    it('returns null when undoing with an empty past', () => {
      expect(undoStep(createEmptyHistory(), makeVessel(0))).toBeNull();
    });

    it('returns null when redoing with an empty future', () => {
      expect(redoStep(createEmptyHistory(), makeVessel(0))).toBeNull();
    });

    it('resets the coalescing group on undo', () => {
      let h = recordCheckpoint(createEmptyHistory(), makeVessel(0), {
        key: 'drag:nozzle:0',
        at: 1000,
      });
      const undone = undoStep(h, makeVessel(1))!;
      h = undone.history;
      expect(h.lastKey).toBeNull();
    });
  });
});
