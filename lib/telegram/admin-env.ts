import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Phase 3 (Telegram passwordless admin login) -- deliberately separate
 * secrets from TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET (lib/telegram/env.ts,
 * the public content bot's credentials). @svit_ikony_admin_bot is a
 * distinct Telegram bot with its own webhook, so mixing credentials would
 * let a compromise of one bot's webhook reach the other bot's trust
 * boundary. Mirrors getTelegramConfig()'s own null-when-unset (fail
 * closed) convention.
 */
export type AdminTelegramConfig = {
  botToken: string;
  webhookSecret: string | null;
  /** The admin panel's real origin (e.g. https://admin.svetikony.com) the
   * /login command's button links to. Deliberately no hardcoded fallback
   * anywhere in source -- this is deployment-specific and must come from
   * real environment configuration; a missing value means the config is
   * unusable (nothing safe to link to), so the whole config resolves to
   * null, same as a missing bot token. */
  panelUrl: string;
};

export async function getAdminTelegramConfig(): Promise<AdminTelegramConfig | null> {
  const { env } = await getCloudflareContext({ async: true });

  const botToken = env.ADMIN_TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return null;

  const panelUrl = env.ADMIN_PANEL_URL?.trim();
  if (!panelUrl) return null;

  return {
    botToken,
    webhookSecret: env.ADMIN_TELEGRAM_WEBHOOK_SECRET?.trim() || null,
    panelUrl,
  };
}
