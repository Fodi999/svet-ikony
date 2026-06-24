import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Paragraphs({ text }: { text?: string }) {
  const parts = (text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean);
  return (
    <>
      {parts.map((part) => {
        const heading = part.match(/^\*\*(.+)\*\*$/);
        return heading ? <h3 key={part}>{heading[1]}</h3> : <p key={part}>{part}</p>;
      })}
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
      <article className="sacred-panel prayer-panel prayer-reader-panel">
        <div className={prayer.imageUrl ? 'prayer-panel-layout' : ''}>
          {prayer.imageUrl ? (
            <figure className="prayer-panel-image">
              <img src={prayer.imageUrl} alt={prayer.title} />
            </figure>
          ) : null}
          <div className="prayer-panel-copy">
            <span>Молитва</span>
            <div className="reader-text prayer-reader"><Paragraphs text={prayer.text} /></div>
            {prayer.audioUrl ? <audio controls src={prayer.audioUrl} /> : null}
          </div>
        </div>
      </article>
    </main>
  );
}
