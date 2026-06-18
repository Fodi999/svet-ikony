import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

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

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const prayer = await publicApi.prayer(slug);
  return pageMetadata({ title: prayer?.seoTitle || prayer?.title, description: prayer?.seoDescription || prayer?.text.slice(0, 150), path: `/prayers/${slug}` });
}

export default async function PrayerPage({ params }: Props) {
  const { slug } = await params;
  const prayer = await publicApi.prayer(slug);
  if (!prayer) return <main className="page"><h1>Молитва не найдена</h1></main>;
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{prayer.category}</p>
        <h1>{prayer.title}</h1>
        <p>Текст для внимательного чтения перед иконой, дома или в храме.</p>
      </section>
      <article className="sacred-panel prayer-panel">
        <span>Молитва</span>
        <div className="reader-text"><Paragraphs text={prayer.text} /></div>
        {prayer.audioUrl ? <audio controls src={prayer.audioUrl} /> : null}
      </article>
    </main>
  );
}
