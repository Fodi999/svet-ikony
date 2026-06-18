import Link from 'next/link';
import { PhoneMockup } from './PhoneMockup';
import { QRIconDemo } from './QRIconDemo';

export function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Православные QR-иконы</p>
        <h1>Молитва у иконы</h1>
        <p>Физическая икона в киоте открывает страницу с молитвой, Евангелием дня, житием святого и историей образа.</p>
        <div className="hero-actions">
          <Link href="/icons">Смотреть иконы</Link>
          <Link href="/churches">Для храмов</Link>
        </div>
      </div>
      <div className="hero-visual">
        <QRIconDemo />
        <PhoneMockup />
      </div>
    </section>
  );
}
