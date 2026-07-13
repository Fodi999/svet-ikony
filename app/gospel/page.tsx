import Link from 'next/link';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import type { ChurchGospelDto } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const labels = {
  uk: { eyebrow: 'Святе Письмо', title: 'Євангеліє', lead: 'Читання за розділами, зібрані з церковного календаря.', other: 'Інші читання', empty: 'Читання ще не додані.' },
  ru: { eyebrow: 'Священное Писание', title: 'Евангелие', lead: 'Чтения по разделам, собранные из церковного календаря.', other: 'Другие чтения', empty: 'Чтения пока не добавлены.' },
  en: { eyebrow: 'Holy Scripture', title: 'Gospel', lead: 'Readings grouped by section, gathered from the church calendar.', other: 'Other readings', empty: 'No readings yet.' }
} as const;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: labels[locale].title,
    description: labels[locale].lead,
    path: '/gospel',
    locale
  });
}

function bookFromReference(reference: string) {
  const match = reference.trim().match(/^([^\d]+)/);
  return match ? match[1].trim().replace(/[,:;]+$/, '') : '';
}

function groupByBook(readings: ChurchGospelDto[], fallbackLabel: string) {
  const groups = new Map<string, ChurchGospelDto[]>();
  for (const item of readings) {
    const key = bookFromReference(item.reference) || fallbackLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()];
}

export default async function GospelPage() {
  const locale = await getRequestLocale();
  const t = labels[locale];
  const readings = await publicApi.churchGospelList(locale);
  const groups = groupByBook(readings, t.other);

  return (
    <main className="page">
      <section className="page-hero">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.lead}</p>
      </section>

      {groups.length ? groups.map(([book, items]) => (
        <section key={book} className="related-section">
          <div className="section-head">
            <h2>{book}</h2>
          </div>
          <div className="mini-grid">
            {items.map((item) => (
              <Link key={item.id} href={`/church/gospel/${item.slug}`}>
                {item.title}
                <small>{item.reference}</small>
              </Link>
            ))}
          </div>
        </section>
      )) : <p className="calendar-empty">{t.empty}</p>}
    </main>
  );
}
