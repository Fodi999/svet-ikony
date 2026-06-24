
'use client';

import Link from 'next/link';
import { IconPhotoCatalog, type IconPhotoCatalogItem } from './IconPhotoCatalog';
import { IconCard } from './IconCard';
import { useI18n } from './LanguageProvider';
import { absoluteSiteUrl } from '@/lib/site';
import type { Church, Icon } from '@/lib/types';
import { churchFromIcon, hasChurchFields, imageForPrayer, localizeIcon, paragraphsFromText, sectionsFromText, textPreview, translateSectionLabel } from '@/lib/iconContent';


const uiText = {
  ru: {
    prayer: 'Молитва',
    gospel: 'Евангелие',
    gospelDay: 'Евангелие дня',
    life: 'Житие',
    iconHistory: 'История образа',
    explanation: 'Объяснение',
    published: 'Опубликовано',
    draft: 'Черновик',
    readPrayer: 'Читать молитву',
    forChurches: 'Для храмов',
    photoQr: 'Фото и QR',
    imageCatalog: 'Каталог изображений',
    originalIcon: 'Оригинал иконы',
    prayerPhoto: 'Фото молитвы',
    qrCode: 'QR-код',
    photo: 'Фото',
    similarIcons: 'Похожие иконы',
    furtherReading: 'Для дальнейшего чтения',
    dedicatedTo: 'Кому посвящён',
    address: 'Адрес',
    schedule: 'Расписание',
    phoneSite: 'Телефон / сайт',
    shrines: 'Святыни',
    iconPage: 'Страница иконы',
    prayerCategory: 'Молитва'
  },
  uk: {
    prayer: 'Молитва',
    gospel: 'Євангеліє',
    gospelDay: 'Євангеліє дня',
    life: 'Житіє',
    iconHistory: 'Історія образу',
    explanation: 'Пояснення',
    published: 'Опубліковано',
    draft: 'Чернетка',
    readPrayer: 'Читати молитву',
    forChurches: 'Для храмів',
    photoQr: 'Фото і QR',
    imageCatalog: 'Каталог зображень',
    originalIcon: 'Оригінал ікони',
    prayerPhoto: 'Фото молитви',
    qrCode: 'QR-код',
    photo: 'Фото',
    similarIcons: 'Схожі ікони',
    furtherReading: 'Для подальшого читання',
    dedicatedTo: 'Кому присвячений',
    address: 'Адреса',
    schedule: 'Розклад',
    phoneSite: 'Телефон / сайт',
    shrines: 'Святині',
    iconPage: 'Сторінка ікони',
    prayerCategory: 'Молитва'
  },
  en: {
    prayer: 'Prayer',
    gospel: 'Gospel',
    gospelDay: 'Gospel of the day',
    life: 'Life',
    iconHistory: 'History of the icon',
    explanation: 'Explanation',
    published: 'Published',
    draft: 'Draft',
    readPrayer: 'Read prayer',
    forChurches: 'For churches',
    photoQr: 'Photos and QR',
    imageCatalog: 'Image catalog',
    originalIcon: 'Original icon',
    prayerPhoto: 'Prayer image',
    qrCode: 'QR code',
    photo: 'Photo',
    similarIcons: 'Similar icons',
    furtherReading: 'For further reading',
    dedicatedTo: 'Dedicated to',
    address: 'Address',
    schedule: 'Schedule',
    phoneSite: 'Phone / website',
    shrines: 'Shrines',
    iconPage: 'Icon page',
    prayerCategory: 'Prayer'
  }
} as const;

function ui(locale: keyof typeof uiText, key: keyof typeof uiText.ru) {
  return uiText[locale][key];
}

function prayerTitle(title: string, locale: keyof typeof uiText) {
  const lower = title.toLowerCase();
  const alreadyPrayer = lower.includes('молит') || lower.includes('prayer') || lower.includes('молитв');
  return alreadyPrayer ? title : `${ui(locale, 'prayer')}: ${title}`;
}

function DisplayText({ text }: { text?: string }) {
  const { locale } = useI18n();
  const sections = sectionsFromText(text);
  if (sections.length) {
    return <div className="structured-blocks">{sections.map((section, sectionIndex) => <section key={`${section.label}-${sectionIndex}`} className="structured-block"><h3>{translateSectionLabel(section.label, locale)}</h3>{paragraphsFromText(section.value).map((part, partIndex) => <p key={`${section.label}-${partIndex}`}>{part}</p>)}</section>)}</div>;
  }
  return <>{paragraphsFromText(text).map((part, partIndex) => <p key={`${part.slice(0, 32)}-${partIndex}`}>{part}</p>)}</>;
}

function uniqueImages(images: Array<string | undefined | null>) {
  return Array.from(new Set(images.map((url) => (url || '').trim()).filter(Boolean)));
}

function isQrImage(url: string) {
  return url.toLowerCase().includes('qr');
}

