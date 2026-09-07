import { d1First, d1Run } from '../db';
import { fromD1Bool, genId } from '../mappers';
import type { AdminRole } from './admin-users';

/** Opaque, DB-backed sessions (Phase 1A) -- deliberately not a stateless
 * JWT. A stored, revocable row is what makes "logout invalidates the
 * session" and "a disabled account is rejected immediately" actually true
 * rather than only true after the token's natural expiry. See the Phase 1A
 * design report for the full reasoning against a JWT-cookie alternative. */

type SessionWithUserRow = {
  session_id: string;
  expires_at: string;
  revoked_at: string | null;
  user_id: string;
  email: string;
  name: string;
  role: string;
  active: number;
};

export type SessionValidation =
  | { outcome: 'valid'; user: { id: string; name: string; email: string; role: AdminRole }; expiresAt: string }
  | { outcome: 'not_found' }
  | { outcome: 'expired' }
  | { outcome: 'revoked' }
  | { outcome: 'inactive_user' };

export async function createSession(input: { userId: string; tokenHash: string; createdAt: string; expiresAt: string }): Promise<{ id: string }> {
  const id = genId();
  await d1Run(
    'INSERT INTO admin_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.userId,
    input.tokenHash,
    input.createdAt,
    input.expiresAt,
  );
  return { id };
}

/** The single query the /api/admin/auth/session route and logout both need:
 * resolve a presented token's hash straight to its (still-live-or-not)
 * session + owning user in one round trip, then let the caller apply the
 * expiry/revoked/active checks -- kept explicit in the caller rather than
 * silently baked into the WHERE clause, so each rejection reason is
 * distinguishable (matches the brief's "expired -> 401, revoked -> 401,
 * inactive user -> 401" as three separately testable outcomes, not one
 * opaque "not found"). */
export async function validateSession(tokenHash: string, now: string): Promise<SessionValidation> {
  const row = await d1First<SessionWithUserRow>(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at, u.id AS user_id, u.email, u.name, u.role, u.active
     FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    tokenHash,
  );
  if (!row) return { outcome: 'not_found' };
  if (row.revoked_at) return { outcome: 'revoked' };
  if (row.expires_at < now) return { outcome: 'expired' };
  if (!fromD1Bool(row.active)) return { outcome: 'inactive_user' };
  return {
    outcome: 'valid',
    user: { id: row.user_id, name: row.name, email: row.email, role: row.role as AdminRole },
    expiresAt: row.expires_at,
  };
}

/** Idempotent: revoking an already-revoked or nonexistent token is not an
 * error -- logout must never fail just because the session was already
 * gone. Returns whether a live session was actually revoked, purely for
 * the audit-log entry's own `success` field. */
export async function revokeSession(tokenHash: string, revokedAt: string): Promise<boolean> {
  const result = await d1Run(
    'UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
    revokedAt,
    tokenHash,
  );
  return result.meta.changes > 0;
}
