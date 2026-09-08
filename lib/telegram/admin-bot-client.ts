/**
 * Small, isolated Telegram Bot API client for @svit_ikony_admin_bot (Phase
 * 3). Deliberately NOT a reuse of lib/telegram/client.ts's TelegramClient
 * (the public content bot's client) even though that class is already
 * token-parameterized and could technically send these same messages --
 * this is a security-sensitive login path, and a future change made to the
 * public bot's client (new method, different error handling, a retry
 * loop, ...) must never have any chance of affecting it, nor vice versa.
 * Only the one method the admin bot actually needs (sendMessage with an
 * optional inline URL button) is implemented here.
 *
 * SECURITY: the bot token lives only in the URL built by `apiUrl()` below.
 * Never pass that URL (or anything derived from it) to `console.*`.
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org';

export type AdminInlineKeyboardButton = { text: string; url: string };
export type AdminInlineKeyboardMarkup = { inline_keyboard: AdminInlineKeyboardButton[][] };

export class AdminTelegramApiError extends Error {
  constructor(
    public method: string,
    public description: string,
  ) {
    super(`Admin Telegram API error in ${method}: ${description}`);
  }
}

export class AdminTelegramClient {
  constructor(private readonly botToken: string) {}

  /** Builds `bot<TOKEN>/<method>`. NEVER log the result -- it contains the
   * live token. */
  private apiUrl(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.botToken}/${method}`;
  }

  async sendMessage(chatId: number | string, text: string, replyMarkup?: AdminInlineKeyboardMarkup): Promise<void> {
    const response = await fetch(this.apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });

    let body: { ok: boolean; description?: string };
    try {
      body = await response.json();
    } catch {
      body = { ok: false, description: `HTTP ${response.status}` };
    }

    if (!response.ok || !body.ok) {
      const description = body.description ?? `HTTP ${response.status}`;
      console.warn(`Admin Telegram API call failed: method=sendMessage status=${response.status} description=${description}`);
      throw new AdminTelegramApiError('sendMessage', description);
    }
  }
}
