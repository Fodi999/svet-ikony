import { d1First, d1Run } from '../db';

/**
 * Login brute-force protection (Phase 1D.2). Enforced here -- svet-ikony's
 * own POST /api/admin/auth/login -- because this is the only place that
 * ever actually checks a password; svetikony-admin's BFF may add its own
 * defense-in-depth later, but it is not the authoritative limiter.
 *
 * KEY MODEL: the limiter key is SHA-256(trim+lowercase(email)) (see
 * hashRateLimitKey), never the raw email. This means an unknown email and
 * a known-but-wrong-password email get their own independent counters
 * (same as any other key), but neither the DB row nor any response ever
 * reveals which case applies -- the login route reads this table before it
 * even looks up the user, so a blocked response is indistinguishable from
 * a blocked response for an email that was never real to begin with.
 *
 * NOT IP-based: svetikony-admin's BFF, not the browser, is the direct
 * caller of this endpoint (see the Phase 1A "Architecture Correction #1"
 * report), so any client IP visible here would be the BFF server's own,
 * not an individual end user's -- meaningless as a limiter dimension at
 * this specific hop. No IP signal is used.
 *
 * THRESHOLD/WINDOW/BLOCK (justified, not copied from elsewhere): admin
 * accounts are few and high-value, so aggressive protection is
 * acceptable, but a login must never become a way to lock someone out for
 * an unbounded time. MAX_ATTEMPTS=5 within WINDOW_MS=15min tolerates a
 * couple of genuine typos without tripping; BLOCK_MS=30min is long enough
 * that brute-forcing a real password is infeasible at this rate (5
 * guesses/45min sustained), short enough that a legitimate admin who
 * locks themselves out regains access the same day with no manual unlock.
 */
export const RATE_LIMIT_CONFIG = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  blockMs: 30 * 60 * 1000,
  /** Rows are deleted once `updated_at` is this far in the past. Must
   * exceed blockMs (a blocked row's blocked_until = updated_at + blockMs,
   * and a still-active block must never be swept) with headroom for
   * windowMs too; rounded up for a simple, obviously-safe margin rather
   * than the tightest possible bound. */
  retentionMs: 60 * 60 * 1000,
} as const;

/** SHA-256(trim+lowercase(email)), hex-encoded. Same digest/encoding as
 * lib/d1/session-token.ts's hashSessionToken -- deliberately not the raw
 * email, so a DB dump cannot be used to enumerate targeted admin emails. */
export async function hashRateLimitKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type RateLimitRow = { failed_count: number; blocked_until: string | null };

export type RateLimitStatus = { blocked: boolean; blockedUntil: string | null };

/** Cheap read-only check, safe to call on every request before doing any
 * credential verification work: a request already inside an active block
 * never needs to touch the atomic write path at all, which is what keeps
 * a sustained hammering attack from generating unbounded audit-log or
 * write volume (see the login route: only the single request that newly
 * crosses the threshold writes an audit row, everything after it up to
 * blocked_until is rejected by this read alone). Reading is not the
 * operation that must be race-free -- only the increment is (see
 * recordFailedAttempt) -- so a plain SELECT here is not the
 * "SELECT-then-INSERT" pattern the write path deliberately avoids. */
export async function getRateLimitStatus(keyHash: string, now: string): Promise<RateLimitStatus> {
  const row = await d1First<RateLimitRow>('SELECT failed_count, blocked_until FROM admin_login_rate_limit WHERE key_hash = ?', keyHash);
  if (!row) return { blocked: false, blockedUntil: null };
  const blocked = row.blocked_until !== null && row.blocked_until > now;
  return { blocked, blockedUntil: blocked ? row.blocked_until : null };
}

export type RecordAttemptResult = { failedCount: number; blockedUntil: string | null; justBlocked: boolean };

/**
 * The one atomic write in this module: a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` that both records this
 * failure and (if it crosses the threshold) sets the block, in one
 * indivisible SQLite statement. D1 serializes all writes through one
 * primary, so concurrent failing requests for the same key cannot race
 * past each other here -- each sees the fully-committed effect of every
 * earlier one, never a stale pre-write snapshot. Verified directly against
 * real SQLite (node:sqlite) during design, including a same-instant
 * "concurrent" case, before being ported into this statement and into
 * MockD1Database's mirrored branch for tests -- see
 * admin-login-rate-limit.test.ts.
 *
 * Every CASE below only ever reads OLD (pre-statement) column values --
 * SQLite does not let one SET clause see another's newly-computed value --
 * so the "does this attempt cross the threshold" condition is
 * deliberately duplicated between the failed_count and blocked_until
 * assignments rather than computed once.
 */
