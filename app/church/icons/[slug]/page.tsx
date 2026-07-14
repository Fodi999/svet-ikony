import { permanentRedirect } from 'next/navigation';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';

/** Canonical icon pages live at /[locale]/icons/[slug]; this route only keeps
 * QR codes and links printed with the old /church/icons URL working. */
export default async function ChurchIconRedirect({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const suffix = token ? `?preview_token=${encodeURIComponent(token)}` : '';
  permanentRedirect(`/${locale}/icons/${slug}${suffix}`);
}
