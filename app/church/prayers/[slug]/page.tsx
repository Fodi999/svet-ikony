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
  const result = await publicApi.churchPrayer(slug, token);
  const prayer = result?.prayer;
  return pageMetadata({
    title: prayer?.title,
    description: prayer?.text?.slice(0, 180),
    path: `/church/prayers/${slug}`
  });
}

export default async function ChurchPrayerPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const result = await publicApi.churchPrayer(slug, token);
  const prayer = result?.prayer;
  if (!prayer) return <main className="page"><h1>Молитва не найдена</h1></main>;
  const date = result?.calendarDay?.dateNewStyle || result?.calendarDay?.dateOldStyle;
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{prayer.prayerType}</p>
        <h1>{prayer.title}</h1>
      </section>
      <article className="sacred-panel prayer-panel prayer-reader-panel">
        <span>Молитва</span>
        <div className="reader-text prayer-reader"><Paragraphs text={prayer.text} /></div>
      </article>
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
