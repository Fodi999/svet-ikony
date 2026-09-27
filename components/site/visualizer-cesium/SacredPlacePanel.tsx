'use client';
import {useEffect, useState} from 'react';
import {ChevronDown, ExternalLink, MapPin, Grid2X2, Layers, X} from 'lucide-react';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import type {PlaceCollectionItem, PlaceProfile, SacredPlaceMarker} from '@/lib/d1/repositories/calendarGeoPlaces';
import {placeTabs, type PlaceTab} from '@/lib/cesium/unified';
import {countryMetadata} from '@/lib/visualizer/countries';
import {calendarCopy, placeTypeCopy, sacredPlaceCopy} from './calendar-copy';
import {PlaceCollectionCarousel} from './PlaceCollectionCarousel';
import {markerFallback} from '@/lib/cesium/photo-marker';
import styles from './sacred-place-panel.module.css';

type Props = {
  imageUrl?: string;
  place: SacredPlaceMarker;
  tab: PlaceTab;
  locale: 'uk' | 'ru' | 'en';
  onTabChange: (tab: PlaceTab) => void;
  onClose: () => void;
  /** Place-to-place hierarchy navigation (calendar_geo_place_relations):
   * called with another place's id when the user clicks a parent ("part of
   * the Lavra") or child ("objects in the complex") link. The caller is
   * responsible for switching the globe/panel to that place -- this
   * component only reads profile.parentPlaces/childPlaces and never fetches
   * or renders their own full profile/collection. */
  onNavigate: (placeId: string) => void;
  onShowPlots?: () => void;
};

const formatCoordinate = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;

/**
 * Desktop: right panel. Mobile: bottom sheet (see sacred-place-panel.module.css's
 * @media(max-width:767px)) -- same breakpoint/positioning convention already
 * used by the existing .detail/.drawer panels in calendar-globe.module.css.
 *
 * Keyed entirely by `place` (a calendar_geo_places.id-based marker), never
 * by the calendar entity id used elsewhere in CalendarGlobeOverlay.
 */
