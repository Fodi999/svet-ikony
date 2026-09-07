import { d1All, d1Run } from '../db';
import { genId, toD1Bool } from '../mappers';
import type { AdminRole } from './admin-users';

/**
 * Append-only admin action record. Phase 1A wrote only login/session/
 * logout events here; Phase 1D.1 adds the ~71 withAuth()-protected BFF
 * mutation events (svetikony-admin's app/api/bff/_lib/audit.ts calls
 * POST /api/admin/audit, which resolves the real actor from the human
 * session -- see that route -- then calls recordAuditLog with the
 * server-derived identity, never whatever the request body claimed).
 * Deliberately structured-fields-only: never pass anything here that
 * could be a password, a raw/hashed token, a secret, a header value, or a
 * request body -- see AuditLogEntry's own field set, which is exhaustive
 * by design (no free-form "details" field to accidentally leak something
 * through).
 */
export type AuditLogEntry = {
  /** Null only for a failed login against an email matching no real
   * account -- there is no real actor to attribute the event to. Every
   * other event (successful login, logout, and every Phase 1D.1 BFF
   * mutation) has a real user. */
  userId: string | null;
  role: AdminRole | null;
  action: string;
  area: string;
  method: string;
  path: string;
  entityType?: string;
  entityId?: string;
  success: boolean;
  /** The real HTTP status the mutating handler actually returned --
   * always observed after the fact, never assumed from `success` alone.
   * Absent for login/logout events (Phase 1A never had a "handler status"
   * to report). */
  statusCode?: number;
  /** Correlates this row with the BFF mutation, the resource's own
   * upstream call, and any server-side error log for the same action
   * (minted once per mutation in svetikony-admin's withAuth(), Phase
   * 1D.1). Absent for login/logout events. */
  requestId?: string;
  createdAt: string;
};

export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  const id = genId();
  await d1Run(
    'INSERT INTO admin_audit_log (id, user_id, role, action, area, method, path, entity_type, entity_id, success, status_code, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    entry.userId,
    entry.role,
    entry.action,
    entry.area,
    entry.method,
    entry.path,
    entry.entityType ?? null,
    entry.entityId ?? null,
    toD1Bool(entry.success),
    entry.statusCode ?? null,
    entry.requestId ?? null,
    entry.createdAt,
  );
}

type LogRow = {
  id: string;
  user_id: string | null;
  role: string | null;
  action: string;
  area: string;
  method: string;
  path: string;
  entity_type: string | null;
  entity_id: string | null;
  success: number;
  status_code: number | null;
  request_id: string | null;
  created_at: string;
};

export type AuditLogRecord = {
  id: string;
  userId: string | null;
  role: AdminRole | null;
  action: string;
  area: string;
  method: string;
  path: string;
  entityType: string | null;
  entityId: string | null;
  success: boolean;
  statusCode: number | null;
  requestId: string | null;
  createdAt: string;
};

/** Not called by any route yet -- exists so the table is genuinely
 * readable (for a future admin UI, or ad-hoc inspection) and testable now,
 * rather than being a write-only black box. */
export async function listAuditLog(limit = 100): Promise<AuditLogRecord[]> {
  const rows = await d1All<LogRow>('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT ?', limit);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    role: row.role as AdminRole | null,
    action: row.action,
    area: row.area,
    method: row.method,
    path: row.path,
    entityType: row.entity_type,
    entityId: row.entity_id,
    success: row.success === 1,
    statusCode: row.status_code,
    requestId: row.request_id,
    createdAt: row.created_at,
  }));
}
