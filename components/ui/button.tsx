import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Button primitive.
 *
 * Interaction rules come from ui-ux-pro-max:
 *  - transitions 150-300ms, ease-out entering (tokens --dur-micro/--ease-out)
 *  - visible focus-visible ring, never removed
 *  - press feedback via transform only, so nothing around it reflows
 *  - disabled uses reduced emphasis + real `disabled`, not a look-alike
 *  - 44px minimum hit area
 *
 * Colour rule from the "Trust and Authority" pattern: **accent is for the CTA
 * only**. Using gold for general emphasis destroys the single signal that
 * drives conversion, so `cta` is deliberately the only gold variant.
 */

const VARIANTS = {
  /** The one accent control on a screen. Book a demo / Talk to sales.
      .accent-fill carries the compliant boundary — never `bg-accent` bare. */
  cta: "accent-fill hover:brightness-105 active:brightness-95",
  /** Corporate navy: solid but subordinate to the CTA. */
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 active:opacity-100",
  /** Outlined: tertiary emphasis, still fully legible. */
  outline:
    "border border-border bg-transparent text-foreground hover:bg-muted",
  /**
   * Outlined, for use OVER MEDIA rather than over the page surface.
   *
   * `outline` resolves `text-foreground` to the light theme's ink, which is
   * correct on paper and invisible on footage — measured 1.62:1 for the hero's
   * ghost CTA before this existed. This variant carries its own light ink and
   * a border at 55% white, which composites to 3.46:1 against the scrimmed
   * hero ground and so clears 1.4.11's 3:1 for the control boundary.
   */
  outlineOnMedia:
    "border border-[rgba(252,251,248,.55)] bg-transparent text-[#fcfbf8] " +
    "hover:bg-[rgba(252,251,248,.14)] active:bg-[rgba(252,251,248,.2)]",
  /** Text-only: lowest emphasis. */
  ghost: "bg-transparent text-foreground hover:bg-muted",
} as const;

const SIZES = {
  sm: "h-11 px-4 text-sm",
  md: "h-12 px-6 text-base",
  lg: "h-14 px-8 text-lg",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Renders a spinner and blocks input while an async action runs. */
  loading?: boolean;
  /** Render the single child element instead of a <button> — for link CTAs,
      which must be real anchors so they are navigable and right-clickable. */
  asChild?: boolean;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", loading = false, disabled, asChild = false, children, ...props },
    ref,
  ) {
    const isDisabled = disabled || loading;
    const classes = cn(
      "inline-flex select-none items-center justify-center gap-2 rounded-brand font-medium",
      "min-h-11 cursor-pointer whitespace-nowrap",
      "transition-[transform,opacity,background-color,box-shadow,filter]",
      "duration-[--dur-micro] ease-[--ease-out]",
      "active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none",
      "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
      "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
      VARIANTS[variant],
      SIZES[size],
      className,
    );

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
      });
    }

    return (
      <button
        ref={ref}
        // Semantically disabled, not merely styled that way.
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={classes}
        {...props}
      >
        {loading && (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
        )}
        {children}
      </button>
    );
  },
);
