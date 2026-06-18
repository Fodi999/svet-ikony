import Link from 'next/link';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Православные молитвы', description: 'Список молитв для чтения перед иконами.', path: '/prayers' });

export default async function PrayersPage() {
  const prayers = await publicApi.prayers();
  return <main className="page"><section className="page-hero"><p className="eyebrow">Молитвы</p><h1>Тексты для спокойного чтения</h1></section><div className="list-grid">{prayers.map((prayer) => <Link key={prayer.id} href={`/prayers/${prayer.slug}`}><span>{prayer.category}</span><strong>{prayer.title}</strong><p>{prayer.text}</p></Link>)}</div></main>;
}
