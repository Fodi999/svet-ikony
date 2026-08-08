'use client';

import Link from 'next/link';
import type { Saint } from '@/lib/types';
import { formatFeastDay } from '@/lib/dates';
import { textPreview } from '@/lib/iconContent';
import { useI18n, useLocaleHref } from './LanguageProvider';
import { StableImage } from './StableImage';

export function SaintCard({ saint }: { saint: Saint }) {
  const { t, locale } = useI18n();
  const localeHref = useLocaleHref();

  return (
    <Link className="icon-card" href={localeHref(`/saints/${saint.slug}`)}>
      <figure>{saint.imageUrl ? <StableImage src={saint.imageUrl} alt={saint.name} width={640} height={800} /> : null}</figure>
      <div className="icon-card-copy">
        {saint.feastDay ? <span>{formatFeastDay(saint.feastDay, locale)}</span> : null}
        <h3>{saint.name}</h3>
        <p>{textPreview(saint.shortDescription || saint.biography, 160)}</p>
        <small>{t('saintReadLife')} →</small>
      </div>
    </Link>
  );
}
