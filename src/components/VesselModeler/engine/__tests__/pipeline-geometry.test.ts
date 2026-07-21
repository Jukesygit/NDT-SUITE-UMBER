import { describe, it, expect } from 'vitest';

import { isTerminalSegment, type PipeSegmentType } from '../../types';

// ---------------------------------------------------------------------------
// isTerminalSegment — single source of truth for "this part closes the run".
// Cap and dome end a pipeline; everything else keeps the chain open.
// ---------------------------------------------------------------------------

describe('isTerminalSegment', () => {
  it('treats cap and dome as terminal', () => {
    expect(isTerminalSegment('cap')).toBe(true);
    expect(isTerminalSegment('dome')).toBe(true);
  });

  it('treats all pass-through parts as non-terminal', () => {
    const open: PipeSegmentType[] = ['straight', 'elbow', 'reducer', 'tee', 'valve', 'flange'];
    for (const type of open) {
      expect(isTerminalSegment(type)).toBe(false);
    }
  });
});
