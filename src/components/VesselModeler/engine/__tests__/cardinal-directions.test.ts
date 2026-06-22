import { describe, it, expect } from 'vitest';

import { cardinalForHead } from '../cardinal-directions';

describe('cardinalForHead', () => {
  // The four 90° snaps, grounded in scene-manager's label placement:
  // heading 0 → E at +X (right head), W at −X (left head).
  describe('right head (+X) at the four headings', () => {
    it('faces East at heading 0', () => {
      expect(cardinalForHead('right', 0)).toBe('East');
    });
    it('faces South at heading 90', () => {
      expect(cardinalForHead('right', 90)).toBe('South');
    });
    it('faces West at heading 180', () => {
      expect(cardinalForHead('right', 180)).toBe('West');
    });
    it('faces North at heading 270', () => {
      expect(cardinalForHead('right', 270)).toBe('North');
    });
  });

  describe('left head (−X) at the four headings', () => {
    it('faces West at heading 0', () => {
      expect(cardinalForHead('left', 0)).toBe('West');
    });
    it('faces North at heading 90', () => {
      expect(cardinalForHead('left', 90)).toBe('North');
    });
    it('faces East at heading 180', () => {
      expect(cardinalForHead('left', 180)).toBe('East');
    });
    it('faces South at heading 270', () => {
      expect(cardinalForHead('left', 270)).toBe('South');
    });
  });

  it('always reports opposite directions for the two heads', () => {
    const opposite: Record<string, string> = {
      North: 'South', South: 'North', East: 'West', West: 'East',
    };
    for (let deg = 0; deg < 360; deg += 1) {
      const left = cardinalForHead('left', deg);
      const right = cardinalForHead('right', deg);
      expect(opposite[left]).toBe(right);
    }
  });

  describe('wraparound and normalization', () => {
    it('treats 360 like 0', () => {
      expect(cardinalForHead('right', 360)).toBe('East');
    });
    it('snaps 359 back to East (nearest 90° is 360 ≡ 0)', () => {
      expect(cardinalForHead('right', 359)).toBe('East');
    });
    it('handles negative headings', () => {
      // −90 ≡ 270 → North for the right head
      expect(cardinalForHead('right', -90)).toBe('North');
    });
  });

  describe('rounding to the nearest 90°', () => {
    it('snaps 44° down to the 0° bucket (East)', () => {
      expect(cardinalForHead('right', 44)).toBe('East');
    });
    it('snaps 46° up to the 90° bucket (South)', () => {
      expect(cardinalForHead('right', 46)).toBe('South');
    });
  });
});
