import { ApiError } from '@/lib/d1/errors';
import { getCalendarDay } from '@/lib/d1/repositories/calendarDays';
import { createGospel, type ChurchGospelDto } from '@/lib/d1/repositories/gospel';

const GOSPEL_BOOKS = ['Matthew', 'Mark', 'Luke', 'John'] as const;
type GospelBook = typeof GOSPEL_BOOKS[number];
type ReadingLanguage = 'uk' | 'ru' | 'en';

/** Exactly one traditional liturgical abbreviation per Gospel book per
 * language -- a fixed lookup, nothing to interpret or generate. Matches
 * the citation style already used elsewhere in this admin (e.g. the
 * manual quick-create Gospel form's own placeholder, "Ів. 1:1-17"). */
const BOOK_ABBREVIATIONS: Record<ReadingLanguage, Record<GospelBook, string>> = {
  uk: { Matthew: 'Мт.', Mark: 'Мк.', Luke: 'Лк.', John: 'Ів.' },
  ru: { Matthew: 'Мф.', Mark: 'Мк.', Luke: 'Лк.', John: 'Ин.' },
  en: { Matthew: 'Matt.', Mark: 'Mark', Luke: 'Luke', John: 'John' },
};

const READING_TITLE: Record<ReadingLanguage, (reference: string) => string> = {
  uk: (reference) => `Євангельське читання: ${reference}`,
  ru: (reference) => `Евангельское чтение: ${reference}`,
  en: (reference) => `Gospel reading: ${reference}`,
};

function plain(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp|ldquo|rdquo|hellip|rsquo|mdash);/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts the day's citation list from OCA's daily-readings page. Only
 * the flat list inside the page's own `<section><ul>` block, matched by
 * its exact per-reading permalink shape (`/readings/daily/YYYY/MM/DD/N`)
 * -- the same page also carries unrelated navigation, search-form, and
 * "monthly lectionary" links, none of which match this exact pattern.
 * Verified against a real fetched page (a plain weekday: 2 citations,
 * Epistle + Gospel; a major feast: up to 8, several liturgies' worth).
 */
export function parseGospelReadingSource(html: string): string[] {
  const section = html.match(/<section>\s*<ul>([\s\S]*?)<\/ul>/)?.[1];
  if (!section) return [];
  return [...section.matchAll(/<li>\s*<a\s+href="\/readings\/daily\/\d{4}\/\d{2}\/\d{2}\/\d+">([^<]+)<\/a>\s*<\/li>/g)]
    .map((match) => plain(match[1]))
    .filter(Boolean);
}

/** A citation belongs to the Gospel reading(s) of the day exactly when it
 * names one of the four Gospel books -- Old Testament and Epistle
 * citations (Genesis, Isaiah, Romans, Corinthians, Galatians, etc.) never
 * match. This is how "which of today's several readings is THE Gospel
 * reading" is determined -- by book name, not by position in the list. */
function matchGospelCitation(citation: string): { book: GospelBook; reference: string } | null {
  for (const book of GOSPEL_BOOKS) {
    if (citation.startsWith(`${book} `)) return { book, reference: citation.slice(book.length).trim() };
  }
  return null;
}

async function loadReadingSource(date: string) {
  const url = `https://www.oca.org/readings/daily/${date.replaceAll('-', '/')}`;
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('source');
    const html = await response.text();
    if (html.length > 1000000) throw new Error('source');
    const citations = parseGospelReadingSource(html);
    if (!citations.length) throw new Error('source');
    return { url, citations };
  } catch { throw new ApiError(502, 'GOSPEL_SOURCE_UNAVAILABLE', 'Джерело читань недоступне. Спробуйте пізніше; дані не створено.'); }
}

export type PreparedGospelReading = { title: string; reference: string; text: string; explanation: string; sourceUrl: string };

/**
 * Sources the day's ACTUAL canonical Gospel citation from OCA's public
 * daily-readings page (oca.org/readings/daily) -- this never lets AI
 * decide which passage is read; that's exactly the "must not invent...
 * readings" rule calendar-date-preparation.ts's own AI prompt already
 * enforces for the calendar's commemoration text. Purely deterministic,
 * no OpenAI call at all: the book name goes through a fixed abbreviation
 * table (BOOK_ABBREVIATIONS, above), chapter:verse numbers are copied
 * verbatim from the source. `text`/`explanation` are left empty rather
 * than reproducing a specific (likely copyrighted) Bible translation --
 * the admin fills those in themselves, exactly like the existing manual
 * quick-create Gospel form already allows (church_gospel_readings.text
 * is NOT NULL DEFAULT '' with no minimum-length constraint for this
 * reason).
 */
export async function prepareGospelReading(date: string, language: ReadingLanguage): Promise<PreparedGospelReading> {
  const { url, citations } = await loadReadingSource(date);
  const gospelCitations = citations
    .map(matchGospelCitation)
    .filter((item): item is { book: GospelBook; reference: string } => item !== null);
  if (!gospelCitations.length) throw ApiError.validation('Не вдалося визначити євангельське читання дня. Потрібна перевірка джерела.');
  // A major feast can carry more than one Gospel reading (a Vespers and a
  // Divine Liturgy gospel, say) -- takes the first rather than guessing
  // which one the admin wants; any additional readings need a manual
  // second quick-create, same as any other multi-reading day.
  const [{ book, reference }] = gospelCitations;
  const abbreviation = BOOK_ABBREVIATIONS[language][book];
  const fullReference = `${abbreviation} ${reference}`;
  return { title: READING_TITLE[language](fullReference), reference: fullReference, text: '', explanation: '', sourceUrl: url };
}

function asReadingLanguage(value: string): ReadingLanguage {
  return value === 'ru' || value === 'en' ? value : 'uk';
}

/**
 * Resolves the day's canonical Gospel citation WITHOUT creating anything --
 * the read-only "review before you commit" step the admin UX redesign
 * needs (task: "Do not immediately mutate everything when clicking the
 * button"). Throws the exact same errors `prepareGospelReadingForCalendarDay`
 * would (source unavailable / no Gospel citation found), which the caller
 * surfaces as "⚠ Канонічне читання не визначено" rather than a generic
 * failure -- never a reason to guess.
 */
export async function previewGospelReadingForCalendarDay(dayId: string): Promise<PreparedGospelReading> {
  const day = await getCalendarDay(dayId);
  const date = day.dateNewStyle || day.dateOldStyle;
  if (!date) throw ApiError.validation('У цього дня немає дати для пошуку читання.');
  return prepareGospelReading(date, asReadingLanguage(day.language));
}

/**
 * Sources and creates a new DRAFT Gospel reading pre-linked to this
 * calendar day -- the AI-populated counterpart to the manual "+ Створити
 * нове" quick-create already shipped for the relations tab. Never
 * touches the calendar day itself (no proposal-system involvement
 * needed, same reasoning as the manual quick-create: a new prayer/Gospel
 * row is independent of the parent day's own status).
 */
export async function prepareGospelReadingForCalendarDay(dayId: string): Promise<ChurchGospelDto> {
  const day = await getCalendarDay(dayId);
  const prepared = await previewGospelReadingForCalendarDay(dayId);
  return createGospel({ ...prepared, language: day.language, calendarDayId: dayId, status: 'draft' });
}
