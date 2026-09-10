'use client';

import { useMemo } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { useI18n } from '@/components/site/LanguageProvider';
import { countryFlag, countryMetadata, getCountryContent, type CountryInfo } from '@/lib/visualizer/countries';
import { countryMessages } from '@/lib/visualizer/country-messages';
import styles from './history.module.css';

type Props = {
  country: CountryInfo | null;
  onSelect: (code: string) => void;
  onClose: () => void;
  showClose?: boolean;
};

export function CountryPanel({ country, onSelect, onClose, showClose = true }: Props) {
  const { locale } = useI18n();
  const copy = countryMessages[locale];
  const content = country ? getCountryContent(country.code) : null;
  const options = useMemo(() => Object.values(countryMetadata)
    .sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale)), [locale]);

  return <div className={styles.countryPanel} data-country-code={country?.code ?? ''}>
    {country ? <>
      <div className={styles.countryFlag}>
        <span aria-hidden="true">{countryFlag(country.iso2)}</span>
        {showClose && <button type="button" aria-label={copy.close} className={styles.iconButton} onClick={onClose}><X size={17} /></button>}
      </div>
      <h2 aria-live="polite">{country.name[locale]}</h2>
      <p className={styles.countryRegion}>{copy.continents[country.continent as keyof typeof copy.continents] ?? country.continent}</p>
      <dl><dt>{copy.capital}</dt><dd>{country.capital?.[locale] ?? '—'}</dd></dl>
      <div className={styles.countryActions}>
        {[copy.history, copy.events, copy.saints].map(label => <button type="button" key={label}
          disabled={!content?.available} aria-label={`${label}: ${country.name[locale]}`} title={copy.empty}>
          {label}{content?.available && <ArrowUpRight size={16} />}
        </button>)}
      </div>
      <p className={styles.countryEmpty}>{copy.empty}</p>
    </> : <p className={styles.countryPrompt}>{copy.choose}</p>}
    <label className={styles.countrySelector}>
      <span>{copy.select}</span>
      <select aria-label={copy.select} value={country?.code ?? ''} onChange={event => event.target.value ? onSelect(event.target.value) : onClose()}>
        <option value="">{copy.select}</option>
        {options.map(item => <option key={item.code} value={item.code}>{item.name[locale]}</option>)}
      </select>
    </label>
  </div>;
}
