import { ApiError } from '@/lib/d1/errors';
import { getOpenAiConfig } from '@/lib/telegram/env';
import { getCalendarDay } from '@/lib/d1/repositories/calendarDays';
import { listPrayers } from '@/lib/d1/repositories/prayers';
import { CALENDAR_PREPARATION_MODEL } from './calendar-date-preparation';

const MAX_CANDIDATES = 60;

export type PrayerRecommendation = { prayerId: string | null };

/**
 * Picks the best-fitting prayer ALREADY IN THE LIBRARY for a calendar day --
 * never authors new prayer text. Prayers are established Church texts, not
 * freely composable content, same reasoning as calendar-date-preparation.ts's
 * "must not invent... readings": the model receives only {id, title} pairs
 * (never full prayer text) plus the day's own title/description, and its
 * answer is validated to be literally one of the given ids (or "none")
 * before ever being trusted -- it can select, never invent. This function
 * never writes anything; linking a recommended prayer to the day still goes
 * through the existing manual "link existing prayer" update, same as if the
 * admin had picked it themselves.
 */
export async function recommendPrayerForCalendarDay(dayId: string): Promise<PrayerRecommendation> {
  const day = await getCalendarDay(dayId);
  const candidates = (await listPrayers({ language: day.language })).filter((prayer) => !prayer.calendarDayId);
  if (!candidates.length) return { prayerId: null };
  const pool = candidates.slice(0, MAX_CANDIDATES).map((prayer) => ({ id: prayer.id, title: prayer.title }));

  const config = await getOpenAiConfig();
  if (!config) throw ApiError.validation('OpenAI is not configured');

  let raw: unknown;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: CALENDAR_PREPARATION_MODEL, reasoning_effort: 'low', response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'You select, you never write. Given an Orthodox calendar day\'s title/description and a list of EXISTING prayer titles with their ids, return the single best-fitting prayer id for that day, or "none" if nothing genuinely fits. Only ever return an id that is literally present in the supplied candidate list, or the exact string "none" -- never invent an id, a title, or any prayer text of your own. Return JSON of the exact shape {"prayerId": "<id or none>"}.' },
        { role: 'user', content: JSON.stringify({ dayTitle: day.title, dayDescription: day.description, candidates: pool }) },
      ] }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      if (failure?.error?.code === 'insufficient_quota') throw ApiError.validation('OpenAI: вичерпано квоту або бюджет API. Перевірте Billing у вашому OpenAI-проєкті.');
      if (response.status === 401) throw ApiError.validation('OpenAI: API-ключ не прийнято. Перевірте конфігурацію сервера.');
      if (response.status === 403 || response.status === 404) throw ApiError.validation('OpenAI: немає доступу до моделі. Перевірте доступні моделі у вашому OpenAI-проєкті.');
      if (response.status === 429) throw ApiError.validation('OpenAI: перевищено ліміт запитів. Спробуйте пізніше.');
      throw new Error('generation');
    }
    const result = await response.json() as { choices?: { message?: { content?: string } }[] };
    raw = JSON.parse(result.choices?.[0]?.message?.content ?? '');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.validation('AI не завершив підбір молитви. Спробуйте пізніше.');
  }

  const candidateId = (raw as Record<string, unknown> | null)?.prayerId;
  if (typeof candidateId !== 'string' || candidateId === 'none') return { prayerId: null };
  return { prayerId: pool.some((item) => item.id === candidateId) ? candidateId : null };
}
