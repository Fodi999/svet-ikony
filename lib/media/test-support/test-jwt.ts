/** Mints a real HS256 admin JWT for route tests — exercises the actual
 * lib/d1/auth.ts verification path instead of mocking auth away, so the
 * 401/403 tests in *.route.test.ts assert real behavior. */
export const TEST_JWT_SECRET = 'test-only-secret-do-not-use-in-production';

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function mintTestAdminJwt(overrides: Partial<{ role: string; exp: number; sub: string }> = {}): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: overrides.sub ?? 'test-admin',
    role: overrides.role ?? 'super_admin',
    iat: now,
    exp: overrides.exp ?? now + 3600,
  };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(TEST_JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${base64url(signature)}`;
}
