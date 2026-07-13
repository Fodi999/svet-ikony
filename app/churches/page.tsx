import { LocalizedChurchesPage } from '@/components/site/LocalizedContent';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

const labels = {
  uk: { title: 'QR-ікони для храмів', description: 'Сторінки ікон, молитов, розкладу та пожертв для храмів.' },
  ru: { title: 'QR-иконы для храмов', description: 'Страницы икон, молитв, расписания и пожертвований для храмов.' },
  en: { title: 'QR icons for churches', description: 'Icon, prayer, schedule and donation pages for churches.' }
} as const;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const churchInfo = await publicApi.churchInfo(locale);
  const translation = churchInfo
    ? [churchInfo.translations[locale], churchInfo.translations.uk, churchInfo.translations.ru, churchInfo.translations.en].find((item) => item?.title?.trim())
    : null;
  const title = churchInfo?.status === 'published' && translation?.title ? translation.title : labels[locale].title;
  const description = churchInfo?.status === 'published' && translation?.description
    ? translation.description.slice(0, 200)
    : labels[locale].description;
  return pageMetadata({ title, description, path: '/churches', locale });
}

export default async function ChurchesPage() {
  const locale = await getRequestLocale();
  const churchInfo = await publicApi.churchInfo(locale);
  return <LocalizedChurchesPage churchInfo={churchInfo} />;
}
