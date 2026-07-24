import { describe, expect, it } from 'vitest';
import type { AppendageConfig } from '../../types';
import { createAppendage, normalizeAppendage } from '../appendage-config';

describe('createAppendage', () => {
  it('creates a complete appendage with a stable unique app-n id', () => {
    const existing = [{ id: 'app-1' }, { id: 'app-3' }] as AppendageConfig[];

    expect(createAppendage(existing)).toMatchObject({
      id: 'app-4',
      endClosure: 'dished',
      headRatio: 2,
      flangeJoint: { show: true },
      visible: true,
      locked: false,
    });
  });
});

describe('normalizeAppendage', () => {
  it('hydrates persisted values and defaults optional rendering fields', () => {
    expect(
      normalizeAppendage({
        id: 'app-9',
        name: 'Boot',
        mountPos: 2200,
        mountAngle: 270,
        diameter: 850,
        length: 1200,
        endClosure: 'open',
        flangeJoint: { show: false, od: 1000 },
      })
    ).toEqual({
      id: 'app-9',
      name: 'Boot',
      mountPos: 2200,
      mountAngle: 270,
      diameter: 850,
      length: 1200,
      endClosure: 'open',
      headRatio: 2,
      flangeJoint: { show: false, od: 1000 },
      nominalThickness: undefined,
      visible: true,
      locked: false,
    });
  });

  it('rejects invalid numeric and closure values in legacy payloads', () => {
    const normalized = normalizeAppendage({
      id: 'app-2',
      mountPos: Number.NaN,
      diameter: 'wide',
      endClosure: 'hemisphere',
    });

    expect(normalized.mountPos).toBe(0);
    expect(normalized.diameter).toBe(1000);
    expect(normalized.endClosure).toBe('flat');
  });
});
