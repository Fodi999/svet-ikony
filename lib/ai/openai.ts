/** OpenAI client for the Telegram autopost pipeline — the only caller of
 * this module. Copywrites real church data into a Ukrainian Telegram post;
 * it never originates facts itself (see lib/telegram/autopost-content.ts's
 * "insufficient data -> skip" checks, which run *before* this is called). */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiError';
  }
}

const SYSTEM_PROMPT = `Ти — редактор Telegram-каналу "Світло Ікони" про православну традицію.
Пиши українською мовою, у теплому, стислому стилі, придатному для Telegram-посту
(зазвичай 3-8 речень, доречні емодзі на початку рядків, без хештегів).

НАЙВАЖЛИВІШЕ ПРАВИЛО: використовуй ЛИШЕ факти, надані нижче користувачем.
Не вигадуй імена святих, дати, цитати з Писання чи будь-які деталі, яких
немає у наданих даних. Якщо наданих фактів мало — просто напиши коротко на
їх основі, не додаючи нічого від себе.

Поверни лише готовий текст поста, без пояснень і без лапок навколо нього.`;

export interface GenerateTelegramPostInput {
  apiKey: string;
  model?: string;
  /** Ukrainian label of the slot, e.g. "Ранкова молитва" — gives the model
   * the post's purpose without it needing to infer one. */
  contentTypeLabel: string;
  /** Plain-text facts pulled straight from D1 (see autopost-content.ts) —
   * the only source of truth the model is allowed to draw from. */
  facts: string;
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
        { role: 'user', content: `Тип публікації: ${input.contentTypeLabel}\n\nФакти:\n${input.facts}` },
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
