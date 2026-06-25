
'use client';

import Link from 'next/link';
import { IconPhotoCatalog, type IconPhotoCatalogItem } from './IconPhotoCatalog';
import { IconCard } from './IconCard';
import { AssetButton, DownloadIcon } from './AssetButton';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';
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
    prayerCategory: 'Молитва',
    downloadQr: 'Скачать QR'
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
    prayerCategory: 'Молитва',
    downloadQr: 'Завантажити QR'
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
    prayerCategory: 'Prayer',
    downloadQr: 'Download QR'
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

function downloadFileName(title: string, image: string, prefix = 'qr') {
  const baseName = title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'prayer';
  const extension = image.split('?')[0]?.split('.').pop()?.toLowerCase();
  const safeExtension = extension && extension.length <= 5 ? extension : 'jpg';
  return `${prefix}-${baseName}.${safeExtension}`;
}

function isPublicStorySection(label: string) {
  return !/(alt|prompt|source|источник|джерело|generation|генерац|не писать|do not write)/i.test(label);
}

function excerptParagraphs(value: string, maxParagraphs = 2, maxChars = 520) {
  const paragraphs = paragraphsFromText(value);
  const excerpts: string[] = [];
  let used = 0;

  for (const paragraph of paragraphs) {
    if (excerpts.length >= maxParagraphs || used >= maxChars) break;
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    const text = paragraph.length > remaining ? `${paragraph.slice(0, Math.max(0, remaining - 1)).trim()}…` : paragraph;
    excerpts.push(text);
    used += text.length;
  }

  return excerpts;
}

function storySectionsFromText(text: string | undefined, locale: keyof typeof uiText) {
  const structured = sectionsFromText(text)
    .filter((section) => isPublicStorySection(section.label))
    .map((section) => ({
      title: translateSectionLabel(section.label, locale),
      paragraphs: excerptParagraphs(section.value)
    }))
    .filter((section) => section.paragraphs.length);

  if (structured.length) return structured.slice(0, 5);

  return paragraphsFromText(text).slice(0, 4).map((paragraph, index) => ({
    title: index === 0 ? ui(locale, 'explanation') : `${ui(locale, 'explanation')} ${index + 1}`,
    paragraphs: excerptParagraphs(paragraph, 1, 420)
  }));
}

