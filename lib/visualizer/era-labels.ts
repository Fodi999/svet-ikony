import type { Locale } from '@/lib/i18n';

export const ERA_ORDER = [
  'biblical_creation',
  'biblical_old_testament',
  'biblical_new_testament',
  'apostolic',
  'early_church',
  'byzantine',
  'medieval',
  'modern',
  'contemporary',
  'custom'
] as const;

/** Closed enum sets read directly here rather than through messages/*.json,
 * mirroring SlavonicAlphabetPage.tsx's established alternative i18n
 * pattern for content-heavy interactive pages (a local per-locale
 * dictionary) rather than adding ~20 more flat JSON keys for a fixed,
 * small vocabulary. */
const ERA_LABELS: Record<(typeof ERA_ORDER)[number], Record<Locale, string>> = {
  biblical_creation: { uk: 'Створення світу', ru: 'Сотворение мира', en: 'Creation' },
  biblical_old_testament: { uk: 'Старий Заповіт', ru: 'Ветхий Завет', en: 'Old Testament' },
  biblical_new_testament: { uk: 'Новий Заповіт', ru: 'Новый Завет', en: 'New Testament' },
  apostolic: { uk: 'Апостольська доба', ru: 'Апостольская эпоха', en: 'Apostolic Age' },
  early_church: { uk: 'Рання Церква', ru: 'Ранняя Церковь', en: 'Early Church' },
  byzantine: { uk: 'Візантія', ru: 'Византия', en: 'Byzantium' },
  medieval: { uk: 'Середньовіччя', ru: 'Средневековье', en: 'Medieval' },
  modern: { uk: 'Новий час', ru: 'Новое время', en: 'Modern' },
  contemporary: { uk: 'Сучасність', ru: 'Современность', en: 'Contemporary' },
  custom: { uk: 'Інше', ru: 'Прочее', en: 'Other' }
};

export function eraLabel(era: string, locale: Locale): string {
  return (ERA_LABELS as Record<string, Record<Locale, string>>)[era]?.[locale] ?? era;
}
