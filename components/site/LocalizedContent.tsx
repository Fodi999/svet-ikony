
'use client';

import { useEffect, useRef, useState } from 'react';
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

const dailyPrayerTexts = {
  ru: {
    title: '📖 Сборник молитв на каждый день',
    todayLabel: 'Сегодня',
    dailyTitle: 'Молитва дня',
    lead: 'В каждом дне есть время для молитвы и благодарности Богу.',
    intro: 'Молитва открывает сердце для Божией любви и милости. Пусть эти слова помогут вам обращаться к Господу с доверием и благодарностью.',
    closing: '🙏 Пусть Господь слышит ваши молитвы и наполняет сердца радостью и миром!',
    subscribe: '@Pravoslav_molitvoslov - подпишитесь',
    save: 'Сохранить',
    saved: 'Сохранено',
    share: 'Поделиться',
    listen: 'Слушать',
    stop: 'Остановить',
    allPrayers: 'Все молитвы',
    choosePrayer: 'Выбрать молитву',
    shareDone: 'Ссылка скопирована',
    listenUnavailable: 'Озвучивание недоступно в этом браузере',
    openFull: 'Открыть для чтения',
    copy: 'Скопировать',
    copied: 'Скопировано',
    download: 'Скачать',
    close: 'Закрыть',
    prayers: [
      {
        title: 'Молитва благодарности',
        text: 'Господи, благодарю Тебя за все милости,\nявленные мне в жизни.\nНаучи меня видеть Твою любовь\nв каждом дне и за всё прославлять Тебя.\nАминь.'
      },
      {
        title: 'Молитва перед учёбой или работой',
        text: 'Господи, пошли мне дух разума и мудрости,\nукрепи меня в трудах моих,\nпросвети мой ум и сердце,\nчтобы всё делал(а) во славу Твою.\nАминь.'
      },
      {
        title: 'Молитва о здравии близких',
        text: 'Господи, Иисусе Христе, Сыне Божий,\nисцели и укрепи рабов Твоих (имена),\nдаруй им здоровье душевное и телесное,\nпошли им терпение и силы перенести все испытания.\nАминь.'
      },
      {
        title: 'Молитва о мире в семье',
        text: 'Господи, подай мир и любовь в наш дом,\nдаруй согласие, терпение и взаимопонимание,\nнаправь нас на путь добра и взаимной поддержки.\nАминь.'
      },
      {
        title: 'Молитва в трудную минуту',
        text: 'Господи, не оставь меня в час испытаний,\nукрепи мою веру и дай силы преодолеть все трудности.\nПомоги мне не унывать, но уповать на Твою волю\nи милость.\nАминь.'
      }
    ]
  },
  uk: {
    title: '📖 Збірник молитов на кожен день',
    todayLabel: 'Сьогодні',
    dailyTitle: 'Молитва дня',
    lead: 'У кожному дні є час для молитви й подяки Богові.',
    intro: 'Молитва відкриває серце для Божої любові та милості. Нехай ці слова допоможуть вам звертатися до Господа з довірою і вдячністю.',
    closing: '🙏 Нехай Господь чує ваші молитви і наповнює серця радістю та миром!',
    subscribe: '@Pravoslav_molitvoslov - підпишіться',
    save: 'Зберегти',
    saved: 'Збережено',
    share: 'Поділитися',
    listen: 'Слухати',
    stop: 'Зупинити',
    allPrayers: 'Усі молитви',
    choosePrayer: 'Обрати молитву',
    shareDone: 'Посилання скопійовано',
    listenUnavailable: 'Озвучення недоступне в цьому браузері',
    openFull: 'Відкрити для читання',
    copy: 'Скопіювати',
    copied: 'Скопійовано',
    download: 'Завантажити',
    close: 'Закрити',
    prayers: [
      {
        title: 'Молитва подяки',
        text: 'Господи, дякую Тобі за всі милості,\nявлені мені в житті.\nНавчи мене бачити Твою любов\nу кожному дні і за все прославляти Тебе.\nАмінь.'
      },
      {
        title: 'Молитва перед навчанням або роботою',
        text: 'Господи, пошли мені дух розуму і мудрості,\nукріпи мене в трудах моїх,\nпросвіти мій розум і серце,\nщоб усе робив(ла) на славу Твою.\nАмінь.'
      },
      {
        title: "Молитва за здоров'я близьких",
        text: 'Господи Ісусе Христе, Сину Божий,\nзціли й укріпи рабів Твоїх (імена),\nдаруй їм здоров\'я душевне і тілесне,\nпошли їм терпіння і сили перенести всі випробування.\nАмінь.'
      },
      {
        title: "Молитва про мир у сім'ї",
        text: 'Господи, подай мир і любов у наш дім,\nдаруй згоду, терпіння і взаєморозуміння,\nнаправ нас на шлях добра і взаємної підтримки.\nАмінь.'
      },
      {
        title: 'Молитва у важку хвилину',
        text: 'Господи, не залиш мене в час випробувань,\nукріпи мою віру і дай сили подолати всі труднощі.\nДопоможи мені не впадати у відчай, а уповати на Твою волю\nі милість.\nАмінь.'
      }
    ]
  },
  en: {
    title: '📖 A Collection of Daily Prayers',
    todayLabel: 'Today',
    dailyTitle: 'Prayer of the day',
    lead: 'Every day holds a time for prayer and gratitude to God.',
    intro: 'Prayer opens the heart to God\'s love and mercy. May these words help you turn to the Lord with trust and thanksgiving.',
    closing: '🙏 May the Lord hear your prayers and fill your hearts with joy and peace!',
    subscribe: '@Pravoslav_molitvoslov - subscribe',
    save: 'Save',
    saved: 'Saved',
    share: 'Share',
    listen: 'Listen',
    stop: 'Stop',
    allPrayers: 'All prayers',
    choosePrayer: 'Choose prayer',
    shareDone: 'Link copied',
    listenUnavailable: 'Speech playback is not available in this browser',
    openFull: 'Open for reading',
    copy: 'Copy',
    copied: 'Copied',
    download: 'Download',
    close: 'Close',
    prayers: [
      {
        title: 'Prayer of Thanksgiving',
        text: 'Lord, I thank You for all the mercies\nshown to me in my life.\nTeach me to see Your love\nin every day and to glorify You for all things.\nAmen.'
      },
      {
        title: 'Prayer Before Study or Work',
        text: 'Lord, send me the spirit of understanding and wisdom,\nstrengthen me in my labors,\nenlighten my mind and heart,\nso that I may do all things for Your glory.\nAmen.'
      },
      {
        title: 'Prayer for the Health of Loved Ones',
        text: 'Lord Jesus Christ, Son of God,\nheal and strengthen Your servants (names),\ngrant them health of soul and body,\nand send them patience and strength to endure every trial.\nAmen.'
      },
      {
        title: 'Prayer for Peace in the Family',
        text: 'Lord, grant peace and love to our home,\ngive us harmony, patience, and mutual understanding,\nand guide us on the path of goodness and support for one another.\nAmen.'
      },
      {
        title: 'Prayer in a Difficult Moment',
        text: 'Lord, do not leave me in the hour of trial,\nstrengthen my faith and give me the power to overcome every difficulty.\nHelp me not to lose heart, but to trust in Your will\nand mercy.\nAmen.'
      }
    ]
  }
} as const;

