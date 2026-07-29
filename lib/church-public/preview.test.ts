import { describe, expect, it, vi } from 'vitest';

const TEST_SECRET = 'test-only-secret';

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { ADMIN_JWT_SECRET: TEST_SECRET } }),
}));

const { isValidPreview } = await import('./preview');

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function mintToken(overrides: Partial<{ role: string; exp: number }> = {}): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'test', role: overrides.role ?? 'super_admin', iat: now, exp: overrides.exp ?? now + 3600 };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(TEST_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64url(signature)}`;
}

describe('isValidPreview', () => {
  it('returns false for null/undefined/empty', async () => {
    expect(await isValidPreview(null)).toBe(false);
    expect(await isValidPreview(undefined)).toBe(false);
    expect(await isValidPreview('')).toBe(false);
  });

  it('returns false for a malformed token', async () => {
    expect(await isValidPreview('not-a-jwt')).toBe(false);
  });

  it('returns true for a valid admin JWT', async () => {
    expect(await isValidPreview(await mintToken())).toBe(true);
  });

  it('returns false for a non-admin role', async () => {
    expect(await isValidPreview(await mintToken({ role: 'editor' }))).toBe(false);
  });

  it('returns false for an expired token', async () => {
    const expired = await mintToken({ exp: Math.floor(Date.now() / 1000) - 10 });
    expect(await isValidPreview(expired)).toBe(false);
  });

  it('returns false for an old-format (non-JWT) Koyeb preview token — no leaked drafts', async () => {
    expect(await isValidPreview('legacy-koyeb-preview-token-abc123')).toBe(false);
  });
});
