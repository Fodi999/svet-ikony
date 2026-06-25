import { AssetButton } from '@/components/site/AssetButton';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = { params: Promise<{ qrId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = pageMetadata({ title: 'QR-страница иконы', description: 'Страница конкретной физической иконы с молитвой и материалами.' });

export default async function QrPage({ params }: Props) {
  const { qrId } = await params;
  const locale = await getRequestLocale();
  await publicApi.scanQr(qrId);
  const qr = await publicApi.qrPage(qrId, locale);
  const allIcons = await publicApi.icons(locale);
  const icon = allIcons.find((item) => item.id === qr?.iconId);
  if (!qr || !icon || !qr.active) return <main className="page"><h1>{translate(locale, 'qrUnavailable')}</h1></main>;
  return <main className="detail-page"><section className="icon-detail"><figure className="icon-detail-image"><StableImage src={icon.imageUrl} alt={icon.title} width={800} height={1000} loading="eager" /></figure><div><p className="eyebrow">{qr.location || 'QR'}</p><h1>{qr.title}</h1><p>{icon.shortDescription}</p><div className="soft-note">{qr.customPrayer || icon.prayerText}</div><AssetButton variant="dark" href={`/icons/${icon.slug}`}>{translate(locale, 'openFullIconPage')}</AssetButton></div></section></main>;
}
