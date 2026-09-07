import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/lib/d1/password';
import { listAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';
import { mintTestAdminJwt, TEST_JWT_SECRET } from '@/lib/media/test-support/test-jwt';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb, ADMIN_JWT_SECRET: TEST_JWT_SECRET } }),
}));

const { POST } = await import('./route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { d1Run } = await import('@/lib/d1/db');

async function seedUser(overrides: { email?: string; password?: string; role?: 'super_admin' | 'editor' | 'order_manager' | 'viewer'; active?: boolean } = {}) {
  const passwordHash = await hashPassword(overrides.password ?? 'correct-password-123');
  const { sql, params } = buildCreateAdminUserStatement({
    email: overrides.email ?? 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash,
    role: overrides.role ?? 'super_admin',
    now: '2026-01-01T00:00:00.000Z',
  });
  await d1Run(sql, ...params);
  if (overrides.active === false) mockDb.tables.admin_users[0]!.active = 0;
}

function loginRequest(body: unknown, serviceToken?: string) {
  return new Request('http://localhost/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/auth/login', () => {
  let serviceToken: string;

  beforeEach(async () => {
    mockDb.reset();
    serviceToken = await mintTestAdminJwt();
  });

  describe('service boundary', () => {
    it('rejects a request with no service credential', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }));
      expect(response.status).toBe(401);
    });

    it('rejects a request with an invalid service credential', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, 'not-a-real-token'));
      expect(response.status).toBe(401);
    });

    it('reaches the login logic with a valid service credential', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(200);
    });
  });

  describe('credential verification', () => {
    it('valid email + password creates a session and returns a token + safe identity', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { token: string; user: { id: string; email: string; role: string }; expiresAt: string };
      expect(body.token).toBeTruthy();
      expect(body.user.email).toBe('admin@svetikony.com');
      expect(body.user.role).toBe('super_admin');
      expect(mockDb.tables.admin_sessions).toHaveLength(1);
    });

    it('is case-insensitive on email', async () => {
      await seedUser({ email: 'admin@svetikony.com' });
      const response = await POST(loginRequest({ email: 'ADMIN@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(200);
    });

    it('wrong password returns a generic 401', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'totally-wrong' }, serviceToken));
      expect(response.status).toBe(401);
      const body = (await response.json()) as { message: string; details: string };
      expect(body.message).toBe('Authentication failed');
      expect(body.details).toBe('Invalid email or password');
    });

    it('unknown email returns the identical generic 401 as a wrong password', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'nobody@svetikony.com', password: 'irrelevant' }, serviceToken));
      expect(response.status).toBe(401);
      const body = (await response.json()) as { message: string; details: string };
      expect(body.message).toBe('Authentication failed');
      expect(body.details).toBe('Invalid email or password');
    });

    it('an inactive user returns the identical generic 401, even with the correct password', async () => {
      await seedUser({ active: false });
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(401);
      const body = (await response.json()) as { details: string };
      expect(body.details).toBe('Invalid email or password');
    });

    it('does not create a session on any failed attempt', async () => {
      await seedUser();
      await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      await POST(loginRequest({ email: 'nobody@svetikony.com', password: 'wrong' }, serviceToken));
      expect(mockDb.tables.admin_sessions).toHaveLength(0);
    });
  });

  describe('security', () => {
    it('never returns password_hash in the response body', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      const text = await response.text();
      expect(text).not.toContain('password_hash');
      expect(text).not.toContain('pbkdf2-sha256');
    });

    it('never echoes the service credential back', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      const text = await response.text();
      expect(text).not.toContain(serviceToken);
    });

    it('the raw session token is never stored in D1 -- only its SHA-256 hash', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      const body = (await response.json()) as { token: string };
      const stored = mockDb.tables.admin_sessions[0]!.token_hash as string;
      expect(stored).not.toBe(body.token);
      expect(stored).toMatch(/^[0-9a-f]{64}$/); // hex-encoded SHA-256
    });
  });

  describe('audit log', () => {
    it('records a successful login', async () => {
      await seedUser();
      await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      const entries = await listAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.action).toBe('login');
      expect(entries[0]!.success).toBe(true);
      expect(entries[0]!.userId).not.toBeNull();
    });

    it('records a failed login against an unknown email anonymously (no user_id, no attempted email stored)', async () => {
      const response = await POST(loginRequest({ email: 'nobody@svetikony.com', password: 'x' }, serviceToken));
      expect(response.status).toBe(401);
      const entries = await listAuditLog();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.success).toBe(false);
      expect(entries[0]!.userId).toBeNull();
      expect(entries[0]!.entityId).toBeNull();
      expect(JSON.stringify(entries[0])).not.toContain('nobody@svetikony.com');
    });

    it('records a failed login against a real user with wrong password, attributed to that user', async () => {
      await seedUser();
      await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      const entries = await listAuditLog();
      expect(entries[0]!.success).toBe(false);
      expect(entries[0]!.userId).not.toBeNull();
    });
  });

  describe('rate limiting (Phase 1D.2)', () => {
    const MAX = 5; // must match RATE_LIMIT_CONFIG.maxAttempts

    it('a valid login is never rate limited', async () => {
      await seedUser();
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(200);
    });

    it('a failed login increments the limiter -- the Nth (threshold-crossing) failure still returns its own normal 401, and only the request AFTER that is 429', async () => {
      await seedUser();
      const responses = [];
      for (let i = 0; i < MAX; i++) {
        responses.push(await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken)));
      }
      // Every one of these MAX attempts genuinely was a wrong password, so
      // each gets the normal 401 for itself -- blocking takes effect
      // starting with the *next* request, not retroactively on the one
      // that crossed the threshold.
      for (let i = 0; i < MAX; i++) expect(responses[i]!.status).toBe(401);
      const next = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      expect(next.status).toBe(429);
    });

    it('the request immediately after tripping the block is rejected with 429 without even checking the password', async () => {
      await seedUser();
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      // Now try the CORRECT password -- must still be blocked, proving the
      // 429 short-circuit runs before credential verification.
      const response = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(response.status).toBe(429);
      expect(mockDb.tables.admin_sessions).toHaveLength(0);
    });

    it('an unknown email is rate limited identically to a wrong password -- same status, same generic body, no enumeration', async () => {
      await seedUser({ email: 'real@svetikony.com' });
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'real@svetikony.com', password: 'wrong' }, serviceToken));
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'nobody@svetikony.com', password: 'wrong' }, serviceToken));
      const wrongPasswordBlocked = await POST(loginRequest({ email: 'real@svetikony.com', password: 'wrong' }, serviceToken));
      const unknownEmailBlocked = await POST(loginRequest({ email: 'nobody@svetikony.com', password: 'wrong' }, serviceToken));
      expect(wrongPasswordBlocked.status).toBe(429);
      expect(unknownEmailBlocked.status).toBe(429);
      const [a, b] = await Promise.all([wrongPasswordBlocked.json(), unknownEmailBlocked.json()]);
      expect(a).toEqual(b);
    });

    it('an inactive user is rate limited identically to any other failure (does not leak inactive status)', async () => {
      await seedUser({ email: 'disabled@svetikony.com', active: false });
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'disabled@svetikony.com', password: 'correct-password-123' }, serviceToken));
      const blocked = await POST(loginRequest({ email: 'disabled@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(blocked.status).toBe(429);
      const body = (await blocked.json()) as { code: string; message: string };
      expect(body.code).toBe('RATE_LIMITED');
      expect(JSON.stringify(body)).not.toContain('inactive');
      expect(JSON.stringify(body)).not.toContain('disabled@svetikony.com');
    });

    it('a 429 response includes a Retry-After header and never reveals the exact remaining-attempts count', async () => {
      await seedUser();
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      const last = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      expect(last.status).toBe(429);
      const retryAfter = last.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      const body = (await last.json()) as Record<string, unknown>;
      expect(Object.keys(body)).not.toContain('attemptsRemaining');
      expect(Object.keys(body)).not.toContain('remainingAttempts');
    });

    it('a successful login resets the failure count, so a subsequent mistake does not immediately re-trip the block', async () => {
      await seedUser();
      for (let i = 0; i < MAX - 1; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      const success = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(success.status).toBe(200);
      const afterSuccess = await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      expect(afterSuccess.status).toBe(401); // not 429 -- the counter was cleared, not left at MAX-1
    });

    it('never stores the attempted plaintext email or password in the rate-limit table', async () => {
      await seedUser();
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'super-secret-wrong-pw' }, serviceToken));
      const rows = mockDb.tables.admin_login_rate_limit;
      expect(rows.length).toBeGreaterThan(0);
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain('admin@svetikony.com');
      expect(dump).not.toContain('super-secret-wrong-pw');
    });

    it('records exactly one login_rate_limited audit event for the block transition, not one per subsequent blocked request', async () => {
      await seedUser();
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      // 3 more requests while still blocked -- must not add more audit noise.
      for (let i = 0; i < 3; i++) await POST(loginRequest({ email: 'admin@svetikony.com', password: 'wrong' }, serviceToken));
      const entries = await listAuditLog();
      const rateLimitedEntries = entries.filter((e) => e.action === 'login_rate_limited');
      expect(rateLimitedEntries).toHaveLength(1);
    });

    it('two distinct emails are rate limited independently -- one being blocked does not affect the other', async () => {
      await seedUser({ email: 'victim@svetikony.com' });
      await seedUser({ email: 'other@svetikony.com' });
      for (let i = 0; i < MAX; i++) await POST(loginRequest({ email: 'victim@svetikony.com', password: 'wrong' }, serviceToken));
      const otherResponse = await POST(loginRequest({ email: 'other@svetikony.com', password: 'correct-password-123' }, serviceToken));
      expect(otherResponse.status).toBe(200);
    });
  });

  it('rejects a malformed body', async () => {
    await seedUser();
    const response = await POST(
      new Request('http://localhost/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
        body: JSON.stringify({ email: 'admin@svetikony.com' }), // missing password
      }),
    );
    expect(response.status).toBe(400);
  });
});
