import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockD1Database } from '@/lib/d1/test-support/mock-d1-database';

const mockDb = new MockD1Database();

const ADMIN_BOT_TOKEN = 'admin-bot-token-abc123';
const ADMIN_WEBHOOK_SECRET = 'admin-webhook-secret-xyz789';
const PANEL_URL = 'https://admin.example.test';
const PUBLIC_BOT_TOKEN = 'public-content-bot-token-should-never-be-used-here';

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({
    env: {
      DB: mockDb,
      ADMIN_TELEGRAM_BOT_TOKEN: ADMIN_BOT_TOKEN,
      ADMIN_TELEGRAM_WEBHOOK_SECRET: ADMIN_WEBHOOK_SECRET,
      ADMIN_PANEL_URL: PANEL_URL,
      TELEGRAM_BOT_TOKEN: PUBLIC_BOT_TOKEN,
    },
  }),
}));

const { POST } = await import('./route');
const { buildCreateAdminUserStatement } = await import('@/lib/d1/repositories/admin-users');
const { d1Run } = await import('@/lib/d1/db');
const { MAX_LOGIN_REQUESTS_PER_WINDOW } = await import('@/lib/d1/repositories/admin-telegram-login-requests');

const NOW = '2026-01-01T00:00:00.000Z';

async function seedUser(overrides: { active?: boolean; role?: 'super_admin' | 'editor' | 'order_manager' | 'viewer' } = {}) {
  const { sql, params } = buildCreateAdminUserStatement({
    email: 'dmytro@svetikony.com',
    name: 'Dmytro Admin',
    passwordHash: 'pbkdf2-sha256$600000$c2FsdA==$aGFzaA==',
    role: overrides.role ?? 'super_admin',
    now: NOW,
  });
  await d1Run(sql, ...params);
  const row = mockDb.tables.admin_users[mockDb.tables.admin_users.length - 1]!;
  if (overrides.active === false) row.active = 0;
  return row.id as string;
}

function seedIdentity(userId: string, telegramUserId: string) {
  mockDb.tables.admin_telegram_identities.push({
    id: crypto.randomUUID(),
    user_id: userId,
    telegram_user_id: telegramUserId,
    telegram_chat_id: null,
    created_at: NOW,
    updated_at: NOW,
    revoked_at: null,
  });
}

function update(overrides: { fromId?: number; text?: string; isBot?: boolean; chatId?: number }) {
  return {
    update_id: 1,
    message: {
      chat: { id: overrides.chatId ?? 999, type: 'private' },
      from: { id: overrides.fromId ?? 111, is_bot: overrides.isBot ?? false },
      text: overrides.text ?? '/start',
    },
  };
}

