import { permanentRedirect } from 'next/navigation';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';

/** Canonical prayer pages live at /[locale]/prayers/[slug]; this route only
 * keeps QR codes printed with the old /church/prayers URL working. */
export default async function ChurchPrayerRedirect({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const suffix = token ? `?preview_token=${encodeURIComponent(token)}` : '';
  permanentRedirect(`/${locale}/prayers/${slug}${suffix}`);
}
