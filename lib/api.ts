import { churches, dashboard, gospelToday, icons, prayers, qrPages, saints, seoPages } from './fallbackData';
import type { Church, Dashboard, GospelReading, Icon, Prayer, QrPage, Saint, SeoPage, SiteContent } from './types';

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://ministerial-yetta-fodi999-c58d8823.koyeb.app').replace(/\/+$/, '');
const publicPrefix = apiUrl.endsWith('/public') ? '' : '/public';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : [];
}

function normalizeStatus(value: unknown) {
  return value === 'draft' ? 'draft' : 'published';
}

function published<T extends { status?: string }>(items: T[]) {
  return items.filter((item) => item.status === 'published');
}

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
  return icon.imageUrls?.[0] || icon.imageUrl;
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
    imageUrl: normalizeString(item.imageUrl) || '/images/kazan-icon.svg',
    imageUrls: normalizeStringArray(item.imageUrls),
    qrCodeUrl: normalizeString(item.qrCodeUrl) || '/images/qr-code.svg',
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
    seoTitle: normalizeString(item.seoTitle) || title,
    seoDescription: normalizeString(item.seoDescription) || normalizeString(item.text).slice(0, 160),
    status: normalizeStatus(item.status)
  };
}

function prayersFromIcons(items: Icon[]): Prayer[] {
  return items
    .filter((icon) => icon.prayerText.trim())
    .map((icon) => ({
      id: `prayer-${icon.slug}`,
      slug: icon.slug,
      title: icon.title.toLowerCase().includes('молит') ? icon.title : `Молитва: ${icon.title}`,
      text: icon.prayerText,
      category: icon.category || 'Молитвы перед иконой',
      imageUrl: prayerImageFromIcon(icon),
      relatedIcon: icon.slug,
      audioUrl: '',
      seoTitle: `Молитва перед ${icon.title}`,
      seoDescription: compactText(icon.prayerText, 180),
      status: 'published'
    }));
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
      prayers: icon.prayerText.trim() ? [icon.slug] : [],
      seoTitle: `${icon.saintName || icon.title}: житие и день памяти`,
      seoDescription: compactText(icon.lifeText || icon.shortDescription || icon.fullDescription, 180),
      status: 'published'
    }));
}

function gospelFromIcons(items: Icon[]): GospelReading[] {
  const icon = items.find((item) => item.gospelText.trim());
  if (!icon) return [];
  return [{
    id: `gospel-${icon.slug}`,
    date: new Date().toISOString().slice(0, 10),
    title: 'Евангелие дня',
    reference: 'Чтение дня',
    text: icon.gospelText,
    explanation: icon.shortDescription || 'Чтение дня помогает соединить молитву перед образом с внимательным словом Евангелия.',
    seoTitle: 'Евангелие дня',
    seoDescription: compactText(icon.gospelText, 180),
    status: 'published'
  }];
}

function churchesFromIcons(items: Icon[]): Church[] {
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
  const normalizedIcons = hasIcons ? source.icons!.map(normalizeIcon).filter((item) => item.slug && item.title) : icons;
  const normalizedPrayers = hasPrayers ? source.prayers!.map(normalizePrayer).filter((item) => item.slug && item.title) : prayers;
  const publicIcons = hasIcons ? published(normalizedIcons) : icons;
  const normalizedPublicPrayers = hasPrayers ? published(normalizedPrayers).map((prayer) => {
    const icon = publicIcons.find((item) => item.slug === prayer.relatedIcon || item.slug === prayer.slug);
    return icon && !prayer.imageUrl ? { ...prayer, imageUrl: prayerImageFromIcon(icon), relatedIcon: prayer.relatedIcon || icon.slug } : prayer;
  }) : prayers;
  const normalizedGospel = hasGospel ? (source.gospel as GospelReading[]).filter((item) => item.status === 'published') : [gospelToday];
  const normalizedSaints = hasSaints ? (source.saints as Saint[]).filter((item) => item.status === 'published') : saints;
  const normalizedPages = hasPages ? (source.pages!.map((item) => ({
    ...item,
    blocks: normalizeStringArray(item.blocks),
    faq: Array.isArray(item.faq) ? item.faq : []
  })) as SeoPage[]).filter((item) => item.status === 'published') : seoPages;
  const normalizedQrPages = hasQrPages ? (source.qrPages as QrPage[]).filter((item) => item.active) : qrPages;
  const normalizedChurches = hasChurches ? (source.churches as Church[]).filter((item) => item.status === 'published') : churches;

  return {
    icons: publicIcons,
    prayers: hasPrayers ? mergeBySlug(normalizedPublicPrayers, prayersFromIcons(publicIcons)) : prayers,
    gospel: normalizedGospel.length ? normalizedGospel : (gospelFromIcons(publicIcons)[0] ? gospelFromIcons(publicIcons) : [gospelToday]),
    saints: mergeBySlug(normalizedSaints, saintsFromIcons(publicIcons)),
    pages: normalizedPages,
    qrPages: normalizedQrPages,
    churches: mergeBySlug(normalizedChurches, churchesFromIcons(publicIcons)),
    calendar: source.calendar,
    dashboard: source.dashboard || dashboard
  };
}

