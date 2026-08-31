import type { AutopostContentType } from '@/lib/d1/repositories/telegram-autopost';

/** Shared between the autopost orchestrator, the OpenAI prompt builder,
 * and the admin publish/retry route (for regenerating a row that failed
 * before any text existed) -- kept in its own module so none of those
 * three needs to import from either of the other two. */
export const CONTENT_TYPE_LABELS: Record<AutopostContentType, string> = {
  morning_prayer: 'Ранкова молитва',
  saint_of_day: 'Святий дня',
  gospel: 'Євангеліє дня',
  faith_story: 'Історія віри',
  evening_prayer: 'Вечірня молитва',
};

/** Per-type structure/opening line handed to OpenAI alongside the facts --
 * see lib/ai/openai.ts's system prompt for the shared rules (Ukrainian
 * only, no invented facts, no altering the church date). */
export const CONTENT_TYPE_FORMAT_HINTS: Record<AutopostContentType, string> = {
  morning_prayer:
    'Почни рядком "🙏 Ранкова молитва". Далі подай сам текст молитви за фактами нижче, без додавань від себе.',
  evening_prayer:
    'Почни рядком "🌙 Вечірня молитва". Далі подай сам текст молитви за фактами нижче, без додавань від себе.',
  saint_of_day:
    'Почни рядком "🌟 Сьогодні Церква вшановує...". Далі — 2-4 коротких абзаци лише на основі реальних фактів нижче.',
  gospel:
    'Почни рядком "📖 Євангеліє дня". Вкажи посилання (reference) з фактів. Короткий уривок або опис і пояснення додавай ЛИШЕ якщо вони присутні у фактах нижче -- не переказуй і не додумуй текст читання, якого там немає.',
  faith_story: 'Почни рядком "🕊️ Історія віри". Далі короткий текст лише на основі фактів нижче.',
};

/** Shared "Світло Ікони" house style, prepended to every image prompt (see
 * CONTENT_TYPE_IMAGE_PROMPTS below and lib/ai/openai-image.ts). Deliberately
 * forbids any recognizable person/portrait -- the per-type scenes below are
 * always generic atmosphere (church interior, candle, dawn light), never a
 * specific saint's likeness, so "no invented saint portraits" holds by
 * construction rather than by asking the model not to invent one. */
const IMAGE_HOUSE_STYLE =
  'Єдиний фірмовий стиль проєкту "Світло Ікони". Православна атмосфера, реалістичний кінематографічний стиль, м’яке золоте світло, спокійні темні тони. ' +
  'Без будь-якого тексту, напису, літер, цифр, логотипів чи водяних знаків на зображенні. ' +
  'Без обличчя чи впізнаваної постаті конкретної людини, без портрета конкретного святого -- лише узагальнена атмосферна сцена.';

/**
 * Per-type scene, deliberately independent of the day's actual facts/saint
 * (see the house style note above) -- selecting by contentType alone is
 * what makes "never a specific saint's portrait" a structural guarantee,
 * not a prompt-level request the model could ignore.
 */
export const CONTENT_TYPE_IMAGE_PROMPTS: Record<AutopostContentType, string> = {
  saint_of_day: `${IMAGE_HOUSE_STYLE} Сюжет: інтер’єр православного храму або іконописна майстерня, шанобливе, урочисте освітлення.`,
  gospel: `${IMAGE_HOUSE_STYLE} Сюжет: розгорнута книга Євангелія на аналої, поруч запалена свічка, у православному храмі.`,
  morning_prayer: `${IMAGE_HOUSE_STYLE} Сюжет: світанок, м’яке проміння сонця крізь вікна православного храму.`,
  faith_story: `${IMAGE_HOUSE_STYLE} Сюжет: атмосферна духовна сцена всередині храму, свічки та ікони на відстані, тепле світло.`,
  evening_prayer: `${IMAGE_HOUSE_STYLE} Сюжет: вечір, запалена свічка на тлі темного силуету православного храму.`,
};

/**
 * Content types that assert a specific saint/commemoration for the day
 * (the "Сьогодні Церква вшановує..." claim) and therefore require
 * mandatory pre-publish calendar verification against independent sources
 * before OpenAI/Telegram are called -- see
 * lib/telegram/orthodox-calendar-verifier.ts. morning_prayer/
 * evening_prayer/gospel/faith_story don't name a specific saint for the
 * day, so they're exempt (see the feature's own requirement #10).
 */
export const CONTENT_TYPES_REQUIRING_CALENDAR_VERIFICATION: ReadonlySet<AutopostContentType> = new Set(['saint_of_day']);
