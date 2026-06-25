import { LocalizedChurchesPage } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const metadata = pageMetadata({ title: 'QR-иконы для храмов', description: 'Страницы икон, молитв, расписания и пожертвований для храмов.', path: '/churches' });

export default async function ChurchesPage() {
  const locale = await getRequestLocale();
  const content = await publicApi.content({ locale });
  return <LocalizedChurchesPage icons={content.icons} fallbackChurches={content.churches} />;
}
