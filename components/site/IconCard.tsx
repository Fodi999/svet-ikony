'use client';

import Link from 'next/link';
import type { Icon } from '@/lib/types';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';

export function IconCard({ icon }: { icon: Icon }) {
  const { t } = useI18n();
  const localeHref = useLocaleHref();

  return (
    <Link className="icon-card" href={localeHref(`/icons/${icon.slug}`)}>
      <figure>
        <StableImage src={icon.imageUrl} alt={icon.title} width={640} height={800} />
      </figure>
      <div className="icon-card-copy">
        <span>{icon.category}</span>
        <h3>{icon.title}</h3>
        <p>{icon.shortDescription}</p>
        <small>{t('open')}</small>
      </div>
    </Link>
  );
}
