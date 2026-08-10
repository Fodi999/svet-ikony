import { notFound } from 'next/navigation';
import {
  Eyebrow,
  Hero,
  HeroTitle,
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
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { pageMetadata } from '@/lib/seo';

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
  return pageMetadata({
    title: gospel?.title,
    description: gospel?.explanation?.slice(0, 180) || gospel?.text?.slice(0, 180),
    path: `/church/gospel/${slug}`,
    locale
  });
}

export default async function ChurchGospelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchGospel(slug, token, locale);
  const gospel = result?.gospel;
  if (!gospel) notFound();
  const date = result?.calendarDay?.dateNewStyle || result?.calendarDay?.dateOldStyle;
  return (
    <Page className="sacred-read-page">
      <Hero>
        <Eyebrow>{gospel.reference || 'Євангеліє'}</Eyebrow>
        <HeroTitle>{gospel.title}</HeroTitle>
      </Hero>
      {/* sacred-panel/reader-text stay literal here (not <Panel>/<ReaderText>):
          prayer-reader-panel/prayer-reader add their own highlighted-reading
          treatment on top (prayer-mode.css), kept as a marker since
          LocalizedChurchPrayerDetail's split-visualizer layout also depends
          on it via a compound selector — see phase 7b/8 notes in the plan. */}
      <article className="sacred-panel prayer-reader-panel">
        <span>Читання</span>
        <div className="reader-text prayer-reader"><Paragraphs text={gospel.text} /></div>
      </article>
      {gospel.explanation ? (
        <Panel>
          <PanelLabel>Пояснення</PanelLabel>
          <ReaderText><Paragraphs text={gospel.explanation} /></ReaderText>
        </Panel>
      ) : null}
      <RelatedSection>
        <SectionHead>
          <Eyebrow>Связь материала</Eyebrow>
          <SectionHeadTitle>Икона и день календаря</SectionHeadTitle>
        </SectionHead>
        <MiniGrid>
          {result?.icon ? (
            <MiniGridLink href={`/icons/${result.icon.slug}`}>
              {result.icon.title}
              <MiniGridSmall>Икона</MiniGridSmall>
            </MiniGridLink>
          ) : null}
          {date ? (
            <MiniGridLink href={`/church/calendar/${date}`}>
              {result?.calendarDay?.title || date}
              <MiniGridSmall>День календаря</MiniGridSmall>
            </MiniGridLink>
          ) : null}
        </MiniGrid>
      </RelatedSection>
    </Page>
  );
}
