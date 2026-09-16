/** OpenAI client for the Product editor's AI shop-copy assistant -- see
 * lib/church/product-ai-actions.ts, the only caller. A sibling of
 * lib/ai/icon-content.ts, not a reuse of it: an icon's own description/
 * history is religious/historical copy about the depicted saint/feast,
 * while a product's shop copy is SALES copy for a listing -- different
 * framing, different forbidden topics (a product's copy must never
 * mention price/stock/production time/consecration, none of which apply
 * to an icon's own description at all). Same core safety rule either way:
 * AI elaborates on ALREADY-GIVEN facts, never invents new ones. */
import { OpenAiError } from './openai';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `Ти — продавець-копірайтер православного сайту-крамниці ікон "Світло Ікони".
Твоя робота — писати привабливі рекламні тексти для сторінки ТОВАРУ на
основі ЛИШЕ наданих нижче фактів про ікону, яку зображає цей товар.

НАЙВАЖЛИВІШЕ ПРАВИЛО (без винятків):
- НЕ вигадуй, якому святому чи святу присвячена ікона -- переноси надані
  ім'я/назву точно так, як подано, і не додавай інших святих;
- НЕ вигадуй матеріали, розміри, техніку виконання, походження чи
  історичні факти, яких немає у наданих фактах нижче -- якщо якогось факту
  немає, просто не згадуй його, а не вигадуй правдоподібний варіант;
- НІКОЛИ не згадуй ціну, наявність на складі, термін виготовлення чи
  можливість освячення -- ці дані показані на сторінці товару окремо,
  можуть змінюватися незалежно від цього тексту, і тобі їх свідомо не
  надано;
- пиши ВИКЛЮЧНО українською мовою, використовуючи православну церковну
  термінологію. Ніколи не вставляй у текст слова, словосполучення чи
  речення англійською, російською, польською мовами, латинську
  транслітерацію українських слів чи будь-які інші неперекладені фрази --
  навіть одне іншомовне слово посеред речення є неприпустимою помилкою.
  Єдиний виняток -- явно надане незмінне власне ім'я з фактів нижче.

СТИЛЬ: теплий, довірливий тон продавця, який щиро знає й шанує цей товар;
без клікбейту, без надмірних епітетів, без канцеляризмів.

Поверни лише готовий текст, без пояснень, без лапок навколо нього, без
заголовків на кшталт "Опис:".`;

export function productSystemPrompt(language: 'uk' | 'ru' | 'en'): string {
  if (language === 'uk') return SYSTEM_PROMPT;
  const start = SYSTEM_PROMPT.indexOf('- пиши ВИКЛЮЧНО');
  const end = SYSTEM_PROMPT.indexOf('\n\nСТИЛЬ:', start);
  const instruction = language === 'ru'
    ? '- Пиши исключительно по-русски. Переводи факты на русский; не смешивай языки. Сохраняй предоставленные имена.'
    : '- Write exclusively in English. Translate the supplied facts into English; do not mix languages. Preserve the supplied proper names.';
  return SYSTEM_PROMPT.slice(0, start) + instruction + SYSTEM_PROMPT.slice(end);
}

export type ProductContentKind = 'fullDescription' | 'seoTitle' | 'seoDescription';

const KIND_INSTRUCTIONS: Record<ProductContentKind, string> = {
  fullDescription:
    'Напиши розгорнутий привабливий опис товару для сторінки продажу -- кілька абзаців (приблизно 400-800 символів), що спираються лише на надані факти про ікону, яку представляє цей товар.',
  seoTitle:
    'Напиши SEO-заголовок для сторінки товару -- до 70 символів, привабливий і інформативний, на основі наданих фактів.',
  seoDescription:
    'Напиши SEO-опис (meta description) для сторінки товару -- 120-160 символів, стисло передає суть товару для видачі пошукової системи, без keyword-стаффінгу.',
};

export interface GenerateProductContentInput {
  apiKey: string;
  model?: string;
  language?: 'uk' | 'ru' | 'en';
  kind: ProductContentKind;
  /** The product's own name, reproduced verbatim, never altered. */
  productName: string;
  /** Plain-text facts drawn ONLY from the linked icon's own persisted
   * fields (title/saintName/feastName/description/history/
   * saintImageDescription/materials/dimensions) -- see
   * product-ai-actions.ts's buildFacts(). Never includes the product's own
   * price/stock/production time/consecration, and never treats an
   * AI-generated portfolio photo's gallery metadata as a fact (there is no
   * descriptive content there to extract in the first place). */
  facts: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export async function generateProductContent(input: GenerateProductContentInput): Promise<string> {
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
        { role: 'system', content: productSystemPrompt(input.language ?? 'uk') },
        {
          role: 'user',
          content: `Завдання: ${KIND_INSTRUCTIONS[input.kind]}\n\nНазва товару (використай точно так, як подано, якщо згадуєш її): "${input.productName}"\n\nФакти про ікону, яку представляє цей товар:\n${input.facts}`,
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
