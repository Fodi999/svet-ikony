import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

// Replaces content.css's bare `input,select,textarea` rule (structural
// risk #2 from the Tailwind migration plan) — deliberately scoped to this
// component's own callers only, so type="checkbox"/"radio" inputs elsewhere
// no longer pick up width/border/padding meant for text fields.
const inputClass =
  "w-full border border-gold/28 rounded-sm px-4 py-3.5 bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_46%),#141511] text-foreground max-[900px]:min-h-12 max-[900px]:px-3.5 max-[900px]:py-3 max-[900px]:text-base";

export function Input({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(inputClass, className)} {...rest} />;
}
