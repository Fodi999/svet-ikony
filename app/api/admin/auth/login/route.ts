import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { hashPassword, verifyPassword } from '@/lib/d1/password';
import { recordAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import {
  cleanupExpiredRateLimit,
  getRateLimitStatus,
  hashRateLimitKey,
  recordFailedAttempt,
  resetRateLimit,
} from '@/lib/d1/repositories/admin-login-rate-limit';
import { createSession } from '@/lib/d1/repositories/admin-sessions';
import { getAdminUserByEmail, toIdentity, touchLastLogin, updatePasswordHash, type AdminUserRecord } from '@/lib/d1/repositories/admin-users';
import { generateSessionToken, hashSessionToken } from '@/lib/d1/session-token';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours -- matches svetikony-admin's prior mock session TTL

const PATH = '/api/admin/auth/login';

/** Wrong password, unknown email, and an inactive account all end up here
 * and produce the exact same generic response -- this route must never let
 * a caller distinguish "this email doesn't exist" from "this email exists
 * but the password/state is wrong". `user` is null only for an unknown
 * email: that attempt is still audit-logged (failed-login volume is a real
 * security signal) but anonymously, since there is no real actor and the
 * attempted email itself is never stored (avoids logging arbitrary
 * user-supplied PII).
 *
 * Also records this failure against the Phase 1D.2 rate limiter (keyed on
 * the email's hash, not identity) and, only for the single request that
 * newly crosses the block threshold, writes one additional
 * 'login_rate_limited' audit row -- see recordFailedAttempt's justBlocked
 * and the module doc-comment on why this stays a one-time event rather
 * than firing on every request during a sustained attack. */
async function rejectLogin(user: AdminUserRecord | null, keyHash: string, now: string): Promise<never> {
  await recordAuditLog({
    userId: user?.id ?? null,
    role: user?.role ?? null,
    action: 'login',
    area: 'auth',
    method: 'POST',
    path: PATH,
    entityType: user ? 'admin_user' : undefined,
    entityId: user?.id,
    success: false,
    createdAt: now,
  });

  // FAIL-OPEN, deliberately, same as the pre-check in POST(): a failure
  // recording this attempt must not turn this already-failed login's
  // normal 401 into a 500 (which would also leak "the rate limiter is
  // broken" as an observable signal distinct from a plain wrong password).
  try {
    const attempt = await recordFailedAttempt(keyHash, now);
    if (attempt.justBlocked) {
      await recordAuditLog({
        userId: user?.id ?? null,
        role: user?.role ?? null,
        action: 'login_rate_limited',
        area: 'auth',
        method: 'POST',
        path: PATH,
        entityType: user ? 'admin_user' : undefined,
        entityId: user?.id,
        success: false,
        createdAt: now,
      });
    }
  } catch (error) {
    console.error('admin_login_rate_limit record failed:', error);
  }

  throw ApiError.authentication('Invalid email or password');
}

/** Rejects a key already inside an active block -- thrown before any
 * credential verification is attempted (no user lookup, no password
 * hashing work), and deliberately not audit-logged: the one audit row for
 * this key's block was already written by rejectLogin at the moment it
 * was newly set, and this table's own blocked_until row is the durable
 * record of the ongoing state, so logging again here on every
 * repeat/attack request would be unbounded, attacker-controlled noise. */
function rejectRateLimited(blockedUntil: string, now: string): never {
  const retryAfterSeconds = Math.max(1, Math.ceil((new Date(blockedUntil).getTime() - new Date(now).getTime()) / 1000));
  throw ApiError.rateLimited('Too many failed login attempts', retryAfterSeconds);
}

/**
 * POST /api/admin/auth/login -- the human-credential entry point of the
 * real per-user auth system (Phase 1A). Deliberately still behind
 * requireSuperAdmin() like every other /api/admin/** route: this is NOT a
 * publicly reachable login form. Only svetikony-admin's BFF (holding the
 * existing service credential) can even reach this endpoint; the browser
 * never talks to svet-ikony directly. See the Phase 1A design report's
 * "Architecture Correction #1".
 */
export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw ApiError.validation('Request body must be JSON');
    }
    const { email, password } = (body as { email?: unknown; password?: unknown } | null) ?? {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      throw ApiError.validation('email and password are required');
    }
    const normalizedEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const keyHash = await hashRateLimitKey(normalizedEmail);

    // Lazy cleanup, no dedicated cron -- see admin-login-rate-limit.ts.
    // FAIL-OPEN, deliberately: this is bookkeeping, not enforcement, and
    // must never turn a login attempt into a 500.
    try {
      await cleanupExpiredRateLimit(now);
    } catch (error) {
      console.error('admin_login_rate_limit cleanup failed:', error);
    }

    // FAIL-OPEN, deliberately (Phase 1D.2 concurrency/failure-semantics
    // decision): if the limiter's own storage is unreadable, this request
    // proceeds to normal credential verification rather than rejecting
    // every login while the limiter itself is unhealthy. The limiter is
    // defense-in-depth on top of PBKDF2 password hashing, not the primary
    // defense -- a bug or outage confined to this one table must not
    // become a full admin-panel lockout, which would be a strictly worse
    // failure mode than briefly degraded brute-force protection. A total
    // D1 outage fails every query in this route anyway (500), rate
    // limiter included, so this only matters for a fault isolated to this
    // table specifically.
    try {
      const status = await getRateLimitStatus(keyHash, now);
      if (status.blocked && status.blockedUntil) rejectRateLimited(status.blockedUntil, now);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('admin_login_rate_limit status check failed, proceeding without it:', error);
    }

    const user = await getAdminUserByEmail(normalizedEmail);
    if (!user || !user.active) return rejectLogin(user, keyHash, now);

    const verification = await verifyPassword(password, user.passwordHash);
    if (!verification.valid) return rejectLogin(user, keyHash, now);

    if (verification.needsRehash) {
      const upgraded = await hashPassword(password);
      await updatePasswordHash(user.id, upgraded, now);
    }

    const rawToken = generateSessionToken();
    const tokenHash = await hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await createSession({ userId: user.id, tokenHash, createdAt: now, expiresAt });
    await touchLastLogin(user.id, now);

    // Best-effort, same fail-open trade-off as above: a successful login
    // must never become an error because the rate-limit row couldn't be
    // cleared.
    try {
      await resetRateLimit(keyHash);
    } catch (error) {
      console.error('admin_login_rate_limit reset failed:', error);
    }

    await recordAuditLog({
      userId: user.id,
      role: user.role,
      action: 'login',
      area: 'auth',
      method: 'POST',
      path: PATH,
      entityType: 'admin_user',
      entityId: user.id,
      success: true,
      createdAt: now,
    });

    return Response.json(
      { token: rawToken, user: toIdentity(user), expiresAt },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}
