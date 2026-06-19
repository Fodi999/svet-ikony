import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Евангелие дня', description: 'Евангельское чтение дня и краткое объяснение.', path: '/gospel' });

export default async function GospelPage() {
  const gospel = await publicApi.gospelToday();
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{gospel.date}</p>
        <h1>{gospel.title}</h1>
        <p>{gospel.reference}</p>
      </section>
      <article className="sacred-panel prayer-panel">
        <span>Евангелие дня</span>
        <div className="reader-text"><p>{gospel.text}</p></div>
      </article>
      <article className="sacred-panel">
        <span>Объяснение</span>
        <div className="reader-text"><p>{gospel.explanation}</p></div>
      </article>
    </main>
  );
}
