import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '../test-support/mock-d1-database';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb } }),
}));

const { buildCreateAdminUserStatement, getAdminUserByEmail, listAdminUsers, touchLastLogin, updatePasswordHash } = await import('./admin-users');
const { d1Run } = await import('../db');

async function seedUser(email = 'admin@svetikony.com') {
  const { sql, params } = buildCreateAdminUserStatement({
    email,
    name: 'Test Admin',
    passwordHash: 'pbkdf2-sha256$600000$salt$hash',
    role: 'super_admin',
    now: '2026-01-01T00:00:00.000Z',
  });
  await d1Run(sql, ...params);
  return getAdminUserByEmail(email);
}

describe('admin-users repository', () => {
  beforeEach(() => mockDb.reset());

  it('creates and reads back a user by email', async () => {
    const created = await seedUser();
    expect(created).not.toBeNull();
    expect(created!.email).toBe('admin@svetikony.com');
    expect(created!.role).toBe('super_admin');
    expect(created!.active).toBe(true);
  });

  it('returns null for an unknown email', async () => {
    expect(await getAdminUserByEmail('nobody@svetikony.com')).toBeNull();
  });

  it('rejects creating a second user with the same email', async () => {
    await seedUser();
    const { sql, params } = buildCreateAdminUserStatement({
      email: 'admin@svetikony.com',
      name: 'Duplicate',
      passwordHash: 'x',
      role: 'viewer',
      now: '2026-01-01T00:00:00.000Z',
    });
    await expect(d1Run(sql, ...params)).rejects.toThrow();
  });

  it('lists users ordered by created_at', async () => {
    const { sql: sql1, params: params1 } = buildCreateAdminUserStatement({
      email: 'a@svetikony.com',
      name: 'A',
      passwordHash: 'x',
      role: 'viewer',
      now: '2026-01-01T00:00:00.000Z',
    });
    const { sql: sql2, params: params2 } = buildCreateAdminUserStatement({
      email: 'b@svetikony.com',
      name: 'B',
      passwordHash: 'x',
      role: 'editor',
      now: '2026-01-02T00:00:00.000Z',
    });
    await d1Run(sql1, ...params1);
    await d1Run(sql2, ...params2);
    const users = await listAdminUsers();
    expect(users.map((u) => u.email)).toEqual(['a@svetikony.com', 'b@svetikony.com']);
  });

  it('touchLastLogin updates last_login_at', async () => {
    await seedUser();
    await touchLastLogin((await getAdminUserByEmail('admin@svetikony.com'))!.id, '2026-02-01T00:00:00.000Z');
    const user = await getAdminUserByEmail('admin@svetikony.com');
    expect(user!.lastLoginAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('updatePasswordHash replaces the stored hash', async () => {
    const created = await seedUser();
    await updatePasswordHash(created!.id, 'pbkdf2-sha256$600000$newsalt$newhash', '2026-02-01T00:00:00.000Z');
    const user = await getAdminUserByEmail('admin@svetikony.com');
    expect(user!.passwordHash).toBe('pbkdf2-sha256$600000$newsalt$newhash');
  });
});
