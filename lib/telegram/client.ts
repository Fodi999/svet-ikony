/** Thin Telegram Bot API client using the Workers runtime's native `fetch` —
 * no external HTTP library needed here (unlike assistant's Rust client,
 * which uses reqwest). Mirrors assistant/src/interfaces/telegram/client.rs.
 *
 * SECURITY: the bot token lives only in the URL built by `apiUrl()` below.
 * Never pass that URL (or anything derived from it) to `console.*` — every
 * log call in this file logs the HTTP status/method/description only. */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
/** Telegram's hard message-length limit is 4096 UTF-16 code units; cut a
 * little earlier to stay safely under it regardless of encoding overhead. */
const MAX_MESSAGE_CHARS = 3900;

export type InlineKeyboardButton = { text: string; callback_data: string };
export type InlineKeyboardMarkup = { inline_keyboard: InlineKeyboardButton[][] };

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public description: string
  ) {
    super(`Telegram API error in ${method}: ${description}`);
  }
}

function truncateForTelegram(text: string): string {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS)}…`;
}

export class TelegramClient {
  constructor(private readonly botToken: string) {}

  /** Builds `bot<TOKEN>/<method>`. NEVER log the result — it contains the
   * live token. */
  private apiUrl(method: string): string {
    return `${TELEGRAM_API_BASE}/bot${this.botToken}/${method}`;
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) return;

    let description = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { description?: string };
      if (body?.description) description = body.description;
    } catch {
      // Non-JSON error body — keep the HTTP-status fallback above.
    }
    console.warn(`Telegram API call failed: method=${method} status=${response.status} description=${description}`);
    throw new TelegramApiError(method, description);
  }

  async sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<void> {
    await this.call('sendMessage', {
      chat_id: chatId,
      text: truncateForTelegram(text),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async sendPhoto(chatId: number, photoUrl: string, caption?: string): Promise<void> {
    await this.call('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      ...(caption ? { caption } : {}),
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call('setWebhook', { url, secret_token: secretToken });
  }
}

export { truncateForTelegram };