function ui(locale: keyof typeof uiText, key: keyof typeof uiText.ru) {
  return uiText[locale][key];
}

const DAILY_PRAYER_SAVE_KEY = 'ikona-daily-prayer-saved';
const speechLang = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-US' } as const;
const preferredMaleVoiceNames = [
  'alex',
  'daniel',
  'david',
  'fred',
  'guy',
  'mark',
  'microsoft dmitry',
  'microsoft pavel',
  'microsoft david',
  'microsoft mark',
  'microsoft guy',
  'google uk english male',
  'yuri',
  'dmitry',
  'pavel',
  'maxim',
  'taras',
  'ostap',
  'mykola'
];

const likelyFemaleVoiceNames = [
  'anna',
  'elena',
  'irina',
  'katya',
  'milena',
  'samantha',
  'tatyana',
  'victoria',
  'zira'
];

function todayPrayerIndex(total: number) {
  if (!total) return 0;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((Number(now) - Number(start)) / 86400000);
  return day % total;
}

function savedPrayerIds() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DAILY_PRAYER_SAVE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function prayerFileName(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9а-яёіїєґ]+/gi, '-').replace(/^-|-$/g, '') || 'prayer';
  return `${slug}.txt`;
}

function preferredSpeechVoice(locale: keyof typeof speechLang) {
  if (!('speechSynthesis' in window)) return null;

  const lang = speechLang[locale].toLowerCase();
  const language = lang.split('-')[0];
  const voices = window.speechSynthesis.getVoices();
  const localizedVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  const candidates = localizedVoices.length ? localizedVoices : voices;

  return candidates.find((voice) => {
    const name = voice.name.toLowerCase();
    return preferredMaleVoiceNames.some((maleName) => name.includes(maleName));
  }) || candidates.find((voice) => {
    const name = voice.name.toLowerCase();
    return voice.lang.toLowerCase().startsWith(language) && !likelyFemaleVoiceNames.some((femaleName) => name.includes(femaleName));
  }) || null;
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

export function DailyPrayerCollection() {
  const { locale } = useI18n();
  const content = dailyPrayerTexts[locale];
  const [selectedPrayerIndex, setSelectedPrayerIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [expandedPrayerIndex, setExpandedPrayerIndex] = useState<number | null>(null);
  const [fullscreenStatus, setFullscreenStatus] = useState('');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const selectedPrayer = content.prayers[selectedPrayerIndex] || content.prayers[0];
  const expandedPrayer = expandedPrayerIndex === null ? null : content.prayers[expandedPrayerIndex];
  const selectedPrayerId = `${locale}-${selectedPrayer.title}`;
  const isSaved = savedIds.includes(selectedPrayerId);

  useEffect(() => {
    setSelectedPrayerIndex(todayPrayerIndex(content.prayers.length));
    setSavedIds(savedPrayerIds());
  }, [content.prayers.length, locale]);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (expandedPrayerIndex === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedPrayerIndex(null);
        setFullscreenStatus('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedPrayerIndex]);

  const selectPrayer = (index: number) => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setStatusText('');
    setSelectedPrayerIndex(index);
  };

  const toggleSave = () => {
    const nextSaved = isSaved
      ? savedIds.filter((id) => id !== selectedPrayerId)
      : [...savedIds, selectedPrayerId];
    setSavedIds(nextSaved);
    window.localStorage.setItem(DAILY_PRAYER_SAVE_KEY, JSON.stringify(nextSaved));
  };

  const sharePrayer = async () => {
    const shareText = `${selectedPrayer.title}\n\n${selectedPrayer.text}`;
    const shareUrl = `${window.location.origin}${window.location.pathname}#daily-prayer`;
    try {
      if (navigator.share) {
        await navigator.share({ title: selectedPrayer.title, text: shareText, url: shareUrl });
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
        setStatusText(content.shareDone);
        window.setTimeout(() => setStatusText(''), 2600);
      }
    } catch {
      setStatusText('');
    }
  };

  const toggleListen = () => {
    if (!('speechSynthesis' in window)) {
      setStatusText(content.listenUnavailable);
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(`${selectedPrayer.title}. ${selectedPrayer.text.replace(/\n+/g, '. ')}`);
    const voice = preferredSpeechVoice(locale);
    if (voice) utterance.voice = voice;
    utterance.lang = speechLang[locale];
    utterance.rate = 0.9;
    utterance.pitch = 0.82;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const copyExpandedPrayer = async () => {
    if (!expandedPrayer) return;

    try {
      await navigator.clipboard.writeText(`${expandedPrayer.title}\n\n${expandedPrayer.text}`);
      setFullscreenStatus(content.copied);
      window.setTimeout(() => setFullscreenStatus(''), 2400);
    } catch {
      setFullscreenStatus('');
    }
  };

  const downloadExpandedPrayer = () => {
    if (!expandedPrayer) return;

    const blob = new Blob([`${expandedPrayer.title}\n\n${expandedPrayer.text}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = prayerFileName(expandedPrayer.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section id="daily-prayer" className="daily-prayer-collection">
      <div className="daily-prayer-intro">
        <p className="eyebrow">{ui(locale, 'prayer')}</p>
        <h2>{content.title}</h2>
        <p className="daily-prayer-lead">{content.lead}</p>
        <p>{content.intro}</p>
      </div>
      <article className="daily-prayer-reader">
        <div className="daily-prayer-reader-head">
          <div>
            <span>{content.todayLabel}</span>
            <h3>{content.dailyTitle}</h3>
          </div>
          <div className="daily-prayer-actions" aria-label={content.dailyTitle}>
            <button type="button" onClick={toggleSave}>{isSaved ? content.saved : content.save}</button>
            <button type="button" onClick={sharePrayer}>{content.share}</button>
            <button type="button" onClick={toggleListen}>{isSpeaking ? content.stop : content.listen}</button>
          </div>
        </div>
        <div className="daily-prayer-reader-body">
          <p className="daily-prayer-reader-kicker">{String(selectedPrayerIndex + 1).padStart(2, '0')}</p>
          <h3>{selectedPrayer.title}</h3>
          <p>{selectedPrayer.text}</p>
          {statusText ? <small>{statusText}</small> : null}
        </div>
      </article>
      <div className="daily-prayer-picker" aria-label={content.choosePrayer}>
        {content.prayers.map((prayer, index) => (
          <button
            key={prayer.title}
            type="button"
            className={index === selectedPrayerIndex ? 'active' : ''}
            onClick={() => selectPrayer(index)}
            aria-pressed={index === selectedPrayerIndex}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            {prayer.title}
          </button>
        ))}
      </div>
      <div className="daily-prayer-section-label">
        <span>{content.allPrayers}</span>
      </div>
      <div className="daily-prayer-grid">
        {content.prayers.map((prayer, index) => (
          <article
            className="daily-prayer-card"
            key={prayer.title}
            onClick={() => {
              setExpandedPrayerIndex(index);
              setFullscreenStatus('');
            }}
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{prayer.title}</h3>
            <p>{prayer.text}</p>
          </article>
        ))}
      </div>
      <div className="daily-prayer-footer">
        <p>{content.closing}</p>
        <small>{content.subscribe}</small>
      </div>
      {expandedPrayer ? (
        <div className="daily-prayer-fullscreen" role="dialog" aria-modal="true" aria-labelledby="daily-prayer-fullscreen-title">
          <article className="daily-prayer-fullscreen-panel">
            <div className="daily-prayer-fullscreen-top">
              <span>{String((expandedPrayerIndex ?? 0) + 1).padStart(2, '0')}</span>
              <button
                type="button"
                className="daily-prayer-fullscreen-close"
                onClick={() => {
                  setExpandedPrayerIndex(null);
                  setFullscreenStatus('');
                }}
              >
                {content.close}
              </button>
            </div>
            <div className="daily-prayer-fullscreen-reader">
              <h3 id="daily-prayer-fullscreen-title">{expandedPrayer.title}</h3>
              <p>{expandedPrayer.text}</p>
              {fullscreenStatus ? <small>{fullscreenStatus}</small> : null}
            </div>
            <div className="daily-prayer-fullscreen-actions">
              <button type="button" onClick={copyExpandedPrayer}>{content.copy}</button>
              <button type="button" onClick={downloadExpandedPrayer}>{content.download}</button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
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
