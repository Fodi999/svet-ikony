import { LocalizedGospelPage } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Евангелие дня', description: 'Евангельское чтение дня и краткое объяснение.', path: '/gospel' });

export default async function GospelPage() {
  const icons = await publicApi.icons();
  return <LocalizedGospelPage icons={icons} />;
}
