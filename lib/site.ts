export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://svet-ikony.fodi85999.workers.dev').replace(/\/+$/, '');

export function absoluteSiteUrl(path: string) {
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
