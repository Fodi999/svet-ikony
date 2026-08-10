'use client';

import { useState } from 'react';
import { StableImage } from './StableImage';

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const safeImages = images.length ? images : [''];
  const activeIndex = Math.min(active, safeImages.length - 1);

  return (
    <div className="grid gap-3.5">
      <figure className="relative m-0 grid aspect-[4/5] place-items-center overflow-hidden rounded-md border border-gold/28 bg-[linear-gradient(110deg,transparent_0_28%,rgba(232,203,132,.13)_42%,transparent_56%),linear-gradient(160deg,rgba(127,141,101,.09),transparent_62%),#1b1c16] p-[clamp(18px,2.6vw,40px)]">
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
