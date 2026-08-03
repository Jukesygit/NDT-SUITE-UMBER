// =============================================================================
// nozzle-id — stable ids, legacy migration, and id-correct nozzle deletion
// =============================================================================
// Pins the T2-C invariants: nozzles carry stable `noz-<n>` ids (minted/backfilled,
// never array positions), pipelines reference them by `nozzleId`, and deleting or
// reordering nozzles can no longer silently re-target or orphan piping. The
// headline regression — delete nozzle 0 with piping on nozzle 2 keeps that pipe
// on the SAME physical nozzle — is encoded here.
// =============================================================================

import { describe, it, expect } from 'vitest';

import type { NozzleConfig, Pipeline } from '../../types';
import {
  nextNozzleId,
  backfillNozzleIds,
  findNozzleById,
  migratePipelineNozzleRefs,
  removeNozzleById,
} from '../nozzle-id';

function nozzle(name: string, id = ''): NozzleConfig {
  return { id, name, pos: 100, proj: 200, angle: 90, size: 100 };
}

function pipeline(id: string, nozzleId?: string): Pipeline {
  return {
    id,
    ...(nozzleId ? { nozzleId } : {}),
    pipeDiameter: 100,
    segments: [{ id: `${id}-s`, type: 'straight', rotation: 0, length: 300 }],
  };
}

describe('nextNozzleId', () => {
  it('mints the next free noz-<n>, skipping ids already in use after deletions', () => {
    // Two nozzles remain (noz-1, noz-3); noz-2 was deleted. length+1 = 3 collides,
    // so it skips to noz-4.
    const existing = [nozzle('A', 'noz-1'), nozzle('C', 'noz-3')];
    expect(nextNozzleId(existing)).toBe('noz-4');
  });

  it('mints noz-1 for an empty vessel', () => {
    expect(nextNozzleId([])).toBe('noz-1');
  });
});

describe('backfillNozzleIds', () => {
  it('assigns deterministic positional ids to legacy nozzles with none', () => {
    const out = backfillNozzleIds([nozzle('A'), nozzle('B'), nozzle('C')]);
    expect(out.map((n) => n.id)).toEqual(['noz-1', 'noz-2', 'noz-3']);
  });

  it('is deterministic across repeated loads of the same payload', () => {
    const first = backfillNozzleIds([nozzle('A'), nozzle('B')]);
    const second = backfillNozzleIds([nozzle('A'), nozzle('B')]);
    expect(first.map((n) => n.id)).toEqual(second.map((n) => n.id));
  });

  it('preserves existing ids and stays collision-free when only some are missing', () => {
    const out = backfillNozzleIds([nozzle('A', 'noz-1'), nozzle('B'), nozzle('C', 'noz-2')]);
    // A/C keep their ids; B gets the next free id (noz-3, not the taken noz-1/noz-2).
    expect(out.map((n) => n.id)).toEqual(['noz-1', 'noz-3', 'noz-2']);
  });

  it('returns the original array reference when nothing changes', () => {
    const input = [nozzle('A', 'noz-1'), nozzle('B', 'noz-2')];
    expect(backfillNozzleIds(input)).toBe(input);
  });
});

describe('findNozzleById', () => {
  const nozzles = [nozzle('A', 'noz-1'), nozzle('B', 'noz-2')];

  it('returns the matching nozzle', () => {
    expect(findNozzleById(nozzles, 'noz-2')!.name).toBe('B');
  });

  it('tolerates an undefined id (free-standing pipeline)', () => {
    expect(findNozzleById(nozzles, undefined)).toBeUndefined();
  });
});

describe('migratePipelineNozzleRefs', () => {
  const nozzles = [nozzle('A', 'noz-1'), nozzle('B', 'noz-2'), nozzle('C', 'noz-3')];

  it('resolves a legacy positional index to the anchored nozzle id and drops the index', () => {
    const legacy = { ...pipeline('p'), nozzleIndex: 2 } as Pipeline;
    const [out] = migratePipelineNozzleRefs([legacy], nozzles);
    expect(out.nozzleId).toBe('noz-3');
    expect(out.nozzleIndex).toBeUndefined();
  });

  it('treats nozzleIndex -1 as free-standing (no nozzleId)', () => {
    const legacy = { ...pipeline('p'), nozzleIndex: -1 } as Pipeline;
    const [out] = migratePipelineNozzleRefs([legacy], nozzles);
    expect(out.nozzleId).toBeUndefined();
  });

  it('leaves an already-migrated pipeline (nozzleId set) untouched', () => {
    const migrated = pipeline('p', 'noz-2');
    const [out] = migratePipelineNozzleRefs([migrated], nozzles);
    expect(out).toBe(migrated);
  });

  it('keeps a pipeline free-standing when it carries a freeOrigin', () => {
    const free: Pipeline = { ...pipeline('p'), freeOrigin: { position: [0, 0, 0], direction: [0, 1, 0] } };
    const [out] = migratePipelineNozzleRefs([free], nozzles);
    expect(out.nozzleId).toBeUndefined();
  });
});

describe('removeNozzleById', () => {
  it('deleting nozzle 0 keeps a pipeline on nozzle 2 attached to the SAME nozzle', () => {
    // The historical index-shift bug class: with positional refs, removing an
    // earlier nozzle could silently re-target later piping. Ids make it inherent.
    const nozzles = [nozzle('A', 'noz-1'), nozzle('B', 'noz-2'), nozzle('C', 'noz-3')];
    const pipelines = [pipeline('p-C', 'noz-3')];

    const result = removeNozzleById(nozzles, pipelines, 'noz-1');

    expect(result.nozzles.map((n) => n.name)).toEqual(['B', 'C']);
    // The pipe still points at noz-3, which is still physical nozzle 'C'.
    expect(result.pipelines[0].nozzleId).toBe('noz-3');
    expect(result.nozzles.find((n) => n.id === result.pipelines[0].nozzleId)!.name).toBe('C');
  });

  it('drops the pipelines anchored to the deleted nozzle only', () => {
    const nozzles = [nozzle('A', 'noz-1'), nozzle('B', 'noz-2')];
    const pipelines = [pipeline('p-A', 'noz-1'), pipeline('p-B', 'noz-2'), pipeline('free')];

    const result = removeNozzleById(nozzles, pipelines, 'noz-1');

    expect(result.pipelines.map((p) => p.id)).toEqual(['p-B', 'free']);
  });

  it('preserves array references when the id is not present', () => {
    const nozzles = [nozzle('A', 'noz-1')];
    const pipelines = [pipeline('p-A', 'noz-1')];

    const result = removeNozzleById(nozzles, pipelines, 'noz-9');

    expect(result.nozzles).toBe(nozzles);
    expect(result.pipelines).toBe(pipelines);
  });
});
