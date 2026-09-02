import { notFound } from 'next/navigation';
import { AssetButton } from '@/components/site/AssetButton';
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
  Panel,
  PanelLabel,
  PanelTitle,
  ReaderText,
  ReadPage,
  RelatedSection,
  SectionHead,
  SectionHeadTitle
} from '@/components/site/PageChrome';
import { StableImage } from '@/components/site/StableImage';
import { composeCalendarPages, type PublicChurchContentPage } from '@/lib/church-public/calendar-page';
import { isValidPreview } from '@/lib/church-public/preview';
import { listCalendarDays } from '@/lib/d1/repositories/calendarDays';
import { resolveMediaUrl } from '@/lib/media/resolver';
import { getRequestLocale } from '@/lib/serverLocale';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

type Props = {
  params: Promise<{ date: string }>;
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

/**
 * Loads this page's data with a direct D1 repository call (same pattern
 * app/page.tsx's homepage grid already uses) rather than the self-
 * referencing HTTP fetch this page used to make (`publicApi.churchCalendarDay`
 * -> `apiGet` -> `fetch(absoluteSiteUrl(...))`). That self-fetch depends on
 * `SITE_URL` being correctly set and the Worker successfully reaching its
 * own public origin on every single page render -- when it isn't (as found
 * during the Content Plan Stage 3A architecture audit), the fetch throws,
 * is silently swallowed by `apiGet`'s `catch { return fallback }`, and this
 * page 404s even though `/api/church/calendar/:date` itself returns 200 for
 * the same date. This removes that failure mode for this page entirely; the
 * JSON API route stays as-is for its other callers (e.g. a future public
 * client-side fetch), now with the same `status` gating applied below.
 */
async function loadCalendarDayContent(date: string, previewToken: string | undefined, language: string): Promise<PublicChurchContentPage | null> {
  const preview = await isValidPreview(previewToken);
  const allDays = await listCalendarDays({});
  const day = allDays.find((item) => item.dateNewStyle === date || item.dateOldStyle === date);
  if (!day || (day.status !== 'published' && !preview)) return null;

  const [page] = await composeCalendarPages([day], language, { preview });
  return page ?? null;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { date } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const content = await loadCalendarDayContent(date, token, locale);
  const day = content?.calendarDay;
  const image = resolveMediaUrl(day?.imageUrl) || content?.icons[0]?.imageUrl;
  return pageMetadata({
    title: day?.seoTitle || day?.title,
    description: day?.seoDescription || day?.description || day?.history?.replace(/\s+/g, ' ').trim().slice(0, 180),
    path: `/church/calendar/${date}`,
    image,
    locale
  });
}

export default async function ChurchCalendarDayPage({ params, searchParams }: Props) {
  const { date } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const content = await loadCalendarDayContent(date, token, locale);

  if (!content) notFound();

  const { calendarDay, icons, prayers, articles, gospel } = content;
  const heroIcon = icons[0];
  const heroImageUrl = resolveMediaUrl(calendarDay.imageUrl) || heroIcon?.imageUrl || '';
  const heroImageAlt = calendarDay.imageUrl ? calendarDay.title : heroIcon?.title || calendarDay.title;
  const canonicalUrl = `${siteUrl}/${locale}/church/calendar/${date}`;
  const structuredData = jsonLd('Article', {
    headline: calendarDay.title,
    description: calendarDay.description || calendarDay.history?.replace(/\s+/g, ' ').trim().slice(0, 180),
    image: heroImageUrl ? [heroImageUrl] : undefined,
    datePublished: calendarDay.createdAt,
    dateModified: calendarDay.updatedAt,
    inLanguage: locale,
    mainEntityOfPage: canonicalUrl,
    temporalCoverage: calendarDay.dateNewStyle || calendarDay.dateOldStyle || date,
    about: calendarDay.title
  });

  const heroCopy = (
    <HeroCopy>
      <Eyebrow>
        Дата церковного календаря: <time dateTime={calendarDay.dateNewStyle || calendarDay.dateOldStyle || date}>{calendarDay.dateNewStyle || calendarDay.dateOldStyle || date}</time>
      </Eyebrow>
      <HeroTitle>{calendarDay.title}</HeroTitle>
      {calendarDay.description ? <Lead>{calendarDay.description}</Lead> : null}
      <DetailActions>
        {icons[0] ? <AssetButton variant="dark" href={`/icons/${icons[0].slug}`}>Ікона</AssetButton> : null}
        {prayers[0] ? <AssetButton href={`/church/prayers/${prayers[0].slug}`}>Молитва</AssetButton> : null}
        {gospel[0] ? <AssetButton href={`/church/gospel/${gospel[0].slug}`}>Євангеліє</AssetButton> : null}
      </DetailActions>
    </HeroCopy>
  );

  return (
    <ReadPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      {heroImageUrl ? (
        <DetailHero>
          <ImageFrame>
            <StableImage src={heroImageUrl} alt={heroImageAlt} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
          </ImageFrame>
          {heroCopy}
        </DetailHero>
      ) : (
        <Hero>{heroCopy}</Hero>
      )}

      {calendarDay.history ? (
        <Panel>
          <PanelLabel>Історична довідка</PanelLabel>
          <PanelTitle>Житіє і пам’ять</PanelTitle>
          <ReaderText><Paragraphs text={calendarDay.history} /></ReaderText>
        </Panel>
      ) : null}

      {icons.length ? (
        <RelatedSection>
          <SectionHead>
            <Eyebrow>Ікони</Eyebrow>
            <SectionHeadTitle>Пов’язані образи</SectionHeadTitle>
          </SectionHead>
          <MiniGrid>
            {icons.map((icon) => (
              <MiniGridLink key={icon.id} href={`/icons/${icon.slug}`}>
                {icon.title}
                <MiniGridSmall>{icon.saintName || icon.feastName}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        </RelatedSection>
      ) : null}

      {prayers.map((prayer) => (
        <Panel key={prayer.id}>
          <PanelLabel>{prayer.prayerType}</PanelLabel>
          <PanelTitle>{prayer.title}</PanelTitle>
          <ReaderText><Paragraphs text={prayer.text} /></ReaderText>
        </Panel>
      ))}

      {articles.map((article) => (
        <Panel key={article.id}>
          <PanelLabel>Статья</PanelLabel>
          <PanelTitle>{article.title}</PanelTitle>
          <ReaderText><Paragraphs text={article.content} /></ReaderText>
          <DetailActions>
            <AssetButton href={`/church/articles/${article.slug}`}>Відкрити статтю</AssetButton>
          </DetailActions>
        </Panel>
      ))}

      {gospel.map((item) => (
        <Panel key={item.id}>
          <PanelLabel>{item.reference || 'Евангелие'}</PanelLabel>
          <PanelTitle>{item.title}</PanelTitle>
          <ReaderText><Paragraphs text={item.explanation || item.text} /></ReaderText>
          <DetailActions>
            <AssetButton href={`/church/gospel/${item.slug}`}>Читати Євангеліє</AssetButton>
          </DetailActions>
        </Panel>
      ))}
    </ReadPage>
  );
}
