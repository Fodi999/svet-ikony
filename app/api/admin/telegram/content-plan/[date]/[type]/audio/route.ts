import { assignSlotAudio, removeSlotAudio } from '@/lib/telegram/content-plan-actions';
import { handleSlotAction, handleSlotActionWithBody } from '@/lib/telegram/content-plan-route-helpers';

type AssignAudioBody = { audioUrl: string };

/** "Обрати з медіатеки" for the audio slot -- persists an already-uploaded
 * R2 URL directly, no new upload, no AI call. See content-plan-actions.ts's
 * assignSlotAudio(). */
export async function PUT(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotActionWithBody<AssignAudioBody>(request, params, (date, type, body) => assignSlotAudio(date, type, body.audioUrl));
}

/** "Видалити аудіо" -- clears the slot's audio_url. See
 * content-plan-actions.ts's removeSlotAudio(). */
export async function DELETE(request: Request, { params }: { params: Promise<{ date: string; type: string }> }) {
  return handleSlotAction(request, params, removeSlotAudio);
}
