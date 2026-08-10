import { Eyebrow, Hero, HeroTitle, Page } from '@/components/site/PageChrome';
import { SaintsCatalog } from '@/components/site/SaintsCatalog';
import { T } from '@/components/site/TranslatedText';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return pageMetadata({
    title: translate(locale, 'saintsPageTitle'),
    description: translate(locale, 'saintsPageDescription'),
    path: '/saints',
    locale
  });
}

export default async function SaintsPage() {
  const locale = await getRequestLocale();
  const saints = await publicApi.saints(locale);
  return (
    <Page>
      <Hero>
        <Eyebrow><T k="saintsPageEyebrow" /></Eyebrow>
        <HeroTitle><T k="saintsPageTitle" /></HeroTitle>
      </Hero>
      <SaintsCatalog saints={saints} />
    </Page>
  );
}
