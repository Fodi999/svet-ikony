import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;
const defaultLocale = 'uk';
const locales = ['uk', 'ru', 'en'];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/images') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    PUBLIC_FILE.test(pathname)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const [, maybeLocale] = pathname.split('/');

  if (!locales.includes(maybeLocale)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? `/${defaultLocale}` : `/${defaultLocale}${pathname}`;
    return NextResponse.redirect(url);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname.replace(`/${maybeLocale}`, '') || '/';
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-site-locale', maybeLocale);

  return NextResponse.rewrite(url, {
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ['/((?!_next|api).*)']
};
