import Link from 'next/link';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedIconDetail } from '@/components/site/LocalizedContent';
import { AssetButton } from '@/components/site/AssetButton';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { localeNames, translate, withLocale, type Locale } from '@/lib/i18n';
import { jsonLd, pageMetadata } from '@/lib/seo';
import type { CalendarDay, SeoPage } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Paragraphs({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
    </>
  );
}

function displayText(value?: string) {
  return (value || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function CalendarFallbackPage({ day, page, locale }: { day?: CalendarDay; page?: SeoPage; locale: Locale }) {
  const title = displayText(page?.h1 || day?.label || translate(locale, 'calendarMaterial'));
  const description = page?.seoDescription || day?.description || day?.note || '';
  const imageUrl = page?.imageUrl || day?.imageUrl || '';
  const content = page?.content || day?.description || day?.note || '';

  return (
    <main className="read-page sacred-read-page">
      <section className={imageUrl ? 'sacred-detail-hero' : 'read-hero'}>
        {imageUrl ? (
          <figure className="sacred-image-frame">
            <StableImage src={imageUrl} alt={title} width={800} height={1000} loading="eager" />
          </figure>
        ) : null}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{page?.targetKeyword || day?.note || translate(locale, 'churchCalendar')}</p>
          <h1>{title}</h1>
          {description ? <p className="detail-lead">{description}</p> : null}
          <div className="detail-actions">
            <AssetButton variant="dark" href={day?.prayerSlug ? `/prayers/${day.prayerSlug}` : '/prayers'}>{translate(locale, 'readPrayer')}</AssetButton>
            <AssetButton href="/icons">{translate(locale, 'allIcons')}</AssetButton>
          </div>
        </div>
      </section>
      {content ? (
        <article className="sacred-panel">
          <span>{translate(locale, 'material')}</span>
          <div className="reader-text"><Paragraphs text={content} /></div>
        </article>
      ) : null}
    </main>
  );
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchIcon(slug, token, locale);
  if (page?.iconView) {
    const icon = page.iconView;
    return pageMetadata({
      title: icon.seoTitle || icon.title,
      description: icon.seoDescription || icon.shortDescription,
      path: `/icons/${icon.slug}`,
      image: icon.imageUrl,
      keywords: icon.seoKeywords,
      locale
    });
  }
  if (page) {
    return {
      ...pageMetadata({ title: translate(locale, 'pageNotFound'), path: `/icons/${slug}`, locale }),
      robots: { index: false }
    };
  }

  const content = await publicApi.content({ locale });
  const legacy = content.icons.find((item) => item.slug === slug);
  if (legacy) return pageMetadata({ title: legacy.seoTitle || legacy.title, description: legacy.seoDescription || legacy.shortDescription, path: `/icons/${slug}`, image: legacy.imageUrl, keywords: legacy.seoKeywords, locale });
  const seoPage = content.pages.find((item) => item.slug === slug);
  const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
  return pageMetadata({ title: seoPage?.seoTitle || seoPage?.title || day?.label, description: seoPage?.seoDescription || day?.description, path: `/icons/${slug}`, image: seoPage?.imageUrl || day?.imageUrl, keywords: seoPage?.seoKeywords, locale });
}

export default async function IconPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchIcon(slug, token, locale);

  if (page?.iconView) {
    const icon = page.iconView;
    const date = page.calendarDay?.dateNewStyle || page.calendarDay?.dateOldStyle;
    const hasRelated = Boolean(date || page.prayers.length || page.articles.length || page.gospel.length);
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('IconPage', { headline: icon.title, description: icon.shortDescription, image: icon.imageUrl })) }} />
        <LocalizedIconDetail icon={icon} related={[]} />
        {hasRelated ? (
          <section className="related-section">
            <div className="section-head"><p className="eyebrow">{translate(locale, 'calendarMaterial')}</p><h2>{translate(locale, 'churchCalendar')}</h2></div>
            <div className="mini-grid">
              {date ? <Link href={withLocale(`/church/calendar/${date}`, locale)}>{page.calendarDay?.title || date}<small>{translate(locale, 'churchCalendar')}</small></Link> : null}
              {page.prayers.map((prayer) => <Link key={prayer.id} href={withLocale(`/prayers/${prayer.slug}`, locale)}>{prayer.title}<small>{translate(locale, 'navPrayers')}</small></Link>)}
              {page.articles.map((article) => <Link key={article.id} href={withLocale(`/church/articles/${article.slug}`, locale)}>{article.title}<small>{translate(locale, 'material')}</small></Link>)}
              {page.gospel.map((item) => <Link key={item.id} href={withLocale(`/church/gospel/${item.slug}`, locale)}>{item.title}<small>{translate(locale, 'navGospel')}</small></Link>)}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  if (page) {
    const translations = page.translations || [];
    return (
      <main className="page">
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/icons', label: translate(locale, 'navIcons') }]}
          current={translations[0]?.title || slug}
        />
        <section className="page-hero">
          <p className="eyebrow">{translate(locale, 'navIcons')}</p>
          <h1>{translate(locale, 'iconNoTranslation')}</h1>
          {translations.length ? <p>{translate(locale, 'prayerOpenIn')}</p> : null}
        </section>
        {translations.length ? (
          <div className="mini-grid">
            {translations.map((item) => (
              <Link key={item.language} href={withLocale(`/icons/${item.slug}`, item.language)}>
                {item.title}<small>{localeNames[item.language]}</small>
              </Link>
            ))}
          </div>
        ) : null}
        <BackLink href="/icons" label={translate(locale, 'navIcons')} />
      </main>
    );
  }

  const content = await publicApi.content({ locale });
  const legacy = content.icons.find((item) => item.slug === slug) || null;
  if (!legacy) {
    const seoPage = content.pages.find((item) => item.slug === slug);
    const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
    if (seoPage || day) return <CalendarFallbackPage day={day} page={seoPage} locale={locale} />;
    return <main className="page"><h1>{translate(locale, 'pageNotFound')}</h1></main>;
  }
  const related = content.icons.filter((item) => item.slug !== legacy.slug).slice(0, 3);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('IconPage', { headline: legacy.title, description: legacy.shortDescription, image: legacy.imageUrl })) }} />
      <LocalizedIconDetail icon={legacy} related={related} />
    </>
  );
}
