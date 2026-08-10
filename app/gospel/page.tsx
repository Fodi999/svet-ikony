import { Eyebrow, Hero, HeroTitle, Lead, MiniGrid, MiniGridLink, MiniGridSmall, Page, RelatedSection, SectionHead, SectionHeadTitle } from '@/components/site/PageChrome';
import { publicApi } from '@/lib/api';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';
import type { ChurchGospelDto } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const labels = {
  uk: { eyebrow: 'Святе Письмо', title: 'Євангеліє', lead: 'Читання за розділами, зібрані з церковного календаря.', other: 'Інші читання', empty: 'Читання ще не додані.' },
  ru: { eyebrow: 'Священное Писание', title: 'Евангелие', lead: 'Чтения по разделам, собранные из церковного календаря.', other: 'Другие чтения', empty: 'Чтения пока не добавлены.' },
  en: { eyebrow: 'Holy Scripture', title: 'Gospel', lead: 'Readings grouped by section, gathered from the church calendar.', other: 'Other readings', empty: 'No readings yet.' }
} as const;

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: labels[locale].title,
    description: labels[locale].lead,
    path: '/gospel',
    locale
  });
}

function bookFromReference(reference: string) {
  const match = reference.trim().match(/^([^\d]+)/);
  return match ? match[1].trim().replace(/[,:;]+$/, '') : '';
}

function groupByBook(readings: ChurchGospelDto[], fallbackLabel: string) {
  const groups = new Map<string, ChurchGospelDto[]>();
  for (const item of readings) {
    const key = bookFromReference(item.reference) || fallbackLabel;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()];
}

export default async function GospelPage() {
  const locale = await getRequestLocale();
  const t = labels[locale];
  const readings = await publicApi.churchGospelList(locale);
  const groups = groupByBook(readings, t.other);

  return (
    <Page>
      <Hero>
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <HeroTitle>{t.title}</HeroTitle>
        <Lead>{t.lead}</Lead>
      </Hero>

      {groups.length ? groups.map(([book, items]) => (
        <RelatedSection key={book}>
          <SectionHead>
            <SectionHeadTitle>{book}</SectionHeadTitle>
          </SectionHead>
          <MiniGrid>
            {items.map((item) => (
              <MiniGridLink key={item.id} href={`/church/gospel/${item.slug}`}>
                {item.title}
                <MiniGridSmall>{item.reference}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        </RelatedSection>
      )) : <p className="m-0 border-t border-gold/28 py-6 text-muted-foreground text-[18px]">{t.empty}</p>}
    </Page>
  );
}
