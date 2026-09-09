import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 1D.2: exercises the actual `headers()` function Next.js's build
 * process reads from next.config.ts -- not a re-implementation of it --
 * so a future edit that silently drops a header or loosens the CSP fails
 * this test rather than only being caught by eyeballing the config.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadHeaders(): Promise<{ source: string; headers: { key: string; value: string }[] }[]> {
  const config = (await import('./next.config')).default as { headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  if (!config.headers) throw new Error('next.config default export has no headers()');
  return config.headers();
}

describe('next.config.ts headers()', () => {
  it('returns no headers at all outside production (dev must never see a CSP that could break Fast Refresh/eval)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const rules = await loadHeaders();
    expect(rules).toEqual([]);
  });

  it('in production, applies the full security header set to every route', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const rules = await loadHeaders();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe('/(.*)');

    const byKey = Object.fromEntries(rules[0]!.headers.map((h) => [h.key, h.value]));
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Strict-Transport-Security']).toMatch(/^max-age=\d+$/);
    expect(byKey['Strict-Transport-Security']).not.toContain('includeSubDomains');
    expect(byKey['Strict-Transport-Security']).not.toContain('preload');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
    expect(byKey['Permissions-Policy']).toContain('microphone=()');
    expect(byKey['Permissions-Policy']).toContain('geolocation=()');
    // clipboard-write is real (IconPhotoCatalog.tsx's copy-link UX) --
    // must not be swept up by a copy-pasted deny list.
    expect(byKey['Permissions-Policy']).not.toContain('clipboard-write=()');

    const csp = byKey['Content-Security-Policy']!;
    expect(csp.split('; ').find((directive) => directive.startsWith('connect-src '))).toBe("connect-src 'self' blob:");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' https: data:"); // arbitrary-HTTPS-host media trust is pre-existing, not new
    expect(csp).not.toMatch(/script-src[^;]*\*/);
    expect(csp).not.toContain('script-src *');
  });
});
