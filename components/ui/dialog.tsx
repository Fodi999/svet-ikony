'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from '@/lib/utils';

/**
 * Ported from svetikony-admin's components/ui/dialog.tsx (shadcn pattern on
 * @base-ui/react), trimmed down: this site's 3 dialogs (ProductOrderModal's
 * form card, IconPhotoCatalog's and ChurchGallery's full-bleed image
 * lightboxes) look nothing alike, so — unlike admin's DialogContent, which
 * bakes in one fixed visual style — DialogOverlay/DialogPopup here carry
 * only positioning/z-index defaults and no color/size opinion; every caller
 * supplies its own via className (same pattern as PageChrome.tsx). Gains
 * over the hand-rolled `fixed inset-0` overlays this replaces: a real focus
 * trap, ESC-to-close, and backdrop-click-to-close for free from base-ui —
 * only ProductOrderModal had hand-rolled ESC handling before, the 2
 * lightboxes had neither.
 */

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={cn('fixed inset-0 z-[1100]', className)} {...props} />;
}

function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      className={cn('fixed top-1/2 left-1/2 z-[1100] -translate-x-1/2 -translate-y-1/2 outline-none', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={className} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={className} {...props} />;
}

export { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPopup, DialogPortal, DialogTitle, DialogTrigger };
