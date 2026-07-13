import { LocalizedIconDetail } from '@/components/site/LocalizedContent';
import { AssetButton } from '@/components/site/AssetButton';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { translate, type Locale } from '@/lib/i18n';
import { jsonLd, pageMetadata } from '@/lib/seo';
import type { CalendarDay, SeoPage } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Paragraphs({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
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
            <AssetButton variant="dark" href={day?.prayerSlug ? (day.detailHref?.startsWith('/church/') ? `/church/prayers/${day.prayerSlug}` : `/prayers/${day.prayerSlug}`) : '/prayers'}>{translate(locale, 'readPrayer')}</AssetButton>
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


export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const icon = await publicApi.icon(slug, locale);
  if (icon) return pageMetadata({ title: icon.seoTitle || icon.title, description: icon.seoDescription || icon.shortDescription, path: `/icons/${slug}`, image: icon.imageUrl, keywords: icon.seoKeywords });

  const content = await publicApi.content({ locale });
  const page = content.pages.find((item) => item.slug === slug);
  const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
  return pageMetadata({ title: page?.seoTitle || page?.title || day?.label, description: page?.seoDescription || day?.description, path: `/icons/${slug}`, image: page?.imageUrl || day?.imageUrl, keywords: page?.seoKeywords });
}

export default async function IconPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const content = await publicApi.content({ locale });
  const icon = content.icons.find((item) => item.slug === slug) || null;
  if (!icon) {
    const page = content.pages.find((item) => item.slug === slug);
    const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
    if (page || day) return <CalendarFallbackPage day={day} page={page} locale={locale} />;
    return <main className="page"><h1>{translate(locale, 'pageNotFound')}</h1></main>;
  }
  const related = content.icons.filter((item) => item.slug !== icon.slug).slice(0, 3);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('IconPage', { headline: icon.title, description: icon.shortDescription, image: icon.imageUrl })) }} />
      <LocalizedIconDetail icon={icon} related={related} />
    </>
  );
}
