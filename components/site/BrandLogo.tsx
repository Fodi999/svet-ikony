const brandLogoSrc = '/brand-logo-mark.svg';

export function BrandLogo({ className = '', size = 58 }: { className?: string; size?: number }) {
  return (
    <img
      className={`brand-logo-image${className ? ` ${className}` : ''}`}
      src={brandLogoSrc}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}
