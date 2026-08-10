import Link from 'next/link';
import { DetailActions, Eyebrow, Hero, HeroTitle, Lead, Page } from '@/components/site/PageChrome';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Немає з’єднання',
  description: 'Офлайн-сторінка православного порталу svetikony.com.',
  path: '/offline'
});

export default function OfflinePage() {
  const sharedButtonClass =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4.5 text-[13px] font-black tracking-[.06em] uppercase leading-[1.15] text-center no-underline whitespace-nowrap cursor-pointer transition-[border-color,background,color,transform] duration-[180ms] ease-brand max-[900px]:w-full";

  return (
    <Page>
      <Hero className="min-h-[62vh] content-center">
        <Eyebrow>Offline</Eyebrow>
        <HeroTitle>Немає з’єднання</HeroTitle>
        <Lead>Частина сторінок уже доступна з пам’яті застосунку. Коли інтернет повернеться, матеріали оновляться автоматично.</Lead>
        <DetailActions>
          <Link
            className={`${sharedButtonClass} border-gold bg-[linear-gradient(180deg,#e9cb84,#cda45a)] text-canvas hover:border-gold-light hover:bg-gold-light hover:text-canvas focus-visible:border-gold-light focus-visible:bg-gold-light focus-visible:text-canvas`}
            href="/uk/prayers"
          >
            Молитви
          </Link>
          <Link
            className={`${sharedButtonClass} border-gold/28 bg-gold/8 text-gold-light hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas`}
            href="/uk"
          >
            На головну
          </Link>
        </DetailActions>
      </Hero>
    </Page>
  );
}
