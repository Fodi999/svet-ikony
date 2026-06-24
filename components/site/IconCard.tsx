'use client';

import Link from 'next/link';
import type { Icon } from '@/lib/types';
import { useI18n } from './LanguageProvider';

export function IconCard({ icon }: { icon: Icon }) {
  const { t } = useI18n();

  return (
    <Link className="icon-card" href={`/icons/${icon.slug}`}>
      <figure>
        <img src={icon.imageUrl} alt={icon.title} />
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
