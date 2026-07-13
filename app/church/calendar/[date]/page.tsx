import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssetButton } from '@/components/site/AssetButton';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ date: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Paragraphs({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
    </>
  );
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { date } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const content = await publicApi.churchCalendarDay(date, token, locale);
  const day = content?.calendarDay;
  const image = content?.icons[0]?.imageUrl;
  return pageMetadata({
    title: day?.title,
    description: day?.description,
    path: `/church/calendar/${date}`,
    image,
    locale
  });
}

export default async function ChurchCalendarDayPage({ params, searchParams }: Props) {
  const { date } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const content = await publicApi.churchCalendarDay(date, token, locale);

  if (!content) notFound();

  const { calendarDay, icons, prayers, articles, gospel } = content;
  const heroIcon = icons[0];

  return (
    <main className="read-page sacred-read-page">
      <section className={heroIcon?.imageUrl ? 'sacred-detail-hero' : 'read-hero'}>
        {heroIcon?.imageUrl ? (
          <figure className="sacred-image-frame">
            <StableImage src={heroIcon.imageUrl} alt={heroIcon.title} width={800} height={1000} loading="eager" />
          </figure>
        ) : null}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{calendarDay.dateNewStyle || calendarDay.dateOldStyle || date}</p>
          <h1>{calendarDay.title}</h1>
          {calendarDay.description ? <p className="detail-lead">{calendarDay.description}</p> : null}
          <div className="detail-actions">
            {icons[0] ? <AssetButton variant="dark" href={`/church/icons/${icons[0].slug}`}>Икона</AssetButton> : null}
            {prayers[0] ? <AssetButton href={`/church/prayers/${prayers[0].slug}`}>Молитва</AssetButton> : null}
            {gospel[0] ? <AssetButton href={`/church/gospel/${gospel[0].slug}`}>Евангелие</AssetButton> : null}
          </div>
        </div>
      </section>

      {icons.length ? (
        <section className="related-section">
          <div className="section-head"><p className="eyebrow">Иконы</p><h2>Связанные образы</h2></div>
          <div className="mini-grid">
            {icons.map((icon) => <Link key={icon.id} href={`/church/icons/${icon.slug}`}>{icon.title}<small>{icon.saintName || icon.feastName}</small></Link>)}
          </div>
        </section>
      ) : null}

      {prayers.map((prayer) => (
        <article key={prayer.id} className="sacred-panel">
          <span>{prayer.prayerType}</span>
          <h2>{prayer.title}</h2>
          <div className="reader-text"><Paragraphs text={prayer.text} /></div>
        </article>
      ))}

      {articles.map((article) => (
        <article key={article.id} className="sacred-panel">
          <span>Статья</span>
          <h2>{article.title}</h2>
          <div className="reader-text"><Paragraphs text={article.content} /></div>
          <div className="detail-actions">
            <AssetButton href={`/church/articles/${article.slug}`}>Открыть статью</AssetButton>
          </div>
        </article>
      ))}

      {gospel.map((item) => (
        <article key={item.id} className="sacred-panel">
          <span>{item.reference || 'Евангелие'}</span>
          <h2>{item.title}</h2>
          <div className="reader-text"><Paragraphs text={item.explanation || item.text} /></div>
          <div className="detail-actions">
            <AssetButton href={`/church/gospel/${item.slug}`}>Читать Евангелие</AssetButton>
          </div>
        </article>
      ))}
    </main>
  );
}
