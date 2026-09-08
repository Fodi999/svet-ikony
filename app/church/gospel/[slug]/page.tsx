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
  const result = await publicApi.churchGospel(slug, token, locale);
  const gospel = result?.gospel;
  if (!gospel) {
    return {
      ...pageMetadata({ title: translate(locale, 'gospelNotFound'), path: `/church/gospel/${slug}`, locale, languages: alternateLanguagesFromRefs('/church/gospel', result?.translations || []) }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: gospel.title,
    description: gospel.explanation?.slice(0, 180) || gospel.text?.slice(0, 180),
    path: `/church/gospel/${slug}`,
    locale,
    // No translation_group_id here either -- see app/church/articles/[slug]/page.tsx's identical comment.
    languages: alternateLanguagesFromRefs('/church/gospel', result.translations || [], { locale, slug })
  });
}

export default async function ChurchGospelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchGospel(slug, token, locale);
  if (!result) notFound();

  const gospel = result.gospel;
  if (!gospel) {
    const translations = result.translations || [];
    return (
      <Page>
        <Hreflang locale={locale} path={`/church/gospel/${slug}`} languages={alternateLanguagesFromRefs('/church/gospel', translations)} />
        <Breadcrumbs items={[{ href: '/', label: translate(locale, 'home') }, { href: '/gospel', label: translate(locale, 'navGospel') }]} current={translations[0]?.title || slug} />
        <Hero>
          <Eyebrow>{translate(locale, 'navGospel')}</Eyebrow>
          <HeroTitle>{translate(locale, 'gospelNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/church/gospel/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/gospel" label={translate(locale, 'navGospel')} />
      </Page>
    );
  }

  const date = result.calendarDay?.dateNewStyle || result.calendarDay?.dateOldStyle;
  return (
    <ReadPage>
      <Hreflang locale={locale} path={`/church/gospel/${slug}`} languages={alternateLanguagesFromRefs('/church/gospel', result.translations || [], { locale, slug })} />
      <Hero>
        <Eyebrow>{gospel.reference || translate(locale, 'navGospel')}</Eyebrow>
        <HeroTitle>{gospel.title}</HeroTitle>
      </Hero>
      {/* Replicates prayer-mode.css's `.prayer-reader-panel`/`.prayer-reader`
          treatment directly (same visual system as LocalizedChurchPrayerDetail's
          reader panel, without the split-visualizer toggle this page doesn't have). */}
      <article className="min-w-0 min-h-[clamp(380px,31vw,560px)] max-[560px]:min-h-0 p-[clamp(28px,3vw,50px)] max-[560px]:p-[22px_18px] bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_44%),linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,0)),rgba(14,15,12,.82)] shadow-[inset_0_0_0_1px_rgba(233,203,132,.055),0_18px_50px_rgba(0,0,0,.26)]">
        <span className="block w-max max-w-full text-gold-light font-serif text-[clamp(18px,1.35vw,24px)] font-normal tracking-normal leading-[1.35] normal-case">{translate(locale, 'gospelReadingLabel')}</span>
        <div className="max-w-full text-[#e9dfcd] font-serif text-[clamp(18px,1.18vw,22px)] leading-[1.62] [&>p]:mt-0 [&>p]:mb-[clamp(16px,1.8vw,28px)] [&>p:last-child]:mb-0 [&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:mr-[.18em] [&>p:first-of-type]:first-letter:mt-[.07em] [&>p:first-of-type]:first-letter:text-gold-light [&>p:first-of-type]:first-letter:text-[3.1em] [&>p:first-of-type]:first-letter:leading-[.84]">
          <Paragraphs text={gospel.text} />
        </div>
      </article>
      {gospel.explanation ? (
        <Panel>
          <PanelLabel>{translate(locale, 'gospelExplanationLabel')}</PanelLabel>
          <ReaderText><Paragraphs text={gospel.explanation} /></ReaderText>
        </Panel>
      ) : null}
      <RelatedSection>
        <SectionHead>
          <Eyebrow>{translate(locale, 'relatedMaterialLabel')}</Eyebrow>
          <SectionHeadTitle>{translate(locale, 'gospelRelatedSectionTitle')}</SectionHeadTitle>
        </SectionHead>
        <MiniGrid>
          {result.icon ? (
            <MiniGridLink href={withLocale(`/icons/${result.icon.slug}`, locale)}>
              {result.icon.title}
              <MiniGridSmall>{translate(locale, 'navIcons')}</MiniGridSmall>
            </MiniGridLink>
          ) : null}
          {date ? (
            <MiniGridLink href={withLocale(`/church/calendar/${date}`, locale)}>
              {result.calendarDay?.title || date}
              <MiniGridSmall>{translate(locale, 'churchCalendar')}</MiniGridSmall>
            </MiniGridLink>
          ) : null}
        </MiniGrid>
      </RelatedSection>
    </ReadPage>
  );
}
