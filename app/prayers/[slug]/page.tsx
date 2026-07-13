import { LocalizedBackendPrayerDetail } from '@/components/site/LocalizedContent';
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
  const prayer = await publicApi.prayer(slug, locale);
  return pageMetadata({ title: prayer?.seoTitle || prayer?.title, description: prayer?.seoDescription || prayer?.text?.slice(0, 180), path: `/prayers/${slug}` });
}

export default async function PrayerPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const prayer = await publicApi.prayer(slug, locale);
  if (!prayer) return <main className="page"><h1>{translate(locale, 'prayerNotFound')}</h1></main>;
  return <LocalizedBackendPrayerDetail prayer={prayer} />;
}
