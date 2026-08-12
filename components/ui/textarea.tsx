import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const textareaClass =
  "w-full min-h-[140px] resize-y border border-gold/28 rounded-sm px-4 py-3.5 bg-[linear-gradient(135deg,rgba(205,164,90,.06),transparent_46%),#141511] text-foreground max-[900px]:min-h-12 max-[900px]:px-3.5 max-[900px]:py-3 max-[900px]:text-base";

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(textareaClass, className)} {...rest} />;
}
