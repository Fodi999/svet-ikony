import Link from 'next/link';

const nav = [
  ['Иконы', '/icons'],
  ['Молитвы', '/prayers'],
  ['Святые', '/saints'],
  ['Евангелие', '/gospel'],
  ['Храмам', '/churches']
];

export function Header() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span>☦</span>
        <small>Молитва у иконы</small>
      </Link>
      <nav>
        {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <Link className="header-action" href="/churches">Для храмов</Link>
    </header>
  );
}
