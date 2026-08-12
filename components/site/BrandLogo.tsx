const brandLogoSrc = '/brand-logo-mark.svg';

// Recolors the black/white source SVG to the gold palette via CSS filter.
const brandLogoImageClass =
  "block object-contain [filter:invert(72%)_sepia(47%)_saturate(508%)_hue-rotate(358deg)_brightness(96%)_contrast(89%)]";

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
