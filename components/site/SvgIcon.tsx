import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Copy,
  Download,
  Minus,
  Plus,
  ZoomIn
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type SvgIconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'chevron-down'
  | 'plus'
  | 'minus'
  | 'download'
  | 'copy'
  | 'zoom';

export function SvgIcon({ name, className = '', size = 18 }: { name: SvgIconName; className?: string; size?: number }) {
  const icons = {
    'arrow-left': ArrowLeft,
    'arrow-right': ArrowRight,
    'chevron-down': ChevronDown,
    plus: Plus,
    minus: Minus,
    download: Download,
    copy: Copy,
    zoom: ZoomIn
  } satisfies Record<SvgIconName, LucideIcon>;
  const Icon = icons[name];

  return (
    <Icon
      className={`svg-icon svg-icon-${name}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      strokeWidth={2}
    />
  );
}
