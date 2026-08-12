import { notFound } from 'next/navigation';
import {
  Eyebrow,
  Hero,
  HeroTitle,
  Lead,
  MiniGrid,
  MiniGridLink,
  MiniGridSmall,
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
  const result = await publicApi.churchArticle(slug, token, locale);
  const page = result?.pageView;
  return pageMetadata({
    title: page?.seoTitle || page?.title,
    description: page?.seoDescription,
    path: `/church/articles/${slug}`,
    image: page?.imageUrl,
    keywords: page?.seoKeywords,
    locale
  });
}

export default async function ChurchArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchArticle(slug, token, locale);
  const page = result?.pageView;
  if (!page) notFound();
  const date = result?.calendarDay?.dateNewStyle || result?.calendarDay?.dateOldStyle;
  return (
    <ReadPage>
      <Hero>
        <Eyebrow>{page.targetKeyword}</Eyebrow>
        <HeroTitle>{page.h1}</HeroTitle>
        {page.seoDescription ? <Lead>{page.seoDescription}</Lead> : null}
      </Hero>
      <Panel>
        <PanelLabel>Материал</PanelLabel>
        <ReaderText><Paragraphs text={page.content} /></ReaderText>
      </Panel>
      <RelatedSection>
        <SectionHead>
          <Eyebrow>Связь материала</Eyebrow>
          <SectionHeadTitle>День и икона</SectionHeadTitle>
        </SectionHead>
        <MiniGrid>
          {date ? (
            <MiniGridLink href={`/church/calendar/${date}`}>
              {result?.calendarDay?.title || date}
              <MiniGridSmall>День календаря</MiniGridSmall>
            </MiniGridLink>
          ) : null}
          {result?.icon ? (
            <MiniGridLink href={`/icons/${result.icon.slug}`}>
              {result.icon.title}
              <MiniGridSmall>Икона</MiniGridSmall>
            </MiniGridLink>
          ) : null}
        </MiniGrid>
      </RelatedSection>
    </ReadPage>
  );
}
