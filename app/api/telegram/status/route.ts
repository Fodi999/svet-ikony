import { getTelegramConfig } from '@/lib/telegram/env';

/** GET /api/telegram/status — mirrors assistant/src/interfaces/telegram
 * ::webhook::get_status exactly: {configured, channel}, never a token or
 * secret. */
export async function GET() {
  const config = await getTelegramConfig();
  return Response.json({
    configured: config !== null,
    channel: config?.channel ?? null,
  });
}
