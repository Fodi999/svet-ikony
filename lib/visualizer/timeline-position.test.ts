import { describe, expect, it } from 'vitest';
import { scrubberPercent, scrubberIndexAtClientX } from './timeline-position';

describe('scrubberPercent', () => {
  it('places the first index at 0% and the last at 100%', () => {
    expect(scrubberPercent(0, 4)).toBe(0);
    expect(scrubberPercent(3, 4)).toBe(100);
  });
  it('spaces middle indices evenly by rank, not by any year value', () => {
    expect(scrubberPercent(1, 3)).toBeCloseTo(50);
  });
  it('is always 0 when there is one item or none', () => {
    expect(scrubberPercent(0, 1)).toBe(0);
    expect(scrubberPercent(0, 0)).toBe(0);
  });
});

describe('scrubberIndexAtClientX', () => {
  const rect = { left: 100, width: 200 };
  it('clamps to the first/last index at the track edges', () => {
    expect(scrubberIndexAtClientX(100, rect, 5)).toBe(0);
    expect(scrubberIndexAtClientX(300, rect, 5)).toBe(4);
  });
  it('clamps rather than extrapolating beyond the track', () => {
    expect(scrubberIndexAtClientX(-500, rect, 5)).toBe(0);
    expect(scrubberIndexAtClientX(5000, rect, 5)).toBe(4);
  });
  it('rounds a midpoint to the nearer integer index', () => {
    // 60% across a 5-item (0..4) track = index 2.4, rounds to 2.
    expect(scrubberIndexAtClientX(100 + 200 * 0.6, rect, 5)).toBe(2);
  });
  it('is always index 0 when there is one item or none, regardless of clientX', () => {
    expect(scrubberIndexAtClientX(250, rect, 1)).toBe(0);
    expect(scrubberIndexAtClientX(250, rect, 0)).toBe(0);
  });
});
