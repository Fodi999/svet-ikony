import Link from 'next/link';
import { LocalizedIconDetail } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const page = await publicApi.churchIcon(slug, token);
  const icon = page?.iconView;
  return pageMetadata({
    title: icon?.seoTitle || icon?.title,
    description: icon?.seoDescription || icon?.shortDescription,
    path: `/church/icons/${slug}`,
    image: icon?.imageUrl,
    keywords: icon?.seoKeywords
  });
}

export default async function ChurchIconPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const page = await publicApi.churchIcon(slug, token);
  if (!page) return <main className="page"><h1>Икона не найдена</h1></main>;
  const date = page.calendarDay?.dateNewStyle || page.calendarDay?.dateOldStyle;
  return (
    <>
      <LocalizedIconDetail icon={page.iconView} related={[]} />
      <section className="related-section">
        <div className="section-head"><p className="eyebrow">Связанные материалы</p><h2>День, молитвы и статьи</h2></div>
        <div className="mini-grid">
          {date ? <Link href={`/church/calendar/${date}`}>{page.calendarDay?.title || date}<small>День календаря</small></Link> : null}
          {page.prayers.map((prayer) => <Link key={prayer.id} href={`/church/prayers/${prayer.slug}`}>{prayer.title}<small>{prayer.prayerType}</small></Link>)}
          {page.articles.map((article) => <Link key={article.id} href={`/church/articles/${article.slug}`}>{article.title}<small>Статья</small></Link>)}
        </div>
      </section>
    </>
  );
}
