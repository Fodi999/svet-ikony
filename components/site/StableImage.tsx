'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';

type StableImageProps = {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  loading?: 'eager' | 'lazy';
  /** Shown instead of the browser's broken-image box when the file cannot be loaded. */
  fallback?: ReactNode;
};

export function StableImage({ src, alt, className, width = 800, height = 1000, loading = 'lazy', fallback }: StableImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  // A server-rendered image can fail before hydration attaches onError; catch that once mounted.
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailedSrc(src);
  }, [src]);
  if (failedSrc === src) {
    return fallback !== undefined ? <>{fallback}</> : <span className={className} role="img" aria-label={alt} data-image-missing />;
  }
  return (
    <img
      ref={image}
      className={className}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
