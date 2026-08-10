'use client';

import Link from 'next/link';
import type { Saint } from '@/lib/types';
import { formatFeastDay } from '@/lib/dates';
import { textPreview } from '@/lib/iconContent';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';

export function SaintCard({ saint }: { saint: Saint }) {
  const { t, locale } = useI18n();
  const localeHref = useLocaleHref();

  return (
    <Link
      className="group relative min-w-0 grid grid-rows-[auto_1fr] gap-0 rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] p-0 text-foreground no-underline overflow-hidden transition-[border-color,background,transform] duration-[180ms] ease-brand hover:-translate-y-0.5 hover:border-gold hover:bg-[linear-gradient(135deg,rgba(205,164,90,.095),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.075),transparent_60%),#1b1c16]"
      href={localeHref(`/saints/${saint.slug}`)}
    >
      <figure className="relative grid place-items-center aspect-[4/5] min-h-0 m-0 border-b border-gold/28 p-[clamp(16px,2.2vw,34px)] bg-[linear-gradient(110deg,transparent_0_28%,rgba(232,203,132,.13)_42%,transparent_56%),linear-gradient(160deg,rgba(127,141,101,.09),transparent_62%),#1b1c16] bg-[length:220%_100%,100%_100%] overflow-hidden max-[520px]:p-3.5">
        {saint.imageUrl ? (
          <StableImage
            src={saint.imageUrl}
            alt={saint.name}
            width={640}
            height={800}
            className="relative z-[1] block w-full max-w-[min(100%,420px)] h-[clamp(280px,34vw,560px)] aspect-[4/5] object-contain rounded-xs shadow-[0_6px_18px_rgba(0,0,0,.18)] transition-[transform,filter] duration-[180ms] ease-brand group-hover:[filter:saturate(1.04)_contrast(1.02)] group-hover:scale-[1.01] group-focus-within:[filter:saturate(1.04)_contrast(1.02)] group-focus-within:scale-[1.01] max-[900px]:h-[clamp(260px,54vw,440px)] max-[720px]:h-[min(56vh,360px)] max-[520px]:h-[min(76vh,460px)] max-[430px]:h-[min(62vh,360px)]"
          />
        ) : null}
      </figure>
      <div className="min-w-0 grid content-start gap-3 p-[clamp(18px,2vw,28px)] max-[430px]:p-4">
        {saint.feastDayNewStyle || saint.feastDayOldStyle ? (
          <div className="grid gap-1">
            {saint.feastDayNewStyle ? <span className="text-foreground">{formatFeastDay(saint.feastDayNewStyle, locale)}</span> : null}
            {saint.feastDayOldStyle ? (
              <p className="m-0 text-muted-foreground text-[13px] font-semibold">
                {formatFeastDay(saint.feastDayOldStyle, locale)} {t('saintOldStyleSuffix')}
              </p>
            ) : null}
          </div>
        ) : null}
        <h3 className="m-0 text-foreground font-black text-[clamp(22px,2vw,32px)] leading-[1.08] text-balance max-[520px]:text-[clamp(21px,6vw,30px)]">{saint.name}</h3>
        <p className="m-0 text-muted-foreground leading-[1.5] line-clamp-3">{textPreview(saint.shortDescription || saint.biography, 160)}</p>
        <small className="w-max mt-1.5 border-b border-gold pb-[3px] text-gold-light text-[12px] font-black tracking-[.08em] uppercase">{t('saintReadLife')} →</small>
      </div>
    </Link>
  );
}
