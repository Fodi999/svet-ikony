'use client';

import { useI18n } from './LanguageProvider';

export function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    ['01', t('howStepIconTitle'), t('howStepIconText')],
    ['02', t('howStepScanTitle'), t('howStepScanText')],
    ['03', t('howStepReadTitle'), t('howStepReadText')]
  ];

  return (
    <section className="section">
      <div className="section-head">
        <p className="eyebrow">{t('howItWorksEyebrow')}</p>
        <h2>{t('howItWorksTitle')}</h2>
      </div>
      <div className="feature-grid">
        {steps.map(([index, title, text]) => <article key={index}><span>{index}</span><h3>{title}</h3><p>{text}</p></article>)}
      </div>
    </section>
  );
}
