import { describe, expect, it, vi } from 'vitest';

const mockLoadAutopostFacts = vi.fn();
vi.mock('./autopost-content', () => ({ loadAutopostFacts: mockLoadAutopostFacts }));

const { buildSourceCoverageReport } = await import('./source-coverage');

/** Civil 2026-08-30 (Europe/Kyiv, well clear of any UTC-day-boundary edge
 * case) is Julian 2026-08-17 -- see julian-calendar.test.ts. */
const FROM = new Date('2026-08-30T09:00:00.000Z');

describe('buildSourceCoverageReport', () => {
  it('never calls OpenAI, Telegram, or any write path -- reuses loadAutopostFacts read-only, per content type per day', async () => {
    mockLoadAutopostFacts.mockResolvedValue({ status: 'ok', facts: { facts: 'x', sourceType: 'saint', sourceId: '1' } });

    const report = await buildSourceCoverageReport(3, FROM);

    expect(report.rows).toHaveLength(3);
    // 5 content types x 3 days
    expect(mockLoadAutopostFacts).toHaveBeenCalledTimes(15);
  });

  it('reports the correct civil and Julian date per row, one day apart', async () => {
    mockLoadAutopostFacts.mockResolvedValue({ status: 'ok', facts: { facts: 'x', sourceType: 'saint', sourceId: '1' } });

    const report = await buildSourceCoverageReport(2, FROM);

    expect(report.rows[0]).toMatchObject({ civilDateIso: '2026-08-30', julianDateIso: '2026-08-17' });
    expect(report.rows[1]).toMatchObject({ civilDateIso: '2026-08-31', julianDateIso: '2026-08-18' });
  });

  it('marks a content type MISSING when the source is missing entirely, without inventing data', async () => {
    mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });

    const report = await buildSourceCoverageReport(1, FROM);

    expect(report.rows[0].availability).toEqual({
      morning_prayer: 'MISSING',
      saint_of_day: 'MISSING',
      gospel: 'MISSING',
      faith_story: 'MISSING',
      evening_prayer: 'MISSING',
    });
  });

  it('marks a content type MISSING when the calendar day exists but that type has no matching row (insufficient_data)', async () => {
    mockLoadAutopostFacts.mockImplementation(async (contentType: string) =>
      contentType === 'gospel' ? { status: 'insufficient_data' } : { status: 'ok', facts: { facts: 'x', sourceType: 't', sourceId: '1' } },
    );

    const report = await buildSourceCoverageReport(1, FROM);

    expect(report.rows[0].availability.gospel).toBe('MISSING');
    expect(report.rows[0].availability.morning_prayer).toBe('available');
  });

  it('defaults to a 7-day report starting today when called with no arguments', async () => {
    mockLoadAutopostFacts.mockResolvedValue({ status: 'missing_source' });

    const report = await buildSourceCoverageReport();

    expect(report.rows).toHaveLength(7);
  });
});
