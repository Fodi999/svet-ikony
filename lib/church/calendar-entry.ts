// Presentation categories only; these rules never establish an identity or a date.
export function entryCategory(type: string | null, title: string) {
  if (type) return ['saint', 'feast', 'icon'].includes(type) ? type : 'event';
  if (/\bicon\b/i.test(title)) return 'icon';
  if (/\b(feast|pascha|pentecost|nativity|theophany|annunciation|transfiguration|palm sunday|ascension|dormition|circumcision)\b/i.test(title)) return 'feast';
  if (/\b(saint|holy|martyr|martyrs|venerable|righteous|prophet|apostle|apostles|hieromartyr|virginmartyr|confessor|blessed|passion-bearer)\b/i.test(title)) return 'saint';
  return 'event';
}
export type CalendarEntry = {id:string;entityId:string|null;title:string;summary:string;entityType:string;hasGeo:boolean};
