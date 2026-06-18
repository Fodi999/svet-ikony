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
  const saint = await publicApi.saint(slug);
  return pageMetadata({ title: saint?.seoTitle || saint?.name, description: saint?.seoDescription || saint?.shortDescription, path: `/saints/${slug}` });
}

export default async function SaintPage({ params }: Props) {
  const { slug } = await params;
  const saint = await publicApi.saint(slug);
  if (!saint) return <main className="page"><h1>Святой не найден</h1></main>;
  return (
    <main className="detail-page">
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame">
          <img src={saint.imageUrl} alt={saint.name} />
        </figure>
        <div className="sacred-hero-copy">
          <p className="eyebrow">День памяти: {saint.feastDay}</p>
          <h1>{saint.name}</h1>
          <p className="detail-lead">{saint.shortDescription}</p>
          <div className="soft-note"><Paragraphs text={saint.biography} /></div>
        </div>
      </section>
    </main>
  );
}
