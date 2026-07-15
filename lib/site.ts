export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://svetikony.com').replace(/\/+$/, '');

export function absoluteSiteUrl(path: string) {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
