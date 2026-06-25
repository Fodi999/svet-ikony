import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { LanguageProvider } from '@/components/site/LanguageProvider';

export const metadata: Metadata = {
  title: 'ikona.link | Молитва біля ікони',
  description: 'Православні QR-сторінки ікон з молитвами, житіями та духовними матеріалами.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <LanguageProvider>
          <Header />
          {children}
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
