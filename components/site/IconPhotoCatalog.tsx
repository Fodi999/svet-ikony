'use client';

import { useState } from 'react';

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

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 7.5A2.5 2.5 0 0 1 10.5 5H18a2.5 2.5 0 0 1 2.5 2.5V15A2.5 2.5 0 0 1 18 17.5h-7.5A2.5 2.5 0 0 1 8 15V7.5Z" />
      <path d="M5.5 8.5V18A2.5 2.5 0 0 0 8 20.5h9.5" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4v10" />
      <path d="m7.5 10 4.5 4.5L16.5 10" />
      <path d="M5 20h14" />
    </svg>
  );
}

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
                  <button className="icon-copy-link" type="button" onClick={() => void copyIconUrl()} aria-label="Скопировать ссылку на страницу иконы">
                    <CopyIcon />
                    {copied ? 'Скопировано' : 'Скопировать'}
                  </button>
                  <a className="icon-copy-link" href={item.image} download={imageFileName(item, index)} aria-label="Скачать QR-код для печати">
                    <DownloadIcon />
                    Скачать QR
                  </a>
                </div>
              ) : (
                <a className="icon-copy-link" href={item.image} download={imageFileName(item, index)} aria-label={`Скачать ${item.label}`}>
                  <DownloadIcon />
                  Скачать
                </a>
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
