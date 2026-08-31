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

/** Mandatory opening line, exact and literal -- every autopost publication
 * must start with it (see lib/ai/openai.ts's system prompt). evening_prayer
 * gets the moon variant; every other type uses the sun/default one. */
export const AUTOPOST_GREETING_DEFAULT = '☀️ Вітаємо вас, дорогі друзі!';
export const AUTOPOST_GREETING_EVENING = '🌙 Вітаємо вас, дорогі друзі!';

export const CONTENT_TYPE_GREETINGS: Record<AutopostContentType, string> = {
  morning_prayer: AUTOPOST_GREETING_DEFAULT,
  saint_of_day: AUTOPOST_GREETING_DEFAULT,
  gospel: AUTOPOST_GREETING_DEFAULT,
  faith_story: AUTOPOST_GREETING_DEFAULT,
  evening_prayer: AUTOPOST_GREETING_EVENING,
};

/** Mandatory closing signature, exact and literal, on every publication --
 * preceded by a closing wish that should vary naturally rather than being
 * copy-pasted verbatim every time (see lib/ai/openai.ts's system prompt). */
export const AUTOPOST_SIGNATURE = '☦️ «Світло ікони»';

/**
 * Target character-count range for the FULL finished text (not a hard
 * limit -- see lib/ai/openai.ts's system prompt: this is a goal, never a
 * reason to invent facts). Counted as the length of the complete returned
 * string, greeting and signature included.
 */
export const CONTENT_TYPE_TARGET_LENGTH: Record<AutopostContentType, { min: number; max: number }> = {
  morning_prayer: { min: 1200, max: 2200 },
  saint_of_day: { min: 1800, max: 3000 },
  gospel: { min: 2000, max: 3500 },
  faith_story: { min: 2500, max: 4000 },
  evening_prayer: { min: 1200, max: 2200 },
};

/** Per-type section outline handed to OpenAI alongside the facts -- see
 * lib/ai/openai.ts's system prompt for the shared rules (Ukrainian only,
 * no invented facts, no altering the church date, mandatory greeting/
 * signature, target length is a goal not a mandate). Each entry describes
 * the FULL structure (greeting through signature) so the model sees one
 * coherent outline rather than reassembling fragments itself. */
export const CONTENT_TYPE_FORMAT_HINTS: Record<AutopostContentType, string> = {
  saint_of_day:
    `Структура: привітання "${AUTOPOST_GREETING_DEFAULT}" -> хто сьогодні вшановується -> короткий життєпис -> ` +
    'важливі підтверджені події життя -> чого ця історія може навчити сучасну людину -> "💭 Думка дня" -> ' +
    `"🙏" і коротка молитва -> природне завершальне побажання -> підпис "${AUTOPOST_SIGNATURE}". ` +
    'Усі календарні та біографічні твердження бери ЛИШЕ з перевірених фактів нижче -- нічого понад них.',
  gospel:
    `Структура: привітання "${AUTOPOST_GREETING_DEFAULT}" -> "📖 Євангеліє дня" -> короткий переказ змісту читання -> ` +
    'зрозуміле пояснення сенсу -> як застосувати це у повсякденному житті -> "💭 Думка дня" -> "🙏" і молитва -> ' +
    `природне завершальне побажання -> підпис "${AUTOPOST_SIGNATURE}". ` +
    'Не вигадуй цитат з Євангелія: якщо точного тексту читання немає у фактах нижче, не подавай переказ як пряму цитату.',
  faith_story:
    `Структура: привітання "${AUTOPOST_GREETING_DEFAULT}" -> назва або тема історії -> сама історія -> ` +
    'підтверджений історичний чи церковний контекст -> духовний сенс -> "💭 Думка дня" -> ' +
    `коротка молитва або духовне звернення, якщо це доречно -> природне завершальне побажання -> підпис "${AUTOPOST_SIGNATURE}".`,
  morning_prayer:
    `Структура: "${AUTOPOST_GREETING_DEFAULT}" -> короткий вступ до нового дня -> "🙏 Ранкова молитва" -> ` +
    `повноцінний текст молитви за фактами нижче -> коротке духовне побажання на день -> підпис "${AUTOPOST_SIGNATURE}".`,
  evening_prayer:
    `Структура: "${AUTOPOST_GREETING_EVENING}" -> спокійний вступ про завершення дня -> за наявності ПЕРЕВІРЕНИХ ` +
    'календарних фактів можна коротко згадати пам\'ять сьогоднішніх святих -> "🙏 Вечірня молитва" -> ' +
    `повноцінний текст молитви за фактами нижче -> побажання спокійної ночі, миру і Божої допомоги -> підпис "${AUTOPOST_SIGNATURE}".`,
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
