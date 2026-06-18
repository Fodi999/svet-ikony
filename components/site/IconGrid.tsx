import type { Icon } from '@/lib/types';
import { IconCard } from './IconCard';

export function IconGrid({ icons }: { icons: Icon[] }) {
  return <div className="icon-grid">{icons.map((icon) => <IconCard key={icon.id} icon={icon} />)}</div>;
}