function displayText(value?: string) {
  return (value || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function LocalizedIconGrid({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  return <div className="icon-grid">{icons.map((icon) => <IconCard key={icon.id} icon={localizeIcon(icon, locale)} />)}</div>;
}

export function LocalizedPrayersList({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  const items = icons.map((icon) => localizeIcon(icon, locale)).filter((icon) => icon.prayerText.trim());
  return (
    <div className="list-grid">
      {items.map((icon) => (
        <Link className="prayer-list-card" key={icon.id} href={`/prayers/${icon.slug}`}>
          <img src={imageForPrayer(icon)} alt={icon.title} />
          <span>{icon.category || ui(locale, 'prayerCategory')}</span>
          <strong>{prayerTitle(icon.title, locale)}</strong>
          <p>{textPreview(icon.prayerText, 220)}</p>
        </Link>
      ))}
    </div>
  );
}

export function LocalizedPrayerDetail({ icon }: { icon: Icon }) {
  const { locale } = useI18n();
  const item = localizeIcon(icon, locale);
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{item.category}</p>
        <h1>{prayerTitle(item.title, locale)}</h1>
        <p>{item.shortDescription}</p>
      </section>
      <article className="sacred-panel prayer-panel prayer-reader-panel">
        <div className="prayer-panel-layout">
          <figure className="prayer-panel-image"><img src={imageForPrayer(item)} alt={item.title} /></figure>
          <div className="prayer-panel-copy">
            <span>{ui(locale, 'prayer')}</span>
            <div className="reader-text prayer-reader"><DisplayText text={item.prayerText} /></div>
            {item.audioUrl ? <audio controls src={item.audioUrl} /> : null}
          </div>
        </div>
      </article>
    </main>
  );
}

export function LocalizedSaintsList({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  const items = icons.map((icon) => localizeIcon(icon, locale)).filter((icon) => icon.saintName.trim() || icon.lifeText.trim());
  return <div className="list-grid">{items.map((icon) => <Link key={icon.id} href={`/saints/${icon.slug}`}><span>{icon.calendarDate || icon.category}</span><strong>{icon.saintName || icon.title}</strong><p>{textPreview(icon.lifeText || icon.shortDescription || icon.fullDescription, 180)}</p></Link>)}</div>;
}

export function LocalizedSaintDetail({ icon }: { icon: Icon }) {
  const { locale } = useI18n();
  const item = localizeIcon(icon, locale);
  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame"><img src={item.imageUrl} alt={item.saintName || item.title} /></figure>
        <div className="sacred-hero-copy">
          <p className="eyebrow">{item.calendarDate || item.category}</p>
          <h1>{item.saintName || item.title}</h1>
          <p className="detail-lead">{item.shortDescription}</p>
          <div className="soft-note reader-text"><DisplayText text={item.lifeText || item.fullDescription} /></div>
        </div>
      </section>
    </main>
  );
}

export function LocalizedGospelPage({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  const item = icons.map((icon) => localizeIcon(icon, locale)).find((icon) => icon.gospelText.trim()) || localizeIcon(icons[0], locale);
  const sections = sectionsFromText(item?.gospelText);
  const reference = sections.find((section) => /чтение|reading|зачало|reference|євангел/i.test(section.label))?.label || ui(locale, 'gospelDay');
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{item?.calendarDate || ''}</p>
        <h1>{ui(locale, 'gospelDay')}</h1>
        <p>{reference}</p>
      </section>
      <article className="sacred-panel prayer-panel"><span>{ui(locale, 'gospelDay')}</span><div className="reader-text"><DisplayText text={item?.gospelText} /></div></article>
      {item?.shortDescription ? <article className="sacred-panel"><span>{ui(locale, 'explanation')}</span><div className="reader-text"><p>{item.shortDescription}</p></div></article> : null}
    </main>
  );
}

export function LocalizedChurchesPage({ icons, fallbackChurches }: { icons: Icon[]; fallbackChurches: Church[] }) {
  const { locale, t } = useI18n();
  const fromIcons = icons.map((icon) => churchFromIcon(localizeIcon(icon, locale))).filter(hasChurchFields);
  const items = fromIcons.length ? fromIcons : fallbackChurches;
  return (
    <main className="page">
      <section className="page-hero"><p className="eyebrow">{t('churchesPageEyebrow')}</p><h1>{t('churchesPageTitle')}</h1><p>{t('churchesPageLead')}</p></section>
      <div className="church-directory">
        {items.map((church) => (
          <article className="church-directory-card" key={church.id}>
            {church.imageUrl ? <img src={church.imageUrl} alt={church.title} /> : null}
            <div className="church-directory-copy">
              <span>{church.city}</span>
              <h2>{church.title}</h2>
              {church.dedication ? <p className="church-dedication">{ui(locale, 'dedicatedTo')}: {church.dedication}</p> : null}
              <p>{church.description}</p>
              <dl className="church-facts">
                {church.address ? <><dt>{ui(locale, 'address')}</dt><dd>{church.address}</dd></> : null}
                {church.schedule ? <><dt>{ui(locale, 'schedule')}</dt><dd>{church.schedule}</dd></> : null}
                {church.phoneOrSite ? <><dt>{ui(locale, 'phoneSite')}</dt><dd>{church.phoneOrSite}</dd></> : null}
                {church.shrines ? <><dt>{ui(locale, 'shrines')}</dt><dd>{church.shrines}</dd></> : null}
              </dl>
              <div className="detail-actions">
                {church.mapsUrl ? <a className="primary-link" href={church.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a> : null}
                {church.relatedIcons?.[0] ? <Link className="secondary-link" href={`/icons/${church.relatedIcons[0]}`}>{ui(locale, 'iconPage')}</Link> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function LocalizedIconDetail({ icon, related }: { icon: Icon; related: Icon[] }) {
  const { locale } = useI18n();
  const item = localizeIcon(icon, locale);
  const relatedItems = related.map((entry) => localizeIcon(entry, locale));
  const galleryImages = uniqueImages([item.imageUrl, ...(item.imageUrls ?? [])]);
  const qrImage = galleryImages.find((image, index) => index > 0 && isQrImage(image)) || galleryImages[2];
  const photoImages = galleryImages.filter((image) => image && image !== qrImage && !isQrImage(image));
  const iconTitle = displayText(item.title);
  const prayerImage = imageForPrayer(item);
  const publicGalleryImages: IconPhotoCatalogItem[] = [
    ...photoImages.map((image, index): IconPhotoCatalogItem => ({
      image,
      label: index === 0 ? ui(locale, 'originalIcon') : index === 1 ? ui(locale, 'prayerPhoto') : `${ui(locale, 'photo')} ${index + 1}`,
      kind: index === 0 ? 'original' : 'product'
    })),
    ...(qrImage ? [{ image: qrImage, label: ui(locale, 'qrCode'), kind: 'qr' } satisfies IconPhotoCatalogItem] : [])
  ];
  const iconPageUrl = absoluteSiteUrl(`/icons/${item.slug}`);

  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame"><img src={item.imageUrl} alt={iconTitle} /></figure>
        <div className="sacred-hero-copy">
          <p className="eyebrow">{item.category}</p>
          <h1>{iconTitle}</h1>
          <p className="detail-lead">{item.shortDescription || textPreview(item.fullDescription, 220)}</p>
          <div className="sacred-meta">{item.saintName ? <span>{item.saintName}</span> : null}<span>{item.status === 'published' ? ui(locale, 'published') : ui(locale, 'draft')}</span></div>
          <div className="soft-note reader-text"><DisplayText text={item.fullDescription} /></div>
          <div className="detail-actions"><Link className="primary-link" href="#prayer">{ui(locale, 'readPrayer')}</Link><Link className="secondary-link" href="/churches">{ui(locale, 'forChurches')}</Link></div>
        </div>
      </section>
      {publicGalleryImages.length > 1 ? <section className="icon-photo-catalog"><div className="section-head"><p className="eyebrow">{ui(locale, 'photoQr')}</p><h2>{ui(locale, 'imageCatalog')}</h2></div><IconPhotoCatalog title={iconTitle} iconUrl={iconPageUrl} items={publicGalleryImages} /></section> : null}
      <section className="sacred-content-grid">
        <article id="prayer" className="sacred-panel prayer-panel"><div className="prayer-panel-layout"><figure className="prayer-panel-image"><img src={prayerImage} alt={`${ui(locale, 'prayer')}: ${iconTitle}`} /></figure><div className="prayer-panel-copy"><span>01</span><h2>{ui(locale, 'prayer')}</h2><div className="reader-text"><DisplayText text={item.prayerText} /></div>{item.audioUrl ? <audio controls src={item.audioUrl} /> : null}</div></div></article>
        <article className="sacred-panel"><span>02</span><h2>{ui(locale, 'gospel')}</h2><div className="reader-text"><DisplayText text={item.gospelText} /></div></article>
        <article className="sacred-panel"><span>03</span><h2>{ui(locale, 'life')}</h2><div className="reader-text"><DisplayText text={item.lifeText} /></div></article>
        <article className="sacred-panel"><span>04</span><h2>{ui(locale, 'iconHistory')}</h2><div className="reader-text"><DisplayText text={item.historyText} /></div></article>
      </section>
      {relatedItems.length ? <section className="related-section"><div className="section-head"><p className="eyebrow">{ui(locale, 'similarIcons')}</p><h2>{ui(locale, 'furtherReading')}</h2></div><div className="mini-grid">{relatedItems.map((entry) => <Link key={entry.id} href={`/icons/${entry.slug}`}>{displayText(entry.title)}<small>{entry.category}</small></Link>)}</div></section> : null}
    </main>
  );
}
