import { d1First, d1Run } from '../db';
import { genId } from '../mappers';

/**
 * Short-lived, single-use Telegram login tickets (Phase 3). See
 * lib/d1/telegram-ticket.ts for how the raw ticket/hash/display code are
 * generated -- this module only ever stores/reads the hash, never the raw
 * value.
 *
 * TTL is fixed at 2 minutes (LOGIN_REQUEST_TTL_MS), matching the Telegram
 * message's own "Посилання діє 2 хвилини" copy -- kept as one constant so
 * the message text and the actual enforced expiry can never drift.
 */
export const LOGIN_REQUEST_TTL_MS = 2 * 60 * 1000;

/** Per-Telegram-identity request-volume cap, independent of outcome
 * (unlike admin_login_rate_limit's failed-attempt-only counting) -- a
 * `/login` command itself is the thing being rate limited here, not a
 * credential guess, so every request counts regardless of whether it
 * later succeeds. */
export const MAX_LOGIN_REQUESTS_PER_WINDOW = 5;
export const LOGIN_REQUEST_RATE_WINDOW_MS = 10 * 60 * 1000;

type Row = {
  id: string;
  user_id: string;
  telegram_user_id: string;
  ticket_hash: string;
  display_code: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  cancelled_at: string | null;
};

export async function createLoginRequest(input: {
  userId: string;
  telegramUserId: string;
  ticketHash: string;
  displayCode: string;
  now: string;
}): Promise<{ id: string; expiresAt: string }> {
  const id = genId();
  const expiresAt = new Date(new Date(input.now).getTime() + LOGIN_REQUEST_TTL_MS).toISOString();
  await d1Run(
    'INSERT INTO admin_telegram_login_requests (id, user_id, telegram_user_id, ticket_hash, display_code, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    input.userId,
    input.telegramUserId,
    input.ticketHash,
    input.displayCode,
    input.now,
    expiresAt,
  );
  return { id, expiresAt };
}

/** "Only one live login ticket per Telegram identity" -- called
 * immediately before creating a new ticket. Only touches requests that are
 * actually still live (not already consumed, not already cancelled, not
 * already expired); a stale/expired row is simply left alone since it can
 * no longer be exchanged anyway. */
export async function cancelPreviousForTelegramUser(telegramUserId: string, now: string): Promise<void> {
  await d1Run(
    'UPDATE admin_telegram_login_requests SET cancelled_at = ? WHERE telegram_user_id = ? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?',
    now,
    telegramUserId,
    now,
  );
}

/** Rate-limit read: how many login requests (regardless of outcome) has
 * this Telegram identity created within the trailing window. Cheap,
 * read-only, safe to call before doing any write work -- same shape as
 * admin-login-rate-limit.ts's getRateLimitStatus. */
export async function countRecentForTelegramUser(telegramUserId: string, now: string): Promise<number> {
  const windowStart = new Date(new Date(now).getTime() - LOGIN_REQUEST_RATE_WINDOW_MS).toISOString();
  const row = await d1First<{ count: number }>(
    'SELECT COUNT(*) AS count FROM admin_telegram_login_requests WHERE telegram_user_id = ? AND created_at > ?',
    telegramUserId,
    windowStart,
  );
  return row?.count ?? 0;
}

export type ConsumedLoginRequest = { userId: string; telegramUserId: string };

/**
 * The one atomic write this module depends on for replay-safety: a single
 * `UPDATE ... WHERE consumed_at IS NULL AND cancelled_at IS NULL AND
 * expires_at > ? RETURNING ...` statement, never a separate SELECT-then-
 * UPDATE pair. D1 serializes all writes through one primary, so two
 * simultaneous exchange attempts for the same ticket cannot both observe
 * `consumed_at IS NULL` and both proceed -- exactly one UPDATE actually
 * matches the row (the first to commit sets consumed_at, which makes the
 * second's WHERE clause no longer match), so exactly one call here ever
 * returns a row. The second returns null and the exchange route treats
 * that identically to "ticket not found" -- a generic auth failure, never
 * a distinguishable "someone already used this" message.
 */
export async function consumeLoginRequest(ticketHash: string, now: string): Promise<ConsumedLoginRequest | null> {
  const row = await d1First<{ user_id: string; telegram_user_id: string }>(
    `UPDATE admin_telegram_login_requests
     SET consumed_at = ?
     WHERE ticket_hash = ? AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > ?
     RETURNING user_id, telegram_user_id`,
    now,
    ticketHash,
    now,
  );
  return row ? { userId: row.user_id, telegramUserId: row.telegram_user_id } : null;
}

/** Test/diagnostic helper only -- reads a request row as-is, no filtering.
 * Not used by any route. */
export async function getLoginRequestByTicketHash(ticketHash: string): Promise<Row | null> {
  return d1First<Row>('SELECT * FROM admin_telegram_login_requests WHERE ticket_hash = ?', ticketHash);
}
