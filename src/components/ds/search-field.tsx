import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const SearchField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SearchField({ className, ...props }, ref) {
    return (
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 stroke-[1.5] text-muted-foreground"
          aria-hidden
        />
        <input
          ref={ref}
          className={cn(
            "h-11 w-full rounded-full border border-input bg-card ps-10 pe-4 text-sm text-foreground shadow-elevated-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
