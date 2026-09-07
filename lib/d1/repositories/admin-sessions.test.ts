import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '../test-support/mock-d1-database';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb } }),
}));

const { createSession, revokeSession, validateSession } = await import('./admin-sessions');
const { buildCreateAdminUserStatement } = await import('./admin-users');
const { d1Run } = await import('../db');

const NOW = '2026-01-01T12:00:00.000Z';
const LATER = '2026-01-01T20:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';

async function seedUser(active = true): Promise<string> {
  const { sql, params } = buildCreateAdminUserStatement({
    email: 'admin@svetikony.com',
    name: 'Test Admin',
    passwordHash: 'x',
    role: 'super_admin',
    now: NOW,
  });
  await d1Run(sql, ...params);
  // buildCreateAdminUserStatement always inserts active=1 (hardcoded in the
  // SQL literal, not a bound param, matching production's `create` CLI
  // command -- new accounts always start active) -- deactivate directly for
  // the inactive-user test case, the same end state a real `disable`
  // command's UPDATE would produce.
  if (!active) mockDb.tables.admin_users[0]!.active = 0;
  return mockDb.tables.admin_users[0]!.id as string;
}

describe('admin-sessions repository', () => {
  beforeEach(() => mockDb.reset());

  it('validates a freshly created, unexpired session', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });

    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).toBe('valid');
    if (result.outcome === 'valid') {
      expect(result.user.id).toBe(userId);
      expect(result.user.role).toBe('super_admin');
    }
  });

  it('reports a nonexistent token as not_found', async () => {
    const result = await validateSession('no-such-hash', NOW);
    expect(result.outcome).toBe('not_found');
  });

  it('reports a past-expiry session as expired', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: PAST, expiresAt: PAST });
    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).toBe('expired');
  });

  it('reports a revoked session as revoked, even if not yet expired', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });
    await revokeSession('hash-1', NOW);
    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).toBe('revoked');
  });

  it('reports a session belonging to an inactive user as inactive_user', async () => {
    const userId = await seedUser(false);
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });
    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).toBe('inactive_user');
  });

  it('reflects a role change immediately on the next validation', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });
    mockDb.tables.admin_users[0]!.role = 'viewer';

    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).toBe('valid');
    if (result.outcome === 'valid') expect(result.user.role).toBe('viewer');
  });

  it('revokeSession returns true the first time and false on a repeat call (idempotent)', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });
    expect(await revokeSession('hash-1', NOW)).toBe(true);
    expect(await revokeSession('hash-1', NOW)).toBe(false);
  });

  it('revokeSession on an unknown token is not an error and returns false', async () => {
    await expect(revokeSession('no-such-hash', NOW)).resolves.toBe(false);
  });

  it('the same token cannot validate after logout (revoke)', async () => {
    const userId = await seedUser();
    await createSession({ userId, tokenHash: 'hash-1', createdAt: NOW, expiresAt: LATER });
    await revokeSession('hash-1', NOW);
    const result = await validateSession('hash-1', NOW);
    expect(result.outcome).not.toBe('valid');
  });
});
