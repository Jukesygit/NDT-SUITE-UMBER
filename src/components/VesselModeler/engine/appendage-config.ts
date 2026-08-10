// =============================================================================
// Appendage Config — Normalization & Factory
// =============================================================================
// Single load-time defaulting point for appendage bodies, mirroring
// `normalizeDomeScanComposite` (dome-scan-geometry.ts): every persisted
// appendage flows through `normalizeAppendage` on BOTH load paths so no
// downstream consumer (body-frame, geometry, structuralHash, stats) can read a
// property off `undefined`. `createAppendage` mints a fresh appendage with the
// design defaults and a stable, collision-free id.
//
// See docs/plans/2026-07-21-secondary-appendage-body-design.md §5, §11.
// =============================================================================

import type { AppendageConfig, AppendageEndClosure } from '../types';

/** Default head ratio for a dished end closure. */
const DEFAULT_HEAD_RATIO = 2.0;

/** Coerce an unknown value into a valid end closure; anything unrecognized -> 'flat'. */
function normalizeEndClosure(raw: unknown): AppendageEndClosure {
  return raw === 'dished' || raw === 'flat' || raw === 'open' ? raw : 'flat';
}

/** Coerce an unknown flange-joint value; absent -> undefined, present -> defaulted. */
function normalizeFlangeJoint(raw: unknown): AppendageConfig['flangeJoint'] {
  if (raw === null || typeof raw !== 'object') return undefined;
  const f = raw as { show?: unknown; od?: unknown; thickness?: unknown };
  return {
    show: f.show !== false,
    ...(typeof f.od === 'number' ? { od: f.od } : {}),
    ...(typeof f.thickness === 'number' ? { thickness: f.thickness } : {}),
  };
}

/** Read a numeric field with a fallback when absent/non-numeric. */
function num(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

/**
 * Normalize a raw appendage (as restored from a saved project) into a
 * fully-formed {@link AppendageConfig}. Every field gets a sane default so the
 * loaded shape is always complete regardless of which persistence era wrote it.
 */
export function normalizeAppendage(raw: Record<string, unknown>): AppendageConfig {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `app-${Date.now()}`,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Boot',
    mountPos: num(raw.mountPos, 0),
    mountAngle: num(raw.mountAngle, 270),
    diameter: num(raw.diameter, 1000),
    length: num(raw.length, 1500),
    endClosure: normalizeEndClosure(raw.endClosure),
    headRatio: num(raw.headRatio, DEFAULT_HEAD_RATIO),
    flangeJoint: normalizeFlangeJoint(raw.flangeJoint),
    nominalThickness: typeof raw.nominalThickness === 'number' ? raw.nominalThickness : undefined,
    visible: raw.visible !== false,
    locked: raw.locked === true,
  };
}

/**
 * Create a new appendage with the design defaults (§P1-T1). The id is
 * `app-<n>`, guaranteed unique against the existing ids even after deletions
 * have left gaps in the numbering.
 */
export function createAppendage(existing: AppendageConfig[]): AppendageConfig {
  const usedIds = new Set(existing.map((a) => a.id));
  let n = existing.length + 1;
  while (usedIds.has(`app-${n}`)) {
    n += 1;
  }
  return {
    id: `app-${n}`,
    name: `Boot ${n}`,
    mountPos: 0,
    mountAngle: 270,
    diameter: 1000,
    length: 1500,
    endClosure: 'dished',
    headRatio: DEFAULT_HEAD_RATIO,
    flangeJoint: { show: true },
    visible: true,
    locked: false,
  };
}
