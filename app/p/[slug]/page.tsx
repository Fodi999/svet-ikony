import { publicApi } from '@/lib/api';
import { jsonLd, pageMetadata } from '@/lib/seo';

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
  const page = await publicApi.seoPage(slug);
  return pageMetadata({ title: page?.seoTitle || page?.title, description: page?.seoDescription || page?.content.slice(0, 150), path: `/p/${slug}`, image: page?.imageUrl, keywords: page?.seoKeywords });
}

export default async function SeoLandingPage({ params }: Props) {
  const { slug } = await params;
  const page = await publicApi.seoPage(slug);
  if (!page) return <main className="page"><h1>Страница не найдена</h1></main>;
  return (
    <main className="read-page sacred-read-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Article', { headline: page.h1, description: page.seoDescription, image: page.imageUrl })) }} />
      <section className={page.imageUrl ? 'sacred-detail-hero' : 'read-hero'}>
        {page.imageUrl ? (
          <figure className="sacred-image-frame">
            <img src={page.imageUrl} alt={page.title} />
          </figure>
        ) : null}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{page.targetKeyword || page.pageType}</p>
          <h1>{page.h1}</h1>
          <p className="detail-lead">{page.seoDescription || page.title}</p>
        </div>
      </section>
      <article className="sacred-panel">
        <span>Материал</span>
        <div className="reader-text"><Paragraphs text={page.content} /></div>
      </article>
      {page.blocks?.length ? (
        <div className="feature-grid content-feature-grid">{page.blocks.map((block, index) => <article key={block}><span>{String(index + 1).padStart(2, '0')}</span><h3>{block}</h3><p>Материал для SEO-страницы и внутренней перелинковки.</p></article>)}</div>
      ) : null}
      {page.faq?.length ? <section className="faq">{page.faq.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section> : null}
    </main>
  );
}
