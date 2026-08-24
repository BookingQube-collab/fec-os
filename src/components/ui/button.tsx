import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 overflow-visible whitespace-nowrap rounded-full text-sm font-semibold leading-5 cursor-pointer transition-[color,background-color,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-elevated-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-elevated-xs hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground shadow-elevated-xs hover:bg-secondary hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-elevated-xs hover:bg-secondary/85",
        ghost: "font-medium text-foreground/80 hover:bg-secondary hover:text-foreground",
        link: "font-medium text-foreground underline-offset-4 hover:underline",
      },
      size: {
        // min-h (not fixed h) so py + Poppins descenders cannot clip; className h-8 cannot shrink below this
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-9 px-3.5 py-2 text-xs leading-5",
        lg: "min-h-11 px-6 py-2.5",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
