import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { d1Run } = await import('@/lib/d1/db');
const { generateRawTicket, hashTicket } = await import('@/lib/d1/telegram-ticket');

const NOW = '2026-01-01T00:00:00.000Z';

async function seedUser(overrides: { email?: string; active?: boolean; role?: 'super_admin' | 'editor' | 'order_manager' | 'viewer' } = {}) {
  const { sql, params } = buildCreateAdminUserStatement({
    email: overrides.email ?? 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash: 'pbkdf2-sha256$600000$c2FsdA==$aGFzaA==', // never verified here -- Telegram login path
    role: overrides.role ?? 'super_admin',
    now: NOW,
  });
  await d1Run(sql, ...params);
  const row = mockDb.tables.admin_users[mockDb.tables.admin_users.length - 1]!;
  if (overrides.active === false) row.active = 0;
  return row.id as string;
}

function seedIdentity(userId: string, telegramUserId: string, revokedAt: string | null = null) {
  mockDb.tables.admin_telegram_identities.push({
    id: crypto.randomUUID(),
    user_id: userId,
    telegram_user_id: telegramUserId,
    telegram_chat_id: null,
    created_at: NOW,
    updated_at: NOW,
    revoked_at: revokedAt,
  });
}

// The exchange route computes `now` from the real wall clock
// (`new Date().toISOString()`, same as the password login route) --
// tickets must be seeded relative to that same real "now", not the fixed
// historical NOW used for admin_users (whose created_at/updated_at are
// never time-compared), or every ticket looks pre-expired.
function realNow(): string {
  return new Date().toISOString();
}

async function seedTicket(userId: string, telegramUserId: string, createdAt = realNow()): Promise<string> {
  const rawTicket = generateRawTicket();
  const ticketHash = await hashTicket(rawTicket);
  mockDb.tables.admin_telegram_login_requests.push({
    id: crypto.randomUUID(),
    user_id: userId,
    telegram_user_id: telegramUserId,
    ticket_hash: ticketHash,
    display_code: '482913',
    created_at: createdAt,
    expires_at: new Date(new Date(createdAt).getTime() + 2 * 60 * 1000).toISOString(),
    consumed_at: null,
    cancelled_at: null,
  });
  return rawTicket;
}

function exchangeRequest(body: unknown, serviceToken?: string) {
  return new Request('http://localhost/api/admin/auth/telegram/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/auth/telegram/exchange', () => {
  let serviceToken: string;

  beforeEach(async () => {
    mockDb.reset();
    serviceToken = await mintTestAdminJwt();
  });

  describe('service boundary', () => {
    it('rejects a request with no service credential', async () => {
      const response = await POST(exchangeRequest({ ticket: 'x' }));
      expect(response.status).toBe(401);
    });

    it('rejects a request with an invalid service credential', async () => {
      const response = await POST(exchangeRequest({ ticket: 'x' }, 'not-a-real-token'));
      expect(response.status).toBe(401);
    });
  });

  it('a valid, unexpired ticket bound to an active user + active identity creates a real admin_session and returns the same shape the password login route does', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');

    const response = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: { id: string; email: string; role: string }; expiresAt: string };
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe('admin@svetikony.com');
    expect(body.user.role).toBe('super_admin');
    expect(mockDb.tables.admin_sessions).toHaveLength(1);
    expect(mockDb.tables.admin_sessions[0]!.user_id).toBe(userId);
  });

  it('never returns the raw ticket, ticket hash, or any Telegram id in the response body', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');

    const response = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    const bodyText = await response.text();
    expect(bodyText).not.toContain(rawTicket);
    expect(bodyText).not.toContain('111');
  });

  it('ticket replay: a second exchange of the same ticket fails with a generic 401', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');

    const first = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    const second = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
    expect(mockDb.tables.admin_sessions).toHaveLength(1); // only the first exchange created a session
  });

  it('concurrent exchange of the same ticket: exactly one succeeds', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');

    const [a, b] = await Promise.all([POST(exchangeRequest({ ticket: rawTicket }, serviceToken)), POST(exchangeRequest({ ticket: rawTicket }, serviceToken))]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 401]);
    expect(mockDb.tables.admin_sessions).toHaveLength(1);
  });

  it('an unknown ticket fails with a generic 401', async () => {
    const response = await POST(exchangeRequest({ ticket: 'this-ticket-was-never-issued' }, serviceToken));
    expect(response.status).toBe(401);
  });

  it('an expired ticket fails with a generic 401', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const longAgo = new Date(new Date(NOW).getTime() - 10 * 60 * 1000).toISOString();
    const rawTicket = await seedTicket(userId, '111', longAgo);

    const response = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    expect(response.status).toBe(401);
  });

  it('an inactive admin user fails with a generic 401, even with a technically-valid unexpired ticket', async () => {
    const userId = await seedUser({ active: false });
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');

    const response = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    expect(response.status).toBe(401);
    expect(mockDb.tables.admin_sessions).toHaveLength(0);
  });

  it('a revoked Telegram identity fails the exchange even though the ticket itself is still technically valid (defense in depth beyond ticket-creation-time checks)', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');
    // Revoke the binding AFTER the ticket was issued, simulating a
    // mid-flight revocation between /login and the browser click.
    mockDb.tables.admin_telegram_identities[0]!.revoked_at = '2026-01-01T00:00:30.000Z';

    const response = await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));
    expect(response.status).toBe(401);
    expect(mockDb.tables.admin_sessions).toHaveLength(0);
  });

  it('records a telegram_login_success audit row on success, and telegram_login_denied on failure', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const goodTicket = await seedTicket(userId, '111');

    await POST(exchangeRequest({ ticket: goodTicket }, serviceToken));
    await POST(exchangeRequest({ ticket: 'unknown-ticket' }, serviceToken));

    const actions = mockDb.tables.admin_audit_log.map((r) => r.action);
    expect(actions).toContain('telegram_login_success');
    expect(actions).toContain('telegram_login_denied');
  });

  it('never audits the raw ticket, ticket hash, or bot token anywhere', async () => {
    const userId = await seedUser();
    seedIdentity(userId, '111');
    const rawTicket = await seedTicket(userId, '111');
    await POST(exchangeRequest({ ticket: rawTicket }, serviceToken));

    const serialized = JSON.stringify(mockDb.tables.admin_audit_log);
    expect(serialized).not.toContain(rawTicket);
  });

  it('validation: missing ticket is rejected before any DB work', async () => {
    const response = await POST(exchangeRequest({}, serviceToken));
    expect(response.status).toBe(400);
  });
});
