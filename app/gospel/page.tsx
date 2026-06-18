import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({ title: 'Евангелие дня', description: 'Евангельское чтение дня и краткое объяснение.', path: '/gospel' });

export default async function GospelPage() {
  const gospel = await publicApi.gospelToday();
  return <main className="read-page"><p className="eyebrow">{gospel.date}</p><h1>{gospel.title}</h1><h2>{gospel.reference}</h2><article>{gospel.text}</article><p>{gospel.explanation}</p></main>;
}
