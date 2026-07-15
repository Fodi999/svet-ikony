export type Status = 'draft' | 'published';
export type SiteLocale = 'uk' | 'ru' | 'en';

export type IconTranslation = {
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  category?: string;
  saintName?: string;
  prayerText?: string;
  gospelText?: string;
  lifeText?: string;
  historyText?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
};

export type Icon = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  imageUrl: string;
  imageUrls?: string[];
  qrCodeUrl: string;
  category: string;
  saintName: string;
  prayerText: string;
  gospelText: string;
  lifeText: string;
  historyText: string;
  audioUrl?: string;
  status: Status;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  canonicalUrl?: string;
  calendarDate?: string;
  translations?: Partial<Record<SiteLocale, IconTranslation>>;
  createdAt: string;
  updatedAt: string;
  /** Set when this icon comes from the church_content system, where its page lives at
   * /church/icons/[slug] rather than /icons/[slug]. */
  source?: 'church';
};

export type Saint = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  biography: string;
  feastDay: string;
  imageUrl: string;
  relatedIcons: string[];
  prayers: string[];
  seoTitle?: string;
  seoDescription?: string;
  status: Status;
  updatedAt?: string;
  source?: 'church';
};

export type Prayer = {
  id: string;
  slug: string;
  title: string;
  text: string;
  category: string;
  imageUrl?: string;
  relatedSaint?: string;
  relatedIcon?: string;
  audioUrl?: string;
  qrCodeUrl?: string;
  seoTitle?: string;
  seoDescription?: string;
  status: Status;
  /** Set when this prayer comes from the church_content system, where it has its own
   * slug/page at /church/prayers/[slug] rather than living at /prayers/[iconSlug]. */
  source?: 'church';
};

export type GospelReading = {
  id: string;
  date: string;
  title: string;
  reference: string;
  text: string;
  explanation: string;
  seoTitle?: string;
  seoDescription?: string;
  status: Status;
};

export type SeoPage = {
  id: string;
  slug: string;
  title: string;
  h1: string;
  content: string;
  pageType: string;
  targetKeyword: string;
  city?: string;
  language: string;
  imageUrl?: string;
  blocks: string[];
  faq: Array<{ question: string; answer: string }>;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  canonicalUrl?: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
};

