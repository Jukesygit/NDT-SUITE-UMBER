import { describe, it, expect } from 'vitest';

import { toConfigStats } from '../composite-stats';

// ---------------------------------------------------------------------------
// Regression: importing a cloud/companion composite must preserve the area
// metrics used by the Scan Coverage "Achieved" column. Before the fix, the
// import handlers mapped only {min,max,mean,median,stdDev} and silently
// dropped validArea/totalArea, so achieved coverage always read 0.
// ---------------------------------------------------------------------------

describe('toConfigStats', () => {
  it('preserves validArea and totalArea from the persisted (CScan) stats shape', () => {
    // This is the actual JSON shape stored in scan_composites.stats — note the
    // field is `stdDev` (not `std`) and it carries area metrics in mm².
    const raw = {
      min: 3.1,
      max: 12.7,
      mean: 8.4,
      median: 8.2,
      stdDev: 1.9,
      validArea: 1_850_000, // mm²
      totalArea: 2_400_000, // mm²
    };

    const result = toConfigStats(raw);

    expect(result.validArea).toBe(1_850_000);
    expect(result.totalArea).toBe(2_400_000);
    expect(result.stdDev).toBe(1.9);
    expect(result.median).toBe(8.2);
  });

  it('falls back to `std` and `mean` when the companion-typed shape is provided', () => {
    // The companion CompositeStats type uses `std` and has no median.
    const raw = { min: 1, max: 5, mean: 3, std: 0.7, validArea: 500_000 };

    const result = toConfigStats(raw);

    expect(result.stdDev).toBe(0.7);
    expect(result.median).toBe(3); // mean used when median absent
    expect(result.validArea).toBe(500_000);
  });

  it('leaves area metrics undefined when the source has none', () => {
    const raw = { min: 0, max: 0, mean: 0, stdDev: 0 };

    const result = toConfigStats(raw);

    expect(result.validArea).toBeUndefined();
    expect(result.totalArea).toBeUndefined();
  });
});
