import Link from 'next/link';
import { publicApi } from '@/lib/api';
import { jsonLd, pageMetadata } from '@/lib/seo';
import type { CalendarDay, SeoPage } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Paragraphs({ text }: { text?: string }) {
  return (
    <>
      {(text || '').split(/\n{2,}|\n/).map((part) => part.trim()).filter(Boolean).map((part) => <p key={part}>{part}</p>)}
    </>
  );
}

function uniqueImages(images: Array<string | undefined | null>) {
  return Array.from(new Set(images.map((url) => (url || '').trim()).filter(Boolean)));
}

function isQrImage(url: string) {
  return url.toLowerCase().includes('qr');
}

function CalendarFallbackPage({ day, page }: { day?: CalendarDay; page?: SeoPage }) {
  const title = page?.h1 || day?.label || 'Материал календаря';
  const description = page?.seoDescription || day?.description || day?.note || '';
  const imageUrl = page?.imageUrl || day?.imageUrl || '';
  const content = page?.content || day?.description || day?.note || '';

  return (
    <main className="read-page sacred-read-page">
      <section className={imageUrl ? 'sacred-detail-hero' : 'read-hero'}>
        {imageUrl ? (
          <figure className="sacred-image-frame">
            <img src={imageUrl} alt={title} />
          </figure>
        ) : null}
        <div className="sacred-hero-copy">
          <p className="eyebrow">{page?.targetKeyword || day?.note || 'Церковный календарь'}</p>
          <h1>{title}</h1>
          {description ? <p className="detail-lead">{description}</p> : null}
          <div className="detail-actions">
            <Link className="primary-link" href={day?.prayerSlug ? `/prayers/${day.prayerSlug}` : '/prayers'}>Читать молитву</Link>
            <Link className="secondary-link" href="/icons">Все иконы</Link>
          </div>
        </div>
      </section>
      {content ? (
        <article className="sacred-panel">
          <span>Материал</span>
          <div className="reader-text"><Paragraphs text={content} /></div>
        </article>
      ) : null}
    </main>
  );
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const icon = await publicApi.icon(slug);
  if (icon) return pageMetadata({ title: icon.seoTitle || icon.title, description: icon.seoDescription || icon.shortDescription, path: `/icons/${slug}`, image: icon.imageUrl, keywords: icon.seoKeywords });

  const content = await publicApi.content();
  const page = content.pages.find((item) => item.slug === slug);
  const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
  return pageMetadata({ title: page?.seoTitle || page?.title || day?.label, description: page?.seoDescription || day?.description, path: `/icons/${slug}`, image: page?.imageUrl || day?.imageUrl, keywords: page?.seoKeywords });
}

export default async function IconPage({ params }: Props) {
  const { slug } = await params;
  const content = await publicApi.content();
  const icon = content.icons.find((item) => item.slug === slug) || null;
  const allIcons = content.icons;
  if (!icon) {
    const page = content.pages.find((item) => item.slug === slug);
    const day = content.calendar?.days.find((item) => item.detailHref?.endsWith(`/${slug}`) || item.iconSlug === slug);
    if (page || day) return <CalendarFallbackPage day={day} page={page} />;
    return <main className="page"><h1>Страница не найдена</h1></main>;
  }
  const related = allIcons.filter((item) => item.slug !== icon.slug).slice(0, 3);
  const galleryImages = uniqueImages([icon.imageUrl, ...(icon.imageUrls ?? [])]);
  const qrImage = galleryImages.find((image, index) => index > 0 && isQrImage(image)) || galleryImages[2];
  const publicGalleryImages = [
    { image: galleryImages[0], label: 'Оригинал иконы', isQr: false },
    qrImage ? { image: qrImage, label: 'QR-код', isQr: true } : null
  ].filter((item): item is { image: string; label: string; isQr: boolean } => Boolean(item?.image));

  return (
    <main className="detail-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd('IconPage', { headline: icon.title, description: icon.shortDescription, image: icon.imageUrl })) }} />
      <section className="sacred-detail-hero">
        <figure className="sacred-image-frame">
          <img src={icon.imageUrl} alt={icon.title} />
        </figure>
        <div className="sacred-hero-copy">
          <p className="eyebrow">{icon.category}</p>
          <h1>{icon.title}</h1>
          <p className="detail-lead">{icon.shortDescription || icon.fullDescription}</p>
          <div className="sacred-meta">
            {icon.saintName ? <span>{icon.saintName}</span> : null}
            {icon.status === 'published' ? <span>Опубликовано</span> : <span>Черновик</span>}
          </div>
          <div className="soft-note">{icon.fullDescription}</div>
          <div className="detail-actions">
            <Link className="primary-link" href="#prayer">Читать молитву</Link>
            <Link className="secondary-link" href="/churches">Для храмов</Link>
          </div>
        </div>
      </section>
      {publicGalleryImages.length > 1 ? (
        <section className="icon-photo-catalog">
          <div className="section-head">
            <p className="eyebrow">Фото и QR</p>
            <h2>Каталог изображений</h2>
          </div>
          <div className="icon-photo-grid">
            {publicGalleryImages.map((item, index) => (
              <figure className={item.isQr ? 'is-qr' : ''} key={`${item.image}-${index}`}>
                <img src={item.image} alt={`${item.label}: ${icon.title}`} />
                <figcaption>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.label}</strong>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
      <section className="sacred-content-grid">
        <article id="prayer" className="sacred-panel prayer-panel">
          <span>01</span>
          <h2>Молитва</h2>
          <div className="reader-text"><Paragraphs text={icon.prayerText} /></div>
          {icon.audioUrl ? <audio controls src={icon.audioUrl} /> : null}
        </article>
        <article className="sacred-panel">
          <span>02</span>
          <h2>Евангелие</h2>
          <div className="reader-text"><Paragraphs text={icon.gospelText} /></div>
        </article>
        <article className="sacred-panel">
          <span>03</span>
          <h2>Житие</h2>
          <div className="reader-text"><Paragraphs text={icon.lifeText} /></div>
        </article>
        <article className="sacred-panel">
          <span>04</span>
          <h2>История образа</h2>
          <div className="reader-text"><Paragraphs text={icon.historyText} /></div>
        </article>
      </section>
      {related.length ? (
        <section className="related-section">
          <div className="section-head"><p className="eyebrow">Похожие иконы</p><h2>Для дальнейшего чтения</h2></div>
          <div className="mini-grid">{related.map((item) => <Link key={item.id} href={`/icons/${item.slug}`}>{item.title}<small>{item.category}</small></Link>)}</div>
        </section>
      ) : null}
    </main>
  );
}
