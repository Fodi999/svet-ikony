import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { GET } = await import('./route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { createSession } = await import('@/lib/d1/repositories/admin-sessions');
const { hashSessionToken } = await import('@/lib/d1/session-token');
const { d1Run } = await import('@/lib/d1/db');

// Relative to the real clock -- the route computes `now` itself via
// `new Date().toISOString()`, so fixtures must stay valid regardless of
// when the test suite actually runs, not pinned to a fixed calendar date.
const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function seedUserAndSession(rawToken: string, options: { active?: boolean; expiresAt?: string } = {}) {
  const { sql, params } = buildCreateAdminUserStatement({
    email: 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash: 'x',
    role: 'super_admin',
    now: NOW,
  });
  await d1Run(sql, ...params);
  const userId = mockDb.tables.admin_users[0]!.id as string;
  if (options.active === false) mockDb.tables.admin_users[0]!.active = 0;
  const tokenHash = await hashSessionToken(rawToken);
  await createSession({ userId, tokenHash, createdAt: NOW, expiresAt: options.expiresAt ?? LATER });
  return userId;
}

function sessionRequest(sessionToken?: string, serviceToken?: string) {
  return new Request('http://localhost/api/admin/auth/session', {
    headers: {
      ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      ...(sessionToken ? { 'X-Admin-Session': sessionToken } : {}),
    },
  });
}

describe('GET /api/admin/auth/session', () => {
  let serviceToken: string;

  beforeEach(async () => {
    mockDb.reset();
    serviceToken = await mintTestAdminJwt();
  });

  it('rejects a request with no service credential', async () => {
    const response = await GET(sessionRequest('raw-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a request with an invalid service credential', async () => {
    const response = await GET(sessionRequest('raw-token', 'not-a-real-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a request missing the X-Admin-Session header entirely', async () => {
    const response = await GET(sessionRequest(undefined, serviceToken));
    expect(response.status).toBe(400);
  });

  it('valid session -> returns the safe user identity', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await GET(sessionRequest('raw-token-1', serviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { email: string; role: string }; expiresAt: string };
    expect(body.user.email).toBe('admin@svetikony.com');
    expect(body.user.role).toBe('super_admin');
  });

  it('an unknown token -> 401', async () => {
    const response = await GET(sessionRequest('no-such-token', serviceToken));
    expect(response.status).toBe(401);
  });

  it('an expired session -> 401', async () => {
    await seedUserAndSession('raw-token-1', { expiresAt: PAST });
    const response = await GET(sessionRequest('raw-token-1', serviceToken));
    expect(response.status).toBe(401);
  });

  it('a session belonging to an inactive user -> 401', async () => {
    await seedUserAndSession('raw-token-1', { active: false });
    const response = await GET(sessionRequest('raw-token-1', serviceToken));
    expect(response.status).toBe(401);
  });

  it('never returns the raw token or its hash in the response', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await GET(sessionRequest('raw-token-1', serviceToken));
    const text = await response.text();
    expect(text).not.toContain('raw-token-1');
  });
});
