import { headers } from 'next/headers';
import { defaultLocale, isLocale, type Locale } from './i18n';

export async function getRequestLocale(): Promise<Locale> {
  const headerStore = await headers();
  const locale = headerStore.get('x-site-locale') ?? undefined;
  return isLocale(locale) ? locale : defaultLocale;
}