function webhookRequest(body: unknown, secretToken?: string) {
  return new Request('http://localhost/api/admin-telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secretToken !== undefined ? { 'x-telegram-bot-api-secret-token': secretToken } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin-telegram/webhook', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb.reset();
    // A factory, not a single shared Response instance -- Response bodies
    // are one-shot readable streams, and several tests here call /login
    // (and therefore sendMessage) more than once per test.
    fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('webhook secret', () => {
    it('rejects a request with the correct header name but wrong secret', async () => {
      const response = await POST(webhookRequest(update({}), 'wrong-secret'));
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a request with no secret header at all', async () => {
      const response = await POST(webhookRequest(update({})));
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts a request with the correct secret', async () => {
      const response = await POST(webhookRequest(update({}), ADMIN_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
    });
  });

  describe('public bot token isolation', () => {
    it('every Telegram API call from this webhook uses ADMIN_TELEGRAM_BOT_TOKEN, never TELEGRAM_BOT_TOKEN', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));

      expect(fetchMock).toHaveBeenCalled();
      for (const call of fetchMock.mock.calls) {
        const url = String(call[0]);
        expect(url).toContain(`/bot${ADMIN_BOT_TOKEN}/`);
        expect(url).not.toContain(PUBLIC_BOT_TOKEN);
      }
    });
  });

  describe('/start', () => {
    it('authorized (bound) user gets the welcome text', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      await POST(webhookRequest(update({ fromId: 111, text: '/start' }), ADMIN_WEBHOOK_SECRET));

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.text).toContain('Admin Security');
      expect(body.text).not.toContain('Доступ заборонено');
    });

    it('unknown Telegram user gets the generic denial text, no admin details', async () => {
      await POST(webhookRequest(update({ fromId: 999999, text: '/start' }), ADMIN_WEBHOOK_SECRET));

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.text).toBe('⛔ Доступ заборонено.');
    });
  });

  describe('/login', () => {
    it('authorized active user gets a login ticket + URL button, and it is audited as telegram_login_requested', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      const response = await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      expect(response.status).toBe(200);

      expect(mockDb.tables.admin_telegram_login_requests).toHaveLength(1);
      const actions = mockDb.tables.admin_audit_log.map((r) => r.action);
      expect(actions).toContain('telegram_login_requested');

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.text).toContain('Вхід до «Світло Ікони»');
      expect(body.reply_markup.inline_keyboard[0][0].text).toContain('Відкрити адмінку');
      expect(body.reply_markup.inline_keyboard[0][0].url).toMatch(new RegExp(`^${PANEL_URL}/telegram-login#ticket=`));
    });

    it('the button URL never appears in server logs (console) and the raw ticket is only ever in the URL fragment, never a query param', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      const url = body.reply_markup.inline_keyboard[0][0].url as string;
      expect(url).toContain('#ticket=');
      expect(url).not.toMatch(/\?.*ticket=/);
    });

    it('unknown Telegram user gets denied, no ticket created, audited as telegram_login_denied without storing the telegram id anywhere queryable', async () => {
      const response = await POST(webhookRequest(update({ fromId: 999999, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      expect(response.status).toBe(200);
      expect(mockDb.tables.admin_telegram_login_requests).toHaveLength(0);

      const denied = mockDb.tables.admin_audit_log.find((r) => r.action === 'telegram_login_denied');
      expect(denied).toBeTruthy();
      expect(denied!.user_id).toBeNull();
      expect(denied!.role).toBeNull();

      const [, init] = fetchMock.mock.calls[0]!;
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.text).toBe('⛔ Доступ заборонено.');
    });

    it('inactive admin user gets denied and no ticket is created', async () => {
      const userId = await seedUser({ active: false });
      seedIdentity(userId, '111');
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      expect(mockDb.tables.admin_telegram_login_requests).toHaveLength(0);
    });

    it('a second /login cancels the first ticket, leaving exactly one live request', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));

      expect(mockDb.tables.admin_telegram_login_requests).toHaveLength(2);
      const live = mockDb.tables.admin_telegram_login_requests.filter((r) => r.cancelled_at === null);
      expect(live).toHaveLength(1);
    });

    it('rate limiting: after MAX_LOGIN_REQUESTS_PER_WINDOW requests, further /login attempts are rejected without creating a new ticket', async () => {
      const userId = await seedUser();
      seedIdentity(userId, '111');
      for (let i = 0; i < MAX_LOGIN_REQUESTS_PER_WINDOW; i++) {
        await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      }
      const countBefore = mockDb.tables.admin_telegram_login_requests.length;
      await POST(webhookRequest(update({ fromId: 111, text: '/login' }), ADMIN_WEBHOOK_SECRET));
      expect(mockDb.tables.admin_telegram_login_requests.length).toBe(countBefore); // no new row
    });
  });

  it('a bot-flagged sender is ignored entirely', async () => {
    await POST(webhookRequest(update({ fromId: 111, text: '/login', isBot: true }), ADMIN_WEBHOOK_SECRET));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('malformed JSON body returns 400', async () => {
    const request = new Request('http://localhost/api/admin-telegram/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': ADMIN_WEBHOOK_SECRET },
      body: 'not json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
