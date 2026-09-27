'use client';
import {Layers, MapPin, X} from 'lucide-react';
import {siteShellCopy} from '@/components/site/site-shell-copy';
import type {SacredPlot} from '@/lib/cesium/sacred-plots';
import {calendarCopy, sacredPlotCopy} from './calendar-copy';
import styles from './sacred-plot-panel.module.css';

type Props = {
  plot: SacredPlot;
  /** Title of the plot's own territory place (e.g. "Києво-Печерська лавра"). */
  placeTitle: string;
  /** Title of plot.associatedSacredPlaceId (nearest sacred place to the hex
   * center -- may be the same as placeTitle, e.g. a hex near the cathedral
   * resolves to "Успенський собор" instead). */
  associatedTitle: string;
  locale: 'uk' | 'ru' | 'en';
  onClose: () => void;
  onNavigate?: () => void;
};

const formatArea = (m2: number) => new Intl.NumberFormat('uk-UA', {maximumFractionDigits: 1}).format(m2);

/** Plot details are informational; collection navigation never implies land ownership. */
export function SacredPlotPanel({plot, placeTitle, associatedTitle, locale, onClose, onNavigate}: Props) {
  const text = {...calendarCopy[locale], ...sacredPlotCopy[locale], title: {ru:'Участок',uk:'Ділянка',en:'Plot'}[locale]};
  const shell=siteShellCopy[locale];
  return (
    <aside className={styles.panel} aria-label={`${text.title} #${plot.displayNumber}`} data-testid="sacred-plot-panel" data-sacred-plot-panel>
      <header className={styles.header}>
        <span className={styles.headerTitle}>
          <MapPin size={16} />
          <span className={styles.headerTitleText}>
            <b>{text.title} #{plot.displayNumber}</b>
            <small>{placeTitle}</small>
          </span>
        </span>
        <button type="button" className={styles.close} aria-label={text.close} title={text.close} onClick={onClose}><X size={20} /></button>
      </header>
      <div className={styles.body}>
        <p className={styles.relatedTo}><b>{text.relatedTo}:</b> {associatedTitle}</p>
        <dl className={styles.stats}>
          <div><dt>{text.area}</dt><dd>≈ {formatArea(plot.areaM2)} м²</dd></div>
        </dl>
        <p>{shell.noIcon}</p>
        {onNavigate?<button type="button" className={styles.secondaryButton} onClick={onNavigate}><Layers size={16}/>{shell.seeCollection}</button>:null}
        <p className={styles.disclaimer}>{shell.disclaimer}</p>
      </div>
    </aside>
  );
}
