type SvgIconName =
  | 'orthodox-cross'
  | 'arrow-left'
  | 'arrow-right'
  | 'chevron-down'
  | 'plus'
  | 'minus'
  | 'download'
  | 'copy'
  | 'zoom';

export function SvgIcon({ name, className = '', size = 18 }: { name: SvgIconName; className?: string; size?: number }) {
  return (
    <img
      className={`svg-icon svg-icon-${name}${className ? ` ${className}` : ''}`}
      src={`/icons/${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
