import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink, Breadcrumbs } from '@/components/site/Breadcrumbs';
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
      <main className="page">
        <Breadcrumbs
          items={[{ href: '/', label: translate(locale, 'home') }, { href: '/staroslavyanskaya-azbuka', label: translate(locale, 'navAlphabet') }]}
          current={translations[0]?.title || slug}
        />
        <section className="page-hero">
          <p className="eyebrow">{translate(locale, 'alphabetPageEyebrow')}</p>
          <h1>{translate(locale, 'alphabetNoTranslation')}</h1>
          {translations.length ? <p>{translate(locale, 'prayerOpenIn')}</p> : null}
        </section>
        {translations.length ? (
          <div className="mini-grid">
            {translations.map((item) => (
              <Link key={item.language} href={withLocale(`/staroslavyanskaya-azbuka/${item.slug}`, item.language)}>
                {item.title}<small>{localeNames[item.language]}</small>
              </Link>
            ))}
          </div>
        ) : null}
        <BackLink href="/staroslavyanskaya-azbuka" label={translate(locale, 'navAlphabet')} />
      </main>
    );
  }

  const letter = page.letter;

  return (
    <main className="detail-page">
      <Breadcrumbs
        items={[{ href: '/', label: translate(locale, 'home') }, { href: '/staroslavyanskaya-azbuka', label: translate(locale, 'navAlphabet') }]}
        current={letter.name}
      />
      <section className="sacred-detail-hero">
        {letter.mainImageUrl ? (
          <figure className="sacred-image-frame slavonic-detail-frame"><StableImage src={letter.mainImageUrl} alt={letter.name} loading="eager" /></figure>
        ) : (
          <figure className="sacred-image-frame slavonic-letter-symbol" style={{ color: letter.color || undefined, borderColor: letter.color || undefined }} aria-hidden="true">
            {letter.letter}
          </figure>
        )}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{translate(locale, 'alphabetPageEyebrow')} · {String(letter.sortOrder).padStart(2, '0')}</p>
          <h1>{letter.letter} — {letter.name}</h1>
          {letter.shortDescription ? <p className="detail-lead">{letter.shortDescription}</p> : null}
          <dl className="slavonic-letter-meta">
            {letter.modernEquivalent ? <div><dt>{translate(locale, 'alphabetModernSoundLabel')}</dt><dd>{letter.modernEquivalent}</dd></div> : null}
            {letter.numericValue != null ? <div><dt>{translate(locale, 'alphabetNumericValueLabel')}</dt><dd>{letter.numericValue}</dd></div> : null}
          </dl>
          {letter.fullText ? <div className="soft-note reader-text"><p>{letter.fullText}</p></div> : null}
        </div>
      </section>
      <BackLink href="/staroslavyanskaya-azbuka" label={translate(locale, 'navAlphabet')} />
    </main>
  );
}
