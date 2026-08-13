import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Ported from svetikony-admin's components/ui/button.tsx (shadcn pattern
 * on @base-ui/react). Colors point at app/globals.css's --color-* tokens,
 * not admin's neutral palette, so this renders in the site's own gold/
 * dark theme. "default"/"ghost" variants + "default"/"icon" sizes serve
 * Calendar/Popover; "light"/"dark" variant + "asset" size serve the site's
 * primary CTA pill (formerly a separate AssetButton.tsx implementation).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        ghost: "hover:bg-muted hover:text-foreground",
        // "light"/"dark" — the site's primary CTA pill (ex-AssetButton.tsx).
        // "light" is the filled-gold default; "dark" is the ghost-gold
        // variant that hovers into the same filled look.
        light:
          "border border-gold bg-[linear-gradient(180deg,#e9cb84,#cda45a)] text-canvas hover:border-gold-light hover:bg-gold-light hover:text-canvas focus-visible:border-gold-light focus-visible:bg-gold-light focus-visible:text-canvas",
        dark:
          "border border-gold/28 bg-gold/8 text-gold-light hover:border-gold hover:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] hover:text-canvas focus-visible:border-gold focus-visible:bg-[linear-gradient(180deg,#e9cb84,#cda45a)] focus-visible:text-canvas",
      },
      size: {
        default: "h-9 px-3",
        icon: "size-9",
        // Matches ex-AssetButton.tsx's own sizing/typography exactly.
        asset:
          "min-h-11 gap-2 rounded-md px-4.5 text-[13px] text-center font-black tracking-[.06em] uppercase leading-[1.15] no-underline cursor-pointer duration-[180ms] ease-brand max-[900px]:w-full max-[430px]:min-h-[42px] max-[430px]:px-3 max-[430px]:text-[12px] max-[430px]:whitespace-normal",
        // Compact variant of "asset" — PWAInstallPrompt's install/dismiss pair.
        sm:
          "min-h-[38px] gap-2 rounded-md px-3 text-[12px] text-center font-black tracking-[.06em] uppercase leading-[1.15] no-underline cursor-pointer duration-[180ms] ease-brand max-[900px]:w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
