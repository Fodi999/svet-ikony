/** OpenAI client for the "Церковний календар" (Church Calendar) editor's AI
 * assistant -- see lib/church/calendar-ai-actions.ts, the only caller. This
 * is a separate module from lib/ai/openai.ts (the Telegram autopost
 * pipeline's own client) on purpose: the two content types have different
 * shapes (a short Telegram post with a fixed greeting/signature structure
 * vs. a public website's description/history/SEO fields), but they share
 * the same core safety rule -- AI is an editor, never a source of facts.
 * See calendar-ai-actions.ts's own doc comment for the verification gate
 * that runs *before* this is ever called. */
import { OpenAiError } from './openai';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `Ти — редактор православного сайту "Світло Ікони". Твоя робота — писати
короткі, теплі, змістовні тексти для сторінки конкретного дня церковного
календаря на основі ЛИШЕ наданих нижче фактів.

НАЙВАЖЛИВІШЕ ПРАВИЛО (без винятків):
- НЕ змінюй і не "виправляй" дату (ні новий, ні старий стиль) -- вона вже
  визначена в системі і не є твоєю справою;
- НЕ змінюй і не переформульовуй ім'я святого чи назву свята, надані нижче
  -- переноси їх точно так, як подано;
- НЕ додавай інших святих, подій чи вшанувань, яких немає у наданих фактах;
- НЕ вигадуй історичні деталі, дати, місця чи цитати, яких немає у наданих
  фактах -- якщо фактів мало, пиши коротше, а не докладніше за рахунок
  вигадки;
- НЕ вигадуй і не переказуй уривок з Євангелія, якщо його не надано;
- пиши ЛИШЕ українською мовою, використовуючи православну церковну
  термінологію.

СТИЛЬ: теплий, спокійний, зрозумілий звичайній людині; без клікбейту, без
надмірних епітетів, без канцеляризмів. Природна, жива мова.

Поверни лише готовий текст, без пояснень, без лапок навколо нього, без
заголовків на кшталт "Опис:".`;

export type ChurchContentKind = 'description' | 'history' | 'seo_title' | 'seo_description';

const KIND_INSTRUCTIONS: Record<ChurchContentKind, string> = {
  description:
    'Напиши короткий опис цього дня для картки/шапки сторінки -- 1-2 речення (приблизно 120-220 символів), що передає суть дня одним поглядом.',
  history:
    'Напиши розгорнуту історичну/житійну довідку про цей день -- кілька змістовних абзаців (приблизно 600-1200 символів), розкриваючи наведені факти докладніше, без додавання нового.',
  seo_title:
    'Напиши SEO title для цієї сторінки -- до 60 символів, що починається з назви дня/святого, без клікбейту та без зайвих слів на кшталт "Дивіться зараз".',
  seo_description:
    'Напиши SEO meta description для цієї сторінки -- 120-160 символів, стисло описує зміст сторінки для видачі пошукової системи, без keyword-стаффінгу.',
};

export interface GenerateChurchContentInput {
  apiKey: string;
  model?: string;
  kind: ChurchContentKind;
  /** Civil (new-style) date, 'YYYY-MM-DD' -- metadata only, never something
   * the model may alter. */
  civilDateIso: string | null;
  /** Julian (old-style) date, 'YYYY-MM-DD' -- metadata only. */
  julianDateIso: string | null;
  /** The calendar day's canonical, already-verified-or-unambiguous title
   * (e.g. "Пророк Самуїл") -- reproduced verbatim, never altered. */
  title: string;
  /** Plain-text canonical facts this day is actually grounded in (existing
   * description/history, and/or the linked saint's own facts) -- the only
   * source of truth the model may draw from for this generation. */
  facts: string;
  /** Set when calendar-ai-actions.ts's verification gate ran and passed
   * for a specific named saint/feast claim -- appended as an explicit
   * "don't alter this" instruction, mirroring lib/ai/openai.ts's
   * `verifiedFacts` flag for the same purpose. */
  verified?: boolean;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function generateChurchContent(input: GenerateChurchContentInput): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Завдання: ${KIND_INSTRUCTIONS[input.kind]}\n\nНазва дня (використай точно так, як подано): "${input.title}"\nЦивільна дата: ${input.civilDateIso ?? 'н/д'}\nЦерковна (старостильна) дата: ${input.julianDateIso ?? 'н/д'}\n\n${
            input.verified
              ? 'Ці церковні дані вже перевірені за незалежними джерелами. Не змінюй дату чи ім\'я святого/свята і не додавай інших святих.\n\n'
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

const ICONOGRAPHY_SYSTEM_PROMPT = `Ти аналізуєш зображення з Вікіпедії, яке було ідентифіковане як історичне
церковне зображення конкретного святого (ікона, фреска, мозаїка або
мініатюра) -- ЛИШЕ для того, щоб описати його іконографічні риси словами
для іншого художника, який намалює НОВУ, самостійну ілюстрацію.

Опиши ЛИШЕ:
- вбрання/одяг (колір, стиль, тип одягу -- священницьке, чернече, воїнське тощо);
- волосся та борода (довжина, колір, форма);
- приблизний вік зображеної людини;
- традиційні атрибути в руках чи поруч (хрест, книга, сувій, меч тощо);
- загальну позу чи жест, якщо це частина усталеної іконографії.

НІКОЛИ не описуй і не згадуй:
- рамку, оправу чи поле зображення;
- написи, підписи, літери чи текст на зображенні;
- пошкодження, тріщини, потемніння чи стан збереження;
- водяні знаки чи музейні позначки;
- точну композицію фону -- лише загальний тип сцени (храм, пейзаж тощо), без деталей.

Не намагайся точно відтворити зображення словами -- лише кілька речень
про характерні іконографічні риси. Якщо на зображенні не видно людської
постаті або воно не є церковним зображенням, напиши рівно: "НЕПРИДАТНО".

Поверни лише сам опис, українською мовою, без заголовків і пояснень.`;

interface VisionChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface DescribeSaintIconographyInput {
  apiKey: string;
  model?: string;
  imageUrl: string;
  saintName: string;
}

/**
 * Turns a verified Wikipedia reference IMAGE into a short TEXT description
 * of iconographic characteristics only -- this is what lets the final
 * image-generation prompt draw on "facial/iconographic characteristics
 * where visible, clothing, beard/hair, age, traditional attributes"
 * (task section 6) without ever copying the reference pixel-for-pixel, and
 * without the frame/inscriptions/damage/watermark ever entering the
 * generation prompt at all -- the system prompt above forbids describing
 * them, so they structurally cannot leak through this text relay.
 * Returns null (never throws) when the model reports the image unusable or
 * the request fails -- callers must treat that exactly like "no reference
 * available" and fall back accordingly.
 */
export async function describeSaintIconography(input: DescribeSaintIconographyInput): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model ?? DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: ICONOGRAPHY_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Це історичне церковне зображення, ідентифіковане як "${input.saintName}".` },
              { type: 'image_url', image_url: { url: input.imageUrl } },
            ],
          },
        ],
      }),
    });
  } catch {
    return null;
  }

  let body: VisionChatCompletionResponse;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text || text === 'НЕПРИДАТНО') return null;
  return text;
}
