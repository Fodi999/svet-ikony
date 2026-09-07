import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { recordAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { revokeSession, validateSession } from '@/lib/d1/repositories/admin-sessions';
import { hashSessionToken } from '@/lib/d1/session-token';

/**
 * POST /api/admin/auth/logout -- revokes an opaque human session (X-Admin-
 * Session, see /session route's doc comment on why not Authorization).
 * Still behind requireSuperAdmin() like every other /api/admin/** route.
 *
 * Idempotent by design: revoking an already-revoked, expired, or unknown
 * token is not an error -- a browser that logs out twice (e.g. a stale tab)
 * must get a clean response both times, not a 401. Only a genuinely
 * malformed request (no header at all) is rejected.
 */
export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const rawToken = request.headers.get('X-Admin-Session');
    if (!rawToken) {
      throw ApiError.validation('X-Admin-Session header is required');
    }

    const tokenHash = await hashSessionToken(rawToken);
    const now = new Date().toISOString();

    // Resolved before revoking purely so the audit-log entry can carry the
    // real actor -- revokeSession() itself only reports whether it changed
    // a row, not who owned it.
    const before = await validateSession(tokenHash, now);
    const revoked = await revokeSession(tokenHash, now);

    await recordAuditLog({
      userId: before.outcome === 'valid' ? before.user.id : null,
      role: before.outcome === 'valid' ? before.user.role : null,
      action: 'logout',
      area: 'auth',
      method: 'POST',
      path: '/api/admin/auth/logout',
      entityType: before.outcome === 'valid' ? 'admin_user' : undefined,
      entityId: before.outcome === 'valid' ? before.user.id : undefined,
      success: revoked,
      createdAt: now,
    });

    return Response.json({ revoked }, { headers: { 'cache-control': 'no-store' } });
  });
}
