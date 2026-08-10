import { AssetButton } from '@/components/site/AssetButton';
import { DetailHero, Eyebrow, HeroCopy, HeroTitle, imageFrameImgClass, Lead, Page, SoftNote } from '@/components/site/PageChrome';
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
  const allIcons = (await publicApi.content({ locale })).icons;
  const icon = allIcons.find((item) => item.id === qr?.iconId);
  if (!qr || !icon || !qr.active) return <Page><h1>{translate(locale, 'qrUnavailable')}</h1></Page>;
  return (
    <Page>
      <DetailHero>
        <figure className="relative m-0 grid place-items-center aspect-[4/5] border border-gold/28 rounded-[8px] bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.16)_42%,transparent_56%),#1b1c16] bg-[length:220%_100%,100%_100%] overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,.18)] max-[520px]:max-h-[68vh]">
          <StableImage src={icon.imageUrl} alt={icon.title} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
        </figure>
        <HeroCopy>
          <Eyebrow>{qr.location || 'QR'}</Eyebrow>
          <HeroTitle>{qr.title}</HeroTitle>
          <Lead>{icon.shortDescription}</Lead>
          <SoftNote>{qr.customPrayer || icon.prayerText}</SoftNote>
          <AssetButton variant="dark" href={`/icons/${icon.slug}`}>{translate(locale, 'openFullIconPage')}</AssetButton>
        </HeroCopy>
      </DetailHero>
    </Page>
  );
}
