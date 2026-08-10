import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
import { DetailHero, Eyebrow, Hero, HeroCopy, HeroTitle, ImageFrame, imageFrameImgClass, Lead, MiniGrid, MiniGridLink, MiniGridSmall, Page, SoftNote } from '@/components/site/PageChrome';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { localeNames, translate, withLocale } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ preview_token?: string }>;
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchAlphabetLetter(slug, token, locale);
  const letter = page?.letter;
  if (!letter) {
    return {
      ...pageMetadata({ title: translate(locale, 'alphabetNotFound'), path: `/staroslavyanskaya-azbuka/${slug}`, locale }),
      robots: { index: false }
    };
  }
  return pageMetadata({
    title: letter.seoTitle || `${letter.letter} — ${letter.name}`,
    description: (letter.seoDescription || letter.shortDescription).replace(/\s+/g, ' ').trim().slice(0, 180),
    path: `/staroslavyanskaya-azbuka/${letter.slug}`,
    image: letter.mainImageUrl || letter.cardImageUrl || undefined,
    locale
  });
}

export default async function AlphabetLetterPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const token = (await searchParams)?.preview_token;
  const locale = await getRequestLocale();
  const page = await publicApi.churchAlphabetLetter(slug, token, locale);
  if (!page) notFound();

  if (!page.letter) {
    const translations = page.translations || [];
    return (
      <Page>
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/staroslavyanskaya-azbuka', label: translate(locale, 'navAlphabet') }]}
          current={translations[0]?.title || slug}
        />
        <Hero>
          <Eyebrow>{translate(locale, 'alphabetPageEyebrow')}</Eyebrow>
          <HeroTitle>{translate(locale, 'alphabetNoTranslation')}</HeroTitle>
          {translations.length ? <Lead>{translate(locale, 'prayerOpenIn')}</Lead> : null}
        </Hero>
        {translations.length ? (
          <MiniGrid>
            {translations.map((item) => (
              <MiniGridLink key={item.language} href={withLocale(`/staroslavyanskaya-azbuka/${item.slug}`, item.language)}>
                {item.title}
                <MiniGridSmall>{localeNames[item.language]}</MiniGridSmall>
              </MiniGridLink>
            ))}
          </MiniGrid>
        ) : null}
        <BackLink href="/staroslavyanskaya-azbuka" label={translate(locale, 'navAlphabet')} />
      </Page>
    );
  }

  const letter = page.letter;

  return (
    <Page>
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }, { href: '/staroslavyanskaya-azbuka', label: translate(locale, 'navAlphabet') }]}
        current={letter.name}
      />
      <DetailHero>
        {letter.mainImageUrl ? (
          <ImageFrame className="block aspect-auto">
            <StableImage src={letter.mainImageUrl} alt={letter.name} loading="eager" className="aspect-auto h-auto w-full object-contain" />
          </ImageFrame>
        ) : (
          <ImageFrame
            className="bg-[rgba(29,26,19,.96)] font-serif text-[clamp(72px,12vw,160px)] leading-none"
            style={{ color: letter.color || undefined, borderColor: letter.color || undefined }}
            aria-hidden="true"
          >
            {letter.letter}
          </ImageFrame>
        )}
        <HeroCopy>
          <Eyebrow>{translate(locale, 'alphabetPageEyebrow')} · {String(letter.sortOrder).padStart(2, '0')}</Eyebrow>
          <HeroTitle>{letter.letter} — {letter.name}</HeroTitle>
          {letter.shortDescription ? <Lead>{letter.shortDescription}</Lead> : null}
          <dl className="my-4.5 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            {letter.modernEquivalent ? (
              <div className="rounded-xs border border-gold/28 bg-gold/6 px-3.5 py-2.5">
                <dt className="mb-1 font-sans text-xs font-bold text-muted-foreground uppercase">{translate(locale, 'alphabetModernSoundLabel')}</dt>
                <dd className="font-serif text-lg text-foreground">{letter.modernEquivalent}</dd>
              </div>
            ) : null}
            {letter.numericValue != null ? (
              <div className="rounded-xs border border-gold/28 bg-gold/6 px-3.5 py-2.5">
                <dt className="mb-1 font-sans text-xs font-bold text-muted-foreground uppercase">{translate(locale, 'alphabetNumericValueLabel')}</dt>
                <dd className="font-serif text-lg text-foreground">{letter.numericValue}</dd>
              </div>
            ) : null}
          </dl>
          {letter.fullText ? (
            <div className="border-l-[3px] border-l-gold py-3.5 pr-0 pl-4.5 bg-[linear-gradient(90deg,rgba(214,168,79,.12),transparent)] rounded-l-none rounded-r-xs max-w-[960px] text-muted-foreground font-serif text-[clamp(18px,1.45vw,24px)] leading-[1.6] [&>p]:mt-0 [&>p]:mx-0 [&>p]:mb-4 [&>p:last-child]:mb-0">
              <p>{letter.fullText}</p>
            </div>
          ) : null}
        </HeroCopy>
      </DetailHero>
      <BackLink href="/staroslavyanskaya-azbuka" label={translate(locale, 'navAlphabet')} />
    </Page>
  );
}
