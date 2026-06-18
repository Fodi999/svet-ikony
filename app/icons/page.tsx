import { IconGrid } from '@/components/site/IconGrid';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Православные иконы с QR-страницами', description: 'Каталог православных икон с молитвами, житиями и духовными материалами.', path: '/icons' });

export default async function IconsPage() {
  const icons = await publicApi.icons();
  const categories = Array.from(new Set(icons.map((icon) => icon.category)));
  return (
    <main className="page">
      <section className="page-hero"><p className="eyebrow">Каталог</p><h1>Православные иконы</h1><p>Поиск, категории и страницы, готовые для QR-кодов физических икон.</p></section>
      <div className="filter-row"><input placeholder="Поиск по иконе или святому" /><select>{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
      <IconGrid icons={icons} />
      <section className="seo-text"><h2>Иконы с QR-кодом</h2><p>Каждая опубликованная страница может быть связана с физической иконой, чтобы человек мог спокойно открыть молитву, историю образа и духовные материалы.</p></section>
    </main>
  );
}
