import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/cn.js';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border text-foreground',
        destructive: 'border-transparent bg-secondary text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

/**
 * A short label: a status, a mention. Not a control — it takes no role and no focus — and it
 * carries no text of its own: the words are the slice's, from its catalog (ADR 0011).
 */
function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge };
