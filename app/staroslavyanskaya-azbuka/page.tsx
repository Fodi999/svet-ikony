import { SlavonicAlphabetPage } from '@/components/site/SlavonicAlphabetPage';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Старославянская азбука',
  description: 'Интерактивная старославянская азбука в стиле древней книги: буквы, звучание, смысл и духовно-историческое объяснение.',
  path: '/staroslavyanskaya-azbuka',
  keywords: 'старославянская азбука, церковнославянские буквы, Аз Буки Веди, православная письменность'
});

export default function StaroslavyanskayaAzbukaPage() {
  return <SlavonicAlphabetPage />;
}
