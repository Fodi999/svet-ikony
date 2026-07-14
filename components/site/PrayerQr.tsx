'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = {
  url: string;
  label: string;
  downloadLabel: string;
  downloadName: string;
};

/** QR is always generated from the public page URL so a scan opens the prayer
 * page, never a raw asset like an MP3 or an uploaded image. */
export function PrayerQr({ url, label, downloadLabel, downloadName }: Props) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#111827', light: '#ffffff' } })
      .then((value) => { if (!cancelled) setDataUrl(value); })
      .catch(() => { if (!cancelled) setDataUrl(''); });
    return () => { cancelled = true; };
  }, [url]);

  if (!dataUrl) return null;

  return (
    <section className="sacred-panel prayer-qr-panel">
      <span>{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={label} width={220} height={220} />
      <a href={dataUrl} download={downloadName}>{downloadLabel}</a>
    </section>
  );
}