function IconStory({ text, images }: { text?: string; images: string[] }) {
  const { locale } = useI18n();
  const sections = storySectionsFromText(text, locale);
  if (!sections.length) return null;

  return (
    <section className="icon-story-flow">
      {sections.map((section, index) => {
        const image = images[index % images.length];
        return (
          <article className="icon-story-block" key={`${section.title}-${image || section.paragraphs.join('|').slice(0, 64)}`}>
            {image ? <figure><StableImage src={image} alt={section.title} width={800} height={1000} /></figure> : null}
            <div>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => <p key={`${section.title}-${paragraphIndex}`}>{paragraph}</p>)}
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function LocalizedIconGrid({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  return <div className="icon-grid">{icons.map((icon) => <IconCard key={icon.id} icon={localizeIcon(icon, locale)} />)}</div>;
}

export function LocalizedPrayersList({ icons }: { icons: Icon[] }) {
  const { locale } = useI18n();
  const localeHref = useLocaleHref();
  const items = icons.map((icon) => localizeIcon(icon, locale)).filter((icon) => icon.prayerText.trim());
  return (
    <div className="list-grid">
      {items.map((icon) => {
        const title = prayerTitle(icon.title, locale);
        const image = imageForPrayer(icon);
        return (
          <article className="prayer-list-card" key={icon.id}>
            <Link className="prayer-list-media" href={localeHref(`/prayers/${icon.slug}`)}>
              <StableImage src={image} alt={title} width={720} height={720} />
            </Link>
            <div className="prayer-list-copy">
              <span>{icon.category || ui(locale, 'prayerCategory')}</span>
              <Link href={localeHref(`/prayers/${icon.slug}`)}><strong>{title}</strong></Link>
              <p>{textPreview(icon.prayerText, 190)}</p>
              <div className="prayer-card-actions">
                <AssetButton href={`/prayers/${icon.slug}`}>{ui(locale, 'readPrayer')}</AssetButton>
                <AssetButton variant="dark" icon={<DownloadIcon />} href={image} download={downloadFileName(title, image)}>
                  {ui(locale, 'downloadQr')}
                </AssetButton>
              </div>
            </div>
          </article>
        );
      })}
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
          <figure className="prayer-panel-image"><StableImage src={imageForPrayer(item)} alt={item.title} width={720} height={720} /></figure>
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
  const localeHref = useLocaleHref();
  const items = icons.map((icon) => localizeIcon(icon, locale)).filter((icon) => icon.saintName.trim() || icon.lifeText.trim());
  return <div className="list-grid">{items.map((icon) => <Link key={icon.id} href={localeHref(`/saints/${icon.slug}`)}><span>{icon.calendarDate || icon.category}</span><strong>{icon.saintName || icon.title}</strong><p>{textPreview(icon.lifeText || icon.shortDescription || icon.fullDescription, 180)}</p></Link>)}</div>;
}

export function LocalizedSaintDetail({ icon }: { icon: Icon }) {
  const { locale } = useI18n();
  const item = localizeIcon(icon, locale);
  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame"><StableImage src={item.imageUrl} alt={item.saintName || item.title} width={800} height={1000} loading="eager" /></figure>
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
            {church.imageUrl ? <figure className="church-directory-media"><StableImage src={church.imageUrl} alt={church.title} width={720} height={640} /></figure> : null}
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
                {church.mapsUrl ? <AssetButton variant="dark" href={church.mapsUrl} target="_blank" rel="noreferrer">Google Maps</AssetButton> : null}
                {church.relatedIcons?.[0] ? <AssetButton href={`/icons/${church.relatedIcons[0]}`}>{ui(locale, 'iconPage')}</AssetButton> : null}
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
  const localeHref = useLocaleHref();
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
  const iconPageUrl = absoluteSiteUrl(localeHref(`/icons/${item.slug}`));

  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame"><StableImage src={item.imageUrl} alt={iconTitle} width={800} height={1000} loading="eager" /></figure>
        <div className="sacred-hero-copy">
          <p className="eyebrow">{item.category}</p>
          <h1>{iconTitle}</h1>
          <p className="detail-lead">{item.shortDescription || textPreview(item.fullDescription, 220)}</p>
          <div className="sacred-meta">{item.saintName ? <span>{item.saintName}</span> : null}<span>{item.status === 'published' ? ui(locale, 'published') : ui(locale, 'draft')}</span></div>
          <div className="detail-actions"><AssetButton variant="dark" href="#prayer">{ui(locale, 'readPrayer')}</AssetButton><AssetButton href="/churches">{ui(locale, 'forChurches')}</AssetButton></div>
        </div>
      </section>
      <IconStory text={item.fullDescription} images={photoImages.length ? photoImages : [item.imageUrl]} />
      {publicGalleryImages.length > 1 ? <section className="icon-photo-catalog"><div className="section-head"><p className="eyebrow">{ui(locale, 'photoQr')}</p><h2>{ui(locale, 'imageCatalog')}</h2></div><IconPhotoCatalog title={iconTitle} iconUrl={iconPageUrl} items={publicGalleryImages} /></section> : null}
      <section className="sacred-content-grid">
        <article id="prayer" className="sacred-panel prayer-panel"><div className="prayer-panel-layout"><figure className="prayer-panel-image"><StableImage src={prayerImage} alt={`${ui(locale, 'prayer')}: ${iconTitle}`} width={720} height={720} /></figure><div className="prayer-panel-copy"><span>01</span><h2>{ui(locale, 'prayer')}</h2><div className="reader-text"><DisplayText text={item.prayerText} /></div>{item.audioUrl ? <audio controls src={item.audioUrl} /> : null}</div></div></article>
        <article className="sacred-panel"><span>02</span><h2>{ui(locale, 'gospel')}</h2><div className="reader-text"><DisplayText text={item.gospelText} /></div></article>
        <article className="sacred-panel"><span>03</span><h2>{ui(locale, 'life')}</h2><div className="reader-text"><DisplayText text={item.lifeText} /></div></article>
        <article className="sacred-panel"><span>04</span><h2>{ui(locale, 'iconHistory')}</h2><div className="reader-text"><DisplayText text={item.historyText} /></div></article>
      </section>
      {relatedItems.length ? <section className="related-section"><div className="section-head"><p className="eyebrow">{ui(locale, 'similarIcons')}</p><h2>{ui(locale, 'furtherReading')}</h2></div><div className="mini-grid">{relatedItems.map((entry) => <Link key={entry.id} href={localeHref(`/icons/${entry.slug}`)}>{displayText(entry.title)}<small>{entry.category}</small></Link>)}</div></section> : null}
    </main>
  );
}
