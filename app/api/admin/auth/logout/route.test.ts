import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');
const { GET: getSession } = await import('../session/route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { createSession } = await import('@/lib/d1/repositories/admin-sessions');
const { hashSessionToken } = await import('@/lib/d1/session-token');
const { d1Run } = await import('@/lib/d1/db');

// Relative to the real clock -- the route computes `now` itself via
// `new Date().toISOString()`, so fixtures must stay valid regardless of
// when the test suite actually runs, not pinned to a fixed calendar date.
const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

async function seedUserAndSession(rawToken: string) {
  const { sql, params } = buildCreateAdminUserStatement({
    email: 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash: 'x',
    role: 'super_admin',
    now: NOW,
  });
  await d1Run(sql, ...params);
  const userId = mockDb.tables.admin_users[0]!.id as string;
  const tokenHash = await hashSessionToken(rawToken);
  await createSession({ userId, tokenHash, createdAt: NOW, expiresAt: LATER });
}

function logoutRequest(sessionToken?: string, serviceToken?: string) {
  return new Request('http://localhost/api/admin/auth/logout', {
    method: 'POST',
    headers: {
      ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
      ...(sessionToken ? { 'X-Admin-Session': sessionToken } : {}),
    },
  });
}

function sessionCheckRequest(sessionToken: string, serviceToken: string) {
  return new Request('http://localhost/api/admin/auth/session', {
    headers: { Authorization: `Bearer ${serviceToken}`, 'X-Admin-Session': sessionToken },
  });
}

describe('POST /api/admin/auth/logout', () => {
  let serviceToken: string;

  beforeEach(async () => {
    mockDb.reset();
    serviceToken = await mintTestAdminJwt();
  });

  it('rejects a request with no service credential', async () => {
    const response = await POST(logoutRequest('raw-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a request missing X-Admin-Session', async () => {
    const response = await POST(logoutRequest(undefined, serviceToken));
    expect(response.status).toBe(400);
  });

  it('revokes a live session and reports revoked: true', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await POST(logoutRequest('raw-token-1', serviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { revoked: boolean };
    expect(body.revoked).toBe(true);
  });

  it('the same token cannot validate a session afterward', async () => {
    await seedUserAndSession('raw-token-1');
    await POST(logoutRequest('raw-token-1', serviceToken));
    const check = await getSession(sessionCheckRequest('raw-token-1', serviceToken));
    expect(check.status).toBe(401);
  });

  it('is idempotent: logging out an already-revoked token reports revoked: false, not an error', async () => {
    await seedUserAndSession('raw-token-1');
    await POST(logoutRequest('raw-token-1', serviceToken));
    const second = await POST(logoutRequest('raw-token-1', serviceToken));
    expect(second.status).toBe(200);
    const body = (await second.json()) as { revoked: boolean };
    expect(body.revoked).toBe(false);
  });

  it('logging out an unknown token is not an error', async () => {
    const response = await POST(logoutRequest('no-such-token', serviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { revoked: boolean };
    expect(body.revoked).toBe(false);
  });

  it('records a logout in the audit log, attributed to the real user', async () => {
    await seedUserAndSession('raw-token-1');
    await POST(logoutRequest('raw-token-1', serviceToken));
    const entries = await listAuditLog();
    const logoutEntry = entries.find((entry) => entry.action === 'logout');
    expect(logoutEntry).toBeDefined();
    expect(logoutEntry!.success).toBe(true);
    expect(logoutEntry!.userId).not.toBeNull();
  });
});
