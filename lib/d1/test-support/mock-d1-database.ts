/**
 * Minimal in-memory D1Database test double for the admin-auth repositories
 * (Phase 1A) -- no D1 test double existed anywhere in this repo before
 * (route tests that touch D1 don't exist yet either; the only prior test
 * double, MockR2Bucket, is R2-specific). Mirrors that same house style: a
 * small, hand-rolled fake purpose-built for the exact queries the code
 * under test issues, not a general SQL engine. Real SQLite-in-Node
 * (node:sqlite) was considered and rejected -- it's still an experimental
 * Node API with no CI safety net in this repo to catch a breaking change.
 *
 * Supports exactly the statement shapes lib/d1/repositories/admin-*.ts
 * issue: single-table INSERT/UPDATE/SELECT (by one or two WHERE columns)
 * against admin_users/admin_sessions/admin_audit_log/admin_login_rate_limit/
 * admin_telegram_identities/admin_telegram_login_requests (Phase 3 added
 * the last two -- the Telegram login route tests need all six tables
 * together in one coherent fake, not a second parallel one), plus the one
 * session+user JOIN. If a repository starts issuing a new query shape,
 * this fake needs a matching new branch -- it deliberately does not try to
 * be a general-purpose SQL interpreter.
 */

type Row = Record<string, unknown>;

type TableName =
  | 'admin_users'
  | 'admin_sessions'
  | 'admin_audit_log'
  | 'admin_login_rate_limit'
  | 'admin_telegram_identities'
  | 'admin_telegram_login_requests';

export class MockD1Database {
  tables: Record<TableName, Row[]> = {
    admin_users: [],
    admin_sessions: [],
    admin_audit_log: [],
    admin_login_rate_limit: [],
    admin_telegram_identities: [],
    admin_telegram_login_requests: [],
  };

  reset(): void {
    this.tables.admin_users = [];
    this.tables.admin_sessions = [];
    this.tables.admin_audit_log = [];
    this.tables.admin_login_rate_limit = [];
    this.tables.admin_telegram_identities = [];
    this.tables.admin_telegram_login_requests = [];
  }

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this, sql);
  }
}

