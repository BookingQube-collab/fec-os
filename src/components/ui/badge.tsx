import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status mapping (prefer these over ad-hoc colors):
 * - success  → Completed / Operational (green)
 * - warning  → Pending / Due soon (amber)
 * - destructive → Critical / Overdue (red)
 * - info     → In Progress
 * - muted    → Inactive / draft (grey)
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-elevated-xs",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-rag-red rag-red",
        outline: "border-border/80 bg-card text-foreground",
        success: "border-transparent bg-rag-green rag-green",
        warning: "border-transparent bg-rag-amber rag-amber",
        info: "border-transparent bg-rag-info rag-info",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
