'use client';

import { useEffect, useMemo, useState } from 'react';
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
    <>
      <div className="icon-photo-grid">
        {items.map((item, index) => (
          <figure className={`icon-photo-card is-${item.kind}`} key={`${item.kind}-${item.label}-${item.image}`}>
            <button className="icon-photo-open" type="button" onClick={() => setActiveIndex(index)}>
              <StableImage src={item.image} alt={`${item.label}: ${title}`} width={900} height={675} />
              <span><SvgIcon name="zoom" size={16} />{t('zoomImage')}</span>
            </button>
            <figcaption>
              <div className="icon-photo-meta">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.label}</strong>
              </div>
              {item.kind === 'qr' ? (
                <div className="icon-qr-actions">
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
        ))}
      </div>

      {active ? (
        <div className="icon-lightbox" role="dialog" aria-modal="true" aria-label={active.label}>
          <button className="icon-lightbox-backdrop" type="button" onClick={() => setActiveIndex(null)} aria-label={t('close')} />
          <div className="icon-lightbox-panel">
            <button className="icon-lightbox-close" type="button" onClick={() => setActiveIndex(null)}>{t('close')}</button>
            <StableImage src={active.image} alt={`${active.label}: ${title}`} width={1200} height={900} loading="eager" />
            <div className="icon-lightbox-caption">
              <strong>{active.label}</strong>
              {active.kind === 'qr' ? (
                <div className="icon-lightbox-actions">
                  <a href={active.image} download={imageFileName(active, activeIndex ?? 0)}>{t('downloadQr')}</a>
                  <a href={iconUrl}>{t('openIconPage')}</a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
