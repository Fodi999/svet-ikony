'use client';

import { useState } from 'react';
import { StableImage } from './StableImage';

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safeImages = images.length ? images : [''];
  const activeIndex = Math.min(active, safeImages.length - 1);

  return (
    <div className="product-gallery">
      <figure className="product-gallery-main">
        <StableImage src={safeImages[activeIndex]} alt={alt} width={900} height={1100} loading="eager" />
      </figure>
      {safeImages.length > 1 ? (
        <div className="product-gallery-thumbs">
          {safeImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className={index === activeIndex ? 'active' : ''}
              onClick={() => setActive(index)}
              aria-label={`${alt} ${index + 1}`}
            >
              <img src={image} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
