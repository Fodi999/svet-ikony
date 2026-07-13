import { LocalizedSaintDetail } from '@/components/site/LocalizedContent';
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
  const saint = await publicApi.saint(slug, locale);
  return pageMetadata({ title: saint?.seoTitle || saint?.name, description: saint?.seoDescription || saint?.shortDescription, path: `/saints/${slug}` });
}

export default async function SaintPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const saint = await publicApi.saint(slug, locale);
  if (!saint) return <main className="page"><h1>{translate(locale, 'saintNotFound')}</h1></main>;
  return <LocalizedSaintDetail saint={saint} />;
}
