
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Clock3, MapPin, Phone, Sparkles, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconPhotoCatalog, type IconPhotoCatalogItem } from './IconPhotoCatalog';
import { IconCard } from './IconCard';
import { AssetButton, DownloadIcon } from './AssetButton';
import { BrandLogo } from './BrandLogo';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';
import { SvgIcon } from './SvgIcon';
import { absoluteSiteUrl } from '@/lib/site';
import type { ChurchInfoDto, Icon, Prayer, Saint } from '@/lib/types';
import { imageForPrayer, localizeIcon, paragraphsFromText, sectionsFromText, textPreview, translateSectionLabel } from '@/lib/iconContent';


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
    priest: 'Настоятель',
    priestPhone: 'Телефон настоятеля',
    aboutChurch: 'О храме',
    openMap: 'Открыть карту',
    iconPage: 'Страница иконы',
    prayerCategory: 'Молитва',
    downloadQr: 'Скачать QR',
    gallery: 'Фотогалерея'
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
    priest: 'Настоятель',
    priestPhone: 'Телефон настоятеля',
    aboutChurch: 'Про храм',
    openMap: 'Відкрити карту',
    iconPage: 'Сторінка ікони',
    prayerCategory: 'Молитва',
    downloadQr: 'Завантажити QR',
    gallery: 'Фотогалерея'
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
    priest: 'Rector',
    priestPhone: "Rector's phone",
    aboutChurch: 'About the church',
    openMap: 'Open map',
    iconPage: 'Icon page',
    prayerCategory: 'Prayer',
    downloadQr: 'Download QR',
    gallery: 'Photo gallery'
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

