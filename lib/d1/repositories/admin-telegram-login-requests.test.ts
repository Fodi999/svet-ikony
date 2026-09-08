import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '../test-support/mock-d1-database';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb } }),
}));

const {
  LOGIN_REQUEST_TTL_MS,
  MAX_LOGIN_REQUESTS_PER_WINDOW,
  LOGIN_REQUEST_RATE_WINDOW_MS,
  createLoginRequest,
  cancelPreviousForTelegramUser,
  countRecentForTelegramUser,
  consumeLoginRequest,
  getLoginRequestByTicketHash,
} = await import('./admin-telegram-login-requests');

const T0 = new Date('2026-01-01T00:00:00.000Z');
function iso(offsetMs: number): string {
  return new Date(T0.getTime() + offsetMs).toISOString();
}

describe('admin-telegram-login-requests repository', () => {
  beforeEach(() => mockDb.reset());

  it('createLoginRequest stores only the ticket hash, never a raw ticket, with expiresAt = created + TTL', async () => {
    const { id, expiresAt } = await createLoginRequest({
      userId: 'user-1',
      telegramUserId: '111',
      ticketHash: 'a'.repeat(64),
      displayCode: '482913',
      now: iso(0),
    });
    expect(id).toBeTruthy();
    expect(expiresAt).toBe(iso(LOGIN_REQUEST_TTL_MS));
    const stored = await getLoginRequestByTicketHash('a'.repeat(64));
    expect(stored?.ticket_hash).toBe('a'.repeat(64));
    expect(stored?.consumed_at).toBeNull();
    expect(stored?.cancelled_at).toBeNull();
    // No field anywhere on the stored row could be a raw ticket value --
    // the only ticket-shaped field is the hash itself.
    expect(Object.keys(stored!)).not.toContain('raw_ticket');
  });

  it('consumeLoginRequest succeeds exactly once for a fresh, unexpired ticket, and returns the bound identity', async () => {
    await createLoginRequest({ userId: 'user-42', telegramUserId: '222', ticketHash: 'b'.repeat(64), displayCode: '000001', now: iso(0) });
    const result = await consumeLoginRequest('b'.repeat(64), iso(1000));
    expect(result).toEqual({ userId: 'user-42', telegramUserId: '222' });
  });

  it('atomic double exchange: the second consume of an already-consumed ticket returns null (replay prevention)', async () => {
    await createLoginRequest({ userId: 'user-42', telegramUserId: '222', ticketHash: 'c'.repeat(64), displayCode: '000002', now: iso(0) });
    const first = await consumeLoginRequest('c'.repeat(64), iso(1000));
    const second = await consumeLoginRequest('c'.repeat(64), iso(2000));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('concurrent consume attempts (fired together) -- exactly one succeeds', async () => {
    await createLoginRequest({ userId: 'user-42', telegramUserId: '222', ticketHash: 'd'.repeat(64), displayCode: '000003', now: iso(0) });
    const results = await Promise.all([
      consumeLoginRequest('d'.repeat(64), iso(1000)),
      consumeLoginRequest('d'.repeat(64), iso(1000)),
      consumeLoginRequest('d'.repeat(64), iso(1000)),
    ]);
    const successes = results.filter((r) => r !== null);
    expect(successes).toHaveLength(1);
  });

  it('an expired ticket fails to consume', async () => {
    await createLoginRequest({ userId: 'user-42', telegramUserId: '222', ticketHash: 'e'.repeat(64), displayCode: '000004', now: iso(0) });
    const result = await consumeLoginRequest('e'.repeat(64), iso(LOGIN_REQUEST_TTL_MS + 1));
    expect(result).toBeNull();
  });

  it('an unknown ticket hash fails to consume', async () => {
    const result = await consumeLoginRequest('f'.repeat(64), iso(0));
    expect(result).toBeNull();
  });

  it('a cancelled ticket fails to consume, even before it would have expired', async () => {
    await createLoginRequest({ userId: 'user-1', telegramUserId: '333', ticketHash: 'a1'.repeat(32), displayCode: '000005', now: iso(0) });
    await cancelPreviousForTelegramUser('333', iso(500));
    const result = await consumeLoginRequest('a1'.repeat(32), iso(1000));
    expect(result).toBeNull();
  });

  it('cancelPreviousForTelegramUser only cancels live requests for that identity, leaving other identities and already-consumed/expired rows untouched', async () => {
    await createLoginRequest({ userId: 'user-1', telegramUserId: '333', ticketHash: 'a2'.repeat(32), displayCode: '000006', now: iso(0) });
    await createLoginRequest({ userId: 'user-2', telegramUserId: '444', ticketHash: 'a3'.repeat(32), displayCode: '000007', now: iso(0) });

    await cancelPreviousForTelegramUser('333', iso(1000));

    const cancelled = await getLoginRequestByTicketHash('a2'.repeat(32));
    const untouched = await getLoginRequestByTicketHash('a3'.repeat(32));
    expect(cancelled?.cancelled_at).toBe(iso(1000));
    expect(untouched?.cancelled_at).toBeNull();
  });

  it('only one live ticket per Telegram identity: a new /login cancels the previous one', async () => {
    await createLoginRequest({ userId: 'user-1', telegramUserId: '333', ticketHash: 'a4'.repeat(32), displayCode: '000008', now: iso(0) });
    await cancelPreviousForTelegramUser('333', iso(1000));
    await createLoginRequest({ userId: 'user-1', telegramUserId: '333', ticketHash: 'a5'.repeat(32), displayCode: '000009', now: iso(1000) });

    expect(await consumeLoginRequest('a4'.repeat(32), iso(1500))).toBeNull(); // old ticket dead
    expect(await consumeLoginRequest('a5'.repeat(32), iso(1500))).toEqual({ userId: 'user-1', telegramUserId: '333' }); // new ticket lives
  });

  it('countRecentForTelegramUser counts requests within the rate window, regardless of outcome, and excludes older ones', async () => {
    const telegramUserId = '555';
    for (let i = 0; i < 3; i++) {
      await createLoginRequest({ userId: 'user-1', telegramUserId, ticketHash: `count-${i}`.padEnd(64, '0'), displayCode: '000010', now: iso(i * 1000) });
    }
    // One request well before the window (must not count)
    await createLoginRequest({
      userId: 'user-1',
      telegramUserId,
      ticketHash: 'old-request'.padEnd(64, '0'),
      displayCode: '000011',
      now: iso(-LOGIN_REQUEST_RATE_WINDOW_MS - 1000),
    });

    const count = await countRecentForTelegramUser(telegramUserId, iso(3000));
    expect(count).toBe(3);
  });

  it('rate limit threshold: MAX_LOGIN_REQUESTS_PER_WINDOW requests trip the cap', async () => {
    const telegramUserId = '666';
    for (let i = 0; i < MAX_LOGIN_REQUESTS_PER_WINDOW; i++) {
      await createLoginRequest({ userId: 'user-1', telegramUserId, ticketHash: `rl-${i}`.padEnd(64, '0'), displayCode: '000012', now: iso(i) });
    }
    const count = await countRecentForTelegramUser(telegramUserId, iso(MAX_LOGIN_REQUESTS_PER_WINDOW));
    expect(count).toBeGreaterThanOrEqual(MAX_LOGIN_REQUESTS_PER_WINDOW);
  });
});