class MockD1PreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: MockD1Database,
    private readonly sql: string,
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.execute();
    return (rows[0] as T) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.execute() as T[] };
  }

  async run(): Promise<{ success: true; meta: { changes: number; last_row_id: number } }> {
    const changes = this.execute().length > 0 || this.wasWrite ? this.writeCount : 0;
    return { success: true, meta: { changes, last_row_id: 0 } };
  }

  private wasWrite = false;
  private writeCount = 0;

  /** Dispatches on the statement's shape rather than parsing real SQL. */
  private execute(): Row[] {
    const sql = this.sql.replace(/\s+/g, ' ').trim();

    if (/^INSERT INTO admin_users/i.test(sql)) {
      const [id, email, name, password_hash, role, active, created_at, updated_at] = this.params;
      this.assertUniqueEmail(email as string);
      this.db.tables.admin_users.push({ id, email, name, password_hash, role, active, created_at, updated_at, last_login_at: null });
      this.wasWrite = true;
      this.writeCount = 1;
      return [];
    }

    if (/^INSERT INTO admin_sessions/i.test(sql)) {
      const [id, user_id, token_hash, created_at, expires_at] = this.params;
      this.db.tables.admin_sessions.push({ id, user_id, token_hash, created_at, expires_at, revoked_at: null });
      this.wasWrite = true;
      this.writeCount = 1;
      return [];
    }

    if (/^INSERT INTO admin_audit_log/i.test(sql)) {
      const [id, user_id, role, action, area, method, path, entity_type, entity_id, success, status_code, request_id, created_at] = this.params;
      this.db.tables.admin_audit_log.push({
        id,
        user_id,
        role,
        action,
        area,
        method,
        path,
        entity_type,
        entity_id,
        success,
        status_code,
        request_id,
        created_at,
      });
      this.wasWrite = true;
      this.writeCount = 1;
      return [];
    }

    if (/^SELECT .* FROM admin_users WHERE email = \?/i.test(sql)) {
      const [email] = this.params;
      return this.db.tables.admin_users.filter((row) => row.email === email);
    }

    if (/^SELECT .* FROM admin_users WHERE id = \?/i.test(sql)) {
      const [id] = this.params;
      return this.db.tables.admin_users.filter((row) => row.id === id);
    }

    if (/^SELECT .* FROM admin_users ORDER BY/i.test(sql)) {
      return [...this.db.tables.admin_users].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    }

    if (/^SELECT \* FROM admin_audit_log ORDER BY created_at DESC LIMIT \?/i.test(sql)) {
      const [limit] = this.params as [number];
      return [...this.db.tables.admin_audit_log]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit);
    }

    if (/^UPDATE admin_users SET last_login_at/i.test(sql)) {
      const [last_login_at, id] = this.params;
      const row = this.db.tables.admin_users.find((r) => r.id === id);
      this.writeCount = row ? 1 : 0;
      if (row) row.last_login_at = last_login_at;
      this.wasWrite = true;
      return [];
    }

    if (/^UPDATE admin_users SET password_hash/i.test(sql)) {
      const [password_hash, updated_at, id] = this.params;
      const row = this.db.tables.admin_users.find((r) => r.id === id);
      this.writeCount = row ? 1 : 0;
      if (row) {
        row.password_hash = password_hash;
        row.updated_at = updated_at;
      }
      this.wasWrite = true;
      return [];
    }

    if (/^SELECT .* FROM admin_sessions .* JOIN admin_users/i.test(sql)) {
      const [tokenHash] = this.params;
      const session = this.db.tables.admin_sessions.find((row) => row.token_hash === tokenHash);
      if (!session) return [];
      const user = this.db.tables.admin_users.find((row) => row.id === session.user_id);
      if (!user) return [];
      return [
        {
          session_id: session.id,
          expires_at: session.expires_at,
          revoked_at: session.revoked_at,
          user_id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          active: user.active,
        },
      ];
    }

    if (/^UPDATE admin_sessions SET revoked_at/i.test(sql)) {
      const [revoked_at, tokenHash] = this.params;
      const row = this.db.tables.admin_sessions.find((r) => r.token_hash === tokenHash);
      this.writeCount = row && !row.revoked_at ? 1 : 0;
      if (row) row.revoked_at = revoked_at;
      this.wasWrite = true;
      return [];
    }

    // Phase 1D.2: mirrors lib/d1/repositories/admin-login-rate-limit.ts's
    // recordFailedAttempt SQL exactly (same CASE conditions, same
    // parameter positions -- `now`/`windowCutoff` are each bound 3x/3x by
    // that function, always identical across repeats, so they collapse to
    // one JS value here). The real SQL was verified against actual SQLite
    // (node:sqlite) during design before being ported to both this mock
    // and the production statement; if the two ever diverge, this mock
    // stops being a faithful test double for the real behavior.
    if (/^INSERT INTO admin_login_rate_limit/i.test(sql)) {
      const [key_hash, insertWindowStart, insertUpdatedAt, now, windowCutoff, , , newWindowStart, , , maxAttempts, newBlockedUntil, updatedAt] =
        this.params as [string, string, string, string, string, string, string, string, string, string, number, string, string];
      let row = this.db.tables.admin_login_rate_limit.find((r) => r.key_hash === key_hash);
      if (!row) {
        row = { key_hash, failed_count: 1, window_started_at: insertWindowStart, blocked_until: null, updated_at: insertUpdatedAt };
        this.db.tables.admin_login_rate_limit.push(row);
      } else {
        const isBlocked = row.blocked_until !== null && (row.blocked_until as string) > now;
        const windowExpired = (row.window_started_at as string) <= windowCutoff;
        const newFailedCount = isBlocked ? (row.failed_count as number) : windowExpired ? 1 : (row.failed_count as number) + 1;
        row.window_started_at = isBlocked ? row.window_started_at : windowExpired ? newWindowStart : row.window_started_at;
        row.blocked_until = isBlocked ? row.blocked_until : newFailedCount >= maxAttempts ? newBlockedUntil : null;
        row.failed_count = newFailedCount;
        row.updated_at = updatedAt;
      }
      this.wasWrite = true;
      this.writeCount = 1;
      return [{ failed_count: row.failed_count, blocked_until: row.blocked_until }];
    }

    if (/^SELECT failed_count, blocked_until FROM admin_login_rate_limit WHERE key_hash = \?/i.test(sql)) {
      const [keyHash] = this.params;
      const row = this.db.tables.admin_login_rate_limit.find((r) => r.key_hash === keyHash);
      return row ? [{ failed_count: row.failed_count, blocked_until: row.blocked_until }] : [];
    }

    if (/^DELETE FROM admin_login_rate_limit WHERE key_hash = \?/i.test(sql)) {
      const [keyHash] = this.params;
      const before = this.db.tables.admin_login_rate_limit.length;
      this.db.tables.admin_login_rate_limit = this.db.tables.admin_login_rate_limit.filter((r) => r.key_hash !== keyHash);
      this.writeCount = before - this.db.tables.admin_login_rate_limit.length;
      this.wasWrite = true;
      return [];
    }

    if (/^DELETE FROM admin_login_rate_limit WHERE updated_at < \?/i.test(sql)) {
      const [cutoff] = this.params;
      const before = this.db.tables.admin_login_rate_limit.length;
      this.db.tables.admin_login_rate_limit = this.db.tables.admin_login_rate_limit.filter((r) => (r.updated_at as string) >= (cutoff as string));
      this.writeCount = before - this.db.tables.admin_login_rate_limit.length;
      this.wasWrite = true;
      return [];
    }

    // ---- Phase 3: Telegram passwordless admin login ----

    if (/^INSERT INTO admin_telegram_identities/i.test(sql)) {
      const [id, user_id, telegram_user_id, telegram_chat_id, created_at, updated_at] = this.params;
      if (this.db.tables.admin_telegram_identities.some((row) => row.telegram_user_id === telegram_user_id)) {
        throw new Error('UNIQUE constraint failed: admin_telegram_identities.telegram_user_id');
      }
      this.db.tables.admin_telegram_identities.push({ id, user_id, telegram_user_id, telegram_chat_id, created_at, updated_at, revoked_at: null });
      this.wasWrite = true;
      this.writeCount = 1;
      return [];
    }

    if (/^SELECT .* FROM admin_telegram_identities WHERE telegram_user_id = \? AND revoked_at IS NULL/i.test(sql)) {
      const [telegramUserId] = this.params;
      return this.db.tables.admin_telegram_identities.filter((row) => row.telegram_user_id === telegramUserId && row.revoked_at === null);
    }

    if (/^UPDATE admin_telegram_identities SET revoked_at/i.test(sql)) {
      const [revoked_at, updated_at, telegramUserId] = this.params;
      const row = this.db.tables.admin_telegram_identities.find((r) => r.telegram_user_id === telegramUserId && r.revoked_at === null);
      this.writeCount = row ? 1 : 0;
      if (row) {
        row.revoked_at = revoked_at;
        row.updated_at = updated_at;
      }
      this.wasWrite = true;
      return [];
    }

    if (/^INSERT INTO admin_telegram_login_requests/i.test(sql)) {
      const [id, user_id, telegram_user_id, ticket_hash, display_code, created_at, expires_at] = this.params;
      if (this.db.tables.admin_telegram_login_requests.some((row) => row.ticket_hash === ticket_hash)) {
        throw new Error('UNIQUE constraint failed: admin_telegram_login_requests.ticket_hash');
      }
      this.db.tables.admin_telegram_login_requests.push({
        id,
        user_id,
        telegram_user_id,
        ticket_hash,
        display_code,
        created_at,
        expires_at,
        consumed_at: null,
        cancelled_at: null,
      });
      this.wasWrite = true;
      this.writeCount = 1;
      return [];
    }

    if (/^UPDATE admin_telegram_login_requests SET cancelled_at = \? WHERE telegram_user_id = \?/i.test(sql)) {
      const [cancelled_at, telegramUserId, now] = this.params as [string, string, string];
      let count = 0;
      for (const row of this.db.tables.admin_telegram_login_requests) {
        if (row.telegram_user_id === telegramUserId && row.consumed_at === null && row.cancelled_at === null && (row.expires_at as string) > now) {
          row.cancelled_at = cancelled_at;
          count++;
        }
      }
      this.writeCount = count;
      this.wasWrite = true;
      return [];
    }

    if (/^SELECT COUNT\(\*\) AS count FROM admin_telegram_login_requests WHERE telegram_user_id = \? AND created_at > \?/i.test(sql)) {
      const [telegramUserId, windowStart] = this.params as [string, string];
      const count = this.db.tables.admin_telegram_login_requests.filter(
        (row) => row.telegram_user_id === telegramUserId && (row.created_at as string) > windowStart,
      ).length;
      return [{ count }];
    }

    if (/^UPDATE admin_telegram_login_requests\s+SET consumed_at = \?\s+WHERE ticket_hash = \?/i.test(sql)) {
      const [consumed_at, ticketHash, now] = this.params as [string, string, string];
      const row = this.db.tables.admin_telegram_login_requests.find(
        (r) => r.ticket_hash === ticketHash && r.consumed_at === null && r.cancelled_at === null && (r.expires_at as string) > now,
      );
      if (!row) {
        this.writeCount = 0;
        this.wasWrite = true;
        return [];
      }
      row.consumed_at = consumed_at;
      this.writeCount = 1;
      this.wasWrite = true;
      return [{ user_id: row.user_id, telegram_user_id: row.telegram_user_id }];
    }

    if (/^SELECT \* FROM admin_telegram_login_requests WHERE ticket_hash = \?/i.test(sql)) {
      const [ticketHash] = this.params;
      return this.db.tables.admin_telegram_login_requests.filter((row) => row.ticket_hash === ticketHash);
    }

    throw new Error(`MockD1Database: unrecognized statement shape: ${sql}`);
  }

  private assertUniqueEmail(email: string): void {
    if (this.db.tables.admin_users.some((row) => row.email === email)) {
      throw new Error('UNIQUE constraint failed: admin_users.email');
    }
  }
}
