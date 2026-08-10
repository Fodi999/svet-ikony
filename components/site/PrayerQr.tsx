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
    <section className="grid justify-items-center gap-2 text-gold-light">
      <span className="hidden">{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={label} width={220} height={220} className="size-[112px] rounded-md border border-gold/28 p-[7px]" />
      <a href={dataUrl} download={downloadName} className="text-xs text-gold-light no-underline">
        {downloadLabel}
      </a>
    </section>
  );
}
