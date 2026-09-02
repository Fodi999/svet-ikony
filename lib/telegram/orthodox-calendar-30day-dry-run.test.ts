import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain data file outside the TS project, see scripts/calendar-seed/data.mjs's own doc comment.
import { DAYS } from '../../scripts/calendar-seed/data.mjs';
import { verifySaintOfDay } from './orthodox-calendar-verifier';

type SeedDay = {
  civilDate: string;
  oldStyle: string;
  reviewRequired?: boolean;
  saint?: { name: string } | null;
  existingCalendarDayId?: string;
};

/**
 * Verification-only dry run (task: "SAINT VERIFICATION DRY RUN") over the
 * full 30-day content population window (civil 2026-09-01..2026-09-30).
 * Calls the REAL verifySaintOfDay() -- the exact function the autopost
 * tick itself calls -- against the REAL candidate name that was written
 * into D1 for each day (scripts/calendar-seed/data.mjs, the same data
 * used to build the seed SQL). Never calls OpenAI, never generates an
 * image, never touches Telegram: this only proves the two-source
 * consensus dataset (orthodox-calendar-sources.ts) actually matches what
 * was seeded, for every day, before autonomous mode ever relies on it.
 */
describe('30-day saint_of_day verification dry run (civil 2026-09-01..2026-09-30)', () => {
  const days = DAYS as SeedDay[];

  it('covers exactly the expected 30-day window', () => {
    expect(days).toHaveLength(30);
    expect(days[0].civilDate).toBe('2026-09-01');
    expect(days[29].civilDate).toBe('2026-09-30');
  });

  it.each(days.map((day) => [day.civilDate, day] as const))('%s', async (civilDate, day) => {
    // '08-19' is the one pre-existing production row from an earlier
    // session; every other day's candidateName is exactly what
    // scripts/calendar-seed/generate-sql.mjs wrote into church_saints.name.
    const candidateName = day.existingCalendarDayId ? 'Мученик Андрій Стратилат' : (day.saint?.name ?? '');

    const result = await verifySaintOfDay({ civilDateIso: civilDate, julianDateIso: day.oldStyle, candidateName });

    if (day.reviewRequired) {
      // No source entry was added for these dates on purpose -- fails
      // closed with 'no_reference_data', exactly like a day nobody ever
      // reviewed at all. This is the deliverable's own REVIEW_REQUIRED
      // marker, not a bug.
      expect(result.verified).toBe(false);
      expect(result.reason).toBe('no_reference_data');
    } else {
      expect(result.reason).toBe('consensus_confirmed');
      expect(result.verified).toBe(true);
      expect(result.sources).toHaveLength(2);
    }
  });
});
