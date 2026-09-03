import { describe, expect, it } from 'vitest';
import { formatChurchDateProse, formatChurchDatesHeading, formatChurchDatesProse } from './church-date-format';

describe('formatChurchDateProse', () => {
  it('2026-09-03 -> "3 вересня"', () => {
    expect(formatChurchDateProse('2026-09-03')).toBe('3 вересня');
  });

  it('2026-08-21 -> "21 серпня" (the Julian counterpart of 2026-09-03)', () => {
    expect(formatChurchDateProse('2026-08-21')).toBe('21 серпня');
  });

  it('is genitive, not nominative -- day-of-month first, no year', () => {
    expect(formatChurchDateProse('2026-01-07')).toBe('7 січня');
    expect(formatChurchDateProse('2026-01-07')).not.toContain('2026');
  });
});

describe('formatChurchDatesProse', () => {
  it('combines civil + Julian for 2026-09-03 civil / 2026-08-21 Julian into one sentence fragment', () => {
    expect(formatChurchDatesProse('2026-09-03', '2026-08-21')).toBe('3 вересня — 21 серпня за юліанським календарем');
  });

  it('never states only the Julian date -- the civil date always leads', () => {
    const result = formatChurchDatesProse('2026-09-03', '2026-08-21');
    expect(result).toContain('3 вересня');
    expect(result).toContain('21 серпня');
    expect(result.indexOf('3 вересня')).toBeLessThan(result.indexOf('21 серпня'));
  });
});

describe('formatChurchDatesHeading', () => {
  it('produces the canonical "civil (Julian за юліанським календарем)" heading form', () => {
    expect(formatChurchDatesHeading('2026-09-03', '2026-08-21')).toBe('3 вересня (21 серпня за юліанським календарем)');
  });
});
