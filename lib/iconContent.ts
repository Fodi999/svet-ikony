
import type { Church, Icon, SiteLocale } from './types';

export type StructuredSection = { label: string; value: string };

const structuredLabelPattern = /\*\*([^*\n]+?)\*\*\s*:?/g;

function clean(value?: string) {
  return (value || '').replace(/\r/g, '').trim();
}

function first(value?: string, fallback = '') {
  return clean(value) || fallback;
}

export function localizeIcon(icon: Icon, locale: SiteLocale): Icon {
  const translation = locale === 'ru' ? undefined : icon.translations?.[locale];
  if (!translation) return icon;
  return {
    ...icon,
    title: first(translation.title, icon.title),
    shortDescription: first(translation.shortDescription, icon.shortDescription),
    fullDescription: first(translation.fullDescription, icon.fullDescription),
    category: first(translation.category, icon.category),
    saintName: first(translation.saintName, icon.saintName),
    prayerText: first(translation.prayerText, icon.prayerText),
    gospelText: first(translation.gospelText, icon.gospelText),
    lifeText: first(translation.lifeText, icon.lifeText),
    historyText: first(translation.historyText, icon.historyText),
    seoTitle: first(translation.seoTitle, icon.seoTitle || icon.title),
    seoDescription: first(translation.seoDescription, icon.seoDescription || icon.shortDescription),
    seoKeywords: first(translation.seoKeywords, icon.seoKeywords || '')
  };
}

export function stripMarkdownLabels(text?: string) {
  return clean(text).replace(/\*\*([^*\n]+?)\*\*\s*:?/g, '$1:').trim();
}

export function textPreview(text?: string, limit = 180) {
  const value = stripMarkdownLabels(text).replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1).trim()}…` : value;
}

export function sectionsFromText(text?: string): StructuredSection[] {
  const value = clean(text);
  if (!value) return [];
  const matches = Array.from(value.matchAll(structuredLabelPattern));
  if (!matches.length) return [];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    const start = (match.index || 0) + match[0].length;
    const end = next?.index ?? value.length;
    return {
      label: match[1].replace(/:$/, '').trim(),
      value: value.slice(start, end).replace(/^\s*:?\s*/, '').trim()
    };
  }).filter((section) => section.label && section.value);
}

export function paragraphsFromText(text?: string) {
  return stripMarkdownLabels(text).split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[ё]/g, 'е').replace(/[^a-zа-яіїєґ0-9]+/gi, ' ').trim();
}

export function findSection(text: string | undefined, aliases: string[]) {
  const sections = sectionsFromText(text);
  const keys = aliases.map(normalizeKey);
  return sections.find((section) => keys.some((key) => normalizeKey(section.label).includes(key)))?.value || '';
}

export function imageForPrayer(icon: Icon) {
  return icon.imageUrls?.[1] || icon.imageUrls?.[0] || icon.imageUrl;
}

export function churchFromIcon(icon: Icon): Church {
  const source = `${icon.fullDescription}\n\n${icon.historyText}`;
  const title = findSection(source, ['Название храма', 'Назва храму', 'Church name']) || icon.title;
  const city = findSection(source, ['Страна / город', 'Країна / місто', 'Country / city']) || 'Онлайн';
  const address = findSection(source, ['Адрес', 'Адреса', 'Address']) || 'Уточняется';
  const mapsUrl = findSection(source, ['Google Maps ссылка', 'Google Maps посилання', 'Google Maps link']);
  const schedule = findSection(source, ['Расписание богослужений', 'Розклад богослужінь', 'Service schedule']) || 'Расписание уточняется в храме.';
  const phoneOrSite = findSection(source, ['Телефон / сайт', 'Phone / website']);
  const description = findSection(source, ['Краткое описание', 'Короткий опис', 'Short description']) || icon.shortDescription || icon.fullDescription;
  const dedication = findSection(source, ['Кому посвящен', 'Кому посвящён', 'Кому присвячений', 'Dedicated to']) || icon.saintName || icon.category;
  const shrines = findSection(source, ['Святыни / иконы / мощи', 'Святині / ікони / мощі', 'Shrines / icons / relics']);
  const churchImage = findSection(source, ['Фото храма', 'Фото храму', 'Church photo']);
  return {
    id: `church-${icon.slug}`,
    slug: icon.slug,
    title,
    city,
    address,
    description,
    schedule,
    mapsUrl,
    phoneOrSite,
    dedication,
    shrines,
    imageUrl: churchImage || icon.imageUrl,
    donationUrl: '',
    relatedIcons: [icon.slug],
    seoTitle: title,
    seoDescription: textPreview(description, 180),
    status: 'published'
  };
}

export function hasChurchFields(church: Church) {
  return Boolean(church.address && church.address !== 'Уточняется' || church.mapsUrl || church.phoneOrSite || church.shrines || church.schedule);
}
