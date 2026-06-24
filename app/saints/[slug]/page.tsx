import { LocalizedSaintDetail } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const icon = await publicApi.icon(slug);
  return pageMetadata({ title: icon?.seoTitle || icon?.saintName || icon?.title, description: icon?.seoDescription || icon?.shortDescription, path: `/saints/${slug}` });
}

export default async function SaintPage({ params }: Props) {
  const { slug } = await params;
  const icon = await publicApi.icon(slug);
  if (!icon) return <main className="page"><h1>Святой не найден</h1></main>;
  return <LocalizedSaintDetail icon={icon} />;
}
