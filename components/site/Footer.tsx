import Link from 'next/link';

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>☦</strong>
        <small>Молитва у иконы</small>
        <p>Православные QR-страницы для молитвенного чтения, истории икон и духовных материалов.</p>
      </div>
      <div>
        <Link href="/icons">Иконы</Link>
        <Link href="/p/pravoslavnaya-ikona-s-qr-kodom">SEO-страница</Link>
        <Link href="/qr/home-001">Пример QR</Link>
      </div>
    </footer>
  );
}
