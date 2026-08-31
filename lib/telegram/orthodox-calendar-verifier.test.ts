import { describe, expect, it, vi } from 'vitest';

describe('verifySaintOfDay', () => {
  it('FAILS verification when the D1 candidate does not match the two-source consensus (the real Cyprian/Florus+Laurus discrepancy)', async () => {
    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');

    // Real production incident: church_calendar_days had date_old_style
    // '2026-08-18' paired with a saint named "Кипріан Карфагенський", but
    // OCA and OrthodoxWiki both independently attribute old-style August 18
    // to Martyrs Florus and Laurus, not Cyprian.
    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Священномученик Кипріан, єпископ Карфагенський',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('candidate_name_mismatch');
    expect(result.civilDate).toBe('2026-08-31');
    expect(result.julianDate).toBe('2026-08-18');
    expect(result.sources).toHaveLength(2);
    expect(result.commemorations.map((c) => c.name)).toEqual(['Флор', 'Лавр']);
  });

  it('VERIFIES when the D1 candidate matches the two-source consensus (Florus and Laurus)', async () => {
    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');

    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Мученики Флор і Лавр',
    });

    expect(result.verified).toBe(true);
    expect(result.reason).toBe('consensus_confirmed');
    expect(result.sources).toEqual(['OCA (oca.org/saints/all-lives/2020/08/18)', 'OrthodoxWiki (orthodoxwiki.org/August_18)']);
    expect(result.commemorations.map((c) => c.name)).toEqual(['Флор', 'Лавр']);
  });

  it('matches when the candidate names only the second co-martyr', async () => {
    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');

    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Мученик Лавр',
    });

    expect(result.verified).toBe(true);
  });

  it('fails closed with no_reference_data for a date with no curated entry at all', async () => {
    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');

    const result = await verifySaintOfDay({
      civilDateIso: '2026-01-05',
      julianDateIso: '2025-12-23',
      candidateName: 'Будь-який святий',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('no_reference_data');
    expect(result.sources).toEqual([]);
  });
});

describe('verifySaintOfDay -- fail-closed on source failures', () => {
  it('fails closed with source_unavailable when a source lookup rejects (external source temporarily unavailable)', async () => {
    vi.resetModules();
    vi.doMock('./orthodox-calendar-sources', async () => {
      const actual = await vi.importActual<typeof import('./orthodox-calendar-sources')>('./orthodox-calendar-sources');
      return {
        ...actual,
        lookupSourceA: vi.fn().mockRejectedValue(new Error('network timeout')),
      };
    });

    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');
    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Мученики Флор і Лавр',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('source_unavailable');

    vi.doUnmock('./orthodox-calendar-sources');
    vi.resetModules();
  });

  it('fails closed with insufficient_sources when only one of the two sources has data for the date', async () => {
    vi.resetModules();
    vi.doMock('./orthodox-calendar-sources', async () => {
      const actual = await vi.importActual<typeof import('./orthodox-calendar-sources')>('./orthodox-calendar-sources');
      return { ...actual, lookupSourceB: vi.fn().mockResolvedValue(null) };
    });

    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');
    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Мученики Флор і Лавр',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('insufficient_sources');

    vi.doUnmock('./orthodox-calendar-sources');
    vi.resetModules();
  });

  it('fails closed with sources_disagree when the two sources share no commemoration names', async () => {
    vi.resetModules();
    vi.doMock('./orthodox-calendar-sources', async () => {
      const actual = await vi.importActual<typeof import('./orthodox-calendar-sources')>('./orthodox-calendar-sources');
      return {
        ...actual,
        lookupSourceB: vi.fn().mockResolvedValue({ source: 'Disagreeing Source', commemorations: [{ name: 'Зовсім Інший', rank: 'святий' }] }),
      };
    });

    const { verifySaintOfDay } = await import('./orthodox-calendar-verifier');
    const result = await verifySaintOfDay({
      civilDateIso: '2026-08-31',
      julianDateIso: '2026-08-18',
      candidateName: 'Мученики Флор і Лавр',
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe('sources_disagree');

    vi.doUnmock('./orthodox-calendar-sources');
    vi.resetModules();
  });
});
