import { publicApiPrefix, publicApiUrl } from './config';
import { churchFromIcon, imageForPrayer } from './iconContent';
import type { CalendarDay, CalendarDayKind, Church, ChurchArticleDto, ChurchGospelDto, ChurchIconDto, ChurchInfoDto, ChurchPrayerDto, Dashboard, GospelReading, Icon, IconTranslation, Prayer, PublicChurchArticlePage, PublicChurchContentPage, PublicChurchGospelPage, PublicChurchIconPage, PublicChurchPrayerPage, PublicChurchSitemapItem, QrPage, Saint, SeoPage, SiteContent, SiteLocale } from './types';

const emptyDashboard: Dashboard = {
  publishedPages: 0,
  icons: 0,
  prayers: 0,
  qrPages: 0,
  qrScans: 0,
  latestPages: [],
  seo: []
};

const emptySiteContent: SiteContent = {
  icons: [],
  prayers: [],
  gospel: [],
  saints: [],
  pages: [],
  qrPages: [],
  churches: [],
  dashboard: emptyDashboard
};

function emptyGospelReading(date = new Date().toISOString().slice(0, 10)): GospelReading {
  return {
    id: `gospel-${date}`,
    date,
    title: '',
    reference: '',
    text: '',
    explanation: '',
    status: 'published'
  };
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : [];
}

function normalizeStatus(value: unknown) {
  return value === 'draft' ? 'draft' : 'published';
}

function normalizeTranslation(value: unknown): IconTranslation {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    title: normalizeString(source.title),
    shortDescription: normalizeString(source.shortDescription),
    fullDescription: normalizeString(source.fullDescription),
    category: normalizeString(source.category),
    saintName: normalizeString(source.saintName),
    prayerText: normalizeString(source.prayerText),
    gospelText: normalizeString(source.gospelText),
    lifeText: normalizeString(source.lifeText),
    historyText: normalizeString(source.historyText),
    seoTitle: normalizeString(source.seoTitle),
    seoDescription: normalizeString(source.seoDescription),
    seoKeywords: normalizeString(source.seoKeywords)
  };
}

function normalizeTranslations(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    uk: normalizeTranslation(source.uk),
    ru: normalizeTranslation(source.ru),
    en: normalizeTranslation(source.en)
  };
}

function published<T extends { status?: string }>(items: T[]) {
  return items.filter((item) => item.status === 'published');
}

const monthNames = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'
];

function mergeBySlug<T extends { slug: string }>(primary: T[], generated: T[]) {
  const seen = new Set<string>();
  return [...primary, ...generated].filter((item) => {
    if (seen.has(item.slug)) return false;
    seen.add(item.slug);
    return true;
  });
}

