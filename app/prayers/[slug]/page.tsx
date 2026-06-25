import { LocalizedPrayerDetail } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const icon = await publicApi.icon(slug, locale);
  return pageMetadata({ title: icon?.seoTitle || icon?.title, description: icon?.seoDescription || icon?.shortDescription, path: `/prayers/${slug}` });
}

export default async function PrayerPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const icon = await publicApi.icon(slug, locale);
  if (!icon) return <main className="page"><h1>{translate(locale, 'prayerNotFound')}</h1></main>;
  return <LocalizedPrayerDetail icon={icon} />;
}
