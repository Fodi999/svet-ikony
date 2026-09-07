import { d1All, d1First, d1Run } from '../db';
import { fromD1Bool, genId } from '../mappers';

/** Real people who can operate svetikony-admin (Phase 1A). `role` mirrors
 * svetikony-admin's own lib/auth/permissions.ts Role union exactly -- no
 * roles are invented here. */
export type AdminRole = 'super_admin' | 'editor' | 'order_manager' | 'viewer';

type Row = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: string;
  active: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

/** Includes password_hash -- only for the login route's own verification
 * step. Never return this shape to a browser; see AdminUserIdentity for the
 * safe, public shape (id/name/email/role only). */
export type AdminUserRecord = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

/** The only thing ever safe to put in an HTTP response -- no password_hash,
 * no internal fields. */
export type AdminUserIdentity = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

function toRecord(row: Row): AdminUserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role as AdminRole,
    active: fromD1Bool(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export function toIdentity(user: AdminUserRecord): AdminUserIdentity {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function getAdminUserByEmail(email: string): Promise<AdminUserRecord | null> {
  const row = await d1First<Row>(
    'SELECT id, email, name, password_hash, role, active, created_at, updated_at, last_login_at FROM admin_users WHERE email = ?',
    email,
  );
  return row ? toRecord(row) : null;
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const rows = await d1All<Row>(
    'SELECT id, email, name, password_hash, role, active, created_at, updated_at, last_login_at FROM admin_users ORDER BY created_at',
  );
  return rows.map(toRecord);
}

export async function touchLastLogin(id: string, timestamp: string): Promise<void> {
  await d1Run('UPDATE admin_users SET last_login_at = ? WHERE id = ?', timestamp, id);
}

/** Used only by the login route's "rehash on successful verify" step (see
 * lib/d1/password.ts's needsRehash) -- never called directly with a
 * plaintext password from anywhere else. */
export async function updatePasswordHash(id: string, passwordHash: string, timestamp: string): Promise<void> {
  await d1Run('UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?', passwordHash, timestamp, id);
}

/** Used only by scripts/admin-cli/admin-cli.mjs's `create` command to
 * generate the INSERT it prints -- never called from a route (no route
 * creates admin_users rows; that is deliberately a human-reviewed,
 * out-of-band bootstrap operation, see the Phase 1A design report). Kept
 * here, not duplicated in the script, so the exact column order/shape has
 * one source of truth and is covered by this file's own tests. */
export function buildCreateAdminUserStatement(input: {
  email: string;
  name: string;
  passwordHash: string;
  role: AdminRole;
  now: string;
}): { sql: string; params: unknown[] } {
  const id = genId();
  return {
    sql: 'INSERT INTO admin_users (id, email, name, password_hash, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, input.email, input.name, input.passwordHash, input.role, 1, input.now, input.now],
  };
}
