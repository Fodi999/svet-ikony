import Link from 'next/link';
import { DetailActions, Eyebrow, Hero, HeroTitle, Lead, Page } from '@/components/site/PageChrome';
import { Button } from '@/components/ui/button';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Немає з’єднання',
  description: 'Офлайн-сторінка православного порталу svetikony.com.',
  path: '/offline'
});

export default function OfflinePage() {
  return (
    <Page>
      <Hero className="min-h-[62vh] content-center">
        <Eyebrow>Offline</Eyebrow>
        <HeroTitle>Немає з’єднання</HeroTitle>
        <Lead>Частина сторінок уже доступна з пам’яті застосунку. Коли інтернет повернеться, матеріали оновляться автоматично.</Lead>
        <DetailActions>
          {/* Hardcoded /uk/ prefix (not AssetButton, which would double-prefix
              via useLocaleHref): the offline PWA fallback has no server-side
              locale detection available, so it's fixed to one locale. */}
          <Button variant="light" size="asset" render={<Link href="/uk/prayers" />}>
            Молитви
          </Button>
          <Button variant="dark" size="asset" render={<Link href="/uk" />}>
            На головну
          </Button>
        </DetailActions>
      </Hero>
    </Page>
  );
}
