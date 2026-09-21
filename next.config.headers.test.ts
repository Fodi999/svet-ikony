import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 1D.2: exercises the actual `headers()` function Next.js's build
 * process reads from next.config.ts -- not a re-implementation of it --
 * so a future edit that silently drops a header or loosens the CSP fails
 * this test rather than only being caught by eyeballing the config.
 */

// Hosts the native CesiumJS providers contact for the streamed real Earth (ion imagery incl. Google Maps 2D proxy,
// World Terrain, OSM Buildings, Bing fallback). Allowed in connect-src on the Cesium routes only.
const CESIUM_STREAMING_HOSTS = [
  'https://api.cesium.com',
  'https://assets.ion.cesium.com',
  'https://dev.virtualearth.net',
  'https://*.tiles.virtualearth.net',
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const withoutCsp = (headers: Record<string, string>) => Object.fromEntries(Object.entries(headers).filter(([key]) => key !== 'Content-Security-Policy'));

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

  it('in production, applies the full security header set to every route (Cesium routes add only wasm + streaming-Earth connect-src hosts)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const rules = await loadHeaders();
    expect(rules.map(rule=>rule.source)).toEqual([
      '/(.*)', '/:locale(uk|ru|en)/pravoslavna-istoriya',
      '/pravoslavna-istoriya', '/cesium-runtime/:path*',
    ]);
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

    // Every other route keeps the baseline CSP: no wasm, no streaming-Earth hosts.
    const csp = byKey['Content-Security-Policy']!;
    const directives = (value: string) => value.split('; ');
    expect(directives(csp).find((directive) => directive.startsWith('connect-src '))).toBe("connect-src 'self' blob:");
    for (const host of CESIUM_STREAMING_HOSTS) expect(csp).not.toContain(host);
    expect(csp).not.toMatch(/cesium\.com|virtualearth\.net/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' https: data:"); // arbitrary-HTTPS-host media trust is pre-existing, not new
    expect(csp).not.toMatch(/script-src[^;]*\*/);
    expect(csp).not.toContain('script-src *');
    expect(csp).not.toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");

    // Only the Cesium routes get the wasm allowance and the streamed-Earth connect-src hosts.
    for (const rule of rules.slice(1)) {
      const scoped = Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
      // Every non-CSP security header is identical to the global set.
      expect(withoutCsp(scoped)).toEqual(withoutCsp(byKey));
      const cesiumCsp = scoped['Content-Security-Policy'];
      // The CSP differs from the baseline in exactly two directives: script-src (+wasm) and connect-src (+ streaming hosts).
      expect(cesiumCsp).toBeDefined();
      const cesiumDirectives = directives(cesiumCsp!);
      const baseline = directives(csp);
      expect(cesiumDirectives).toHaveLength(baseline.length);
      expect(cesiumDirectives.filter((directive) => !baseline.includes(directive)).sort()).toEqual([
        `connect-src 'self' blob: ${CESIUM_STREAMING_HOSTS.join(' ')}`,
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      ]);
      expect(baseline.filter((directive) => !cesiumDirectives.includes(directive)).sort()).toEqual([
        "connect-src 'self' blob:",
        "script-src 'self' 'unsafe-inline'",
      ]);
      // Still not loosened: no wildcard scripts, no eval; connect-src is exactly 'self' blob: plus the four hosts above (asserted above).
      expect(cesiumCsp).not.toMatch(/script-src[^;]*\*/);
      expect(cesiumCsp).not.toContain("'unsafe-eval'");
      expect(cesiumCsp).toContain("frame-ancestors 'none'");
      expect(cesiumCsp).toContain("object-src 'none'");
    }
  });
});
