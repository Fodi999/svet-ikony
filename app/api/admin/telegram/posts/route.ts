import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { createTelegramPost, listTelegramPosts, type TelegramPostCreateInput } from '@/lib/d1/repositories/telegram';
import { getOrResolveChannelChat } from '@/lib/telegram/channel';
import { TelegramClient } from '@/lib/telegram/client';
import { getTelegramConfig } from '@/lib/telegram/env';

/** Admin "Публікації" tab: full history (draft/scheduled/sent/failed),
 * newest first — see lib/d1/repositories/telegram.ts's listTelegramPosts. */
export async function GET(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    return Response.json(await listTelegramPosts());
  });
}

/** Creates a draft (or a 'scheduled' row if `scheduledAt` is set — nothing
 * currently acts on that field; see the plan's "no Cron this stage"). Every
 * post targets the resolved @channel chat, never an individual DM. */
export async function POST(request: Request) {
  return withErrors(async () => {
    await requireSuperAdmin(request);

    const config = await getTelegramConfig();
    if (!config) throw ApiError.validation('Telegram bot is not configured');

    const payload = (await request.json()) as TelegramPostCreateInput;
    const client = new TelegramClient(config.botToken);
    const channelChat = await getOrResolveChannelChat(client, config.channel);

    const post = await createTelegramPost(channelChat.telegramChatId, payload);
    return Response.json(post, { status: 201 });
  });
}
