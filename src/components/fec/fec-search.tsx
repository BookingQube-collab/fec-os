import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FecSearchProps extends Omit<React.ComponentProps<"input">, "type"> {
  containerClassName?: string;
}

/** Search input with leading icon — shared filter-bar pattern. */
export const FecSearch = React.forwardRef<HTMLInputElement, FecSearchProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn("relative min-w-0 flex-1", containerClassName)}>
      <Search
        className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={ref}
        type="search"
        className={cn("ps-10", className)}
        {...props}
      />
    </div>
  ),
);
FecSearch.displayName = "FecSearch";
