import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Немає з’єднання',
  description: 'Офлайн-сторінка православного порталу ikona.link.',
  path: '/offline'
});

export default function OfflinePage() {
  return (
    <main className="page offline-page">
      <section className="page-hero offline-hero">
        <p className="eyebrow">Offline</p>
        <h1>Немає з’єднання</h1>
        <p>Частина сторінок уже доступна з пам’яті застосунку. Коли інтернет повернеться, матеріали оновляться автоматично.</p>
        <div className="hero-actions">
          <Link className="primary-button" href="/uk/prayers">Молитви</Link>
          <Link className="secondary-button" href="/uk">На головну</Link>
        </div>
      </section>
    </main>
  );
}
