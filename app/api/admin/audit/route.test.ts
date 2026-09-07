import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { createSession } = await import('@/lib/d1/repositories/admin-sessions');
const { hashSessionToken } = await import('@/lib/d1/session-token');
const { listAuditLog } = await import('@/lib/d1/repositories/admin-audit-log');
const { d1Run } = await import('@/lib/d1/db');

const NOW = new Date().toISOString();
const LATER = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function seedUserAndSession(rawToken: string, options: { active?: boolean; expiresAt?: string; role?: 'super_admin' | 'editor' | 'order_manager' | 'viewer' } = {}) {
  const { sql, params } = buildCreateAdminUserStatement({
    email: 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash: 'x',
    role: options.role ?? 'editor',
    now: NOW,
  });
  await d1Run(sql, ...params);
  const userId = mockDb.tables.admin_users[0]!.id as string;
  if (options.active === false) mockDb.tables.admin_users[0]!.active = 0;
  const tokenHash = await hashSessionToken(rawToken);
  await createSession({ userId, tokenHash, createdAt: NOW, expiresAt: options.expiresAt ?? LATER });
  return userId;
}

function auditRequest(body: unknown, options: { serviceToken?: string; sessionToken?: string } = {}) {
  return new Request('http://localhost/api/admin/audit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.serviceToken ? { Authorization: `Bearer ${options.serviceToken}` } : {}),
      ...(options.sessionToken ? { 'X-Admin-Session': options.sessionToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  action: 'update',
  area: 'content',
  method: 'PUT',
  path: '/api/bff/prayers/prayer-1',
  entityType: 'prayers',
  entityId: 'prayer-1',
  success: true,
  statusCode: 200,
  requestId: 'req-1',
};

describe('POST /api/admin/audit', () => {
  let serviceToken: string;

  beforeEach(async () => {
    mockDb.reset();
    serviceToken = await mintTestAdminJwt();
  });

  it('missing service token -> 401', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await POST(auditRequest(VALID_PAYLOAD, { sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(401);
  });

  it('invalid service token -> 401', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken: 'not-a-real-token', sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(401);
  });

  it('missing human session -> 401', async () => {
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken }));
    expect(response.status).toBe(401);
  });

  it('expired session -> 401', async () => {
    await seedUserAndSession('raw-token-1', { expiresAt: PAST });
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken, sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(401);
  });

  it('revoked session -> 401', async () => {
    await seedUserAndSession('raw-token-1');
    const { revokeSession } = await import('@/lib/d1/repositories/admin-sessions');
    await revokeSession(await hashSessionToken('raw-token-1'), NOW);
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken, sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(401);
  });

  it('inactive user -> 401', async () => {
    await seedUserAndSession('raw-token-1', { active: false });
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken, sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(401);
  });

  it('valid -> audit row created with all fields', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await POST(auditRequest(VALID_PAYLOAD, { serviceToken, sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(201);
    const entries = await listAuditLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'update',
      area: 'content',
      method: 'PUT',
      path: '/api/bff/prayers/prayer-1',
      entityType: 'prayers',
      entityId: 'prayer-1',
      success: true,
      statusCode: 200,
      requestId: 'req-1',
    });
  });

  it('rejects a malformed body (missing required fields)', async () => {
    await seedUserAndSession('raw-token-1');
    const response = await POST(auditRequest({ action: 'update' }, { serviceToken, sessionToken: 'raw-token-1' }));
    expect(response.status).toBe(400);
  });

  describe('actor integrity — body cannot spoof user_id/role', () => {
    it('ignores a userId/role claimed in the body, always using the real session actor', async () => {
      const realUserId = await seedUserAndSession('raw-token-1', { role: 'viewer' });
      const spoofedPayload = { ...VALID_PAYLOAD, userId: 'attacker-controlled-id', role: 'super_admin' };
      const response = await POST(auditRequest(spoofedPayload, { serviceToken, sessionToken: 'raw-token-1' }));
      expect(response.status).toBe(201);
      const entries = await listAuditLog();
      expect(entries[0]!.userId).toBe(realUserId);
      expect(entries[0]!.role).toBe('viewer');
      expect(entries[0]!.userId).not.toBe('attacker-controlled-id');
      expect(entries[0]!.role).not.toBe('super_admin');
    });
  });

  describe('secrets never appear in the stored row', () => {
    it('the raw session token and service token never appear in any audit row', async () => {
      await seedUserAndSession('super-secret-raw-session-token');
      await POST(auditRequest(VALID_PAYLOAD, { serviceToken, sessionToken: 'super-secret-raw-session-token' }));
      const entries = await listAuditLog();
      const serialized = JSON.stringify(entries);
      expect(serialized).not.toContain('super-secret-raw-session-token');
      expect(serialized).not.toContain(serviceToken);
    });
  });
});
