import { requireSuperAdmin } from '@/lib/d1/auth';
import { withErrors } from '@/lib/d1/errors';
import { getTelegramStats } from '@/lib/d1/repositories/telegram';
import { TelegramClient } from '@/lib/telegram/client';
import { getTelegramConfig } from '@/lib/telegram/env';

/** Admin Dashboard tab: bot config, webhook health, and D1 audience stats
 * in one call. Degrades gracefully — a Telegram API hiccup only zeroes out
 * `webhook`, it never fails the whole request (stats still come from D1
 * either way). */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const stats = await getTelegramStats();
    const config = await getTelegramConfig();

    if (!config) {
      return Response.json({ configured: false, channel: null, webhook: null, stats });
    }

    const client = new TelegramClient(config.botToken);
    let webhook: { url: string; pendingUpdateCount: number; lastErrorMessage: string | null } | null = null;
    try {
      const info = await client.getWebhookInfo();
      webhook = {
        url: info.url,
        pendingUpdateCount: info.pendingUpdateCount,
        lastErrorMessage: info.lastErrorMessage ?? null,
      };
    } catch {
      webhook = null;
    }

    return Response.json({ configured: true, channel: config.channel, webhook, stats });
  });
}