export type QrPage = {
  id: string;
  qrId: string;
  iconId: string;
  slug: string;
  title: string;
  ownerName?: string;
  location?: string;
  customPrayer?: string;
  active: boolean;
  scanCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Church = {
  id: string;
  slug: string;
  title: string;
  city: string;
  address: string;
  description: string;
  schedule: string;
  donationUrl?: string;
  mapsUrl?: string;
  phoneOrSite?: string;
  dedication?: string;
  shrines?: string;
  priest?: string;
  priestPhone?: string;
  imageUrl?: string;
  relatedIcons: string[];
  seoTitle?: string;
  seoDescription?: string;
  status: Status;
};

export type CalendarDayKind = 'feast' | 'fast' | 'gospel' | 'prayer' | 'quiet';

export type CalendarHero = {
  year: string;
  title: string;
  monthTitle: string;
  prevLabel: string;
  prevHref: string;
  nextLabel: string;
  nextHref: string;
  featureTitle: string;
  featureNote: string;
  featureDate: string;
  featureHref: string;
  iconDayTitle: string;
  iconDayIconSlug: string;
  iconDayDate: string;
  iconDayPrayerSlug: string;
  infoPrimary: string;
  infoSecondary: string;
  todayDate: string;
  todayGospel: string;
  todayPrayerTitle: string;
  todayHref: string;
};

export type CalendarDay = {
  id: string;
  day: string;
  gregorianDate?: string;
  julianDay?: string;
  julianDate?: string;
  label: string;
  note: string;
  kind: CalendarDayKind;
  imageUrl: string;
  iconSlug: string;
  prayerSlug: string;
  gospelSlug: string;
  detailHref: string;
  current: boolean;
  feast: boolean;
  textOnly: boolean;
  description: string;
};

export type CalendarServiceCard = {
  id: string;
  index: string;
  title: string;
  description: string;
  href: string;
};

export type CalendarContent = {
  hero: CalendarHero;
  days: CalendarDay[];
  services: CalendarServiceCard[];
};

export type SiteContent = {
  icons: Icon[];
  prayers: Prayer[];
  gospel: GospelReading[];
  saints: Saint[];
  pages: SeoPage[];
  qrPages: QrPage[];
  churches: Church[];
  calendar?: CalendarContent;
  dashboard: Dashboard;
};

export type Dashboard = {
  publishedPages: number;
  icons: number;
  prayers: number;
  qrPages: number;
  qrScans: number;
  latestPages: Array<{ title: string; type: string; status: Status }>;
  seo: Array<{ label: string; value: string }>;
};

export type ChurchContentStatus = 'draft' | 'published' | 'archived';

export type ChurchCalendarDayDto = {
  id: string;
  siteId: string;
  dateOldStyle?: string | null;
  dateNewStyle?: string | null;
  calendarType: string;
  title: string;
  dayType: string;
  description: string;
  rank: number;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchIconDto = {
  id: string;
  siteId: string;
  calendarDayId?: string | null;
  title: string;
  slug: string;
  imageUrl: string;
  saintName: string;
  feastName: string;
  description: string;
  language: SiteLocale;
  translationGroupId: string;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchPrayerDto = {
  id: string;
  siteId: string;
  iconId?: string | null;
  calendarDayId?: string | null;
  slug: string;
  title: string;
  text: string;
  audioUrl: string;
  qrCodeUrl: string;
  imageUrl: string;
  source: string;
  sourceUrl: string;
  note: string;
  language: SiteLocale;
  prayerType: string;
  translationGroupId: string;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchSaintDto = {
  id: string;
  siteId: string;
  iconId?: string | null;
  calendarDayId?: string | null;
  slug: string;
  name: string;
  shortDescription: string;
  biography: string;
  feastDay: string;
  imageUrl: string;
  language: SiteLocale;
  translationGroupId: string;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchTranslationRef = {
  language: SiteLocale;
  slug: string;
  title: string;
};

export type ChurchAlphabetLetterDto = {
  id: string;
  siteId: string;
  slug: string;
  letter: string;
  sortOrder: number;
  name: string;
  shortDescription: string;
  fullText: string;
  numericValue?: number | null;
  modernEquivalent: string;
  color: string;
  cardImageUrl: string;
  mainImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  language: SiteLocale;
  translationGroupId: string;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchArticleDto = {
  id: string;
  siteId: string;
  iconId?: string | null;
  calendarDayId?: string | null;
  title: string;
  slug: string;
  content: string;
  language: SiteLocale;
  seoTitle: string;
  seoDescription: string;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChurchInfoTranslation = {
  title: string;
  description: string;
  schedule: string;
  dedication: string;
  shrines: string;
  priest: string;
};

export type ChurchInfoDto = {
  id: string;
  siteId: string;
  address: string;
  mapsUrl: string;
  phoneOrSite: string;
  priestPhone: string;
  imageUrl: string;
  galleryImages: string[];
  translations: Partial<Record<SiteLocale, ChurchInfoTranslation>>;
  status: ChurchContentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ChurchGospelDto = {
  id: string;
  siteId: string;
  iconId?: string | null;
  calendarDayId?: string | null;
  slug: string;
  title: string;
  reference: string;
  text: string;
  explanation: string;
  language: SiteLocale;
  status: ChurchContentStatus;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicChurchContentPage = {
  calendarDay: ChurchCalendarDayDto;
  icons: ChurchIconDto[];
  prayers: ChurchPrayerDto[];
  articles: ChurchArticleDto[];
  gospel: ChurchGospelDto[];
};

/** `icon` is null when the translation group exists but has no published
 * record in the requested language; `translations` lists what is available. */
export type PublicChurchIconPage = {
  icon: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
  prayers: ChurchPrayerDto[];
  articles: ChurchArticleDto[];
  gospel: ChurchGospelDto[];
  translations: ChurchTranslationRef[];
};

/** `prayer` is null when the translation group exists but has no published
 * record in the requested language; `translations` lists what is available. */
export type PublicChurchPrayerPage = {
  prayer: ChurchPrayerDto | null;
  icon?: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
  translations: ChurchTranslationRef[];
};

/** `saint` is null when the translation group exists but has no published
 * record in the requested language; `translations` lists what is available. */
export type PublicChurchSaintPage = {
  saint: ChurchSaintDto | null;
  icon?: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
  prayers: ChurchPrayerDto[];
  translations: ChurchTranslationRef[];
};

/** `letter` is null when the translation group exists but has no published
 * record in the requested language; `translations` lists what is available. */
export type PublicChurchAlphabetPage = {
  letter: ChurchAlphabetLetterDto | null;
  translations: ChurchTranslationRef[];
};

export type PublicChurchArticlePage = {
  article: ChurchArticleDto;
  icon?: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
};

export type PublicChurchGospelPage = {
  gospel: ChurchGospelDto;
  icon?: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
};

export type PublicChurchSitemapItem = {
  kind: 'calendar' | 'icon' | 'prayer' | 'article' | 'gospel' | 'saint';
  slug: string;
  date?: string | null;
  updatedAt: string;
};
