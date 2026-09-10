const brandLogoSrc = '/brand-logo-mark.svg?v=20260911';

const brandLogoImageClass = "block object-contain";

export function BrandLogo({ className = '', size = 58 }: { className?: string; size?: number }) {
  return (
    <img
      className={`${brandLogoImageClass}${className ? ` ${className}` : ''}`}
      src={brandLogoSrc}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
