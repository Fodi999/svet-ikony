import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '../test-support/mock-d1-database';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb } }),
}));

const { findActiveTelegramIdentity } = await import('./admin-telegram-identities');

function seedIdentity(overrides: Partial<{ userId: string; telegramUserId: string; revokedAt: string | null }> = {}) {
  mockDb.tables.admin_telegram_identities.push({
    id: crypto.randomUUID(),
    user_id: overrides.userId ?? 'user-1',
    telegram_user_id: overrides.telegramUserId ?? '123456789',
    telegram_chat_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    revoked_at: overrides.revokedAt ?? null,
  });
}

describe('admin-telegram-identities repository', () => {
  beforeEach(() => mockDb.reset());

  it('finds an active (non-revoked) identity by telegram_user_id', async () => {
    seedIdentity({ userId: 'user-1', telegramUserId: '111' });
    const found = await findActiveTelegramIdentity('111');
    expect(found?.userId).toBe('user-1');
    expect(found?.telegramUserId).toBe('111');
    expect(found?.revokedAt).toBeNull();
  });

  it('returns null for an unknown telegram_user_id', async () => {
    seedIdentity({ telegramUserId: '111' });
    expect(await findActiveTelegramIdentity('999')).toBeNull();
  });

  it('returns null for a revoked identity -- indistinguishable from unknown, by design', async () => {
    seedIdentity({ userId: 'user-1', telegramUserId: '111', revokedAt: '2026-01-02T00:00:00.000Z' });
    expect(await findActiveTelegramIdentity('111')).toBeNull();
  });

  it('telegram_user_id is stored/compared as TEXT, not coerced to a JS number', async () => {
    // A value beyond Number.MAX_SAFE_INTEGER would silently corrupt if it
    // were ever treated as a number anywhere in the lookup path.
    const bigId = '9007199254740993'; // MAX_SAFE_INTEGER + 2
    seedIdentity({ userId: 'user-1', telegramUserId: bigId });
    const found = await findActiveTelegramIdentity(bigId);
    expect(found?.telegramUserId).toBe(bigId);
  });
});
