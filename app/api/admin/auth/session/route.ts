import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { validateSession } from '@/lib/d1/repositories/admin-sessions';
import { hashSessionToken } from '@/lib/d1/session-token';

const OUTCOME_DETAILS: Record<'not_found' | 'expired' | 'revoked' | 'inactive_user', string> = {
  not_found: 'Session not found',
  expired: 'Session expired',
  revoked: 'Session was revoked',
  inactive_user: 'Account is inactive',
};

/**
 * GET /api/admin/auth/session -- resolves an opaque human session (sent as
 * X-Admin-Session, never Authorization -- that header already carries the
 * service credential, see the Phase 1A design report's "Session Validation
 * Transport" correction) to a safe user identity. Still behind
 * requireSuperAdmin() like every other /api/admin/** route: only the
 * trusted svetikony-admin BFF ever calls this, never the browser directly.
 *
 * Unlike login, the 4 non-"valid" outcomes are reported with distinct
 * detail text, not one generic message -- the caller here is always the
 * already-authenticated BFF service, not an anonymous browser, so there is
 * no enumeration risk in telling it *why* a session is invalid (useful for
 * the BFF's own "please log in again" vs "your account was disabled" UX).
 */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const rawToken = request.headers.get('X-Admin-Session');
    if (!rawToken) {
      throw ApiError.validation('X-Admin-Session header is required');
    }

    const tokenHash = await hashSessionToken(rawToken);
    const now = new Date().toISOString();
    const result = await validateSession(tokenHash, now);

    if (result.outcome !== 'valid') {
      throw ApiError.authentication(OUTCOME_DETAILS[result.outcome]);
    }

    return Response.json(
      { user: result.user, expiresAt: result.expiresAt },
      { headers: { 'cache-control': 'no-store' } },
    );
  });
}
