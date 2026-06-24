import Link from 'next/link';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Православные молитвы', description: 'Список молитв для чтения перед иконами.', path: '/prayers' });

export default async function PrayersPage() {
  const prayers = await publicApi.prayers();
  return (
    <main className="page">
      <section className="page-hero">
        <p className="eyebrow"><T k="prayersPageEyebrow" /></p>
        <h1><T k="prayersPageTitle" /></h1>
      </section>
      <div className="list-grid">
        {prayers.map((prayer) => (
          <Link className="prayer-list-card" key={prayer.id} href={`/prayers/${prayer.slug}`}>
            {prayer.imageUrl ? <img src={prayer.imageUrl} alt={prayer.title} /> : null}
            <span>{prayer.category}</span>
            <strong>{prayer.title}</strong>
            <p>{prayer.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
