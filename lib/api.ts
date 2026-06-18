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
    relatedSaint: normalizeString(item.relatedSaint),
    relatedIcon: normalizeString(item.relatedIcon),
    audioUrl: normalizeString(item.audioUrl),
    seoTitle: normalizeString(item.seoTitle) || title,
    seoDescription: normalizeString(item.seoDescription) || normalizeString(item.text).slice(0, 160),
    status: normalizeStatus(item.status)
  };
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

  return {
    icons: hasIcons ? normalizedIcons : icons,
    prayers: hasPrayers ? normalizedPrayers : prayers,
    gospel: hasGospel ? source.gospel as GospelReading[] : [gospelToday],
    saints: hasSaints ? source.saints as Saint[] : saints,
    pages: hasPages ? source.pages!.map((item) => ({
      ...item,
      blocks: normalizeStringArray(item.blocks),
      faq: Array.isArray(item.faq) ? item.faq : []
    })) as SeoPage[] : seoPages,
    qrPages: hasQrPages ? source.qrPages as QrPage[] : qrPages,
    churches: hasChurches ? source.churches as Church[] : churches,
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
  content: async () => normalizeSiteContent(await apiGet<SiteContent>('/api/content', { icons, prayers, gospel: [gospelToday], saints, pages: seoPages, qrPages, churches, dashboard })),
  icons: async () => (await publicApi.content()).icons,
  icon: async (slug: string) => (await publicApi.icons()).find((item) => item.slug === slug) || null,
  saints: async () => (await publicApi.content()).saints,
  saint: async (slug: string) => (await publicApi.saints()).find((item) => item.slug === slug) || null,
  prayers: async () => (await publicApi.content()).prayers,
  prayer: async (slug: string) => (await publicApi.prayers()).find((item) => item.slug === slug) || null,
  gospelToday: () => apiGet<GospelReading>('/api/gospel/today', gospelToday),
  gospelByDate: (date: string) => apiGet<GospelReading>(`/api/gospel/${date}`, { ...gospelToday, date }),
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
