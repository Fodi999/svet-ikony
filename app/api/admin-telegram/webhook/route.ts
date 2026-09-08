import { AdminTelegramClient } from '@/lib/telegram/admin-bot-client';
import { getAdminTelegramConfig } from '@/lib/telegram/admin-env';
import { recordAuditLog } from '@/lib/d1/repositories/admin-audit-log';
import { findActiveTelegramIdentity } from '@/lib/d1/repositories/admin-telegram-identities';
import { cancelPreviousForTelegramUser, countRecentForTelegramUser, createLoginRequest, LOGIN_REQUEST_RATE_WINDOW_MS, MAX_LOGIN_REQUESTS_PER_WINDOW } from '@/lib/d1/repositories/admin-telegram-login-requests';
import { getAdminUserById } from '@/lib/d1/repositories/admin-users';
import { generateDisplayCode, generateRawTicket, hashTicket } from '@/lib/d1/telegram-ticket';

/**
 * POST /api/admin-telegram/webhook -- Phase 3. A SEPARATE webhook endpoint
 * from the public content bot's (app/api/telegram/webhook), deliberately:
 * different secret (ADMIN_TELEGRAM_WEBHOOK_SECRET, never
 * TELEGRAM_WEBHOOK_SECRET), different bot token
 * (ADMIN_TELEGRAM_BOT_TOKEN), different trust boundary (this one can mint
 * real admin login tickets; the public one cannot).
 */

const PATH = '/api/admin-telegram/webhook';
const DENIED_TEXT = '⛔ Доступ заборонено.';
const START_TEXT = '🔐 «Світло Ікони — Admin Security»\n\nЦей бот використовується для безпечного входу\nдо адміністративної панелі.\n\nКоманда:\n/login — створити одноразове посилання для входу.';

type TelegramUser = { id: number; is_bot?: boolean };
type TelegramChat = { id: number; type: string };
type TelegramMessage = { chat: TelegramChat; from?: TelegramUser; text?: string };
type TelegramUpdate = { update_id: number; message?: TelegramMessage };

/** Constant-time comparison for the webhook secret -- same
 * accumulate-XOR-over-bytes technique lib/d1/password.ts's
 * timingSafeEqual already uses for password verification, applied here
 * per the Phase 3 brief's explicit "constant-time comparison if
 * practical" request. The public bot's webhook (app/api/telegram/webhook)
 * still uses a plain `===` -- left unchanged, out of scope for this
 * phase, not silently "fixed" alongside an unrelated feature. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i]! ^ bBytes[i]!;
  return diff === 0;
}

function validateSecret(request: Request, expected: string | null): boolean {
  if (!expected) return false; // fail closed: unconfigured secret rejects everything
  const received = request.headers.get('x-telegram-bot-api-secret-token');
  if (!received) return false;
  return timingSafeEqualStrings(received, expected);
}

async function handleStart(client: AdminTelegramClient, chatId: number, telegramUserId: string): Promise<void> {
  const identity = await findActiveTelegramIdentity(telegramUserId);
  await client.sendMessage(chatId, identity ? START_TEXT : DENIED_TEXT);
}

async function handleLogin(client: AdminTelegramClient, chatId: number, telegramUserId: string, panelUrl: string): Promise<void> {
  const now = new Date().toISOString();

  const identity = await findActiveTelegramIdentity(telegramUserId);
  if (!identity) {
    await recordAuditLog({
      userId: null,
      role: null,
      action: 'telegram_login_denied',
      area: 'auth',
      method: 'POST',
      path: PATH,
      success: false,
      createdAt: now,
    });
    await client.sendMessage(chatId, DENIED_TEXT);
    return;
  }

  const user = await getAdminUserById(identity.userId);
  if (!user || !user.active) {
    await recordAuditLog({
      userId: identity.userId,
      role: user?.role ?? null,
      action: 'telegram_login_denied',
      area: 'auth',
      method: 'POST',
      path: PATH,
      entityType: 'admin_user',
      entityId: identity.userId,
      success: false,
      createdAt: now,
    });
    await client.sendMessage(chatId, DENIED_TEXT);
    return;
  }

  const recentCount = await countRecentForTelegramUser(telegramUserId, now);
  if (recentCount >= MAX_LOGIN_REQUESTS_PER_WINDOW) {
    await client.sendMessage(chatId, `⏳ Забагато спроб входу. Спробуйте ще раз через ${Math.ceil(LOGIN_REQUEST_RATE_WINDOW_MS / 60_000)} хв.`);
    return;
  }

  await cancelPreviousForTelegramUser(telegramUserId, now);

  const rawTicket = generateRawTicket();
  const ticketHash = await hashTicket(rawTicket);
  const displayCode = generateDisplayCode();
  await createLoginRequest({ userId: user.id, telegramUserId, ticketHash, displayCode, now });

  await recordAuditLog({
    userId: user.id,
    role: user.role,
    action: 'telegram_login_requested',
    area: 'auth',
    method: 'POST',
    path: PATH,
    entityType: 'admin_user',
    entityId: user.id,
    success: true,
    createdAt: now,
  });

  const firstName = user.name.split(' ')[0] ?? user.name;
  const text = `🔐 Вхід до «Світло Ікони»\n\nКористувач: ${firstName}\nДоступ: ${user.role}\nПосилання діє 2 хвилини.`;
  const url = `${panelUrl.replace(/\/$/, '')}/telegram-login#ticket=${rawTicket}`;
  await client.sendMessage(chatId, text, { inline_keyboard: [[{ text: '🔐 Відкрити адмінку', url }]] });
}

export async function POST(request: Request) {
  const config = await getAdminTelegramConfig();
  if (!config) {
    return Response.json({ error: 'Admin Telegram integration is not configured' }, { status: 503 });
  }

  if (!validateSecret(request, config.webhookSecret)) {
    return new Response(null, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch (err) {
    console.warn('Admin Telegram webhook: failed to parse update body', err);
    return new Response(null, { status: 400 });
  }

  const message = update.message;
  const client = new AdminTelegramClient(config.botToken);

  try {
    if (message?.text && message.from && !message.from.is_bot) {
      const telegramUserId = String(message.from.id);
      const chatId = message.chat.id;
      const text = message.text.trim();

      if (text === '/start' || text.startsWith('/start@')) {
        await handleStart(client, chatId, telegramUserId);
      } else if (text === '/login' || text.startsWith('/login@')) {
        await handleLogin(client, chatId, telegramUserId, config.panelUrl);
      }
      // Any other text is intentionally ignored, same as the public bot's webhook.
    }
  } catch (err) {
    // Always 200 once the update is accepted, so Telegram doesn't retry.
    console.error('Admin Telegram webhook: error handling update', err);
  }

  return new Response('OK', { status: 200 });
}
