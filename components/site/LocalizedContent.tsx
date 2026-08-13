
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, ChevronRight, Clock3, Cross, Headphones, HeartHandshake, MapPin, Phone, Sparkles, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconPhotoCatalog, type IconPhotoCatalogItem } from './IconPhotoCatalog';
import { AssetButton } from './AssetButton';
import { BackLink, Breadcrumbs } from './Breadcrumbs';
import { BrandLogo } from './BrandLogo';
import { IconOrderLink } from './IconOrderLink';
import { useI18n, useLocaleHref } from './LanguageProvider';
import {
  DetailActions,
  DetailHero,
  Eyebrow,
  Hero,
  HeroCopy,
  HeroTitle,
  ImageFrame,
  imageFrameImgClass,
  Lead,
  MiniGrid,
  MiniGridLink,
  MiniGridSmall,
  Page,
  Panel,
  PanelLabel,
  PanelTitle,
  ReaderText,
  ReadPage,
  RelatedSection,
  SacredContentGrid,
  SacredMeta,
  SectionHead,
  SectionHeadTitle
} from './PageChrome';
import { PrayerAudioBar } from './prayer-mode/PrayerAudioBar';
import { PrayerVisualizerCanvas } from './prayer-mode/PrayerVisualizerCanvas';
import { PrayerQr } from './PrayerQr';
import { StableImage } from './StableImage';
import { SvgIcon } from './SvgIcon';
import { Dialog, DialogClose, DialogOverlay, DialogPopup, DialogPortal } from '@/components/ui/dialog';
import { publicApi } from '@/lib/api';
import { formatFeastDay } from '@/lib/dates';
import { absoluteSiteUrl } from '@/lib/site';
import type { ChurchCalendarDayDto, ChurchIconDto, ChurchInfoDto, ChurchPrayerDto, Icon, Prayer, PrayerVisualizerAssetDto, Saint } from '@/lib/types';
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
    gallery: 'Фотогалерея',
    openPrayerMode: 'Открыть режим молитвы',
    closePrayerMode: 'Закрыть',
    prayerModeActive: 'Режим молитвы активен',
    playAudio: 'Воспроизвести',
    pauseAudio: 'Пауза',
    volumeLabel: 'Громкость',
    enableSoundHint: 'Включите звук для полного погружения в молитву'
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
    gallery: 'Фотогалерея',
    openPrayerMode: 'Відкрити режим молитви',
    closePrayerMode: 'Закрити',
    prayerModeActive: 'Режим молитви активний',
    playAudio: 'Відтворити',
    pauseAudio: 'Пауза',
    volumeLabel: 'Гучність',
    enableSoundHint: 'Увімкніть звук для повного занурення в молитву'
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
    gallery: 'Photo gallery',
    openPrayerMode: 'Open prayer mode',
    closePrayerMode: 'Close',
    prayerModeActive: 'Prayer mode active',
    playAudio: 'Play',
    pauseAudio: 'Pause',
    volumeLabel: 'Volume',
    enableSoundHint: 'Turn on sound for full immersion in prayer'
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

const dropCapClass =
  "first-letter:float-left first-letter:mr-[.18em] first-letter:mt-[.07em] first-letter:text-gold-light first-letter:text-[3.1em] first-letter:leading-[.84]";