async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiUrl}${publicPrefix}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

async function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown, fallback?: T): Promise<T> {
  if (!apiUrl) return fallback as T;
  try {
    const response = await fetch(`${apiUrl}${publicPrefix}${path}`, {
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
  content: async (params?: { year?: string | number; month?: string | number }) => {
    const query = new URLSearchParams();
    if (params?.year) query.set('year', String(params.year));
    if (params?.month) query.set('month', String(params.month));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return normalizeSiteContent(await apiGet<SiteContent>(`/api/content${suffix}`, { icons, prayers, gospel: [gospelToday], saints, pages: seoPages, qrPages, churches, dashboard }));
  },
  icons: async () => (await publicApi.content()).icons,
  icon: async (slug: string) => (await publicApi.icons()).find((item) => item.slug === slug) || null,
  saints: async () => (await publicApi.content()).saints,
  saint: async (slug: string) => (await publicApi.saints()).find((item) => item.slug === slug) || null,
  prayers: async () => (await publicApi.content()).prayers,
  prayer: async (slug: string) => (await publicApi.prayers()).find((item) => item.slug === slug) || null,
  gospelToday: async () => (await publicApi.content()).gospel[0] ?? gospelToday,
  gospelByDate: async (date: string) => (await publicApi.content()).gospel.find((item) => item.date === date) ?? { ...gospelToday, date },
  seoPage: async (slug: string) => (await publicApi.content()).pages.find((item) => item.slug === slug) || null,
  qrPage: async (qrId: string) => (await publicApi.content()).qrPages.find((item) => item.qrId === qrId) || null,
  scanQr: (qrId: string) => apiSend(`/api/qr/${qrId}/scan`, 'POST', undefined, { ok: true }),
  churches: async () => (await publicApi.content()).churches
};

export const adminApi = {
  dashboard: () => apiGet<Dashboard>('/api/admin/dashboard', dashboard),
  icons: () => apiGet<Icon[]>('/api/admin/icons', icons),
  createIcon: (payload: Partial<Icon>) => apiSend('/api/admin/icons', 'POST', payload, { ...icons[0], ...payload }),
  updateIcon: (id: string, payload: Partial<Icon>) => apiSend(`/api/admin/icons/${id}`, 'PUT', payload, { ...icons[0], ...payload, id }),
  deleteIcon: (id: string) => apiSend(`/api/admin/icons/${id}`, 'DELETE', undefined, { ok: true }),
  saints: () => apiGet<Saint[]>('/api/admin/saints', saints),
  prayers: () => apiGet<Prayer[]>('/api/admin/prayers', prayers),
  gospel: () => apiGet<GospelReading[]>('/api/admin/gospel', [gospelToday]),
  pages: () => apiGet<SeoPage[]>('/api/admin/pages', seoPages),
  qrPages: () => apiGet<QrPage[]>('/api/admin/qr-pages', qrPages),
  churches: () => apiGet<Church[]>('/api/admin/churches', churches),
  seoOverview: () => apiGet('/api/admin/seo/overview', dashboard.seo)
};
