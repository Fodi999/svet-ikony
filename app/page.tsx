import { CalendarView } from '@/components/site/CalendarView';
import { publicApi } from '@/lib/api';
import { jsonLd } from '@/lib/seo';

export const revalidate = 0;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HomePage({ searchParams }: { searchParams?: { year?: string | string[]; month?: string | string[] } }) {
  const content = await publicApi.content({
    year: firstParam(searchParams?.year),
    month: firstParam(searchParams?.month)
  });
  const gospel = content.gospel[0] ?? await publicApi.gospelToday();
  return (
    <main className="calendar-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Organization', { name: 'ikona.link', url: 'https://ikona.link' })) }} />
      <CalendarView icons={content.icons} prayers={content.prayers} gospel={gospel} pages={content.pages} calendar={content.calendar} />
    </main>
  );
}