// dropCap replicates prayer-mode.css's `.prayer-reader > p:first-of-type::first-letter` /
// `.prayer-reader .structured-block:first-child p:first-of-type::first-letter` — a decorative
// drop-cap that only applies to the prayer reader (LocalizedChurchPrayerDetail), never to
// saint bios or church facts, so it's an explicit prop rather than an ambient CSS selector.
function DisplayText({ text, dropCap }: { text?: string; dropCap?: boolean }) {
  const { locale } = useI18n();
  const sections = sectionsFromText(text);
  if (sections.length) {
    return (
      <div className="grid gap-[clamp(14px,1.6vw,22px)]">
        {sections.map((section, sectionIndex) => (
          <section key={`${section.label}-${sectionIndex}`} className="border-l-[3px] border-l-[#a97832] pl-[clamp(14px,1.6vw,20px)]">
            <h3 className="mt-0 mx-0 mb-2 text-gold-light text-[13px] font-black tracking-[.1em] uppercase">
              {translateSectionLabel(section.label, locale)}
            </h3>
            {paragraphsFromText(section.value).map((part, partIndex) => (
              <p
                key={`${section.label}-${partIndex}`}
                className={`text-muted-foreground last:mb-0 ${dropCap && sectionIndex === 0 && partIndex === 0 ? dropCapClass : ''}`}
              >
                {part}
              </p>
            ))}
          </section>
        ))}
      </div>
    );
  }
  return (
    <>
      {paragraphsFromText(text).map((part, partIndex) => (
        <p key={`${part.slice(0, 32)}-${partIndex}`} className={dropCap && partIndex === 0 ? dropCapClass : undefined}>
          {part}
        </p>
      ))}
    </>
  );
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
    <section className="grid gap-[clamp(18px,3vw,42px)] mt-[clamp(34px,5vw,78px)]">
      {sections.map((section, index) => {
        const image = images[index % images.length];
        const isEven = index % 2 === 1;
        return (
          <article
            className="grid grid-cols-[minmax(260px,.92fr)_minmax(0,1.08fr)] gap-[clamp(20px,4vw,64px)] items-center border-b border-[rgba(232,211,169,.13)] pb-[clamp(22px,3vw,42px)] max-[900px]:gap-4"
            key={`${section.title}-${image || section.paragraphs.join('|').slice(0, 64)}`}
          >
            {image ? (
              <figure
                className={`relative m-0 border border-gold/28 rounded-[8px] p-[clamp(10px,1.4vw,18px)] aspect-[4/5] overflow-hidden max-[900px]:max-h-[72vh] ${isEven ? 'order-2 max-[900px]:order-none' : ''}`}
              >
                <StableImage
                  src={image}
                  alt={section.title}
                  width={800}
                  height={1000}
                  className="relative z-[1] block w-full h-full aspect-[4/5] object-contain max-[900px]:max-h-[72vh]"
                />
              </figure>
            ) : null}
            <div className="min-w-0 max-w-[760px]">
              <span className="block mb-3 text-gold-light text-[12px] font-black tracking-[.16em] uppercase">{String(index + 1).padStart(2, '0')}</span>
              <h2 className="mt-0 mx-0 mb-[clamp(12px,1.4vw,18px)] text-foreground font-serif text-[clamp(26px,2.8vw,48px)] font-bold leading-[1.05]">{section.title}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={`${section.title}-${paragraphIndex}`} className="mt-0 mx-0 mb-3.5 last:mb-0 text-muted-foreground font-serif text-[clamp(17px,1.45vw,22px)] leading-[1.5]">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

export function LocalizedBackendPrayersList({ prayers }: { prayers: Prayer[] }) {
  const { locale } = useI18n();
  const localeHref = useLocaleHref();
  return (
    <div className="grid grid-cols-3 gap-[clamp(14px,2vw,28px)] mt-[clamp(28px,4vw,58px)] max-[900px]:grid-cols-1 max-[900px]:gap-3 max-[900px]:mt-6">
      {prayers.map((prayer) => {
        const title = prayerTitle(prayer.title, locale);
        const image = prayer.imageUrl || '';
        return (
          <article
            className="relative min-w-0 grid grid-rows-[auto_1fr] gap-0 rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] p-0 text-foreground overflow-hidden hover:border-gold hover:bg-[linear-gradient(135deg,rgba(205,164,90,.095),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.075),transparent_60%),#1b1c16]"
            key={prayer.id}
          >
            {image ? (
              <Link className="relative block aspect-square border-0 border-b border-gold/28 p-[clamp(16px,2.4vw,34px)] overflow-hidden" href={localeHref(`/prayers/${prayer.slug}`)}>
                <StableImage
                  src={image}
                  alt={title}
                  width={720}
                  height={720}
                  className="relative z-[1] block w-full h-full max-h-[clamp(280px,28vw,520px)] aspect-square object-contain"
                />
              </Link>
            ) : null}
            <div className="relative z-[1] min-w-0 grid content-start gap-3 p-[clamp(18px,2vw,28px)] max-[430px]:p-4">
              <span className="text-gold-light">{prayer.category || ui(locale, 'prayerCategory')}</span>
              <Link className="text-foreground no-underline" href={localeHref(`/prayers/${prayer.slug}`)}>
                <strong className="text-foreground font-black">{title}</strong>
              </Link>
              <p className="text-muted-foreground">{textPreview(prayer.text, 190)}</p>
              <div className="grid grid-cols-2 gap-2.5 items-center mt-1.5 max-[900px]:grid-cols-1">
                <AssetButton href={localeHref(`/prayers/${prayer.slug}`)}>{ui(locale, 'readPrayer')}</AssetButton>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function LocalizedChurchPrayerDetail({ prayer, icon, calendarDay, categoryLabel }: {
  prayer: ChurchPrayerDto;
  icon?: ChurchIconDto | null;
  calendarDay?: ChurchCalendarDayDto | null;
  categoryLabel: string;
}) {
  const { locale, t } = useI18n();
  const localeHref = useLocaleHref();
  const image = prayer.imageUrl || icon?.imageUrl || '';
  const title = prayerTitle(prayer.title, locale);
  const publicUrl = absoluteSiteUrl(localeHref(`/prayers/${prayer.slug}`));
  const date = calendarDay?.dateNewStyle || calendarDay?.dateOldStyle;
  const visualizerImage = prayer.visualizerImageUrl || image;
  const canUseVisualizer = Boolean(visualizerImage || prayer.visualizerEnabled);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [visualizerOn, setVisualizerOn] = useState(canUseVisualizer);
  const [visualizerAsset, setVisualizerAsset] = useState<PrayerVisualizerAssetDto | null>(null);

  useEffect(() => {
    if (!canUseVisualizer) return;
    let cancelled = false;
    void publicApi.churchPrayerVisualizerAsset(prayer.slug, locale).then((asset) => {
      if (!cancelled) setVisualizerAsset(asset);
    });
    return () => {
      cancelled = true;
    };
  }, [canUseVisualizer, prayer.slug, locale]);

  function getAnalyser(): AnalyserNode | null {
    return null;
  }

  function toggleVisualizer() {
    setVisualizerOn((current) => !current);
  }

  const prayerLabelClass = "block w-max max-w-full text-gold-light font-serif text-[clamp(18px,1.35vw,24px)] font-normal tracking-normal leading-[1.35] normal-case";
  const readerTextClass = "max-w-full text-[#e9dfcd] font-serif text-[clamp(18px,1.18vw,22px)] leading-[1.62] [&>p]:mt-0 [&>p]:mb-[clamp(16px,1.8vw,28px)] [&>p:last-child]:mb-0";

  return (
    <ReadPage>
      <Breadcrumbs
        wide
        items={[{ href: '/', label: t('home') }, { href: '/prayers', label: t('navPrayers') }]}
        current={title}
      />
      <section className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/28 pb-[18px] mb-3.5 w-[min(100%,1660px)] mx-auto">
        <div>
          <Eyebrow>{categoryLabel}</Eyebrow>
          <h1 className="m-0 max-w-[980px] font-serif font-bold text-[clamp(34px,2.9vw,52px)] leading-[1.02] text-[#ead9bd] text-balance [overflow-wrap:anywhere] max-[560px]:text-[clamp(32px,12vw,42px)]">
            {title}
          </h1>
        </div>
        {canUseVisualizer ? (
          <AssetButton
            variant="dark"
            onClick={toggleVisualizer}
            icon={<Headphones size={16} aria-hidden="true" />}
            className="rounded-full bg-gold/8 shadow-[0_0_28px_rgba(205,164,90,.08)] normal-case"
          >
            {visualizerOn ? ui(locale, 'prayerModeActive') : ui(locale, 'openPrayerMode')}
          </AssetButton>
        ) : null}
      </section>

      <div className={`grid gap-3.5 items-stretch w-[min(100%,1660px)] mx-auto ${visualizerOn ? 'grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] max-[900px]:grid-cols-1' : 'grid-cols-1'}`}>
        <article
          className={`min-w-0 ${visualizerOn ? 'col-start-1 row-start-1 max-[900px]:col-auto max-[900px]:row-auto' : ''} min-h-[clamp(380px,31vw,560px)] max-[560px]:min-h-0 p-[clamp(28px,3vw,50px)] max-[560px]:p-[22px_18px] bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_44%),linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0)),rgba(14,15,12,.82)] shadow-[inset_0_0_0_1px_rgba(233,203,132,.055),0_18px_50px_rgba(0,0,0,.26)]`}
        >
          {image ? (
            <div className={`grid gap-[clamp(22px,4vw,58px)] items-start ${visualizerOn ? 'grid-cols-1' : 'grid-cols-[minmax(220px,.38fr)_minmax(0,1fr)] max-[900px]:grid-cols-1'}`}>
              <figure
                className={`relative m-0 border border-gold/28 rounded-md aspect-square overflow-hidden max-[900px]:max-h-[72vh] max-[430px]:p-2.5 before:content-[''] before:absolute before:inset-0 before:z-0 before:pointer-events-none before:bg-[linear-gradient(110deg,transparent_0_28%,rgba(232,203,132,.12)_42%,transparent_56%),#1b1c16] before:bg-[length:220%_100%,100%_100%] before:[animation:imageSkeleton_1.4s_ease-in-out_infinite] ${visualizerOn ? 'hidden' : ''}`}
              >
                <StableImage src={image} alt={title} width={720} height={720} className="relative z-[1] block w-full h-full p-3 object-contain max-[900px]:max-h-[72vh]" />
              </figure>
              <div className="min-w-0">
                <span className={prayerLabelClass}>{ui(locale, 'prayer')}</span>
                <div className={readerTextClass}><DisplayText text={prayer.text} dropCap /></div>
              </div>
            </div>
          ) : (
            <>
              <span className={prayerLabelClass}>{ui(locale, 'prayer')}</span>
              <div className={readerTextClass}><DisplayText text={prayer.text} dropCap /></div>
            </>
          )}
        </article>

        {visualizerOn ? (
          <PrayerVisualizerCanvas
            title={title}
            audioRef={audioRef}
            getAnalyser={getAnalyser}
            imageUrl={visualizerImage}
            backgroundColor={prayer.backgroundColor}
            audioReactivity={prayer.audioReactivity}
            sceneTimeline={prayer.sceneTimeline}
            subtitleCues={prayer.subtitleCues}
            prayerText={prayer.text}
            visualizerAsset={visualizerAsset}
          />
        ) : null}
      </div>

      {prayer.audioUrl ? (
        <div className="grid gap-2.5 w-[min(100%,1460px)] mt-2 mx-auto">
          {/* No `controls` attribute: this element has no visible UI of its
             own — PrayerAudioBar below is the one shared transport for both
             plain reading and prayer mode. */}
          <audio ref={audioRef} src={prayer.audioUrl} preload="metadata" />
          <PrayerAudioBar
            audioRef={audioRef}
            playLabel={ui(locale, 'playAudio')}
            pauseLabel={ui(locale, 'pauseAudio')}
            volumeLabel={ui(locale, 'volumeLabel')}
          />
          {visualizerOn ? (
            <p className="m-0 text-gold-light font-serif text-[13px] text-center opacity-[.76]">{ui(locale, 'enableSoundHint')}</p>
          ) : null}
        </div>
      ) : null}

      <section className="grid grid-cols-[minmax(280px,1.05fr)_minmax(250px,.7fr)_minmax(310px,.86fr)] gap-0 mt-[22px] border border-gold/28 rounded-[8px] bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_42%),rgba(14,15,12,.84)] shadow-[inset_0_0_0_1px_rgba(233,203,132,.04)] overflow-hidden w-full max-w-[1660px] mx-auto max-[900px]:grid-cols-1">
        <article className="min-w-0 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5 p-[clamp(20px,2vw,30px)] max-[560px]:grid-cols-1">
          <span className="size-16 grid place-items-center border border-gold/28 rounded-full bg-gold/9 text-gold-light max-[560px]:size-[54px]">
            <Cross size={24} aria-hidden="true" />
          </span>
          <div>
            <h2 className="m-0 text-[#ead9bd] font-serif text-[clamp(18px,1.35vw,24px)] font-bold leading-[1.18]">{icon?.title || title}</h2>
            <p className="m-0 text-[rgba(232,222,204,.72)] font-serif text-[15px] leading-[1.48]">{textPreview(prayer.text, 230)}</p>
            {icon ? (
              <Link
                href={localeHref(`/icons/${icon.slug}`)}
                className="inline-flex min-w-0 items-center gap-[9px] text-gold-light font-serif text-[15px] leading-[1.2] transition-colors duration-[180ms] ease-brand hover:text-foreground focus-visible:text-foreground"
              >
                {ui(locale, 'iconPage')} <ChevronRight size={15} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </article>

        <article className="min-w-0 grid gap-3.5 p-[clamp(20px,2vw,30px)] max-[900px]:border-t max-[900px]:border-t-gold/28 border-l border-l-gold/28 max-[900px]:border-l-0">
          <h2 className="m-0 text-[#ead9bd] font-serif text-[clamp(18px,1.35vw,24px)] font-bold leading-[1.18]">{ui(locale, 'furtherReading')}</h2>
          <div className="grid gap-3">
            {icon ? (
              <Link
                href={localeHref(`/icons/${icon.slug}`)}
                className="inline-flex min-w-0 items-center gap-[9px] text-gold-light font-serif text-[15px] leading-[1.2] transition-colors duration-[180ms] ease-brand hover:text-foreground focus-visible:text-foreground"
              >
                <BookOpen size={15} aria-hidden="true" className="flex-none text-gold-light" />
                <span>{icon.title}</span>
              </Link>
            ) : null}
            {date ? (
              <Link
                href={localeHref(`/church/calendar/${date}`)}
                className="inline-flex min-w-0 items-center gap-[9px] text-gold-light font-serif text-[15px] leading-[1.2] transition-colors duration-[180ms] ease-brand hover:text-foreground focus-visible:text-foreground"
              >
                <CalendarDays size={15} aria-hidden="true" className="flex-none text-gold-light" />
                <span>{calendarDay?.title || date}</span>
              </Link>
            ) : null}
            <Link
              href={localeHref('/prayers')}
              className="inline-flex min-w-0 items-center gap-[9px] text-gold-light font-serif text-[15px] leading-[1.2] transition-colors duration-[180ms] ease-brand hover:text-foreground focus-visible:text-foreground"
            >
              <BookOpen size={15} aria-hidden="true" className="flex-none text-gold-light" />
              <span>{t('navPrayers')}</span>
            </Link>
          </div>
        </article>

        <article className="min-w-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 p-[clamp(20px,2vw,30px)] max-[900px]:border-t max-[900px]:border-t-gold/28 border-l border-l-gold/28 max-[900px]:border-l-0 max-[560px]:grid-cols-1">
          <div>
            <h2 className="m-0 text-[#ead9bd] font-serif text-[clamp(18px,1.35vw,24px)] font-bold leading-[1.18]">{ui(locale, 'forChurches')}</h2>
            <p className="m-0 text-[rgba(232,222,204,.72)] font-serif text-[15px] leading-[1.48]">{t('churchesFeatureDonationsText')}</p>
            <Link
              href={localeHref('/churches')}
              className="inline-flex min-w-0 items-center gap-[9px] text-gold-light font-serif text-[15px] leading-[1.2] transition-colors duration-[180ms] ease-brand hover:text-foreground focus-visible:text-foreground"
            >
              {ui(locale, 'forChurches')} <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid justify-items-center gap-2 text-gold-light max-[560px]:justify-items-start">
            <HeartHandshake size={18} aria-hidden="true" />
            <PrayerQr
              url={publicUrl}
              label={ui(locale, 'qrCode')}
              downloadLabel={ui(locale, 'downloadQr')}
              downloadName={downloadFileName(title, 'qr.png')}
            />
          </div>
        </article>
      </section>
      <BackLink href="/prayers" label={t('navPrayers')} />
    </ReadPage>
  );
}

export function LocalizedSaintDetail({ saint }: { saint: Saint }) {
  const { locale, t } = useI18n();
  const localeHref = useLocaleHref();
  return (
    <Page>
      <Breadcrumbs
        items={[{ href: '/', label: t('home') }, { href: '/saints', label: t('navSaints') }]}
        current={saint.name}
      />
      <DetailHero>
        {saint.imageUrl ? (
          <ImageFrame>
            <StableImage src={saint.imageUrl} alt={saint.name} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
          </ImageFrame>
        ) : null}
        <HeroCopy>
          {saint.feastDayNewStyle || saint.feastDayOldStyle ? (
            <div className="grid gap-1">
              {saint.feastDayNewStyle ? <Eyebrow>{formatFeastDay(saint.feastDayNewStyle, locale)}</Eyebrow> : null}
              {saint.feastDayOldStyle ? (
                <p className="m-0 text-muted-foreground text-[13px] font-semibold">
                  {formatFeastDay(saint.feastDayOldStyle, locale)} {t('saintOldStyleSuffix')}
                </p>
              ) : null}
            </div>
          ) : null}
          <HeroTitle>{saint.name}</HeroTitle>
          {saint.shortDescription ? <Lead>{saint.shortDescription}</Lead> : null}
          <div className="border-l-[3px] border-l-gold py-3.5 pr-0 pl-4.5 bg-[linear-gradient(90deg,rgba(214,168,79,.12),transparent)] rounded-l-none rounded-r-xs max-w-[960px] text-muted-foreground font-serif text-[clamp(18px,1.45vw,24px)] leading-[1.6] [&>p]:mt-0 [&>p]:mx-0 [&>p]:mb-4 [&>p:last-child]:mb-0">
            <DisplayText text={saint.biography} />
          </div>
        </HeroCopy>
      </DetailHero>
      {saint.relatedIcons.length || saint.prayers.length ? (
        <RelatedSection>
          <SectionHead>
            <Eyebrow>{t('calendarMaterial')}</Eyebrow>
            <SectionHeadTitle>{ui(locale, 'furtherReading')}</SectionHeadTitle>
          </SectionHead>
          <MiniGrid>
            {saint.relatedIcons.map((slug) => (
              <MiniGridLink key={slug} href={localeHref(`/icons/${slug}`)}>{slug}<MiniGridSmall>{t('navIcons')}</MiniGridSmall></MiniGridLink>
            ))}
            {saint.prayers.map((slug) => (
              <MiniGridLink key={slug} href={localeHref(`/prayers/${slug}`)}>{slug}<MiniGridSmall>{t('navPrayers')}</MiniGridSmall></MiniGridLink>
            ))}
          </MiniGrid>
        </RelatedSection>
      ) : null}
      <BackLink href="/saints" label={t('navSaints')} />
    </Page>
  );
}

function ChurchGallery({ title, images }: { title: string; images: string[] }) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (!images.length) return null;
  const active = activeIndex === null ? null : images[activeIndex] || null;

  return (
    <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setActiveIndex(null); }}>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] auto-rows-[minmax(190px,1fr)] gap-[clamp(12px,1.5vw,20px)] max-[820px]:grid-cols-1">
        {images.map((image, index) => {
          const featured = index === 0;
          return (
            <figure
              className={`min-w-0 m-0 max-[820px]:min-h-[320px] max-[520px]:min-h-[240px] ${
                featured ? 'row-span-2 min-h-[clamp(420px,42vw,680px)] max-[820px]:row-auto' : 'min-h-[220px]'
              }`}
              key={`${image}-${index}`}
            >
              <button
                className="group relative w-full h-full min-h-[inherit] block border border-gold/28 rounded-[8px] p-0 bg-[linear-gradient(135deg,rgba(205,164,90,.08),transparent_48%),#141511] overflow-hidden cursor-zoom-in shadow-[0_6px_18px_rgba(0,0,0,.18)] after:content-[''] after:absolute after:inset-0 after:z-[2] after:bg-[linear-gradient(180deg,transparent_56%,rgba(0,0,0,.42))] after:pointer-events-none"
                type="button"
                onClick={() => setActiveIndex(index)}
              >
                <StableImage
                  src={image}
                  alt={`${title} ${index + 1}`}
                  width={900}
                  height={675}
                  className="relative z-[1] block w-full h-full min-h-[inherit] object-cover transition-[filter,transform] duration-[180ms] ease-brand group-hover:[filter:saturate(1.06)_contrast(1.04)] group-hover:scale-[1.018] group-focus-visible:[filter:saturate(1.06)_contrast(1.04)] group-focus-visible:scale-[1.018]"
                />
                <span className="absolute right-3.5 bottom-3.5 z-[3] inline-flex items-center gap-2 border border-gold/28 rounded-full py-[9px] px-[13px] bg-[rgba(11,11,10,.78)] text-gold-light text-[11px] font-black tracking-[.08em] uppercase opacity-0 translate-y-1 transition-[opacity,transform] duration-[180ms] ease-brand group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0 max-[520px]:opacity-100 max-[520px]:translate-y-0">
                  <SvgIcon name="zoom" size={16} />
                  {t('zoomImage')}
                </span>
              </button>
            </figure>
          );
        })}
      </div>

      {active ? (
        <DialogPortal>
          <DialogOverlay className="z-[2000] bg-[rgba(5,5,5,.84)]" />
          <DialogPopup
            aria-label={title}
            className="z-[2000] w-[min(1180px,calc(100vw-56px))] max-h-[min(90vh,calc(100vh-56px))] max-[900px]:w-[calc(100vw-32px)] border border-gold/28 rounded-[8px] bg-canvas grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden before:content-[''] before:absolute before:inset-x-0 before:top-0 before:bottom-14 before:z-0 before:pointer-events-none before:bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.13)_42%,transparent_56%),#141511] before:bg-[length:220%_100%,100%_100%] before:[animation:imageSkeleton_1.4s_ease-in-out_infinite]"
          >
            <DialogClose
              className="absolute top-3 right-3 z-[2] inline-flex min-h-[38px] items-center justify-center gap-2 rounded-sm border border-gold/28 px-3 bg-[rgba(11,11,10,.78)] text-[13px] font-black tracking-[.06em] uppercase leading-[1.15] text-gold-light no-underline whitespace-nowrap cursor-pointer transition-[border-color,background,color] duration-[180ms] ease-brand hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas"
            >
              {t('close')}
            </DialogClose>
            <StableImage
              src={active}
              alt={title}
              width={1200}
              height={900}
              loading="eager"
              className="relative z-[1] w-full h-full max-h-[calc(90vh-92px)] object-contain block max-[900px]:max-h-[calc(100vh-132px)]"
            />
          </DialogPopup>
        </DialogPortal>
      ) : null}
    </Dialog>
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
      <Page className="max-w-[1480px] mx-auto grid gap-[clamp(28px,4vw,58px)]">
        <section className="grid grid-cols-[minmax(0,1fr)_minmax(300px,440px)] gap-[clamp(28px,5vw,86px)] items-center border-b border-gold/28 pb-[clamp(28px,4vw,60px)] max-[820px]:grid-cols-1 max-[520px]:gap-[22px] max-[520px]:pb-7">
          <div className="min-w-0 max-w-[900px] grid gap-4.5 max-[520px]:gap-3.5">
            <Eyebrow>{t('churchesPageEyebrow')}</Eyebrow>
            <h1 className="m-0 text-foreground font-serif text-[88px] font-bold leading-[1.02] tracking-normal text-balance [overflow-wrap:anywhere] max-[820px]:text-[56px] max-[520px]:text-[42px] max-[520px]:leading-[1.06]">
              {translation.title}
            </h1>
            {translation.dedication ? (
              <p className="text-gold-light text-[12px] font-black tracking-[.1em] uppercase">{ui(locale, 'dedicatedTo')}: {translation.dedication}</p>
            ) : null}
            {translation.description ? <Lead>{textPreview(translation.description, 260)}</Lead> : null}
            {churchInfo.mapsUrl || contactHref ? (
              <DetailActions>
                {churchInfo.mapsUrl ? <AssetButton variant="dark" href={churchInfo.mapsUrl} target="_blank" rel="noreferrer">{ui(locale, 'openMap')}</AssetButton> : null}
                {contactHref ? <AssetButton href={contactHref} target="_blank" rel="noreferrer">{ui(locale, 'phoneSite')}</AssetButton> : null}
              </DetailActions>
            ) : null}
          </div>
          <aside className="min-w-0 self-stretch grid items-center" aria-label={translation.title}>
            {churchInfo.imageUrl ? (
              <figure className="min-w-0 min-h-[360px] m-0 border border-gold/28 rounded-[8px] bg-[linear-gradient(135deg,rgba(205,164,90,.09),transparent_45%),linear-gradient(160deg,rgba(127,141,101,.08),transparent_62%),#141511] shadow-[0_6px_18px_rgba(0,0,0,.18)] overflow-hidden aspect-square">
                <StableImage
                  src={churchInfo.imageUrl}
                  alt={translation.title}
                  width={900}
                  height={900}
                  loading="eager"
                  className="w-full h-full block object-cover"
                />
              </figure>
            ) : (
              <div className="min-w-0 min-h-[360px] grid place-items-center content-center gap-4.5 p-[34px] text-center border border-gold/28 rounded-[8px] bg-[linear-gradient(135deg,rgba(205,164,90,.09),transparent_45%),linear-gradient(160deg,rgba(127,141,101,.08),transparent_62%),#141511] shadow-[0_6px_18px_rgba(0,0,0,.18)] overflow-hidden">
                <BrandLogo className="size-[150px] object-contain" size={150} />
                <span className="max-w-[260px] text-gold-light text-[13px] font-black tracking-[.08em] leading-[1.35] uppercase">{translation.title}</span>
              </div>
            )}
          </aside>
        </section>

        {factCards.length ? (
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3.5 m-0">
            {factCards.map(({ key, label, value, icon: Icon, href }) => (
              <div
                className="min-w-0 min-h-[156px] max-[520px]:min-h-0 grid content-start gap-4.5 border border-[rgba(232,211,169,.13)] rounded-md p-[22px] max-[520px]:p-4.5 bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_48%),#141511]"
                key={key}
              >
                <dt className="flex items-center gap-2.5 text-gold-light text-[12px] font-black tracking-[.12em] uppercase">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" className="flex-none text-[#a97832]" />
                  <span>{label}</span>
                </dt>
                <dd className="min-w-0 m-0 text-foreground font-serif text-[21px] max-[520px]:text-[19px] leading-[1.45] [overflow-wrap:anywhere] [&_p]:mt-0 [&_p]:mx-0 [&_p]:mb-2 [&_p:last-child]:mb-0">
                  {href ? (
                    <a className="text-inherit [text-decoration-color:#a97832] underline-offset-4" href={href} target="_blank" rel="noreferrer">
                      {value}
                    </a>
                  ) : (
                    <DisplayText text={value} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {galleryImages.length ? (
          <section className="grid gap-[clamp(18px,2.5vw,34px)] border-t border-gold/28 pt-[clamp(28px,4vw,58px)] max-[520px]:gap-4 max-[520px]:pt-7">
            <SectionHead className="max-w-[720px] m-0">
              <Eyebrow>{ui(locale, 'gallery')}</Eyebrow>
              <SectionHeadTitle className="text-foreground text-[clamp(36px,4vw,70px)] leading-[1.04]">{storyTitle}</SectionHeadTitle>
            </SectionHead>
            <ChurchGallery title={translation.title} images={galleryImages} />
          </section>
        ) : null}

        {translation.description ? (
          <section className="grid grid-cols-[minmax(220px,320px)_minmax(0,1fr)] gap-[clamp(24px,4vw,70px)] items-start border-t border-gold/28 pt-[clamp(28px,4vw,58px)] max-[820px]:grid-cols-1">
            <SectionHead className="sticky top-[110px] m-0 max-[820px]:static">
              <Eyebrow>{ui(locale, 'aboutChurch')}</Eyebrow>
              <SectionHeadTitle className="max-w-[320px] text-foreground text-[48px] leading-[1.04] max-[820px]:max-w-none max-[820px]:text-[34px]">{storyTitle}</SectionHeadTitle>
            </SectionHead>
            <div className="min-w-0 grid grid-cols-2 gap-[clamp(14px,1.6vw,24px)] max-w-none text-foreground font-serif text-[clamp(22px,1.45vw,30px)] leading-[1.52] max-[820px]:grid-cols-1 max-[820px]:text-[20px] max-[520px]:text-[19px] max-[520px]:leading-[1.62] [&>p]:min-w-0 [&>p]:m-0 [&>p]:border-l-[3px] [&>p]:border-l-[#a97832] [&>p]:rounded-xs [&>p]:p-[clamp(16px,1.7vw,26px)] max-[520px]:[&>p]:p-4 [&>p]:bg-[linear-gradient(135deg,rgba(205,164,90,.075),transparent_46%),#141511] [&>p]:text-[#ddd4c2] [&>p]:shadow-[inset_0_0_0_1px_rgba(205,164,90,.12)] [&>p]:[break-inside:avoid] [&>p:first-child]:text-[clamp(24px,1.65vw,34px)] [&>p:nth-child(2)]:text-[clamp(24px,1.65vw,34px)] [&>p:nth-child(3)]:text-[clamp(24px,1.65vw,34px)] [&>p:first-child]:leading-[1.42] [&>p:nth-child(2)]:leading-[1.42] [&>p:nth-child(3)]:leading-[1.42] max-[520px]:[&>p:first-child]:text-[22px] max-[520px]:[&>p:nth-child(2)]:text-[22px] max-[520px]:[&>p:nth-child(3)]:text-[22px] [&>p:first-child]:col-span-full [&>p:first-child]:border-l-gold-light [&>p:first-child]:text-gold-light [&>p:first-child]:text-[clamp(34px,3vw,58px)]! [&>p:first-child]:leading-[1.08]! max-[520px]:[&>p:first-child]:text-[32px]!">
              <DisplayText text={translation.description} />
            </div>
          </section>
        ) : null}
      </Page>
    );
  }

  return (
    <Page className="max-w-[1480px] mx-auto grid gap-[clamp(28px,4vw,58px)]">
      <Hero>
        <Eyebrow>{t('churchesPageEyebrow')}</Eyebrow>
        <HeroTitle>{t('churchesPageTitle')}</HeroTitle>
        <Lead>{t('churchesPageLead')}</Lead>
      </Hero>
    </Page>
  );
}

export function LocalizedIconDetail({ icon, related }: { icon: Icon; related: Icon[] }) {
  const { locale, t } = useI18n();
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
    <Page>
      <Breadcrumbs
        items={[{ href: '/', label: t('home') }, { href: '/icons', label: t('navIcons') }]}
        current={iconTitle}
      />
      <DetailHero>
        <ImageFrame>
          <StableImage src={item.imageUrl} alt={iconTitle} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
        </ImageFrame>
        <HeroCopy>
          <Eyebrow>{item.category}</Eyebrow>
          <HeroTitle>{iconTitle}</HeroTitle>
          <Lead>{item.shortDescription || textPreview(item.fullDescription, 220)}</Lead>
          <SacredMeta>
            {item.saintName ? <span>{item.saintName}</span> : null}
            <span>{item.status === 'published' ? ui(locale, 'published') : ui(locale, 'draft')}</span>
          </SacredMeta>
          <DetailActions>
            <AssetButton variant="dark" href="#prayer">{ui(locale, 'readPrayer')}</AssetButton>
            <AssetButton href="/churches">{ui(locale, 'forChurches')}</AssetButton>
            <IconOrderLink icon={item} />
          </DetailActions>
        </HeroCopy>
      </DetailHero>
      <IconStory text={item.fullDescription} images={photoImages.length ? photoImages : [item.imageUrl]} />
      {publicGalleryImages.length > 1 ? (
        <section className="border-t border-gold/28 pt-[clamp(22px,3vw,42px)] max-[900px]:mt-7 max-[900px]:pt-[22px]">
          <SectionHead className="mb-[clamp(18px,2.5vw,30px)]">
            <Eyebrow>{ui(locale, 'photoQr')}</Eyebrow>
            <SectionHeadTitle className="text-foreground text-[clamp(24px,2.8vw,42px)] leading-[1.05]">{ui(locale, 'imageCatalog')}</SectionHeadTitle>
          </SectionHead>
          <IconPhotoCatalog title={iconTitle} iconUrl={iconPageUrl} items={publicGalleryImages} />
        </section>
      ) : null}
      <SacredContentGrid>
        <Panel id="prayer" className="col-span-2 max-[900px]:col-span-1">
          <div className="grid grid-cols-[minmax(220px,.38fr)_minmax(0,1fr)] gap-[clamp(22px,4vw,58px)] items-start max-[900px]:grid-cols-1">
            <figure className="relative m-0 border border-gold/28 rounded-md aspect-square overflow-hidden max-[900px]:max-h-[72vh] max-[430px]:p-2.5 before:content-[''] before:absolute before:inset-0 before:z-0 before:pointer-events-none before:bg-[linear-gradient(110deg,transparent_0_28%,rgba(232,203,132,.12)_42%,transparent_56%),#1b1c16] before:bg-[length:220%_100%,100%_100%] before:[animation:imageSkeleton_1.4s_ease-in-out_infinite]">
              <StableImage src={prayerImage} alt={`${ui(locale, 'prayer')}: ${iconTitle}`} width={720} height={720} className="relative z-[1] block w-full h-full p-3 object-contain max-[900px]:max-h-[72vh]" />
            </figure>
            <div className="min-w-0">
              <PanelLabel>01</PanelLabel>
              <PanelTitle>{ui(locale, 'prayer')}</PanelTitle>
              <ReaderText><DisplayText text={item.prayerText} /></ReaderText>
              {item.audioUrl ? <audio controls src={item.audioUrl} /> : null}
            </div>
          </div>
        </Panel>
        <Panel><PanelLabel>02</PanelLabel><PanelTitle>{ui(locale, 'gospel')}</PanelTitle><ReaderText><DisplayText text={item.gospelText} /></ReaderText></Panel>
        <Panel><PanelLabel>03</PanelLabel><PanelTitle>{ui(locale, 'life')}</PanelTitle><ReaderText><DisplayText text={item.lifeText} /></ReaderText></Panel>
        <Panel><PanelLabel>04</PanelLabel><PanelTitle>{ui(locale, 'iconHistory')}</PanelTitle><ReaderText><DisplayText text={item.historyText} /></ReaderText></Panel>
      </SacredContentGrid>
      {relatedItems.length ? (
        <RelatedSection>
          <SectionHead>
            <Eyebrow>{ui(locale, 'similarIcons')}</Eyebrow>
            <SectionHeadTitle>{ui(locale, 'furtherReading')}</SectionHeadTitle>
          </SectionHead>
          <MiniGrid>
            {relatedItems.map((entry) => (
              <MiniGridLink key={entry.id} href={localeHref(`/icons/${entry.slug}`)}>{displayText(entry.title)}<MiniGridSmall>{entry.category}</MiniGridSmall></MiniGridLink>
            ))}
          </MiniGrid>
        </RelatedSection>
      ) : null}
    </Page>
  );
}
