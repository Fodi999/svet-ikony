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
  seoTitle?: string;
  seoDescription?: string;
  status: Status;
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
