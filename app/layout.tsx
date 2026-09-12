import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { LanguageProvider } from '@/components/site/LanguageProvider';
import { PWAInstallPrompt } from '@/components/site/PWAInstallPrompt';
import { getRequestLocale } from '@/lib/serverLocale';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Молитва біля ікони',
  title: 'svetikony.com | Молитва біля ікони',
  description: 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico?v=20260911', sizes: '16x16 32x32', type: 'image/x-icon' },
      { url: '/favicon-32.png?v=20260911', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.svg?v=20260911', sizes: 'any', type: 'image/svg+xml' }
    ],
    shortcut: '/favicon.ico?v=20260911',
    apple: [
      { url: '/apple-touch-icon.png?v=20260911', sizes: '180x180', type: 'image/png' }
    ]
  },
  appleWebApp: {
    capable: true,
    title: 'Молитва біля ікони',
    statusBarStyle: 'black-translucent'
  },
  formatDetection: {
    telephone: false
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'Молитва біля ікони',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'msapplication-TileColor': '#0B0B0A'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#0B0B0A'
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // PHASE MULTILINGUAL-1 / P0.4: SSR `lang` must match the requested
  // locale for /uk, /ru, /en -- previously hardcoded "uk" for every page
  // and only corrected client-side post-hydration (LanguageProvider),
  // which meant every RU/EN response was served with the wrong `lang`
  // attribute. Reuses the same x-site-locale middleware header every page
  // already reads via getRequestLocale() -- no new mechanism.
  const locale = await getRequestLocale();
  return (
    <html lang={locale} style={{ colorScheme: 'dark' }} className="min-h-full overflow-x-hidden bg-canvas">
      <head>
        <link
          rel="apple-touch-startup-image"
          href="/pwa/apple-splash-1290-2796.png"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
      </head>
      <body className="relative m-0 min-h-dvh overflow-x-hidden bg-canvas text-foreground font-sans antialiased [text-rendering:optimizeLegibility] [@media(display-mode:standalone)]:pb-[env(safe-area-inset-bottom)]">
        <LanguageProvider initialLocale={locale}>
          <Header />
          {children}
          <Footer />
          <PWAInstallPrompt />
        </LanguageProvider>
      </body>
    </html>
  );
}
