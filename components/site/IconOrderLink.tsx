'use client';

import { useEffect, useState } from 'react';
import { AssetButton } from '@/components/site/AssetButton';
import { useI18n } from '@/components/site/LanguageProvider';
import { publicApi } from '@/lib/api';
import type { Icon } from '@/lib/types';

/**
 * Icons no longer open the order form directly: if a catalog product links
 * back to this icon's translation group, we send visitors to that product's
 * full page instead (see the product-catalog rework).
 */
export function IconOrderLink({ icon }: { icon: Icon }) {
  const { t } = useI18n();
  const [productSlug, setProductSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!icon.translationGroupId) return;
    let cancelled = false;
    void publicApi.products({ linkedIconGroupId: icon.translationGroupId }).then((rows) => {
      if (!cancelled) setProductSlug(rows[0]?.slug || null);
    });
    return () => {
      cancelled = true;
    };
  }, [icon.translationGroupId]);

  if (!productSlug) return null;

  return <AssetButton variant="dark" href={`/shop/${productSlug}`}>{t('orderThisIcon')}</AssetButton>;
}
