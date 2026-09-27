import * as React from "react";

import { cn } from "@/lib/utils";

const CHROMELESS = new Set(["checkbox", "radio", "range", "color", "hidden", "file"]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2.5 text-base leading-5 shadow-elevated-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          !CHROMELESS.has(type ?? "text") && "fec-star-border",
          (type === "date" || type === "time" || type === "datetime-local" || type === "month") &&
            "px-3.5 scheme-light",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
