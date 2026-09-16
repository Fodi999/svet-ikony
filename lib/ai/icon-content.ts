/** OpenAI client for the Icon editor's AI assistant -- see
 * lib/church/icon-ai-actions.ts, the only caller. Deliberately a sibling of
 * lib/ai/church-content.ts rather than a reuse of it: that module's system
 * prompt and per-kind instructions are written around "a day of the church
 * calendar" (fixed civil/Julian dates, a day's saint-of-the-day claim) --
 * an icon has no date at all, so forcing the two shapes together would
 * just produce a worse prompt for both. Same core safety rule either way:
 * AI is an editor of ALREADY-GIVEN facts, never a source of new ones. */
import { OpenAiError } from './openai';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `Ти — редактор православного сайту-крамниці ікон "Світло Ікони". Твоя робота —
писати теплі, змістовні тексти для сторінки конкретної ІКОНИ на основі
ЛИШЕ наданих нижче фактів про цю ікону.

НАЙВАЖЛИВІШЕ ПРАВИЛО (без винятків):
- НЕ вигадуй, до якого святого чи свята належить ця ікона, якщо це не
  зазначено у фактах нижче -- переноси надані ім'я/назву точно так, як
  подано, і не додавай інших святих;
- НЕ вигадуй історичні дати, місця, події чи цитати, яких немає у наданих
  фактах -- якщо фактів мало, пиши коротше, а не докладніше за рахунок
  вигадки;
- НЕ вигадуй фізичні властивості цієї конкретної ікони (матеріали, розміри,
  техніку виконання, вік, стан збереження) -- це поля, які адміністратор
  заповнює окремо і яких тобі не надано;
- пиши ВИКЛЮЧНО українською мовою, використовуючи православну церковну
  термінологію. Ніколи не вставляй у текст слова, словосполучення чи
  речення англійською, російською, польською мовами, латинську
  транслітерацію українських слів чи будь-які інші неперекладені фрази --
  навіть одне іншомовне слово посеред речення є неприпустимою помилкою.
  Єдиний виняток -- явно надане незмінне власне ім'я з фактів нижче.

СТИЛЬ: теплий, спокійний, зрозумілий звичайній людині; без клікбейту, без
надмірних епітетів, без канцеляризмів. Природна, жива мова.

Поверни лише готовий текст, без пояснень, без лапок навколо нього, без
заголовків на кшталт "Опис:".`;

export function iconSystemPrompt(language: 'uk' | 'ru' | 'en'): string {
  if (language === 'uk') return SYSTEM_PROMPT;
  const start = SYSTEM_PROMPT.indexOf('- пиши ВИКЛЮЧНО');
  const end = SYSTEM_PROMPT.indexOf('\n\nСТИЛЬ:', start);
  const instruction = language === 'ru'
    ? '- Пиши исключительно по-русски. Переводи факты на русский; не смешивай языки. Сохраняй предоставленные имена.'
    : '- Write exclusively in English. Translate the supplied facts into English; do not mix languages. Preserve the supplied proper names.';
  return SYSTEM_PROMPT.slice(0, start) + instruction + SYSTEM_PROMPT.slice(end);
}

export type IconContentKind = 'description' | 'history' | 'saint_image_description';

const KIND_INSTRUCTIONS: Record<IconContentKind, string> = {
  description:
    'Напиши короткий опис цієї ікони для картки товару -- 1-3 речення (приблизно 150-300 символів), що передають, кому присвячена ікона і для чого до неї моляться, спираючись лише на надані факти.',
  history:
    'Напиши розгорнуту історичну/житійну довідку, повязану з цією іконою -- кілька змістовних абзаців (приблизно 600-1200 символів), розкриваючи наведені факти про зображеного святого/свято докладніше, без додавання нового.',
  saint_image_description:
    'Напиши короткий опис того, як святий/сюжет зображений на іконі (вбрання, атрибути в руках, загальна композиція) -- 2-4 речення, спираючись лише на надані факти; якщо серед фактів немає опису самого зображення, опиши лише традиційну для цього святого іконографію, не вигадуючи деталей цієї конкретної ікони.',
};

export interface GenerateIconContentInput {
  apiKey: string;
  model?: string;
  language?: 'uk' | 'ru' | 'en';
  kind: IconContentKind;
  /** The icon's canonical title, reproduced verbatim, never altered. */
  title: string;
  /** Plain-text facts already recorded on this icon (saintName/feastName,
   * existing description/history/saintImageDescription) -- the only source
   * of truth the model may draw from. */
  facts: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function generateIconContent(input: GenerateIconContentInput): Promise<string> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(40000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model ?? DEFAULT_MODEL,
      temperature: 0.6,
      messages: [
        { role: 'system', content: iconSystemPrompt(input.language ?? 'uk') },
        {
          role: 'user',
          content: `Завдання: ${KIND_INSTRUCTIONS[input.kind]}\n\nНазва ікони (використай точно так, як подано): "${input.title}"\n\nФакти:\n${input.facts}`,
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
