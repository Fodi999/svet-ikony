import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { recordAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { consumeLoginRequest } from '@/lib/d1/repositories/admin-telegram-login-requests';
import { findActiveTelegramIdentity } from '@/lib/d1/repositories/admin-telegram-identities';
import { createSession } from '@/lib/d1/repositories/admin-sessions';
import { getAdminUserById, toIdentity, touchLastLogin, type AdminRole } from '@/lib/d1/repositories/admin-users';
import { generateSessionToken, hashSessionToken } from '@/lib/d1/session-token';
import { hashTicket } from '@/lib/d1/telegram-ticket';

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // matches the password login route exactly
const PATH = '/api/admin/auth/telegram/exchange';

/** Every rejection path returns the exact same generic 401 -- an invalid,
 * expired, already-consumed, or cancelled ticket, an inactive user, and a
 * meanwhile-revoked Telegram binding must all be indistinguishable to the
 * caller, same principle as the password login route's rejectLogin(). */
async function denyExchange(userId: string | null, role: AdminRole | null): Promise<never> {
  await recordAuditLog({
    userId,
    role,
    action: 'telegram_login_denied',
    area: 'auth',
    method: 'POST',
    path: PATH,
    entityType: userId ? 'admin_user' : undefined,
    entityId: userId ?? undefined,
    success: false,
    createdAt: new Date().toISOString(),
  });
  throw ApiError.authentication('Invalid or expired login ticket');
}

/**
 * POST /api/admin/auth/telegram/exchange -- Phase 3. Called only by
 * svetikony-admin's BFF (same requireSuperAdmin service-credential
 * boundary as the password login route; the browser never reaches this
 * directly). Input: `{ ticket: <raw ticket> }`. Never creates a parallel
 * session architecture -- the successful outcome here is the exact same
 * admin_sessions row / opaque token shape POST /api/admin/auth/login
 * produces, so the BFF's cookie-setting logic needs zero special-casing
 * for the Telegram path.
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
    const { ticket } = (body as { ticket?: unknown } | null) ?? {};
    if (typeof ticket !== 'string' || !ticket) {
      throw ApiError.validation('ticket is required');
    }

    const now = new Date().toISOString();
    const ticketHash = await hashTicket(ticket);

    // Atomic: exactly one concurrent exchange of the same ticket can ever
    // succeed -- see consumeLoginRequest's own doc comment. Burns the
    // ticket unconditionally, even if a later check below still rejects
    // the login -- a ticket must never be exchangeable twice regardless of
    // why the first attempt ultimately failed.
    const consumed = await consumeLoginRequest(ticketHash, now);
    if (!consumed) {
      return denyExchange(null, null);
    }

    const user = await getAdminUserById(consumed.userId);
    if (!user || !user.active) {
      return denyExchange(consumed.userId, user?.role ?? null);
    }

    // Defense in depth beyond the literal spec: re-verify the Telegram
    // binding is still live at exchange time, not just at ticket-creation
    // time (up to LOGIN_REQUEST_TTL_MS earlier) -- an admin revoked mid-flight
    // must not still be able to complete a login that was already in flight.
    const identity = await findActiveTelegramIdentity(consumed.telegramUserId);
    if (!identity || identity.userId !== user.id) {
      return denyExchange(user.id, user.role);
    }

    const rawToken = generateSessionToken();
    const tokenHash = await hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await createSession({ userId: user.id, tokenHash, createdAt: now, expiresAt });
    await touchLastLogin(user.id, now);

    await recordAuditLog({
      userId: user.id,
      role: user.role,
      action: 'telegram_login_success',
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