function externalHref(value?: string) {
  const trimmed = (value || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
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

export function LocalizedBackendPrayersList({ prayers }: { prayers: Prayer[] }) {
  const { locale } = useI18n();
  const localeHref = useLocaleHref();
  return (
    <div className="list-grid">
      {prayers.map((prayer) => {
        const title = prayerTitle(prayer.title, locale);
        const image = prayer.imageUrl || prayer.qrCodeUrl || '';
        return (
          <article className="prayer-list-card" key={prayer.id}>
            {image ? (
              <Link className="prayer-list-media" href={localeHref(`/prayers/${prayer.slug}`)}>
                <StableImage src={image} alt={title} width={720} height={720} />
              </Link>
            ) : null}
            <div className="prayer-list-copy">
              <span>{prayer.category || ui(locale, 'prayerCategory')}</span>
              <Link href={localeHref(`/prayers/${prayer.slug}`)}><strong>{title}</strong></Link>
              <p>{textPreview(prayer.text, 190)}</p>
              <div className="prayer-card-actions">
                <AssetButton href={`/prayers/${prayer.slug}`}>{ui(locale, 'readPrayer')}</AssetButton>
                {image ? (
                  <AssetButton variant="dark" icon={<DownloadIcon />} href={image} download={downloadFileName(title, image)}>
                    {ui(locale, 'downloadQr')}
                  </AssetButton>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function LocalizedBackendPrayerDetail({ prayer }: { prayer: Prayer }) {
  const { locale } = useI18n();
  const image = prayer.imageUrl || prayer.qrCodeUrl || '';
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{prayer.category || ui(locale, 'prayer')}</p>
        <h1>{prayerTitle(prayer.title, locale)}</h1>
        {prayer.seoDescription ? <p>{prayer.seoDescription}</p> : null}
      </section>
      <article className="sacred-panel prayer-reader-panel">
        {image ? (
          <div className="prayer-panel-layout">
            <figure className="prayer-panel-image"><StableImage src={image} alt={prayer.title} width={720} height={720} /></figure>
            <div className="prayer-panel-copy">
              <span>{ui(locale, 'prayer')}</span>
              <div className="reader-text prayer-reader"><DisplayText text={prayer.text} /></div>
              {prayer.audioUrl ? <audio controls src={prayer.audioUrl} /> : null}
            </div>
          </div>
        ) : (
          <>
            <span>{ui(locale, 'prayer')}</span>
            <div className="reader-text prayer-reader"><DisplayText text={prayer.text} /></div>
            {prayer.audioUrl ? <audio controls src={prayer.audioUrl} /> : null}
          </>
        )}
      </article>
    </main>
  );
}

export function LocalizedSaintsList({ saints }: { saints: Saint[] }) {
  const localeHref = useLocaleHref();
  return <div className="list-grid">{saints.map((saint) => <Link key={saint.id} href={localeHref(`/saints/${saint.slug}`)}><span>{saint.feastDay}</span><strong>{saint.name}</strong><p>{textPreview(saint.shortDescription || saint.biography, 180)}</p></Link>)}</div>;
}

export function LocalizedSaintDetail({ saint }: { saint: Saint }) {
  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        {saint.imageUrl ? <figure className="sacred-image-frame"><StableImage src={saint.imageUrl} alt={saint.name} width={800} height={1000} loading="eager" /></figure> : null}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{saint.feastDay}</p>
          <h1>{saint.name}</h1>
          {saint.shortDescription ? <p className="detail-lead">{saint.shortDescription}</p> : null}
          <div className="soft-note reader-text"><DisplayText text={saint.biography} /></div>
        </div>
      </section>
    </main>
  );
}

function ChurchGallery({ title, images }: { title: string; images: string[] }) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (!images.length) return null;
  const active = activeIndex === null ? null : images[activeIndex] || null;

  return (
    <>
      <div className="church-gallery-grid">
        {images.map((image, index) => (
          <figure className={`church-gallery-card${index === 0 ? ' featured' : ''}`} key={`${image}-${index}`}>
            <button className="church-gallery-open" type="button" onClick={() => setActiveIndex(index)}>
              <StableImage src={image} alt={`${title} ${index + 1}`} width={900} height={675} />
              <span><SvgIcon name="zoom" size={16} />{t('zoomImage')}</span>
            </button>
          </figure>
        ))}
      </div>

      {active ? (
        <div className="icon-lightbox" role="dialog" aria-modal="true" aria-label={title}>
          <button className="icon-lightbox-backdrop" type="button" onClick={() => setActiveIndex(null)} aria-label={t('close')} />
          <div className="icon-lightbox-panel">
            <button className="icon-lightbox-close" type="button" onClick={() => setActiveIndex(null)}>{t('close')}</button>
            <StableImage src={active} alt={title} width={1200} height={900} loading="eager" />
          </div>
        </div>
      ) : null}
    </>
  );
}

function bestChurchTranslation(churchInfo: ChurchInfoDto | null, locale: keyof typeof uiText) {
  if (!churchInfo) return null;
  return [churchInfo.translations[locale], churchInfo.translations.uk, churchInfo.translations.ru, churchInfo.translations.en]
    .find((item) => item?.title?.trim()) || null;
}

export function LocalizedChurchesPage({ churchInfo }: { churchInfo: ChurchInfoDto | null }) {
  const { locale, t } = useI18n();
  const translation = bestChurchTranslation(churchInfo, locale);

  if (churchInfo && churchInfo.status === 'published' && translation?.title) {
    const contactHref = externalHref(churchInfo.phoneOrSite);
    const storyTitle = translation.dedication?.match(/[«"]([^»"]+)[»"]/)?.[1] || translation.title;
    const galleryImages = uniqueImages([churchInfo.imageUrl, ...(churchInfo.galleryImages || [])]);
    const factCards: Array<{ key: string; label: string; value?: string; icon: LucideIcon; href?: string }> = [
      { key: 'address', label: ui(locale, 'address'), value: churchInfo.address, icon: MapPin, href: churchInfo.mapsUrl },
      { key: 'schedule', label: ui(locale, 'schedule'), value: translation.schedule, icon: Clock3 },
      { key: 'priest', label: ui(locale, 'priest'), value: translation.priest, icon: UserRound },
      { key: 'priest-phone', label: ui(locale, 'priestPhone'), value: churchInfo.priestPhone, icon: Phone },
      { key: 'phone', label: ui(locale, 'phoneSite'), value: churchInfo.phoneOrSite, icon: Phone, href: contactHref },
      { key: 'shrines', label: ui(locale, 'shrines'), value: translation.shrines, icon: Sparkles }
    ].filter((item) => item.value?.trim());

    return (
      <main className="page church-profile-page">
        <section className="church-profile-hero">
          <div className="church-profile-copy">
            <p className="eyebrow">{t('churchesPageEyebrow')}</p>
            <h1>{translation.title}</h1>
            {translation.dedication ? <p className="church-dedication">{ui(locale, 'dedicatedTo')}: {translation.dedication}</p> : null}
            {translation.description ? <p className="detail-lead">{textPreview(translation.description, 260)}</p> : null}
            {churchInfo.mapsUrl || contactHref ? (
              <div className="detail-actions">
                {churchInfo.mapsUrl ? <AssetButton variant="dark" href={churchInfo.mapsUrl} target="_blank" rel="noreferrer">{ui(locale, 'openMap')}</AssetButton> : null}
                {contactHref ? <AssetButton href={contactHref} target="_blank" rel="noreferrer">{ui(locale, 'phoneSite')}</AssetButton> : null}
              </div>
            ) : null}
          </div>
          <aside className="church-profile-visual" aria-label={translation.title}>
            {churchInfo.imageUrl ? (
              <figure className="church-profile-image"><StableImage src={churchInfo.imageUrl} alt={translation.title} width={900} height={900} loading="eager" /></figure>
            ) : (
              <div className="church-logo-panel">
                <BrandLogo className="church-profile-logo" size={150} />
                <span>{translation.title}</span>
              </div>
            )}
          </aside>
        </section>

        {factCards.length ? (
          <dl className="church-profile-facts">
            {factCards.map(({ key, label, value, icon: Icon, href }) => (
              <div className="church-fact-card" key={key}>
                <dt><Icon size={22} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></dt>
                <dd>{href ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : <DisplayText text={value} />}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {galleryImages.length ? (
          <section className="church-gallery-section">
            <div className="section-head">
              <p className="eyebrow">{ui(locale, 'gallery')}</p>
              <h2>{storyTitle}</h2>
            </div>
            <ChurchGallery title={translation.title} images={galleryImages} />
          </section>
        ) : null}

        {translation.description ? (
          <section className="church-story-section">
            <div className="section-head">
              <p className="eyebrow">{ui(locale, 'aboutChurch')}</p>
              <h2>{storyTitle}</h2>
            </div>
            <div className="church-story-content">
              <DisplayText text={translation.description} />
            </div>
          </section>
        ) : null}
      </main>
    );
  }

  return (
    <main className="page church-profile-page">
      <section className="page-hero">
        <p className="eyebrow">{t('churchesPageEyebrow')}</p>
        <h1>{t('churchesPageTitle')}</h1>
        <p>{t('churchesPageLead')}</p>
      </section>
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
