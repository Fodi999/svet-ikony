import { LocalizedPrayerDetail } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const icon = await publicApi.icon(slug);
  return pageMetadata({ title: icon?.seoTitle || icon?.title, description: icon?.seoDescription || icon?.shortDescription, path: `/prayers/${slug}` });
}

export default async function PrayerPage({ params }: Props) {
  const { slug } = await params;
  const icon = await publicApi.icon(slug);
  if (!icon) return <main className="page"><h1>Молитва не найдена</h1></main>;
  return <LocalizedPrayerDetail icon={icon} />;
}
