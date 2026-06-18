import { CalendarView } from '@/components/site/CalendarView';
import { publicApi } from '@/lib/api';
import { jsonLd } from '@/lib/seo';

export default async function HomePage() {
  const content = await publicApi.content();
  const gospel = content.gospel[0] ?? await publicApi.gospelToday();
  return (
    <main className="calendar-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Organization', { name: 'ikona.link', url: 'https://ikona.link' })) }} />
      <CalendarView icons={content.icons} prayers={content.prayers} gospel={gospel} pages={content.pages} calendar={content.calendar} />
    </main>
  );
}
