/** OpenAI client for the Telegram autopost pipeline — the only caller of
 * this module. Copywrites real church data into a Ukrainian Telegram post;
 * it never originates facts itself (see lib/telegram/autopost-content.ts's
 * "insufficient data -> skip" checks, which run *before* this is called). */

import { formatChurchDatesProse } from '@/lib/telegram/church-date-format';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiError';
  }
}

const SYSTEM_PROMPT = `Ти — редактор Telegram-каналу "Світло Ікони" про православну традицію.
Церква цього каналу живе за юліанським календарем (старий стиль), і всі
церковні факти нижче (святий дня, читання, тощо) вже дано за старим стилем
-- цього НІКОЛИ не міняй.

ПРАВИЛО ПРО ДАТИ (ОБОВ'ЯЗКОВЕ, НАЙВИЩИЙ ПРІОРИТЕТ):
Якщо в тексті публікації згадується сьогоднішня дата в будь-якому вигляді
("сьогодні, ...", заголовок з датою, тощо) -- завжди називай ОБИДВІ дати
разом: громадянську (нового стилю, Europe/Kyiv) і церковну (старого стилю,
юліанську). НІКОЛИ не пиши лише одну з них -- саме собою написання лише
старого стилю без нового виглядає для читача як помилка в сьогоднішній
даті. Нижче в розділі "Дата" тобі дано вже ГОТОВЕ, точне формулювання обох
дат разом -- вставляй його як є, слово в слово; ніколи не рахуй, не
переформульовуй і не заміняй жодну з двох дат самостійно, і не змішуй два
календарі (не видавай юліанську дату за громадянську чи навпаки).

ПРАВИЛО ПРО МОВУ (ОБОВ'ЯЗКОВЕ, НАЙВИЩИЙ ПРІОРИТЕТ):
Пиши ВИКЛЮЧНО українською мовою. Ніколи не вставляй у прозу публікації
слова, словосполучення чи цілі речення англійською, російською, польською
мовами, латинську транслітерацію українських слів чи будь-які інші
неперекладені фрази -- це стосується КОЖНОГО слова тексту, включно з
серединою речення, а не лише заголовків. Єдиний виняток -- явно надане
незмінне власне ім'я/назва з фактів нижче або пряма цитата з джерела, яку
заборонено перекладати чи змінювати; сама проза, яку ти пишеш навколо них,
завжди залишається українською. Приклад НЕПРИПУСТИМОЇ помилки (реальний
випадок): "...апостолів Христових, які spread the Gospel, несучи..." --
правильно: "...апостолів Христових, які поширювали Євангеліє, несучи...".
Навіть одне іншомовне слово чи словосполучення в іншому реченні -- це
помилка, яка блокує публікацію.

ІНШІ ПРАВИЛА МОВИ Й ТЕРМІНОЛОГІЇ:
- використовуй православну церковну термінологію;
- не перекладай і не змінюй довільно імена та назви з наданих фактів —
  переноси їх точно так, як вони написані нижче.

НАЙВАЖЛИВІШЕ ПРАВИЛО: використовуй ЛИШЕ факти, надані нижче користувачем.
Не вигадуй імена святих, дати, цитати з Писання чи будь-які деталі, яких
немає у наданих даних.

ОБСЯГ ТЕКСТУ: нижче вказано орієнтовний цільовий обсяг символів для цього
типу публікації — це мета, а НЕ привід вигадувати факти. Якщо перевірених
фактів замало для такого обсягу, пиши коротше і змістовніше на їх основі;
ніколи не додавай непідтверджені відомості лише заради обсягу.

ОБОВ'ЯЗКОВА СТРУКТУРА КОЖНОЇ ПУБЛІКАЦІЇ:
- публікація завжди починається з привітання — його точний варіант
  наведено у структурі нижче для цього типу, і його не можна змінювати;
- одразу після привітання, окремим рядком, іде назва публікації — її
  точний варіант наведено нижче в полі "Назва"; використовуй його рівно
  так, як подано, ЯКЩО нижче явно не дозволено власну тематичну назву
  (тоді власна назва має спиратися ЛИШЕ на надані факти);
- перед підписом завжди має бути природне завершальне побажання, яке
  відповідає темі цієї конкретної публікації (не повторюй одне й те саме
  формулювання щодня — воно може природно змінюватися);
- публікація завжди завершується підписом рівно такого вигляду, без змін:
  ☦️ «Світло ікони»

СТИЛЬ: теплий, спокійний, зрозумілий звичайній людині; без дешевого
клікбейту; без надмірної кількості емодзі; невеликі абзаци, зручні для
Telegram. Це має бути живий, змістовний текст, а не суха енциклопедична
довідка.

Дотримуйся структури, наведеної нижче для цього типу публікації.

Поверни лише готовий текст поста, без пояснень і без лапок навколо нього.`;

