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
  undoTo,
  redoTo,
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
      expect(h.past[0].vessel).toBe(v0);
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
      expect(h.past[0].vessel.id).toBe(0);
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
      expect(h.past[0].vessel.id).toBe(5);
      expect(h.past[MAX_HISTORY - 1].vessel.id).toBe(MAX_HISTORY + 4);
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
      expect(undone.history.future).toHaveLength(1);
      expect(undone.history.future[0].vessel).toBe(v1); // redo snapshot is exact ref

      const redone = redoStep(undone.history, undone.vessel)!;
      expect(redone.vessel).toBe(v1); // exact reference restored
      expect(redone.history.past).toHaveLength(1);
      expect(redone.history.past[0].vessel).toBe(v0);
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

  describe('labels', () => {
    it('stores the supplied label on a discrete record', () => {
      const h = recordCheckpoint(createEmptyHistory(), makeVessel(0), {
        label: 'Add nozzle',
        at: 1000,
      });
      expect(h.past[0].label).toBe('Add nozzle');
      expect(h.past[0].at).toBe(1000);
    });

    it('falls back to a humanised key when no label is supplied', () => {
      const h = recordCheckpoint(createEmptyHistory(), makeVessel(0), {
        key: 'nozzle:3:angle,pos',
        at: 1000,
      });
      expect(h.past[0].label).toBe('Edit nozzle');
    });

    it("keeps the group's FIRST label through coalescing", () => {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), {
        key: 'drag:nozzle:2',
        label: 'Move nozzle 2',
        at: 1000,
      });
      h = recordCheckpoint(h, makeVessel(1), {
        key: 'drag:nozzle:2',
        label: 'Move nozzle 2',
        at: 1200,
      });
      h = recordCheckpoint(h, makeVessel(2), {
        key: 'drag:nozzle:2',
        label: 'Move nozzle 2',
        at: 1500,
      });
      expect(h.past).toHaveLength(1);
      expect(h.past[0].label).toBe('Move nozzle 2');
    });

    it('carries the label onto the redo stack on undo', () => {
      const h = recordCheckpoint(createEmptyHistory(), makeVessel(0), {
        label: 'Delete weld',
        at: 1000,
      });
      const undone = undoStep(h, makeVessel(1))!;
      expect(undone.history.future[0].label).toBe('Delete weld');
    });
  });

  describe('undoTo / redoTo', () => {
    // Build a 3-deep undo stack: pre-snapshots v0,v1,v2 recorded, current = v3.
    function build3() {
      let h = createEmptyHistory();
      h = recordCheckpoint(h, makeVessel(0), { label: 'e0', at: 100 });
      h = recordCheckpoint(h, makeVessel(1), { label: 'e1', at: 200 });
      h = recordCheckpoint(h, makeVessel(2), { label: 'e2', at: 300 });
      return h; // past = [e0(v0), e1(v1), e2(v2)]
    }

    it('undoTo N steps equals N sequential undoSteps (history + vessel)', () => {
      // Share one base history + current doc so reference identity is comparable
      // (undoStep/undoTo are pure and never mutate their inputs).
      const base = build3();
      const current = makeVessel(3);

      // Fold all three via undoTo(index 0).
      const folded = undoTo(base, current, 0)!;

      // Same result via three sequential undoSteps.
      let h = base;
      let cur = current;
      for (let i = 0; i < 3; i++) {
        const step = undoStep(h, cur)!;
        h = step.history;
        cur = step.vessel;
      }

      expect(folded.vessel).toBe(cur);
      expect(folded.vessel.id).toBe(0);
      expect(folded.history.past).toEqual(h.past);
      expect(folded.history.future).toEqual(h.future);
      expect(folded.history.future).toHaveLength(3);
    });

    it('undoTo to a middle index restores that entry pre-snapshot and stacks the rest for redo', () => {
      const r = undoTo(build3(), makeVessel(3), 1)!;
      expect(r.vessel.id).toBe(1); // past[1].vessel
      expect(r.history.past).toHaveLength(1); // e0 remains
      expect(r.history.future).toHaveLength(2); // e2, e1 moved to redo
    });

    it('undoTo then redoTo is a round-trip back to the current document', () => {
      const start = build3();
      const undone = undoTo(start, makeVessel(3), 0)!;
      // Redo everything back: future is now length 3, jump to index 0.
      const redone = redoTo(undone.history, undone.vessel, 0)!;
      expect(redone.vessel.id).toBe(3); // back to the current doc snapshot
      expect(redone.history.past).toHaveLength(3);
      expect(redone.history.future).toHaveLength(0);
      // past labels preserved end-to-end.
      expect(redone.history.past.map((e) => e.label)).toEqual(['e0', 'e1', 'e2']);
    });

    it('redoTo N steps equals N sequential redoSteps', () => {
      const undone = undoTo(build3(), makeVessel(3), 0)!; // future length 3
      const folded = redoTo(undone.history, undone.vessel, 0)!;

      let h = undone.history;
      let cur = undone.vessel;
      for (let i = 0; i < 3; i++) {
        const step = redoStep(h, cur)!;
        h = step.history;
        cur = step.vessel;
      }
      expect(folded.vessel).toBe(cur);
      expect(folded.history.past).toEqual(h.past);
      expect(folded.history.future).toEqual(h.future);
    });

    it('returns null for out-of-range indices', () => {
      const h = build3();
      expect(undoTo(h, makeVessel(3), -1)).toBeNull();
      expect(undoTo(h, makeVessel(3), 3)).toBeNull();
      expect(redoTo(createEmptyHistory(), makeVessel(0), 0)).toBeNull();
    });
  });
});