export function SacredPlacePanel({place, tab, locale, onTabChange, onClose, onNavigate, onShowPlots,imageUrl}: Props) {
  const text = {...calendarCopy[locale], ...sacredPlaceCopy[locale]};
  const shell=siteShellCopy[locale];
  const [profile, setProfile] = useState<PlaceProfile | null>(null);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [collection, setCollection] = useState<PlaceCollectionItem[] | null>(null);
  const [collectionStatus, setCollectionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // Mobile-only bottom-sheet state (ТЗ п.17): collapsed shows just the
  // header + a small preview; expanded shows tabs/body. Ignored on desktop
  // -- sacred-place-panel.module.css only reads data-expanded inside its
  // @media(max-width:767px) block, so this never hides anything above
  // that breakpoint. Starts collapsed: selecting a place should feel like
  // a lightweight preview first, not an immediate full-screen takeover.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/calendar/place/${encodeURIComponent(place.id)}/profile?locale=${locale}`, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error('profile');
        return response.json() as Promise<PlaceProfile>;
      })
      .then((data) => {
        if (!controller.signal.aborted) { setProfile(data); setProfileStatus('ready'); }
      })
      .catch(() => { if (!controller.signal.aborted) setProfileStatus('error'); });
    return () => controller.abort();
  }, [place.id, locale]);

  useEffect(() => {
    if (tab !== 'collection' || !place.hasCollection) return;
    const controller = new AbortController();
    void fetch(`/api/calendar/place/${encodeURIComponent(place.id)}/collection?locale=${locale}`, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) throw new Error('collection');
        return response.json() as Promise<{items: PlaceCollectionItem[]}>;
      })
      .then((data) => {
        if (!controller.signal.aborted) { setCollection(data.items); setCollectionStatus('ready'); }
      })
      .catch(() => { if (!controller.signal.aborted) setCollectionStatus('error'); });
    return () => controller.abort();
  }, [tab, place.id, place.hasCollection, locale]);

  const noProfile = profileStatus === 'ready' && profile !== null && !profile.hasProfile;
  const openingHoursEntries = profile?.openingHours ? Object.entries(profile.openingHours) : [];
  const countryName = place.countryCode ? countryMetadata[place.countryCode]?.name[locale] : null;
  const subtitle = [place.region, countryName].filter(Boolean).join(', ');
  const typeLabel = placeTypeCopy[locale][place.type as keyof typeof placeTypeCopy['uk']] ?? null;
  const previewPhoto = collection?.[0]?.photoUrl || null;

  return (
    <aside className={styles.panel} aria-label={place.title} data-testid="sacred-place-panel" data-sacred-place-panel data-expanded={expanded}>
      <button type="button" className={styles.handle} aria-expanded={expanded} aria-label={expanded ? text.collapse : text.expand} onClick={() => setExpanded((value) => !value)}>
        <span className={styles.handleBar} />
      </button>
      <header className={styles.header}>
        <span className={styles.headerTitle}>
          <MapPin size={16} />
          <span className={styles.headerTitleText}>
            <b>{place.title}</b>
            {subtitle ? <small>{subtitle}</small> : null}
          </span>
        </span>
        <span className={styles.headerActions}>
          <button type="button" className={styles.close} aria-label={text.close} title={text.close} onClick={onClose}><X size={20} /></button>
        </span>
      </header>
      <img src={imageUrl??markerFallback(place.type)} alt={place.title} style={{width:'100%',height:240,objectFit:'contain'}} onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=markerFallback(place.type);}}/>
      {!expanded ? (
        <button type="button" className={styles.mobilePreview} onClick={() => setExpanded(true)} aria-label={text.expand}>
          {previewPhoto ? <img src={previewPhoto} alt="" className={styles.mobilePreviewPhoto} /> : <span className={styles.mobilePreviewPhoto} aria-hidden="true" />}
          <span className={styles.mobilePreviewMeta}>
            {typeLabel ? <span className={styles.mobilePreviewType}>{typeLabel}</span> : null}
            <span className={styles.mobilePreviewHint}><ChevronDown size={16} />{text.expand}</span>
          </span>
        </button>
      ) : null}
      {profile?.parentPlaces.length ? (
        <div className={styles.hierarchy} data-testid="sacred-place-parents">
          <span className={styles.hierarchyLabel}>{text.partOf}:</span>
          {profile.parentPlaces.map((parent) => (
            <button key={parent.id} type="button" className={styles.hierarchyLink} onClick={() => onNavigate(parent.id)}>{parent.title}</button>
          ))}
        </div>
      ) : null}
      {profile?.childPlaces.length ? (
        <div className={styles.hierarchy} data-testid="sacred-place-children">
          <span className={styles.hierarchyLabel}>{text.complexObjects}:</span>
          <div className={styles.hierarchyList}>
            {profile.childPlaces.map((child) => (
              <button key={child.id} type="button" className={styles.hierarchyLink} onClick={() => onNavigate(child.id)}>{child.title}</button>
            ))}
          </div>
        </div>
      ) : null}
      <nav className={styles.tabs} aria-label={place.title}>
        {placeTabs.filter(id=>id!=='directions').map((id) => (
          <button key={id} type="button" data-tab={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onTabChange(id)}>{text[id]}</button>
        ))}
      </nav>
      <div className={styles.body}>
        {profileStatus === 'loading' && tab !== 'collection' ? <p role="status">{text.loading}</p> : null}
        {profileStatus === 'error' && tab !== 'collection' ? <p role="alert">{text.error}</p> : null}

        {tab === 'about' && profileStatus === 'ready' ? (
          noProfile ? <p className={styles.empty}>{text.noProfile}</p> : (
            <div className={styles.about}>
              {profile?.address ? <p><b>{text.address}:</b> {profile.address}</p> : null}
              {openingHoursEntries.length ? (
                <div><b>{text.hours}</b><ul>{openingHoursEntries.map(([day, hours]) => <li key={day}>{day}: {hours}</li>)}</ul></div>
              ) : null}
              <div className={styles.links}>
                {profile?.websiteUrl ? <a href={profile.websiteUrl} target="_blank" rel="noreferrer">{text.website}<ExternalLink size={14} /></a> : null}
                {profile?.mapUrl ? <a href={profile.mapUrl} target="_blank" rel="noreferrer">{text.map}<ExternalLink size={14} /></a> : null}
              </div>
              {!profile?.address && !openingHoursEntries.length && !profile?.websiteUrl && !profile?.mapUrl ? <p className={styles.empty}>{text.noProfile}</p> : null}
            </div>
          )
        ) : null}

        {tab === 'collection' ? (
          <div className={styles.collectionTab}>
            <div className={styles.collectionHeading}>
              <h3>{text.collectionHeading}</h3>
              <p>{text.collectionSubheading}</p>
            </div>
            {!place.hasCollection ? <p className={styles.empty}>{text.emptyCollection}</p> :
              collectionStatus === 'loading' || collectionStatus === 'idle' ? <p role="status">{text.loading}</p> :
              collectionStatus === 'error' ? <p role="alert">{text.error}</p> :
              <PlaceCollectionCarousel items={collection ?? []} locale={locale} place={place} />}
          </div>
        ) : null}

        {tab === 'history' && profileStatus === 'ready' ? (
          <div className={styles.about}>
            <p>{profile?.history || text.noProfile}</p>
          </div>
        ) : null}

        {tab === 'directions' && profileStatus === 'ready' ? (
          <div className={styles.about}>
            {profile?.address ? <p><b>{text.address}:</b> {profile.address}</p> : null}
            {profile?.directions ? <p>{profile.directions}</p> : null}
            <p><b>{text.coordinates}:</b> {formatCoordinate(place.lat, place.lon)}</p>
            {openingHoursEntries.length ? (
              <div><b>{text.hours}</b><ul>{openingHoursEntries.map(([day, hours]) => <li key={day}>{day}: {hours}</li>)}</ul></div>
            ) : null}
            <div className={styles.links}>
              {profile?.websiteUrl ? <a href={profile.websiteUrl} target="_blank" rel="noreferrer">{text.website}<ExternalLink size={14} /></a> : null}
              {profile?.mapUrl ? <a href={profile.mapUrl} target="_blank" rel="noreferrer">{text.map}<ExternalLink size={14} /></a> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className={styles.placeActions}>
        {onShowPlots?<button onClick={()=>{onShowPlots();setExpanded(false);}}><Grid2X2 size={17}/>{shell.showPlots}</button>:null}
        <button onClick={()=>{onTabChange('collection');setExpanded(true);}}><Layers size={17}/>{shell.seeCollection}</button>
      </div>
    </aside>
  );
}
