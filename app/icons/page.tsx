import { Breadcrumbs } from '@/components/site/Breadcrumbs';
import { IconsCatalog } from '@/components/site/IconsCatalog';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'iconsPageTitle'),
    description: translate(locale, 'iconsPageLead'),
    path: '/icons',
    locale
  });
}

export default async function IconsPage() {
  const locale = await getRequestLocale();
  const icons = await publicApi.icons(locale);
  const categories = Array.from(new Set(icons.map((icon) => icon.category).filter(Boolean)));
  return (
    <main className="page icons-page">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }]}
        current={translate(locale, 'navIcons')}
      />
      <section className="page-hero icons-catalog-hero">
        <div>
          <p className="eyebrow"><T k="catalog" /></p>
          <h1><T k="iconsPageTitle" /></h1>
          <p><T k="iconsPageLead" /></p>
        </div>
        <dl className="icons-catalog-stats">
          <div><dt>{icons.length.toString().padStart(2, '0')}</dt><dd><T k="iconsCountLabel" /></dd></div>
          <div><dt>{categories.length.toString().padStart(2, '0')}</dt><dd><T k="sectionsCountLabel" /></dd></div>
          <div className="icons-catalog-qr-stat"><dt>QR</dt><dd><T k="qrPrayersLivesLabel" /></dd></div>
        </dl>
      </section>
      <IconsCatalog icons={icons} />
      <section className="seo-text"><h2><T k="iconsSeoTitle" /></h2><p><T k="iconsSeoText" /></p></section>
    </main>
  );
}
