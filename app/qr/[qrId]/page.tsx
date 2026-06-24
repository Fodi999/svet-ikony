import { AssetButton } from '@/components/site/AssetButton';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ qrId: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = pageMetadata({ title: 'QR-страница иконы', description: 'Страница конкретной физической иконы с молитвой и материалами.' });

export default async function QrPage({ params }: Props) {
  const { qrId } = await params;
  await publicApi.scanQr(qrId);
  const qr = await publicApi.qrPage(qrId);
  const allIcons = await publicApi.icons();
  const icon = allIcons.find((item) => item.id === qr?.iconId);
  if (!qr || !icon || !qr.active) return <main className="page"><h1>QR-страница недоступна</h1></main>;
  return <main className="detail-page"><section className="icon-detail"><img src={icon.imageUrl} alt={icon.title} /><div><p className="eyebrow">{qr.location || 'QR-икона'}</p><h1>{qr.title}</h1><p>{icon.shortDescription}</p><div className="soft-note">{qr.customPrayer || icon.prayerText}</div><AssetButton variant="dark" href={`/icons/${icon.slug}`}>Открыть полную страницу иконы</AssetButton></div></section></main>;
}
