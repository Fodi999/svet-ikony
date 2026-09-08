import { describe, expect, it, vi } from 'vitest';

/**
 * PHASE MULTILINGUAL-1 / P0.6: the homepage used to have NO
 * generateMetadata() at all (only the root layout's static `metadata`,
 * which has no `alternates`), so `/`, `/uk`, `/ru`, `/en` all served with
 * no <link rel="canonical"> whatsoever -- confirmed by curling a real
 * local `next dev` response before this fix (`grep -o '<link[^>]*rel="
 * [^"]*"[^>]*>'` on the raw HTML turned up manifest/icon/preload links but
 * no canonical). This is the regression test for the actual returned
 * Metadata object, per-locale.
 */

const mockHeaders = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: mockHeaders }));

async function homepageMetadataFor(locale: string) {
  mockHeaders.mockResolvedValue({ get: (key: string) => (key === 'x-site-locale' ? locale : null) });
  const { generateMetadata } = await import('./page');
  return generateMetadata();
}

describe('homepage generateMetadata (PHASE MULTILINGUAL-1 / P0.6)', () => {
  it('/uk -> self-referencing canonical https://svetikony.com/uk (not /ru or /en, not the bare siteUrl)', async () => {
    const meta = await homepageMetadataFor('uk');
    expect(meta.alternates?.canonical).toBe('https://svetikony.com/uk');
  });

  it('/ru -> self-referencing canonical https://svetikony.com/ru -- NOT canonicalized onto /uk', async () => {
    const meta = await homepageMetadataFor('ru');
    expect(meta.alternates?.canonical).toBe('https://svetikony.com/ru');
  });

  it('/en -> self-referencing canonical https://svetikony.com/en -- NOT canonicalized onto /uk', async () => {
    const meta = await homepageMetadataFor('en');
    expect(meta.alternates?.canonical).toBe('https://svetikony.com/en');
  });

  it('an invalid/missing locale header falls back to the default (uk) canonical, never a bare unlocalized URL', async () => {
    mockHeaders.mockResolvedValue({ get: () => null });
    const { generateMetadata } = await import('./page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe('https://svetikony.com/uk');
  });

  /**
   * PHASE MULTILINGUAL-2.1: `alternates.languages` must never be set on
   * the returned Metadata object -- Next's own renderer emits a
   * duplicate, wrongly-cased `<link>` for it (see lib/seo.ts's
   * `pageMetadata()` doc comment). `components/site/Hreflang.tsx`
   * (rendered directly in app/page.tsx's JSX) is the sole source of the
   * homepage's alternate-language tags now.
   */
  it('never carries alternates.languages -- Hreflang.tsx is the sole hreflang emitter, not Next\'s Metadata API', async () => {
    const meta = await homepageMetadataFor('uk');
    expect(meta.alternates?.languages).toBeUndefined();
  });
});