export interface GenerateTelegramPostInput {
  apiKey: string;
  model?: string;
  /** Ukrainian label of the slot, e.g. "Ранкова молитва" — gives the model
   * the post's purpose without it needing to infer one. */
  contentTypeLabel: string;
  /** Full section outline (greeting through signature) for this content
   * type — see lib/telegram/content-format.ts's CONTENT_TYPE_FORMAT_HINTS. */
  formatHint: string;
  /** Target character-count range for the complete finished text — a goal,
   * never a reason to invent facts (see the system prompt's own caveat).
   * See lib/telegram/content-format.ts's CONTENT_TYPE_TARGET_LENGTH. */
  targetLengthMin: number;
  targetLengthMax: number;
  /** Plain-text facts pulled straight from D1 (see autopost-content.ts) —
   * the only source of truth the model is allowed to draw from. */
  facts: string;
  /** Europe/Kyiv civil date ('YYYY-MM-DD') the post is being published on —
   * combined with julianDateIso below (never used alone) into the ready
   * "both dates" phrase the model must use verbatim whenever it mentions
   * today's date; never the date the church facts are grounded in (that's
   * julianDateIso). */
  civilDateIso: string;
  /** Orthodox Julian ('old style') calendar date ('YYYY-MM-DD') the facts
   * above were looked up by (see lib/telegram/julian-calendar.ts) — this is
   * the church's own date and must never be presented as the new style. */
  julianDateIso: string;
  /** Set only when this content type required and passed mandatory
   * pre-publish calendar verification (see
   * lib/telegram/orthodox-calendar-verifier.ts) -- appends an explicit
   * instruction not to alter the already-verified date/name/commemoration
   * or add other saints/facts. Absent for content types that don't
   * require verification (morning_prayer/evening_prayer/gospel/
   * faith_story). */
  verifiedFacts?: boolean;
  /** Title line the post must place immediately after its greeting, on its
   * own line (task: "content titles") -- see
   * lib/telegram/content-format.ts's CONTENT_TYPE_TITLES/
   * buildSaintOfDayTitle. Reproduced verbatim unless titleFlexible is set. */
  titleLine: string;
  /** faith_story only: the model may substitute its own short thematic
   * title -- built strictly from the facts below, never invented -- for
   * titleLine's generic default. Every other content type has no
   * meaningful "theme" independent of its fixed slot name, so this stays
   * unset (and titleLine is reproduced exactly) for them. */
  titleFlexible?: boolean;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function generateTelegramPost(input: GenerateTelegramPostInput): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_MODEL,
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Тип публікації: ${input.contentTypeLabel}\nЦільовий обсяг тексту: ${input.targetLengthMin}–${input.targetLengthMax} символів (мета, не вимога -- див. правило про обсяг вище)\nСтруктура: ${input.formatHint}\nНазва (окремим рядком одразу після привітання): "${input.titleLine}"${
            input.titleFlexible
              ? ' -- можеш замінити власною короткою тематичною назвою, побудованою ЛИШЕ на фактах нижче, якщо вона краще підходить; інакше використай саме цей рядок'
              : ' -- використай рівно цей рядок, без жодних змін'
          }\n\nДата (готове формулювання -- використай саме його слово в слово, якщо в тексті згадується сьогоднішня дата; ` +
            `civilDateIso=${input.civilDateIso}, julianDateIso=${input.julianDateIso}, наведені лише для звірки, не для копіювання як є):\n"${formatChurchDatesProse(input.civilDateIso, input.julianDateIso)}"\n\n${
            input.verifiedFacts
              ? 'Ці календарні дані вже перевірені. Не змінюй дату, ім\'я святого або церковне найменування. Не додавай інших святих чи фактів.\n\n'
              : ''
          }Факти:\n${input.facts}`,
        },
      ],
    }),
  });

  let body: ChatCompletionResponse;
  try {
    body = await response.json();
  } catch {
    throw new OpenAiError(`OpenAI returned a non-JSON response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new OpenAiError(body.error?.message ?? `OpenAI request failed (HTTP ${response.status})`);
  }

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new OpenAiError('OpenAI returned an empty completion');
  }
  return text;
}
