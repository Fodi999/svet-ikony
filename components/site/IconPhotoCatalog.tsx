'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogClose, DialogOverlay, DialogPopup, DialogPortal } from '@/components/ui/dialog';
import { AssetButton, CopyIcon, DownloadIcon } from './AssetButton';
import { useI18n } from './LanguageProvider';
import { StableImage } from './StableImage';
import { SvgIcon } from './SvgIcon';

export type IconPhotoCatalogItem = {
  image: string;
  label: string;
  kind: 'original' | 'product' | 'qr';
};

type Props = {
  title: string;
  iconUrl: string;
  items: IconPhotoCatalogItem[];
};

export function IconPhotoCatalog({ title, iconUrl, items }: Props) {
  const { t } = useI18n();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const itemsSignature = useMemo(() => items.map((item) => `${item.kind}:${item.image}`).join('|'), [items]);
  const active = activeIndex === null ? null : items[activeIndex] || null;
  const fileBaseName = title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'icon';

  useEffect(() => {
    setActiveIndex(null);
    setCopied(false);
  }, [itemsSignature]);

  function imageFileName(item: IconPhotoCatalogItem, index: number) {
    const extension = item.image.split('?')[0]?.split('.').pop()?.toLowerCase();
    const safeExtension = extension && extension.length <= 5 ? extension : 'jpg';
    if (item.kind === 'qr') return `qr-${fileBaseName}.${safeExtension}`;
    return `${fileBaseName}-${String(index + 1).padStart(2, '0')}.${safeExtension}`;
  }

  async function copyIconUrl() {
    await navigator.clipboard.writeText(iconUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setActiveIndex(null); }}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[clamp(12px,1.5vw,20px)] items-stretch max-[900px]:grid-cols-1">
        {items.map((item, index) => {
          const isQr = item.kind === 'qr';
          return (
            <figure
              className="relative min-w-0 m-0 grid grid-rows-[minmax(0,1fr)_auto] rounded-[8px] border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] text-foreground overflow-hidden max-[900px]:grid-rows-[minmax(220px,72vw)_auto]"
              key={`${item.kind}-${item.label}-${item.image}`}
            >
              <button
                className={`group relative w-full min-w-0 min-h-[clamp(260px,28vw,440px)] aspect-[4/3] border-0 p-[clamp(10px,1.5vw,18px)] cursor-zoom-in overflow-hidden max-[900px]:min-h-0 max-[900px]:max-h-[72vh] max-[900px]:aspect-square ${
                  isQr
                    ? 'bg-[linear-gradient(135deg,rgba(214,168,79,.12),transparent_42%),#f6efe2]'
                    : 'bg-[linear-gradient(135deg,rgba(214,168,79,.1),transparent_44%),#141511]'
                }`}
                type="button"
                onClick={() => setActiveIndex(index)}
              >
                <StableImage
                  src={item.image}
                  alt={`${item.label}: ${title}`}
                  width={900}
                  height={675}
                  className={`relative z-[1] w-full h-full min-h-0 object-contain block ${isQr ? 'p-[clamp(18px,3vw,34px)] bg-white rounded-xs' : ''}`}
                />
                <span className="absolute right-3 bottom-3 min-w-0 inline-flex items-center gap-1.5 rounded-full border border-gold/28 bg-[rgba(11,11,10,.78)] px-3 py-2 text-[11px] font-black uppercase text-gold-light opacity-0 transition-opacity duration-[180ms] ease-brand group-hover:opacity-100 group-focus-visible:opacity-100">
                  <SvgIcon name="zoom" size={16} />
                  {t('zoomImage')}
                </span>
              </button>
              <figcaption className="min-w-0 min-h-16 border-t border-gold/28 p-2.5 flex items-center justify-between gap-2.5 max-[900px]:items-stretch max-[900px]:flex-col">
                <div className="min-w-0 inline-flex items-center gap-2.5 max-[900px]:w-full">
                  <span className="flex-none text-gold-light text-[12px] font-black tracking-[.12em]">{String(index + 1).padStart(2, '0')}</span>
                  <strong className="min-w-0 text-foreground text-[13px] font-black overflow-hidden text-ellipsis uppercase whitespace-nowrap max-[900px]:whitespace-normal">
                    {item.label}
                  </strong>
                </div>
                {isQr ? (
                  <div className="ml-auto flex items-center justify-end flex-wrap gap-2 max-[900px]:w-full max-[900px]:justify-stretch max-[900px]:flex-col max-[720px]:grid max-[720px]:grid-cols-1 max-[720px]:items-stretch">
                    <AssetButton icon={<CopyIcon />} onClick={() => void copyIconUrl()} ariaLabel={t('copyIconPageLink')}>
                      {copied ? t('copied') : t('copy')}
                    </AssetButton>
                    <AssetButton variant="dark" icon={<DownloadIcon />} href={item.image} download={imageFileName(item, index)} ariaLabel={t('downloadQrPrint')}>
                      {t('downloadQr')}
                    </AssetButton>
                  </div>
                ) : (
                  <AssetButton variant="dark" icon={<DownloadIcon />} href={item.image} download={imageFileName(item, index)} ariaLabel={`${t('download')} ${item.label}`}>
                    {t('download')}
                  </AssetButton>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {active ? (
        <DialogPortal>
          <DialogOverlay className="z-[2000] bg-[rgba(5,5,5,.84)]" />
          <DialogPopup
            aria-label={active.label}
            className="z-[2000] w-[min(1180px,calc(100vw-56px))] max-h-[min(90vh,calc(100vh-56px))] max-[900px]:w-[calc(100vw-32px)] border border-gold/28 rounded-[8px] bg-canvas grid grid-rows-[minmax(0,1fr)_auto] overflow-hidden before:content-[''] before:absolute before:inset-x-0 before:top-0 before:bottom-14 before:z-0 before:pointer-events-none before:bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.13)_42%,transparent_56%),#141511] before:bg-[length:220%_100%,100%_100%] before:[animation:imageSkeleton_1.4s_ease-in-out_infinite]"
          >
            <DialogClose
              className="absolute top-3 right-3 z-[2] inline-flex min-h-[38px] items-center justify-center gap-2 rounded-sm border border-gold/28 px-3 bg-[rgba(11,11,10,.78)] text-[13px] font-black tracking-[.06em] uppercase leading-[1.15] text-gold-light no-underline whitespace-nowrap cursor-pointer transition-[border-color,background,color] duration-[180ms] ease-brand hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas"
            >
              {t('close')}
            </DialogClose>
            <StableImage
              src={active.image}
              alt={`${active.label}: ${title}`}
              width={1200}
              height={900}
              loading="eager"
              className="relative z-[1] w-full h-full max-h-[calc(90vh-92px)] object-contain block max-[900px]:max-h-[calc(100vh-132px)]"
            />
            <div className="min-w-0 border-t border-gold/28 py-3 px-3.5 flex items-center justify-between gap-3 text-foreground">
              <strong className="text-foreground text-[13px] font-black uppercase">{active.label}</strong>
              {active.kind === 'qr' ? (
                <div className="flex items-center justify-end flex-wrap gap-3.5 max-[900px]:w-full max-[900px]:justify-stretch max-[720px]:grid max-[720px]:grid-cols-1 max-[720px]:items-stretch">
                  <a className="text-gold-light text-[13px] font-black uppercase" href={active.image} download={imageFileName(active, activeIndex ?? 0)}>
                    {t('downloadQr')}
                  </a>
                  <a className="text-gold-light text-[13px] font-black uppercase" href={iconUrl}>
                    {t('openIconPage')}
                  </a>
                </div>
              ) : null}
            </div>
          </DialogPopup>
        </DialogPortal>
      ) : null}
    </Dialog>
  );
}
