import {
  DetailHero,
  Eyebrow,
  Hero,
  HeroCopy,
  HeroTitle,
  ImageFrame,
  imageFrameImgClass,
  Lead,
  Page,
  Panel,
  PanelLabel,
  ReaderText,
  ReadPage
} from '@/components/site/PageChrome';
import { StableImage } from '@/components/site/StableImage';
import { publicApi } from '@/lib/api';
import { translate } from '@/lib/i18n';
import { jsonLd, pageMetadata } from '@/lib/seo';
import { getRequestLocale } from '@/lib/serverLocale';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// .content-feature-grid article and .faq details share the same card base
// (components.css's .card system) plus the same responsive padding —
// only this file uses either class, so kept local rather than in
// PageChrome.tsx (see phase 8 notes in the plan file).
const cardClass =
  "relative rounded-md border border-gold/28 bg-[linear-gradient(135deg,rgba(205,164,90,.065),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.055),transparent_60%),#141511] text-foreground overflow-hidden hover:border-gold hover:bg-[linear-gradient(135deg,rgba(205,164,90,.095),transparent_44%),linear-gradient(160deg,rgba(127,141,101,.075),transparent_60%),#1b1c16] p-[clamp(18px,2vw,30px)] max-[900px]:p-4";

function Paragraphs({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
    </>
  );
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const page = await publicApi.seoPage(slug, locale);
  return pageMetadata({ title: page?.seoTitle || page?.title, description: page?.seoDescription || page?.content.slice(0, 150), path: `/p/${slug}`, image: page?.imageUrl, keywords: page?.seoKeywords });
}

export default async function SeoLandingPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const page = await publicApi.seoPage(slug, locale);
  if (!page) return <Page><h1>{translate(locale, 'pageNotFound')}</h1></Page>;

  const heroCopy = (
    <HeroCopy>
      <Eyebrow>{page.targetKeyword || page.pageType}</Eyebrow>
      <HeroTitle>{page.h1}</HeroTitle>
      <Lead>{page.seoDescription || page.title}</Lead>
    </HeroCopy>
  );

  return (
    <ReadPage>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('Article', { headline: page.h1, description: page.seoDescription, image: page.imageUrl })) }} />
      {page.imageUrl ? (
        <DetailHero>
          <ImageFrame>
            <StableImage src={page.imageUrl} alt={page.title} width={800} height={1000} loading="eager" className={imageFrameImgClass} />
          </ImageFrame>
          {heroCopy}
        </DetailHero>
      ) : (
        <Hero>{heroCopy}</Hero>
      )}
      <Panel>
        <PanelLabel>{translate(locale, 'material')}</PanelLabel>
        <ReaderText><Paragraphs text={page.content} /></ReaderText>
      </Panel>
      {page.blocks?.length ? (
        <div className="grid grid-cols-3 gap-[clamp(14px,2vw,28px)] mt-[clamp(28px,4vw,58px)] max-[900px]:grid-cols-1 max-[900px]:gap-3 max-[900px]:mt-6">
          {page.blocks.map((block, index) => (
            <article key={block} className={cardClass}>
              <PanelLabel>{String(index + 1).padStart(2, '0')}</PanelLabel>
              <h3 className="text-foreground font-black m-0 mb-3 text-[clamp(22px,1.9vw,32px)] leading-[1.1]">{block}</h3>
              <p className="text-muted-foreground leading-[1.5]">{translate(locale, 'seoBlockText')}</p>
            </article>
          ))}
        </div>
      ) : null}
      {page.faq?.length ? (
        <section className="grid gap-2.5">
          {page.faq.map((item) => (
            <details key={item.question} className={cardClass}>
              <summary className="cursor-pointer font-serif text-[22px]">{item.question}</summary>
              <p className="text-muted-foreground leading-[1.5]">{item.answer}</p>
            </details>
          ))}
        </section>
      ) : null}
    </ReadPage>
  );
}
