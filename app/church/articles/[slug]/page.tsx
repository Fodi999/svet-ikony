import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { Hreflang } from '@/components/site/Hreflang';
import {
  Eyebrow,
  Hero,
  HeroTitle,
  Lead,
  MiniGrid,
  MiniGridLink,
  MiniGridSmall,
  Page,
  Panel,
  PanelLabel,
  ReaderText,
  ReadPage,
  RelatedSection,
  SectionHead,
  SectionHeadTitle
} from '@/components/site/PageChrome';
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { localeNames, translate, withLocale } from '@/lib/i18n';
import { alternateLanguagesFromRefs, pageMetadata } from '@/lib/seo';

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

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchArticle(slug, token, locale);
  const page = result?.pageView;
  if (!page) {
    return {
      ...pageMetadata({ title: translate(locale, 'articleNotFound'), path: `/church/articles/${slug}`, locale, languages: alternateLanguagesFromRefs('/church/articles', result?.translations || []) }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    path: `/church/articles/${slug}`,
    image: page.imageUrl,
    keywords: page.seoKeywords,
    locale,
    // Unlike icons/saints/prayers/alphabet, articles have no
    // translation_group_id -- siblings are grouped by slug only (see
    // app/api/church/articles/[slug]/route.ts), so every published
    // sibling really does live at this exact slug. Still only advertise
    // the languages `translations` actually lists -- a language with no
    // row at all must not be assumed to exist.
    languages: alternateLanguagesFromRefs('/church/articles', result.translations || [], { locale, slug })
  });
}

export default async function ChurchArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchArticle(slug, token, locale);
  if (!result) notFound();

  const page = result.pageView;
  if (!page) {
    const translations = result.translations || [];
    return (
      <Page>
        <Hreflang locale={locale} path={`/church/articles/${slug}`} languages={alternateLanguagesFromRefs('/church/articles', translations)} />
        <Breadcrumbs items={[{ href: '/', label: translate(locale, 'home') }]} current={translations[0]?.title || slug} />
        <Hero>
          <Eyebrow>{translate(locale, 'relatedMaterialLabel')}</Eyebrow>
          <HeroTitle>{translate(locale, 'articleNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/church/articles/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/" label={translate(locale, 'home')} />
      </Page>
    );
  }

  const date = result.calendarDay?.dateNewStyle || result.calendarDay?.dateOldStyle;
  return (
    <ReadPage>
      <Hreflang locale={locale} path={`/church/articles/${slug}`} languages={alternateLanguagesFromRefs('/church/articles', result.translations || [], { locale, slug })} />
      <Hero>
        <Eyebrow>{page.targetKeyword}</Eyebrow>
        <HeroTitle>{page.h1}</HeroTitle>
        {page.seoDescription ? <Lead>{page.seoDescription}</Lead> : null}
      </Hero>
      <Panel>
        <PanelLabel>{translate(locale, 'material')}</PanelLabel>
        <ReaderText><Paragraphs text={page.content} /></ReaderText>
      </Panel>
      <RelatedSection>
        <SectionHead>
          <Eyebrow>{translate(locale, 'relatedMaterialLabel')}</Eyebrow>
          <SectionHeadTitle>{translate(locale, 'articleRelatedSectionTitle')}</SectionHeadTitle>
        </SectionHead>
        <MiniGrid>
          {date ? (
            <MiniGridLink href={withLocale(`/church/calendar/${date}`, locale)}>
              {result.calendarDay?.title || date}
              <MiniGridSmall>{translate(locale, 'churchCalendar')}</MiniGridSmall>
            </MiniGridLink>
          ) : null}
          {result.icon ? (
            <MiniGridLink href={withLocale(`/icons/${result.icon.slug}`, locale)}>
              {result.icon.title}
              <MiniGridSmall>{translate(locale, 'navIcons')}</MiniGridSmall>
            </MiniGridLink>
          ) : null}
        </MiniGrid>
      </RelatedSection>
    </ReadPage>
  );
}
