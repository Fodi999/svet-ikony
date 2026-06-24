'use client';

import { useState } from 'react';
import { AssetButton, CopyIcon, DownloadIcon } from './AssetButton';

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

function ZoomIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m15.5 15.5 5 5" />
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  );
}

export function IconPhotoCatalog({ title, iconUrl, items }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const active = activeIndex === null ? null : items[activeIndex] || null;
  const fileBaseName = title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || 'icon';
  const qrFileName = `qr-${fileBaseName}.svg`;

  function imageFileName(item: IconPhotoCatalogItem, index: number) {
    const extension = item.image.split('?')[0]?.split('.').pop()?.toLowerCase();
    const safeExtension = extension && extension.length <= 5 ? extension : 'jpg';
    if (item.kind === 'qr') return qrFileName;
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
          <figure className={`icon-photo-card is-${item.kind}`} key={`${item.image}-${index}`}>
            <button className="icon-photo-open" type="button" onClick={() => setActiveIndex(index)}>
              <img src={item.image} alt={`${item.label}: ${title}`} />
              <span><ZoomIcon />Увеличить</span>
            </button>
            <figcaption>
              <div className="icon-photo-meta">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.label}</strong>
              </div>
              {item.kind === 'qr' ? (
                <div className="icon-qr-actions">
                  <AssetButton icon={<CopyIcon />} onClick={() => void copyIconUrl()} ariaLabel="Скопировать ссылку на страницу иконы">
                    {copied ? 'Скопировано' : 'Скопировать'}
                  </AssetButton>
                  <AssetButton variant="dark" icon={<DownloadIcon />} href={item.image} download={imageFileName(item, index)} ariaLabel="Скачать QR-код для печати">
                    Скачать QR
                  </AssetButton>
                </div>
              ) : (
                <AssetButton variant="dark" icon={<DownloadIcon />} href={item.image} download={imageFileName(item, index)} ariaLabel={`Скачать ${item.label}`}>
                  Скачать
                </AssetButton>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {active ? (
        <div className="icon-lightbox" role="dialog" aria-modal="true" aria-label={active.label}>
          <button className="icon-lightbox-backdrop" type="button" onClick={() => setActiveIndex(null)} aria-label="Закрыть" />
          <div className="icon-lightbox-panel">
            <button className="icon-lightbox-close" type="button" onClick={() => setActiveIndex(null)}>Закрыть</button>
            <img src={active.image} alt={`${active.label}: ${title}`} />
            <div className="icon-lightbox-caption">
              <strong>{active.label}</strong>
              {active.kind === 'qr' ? (
                <div className="icon-lightbox-actions">
                  <a href={active.image} download={qrFileName}>Скачать QR</a>
                  <a href={iconUrl}>Открыть страницу иконы</a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
