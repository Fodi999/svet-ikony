type StableImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
};

export function StableImage({ src, alt, className, width = 800, height = 1000, loading = 'lazy' }: StableImageProps) {
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
    />
  );
}
