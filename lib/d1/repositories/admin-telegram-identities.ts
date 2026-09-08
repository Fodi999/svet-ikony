import { d1First } from '../db';

/** Explicit server-side Telegram-account <-> admin_users bindings (Phase
 * 3). Rows are only ever created out-of-band by
 * scripts/admin-cli/admin-cli.mjs's `telegram-bind` command -- no route in
 * this file writes here, matching admin_users' own "human-reviewed
 * bootstrap only" convention. */

type Row = {
  id: string;
  user_id: string;
  telegram_user_id: string;
  telegram_chat_id: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

export type TelegramIdentityRecord = {
  id: string;
  userId: string;
  telegramUserId: string;
  telegramChatId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

function toRecord(row: Row): TelegramIdentityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    telegramUserId: row.telegram_user_id,
    telegramChatId: row.telegram_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
  };
}

/** The one lookup the admin webhook and exchange endpoint both need: is
 * this numeric Telegram id currently, actively bound to an admin_users
 * row? `revoked_at IS NULL` is part of the WHERE clause itself (not a
 * post-fetch filter) so a revoked identity is indistinguishable from one
 * that was never bound at all -- both resolve to `null` here, and the
 * caller's response to an unknown/revoked identity must be the same
 * generic "Доступ заборонено" either way (see the Phase 3 security model:
 * never reveal whether a binding used to exist). */
export async function findActiveTelegramIdentity(telegramUserId: string): Promise<TelegramIdentityRecord | null> {
  const row = await d1First<Row>(
    'SELECT id, user_id, telegram_user_id, telegram_chat_id, created_at, updated_at, revoked_at FROM admin_telegram_identities WHERE telegram_user_id = ? AND revoked_at IS NULL',
    telegramUserId,
  );
  return row ? toRecord(row) : null;
}

/** Used only by scripts/admin-cli/admin-cli.mjs's `telegram-bind` command
 * to generate the SQL it prints -- resolves user_id from email via a
 * subselect (INSERT ... SELECT) rather than requiring the caller to
 * already know the admin_users.id, matching the existing CLI's
 * email-addressed disable/enable/set-role commands. Kept here (not
 * duplicated in the .mjs script) for the same one-source-of-truth reason
 * buildCreateAdminUserStatement is kept in admin-users.ts. */
export function buildBindTelegramIdentityStatement(input: { email: string; telegramUserId: string; now: string }): { sql: string; params: unknown[] } {
  const id = crypto.randomUUID();
  return {
    sql: `INSERT INTO admin_telegram_identities (id, user_id, telegram_user_id, telegram_chat_id, created_at, updated_at)
SELECT ?, id, ?, NULL, ?, ? FROM admin_users WHERE email = ?`,
    params: [id, input.telegramUserId, input.now, input.now, input.email],
  };
}
