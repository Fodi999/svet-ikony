import { LocalizedChurchesPage } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'QR-иконы для храмов', description: 'Страницы икон, молитв, расписания и пожертвований для храмов.', path: '/churches' });

export default async function ChurchesPage() {
  const content = await publicApi.content();
  return <LocalizedChurchesPage icons={content.icons} fallbackChurches={content.churches} />;
}
