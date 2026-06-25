'use client';

import { useI18n } from './LanguageProvider';
import { StableImage } from './StableImage';

export function QRIconDemo() {
  const { t } = useI18n();

  return (
    <div className="qr-demo" aria-label={t('qrIconAria')}>
      <div className="kiot">
        <div className="icon-face">
          <span className="halo" />
          <strong>IC XC</strong>
          <small>{t('kiotImageLabel')}</small>
        </div>
        <div className="qr-drawer">
          <StableImage src="/images/qr-code.svg" alt={t('qrCodeAlt')} width={180} height={180} />
          <span>{t('scan')}</span>
        </div>
      </div>
    </div>
  );
}
