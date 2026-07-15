import { SlavonicAlphabetPage } from '@/components/site/SlavonicAlphabetPage';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'alphabetPageTitle'),
    description: translate(locale, 'alphabetPageDescription'),
    path: '/staroslavyanskaya-azbuka',
    locale
  });
}

export default async function StaroslavyanskayaAzbukaPage() {
  const locale = await getRequestLocale();
  const letters = await publicApi.churchAlphabetList(locale);
  return <SlavonicAlphabetPage letters={letters.filter((item) => item.status === 'published')} />;
}
