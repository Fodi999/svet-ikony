import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared page-template building blocks — the Tailwind equivalent of
 * foundation.css's .page/.page-hero/.eyebrow/.sacred-panel/.mini-grid/etc.
 * Built as components rather than repeated class strings because the
 * same visual language is used identically across 9+ route files
 * (phase 8 of the Tailwind migration) — see the plan file for the full
 * list of consumers and what's still deferred (LocalizedContent.tsx's
 * own usage, and prayer-mode.css's compound-selector-anchored markers).
 */

const pageClass =
  "w-full m-0 min-h-[calc(100vh-78px)] py-[clamp(42px,5vw,92px)] px-[clamp(18px,5vw,72px)] bg-canvas text-foreground max-[520px]:pt-6 max-[520px]:px-3.5 max-[520px]:pb-10 [@media(display-mode:standalone)]:pr-[max(clamp(10px,5vw,72px),env(safe-area-inset-right))] [@media(display-mode:standalone)]:pb-[max(clamp(28px,5vw,92px),env(safe-area-inset-bottom))] [@media(display-mode:standalone)]:pl-[max(clamp(10px,5vw,72px),env(safe-area-inset-left))]";

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn(pageClass, className)}>{children}</main>;
}

export function Hero({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('grid gap-4 pt-0 px-0 pb-[clamp(30px,4vw,64px)] border-b border-gold/28', className)}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-gold-light text-[12px] font-black tracking-[.16em] uppercase max-[520px]:tracking-[.12em]">{children}</p>;
}

export function HeroTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn(
        'm-0 max-w-[min(100%,1180px)] font-serif font-bold text-[clamp(38px,5.8vw,96px)] leading-[1.02] text-foreground text-balance [overflow-wrap:anywhere] max-[520px]:text-[clamp(32px,10vw,52px)] max-[520px]:leading-[1.06]',
        className
      )}
    >
      {children}
    </h1>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[760px] m-0 text-muted-foreground font-serif text-[clamp(18px,2vw,27px)] leading-[1.45] max-[520px]:text-[17px]">
      {children}
    </p>
  );
}

export function DetailHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid grid-cols-[minmax(280px,.86fr)_minmax(0,1.14fr)] gap-[clamp(28px,5vw,78px)] items-start max-[900px]:grid-cols-1', className)}>
      {children}
    </section>
  );
}

export function HeroCopy({ children }: { children: ReactNode }) {
  return <div className="min-w-0 grid content-start gap-4.5">{children}</div>;
}

const imageFrameClass =
  "relative sticky top-[110px] m-0 grid place-items-center aspect-[4/5] border border-gold/28 rounded-[8px] bg-[linear-gradient(110deg,transparent_0_28%,rgba(241,209,138,.16)_42%,transparent_56%),#1b1c16] bg-[length:220%_100%,100%_100%] overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,.18)] max-[900px]:static max-[520px]:max-h-[68vh]";

export function ImageFrame({ children, className, ...rest }: ComponentPropsWithoutRef<'figure'>) {
  return (
    <figure className={cn(imageFrameClass, className)} {...rest}>
      {children}
    </figure>
  );
}

// For StableImage's own className prop, when it renders inside an ImageFrame.
export const imageFrameImgClass = 'relative z-[1] w-full h-full aspect-[4/5] object-contain object-center';

export function SoftNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "border-l-[3px] border-l-gold py-3.5 pr-0 pl-4.5 text-foreground bg-[linear-gradient(90deg,rgba(214,168,79,.12),transparent)] rounded-l-none rounded-r-xs font-serif text-[clamp(18px,1.55vw,24px)] leading-[1.45] [&>p]:mt-0 [&>p]:mx-0 [&>p]:mb-3 [&>p:last-child]:mb-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Panel({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <article id={id} className={cn('min-w-0 p-[clamp(20px,2.5vw,36px)] max-[900px]:p-4', className)}>
      {children}
    </article>
  );
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return <span className="block mb-4.5 text-gold-light text-[12px] font-black tracking-[.16em] uppercase max-[520px]:tracking-[.12em]">{children}</span>;
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-0 mx-0 mb-4.5 text-foreground font-serif text-[clamp(28px,2.8vw,48px)] font-bold leading-[1.05]">{children}</h2>;
}

export function ReaderText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('max-w-[960px] text-muted-foreground font-serif text-[clamp(18px,1.45vw,24px)] leading-[1.6] [&>p]:mt-0 [&>p]:mx-0 [&>p]:mb-4 [&>p:last-child]:mb-0', className)}>
      {children}
    </div>
  );
}

export function RelatedSection({ children }: { children: ReactNode }) {
  return <section className="mt-[clamp(46px,6vw,88px)] border-t border-gold/28 pt-[clamp(22px,3vw,42px)]">{children}</section>;
}

export function SectionHead({ children }: { children: ReactNode }) {
  return <div className="grid gap-1.5 mb-5">{children}</div>;
}

export function SectionHeadTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 font-serif font-bold text-[clamp(30px,3.6vw,62px)] leading-[1.05]">{children}</h2>;
}

export function MiniGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-[clamp(12px,1.5vw,18px)] max-[900px]:grid-cols-1">{children}</div>;
}

export function MiniGridLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="min-h-[132px] max-[520px]:min-h-[108px] grid content-between gap-4.5 border border-gold/28 rounded-[8px] p-4.5 bg-[linear-gradient(135deg,rgba(214,168,79,.08),transparent_46%),#141511] font-serif text-[clamp(20px,1.8vw,30px)] leading-[1.1] text-foreground no-underline transition-[border-color,background,transform] duration-[180ms] ease-brand hover:border-gold hover:bg-[#1b1c16] hover:-translate-y-0.5"
    >
      {children}
    </Link>
  );
}

export function MiniGridSmall({ children }: { children: ReactNode }) {
  return <small className="text-gold-light text-[12px] font-black tracking-[.1em] uppercase">{children}</small>;
}

export function DetailActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-3 mt-2 max-[900px]:grid max-[900px]:grid-cols-1 max-[900px]:items-stretch max-[900px]:w-full">
      {children}
    </div>
  );
}