export async function recordFailedAttempt(keyHash: string, now: string): Promise<RecordAttemptResult> {
  const { maxAttempts, windowMs, blockMs } = RATE_LIMIT_CONFIG;
  const windowCutoff = new Date(new Date(now).getTime() - windowMs).toISOString();
  const blockedUntilIfTripped = new Date(new Date(now).getTime() + blockMs).toISOString();

  const row = await d1First<RateLimitRow>(
    `INSERT INTO admin_login_rate_limit (key_hash, failed_count, window_started_at, blocked_until, updated_at)
     VALUES (?, 1, ?, NULL, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       failed_count = CASE
         WHEN admin_login_rate_limit.blocked_until IS NOT NULL AND admin_login_rate_limit.blocked_until > ?
           THEN admin_login_rate_limit.failed_count
         WHEN admin_login_rate_limit.window_started_at <= ?
           THEN 1
         ELSE admin_login_rate_limit.failed_count + 1
       END,
       window_started_at = CASE
         WHEN admin_login_rate_limit.blocked_until IS NOT NULL AND admin_login_rate_limit.blocked_until > ?
           THEN admin_login_rate_limit.window_started_at
         WHEN admin_login_rate_limit.window_started_at <= ?
           THEN ?
         ELSE admin_login_rate_limit.window_started_at
       END,
       blocked_until = CASE
         WHEN admin_login_rate_limit.blocked_until IS NOT NULL AND admin_login_rate_limit.blocked_until > ?
           THEN admin_login_rate_limit.blocked_until
         WHEN (CASE
                 WHEN admin_login_rate_limit.window_started_at <= ? THEN 1
                 ELSE admin_login_rate_limit.failed_count + 1
               END) >= ?
           THEN ?
         ELSE NULL
       END,
       updated_at = ?
     RETURNING failed_count, blocked_until`,
    keyHash, now, now, // INSERT values
    now, // failed_count CASE: blocked check
    windowCutoff, // failed_count CASE: window-expired check
    now, // window_started_at CASE: blocked check
    windowCutoff, now, // window_started_at CASE: window-expired check + new start
    now, // blocked_until CASE: already-blocked check
    windowCutoff, // blocked_until CASE: inner window-expired check
    maxAttempts, // threshold compare
    blockedUntilIfTripped, // new blocked_until if tripped
    now, // updated_at
  );
  // INSERT ... ON CONFLICT ... RETURNING always returns exactly one row --
  // either the freshly inserted row or the updated one -- never none.
  const result = row!;
  return {
    failedCount: result.failed_count,
    blockedUntil: result.blocked_until,
    // True whenever this call's result reflects the frozen at-threshold
    // state (blocked_until set, failed_count == maxAttempts) -- which, in
    // isolation, is also true for every repeat call on an already-blocked
    // key (the frozen state is indistinguishable from the original
    // transition; see this module's test for the direct demonstration).
    // It behaves as a one-time "just blocked" signal ONLY because of how
    // the login route calls this function: getRateLimitStatus's pre-check
    // rejects an already-blocked key before this function is reached
    // again, so under normal traffic it is called on a given key at most
    // once per block. The exception is a burst of more than maxAttempts
    // truly concurrent requests all passing that pre-check before any of
    // them commit -- bounded by the burst size, not unbounded -- see the
    // Phase 1D.2 report's CONCURRENCY MODEL section.
    justBlocked: result.blocked_until !== null && result.failed_count === maxAttempts,
  };
}

/** Best-effort reset on a successful login -- deletes the row outright
 * (simpler than zeroing it, and doubles as space reclamation for the
 * common case). Never throws into the caller: a failed reset must not
 * turn a successful login into an error, same trade-off as Phase 1D.1's
 * audit-write failure handling. Caller is responsible for catching. */
export async function resetRateLimit(keyHash: string): Promise<void> {
  await d1Run('DELETE FROM admin_login_rate_limit WHERE key_hash = ?', keyHash);
}

/** Lazy cleanup, called once per login POST regardless of outcome --
 * no dedicated cron job for a handful of admin accounts. Bounded, cheap
 * (single indexed DELETE), and always safe: retentionMs exceeds blockMs,
 * so this can never remove a row still enforcing an active block. */
export async function cleanupExpiredRateLimit(now: string): Promise<void> {
  const cutoff = new Date(new Date(now).getTime() - RATE_LIMIT_CONFIG.retentionMs).toISOString();
  await d1Run('DELETE FROM admin_login_rate_limit WHERE updated_at < ?', cutoff);
}
