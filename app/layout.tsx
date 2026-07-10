import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { LanguageProvider } from '@/components/site/LanguageProvider';
import { PWAInstallPrompt } from '@/components/site/PWAInstallPrompt';
import { siteUrl } from '@/lib/site';

const logoUrl = '/ChatGPT-Image-10-%D0%B8%D1%8E%D0%BB.-2026-%D0%B3._-11_04_35.svg?v=3';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Молитва біля ікони',
  title: 'ikona.link | Молитва біля ікони',
  description: 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: logoUrl, type: 'image/svg+xml' },
      { url: '/pwa/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/app-icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    shortcut: logoUrl,
    apple: [
      { url: '/pwa/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      { url: '/pwa/app-icon-512.png', sizes: '512x512', type: 'image/png' }
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/pwa/apple-touch-icon.png" />
        <link
          rel="apple-touch-startup-image"
          href="/pwa/apple-splash-1290-2796.png"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
      </head>
      <body>
        <LanguageProvider>
          <Header />
          {children}
          <Footer />
          <PWAInstallPrompt />
        </LanguageProvider>
      </body>
    </html>
  );
}
