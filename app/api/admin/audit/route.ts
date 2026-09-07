import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { recordAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { validateSession } from '@/lib/d1/repositories/admin-sessions';
import { hashSessionToken } from '@/lib/d1/session-token';

type AuditRequestBody = {
  action?: unknown;
  area?: unknown;
  method?: unknown;
  path?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  success?: unknown;
  statusCode?: unknown;
  requestId?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * POST /api/admin/audit -- writes one admin_audit_log row for an already-
 * authorized svetikony-admin BFF mutation (Phase 1D.1). Deliberately still
 * behind requireSuperAdmin() like every other /api/admin/** route: this is
 * NOT a publicly reachable endpoint, and it is NOT the primary
 * authorization check either (that already happened in the BFF's own
 * withAuth() before this call is ever made) -- it exists purely to persist
 * a record of what was authorized and what happened.
 *
 * CRITICAL trust boundary: the actor (user_id, role) is NEVER taken from
 * the request body, even though the BFF could technically send anything.
 * It is derived exclusively from a real, currently-valid admin_sessions
 * row via X-Admin-Session -- the exact same validateSession() used by
 * GET /api/admin/auth/session. A caller cannot spoof who performed an
 * action by lying in the body; the body only ever supplies WHAT happened
 * (action/area/method/path/entity/success/statusCode/requestId), never WHO.
 *
 * Every one of the 6 auth-failure modes below returns a uniform 401 --
 * unlike GET /api/admin/auth/session (which reports a missing header as
 * 400, since that route's caller is expected to handle "not logged in" as
 * a distinct case), this endpoint's only caller is withAuth()'s own
 * best-effort audit call, which treats any non-2xx identically (log
 * server-side, never surface to the end user) -- so there is no reason to
 * distinguish "malformed request" from "invalid session" here.
 */
export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const rawToken = request.headers.get('X-Admin-Session');
    if (!rawToken) {
      throw ApiError.authentication('X-Admin-Session header is required');
    }

    const tokenHash = await hashSessionToken(rawToken);
    const now = new Date().toISOString();
    const session = await validateSession(tokenHash, now);
    if (session.outcome !== 'valid') {
      throw ApiError.authentication('Invalid or expired session');
    }

    let body: AuditRequestBody;
    try {
      body = (await request.json()) as AuditRequestBody;
    } catch {
      throw ApiError.validation('Request body must be JSON');
    }

    if (!isNonEmptyString(body.action) || !isNonEmptyString(body.area) || !isNonEmptyString(body.method) || !isNonEmptyString(body.path)) {
      throw ApiError.validation('action, area, method, and path are required strings');
    }
    if (typeof body.success !== 'boolean') {
      throw ApiError.validation('success is required and must be a boolean');
    }
    if (body.entityType !== undefined && typeof body.entityType !== 'string') {
      throw ApiError.validation('entityType must be a string when present');
    }
    if (body.entityId !== undefined && typeof body.entityId !== 'string') {
      throw ApiError.validation('entityId must be a string when present');
    }
    if (body.statusCode !== undefined && typeof body.statusCode !== 'number') {
      throw ApiError.validation('statusCode must be a number when present');
    }
    if (body.requestId !== undefined && typeof body.requestId !== 'string') {
      throw ApiError.validation('requestId must be a string when present');
    }

    // The actor comes ONLY from `session.user`, resolved above -- never
    // from `body`, which has no userId/role fields in its own type at all.
    await recordAuditLog({
      userId: session.user.id,
      role: session.user.role,
      action: body.action,
      area: body.area,
      method: body.method,
      path: body.path,
      entityType: body.entityType,
      entityId: body.entityId,
      success: body.success,
      statusCode: body.statusCode,
      requestId: body.requestId,
      createdAt: now,
    });

    return Response.json({ recorded: true }, { status: 201, headers: { 'cache-control': 'no-store' } });
  });
}
