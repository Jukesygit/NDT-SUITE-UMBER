/**
 * Drawing Extraction — Raw Sample Coercion
 *
 * The raw shape of one parsed Gemini response (every leaf nullable) plus the
 * pure coercion that turns arbitrary parsed JSON into a well-typed RawExtraction.
 * Malformed / wrong-typed leaves become null — this is type coercion, never
 * value substitution. Kept separate from the voting logic so each file stays a
 * single concern (and under the line budget).
 */

import type { Orientation } from '../types';
import type { NozzleMount, NozzleOrientation } from './drawing-extraction-voting';

export interface RawNozzle {
  name: string | null;
  pos: number | null;
  proj: number | null;
  angle: number | null;
  size: number | null;
  mount: NozzleMount | null;
  radialOffset: number | null;
  /** Radial vs. side-facing horizontal (see head-nozzle-placement). */
  nozzleOrientation: NozzleOrientation | null;
  /** Signed mm from vessel centerline; horizontal nozzles only. */
  elevation: number | null;
}

export interface RawExtraction {
  id: number | null;
  length: number | null;
  headRatio: number | null;
  orientation: Orientation | null;
  nozzles: RawNozzle[];
  saddles: Array<{ pos: number | null }>;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function orient(v: unknown): Orientation | null {
  return v === 'horizontal' || v === 'vertical' ? v : null;
}

function mount(v: unknown): NozzleMount | null {
  return v === 'shell' || v === 'head-left' || v === 'head-right' ? v : null;
}

function nozzleOrientation(v: unknown): NozzleOrientation | null {
  return v === 'radial' || v === 'horizontal' ? v : null;
}

/**
 * Coerce a parsed JSON value into a RawExtraction. Malformed / wrong-typed
 * leaves become null — this is type coercion, never value substitution.
 */
export function coerceRawExtraction(parsed: unknown): RawExtraction {
  const d = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const nozzles = Array.isArray(d.nozzles)
    ? d.nozzles
        .filter((n): n is Record<string, unknown> => !!n && typeof n === 'object')
        .map((n) => ({
          name: str(n.name),
          pos: num(n.pos),
          proj: num(n.proj),
          angle: num(n.angle),
          size: num(n.size),
          mount: mount(n.mount),
          radialOffset: num(n.radialOffset),
          nozzleOrientation: nozzleOrientation(n.nozzleOrientation),
          elevation: num(n.elevation),
        }))
    : [];
  const saddles = Array.isArray(d.saddles)
    ? d.saddles
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ pos: num(s.pos) }))
    : [];
  return {
    id: num(d.id),
    length: num(d.length),
    headRatio: num(d.headRatio),
    orientation: orient(d.orientation),
    nozzles,
    saddles,
  };
}
