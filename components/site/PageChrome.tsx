import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared page-template building blocks — the Tailwind equivalent of the
 * former foundation.css/content.css/prayer-mode.css page/hero/detail-
 * template system (all three files deleted or reduced to tokens+reset by
 * the end of the Tailwind migration — see the plan file for the full
 * history). Built as components rather than repeated class strings because
 * the same visual language is used identically across every route file,
 * including LocalizedContent.tsx.
 */

// The ≤900px values below (28/16/46, min-h -112px) come from content.css's
// `.page,.read-page,.detail-page` override, which — because content.css
// imports after foundation.css — has always fully shadowed foundation's own
// (dead) ≤520px override; there is no separate ≤520px tier in the real
// cascade, confirmed against the compiled stylesheet's rule order.
const pageClass =
  "w-full m-0 min-h-[calc(100vh-78px)] max-[900px]:min-h-[calc(100vh-112px)] pt-[clamp(42px,5vw,92px)] max-[900px]:pt-7 pr-[clamp(18px,5vw,72px)] max-[900px]:pr-4 pb-[clamp(42px,5vw,92px)] max-[900px]:pb-[46px] pl-[clamp(18px,5vw,72px)] max-[900px]:pl-4 bg-canvas text-foreground [@media(display-mode:standalone)]:pr-[max(clamp(10px,5vw,72px),env(safe-area-inset-right))] [@media(display-mode:standalone)]:pb-[max(clamp(28px,5vw,92px),env(safe-area-inset-bottom))] [@media(display-mode:standalone)]:pl-[max(clamp(10px,5vw,72px),env(safe-area-inset-left))]";

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

export function SectionHead({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-1.5 mb-5', className)}>{children}</div>;
}

export function SectionHeadTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('m-0 font-serif font-bold text-[clamp(30px,3.6vw,62px)] leading-[1.05]', className)}>{children}</h2>;
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

export function SacredMeta({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2.5 [&>span]:min-h-[34px] [&>span]:inline-flex [&>span]:items-center [&>span]:rounded-full [&>span]:border [&>span]:border-gold/28 [&>span]:px-3.5 [&>span]:text-gold-light [&>span]:text-[12px] [&>span]:font-black [&>span]:tracking-[.08em] [&>span]:uppercase">{children}</div>;
}

export function SacredContentGrid({ children }: { children: ReactNode }) {
  return (
    <section className="grid grid-cols-2 gap-[clamp(14px,2vw,24px)] mt-[clamp(46px,6vw,88px)] border-t border-gold/28 pt-[clamp(22px,3vw,42px)] max-[900px]:grid-cols-1">
      {children}
    </section>
  );
}

// The Tailwind equivalent of prayer-mode.css's `.sacred-read-page` extension
// (border grid-lines + radial glow + noise overlay), which — because
// prayer-mode.css imports after content.css — has always won over content's
// ≤900px padding-top for any sacred-read-page-tagged element, at every
// width; only ≤560px overrides it further. See Page's own comment for the
// ≤900px baseline this replaces on the top side. Non-top padding/min-height
// are untouched, so Page's own values apply unmodified.
const readPageClass =
  "grid gap-3 relative isolate pt-[clamp(24px,3.2vw,46px)] max-[900px]:pt-[clamp(24px,3.2vw,46px)] max-[560px]:pt-[22px] bg-[linear-gradient(90deg,rgba(205,164,90,.12)_0_1px,transparent_1px_calc(100%-1px),rgba(205,164,90,.12)_calc(100%-1px)),radial-gradient(ellipse_at_50%_0%,rgba(205,164,90,.11),transparent_46%),linear-gradient(180deg,#0a0a08_0%,#10100d_54%,#090a08_100%)] before:content-[''] before:absolute before:inset-0 before:-z-10 before:opacity-[.55] before:bg-[linear-gradient(90deg,rgba(205,164,90,.05),transparent_10%,transparent_90%,rgba(205,164,90,.05)),repeating-linear-gradient(135deg,rgba(233,203,132,.035)_0_1px,transparent_1px_18px)] before:[mask-image:linear-gradient(90deg,#000_0_4%,transparent_18%_82%,#000_96%_100%)]";

export function ReadPage({ children, className }: { children: ReactNode; className?: string }) {
  return <Page className={cn(readPageClass, className)}>{children}</Page>;
}
