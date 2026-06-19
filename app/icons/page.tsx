import { IconGrid } from '@/components/site/IconGrid';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Православные иконы с QR-страницами', description: 'Каталог православных икон с молитвами, житиями и духовными материалами.', path: '/icons' });

export default async function IconsPage() {
  const icons = await publicApi.icons();
  const categories = Array.from(new Set(icons.map((icon) => icon.category)));
  return (
    <main className="page">
      <section className="page-hero"><p className="eyebrow"><T k="catalog" /></p><h1><T k="iconsPageTitle" /></h1><p><T k="iconsPageLead" /></p></section>
      <div className="filter-row"><input placeholder="Пошук за іконою або святим" /><select>{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
      <IconGrid icons={icons} />
      <section className="seo-text"><h2><T k="iconsSeoTitle" /></h2><p><T k="iconsSeoText" /></p></section>
    </main>
  );
}
