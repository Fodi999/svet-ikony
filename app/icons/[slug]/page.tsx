import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { LocalizedIconDetail } from '@/components/site/LocalizedContent';
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
  Page,
  Panel,
  PanelLabel,
  ReaderText,
  RelatedSection,
  SectionHead,
  SectionHeadTitle
} from '@/components/site/PageChrome';
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

  const heroCopy = (
    <HeroCopy>
      <Eyebrow>{page?.targetKeyword || day?.note || translate(locale, 'churchCalendar')}</Eyebrow>
      <HeroTitle>{title}</HeroTitle>
      {description ? <Lead>{description}</Lead> : null}
      <DetailActions>
        <AssetButton variant="dark" href={day?.prayerSlug ? `/prayers/${day.prayerSlug}` : '/prayers'}>{translate(locale, 'readPrayer')}</AssetButton>
        <AssetButton href="/icons">{translate(locale, 'allIcons')}</AssetButton>
      </DetailActions>
    </HeroCopy>
  );

  return (
    <Page className="sacred-read-page">
      {imageUrl ? (
        <DetailHero>
          <ImageFrame>
            <StableImage src={imageUrl} alt={title} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
          </ImageFrame>
          {heroCopy}
        </DetailHero>
      ) : (
        <Hero>{heroCopy}</Hero>
      )}
      {content ? (
        <Panel>
          <PanelLabel>{translate(locale, 'material')}</PanelLabel>
          <ReaderText><Paragraphs text={content} /></ReaderText>
        </Panel>
      ) : null}
    </Page>
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
          <RelatedSection>
            <SectionHead>
              <Eyebrow>{translate(locale, 'calendarMaterial')}</Eyebrow>
              <SectionHeadTitle>{translate(locale, 'churchCalendar')}</SectionHeadTitle>
            </SectionHead>
            <MiniGrid>
              {date ? (
                <MiniGridLink href={withLocale(`/church/calendar/${date}`, locale)}>
                  {page.calendarDay?.title || date}
                  <MiniGridSmall>{translate(locale, 'churchCalendar')}</MiniGridSmall>
                </MiniGridLink>
              ) : null}
              {page.prayers.map((prayer) => (
                <MiniGridLink key={prayer.id} href={withLocale(`/prayers/${prayer.slug}`, locale)}>
                  {prayer.title}
                  <MiniGridSmall>{translate(locale, 'navPrayers')}</MiniGridSmall>
                </MiniGridLink>
              ))}
              {page.articles.map((article) => (
                <MiniGridLink key={article.id} href={withLocale(`/church/articles/${article.slug}`, locale)}>
                  {article.title}
                  <MiniGridSmall>{translate(locale, 'material')}</MiniGridSmall>
                </MiniGridLink>
              ))}
              {page.gospel.map((item) => (
                <MiniGridLink key={item.id} href={withLocale(`/church/gospel/${item.slug}`, locale)}>
                  {item.title}
                  <MiniGridSmall>{translate(locale, 'navGospel')}</MiniGridSmall>
                </MiniGridLink>
              ))}
            </MiniGrid>
          </RelatedSection>
        ) : null}
      </>
    );
  }

  if (page) {
    const translations = page.translations || [];
    return (
      <Page>
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/icons', label: translate(locale, 'navIcons') }]}
          current={translations[0]?.title || slug}
        />
        <Hero>
          <Eyebrow>{translate(locale, 'navIcons')}</Eyebrow>
          <HeroTitle>{translate(locale, 'iconNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/icons/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/icons" label={translate(locale, 'navIcons')} />
      </Page>
    );
  }

  const content = await publicApi.content({ locale });
  const legacy = content.icons.find((item) => item.slug === slug) || null;
  if (!legacy) {
    const seoPage = content.pages.find((item) => item.slug === slug);
    const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
    if (seoPage || day) return <CalendarFallbackPage day={day} page={seoPage} locale={locale} />;
    return <Page><h1>{translate(locale, 'pageNotFound')}</h1></Page>;
  }
  const related = content.icons.filter((item) => item.slug !== legacy.slug).slice(0, 3);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('IconPage', { headline: legacy.title, description: legacy.shortDescription, image: legacy.imageUrl })) }} />
      <LocalizedIconDetail icon={legacy} related={related} />
    </>
  );
}