function compactText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1).trim()}…` : normalized;
}

function firstTextLine(value: string, fallback: string) {
  return value.split(/\n{2,}|\n/).map((line) => line.trim()).find(Boolean) || fallback;
}

function prayerImageFromIcon(icon: Icon) {
  return imageForPrayer(icon);
}

function gospelReferenceFromText(value: string) {
  return value.match(/\(([^()]*?(?:Мф|Мк|Лк|Ин|Деян|Рим|Кор|Гал|Еф|Флп|Кол|Фес|Тим|Тит|Евр|Пет|Иак|Иуд|Отк)[^()]*)\)/i)?.[1]?.trim() || 'Чтение дня';
}

function normalizeIcon(item: Partial<Icon>, index: number): Icon {
  const title = normalizeString(item.title) || `Икона ${index + 1}`;
  const slug = normalizeString(item.slug) || title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-+|-+$/g, '') || `icon-${index + 1}`;
  const now = new Date().toISOString();
  return {
    id: normalizeString(item.id) || `icon-${slug}`,
    slug,
    title,
    shortDescription: normalizeString(item.shortDescription) || normalizeString(item.seoDescription) || normalizeString(item.fullDescription).slice(0, 220),
    fullDescription: normalizeString(item.fullDescription) || normalizeString(item.shortDescription),
    imageUrl: normalizeString(item.imageUrl),
    imageUrls: normalizeStringArray(item.imageUrls),
    qrCodeUrl: normalizeString(item.qrCodeUrl),
    category: normalizeString(item.category) || 'Православная икона',
    saintName: normalizeString(item.saintName),
    prayerText: normalizeString(item.prayerText),
    gospelText: normalizeString(item.gospelText),
    lifeText: normalizeString(item.lifeText),
    historyText: normalizeString(item.historyText),
    audioUrl: normalizeString(item.audioUrl) || undefined,
    status: normalizeStatus(item.status),
    seoTitle: normalizeString(item.seoTitle) || title,
    seoDescription: normalizeString(item.seoDescription) || normalizeString(item.shortDescription),
    seoKeywords: normalizeString(item.seoKeywords),
    canonicalUrl: normalizeString(item.canonicalUrl),
    calendarDate: normalizeString(item.calendarDate) || undefined,
    translations: normalizeTranslations((item as { translations?: unknown }).translations),
    createdAt: normalizeString(item.createdAt) || now,
    updatedAt: normalizeString(item.updatedAt) || now
  };
}

function normalizePrayer(item: Partial<Prayer>, index: number): Prayer {
  const title = normalizeString(item.title) || `Молитва ${index + 1}`;
  const slug = normalizeString(item.slug) || title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-+|-+$/g, '') || `prayer-${index + 1}`;
  return {
    id: normalizeString(item.id) || `prayer-${slug}`,
    slug,
    title,
    text: normalizeString(item.text),
    category: normalizeString(item.category) || 'Молитвы',
    imageUrl: normalizeString(item.imageUrl) || undefined,
    relatedSaint: normalizeString(item.relatedSaint),
    relatedIcon: normalizeString(item.relatedIcon),
    audioUrl: normalizeString(item.audioUrl),
    qrCodeUrl: normalizeString((item as { qrCodeUrl?: unknown }).qrCodeUrl),
    seoTitle: normalizeString(item.seoTitle) || title,
    seoDescription: normalizeString(item.seoDescription) || normalizeString(item.text).slice(0, 160),
    status: normalizeStatus(item.status)
  };
}

function iconFromChurchDto(item: ChurchIconDto, prayer?: ChurchPrayerDto, article?: ChurchArticleDto): Icon {
  const description = normalizeString(item.description) || normalizeString(article?.seoDescription) || normalizeString(article?.content);
  const now = new Date().toISOString();
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    shortDescription: compactText(description, 220),
    fullDescription: normalizeString(article?.content) || description,
    imageUrl: normalizeString(item.imageUrl),
    imageUrls: normalizeString(item.imageUrl) ? [item.imageUrl] : [],
    qrCodeUrl: '',
    category: normalizeString(item.feastName) || 'Православная икона',
    saintName: normalizeString(item.saintName),
    prayerText: normalizeString(prayer?.text),
    gospelText: '',
    lifeText: '',
    historyText: normalizeString(article?.content),
    status: item.status === 'published' ? 'published' : 'draft',
    seoTitle: normalizeString(article?.seoTitle) || item.title,
    seoDescription: normalizeString(article?.seoDescription) || description,
    seoKeywords: '',
    calendarDate: undefined,
    translations: {},
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
    source: 'church'
  };
}

function prayerFromChurchDto(item: ChurchPrayerDto, icon?: ChurchIconDto): Prayer {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    text: item.text,
    category: item.prayerType || 'Молитвы',
    imageUrl: icon?.imageUrl || undefined,
    relatedIcon: icon?.slug || undefined,
    audioUrl: normalizeString(item.audioUrl) || undefined,
    qrCodeUrl: normalizeString(item.qrCodeUrl) || undefined,
    seoTitle: item.title,
    seoDescription: compactText(item.text, 180),
    status: item.status === 'published' ? 'published' : 'draft',
    source: 'church'
  };
}

function seoPageFromChurchArticle(item: ChurchArticleDto): SeoPage {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    h1: item.title,
    content: item.content,
    pageType: 'church_article',
    targetKeyword: item.title,
    language: item.language,
    blocks: [],
    faq: [],
    seoTitle: item.seoTitle || item.title,
    seoDescription: item.seoDescription || compactText(item.content, 180),
    status: item.status === 'published' ? 'published' : 'draft',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function calendarKindFromChurch(dayType: string): CalendarDayKind {
  if (dayType === 'fasting') return 'fast';
  if (dayType === 'gospel') return 'gospel';
  if (dayType === 'memorial' || dayType === 'saint') return 'prayer';
  if (dayType === 'feast') return 'feast';
  return 'quiet';
}

function calendarDayFromChurchPage(page: PublicChurchContentPage): CalendarDay {
  const date = page.calendarDay.dateNewStyle || page.calendarDay.dateOldStyle || '';
  const dayNumber = date.split('-')[2] || '01';
  const icon = page.icons[0];
  const prayer = page.prayers[0];
  const article = page.articles[0];
  return {
    id: page.calendarDay.id,
    day: dayNumber.padStart(2, '0'),
    gregorianDate: page.calendarDay.dateNewStyle || undefined,
    julianDate: page.calendarDay.dateOldStyle || undefined,
    label: page.calendarDay.title,
    note: icon?.saintName || icon?.feastName || page.calendarDay.dayType,
    kind: calendarKindFromChurch(page.calendarDay.dayType),
    imageUrl: icon?.imageUrl || '',
    iconSlug: icon?.slug || '',
    prayerSlug: prayer?.slug || '',
    gospelSlug: page.gospel[0]?.slug || '',
    detailHref: date ? `/church/calendar/${date}` : `/church/articles/${article?.slug || ''}`,
    current: date === new Date().toISOString().slice(0, 10),
    feast: page.calendarDay.dayType === 'feast',
    textOnly: !icon?.imageUrl,
    description: page.calendarDay.description || article?.seoDescription || article?.content || ''
  };
}

function monthIndexFromCalendarTitle(title?: string) {
  const normalized = normalizeString(title).toLowerCase();
  const index = monthNames.findIndex((month) => normalized.includes(month));
  return index >= 0 ? index + 1 : undefined;
}

function mergeChurchMonthContent(content: SiteContent, monthPages: PublicChurchContentPage[]): SiteContent {
  if (!monthPages.length) return content;
  const churchIcons = monthPages
    .map((page) => page.icons[0] ? iconFromChurchDto(page.icons[0], page.prayers[0], page.articles[0]) : null)
    .filter(Boolean) as Icon[];
  const churchPrayers = monthPages.flatMap((page) => page.prayers.map((prayer) => prayerFromChurchDto(prayer, page.icons.find((icon) => icon.id === prayer.iconId) || page.icons[0])));
  const churchPages = monthPages.flatMap((page) => page.articles.map(seoPageFromChurchArticle));
  const churchDays = monthPages.map(calendarDayFromChurchPage);
  const byDay = new Map(churchDays.map((day) => [day.day, day]));
  const calendar = content.calendar
    ? { ...content.calendar, days: content.calendar.days.map((day) => byDay.get(day.day) || day) }
    : undefined;
  const existingDays = new Set(content.calendar?.days.map((day) => day.day) || []);
  const appendedDays = churchDays.filter((day) => !existingDays.has(day.day));
  return {
    ...content,
    icons: mergeBySlug(churchIcons, content.icons),
    prayers: mergeBySlug(churchPrayers, content.prayers),
    pages: mergeBySlug(churchPages, content.pages),
    calendar: calendar ? { ...calendar, days: [...calendar.days, ...appendedDays] } : calendar
  };
}

function saintsFromIcons(items: Icon[]): Saint[] {
  return items
    .filter((icon) => icon.saintName.trim() || icon.lifeText.trim())
    .map((icon) => ({
      id: `saint-${icon.slug}`,
      slug: icon.slug,
      name: icon.saintName || icon.title,
      shortDescription: icon.shortDescription || firstTextLine(icon.lifeText, icon.title),
      biography: icon.lifeText || icon.fullDescription || icon.historyText,
      feastDay: '',
      imageUrl: icon.imageUrl,
      relatedIcons: [icon.slug],
      prayers: [],
      seoTitle: `${icon.saintName || icon.title}: житие и день памяти`,
      seoDescription: compactText(icon.lifeText || icon.shortDescription || icon.fullDescription, 180),
      status: 'published'
    }));
}

function gospelFromIcons(items: Icon[]): GospelReading[] {
  return items
    .filter((icon) => icon.gospelText.trim())
    .map((icon) => ({
      id: `gospel-${icon.slug}`,
      date: icon.calendarDate || new Date().toISOString().slice(0, 10),
      title: `Евангелие: ${icon.title}`,
      reference: gospelReferenceFromText(icon.gospelText),
      text: icon.gospelText,
      explanation: icon.shortDescription || icon.fullDescription || 'Чтение дня помогает соединить молитву перед образом с внимательным словом Евангелия.',
      seoTitle: `Евангелие дня: ${icon.title}`,
      seoDescription: compactText(icon.gospelText, 180),
      status: 'published'
    }));
}

function churchesFromIcons(items: Icon[]): Church[] {
  const generated = items.map(churchFromIcon).filter((church) => church.title && church.description);
  if (generated.length) return generated;
  if (!items.length) return [];
  const source = items[0];
  return [{
    id: 'church-svet-ikony-qr',
    slug: 'svet-ikony-dlya-hramov',
    title: 'Свет Иконы для храмов',
    city: 'Онлайн',
    address: 'QR-страницы православных икон',
    description: source.historyText || source.fullDescription || 'Храм может подключить QR-страницы икон, чтобы прихожане открывали молитву, житие святого, Евангелие дня и историю образа рядом со святыней.',
    schedule: 'Подключение и наполнение страниц настраивается в админке.',
    donationUrl: '',
    imageUrl: source.imageUrl,
    relatedIcons: items.map((item) => item.slug),
    seoTitle: 'QR-иконы и молитвенные страницы для храмов',
    seoDescription: 'Материалы для храмов: QR-страницы икон, молитвы, жития, Евангелие дня и описание святынь.',
    status: 'published'
  }];
}

function normalizeSiteContent(value: unknown): SiteContent {
  const source = value && typeof value === 'object' ? value as Partial<SiteContent> : {};
  const hasIcons = Array.isArray(source.icons);
  const hasPrayers = Array.isArray(source.prayers);
  const hasGospel = Array.isArray(source.gospel);
  const hasSaints = Array.isArray(source.saints);
  const hasPages = Array.isArray(source.pages);
  const hasQrPages = Array.isArray(source.qrPages);
  const hasChurches = Array.isArray(source.churches);
  const normalizedIcons = hasIcons ? source.icons!.map(normalizeIcon).filter((item) => item.slug && item.title) : [];
  const normalizedPrayers = hasPrayers ? source.prayers!.map(normalizePrayer).filter((item) => item.slug && item.title) : [];
  const publicIcons = hasIcons ? published(normalizedIcons) : [];
  const normalizedPublicPrayers = hasPrayers ? published(normalizedPrayers).map((prayer) => {
    const icon = publicIcons.find((item) => item.slug === prayer.relatedIcon || item.slug === prayer.slug);
    return icon && !prayer.imageUrl ? { ...prayer, imageUrl: prayerImageFromIcon(icon), relatedIcon: prayer.relatedIcon || icon.slug } : prayer;
  }) : [];
  const normalizedGospel = hasGospel ? (source.gospel as GospelReading[]).filter((item) => item.status === 'published') : [];
  const derivedGospel = gospelFromIcons(publicIcons);
  const normalizedSaints = hasSaints ? (source.saints as Saint[]).filter((item) => item.status === 'published') : [];
  const normalizedPages = hasPages ? (source.pages!.map((item) => ({
    ...item,
    blocks: normalizeStringArray(item.blocks),
    faq: Array.isArray(item.faq) ? item.faq : []
  })) as SeoPage[]).filter((item) => item.status === 'published') : [];
  const normalizedQrPages = hasQrPages ? (source.qrPages as QrPage[]).filter((item) => item.active) : [];
  const normalizedChurches = hasChurches ? (source.churches as Church[]).filter((item) => item.status === 'published') : [];

  return {
    icons: publicIcons,
    prayers: hasPrayers ? normalizedPublicPrayers : [],
    gospel: derivedGospel.length ? derivedGospel : normalizedGospel,
    saints: mergeBySlug(normalizedSaints, saintsFromIcons(publicIcons)),
    pages: normalizedPages,
    qrPages: normalizedQrPages,
    churches: mergeBySlug(normalizedChurches, churchesFromIcons(publicIcons)),
    calendar: source.calendar,
    dashboard: source.dashboard || emptyDashboard
  };
}

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${publicApiUrl}${publicApiPrefix}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

async function churchApiGet<T>(path: string, fallback: T, previewToken?: string, language?: SiteLocale): Promise<T> {
  const query = new URLSearchParams();
  if (previewToken) query.set('preview_token', previewToken);
  if (language) query.set('language', language);
  const suffix = query.toString() ? `${path.includes('?') ? '&' : '?'}${query.toString()}` : '';
  return apiGet<T>(path + suffix, fallback);
}

async function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown, fallback?: T): Promise<T> {
  try {
    const response = await fetch(`${publicApiUrl}${publicApiPrefix}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) return fallback as T;
    return await response.json() as T;
  } catch {
    return fallback as T;
  }
}

