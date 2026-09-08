import { describe, expect, it, vi } from 'vitest';

const mockHeaders = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({ headers: mockHeaders }));

async function withHeader(value: string | null) {
  mockHeaders.mockResolvedValue({ get: (key: string) => (key === 'x-site-locale' ? value : null) });
  const { getRequestLocale } = await import('./serverLocale');
  return getRequestLocale();
}

describe('getRequestLocale (PHASE MULTILINGUAL-1 / P0.4 -- feeds RootLayout\'s <html lang>)', () => {
  it('uk header -> uk', async () => {
    expect(await withHeader('uk')).toBe('uk');
  });

  it('ru header -> ru', async () => {
    expect(await withHeader('ru')).toBe('ru');
  });

  it('en header -> en', async () => {
    expect(await withHeader('en')).toBe('en');
  });

  it('missing header -> default (uk)', async () => {
    expect(await withHeader(null)).toBe('uk');
  });

  it('an invalid header value never leaks through as the <html lang> value -> falls back to uk', async () => {
    expect(await withHeader('pl')).toBe('uk');
  });
});
