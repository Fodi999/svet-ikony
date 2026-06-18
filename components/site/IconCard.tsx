import Link from 'next/link';
import type { Icon } from '@/lib/types';

export function IconCard({ icon }: { icon: Icon }) {
  return (
    <Link className="icon-card" href={`/icons/${icon.slug}`}>
      <img src={icon.imageUrl} alt={icon.title} />
      <span>{icon.category}</span>
      <h3>{icon.title}</h3>
      <p>{icon.shortDescription}</p>
    </Link>
  );
}
