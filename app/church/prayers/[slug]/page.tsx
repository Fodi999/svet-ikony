import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicApi } from '@/lib/api';
import { getRequestLocale } from '@/lib/serverLocale';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ slug: string }>;
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
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchPrayer(slug, token, locale);
  const prayer = result?.prayer;
  return pageMetadata({
    title: prayer?.title,
    description: prayer?.text?.slice(0, 180),
    path: `/church/prayers/${slug}`,
    locale
  });
}

export default async function ChurchPrayerPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const result = await publicApi.churchPrayer(slug, token, locale);
  const prayer = result?.prayer;
  if (!prayer) notFound();
  const date = result?.calendarDay?.dateNewStyle || result?.calendarDay?.dateOldStyle;
  return (
    <main className="read-page sacred-read-page">
      <section className="read-hero">
        <p className="eyebrow">{prayer.prayerType}</p>
        <h1>{prayer.title}</h1>
      </section>
      {prayer.audioUrl ? (
        <section className="sacred-panel prayer-audio-panel">
          <span>Аудио молитвы</span>
          <audio controls src={prayer.audioUrl}>Ваш браузер не поддерживает аудио.</audio>
        </section>
      ) : null}
      <article className="sacred-panel prayer-reader-panel">
        <span>Молитва</span>
        <div className="reader-text prayer-reader"><Paragraphs text={prayer.text} /></div>
      </article>
      {prayer.qrCodeUrl ? (
        <section className="sacred-panel prayer-qr-panel">
          <span>QR-код молитвы</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prayer.qrCodeUrl} alt={`QR-код: ${prayer.title}`} width={220} height={220} />
          <a href={prayer.qrCodeUrl} download={`qr-${slug}.png`}>Скачать QR</a>
        </section>
      ) : null}
      <section className="related-section">
        <div className="section-head"><p className="eyebrow">Связь материала</p><h2>Икона и день календаря</h2></div>
        <div className="mini-grid">
          {result?.icon ? <Link href={`/church/icons/${result.icon.slug}`}>{result.icon.title}<small>Икона</small></Link> : null}
          {date ? <Link href={`/church/calendar/${date}`}>{result?.calendarDay?.title || date}<small>День календаря</small></Link> : null}
        </div>
      </section>
    </main>
  );
}
