/** Thin Telegram Bot API client using the Workers runtime's native `fetch` —
 * no external HTTP library needed here (unlike assistant's Rust client,
 * which uses reqwest). Mirrors assistant/src/interfaces/telegram/client.rs.
 *
 * SECURITY: the bot token lives only in the URL built by `apiUrl()` below.
 * Never pass that URL (or anything derived from it) to `console.*` — every
 * log call in this file logs the HTTP status/method/description only. */

const TELEGRAM_API_BASE = 'https://api.telegram.org';
/** Telegram's hard message-length limit is 4096 UTF-16 code units -- JS
 * string .length also counts UTF-16 code units, so there's no encoding
 * mismatch to guard against (unlike byte-oriented limits); this margin
 * only needs to comfortably clear the longest real autopost target
 * (faith_story's 4000-char ceiling, see content-format.ts's
 * CONTENT_TYPE_TARGET_LENGTH) so a long post is never silently cut. */
const MAX_MESSAGE_CHARS = 4050;

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

  /** Every Telegram Bot API response is `{ok, result}` or `{ok: false,
   * description}` regardless of HTTP status — parsed once here so admin
   * endpoints (getWebhookInfo/getChat) can read `result` and the
   * fire-and-forget bot commands (sendMessage/...) can ignore it via
   * `call()` below. */
  private async request<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let body: { ok: boolean; result?: T; description?: string };
    try {
      body = await response.json();
    } catch {
      body = { ok: false, description: `HTTP ${response.status}` };
    }

    if (!response.ok || !body.ok) {
      const description = body.description ?? `HTTP ${response.status}`;
      console.warn(`Telegram API call failed: method=${method} status=${response.status} description=${description}`);
      throw new TelegramApiError(method, description);
    }

    return body.result as T;
  }

  private async call(method: string, payload: Record<string, unknown>): Promise<void> {
    await this.request<unknown>(method, payload);
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: InlineKeyboardMarkup
  ): Promise<{ messageId: number }> {
    const result = await this.request<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text: truncateForTelegram(text),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return { messageId: result.message_id };
  }

  /**
   * `caption` is sent as-is, never truncated here -- Telegram's real photo-
   * caption limit is 1024 UTF-16 code units, much shorter than a text
   * message's; callers must decide whether a caption fits (see
   * lib/telegram/deliver-post.ts's planDelivery, used by the autopost
   * pipeline) rather than have it silently cut at this layer. Passing an
   * over-limit caption surfaces Telegram's own error instead.
   */
  async sendPhoto(chatId: number | string, photoUrl: string, caption?: string): Promise<{ messageId: number }> {
    const result = await this.request<{ message_id: number }>('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      ...(caption ? { caption } : {}),
    });
    return { messageId: result.message_id };
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

  /** Admin Dashboard tab — webhook health. */
  async getWebhookInfo(): Promise<{
    url: string;
    pendingUpdateCount: number;
    lastErrorMessage?: string;
    lastErrorDate?: number;
  }> {
    const result = await this.request<{
      url: string;
      pending_update_count: number;
      last_error_message?: string;
      last_error_date?: number;
    }>('getWebhookInfo', {});
    return {
      url: result.url,
      pendingUpdateCount: result.pending_update_count,
      lastErrorMessage: result.last_error_message,
      lastErrorDate: result.last_error_date,
    };
  }

  /** Resolves a chat (used once to look up the @channel's real numeric id —
   * see lib/telegram/channel.ts). */
  async getChat(chatIdOrUsername: string | number): Promise<{ id: number; type: string; title?: string; username?: string }> {
    return this.request('getChat', { chat_id: chatIdOrUsername });
  }
}

export { truncateForTelegram };
