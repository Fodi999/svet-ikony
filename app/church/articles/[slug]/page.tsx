import Link from 'next/link';
import { publicApi } from '@/lib/api';
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
  const result = await publicApi.churchArticle(slug, token);
  const page = result?.pageView;
  return pageMetadata({
    title: page?.seoTitle || page?.title,
    description: page?.seoDescription,
    path: `/church/articles/${slug}`,
    image: page?.imageUrl,
    keywords: page?.seoKeywords
  });
}

export default async function ChurchArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const result = await publicApi.churchArticle(slug, token);
  const page = result?.pageView;
  if (!page) return <main className="page"><h1>Статья не найдена</h1></main>;
  const date = result?.calendarDay?.dateNewStyle || result?.calendarDay?.dateOldStyle;
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{page.targetKeyword}</p>
        <h1>{page.h1}</h1>
        {page.seoDescription ? <p>{page.seoDescription}</p> : null}
      </section>
      <article className="sacred-panel">
        <span>Материал</span>
        <div className="reader-text"><Paragraphs text={page.content} /></div>
      </article>
      <section className="related-section">
        <div className="section-head"><p className="eyebrow">Связь материала</p><h2>День и икона</h2></div>
        <div className="mini-grid">
          {date ? <Link href={`/church/calendar/${date}`}>{result?.calendarDay?.title || date}<small>День календаря</small></Link> : null}
          {result?.icon ? <Link href={`/church/icons/${result.icon.slug}`}>{result.icon.title}<small>Икона</small></Link> : null}
        </div>
      </section>
    </main>
  );
}
