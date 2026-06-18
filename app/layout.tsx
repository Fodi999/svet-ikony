import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';

export const metadata: Metadata = {
  title: 'ikona.link | Молитва у иконы',
  description: 'Православные QR-страницы икон с молитвами, житиями и духовными материалами.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
