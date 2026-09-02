import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupVerifiedSaintReference } from './saint-reference';

/**
 * lookupVerifiedSaintReference() never makes a real network call in tests
 * (task: "NO real Wikipedia network calls in tests") -- every test here
 * stubs global fetch. Most tests use a small URL-routing fake (below)
 * rather than an ordered mockResolvedValueOnce() chain: the resolver now
 * calls up to ~10 different endpoints across up to 5 providers depending
 * on the path taken (uk/ru Wikipedia, Wikidata search+entity, Commons
 * category/search+imageinfo), so a strict call-order chain would silently
 * start returning `undefined` for the N+1th call once exhausted -- which
 * (correctly) reads as a network error to the resolver, but would make
 * these fixtures assert the wrong thing for reasons that have nothing to
 * do with what each test is actually checking. Routing by URL keeps each
 * test's fixture scoped to only the providers it cares about; every
 * unmatched call gets a safe "nothing here" response.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface Route {
  test: (url: string) => boolean;
  response: () => Response;
}

function installRoutes(routes: Route[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const route = routes.find((r) => r.test(url));
      return route ? route.response() : jsonResponse({});
    }),
  );
}

function wikiSearchRoute(host: string, titles: string[]): Route {
  return {
    test: (url) => url.includes(host) && url.includes('list=search'),
    response: () => jsonResponse({ query: { search: titles.map((title) => ({ title })) } }),
  };
}

function wikiSummaryRoute(host: string, title: string, overrides: Record<string, unknown> = {}): Route {
  const encodedTitle = encodeURIComponent(title);
  return {
    test: (url) => url.includes(host) && url.includes(`/page/summary/${encodedTitle}`),
    response: () =>
      jsonResponse({
        title,
        description: '',
        extract: '',
        originalimage: { source: `https://upload.wikimedia.org/${encodedTitle}.jpg` },
        content_urls: { desktop: { page: `https://${host}/wiki/${encodedTitle}` } },
        ...overrides,
      }),
  };
}

function wikidataSearchRoute(language: 'uk' | 'ru', hits: { id: string; description?: string }[]): Route {
  return {
    test: (url) => url.includes('wikidata.org') && url.includes('action=wbsearchentities') && url.includes(`language=${language}`),
    response: () => jsonResponse({ search: hits }),
  };
}

function wikidataEntityRoute(qid: string, sitelinks: Partial<Record<'uk' | 'ru' | 'en', string>>, commonsCategory?: string): Route {
  const entitySitelinks: Record<string, { title: string }> = {};
  for (const [lang, title] of Object.entries(sitelinks)) entitySitelinks[`${lang}wiki`] = { title: title as string };
  const claims = commonsCategory ? { P373: [{ mainsnak: { datavalue: { value: commonsCategory } } }] } : {};
  return {
    test: (url) => url.includes('wikidata.org') && url.includes('action=wbgetentities') && url.includes(`ids=${qid}`),
    response: () => jsonResponse({ entities: { [qid]: { sitelinks: entitySitelinks, claims } } }),
  };
}

function commonsCategoryRoute(category: string, hits: { title: string }[]): Route {
  return {
    test: (url) => url.includes('commons.wikimedia.org') && url.includes('list=categorymembers') && url.includes(encodeURIComponent(category)),
    response: () => jsonResponse({ query: { categorymembers: hits } }),
  };
}

function commonsSearchRoute(matchQuery: string, hits: { title: string }[]): Route {
  return {
    test: (url) => url.includes('commons.wikimedia.org') && url.includes('list=search') && url.includes(encodeURIComponent(matchQuery)),
    response: () => jsonResponse({ query: { search: hits } }),
  };
}

function commonsImageInfoRoute(fileTitle: string, info: { url: string; author?: string; license?: string; attribution?: string }): Route {
  const title = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
  return {
    test: (url) => url.includes('commons.wikimedia.org') && url.includes('prop=imageinfo') && url.includes(encodeURIComponent(title)),
    response: () =>
      jsonResponse({
        query: {
          pages: {
            '1': {
              imageinfo: [
                {
                  url: info.url,
                  extmetadata: {
                    ...(info.author ? { Artist: { value: info.author } } : {}),
                    ...(info.license ? { LicenseShortName: { value: info.license } } : {}),
                    ...(info.attribution ? { Attribution: { value: info.attribution } } : {}),
                  },
                },
              ],
            },
          },
        },
      }),
  };
}

describe('lookupVerifiedSaintReference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns verified with the reference image for a clear, correctly-classified UK match', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Флор і Лавр']),
      wikiSummaryRoute('uk.wikipedia.org', 'Флор і Лавр', {
        description: 'християнські мученики',
        extract: 'Флор і Лавр -- святі мученики, брати, каменотеси.',
      }),
    ]);

    const result = await lookupVerifiedSaintReference({ name: 'Мученики Флор і Лавр' });

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') throw new Error('unreachable');
    expect(result.reference.sourceImageUrl).toBe(`https://upload.wikimedia.org/${encodeURIComponent('Флор і Лавр')}.jpg`);
    expect(result.reference.sourcePageUrl).toBe(`https://uk.wikipedia.org/wiki/${encodeURIComponent('Флор і Лавр')}`);
    expect(result.reference.sourceProvider).toBe('wikipedia');
    expect(result.reference.sourceLanguage).toBe('uk');
  });

  it('strips role prefixes (Апостол/Пророк/etc.) before searching and comparing', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Самуїл (пророк)']),
      wikiSummaryRoute('uk.wikipedia.org', 'Самуїл (пророк)', { description: 'біблійний пророк', extract: 'Самуїл -- один із пророків Ізраїлю.' }),
    ]);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });

    expect(result.status).toBe('verified');
    const [firstCallUrl] = fetchMock.mock.calls[0];
    expect(String(firstCallUrl)).toContain(encodeURIComponent('Самуїл'));
    expect(String(firstCallUrl)).not.toContain(encodeURIComponent('Пророк Самуїл'));
  });

  it('returns not_found when every provider (uk/ru wikipedia, wikidata) returns nothing', async () => {
    installRoutes([]); // every call falls through to the default empty response
    const result = await lookupVerifiedSaintReference({ name: 'Невідомий Святий' });
    expect(result.status).toBe('not_found');
  });

  it('returns ambiguous for a disambiguation page, never treating it as a match', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Тадей']),
      wikiSummaryRoute('uk.wikipedia.org', 'Тадей', { type: 'disambiguation' }),
    ]);
    const result = await lookupVerifiedSaintReference({ name: 'Апостол Тадей' });
    expect(result.status).toBe('ambiguous');
  });

  it('rejects a candidate with no sanctity-classification keyword at all (likely an unrelated same-named topic)', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Самуїл (місто)']),
      wikiSummaryRoute('uk.wikipedia.org', 'Самуїл (місто)', { description: 'населений пункт', extract: 'Самуїл -- село в Болгарії.' }),
    ]);
    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });
    expect(result.status).toBe('not_found');
  });

  it('rejects a candidate whose title/text shares no part of the queried name', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Зовсім інша особа']),
      wikiSummaryRoute('uk.wikipedia.org', 'Зовсім інша особа', { description: 'святий', extract: 'Це геть інша людина.' }),
    ]);
    const result = await lookupVerifiedSaintReference({ name: 'Пророк Самуїл' });
    expect(result.status).toBe('not_found');
  });

  it('requires every part of a compound name (Флор і Лавр) to be matchable, not just one', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Флор (святий)']),
      wikiSummaryRoute('uk.wikipedia.org', 'Флор (святий)', { description: 'мученик', extract: 'Святий Флор -- мученик.' }),
    ]);
    // Only "Флор" appears anywhere in the candidate -- "Лавр" is missing.
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });

  it('rejects a candidate with no usable image even if everything else matches', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Флор і Лавр']),
      wikiSummaryRoute('uk.wikipedia.org', 'Флор і Лавр', { originalimage: undefined, thumbnail: undefined }),
    ]);
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });

  /** The exact case named in an earlier stage's task: Thaddeus of
   * Edessa/Addai (one of the Seventy) must never be conflated with Jude
   * Thaddeus (one of the Twelve) just because the Ukrainian name "Тадей"
   * matches both. */
  it('rejects a candidate that contradicts our already-known classification (Thaddeus of Edessa/Addai vs Jude Thaddeus)', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Юда Тадей']),
      wikiSummaryRoute('uk.wikipedia.org', 'Юда Тадей', { description: 'апостол', extract: 'Юда Тадей -- один із дванадцяти апостолів Ісуса Христа.' }),
    ]);
    const result = await lookupVerifiedSaintReference({
      name: 'Апостол Тадей з числа 70-ти',
      knownFacts: 'Один із сімдесяти апостолів Христових, що приніс Євангеліє в місто Едесу.',
    });
    expect(result.status).toBe('not_found');
  });

  it('accepts a correctly-classified candidate that does NOT contradict known facts (no false-positive from the contradiction check)', async () => {
    installRoutes([
      wikiSearchRoute('uk.wikipedia.org', ['Тадей Едеський']),
      wikiSummaryRoute('uk.wikipedia.org', 'Тадей Едеський', {
        description: 'апостол від 70-ти',
        extract: 'Тадей (Аддай) Едеський -- один із сімдесяти апостолів, що проповідував в Едессі.',
      }),
    ]);
    const result = await lookupVerifiedSaintReference({
      name: 'Апостол Тадей з числа 70-ти',
      knownFacts: 'Один із сімдесяти апостолів Христових, що приніс Євангеліє в місто Едесу.',
    });
    expect(result.status).toBe('verified');
  });

  it('fails gracefully (network_error) when every provider is unreachable, never throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('network_error');
  });

  it('fails gracefully (network_error) when the uk summary request fails after a successful search, and ru/wikidata also fail', async () => {
    const searchHit = jsonResponse({ query: { search: [{ title: 'Флор і Лавр' }] } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('uk.wikipedia.org') && url.includes('list=search')) return searchHit;
        if (url.includes('/page/summary/')) throw new TypeError('network down');
        throw new TypeError('network down');
      }),
    );
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('network_error');
  });

  it('fails gracefully (not_found) when the search endpoint returns a non-OK response from every provider', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const result = await lookupVerifiedSaintReference({ name: 'Флор і Лавр' });
    expect(result.status).toBe('not_found');
  });

  it('continues to the next provider when one is unreachable (uk network failure, ru succeeds)', async () => {
    installRoutes([
      wikiSearchRoute('ru.wikipedia.org', ['Кирик і Уліта']),
      wikiSummaryRoute('ru.wikipedia.org', 'Кирик і Уліта', { description: 'мученики', extract: 'Кирик і Уліта -- християнські мученики.' }),
    ]);
    const routedFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('uk.wikipedia.org')) throw new TypeError('network down');
      return (routedFetch as (i: unknown) => Promise<Response>)(input);
    }));

    const result = await lookupVerifiedSaintReference({ name: 'Мученики Кирик і Уліта' });

    expect(result.status).toBe('verified');
    if (result.status !== 'verified') throw new Error('unreachable');
    expect(result.reference.sourceLanguage).toBe('ru');
  });

  // ---------------------------------------------------------------------
  // Cross-language identity resolution (general architecture, not an
  // Agathonicus-only special case -- see the module's own doc comment).
  // ---------------------------------------------------------------------

  describe('cross-language identity resolution', () => {
    it('UK miss -> RU direct search hit (no Wikidata needed)', async () => {
      installRoutes([
        wikiSearchRoute('ru.wikipedia.org', ['Мученики Кирик і Уліта']),
        wikiSummaryRoute('ru.wikipedia.org', 'Мученики Кирик і Уліта', {
          description: 'християнські мученики',
          extract: 'Кирик і Уліта постраждали за віру Христову.',
        }),
      ]);
      const result = await lookupVerifiedSaintReference({ name: 'Мученики Кирик і Уліта' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.sourceLanguage).toBe('ru');
    });

    it('UK/RU miss -> Wikidata resolves an EN sitelink (generic case, not Agathonicus)', async () => {
      installRoutes([
        wikidataSearchRoute('uk', [{ id: 'Q999001', description: 'Christian martyr' }]),
        wikidataEntityRoute('Q999001', { en: 'Example Martyr of Testville' }),
        wikiSummaryRoute('en.wikipedia.org', 'Example Martyr of Testville', {
          description: 'Christian martyr',
          extract: 'Saint Example was martyred for his Christian faith in Testville.',
        }),
      ]);
      const result = await lookupVerifiedSaintReference({ name: 'Мученик Приклад Тествільський' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.sourceLanguage).toBe('en');
      expect(result.reference.wikidataId).toBe('Q999001');
    });

    it('accepts a candidate whose name string is completely different from the query once Wikidata confirms the same Q-id (no exact-string-only rejection)', async () => {
      installRoutes([
        wikidataSearchRoute('ru', [{ id: 'Q42', description: 'Christian saint' }]),
        wikidataEntityRoute('Q42', { en: 'Totally Different Latin Name' }),
        wikiSummaryRoute('en.wikipedia.org', 'Totally Different Latin Name', {
          description: 'Christian saint',
          extract: 'This saint is venerated under a completely different name in English sources.',
        }),
      ]);
      // The queried Cyrillic name never appears anywhere in the English
      // candidate's text -- verification must still succeed, because
      // identity was already confirmed by Wikidata's own search, not by
      // string-matching the resolved article's text.
      const result = await lookupVerifiedSaintReference({ name: 'Зовсім Інше Ім’я' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.wikidataId).toBe('Q42');
    });

    /**
     * THE regression fixture (task section 15): "Мученик Агафоник
     * Никомидійський" must resolve to Saint Agathonicus of Nicomedia
     * (Wikidata Q3564977) via the uk-miss -> Wikidata -> en-sitelink path,
     * fully mocked/deterministic -- this models the real gap found in
     * production (uk.wikipedia.org has totalhits: 0 for this saint under
     * any spelling tested; en.wikipedia.org has a dedicated "Agathonicus"
     * article sharing Wikidata item Q3564977 with ru.wikipedia.org).
     */
    it('regression: Мученик Агафоник Никомидійський -> Agathonicus (Q3564977) via Wikidata, when uk/ru direct search both miss', async () => {
      installRoutes([
        // uk/ru direct search: both empty, matching the real production finding.
        wikidataSearchRoute('uk', []),
        wikidataSearchRoute('ru', [
          { id: 'Q527379', description: 'asteroid' }, // decoy: "3326 Agafonikov" -- rejected by description filter
          { id: 'Q3564977', description: '3rd-century Christian martyr' }, // the real saint
          { id: 'Q30887603', description: 'Roman Catholic bishop' }, // decoy: modern namesake, never reached (candidate cap)
        ]),
        wikidataEntityRoute('Q3564977', { en: 'Agathonicus', ru: 'Мученики Агафоник, Зотик, Феопрепий, Акиндин, Севериан, Зинон' }, 'Agathonikos of Nikomedeia'),
        wikiSummaryRoute('en.wikipedia.org', 'Agathonicus', {
          description: '3rd-century Christian martyr',
          extract: 'Saint Agathonicus was a 3rd-century citizen of Nicomedia martyred under Emperor Maximian.',
          wikibase_item: 'Q3564977',
        }),
        commonsCategoryRoute('Agathonikos of Nikomedeia', [
          { title: 'File:CIL XIII 2099.jpg' }, // wrong: unrelated Roman inscription, no accept keyword
          { title: 'File:Saint Agathonikos of Nikomedeia Mosaic Medallion, Chora.jpg' }, // correct: mosaic
        ]),
        commonsImageInfoRoute('File:Saint Agathonikos of Nikomedeia Mosaic Medallion, Chora.jpg', {
          url: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Saint_Agathonikos_of_Nikomedeia_Mosaic_Medallion%2C_Chora.jpg',
          license: 'Public domain',
        }),
      ]);

      const result = await lookupVerifiedSaintReference({ name: 'Мученик Агафоник Никомидійський' });

      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.wikidataId).toBe('Q3564977');
      // Wikidata's asteroid decoy (Q527379) never wins just by being listed
      // first -- the description filter skips it before it's ever fetched.
      expect(result.reference.sourceProvider).toBe('commons');
      expect(result.reference.commonsFileTitle).toBe('File:Saint Agathonikos of Nikomedeia Mosaic Medallion, Chora.jpg');
      expect(result.reference.sourceImageUrl).toContain('Agathonikos_of_Nikomedeia_Mosaic');
    });
  });

  // ---------------------------------------------------------------------
  // Wikimedia Commons upgrade -- only ever runs after identity is already
  // verified via Wikipedia/Wikidata.
  // ---------------------------------------------------------------------

  describe('Commons reference upgrade', () => {
    it('never queries Commons before an identity is verified', async () => {
      installRoutes([]); // uk/ru/wikidata all empty -- not_found
      await lookupVerifiedSaintReference({ name: 'Невідомий Святий' });
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const calledCommons = fetchMock.mock.calls.some(([url]) => String(url).includes('commons.wikimedia.org'));
      expect(calledCommons).toBe(false);
    });

    it('prefers the Wikidata-linked Commons category over alias search when both are available', async () => {
      installRoutes([
        wikiSearchRoute('uk.wikipedia.org', ['Флор і Лавр']),
        wikiSummaryRoute('uk.wikipedia.org', 'Флор і Лавр', {
          description: 'мученики',
          extract: 'Флор і Лавр -- християнські мученики.',
          wikibase_item: 'Q123456',
        }),
        { test: (url) => url.includes('wikidata.org') && url.includes('ids=Q123456'), response: () => jsonResponse({ entities: { Q123456: { sitelinks: {}, claims: { P373: [{ mainsnak: { datavalue: { value: 'Florus and Laurus' } } }] } } } }) },
        commonsCategoryRoute('Florus and Laurus', [{ title: 'File:Icon of Florus and Laurus fresco.jpg' }]),
        commonsImageInfoRoute('File:Icon of Florus and Laurus fresco.jpg', { url: 'https://upload.wikimedia.org/florus-laurus-fresco.jpg' }),
        // An alias search route is deliberately NOT installed for this
        // saint's own title -- if the resolver fell back to alias search
        // instead of using the category, it would hit the default (empty)
        // route and this test would fail.
      ]);

      const result = await lookupVerifiedSaintReference({ name: 'Мученики Флор і Лавр' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.sourceProvider).toBe('commons');
      expect(result.reference.commonsCategory).toBe('Florus and Laurus');
      expect(result.reference.sourceImageUrl).toBe('https://upload.wikimedia.org/florus-laurus-fresco.jpg');
    });

    it('falls back to verified-alias search (including the classical Greek/Latin transliteration variant) when no Commons category is linked', async () => {
      installRoutes([
        wikiSearchRoute('en.wikipedia.org', []), // en direct search is never attempted by design; kept empty defensively
        wikidataSearchRoute('uk', [{ id: 'Q3564977', description: 'Christian martyr' }]),
        wikidataEntityRoute('Q3564977', { en: 'Agathonicus' }), // no P373 category this time
        wikiSummaryRoute('en.wikipedia.org', 'Agathonicus', {
          description: '3rd-century Christian martyr',
          extract: 'Saint Agathonicus was martyred at Nicomedia.',
        }),
        // Plain "Agathonicus" alias search returns noise only.
        commonsSearchRoute('Agathonicus', [{ title: 'File:Unrelated Roman inscription.jpg' }]),
        // The transliteration variant ("Agathonikos") is what actually finds the icon.
        commonsSearchRoute('Agathonikos', [{ title: 'File:Russian Icon of Saint Agathonikos of Nikomedeia.jpg' }]),
        commonsImageInfoRoute('File:Russian Icon of Saint Agathonikos of Nikomedeia.jpg', { url: 'https://upload.wikimedia.org/agathonikos-icon.jpg' }),
      ]);

      const result = await lookupVerifiedSaintReference({ name: 'Агафоник' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.sourceProvider).toBe('commons');
      expect(result.reference.sourceImageUrl).toBe('https://upload.wikimedia.org/agathonikos-icon.jpg');
    });

    it('skips a wrong first Commons result and picks a later, correctly-ranked one instead of taking the first hit blindly', async () => {
      installRoutes([
        wikiSearchRoute('uk.wikipedia.org', ['Святий Пантелеймон']),
        wikiSummaryRoute('uk.wikipedia.org', 'Святий Пантелеймон', { description: 'великомученик', extract: 'Святий Пантелеймон -- цілитель і великомученик.' }),
        commonsSearchRoute('Святий Пантелеймон', [
          { title: 'File:Modern actor playing Pantaleon in a film.jpg' }, // rejected: contains "actor"
          { title: 'File:Fresco of Saint Panteleimon, Athos.jpg' }, // accepted: fresco
        ]),
        commonsImageInfoRoute('File:Fresco of Saint Panteleimon, Athos.jpg', { url: 'https://upload.wikimedia.org/panteleimon-fresco.jpg' }),
      ]);

      const result = await lookupVerifiedSaintReference({ name: 'Святий Пантелеймон' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      expect(result.reference.sourceProvider).toBe('commons');
      expect(result.reference.sourceImageUrl).toBe('https://upload.wikimedia.org/panteleimon-fresco.jpg');
    });

    it('rejects modern-person/stock/logo/AI-generated Commons candidates and keeps the Wikipedia-sourced image instead', async () => {
      installRoutes([
        wikiSearchRoute('uk.wikipedia.org', ['Флор і Лавр']),
        wikiSummaryRoute('uk.wikipedia.org', 'Флор і Лавр', { description: 'мученики', extract: 'Флор і Лавр -- християнські мученики.' }),
        commonsSearchRoute('Флор і Лавр', [
          { title: 'File:Footballer named Florus, stock photo.jpg' },
          { title: 'File:Company logo Laurus Inc.png' },
          { title: 'File:AI-generated image of a saint.jpg' },
          { title: 'File:Old manuscript scan page 12 (IA somebook).pdf' },
        ]),
      ]);

      const result = await lookupVerifiedSaintReference({ name: 'Мученики Флор і Лавр' });
      expect(result.status).toBe('verified');
      if (result.status !== 'verified') throw new Error('unreachable');
      // Nothing on Commons was acceptable -- the already-verified Wikipedia
      // image is kept rather than any of the rejected Commons candidates.
      expect(result.reference.sourceProvider).toBe('wikipedia');
      expect(result.reference.sourceImageUrl).toBe(`https://upload.wikimedia.org/${encodeURIComponent('Флор і Лавр')}.jpg`);
    });

    it('rejects an ambiguous Wikidata candidate whose description clearly marks it as not a saint (wrong namesake)', async () => {
      installRoutes([
        wikidataSearchRoute('uk', [{ id: 'Q1', description: 'Ukrainian footballer' }]),
        // Q1's sitelinks are deliberately unreachable/absent -- the coarse
        // description filter must skip it before ever resolving a sitelink.
      ]);
      const result = await lookupVerifiedSaintReference({ name: 'Якесь Ім’я' });
      expect(result.status).toBe('not_found');
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const fetchedEntity = fetchMock.mock.calls.some(([url]) => String(url).includes('ids=Q1'));
      expect(fetchedEntity).toBe(false);
    });
  });

  it('never fetches an untrusted host, even in principle (SSRF hardening)', async () => {
    // No route matches "evil.example.com" -- if the resolver ever
    // constructed a URL against an untrusted host, fetchJson's own
    // assertTrustedHost() guard throws, which every call site here maps to
    // a safe non-verified outcome rather than propagating -- so this test
    // documents the guarantee at the fetch layer directly.
    const seenHosts = new Set<string>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        seenHosts.add(new URL(String(input)).host);
        return jsonResponse({});
      }),
    );
    await lookupVerifiedSaintReference({ name: 'Довільне Ім’я' });
    const allowed = new Set(['uk.wikipedia.org', 'ru.wikipedia.org', 'en.wikipedia.org', 'www.wikidata.org', 'commons.wikimedia.org']);
    for (const host of seenHosts) {
      expect(allowed.has(host)).toBe(true);
    }
  });
});
