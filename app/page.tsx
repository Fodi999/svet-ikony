import { CalendarView } from '@/components/site/CalendarView';
import { AssetButton } from '@/components/site/AssetButton';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { jsonLd } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import type { PublicChurchContentPage } from '@/lib/types';

export const revalidate = 0;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function DailyChurchBlock({ content }: { content: PublicChurchContentPage | null }) {
  if (!content) return null;
  const { calendarDay, icons, prayers, articles } = content;
  const icon = icons[0];
  const prayer = prayers[0];
  const article = articles[0];
  return (
    <section className="sacred-detail-hero daily-church-hero">
      {icon?.imageUrl ? (
        <figure className="sacred-image-frame">
          <StableImage src={icon.imageUrl} alt={icon.title} width={800} height={1000} loading="eager" />
        </figure>
      ) : null}
      <div className="sacred-hero-copy">
        <p className="eyebrow">{calendarDay.dateNewStyle || calendarDay.dateOldStyle || 'Сьогодні'}</p>
        <h1>{calendarDay.title}</h1>
        {calendarDay.description ? <p className="detail-lead">{calendarDay.description}</p> : null}
        <div className="detail-actions">
          <AssetButton variant="dark" href={`/church/calendar/${calendarDay.dateNewStyle || calendarDay.dateOldStyle}`}>День календаря</AssetButton>
          {icon ? <AssetButton href={`/church/icons/${icon.slug}`}>Ікона дня</AssetButton> : null}
          {prayer ? <AssetButton href={`/church/prayers/${prayer.slug}`}>Молитва дня</AssetButton> : null}
          {article ? <AssetButton href={`/church/articles/${article.slug}`}>Матеріал дня</AssetButton> : null}
        </div>
      </div>
    </section>
  );
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ year?: string | string[]; month?: string | string[] }> }) {
  const params = await searchParams;
  const locale = await getRequestLocale();
  const content = await publicApi.content({
    year: firstParam(params?.year),
    month: firstParam(params?.month),
    locale
  });
  const today = await publicApi.churchToday();
  const gospel = content.gospel[0] ?? await publicApi.gospelToday(locale);
  return (
    <main className="calendar-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Organization', { name: 'ikona.link', url: 'https://ikona.link' })) }} />
      <DailyChurchBlock content={today} />
      <CalendarView icons={content.icons} prayers={content.prayers} gospel={gospel} pages={content.pages} calendar={content.calendar} />
    </main>
  );
}
