import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'QR-иконы для храмов', description: 'Страницы икон, молитв, расписания и пожертвований для храмов.', path: '/churches' });

export default async function ChurchesPage() {
  const churches = await publicApi.churches();
  return <main className="page"><section className="page-hero"><p className="eyebrow"><T k="churchesPageEyebrow" /></p><h1><T k="churchesPageTitle" /></h1><p><T k="churchesPageLead" /></p></section><div className="feature-grid"><article><h3><T k="churchesFeatureIcons" /></h3><p><T k="churchesFeatureIconsText" /></p></article><article><h3><T k="churchesFeatureSchedule" /></h3><p><T k="churchesFeatureScheduleText" /></p></article><article><h3><T k="churchesFeatureDonations" /></h3><p><T k="churchesFeatureDonationsText" /></p></article></div><form className="lead-form"><input placeholder="Назва храму" /><input placeholder="Місто" /><textarea placeholder="Що потрібно підключити" /><button><T k="sendRequest" /></button></form>{churches.map((church) => <section className="seo-text" key={church.id}><h2>{church.title}</h2><p>{church.description}</p></section>)}</main>;
}
