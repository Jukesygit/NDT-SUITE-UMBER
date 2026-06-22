import { describe, it, expect } from 'vitest';
import { snapAngleToIncrement } from '../interaction-manager';

// ---------------------------------------------------------------------------
// snapAngleToIncrement — angle snapping for nozzle / lifting-lug drags
// ---------------------------------------------------------------------------

describe('snapAngleToIncrement', () => {
  it('rounds to the nearest multiple of the increment', () => {
    expect(snapAngleToIncrement(91, 5)).toBe(90);
    expect(snapAngleToIncrement(89, 5)).toBe(90);
    expect(snapAngleToIncrement(93, 5)).toBe(95);
    expect(snapAngleToIncrement(92, 5)).toBe(90);
    expect(snapAngleToIncrement(271, 10)).toBe(270);
    expect(snapAngleToIncrement(44, 45)).toBe(45);
    expect(snapAngleToIncrement(200, 90)).toBe(180);
  });

  it('keeps exact multiples unchanged', () => {
    expect(snapAngleToIncrement(90, 5)).toBe(90);
    expect(snapAngleToIncrement(0, 45)).toBe(0);
    expect(snapAngleToIncrement(270, 90)).toBe(270);
  });

  it('normalises a round-up to 360 back to 0', () => {
    // 358 with a 5° increment rounds to 360, which must wrap to 0
    expect(snapAngleToIncrement(358, 5)).toBe(0);
    // 359 with a 90° increment rounds to 360 -> 0
    expect(snapAngleToIncrement(359, 90)).toBe(0);
  });

  it('keeps results within [0, 360)', () => {
    for (let deg = 0; deg < 360; deg += 0.5) {
      for (const inc of [1, 5, 10, 15, 30, 45, 90]) {
        const out = snapAngleToIncrement(deg, inc);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThan(360);
        // Result is always a clean multiple of the increment (mod 360)
        expect(out % inc).toBe(0);
      }
    }
  });

  it('passes the angle through unchanged when the increment is not positive', () => {
    expect(snapAngleToIncrement(91, 0)).toBe(91);
    expect(snapAngleToIncrement(91, -5)).toBe(91);
    expect(snapAngleToIncrement(123.4, 0)).toBe(123.4);
  });

  it('snaps at the rounding midpoint consistently', () => {
    // 92.5 is exactly between 90 and 95 — Math.round rounds half up
    expect(snapAngleToIncrement(92.5, 5)).toBe(95);
  });
});
