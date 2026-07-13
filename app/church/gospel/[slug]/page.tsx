import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{gospel.reference || 'Євангеліє'}</p>
        <h1>{gospel.title}</h1>
      </section>
      <article className="sacred-panel prayer-reader-panel">
        <span>Читання</span>
        <div className="reader-text prayer-reader"><Paragraphs text={gospel.text} /></div>
      </article>
      {gospel.explanation ? (
        <article className="sacred-panel">
          <span>Пояснення</span>
          <div className="reader-text"><Paragraphs text={gospel.explanation} /></div>
        </article>
      ) : null}
      <section className="related-section">
        <div className="section-head"><p className="eyebrow">Связь материала</p><h2>Икона и день календаря</h2></div>
        <div className="mini-grid">
          {result?.icon ? <Link href={`/church/icons/${result.icon.slug}`}>{result.icon.title}<small>Икона</small></Link> : null}
          {date ? <Link href={`/church/calendar/${date}`}>{result?.calendarDay?.title || date}<small>День календаря</small></Link> : null}
        </div>
      </section>
    </main>
  );
}
