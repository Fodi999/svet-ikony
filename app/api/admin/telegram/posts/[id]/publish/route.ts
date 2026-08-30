import { requireSuperAdmin } from '@/lib/d1/auth';
import { ApiError, withErrors } from '@/lib/d1/errors';
import { getTelegramPost, markTelegramPostFailed, markTelegramPostSent } from '@/lib/d1/repositories/telegram';
import { getOrResolveChannelChat } from '@/lib/telegram/channel';
import { TelegramApiError, TelegramClient } from '@/lib/telegram/client';
import { getTelegramConfig } from '@/lib/telegram/env';

function parsePostId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw ApiError.validation('id must be an integer');
  return id;
}

/**
 * The double-publish guard: a post whose status is already 'sent' is
 * rejected with 409 *before* any Telegram call is attempted, so retrying a
 * timed-out request or double-clicking "Опублікувати" can never post the
 * same content to the channel twice. A Telegram-side failure (network
 * error, bot not an admin of the channel, ...) marks the post 'failed'
 * (still publishable again afterward) rather than leaving it stuck as
 * 'draft' with no record the attempt happened.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    await requireSuperAdmin(request);
    const { id } = await params;
    const postId = parsePostId(id);

    const post = await getTelegramPost(postId);
    if (post.status === 'sent') {
      throw ApiError.conflict('telegram post has already been sent');
    }

    const config = await getTelegramConfig();
    if (!config) throw ApiError.validation('Telegram bot is not configured');

    const client = new TelegramClient(config.botToken);
    const channelChat = await getOrResolveChannelChat(client, config.channel);

    try {
      const { messageId } = post.mediaUrl
        ? await client.sendPhoto(channelChat.telegramChatId, post.mediaUrl, post.text ?? undefined)
        : await client.sendMessage(channelChat.telegramChatId, post.text ?? '');
      const updated = await markTelegramPostSent(postId, messageId);
      return Response.json(updated);
    } catch (error) {
      const message =
        error instanceof TelegramApiError ? error.description : error instanceof Error ? error.message : 'unknown error';
      await markTelegramPostFailed(postId, message);
      throw new ApiError(502, 'TELEGRAM_ERROR', 'Failed to publish to Telegram', message);
    }
  });
}
