'use client';

import { useState } from 'react';
import { StableImage } from './StableImage';
import styles from './collection.module.css';

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safeImages = images.length ? images : [''];
  const activeIndex = Math.min(active, safeImages.length - 1);

  return (
    <div className={styles.gallery}>
      <figure>
        <StableImage
          src={safeImages[activeIndex]}
          alt={alt}
          width={900}
          height={1100}
          loading="eager"
          className="relative z-[1] block h-full w-full max-w-full rounded-xs object-contain shadow-sm"
        />
      </figure>
      {safeImages.length > 1 ? (
        <div className="flex flex-wrap gap-2.5">
          {safeImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              className={`size-[72px] cursor-pointer overflow-hidden rounded-sm border-2 bg-[#1b1c16] p-0 transition-colors duration-200 ease-brand hover:border-gold-light max-[560px]:size-[60px] ${
                index === activeIndex ? 'border-gold shadow-[0_0_0_2px_rgba(214,168,79,.22)]' : 'border-gold/28'
              }`}
              onClick={() => setActive(index)}
              aria-label={`${alt} ${index + 1}`}
            >
              <img src={image} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
