import { LocalizedSaintsList } from '@/components/site/LocalizedContent';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'saintsPageTitle'),
    description: translate(locale, 'saintsPageDescription'),
    path: '/saints',
    locale
  });
}

export default async function SaintsPage() {
  const locale = await getRequestLocale();
  const saints = await publicApi.saints(locale);
  return <main className="page"><section className="page-hero"><p className="eyebrow"><T k="saintsPageEyebrow" /></p><h1><T k="saintsPageTitle" /></h1></section><LocalizedSaintsList saints={saints} /></main>;
}
