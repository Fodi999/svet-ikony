import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '../test-support/mock-d1-database';

const mockDb = new MockD1Database();

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: mockDb } }),
}));

const { RATE_LIMIT_CONFIG, cleanupExpiredRateLimit, getRateLimitStatus, hashRateLimitKey, recordFailedAttempt, resetRateLimit } = await import(
  './admin-login-rate-limit'
);

const T0 = new Date('2026-01-01T00:00:00.000Z');
function iso(offsetMs: number): string {
  return new Date(T0.getTime() + offsetMs).toISOString();
}

describe('admin-login-rate-limit repository', () => {
  beforeEach(() => mockDb.reset());

  it('hashes the normalized (trim+lowercase) email, so equivalent inputs share a key', async () => {
    const a = await hashRateLimitKey('  Admin@SvetIkony.com ');
    const b = await hashRateLimitKey('admin@svetikony.com');
    const c = await hashRateLimitKey('someone-else@svetikony.com');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a never-attempted key is not blocked', async () => {
    const key = await hashRateLimitKey('fresh@svetikony.com');
    const status = await getRateLimitStatus(key, iso(0));
    expect(status).toEqual({ blocked: false, blockedUntil: null });
  });

  it('accumulates failed attempts within the window, and reports justBlocked exactly once at the threshold', async () => {
    const key = await hashRateLimitKey('victim@svetikony.com');
    const results = [];
    for (let i = 0; i < RATE_LIMIT_CONFIG.maxAttempts; i++) {
      results.push(await recordFailedAttempt(key, iso(i * 1000)));
    }
    // attempts 1..maxAttempts-1 accumulate without blocking
    for (let i = 0; i < RATE_LIMIT_CONFIG.maxAttempts - 1; i++) {
      expect(results[i]).toEqual({ failedCount: i + 1, blockedUntil: null, justBlocked: false });
    }
    // the Nth attempt (reaching maxAttempts) trips the block
    const tripped = results[RATE_LIMIT_CONFIG.maxAttempts - 1]!;
    expect(tripped.failedCount).toBe(RATE_LIMIT_CONFIG.maxAttempts);
    expect(tripped.blockedUntil).not.toBeNull();
    expect(tripped.justBlocked).toBe(true);
  });

  it('while blocked, further recorded attempts freeze the count and never extend blockedUntil, even if called directly again', async () => {
    // Calling recordFailedAttempt directly, repeatedly, on an
    // already-blocked key is NOT how the login route uses it (there,
    // getRateLimitStatus's pre-check rejects a blocked key before this
    // function is ever reached again -- see route.ts) -- but at the
    // function's own level, without that gating, every such call
    // legitimately reports justBlocked: true again, since its own write
    // freezes failed_count at maxAttempts with a non-null blocked_until,
    // which is indistinguishable from the original transition's result.
    // What this test actually guarantees: the frozen state itself never
    // drifts (count doesn't grow further, blockedUntil doesn't get
    // pushed out) no matter how many more times it's called.
    const key = await hashRateLimitKey('victim@svetikony.com');
    for (let i = 0; i < RATE_LIMIT_CONFIG.maxAttempts; i++) await recordFailedAttempt(key, iso(i * 1000));
    const afterTrip = await recordFailedAttempt(key, iso(RATE_LIMIT_CONFIG.maxAttempts * 1000));
    const again = await recordFailedAttempt(key, iso((RATE_LIMIT_CONFIG.maxAttempts + 1) * 1000));
    expect(afterTrip.failedCount).toBe(RATE_LIMIT_CONFIG.maxAttempts);
    expect(again.failedCount).toBe(RATE_LIMIT_CONFIG.maxAttempts);
    expect(again.blockedUntil).toBe(afterTrip.blockedUntil); // frozen, not renewed
  });

  it('getRateLimitStatus reflects an active block, then reports unblocked once blockedUntil has passed', async () => {
    const key = await hashRateLimitKey('victim@svetikony.com');
    let lastResult;
    for (let i = 0; i < RATE_LIMIT_CONFIG.maxAttempts; i++) lastResult = await recordFailedAttempt(key, iso(i * 1000));

    const duringBlock = await getRateLimitStatus(key, iso(RATE_LIMIT_CONFIG.maxAttempts * 1000));
    expect(duringBlock.blocked).toBe(true);
    expect(duringBlock.blockedUntil).toBe(lastResult!.blockedUntil);

    const afterBlock = await getRateLimitStatus(key, new Date(new Date(lastResult!.blockedUntil!).getTime() + 1).toISOString());
    expect(afterBlock).toEqual({ blocked: false, blockedUntil: null });
  });

  it('a fresh attempt after the window expires (no block ever tripped) resets the count to 1, not accumulates', async () => {
    const key = await hashRateLimitKey('sloppy-typist@svetikony.com');
    await recordFailedAttempt(key, iso(0));
    await recordFailedAttempt(key, iso(60_000)); // count 2, still well within the window
    const afterWindowExpiry = await recordFailedAttempt(key, iso(RATE_LIMIT_CONFIG.windowMs + 60_000));
    expect(afterWindowExpiry).toEqual({ failedCount: 1, blockedUntil: null, justBlocked: false });
  });

  it('resetRateLimit clears the row entirely, so the key is unblocked and starts fresh', async () => {
    const key = await hashRateLimitKey('victim@svetikony.com');
    for (let i = 0; i < RATE_LIMIT_CONFIG.maxAttempts; i++) await recordFailedAttempt(key, iso(i * 1000));
    expect((await getRateLimitStatus(key, iso(RATE_LIMIT_CONFIG.maxAttempts * 1000))).blocked).toBe(true);

    await resetRateLimit(key);

    expect(await getRateLimitStatus(key, iso(RATE_LIMIT_CONFIG.maxAttempts * 1000))).toEqual({ blocked: false, blockedUntil: null });
    const next = await recordFailedAttempt(key, iso(RATE_LIMIT_CONFIG.maxAttempts * 1000));
    expect(next.failedCount).toBe(1);
  });

  it('concurrent attempts (fired together via Promise.all, same instant, same key) never lose an update -- each is counted exactly once', async () => {
    // Node's single-threaded event loop can't reproduce D1's true
    // multi-request concurrency, but firing these together (rather than
    // awaiting each in turn) does exercise recordFailedAttempt without
    // any test-imposed ordering, which is exactly the property the single
    // atomic UPSERT (not a SELECT-then-write pair) is meant to guarantee
    // regardless of call order -- see this module's own doc comment and
    // its design-time verification against real SQLite (node:sqlite).
    const key = await hashRateLimitKey('burst@svetikony.com');
    const now = iso(0);
    const results = await Promise.all(Array.from({ length: RATE_LIMIT_CONFIG.maxAttempts }, () => recordFailedAttempt(key, now)));
    const finalCounts = results.map((r) => r.failedCount).sort((a, b) => a - b);
    expect(finalCounts).toEqual([1, 2, 3, 4, 5]); // every one of the 5 concurrent attempts got a distinct, unique count -- none lost, none double-counted
    expect(results.filter((r) => r.justBlocked).length).toBeGreaterThanOrEqual(1);
  });

  it('cleanupExpiredRateLimit deletes only rows older than the retention window, keeping recent/active ones', async () => {
    const stale = await hashRateLimitKey('long-gone@svetikony.com');
    const recent = await hashRateLimitKey('recent@svetikony.com');
    await recordFailedAttempt(stale, iso(0));
    await recordFailedAttempt(recent, iso(RATE_LIMIT_CONFIG.retentionMs + 1000));

    await cleanupExpiredRateLimit(iso(RATE_LIMIT_CONFIG.retentionMs + 2000));

    expect(mockDb.tables.admin_login_rate_limit.some((r) => r.key_hash === stale)).toBe(false);
    expect(mockDb.tables.admin_login_rate_limit.some((r) => r.key_hash === recent)).toBe(true);
  });

  it('cleanupExpiredRateLimit never removes a row still enforcing an active block (retentionMs exceeds blockMs)', async () => {
    expect(RATE_LIMIT_CONFIG.retentionMs).toBeGreaterThan(RATE_LIMIT_CONFIG.blockMs);
  });
});
