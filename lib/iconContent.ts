
import type { Church, Icon, SiteLocale } from './types';

export type StructuredSection = { label: string; value: string };

const structuredLabelPattern = /\*\*([^*\n]+?)\*\*\s*:?/g;

const sectionLabelTranslations: Record<string, Partial<Record<SiteLocale, string>>> = {
  'краткое описание изображения': { uk: 'Короткий опис зображення', ru: 'Краткое описание изображения', en: 'Short image description' },
  'символы на иконе': { uk: 'Символи на іконі', ru: 'Символы на иконе', en: 'Symbols in the icon' },
  'alt для фото': { uk: 'Alt для фото', ru: 'Alt для фото', en: 'Image alt text' },
  'prompt для генерации': { uk: 'Prompt для генерації', ru: 'Prompt для генерации', en: 'Generation prompt' },
  'источник изображения': { uk: 'Джерело зображення', ru: 'Источник изображения', en: 'Image source' },
  'полное описание': { uk: 'Повний опис', ru: 'Полное описание', en: 'Full description' },
  'смысл праздника': { uk: 'Сенс свята', ru: 'Смысл праздника', en: 'Meaning of the feast' },
  'что важно знать': { uk: 'Що важливо знати', ru: 'Что важно знать', en: 'What is important to know' },
  'для кого эта молитва страница': { uk: 'Для кого ця молитва / сторінка', ru: 'Для кого эта молитва/страница', en: 'Who this prayer / page is for' },
  'не писать': { uk: 'Не писати', ru: 'Не писать', en: 'Do not write' },
  'главные святые дня': { uk: 'Головні святі дня', ru: 'Главные святые дня', en: 'Main saints of the day' },
  'кратко кто это': { uk: 'Коротко хто це', ru: 'Кратко кто это', en: 'Who they are' },
  'годы век': { uk: 'Роки / століття', ru: 'Годы / век', en: 'Years / century' },
  'чем известен': { uk: 'Чим відомий', ru: 'Чем известен', en: 'Known for' },
  'память по календарю': { uk: 'Пам’ять за календарем', ru: 'Память по календарю', en: 'Calendar commemoration' },
  'источники': { uk: 'Джерела', ru: 'Источники', en: 'Sources' },
  'тропарь': { uk: 'Тропар', ru: 'Тропарь', en: 'Troparion' },
  'кондак': { uk: 'Кондак', ru: 'Кондак', en: 'Kontakion' },
  'величание': { uk: 'Величання', ru: 'Величание', en: 'Magnification' },
  'краткая молитва': { uk: 'Коротка молитва', ru: 'Краткая молитва', en: 'Short prayer' },
  'молитва своими словами': { uk: 'Молитва своїми словами', ru: 'Молитва своими словами', en: 'Prayer in simple words' },
  'язык': { uk: 'Мова', ru: 'Язык', en: 'Language' },
  'источник текста': { uk: 'Джерело тексту', ru: 'Источник текста', en: 'Text source' },
  'апостольское чтение': { uk: 'Апостольське читання', ru: 'Апостольское чтение', en: 'Apostolic reading' },
  'евангельское чтение': { uk: 'Євангельське читання', ru: 'Евангельское чтение', en: 'Gospel reading' },
  'цитата дня': { uk: 'Цитата дня', ru: 'Цитата дня', en: 'Verse of the day' },
  'объяснение простыми словами': { uk: 'Пояснення простими словами', ru: 'Объяснение простыми словами', en: 'Plain-language explanation' },
  'связь с событием': { uk: 'Зв’язок із подією', ru: 'Связь с событием', en: 'Connection with the event' },
  'источник': { uk: 'Джерело', ru: 'Источник', en: 'Source' },
  'краткое житие': { uk: 'Коротке житіє', ru: 'Краткое житие', en: 'Short life' },
  'подробное житие': { uk: 'Докладне житіє', ru: 'Подробное житие', en: 'Detailed life' },
  'главные события жизни': { uk: 'Головні події життя', ru: 'Главные события жизни', en: 'Main events of life' },
  'духовный смысл': { uk: 'Духовний сенс', ru: 'Духовный смысл', en: 'Spiritual meaning' },
  'где почитается': { uk: 'Де шанується', ru: 'Где почитается', en: 'Where venerated' },
  'история праздника': { uk: 'Історія свята', ru: 'История праздника', en: 'History of the feast' },
  'дата по старому стилю': { uk: 'Дата за старим стилем', ru: 'Дата по старому стилю', en: 'Old-style date' },
  'дата по новому стилю': { uk: 'Дата за новим стилем', ru: 'Дата по новому стилю', en: 'New-style date' },
  'разные календарные традиции': { uk: 'Різні календарні традиції', ru: 'Разные календарные традиции', en: 'Different calendar traditions' },
  'почему бывает путаница': { uk: 'Чому виникає плутанина', ru: 'Почему бывает путаница', en: 'Why confusion happens' },
  'проверенные источники': { uk: 'Перевірені джерела', ru: 'Проверенные источники', en: 'Verified sources' },
  'дата проверена': { uk: 'Дату перевірено', ru: 'Дата проверена', en: 'Date checked' },
  'календарный стиль': { uk: 'Календарний стиль', ru: 'Календарный стиль', en: 'Calendar style' },
  'найденное событие': { uk: 'Знайдена подія', ru: 'Найденное событие', en: 'Found event' },
  'уверенность': { uk: 'Упевненість', ru: 'Уверенность', en: 'Confidence' },
  'предупреждение': { uk: 'Попередження', ru: 'Предупреждение', en: 'Warning' },
  'название храма': { uk: 'Назва храму', ru: 'Название храма', en: 'Church name' },
  'кому посвящен': { uk: 'Кому присвячений', ru: 'Кому посвящён', en: 'Dedicated to' },
  'кому посвящён': { uk: 'Кому присвячений', ru: 'Кому посвящён', en: 'Dedicated to' },
  'страна город': { uk: 'Країна / місто', ru: 'Страна / город', en: 'Country / city' },
  'адрес': { uk: 'Адреса', ru: 'Адрес', en: 'Address' },
  'google maps ссылка': { uk: 'Посилання Google Maps', ru: 'Google Maps ссылка', en: 'Google Maps link' },
  'расписание богослужений': { uk: 'Розклад богослужінь', ru: 'Расписание богослужений', en: 'Service schedule' },
  'телефон сайт': { uk: 'Телефон / сайт', ru: 'Телефон / сайт', en: 'Phone / website' },
  'краткое описание': { uk: 'Короткий опис', ru: 'Краткое описание', en: 'Short description' },
  'святыни иконы мощи': { uk: 'Святині / ікони / мощі', ru: 'Святыни / иконы / мощи', en: 'Shrines / icons / relics' },
  'фото храма': { uk: 'Фото храму', ru: 'Фото храма', en: 'Church photo' }
};


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

export function translateSectionLabel(label: string, locale: SiteLocale) {
  return sectionLabelTranslations[normalizeKey(label)]?.[locale] || label;
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