export const publicApi = {
  content: async (params?: { year?: string | number; month?: string | number; locale?: SiteLocale }) => {
    const query = new URLSearchParams();
    if (params?.year) query.set('year', String(params.year));
    if (params?.month) query.set('month', String(params.month));
    if (params?.locale) query.set('locale', params.locale);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const normalized = normalizeSiteContent(await apiGet<SiteContent>(`/api/content${suffix}`, emptySiteContent));
    const year = Number(params?.year) || Number(normalized.calendar?.hero?.year) || new Date().getFullYear();
    const month = Number(params?.month) || monthIndexFromCalendarTitle(normalized.calendar?.hero?.monthTitle) || new Date().getMonth() + 1;
    const monthPages = await publicApi.churchCalendarMonth(year, month, undefined, params?.locale);
    return mergeChurchMonthContent(normalized, monthPages);
  },
  icons: async (locale?: SiteLocale) => (await publicApi.content({ locale })).icons,
  icon: async (slug: string, locale?: SiteLocale) => (await publicApi.icons(locale)).find((item) => item.slug === slug) || null,
  saints: async (locale?: SiteLocale) => (await publicApi.content({ locale })).saints,
  saint: async (slug: string, locale?: SiteLocale) => (await publicApi.saints(locale)).find((item) => item.slug === slug) || null,
  prayers: async (locale?: SiteLocale) => (await publicApi.content({ locale })).prayers,
  prayer: async (slug: string, locale?: SiteLocale) => (await publicApi.prayers(locale)).find((item) => item.slug === slug) || null,
  churchCalendarDay: async (date: string, previewToken?: string, locale?: SiteLocale) => churchApiGet<PublicChurchContentPage | null>(`/api/church/calendar/${date}`, null, previewToken, locale),
  churchCalendarMonth: async (year: string | number, month: string | number, previewToken?: string, locale?: SiteLocale) => churchApiGet<PublicChurchContentPage[]>(`/api/church/calendar?year=${encodeURIComponent(String(year))}&month=${encodeURIComponent(String(month))}`, [], previewToken, locale),
  churchToday: async (previewToken?: string, locale?: SiteLocale) => churchApiGet<PublicChurchContentPage | null>('/api/church/calendar/today', null, previewToken, locale),
  churchIcon: async (slug: string, previewToken?: string, locale?: SiteLocale) => {
    const page = await churchApiGet<PublicChurchIconPage | null>(`/api/church/icons/${slug}`, null, previewToken, locale);
    if (!page) return null;
    return {
      ...page,
      iconView: iconFromChurchDto(page.icon, page.prayers[0], page.articles[0])
    };
  },
  churchPrayer: async (slug: string, previewToken?: string, locale?: SiteLocale) => churchApiGet<PublicChurchPrayerPage | null>(`/api/church/prayers/${slug}`, null, previewToken, locale),
  churchArticle: async (slug: string, previewToken?: string, locale?: SiteLocale) => {
    const result = await churchApiGet<PublicChurchArticlePage | null>(`/api/church/articles/${slug}`, null, previewToken, locale);
    return result ? { ...result, pageView: seoPageFromChurchArticle(result.article) } : null;
  },
  churchGospel: async (slug: string, previewToken?: string, locale?: SiteLocale) => churchApiGet<PublicChurchGospelPage | null>(`/api/church/gospel/${slug}`, null, previewToken, locale),
  churchGospelList: async (locale?: SiteLocale) => churchApiGet<ChurchGospelDto[]>('/api/church/gospel', [], undefined, locale),
  churchSitemap: async () => churchApiGet<PublicChurchSitemapItem[]>('/api/church/sitemap', []),
  churchInfo: async () => churchApiGet<ChurchInfoDto | null>('/api/church/info', null),
  gospelToday: async (locale?: SiteLocale) => (await publicApi.content({ locale })).gospel[0] ?? emptyGospelReading(),
  gospelByDate: async (date: string, locale?: SiteLocale) => (await publicApi.content({ locale })).gospel.find((item) => item.date === date) ?? emptyGospelReading(date),
  seoPage: async (slug: string, locale?: SiteLocale) => (await publicApi.content({ locale })).pages.find((item) => item.slug === slug) || null,
  qrPage: async (qrId: string, locale?: SiteLocale) => (await publicApi.content({ locale })).qrPages.find((item) => item.qrId === qrId) || null,
  scanQr: (qrId: string) => apiSend(`/api/qr/${qrId}/scan`, 'POST', undefined, { ok: false }),
  churches: async (locale?: SiteLocale) => (await publicApi.content({ locale })).churches
};

export const adminApi = {
  dashboard: () => apiGet<Dashboard>('/api/admin/dashboard', emptyDashboard),
  icons: () => apiGet<Icon[]>('/api/admin/icons', []),
  createIcon: (payload: Partial<Icon>) => apiSend('/api/admin/icons', 'POST', payload, normalizeIcon(payload, 0)),
  updateIcon: (id: string, payload: Partial<Icon>) => apiSend(`/api/admin/icons/${id}`, 'PUT', payload, normalizeIcon({ ...payload, id }, 0)),
  deleteIcon: (id: string) => apiSend(`/api/admin/icons/${id}`, 'DELETE', undefined, { ok: false }),
  saints: () => apiGet<Saint[]>('/api/admin/saints', []),
  prayers: () => apiGet<Prayer[]>('/api/admin/prayers', []),
  gospel: () => apiGet<GospelReading[]>('/api/admin/gospel', []),
  pages: () => apiGet<SeoPage[]>('/api/admin/pages', []),
  qrPages: () => apiGet<QrPage[]>('/api/admin/qr-pages', []),
  churches: () => apiGet<Church[]>('/api/admin/churches', []),
  seoOverview: () => apiGet('/api/admin/seo/overview', emptyDashboard.seo)
};
