import { getCloudflareContext } from '@opennextjs/cloudflare';

export type TelegramConfig = {
  botToken: string;
  /** null when TELEGRAM_WEBHOOK_SECRET is unset — the webhook route treats
   * that as "reject everything" (fail closed), never as "skip the check". */
  webhookSecret: string | null;
  channel: string;
};

/** Mirrors assistant/src/infrastructure/config.rs's resolve_telegram_config:
 * returns null whenever TELEGRAM_BOT_TOKEN is absent/blank, so callers must
 * treat null as "bot disabled" rather than throwing — the rest of the
 * Worker (the church_ and icon_ routes) must keep working either way. The
 * token itself is never logged anywhere that reads this. */
export async function getTelegramConfig(): Promise<TelegramConfig | null> {
  const { env } = await getCloudflareContext({ async: true });

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return null;

  return {
    botToken,
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() || null,
    channel: env.TELEGRAM_CHANNEL?.trim() || '@svit_ikony',
  };
}
