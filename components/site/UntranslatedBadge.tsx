'use client';

import { useI18n } from './LanguageProvider';

/**
 * PHASE MULTILINGUAL-1 / P0.2: shown on a catalog card when the item has
 * no row in the currently requested language and is being displayed via
 * its published same-slug fallback (see applyListLanguageFallback in
 * svet-ikony's lib/church-public/translation-fallback.ts). Marks the item
 * explicitly rather than letting it look like a real translation.
 */
export function UntranslatedBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex w-max items-center rounded-xs border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-black tracking-[.08em] text-gold-light uppercase">
      {t('untranslatedNotice')}
    </span>
  );
}
