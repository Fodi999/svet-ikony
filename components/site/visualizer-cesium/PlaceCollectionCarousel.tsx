'use client';
import {useState} from 'react';
import {ChevronLeft, ChevronRight, Clock, MapPin, PackageCheck} from 'lucide-react';
import {StableImage} from '@/components/site/StableImage';
import {useLocaleHref} from '@/components/site/LanguageProvider';
import type {PlaceCollectionItem, SacredPlaceMarker} from '@/lib/d1/repositories/calendarGeoPlaces';
import {countryMetadata} from '@/lib/visualizer/countries';
import {sacredPlaceCopy} from './calendar-copy';
import styles from './sacred-place-panel.module.css';

function formatMoney(cents: number, currency: string) {
  return `${Math.round(cents / 100).toLocaleString('uk-UA')} ${currency}`;
}

/**
 * Big two-column card (photo | title+metadata+price+buy) + filmstrip with
 * prev/next + pagination dots, per the reference mockup. All fields come
 * straight from icon_order_options via calendar_geo_place_products/getPlaceCollection
 * -- nothing here is invented; a metadata row is simply omitted when its
 * source field is blank rather than filled with a placeholder value.
 *
 * "Купити" only links to the existing /shop/[slug] -- ProductOrderModal is
 * deliberately NOT wired in here yet, that's a separate follow-up phase.
 */
export function PlaceCollectionCarousel({items, locale, place}: {items: PlaceCollectionItem[]; locale: 'uk' | 'ru' | 'en'; place: SacredPlaceMarker}) {
  const text = sacredPlaceCopy[locale];
  const localeHref = useLocaleHref();
  const [index, setIndex] = useState(0);
  if (!items.length) return <p className={styles.empty}>{text.emptyCollection}</p>;
  const active = items[Math.min(index, items.length - 1)];
  const move = (delta: number) => setIndex((current) => (current + delta + items.length) % items.length);
  const stockLabel = active.stockStatus === 'available' ? text.stockAvailable : active.stockStatus === 'made_to_order' ? text.stockMadeToOrder : text.stockUnavailable;
  const countryName = place.countryCode ? countryMetadata[place.countryCode]?.name[locale] : null;
  const location = [place.region, countryName].filter(Boolean).join(', ');

  return (
    <div className={styles.carousel}>
      <div className={styles.carouselMain}>
        {items.length > 1 ? <button type="button" className={styles.carouselNav} aria-label="Previous" onClick={() => move(-1)}><ChevronLeft size={22} /></button> : null}
        <div className={styles.carouselCard}>
          <a className={styles.carouselFigureLink} href={localeHref(`/shop/${active.slug}`)}>
            <figure className={styles.carouselFigure}>
              {active.photoUrl ? <StableImage src={active.photoUrl} alt={active.title} width={480} height={480} className={styles.carouselImage} /> : null}
              {active.relationType === 'primary' ? <span className={styles.primaryBadge}>{text.primaryBadge}</span> : null}
            </figure>
          </a>
          <div className={styles.carouselBody}>
            <span className={styles.productLabel}>{text.productLabel}</span>
            <h3><a href={localeHref(`/shop/${active.slug}`)}>{active.title}</a></h3>
            {active.caption || active.description ? <p className={styles.carouselTagline}>{active.caption || active.description}</p> : null}
            <ul className={styles.carouselMetaList}>
              {location ? <li><MapPin size={14} />{location}</li> : null}
              {active.productionTime ? <li><Clock size={14} />{active.productionTime}</li> : null}
              <li><PackageCheck size={14} />{stockLabel}</li>
            </ul>
            <div className={styles.carouselDivider} />
            <div className={styles.carouselMeta}>
              <b>{formatMoney(active.priceCents, active.currency)}</b>
            </div>
            <a className={styles.buyButton} href={localeHref(`/shop/${active.slug}`)}>{text.buy}</a>
            {items.length > 1 ? <p className={styles.browseHint}>{text.browseCards} →</p> : null}
          </div>
        </div>
        {items.length > 1 ? <button type="button" className={styles.carouselNav} aria-label="Next" onClick={() => move(1)}><ChevronRight size={22} /></button> : null}
      </div>
      {items.length > 1 ? (
        <>
          <div className={styles.filmstrip} role="listbox" aria-label={text.collection}>
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={itemIndex === index}
                className={styles.filmstripItem}
                data-active={itemIndex === index}
                onClick={() => setIndex(itemIndex)}
              >
                {item.photoUrl ? <StableImage src={item.photoUrl} alt={item.title} width={96} height={96} className={styles.filmstripImage} /> : null}
              </button>
            ))}
          </div>
          <div className={styles.dots} role="tablist" aria-label={text.collection}>
            {items.map((item, itemIndex) => (
              <button key={item.id} type="button" role="tab" aria-selected={itemIndex === index} className={styles.dot} data-active={itemIndex === index} onClick={() => setIndex(itemIndex)} aria-label={item.title} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
