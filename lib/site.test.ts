import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockEnv: Record<string, string | undefined>;
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: mockEnv }),
}));

const { absoluteSiteUrl, getSiteUrl } = await import('./site');

describe('getSiteUrl / absoluteSiteUrl (server-side)', () => {
  beforeEach(() => {
    mockEnv = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses SITE_URL from the Cloudflare runtime when set (production)', async () => {
    mockEnv = { SITE_URL: 'https://svetikony.com' };
    expect(await getSiteUrl()).toBe('https://svetikony.com');
  });

  it('strips a trailing slash from SITE_URL', async () => {
    mockEnv = { SITE_URL: 'https://svetikony.com/' };
    expect(await getSiteUrl()).toBe('https://svetikony.com');
  });

  it('falls back to localhost when SITE_URL is unset (local dev)', async () => {
    mockEnv = {};
    expect(await getSiteUrl()).toBe('http://localhost:3001');
  });

  it('falls back to localhost when SITE_URL is blank', async () => {
    mockEnv = { SITE_URL: '   ' };
    expect(await getSiteUrl()).toBe('http://localhost:3001');
  });

  it('NEVER resolves to localhost when SITE_URL is set, regardless of what NEXT_PUBLIC_SITE_URL says (the exact bug this replaces)', async () => {
    // This is the regression test for the real production incident: a
    // build-time NEXT_PUBLIC_SITE_URL=http://localhost:3001 (from a
    // developer's .env.local) must never leak into a server-side media URL
    // again, no matter what process.env holds.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3001');
    mockEnv = { SITE_URL: 'https://svetikony.com' };

    const url = await getSiteUrl();

    expect(url).toBe('https://svetikony.com');
    expect(url).not.toContain('localhost');
  });

  it('absoluteSiteUrl builds a full URL from a path, adding a leading slash if missing', async () => {
    mockEnv = { SITE_URL: 'https://svetikony.com' };
    expect(await absoluteSiteUrl('/media/telegram/4/post-image/abc.png')).toBe(
      'https://svetikony.com/media/telegram/4/post-image/abc.png'
    );
    expect(await absoluteSiteUrl('media/telegram/4/post-image/abc.png')).toBe(
      'https://svetikony.com/media/telegram/4/post-image/abc.png'
    );
  });

  it('a media URL built via absoluteSiteUrl in a production-shaped runtime is never localhost', async () => {
    mockEnv = { SITE_URL: 'https://svetikony.com' };
    const url = await absoluteSiteUrl('/media/telegram/4/post-image/abc.png');
    expect(url.startsWith('https://svetikony.com/')).toBe(true);
    expect(url).not.toContain('localhost');
  });
});
