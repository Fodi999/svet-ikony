const brandLogoSrc = '/Image-12-июл.-2026-г._-12_33_55.svg';

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
