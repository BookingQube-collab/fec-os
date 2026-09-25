import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FecIconButtonProps = Omit<ButtonProps, "size"> & {
  "aria-label": string;
};

/** Icon-only Button (size=icon). Requires aria-label. */
export const FecIconButton = React.forwardRef<HTMLButtonElement, FecIconButtonProps>(
  ({ className, variant = "outline", ...props }, ref) => (
    <Button
      ref={ref}
      size="icon"
      variant={variant}
      className={cn(className)}
      {...props}
    />
  ),
);
FecIconButton.displayName = "FecIconButton";
