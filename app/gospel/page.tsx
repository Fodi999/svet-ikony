import { LocalizedGospelPage } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const metadata = pageMetadata({ title: 'Евангелие дня', description: 'Евангельское чтение дня и краткое объяснение.', path: '/gospel' });

export default async function GospelPage() {
  const locale = await getRequestLocale();
  const icons = await publicApi.icons(locale);
  return <LocalizedGospelPage icons={icons} />;
}
