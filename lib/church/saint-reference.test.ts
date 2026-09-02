import { afterEach, describe, expect, it, vi } from 'vitest';

function searchResponse(titles: string[]) {
  return new Response(JSON.stringify({ query: { search: titles.map((title) => ({ title })) } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function summaryResponse(overrides: Record<string, unknown>) {
  return new Response(
    JSON.stringify({
      title: 'Флор і Лавр',
      description: 'християнські мученики',
      extract: 'Флор і Лавр -- святі мученики, брати, каменотеси.',
      originalimage: { source: 'https://upload.wikimedia.org/flor-lavr.jpg' },
      content_urls: { desktop: { page: 'https://uk.wikipedia.org/wiki/Флор_і_Лавр' } },
      ...overrides,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * lookupVerifiedSaintReference() never makes a real network call in tests
 * (task: "NO real Wikipedia network calls in tests") -- every test here
 * stubs global fetch with a fixture response or a rejection.
 */
describe('lookupVerifiedSaintReference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns verified with the reference image for a clear, correctly-classified match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Флор і Лавр'])).mockResolvedValueOnce(summaryResponse({})),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Мученики Флор і Лавр' });

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') throw new Error('unreachable');
    expect(result.reference.sourceImageUrl).toBe('https://upload.wikimedia.org/flor-lavr.jpg');
    expect(result.reference.sourcePageUrl).toBe('https://uk.wikipedia.org/wiki/Флор_і_Лавр');
    expect(result.reference.sourceProvider).toBe('wikipedia');
  });

  it('strips role prefixes (Апостол/Пророк/etc.) before searching and comparing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(searchResponse(['Самуїл (пророк)']))
      .mockResolvedValueOnce(
        summaryResponse({ title: 'Самуїл (пророк)', description: 'біблійний пророк', extract: 'Самуїл -- один із пророків Ізраїлю.' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });

    expect(result.status).toBe('verified');
    const [firstCallUrl] = fetchMock.mock.calls[0];
    expect(String(firstCallUrl)).toContain(encodeURIComponent('Самуїл'));
    expect(String(firstCallUrl)).not.toContain(encodeURIComponent('Пророк Самуїл'));
  });

  it('returns not_found when the search returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(searchResponse([])));
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Невідомий Святий' });
    expect(result.status).toBe('not_found');
  });

  it('returns ambiguous for a disambiguation page, never treating it as a match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Тадей'])).mockResolvedValueOnce(summaryResponse({ type: 'disambiguation' })),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Апостол Тадей' });
    expect(result.status).toBe('ambiguous');
  });

  it('rejects a candidate with no sanctity-classification keyword at all (likely an unrelated same-named topic)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Самуїл (місто)'])).mockResolvedValueOnce(
        summaryResponse({
          title: 'Самуїл (місто)',
          description: 'населений пункт',
          extract: 'Самуїл -- село в Болгарії.',
        }),
      ),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });
    expect(result.status).toBe('not_found');
  });

  it('rejects a candidate whose title/text shares no part of the queried name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Зовсім інша особа'])).mockResolvedValueOnce(
        summaryResponse({ title: 'Зовсім інша особа', description: 'святий', extract: 'Це геть інша людина.' }),
      ),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });
    expect(result.status).toBe('not_found');
  });

  it('requires every part of a compound name (Флор і Лавр) to be matchable, not just one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Флор (святий)'])).mockResolvedValueOnce(
        summaryResponse({ title: 'Флор (святий)', description: 'мученик', extract: 'Святий Флор -- мученик.' }),
      ),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    // Only "Флор" appears anywhere in the candidate -- "Лавр" is missing.
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });

  it('rejects a candidate with no usable image even if everything else matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(searchResponse(['Флор і Лавр']))
        .mockResolvedValueOnce(summaryResponse({ originalimage: undefined, thumbnail: undefined })),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });

  /** The exact case named in the task: Thaddeus of Edessa/Addai (one of
   * the Seventy) must never be conflated with Jude Thaddeus (one of the
   * Twelve) just because the Ukrainian name "Тадей" matches both. */
  it('rejects a candidate that contradicts our already-known classification (Thaddeus of Edessa/Addai vs Jude Thaddeus)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Юда Тадей'])).mockResolvedValueOnce(
        summaryResponse({
          title: 'Юда Тадей',
          description: 'апостол',
          extract: 'Юда Тадей -- один із дванадцяти апостолів Ісуса Христа.',
        }),
      ),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({
      name: 'Апостол Тадей з числа 70-ти',
      knownFacts: 'Один із сімдесяти апостолів Христових, що приніс Євангеліє в місто Едесу.',
    });

    expect(result.status).toBe('not_found');
  });

  it('accepts a correctly-classified candidate that does NOT contradict known facts (no false-positive from the contradiction check)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Тадей Едеський'])).mockResolvedValueOnce(
        summaryResponse({
          title: 'Тадей Едеський',
          description: 'апостол від 70-ти',
          extract: 'Тадей (Аддай) Едеський -- один із сімдесяти апостолів, що проповідував в Едессі.',
        }),
      ),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({
      name: 'Апостол Тадей з числа 70-ти',
      knownFacts: 'Один із сімдесяти апостолів Христових, що приніс Євангеліє в місто Едесу.',
    });

    expect(result.status).toBe('verified');
  });

  it('fails gracefully (network_error) when the search request itself rejects, never throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('network_error');
  });

  it('fails gracefully (network_error) when the summary request rejects after a successful search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(searchResponse(['Флор і Лавр'])).mockRejectedValueOnce(new TypeError('network down')),
    );
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('network_error');
  });

  it('fails gracefully (not_found) when the search endpoint returns a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const { lookupVerifiedSaintReference } = await import('./saint-reference');

    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });
});
