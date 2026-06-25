import { LocalizedSaintsList } from '@/components/site/LocalizedContent';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const metadata = pageMetadata({ title: 'Святые: жития и молитвы', description: 'Список святых, связанных икон и молитв.', path: '/saints' });

export default async function SaintsPage() {
  const locale = await getRequestLocale();
  const icons = await publicApi.icons(locale);
  return <main className="page"><section className="page-hero"><p className="eyebrow"><T k="saintsPageEyebrow" /></p><h1><T k="saintsPageTitle" /></h1></section><LocalizedSaintsList icons={icons} /></main>;
}
