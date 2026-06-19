import Link from 'next/link';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Святые: жития и молитвы', description: 'Список святых, связанных икон и молитв.', path: '/saints' });

export default async function SaintsPage() {
  const saints = await publicApi.saints();
  return <main className="page"><section className="page-hero"><p className="eyebrow"><T k="saintsPageEyebrow" /></p><h1><T k="saintsPageTitle" /></h1></section><div className="list-grid">{saints.map((saint) => <Link key={saint.id} href={`/saints/${saint.slug}`}><span>{saint.feastDay}</span><strong>{saint.name}</strong><p>{saint.shortDescription}</p></Link>)}</div></main>;
}
